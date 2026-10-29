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
  uploadAttachment,
  editMessage,
  deleteMessage,
  reactMessage,
  getShared,
  getNotes,
  saveNotes,
  getMembers,
} = require("../controllers/peopleChat");

// Trainer ↔ student chat and batch groups (not the AI chatbot's /api/chat).
router.get("/people-chat/summary", userAuth, getSummary);
router.get("/people-chat/inbox", userAuth, getInbox);
router.post("/people-chat/open", userAuth, openConversation);
router.get("/people-chat/conversations/:id/messages", userAuth, getMessages);
router.post("/people-chat/conversations/:id/messages", userAuth, sendMessage);
router.post("/people-chat/conversations/:id/read", userAuth, markRead);
router.post("/people-chat/conversations/:id/attachments", userAuth, uploadAttachment);
router.get("/people-chat/conversations/:id/shared", userAuth, getShared);
router.get("/people-chat/conversations/:id/notes", userAuth, getNotes);
router.put("/people-chat/conversations/:id/notes", userAuth, saveNotes);
router.get("/people-chat/conversations/:id/members", userAuth, getMembers);
router.patch("/people-chat/messages/:id", userAuth, editMessage);
router.delete("/people-chat/messages/:id", userAuth, deleteMessage);
router.post("/people-chat/messages/:id/reactions", userAuth, reactMessage);

module.exports = router;
