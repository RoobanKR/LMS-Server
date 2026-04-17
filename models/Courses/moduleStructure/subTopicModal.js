const mongoose = require("mongoose");

// ─── TEST CASE SCHEMA ─────────────────────────────────────────────────────────
const testCaseSchema = new mongoose.Schema(
  {
    input: { type: String },
    expectedOutput: { type: String },
    isSample: { type: Boolean, default: true },
    isHidden: { type: Boolean, default: true },
    points: { type: Number, default: 1 },
    explanation: String,
  },
  { _id: true }
);

// ─── SOLUTION SCHEMA ──────────────────────────────────────────────────────────
const solutionSchema = new mongoose.Schema(
  {
    startedCode: { type: String },
    functionName: { type: String },
    language: { type: String, default: "javascript" },
  },
  { _id: true }
);

// ─── HINT SCHEMA ──────────────────────────────────────────────────────────────
const hintSchema = new mongoose.Schema(
  {
    hintText: { type: String },
    pointsDeduction: { type: Number, default: 0 },
    isPublic: { type: Boolean, default: true },
    sequence: { type: Number, default: 0 },
  },
  { _id: true }
);

// ─── DESCRIPTION SCHEMA ───────────────────────────────────────────────────────
const descriptionSchema = new mongoose.Schema(
  {
    text: { type: String, default: "" },
    imageUrl: { type: String, default: null },
    imageAlignment: { type: String, enum: ["left", "center", "right"], default: "left" },
    imageSizePercent: { type: Number, min: 10, max: 100, default: 100 },
  },
  { _id: false, strict: false }
);

// ─── OPTION SCHEMA ────────────────────────────────────────────────────────────
// FIX: text is no longer required — non-option question types (matching, ordering,
// numeric, true-false, short-answer, essay) send mcqQuestionOptions: []
// so Mongoose must not enforce text on empty arrays.
const optionSchema = new mongoose.Schema({
  text: { type: String, default: "" },   // was required:true — removed
  isCorrect: { type: Boolean, default: false },
  imageUrl: { type: String, default: null },
  imageAlignment: { type: String, enum: ["left", "center", "right"], default: "left" },
  imageSizePercent: { type: Number, default: 100 },
});

// ─── MATCHING PAIR SCHEMA (NEW) ───────────────────────────────────────────────
const matchingPairSchema = new mongoose.Schema(
  {
    left: { type: String, default: "" },
    right: { type: String, default: "" },
  },
  { _id: true }
);

// ─── ORDERING ITEM SCHEMA (NEW) ───────────────────────────────────────────────
const orderingItemSchema = new mongoose.Schema(
  {
    text: { type: String, default: "" },
    order: { type: Number, default: 0 },
  },
  { _id: true }
);

// ─── QUESTION SCHEMA ──────────────────────────────────────────────────────────
const questionSchema = new mongoose.Schema(
  {
    questionType: { type: String },

    // ── MCQ Fields ────────────────────────────────────────────────────────────
    mcqQuestionTitle: { type: mongoose.Schema.Types.Mixed },
    mcqQuestionDescription: { type: String, default: "" },

    // FIX: Extended enum — was ['multiple_choice','dropdown','short_answer','essay','checkboxes']
    mcqQuestionType: {
      type: String,
      enum: [
        "multiple_choice",  // single correct answer (radio style)
        "multiple_select",  // multiple correct answers (checkbox style)
        "true_false",       // true / false
        "short_answer",     // short text answer
        "essay",            // long-form paragraph
        "dropdown",         // dropdown select
        "matching",         // left-right matching pairs
        "ordering",         // sequence / ordering
        "numeric",          // numeric answer with optional tolerance
        "checkboxes",       // legacy alias → maps to multiple_select on frontend
      ],
    },

    // FIX: No default difficulty — teacher must explicitly choose
    mcqQuestionDifficulty: {
      type: String,
      enum: ["easy", "medium", "hard"],
      // default removed intentionally
    },

    mcqQuestionScore: { type: Number },
    mcqQuestionTimeLimit: { type: Number },
    isActive: { type: Boolean, default: true },
    mcqQuestionOptionsPerRow: { type: Number },
    mcqQuestionRequired: { type: Boolean },
    hasOtherOption: { type: Boolean, default: false },
    hasExplanation: { type: Boolean, default: false },

    // Options — only populated for multiple_choice, multiple_select, dropdown, checkboxes
    // Empty array [] is sent for all other types to avoid text-required validation errors
    mcqQuestionOptions: [optionSchema],
    mcqQuestionCorrectAnswers: [{ type: String }],

    // Image fields
    mcqQuestionImageUrl: { type: String, default: null },
    mcqQuestionImageAlignment: { type: String, enum: ["left", "center", "right"] },
    mcqQuestionImageSizePercent: { type: Number },

    // ── NEW: Type-specific answer fields ──────────────────────────────────────

    // true_false answer
    trueFalseAnswer: { type: Boolean, default: null },

    // short_answer correct answer text
    shortAnswer: { type: String, default: "" },

    // numeric answer + optional tolerance band
    numericAnswer: { type: Number, default: null },
    numericTolerance: { type: Number, default: null },

    // matching pairs array
    matchingPairs: [matchingPairSchema],

    // ordering items array (correct sequence)
    orderingItems: [orderingItemSchema],
    // sequence within exercise
    sequence: { type: Number, default: 0 },

    // ── Programming Fields ────────────────────────────────────────────────────
    // programmingQuestionTitle stores rich content blocks (text/image/code)
    // exactly like mcqQuestionTitle — Mixed so it accepts array or string
    programmingQuestionDescription: { type: mongoose.Schema.Types.Mixed },
    title: { type: mongoose.Schema.Types.Mixed },
    description: { type: mongoose.Schema.Types.Mixed, default: { text: "" } },
    difficulty: { type: String },
    sampleInput: { type: String },
    sampleOutput: { type: String },
    score: { type: Number, min: 0, max: 100 },
    constraints: [{ type: String }],
    hints: [hintSchema],
    testCases: [testCaseSchema],
    solutions: solutionSchema,
    timeLimit: { type: Number, min: 0, max: 10000 },
    memoryLimit: { type: Number, min: 0, max: 1024 },




    // ── Database Fields ────────────────────────────────────────────────────────────
    sampleQuery: { type: String, default: '' },
    sampleResult: { type: mongoose.Schema.Types.Mixed, default: [] }, // array of content blocks
    isDatabase: { type: Boolean, default: false },
    moduleType: { type: String }, // 'Database', 'CoreProgramming', etc.
    databaseType: { type: String }, // kept for legacy but no longer required from frontend
    points: { type: Number, min: 0, max: 100 },
  },
  {
    _id: true,
    strict: false,
    minimize: false,
  }
);

// ─── SCORE SETTINGS SCHEMA ────────────────────────────────────────────────────
const scoreSettingsSchema = new mongoose.Schema(
  {
    scoreType: {
      type: String,
      enum: ["evenMarks", "separateMarks", "levelBasedMarks"],
    },
    evenMarks: { type: Number, min: 0, max: 100 },
    separateMarks: {
      general: [{ type: Number, min: 0, max: 100 }],
      levelBased: {
        easy: [{ type: Number, min: 0, max: 100 }],
        medium: [{ type: Number, min: 0, max: 100 }],
        hard: [{ type: Number, min: 0, max: 100 }],
      },
    },
    levelBasedMarks: {
      easy: { type: Number, default: 0, min: 0, max: 100 },
      medium: { type: Number, default: 0, min: 0, max: 100 },
      hard: { type: Number, default: 0, min: 0, max: 100 },
    },
    levelScoringConfiguration: {
      easy: {
        type: { type: String, enum: ["question_specific", "level_specific"], default: "level_specific" },
        totalMarks: { type: Number, min: 0, max: 1000, default: 0 },
        marksPerQuestion: { type: Number, min: 0, max: 100, default: 0 },
        questionCount: { type: Number, min: 0, max: 100, default: 0 },
      },
      medium: {
        type: { type: String, enum: ["question_specific", "level_specific"], default: "level_specific" },
        totalMarks: { type: Number, min: 0, max: 1000, default: 0 },
        marksPerQuestion: { type: Number, min: 0, max: 100, default: 0 },
        questionCount: { type: Number, min: 0, max: 100, default: 0 },
      },
      hard: {
        type: { type: String, enum: ["question_specific", "level_specific"], default: "level_specific" },
        totalMarks: { type: Number, min: 0, max: 1000, default: 0 },
        marksPerQuestion: { type: Number, min: 0, max: 100, default: 0 },
        questionCount: { type: Number, min: 0, max: 100, default: 0 },
      },
    },
    totalMarks: { type: Number, default: 0 },
  },
  { _id: false }
);

// ─── NOTIFICATION & GRADE SCHEMA ──────────────────────────────────────────────
const notificationGradeSchema = new mongoose.Schema(
  {
    notifyUsers: { type: Boolean, default: false },
    notifyGmail: { type: Boolean, default: false },
    notifyWhatsApp: { type: Boolean, default: false },
    gradeSheet: { type: Boolean, default: false },
  },
  { _id: false }
);



const availabilityPeriodSchema = new mongoose.Schema({
  startDate: { type: Date },
  // End date — actual submission deadline shown to students (replaces dueDate)
  endDate: { type: Date },
  // Cut-off date — optional hard late boundary (must be >= endDate)
  cutOffDate: { type: Date },
  cutOffEnabled: { type: Boolean, default: false },
  // Remind grader by
  remindGradeBy: { type: Date },
  remindGradeByEnabled: { type: Boolean, default: false },
  // Grace period
  gracePeriodAllowed: { type: Boolean, default: false },
  gracePeriodEnabled: { type: Boolean, default: false },
  gracePeriodDate: { type: Date },
  extendedDays: { type: Number, default: 0 },
});

// ─── NOTIFICATION SETTINGS SCHEMA (NEW — separate from grades)
const notificationSettingsSchema = new mongoose.Schema(
  {
    notifyUsers: { type: Boolean, default: false },
    notifyGmail: { type: Boolean, default: false },
    notifyWhatsApp: { type: Boolean, default: false },
    gradeSheet: { type: Boolean, default: true },
    notifyGradersSubmissions: { type: Boolean, default: false },
    notifyGradersLateSubmissions: { type: Boolean, default: false },
    notifyStudent: { type: Boolean, default: true },
  },
  { _id: false }
);

// ─── GRADE SETTINGS SCHEMA (NEW)
const gradeSettingsSchema = new mongoose.Schema(
  {
    // MCQ
    mcqGrade: { type: Number, default: null },   // auto = totalMarks (MCQ) or totalMarksMCQ (Combined)
    mcqGradeToPass: { type: Number, default: null },   // user-entered
    // Programming
    programmingGrade: { type: Number, default: null },   // auto = totalMarksProgramming or user for pure Programming
    programmingGradeToPass: { type: Number, default: null },   // user-entered
    // Combined (no separateMarks)
    combinedGrade: { type: Number, default: null },   // auto = totalMarksMCQ + totalMarksProgramming
    combinedGradeToPass: { type: Number, default: null },   // user-entered
    // Toggle
    separateMarks: { type: Boolean, default: false },
  },
  { _id: false }
);

// ─── ADDITIONAL OPTIONS SCHEMA (NEW)
const additionalOptionsSchema = new mongoose.Schema(
  {
    anonymousSubmissions: { type: Boolean, default: false },
    hideGraderIdentity: { type: Boolean, default: false },
  },
  { _id: false }
);



// ─── AVAILABILITY PERIOD SCHEMA ───────────────────────────────────────────────
// const availabilityPeriodSchema = new mongoose.Schema({
//   startDate:           { type: Date },
//   endDate:             { type: Date },
//   gracePeriodAllowed:  { type: Boolean },
//   gracePeriodDate:     { type: Date },
//   extendedDays:        { type: Number},
// });

// ─── MCQ QUESTION CONFIG SCHEMA ───────────────────────────────────────────────
const mcqQuestionConfigSchema = new mongoose.Schema(
  {
    totalMcqQuestions: { type: Number, default: 0, min: 0, max: 100 },
    marksPerQuestion: { type: Number, default: 0, min: 0, max: 100 },
    mcqTotalMarks: { type: Number, default: 0, min: 0, max: 100 },
    attemptLimitEnabled: { type: Boolean, default: false },
    submissionAttempts: { type: Number, default: 1, min: 1, max: 10 },
    shuffleQuestions: { type: Boolean, default: true },
    scoringType: {
      type: String,
      enum: ["equalDistribution", "questionSpecific", "levelSpecific"],
      default: "equalDistribution",
    },
  },
  { _id: false }
);

// ─── PROGRAMMING QUESTION CONFIG SCHEMA ──────────────────────────────────────
const programmingQuestionConfigSchema = new mongoose.Schema(
  {
    questionConfigType: {
      type: String,
      enum: ["general", "levelBased", "selectionLevel"],
    },
    generalQuestionCount: { type: Number, default: 0, min: 0, max: 100 },
    levelBasedCounts: {
      easy: { type: Number, default: 0, min: 0, max: 100 },
      medium: { type: Number, default: 0, min: 0, max: 100 },
      hard: { type: Number, default: 0, min: 0, max: 100 },
    },
    selectionLevelCounts: {
      easy: { type: Number, default: 0, min: 0, max: 100 },
      medium: { type: Number, default: 0, min: 0, max: 100 },
      hard: { type: Number, default: 0, min: 0, max: 100 },
    },
    scoreSettings: { type: scoreSettingsSchema },
    attemptLimitEnabled: { type: Boolean, default: false },
    submissionAttempts: { type: Number, default: 1, min: 1, max: 10 },
    questionFlow: { type: String, enum: ["freeFlow", "controlled"], default: "freeFlow" },
    allowCodeExecution: { type: Boolean, default: true },
    enableTestCases: { type: Boolean, default: true },
    showSampleCases: { type: Boolean, default: true },
  },
  { _id: false }
);


// ─── PROGRAMMING SETTINGS SCHEMA ─────────────────────────────────────────────
const programmingSettingsSchema = new mongoose.Schema({
  selectedModule: { type: String },
  selectedLanguages: [{ type: String }],
});

// ─── EXERCISE INFORMATION SCHEMA ──────────────────────────────────────────────
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
  totalMarksMCQ: { type: Number, default: 0 },
  totalMarksProgramming: { type: Number, default: 0 },
  totalMarks: { type: Number, default: 0 },
});

// ─── CONFIGURATION TYPE SCHEMA ────────────────────────────────────────────────
const configurationTypeSettSchema = new mongoose.Schema({
  mcqMode: { type: Boolean, default: false },
  programmingMode: { type: Boolean, default: false },
  combinedMode: { type: Boolean, default: false },
  otherMode: { type: Boolean, default: false },
});

// ─── OTHERS QUESTION CONFIG SCHEMA ───────────────────────────────────────────
const othersQuestionConfigSchema = new mongoose.Schema(
  {
    totalQuestions: { type: Number, default: 0, min: 0 },
    scoringType: {
      type: String,
      enum: ["equalDistribution", "questionSpecific", "levelBased"],
      default: "equalDistribution",
    },
    marksPerQuestion: { type: Number, default: 0, min: 0 },
    totalMarks: { type: Number, default: 0, min: 0 },
    levelBasedCounts: {
      easy:   { type: Number, default: 0, min: 0 },
      medium: { type: Number, default: 0, min: 0 },
      hard:   { type: Number, default: 0, min: 0 },
    },
    levelBasedMarks: {
      easy:   { type: Number, default: 0, min: 0 },
      medium: { type: Number, default: 0, min: 0 },
      hard:   { type: Number, default: 0, min: 0 },
    },
    attemptLimitEnabled: { type: Boolean, default: false },
    submissionAttempts: { type: Number, default: 1, min: 1, max: 10 },
  },
  { _id: false }
);

// ─── QUESTION CONFIGURATION SCHEMA ───────────────────────────────────────────
const questionConfigurationSchema = new mongoose.Schema(
  {
    mcqQuestionConfiguration: { type: mcqQuestionConfigSchema },
    programmingQuestionConfiguration: { type: programmingQuestionConfigSchema },
    othersQuestionConfiguration: { type: othersQuestionConfigSchema },
  },
  { _id: false, strict: false }
);

// ─── EXERCISE SCHEMA ──────────────────────────────────────────────────────────
const exerciseSchema = new mongoose.Schema(
  {
    exerciseType: { type: String },
    configurationType: configurationTypeSettSchema,
    programmingSettings: { type: programmingSettingsSchema },
    exerciseInformation: exerciseInformationSchema,
    questionConfiguration: questionConfigurationSchema,
    availabilityPeriod: availabilityPeriodSchema,
    notificationSettings: { type: notificationSettingsSchema },
    gradeSettings: { type: gradeSettingsSchema },
    additionalOptions: { type: additionalOptionsSchema },
    // keep legacy field so old data still reads correctly
    questions: [questionSchema],
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
    createdBy: String,
    updatedBy: String,
    version: { type: Number, default: 1 },
  },
  { _id: true, strict: false }
);

// Pre-save middleware for exerciseSchema
exerciseSchema.pre("save", function (next) {
  if (this.questions && Array.isArray(this.questions)) {
    this.exerciseInformation.totalQuestions = this.questions.length;
    this.exerciseInformation.totalPoints = this.questions.reduce(
      (total, question) => total + (question.score || 0),
      0
    );
  }

  if (this.questionConfiguration?.programmingQuestionConfiguration?.scoreSettings) {
    const scoreSettings =
      this.questionConfiguration.programmingQuestionConfiguration.scoreSettings;
    const programmingConfig =
      this.questionConfiguration.programmingQuestionConfiguration;

    const calculateMarks = (scoreSettings, programmingConfig) => {
      const { scoreType, evenMarks, separateMarks, levelBasedMarks, levelScoringStrategies } =
        scoreSettings;
      let totalMarks = 0;

      if (scoreType === "evenMarks") {
        if (programmingConfig.questionConfigType === "general") {
          return (programmingConfig.generalQuestionCount || 0) * evenMarks;
        } else {
          const counts = programmingConfig.levelBasedCounts || { easy: 0, medium: 0, hard: 0 };
          return (counts.easy + counts.medium + counts.hard) * evenMarks;
        }
      } else if (scoreType === "levelBasedMarks") {
        if (levelScoringStrategies) {
          let counts = programmingConfig.levelBasedCounts || { easy: 0, medium: 0, hard: 0 };
          Object.keys(levelScoringStrategies).forEach((level) => {
            const strategy = levelScoringStrategies[level];
            const count = counts[level] || 0;
            if (strategy.type === "level_specific" && strategy.marks) {
              totalMarks += count * strategy.marks;
            }
          });
          return totalMarks;
        } else {
          let counts = programmingConfig.levelBasedCounts || { easy: 0, medium: 0, hard: 0 };
          return (
            (counts.easy || 0) * (levelBasedMarks.easy || 0) +
            (counts.medium || 0) * (levelBasedMarks.medium || 0) +
            (counts.hard || 0) * (levelBasedMarks.hard || 0)
          );
        }
      } else if (scoreType === "separateMarks") {
        if (programmingConfig.questionConfigType === "general") {
          return (separateMarks.general || []).reduce((sum, mark) => sum + mark, 0);
        } else {
          const easyMarks = (separateMarks.levelBased?.easy || []).reduce((sum, mark) => sum + mark, 0);
          const mediumMarks = (separateMarks.levelBased?.medium || []).reduce((sum, mark) => sum + mark, 0);
          const hardMarks = (separateMarks.levelBased?.hard || []).reduce((sum, mark) => sum + mark, 0);
          return easyMarks + mediumMarks + hardMarks;
        }
      }
      return 0;
    };

    this.questionConfiguration.programmingQuestionConfiguration.scoreSettings.totalMarks =
      calculateMarks(scoreSettings, programmingConfig);
  }

  this.updatedAt = new Date();
  next();
});

// ─── TAG SCHEMA ───────────────────────────────────────────────────────────────
const tagSchema = new mongoose.Schema({
  tagName: { type: String },
  tagColor: { type: String, default: "#000000" },
});

// ─── FILE MCQ OPTION SCHEMA ───────────────────────────────────────────────────
const fileMCOptionSchema = new mongoose.Schema({
  text: { type: String, default: "" },  // also changed from required to default
  isCorrect: { type: Boolean, default: false },
  imageUrl: { type: String, default: null },
  imageAlignment: { type: String, enum: ["left", "center", "right"] },
  imageSizePercent: { type: Number },
});

// ─── FILE MCQ QUESTION SCHEMA ─────────────────────────────────────────────────
const fileMcqQuestionSchema = new mongoose.Schema(
  {
    isActive: { type: Boolean, default: true },
    sequence: { type: Number, required: true },
    timestamp: { type: Number, required: true, min: 0 },
    videoTimestamp: { type: Number, required: true, min: 0 },
    mcqQuestion: {
      questionTitle: { type: String },
      options: [fileMCOptionSchema],
      correctAnswers: [{ type: String }],
      mcqQuestionType: {
        type: String,
        enum: [
          "multiple_choice", "multiple_select", "true_false",
          "short_answer", "essay", "dropdown",
          "matching", "ordering", "numeric",
          "checkboxes", // legacy
        ],
      },
      mcqQuestionOptionsPerRow: { type: Number },
      mcqQuestionRequired: { type: Boolean },
      explanation: { type: String, default: "" },
      // New answer fields
      trueFalseAnswer: { type: Boolean, default: null },
      shortAnswer: { type: String, default: "" },
      numericAnswer: { type: Number, default: null },
      numericTolerance: { type: Number, default: null },
      matchingPairs: [matchingPairSchema],
      orderingItems: [orderingItemSchema],
    },
  },
  { timestamps: true, _id: true }
);

// ─── FILE SCHEMA ──────────────────────────────────────────────────────────────
const fileSchema = new mongoose.Schema(
  {
    fileName: String,
    fileType: String,
    size: String,
    uploadedAt: { type: Date, default: Date.now },
    tags: [tagSchema],
    fileUrl: { type: Map, of: String, default: {} },
    isVideo: { type: Boolean, default: false },
    isReference: { type: Boolean },
    availableResolutions: [String],
    mcqQuestions: [fileMcqQuestionSchema],
    fileDescription: { type: String, default: "" },
    fileSettings: {
      showToStudents: { type: Boolean, default: true },
      allowDownload: { type: Boolean, default: true },
      lastModified: { type: Date, default: Date.now },
    },
  },
  { _id: true, strict: false }
);


// ─── Reusable Page Document Schema ───────────────────────────────────────────
const pageDocSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    blocks: { type: mongoose.Schema.Types.Mixed, default: [] },
    combinedCode: { type: String, default: "" },
    // Stores each page's data for multi-page documents
    pagesData: [{
      id: { type: String },
      name: { type: String },
      html: { type: String },
      blocks: { type: mongoose.Schema.Types.Mixed },
    }],
    isMultiPage: { type: Boolean, default: false },
    pageCount: { type: Number, default: 1 },
    version: { type: String, default: "1.0.0" },
    folderId: { type: String, default: null },
    folderPath: [{ type: String }],
    createdBy: { type: String },
    updatedBy: { type: String },
  },
  { _id: true, timestamps: true }
)

// ─── FOLDER SCHEMA ────────────────────────────────────────────────────────────
const folderSchema = new mongoose.Schema(
  {
    name: { type: String },
    files: [fileSchema],
    subfolders: { type: mongoose.Schema.Types.Mixed, default: [] },  // ← FIX
    tags: [tagSchema],
    pages: [
      {
        _id: { type: mongoose.Schema.Types.ObjectId, auto: true },
        title: { type: String, required: true },
        blocks: { type: mongoose.Schema.Types.Mixed },
        combinedCode: { type: String },
        createdAt: { type: Date, default: Date.now },
        updatedAt: { type: Date, default: Date.now },
        version: { type: String, default: "1.0.0" },
        folderId: { type: String, default: null },
        folderPath: [{ type: String }],
        createdBy: { type: String },
        updatedBy: { type: String },
      },
    ],
  },
  { _id: true }
);

// ─── PEDAGOGY ELEMENT SCHEMA ──────────────────────────────────────────────────
const pedagogyElementSchema = new mongoose.Schema(
  {
    description: { type: mongoose.Schema.Types.Mixed, default: { text: "" } },
    files: [fileSchema],
    folders: [folderSchema],
    pages: [
      {
        _id: { type: mongoose.Schema.Types.ObjectId, auto: true },
        title: { type: String, required: true },
        blocks: { type: mongoose.Schema.Types.Mixed },
        combinedCode: { type: String },
        createdAt: { type: Date, default: Date.now },
        updatedAt: { type: Date, default: Date.now },
        version: { type: String, default: "1.0.0" },
        folderId: { type: String, default: null },
        folderPath: [{ type: String }],
        createdBy: { type: String },
        updatedBy: { type: String },
      },
    ],
  },
  { strict: false }
);

// ─── PEDAGOGY SCHEMA ──────────────────────────────────────────────────────────
const pedagogySchema = new mongoose.Schema(
  {
    I_Do: { type: Map, of: pedagogyElementSchema, default: {} },
    We_Do: { type: Map, of: [exerciseSchema], default: {} },
    You_Do: { type: Map, of: [exerciseSchema], default: {} },
  },
  { strict: false }
);


const subTopicSchema = new mongoose.Schema({
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
  topicId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Topic1",
  },
  title: { type: String, required: true },
  description: String,
  duration: String,
  level: String,
  index: Number,
  pedagogy: pedagogySchema, // ✅ dynamic pedagogy
  testConfiguration: {
    coreProgram: [{ type: String }],
    frontend: [{ type: String }],
    database: [{ type: String }]
  },
  createdAt: { type: Date, default: Date.now },
  createdBy: String,
  updatedAt: { type: Date, default: Date.now },
  updatedBy: String,
}, { 
  strict: false,
  minimize: false
});

// ─── TOPIC PRE-SAVE MIDDLEWARE ────────────────────────────────────────────────
subTopicSchema.pre("save", function (next) {
  try {
    this.updatedAt = new Date();
    next();
  } catch (error) {
    console.error("Error in pre-save middleware:", error);
    next();
  }
});

module.exports = mongoose.model("SubTopic1", subTopicSchema);
