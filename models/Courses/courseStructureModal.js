const mongoose = require("mongoose");

const courseStructureSchema = new mongoose.Schema({
  institution: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "LMS-Institution",
    required: true,
  },

  // Course Configuration
  clientName: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Course-Structure-Dynamic",
    required: true,
  },
  serviceType: {
    type: String,
    required: true,
  },
  serviceModal: {
    type: String,
    required: true,
  },

  // Course Details
  category: {
    type: String,
    required: true,
  },
  courseCode: {
    type: String,
  },
  courseName: {
    type: String,
    required: true,
  },
  courseDescription: {
    type: String,
  },
  courseDuration: {
    type: String,
  },
  courseLevel: {
    type: String,
  },
  courseImage: {
    type: String,
  },

  resourcesType: [
    {
      type: String,
    },
  ],
  courseHierarchy: [
    {
      type: String,
    },
  ],
  I_Do: [
    {
      type: String,
    },
  ],
  We_Do: [
    {
      type: String,
    },
  ],
  You_Do: [
    {
      type: String,
    },
  ],
  createdAt: {
    type: Date,
    default: Date.now,
  },
  createdBy: {
    type: String,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
  updatedBy: {
    type: String,
  },
});

module.exports = mongoose.model("Course-Structure", courseStructureSchema);
