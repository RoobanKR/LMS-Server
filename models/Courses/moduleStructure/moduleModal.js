const mongoose = require("mongoose");

const tagSchema = new mongoose.Schema(
  {
    tagName: { type: String, required: true },
    tagColor: { type: String, default: "#000000" },
  },
);
// File Schema
const fileSchema = new mongoose.Schema(
  {
    fileName: String,
    fileType: String,
    size: String,
    uploadedAt: { type: Date, default: Date.now },
    tags: [tagSchema],

    // ✅ fileUrl is always an object with base URLs
    fileUrl: {
      type: Map,
      of: String,
      default: {}, // keys: "base" for non-video, "2160p"/"1080p"/... for videos
    },
    isVideo: { type: Boolean, default: false },
    isReference: { type: Boolean },

    availableResolutions: [String], // for videos, e.g., ["2160p", "1080p"]
  },
  { _id: true }
);

// Folder Schema (recursive nesting allowed)
const folderSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    files: [fileSchema],
    subfolders: [this], // recursive nesting
       tags: [tagSchema], // ✅ Add tags to files

  },
  { _id: true }
);

// Pedagogy Element Schema
const pedagogyElementSchema = new mongoose.Schema(
  {
    description: String,
    files: [fileSchema],     // direct files
    folders: [folderSchema], // nested folders

  },
);

// ✅ Pedagogy Schema (dynamic object: I_Do, We_Do, You_Do)
const pedagogySchema = new mongoose.Schema({
  I_Do: { type: Map, of: pedagogyElementSchema, default: {} },
  We_Do: { type: Map, of: pedagogyElementSchema, default: {} },
  You_Do: { type: Map, of: pedagogyElementSchema, default: {} },
});

// Module Structure Schema
const moduleStructureSchema = new mongoose.Schema(
  {
    institution: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LMS-Institution",
      required: true,
    },
    courses: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course-Structure",
      required: true,
    },
    title: { type: String, required: true },
    description: String,
    duration: { type: Number, default: 30 },
    index: Number,
    level: String,
    pedagogy: pedagogySchema, // ✅ dynamic pedagogy

    createdBy: String,
    updatedBy: String,
  },
  { timestamps: true }
);

module.exports = mongoose.model("Module1", moduleStructureSchema);