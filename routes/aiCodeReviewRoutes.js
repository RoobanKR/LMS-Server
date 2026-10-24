const express = require("express");
const router = express.Router();
const userAuth = require("./authMiddleware");
const { reviewCode } = require("../controllers/aiCodeReviewController");

// The optional AI review a student asks for when submitting a programming
// answer. Signed-in users only; the Gemini key never leaves the server.
router.post("/ai/code-review", userAuth, reviewCode);

module.exports = router;
