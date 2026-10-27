// One-off: copy PRT I's "Problem Solving Exercise - II (Dynamic Programming)"
// into ISSD TRACK's "Problem Solving Exercises - II" topic under We Do ›
// practical — questions, test cases and settings exactly as they are, with
// fresh _ids (so PRT students' answers can never match it). Schedule and the
// AI-review switch follow ISSD's own Exercise I, which sits beside it.
//
//   node scripts/copyProblemSolvingExerciseII.js          (dry run)
//   node scripts/copyProblemSolvingExerciseII.js --apply  (backup, then write)

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const O = (s) => new mongoose.Types.ObjectId(s);

const SRC_TOPIC = "6ad0a8006da30f1d3f1030a4";   // PRT I · Problem Solving Exercise - II
const SRC_EXERCISE = "6acf55d76476075d4b6de2f3";
const DST_TOPIC = "6adc543fcd3c38507a7b1f9a";   // ISSD TRACK · Problem Solving Exercises - II
const SIBLING_TOPIC = "6adc5426cd3c38507a7b1690"; // ISSD TRACK · Problem Solving Exercises - I
const SIBLING_EXERCISE = "6adc5f28cd3c38507a7c1c0a";
const SUBCATEGORY = "practical";
const APPLY = process.argv.includes("--apply");

/** Deep copy; every `_id` that is an ObjectId gets a new one. */
function withFreshIds(value) {
  if (Array.isArray(value)) return value.map(withFreshIds);
  if (value instanceof Date) return new Date(value);
  if (value && typeof value === "object") {
    if (value._bsontype === "ObjectId" || value instanceof mongoose.Types.ObjectId) return value;
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = k === "_id" && v && (v._bsontype === "ObjectId" || v instanceof mongoose.Types.ObjectId) ? new mongoose.Types.ObjectId() : withFreshIds(v);
    }
    return out;
  }
  return value;
}

(async () => {
  await mongoose.connect(process.env.MONGOURI);
  const topics = mongoose.connection.db.collection("topic1");
  const [src, dst, sibling] = await Promise.all([SRC_TOPIC, DST_TOPIC, SIBLING_TOPIC].map((id) => topics.findOne({ _id: O(id) })));
  const exercise = (src?.pedagogy?.We_Do?.assignment || []).find((e) => String(e._id) === SRC_EXERCISE);
  const siblingEx = (sibling?.pedagogy?.We_Do?.[SUBCATEGORY] || []).find((e) => String(e._id) === SIBLING_EXERCISE);
  if (!exercise || !dst || !siblingEx) throw new Error("Source exercise, target topic or sibling exercise not found.");

  const existing = dst.pedagogy?.We_Do?.[SUBCATEGORY] || [];
  if (existing.some((e) => e?.exerciseInformation?.exerciseName === exercise.exerciseInformation.exerciseName)) {
    console.log("Already there — nothing to do.");
    return mongoose.disconnect();
  }

  const now = new Date();
  const copy = withFreshIds(exercise);
  copy.exerciseInformation.exerciseId = `EX${String(Math.floor(100 + Math.random() * 900))}`;
  copy.availabilityPeriod = { ...copy.availabilityPeriod, startDate: siblingEx.availabilityPeriod.startDate, endDate: siblingEx.availabilityPeriod.endDate };
  copy.evaluationMethod = { ...copy.evaluationMethod, aiReview: siblingEx.evaluationMethod?.aiReview === true };
  delete copy.studentNotification;
  copy.createdAt = now;
  copy.updatedAt = now;
  for (const q of copy.questions || []) {
    delete q.lastEditedAfterSubmissionAt;
    q.createdAt = now;
    q.updatedAt = now;
  }

  console.log(`Source : "${src.title}" › We_Do.assignment › "${exercise.exerciseInformation.exerciseName}" (${exercise.questions.length} questions)`);
  console.log(`Target : "${dst.title}" › We_Do.${SUBCATEGORY} (has ${existing.length})`);
  console.log(`New ids: exercise ${copy._id}, questions ${copy.questions.map((q) => String(q._id).slice(-6)).join(", ")}`);
  console.log(`Schedule: ${copy.availabilityPeriod.startDate.toISOString()} → ${copy.availabilityPeriod.endDate.toISOString()} · aiReview ${copy.evaluationMethod.aiReview} · ${copy.exerciseInformation.exerciseId}`);
  copy.questions.forEach((q, i) => console.log(`  ${i + 1}. ${q.title} · ${q.score} marks · ${(q.testCases || []).length} test cases`));

  if (!APPLY) { console.log("\nDry run — pass --apply to write."); return mongoose.disconnect(); }

  const backupDir = path.join(__dirname, "..", "backups");
  fs.mkdirSync(backupDir, { recursive: true });
  const backupFile = path.join(backupDir, `topic1-${DST_TOPIC}-before-PSE-II-copy-${now.toISOString().replace(/[:.]/g, "-")}.json`);
  fs.writeFileSync(backupFile, JSON.stringify(dst, null, 2));
  console.log(`\nBackup: ${backupFile}`);

  const res = await topics.updateOne(
    { _id: O(DST_TOPIC) },
    { $push: { [`pedagogy.We_Do.${SUBCATEGORY}`]: copy }, $set: { updatedAt: now } },
  );
  console.log(`Updated: matched ${res.matchedCount}, modified ${res.modifiedCount}`);
  const after = await topics.findOne({ _id: O(DST_TOPIC) }, { projection: { [`pedagogy.We_Do.${SUBCATEGORY}`]: 1 } });
  const list = after.pedagogy.We_Do[SUBCATEGORY];
  console.log(`Now: ${list.length} exercise(s) → ${list.map((e) => `"${e.exerciseInformation.exerciseName}" (${e.questions.length} q)`).join("; ")}`);
  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
