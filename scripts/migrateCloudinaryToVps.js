// Migrate legacy Cloudinary URLs in every MongoDB collection to VPS files.
// Dry-run by default. Back up MongoDB and check VPS free space before --apply.
const path = require("path");
const crypto = require("crypto");
const fs = require("fs-extra");
const axios = require("axios");
const { pipeline } = require("stream/promises");
const mongoose = require("mongoose");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const { STORAGE_DIR, publicUrlFor, diskPathFor } = require("../utils/storage");
const applyChanges = process.argv.includes("--apply");
const CLOUD_NAME = String(process.env.LEGACY_CLOUDINARY_CLOUD_NAME || "dusxfgvhi");
const URL_PATTERN = /https?:\/\/res\.cloudinary\.com\/[^\s"'<>]+/g;

function trimUrl(value) {
  return value.replace(/[),.;\]}]+$/g, "");
}

function collectUrls(value, found = new Set()) {
  if (typeof value === "string") {
    for (const raw of value.match(URL_PATTERN) || []) {
      const url = trimUrl(raw);
      try {
        const parsed = new URL(url);
        if (parsed.hostname === "res.cloudinary.com" && parsed.pathname.split("/")[1] === CLOUD_NAME) found.add(url);
      } catch {}
    }
  } else if (Array.isArray(value)) {
    value.forEach((item) => collectUrls(item, found));
  } else if (value && typeof value === "object" && !(value instanceof Date) && !Buffer.isBuffer(value) && !value._bsontype) {
    Object.values(value).forEach((item) => collectUrls(item, found));
  }
  return found;
}

function localPathForLegacyUrl(url) {
  const parsed = new URL(url);
  const file = path.posix.basename(parsed.pathname);
  const ext = path.posix.extname(file).toLowerCase() || ".bin";
  const hash = crypto.createHash("sha256").update(url).digest("hex");
  return `legacy-cloudinary/${hash.slice(0, 2)}/${hash}${ext}`;
}

function replaceUrls(value, urlMap) {
  if (typeof value === "string") {
    return value.replace(URL_PATTERN, (raw) => {
      const suffix = raw.slice(trimUrl(raw).length);
      const replacement = urlMap.get(trimUrl(raw));
      return replacement ? `${replacement}${suffix}` : raw;
    });
  }
  if (Array.isArray(value)) return value.map((item) => replaceUrls(item, urlMap));
  if (value && typeof value === "object" && !(value instanceof Date) && !Buffer.isBuffer(value) && !value._bsontype) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replaceUrls(item, urlMap)]));
  }
  return value;
}

async function downloadToStorage(url, objectPath) {
  const target = diskPathFor(objectPath);
  await fs.ensureDir(path.dirname(target));
  const tempPath = `${target}.${process.pid}.partial`;
  try {
    const response = await axios.get(url, {
      responseType: "stream",
      timeout: 120000,
      maxRedirects: 5,
      validateStatus: (status) => status >= 200 && status < 300,
    });
    await pipeline(response.data, fs.createWriteStream(tempPath, { flags: "wx" }));
    const stats = await fs.stat(tempPath);
    if (!stats.size) throw new Error("Downloaded an empty file");
    await fs.move(tempPath, target, { overwrite: true });
  } catch (error) {
    await fs.remove(tempPath).catch(() => {});
    throw new Error(`Could not migrate ${url}: ${error.message}`);
  }
}

async function main() {
  if (!process.env.MONGOURI) throw new Error("MONGOURI is not configured in Server/.env");
  if (applyChanges && !process.env.STORAGE_PUBLIC_BASE_URL) {
    throw new Error("Set STORAGE_PUBLIC_BASE_URL to the public VPS API origin before applying the migration");
  }
  await mongoose.connect(process.env.MONGOURI, { serverSelectionTimeoutMS: 30000 });
  const db = mongoose.connection.db;
  const urlSet = new Set();
  const collections = await db.listCollections({ type: "collection" }).toArray();
  for (const info of collections) {
    const collection = db.collection(info.name);
    const cursor = collection.find({});
    for await (const doc of cursor) for (const url of collectUrls(doc)) urlSet.add(url);
  }

  console.log(`${applyChanges ? "APPLY" : "DRY RUN"}: ${urlSet.size} unique legacy Cloudinary URLs across ${collections.length} collections.`);
  console.log(`Target storage directory: ${STORAGE_DIR}`);
  if (!applyChanges) {
    console.log("No files or database records were changed. Back up MongoDB and check VPS free space, then rerun with --apply.");
    return;
  }

  const urlMap = new Map();
  for (const url of urlSet) {
    const objectPath = localPathForLegacyUrl(url);
    await downloadToStorage(url, objectPath);
    urlMap.set(url, publicUrlFor(objectPath));
    console.log(`Copied ${url} -> ${objectPath}`);
  }

  let updatedDocuments = 0;
  let conflicts = 0;
  for (const info of collections) {
    const collection = db.collection(info.name);
    const cursor = collection.find({});
    for await (const doc of cursor) {
      if (!collectUrls(doc).size) continue;
      const fields = {};
      const expected = { _id: doc._id };
      for (const [key, value] of Object.entries(doc)) {
        if (key === "_id" || ![...collectUrls(value)].some((url) => urlMap.has(url))) continue;
        fields[key] = replaceUrls(value, urlMap);
        expected[key] = value;
      }
      if (!Object.keys(fields).length) continue;
      // Do not overwrite answers or other fields changed while this scan ran.
      const result = await collection.updateOne(expected, { $set: fields });
      if (!result.matchedCount) conflicts++;
      if (result.modifiedCount) updatedDocuments++;
    }
  }
  console.log(`Migration finished: ${urlMap.size} URLs copied; ${updatedDocuments} MongoDB documents updated.`);
  if (conflicts) throw new Error(`${conflicts} documents changed during migration and were skipped. Rerun to migrate their remaining URLs.`);
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState) await mongoose.disconnect();
  });
