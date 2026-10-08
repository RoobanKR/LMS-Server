// Persistent local file storage for uploaded course and assessment assets.
// Configure STORAGE_DIR outside the release directory and set
// STORAGE_PUBLIC_BASE_URL to the public API origin on the VPS.

const fs = require("fs-extra");
const path = require("path");

const ROOT = (process.env.LEGACY_CLOUDINARY_FOLDER || "smartlms").replace(/^\/+|\/+$/g, "");
const STORAGE_DIR = path.resolve(process.env.STORAGE_DIR || path.join(__dirname, "..", "uploads", "storage"));
const SUPABASE_PUBLIC_MARKER = "/storage/v1/object/public/";

const sanitizePath = (value) => String(value || "")
  .replace(/\\/g, "/")
  .split("/")
  .map((segment) => segment.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^\.+$/, ""))
  .filter((segment) => segment && segment !== "." && segment !== "..")
  .join("/");

const diskPathFor = (objectPath) => {
  const clean = sanitizePath(objectPath);
  if (!clean) throw new Error("A storage path is required");
  const fullPath = path.resolve(STORAGE_DIR, clean);
  if (fullPath !== STORAGE_DIR && !fullPath.startsWith(`${STORAGE_DIR}${path.sep}`)) {
    throw new Error("Invalid storage path");
  }
  return fullPath;
};

const publicUrlFor = (objectPath) => {
  const clean = sanitizePath(objectPath);
  const configuredBase = process.env.STORAGE_PUBLIC_BASE_URL || process.env.PUBLIC_API_URL || process.env.NEXT_PUBLIC_API_URL;
  if (process.env.NODE_ENV === "production" && !configuredBase) {
    throw new Error("STORAGE_PUBLIC_BASE_URL must be set to the public API origin in production");
  }
  const publicBase = String(configuredBase || "http://localhost:5533").replace(/\/+$/, "");
  const relative = `/uploads/storage/${clean.split("/").map(encodeURIComponent).join("/")}`;
  return `${publicBase}${relative}`;
};

const isLegacyCloudinaryUrl = (url) => {
  try {
    const parsed = new URL(url);
    return ["https:", "http:"].includes(parsed.protocol) && parsed.hostname === "res.cloudinary.com";
  } catch { return false; }
};
const isLegacySupabaseUrl = (url) => typeof url === "string" && url.includes(SUPABASE_PUBLIC_MARKER);
const isManagedUrl = (url) => {
  const value = String(url || "");
  if (isLegacySupabaseUrl(value)) return true;
  const legacyCloud = String(process.env.LEGACY_CLOUDINARY_CLOUD_NAME || "dusxfgvhi");
  try {
    const parsed = new URL(value);
    if (parsed.hostname === "res.cloudinary.com" && parsed.pathname.split("/")[1] === legacyCloud) return true;
  } catch {}
  const base = String(process.env.STORAGE_PUBLIC_BASE_URL || process.env.PUBLIC_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:5533").replace(/\/+$/, "");
  return value.startsWith(`${base}/uploads/storage/`) || value.startsWith("/uploads/storage/");
};

const storagePathFromUrl = (url) => {
  const value = String(url || "");
  if (isLegacySupabaseUrl(value)) {
    const tail = value.split(SUPABASE_PUBLIC_MARKER)[1] || "";
    const slash = tail.indexOf("/");
    try { return slash >= 0 ? decodeURIComponent(tail.slice(slash + 1).split("?")[0]) : ""; }
    catch { return ""; }
  }
  if (isLegacyCloudinaryUrl(value)) {
    const match = value.match(/\/(?:image|video|raw)\/upload\/(.+)$/);
    if (!match) return "";
    const segments = match[1].split("?")[0].split("/");
    while (segments.length > 1 && (/^v\d+$/.test(segments[0]) || segments[0].includes(","))) segments.shift();
    let decoded;
    try { decoded = decodeURIComponent(segments.join("/")); } catch { decoded = segments.join("/"); }
    return ROOT && decoded.startsWith(`${ROOT}/`) ? decoded.slice(ROOT.length + 1) : decoded;
  }
  const marker = "/uploads/storage/";
  const index = value.indexOf(marker);
  if (index < 0) return "";
  try { return decodeURIComponent(value.slice(index + marker.length).split("?")[0]); }
  catch { return ""; }
};

const asBuffer = (data) => {
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof Uint8Array) return Buffer.from(data);
  if (typeof data === "string") return Buffer.from(data);
  if (data && typeof data === "object" && data.data !== undefined) return asBuffer(data.data);
  return Buffer.from(data);
};

const normalizeError = (error) => error instanceof Error ? error : new Error(error?.message || String(error || "Unknown storage error"));

const bucketApi = () => ({
  async upload(objectPath, data) {
    try {
      const clean = sanitizePath(objectPath);
      if (!clean) throw new Error("A storage path is required");
      const publicUrl = publicUrlFor(clean);
      const target = diskPathFor(clean);
      await fs.ensureDir(path.dirname(target));
      const buffer = data && data.tempFilePath
        ? await fs.readFile(data.tempFilePath)
        : asBuffer(data);
      await fs.writeFile(target, buffer);
      return { data: { path: clean, publicUrl }, error: null };
    } catch (error) {
      return { data: null, error: normalizeError(error) };
    }
  },

  async remove(paths) {
    const list = Array.isArray(paths) ? paths : [paths];
    try {
      const results = await Promise.all(list.filter(Boolean).map(async (objectPath) => {
        const target = diskPathFor(objectPath);
        await fs.unlink(target).catch((error) => {
          if (error.code !== "ENOENT") throw error;
        });
        return { path: sanitizePath(objectPath), result: "ok" };
      }));
      return { data: results, error: null };
    } catch (error) {
      return { data: null, error: normalizeError(error) };
    }
  },

  getPublicUrl(objectPath) {
    try {
      return { data: { publicUrl: publicUrlFor(objectPath) }, error: null };
    } catch (error) {
      return { data: null, error: normalizeError(error) };
    }
  },

  async copy(fromPath, toPath) {
    try {
      const sourcePath = sanitizePath(fromPath);
      const targetPath = sanitizePath(toPath);
      const publicUrl = publicUrlFor(targetPath);
      const target = diskPathFor(targetPath);
      await fs.ensureDir(path.dirname(target));
      await fs.copyFile(diskPathFor(sourcePath), target);
      return { data: { path: targetPath, publicUrl }, error: null };
    } catch (error) {
      return { data: null, error: normalizeError(error) };
    }
  },
});

const storage = { from: () => bucketApi() };

module.exports = {
  storage,
  publicUrlFor,
  storagePathFromUrl,
  isLegacySupabaseUrl,
  isLegacyCloudinaryUrl,
  isManagedUrl,
  sanitizePath,
  diskPathFor,
  STORAGE_DIR,
};
