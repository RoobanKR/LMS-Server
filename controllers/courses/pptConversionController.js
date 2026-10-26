const path = require('path')
const fs = require('fs-extra')
const axios = require('axios')
const { execFile } = require('child_process')
const { promisify } = require('util')
const os = require('os')
const crypto = require('crypto')
const PptCache = require('../../models/Courses/PptCacheModel')
const { storage, publicUrlFor, storagePathFromUrl, readStoredFile, diskPathFor } = require('../../utils/storage')

const execFileAsync = promisify(execFile)

// Where LibreOffice lives differs per machine — a Windows dev box, a Mac, the
// Linux server — so it is not one hard-coded path (that path failed with
// ENOENT on any machine where LibreOffice sat elsewhere or was missing).
// LIBREOFFICE_PATH in .env wins; then the usual install locations; then plain
// `soffice` on the PATH. Resolved per conversion, not at startup, so
// installing LibreOffice takes effect without restarting the server.
const SOFFICE_CANDIDATES = [
  'C:/Program Files/LibreOffice/program/soffice.exe',
  'C:/Program Files (x86)/LibreOffice/program/soffice.exe',
  '/Applications/LibreOffice.app/Contents/MacOS/soffice',
  '/usr/bin/soffice',
  '/usr/local/bin/soffice',
  '/usr/bin/libreoffice',
  '/opt/libreoffice/program/soffice',
  '/snap/bin/libreoffice',
]

function resolveSoffice() {
  if (process.env.LIBREOFFICE_PATH) return process.env.LIBREOFFICE_PATH
  return SOFFICE_CANDIDATES.find(p => fs.existsSync(p)) || 'soffice'
}

const LIBREOFFICE_MISSING =
  'LibreOffice is not installed on the server, so this presentation cannot be ' +
  'converted for viewing. Install LibreOffice (or set LIBREOFFICE_PATH) and retry.'

// In-flight conversions keyed by cacheKey — prevents duplicate LibreOffice runs
// and duplicate slide writes when the same deck is requested concurrently.
const inFlightConversions = new Map()

// Core pipeline: buffer → LibreOffice PDF → page images → VPS storage → PptCache.
// Returns { slideImages, totalSlides }. Reusable from the route handler and from
// background upload-time conversion (pedagogyView.js).
async function convertDocumentToSlides({ buffer, ext, cacheKey }) {
  if (cacheKey && inFlightConversions.has(cacheKey)) {
    console.log('⏳ Conversion already in flight — joining existing run')
    return inFlightConversions.get(cacheKey)
  }

  const promise = performConversion({ buffer, ext, cacheKey })

  if (cacheKey) {
    inFlightConversions.set(cacheKey, promise)
    promise.catch(() => {}).finally(() => inFlightConversions.delete(cacheKey))
  }

  return promise
}

async function performConversion({ buffer, ext, cacheKey }) {
  const tempDir = path.join(os.tmpdir(), `ppt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`)

  try {
    await fs.ensureDir(tempDir)

    const inputPath = path.join(tempDir, `presentation.${ext}`)
    await fs.writeFile(inputPath, buffer)

    // 2. Document → PDF via LibreOffice (works for pptx, docx, doc, ppt, odp, odt, etc.)
    console.log('📄 Converting to PDF via LibreOffice...')
    try {
      await execFileAsync(
        resolveSoffice(),
        ['--headless', '--convert-to', 'pdf', '--outdir', tempDir, inputPath],
        { timeout: 120000 }
      )
    } catch (err) {
      // ENOENT = the executable itself was not found. Say that in words the
      // viewer can show, rather than "spawn …/soffice.exe ENOENT".
      if (err && err.code === 'ENOENT') throw new Error(LIBREOFFICE_MISSING)
      throw err
    }

    // LibreOffice names the PDF after the input file stem (presentation.{ext} → presentation.pdf)
    const pdfPath = path.join(tempDir, 'presentation.pdf')
    if (!await fs.pathExists(pdfPath)) {
      throw new Error('LibreOffice PDF conversion failed')
    }

    // 3. PDF pages → PNG images via pdf-to-img
    console.log('🖼️  Rendering slides...')
    const { pdf } = await import('pdf-to-img')
    const pdfBuffer = await fs.readFile(pdfPath)

    // Fire-and-forget: the intermediate PDF carries the document's full text
    // layer — build the glossary word map from it, keyed by the same
    // cacheKey (the stored file URL) the slide cache uses.
    if (cacheKey) {
      const { extractLessonTextFromPdf } = require('../../utils/lessonTextExtract')
      extractLessonTextFromPdf(Buffer.from(pdfBuffer), cacheKey)
        .catch(err => console.warn('Lesson text extraction failed:', err.message))
    }
    const imagePaths = []
    let slideNum = 1

    for await (const pageBuffer of await pdf(pdfBuffer, { scale: 2 })) {
      const imgPath = path.join(tempDir, `slide_${slideNum}.png`)
      await fs.writeFile(imgPath, pageBuffer)
      imagePaths.push(imgPath)
      slideNum++
    }

    if (imagePaths.length === 0) throw new Error('No slides rendered')

    // 4. Save slides to local persistent storage
    console.log(`💾 Saving ${imagePaths.length} slides to VPS storage...`)
    const stamp = Date.now()
    const slidePaths = imagePaths.map((_, idx) => `ppt-slides/slide_${idx + 1}_${stamp}.png`)
    const uploads = await Promise.all(imagePaths.map(async (imgPath, idx) => {
      const { error } = await storage.from('smartlms').upload(slidePaths[idx], await fs.readFile(imgPath))
      if (error) throw error
      return publicUrlFor(slidePaths[idx])
    }))
    const slideImages = uploads
    console.log(`✅ ${slideImages.length} slides ready`)

    // Persist to DB cache so future requests skip conversion entirely
    if (cacheKey) {
      PptCache.findOneAndUpdate(
        { pptUrl: cacheKey },
        { pptUrl: cacheKey, slideImages, totalSlides: slideImages.length },
        { upsert: true, new: true }
      ).catch(err => console.warn('Cache save failed:', err.message))
    }

    return { slideImages, totalSlides: slideImages.length }

  } finally {
    await fs.remove(tempDir).catch(() => {})
  }
}

// ─── LibreOffice slideshow (Course Setup › PPT viewer = "LibreOffice") ──────
// LibreOffice's SVG export is one self-contained slideshow file: its built-in
// player runs the slide transitions and click animations in the browser. The
// listener below lets the LMS viewer's own Prev / Next buttons drive that
// player over postMessage (the SVG is served from the API origin, the viewer
// runs on the client origin) and reports the slide back, so slide numbers,
// slide MCQs and progress keep working. Next plays the next click animation,
// then moves to the next slide once the slide has none left — like a clicker.
// Bump SHOW_VERSION when this script changes so cached shows are rebuilt.
const SHOW_VERSION = 1
const SHOW_CONTROLLER = `<script type="text/ecmascript"><![CDATA[
(function () {
  function state() {
    try {
      var total = theMetaDoc ? theMetaDoc.nNumberOfSlides : 0;
      var cur = typeof nCurSlide === 'number' ? nCurSlide : 0;
      var s = aSlideShow;
      var more = !!(s && s.aNextEffectEventArray && s.nCurrentEffect < s.aNextEffectEventArray.size());
      return { type: 'lms-ppt-state', slide: cur + 1, total: total,
        canNext: cur < total - 1 || more,
        canPrev: cur > 0 || !!(s && s.hasAnyEffectStarted && s.hasAnyEffectStarted()) };
    } catch (e) { return null; }
  }
  var last = '';
  function report() {
    var st = state();
    if (!st || !st.total) return;
    var key = JSON.stringify(st);
    if (key !== last) { last = key; parent.postMessage(st, '*'); }
  }
  window.addEventListener('message', function (e) {
    var d = e.data;
    if (!d || d.type !== 'lms-ppt' || typeof aSlideShow === 'undefined' || !aSlideShow || processingEffect) return;
    var st = state();
    if (!st) return;
    if (d.cmd === 'next' && st.canNext) dispatchEffects(1);
    else if (d.cmd === 'prev' && st.canPrev) aSlideShow.rewindEffect();
    else if (d.cmd === 'goto') aSlideShow.displaySlide(Math.max(0, Math.min(st.total - 1, (d.slide | 0) - 1)), true);
    report();
  });
  setInterval(report, 250);
})();
]]></script>`

// One stored show per deck URL — the path is derived from it, so a cache
// check is a file-exists check and needs no DB field.
function showPathFor(pptUrl) {
  const hash = crypto.createHash('sha1').update(`${SHOW_VERSION}:${pptUrl}`).digest('hex')
  return `ppt-shows/show_${hash}.svg`
}

async function convertDocumentToShow({ buffer, ext, cacheKey }) {
  const objectPath = cacheKey ? showPathFor(cacheKey) : `ppt-shows/show_${Date.now()}.svg`
  const flightKey = `show:${objectPath}`
  if (inFlightConversions.has(flightKey)) return inFlightConversions.get(flightKey)

  const promise = (async () => {
    const tempDir = path.join(os.tmpdir(), `pptshow_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`)
    try {
      await fs.ensureDir(tempDir)
      const inputPath = path.join(tempDir, `presentation.${ext}`)
      await fs.writeFile(inputPath, buffer)
      try {
        await execFileAsync(resolveSoffice(), ['--headless', '--convert-to', 'svg', '--outdir', tempDir, inputPath], { timeout: 120000 })
      } catch (err) {
        if (err && err.code === 'ENOENT') throw new Error(LIBREOFFICE_MISSING)
        throw err
      }
      const svgPath = path.join(tempDir, 'presentation.svg')
      if (!await fs.pathExists(svgPath)) throw new Error('LibreOffice slideshow conversion failed')

      const svg = await fs.readFile(svgPath, 'utf8')
      const end = svg.lastIndexOf('</svg>')
      if (end < 0) throw new Error('LibreOffice slideshow conversion failed')
      const { error } = await storage.from('smartlms').upload(objectPath, svg.slice(0, end) + SHOW_CONTROLLER + svg.slice(end))
      if (error) throw error
      return { showUrl: publicUrlFor(objectPath) }
    } finally {
      await fs.remove(tempDir).catch(() => {})
    }
  })()

  inFlightConversions.set(flightKey, promise)
  promise.catch(() => {}).finally(() => inFlightConversions.delete(flightKey))
  return promise
}

// POST /api/ppt/convert-show { pptUrl } → { success, showUrl }
async function convertPptToShow(req, res) {
  const pptUrl = req.body?.pptUrl
  if (!pptUrl) return res.status(400).json({ success: false, error: 'pptUrl is required' })

  try {
    const objectPath = showPathFor(pptUrl)
    if (await fs.pathExists(diskPathFor(objectPath))) {
      return res.json({ success: true, showUrl: publicUrlFor(objectPath), fromCache: true })
    }

    const m = pptUrl.split('?')[0].match(/\.([a-zA-Z0-9]+)$/)
    const ext = m ? m[1].toLowerCase() : 'pptx'
    let buffer = await readStoredFile(pptUrl).catch(() => null)
    if (!buffer) {
      const response = await axios.get(pptUrl, { responseType: 'arraybuffer', timeout: 30000 })
      buffer = Buffer.from(response.data)
    }

    const { showUrl } = await convertDocumentToShow({ buffer, ext, cacheKey: pptUrl })
    res.json({ success: true, showUrl })
  } catch (err) {
    console.error('❌ PPT slideshow conversion error:', err.message)
    res.status(500).json({ success: false, error: err.message })
  }
}

// Delete the cached conversion and its locally stored slide images. Used when a file is replaced/removed so orphaned slides don't
// pile up. Safe to fire-and-forget.
async function cleanupConvertedSlides(pptUrl) {
  if (!pptUrl) return
  storage.from('smartlms').remove([showPathFor(pptUrl)]).catch(() => {})
  const cached = await PptCache.findOneAndDelete({ pptUrl })
  if (!cached || !Array.isArray(cached.slideImages)) return
  await Promise.all(
    cached.slideImages.map(async imageUrl => {
      const objectPath = storagePathFromUrl(imageUrl)
      if (!objectPath || !String(imageUrl).includes('/uploads/storage/')) return
      const { error } = await storage.from('smartlms').remove([objectPath])
      if (error) console.warn('VPS slide cleanup failed:', error.message)
    })
  )
}

async function convertPptToImages(req, res) {
  // Accept either an uploaded file or a URL (URL used only if server can reach it)
  const hasUploadedFile = req.files && req.files.file
  const pptUrl = req.body?.pptUrl

  if (!hasUploadedFile && !pptUrl) {
    return res.status(400).json({ success: false, error: 'Either upload a file or provide pptUrl' })
  }

  // Check DB cache first — only possible when a URL is known
  const cacheKey = pptUrl || null
  if (cacheKey) {
    const cached = await PptCache.findOne({ pptUrl: cacheKey })
    if (cached && cached.slideImages.length > 0) {
      console.log('✅ Cache hit — returning stored slides')
      return res.json({ success: true, slideImages: cached.slideImages, totalSlides: cached.totalSlides, fromCache: true })
    }
  }

  try {
    // Detect the actual file extension so LibreOffice opens it correctly
    let ext = 'pptx'
    if (hasUploadedFile && req.files.file.name) {
      const m = req.files.file.name.match(/\.([a-zA-Z0-9]+)$/)
      if (m) ext = m[1].toLowerCase()
    } else if (pptUrl) {
      const m = pptUrl.split('?')[0].match(/\.([a-zA-Z0-9]+)$/)
      if (m) ext = m[1].toLowerCase()
    }

    let buffer
    if (hasUploadedFile) {
      // File sent directly from browser — no external download needed
      console.log(`📁 Using uploaded file (${ext})...`)
      buffer = req.files.file.data
    } else {
      // Fallback: our own stored file is read from disk; anything else is downloaded
      buffer = await readStoredFile(pptUrl).catch(() => null)
      if (!buffer) {
        console.log(`⬇️  Downloading file (${ext})...`)
        const response = await axios.get(pptUrl, { responseType: 'arraybuffer', timeout: 30000 })
        buffer = Buffer.from(response.data)
      }
    }

    const { slideImages, totalSlides } = await convertDocumentToSlides({ buffer, ext, cacheKey })

    res.json({ success: true, slideImages, totalSlides })

  } catch (err) {
    console.error('❌ PPT conversion error:', err.message)
    res.status(500).json({ success: false, error: err.message })
  }
}

module.exports = { convertPptToImages, convertDocumentToSlides, cleanupConvertedSlides, convertPptToShow, convertDocumentToShow }
