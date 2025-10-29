const mongoose = require("mongoose");

const tagSchema = new mongoose.Schema(
  {
    tagName: { type: String, required: true },
    tagColor: { type: String, default: "#000000" },
  },
  { _id: false }
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
  { _id: false }
);

// ✅ Pedagogy Schema (dynamic object: I_Do, We_Do, You_Do)
const pedagogySchema = new mongoose.Schema({
  I_Do: { type: Map, of: pedagogyElementSchema, default: {} },
  We_Do: { type: Map, of: pedagogyElementSchema, default: {} },
  You_Do: { type: Map, of: pedagogyElementSchema, default: {} },
});



const subModuleSchema = new mongoose.Schema({
  institution: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'LMS-Institution',
    required: true,
  },
  courses: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course-Structure',
    required: true,
  },
  moduleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Module1',
  },
  title: {
    type: String,
    required: true,
  },
  description: String,
  duration: { type: Number, default:30 },
   level:String,
  index: Number,
  pedagogy: pedagogySchema, // ✅ dynamic pedagogy

  createdAt: { type: Date, default: Date.now },
  createdBy: String,
  updatedAt: { type: Date, default: Date.now },
  updatedBy: String,
});

module.exports = mongoose.model('SubModule1', subModuleSchema);
