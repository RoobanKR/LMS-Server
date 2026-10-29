// ─── People chat: trainer ↔ student, one group per batch ─────────────────────
// Course Setup turns it on per course (chatSettings). Who may talk to whom is
// read from the batch roster every time, never stored:
//   • a student talks to the trainers of their own batch (trainer role only:
//     admins, L&D, POC… in a roster are left out of chat),
//   • a trainer talks to the students of the batches they sit in,
//   • every batch has one group; "only trainer can post" makes it an
//     announcement channel,
//   • "Student ↔ Student" (off by default) lets a student message the other
//     students of their own batch.
// A student in an active assessment can neither read nor send until they
// submit (exam lock).

const mongoose = require("mongoose");
const CourseStructure = require("../models/Courses/courseStructureModal");
const ExamSession = require("../models/Courses/moduleStructure/ExamSessionModel");
const { ChatConversation, ChatMessage } = require("../models/PeopleChatModel");
const { roleNamesOf } = require("../utils/pocScope");
const { isStudentUser } = require("../utils/batchResources");
const { isTrainerRoleName } = require("../utils/courseVisibility");
const socketIO = require("../utils/socket");
const path = require("path");
const crypto = require("crypto");
const {
  storage, publicUrlFor, storagePathFromUrl, isLocalStorageUrl, sanitizePath,
} = require("../utils/storage");

const MAX_TEXT = 4000;
const PAGE_SIZE = 40;
const INACTIVE = new Set(["dropped", "suspended"]);
// An attempt left "in progress" by a crash would lock chat forever; anything
// untouched this long is not a live assessment.
const LOCK_WINDOW_MS = 4 * 60 * 60 * 1000;

const idOf = (v) => String(v?._id || v || "");
const nameOf = (u) => `${u?.firstName || ""} ${u?.lastName || ""}`.trim() || u?.email || "User";

// Defaults for a course saved before chat existed: off.
const settingsOf = (course) => {
  const s = course?.chatSettings || {};
  return {
    enabled: s.enabled === true,
    direct: s.direct !== false,
    group: s.group !== false,
    groupTrainerOnly: s.groupTrainerOnly === true,
    peers: s.peers === true,
  };
};

// A batch's users[] mixes students and the staff who teach it (same rule as
// the Live Dashboard), so the role decides which side of the line one is on.
const isStudentEntry = (u) => {
  if (isStudentUser(u)) return true;
  const raw = u && u.role;
  return typeof raw === "string" && raw.trim().toLowerCase() === "student";
};

// Of the staff in a batch (admins, L&D, POC… sit in rosters too) only the
// trainer roles chat.
const isTrainerEntry = (u) => {
  const r = u && u.role;
  if (!r || typeof r !== "object") return false;
  return [r.roleValue, r.originalRole, r.renameRole].some(isTrainerRoleName);
};

const roleLabelOf = (u) => {
  const r = u?.role;
  if (r && typeof r === "object") return r.renameRole || r.originalRole || r.roleValue || "Trainer";
  return "Trainer";
};

const batchLabel = (b) => {
  const name = String(b?.batchName || "").trim() || "Batch";
  const section = String(b?.section || "").trim();
  return section && section !== name ? `${section} · ${name}` : name;
};

const directKey = (courseId, a, b) => `d:${courseId}:${[String(a), String(b)].sort().join(":")}`;
const groupKey = (courseId, batchId) => `g:${courseId}:${batchId}`;

async function viewerIsStudent(user) {
  const names = await roleNamesOf(user);
  return names.some((n) => String(n).toLowerCase().includes("student"));
}

/** Students (of `ids`) who are inside an assessment right now. */
async function lockedStudentIds(ids) {
  const list = [...new Set((ids || []).map(String).filter(Boolean))];
  if (!list.length) return new Set();
  const sessions = await ExamSession.find({
    studentId: { $in: list },
    status: { $nin: ["submitted", "terminated"] },
    submittedAt: null,
    inProgress: true,
    updatedAt: { $gte: new Date(Date.now() - LOCK_WINDOW_MS) },
  })
    .select("studentId")
    .lean();
  return new Set(sessions.map((s) => String(s.studentId)));
}

/**
 * The chats this user may take part in, per chat-enabled course they sit in a
 * batch of. `courseId` narrows it to one course (access checks).
 */
async function chatScope(user, courseId) {
  const userId = idOf(user);
  const student = await viewerIsStudent(user);
  // Chat is for students and their trainers; any other role in a batch
  // (admin, L&D, POC…) has none.
  if (!student && !(await roleNamesOf(user)).some(isTrainerRoleName)) return [];
  const filter = { "batchAndParticipants.users.user": user._id, "chatSettings.enabled": true };
  if (courseId) filter._id = courseId;
  if (student) filter.hiddenFromLearners = { $ne: true };

  const courses = await CourseStructure.find(filter)
    .select("courseName courseCode chatSettings batchAndParticipants")
    .populate({
      path: "batchAndParticipants.users.user",
      model: "LMS-User",
      select: "firstName lastName email role",
      populate: { path: "role", model: "Role", select: "originalRole renameRole roleValue" },
    })
    .lean();

  return courses.map((course) => {
    const settings = settingsOf(course);
    const mine = (course.batchAndParticipants || []).filter(
      (b) =>
        b?.status !== "archived" &&
        (b.users || []).some((e) => idOf(e?.user) === userId && !INACTIVE.has(e?.status))
    );

    const groups = [];
    const people = new Map();
    for (const b of mine) {
      const members = (b.users || [])
        .filter((e) => e?.user?._id && !INACTIVE.has(e.status))
        .map((e) => e.user)
        .filter((m) => isStudentEntry(m) || isTrainerEntry(m));
      const memberIds = [...new Set(members.map(idOf))];
      const staffIds = [...new Set(members.filter((m) => !isStudentEntry(m)).map(idOf))];
      groups.push({ batchId: idOf(b), name: batchLabel(b), memberIds, staffIds });

      for (const m of members) {
        const mid = idOf(m);
        if (mid === userId) continue;
        // A student sees the batch's trainers (and, with Student ↔ Student, its
        // other students); a trainer sees the students.
        const sameSide = isStudentEntry(m) === student;
        if (sameSide ? !(student && settings.peers) : !settings.direct) continue;
        const row = people.get(mid) || { user: m, classmate: sameSide, batchIds: [], batchNames: [] };
        row.batchIds.push(idOf(b));
        row.batchNames.push(batchLabel(b));
        people.set(mid, row);
      }
    }

    return {
      course,
      courseId: idOf(course),
      student,
      settings,
      groups: settings.group ? groups : [],
      people: [...people.values()],
    };
  });
}

/** Unread (from others, after this user's read mark) per conversation id. */
async function unreadCounts(convs, userId) {
  const out = new Map();
  const pending = convs.filter((c) => {
    if (!c.lastMessageAt) return false;
    const seen = c.readAt?.[userId];
    return !seen || new Date(c.lastMessageAt) > new Date(seen);
  });
  if (!pending.length) return out;
  const rows = await ChatMessage.aggregate([
    {
      $match: {
        sender: { $ne: new mongoose.Types.ObjectId(userId) },
        $or: pending.map((c) => ({
          conversation: c._id,
          createdAt: { $gt: c.readAt?.[userId] ? new Date(c.readAt[userId]) : new Date(0) },
        })),
      },
    },
    { $group: { _id: "$conversation", n: { $sum: 1 } } },
  ]);
  rows.forEach((r) => out.set(String(r._id), r.n));
  return out;
}

async function loadInbox(user) {
  const userId = idOf(user);
  const scopes = await chatScope(user);
  const student = scopes.length ? scopes[0].student : await viewerIsStudent(user);
  const batchIds = scopes.flatMap((s) => s.groups.map((g) => g.batchId));
  const convs = scopes.length
    ? await ChatConversation.find({
        course: { $in: scopes.map((s) => s.course._id) },
        $or: [
          { kind: "direct", members: user._id },
          { kind: "group", batchId: { $in: batchIds } },
        ],
      }).lean()
    : [];
  const unread = await unreadCounts(convs, userId);
  const locked = student ? (await lockedStudentIds([userId])).has(userId) : false;
  return { userId, student, scopes, convs, unread, locked };
}

const emitTo = (ids, event, payload) => {
  let io;
  try {
    io = socketIO.getIO();
  } catch {
    return;
  }
  for (const id of new Set((ids || []).map(String).filter(Boolean))) {
    io.to(`user-${id}`).emit(event, payload);
  }
};

// Who has the LMS open right now: every signed-in page holds the shared
// socket, which joins the user's own room on connect.
const onlineIds = (ids) => {
  let io;
  try {
    io = socketIO.getIO();
  } catch {
    return new Set();
  }
  const rooms = io.sockets.adapter.rooms;
  return new Set((ids || []).map(String).filter((id) => rooms.has(`user-${id}`)));
};

const fail = (res, status, message, extra = {}) =>
  res.status(status).json({ success: false, message, ...extra });

/** The conversation, if this user may be in it, with who should hear of a send. */
async function conversationAccess(user, conversationId) {
  if (!mongoose.isValidObjectId(conversationId)) return { error: [400, "Invalid conversation"] };
  const conv = await ChatConversation.findById(conversationId).lean();
  if (!conv) return { error: [404, "Conversation not found"] };
  const [scope] = await chatScope(user, conv.course);
  if (!scope) return { error: [403, "Chat is not available for this course"] };
  const userId = idOf(user);

  if (conv.kind === "group") {
    const group = scope.groups.find((g) => g.batchId === conv.batchId);
    if (!group) return { error: [403, "You are not in this group"] };
    return { conv, scope, group, recipients: group.memberIds, peerId: null };
  }

  const memberIds = (conv.members || []).map(idOf);
  const peerId = memberIds.find((m) => m !== userId) || "";
  if (!memberIds.includes(userId) || !scope.people.some((p) => idOf(p.user) === peerId)) {
    return { error: [403, "You cannot chat with this person"] };
  }
  return { conv, scope, group: null, recipients: [userId, peerId], peerId };
}

/** Access plus the exam lock — every per-conversation call starts here. */
async function guard(req, res, conversationId) {
  const access = await conversationAccess(req.user, conversationId);
  if (access.error) {
    fail(res, ...access.error);
    return null;
  }
  const userId = idOf(req.user);
  if (access.scope.student && (await lockedStudentIds([userId])).has(userId)) {
    fail(res, 423, "Chat is paused during your assessment", { examLock: true });
    return null;
  }
  return { ...access, userId };
}

const canPostIn = (access) => !(access.group && access.scope.student && access.scope.settings.groupTrainerOnly);

// Reactions offered on a message (the composer's emoji picker is free text).
const REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏", "🎉", "✅"];
const MAX_ATTACHMENTS = 10;
const MAX_FILE_BYTES = 25 * 1024 * 1024;
// Files served back from the API origin: no html/svg/xml, which a browser
// would run there.
const FILE_TYPES = new Set([
  "jpg", "jpeg", "png", "gif", "webp", "bmp",
  "pdf", "doc", "docx", "xls", "xlsx", "csv", "ppt", "pptx", "txt", "md", "rtf", "odt", "ods", "odp",
  "zip", "rar", "7z",
  "java", "py", "c", "cpp", "h", "hpp", "cs", "js", "jsx", "ts", "tsx", "json", "sql", "css", "ipynb", "go", "kt", "rb", "php",
  "mp3", "mp4", "webm",
]);
const chatFolder = (conv) => `people-chat/${idOf(conv)}/`;
const URL_RE = /https?:\/\/[^\s<>"'`)\]]+/g;

const groupReactions = (list) => {
  const by = new Map();
  for (const r of list || []) {
    if (!by.has(r.emoji)) by.set(r.emoji, []);
    by.get(r.emoji).push(idOf(r.user));
  }
  return [...by.entries()].map(([emoji, userIds]) => ({ emoji, userIds }));
};

const previewOf = (m) => (m.text || "").slice(0, 280) || (m.attachments?.length ? `📎 ${m.attachments[0].name}` : "");

const toMessage = (m, userId, staffIds) => {
  const deleted = Boolean(m.deletedAt);
  return {
    id: idOf(m),
    conversationId: idOf(m.conversation),
    text: deleted ? "" : m.text || "",
    at: m.createdAt,
    senderId: idOf(m.sender),
    senderName: nameOf(m.sender),
    mine: idOf(m.sender) === userId,
    fromTrainer: staffIds ? staffIds.includes(idOf(m.sender)) : undefined,
    attachments: deleted ? [] : (m.attachments || []).map(({ name, url, size, mime }) => ({ name, url, size, mime })),
    replyTo: !deleted && m.replyTo?.id
      ? { id: idOf(m.replyTo.id), senderName: m.replyTo.senderName || "", text: m.replyTo.text || "" }
      : null,
    mentions: deleted ? [] : (m.mentions || []).map((u) => ({ id: idOf(u), name: u?.firstName || u?.lastName ? nameOf(u) : "" })),
    reactions: deleted ? [] : groupReactions(m.reactions),
    edited: Boolean(m.editedAt) && !deleted,
    deleted,
  };
};

const populateMessage = (q) =>
  q
    .populate({ path: "sender", model: "LMS-User", select: "firstName lastName email" })
    .populate({ path: "mentions", model: "LMS-User", select: "firstName lastName" });

/** Tell everyone in the conversation; a student in an assessment hears that
 *  something arrived (new messages), not what. */
async function broadcast(access, event, message) {
  const base = { conversationId: idOf(access.conv), courseId: idOf(access.conv.course), kind: access.conv.kind };
  const locked = await lockedStudentIds(access.recipients);
  emitTo(access.recipients.filter((id) => !locked.has(id)), event, { ...base, message: message && { ...message, mine: false } });
  if (event === "chat:message") emitTo([...locked], event, { ...base, message: null });
}

/** The message `id` with the caller's access to its conversation. */
async function messageAccess(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    fail(res, 400, "Invalid message");
    return null;
  }
  const msg = await ChatMessage.findById(req.params.id).lean();
  if (!msg) {
    fail(res, 404, "Message not found");
    return null;
  }
  const access = await guard(req, res, idOf(msg.conversation));
  return access ? { ...access, msg } : null;
}

async function reloadMessage(id, access) {
  const m = await populateMessage(ChatMessage.findById(id)).lean();
  return toMessage(m, access.userId, access.group ? access.group.staffIds : null);
}

// GET /people-chat/summary — sidebar: is chat on for me, and how many unread.
exports.getSummary = async (req, res) => {
  try {
    const { scopes, unread, locked, student } = await loadInbox(req.user);
    const enabled = scopes.some((s) => s.groups.length || s.people.length);
    let total = 0;
    unread.forEach((n) => (total += n));
    res.json({ success: true, enabled, unread: total, examLock: locked, role: student ? "student" : "trainer" });
  } catch (e) {
    console.error("people-chat summary:", e);
    fail(res, 500, "Could not load chat");
  }
};

// GET /people-chat/inbox — every chat this user may open, newest first.
exports.getInbox = async (req, res) => {
  try {
    const { userId, student, scopes, convs, unread, locked } = await loadInbox(req.user);
    const online = onlineIds(scopes.flatMap((s) => s.people.map((p) => idOf(p.user))));
    const threads = [];
    const preview = (conv) =>
      conv?.lastMessage?.text
        ? { text: conv.lastMessage.text.slice(0, 140), at: conv.lastMessage.at, mine: idOf(conv.lastMessage.sender) === userId }
        : null;

    for (const s of scopes) {
      for (const g of s.groups) {
        const conv = convs.find((c) => c.kind === "group" && idOf(c.course) === s.courseId && c.batchId === g.batchId);
        threads.push({
          key: groupKey(s.courseId, g.batchId),
          id: conv ? idOf(conv) : null,
          kind: "group",
          courseId: s.courseId,
          courseName: s.course.courseName || "",
          batchId: g.batchId,
          title: `${g.name} group`,
          subtitle: `${g.memberIds.length} members`,
          trainerOnly: s.settings.groupTrainerOnly,
          canPost: !(student && s.settings.groupTrainerOnly),
          unread: conv ? unread.get(idOf(conv)) || 0 : 0,
          lastMessage: preview(conv),
          lastAt: conv?.lastMessageAt || null,
        });
      }
      for (const p of s.people) {
        const peerId = idOf(p.user);
        const conv = convs.find(
          (c) => c.kind === "direct" && idOf(c.course) === s.courseId && (c.members || []).some((m) => idOf(m) === peerId)
        );
        threads.push({
          key: directKey(s.courseId, userId, peerId),
          id: conv ? idOf(conv) : null,
          kind: "direct",
          courseId: s.courseId,
          courseName: s.course.courseName || "",
          peerId,
          title: nameOf(p.user),
          subtitle: student && !p.classmate ? `${roleLabelOf(p.user)} · ${p.batchNames.join(", ")}` : p.batchNames.join(", "),
          peerRole: p.classmate || !student ? "student" : "trainer",
          email: p.user.email || "",
          online: online.has(peerId),
          batchIds: p.batchIds,
          canPost: true,
          unread: conv ? unread.get(idOf(conv)) || 0 : 0,
          lastMessage: preview(conv),
          lastAt: conv?.lastMessageAt || null,
        });
      }
    }

    res.json({ success: true, role: student ? "student" : "trainer", examLock: locked, threads });
  } catch (e) {
    console.error("people-chat inbox:", e);
    fail(res, 500, "Could not load chats");
  }
};

// POST /people-chat/open { courseId, kind, peerId | batchId } — get or create.
exports.openConversation = async (req, res) => {
  try {
    const { courseId, kind, peerId, batchId } = req.body || {};
    if (!mongoose.isValidObjectId(courseId)) return fail(res, 400, "Invalid course");
    const [scope] = await chatScope(req.user, courseId);
    if (!scope) return fail(res, 403, "Chat is not available for this course");
    const userId = idOf(req.user);

    let key;
    let doc;
    if (kind === "group") {
      const group = scope.groups.find((g) => g.batchId === String(batchId || ""));
      if (!group) return fail(res, 403, "You are not in this group");
      key = groupKey(scope.courseId, group.batchId);
      doc = { course: scope.course._id, kind: "group", batchId: group.batchId, members: [] };
    } else {
      const peer = scope.people.find((p) => idOf(p.user) === String(peerId || ""));
      if (!peer) return fail(res, 403, "You cannot chat with this person");
      key = directKey(scope.courseId, userId, idOf(peer.user));
      doc = { course: scope.course._id, kind: "direct", batchId: "", members: [req.user._id, peer.user._id] };
    }

    let conv;
    try {
      conv = await ChatConversation.findOneAndUpdate({ key }, { $setOnInsert: doc }, { upsert: true, new: true }).lean();
    } catch (e) {
      // Two first opens at once: the loser of the unique key reads the winner's.
      if (e?.code !== 11000) throw e;
      conv = await ChatConversation.findOne({ key }).lean();
    }
    res.json({ success: true, conversationId: idOf(conv) });
  } catch (e) {
    console.error("people-chat open:", e);
    fail(res, 500, "Could not open chat");
  }
};

// GET /people-chat/conversations/:id/messages?before=<iso>   (a page, oldest first)
// GET /people-chat/conversations/:id/messages?q=<text>        (search, newest first)
exports.getMessages = async (req, res) => {
  try {
    const access = await guard(req, res, req.params.id);
    if (!access) return;
    const { conv, group, peerId, userId } = access;
    const staffIds = group ? group.staffIds : null;

    const q = String(req.query.q || "").trim().slice(0, 100);
    if (q) {
      const rows = await populateMessage(
        ChatMessage.find({
          conversation: conv._id,
          deletedAt: null,
          text: new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"),
        })
          .sort({ createdAt: -1 })
          .limit(50)
      ).lean();
      return res.json({ success: true, messages: rows.map((m) => toMessage(m, userId, staffIds)) });
    }

    const before = req.query.before ? new Date(String(req.query.before)) : null;
    const filter = { conversation: conv._id };
    if (before && !Number.isNaN(before.getTime())) filter.createdAt = { $lt: before };
    const rows = await populateMessage(ChatMessage.find(filter).sort({ createdAt: -1 }).limit(PAGE_SIZE + 1)).lean();

    const hasMore = rows.length > PAGE_SIZE;
    const page = rows.slice(0, PAGE_SIZE).reverse();
    res.json({
      success: true,
      messages: page.map((m) => toMessage(m, userId, staffIds)),
      hasMore,
      peerReadAt: peerId ? conv.readAt?.[peerId] || null : null,
      canPost: canPostIn(access),
      canModerate: Boolean(group) && !access.scope.student,
    });
  } catch (e) {
    console.error("people-chat messages:", e);
    fail(res, 500, "Could not load messages");
  }
};

// POST /people-chat/conversations/:id/messages
//   { text, attachments?: [{ name, url, size, mime }], replyTo?: messageId, mentions?: [userId] }
exports.sendMessage = async (req, res) => {
  try {
    const text = String(req.body?.text || "").replace(/\s+$/, "");
    if (text.length > MAX_TEXT) return fail(res, 400, `Message is longer than ${MAX_TEXT} characters`);

    const access = await guard(req, res, req.params.id);
    if (!access) return;
    const { conv, group, userId } = access;
    if (!canPostIn(access)) return fail(res, 403, "Only trainers can post in this group");

    // Only files uploaded to this conversation's folder; the URL is rebuilt
    // from the stored path, never taken as sent.
    const folder = chatFolder(conv);
    const attachments = [];
    for (const a of Array.isArray(req.body?.attachments) ? req.body.attachments.slice(0, MAX_ATTACHMENTS) : []) {
      const objectPath = isLocalStorageUrl(a?.url) ? storagePathFromUrl(a.url) : "";
      if (!objectPath.startsWith(folder)) return fail(res, 400, "A file was not uploaded to this chat");
      attachments.push({
        name: String(a.name || objectPath.split("/").pop()).slice(0, 200),
        url: publicUrlFor(objectPath),
        size: Math.max(0, Number(a.size) || 0),
        mime: String(a.mime || "").slice(0, 120),
      });
    }
    if (!text.trim() && !attachments.length) return fail(res, 400, "Message is empty");

    let replyTo;
    if (req.body?.replyTo && mongoose.isValidObjectId(req.body.replyTo)) {
      const orig = await ChatMessage.findOne({ _id: req.body.replyTo, conversation: conv._id })
        .populate({ path: "sender", model: "LMS-User", select: "firstName lastName email" })
        .lean();
      if (orig && !orig.deletedAt) {
        replyTo = { id: orig._id, senderName: nameOf(orig.sender), text: previewOf(orig).slice(0, 200) };
      }
    }

    // Mentions: only people of this conversation, never yourself.
    const allowed = new Set(access.recipients.filter((id) => id !== userId));
    const mentions = [...new Set((Array.isArray(req.body?.mentions) ? req.body.mentions : []).map(String))]
      .filter((id) => allowed.has(id))
      .slice(0, 50);

    const now = new Date();
    const created = await ChatMessage.create({
      conversation: conv._id,
      course: conv.course,
      sender: req.user._id,
      text,
      attachments,
      ...(replyTo ? { replyTo } : {}),
      mentions,
    });
    await ChatConversation.updateOne(
      { _id: conv._id },
      {
        $set: {
          lastMessage: { text: previewOf(created), sender: req.user._id, at: now },
          lastMessageAt: now,
          [`readAt.${userId}`]: now,
        },
      }
    );

    const message = await reloadMessage(created._id, access);
    await broadcast(access, "chat:message", message);
    res.status(201).json({ success: true, message });
  } catch (e) {
    console.error("people-chat send:", e);
    fail(res, 500, "Could not send message");
  }
};

// POST /people-chat/conversations/:id/read — draws the peer's seen ticks.
exports.markRead = async (req, res) => {
  try {
    const access = await conversationAccess(req.user, req.params.id);
    if (access.error) return fail(res, ...access.error);
    const { conv, peerId } = access;
    const userId = idOf(req.user);
    const now = new Date();
    await ChatConversation.updateOne({ _id: conv._id }, { $set: { [`readAt.${userId}`]: now } });
    const payload = { conversationId: idOf(conv), userId, at: now };
    emitTo(peerId ? [userId, peerId] : [userId], "chat:read", payload);
    res.json({ success: true, at: now });
  } catch (e) {
    console.error("people-chat read:", e);
    fail(res, 500, "Could not update chat");
  }
};

// POST /people-chat/conversations/:id/attachments  (multipart "file") — one
// file into the conversation's folder; the send that follows carries it.
exports.uploadAttachment = async (req, res) => {
  try {
    const access = await guard(req, res, req.params.id);
    if (!access) return;
    if (!canPostIn(access)) return fail(res, 403, "Only trainers can post in this group");
    const file = req.files && req.files.file;
    if (!file || Array.isArray(file)) return fail(res, 400, "Choose a file to share");
    if (file.size > MAX_FILE_BYTES) return fail(res, 413, "Files up to 25 MB can be shared");
    const ext = path.extname(file.name || "").slice(1).toLowerCase();
    if (!FILE_TYPES.has(ext)) return fail(res, 415, `.${ext || "?"} files can't be shared here`);

    const safe = sanitizePath(file.name).split("/").pop() || `file.${ext}`;
    const objectPath = `${chatFolder(access.conv)}${Date.now().toString(36)}${crypto.randomBytes(3).toString("hex")}-${safe}`;
    const { data, error } = await storage.from().upload(objectPath, file.data);
    if (error) throw error;
    res.status(201).json({
      success: true,
      attachment: { name: String(file.name).slice(0, 200), url: data.publicUrl, size: file.size, mime: file.mimetype || "" },
    });
  } catch (e) {
    console.error("people-chat upload:", e);
    fail(res, 500, "Could not upload the file");
  }
};

// PATCH /people-chat/messages/:id { text } — your own message.
exports.editMessage = async (req, res) => {
  try {
    const access = await messageAccess(req, res);
    if (!access) return;
    const { msg, userId, conv } = access;
    if (idOf(msg.sender) !== userId) return fail(res, 403, "You can edit only your own messages");
    if (msg.deletedAt) return fail(res, 400, "This message was deleted");
    const text = String(req.body?.text || "").replace(/\s+$/, "");
    if (text.length > MAX_TEXT) return fail(res, 400, `Message is longer than ${MAX_TEXT} characters`);
    if (!text.trim() && !(msg.attachments || []).length) return fail(res, 400, "Message is empty");

    await ChatMessage.updateOne({ _id: msg._id }, { $set: { text, editedAt: new Date() } });
    if (conv.lastMessageAt && new Date(conv.lastMessageAt).getTime() === new Date(msg.createdAt).getTime()) {
      await ChatConversation.updateOne({ _id: conv._id }, { $set: { "lastMessage.text": previewOf({ ...msg, text }) } });
    }
    const message = await reloadMessage(msg._id, access);
    await broadcast(access, "chat:update", message);
    res.json({ success: true, message });
  } catch (e) {
    console.error("people-chat edit:", e);
    fail(res, 500, "Could not edit the message");
  }
};

// DELETE /people-chat/messages/:id — your own; a trainer may remove any
// message in their batch group.
exports.deleteMessage = async (req, res) => {
  try {
    const access = await messageAccess(req, res);
    if (!access) return;
    const { msg, userId, conv, group, scope } = access;
    const moderator = Boolean(group) && !scope.student;
    if (idOf(msg.sender) !== userId && !moderator) return fail(res, 403, "You can delete only your own messages");
    if (msg.deletedAt) return res.json({ success: true });

    await ChatMessage.updateOne(
      { _id: msg._id },
      { $set: { deletedAt: new Date(), text: "", attachments: [], mentions: [], reactions: [] } }
    );
    // Its files go too.
    const paths = (msg.attachments || []).map((a) => storagePathFromUrl(a.url)).filter((p) => p.startsWith(chatFolder(conv)));
    if (paths.length) storage.from().remove(paths).catch(() => {});
    if (conv.lastMessageAt && new Date(conv.lastMessageAt).getTime() === new Date(msg.createdAt).getTime()) {
      await ChatConversation.updateOne({ _id: conv._id }, { $set: { "lastMessage.text": "Message deleted" } });
    }
    const message = await reloadMessage(msg._id, access);
    await broadcast(access, "chat:update", message);
    res.json({ success: true, message });
  } catch (e) {
    console.error("people-chat delete:", e);
    fail(res, 500, "Could not delete the message");
  }
};

// POST /people-chat/messages/:id/reactions { emoji } — toggles yours.
exports.reactMessage = async (req, res) => {
  try {
    const emoji = String(req.body?.emoji || "");
    if (!REACTIONS.includes(emoji)) return fail(res, 400, "Unknown reaction");
    const access = await messageAccess(req, res);
    if (!access) return;
    const { msg, userId } = access;
    if (msg.deletedAt) return fail(res, 400, "This message was deleted");
    const mine = (msg.reactions || []).some((r) => r.emoji === emoji && idOf(r.user) === userId);
    await ChatMessage.updateOne(
      { _id: msg._id },
      mine
        ? { $pull: { reactions: { emoji, user: req.user._id } } }
        : { $push: { reactions: { emoji, user: req.user._id } } }
    );
    const message = await reloadMessage(msg._id, access);
    await broadcast(access, "chat:update", message);
    res.json({ success: true, message });
  } catch (e) {
    console.error("people-chat react:", e);
    fail(res, 500, "Could not react");
  }
};

// GET /people-chat/conversations/:id/shared — the Shared tab: files and links.
exports.getShared = async (req, res) => {
  try {
    const access = await guard(req, res, req.params.id);
    if (!access) return;
    const rows = await ChatMessage.find({
      conversation: access.conv._id,
      deletedAt: null,
      $or: [{ "attachments.0": { $exists: true } }, { text: /https?:\/\//i }],
    })
      .sort({ createdAt: -1 })
      .limit(500)
      .populate({ path: "sender", model: "LMS-User", select: "firstName lastName email" })
      .lean();

    const files = [];
    const links = [];
    for (const m of rows) {
      const base = { messageId: idOf(m), at: m.createdAt, senderName: nameOf(m.sender) };
      (m.attachments || []).forEach((a) => files.push({ ...base, name: a.name, url: a.url, size: a.size || 0, mime: a.mime || "" }));
      const seen = new Set();
      for (const url of (m.text || "").match(URL_RE) || []) {
        const clean = url.replace(/[.,;:!?]+$/, "");
        if (seen.has(clean)) continue;
        seen.add(clean);
        links.push({ ...base, url: clean });
      }
    }
    res.json({ success: true, files, links });
  } catch (e) {
    console.error("people-chat shared:", e);
    fail(res, 500, "Could not load shared files");
  }
};

const notesOf = async (conv, access) => {
  const by = conv.notes?.updatedBy
    ? await mongoose.model("LMS-User").findById(conv.notes.updatedBy).select("firstName lastName email").lean()
    : null;
  return {
    text: conv.notes?.text || "",
    updatedAt: conv.notes?.updatedAt || null,
    updatedBy: by ? nameOf(by) : "",
    canEdit: conv.kind === "direct" || !access.scope.student,
  };
};

// GET /people-chat/conversations/:id/notes
exports.getNotes = async (req, res) => {
  try {
    const access = await guard(req, res, req.params.id);
    if (!access) return;
    res.json({ success: true, notes: await notesOf(access.conv, access) });
  } catch (e) {
    console.error("people-chat notes:", e);
    fail(res, 500, "Could not load notes");
  }
};

// PUT /people-chat/conversations/:id/notes { text } — trainers edit a group's
// notes; both people edit a direct chat's.
exports.saveNotes = async (req, res) => {
  try {
    const access = await guard(req, res, req.params.id);
    if (!access) return;
    if (!(access.conv.kind === "direct" || !access.scope.student)) return fail(res, 403, "Only trainers can edit these notes");
    const text = String(req.body?.text ?? "");
    if (text.length > 20000) return fail(res, 400, "Notes are longer than 20000 characters");
    const conv = await ChatConversation.findByIdAndUpdate(
      access.conv._id,
      { $set: { notes: { text, updatedBy: req.user._id, updatedAt: new Date() } } },
      { new: true }
    ).lean();
    const notes = await notesOf(conv, access);
    emitTo(access.recipients, "chat:notes", { conversationId: idOf(conv) });
    res.json({ success: true, notes });
  } catch (e) {
    console.error("people-chat notes save:", e);
    fail(res, 500, "Could not save notes");
  }
};

// GET /people-chat/conversations/:id/members — the People list.
exports.getMembers = async (req, res) => {
  try {
    const access = await guard(req, res, req.params.id);
    if (!access) return;
    const ids = access.recipients;
    const users = await mongoose
      .model("LMS-User")
      .find({ _id: { $in: ids } })
      .select("firstName lastName email role")
      .populate({ path: "role", model: "Role", select: "originalRole renameRole roleValue" })
      .lean();
    const online = onlineIds(ids);
    const members = users
      .map((u) => ({
        id: idOf(u),
        name: nameOf(u),
        role: isStudentEntry(u) ? "student" : "trainer",
        online: online.has(idOf(u)),
        me: idOf(u) === access.userId,
      }))
      .sort((a, b) => (a.role === b.role ? a.name.localeCompare(b.name) : a.role === "trainer" ? -1 : 1));
    res.json({ success: true, members });
  } catch (e) {
    console.error("people-chat members:", e);
    fail(res, 500, "Could not load people");
  }
};
