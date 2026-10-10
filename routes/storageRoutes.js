const express = require("express");
const crypto = require("crypto");
const path = require("path");
const { userAuth } = require("../middlewares/userAuth");
const { storage, publicUrlFor } = require("../utils/storage");

const router = express.Router();

// Browser recordings are authenticated uploads. Restrict both the file type
// and destination folder because this route is intentionally shared by the
// assessment screens and programming mock recorder.
router.post("/storage/upload-recording", userAuth, async (req, res) => {
  try {
    const file = req.files?.file;
    if (!file) return res.status(400).json({ success: false, message: "Recording file is required" });
    // MediaRecorder blobs carry codec parameters ("video/webm;codecs=vp9,opus");
    // only the base type is checked.
    const mime = String(file.mimetype || "").toLowerCase().split(";")[0].trim();
    const ext = path.extname(String(file.name || "")).toLowerCase();
    const allowed = new Set(["video/webm", "video/mp4", "video/quicktime"]);
    if (!allowed.has(mime) || !new Set([".webm", ".mp4", ".mov"]).has(ext)) {
      return res.status(400).json({ success: false, message: "Recording must be a WebM, MP4 or MOV video" });
    }
    const maxBytes = 100 * 1024 * 1024;
    if (file.size > maxBytes) return res.status(413).json({ success: false, message: "Recording must be 100 MB or smaller" });

    const purpose = req.body?.purpose === "mock" ? "mock-recordings" : "assessment-recordings";
    const safeExt = ext;
    const objectPath = `${purpose}/${String(req.user._id)}/${Date.now()}_${crypto.randomUUID()}${safeExt}`;
    const { error } = await storage.from("smartlms").upload(objectPath, file.data);
    if (error) throw error;
    return res.status(201).json({ success: true, url: publicUrlFor(objectPath), path: objectPath });
  } catch (error) {
    console.error("Recording upload failed:", error.message);
    return res.status(500).json({ success: false, message: "Could not save recording" });
  }
});

module.exports = router;
