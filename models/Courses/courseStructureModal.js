const mongoose = require("mongoose");

// Group Schema (unchanged)
const groupSchema = new mongoose.Schema({

  groupName: {
    type: String,
    required: true,
    trim: true,
  },
  groupDescription: {
    type: String,
    trim: true,
    default: "",
  },
  members: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: "LMS-User",
    required: true,
  }],
  groupLeader: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "LMS-User",
  },
  status: {
    type: String,
    enum: ['active', 'suspended', 'archived'],
    default: 'active',
  },
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

// Index for faster queries
groupSchema.index({ course: 1, institution: 1 });
groupSchema.index({ groupName: 1, course: 1 }, { unique: true });

// Enrollment Schema for single participants
const enrollmentSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "LMS-User",
    required: true,
  },
  status: {
    type: String,
    enum: ['active', 'suspended', 'completed', 'dropped'],
    default: 'active',
  },
  // Flags to track if custom dates are enabled
  enableEnrolmentDates: {
    type: Boolean,
    default: false,
  },
  // Custom enrollment dates (only used when enableEnrolmentDates is true)
  enrolmentStartsDate: {
    type: Date,
    default: null,
  },
  enrolmentEndsDate: {
    type: Date,
    default: null,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});
// Course Structure Schema with updated singleParticipants
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
  
  // Updated singleParticipants to be array of enrollment objects
  singleParticipants: [enrollmentSchema],

  groups: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: "Course-Group",
  }],

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

// Pre-save middleware to calculate enrolmentEndsDate
enrollmentSchema.pre('save', function(next) {
  if (!this.enrolmentEndsDate && this.enrolmentStartsDate && this.enrolmentDuration) {
    const endDate = new Date(this.enrolmentStartsDate);
    endDate.setDate(endDate.getDate() + this.enrolmentDuration);
    this.enrolmentEndsDate = endDate;
  }
  next();
});

module.exports = mongoose.model("Course-Structure", courseStructureSchema);