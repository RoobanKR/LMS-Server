// Daily missing-attendance check for the L&D console.
//
// Every day at ATTENDANCE_CHECK_CRON (default 18:00) in ATTENDANCE_TZ (default
// Asia/Kolkata), each batch that had a training day TODAY but has no attendance
// marked for it raises one in-app notification to the batch's own trainers
// (the staff enrolled in that batch — they are the ones who mark it) and to
// every active L&D Head / Sub Head of that course's institution.
//
// "A training day" is exactly what the marking gate and the attendance
// overview use (controllers/courses/attendance.js): inside the batch's Program
// Calendar window (start → deviation-adjusted end), Mon–Sat, not a full
// holiday — plus not cancelled for that batch by a calendar deviation, and the
// batch has at least one student. A batch whose end cannot be computed yet (no
// pedagogy hours / session template) is skipped rather than flagged forever.
//
// Not run at startup on purpose: nodemon restarts the API on every server/
// edit, and a mid-day restart must not report a day that is still in progress.
// Idempotent per (day, course, batch): re-running the same day never adds a
// second notification for the same batch.

const cron = require("node-cron");
const mongoose = require("mongoose");
const CourseStructure = require("../models/Courses/courseStructureModal");
const StudentAttendance = require("../models/Courses/StudentAttendanceModel");
const ProgramCalendar = require("../models/Courses/ProgramCalendarModel");
const PedagogyView = require("../models/Courses/moduleStructure/pedagogyViewModal");
const InstituteHolidayCalendar = require("../models/InstituteHolidayCalendarModel");
const User = require("../models/UserModel");
const Role = require("../models/RoleModel");
const { calendarKeysFor, pickCalendar } = require("../utils/calendarGroups");
const { _windowHelpers } = require("../controllers/courses/attendance");

const { computeWindow, holidayMapOf, pedagogyDurationsOf } = _windowHelpers;

const TIMEZONE = process.env.ATTENDANCE_TZ || "Asia/Kolkata";
const SCHEDULE = process.env.ATTENDANCE_CHECK_CRON || "0 18 * * *";
const KIND = "attendance_missing";

// Today's calendar day (YYYY-MM-DD) in the check's time zone — the day a
// trainer would have marked, not the server's UTC day.
const todayKey = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" })
    .format(new Date());

const roleIdsByValue = async (institution, values) =>
  (await Role.find({ institution, roleValue: { $in: values } }).select("_id").lean()).map((r) => r._id);

// Batches of `institution` whose attendance is missing on `dayKey`.
const findMissingBatches = async (institution, dayKey) => {
  const courses = await CourseStructure.find({ institution })
    .select("courseName clientName clientId institution batchAndParticipants programCalendarByBatch coursePath")
    .lean();
  if (!courses.length) return [];
  const courseIds = courses.map((c) => c._id);

  // Students per batch — a batch with nobody to mark is never "missing".
  const studentRoleIds = new Set((await Role.find({
    institution,
    $or: [{ roleValue: "student" }, { originalRole: /^student$/i }, { renameRole: /^student$/i }],
  }).select("_id").lean()).map((r) => String(r._id)));
  const memberIds = new Set();
  courses.forEach((c) => (c.batchAndParticipants || []).forEach((b) =>
    (b.users || []).forEach((u) => { const id = u?.user?._id || u?.user; if (id) memberIds.add(String(id)); })));
  const members = memberIds.size
    ? await User.find({ _id: { $in: [...memberIds] } }).select("role").lean()
    : [];
  const isStudent = new Map(members.map((u) => {
    const raw = String(u.role || "");
    return [String(u._id), studentRoleIds.has(raw) || raw.toLowerCase() === "student"];
  }));

  const day = new Date(`${dayKey}T00:00:00Z`);
  const marks = await StudentAttendance.aggregate([
    { $match: { date: day, courseId: { $in: courseIds } } },
    { $group: { _id: { c: "$courseId", b: "$batchId" } } },
  ]);
  const marked = new Set(marks.map((m) => `${m._id.c}::${m._id.b || ""}`));

  const calendars = await ProgramCalendar.find({ courseId: { $in: courseIds } }).lean();
  const calendarsByCourse = new Map();
  calendars.forEach((cal) => {
    const k = String(cal.courseId);
    if (!calendarsByCourse.has(k)) calendarsByCourse.set(k, []);
    calendarsByCourse.get(k).push(cal);
  });
  const hourAgg = await PedagogyView.aggregate([
    { $match: { courses: { $in: courseIds } } },
    { $unwind: "$pedagogies" },
    { $project: { courses: 1, t: { $add: [
      pedagogyDurationsOf("$pedagogies.iDo"),
      pedagogyDurationsOf("$pedagogies.weDo"),
      pedagogyDurationsOf("$pedagogies.youDo"),
    ] } } },
    { $group: { _id: "$courses", total: { $sum: "$t" } } },
  ]);
  const hoursByCourse = new Map(hourAgg.map((h) => [String(h._id), h.total || 0]));
  const inst = String(institution);
  const holidayDocs = await InstituteHolidayCalendar.find({
    instituteId: { $in: [inst, ...courses.filter((c) => c.clientId).map((c) => `${inst}__client__${c.clientId}`)] },
  }).lean();
  const docsByScope = new Map(holidayDocs.map((d) => [String(d.instituteId), d]));

  const weekday = new Date(`${dayKey}T00:00:00Z`).getUTCDay();
  if (weekday === 0) return []; // Sunday is never a training day.

  const missing = [];
  for (const c of courses) {
    // A course-level (pre-batch) mark for today counts as the course marked.
    if (marked.has(`${c._id}::`)) continue;
    const scopeDocs = [docsByScope.get(inst), c.clientId && docsByScope.get(`${inst}__client__${c.clientId}`)].filter(Boolean);
    const holidays = holidayMapOf(scopeDocs);
    if (holidays.get(dayKey) === "full") continue;
    const courseCalendars = calendarsByCourse.get(String(c._id)) || [];
    const common = [...courseCalendars].reverse().find((cal) => !cal.groupKey) || null;
    const hours = hoursByCourse.get(String(c._id)) || 0;

    for (const b of c.batchAndParticipants || []) {
      const batchId = String(b._id);
      if (marked.has(`${c._id}::${batchId}`)) continue;
      if (!(b.users || []).some((u) => isStudent.get(String(u?.user?._id || u?.user)))) continue;
      const cal = pickCalendar(courseCalendars, calendarKeysFor(c, batchId).filter(Boolean)) || common;
      const w = computeWindow(cal, hours, holidays);
      if (!w.exists) continue;
      const end = w.endFor(batchId);
      if (!end || dayKey < w.startDate || dayKey > end) continue;
      const cancelled = (cal.deviations || []).some((dv) => dv.date === dayKey &&
        (!(dv.appliesTo && dv.appliesTo.length) || dv.appliesTo.includes(batchId)));
      if (cancelled) continue;
      missing.push({
        courseId: String(c._id),
        courseName: c.courseName || "Course",
        clientName: c.clientName || "",
        batchId,
        batchName: b.batchName || "Batch",
        // The batch's staff (every enrolled non-student) — its trainers.
        trainerIds: [...new Set((b.users || [])
          .filter((u) => (!u?.status || u.status === "active"))
          .map((u) => String(u?.user?._id || u?.user || ""))
          .filter((id) => id && isStudent.has(id) && !isStudent.get(id)))],
      });
    }
  }
  return missing;
};

/** One user's notifications for `items` (missing batches), deduped per day. */
const notifyMissing = async (userId, items, dayKey, { fromLdc }) => {
  const user = await User.findById(userId);
  if (!user || user.status === "inactive" || typeof user.addNotification !== "function") return;
  // Idempotent per (day, course, batch).
  const sent = new Set((user.notifications || [])
    .map((n) => (n.metadata && (n.metadata.get ? n.metadata.get("dedupeKey") : n.metadata.dedupeKey)) || "")
    .filter((k) => k.startsWith(`${KIND}:${dayKey}:`)));
  for (const m of items) {
    const dedupeKey = `${KIND}:${dayKey}:${m.courseId}:${m.batchId}`;
    if (sent.has(dedupeKey)) continue;
    try {
      await user.addNotification({
        title: "Attendance not marked",
        message: `${m.batchName} of ${m.courseName}${m.clientName ? ` (${m.clientName})` : ""} has no attendance marked for ${dayKey}.`,
        type: "warning",
        relatedEntity: "course",
        relatedEntityId: m.courseId,
        metadata: new Map([
          ["kind", KIND],
          ["dedupeKey", dedupeKey],
          ["courseId", m.courseId],
          ["batchId", m.batchId],
          ["date", dayKey],
          ["redirectUrl", `/lms/pages/attendancemanagement?courseId=${m.courseId}&date=${dayKey}${fromLdc ? "&from=ldc" : ""}`],
        ]),
      });
    } catch (err) {
      console.warn("attendanceMissingNotify: notify failed for", String(userId), err.message);
    }
  }
};

/**
 * Run the check for one day. `dryRun` returns what would be sent without
 * writing anything. Returns [{ institution, recipients, trainers, missing[] }].
 */
const runAttendanceMissingCheck = async ({ dayKey = todayKey(), dryRun = false } = {}) => {
  // Every institution that has courses: a batch's trainers are told even where
  // no L&D Head exists.
  const institutions = (await CourseStructure.distinct("institution")).map(String).filter(Boolean);
  const report = [];

  for (const institution of institutions) {
    const roleIds = await roleIdsByValue(institution, ["ldhead", "subhead"]);
    const recipients = roleIds.length
      ? await User.find({ institution, role: { $in: roleIds }, status: { $ne: "inactive" } }).select("_id email").lean()
      : [];
    const missing = await findMissingBatches(new mongoose.Types.ObjectId(institution), dayKey);
    const byTrainer = new Map();
    for (const m of missing) {
      for (const id of m.trainerIds || []) {
        if (!byTrainer.has(id)) byTrainer.set(id, []);
        byTrainer.get(id).push(m);
      }
    }
    report.push({ institution, recipients: recipients.map((r) => r.email), trainers: byTrainer.size, missing });
    if (dryRun || !missing.length) continue;

    // L&D: every missing batch of the institution. Trainers: their own only.
    for (const r of recipients) await notifyMissing(r._id, missing, dayKey, { fromLdc: true });
    for (const [trainerId, items] of byTrainer) await notifyMissing(trainerId, items, dayKey, { fromLdc: false });
  }
  return report;
};

const startAttendanceMissingCron = () => {
  cron.schedule(SCHEDULE, async () => {
    try {
      const report = await runAttendanceMissingCheck();
      const total = report.reduce((n, r) => n + r.missing.length, 0);
      if (total) console.log(`📋 Missing attendance: ${total} batch(es) reported to trainers and L&D`);
    } catch (error) {
      console.error("❌ Missing-attendance check failed:", error);
    }
  }, { timezone: TIMEZONE });
};

module.exports = { runAttendanceMissingCheck, startAttendanceMissingCron, findMissingBatches };
