// One-off: copy PRT I's You Do › Practice exercises of "Problem Solving
// Exercise - I / II" into ISSD TRACK's matching topics, You Do › Practice —
// questions, test cases and settings exactly as they are, with fresh _ids so
// PRT students' answers can never match them. (PRT's You Do › Assessment "m"
// is a test exercise and is not copied.)
//
//   node scripts/copyProblemSolvingPractice.js          (dry run)
//   node scripts/copyProblemSolvingPractice.js --apply  (backup, then write)

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const O = (s) => new mongoose.Types.ObjectId(s);

const COPIES = [
  { srcTopic: "6ad0a7926da30f1d3f0fe975", srcExercise: "6ad0b4b98d3cea09349b44dc", dstTopic: "6adc5426cd3c38507a7b1690" }, // I (Greedy Approach)
  { srcTopic: "6ad0a8006da30f1d3f1030a4", srcExercise: "6ad0abbd8d3cea09349ad958", dstTopic: "6adc543fcd3c38507a7b1f9a" }, // II (Dynamic Programming)
];
const TAB = "You_Do";
const SUBCATEGORY = "practice";
const APPLY = process.argv.includes("--apply");

const isObjectId = (v) => v && (v._bsontype === "ObjectId" || v instanceof mongoose.Types.ObjectId);
/** A new id of the same kind: these practice exercises keep their ids as hex
 *  strings, so a string id gets a new hex string, an ObjectId a new ObjectId. */
const freshId = (v) => {
  if (isObjectId(v)) return new mongoose.Types.ObjectId();
  if (typeof v === "string" && /^[0-9a-f]{24}$/i.test(v)) return new mongoose.Types.ObjectId().toHexString();
  return v;
};
/** Deep copy; every `_id` gets a new one. */
function withFreshIds(value) {
  if (Array.isArray(value)) return value.map(withFreshIds);
  if (value instanceof Date) return new Date(value);
  if (value && typeof value === "object") {
    if (isObjectId(value)) return value;
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = k === "_id" ? freshId(v) : withFreshIds(v);
    return out;
  }
  return value;
}

(async () => {
  await mongoose.connect(process.env.MONGOURI);
  const topics = mongoose.connection.db.collection("topic1");
  const now = new Date();
  const backupDir = path.join(__dirname, "..", "backups");

  for (const job of COPIES) {
    const [src, dst] = await Promise.all([topics.findOne({ _id: O(job.srcTopic) }), topics.findOne({ _id: O(job.dstTopic) })]);
    const exercise = (src?.pedagogy?.[TAB]?.[SUBCATEGORY] || []).find((e) => String(e._id) === job.srcExercise);
    if (!exercise || !dst) throw new Error(`Missing source exercise ${job.srcExercise} or target topic ${job.dstTopic}.`);
    const existing = dst.pedagogy?.[TAB]?.[SUBCATEGORY] || [];
    const name = exercise.exerciseInformation?.exerciseName;
    console.log(`\n"${src.title}" › ${TAB}.${SUBCATEGORY} › "${name}" (${exercise.questions.length} questions)`);
    console.log(`  → "${dst.title}" › ${TAB}.${SUBCATEGORY} (has ${existing.length})`);
    if (existing.some((e) => e?.exerciseInformation?.exerciseName === name)) { console.log("  already there — skipped"); continue; }

    const copy = withFreshIds(exercise);
    copy.exerciseInformation.exerciseId = `EX${String(Math.floor(100 + Math.random() * 900))}`;
    delete copy.studentNotification;
    copy.createdAt = now;
    copy.updatedAt = now;
    for (const q of copy.questions || []) {
      delete q.lastEditedAfterSubmissionAt;
      q.createdAt = now;
      q.updatedAt = now;
    }
    copy.questions.forEach((q, i) => console.log(`    ${i + 1}. ${q.title} · ${q.score} marks · ${(q.testCases || []).length} test cases`));
    console.log(`  new exercise id ${copy._id} · ${copy.exerciseInformation.exerciseId} · eval ${copy.evaluationMethod?.method}`);
    if (!APPLY) continue;

    fs.mkdirSync(backupDir, { recursive: true });
    const backupFile = path.join(backupDir, `topic1-${job.dstTopic}-before-PSE-practice-copy-${now.toISOString().replace(/[:.]/g, "-")}.json`);
    fs.writeFileSync(backupFile, JSON.stringify(dst, null, 2));
    console.log(`  backup: ${backupFile}`);
    const res = await topics.updateOne(
      { _id: O(job.dstTopic) },
      { $push: { [`pedagogy.${TAB}.${SUBCATEGORY}`]: copy }, $set: { updatedAt: now } },
    );
    console.log(`  updated: matched ${res.matchedCount}, modified ${res.modifiedCount}`);
  }
  if (!APPLY) console.log("\nDry run — pass --apply to write.");
  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
