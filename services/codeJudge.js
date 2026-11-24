// Server-authoritative code judge.
//
// Replaces the client-side test-case loops that used to live in
// multi-file-code-editor.tsx and code-editor.tsx. The score a student sees
// is now computed here from the actual Piston output — the submit endpoint
// discards any score the client sends.
//
// Flow per submission:
//   1. Pick an entry file. For a single-file submission that's the only file;
//      for a multi-file project the explicit isEntryPoint file wins, else the
//      first file that matches the language, else file[0]. Mirrors the
//      existing pistonClient.ts pickEntryIndex() logic 1-for-1 so nothing
//      about which file executes changes when we move to the server.
//   2. Run driverInjector.decide() on the entry file's content. When the
//      student wrote a bare function (LeetCode-style), we append a driver
//      that reads stdin and prints the return value — the rest of the project
//      files ride along unchanged. When the student wrote a full program
//      (has input()/Scanner/cin), decide() returns stdio mode and nothing
//      is appended.
//   3. Run every test case with stdin = tc.input: compiled languages in one
//      compiler-service job (compile once, CPU-time limits; see
//      judgeOnCompilerService), Python — and anything the service can't
//      take — one Piston call per case.
//   4. compare(stdout, tc.expectedOutput, { type: tc.expectedType }) →
//      per-case pass/fail. Aggregate for score + status + breakdown.
//
// The breakdown shape matches what submitAnswer's sanitizer already expects
// (method: 'testcase', testcase: { passed, total, cases: [...] }) so the
// controller's persistence path is untouched — we swap the client-computed
// object for a server-computed one and everything downstream keeps working.

const crypto = require('crypto');
const { compare } = require('./compare');
const { decide } = require('./driverInjector');

// Default runtime per language — the versions every Piston install has.
// Match pistonClient.ts's pinned runtime versions so a submission judged on
// the server behaves identically to what the "Run" button did previously.
// An exercise can pick another installed version per language in Exercise
// Settings (programmingSettings.languageVersions); see `versionFor`.
const PISTON_RUNTIMES = {
  python:     { language: 'python',     version: '3.10.0' },
  javascript: { language: 'javascript', version: '18.15.0' },
  typescript: { language: 'typescript', version: '5.0.3' },
  java:       { language: 'java',       version: '15.0.2' },
  cpp:        { language: 'cpp',        version: '10.2.0' },
  c:          { language: 'c',          version: '10.2.0' },
  go:         { language: 'go',         version: '1.16.2' },
  csharp:     { language: 'csharp',     version: '6.12.0' },
};

const PISTON_URL =
  process.env.PISTON_INTERNAL_URL
    ? `${process.env.PISTON_INTERNAL_URL.replace(/\/$/, '')}/api/v2/execute`
    : 'http://localhost:2000/api/v2/execute';
const PISTON_RUNTIMES_URL = PISTON_URL.replace(/\/execute$/, '/runtimes');

// LMS language names ("Python", "C++", "C#", "cpp", …) → PISTON_RUNTIMES keys.
const LANGUAGE_KEYS = {
  python: 'python', py: 'python', python3: 'python',
  javascript: 'javascript', js: 'javascript', node: 'javascript', nodejs: 'javascript',
  typescript: 'typescript', ts: 'typescript',
  java: 'java',
  cpp: 'cpp', 'c++': 'cpp', cplusplus: 'cpp',
  c: 'c',
  go: 'go', golang: 'go',
  csharp: 'csharp', 'c#': 'csharp', cs: 'csharp',
};
function normalizeLanguage(language) {
  const k = String(language || '').trim().toLowerCase();
  return LANGUAGE_KEYS[k] || k;
}

// A Piston version string ("21.0.12"), or null for anything else.
function cleanVersion(v) {
  const s = typeof v === 'string' ? v.trim() : '';
  return /^\d+(\.\d+){0,3}$/.test(s) ? s : null;
}

// The version an exercise picked for `language`, or null for the default.
function versionFor(languageVersions, language) {
  if (!languageVersions || typeof languageVersions !== 'object') return null;
  const key = normalizeLanguage(language);
  const v = languageVersions instanceof Map ? languageVersions.get(key) : languageVersions[key];
  return cleanVersion(v);
}

// Exercise Settings payload → { java: '21.0.12', … } with only known
// languages and well-formed versions; undefined when nothing is picked.
function cleanLanguageVersions(raw) {
  if (!raw || typeof raw !== 'object') return undefined;
  const out = {};
  for (const [lang, ver] of Object.entries(raw)) {
    const key = normalizeLanguage(lang);
    const v = cleanVersion(ver);
    if (PISTON_RUNTIMES[key] && v) out[key] = v;
  }
  return Object.keys(out).length ? out : undefined;
}

const compareVersionsDesc = (a, b) => {
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pb[i] || 0) - (pa[i] || 0);
    if (d) return d;
  }
  return 0;
};

// Installed versions per LMS language, newest first, plus the defaults —
// what the Exercise Settings version pickers list. Cached for a minute.
let runtimesCache = { at: 0, data: null };
async function listInstalledRuntimes() {
  if (runtimesCache.data && Date.now() - runtimesCache.at < 60_000) return runtimesCache.data;
  const res = await fetch(PISTON_RUNTIMES_URL);
  if (!res.ok) throw new Error(`Piston HTTP ${res.status}`);
  const list = await res.json();
  const versions = {};
  for (const r of Array.isArray(list) ? list : []) {
    const key = normalizeLanguage(r && r.language);
    if (!PISTON_RUNTIMES[key] || !cleanVersion(String(r.version))) continue;
    (versions[key] = versions[key] || new Set()).add(String(r.version));
  }
  const data = {
    versions: Object.fromEntries(Object.entries(versions).map(([k, set]) => [k, [...set].sort(compareVersionsDesc)])),
    defaults: Object.fromEntries(Object.entries(PISTON_RUNTIMES).map(([k, rt]) => [k, rt.version])),
  };
  runtimesCache = { at: Date.now(), data };
  return data;
}

// Language filename hint. Java is the exception because Piston insists the
// filename match the public class — we peek at the source for the class name.
function pistonFilename(language, path, content) {
  const clean = String(path || '').replace(/^\/+/, '');
  const lang = (language || '').toLowerCase();
  if (lang === 'java') {
    const m = String(content || '').match(/public\s+class\s+(\w+)/);
    if (m) {
      const dir = clean.includes('/') ? clean.slice(0, clean.lastIndexOf('/') + 1) : '';
      return `${dir}${m[1]}.java`;
    }
    return 'Main.java';
  }
  const extByLang = {
    python: 'py', javascript: 'js', typescript: 'ts',
    cpp: 'cpp', c: 'c', go: 'go', csharp: 'cs',
  };
  if (clean) return clean;
  return `main.${extByLang[lang] || 'txt'}`;
}

// Same entry-point selection rule as pistonClient.ts. Kept in sync so an
// existing multi-file question runs the same file server-side as it did
// client-side pre-migration.
function pickEntryIndex(files, language) {
  if (!Array.isArray(files) || files.length === 0) return -1;
  const explicit = files.findIndex((f) => f.isEntryPoint);
  if (explicit >= 0) return explicit;
  const conventional = {
    python: 'main.py', javascript: 'main.js', typescript: 'main.ts',
    java: 'Main.java', cpp: 'main.cpp', c: 'main.c', go: 'main.go', csharp: 'main.cs',
  }[(language || '').toLowerCase()];
  if (conventional) {
    const byName = files.findIndex((f) => String(f.path || f.filename || '').split('/').pop()?.toLowerCase() === conventional.toLowerCase());
    if (byName >= 0) return byName;
  }
  return 0;
}

// ─── Piston admission limiter ───────────────────────────────────────────────
// Every Piston call (Run tests, Submit, /run/piston, runOnce) goes through
// callPiston and so through here. Piston runs up to 64 jobs at once and its
// limits are wall-clock time: a burst of Java compiles (~1 CPU-second each)
// starves the 8 cores and correct programs come back SIGKILLed as false TLE.
// So compiled languages get a few parallel slots, while Python/JavaScript
// (cheap, bound by Piston's per-job overhead) get many. A call waits FIFO for
// a slot of its class. The wait counts toward no timeout: Piston's limits
// start only once it receives the job, and timeMs starts at the slot grant.
// 0 = no limit for that class. LMS-Server is one process, so this limit is
// server-wide; staging-server and load-test scripts each have their own.
const PISTON_COMPILED = new Set(['java', 'c', 'cpp', 'csharp', 'go', 'typescript']);

function envInt(name, fallback) {
  const n = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

class FifoLimiter {
  constructor(max) { this.max = max; this.active = 0; this.waiting = []; }
  acquire() {
    if (!this.max || this.active < this.max) { this.active++; return Promise.resolve(); }
    return new Promise((resolve) => this.waiting.push(resolve));
  }
  release() {
    const next = this.waiting.shift();
    if (next) next(); // the slot passes straight to the longest waiter
    else this.active--;
  }
  stats() { return { max: this.max, active: this.active, waiting: this.waiting.length }; }
}

// Created on first use so the values come from .env (dotenv) whatever the
// require order.
let pistonLimiters = null;
function pistonLimiter(pistonLanguage) {
  if (!pistonLimiters) {
    pistonLimiters = {
      compiled: new FifoLimiter(envInt('PISTON_MAX_PARALLEL_COMPILED', 12)),
      light: new FifoLimiter(envInt('PISTON_MAX_PARALLEL_LIGHT', 48)),
    };
  }
  return PISTON_COMPILED.has(pistonLanguage) ? pistonLimiters.compiled : pistonLimiters.light;
}

/** { compiled: { max, active, waiting }, light: { … } } — for monitoring. */
function pistonLimiterStats() {
  pistonLimiter('python');
  return { compiled: pistonLimiters.compiled.stats(), light: pistonLimiters.light.stats() };
}

async function callPiston(opts) {
  const rt = PISTON_RUNTIMES[normalizeLanguage(opts && opts.language)] || PISTON_RUNTIMES.python;
  const limiter = pistonLimiter(rt.language);
  await limiter.acquire();
  try {
    return await executeOnPiston(opts);
  } finally {
    limiter.release();
  }
}

// One Piston execution; the caller holds a limiter slot.
async function executeOnPiston({ language, files, stdin, runTimeoutMs = 5000, version = null }) {
  const rt = PISTON_RUNTIMES[normalizeLanguage(language)] || PISTON_RUNTIMES.python;
  const picked = cleanVersion(version);
  const body = {
    language: rt.language,
    version: picked || rt.version,
    files: files.map((f) => ({ name: f.name, content: f.content })),
    stdin: stdin || '',
    args: [],
    compile_timeout: 10000,
    run_timeout: runTimeoutMs,
    compile_memory_limit: -1,
    run_memory_limit: -1,
  };
  const t0 = Date.now();
  let res;
  try {
    res = await fetch(PISTON_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (e) {
    return { networkError: e?.message || String(e), timeMs: Date.now() - t0 };
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    // The exercise's version was uninstalled since it was picked — run on
    // the default rather than failing every submission.
    if (picked && picked !== rt.version && res.status === 400 && /runtime is unknown/i.test(text)) {
      console.warn(`[codeJudge] ${rt.language} ${picked} is not installed in Piston; using ${rt.version}`);
      // Same slot: re-acquiring here could deadlock once every slot is taken.
      return executeOnPiston({ language, files, stdin, runTimeoutMs });
    }
    return { httpError: `Piston HTTP ${res.status}: ${text.slice(0, 300)}`, timeMs: Date.now() - t0 };
  }
  const data = await res.json();
  const run = data.run || {};
  const compile = data.compile || null;
  return {
    stdout: run.stdout || '',
    stderr: run.stderr || '',
    exitCode: typeof run.code === 'number' ? run.code : null,
    signal: run.signal || null,
    compileError: compile && compile.code ? (compile.stderr || compile.output || '') : '',
    timeMs: Date.now() - t0,
  };
}

// ─── Run tests on the compiler service ──────────────────────────────────────
// Compiled languages judge on the LMS compiler service (the warm workers
// behind Run): one compile, then one run per test case with that case's
// stdin, each under a CPU-time limit. A busy server can no longer turn a
// correct program into a false TLE (Piston's limits are wall-clock time),
// and Java compiles once instead of once per case. Python stays on Piston,
// which handles it cheaply. Whenever the service can't (offline, no workers
// for the language, too slow, workers' memory full), the submission is
// judged on Piston exactly as before. Languages: JUDGE_COMPILER_LANGUAGES.
const DEFAULT_COMPILER_LANGUAGES = 'java,c,cpp,csharp,javascript,typescript,go';
const ENTRY_EXT = { c: '.c', cpp: '.cpp', go: '.go', csharp: '.cs', javascript: '.js', typescript: '.ts' };

let compilerLanguages = null;
function judgesOnCompiler(lang) {
  if (!compilerLanguages) {
    compilerLanguages = new Set(String(process.env.JUDGE_COMPILER_LANGUAGES ?? DEFAULT_COMPILER_LANGUAGES)
      .split(',').map((s) => normalizeLanguage(s)).filter(Boolean));
  }
  return compilerLanguages.has(lang);
}

/**
 * Run `stdins` against the project on the compiler service. Returns one
 * callPiston-shaped result per stdin, or null when the service can't judge
 * it (the caller then uses Piston).
 */
// A Run-tests click's own id (from the browser), so it can ask for its place
// in the queue while it waits (judgeQueuePosition).
const QUEUE_TOKEN = /^[A-Za-z0-9-]{8,64}$/;
const judgeJobId = (token) => `judge-${token}`;

/** { position, waiting } of a Run-tests click still waiting; position 0 = not waiting. */
async function judgeQueuePosition(language, token) {
  const lang = normalizeLanguage(language);
  if (!QUEUE_TOKEN.test(String(token || ''))) return { position: 0, waiting: 0 };
  const conn = require('../compiler/queue/connections').connect();
  if (!conn || !conn.queues[lang]) return { position: 0, waiting: 0 };
  return require('../compiler/queue/position').queuePosition(conn, lang, judgeJobId(token));
}

async function judgeOnCompilerService({ language, files, stdins, runTimeoutMs, queueToken }) {
  const lang = normalizeLanguage(language);
  if (!judgesOnCompiler(lang) || !files.length) return null;
  const conn = require('../compiler/queue/connections').connect();
  if (!conn || !conn.queues[lang] || !conn.events[lang]) return null;
  // Every waiting judge adds a short-lived 'closing' listener to the queue
  // (BullMQ's waitUntilFinished); a class of students exceeds Node's default
  // of 10 and would log a false "memory leak" warning.
  if (conn.queues[lang].getMaxListeners() < 1000) conn.queues[lang].setMaxListeners(1000);
  const health = JSON.parse((await conn.commands.get(`${conn.prefix}:health`)) || 'null');
  const staleMs = require('../compiler/config').get().serviceStaleMs;
  if (!health || Date.now() - health.ts > staleMs || !(health.languages?.[lang]?.total > 0)) return null;

  // Piston's names (Java files named after their public class), with the
  // entry file carrying its language's extension: the compilers pick their
  // inputs by extension (Submit sends the code as a file called "main").
  const named = files.map((f, i) => {
    let path = String(f.name || '').replace(/^\/+/, '') || `main${ENTRY_EXT[lang] || ''}`;
    if (i === 0 && ENTRY_EXT[lang] && !path.toLowerCase().endsWith(ENTRY_EXT[lang])) path = `main${ENTRY_EXT[lang]}`;
    return { path, content: f.content || '' };
  });
  const judgeId = judgeJobId(QUEUE_TOKEN.test(String(queueToken || '')) ? queueToken : crypto.randomUUID());
  const job = await conn.queues[lang].add('judge', {
    judgeId, language: lang, files: named, entry: named[0].path,
    tests: stdins.map((stdin) => ({ stdin })),
    cpuSeconds: Math.max(1, Math.ceil(runTimeoutMs / 1000)),
  }, { jobId: judgeId, attempts: 1, removeOnComplete: { age: 60 }, removeOnFail: { age: 60 } });
  const waitMs = envInt('JUDGE_COMPILER_WAIT_MS', 55000);
  let result;
  try {
    result = await job.waitUntilFinished(conn.events[lang], waitMs);
  } catch (e) {
    await job.remove().catch(() => {}); // still queued: don't run it any more
    throw e;
  }
  if (!result || result.compile?.busy || !Array.isArray(result.cases)) return null;
  const c = result.compile || {};
  if (c.timedOut || c.exitCode !== 0) {
    const compileError = c.timedOut
      ? 'Compilation took too long and was stopped.'
      : (c.output || `The compiler failed (exit code ${c.exitCode}).`);
    return stdins.map(() => ({ stdout: '', stderr: '', exitCode: null, signal: null, compileError, timeMs: 0 }));
  }
  if (result.cases.length !== stdins.length || result.cases.some((r) => r.busy)) return null;
  return result.cases.map((r) => ({
    stdout: r.stdout || '',
    stderr: r.stderr || '',
    exitCode: typeof r.exitCode === 'number' ? r.exitCode : null,
    // judge() reads SIGKILL as Time Limit Exceeded. A memory kill is a
    // runtime error instead; its message is the last stderr line.
    signal: r.tle ? 'SIGKILL' : (r.memory ? null : (r.signal || null)),
    compileError: '',
    timeMs: r.timeMs || 0,
  }));
}

/**
 * Judge a submission.
 *
 * @param {object} opts
 * @param {string} opts.language           "python" | "javascript" | ...
 * @param {Array}  opts.files              [{ path, content, isEntryPoint }]
 * @param {Array}  opts.testCases          [{ input, expectedOutput, isHidden, expectedType?, epsilon?, points? }]
 * @param {number} [opts.maxMarks=10]      question's total marks
 * @param {string} [opts.functionName]     explicit function name (from solutions.functionName)
 * @param {number} [opts.runTimeoutMs=5000]
 * @param {string} [opts.version]          Piston version the exercise picked (default when omitted)
 *
 * @returns {object} {
 *   passed, total, score, maxMarks, status,           ← headline numbers
 *   perCase: [ { index, passed, hidden, input, expectedOutput, actualOutput, timeMs, verdict } ],
 *   mode: 'stdio' | 'function',   fnName,   injected,
 *   log: [ ...human-readable lines for the terminal panel ],
 * }
 */
async function judge(opts) {
  const {
    language,
    files = [],
    testCases = [],
    maxMarks = 10,
    functionName = null,
    // 10s ceiling — matches the /api/run/piston clamp, covers Java cold-JVM
    // (~1.5s typical, up to ~5s under Piston queue contention), and still
    // leaves an intentionally-tight bound to catch student infinite loops.
    runTimeoutMs = 10000,
    version = null,
    // Run tests: the browser's id for this click (see judgeQueuePosition).
    queueToken = null,
  } = opts || {};

  const log = [];
  const push = (t, s) => log.push({ type: t, text: s });

  if (!files.length) {
    push('error', 'No code files to judge.');
    return {
      passed: 0, total: 0, score: 0, maxMarks, status: 'submitted',
      perCase: [], mode: 'stdio', fnName: null, injected: false, log,
    };
  }
  if (!testCases.length) {
    push('info', 'No test cases configured on this question — code saved without an auto-score.');
    return {
      passed: 0, total: 0, score: 0, maxMarks, status: 'submitted',
      perCase: [], mode: 'stdio', fnName: null, injected: false, log,
    };
  }

  const entryIdx = pickEntryIndex(files, language);
  const entryFile = files[entryIdx];
  const decision = decide({
    language,
    code: entryFile.content || '',
    functionName,
  });
  push('system', decision.reason);

  // Build the Piston file set once. Entry file first (Piston runs files[0]),
  // entry content is the driver-augmented version when we injected one.
  const buildPistonFiles = () => {
    const ordered = [entryFile, ...files.filter((_, i) => i !== entryIdx)];
    return ordered.map((f, i) => ({
      name: pistonFilename(language, f.path || f.filename, i === 0 ? decision.fullCode : (f.content || '')),
      content: i === 0 ? decision.fullCode : (f.content || ''),
    }));
  };

  const pistonFiles = buildPistonFiles();
  const perCase = [];
  let passed = 0;

  push('system', `🧪 Running ${testCases.length} test case${testCases.length > 1 ? 's' : ''}…`);

  // Compiled languages: every case in one compiler-service job (see
  // judgeOnCompilerService); null → each case on Piston, as before.
  let serviceRuns = null;
  try {
    serviceRuns = await judgeOnCompilerService({
      language, files: pistonFiles, stdins: testCases.map((tc) => String(tc.input ?? '')), runTimeoutMs, queueToken,
    });
  } catch (e) {
    console.warn(`[codeJudge] compiler service could not judge ${normalizeLanguage(language)}, using Piston: ${e?.message || e}`);
  }

  for (let i = 0; i < testCases.length; i++) {
    const tc = testCases[i];
    const label = tc.isHidden ? `Hidden test #${i + 1}` : `Test #${i + 1}`;
    const stdin = String(tc.input ?? '');
    const expected = String(tc.expectedOutput ?? '');

    // No retry on SIGKILL: Piston calls are limited per language class
    // (pistonLimiter), so a timeout is the program's own.
    const r = serviceRuns ? serviceRuns[i] : await callPiston({ language, files: pistonFiles, stdin, runTimeoutMs, version });

    let ok = false;
    let actual = '';
    let verdict = 'WA';

    if (r.networkError) {
      verdict = 'JE'; // judge error
      actual = `(judge error: ${r.networkError})`;
      push('error', `✗ ${label} — ${actual}`);
    } else if (r.httpError) {
      verdict = 'JE';
      actual = `(judge error: ${r.httpError})`;
      push('error', `✗ ${label} — ${actual}`);
    } else if (r.compileError) {
      verdict = 'CE';
      actual = `compile: ${r.compileError.split('\n')[0]}`;
      push('error', `✗ ${label} failed — ${actual}`);
    } else if (r.signal === 'SIGKILL') {
      verdict = 'TLE';
      actual = '(time limit exceeded)';
      push('error', `✗ ${label} — Time Limit Exceeded`);
    } else if (r.exitCode !== 0 && r.exitCode !== null && !r.stdout) {
      verdict = 'RE';
      // Pull the LAST non-empty stderr line — Python throws that as the
      // exception name+message ("NameError: name 'isEven' is not defined"),
      // which is what the student needs. First line ("Traceback (most
      // recent call last):") is noise.
      if (r.stderr) {
        const lines = r.stderr.split('\n').map((l) => l.trim()).filter(Boolean);
        actual = lines[lines.length - 1] || r.stderr.split('\n')[0] || `runtime error (exit ${r.exitCode})`;
      } else {
        actual = `runtime error (exit ${r.exitCode})`;
      }
      push('error', `✗ ${label} — Runtime Error: ${actual}`);
    } else {
      ok = compare(r.stdout, expected, {
        type: tc.expectedType || 'exact',
        epsilon: tc.epsilon,
      });
      // When there's a runtime error mixed with test output, surface the LAST
      // non-empty stderr line — for Python that's the exception name+message
      // ("NameError: name 'isEven' is not defined"), which is what the
      // student actually needs to see to debug. The first line of a
      // traceback is always the useless "Traceback (most recent call
      // last):" header.
      const trimmedStdout = (r.stdout || '').trim();
      let stderrTail = '';
      if (r.stderr) {
        const lines = r.stderr.split('\n').map((l) => l.trim()).filter(Boolean);
        stderrTail = lines[lines.length - 1] || '';
      }
      actual = trimmedStdout || stderrTail || '';
      verdict = ok ? 'AC' : 'WA';
      if (ok) {
        passed++;
        push('success', `✓ ${label} passed`);
      } else if (tc.isHidden) {
        push('error', `✗ ${label} failed`);
      } else {
        push('error', `✗ ${label} failed — expected: ${expected} | got: ${actual || '(no output)'}`);
      }
    }

    perCase.push({
      index: i,
      passed: ok,
      hidden: !!tc.isHidden,
      input: stdin,
      expectedOutput: expected,
      actualOutput: actual,
      timeMs: r.timeMs || 0,
      verdict,
    });
  }

  const score = Math.round((passed / testCases.length) * maxMarks * 100) / 100;
  const status = passed === testCases.length ? 'solved' : 'submitted';

  push(
    passed === testCases.length ? 'success' : 'info',
    `🏁 Passed ${passed}/${testCases.length} — Score: ${score}/${maxMarks}`,
  );

  return {
    passed,
    total: testCases.length,
    score,
    maxMarks,
    status,
    perCase,
    mode: decision.mode,
    fnName: decision.fnName,
    injected: decision.injected,
    log,
  };
}

/** True when Piston can run `language` (a PISTON_RUNTIMES language). */
function isRunnableLanguage(language) {
  return !!PISTON_RUNTIMES[normalizeLanguage(language)];
}

/**
 * Run a submission once, exactly as written (no test-case driver), and return
 * what it printed: { stdout, stderr, exitCode, compileError, timeMs } - or
 * { networkError | httpError } when Piston couldn't be reached.
 */
async function runOnce({ language, files = [], stdin = '', version = null, runTimeoutMs = 5000 }) {
  if (!files.length) return { stdout: '', stderr: '', exitCode: null, compileError: '', timeMs: 0 };
  const entryIdx = pickEntryIndex(files, language);
  const ordered = [files[entryIdx], ...files.filter((_, i) => i !== entryIdx)];
  const pistonFiles = ordered.map((f) => ({
    name: pistonFilename(language, f.path || f.filename, f.content || ''),
    content: f.content || '',
  }));
  return callPiston({ language, files: pistonFiles, stdin, runTimeoutMs, version });
}

module.exports = {
  judge, callPiston, pickEntryIndex, pistonFilename, PISTON_URL,
  normalizeLanguage, versionFor, cleanLanguageVersions, listInstalledRuntimes,
  isRunnableLanguage, runOnce, pistonLimiterStats, judgeQueuePosition,
};
