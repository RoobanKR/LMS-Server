// ─── People chat: trainer ↔ student, one group per batch ─────────────────────
// Course Setup turns it on per course (chatSettings). Who may talk to whom is
// read from the batch roster every time, never stored:
//   • a student talks to the trainers (staff) of their own batch,
//   • a trainer talks to the students of the batches they sit in,
//   • every batch has one group; "only trainer can post" makes it an
//     announcement channel.
// No student ↔ student direct chat. A student in an active assessment can
// neither read nor send until they submit (exam lock).

const mongoose = require("mongoose");
const CourseStructure = require("../models/Courses/courseStructureModal");
const ExamSession = require("../models/Courses/moduleStructure/ExamSessionModel");
const { ChatConversation, ChatMessage } = require("../models/PeopleChatModel");
const { roleNamesOf } = require("../utils/pocScope");
const { isStudentUser } = require("../utils/batchResources");
const socketIO = require("../utils/socket");

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
  };
};

// A batch's users[] mixes students and the staff who teach it (same rule as
// the Live Dashboard), so the role decides which side of the line one is on.
const isStudentEntry = (u) => {
  if (isStudentUser(u)) return true;
  const raw = u && u.role;
  return typeof raw === "string" && raw.trim().toLowerCase() === "student";
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
        .map((e) => e.user);
      const memberIds = [...new Set(members.map(idOf))];
      const staffIds = [...new Set(members.filter((m) => !isStudentEntry(m)).map(idOf))];
      groups.push({ batchId: idOf(b), name: batchLabel(b), memberIds, staffIds });

      for (const m of members) {
        const mid = idOf(m);
        if (mid === userId) continue;
        // Across the line only: a student sees the trainers, a trainer the students.
        if (isStudentEntry(m) === student) continue;
        const row = people.get(mid) || { user: m, batchIds: [], batchNames: [] };
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
      people: settings.direct ? [...people.values()] : [],
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

const toMessage = (m, userId, staffIds) => ({
  id: idOf(m),
  conversationId: idOf(m.conversation),
  text: m.text,
  at: m.createdAt,
  senderId: idOf(m.sender),
  senderName: nameOf(m.sender),
  mine: idOf(m.sender) === userId,
  fromTrainer: staffIds ? staffIds.includes(idOf(m.sender)) : undefined,
});

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
          subtitle: student ? `${roleLabelOf(p.user)} · ${p.batchNames.join(", ")}` : p.batchNames.join(", "),
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

// GET /people-chat/conversations/:id/messages?before=<iso>
exports.getMessages = async (req, res) => {
  try {
    const access = await conversationAccess(req.user, req.params.id);
    if (access.error) return fail(res, ...access.error);
    const { conv, scope, group, peerId } = access;
    const userId = idOf(req.user);
    if (scope.student && (await lockedStudentIds([userId])).has(userId)) {
      return fail(res, 423, "Chat is paused during your assessment", { examLock: true });
    }

    const before = req.query.before ? new Date(String(req.query.before)) : null;
    const filter = { conversation: conv._id };
    if (before && !Number.isNaN(before.getTime())) filter.createdAt = { $lt: before };
    const rows = await ChatMessage.find(filter)
      .sort({ createdAt: -1 })
      .limit(PAGE_SIZE + 1)
      .populate({ path: "sender", model: "LMS-User", select: "firstName lastName email" })
      .lean();

    const hasMore = rows.length > PAGE_SIZE;
    const page = rows.slice(0, PAGE_SIZE).reverse();
    res.json({
      success: true,
      messages: page.map((m) => toMessage(m, userId, group ? group.staffIds : null)),
      hasMore,
      peerReadAt: peerId ? conv.readAt?.[peerId] || null : null,
      canPost: !(group && scope.student && scope.settings.groupTrainerOnly),
    });
  } catch (e) {
    console.error("people-chat messages:", e);
    fail(res, 500, "Could not load messages");
  }
};

// POST /people-chat/conversations/:id/messages { text }
exports.sendMessage = async (req, res) => {
  try {
    const text = String(req.body?.text || "").replace(/\s+$/, "");
    if (!text.trim()) return fail(res, 400, "Message is empty");
    if (text.length > MAX_TEXT) return fail(res, 400, `Message is longer than ${MAX_TEXT} characters`);

    const access = await conversationAccess(req.user, req.params.id);
    if (access.error) return fail(res, ...access.error);
    const { conv, scope, group, recipients } = access;
    const userId = idOf(req.user);

    if (group && scope.student && scope.settings.groupTrainerOnly) {
      return fail(res, 403, "Only trainers can post in this group");
    }
    if (scope.student && (await lockedStudentIds([userId])).has(userId)) {
      return fail(res, 423, "Chat is paused during your assessment", { examLock: true });
    }

    const now = new Date();
    const created = await ChatMessage.create({ conversation: conv._id, course: conv.course, sender: req.user._id, text });
    await ChatConversation.updateOne(
      { _id: conv._id },
      {
        $set: {
          lastMessage: { text: text.slice(0, 280), sender: req.user._id, at: now },
          lastMessageAt: now,
          [`readAt.${userId}`]: now,
        },
      }
    );

    const message = toMessage(
      { ...created.toObject(), sender: req.user },
      userId,
      group ? group.staffIds : null
    );
    const base = { conversationId: idOf(conv), courseId: idOf(conv.course), kind: conv.kind };

    // Students inside an assessment hear that something arrived, not what.
    const others = recipients.filter((id) => id !== userId);
    const locked = await lockedStudentIds(others);
    emitTo(others.filter((id) => !locked.has(id)), "chat:message", { ...base, message: { ...message, mine: false } });
    emitTo([...locked], "chat:message", { ...base, message: null });
    emitTo([userId], "chat:message", { ...base, message });

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
