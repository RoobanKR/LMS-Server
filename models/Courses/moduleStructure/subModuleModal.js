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
  { _id: true }
);

const solutionSchema = new mongoose.Schema(
  {
    startedCode: { type: String },
    functionName: { type: String },
    language: { type: String, default: "javascript" },
  },
  { _id: true }
);

// Hint Schema
const hintSchema = new mongoose.Schema(
  {
    hintText: { type: String },
    pointsDeduction: { type: Number, default: 0 },
    isPublic: { type: Boolean, default: true },
    sequence: { type: Number, default: 0 },
  },
  { _id: true }
);

// FIXED: More flexible description schema
const descriptionSchema = new mongoose.Schema({
  text: { type: String, default: '' },
  imageUrl: { type: String, default: null },
  imageAlignment: { 
    type: String, 
    enum: ['left', 'center', 'right'],
    default: 'left'
  },
  imageSizePercent: { 
    type: Number, 
    min: 10, 
    max: 100,
    default: 100
  }
}, { 
  _id: false, 
  strict: false
});

const optionSchema = new mongoose.Schema({
  text: { type: String, required: true },
  isCorrect: { type: Boolean, default: false },
  imageUrl: { type: String, default: null },
  imageAlignment: { type: String, enum: ['left', 'center', 'right']},
  imageSizePercent: { type: Number }
});

// FIXED: Question Schema with flexible description
const questionSchema = new mongoose.Schema(
  {
    questionType: { type: String },
    //MCQ Specific Fields
    mcqQuestionTitle: { type: String },
    mcqQuestionDescription: { type: String, default: '' },
    mcqQuestionType: {
      type: String,
      enum: ['multiple_choice', 'multiple_select', 'true_false', 'short_answer', 'essay', 'dropdown', 'matching', 'ordering', 'numeric', 'checkboxes'],
    },

    mcqQuestionDifficulty: {
      type: String,
      enum: ['easy', 'medium', 'hard'],
      default: 'medium'
    },
    mcqQuestionScore: { type: Number },
    mcqQuestionTimeLimit: { type: Number },
    isActive: { type: Boolean, default: true },
    mcqQuestionOptionsPerRow: { type: Number },
    mcqQuestionRequired: { type: Boolean },
    mcqQuestionOptions: [optionSchema],
    mcqQuestionCorrectAnswers: [{ type: String }],

    //Programming Specific Fields
    title: { type: String, trim: true },
    // FIXED: Make description flexible - can be string or object
    description: {
      type: mongoose.Schema.Types.Mixed,
      default: { text: '' }
    },
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
    isActive: { type: Boolean, default: true },
  },
  { 
    _id: true,
    strict: false,
    minimize: false
  }
);

// Score Settings Schema
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
        questionCount: { type: Number, min: 0, max: 100, default: 0 }
      },
      medium: {
        type: { type: String, enum: ["question_specific", "level_specific"], default: "level_specific" },
        totalMarks: { type: Number, min: 0, max: 1000, default: 0 },
        marksPerQuestion: { type: Number, min: 0, max: 100, default: 0 },
        questionCount: { type: Number, min: 0, max: 100, default: 0 }
      },
      hard: {
        type: { type: String, enum: ["question_specific", "level_specific"], default: "level_specific" },
        totalMarks: { type: Number, min: 0, max: 1000, default: 0 },
        marksPerQuestion: { type: Number, min: 0, max: 100, default: 0 },
        questionCount: { type: Number, min: 0, max: 100, default: 0 }
      }
    },
    totalMarks: { type: Number, default: 0 },
  },
  { _id: false }
);

const notificationGradeSchema = new mongoose.Schema(
  {
    notifyUsers: { type: Boolean, default: false },
    notifyGmail: { type: Boolean, default: false },
    notifyWhatsApp: { type: Boolean, default: false },
    gradeSheet: { type: Boolean, default: false },
  },
  { _id: false }
);

// Availability Period Schema
const availabilityPeriodSchema = new mongoose.Schema({
  startDate: { type: Date },
  endDate: { type: Date },
  cutOffDate: { type: Date },
  cutOffEnabled: { type: Boolean, default: false },
  remindGradeBy: { type: Date },
  remindGradeByEnabled: { type: Boolean, default: false },
  gracePeriodAllowed: { type: Boolean, default: false },
  gracePeriodEnabled: { type: Boolean, default: false },
  gracePeriodDate: { type: Date },
  extendedDays: { type: Number, default: 0 },
});

// ─── NOTIFICATION SETTINGS SCHEMA
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

// ─── GRADE SETTINGS SCHEMA
const gradeSettingsSchema = new mongoose.Schema(
  {
    mcqGrade: { type: Number, default: null },
    mcqGradeToPass: { type: Number, default: null },
    programmingGrade: { type: Number, default: null },
    programmingGradeToPass: { type: Number, default: null },
    combinedGrade: { type: Number, default: null },
    combinedGradeToPass: { type: Number, default: null },
    separateMarks: { type: Boolean, default: false },
  },
  { _id: false }
);

// ─── ADDITIONAL OPTIONS SCHEMA
const additionalOptionsSchema = new mongoose.Schema(
  {
    anonymousSubmissions: { type: Boolean, default: false },
    hideGraderIdentity: { type: Boolean, default: false },
  },
  { _id: false }
);

const mcqQuestionConfigSchema = new mongoose.Schema(
  {
    totalMcqQuestions: { type: Number, default: 0, min: 0, max: 100 },
    marksPerQuestion: { type: Number, default: 0, min: 0, max: 100 },
    mcqTotalMarks: { type: Number, default: 0, min: 0, max: 100 },
    attemptLimitEnabled: { type: Boolean, default: false },
    submissionAttempts: { type: Number, default: 1, min: 1, max: 10 },
    shuffleQuestions: { type: Boolean, default: true },
     scoringType: { type: String, enum: ['equalDistribution', 'questionSpecific', 'levelSpecific'], default: 'equalDistribution' } // ← ADD THIS
  },
  { _id: false }
);

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

const programmingSettingsSchema = new mongoose.Schema({
  selectedModule: { type: String },
  selectedLanguages: [{ type: String }],
});

const exerciseInformationSchema = new mongoose.Schema({
  exerciseId: { type: String, required: true },
  exerciseName: { type: String, required: true },
  description: String,
  exerciseLevel: { type: String, enum: ["beginner", "intermediate", "expert"], default: "beginner" },
  totalDuration: { type: Number },
  totalMarksMCQ: { type: Number, default: 0 },
  totalMarksProgramming: { type: Number, default: 0 },
  totalMarks: { type: Number, default: 0 },
});

const configurationTypeSettSchema = new mongoose.Schema({
  mcqMode: { type: Boolean, default: false },
  programmingMode: { type: Boolean, default: false },
  combinedMode: { type: Boolean, default: false },
  otherMode: { type: Boolean, default: false },
});

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

const questionConfiguration = new mongoose.Schema(
  {
    mcqQuestionConfiguration: { type: mcqQuestionConfigSchema },
    programmingQuestionConfiguration: { type: programmingQuestionConfigSchema },
    othersQuestionConfiguration: { type: othersQuestionConfigSchema },
  },
  { _id: false, strict: false }
);

// Main Exercise Schema
const exerciseSchema = new mongoose.Schema(
  {
    exerciseType: { type: String },
    configurationType: configurationTypeSettSchema,
    programmingSettings: { type: programmingSettingsSchema },
    exerciseInformation: exerciseInformationSchema,
    questionConfiguration: questionConfiguration,
    availabilityPeriod: availabilityPeriodSchema,
    notificationSettings: { type: notificationSettingsSchema },
    gradeSettings: { type: gradeSettingsSchema },
    additionalOptions: { type: additionalOptionsSchema },
    // legacy field kept so old data reads correctly
    notificatonandGradeSettings: notificationGradeSchema,
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
      (total, question) => total + (question.score || 0), 0
    );
  }

  if (this.questionConfiguration?.programmingQuestionConfiguration?.scoreSettings) {
    const scoreSettings = this.questionConfiguration.programmingQuestionConfiguration.scoreSettings;
    const programmingConfig = this.questionConfiguration.programmingQuestionConfiguration;
    
    let totalMarks = 0;

    const calculateMarks = (scoreSettings, programmingConfig) => {
      const { scoreType, evenMarks, separateMarks, levelBasedMarks, levelScoringStrategies } = scoreSettings;

      if (scoreType === "evenMarks") {
        if (programmingConfig.questionConfigType === "general") {
          return (programmingConfig.generalQuestionCount || 0) * evenMarks;
        } else {
          const counts = programmingConfig.levelBasedCounts || { easy: 0, medium: 0, hard: 0 };
          return (counts.easy + counts.medium + counts.hard) * evenMarks;
        }
      } 
      else if (scoreType === "levelBasedMarks") {
        if (levelScoringStrategies) {
          let counts = programmingConfig.levelBasedCounts || { easy: 0, medium: 0, hard: 0 };
          
          Object.keys(levelScoringStrategies).forEach(level => {
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
      } 
      else if (scoreType === "separateMarks") {
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

// Tag Schema
const tagSchema = new mongoose.Schema({
  tagName: { type: String },
  tagColor: { type: String, default: "#000000" },
});

const fileMCOptionSchema = new mongoose.Schema({
  text: { type: String },
  isCorrect: { type: Boolean, default: false },
  imageUrl: { type: String, default: null },
  imageAlignment: { type: String, enum: ['left', 'center', 'right']},
  imageSizePercent: { type: Number }
});
const fileMcqQuestionSchema = new mongoose.Schema({
 
  isActive: {
    type: Boolean,
    default: true
  },
  sequence: {
    type: Number,
    required: true
  },
  timestamp: {
    type: Number,
    required: true,
    min: 0
  },
  videoTimestamp: {
    type: Number,
    required: true,
    min: 0
  },
  mcqQuestion: {
    questionTitle: {
      type: String,
    },
    
    options: [fileMCOptionSchema],
   
    correctAnswers: [{
      type: String,
    }],
        mcqQuestionType: { 
      type: String, 
      enum: ['multiple_choice', 'dropdown', 'short_answer', 'essay', 'checkboxes'],
    },
      mcqQuestionOptionsPerRow: { type: Number },
    mcqQuestionRequired: { type: Boolean },
explanation: {
      type: String,
      default: ''
    }  }
}, {
  timestamps: true,
  _id: true
});
// File Schema
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

    fileDescription: { type: String, default: '' }, // Added file description
    fileSettings: {
      showToStudents: { type: Boolean, default: true },
      allowDownload: { type: Boolean, default: true },
      lastModified: { type: Date, default: Date.now },
    },
  },
  { _id: true, strict: false }
);

// Folder Schema
const folderSchema = new mongoose.Schema(
  {
    name: { type: String },
    files: [fileSchema],
    subfolders: [this],
    tags: [tagSchema],
     pages: [{
    _id: { type: mongoose.Schema.Types.ObjectId, auto: true },
    title: { type: String, required: true },
    blocks: { type: mongoose.Schema.Types.Mixed }, // Store individual page blocks
    combinedCode: { type: String }, // Store the combined HTML for all pages
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
    version: { type: String, default: "1.0.0" },
    folderId: { type: String, default: null },
    folderPath: [{ type: String }],
    createdBy: { type: String },
    updatedBy: { type: String }
  }]
  },
  { _id: true }
);


const pedagogyElementSchema = new mongoose.Schema({
  description: { type: mongoose.Schema.Types.Mixed, default: { text: '' } },
  files: [fileSchema],
  folders: [folderSchema],
  pages: [{
    _id: { type: mongoose.Schema.Types.ObjectId, auto: true },
    title: { type: String, required: true },
    blocks: { type: mongoose.Schema.Types.Mixed }, // Store individual page blocks
    combinedCode: { type: String }, // Store the combined HTML for all pages
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
    version: { type: String, default: "1.0.0" },
    folderId: { type: String, default: null },
    folderPath: [{ type: String }],
    createdBy: { type: String },
    updatedBy: { type: String }
  }]
}, { strict: false });
// Pedagogy Schema
const pedagogySchema = new mongoose.Schema({
  I_Do: { type: Map, of: pedagogyElementSchema, default: {} },
  We_Do: { type: Map, of: [exerciseSchema], default: {} },
  You_Do: { type: Map, of: [exerciseSchema], default: {} },
}, { strict: false });


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

// FIXED: Safe pre-save middleware without recursion issues
subModuleSchema.pre('save', function(next) {
  try {
    // Skip if no pedagogy
    if (!this.pedagogy) {
      return next();
    }

    const normalizeValue = (value, visited = new WeakSet()) => {
      // Guard against null/undefined
      if (!value || typeof value !== 'object') return;
      
      // Prevent circular references
      if (visited.has(value)) return;
      visited.add(value);
      
      // Handle arrays
      if (Array.isArray(value)) {
        value.forEach(item => {
          if (item && typeof item === 'object') {
            normalizeValue(item, visited);
          }
        });
        return;
      }
      
      // Skip Mongoose internal objects and models
      if (value.constructor && value.constructor.name === 'model') return;
      if (value.$__ && value.$isMongooseModelPrototype) return;
      if (value._doc && value.$__) return; // Mongoose document
      
      // Handle description field
      if (value.description !== undefined) {
        if (typeof value.description === 'string') {
          value.description = { text: value.description };
        } else if (value.description && typeof value.description === 'object') {
          if (!value.description.text) value.description.text = '';
        }
      }
      
      // Recursively check all properties (but only own properties)
      try {
        Object.keys(value).forEach(key => {
          // Skip mongoose internal fields and special fields
          if (key.startsWith('$') || 
              key === '_id' || 
              key === '__v' || 
              key === '_doc' ||
              key === '$__' ||
              key === '$init' ||
              key === 'ownerDocument' ||
              key === '$parent') {
            return;
          }
          
          const prop = value[key];
          if (prop && typeof prop === 'object') {
            normalizeValue(prop, visited);
          }
        });
      } catch (err) {
        // If we can't iterate properties, skip this object
        console.warn('Could not iterate object properties:', err.message);
      }
    };

    // Process each section with depth limiting
    const processSection = (sectionData, depth = 0, maxDepth = 10) => {
      if (depth > maxDepth) return;
      
      if (!sectionData) return;
      
      if (sectionData instanceof Map) {
        sectionData.forEach((value, key) => {
          if (value && typeof value === 'object') {
            normalizeValue(value);
          }
        });
      } else if (typeof sectionData === 'object') {
        // Only process if it's a plain object, not a Mongoose model
        if (sectionData.constructor && sectionData.constructor.name === 'Object') {
          normalizeValue(sectionData);
        }
      }
    };

    // Process each section with try-catch blocks
    try {
      if (this.pedagogy.I_Do) processSection(this.pedagogy.I_Do);
    } catch (err) {
      console.warn('Error processing I_Do:', err.message);
    }
    
    try {
      if (this.pedagogy.We_Do) processSection(this.pedagogy.We_Do);
    } catch (err) {
      console.warn('Error processing We_Do:', err.message);
    }
    
    try {
      if (this.pedagogy.You_Do) processSection(this.pedagogy.You_Do);
    } catch (err) {
      console.warn('Error processing You_Do:', err.message);
    }
    
    this.updatedAt = new Date();
    next();
  } catch (error) {
    console.error('Error in pre-save middleware:', error);
    next(); // Continue to avoid blocking saves
  }
});


module.exports = mongoose.model('SubModule1', subModuleSchema);
