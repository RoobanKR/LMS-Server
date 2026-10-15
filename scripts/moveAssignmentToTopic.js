// Move a We Do assignment from one topic to another — the exercise itself,
// unchanged (same _id, questions, settings, notification stamp), plus the two
// records that name its topic: the "new assignment" notifications' links and
// the notification send-log.
//
// Usage:
//   node scripts/moveAssignmentToTopic.js <exerciseId>:<fromTopicId>:<toTopicId> [...more] [--apply]
// Dry run unless --apply. With --apply, the moved exercises and the old
// notification links are written to scripts/backups-move/<timestamp>.json
// BEFORE anything is changed.
//
// Refuses when students already have answers on the exercise (their answers
// would stay filed under the old topic), when the exercise isn't in the source
// topic's We_Do.assignment, or when the target already holds it.

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");

const Topic = require("../models/Courses/moduleStructure/topicModal");
const User = require("../models/UserModel");

const APPLY = process.argv.includes("--apply");
const moves = process.argv.slice(2).filter((a) => !a.startsWith("--")).map((a) => {
  const [exerciseId, fromTopicId, toTopicId] = a.split(":");
  if (!exerciseId || !fromTopicId || !toTopicId) throw new Error(`Bad move "${a}" (want exerciseId:fromTopicId:toTopicId)`);
  return { exerciseId, fromTopicId, toTopicId };
});
if (!moves.length) { console.error("Nothing to move."); process.exit(1); }

const oid = (s) => new mongoose.Types.ObjectId(s);
const LOGS = "exercise-notification-logs";

async function main() {
  await mongoose.connect(process.env.MONGOURI);
  const topics = Topic.collection;
  const users = User.collection;
  const logs = mongoose.connection.db.collection(LOGS);

  // ── 1. Check every move; change nothing yet ───────────────────────────────
  const plan = [];
  for (const m of moves) {
    const from = await topics.findOne({ _id: oid(m.fromTopicId) }, { projection: { title: 1, "pedagogy.We_Do": 1 } });
    const to = await topics.findOne({ _id: oid(m.toTopicId) }, { projection: { title: 1, pedagogy: 1 } });
    if (!from || !to) throw new Error(`Topic not found (${m.fromTopicId} / ${m.toTopicId})`);
    if (to.pedagogy === null) throw new Error(`"${to.title}" has pedagogy: null`);
    const exercise = (from.pedagogy?.We_Do?.assignment || []).find((e) => String(e?._id) === m.exerciseId);
    if (!exercise) throw new Error(`${m.exerciseId} is not in "${from.title}" We_Do.assignment`);
    if ((to.pedagogy?.We_Do?.assignment || []).some((e) => String(e?._id) === m.exerciseId)) {
      throw new Error(`${m.exerciseId} is already in "${to.title}"`);
    }
    const answered = await users.countDocuments({
      "courses.answers.We_Do.assignment.exerciseId": { $in: [m.exerciseId, oid(m.exerciseId)] },
    });
    if (answered) throw new Error(`${answered} student(s) already have answers on ${m.exerciseId} — not moving`);

    const sample = await users.findOne({ "notifications.metadata.exerciseId": m.exerciseId }, { projection: { notifications: 1 } });
    const oldUrl = sample?.notifications?.find((n) => String(n?.metadata?.exerciseId) === m.exerciseId)?.metadata?.redirectUrl || "";
    const newUrl = oldUrl.replace(`restoreNodeId=${m.fromTopicId}`, `restoreNodeId=${m.toTopicId}`);
    const notified = await users.countDocuments({ "notifications.metadata.exerciseId": m.exerciseId });
    const logRows = await logs.countDocuments({ exerciseId: { $in: [m.exerciseId, oid(m.exerciseId)] } });

    console.log(`\n${exercise.exerciseInformation?.exerciseName}`);
    console.log(`  from "${String(from.title).trim()}" -> to "${String(to.title).trim()}"`);
    console.log(`  questions: ${(exercise.questions || []).length}; students notified: ${notified}; send-log rows: ${logRows}`);
    plan.push({ ...m, fromTitle: from.title, toTitle: to.title, exercise, oldUrl, newUrl });
  }

  if (!APPLY) { console.log("\nDry run - add --apply to move."); return; }

  // ── 2. Backup, then move ──────────────────────────────────────────────────
  const dir = path.join(__dirname, "backups-move");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  fs.writeFileSync(file, JSON.stringify(plan, null, 1));
  console.log(`\nBackup written: ${file}`);

  for (const p of plan) {
    console.log(`\nMoving "${p.exercise.exerciseInformation?.exerciseName}"`);
    // Into the target first, then out of the source - never zero copies.
    const pushed = await topics.updateOne(
      { _id: oid(p.toTopicId), "pedagogy.We_Do.assignment._id": { $ne: oid(p.exerciseId) } },
      { $push: { "pedagogy.We_Do.assignment": p.exercise }, $set: { updatedAt: new Date() } },
    );
    if (pushed.modifiedCount !== 1) throw new Error(`push into "${p.toTitle}" failed`);
    const pulled = await topics.updateOne(
      { _id: oid(p.fromTopicId) },
      { $pull: { "pedagogy.We_Do.assignment": { _id: oid(p.exerciseId) } }, $set: { updatedAt: new Date() } },
    );
    if (pulled.modifiedCount !== 1) throw new Error(`pull from "${p.fromTitle}" failed - exercise is now in both topics`);
    console.log(`  moved to "${String(p.toTitle).trim()}"`);

    // Notification links open the new topic.
    if (p.oldUrl && p.newUrl !== p.oldUrl) {
      const r = await users.updateMany(
        { "notifications.metadata.exerciseId": p.exerciseId },
        { $set: { "notifications.$[n].metadata.redirectUrl": p.newUrl } },
        { arrayFilters: [{ "n.metadata.exerciseId": p.exerciseId, "n.metadata.redirectUrl": p.oldUrl }] },
      );
      console.log(`  notification links updated: ${r.modifiedCount} student(s)`);
    }

    // The send-log follows, so the new topic never re-announces it.
    const l = await logs.updateMany(
      { exerciseId: { $in: [p.exerciseId, oid(p.exerciseId)] }, entityId: { $in: [p.fromTopicId, oid(p.fromTopicId)] } },
      { $set: { entityId: p.toTopicId } },
    );
    console.log(`  send-log rows moved: ${l.modifiedCount}`);
  }
  console.log("\nDone.");
}

main()
  .catch((e) => { console.error("ERROR:", e.message); process.exitCode = 1; })
  .finally(() => mongoose.disconnect().catch(() => {}));
