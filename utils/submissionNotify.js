// ─── "Student submitted" — the grader notification ──────────────────────────
//
// The Notifications step of the exercise editor (We Do and You Do alike) has
// "Notify Graders about Submissions" and "Notify Graders about Late
// Submissions", each with Dashboard / Gmail / WhatsApp. They were stored and
// never read; this reads them, once per final Submit Test (the submit
// handlers already ignore a double-click inside 10 s, and only call this when
// a submission was actually counted).
//
//   late submission + "Late Submissions" ON → a late-submission alert
//   otherwise "Submissions" ON              → a submission alert (marked late
//                                             when it was)
//   a toggle ON with no channel ticked       → Dashboard
//
// WHO: the student's trainers (utils/notificationRouting.js) — the staff of
// the student's batch in this course. Never every admin. Clicking it opens
// the assessment's Manage Users screen: the bell and the notifications page
// route `kind` submission / late_submission there, in the reader's section.

const mongoose = require("mongoose");
const { mergeSectionAcrossBatches } = require("./pedagogyScope");
const { trainersForStudent, deliver } = require("./notificationRouting");

const NODE_MODELS = { module: "Module1", submodule: "SubModule1", topic: "Topic1", subtopic: "SubTopic1" };

async function findExercise({ nodeId, nodeType, category, subcategory, exerciseId }) {
  const modelName = NODE_MODELS[String(nodeType || "").toLowerCase()];
  if (!modelName || !nodeId || !mongoose.Types.ObjectId.isValid(String(nodeId))) return null;
  const doc = await mongoose.model(modelName).findById(nodeId)
    .select(`pedagogy.${category} batchPedagogy`)
    .lean();
  const target = String(exerciseId);
  const entries = mergeSectionAcrossBatches(doc, category);
  const ordered = subcategory
    ? [...entries.filter(([k]) => k === subcategory), ...entries.filter(([k]) => k !== subcategory)]
    : entries;
  for (const [, list] of ordered) {
    if (!Array.isArray(list)) continue;
    const hit = list.find((ex) => ex && String(ex._id) === target);
    if (hit) return hit;
  }
  return null;
}

const pickChannels = (on, raw) => {
  if (on !== true) return null;
  const c = raw || {};
  const channels = { dashboard: c.dashboard === true, gmail: c.gmail === true, whatsapp: c.whatsapp === true };
  return channels.dashboard || channels.gmail || channels.whatsapp ? channels : { dashboard: true, gmail: false, whatsapp: false };
};

const escapeHtml = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** Never throws — runs after the submission has been saved and answered. */
async function notifyGradersOfSubmission({
  courseId, exerciseId, category, subcategory, nodeId, nodeType, student, isLate = false, submitType = "USER",
}) {
  try {
    if (category !== "We_Do" && category !== "You_Do") return;
    const exercise = await findExercise({ nodeId, nodeType, category, subcategory, exerciseId });
    if (!exercise) return;
    const ns = exercise.notificationSettings || {};

    const lateChannels = isLate ? pickChannels(ns.notifyGradersLateSubmissions, ns.notifyGradersLateSubmissionsChannels) : null;
    const channels = lateChannels || pickChannels(ns.notifyGradersSubmissions, ns.notifyGradersSubmissionsChannels);
    if (!channels) return;

    const { course, recipients, audience } = await trainersForStudent({
      courseId, studentId: student?._id, creatorEmail: exercise.createdBy,
    });
    if (!recipients.length) return;

    const kindWord = category === "You_Do" ? "assessment" : "assignment";
    const exerciseName = exercise.exerciseInformation?.exerciseName || (category === "You_Do" ? "Assessment" : "Assignment");
    const studentName = `${student?.firstName || ""} ${student?.lastName || ""}`.trim() || student?.email || "A student";
    const courseName = course?.courseName || "the course";
    const auto = submitType === "AUTO" ? " (auto-submitted)" : "";
    const title = isLate ? "Late submission" : "New submission";
    const message = `${studentName} ${isLate ? "submitted late" : "submitted"} the ${kindWord} "${exerciseName}" in ${courseName}${auto}.`;

    const delivered = await deliver(recipients, {
      channels,
      notification: {
        title,
        message,
        type: isLate ? "warning" : "info",
        relatedEntity: "exercise",
        relatedEntityId: mongoose.Types.ObjectId.isValid(String(exerciseId)) ? new mongoose.Types.ObjectId(String(exerciseId)) : undefined,
        metadata: {
          kind: isLate ? "late_submission" : "submission",
          courseId: String(courseId),
          exerciseId: String(exerciseId),
          exerciseName,
          subcategory: subcategory || "",
          nodeId: String(nodeId || ""),
          nodeType: String(nodeType || ""),
          studentId: String(student?._id || ""),
          studentName,
        },
      },
      email: {
        subject: `${title}: ${exerciseName} — ${studentName}`,
        html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#0f172a">
          <h2 style="margin:0 0 8px">${escapeHtml(title)}</h2>
          <p style="margin:0 0 12px">${escapeHtml(message)}</p>
          <p style="margin:0;color:#64748b">Open the LMS to review it.</p>
        </div>`,
      },
      whatsappText: `*${title}*\n${message}`,
    });
    console.log(
      `[grader-notify] ${isLate ? "late " : ""}submission "${exerciseName}" student=${student?._id} ` +
      `to=${recipients.length} (${audience}) dashboard=${delivered.dashboard} gmail=${delivered.gmail} whatsapp=${delivered.whatsapp}`
    );
  } catch (err) {
    console.warn("[grader-notify] failed:", err.message);
  }
}

module.exports = { notifyGradersOfSubmission };
