const express = require('express')
const router = express.Router()
const { convertPptToImages, convertPptToShow } = require('../../controllers/courses/pptConversionController')

// POST /api/ppt/convert
// Body: { pptUrl: "https://..." }
// Returns: { success: true, slideImages: [...], totalSlides: N }
router.post('/api/ppt/convert', convertPptToImages)

// POST /api/ppt/convert-show
// Body: { pptUrl: "https://..." }
// Returns: { success: true, showUrl } — LibreOffice SVG slideshow with animations
router.post('/api/ppt/convert-show', convertPptToShow)

module.exports = router
