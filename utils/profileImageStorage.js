// Local profile image storage. Existing Cloudinary/Supabase URLs remain valid
// for already-created users; new profile images are written to VPS storage.
const crypto = require("crypto");
const path = require("path");
const fs = require("fs-extra");
const { publicUrlFor, storagePathFromUrl, diskPathFor } = require("./storage");

const FOLDER = "users/profile";
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME = /^image\/(jpe?g|png|webp|gif|avif)$/i;
const DEFAULT_NAME = "default_profile_image.svg";
const DEFAULT_AVATAR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><rect width="512" height="512" fill="#e5e7eb"/><circle cx="256" cy="200" r="82" fill="#9ca3af"/><path d="M256 310c-84 0-152 54-152 121v81h304v-81c0-67-68-121-152-121z" fill="#9ca3af"/></svg>`;

let defaultUrlPromise = null;
async function ensureDefaultProfileImage() {
  if (process.env.DEFAULT_PROFILE_IMAGE_URL) return process.env.DEFAULT_PROFILE_IMAGE_URL;
  const target = diskPathFor(`${FOLDER}/${DEFAULT_NAME}`);
  try {
    if (!await fs.pathExists(target)) {
      await fs.ensureDir(path.dirname(target));
      await fs.writeFile(target, DEFAULT_AVATAR_SVG, "utf8");
    }
  } catch (error) {
    console.warn("Could not seed default profile image:", error.message);
    defaultUrlPromise = null;
  }
  return publicUrlFor(`${FOLDER}/${DEFAULT_NAME}`);
}

function getDefaultProfileImageUrl() {
  if (!defaultUrlPromise) defaultUrlPromise = ensureDefaultProfileImage().catch((error) => {
    defaultUrlPromise = null;
    throw error;
  });
  return defaultUrlPromise;
}

async function uploadProfileImage(imageFile) {
  if (!imageFile || (!imageFile.data && !imageFile.tempFilePath)) throw new Error("No image file was provided");
  if (imageFile.mimetype && !ALLOWED_MIME.test(imageFile.mimetype)) {
    throw new Error("Profile picture must be a JPEG, PNG, WebP, GIF or AVIF image");
  }
  if (imageFile.size > MAX_BYTES) throw new Error("Profile picture must be 5 MB or smaller");
  const ext = path.extname(String(imageFile.name || "")).toLowerCase();
  const safeExt = /^\.(jpe?g|png|webp|gif|avif)$/.test(ext) ? ext : ".jpg";
  const name = `${Date.now()}_${crypto.randomUUID()}${safeExt}`;
  const target = diskPathFor(`${FOLDER}/${name}`);
  await fs.ensureDir(path.dirname(target));
  if (imageFile.tempFilePath) await fs.copy(imageFile.tempFilePath, target);
  else await fs.writeFile(target, imageFile.data);
  return publicUrlFor(`${FOLDER}/${name}`);
}

function publicIdFromUrl(url) {
  if (typeof url !== "string" || !url.includes("res.cloudinary.com")) return null;
  const match = url.match(/\/upload\/(?:v\d+\/)?(.+)$/);
  return match ? match[1].replace(/\.[a-z0-9]+$/i, "") : null;
}

async function deleteProfileImage(profileUrl) {
  if (!profileUrl || profileUrl.includes("default_profile_image")) return false;
  const storagePath = storagePathFromUrl(profileUrl);
  if (!storagePath || !profileUrl.includes("/uploads/storage/")) return false;
  try {
    await fs.remove(diskPathFor(storagePath));
    return true;
  } catch (error) {
    console.warn("Profile storage: could not delete", storagePath, "-", error.message);
    return false;
  }
}

module.exports = { uploadProfileImage, deleteProfileImage, getDefaultProfileImageUrl, publicIdFromUrl, PROFILE_FOLDER: FOLDER };
