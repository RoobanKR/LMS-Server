// Local persistent storage for print layout logos, signatures, seals and
// watermarks. Legacy Cloudinary URLs are left readable in existing records.
const crypto = require("crypto");
const path = require("path");
const fs = require("fs-extra");
const { publicUrlFor, storagePathFromUrl, diskPathFor } = require("./storage");

const FOLDER = "print-settings";
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME = /^image\/(jpe?g|png|webp|gif|avif|svg\+xml)$/i;
const KINDS = ["logos", "signatures", "seals", "watermarks"];

async function uploadPrintAsset(file, kind = "logos") {
  if (!file || (!file.data && !file.tempFilePath)) throw new Error("No image file was provided");
  if (file.mimetype && !ALLOWED_MIME.test(file.mimetype)) {
    throw new Error("Print images must be JPEG, PNG, WebP, GIF, AVIF or SVG");
  }
  if (file.size > MAX_BYTES) throw new Error("Print images must be 5 MB or smaller");
  const folder = KINDS.includes(kind) ? kind : "logos";
  const ext = path.extname(String(file.name || "")).toLowerCase();
  const safeExt = /^\.(jpe?g|png|webp|gif|avif|svg)$/.test(ext) ? ext : ".png";
  const name = `${Date.now()}_${crypto.randomUUID()}${safeExt}`;
  const objectPath = `${FOLDER}/${folder}/${name}`;
  const target = diskPathFor(objectPath);
  await fs.ensureDir(path.dirname(target));
  if (file.tempFilePath) await fs.copy(file.tempFilePath, target);
  else await fs.writeFile(target, file.data);
  return publicUrlFor(objectPath);
}

function publicIdFromUrl(url) {
  if (typeof url !== "string" || !url.includes("res.cloudinary.com")) return null;
  const match = url.match(/\/upload\/(?:v\d+\/)?(.+)$/);
  return match ? match[1].replace(/\.[a-z0-9]+$/i, "") : null;
}

async function deletePrintAsset(url) {
  const objectPath = storagePathFromUrl(url);
  if (!objectPath || !String(url).includes("/uploads/storage/")) return false;
  try {
    await fs.remove(diskPathFor(objectPath));
    return true;
  } catch (error) {
    console.warn("Print storage: could not delete", objectPath, "-", error.message);
    return false;
  }
}

module.exports = { uploadPrintAsset, deletePrintAsset, publicIdFromUrl, PRINT_FOLDER: FOLDER };
