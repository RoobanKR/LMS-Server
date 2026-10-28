const express = require("express");
const router = express.Router();
const { userAuth } = require("../middlewares/userAuth");
const {
  getSummary,
  getInbox,
  openConversation,
  getMessages,
  sendMessage,
  markRead,
} = require("../controllers/peopleChat");

// Trainer ↔ student chat and batch groups (not the AI chatbot's /api/chat).
router.get("/people-chat/summary", userAuth, getSummary);
router.get("/people-chat/inbox", userAuth, getInbox);
router.post("/people-chat/open", userAuth, openConversation);
router.get("/people-chat/conversations/:id/messages", userAuth, getMessages);
router.post("/people-chat/conversations/:id/messages", userAuth, sendMessage);
router.post("/people-chat/conversations/:id/read", userAuth, markRead);

module.exports = router;
