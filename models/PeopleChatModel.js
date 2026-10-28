const mongoose = require("mongoose");

// ─── People chat (trainer ↔ student, batch group) ───────────────────────────
// Not the AI chatbot history (models behind /api/chat/sessions) — this is
// people talking to people inside a course.
//
// A conversation is either
//   • direct — one trainer and one student of the same batch, or
//   • group  — one per batch; who belongs is read from the batch roster at
//              the time of reading, so enrolment changes need no sync.
// `key` makes both idempotent: "d:<course>:<userA>:<userB>" (ids sorted) or
// "g:<course>:<batchId>", so opening the same chat twice never makes two.
const chatConversationSchema = new mongoose.Schema(
  {
    course: { type: mongoose.Schema.Types.ObjectId, ref: "Course-Structure", required: true, index: true },
    kind: { type: String, enum: ["direct", "group"], required: true },
    batchId: { type: String, default: "" },
    members: [{ type: mongoose.Schema.Types.ObjectId, ref: "LMS-User" }],
    key: { type: String, required: true, unique: true },
    lastMessage: {
      text: { type: String, default: "" },
      sender: { type: mongoose.Schema.Types.ObjectId, ref: "LMS-User", default: null },
      at: { type: Date, default: null },
    },
    lastMessageAt: { type: Date, default: null, index: true },
    // userId → when that user last opened the conversation. Unread = messages
    // from others after this; the peer's mark is what draws the seen ticks.
    readAt: { type: Map, of: Date, default: {} },
  },
  { timestamps: true }
);
chatConversationSchema.index({ members: 1 });

const chatMessageSchema = new mongoose.Schema(
  {
    conversation: { type: mongoose.Schema.Types.ObjectId, ref: "PeopleChatConversation", required: true },
    course: { type: mongoose.Schema.Types.ObjectId, ref: "Course-Structure" },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: "LMS-User", required: true },
    text: { type: String, required: true, maxlength: 4000 },
  },
  { timestamps: true }
);
chatMessageSchema.index({ conversation: 1, createdAt: -1 });

const ChatConversation = mongoose.model("PeopleChatConversation", chatConversationSchema);
const ChatMessage = mongoose.model("PeopleChatMessage", chatMessageSchema);

module.exports = { ChatConversation, ChatMessage };
