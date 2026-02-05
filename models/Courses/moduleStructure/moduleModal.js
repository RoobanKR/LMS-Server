const mongoose = require("mongoose");

// Test Case Schema
const testCaseSchema = new mongoose.Schema(
  {
    input: { type: String },
    expectedOutput: { type: String },
    isSample: { type: Boolean, default: true },
    isHidden: { type: Boolean, default: true },
    points: { type: Number, default: 1 },
    explanation: String,
  },
  { _id: true, required: false, },
);

const solutionSchema = new mongoose.Schema(
  {
    startedCode: { type: String },
    functionName: { type: String },
    language: { type: String, default: true },
  },
  { _id: true , required: false,},
);

// Hint Schema
const hintSchema = new mongoose.Schema(
  {
    hintText: { type: String },
    pointsDeduction: { type: Number, default: 0 },
    isPublic: { type: Boolean, default: true },
    sequence: { type: Number, default: 0 },

  },
  { _id: true, required: false, },
);





// Question Schema
const questionSchema = new mongoose.Schema(
  {
    questionType: { type: String},
    //MCQ Specific Fields
    questionTitle: {
      type: String,
      required: false,
      trim: true,
    },
    options: [{ type: String }],
    correctAnswer: { type: String },

    //Programming Specific Fields
      title: {
      type: String,
      required: false,
      trim: true,
    },
    description: { type: String },
    difficulty: {
      type: String,
      
    },
    sampleInput: { type: String },
    sampleOutput: { type: String },
    score: {
      type: Number,
      min: 0,
      max: 100,
    },
    constraints: [{ type: String, required: false, }],
    hints: [hintSchema],
    testCases: [testCaseSchema],
    solutions: solutionSchema,
    timeLimit: {
      type: Number,
      min: 0,
      max: 10000,
    },
    memoryLimit: {
      type: Number,
     
      min: 0,
      max: 1024,
    },
    isActive: { type: Boolean, default: true },
  },
  { _id: true },
);

// Score Settings Schema (ADDED)
const scoreSettingsSchema = new mongoose.Schema(
  {
    scoreType: {
      type: String,
      enum: ["evenMarks", "separateMarks", "levelBasedMarks"],
    },
    evenMarks: {
      type: Number,
      min: 0,
      max: 100,
    },
    separateMarks: {
      general: [
        {
          type: Number,
          min: 0,
          max: 100,
        },
      ],
      levelBased: {
        easy: [
          {
            type: Number,
            min: 0,
            max: 100,
          },
        ],
        medium: [
          {
            type: Number,
            min: 0,
            max: 100,
          },
        ],
        hard: [
          {
            type: Number,
            min: 0,
            max: 100,
          },
        ],
      },
    },
    levelBasedMarks: {
      easy: {
        type: Number,
        default: 0,
        min: 0,
        max: 100,
      },
      medium: {
        type: Number,
        default: 0,
        min: 0,
        max: 100,
      },
      hard: {
        type: Number,
        default: 0,
        min: 0,
        max: 100,
      },
    },
    totalMarks: { type: Number, default: 0 },
  },
  { _id: false },
);
const notificationGradeSchema = new mongoose.Schema(
  {
    notifyUsers: { type: Boolean, default: false },
    notifyGmail: { type: Boolean, default: false },
    notifyWhatsApp: { type: Boolean, default: false },
    gradeSheet: { type: Boolean, default: false },
  },
  { _id: false },
);
// Availability Period Schema
const availabilityPeriodSchema = new mongoose.Schema({
  startDate: { type: Date },
  endDate: { type: Date },
  gracePeriodAllowed: { type: Boolean, default: false },
  gracePeriodDate: { type: Date },
  extendedDays: { type: Number, default: 0 },
});
const mcqQuestionConfigSchema = new mongoose.Schema(
  {
    totalMcqQuestions: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    marksPerQuestion: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    mcqTotalMarks: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    attemptLimitEnabled: { type: Boolean, default: false },
    submissionAttempts: {
      type: Number,
      default: 1,
      min: 1,
      max: 10,
    },
    shuffleQuestions: { type: Boolean, default: true },
  },
  { _id: false },
);

const programmingQuestionConfigSchema = new mongoose.Schema(
  {
    questionConfigType: {
      type: String,
      enum: ["general", "levelBased", "selectionLevel"],
      required: false,
    },
    generalQuestionCount: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
      required: false,
    },
    levelBasedCounts: {
      easy: {
        type: Number,
        default: 0,
        min: 0,
        max: 100,
        required: false,
      },
      medium: {
        type: Number,
        default: 0,
        min: 0,
        max: 100,
        required: false,
      },
      hard: {
        type: Number,
        default: 0,
        min: 0,
        max: 100,
        required: false,
      },
    },
    selectionLevelCounts: {
      easy: {
        type: Number,
        default: 0,
        min: 0,
        max: 100,
        required: false,
      },
      medium: {
        type: Number,
        default: 0,
        min: 0,
        max: 100,
        required: false,
      },
      hard: {
        type: Number,
        default: 0,
        min: 0,
        max: 100,
        required: false,
      },
    },
    scoreSettings: {
      type: scoreSettingsSchema,
      required: false,
    },
    attemptLimitEnabled: { type: Boolean, default: false },
    submissionAttempts: {
      type: Number,
      default: 1,
      min: 1,
      max: 10,
    },
    questionFlow: {
      type: String,
      enum: ["freeFlow", "controlled"],
      default: "freeFlow",
    },
    allowCodeExecution: { type: Boolean, default: true },
    enableTestCases: { type: Boolean, default: true },
    showSampleCases: { type: Boolean, default: true },
  },
  { _id: false },
);

// Programming Settings Schema
const programmingSettingsSchema = new mongoose.Schema({
  selectedModule: {
    type: String,
  },
  selectedLanguages: [{ type: String }],
});

// Exercise Information Schema
const exerciseInformationSchema = new mongoose.Schema({
  exerciseId: { type: String, required: true },
  exerciseName: { type: String, required: true },
  description: String,
  exerciseLevel: {
    type: String,
    enum: ["beginner", "intermediate", "expert"],
    default: "beginner",
  },
  totalDuration: { type: Number },
});
const configurationTypeSettSchema = new mongoose.Schema({
  mcqMode: { type: Boolean, default: false },
  programmingMode: { type: Boolean, default: false },
  combinedMode: { type: Boolean, default: false },
});
const questionConfiguration = new mongoose.Schema(
  {
    mcqQuestionConfiguration: {
      type: mcqQuestionConfigSchema,
      required: false,
    },
    programmingQuestionConfiguration: {
      type: programmingQuestionConfigSchema,
      required: false,
    },
  },
  { _id: false },
);

// Main Exercise Schema
const exerciseSchema = new mongoose.Schema(
  {
    exerciseType: {
      type: String,
    },
    configurationType: configurationTypeSettSchema,

    programmingSettings: {
      type: programmingSettingsSchema,
      required: false,
    },

    exerciseInformation: exerciseInformationSchema,

    questionConfiguration: questionConfiguration,

    availabilityPeriod: availabilityPeriodSchema,
    notificatonandGradeSettings: notificationGradeSchema,
    questions: [questionSchema],
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
    createdBy: String,
    updatedBy: String,
    version: { type: Number, default: 1 },
  },
  { _id: true },
);

// Pre-save middleware to update total points and questions count
exerciseSchema.pre("save", function (next) {
  // Calculate total points and questions
  if (this.questions && Array.isArray(this.questions)) {
    this.exerciseInformation.totalQuestions = this.questions.length;
    this.exerciseInformation.totalPoints = this.questions.reduce(
      (total, question) => {
        return total + (question.points || 0);
      },
      0,
    );
  }

  // Calculate total marks from score settings if it exists
  if (this.scoreSettings) {
    const config = this.programmingSettings?.levelConfiguration || {
      levelType: "levelBased",
      levelBased: { easy: 0, medium: 0, hard: 0 },
      general: 0,
    };

    // Helper function to calculate marks
    const calculateMarks = (scoreSettings, levelConfig) => {
      const { scoreType, evenMarks, separateMarks, levelBasedMarks } =
        scoreSettings;

      if (scoreType === "evenMarks") {
        if (levelConfig.levelType === "general") {
          return levelConfig.general * evenMarks;
        } else {
          const { easy, medium, hard } = levelConfig.levelBased;
          return (easy + medium + hard) * evenMarks;
        }
      } else if (scoreType === "levelBasedMarks") {
        const { easy, medium, hard } = levelConfig.levelBased;
        return (
          easy * levelBasedMarks.easy +
          medium * levelBasedMarks.medium +
          hard * levelBasedMarks.hard
        );
      } else if (scoreType === "separateMarks") {
        if (levelConfig.levelType === "general") {
          return separateMarks.general.reduce((sum, mark) => sum + mark, 0);
        } else {
          const easyMarks = separateMarks.levelBased.easy.reduce(
            (sum, mark) => sum + mark,
            0,
          );
          const mediumMarks = separateMarks.levelBased.medium.reduce(
            (sum, mark) => sum + mark,
            0,
          );
          const hardMarks = separateMarks.levelBased.hard.reduce(
            (sum, mark) => sum + mark,
            0,
          );
          return easyMarks + mediumMarks + hardMarks;
        }
      }
      return 0;
    };

    this.scoreSettings.totalMarks = calculateMarks(this.scoreSettings, config);
  }

  // Update timestamp
  this.updatedAt = Date.now();

  next();
});

// Tag Schema
const tagSchema = new mongoose.Schema({
  tagName: { type: String },
  tagColor: { type: String, default: "#000000" },
});

// File Schema
const fileSchema = new mongoose.Schema(
  {
    fileName: String,
    fileType: String,
    size: String,
    uploadedAt: { type: Date, default: Date.now },
    tags: [tagSchema],
    fileUrl: {
      type: Map,
      of: String,
      default: {},
    },
    isVideo: { type: Boolean, default: false },
    isReference: { type: Boolean },
    availableResolutions: [String],
    fileSettings: {
      showToStudents: { type: Boolean, default: false },
      allowDownload: { type: Boolean, default: true },
      lastModified: { type: Date, default: Date.now },
    },
  },
  { _id: true },
);

// Folder Schema
const folderSchema = new mongoose.Schema(
  {
    name: { type: String },
    files: [fileSchema],
    subfolders: [this],
    tags: [tagSchema],
  },
  { _id: true },
);

// Pedagogy Element Schema for I_Do and You_Do
const pedagogyElementSchema = new mongoose.Schema({
  description: String,
  files: [fileSchema],
  folders: [folderSchema],
});

// Pedagogy Schema
const pedagogySchema = new mongoose.Schema({
  I_Do: {
    type: Map,
    of: pedagogyElementSchema,
    default: {},
  },
  We_Do: {
    type: Map,
    of: [exerciseSchema],
    default: {},
  },
  You_Do: {
    type: Map,
    of: [exerciseSchema],
    default: {},
  },
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