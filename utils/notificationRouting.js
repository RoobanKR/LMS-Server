// ─── Who a course notification is for ───────────────────────────────────────
//
// One place that answers "who should hear about this?", so each kind of
// notification reaches the people it concerns and nobody else:
//
//   A student submits / submits late   → that student's trainers
//   A student asks for a retest        → that student's trainers
//   A batch's attendance is not marked → that batch's trainers (+ L&D, cron)
//
// "That student's trainers" = the staff (any non-student role) enrolled in the
// student's batch of the course. When the batch has none, the course's other
// staff; then the exercise's creator. Only a course with nobody at all falls
// back to its OWN institution's admins / programme coordinators — never every
// admin of every institution, never a super admin.

const mongoose = require("mongoose");
const { isStudentUser } = require("./batchResources");

const ROLE_POPULATE = { path: "role", select: "originalRole renameRole roleName roleValue" };

/** The course with its roster populated (users + roles). */
async function loadCourseRoster(courseId) {
  if (!courseId || !mongoose.Types.ObjectId.isValid(String(courseId))) return null;
  const CourseStructure = require("../models/Courses/courseStructureModal");
  return CourseStructure.findById(courseId)
    .select("courseName institution batchAndParticipants")
    .populate({
      path: "batchAndParticipants.users.user",
      select: "_id email phone firstName lastName role status institution",
      populate: ROLE_POPULATE,
    })
    .lean();
}

const liveBatches = (course) =>
  (course?.batchAndParticipants || []).filter((b) => b && !b.archivedBySync);

const isActiveEnrolment = (enrolment) =>
  !enrolment?.status || enrolment.status === "active";

/** The batches (ids) a user is enrolled in on this course. */
function batchIdsOfUser(course, userId) {
  const target = String(userId || "");
  return liveBatches(course)
    .filter((b) => (b.users || []).some((u) => String(u?.user?._id || u?.user || "") === target))
    .map((b) => String(b._id));
}

/** Staff of the course — every batch, or only `batchIds` when given. */
function staffOfCourse(course, batchIds = null) {
  const wanted = batchIds ? new Set(batchIds.map(String)) : null;
  const byId = new Map();
  for (const batch of liveBatches(course)) {
    if (wanted && !wanted.has(String(batch._id))) continue;
    for (const enrolment of batch.users || []) {
      const user = enrolment?.user;
      if (!user?._id || !isActiveEnrolment(enrolment)) continue;
      if (user.status === "inactive" || isStudentUser(user)) continue;
      byId.set(String(user._id), user);
    }
  }
  return [...byId.values()];
}

/** The institution's admins / programme coordinators (last-resort audience). */
async function institutionAdmins(institutionId) {
  if (!institutionId) return [];
  const Role = require("../models/RoleModel");
  const User = require("../models/UserModel");
  const roles = await Role.find({
    institution: institutionId,
    $or: [
      { roleValue: { $in: ["admin", "programcoordinator"] } },
      { originalRole: { $regex: /^(admin|program\s*coordinator)$/i } },
    ],
  }).select("_id").lean();
  if (!roles.length) return [];
  return User.find({ institution: institutionId, role: { $in: roles.map((r) => r._id) }, status: { $ne: "inactive" } })
    .select("_id email phone firstName lastName")
    .lean();
}

/**
 * The trainers who should hear about this student's work in this course.
 * Returns { course, recipients, audience } — `audience` says which rule
 * matched ("batch" | "course" | "creator" | "admins" | "none"), for logs.
 */
async function trainersForStudent({ courseId, studentId, creatorEmail = "", course: given = null }) {
  const course = given || await loadCourseRoster(courseId);
  if (!course) return { course: null, recipients: [], audience: "none" };

  const own = staffOfCourse(course, batchIdsOfUser(course, studentId));
  if (own.length) return { course, recipients: own, audience: "batch" };

  const anyStaff = staffOfCourse(course);
  if (anyStaff.length) return { course, recipients: anyStaff, audience: "course" };

  if (creatorEmail && /@/.test(creatorEmail)) {
    const User = require("../models/UserModel");
    const creator = await User.findOne({ email: creatorEmail, institution: course.institution })
      .select("_id email phone firstName lastName role status")
      .populate(ROLE_POPULATE)
      .lean();
    if (creator && creator.status !== "inactive" && !isStudentUser(creator)) {
      return { course, recipients: [creator], audience: "creator" };
    }
  }

  const admins = await institutionAdmins(course.institution);
  return { course, recipients: admins, audience: admins.length ? "admins" : "none" };
}

/**
 * Deliver one notification to `users` on the ticked channels.
 * `channels` = { dashboard, gmail, whatsapp }; null/undefined means
 * dashboard only. Never throws — a delivery failure is logged.
 */
async function deliver(users, { notification, email, whatsappText, channels }) {
  const list = (users || []).filter((u) => u && u._id);
  if (!list.length) return { dashboard: 0, gmail: 0, whatsapp: 0 };
  const ch = channels || { dashboard: true };
  const delivered = { dashboard: 0, gmail: 0, whatsapp: 0 };

  if (ch.dashboard) {
    try {
      const User = require("../models/UserModel");
      const now = new Date();
      const res = await User.updateMany(
        { _id: { $in: list.map((u) => u._id) } },
        {
          $push: { notifications: { $each: [{ isRead: false, ...notification, createdAt: now, updatedAt: now }], $position: 0 } },
          $inc: { unreadNotificationCount: 1 },
        }
      );
      delivered.dashboard = res.modifiedCount || 0;
      if (global.io) {
        for (const u of list) global.io.to(`user-${u._id}`).emit("new-notification", { ...notification, createdAt: now.toISOString() });
      }
    } catch (err) {
      console.warn("[notify] dashboard delivery failed:", err.message);
    }
  }

  if (ch.gmail && email) {
    const { sendEmail } = require("./sendEmail");
    for (const u of list) {
      if (!u.email) continue;
      try {
        const r = await sendEmail({ receiverEmails: u.email, subject: email.subject, body: email.html });
        if (r?.success) delivered.gmail += 1;
      } catch (err) {
        console.warn("[notify] email failed for", u.email, err.message);
      }
    }
  }

  if (ch.whatsapp && whatsappText) {
    const { sendWhatsApp } = require("./sendWhatsApp");
    for (const u of list) {
      try {
        const r = await sendWhatsApp(u.phone, { text: whatsappText });
        if (r.success) delivered.whatsapp += 1;
        else if (r.skipped) break;
      } catch (err) {
        console.warn("[notify] whatsapp failed:", err.message);
      }
    }
  }
  return delivered;
}

module.exports = {
  loadCourseRoster,
  batchIdsOfUser,
  staffOfCourse,
  institutionAdmins,
  trainersForStudent,
  deliver,
};
