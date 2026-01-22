const mongoose = require("mongoose");

// Test Case Schema
const testCaseSchema = new mongoose.Schema({
  input: { type: String },
  expectedOutput: { type: String },
  isSample: { type: Boolean, default: true },
  isHidden: { type: Boolean, default: true },
  points: { type: Number, default: 1 },
  explanation: String,
}, { _id: true });

const solutionSchema = new mongoose.Schema({
  startedCode: { type: String },
  functionName: { type: String },
  language: { type: String, default: true },
}, { _id: true });

// Hint Schema
const hintSchema = new mongoose.Schema({
  hintText: { type: String },
  pointsDeduction: { type: Number, default: 0 },
  isPublic: { type: Boolean, default: true },
  sequence: { type: Number, default: 0 },
}, { _id: true });

// Question Schema
const questionSchema = new mongoose.Schema({
  title: { 
    type: String, 
    required: true,
    trim: true
  },
  description: { type: String },
  difficulty: {
    type: String,
    enum: ['easy', 'medium', 'hard'],
    default: 'medium'
  },
  sampleInput: { type: String },
  sampleOutput: { type: String },
  score: { 
    type: Number, 
    default: 10,
    min: 0,
    max: 100
  },
  constraints: [{ type: String }],
  hints: [hintSchema],
  testCases: [testCaseSchema],
  solutions: solutionSchema,
  timeLimit: { 
    type: Number, 
    default: 2000,
    min: 0,
    max: 10000
  },
  memoryLimit: { 
    type: Number, 
    default: 256,
    min: 0,
    max: 1024
  },
  isActive: { type: Boolean, default: true },
  sequence: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { _id: true });

// Level Configuration Schema
const levelConfigurationSchema = new mongoose.Schema({
  levelType: {
    type: String,
    enum: ['levelBased', 'general'],
    default: 'levelBased'
  },
  levelBased: {
    easy: { 
      type: Number, 
      default: 0,
      min: 0,
      max: 100 
    },
    medium: { 
      type: Number, 
      default: 0,
      min: 0,
      max: 100 
    },
    hard: { 
      type: Number, 
      default: 0,
      min: 0,
      max: 100 
    }
  },
  general: { type: Number, default: 0 }
}, { _id: false });

// Score Settings Schema (ADDED)
const scoreSettingsSchema = new mongoose.Schema({
  scoreType: {
    type: String,
    enum: ['evenMarks', 'separateMarks', 'levelBasedMarks'],
    default: 'evenMarks'
  },
  evenMarks: { 
    type: Number, 
    default: 0,
    min: 0,
    max: 100
  },
  separateMarks: {
    general: [{ 
      type: Number, 
      default: 0,
      min: 0,
      max: 100 
    }],
    levelBased: {
      easy: [{ 
        type: Number, 
        default: 0,
        min: 0,
        max: 100 
      }],
      medium: [{ 
        type: Number, 
        default: 0,
        min: 0,
        max: 100 
      }],
      hard: [{ 
        type: Number, 
        default: 0,
        min: 0,
        max: 100 
      }]
    }
  },
  levelBasedMarks: {
    easy: { 
      type: Number, 
      default: 0,
      min: 0,
      max: 100 
    },
    medium: { 
      type: Number, 
      default: 0,
      min: 0,
      max: 100 
    },
    hard: { 
      type: Number, 
      default: 0,
      min: 0,
      max: 100 
    }
  },
  totalMarks: { type: Number, default: 0 }
}, { _id: false });

// Availability Period Schema
const availabilityPeriodSchema = new mongoose.Schema({
  startDate: { type: Date },
  endDate: { type: Date },
  gracePeriodAllowed: { type: Boolean, default: false },
  gracePeriodDate: { type: Date },
  extendedDays: { type: Number, default: 0 }
});

// Question Behavior Schema
const questionBehaviorSchema = new mongoose.Schema({
  shuffleQuestions: { type: Boolean, default: false },
  allowNext: { type: Boolean, default: true },
  allowSkip: { type: Boolean, default: false },
  attemptLimitEnabled: { type: Boolean, default: false },
  maxAttempts: { type: Number, default: 3 },
  showPoints: { type: Boolean, default: true },
  showDifficulty: { type: Boolean, default: true },
  allowHintUsage: { type: Boolean, default: true },
  allowTestRun: { type: Boolean, default: true }
});

// Manual Evaluation Schema
const manualEvaluationSchema = new mongoose.Schema({
  enabled: { type: Boolean, default: false },
  submissionNeeded: { type: Boolean, default: false }
});

// Evaluation Settings Schema
const evaluationSettingsSchema = new mongoose.Schema({
  practiceMode: { type: Boolean, default: true },
  manualEvaluation: manualEvaluationSchema,
  aiEvaluation: { type: Boolean, default: false },
  automationEvaluation: { type: Boolean, default: false },
  passingScore: { 
    type: Number, 
    default: 70,
    min: 0,
    max: 100 
  },
  showResultsImmediately: { type: Boolean, default: false },
  allowReview: { type: Boolean, default: true }
});

// Group Settings Schema
const groupSettingsSchema = new mongoose.Schema({
  groupSettingsEnabled: { type: Boolean, default: false },
  showExistingUsers: { type: Boolean, default: true },
  selectedGroups: [{ type: String }],
  chatEnabled: { type: Boolean, default: false },
  collaborationEnabled: { type: Boolean, default: false }
});

// Programming Settings Schema
const programmingSettingsSchema = new mongoose.Schema({
  selectedModule: { 
    type: String, 
    default: 'Core Programming'
  },
  selectedLanguages: [{ type: String }],
  levelConfiguration: levelConfigurationSchema
});

// Compiler Settings Schema
const compilerSettingsSchema = new mongoose.Schema({
  allowCopyPaste: { type: Boolean, default: true },
  autoSuggestion: { type: Boolean, default: true },
  autoCloseBrackets: { type: Boolean, default: true },
  theme: { 
    type: String, 
    default: 'light',
    enum: ['light', 'dark', 'high-contrast']
  },
  fontSize: { 
    type: Number, 
    default: 14,
    min: 0,
    max: 24
  },
  tabSize: { 
    type: Number, 
    default: 2,
    min: 0,
    max: 8
  }
});

// Exercise Information Schema
const exerciseInformationSchema = new mongoose.Schema({
  exerciseId: { type: String, required: true },
  exerciseName: { type: String, required: true },
  description: String,
  exerciseLevel: { 
    type: String, 
    enum: ['beginner', 'intermediate', 'advanced', 'easy', 'medium', 'hard'],
    default: 'beginner'
  },
  totalPoints: { type: Number, default: 0 },
  totalQuestions: { type: Number, default: 0 },
  estimatedTime: { type: Number, default: 60 }
});
// Security Settings Schema
const securitySettingsSchema = new mongoose.Schema({
  timerEnabled: { 
    type: Boolean, 
    default: false 
  },
  timerType: {
    type: String,
    enum: ['exercise', 'question', 'section'],
    default: 'exercise'
  },
  timerDuration: { 
    type: Number, 
    default: 60, // in minutes
    min: 1,
    max: 300
  },
  cameraMicEnabled: { 
    type: Boolean, 
    default: false 
  },
  restrictMinimize: { 
    type: Boolean, 
    default: false 
  },
  fullScreenMode: { 
    type: Boolean, 
    default: false 
  },
   screenRecordingEnabled: {
    type: Boolean,
    default: false  // Default to false for normal exercises
  },
  tabSwitchAllowed: { 
    type: Boolean, 
    default: true 
  },
  maxTabSwitches: { 
    type: Number, 
    default: 3,
    min: 0,
    max: 20
  },
  disableClipboard: { 
    type: Boolean, 
    default: false 
  },
 
}, { _id: false });
// Main Exercise Schema
const exerciseSchema = new mongoose.Schema({
  exerciseInformation: exerciseInformationSchema,
  programmingSettings: programmingSettingsSchema,
  compilerSettings: compilerSettingsSchema,
  availabilityPeriod: availabilityPeriodSchema,
  questionBehavior: questionBehaviorSchema,
  evaluationSettings: evaluationSettingsSchema,
  groupSettings: groupSettingsSchema,
  scoreSettings: scoreSettingsSchema,
  securitySettings: securitySettingsSchema, // ADD THIS LINE
  questions: [questionSchema],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  createdBy: String,
  updatedBy: String,
  version: { type: Number, default: 1 }
}, { _id: true });

// Pre-save middleware to update total points and questions count
exerciseSchema.pre('save', function(next) {
  // Calculate total points and questions
  if (this.questions && Array.isArray(this.questions)) {
    this.exerciseInformation.totalQuestions = this.questions.length;
    this.exerciseInformation.totalPoints = this.questions.reduce((total, question) => {
      return total + (question.points || 0);
    }, 0);
  }
  
  // Calculate total marks from score settings if it exists
  if (this.scoreSettings) {
    const config = this.programmingSettings?.levelConfiguration || {
      levelType: 'levelBased',
      levelBased: { easy: 0, medium: 0, hard: 0 },
      general: 0
    };
    
    // Helper function to calculate marks
    const calculateMarks = (scoreSettings, levelConfig) => {
      const { scoreType, evenMarks, separateMarks, levelBasedMarks } = scoreSettings;
      
      if (scoreType === 'evenMarks') {
        if (levelConfig.levelType === 'general') {
          return levelConfig.general * evenMarks;
        } else {
          const { easy, medium, hard } = levelConfig.levelBased;
          return (easy + medium + hard) * evenMarks;
        }
      } 
      else if (scoreType === 'levelBasedMarks') {
        const { easy, medium, hard } = levelConfig.levelBased;
        return (easy * levelBasedMarks.easy) + 
               (medium * levelBasedMarks.medium) + 
               (hard * levelBasedMarks.hard);
      }
      else if (scoreType === 'separateMarks') {
        if (levelConfig.levelType === 'general') {
          return separateMarks.general.reduce((sum, mark) => sum + mark, 0);
        } else {
          const easyMarks = separateMarks.levelBased.easy.reduce((sum, mark) => sum + mark, 0);
          const mediumMarks = separateMarks.levelBased.medium.reduce((sum, mark) => sum + mark, 0);
          const hardMarks = separateMarks.levelBased.hard.reduce((sum, mark) => sum + mark, 0);
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
const fileSchema = new mongoose.Schema({
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
    lastModified: { type: Date, default: Date.now }
  }
}, { _id: true });

// Folder Schema
const folderSchema = new mongoose.Schema({
  name: { type: String },
  files: [fileSchema],
  subfolders: [this],
  tags: [tagSchema],
}, { _id: true });

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
    default: {} 
  },
  We_Do: { 
    type: Map, 
    of: [exerciseSchema],
    default: {} 
  },
  You_Do: { 
 type: Map, 
    of: [exerciseSchema],
    default: {}  
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