// AI code review — offered when a student submits a programming answer.
//
// The student opts in ("Evaluate your code with AI?"), the editor posts the
// code here, and Gemini returns a detailed review: time and space complexity
// (with the optimal bound for the problem), a 0–100 rating and comment for
// each parameter (correctness, efficiency, code quality, readability, edge
// cases, best practices), strengths, improvements, missed edge cases and a
// suggested approach. Feedback only — it never changes the answer's marks.
//
// Runs on the server so the Gemini key stays in .env:
//   GEMINI_CODE_REVIEW_API_KEY (falls back to GEMINI_API_KEY)
//   GEMINI_CODE_REVIEW_MODEL   (optional, tried first)

const { GoogleGenAI } = require("@google/genai");

const apiKey = () => process.env.GEMINI_CODE_REVIEW_API_KEY || process.env.GEMINI_API_KEY || "";
let client = null;
let clientKey = "";
const getClient = () => {
  const key = apiKey();
  if (!key) return null;
  if (!client || clientKey !== key) {
    client = new GoogleGenAI({ apiKey: key });
    clientKey = key;
  }
  return client;
};

// Tried in order while a model is retired, busy or rate-limited.
const MODELS = () => [...new Set([
  process.env.GEMINI_CODE_REVIEW_MODEL,
  "gemini-3.5-flash",
  "gemini-3.5-flash-lite",
  "gemini-flash-latest",
].filter(Boolean))];
// 400 too: a model that rejects the thinking setting is skipped, not fatal.
const TRY_NEXT = new Set([400, 404, 429, 500, 503]);
// Default (deep) thinking took ~110 s on a full review; "low" answers in
// seconds with the same verdicts. Lite models think little already.
const thinkingFor = (model) => (/lite/i.test(model) ? {} : { thinkingConfig: { thinkingLevel: "low" } });
// A model that hangs is abandoned for the next one.
const ATTEMPT_TIMEOUT_MS = 40000;

const PARAMETERS = [
  { key: "correctness", label: "Correctness" },
  { key: "efficiency", label: "Efficiency" },
  { key: "codeQuality", label: "Code Quality" },
  { key: "readability", label: "Readability" },
  { key: "edgeCases", label: "Edge Case Handling" },
  { key: "bestPractices", label: "Best Practices" },
];
const RATINGS = ["optimal", "acceptable", "needs-improvement"];

const MAX_CODE_CHARS = 20000;
const MAX_TEXT_CHARS = 4000;
// One review at a time per student — each one is a paid model call.
const COOLDOWN_MS = 8000;
const lastReviewAt = new Map();

const stripHtml = (s) =>
  String(s || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

const clampScore = (n) => Math.max(0, Math.min(100, Math.round(Number(n) || 0)));
const text = (v, max = 600) => String(v ?? "").trim().slice(0, max);
const list = (v, maxItems = 6) =>
  (Array.isArray(v) ? v : []).map((x) => text(typeof x === "string" ? x : x?.text || x?.point || "", 400)).filter(Boolean).slice(0, maxItems);

const SYSTEM = [
  "You are a senior programming instructor reviewing a student's solution to a coding exercise.",
  "Analyse the code exactly as written: do not assume features it does not have, and do not run it.",
  "Be accurate about complexity: state it in Big-O for the input sizes in the problem, and say which part of the code dominates.",
  "Be specific and constructive — point at functions, loops or lines by what they do — and keep the tone encouraging.",
  "Return ONLY the JSON object described, no markdown.",
].join(" ");

function buildPrompt({ code, language, question, testSummary }) {
  const constraints = (Array.isArray(question?.constraints) ? question.constraints : [])
    .map((c) => stripHtml(typeof c === "string" ? c : c?.text || c?.value || ""))
    .filter(Boolean)
    .slice(0, 20);
  const lines = [
    `Language: ${text(language, 40) || "unknown"}`,
    `Problem title: ${text(question?.title, 300) || "(untitled)"}`,
    `Problem statement: ${stripHtml(question?.description).slice(0, MAX_TEXT_CHARS) || "(not provided)"}`,
  ];
  if (constraints.length) lines.push(`Constraints:\n- ${constraints.join("\n- ")}`);
  if (testSummary && Number(testSummary.total) > 0) {
    lines.push(`Automated tests on this submission: ${Number(testSummary.passed) || 0} of ${Number(testSummary.total)} passed.`);
  }
  lines.push("Student code:\n```\n" + code + "\n```");
  lines.push(`Respond with JSON of this shape:
{
  "overallScore": 0-100,
  "verdict": "one short line, e.g. 'Correct and efficient, minor style issues'",
  "summary": "2-4 sentences on what the code does well and what matters most to fix",
  "timeComplexity": { "value": "Big-O, e.g. O(n log n)", "explanation": "which part dominates and why", "rating": "optimal | acceptable | needs-improvement" },
  "spaceComplexity": { "value": "Big-O", "explanation": "what memory is used and why", "rating": "optimal | acceptable | needs-improvement" },
  "optimal": { "time": "best achievable Big-O for this problem", "space": "best achievable Big-O", "note": "how to reach it, one or two sentences (empty if already optimal)" },
  "parameters": [
${PARAMETERS.map((p) => `    { "key": "${p.key}", "score": 0-100, "comment": "1-2 specific sentences" }`).join(",\n")}
  ],
  "strengths": ["up to 5 short points"],
  "improvements": ["up to 5 concrete, actionable suggestions"],
  "edgeCasesMissed": ["inputs the code would mishandle; empty array if none"],
  "suggestedApproach": "a short description of a cleaner or faster approach, or how to polish this one"
}`);
  return lines.join("\n\n");
}

function normalize(raw) {
  const complexity = (c) => ({
    value: text(c?.value, 60) || "—",
    explanation: text(c?.explanation, 500),
    rating: RATINGS.includes(c?.rating) ? c.rating : "acceptable",
  });
  const given = Array.isArray(raw?.parameters) ? raw.parameters : [];
  const parameters = PARAMETERS.map((p) => {
    const hit = given.find((g) => g && (g.key === p.key || String(g.label || "").toLowerCase() === p.label.toLowerCase())) || {};
    return { key: p.key, label: p.label, score: clampScore(hit.score), comment: text(hit.comment, 500) };
  });
  const overall = raw?.overallScore != null
    ? clampScore(raw.overallScore)
    : clampScore(parameters.reduce((s, p) => s + p.score, 0) / parameters.length);
  return {
    overallScore: overall,
    verdict: text(raw?.verdict, 160),
    summary: text(raw?.summary, 1200),
    timeComplexity: complexity(raw?.timeComplexity),
    spaceComplexity: complexity(raw?.spaceComplexity),
    optimal: {
      time: text(raw?.optimal?.time, 60),
      space: text(raw?.optimal?.space, 60),
      note: text(raw?.optimal?.note, 500),
    },
    parameters,
    strengths: list(raw?.strengths, 5),
    improvements: list(raw?.improvements, 5),
    edgeCasesMissed: list(raw?.edgeCasesMissed, 6),
    suggestedApproach: text(raw?.suggestedApproach, 1200),
  };
}

const parseJson = (s) => {
  const t = String(s || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  try { return JSON.parse(t); } catch { /* fall through */ }
  const a = t.indexOf("{");
  const b = t.lastIndexOf("}");
  if (a >= 0 && b > a) {
    try { return JSON.parse(t.slice(a, b + 1)); } catch { /* invalid */ }
  }
  return null;
};

// POST /ai/code-review  { code, language, question: { title, description, constraints }, testSummary?: { passed, total } }
exports.reviewCode = async (req, res) => {
  try {
    const { code, language, question = {}, testSummary } = req.body || {};
    const source = String(code || "").slice(0, MAX_CODE_CHARS);
    if (!source.trim()) {
      return res.status(400).json({ success: false, message: "There is no code to review." });
    }
    const ai = getClient();
    if (!ai) {
      return res.status(503).json({ success: false, message: "AI code review is not configured on the server." });
    }

    const who = String(req.user?._id || req.ip || "anon");
    const now = Date.now();
    if (now - (lastReviewAt.get(who) || 0) < COOLDOWN_MS) {
      return res.status(429).json({ success: false, message: "Please wait a few seconds before requesting another review." });
    }
    lastReviewAt.set(who, now);

    const prompt = buildPrompt({ code: source, language, question, testSummary });
    let lastError = null;
    for (const model of MODELS()) {
      const abort = new AbortController();
      const timer = setTimeout(() => abort.abort(), ATTEMPT_TIMEOUT_MS);
      try {
        const result = await ai.models.generateContent({
          model,
          contents: prompt,
          config: {
            systemInstruction: SYSTEM,
            responseMimeType: "application/json",
            temperature: 0.2,
            abortSignal: abort.signal,
            ...thinkingFor(model),
          },
        });
        const parsed = parseJson(result?.text);
        if (!parsed) { lastError = new Error("The model returned an unreadable review."); continue; }
        return res.status(200).json({ success: true, data: { ...normalize(parsed), model, reviewedAt: new Date().toISOString() } });
      } catch (err) {
        lastError = err;
        const status = Number(err?.status || err?.code || 0);
        if (!TRY_NEXT.has(status) && status !== 0) break;
      } finally {
        clearTimeout(timer);
      }
    }
    console.error("AI code review failed:", lastError?.message || lastError);
    // A failed review should not count against the cooldown.
    lastReviewAt.delete(who);
    return res.status(502).json({ success: false, message: "AI review is unavailable right now. Please try again in a moment." });
  } catch (error) {
    console.error("AI code review error:", error);
    return res.status(500).json({ success: false, message: "Could not review the code." });
  }
};
