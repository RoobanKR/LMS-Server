// Remove the "Problem Statement" label that Import from document used to put
// at the start of a question's description. The description IS the problem
// statement, so the label only duplicated it (and showed as "Problem
// StatementYou are…" in list previews).
//
// Only the importer's own markup at the very start is touched:
//   <p><b>Problem Statement</b></p>…        → …
//   <p><b>Problem Statement:</b> text…</p>   → <p>text…</p>
//
// Usage: node scripts/stripProblemStatementLabel.js [--apply]
// Dry run unless --apply. With --apply, every changed description (old and
// new) is written to scripts/backups-move/problem-statement-<time>.json first,
// and each update is guarded on the old value.

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");

const APPLY = process.argv.includes("--apply");
const COLLECTIONS = {
  module: require("../models/Courses/moduleStructure/moduleModal"),
  submodule: require("../models/Courses/moduleStructure/subModuleModal"),
  topic: require("../models/Courses/moduleStructure/topicModal"),
  subtopic: require("../models/Courses/moduleStructure/subTopicModal"),
};
const TABS = ["I_Do", "We_Do", "You_Do"];

const HEADING = /^\s*<p>\s*<b>\s*Problem\s+Statement\s*:?\s*<\/b>\s*<\/p>\s*/i;
const INLINE = /^\s*<p>\s*<b>\s*Problem\s+Statement\s*:\s*<\/b>\s*/i;
const strip = (html) => (HEADING.test(html) ? html.replace(HEADING, "") : INLINE.test(html) ? html.replace(INLINE, "<p>") : html);

async function main() {
  await mongoose.connect(process.env.MONGOURI);
  const changes = [];

  for (const [kind, Model] of Object.entries(COLLECTIONS)) {
    const cursor = Model.collection.find({}, { projection: { title: 1, pedagogy: 1, batchPedagogy: 1 } });
    for await (const doc of cursor) {
      const roots = [["pedagogy", doc.pedagogy]];
      for (const [batchId, ped] of Object.entries(doc.batchPedagogy || {})) roots.push([`batchPedagogy.${batchId}`, ped]);
      for (const [rootPath, ped] of roots) {
        if (!ped) continue;
        for (const tab of TABS) {
          const section = ped[tab];
          if (!section || typeof section !== "object") continue;
          for (const [sub, exercises] of Object.entries(section)) {
            if (!Array.isArray(exercises)) continue;
            exercises.forEach((ex, i) => {
              (ex?.questions || []).forEach((q, j) => {
                const d = q?.description;
                const isObj = d && typeof d === "object" && typeof d.text === "string";
                const old = isObj ? d.text : typeof d === "string" ? d : null;
                if (old == null) return;
                const next = strip(old);
                if (next === old) return;
                changes.push({
                  kind, _id: doc._id, topic: String(doc.title || "").trim(),
                  exercise: ex?.exerciseInformation?.exerciseName || String(ex?._id),
                  question: q?.title || String(q?._id),
                  path: `${rootPath}.${tab}.${sub}.${i}.questions.${j}.description${isObj ? ".text" : ""}`,
                  old, next,
                });
              });
            });
          }
        }
      }
    }
  }

  console.log(`${changes.length} question description(s) start with the "Problem Statement" label.`);
  const byExercise = {};
  for (const c of changes) byExercise[`${c.topic} > ${c.exercise}`] = (byExercise[`${c.topic} > ${c.exercise}`] || 0) + 1;
  for (const [k, n] of Object.entries(byExercise)) console.log(`  ${n} in ${k}`);
  if (!APPLY) { console.log("\nDry run - add --apply to remove the label."); return; }

  const dir = path.join(__dirname, "backups-move");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `problem-statement-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  fs.writeFileSync(file, JSON.stringify(changes, null, 1));
  console.log(`\nBackup written: ${file}`);

  let done = 0;
  for (const c of changes) {
    const r = await COLLECTIONS[c.kind].collection.updateOne(
      { _id: c._id, [c.path]: c.old },
      { $set: { [c.path]: c.next } },
    );
    done += r.modifiedCount;
  }
  console.log(`Updated ${done} of ${changes.length}.`);
}

main()
  .catch((e) => { console.error("ERROR:", e.message); process.exitCode = 1; })
  .finally(() => mongoose.disconnect().catch(() => {}));
