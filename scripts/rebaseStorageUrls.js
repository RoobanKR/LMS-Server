// Point every saved /uploads/storage/ link at STORAGE_PUBLIC_BASE_URL.
// Links saved while the base was unset or different (http://localhost:5533,
// http://<ip>:5533, ...) name the right file but an unreachable origin.
// Dry-run by default; rerun with --apply to update MongoDB. Files are untouched.
const path = require("path");
const mongoose = require("mongoose");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const applyChanges = process.argv.includes("--apply");
const BASE = String(process.env.STORAGE_PUBLIC_BASE_URL || "").replace(/\/+$/, "");
const URL_PATTERN = /https?:\/\/[^\s"'<>/]+\/uploads\/storage\/[^\s"'<>]*/g;

function rebase(raw) {
  try {
    const parsed = new URL(raw);
    const fixed = `${BASE}${parsed.pathname}${parsed.search}`;
    return fixed === raw ? null : fixed;
  } catch { return null; }
}

function collect(value, found) {
  if (typeof value === "string") {
    for (const raw of value.match(URL_PATTERN) || []) if (rebase(raw)) found.add(raw);
  } else if (Array.isArray(value)) {
    value.forEach((item) => collect(item, found));
  } else if (value && typeof value === "object" && !(value instanceof Date) && !Buffer.isBuffer(value) && !value._bsontype) {
    Object.values(value).forEach((item) => collect(item, found));
  }
  return found;
}

function replace(value) {
  if (typeof value === "string") return value.replace(URL_PATTERN, (raw) => rebase(raw) || raw);
  if (Array.isArray(value)) return value.map(replace);
  if (value && typeof value === "object" && !(value instanceof Date) && !Buffer.isBuffer(value) && !value._bsontype) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replace(item)]));
  }
  return value;
}

async function main() {
  if (!process.env.MONGOURI) throw new Error("MONGOURI is not configured in Server/.env");
  if (!/^https?:\/\//.test(BASE)) throw new Error("Set STORAGE_PUBLIC_BASE_URL (e.g. https://api.smartclifflms.tech) in Server/.env first");
  await mongoose.connect(process.env.MONGOURI, { serverSelectionTimeoutMS: 30000 });
  const db = mongoose.connection.db;
  const collections = await db.listCollections({ type: "collection" }).toArray();

  let docs = 0;
  let links = 0;
  let conflicts = 0;
  for (const info of collections) {
    const collection = db.collection(info.name);
    for await (const doc of collection.find({})) {
      const found = collect(doc, new Set());
      if (!found.size) continue;
      docs++;
      links += found.size;
      if (!applyChanges) {
        for (const url of found) console.log(`${info.name} ${doc._id}: ${url} -> ${rebase(url)}`);
        continue;
      }
      const fields = {};
      const expected = { _id: doc._id };
      for (const [key, value] of Object.entries(doc)) {
        if (key === "_id" || !collect(value, new Set()).size) continue;
        fields[key] = replace(value);
        expected[key] = value;
      }
      // Skip documents changed while this ran; a rerun picks them up.
      const result = await db.collection(info.name).updateOne(expected, { $set: fields });
      if (!result.matchedCount) conflicts++;
    }
  }
  console.log(`${applyChanges ? "APPLIED" : "DRY RUN"}: ${links} links in ${docs} documents ${applyChanges ? "now point" : "would point"} at ${BASE}.`);
  if (!applyChanges && docs) console.log("Rerun with --apply to update them.");
  if (conflicts) console.log(`${conflicts} documents changed during the run and were skipped; rerun to finish them.`);
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState) await mongoose.disconnect();
  });
