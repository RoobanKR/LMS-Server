const mongoose = require('mongoose');
const Module1 = mongoose.model('Module1');
const SubModule1 = mongoose.model('SubModule1');
const Topic1 = mongoose.model('Topic1');
const SubTopic1 = mongoose.model('SubTopic1');
const User = require("../../../models/UserModel");

const path = require('path');
const fs = require('fs');


const cloudinary = require('cloudinary').v2;
const stream = require('stream');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});


const modelMap = {
  modules: { model: Module1, path: "modules" },
  submodules: { model: SubModule1, path: "submodules" },
  topics: { model: Topic1, path: "topics" },
  subtopics: { model: SubTopic1, path: "subtopics" },
};








// Get a single exercise by ID - Return FULL exercise data
exports.getExerciseById = async (req, res) => {
  try {
    const { exerciseId } = req.params;
    const { 
      type,       // Optional: entity type (modules, submodules, topics, subtopics)
      id,         // Optional: entity ID
    } = req.query;

    console.log(`🔍 Fetching COMPLETE exercise by ID: ${exerciseId}`);

    if (!exerciseId) {
      return res.status(400).json({
        message: [{ key: "error", value: "Exercise ID is required" }]
      });
    }

    let foundExercise = null;
    let foundEntity = null;
    let foundLocation = null;

    // If type and id are provided, search in specific entity
    if (type && id && modelMap[type]) {
      const { model } = modelMap[type];
      const entity = await model.findById(id);

      if (entity && entity.pedagogy) {
        // Search through all pedagogy sections
        ['I_Do', 'We_Do', 'You_Do'].forEach(section => {
          if (entity.pedagogy[section]) {
            const sectionData = entity.pedagogy[section];
            
            // Handle Map and object formats
            let subcategories = [];
            if (sectionData instanceof Map) {
              subcategories = Array.from(sectionData.entries());
            } else if (typeof sectionData === 'object') {
              subcategories = Object.entries(sectionData);
            }

            subcategories.forEach(([subcategory, exercises]) => {
              if (!exercises) return;

              let exercisesArray = [];
              if (Array.isArray(exercises)) {
                exercisesArray = exercises;
              } else if (exercises._id) {
                exercisesArray = [exercises];
              }

              const exercise = exercisesArray.find(ex => 
                ex._id && ex._id.toString() === exerciseId
              );

              if (exercise) {
                // Return the FULL exercise object as-is
                foundExercise = exercise;
                
                // Convert Mongoose document to plain object if needed
                if (foundExercise.toObject) {
                  foundExercise = foundExercise.toObject();
                }
                
                foundEntity = {
                  type: type,
                  id: entity._id,
                  title: entity.title || entity.name,
                  description: entity.description || ''
                };
                foundLocation = {
                  section,
                  subcategory,
                  path: `${type}/${entity.title || entity.name}/${section}/${subcategory}`
                };
              }
            });
          }
        });
      }
    } 
    // Otherwise, search across all entities
    else {
      console.log(`🔍 Searching across all entities for exercise: ${exerciseId}`);
      
      // Define models to search
      const modelsToSearch = [
        { name: 'modules', model: Module1, type: 'module' },
        { name: 'submodules', model: SubModule1, type: 'submodule' },
        { name: 'topics', model: Topic1, type: 'topic' },
        { name: 'subtopics', model: SubTopic1, type: 'subtopic' }
      ];

      for (const { model, type } of modelsToSearch) {
        try {
          // Search all entities with pedagogy
          const entities = await model.find({ 
            'pedagogy': { $exists: true, $ne: null } 
          }).lean();

          for (const entity of entities) {
            if (entity.pedagogy) {
              // Search through all sections
              ['I_Do', 'We_Do', 'You_Do'].forEach(section => {
                if (entity.pedagogy[section]) {
                  const sectionData = entity.pedagogy[section];
                  
                  let subcategories = [];
                  if (sectionData instanceof Map) {
                    subcategories = Array.from(sectionData.entries());
                  } else if (typeof sectionData === 'object') {
                    subcategories = Object.entries(sectionData);
                  }

                  subcategories.forEach(([subcategory, exercises]) => {
                    if (!exercises) return;

                    let exercisesArray = [];
                    if (Array.isArray(exercises)) {
                      exercisesArray = exercises;
                    } else if (exercises._id) {
                      exercisesArray = [exercises];
                    }

                    const exercise = exercisesArray.find(ex => 
                      ex._id && ex._id.toString() === exerciseId
                    );

                    if (exercise) {
                      // Return the FULL exercise object as-is
                      foundExercise = exercise;
                      
                      // Convert Mongoose document to plain object if needed
                      if (foundExercise.toObject) {
                        foundExercise = foundExercise.toObject();
                      }
                      
                      foundEntity = {
                        type: type,
                        id: entity._id,
                        title: entity.title || entity.name,
                        description: entity.description || ''
                      };
                      foundLocation = {
                        section,
                        subcategory,
                        path: `${type}/${entity.title || entity.name}/${section}/${subcategory}`
                      };
                    }
                  });
                }
              });
            }
            if (foundExercise) break;
          }
          if (foundExercise) break;
        } catch (err) {
          console.log(`Error searching in ${type}:`, err.message);
        }
      }
    }

    if (!foundExercise) {
      return res.status(404).json({
        message: [{ key: "error", value: `Exercise with ID ${exerciseId} not found` }]
      });
    }

    // Return the COMPLETE exercise object as it exists in database
    // This includes ALL fields: questions, options, correctAnswer, etc.
    const completeExerciseData = {
      ...foundExercise,  // Spread ALL properties from the found exercise
      
      // Add location info as additional metadata
      entity: foundEntity,
      location: foundLocation
    };

    // Remove any Mongoose-specific properties if they exist
    if (completeExerciseData.__v !== undefined) {
      delete completeExerciseData.__v;
    }

    return res.status(200).json({
      message: [{ key: "success", value: "Complete exercise data retrieved successfully" }],
      data: {
        exercise: completeExerciseData,  // Complete exercise with ALL data
        metadata: {
          exerciseId: exerciseId,
          found: true,
          entityType: foundEntity?.type,
          section: foundLocation?.section,
          subcategory: foundLocation?.subcategory,
          location: foundLocation?.path,
          totalQuestions: completeExerciseData.questions?.length || 0,
          exerciseType: completeExerciseData.exerciseType,
          exerciseName: completeExerciseData.exerciseInformation?.exerciseName || 'Unnamed Exercise'
        }
      }
    });

  } catch (err) {
    console.error("❌ Get exercise by ID error:", err);
    res.status(500).json({
      message: [{ key: "error", value: `Internal server error: ${err.message}` }]
    });
  }
};





exports.addExercise = async (req, res) => {
  try {
    const { type, id } = req.params;
    const {
      tabType,
      subcategory,
      exerciseType,
      programmingSettings,
      exerciseInformation,
      availabilityPeriod,
      questionConfiguration,
      notificationSettings
    } = req.body;

    if (!modelMap[type]) {
      return res.status(400).json({
        message: [{ key: "error", value: `Invalid entity type: ${type}. Valid types: modules, submodules, topics, subtopics` }]
      });
    }

    if (!subcategory) {
      return res.status(400).json({
        message: [{ key: "error", value: "Subcategory is required. Valid values: 'Practical', 'Project Development', or other subcategory" }]
      });
    }

    // Parse JSON strings if they're strings
    const parseIfNeeded = (data) => {
      if (typeof data === 'string') {
        try {
          return JSON.parse(data);
        } catch (error) {
          return data;
        }
      }
      return data;
    };

    // Parse all data
    const exerciseTypeParsed = parseIfNeeded(exerciseType);
    const exerciseInfo = parseIfNeeded(exerciseInformation);
    const progSettings = programmingSettings ? parseIfNeeded(programmingSettings) : null;
    const availPeriod = availabilityPeriod ? parseIfNeeded(availabilityPeriod) : {};
    const quesConfig = questionConfiguration ? parseIfNeeded(questionConfiguration) : {};
    const notifSettings = notificationSettings ? parseIfNeeded(notificationSettings) : {
      notifyUsers: false,
      notifyGmail: false,
      notifyWhatsApp: false,
      gradeSheet: true
    };

    // Validate required fields
    if (!exerciseInfo || !exerciseInfo.exerciseName) {
      return res.status(400).json({
        message: [{ key: "error", value: "Exercise information with exerciseName is required" }]
      });
    }

    if (!exerciseTypeParsed) {
      return res.status(400).json({
        message: [{ key: "error", value: "Exercise type is required (MCQ, Programming, or Combined)" }]
      });
    }

    const { model } = modelMap[type];
    const entity = await model.findById(id);

    if (!entity) {
      return res.status(404).json({
        message: [{ key: "error", value: `${type} with ID ${id} not found` }]
      });
    }

    // Initialize pedagogy if not exists
    if (!entity.pedagogy) {
      entity.pedagogy = {
        I_Do: new Map(),
        We_Do: new Map(),
        You_Do: new Map()
      };
    }

    if (!entity.pedagogy[tabType]) {
      entity.pedagogy[tabType] = new Map();
    }

    // Get or create exercise array for the subcategory
    let exercises = [];
    if (entity.pedagogy[tabType].has(subcategory)) {
      exercises = entity.pedagogy[tabType].get(subcategory);
    }

    const generateExerciseId = () => {
      const nextNumber = (exercises.length + 1).toString().padStart(3, '0');
      return `EX${nextNumber}`;
    };

    // Use provided exerciseId or generate a new one
    const exerciseId = exerciseInfo.exerciseId || generateExerciseId();

    // ============ CONFIGURATION TYPE HANDLING ============
    const configTypeSettings = {
      mcqMode: exerciseTypeParsed === 'MCQ' || exerciseTypeParsed === 'Combined',
      programmingMode: exerciseTypeParsed === 'Programming' || exerciseTypeParsed === 'Combined',
      combinedMode: exerciseTypeParsed === 'Combined'
    };

    // Initialize configuration objects - ONLY STORE WHAT'S NEEDED
    let mcqQuestionConfig = null;
    let programmingQuestionConfig = null;

    // ============ PROCESS CONFIGURATIONS BASED ON EXERCISE TYPE ============
    if (exerciseTypeParsed === 'MCQ') {
      // MCQ Only mode - Only store MCQ config
      if (quesConfig.mcqConfig) {
        const mcqConfig = quesConfig.mcqConfig;
        mcqQuestionConfig = {
          totalMcqQuestions: mcqConfig.generalQuestionCount || 0,
          marksPerQuestion: mcqConfig.scoreSettings?.evenMarks || 0,
          mcqTotalMarks: (mcqConfig.generalQuestionCount || 0) * (mcqConfig.scoreSettings?.evenMarks || 0),
          attemptLimitEnabled: mcqConfig.attemptLimitEnabled || false,
          submissionAttempts: mcqConfig.submissionAttempts || 1,
          shuffleQuestions: true
        };
      }
    } 
    else if (exerciseTypeParsed === 'Programming') {
      // Programming Only mode - Only store Programming config
      if (quesConfig.programmingConfig) {
        const progConfig = quesConfig.programmingConfig;
        
        // Set programming configuration
        programmingQuestionConfig = {
          questionConfigType: progConfig.questionConfigType || 'general',
          attemptLimitEnabled: progConfig.attemptLimitEnabled || false,
          submissionAttempts: progConfig.submissionAttempts || 1,
          questionFlow: progConfig.questionFlow || 'freeFlow',
          allowCodeExecution: true,
          enableTestCases: true,
          showSampleCases: true
        };

        // Set counts based on configuration type
        if (progConfig.questionConfigType === 'general') {
          programmingQuestionConfig.generalQuestionCount = progConfig.generalQuestionCount || 0;
        } else if (progConfig.questionConfigType === 'levelBased' && progConfig.levelBasedCounts) {
          programmingQuestionConfig.levelBasedCounts = progConfig.levelBasedCounts;
        } else if (progConfig.questionConfigType === 'selectionLevel' && progConfig.selectionLevelCounts) {
          programmingQuestionConfig.selectionLevelCounts = progConfig.selectionLevelCounts;
        }

        // Set score settings
        if (progConfig.scoreSettings) {
          const scoreType = progConfig.scoreSettings.scoreType;
          let totalMarks = 0;
          
          // Calculate total marks based on scoring type
          if (scoreType === 'evenMarks') {
            let questionCount = 0;
            if (progConfig.questionConfigType === 'general') {
              questionCount = progConfig.generalQuestionCount || 0;
            } else {
              const counts = progConfig.levelBasedCounts || progConfig.selectionLevelCounts || { easy: 0, medium: 0, hard: 0 };
              questionCount = counts.easy + counts.medium + counts.hard;
            }
            totalMarks = questionCount * (progConfig.scoreSettings.evenMarks || 0);
          } 
          else if (scoreType === 'levelBasedMarks') {
            const counts = progConfig.levelBasedCounts || progConfig.selectionLevelCounts || { easy: 0, medium: 0, hard: 0 };
            const levelMarks = progConfig.scoreSettings.levelBasedMarks || { easy: 0, medium: 0, hard: 0 };
            totalMarks = 
              (counts.easy * levelMarks.easy) +
              (counts.medium * levelMarks.medium) +
              (counts.hard * levelMarks.hard);
          }
          // For separateMarks, total will be calculated when questions are added

          programmingQuestionConfig.scoreSettings = {
            scoreType: scoreType,
            evenMarks: progConfig.scoreSettings.evenMarks || 0,
            separateMarks: progConfig.scoreSettings.separateMarks || {
              general: [],
              levelBased: { easy: [], medium: [], hard: [] }
            },
            levelBasedMarks: progConfig.scoreSettings.levelBasedMarks || {
              easy: 0, medium: 0, hard: 0
            },
            totalMarks: totalMarks
          };
        }
      }
    } 
    else if (exerciseTypeParsed === 'Combined') {
      // Combined mode - Store both configurations
      if (quesConfig.mcqConfig) {
        const mcqConfig = quesConfig.mcqConfig;
        mcqQuestionConfig = {
          totalMcqQuestions: mcqConfig.generalQuestionCount || 0,
          marksPerQuestion: mcqConfig.scoreSettings?.evenMarks || 0,
          mcqTotalMarks: (mcqConfig.generalQuestionCount || 0) * (mcqConfig.scoreSettings?.evenMarks || 0),
          attemptLimitEnabled: mcqConfig.attemptLimitEnabled || false,
          submissionAttempts: mcqConfig.submissionAttempts || 1,
          shuffleQuestions: true
        };
      }

      if (quesConfig.programmingConfig) {
        const progConfig = quesConfig.programmingConfig;
        
        programmingQuestionConfig = {
          questionConfigType: progConfig.questionConfigType || 'general',
          attemptLimitEnabled: progConfig.attemptLimitEnabled || false,
          submissionAttempts: progConfig.submissionAttempts || 1,
          questionFlow: progConfig.questionFlow || 'freeFlow',
          allowCodeExecution: true,
          enableTestCases: true,
          showSampleCases: true
        };

        if (progConfig.questionConfigType === 'general') {
          programmingQuestionConfig.generalQuestionCount = progConfig.generalQuestionCount || 0;
        } else if (progConfig.questionConfigType === 'levelBased' && progConfig.levelBasedCounts) {
          programmingQuestionConfig.levelBasedCounts = progConfig.levelBasedCounts;
        } else if (progConfig.questionConfigType === 'selectionLevel' && progConfig.selectionLevelCounts) {
          programmingQuestionConfig.selectionLevelCounts = progConfig.selectionLevelCounts;
        }

        if (progConfig.scoreSettings) {
          const scoreType = progConfig.scoreSettings.scoreType;
          let totalMarks = 0;
          
          if (scoreType === 'evenMarks') {
            let questionCount = 0;
            if (progConfig.questionConfigType === 'general') {
              questionCount = progConfig.generalQuestionCount || 0;
            } else {
              const counts = progConfig.levelBasedCounts || progConfig.selectionLevelCounts || { easy: 0, medium: 0, hard: 0 };
              questionCount = counts.easy + counts.medium + counts.hard;
            }
            totalMarks = questionCount * (progConfig.scoreSettings.evenMarks || 0);
          } 
          else if (scoreType === 'levelBasedMarks') {
            const counts = progConfig.levelBasedCounts || progConfig.selectionLevelCounts || { easy: 0, medium: 0, hard: 0 };
            const levelMarks = progConfig.scoreSettings.levelBasedMarks || { easy: 0, medium: 0, hard: 0 };
            totalMarks = 
              (counts.easy * levelMarks.easy) +
              (counts.medium * levelMarks.medium) +
              (counts.hard * levelMarks.hard);
          }

          programmingQuestionConfig.scoreSettings = {
            scoreType: scoreType,
            evenMarks: progConfig.scoreSettings.evenMarks || 0,
            separateMarks: progConfig.scoreSettings.separateMarks || {
              general: [],
              levelBased: { easy: [], medium: [], hard: [] }
            },
            levelBasedMarks: progConfig.scoreSettings.levelBasedMarks || {
              easy: 0, medium: 0, hard: 0
            },
            totalMarks: totalMarks
          };
        }
      }
    }

    // ============ CREATE NEW EXERCISE ============
    const newExercise = {
      _id: new mongoose.Types.ObjectId(),
      exerciseType: exerciseTypeParsed, // Store exerciseType at root level
      configurationType: configTypeSettings,
      exerciseInformation: {
        exerciseId: exerciseId,
        exerciseName: exerciseInfo.exerciseName || "",
        description: exerciseInfo.description || "",
        exerciseLevel: exerciseInfo.exerciseLevel || 'intermediate',
        totalDuration: exerciseInfo.totalDuration || 1,
      },
      // Store only relevant configurations - others will be null/undefined
      questionConfiguration: {},
      availabilityPeriod: {
        startDate: availPeriod?.startDate ? new Date(availPeriod.startDate) : null,
        endDate: availPeriod?.endDate ? new Date(availPeriod.endDate) : null,
        gracePeriodAllowed: availPeriod?.gracePeriodAllowed ?? false,
        gracePeriodDate: availPeriod?.gracePeriodDate ? new Date(availPeriod.gracePeriodDate) : null,
        extendedDays: availPeriod?.extendedDays || 0
      },
      notificatonandGradeSettings: {
        notifyUsers: notifSettings.notifyUsers || false,
        notifyGmail: notifSettings.notifyGmail || false,
        notifyWhatsApp: notifSettings.notifyWhatsApp || false,
        gradeSheet: notifSettings.gradeSheet !== undefined ? notifSettings.gradeSheet : true
      },
      questions: [],
      createdAt: new Date(),
      createdBy: req.user?.email || "roobankr5@gmail.com",
      version: 1
    };

    // Only add programming settings if needed
    if ((exerciseTypeParsed === 'Programming' || exerciseTypeParsed === 'Combined') && progSettings) {
      newExercise.programmingSettings = {
        selectedModule: progSettings.selectedModule || null,
        selectedLanguages: progSettings.selectedLanguages || []
      };
    }

    // Add configurations based on exercise type
    if (mcqQuestionConfig) {
      newExercise.questionConfiguration.mcqQuestionConfiguration = mcqQuestionConfig;
    }
    
    if (programmingQuestionConfig) {
      newExercise.questionConfiguration.programmingQuestionConfiguration = programmingQuestionConfig;
    }

    // Add exercise to array
    exercises.push(newExercise);

    // Save back to map
    entity.pedagogy[tabType].set(subcategory, exercises);

    // Mark as modified
    entity.markModified(`pedagogy.${tabType}`);

    // Update timestamps
    entity.updatedBy = req.user?.email || "roobankr5@gmail.com";
    entity.updatedAt = new Date();

    // Save entity
    await entity.save();

    // Prepare response
    let responseConfig = {};
    if (exerciseTypeParsed === 'MCQ') {
      responseConfig = {
        mode: 'mcq',
        config: mcqQuestionConfig
      };
    } else if (exerciseTypeParsed === 'Programming') {
      responseConfig = {
        mode: 'programming',
        config: programmingQuestionConfig
      };
    } else if (exerciseTypeParsed === 'Combined') {
      responseConfig = {
        mode: 'combined',
        mcqConfig: mcqQuestionConfig,
        programmingConfig: programmingQuestionConfig
      };
    }

    return res.status(201).json({
      message: [{ key: "success", value: `Exercise added successfully to ${subcategory}` }],
      data: {
        exercise: newExercise,
        configuration: responseConfig,
        subcategory: subcategory,
        tabType: tabType,
        entityType: type,
        entityId: id,
        totalExercises: exercises.length,
        generatedExerciseId: exerciseId,
        location: {
          section: tabType,
          subcategory: subcategory,
          index: exercises.length - 1
        }
      }
    });

  } catch (err) {
    console.error("❌ Add exercise error:", err);
    res.status(500).json({
      message: [{ key: "error", value: `Internal server error: ${err.message}` }]
    });
  }
};
 
exports.getExercises = async (req, res) => {
  try {
    const { type, id } = req.params;
    const { 
      section , 
      subcategory 
    } = req.query;


    if (!modelMap[type]) {
      return res.status(400).json({ 
        message: [{ key: "error", value: `Invalid entity type: ${type}` }] 
      });
    }

    const { model } = modelMap[type];
    const entity = await model.findById(id);
    
    if (!entity) {
      return res.status(404).json({ 
        message: [{ key: "error", value: `${type} not found` }] 
      });
    }

    // Check if pedagogy exists
    if (!entity.pedagogy || !entity.pedagogy[section]) {
      return res.json({
        message: [{ key: "success", value: "No exercises found" }],
        data: { 
          exercises: [],
          section: section,
          subcategory: subcategory,
          total: 0
        }
      });
    }

    // Get exercises for specific subcategory or all in section
    let exercises = [];
    if (subcategory) {
      exercises = entity.pedagogy[section].get(subcategory) || [];
    } else {
      // Return all exercises from all subcategories in section
      const allExercises = [];
      entity.pedagogy[section].forEach((exArray, subcat) => {
        if (Array.isArray(exArray)) {
          exArray.forEach(ex => {
            allExercises.push({
              ...ex._doc,
              subcategory: subcat
            });
          });
        }
      });
      exercises = allExercises;
    }

    return res.json({
      message: [{ key: "success", value: "Exercises retrieved successfully" }],
      data: { 
        exercises,
        section: section,
        subcategory: subcategory,
        total: exercises.length,
        entityType: type,
        entityId: id
      }
    });

  } catch (err) {
    console.error("❌ Get exercises error:", err);
    res.status(500).json({ 
      message: [{ key: "error", value: "Internal server error" }] 
    });
  }
};

exports.updateExercise = async (req, res) => {
  try {
    const { type, id, exerciseId } = req.params;
    const {
      configurationType, // Added this
      tabType,
      subcategory,
      exerciseInformation,
      programmingSettings,
      availabilityPeriod,
      questionConfiguration,
      scoreSettings,
      notificationGradeSettings
    } = req.body;

    // Validate entity type
    if (!modelMap[type]) {
      return res.status(400).json({
        message: [{ key: "error", value: `Invalid entity type: ${type}. Valid types: modules, submodules, topics, subtopics` }]
      });
    }

    // Validate required parameters
    if (!subcategory) {
      return res.status(400).json({
        message: [{ key: "error", value: "Subcategory is required. Valid values: 'exercises', 'practical', 'Project Development', etc." }]
      });
    }

    // Parse JSON strings if they're strings
    const parseIfNeeded = (data) => {
      if (typeof data === 'string') {
        try {
          return JSON.parse(data);
        } catch (error) {
          return data;
        }
      }
      return data;
    };

    const configType = configurationType ? parseIfNeeded(configurationType) : null;
    const exerciseInfo = exerciseInformation ? parseIfNeeded(exerciseInformation) : null;
    const progSettings = programmingSettings ? parseIfNeeded(programmingSettings) : null;
    const availPeriod = availabilityPeriod ? parseIfNeeded(availabilityPeriod) : null;
    const quesConfig = questionConfiguration ? parseIfNeeded(questionConfiguration) : null;
    const scrSettings = scoreSettings ? parseIfNeeded(scoreSettings) : null;
    const notifGradeSettings = notificationGradeSettings ? parseIfNeeded(notificationGradeSettings) : null;

    const { model } = modelMap[type];
    const entity = await model.findById(id);

    if (!entity) {
      return res.status(404).json({
        message: [{ key: "error", value: `${type} with ID ${id} not found` }]
      });
    }

    // Check if pedagogy exists
    if (!entity.pedagogy) {
      return res.status(404).json({
        message: [{ key: "error", value: "Pedagogy structure not found for this entity" }]
      });
    }

    // Check if tabType exists
    if (!entity.pedagogy[tabType]) {
      return res.status(404).json({
        message: [{ key: "error", value: `Pedagogy tab '${tabType}' not found` }]
      });
    }

    // Convert Map to object if needed
    let tabData = entity.pedagogy[tabType];
    if (tabData instanceof Map) {
      tabData = Object.fromEntries(tabData);
    }

    // Check if subcategory exists
    if (!tabData[subcategory] || !Array.isArray(tabData[subcategory])) {
      return res.status(404).json({
        message: [{ key: "error", value: `Subcategory '${subcategory}' not found in ${tabType}` }]
      });
    }

    // Find exercise index
    const exerciseIndex = tabData[subcategory].findIndex(
      exercise => exercise._id.toString() === exerciseId
    );

    if (exerciseIndex === -1) {
      return res.status(404).json({
        message: [{ key: "error", value: `Exercise with ID ${exerciseId} not found in subcategory '${subcategory}'` }]
      });
    }

    // Get existing exercise
    const existingExercise = tabData[subcategory][exerciseIndex];

    // Convert Mongoose subdocument to plain object if needed
    const convertToPlainObject = (obj) => {
      if (obj && obj.toObject) {
        return obj.toObject();
      }
      if (obj && obj._doc) {
        return { ...obj._doc };
      }
      return obj;
    };

    // Get existing data as plain object
    const plainExistingExercise = convertToPlainObject(existingExercise);

    // Process configuration type updates
    let updatedConfigType = {
      ...plainExistingExercise.configurationType,
      ...(configType && {
        practiceMode: configType === 'practice' ? true : false,
        manualEvaluation: configType === 'manual' ? true : false
      })
    };

    // Process question configuration updates
    let updatedQuestionConfig = {
      ...plainExistingExercise.questionConfiguration,
      ...(quesConfig && {
        levelType: quesConfig.levelType || plainExistingExercise.questionConfiguration?.levelType,
        general: quesConfig.general !== undefined ? quesConfig.general : plainExistingExercise.questionConfiguration?.general,
        levelBased: {
          easy: quesConfig.levelBased?.easy !== undefined ? quesConfig.levelBased.easy : (plainExistingExercise.questionConfiguration?.levelBased?.easy || 0),
          medium: quesConfig.levelBased?.medium !== undefined ? quesConfig.levelBased.medium : (plainExistingExercise.questionConfiguration?.levelBased?.medium || 0),
          hard: quesConfig.levelBased?.hard !== undefined ? quesConfig.levelBased.hard : (plainExistingExercise.questionConfiguration?.levelBased?.hard || 0)
        },
        selectedLevel: {
          easy: quesConfig.selectedLevel?.easy !== undefined ? quesConfig.selectedLevel.easy : (plainExistingExercise.questionConfiguration?.selectedLevel?.easy || 0),
          medium: quesConfig.selectedLevel?.medium !== undefined ? quesConfig.selectedLevel.medium : (plainExistingExercise.questionConfiguration?.selectedLevel?.medium || 0),
          hard: quesConfig.selectedLevel?.hard !== undefined ? quesConfig.selectedLevel.hard : (plainExistingExercise.questionConfiguration?.selectedLevel?.hard || 0)
        },
        questionFlow: quesConfig.questionFlow !== undefined ? quesConfig.questionFlow : plainExistingExercise.questionConfiguration?.questionFlow
      })
    };

    // Calculate total questions
    let totalQuestions = 0;
    if (updatedQuestionConfig.levelType === 'general') {
      totalQuestions = updatedQuestionConfig.general || 0;
    } else if (updatedQuestionConfig.levelType === 'levelBased') {
      const easy = updatedQuestionConfig.levelBased?.easy || 0;
      const medium = updatedQuestionConfig.levelBased?.medium || 0;
      const hard = updatedQuestionConfig.levelBased?.hard || 0;
      totalQuestions = easy + medium + hard;
    } else if (updatedQuestionConfig.levelType === 'selectedLevel') {
      const easy = updatedQuestionConfig.selectedLevel?.easy || 0;
      const medium = updatedQuestionConfig.selectedLevel?.medium || 0;
      const hard = updatedQuestionConfig.selectedLevel?.hard || 0;
      totalQuestions = easy + medium + hard;
    }

    // Calculate total marks if score settings are being updated
    const calculateTotalMarks = (scoreConfig, questionConfig) => {
      const { scoreType, evenMarks, separateMarks, levelBasedMarks } = scoreConfig;

      if (scoreType === 'evenMarks') {
        return totalQuestions * evenMarks;
      }
      else if (scoreType === 'levelBasedMarks') {
        let easy = 0, medium = 0, hard = 0;

        if (questionConfig.levelType === 'levelBased') {
          easy = questionConfig.levelBased?.easy || 0;
          medium = questionConfig.levelBased?.medium || 0;
          hard = questionConfig.levelBased?.hard || 0;
        } else if (questionConfig.levelType === 'selectedLevel') {
          easy = questionConfig.selectedLevel?.easy || 0;
          medium = questionConfig.selectedLevel?.medium || 0;
          hard = questionConfig.selectedLevel?.hard || 0;
        }

        return (easy * (levelBasedMarks?.easy || 0)) +
               (medium * (levelBasedMarks?.medium || 0)) +
               (hard * (levelBasedMarks?.hard || 0));
      }
      else if (scoreType === 'separateMarks') {
        if (questionConfig.levelType === 'general') {
          return (separateMarks?.general || []).reduce((sum, mark) => sum + (mark || 0), 0);
        } else {
          const easyMarks = (separateMarks?.levelBased?.easy || []).reduce((sum, mark) => sum + (mark || 0), 0);
          const mediumMarks = (separateMarks?.levelBased?.medium || []).reduce((sum, mark) => sum + (mark || 0), 0);
          const hardMarks = (separateMarks?.levelBased?.hard || []).reduce((sum, mark) => sum + (mark || 0), 0);
          return easyMarks + mediumMarks + hardMarks;
        }
      }
      return 0;
    };

    // Calculate total marks for score settings
    let totalMarks = 0;
    let updatedScoreSettings = {
      ...(plainExistingExercise.scoreSettings || {
        scoreType: 'evenMarks',
        evenMarks: 10,
        separateMarks: {
          general: [],
          levelBased: { easy: [], medium: [], hard: [] }
        },
        levelBasedMarks: { easy: 10, medium: 15, hard: 20 },
        totalMarks: 0
      }),
      ...scrSettings
    };

    if (scrSettings) {
      totalMarks = calculateTotalMarks(updatedScoreSettings, updatedQuestionConfig);
      updatedScoreSettings.totalMarks = totalMarks;
    }

    // Get existing notification grade settings
    const existingNotifGradeSettings = plainExistingExercise.notificatonandGradeSettings || {
      notifyUsers: false,
      notifyGmail: false,
      notifyWhatsApp: false,
      gradeSheet: true
    };

    // Prepare update data
    const updateData = {
      ...plainExistingExercise,
      // Update configurationType
      configurationType: updatedConfigType,
      
      // Update exerciseInformation
      exerciseInformation: {
        ...plainExistingExercise.exerciseInformation,
        ...(exerciseInfo && {
          exerciseId: exerciseInfo.exerciseId || plainExistingExercise.exerciseInformation?.exerciseId,
          exerciseName: exerciseInfo.exerciseName || plainExistingExercise.exerciseInformation?.exerciseName,
          description: exerciseInfo.description !== undefined ? exerciseInfo.description : plainExistingExercise.exerciseInformation?.description,
          exerciseLevel: exerciseInfo.exerciseLevel || plainExistingExercise.exerciseInformation?.exerciseLevel,
          totalDuration: exerciseInfo.totalDuration !== undefined ? exerciseInfo.totalDuration : plainExistingExercise.exerciseInformation?.totalDuration
        })
      },

      // Update programmingSettings
      programmingSettings: {
        ...plainExistingExercise.programmingSettings,
        ...(progSettings && {
          selectedModule: progSettings.selectedModule || plainExistingExercise.programmingSettings?.selectedModule,
          selectedLanguages: progSettings.selectedLanguages || plainExistingExercise.programmingSettings?.selectedLanguages
        })
      },

      // Update questionConfiguration
      questionConfiguration: updatedQuestionConfig,

      // Update scoreSettings
      scoreSettings: updatedScoreSettings,

      // Update availabilityPeriod
      availabilityPeriod: {
        ...plainExistingExercise.availabilityPeriod,
        ...(availPeriod && {
          startDate: availPeriod.startDate ? new Date(availPeriod.startDate) : plainExistingExercise.availabilityPeriod?.startDate,
          endDate: availPeriod.endDate ? new Date(availPeriod.endDate) : plainExistingExercise.availabilityPeriod?.endDate,
          gracePeriodAllowed: availPeriod.gracePeriodAllowed !== undefined ? availPeriod.gracePeriodAllowed : plainExistingExercise.availabilityPeriod?.gracePeriodAllowed,
          gracePeriodDate: availPeriod.gracePeriodDate ? new Date(availPeriod.gracePeriodDate) : plainExistingExercise.availabilityPeriod?.gracePeriodDate,
          extendedDays: availPeriod.extendedDays !== undefined ? availPeriod.extendedDays : plainExistingExercise.availabilityPeriod?.extendedDays
        })
      },

      // Update notificationGradeSettings
      notificatonandGradeSettings: {
        ...existingNotifGradeSettings,
        ...(notifGradeSettings && {
          notifyUsers: notifGradeSettings.notifyUsers !== undefined ? notifGradeSettings.notifyUsers : existingNotifGradeSettings.notifyUsers,
          notifyGmail: notifGradeSettings.notifyGmail !== undefined ? notifGradeSettings.notifyGmail : existingNotifGradeSettings.notifyGmail,
          notifyWhatsApp: notifGradeSettings.notifyWhatsApp !== undefined ? notifGradeSettings.notifyWhatsApp : existingNotifGradeSettings.notifyWhatsApp,
          gradeSheet: notifGradeSettings.gradeSheet !== undefined ? notifGradeSettings.gradeSheet : existingNotifGradeSettings.gradeSheet
        })
      },

      updatedAt: new Date(),
      updatedBy: req.user?.email || "roobankr5@gmail.com"
    };

    // Update exercise information with calculated totals
    updateData.exerciseInformation.totalQuestions = totalQuestions;
    updateData.exerciseInformation.totalPoints = totalMarks;

    // Convert updateData to a clean object without any Mongoose properties
    const cleanUpdateData = JSON.parse(JSON.stringify(updateData));

    // Update the exercise in the array
    tabData[subcategory][exerciseIndex] = cleanUpdateData;

    // Convert back to Map if needed
    if (entity.pedagogy[tabType] instanceof Map) {
      entity.pedagogy[tabType].set(subcategory, tabData[subcategory]);
    } else {
      entity.pedagogy[tabType][subcategory] = tabData[subcategory];
    }

    // Mark as modified
    entity.markModified(`pedagogy.${tabType}`);
    entity.markModified(`pedagogy.${tabType}.${subcategory}`);

    // Update entity timestamps
    entity.updatedBy = req.user?.email || "roobankr5@gmail.com";
    entity.updatedAt = new Date();

    // Save entity
    await entity.save();

    return res.status(200).json({
      message: [{ key: "success", value: `Exercise updated successfully in ${subcategory}` }],
      data: {
        exercise: cleanUpdateData,
        subcategory: subcategory,
        tabType: tabType,
        entityType: type,
        entityId: id,
        exerciseId: exerciseId,
        totalExercises: tabData[subcategory].length,
        configurationType: cleanUpdateData.configurationType,
        questionConfiguration: cleanUpdateData.questionConfiguration,
        scoreSettings: cleanUpdateData.scoreSettings,
        notificatonandGradeSettings: cleanUpdateData.notificatonandGradeSettings,
        totalQuestions: totalQuestions,
        totalMarks: totalMarks,
        location: {
          section: tabType,
          subcategory: subcategory,
          index: exerciseIndex
        }
      }
    });

  } catch (err) {
    console.error("❌ Update exercise error:", err);
    console.error("❌ Error stack:", err.stack);
    res.status(500).json({
      message: [{ key: "error", value: `Internal server error: ${err.message}` }]
    });
  }
};
 


// Delete Exercise
exports.deleteExercise = async (req, res) => {
  try {
    const { type, id, exerciseId } = req.params;
    const { 
      tabType ,
      subcategory
    } = req.query;

    // Validate entity type
    if (!modelMap[type]) {
      return res.status(400).json({ 
        message: [{ key: "error", value: `Invalid entity type: ${type}. Valid types: modules, submodules, topics, subtopics` }] 
      });
    }

    // Validate required parameters
    if (!subcategory) {
      return res.status(400).json({ 
        message: [{ key: "error", value: "Subcategory is required as query parameter. Valid values: 'exercises', 'practical', 'Project Development', etc." }] 
      });
    }

    // Validate tabType
    if (!tabType || !['I_Do', 'We_Do', 'You_Do'].includes(tabType)) {
      return res.status(400).json({ 
        message: [{ key: "error", value: "tabType is required and must be one of: 'I_Do', 'We_Do', 'You_Do'" }] 
      });
    }

    const { model } = modelMap[type];
    const entity = await model.findById(id);
    
    if (!entity) {
      return res.status(404).json({ 
        message: [{ key: "error", value: `${type} with ID ${id} not found` }] 
      });
    }

    // Check if pedagogy exists
    if (!entity.pedagogy) {
      return res.status(404).json({ 
        message: [{ key: "error", value: "Pedagogy structure not found for this entity" }] 
      });
    }

    // Check if tabType exists
    if (!entity.pedagogy[tabType]) {
      return res.status(404).json({ 
        message: [{ key: "error", value: `Pedagogy tab '${tabType}' not found` }] 
      });
    }

    // Convert Map to object if needed
    let tabData = entity.pedagogy[tabType];
    if (tabData instanceof Map) {
      tabData = Object.fromEntries(tabData);
    }

    // Check if subcategory exists
    if (!tabData[subcategory] || !Array.isArray(tabData[subcategory])) {
      return res.status(404).json({ 
        message: [{ key: "error", value: `Subcategory '${subcategory}' not found in ${tabType}` }] 
      });
    }

    // Find exercise index
    const exerciseIndex = tabData[subcategory].findIndex(
      exercise => exercise._id.toString() === exerciseId
    );

    if (exerciseIndex === -1) {
      return res.status(404).json({ 
        message: [{ key: "error", value: `Exercise with ID ${exerciseId} not found in subcategory '${subcategory}'` }] 
      });
    }

    // Get exercise data for response message (including security settings)
    const exerciseToDelete = tabData[subcategory][exerciseIndex];
    const exerciseName = exerciseToDelete?.exerciseInformation?.exerciseName || 'Unknown Exercise';
    const exerciseIdValue = exerciseToDelete?.exerciseInformation?.exerciseId || exerciseId;
    
    // Store deleted exercise data for response (including security settings)
    const deletedExerciseData = {
      exerciseId: exerciseIdValue,
      exerciseName: exerciseName,
      securitySettings: exerciseToDelete?.securitySettings || null,
      deletedAt: new Date()
    };
    
    // Remove exercise from array
    tabData[subcategory].splice(exerciseIndex, 1);

    // Convert back to Map if needed
    if (entity.pedagogy[tabType] instanceof Map) {
      entity.pedagogy[tabType].set(subcategory, tabData[subcategory]);
    } else {
      entity.pedagogy[tabType][subcategory] = tabData[subcategory];
    }

    // Mark as modified
    entity.markModified(`pedagogy.${tabType}`);
    entity.markModified(`pedagogy.${tabType}.${subcategory}`);

    // Update entity timestamps
    entity.updatedBy = req.user?.email || "roobankr5@gmail.com";
    entity.updatedAt = new Date();

    // Save entity
    await entity.save();
    

    return res.status(200).json({
      message: [{ key: "success", value: `Exercise "${exerciseName}" deleted successfully from ${subcategory}` }],
      data: {
        deletedExercise: deletedExerciseData,
        subcategory: subcategory,
        tabType: tabType,
        entityType: type,
        entityId: id,
        totalExercises: tabData[subcategory].length,
        location: {
          section: tabType,
          subcategory: subcategory,
          deletedIndex: exerciseIndex
        }
      }
    });

  } catch (err) {
    console.error("❌ Delete exercise error:", err);
    console.error("❌ Error stack:", err.stack);
    res.status(500).json({ 
      message: [{ key: "error", value: `Internal server error: ${err.message}` }] 
    });
  }
};
// Get All Subcategories
exports.getSubcategories = async (req, res) => {
  try {
    const { type, id } = req.params;
    const { section = 'We_Do' } = req.query;


    if (!modelMap[type]) {
      return res.status(400).json({ 
        message: [{ key: "error", value: "Invalid entity type" }] 
      });
    }

    const { model } = modelMap[type];
    const entity = await model.findById(id);
    
    if (!entity) {
      return res.status(404).json({ 
        message: [{ key: "error", value: `${type} not found` }] 
      });
    }

    // Check if pedagogy exists
    if (!entity.pedagogy || !entity.pedagogy[section]) {
      return res.json({
        message: [{ key: "success", value: "No subcategories found" }],
        data: { 
          subcategories: [],
          section: section,
          total: 0
        }
      });
    }

    // Get all subcategories
    const subcategories = Array.from(entity.pedagogy[section].keys());

    // Count exercises in each subcategory
    const subcategoryDetails = subcategories.map(subcat => {
      const exercises = entity.pedagogy[section].get(subcat) || [];
      return {
        name: subcat,
        exerciseCount: exercises.length,
        lastUpdated: exercises.length > 0 
          ? exercises[exercises.length - 1].updatedAt 
          : null
      };
    });

    return res.json({
      message: [{ key: "success", value: "Subcategories retrieved successfully" }],
      data: { 
        subcategories: subcategoryDetails,
        section: section,
        total: subcategories.length,
        entityType: type,
        entityId: id
      }
    });

  } catch (err) {
    console.error("❌ Get subcategories error:", err);
    res.status(500).json({ 
      message: [{ key: "error", value: "Internal server error" }] 
    });
  }
};




exports.lockExercise = async (req, res) => {
  try {
    const userId = req.body.targetUserId || req.user._id;
    const {
      courseId,
      exerciseId,
      category,
      subcategory,
      status,
      isLocked,
      reason
    } = req.body;


    if (!courseId || !exerciseId || !subcategory) {
      return res.status(400).json({ message: [{ key: "error", value: "Missing required fields" }] });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: [{ key: "error", value: "User not found" }] });

    // 1. Find Course Index
    const courseIndex = user.courses.findIndex(c => c.courseId && c.courseId.toString() === courseId);
    
    if (courseIndex === -1) {
      return res.status(404).json({ message: [{ key: "error", value: "Course not enrolled" }] });
    }

    const userCourse = user.courses[courseIndex];

    // 2. Ensure Path Exists
    if (!userCourse.answers) userCourse.answers = { I_Do: new Map(), We_Do: new Map(), You_Do: new Map() };
    
    const categoryKey = category;
    if (!userCourse.answers[categoryKey]) userCourse.answers[categoryKey] = new Map();
    
    const categoryMap = userCourse.answers[categoryKey];
    
    // 3. Get Exercises Array
    let exercisesArray = categoryMap.get(subcategory) || [];
    if (exercisesArray.toObject) exercisesArray = exercisesArray.toObject();

    // 4. Handle Screen Recording Upload from Form-Data
    let screenRecordingUrl = null;
    
    // Check if file exists in the request (for form-data uploads)
    if (req.files && req.files.screenRecording) {
      try {
        const screenRecordingFile = req.files.screenRecording;
        
        // Upload to Cloudinary from buffer
        const uploadResult = await new Promise((resolve, reject) => {
          // Create upload stream to Cloudinary
          const uploadStream = cloudinary.uploader.upload_stream(
            {
              resource_type: 'video',
              folder: `lms/pedagogy/${category}/${subcategory}/screen-recordings`,
              overwrite: true,
              chunk_size: 6000000, // 6MB chunks
              eager: [
                { width: 640, height: 480, crop: "scale" }
              ]
            },
            (error, result) => {
              if (error) {
                console.error('❌ Cloudinary upload error:', error);
                reject(error);
              } else {
                resolve(result);
              }
            }
          );
          
          // Create readable stream from buffer
          const bufferStream = new stream.PassThrough();
          bufferStream.end(screenRecordingFile.data);
          
          // Pipe buffer to Cloudinary upload stream
          bufferStream.pipe(uploadStream);
        });
        
        screenRecordingUrl = uploadResult.secure_url;
      } catch (uploadError) {
        console.error("❌ Error uploading screen recording to Cloudinary:", uploadError);
        // Continue without failing the entire operation
      }
    }
    // Also check if screenRecording was sent as Base64 in body (for backward compatibility)
    else if (req.body.screenRecording && req.body.screenRecording.startsWith('data:video/')) {
      try {
        const base64Data = req.body.screenRecording;
        
        const uploadResult = await cloudinary.uploader.upload(base64Data, {
          resource_type: 'video',
          folder: `lms/pedagogy/${category}/${subcategory}/screen-recordings`,
          overwrite: true,
          chunk_size: 6000000
        });
        
        screenRecordingUrl = uploadResult.secure_url;
      } catch (uploadError) {
        console.error("❌ Error uploading Base64 screen recording:", uploadError);
      }
    }

    // 5. Update or Push Exercise Progress
    const exerciseIndex = exercisesArray.findIndex(ex => ex.exerciseId && ex.exerciseId.toString() === exerciseId);
    let updatedExercise = null;

    if (exerciseIndex > -1) {
      // Update Existing
      if (status) exercisesArray[exerciseIndex].status = status;
      if (isLocked !== undefined) exercisesArray[exerciseIndex].isLocked = isLocked;
      else if (status === 'terminated') exercisesArray[exerciseIndex].isLocked = true;
      
      // Add screen recording URL if uploaded
      if (screenRecordingUrl) {
        exercisesArray[exerciseIndex].screenRecording = screenRecordingUrl;
      }
      
      updatedExercise = exercisesArray[exerciseIndex];
    } else {
      // Create New
      const newEntry = {
        exerciseId: new mongoose.Types.ObjectId(exerciseId),
        status: status || 'in-progress',
        isLocked: isLocked !== undefined ? (isLocked === 'true' || isLocked === true) : (status === 'terminated'),
        questions: [],
        screenRecording: screenRecordingUrl || undefined
      };
      exercisesArray.push(newEntry);
      updatedExercise = newEntry;
    }

    // 6. Save to Database
    categoryMap.set(subcategory, exercisesArray);
    
    // Mark the SPECIFIC path modified
    user.markModified(`courses.${courseIndex}.answers.${categoryKey}`);
    
    await user.save();
    console.log("✅ Exercise status updated successfully",updatedExercise);
    return res.status(200).json({
      message: [{ key: "success", value: "Exercise status updated successfully" }],
      data: updatedExercise
    });

  } catch (error) {
    console.error("Lock Exercise Error:", error);
    return res.status(500).json({ 
      message: [{ key: "error", value: "Internal server error" }],
      error: error.message 
    });
  }
};

 
// 2. Get Exercise Status (Debugged)
exports.getExerciseStatus = async (req, res) => {
  try {
    const userId = req.query.targetUserId || req.user._id;
    const { courseId, exerciseId, category = 'We_Do', subcategory } = req.query;
 
    // console.log(`🔍 STATUS REQ: User: ${userId} | Ex: ${exerciseId}`);
 
    if (!courseId || !exerciseId || !subcategory) {
      return res.status(400).json({ message: [{ key: "error", value: "Missing parameters" }] });
    }
 
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: [{ key: "error", value: "User not found" }] });
 
    const userCourse = user.courses ? user.courses.find(c => c.courseId && c.courseId.toString() === courseId) : null;
 
    if (!userCourse || !userCourse.answers) {
      return res.status(200).json({ success: true, data: { isLocked: false, status: 'new' } });
    }
 
    const categoryKey = category || 'We_Do';
    const categoryMap = userCourse.answers[categoryKey];
 
    if (!categoryMap) {
      return res.status(200).json({ success: true, data: { isLocked: false, status: 'new' } });
    }
 
    const exercisesArray = categoryMap.get(subcategory) || [];
 
    // Find the exercise
    const exercise = exercisesArray.find(ex => ex.exerciseId && ex.exerciseId.toString() === exerciseId);
 
    if (exercise) {
      // console.log("👉 Found Status:", exercise.isLocked, exercise.status);
      return res.status(200).json({
        success: true,
        data: {
          isLocked: exercise.isLocked || false,
          status: exercise.status || 'in-progress',
          screenRecording: exercise.screenRecording || 'empty'
 
        }
      });
    }
 
    // console.log("👉 Exercise Not Found in Array, returning unlocked");
    return res.status(200).json({
      success: true,
      data: { isLocked: false, status: 'new' }
    });
 
  } catch (error) {
    console.error("Get Status Error:", error);
    return res.status(500).json({ message: [{ key: "error", value: "Internal server error" }] });
  }
};
 
 

// Add question to exercise based on exerciseId
exports.addQuestion = async (req, res) => {
  try {
    const { type, id, exerciseId } = req.params;
    const {
      tabType,
      subcategory,
      questionsData, // Accept array of questions
      questionType, // Keep for backward compatibility
      ...questionFields // Keep for backward compatibility
    } = req.body;
 
    // Validate required parameters
    if (!type || !modelMap[type]) {
      return res.status(400).json({
        message: [{ key: "error", value: `Invalid entity type: ${type}. Valid types: modules, submodules, topics, subtopics` }]
      });
    }
 
    // Check if we have multiple questions or single question
    const isMultipleQuestions = Array.isArray(questionsData) && questionsData.length > 0;
    const questionsToAdd = isMultipleQuestions ? questionsData : [req.body];
 
    console.log(`📥 Processing ${questionsToAdd.length} question(s) to add`);
 
    // Validate all questions
    for (let i = 0; i < questionsToAdd.length; i++) {
      const questionData = questionsToAdd[i];
      const questionIndex = i + 1;
     
      // Get question type
      const qType = questionData.questionType || questionType;
      const validQuestionTypes = ['mcq', 'programming'];
     
      if (!qType || !validQuestionTypes.includes(qType)) {
        return res.status(400).json({
          message: [{ key: "error", value: `Invalid question type for question ${questionIndex}: ${qType}. Valid types: ${validQuestionTypes.join(', ')}` }]
        });
      }
 
      // Validate based on question type
      if (qType === 'mcq') {
        // Validate MCQ fields
        if (!questionData.questionTitle || !questionData.questionTitle.trim()) {
          return res.status(400).json({
            message: [{ key: "error", value: `Question ${questionIndex}: MCQ question title is required` }]
          });
        }
        if (!Array.isArray(questionData.options) || questionData.options.length < 2) {
          return res.status(400).json({
            message: [{ key: "error", value: `Question ${questionIndex}: At least 2 options are required for MCQ` }]
          });
        }
        if (!questionData.correctAnswer) {
          return res.status(400).json({
            message: [{ key: "error", value: `Question ${questionIndex}: Correct answer is required for MCQ` }]
          });
        }
      } else if (qType === 'programming') {
        // Validate Programming fields
        if (!questionData.title || !questionData.title.trim()) {
          return res.status(400).json({
            message: [{ key: "error", value: `Question ${questionIndex}: Programming question title is required` }]
          });
        }
        if (!questionData.description || !questionData.description.trim()) {
          return res.status(400).json({
            message: [{ key: "error", value: `Question ${questionIndex}: Programming question description is required` }]
          });
        }
 
        // Validate programming difficulty
        const validDifficulties = ['easy', 'medium', 'hard'];
        const difficulty = questionData.difficulty || 'medium';
        if (!validDifficulties.includes(difficulty)) {
          return res.status(400).json({
            message: [{ key: "error", value: `Question ${questionIndex}: Invalid difficulty. Valid values: ${validDifficulties.join(', ')}` }]
          });
        }
      }
    }
 
    // Get the model from modelMap
    const { model } = modelMap[type];
 
    if (!model) {
      return res.status(400).json({
        message: [{ key: "error", value: `Model not found for type: ${type}` }]
      });
    }
 
    // Find the entity
    const entity = await model.findById(id);
 
    if (!entity) {
      return res.status(404).json({
        message: [{ key: "error", value: `${type} with ID ${id} not found` }]
      });
    }
 
    // Check if pedagogy exists
    if (!entity.pedagogy) {
      return res.status(404).json({
        message: [{ key: "error", value: "No pedagogy structure found in this entity" }]
      });
    }
 
    // Check if tabType exists
    if (!entity.pedagogy[tabType]) {
      return res.status(404).json({
        message: [{ key: "error", value: `No ${tabType} section found in pedagogy` }]
      });
    }
 
    // Convert Map to object if needed
    const tabData = entity.pedagogy[tabType] instanceof Map
      ? Object.fromEntries(entity.pedagogy[tabType])
      : entity.pedagogy[tabType];
 
    // Check if subcategory exists
    if (!tabData[subcategory]) {
      return res.status(404).json({
        message: [{ key: "error", value: `Subcategory "${subcategory}" not found in ${tabType}` }]
      });
    }
 
    const exercises = tabData[subcategory];
 
    if (!Array.isArray(exercises)) {
      return res.status(400).json({
        message: [{ key: "error", value: `Invalid exercises format in subcategory "${subcategory}"` }]
      });
    }
 
    // Find the exercise by ID
    let foundExercise = null;
    let foundExerciseIndex = -1;
 
    for (let i = 0; i < exercises.length; i++) {
      const exercise = exercises[i];
 
      // Check all possible ID fields
      const matches = (
        (exercise._id && exercise._id.toString() === exerciseId) ||
        (exercise.exerciseInformation?.exerciseId === exerciseId) ||
        (exercise.exerciseInformation?._id?.toString() === exerciseId)
      );
 
      if (matches) {
        foundExercise = exercise;
        foundExerciseIndex = i;
        break;
      }
    }
 
    if (!foundExercise) {
      console.error(`❌ Exercise with ID "${exerciseId}" not found in subcategory "${subcategory}"`);
 
      const availableExercises = exercises.map((ex, idx) => ({
        index: idx,
        _id: ex._id?.toString(),
        exerciseId: ex.exerciseInformation?.exerciseId,
        name: ex.exerciseInformation?.exerciseName,
        exerciseLevel: ex.exerciseInformation?.exerciseLevel,
        questionsCount: ex.questions?.length || 0
      }));
 
      return res.status(404).json({
        message: [{
          key: "error",
          value: `Exercise with ID "${exerciseId}" not found in subcategory "${subcategory}". Available exercises: ${availableExercises.length}`
        }],
        availableExercises
      });
    }
 
    // Initialize questions array if not exists
    if (!foundExercise.questions) {
      foundExercise.questions = [];
    }
 
    const addedQuestions = [];
    const startSequence = foundExercise.questions.length;
 
    // Add all questions
    for (let i = 0; i < questionsToAdd.length; i++) {
      const questionData = questionsToAdd[i];
      const questionType = questionData.questionType || qType;
      const questionId = new mongoose.Types.ObjectId();
 
      // Create base question object
      const newQuestion = {
        _id: questionId,
        questionType,
        isActive: questionData.isActive !== undefined ? questionData.isActive : true,
        sequence: startSequence + i,
        createdAt: new Date(),
        updatedAt: new Date()
      };
 
      // Add fields based on question type
      if (questionType === 'mcq') {
        Object.assign(newQuestion, {
          questionTitle: questionData.questionTitle?.trim() || '',
          options: Array.isArray(questionData.options)
            ? questionData.options.map(option => option?.trim() || '')
            : [],
          correctAnswer: questionData.correctAnswer?.trim() || '',
        });
      } else if (questionType === 'programming') {
        Object.assign(newQuestion, {
          title: questionData.title?.trim() || '',
          description: questionData.description?.trim() || '',
          difficulty: questionData.difficulty || 'medium',
          sampleInput: questionData.sampleInput || '',
          sampleOutput: questionData.sampleOutput || '',
          constraints: Array.isArray(questionData.constraints) && questionData.constraints.length > 0
            ? questionData.constraints.filter(c => c && c.trim())
            : undefined,
          hints: Array.isArray(questionData.hints) && questionData.hints.length > 0
            ? questionData.hints.map((hint, index) => ({
                _id: new mongoose.Types.ObjectId(),
                hintText: hint.hintText || hint,
                pointsDeduction: hint.pointsDeduction || 0,
                isPublic: hint.isPublic !== undefined ? hint.isPublic : true,
                sequence: hint.sequence || index
              }))
            : undefined,
          testCases: Array.isArray(questionData.testCases) && questionData.testCases.length > 0
            ? questionData.testCases.map((testCase, index) => ({
                _id: new mongoose.Types.ObjectId(),
                input: testCase.input || '',
                expectedOutput: testCase.expectedOutput || '',
                isSample: testCase.isSample !== undefined ? testCase.isSample : false,
                isHidden: testCase.isHidden !== undefined ? testCase.isHidden : true,
                points: testCase.points || 1,
                explanation: testCase.explanation || `Test case ${index + 1}`,
                sequence: testCase.sequence || index
              }))
            : undefined,
          solutions: questionData.solutions && typeof questionData.solutions === 'object'
            ? {
                startedCode: questionData.solutions.startedCode || '',
                functionName: questionData.solutions.functionName || '',
                language: questionData.solutions.language || ''
              }
            : undefined,
          timeLimit: questionData.timeLimit || 2000,
          memoryLimit: questionData.memoryLimit || 256,
        });
 
        // Remove undefined fields
        Object.keys(newQuestion).forEach(key => {
          if (newQuestion[key] === undefined) {
            delete newQuestion[key];
          }
        });
      }
 
      // Add question to exercise
      foundExercise.questions.push(newQuestion);
      addedQuestions.push({
        question: newQuestion,
        index: startSequence + i
      });
    }
 
    // Update the exercise in the array
    exercises[foundExerciseIndex] = foundExercise;
 
    // Update the entity's pedagogy structure
    if (entity.pedagogy[tabType] instanceof Map) {
      entity.pedagogy[tabType].set(subcategory, exercises);
    } else {
      entity.pedagogy[tabType][subcategory] = exercises;
    }
 
    // Mark as modified
    entity.markModified(`pedagogy.${tabType}.${subcategory}`);
    entity.markModified(`pedagogy.${tabType}.${subcategory}.${foundExerciseIndex}.questions`);
 
    // Update timestamps
    entity.updatedBy = req.user?.email || "roobankr5@gmail.com";
    entity.updatedAt = new Date();
 
    // Save entity
    await entity.save();
 
    // Prepare response data
    const responseData = {
      addedQuestions: addedQuestions.map(q => ({
        questionId: q.question._id.toString(),
        questionTitle: q.question.questionTitle || q.question.title,
        questionType: q.question.questionType,
        sequence: q.index
      })),
      totalAdded: addedQuestions.length,
      exercise: {
        exerciseId: foundExercise.exerciseInformation?.exerciseId || foundExercise._id.toString(),
        exerciseName: foundExercise.exerciseInformation?.exerciseName || "Exercise",
        exerciseLevel: foundExercise.exerciseInformation?.exerciseLevel || "medium",
        totalQuestions: foundExercise.questions.length,
        totalScore: foundExercise.questions.reduce((sum, q) => sum + (q.score || 0), 0)
      },
      entity: {
        type: type,
        id: entity._id.toString(),
        title: entity.title || entity.name || "Entity"
      },
      location: {
        tabType: tabType,
        subcategory: subcategory,
        exerciseIndex: foundExerciseIndex,
        exerciseId: foundExercise._id.toString(),
        startQuestionIndex: startSequence
      }
    };
 
    return res.status(201).json({
      message: [{
        key: "success",
        value: `Added ${addedQuestions.length} question(s) successfully to "${foundExercise.exerciseInformation?.exerciseName}" in ${subcategory}`
      }],
      data: responseData
    });
 
  } catch (err) {
    console.error("❌ Add questions error:", err);
    console.error("❌ Error stack:", err.stack);
   
    res.status(500).json({
      message: [{
        key: "error",
        value: `Internal server error: ${err.message}`
      }],
      error: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
};
 

// Get all questions for an exercise
exports.getQuestions = async (req, res) => {
  try {
    const { type, id, exerciseId } = req.params;
    const { 
      includeInactive = 'false' 
    } = req.query; // Keep includeInactive as query parameter

    // Validate entity type
    if (!type || !modelMap[type]) {
      return res.status(400).json({
        message: [{ key: "error", value: `Invalid entity type: ${type}. Valid types: modules, submodules, topics, subtopics` }]
      });
    }

    // Get the model from modelMap
    const { model } = modelMap[type];

    if (!model) {
      return res.status(400).json({
        message: [{ key: "error", value: `Model not found for type: ${type}` }]
      });
    }

    // Find the entity
    const entity = await model.findById(id);

    if (!entity) {
      return res.status(404).json({
        message: [{ key: "error", value: `${type} with ID ${id} not found` }]
      });
    }

    if (!entity.pedagogy) {
      return res.status(404).json({
        message: [{ key: "error", value: "No pedagogy structure found in this entity" }]
      });
    }

    const validTabTypes = ['I_Do', 'We_Do', 'You_Do'];
    let foundExercise = null;
    let foundTabType = null;
    let foundSubcategory = null;

    // Search through all tab types for the exercise
    for (const tabType of validTabTypes) {
      if (!entity.pedagogy[tabType]) continue;

      // Convert Map to object if needed
      const tabData = entity.pedagogy[tabType] instanceof Map
        ? Object.fromEntries(entity.pedagogy[tabType])
        : entity.pedagogy[tabType];

      // Search through all subcategories in this tabType
      for (const [subcategory, exercises] of Object.entries(tabData)) {
        if (Array.isArray(exercises)) {
          const exercise = exercises.find(ex => {
            // Check both _id and exerciseInformation.exerciseId
            return ex._id && ex._id.toString() === exerciseId ||
              (ex.exerciseInformation && ex.exerciseInformation.exerciseId === exerciseId);
          });
          if (exercise) {
            foundExercise = exercise;
            foundTabType = tabType;
            foundSubcategory = subcategory;
            break;
          }
        }
      }
      if (foundExercise) break; // Stop searching if found
    }

    if (!foundExercise) {
      console.error(`❌ Exercise with ID "${exerciseId}" not found in ${type} "${entity.title || entity.name}"`);

      // Log available exercises for debugging
      const availableExercises = [];
      validTabTypes.forEach(tabType => {
        if (entity.pedagogy[tabType]) {
          const tabData = entity.pedagogy[tabType] instanceof Map
            ? Object.fromEntries(entity.pedagogy[tabType])
            : entity.pedagogy[tabType];
          
          Object.entries(tabData).forEach(([subcat, exercises]) => {
            if (Array.isArray(exercises)) {
              exercises.forEach((ex, idx) => {
                availableExercises.push({
                  tabType: tabType,
                  subcategory: subcat,
                  index: idx,
                  _id: ex._id?.toString(),
                  exerciseId: ex.exerciseInformation?.exerciseId,
                  name: ex.exerciseInformation?.exerciseName,
                  hasQuestions: ex.questions && Array.isArray(ex.questions) ? ex.questions.length : 0
                });
              });
            }
          });
        }
      });
      
      return res.status(404).json({
        message: [{ key: "error", value: `No exercise found with ID ${exerciseId}` }],
        data: {
          questions: [],
          exercise: {
            exerciseId: exerciseId,
            exerciseName: "Unknown Exercise",
            exerciseLevel: "medium",
            totalQuestions: 0,
            totalPoints: 0
          },
          entity: {
            type: type,
            id: entity._id.toString(),
            title: entity.title || entity.name || "Entity",
            tabType: null,
            subcategory: null
          },
          metadata: {
            exerciseId: exerciseId,
            includeInactive: includeInactive === 'true'
          },
          debug: {
            availableExercises: availableExercises
          }
        }
      });
    }

    // Get questions - handle cases where questions might not exist
    let questions = [];
    if (foundExercise.questions && Array.isArray(foundExercise.questions)) {
      questions = foundExercise.questions;
    } else {
      // Initialize empty questions array if it doesn't exist
      foundExercise.questions = [];
    }

    // Filter inactive questions if requested
    if (includeInactive === 'false') {
      questions = questions.filter(q => q.isActive !== false);
    }

    // Sort by sequence
    questions.sort((a, b) => (a.sequence || 0) - (b.sequence || 0));
    
    // Prepare exercise data with all settings including securitySettings
    const exerciseData = {
      _id: foundExercise._id?.toString() || exerciseId,
      exerciseId: foundExercise.exerciseInformation?.exerciseId || exerciseId,
      exerciseName: foundExercise.exerciseInformation?.exerciseName || "Exercise",
      exerciseLevel: foundExercise.exerciseInformation?.exerciseLevel || "medium",
      description: foundExercise.exerciseInformation?.description || "",
      totalQuestions: questions.length,
      totalPoints: questions.reduce((sum, q) => sum + (q.score || 0), 0),
      estimatedTime: foundExercise.exerciseInformation?.estimatedTime || 60,
      
      // Include all settings
      programmingSettings: foundExercise.programmingSettings || {},
      compilerSettings: foundExercise.compilerSettings || {},
      availabilityPeriod: foundExercise.availabilityPeriod || {},
      questionBehavior: foundExercise.questionBehavior || {},
      evaluationSettings: foundExercise.evaluationSettings || {},
      groupSettings: foundExercise.groupSettings || {},
      scoreSettings: foundExercise.scoreSettings || {},
      securitySettings: foundExercise.securitySettings || {}, // Include security settings
      
      createdAt: foundExercise.createdAt,
      updatedAt: foundExercise.updatedAt,
      createdBy: foundExercise.createdBy,
      updatedBy: foundExercise.updatedBy
    };

    return res.status(200).json({
      message: [{ key: "success", value: `Found ${questions.length} questions in ${foundTabType}` }],
      data: {
        questions,
        exercise: exerciseData,
        entity: {
          type: type,
          id: entity._id.toString(),
          title: entity.title || entity.name || "Entity",
          tabType: foundTabType,
          subcategory: foundSubcategory
        },
        metadata: {
          exerciseId: exerciseId,
          tabType: foundTabType,
          subcategory: foundSubcategory,
          includeInactive: includeInactive === 'true',
          totalQuestions: questions.length,
          activeQuestions: questions.filter(q => q.isActive !== false).length,
          inactiveQuestions: questions.filter(q => q.isActive === false).length
        }
      }
    });

  } catch (err) {
    console.error("❌ Get questions error:", err);
    res.status(500).json({
      message: [{ key: "error", value: `Internal server error: ${err.message}` }]
    });
  }
};
// Get single question by ID
exports.getQuestionById = async (req, res) => {
  try {
    const { type, id, exerciseId, questionId } = req.params;

    // Validate entity type
    if (!type || !modelMap[type]) {
      return res.status(400).json({
        message: [{ key: "error", value: `Invalid entity type: ${type}. Valid types: modules, submodules, topics, subtopics` }]
      });
    }

    // Get the model from modelMap
    const { model } = modelMap[type];

    if (!model) {
      return res.status(400).json({
        message: [{ key: "error", value: `Model not found for type: ${type}` }]
      });
    }

    // Find the entity
    const entity = await model.findById(id);

    if (!entity) {
      return res.status(404).json({
        message: [{ key: "error", value: `${type} with ID ${id} not found` }]
      });
    }

    if (!entity.pedagogy) {
      return res.status(404).json({
        message: [{ key: "error", value: "No pedagogy structure found in this entity" }]
      });
    }

    const validTabTypes = ['I_Do', 'We_Do', 'You_Do'];
    let foundExercise = null;
    let foundTabType = null;
    let foundSubcategory = null;
    let foundQuestion = null;
    let questionIndex = -1;

    // Search through all tab types for the exercise and question
    for (const tabType of validTabTypes) {
      if (!entity.pedagogy[tabType]) continue;

      // Convert Map to object if needed
      const tabData = entity.pedagogy[tabType] instanceof Map
        ? Object.fromEntries(entity.pedagogy[tabType])
        : entity.pedagogy[tabType];

      // Search through all subcategories in this tabType
      for (const [subcategory, exercises] of Object.entries(tabData)) {
        if (Array.isArray(exercises)) {
          const exercise = exercises.find(ex => {
            // Check both _id and exerciseInformation.exerciseId
            return ex._id && ex._id.toString() === exerciseId ||
              (ex.exerciseInformation && ex.exerciseInformation.exerciseId === exerciseId);
          });
          
          if (exercise) {
            // Now search for the question within this exercise
            if (exercise.questions && Array.isArray(exercise.questions)) {
              const qIndex = exercise.questions.findIndex(q => 
                q._id && q._id.toString() === questionId
              );
              
              if (qIndex !== -1) {
                foundExercise = exercise;
                foundTabType = tabType;
                foundSubcategory = subcategory;
                foundQuestion = exercise.questions[qIndex];
                questionIndex = qIndex;
                break;
              }
            }
          }
        }
        if (foundQuestion) break;
      }
      if (foundQuestion) break; // Stop searching if found
    }

    if (!foundExercise) {
      return res.status(404).json({
        message: [{ key: "error", value: `Exercise with ID ${exerciseId} not found` }]
      });
    }

    if (!foundQuestion) {
      // Log available questions for debugging
      const availableQuestions = [];
      if (foundExercise.questions && Array.isArray(foundExercise.questions)) {
        foundExercise.questions.forEach((q, idx) => {
          availableQuestions.push({
            index: idx,
            _id: q._id?.toString(),
            title: q.title,
            difficulty: q.difficulty,
            score: q.score
          });
        });
      }
      
      return res.status(404).json({
        message: [{ key: "error", value: `Question with ID ${questionId} not found in exercise ${foundExercise.exerciseInformation?.exerciseName || exerciseId}` }],
        data: {
          exercise: {
            exerciseId: exerciseId,
            exerciseName: foundExercise.exerciseInformation?.exerciseName || "Exercise",
            totalQuestions: foundExercise.questions?.length || 0
          },
          debug: {
            availableQuestions: availableQuestions
          }
        }
      });
    }

    // Prepare exercise data with all settings including securitySettings
    const exerciseData = {
      _id: foundExercise._id?.toString() || exerciseId,
      exerciseId: foundExercise.exerciseInformation?.exerciseId || exerciseId,
      exerciseName: foundExercise.exerciseInformation?.exerciseName || "Exercise",
      exerciseLevel: foundExercise.exerciseInformation?.exerciseLevel || "medium",
      description: foundExercise.exerciseInformation?.description || "",
      totalQuestions: foundExercise.questions?.length || 0,
      totalPoints: foundExercise.questions?.reduce((sum, q) => sum + (q.score || 0), 0) || 0,
      estimatedTime: foundExercise.exerciseInformation?.estimatedTime || 60,
      
      // Include all settings
      programmingSettings: foundExercise.programmingSettings || {},
      compilerSettings: foundExercise.compilerSettings || {},
      availabilityPeriod: foundExercise.availabilityPeriod || {},
      questionBehavior: foundExercise.questionBehavior || {},
      evaluationSettings: foundExercise.evaluationSettings || {},
      groupSettings: foundExercise.groupSettings || {},
      scoreSettings: foundExercise.scoreSettings || {},
      securitySettings: foundExercise.securitySettings || {}, // Include security settings
      
      createdAt: foundExercise.createdAt,
      updatedAt: foundExercise.updatedAt,
      createdBy: foundExercise.createdBy,
      updatedBy: foundExercise.updatedBy
    };

    // Get adjacent questions for navigation
    let previousQuestion = null;
    let nextQuestion = null;
    
    if (foundExercise.questions && Array.isArray(foundExercise.questions)) {
      if (questionIndex > 0) {
        previousQuestion = {
          _id: foundExercise.questions[questionIndex - 1]._id?.toString(),
          title: foundExercise.questions[questionIndex - 1].title,
          sequence: foundExercise.questions[questionIndex - 1].sequence
        };
      }
      
      if (questionIndex < foundExercise.questions.length - 1) {
        nextQuestion = {
          _id: foundExercise.questions[questionIndex + 1]._id?.toString(),
          title: foundExercise.questions[questionIndex + 1].title,
          sequence: foundExercise.questions[questionIndex + 1].sequence
        };
      }
    }

    return res.status(200).json({
      message: [{ key: "success", value: `Question "${foundQuestion.title}" retrieved successfully from ${foundTabType}` }],
      data: {
        question: foundQuestion,
        exercise: exerciseData,
        entity: {
          type: type,
          id: entity._id.toString(),
          title: entity.title || entity.name || "Entity",
          tabType: foundTabType,
          subcategory: foundSubcategory
        },
        navigation: {
          previous: previousQuestion,
          next: nextQuestion,
          currentIndex: questionIndex,
          totalQuestions: foundExercise.questions?.length || 0
        },
        metadata: {
          exerciseId: exerciseId,
          questionId: questionId,
          tabType: foundTabType,
          subcategory: foundSubcategory,
          questionSequence: foundQuestion.sequence || 0,
          isActive: foundQuestion.isActive !== false,
          difficulty: foundQuestion.difficulty || 'medium',
          score: foundQuestion.score || 0
        }
      }
    });

  } catch (err) {
    console.error("❌ Get question by ID error:", err);
    res.status(500).json({
      message: [{ key: "error", value: `Internal server error: ${err.message}` }]
    });
  }
};

// Update question
exports.updateQuestion = async (req, res) => {
  try {
    const { type, id, exerciseId, questionId } = req.params;
    const {
      tabType,
      subcategory,
      title,
      description,
      difficulty,
      score,
      sampleInput,
      sampleOutput,
      constraints,
      hints,
      testCases,
      solutions,
      timeLimit,
      memoryLimit,
      isActive,
      sequence
    } = req.body;

    // Validate entity type
    if (!type || !modelMap[type]) {
      return res.status(400).json({
        message: [{ key: "error", value: `Invalid entity type: ${type}. Valid types: modules, submodules, topics, subtopics` }]
      });
    }

    // Validate required parameters
    if (!tabType) {
      return res.status(400).json({
        message: [{ key: "error", value: "tabType is required (I_Do, We_Do, You_Do)" }]
      });
    }

    if (!subcategory) {
      return res.status(400).json({
        message: [{ key: "error", value: "Subcategory is required (e.g., 'Practical', 'Project Development')" }]
      });
    }

    // Validate difficulty if provided
    if (difficulty !== undefined) {
      const validDifficulties = ['easy', 'medium', 'hard'];
      if (!validDifficulties.includes(difficulty)) {
        return res.status(400).json({
          message: [{ key: "error", value: `Invalid difficulty. Valid values: ${validDifficulties.join(', ')}` }]
        });
      }
    }

    // Validate score if provided
    if (score !== undefined && (typeof score !== 'number' || score < 1 || score > 100)) {
      return res.status(400).json({
        message: [{ key: "error", value: "Score must be a number between 1 and 100" }]
      });
    }

    // Validate test cases if provided
    if (testCases !== undefined && Array.isArray(testCases)) {
      for (let i = 0; i < testCases.length; i++) {
        const testCase = testCases[i];
        if (!testCase.input || !testCase.expectedOutput) {
          return res.status(400).json({
            message: [{ key: "error", value: `Test case ${i + 1} must have input and expectedOutput` }]
          });
        }
      }
    }

    // Get the model from modelMap
    const { model } = modelMap[type];

    if (!model) {
      return res.status(400).json({
        message: [{ key: "error", value: `Model not found for type: ${type}` }]
      });
    }

    // Find the entity
    const entity = await model.findById(id);

    if (!entity) {
      return res.status(404).json({
        message: [{ key: "error", value: `${type} with ID ${id} not found` }]
      });
    }

    // Check if pedagogy exists
    if (!entity.pedagogy) {
      return res.status(404).json({
        message: [{ key: "error", value: "No pedagogy structure found in this entity" }]
      });
    }

    // Check if tabType exists
    if (!entity.pedagogy[tabType]) {
      return res.status(404).json({
        message: [{ key: "error", value: `No ${tabType} section found in pedagogy` }]
      });
    }

    // Convert Map to object if needed
    const tabData = entity.pedagogy[tabType] instanceof Map
      ? Object.fromEntries(entity.pedagogy[tabType])
      : entity.pedagogy[tabType];

    // Check if subcategory exists
    if (!tabData[subcategory]) {
      return res.status(404).json({
        message: [{ key: "error", value: `Subcategory "${subcategory}" not found in ${tabType}` }]
      });
    }

    const exercises = tabData[subcategory];

    if (!Array.isArray(exercises)) {
      return res.status(400).json({
        message: [{ key: "error", value: `Invalid exercises format in subcategory "${subcategory}"` }]
      });
    }

    // Find the exercise by ID
    let foundExercise = null;
    let foundExerciseIndex = -1;

    for (let i = 0; i < exercises.length; i++) {
      const exercise = exercises[i];

      // Check all possible ID fields
      const matches = (
        (exercise._id && exercise._id.toString() === exerciseId) ||
        (exercise.exerciseInformation?.exerciseId === exerciseId) ||
        (exercise.exerciseInformation?._id?.toString() === exerciseId)
      );

      if (matches) {
        foundExercise = exercise;
        foundExerciseIndex = i;
        break;
      }
    }

    if (!foundExercise) {
      console.error(`❌ Exercise with ID "${exerciseId}" not found in subcategory "${subcategory}"`);

      // Log all available exercises for debugging
      const availableExercises = exercises.map((ex, idx) => ({
        index: idx,
        _id: ex._id?.toString(),
        exerciseId: ex.exerciseInformation?.exerciseId,
        name: ex.exerciseInformation?.exerciseName,
        exerciseLevel: ex.exerciseInformation?.exerciseLevel,
        questionsCount: ex.questions?.length || 0
      }));

      return res.status(404).json({
        message: [{
          key: "error",
          value: `Exercise with ID "${exerciseId}" not found in subcategory "${subcategory}". Available exercises: ${availableExercises.length}`
        }],
        availableExercises
      });
    }

    // Check if questions array exists
    if (!foundExercise.questions || !Array.isArray(foundExercise.questions)) {
      return res.status(404).json({
        message: [{ key: "error", value: `No questions found in exercise "${foundExercise.exerciseInformation?.exerciseName}"` }]
      });
    }

    // Find the question by ID
    const questionIndex = foundExercise.questions.findIndex(q => 
      q._id && q._id.toString() === questionId
    );

    if (questionIndex === -1) {
      // Log available questions for debugging
      const availableQuestions = foundExercise.questions.map((q, idx) => ({
        index: idx,
        _id: q._id?.toString(),
        title: q.title,
        difficulty: q.difficulty,
        score: q.score
      }));

      return res.status(404).json({
        message: [{
          key: "error",
          value: `Question with ID "${questionId}" not found in exercise "${foundExercise.exerciseInformation?.exerciseName}"`
        }],
        availableQuestions
      });
    }

    const originalQuestion = foundExercise.questions[questionIndex];
    const questionTitle = originalQuestion.title || "Question";

    // Update question data
    const updatedQuestion = {
      ...originalQuestion,
      updatedAt: new Date()
    };

    // Update specific fields if provided
    if (title !== undefined) {
      updatedQuestion.title = title.trim();
    }

    if (description !== undefined) {
      updatedQuestion.description = description.trim();
    }

    if (difficulty !== undefined) {
      updatedQuestion.difficulty = difficulty;
    }

    if (score !== undefined) {
      updatedQuestion.score = score;
    }

    if (sampleInput !== undefined) {
      updatedQuestion.sampleInput = sampleInput;
    }

    if (sampleOutput !== undefined) {
      updatedQuestion.sampleOutput = sampleOutput;
    }

    if (constraints !== undefined) {
      updatedQuestion.constraints = Array.isArray(constraints) ? constraints.filter(c => c && c.trim()) : [];
    }

    if (hints !== undefined) {
      updatedQuestion.hints = Array.isArray(hints)
        ? hints.map((hint, index) => ({
          _id: hint._id || new mongoose.Types.ObjectId(),
          hintText: hint.hintText || hint,
          pointsDeduction: hint.pointsDeduction || 0,
          isPublic: hint.isPublic !== undefined ? hint.isPublic : true,
          sequence: hint.sequence || index
        }))
        : [];
    }

    if (testCases !== undefined) {
      updatedQuestion.testCases = Array.isArray(testCases)
        ? testCases.map((testCase, index) => ({
          _id: testCase._id || new mongoose.Types.ObjectId(),
          input: testCase.input,
          expectedOutput: testCase.expectedOutput,
          isSample: testCase.isSample !== undefined ? testCase.isSample : false,
          isHidden: testCase.isHidden !== undefined ? testCase.isHidden : true,
          points: testCase.points || 1,
          explanation: testCase.explanation || `Test case ${index + 1}`,
          sequence: testCase.sequence || index
        }))
        : [];
    }

    if (solutions !== undefined) {
      updatedQuestion.solutions = solutions && typeof solutions === 'object'
        ? {
          startedCode: solutions.startedCode || '',
          functionName: solutions.functionName || '',
          language: solutions.language || ''
        }
        : {
          startedCode: '',
          functionName: '',
          language: ''
        };
    }

    if (timeLimit !== undefined) {
      updatedQuestion.timeLimit = timeLimit;
    }

    if (memoryLimit !== undefined) {
      updatedQuestion.memoryLimit = memoryLimit;
    }

    if (isActive !== undefined) {
      updatedQuestion.isActive = isActive;
    }

    if (sequence !== undefined) {
      updatedQuestion.sequence = sequence;
    }

    // Update the question in the array
    foundExercise.questions[questionIndex] = updatedQuestion;

    // Update the exercise in the array
    exercises[foundExerciseIndex] = foundExercise;

    // Update the entity's pedagogy structure
    if (entity.pedagogy[tabType] instanceof Map) {
      entity.pedagogy[tabType].set(subcategory, exercises);
    } else {
      entity.pedagogy[tabType][subcategory] = exercises;
    }

    // Mark as modified
    entity.markModified(`pedagogy.${tabType}.${subcategory}`);
    entity.markModified(`pedagogy.${tabType}.${subcategory}.${foundExerciseIndex}.questions`);

    // Update timestamps
    entity.updatedBy = req.user?.email || "system";
    entity.updatedAt = new Date();

    // Save entity
    await entity.save();

    // Calculate updated totals
    const totalQuestions = foundExercise.questions.length;
    const totalScore = foundExercise.questions.reduce((sum, q) => sum + (q.score || 0), 0);

    // Prepare exercise data with all settings including securitySettings
    const exerciseData = {
      _id: foundExercise._id?.toString() || exerciseId,
      exerciseId: foundExercise.exerciseInformation?.exerciseId || exerciseId,
      exerciseName: foundExercise.exerciseInformation?.exerciseName || "Exercise",
      exerciseLevel: foundExercise.exerciseInformation?.exerciseLevel || "medium",
      description: foundExercise.exerciseInformation?.description || "",
      totalQuestions: totalQuestions,
      totalScore: totalScore,
      estimatedTime: foundExercise.exerciseInformation?.estimatedTime || 60,
      
      // Include all settings
      programmingSettings: foundExercise.programmingSettings || {},
      compilerSettings: foundExercise.compilerSettings || {},
      availabilityPeriod: foundExercise.availabilityPeriod || {},
      questionBehavior: foundExercise.questionBehavior || {},
      evaluationSettings: foundExercise.evaluationSettings || {},
      groupSettings: foundExercise.groupSettings || {},
      scoreSettings: foundExercise.scoreSettings || {},
      securitySettings: foundExercise.securitySettings || {},
      
      createdAt: foundExercise.createdAt,
      updatedAt: foundExercise.updatedAt,
      createdBy: foundExercise.createdBy,
      updatedBy: foundExercise.updatedBy
    };

    const responseData = {
      question: updatedQuestion,
      exercise: exerciseData,
      entity: {
        type: type,
        id: entity._id.toString(),
        title: entity.title || entity.name || "Entity",
        tabType: tabType,
        subcategory: subcategory
      },
      location: {
        tabType: tabType,
        subcategory: subcategory,
        exerciseIndex: foundExerciseIndex,
        exerciseId: foundExercise._id.toString(),
        questionId: questionId.toString(),
        questionIndex: questionIndex
      }
    };

    return res.status(200).json({
      message: [{
        key: "success",
        value: `Question "${questionTitle}" updated successfully in "${foundExercise.exerciseInformation?.exerciseName}"`
      }],
      data: responseData
    });

  } catch (err) {
    console.error("❌ Update question error:", err);
    console.error("❌ Error stack:", err.stack);
    console.error("❌ Error details:", {
      name: err.name,
      message: err.message,
      code: err.code,
      keyValue: err.keyValue
    });

    res.status(500).json({
      message: [{
        key: "error",
        value: `Internal server error: ${err.message}`
      }],
      error: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
};

// Delete question
exports.deleteQuestion = async (req, res) => {
  try {
    const { type, id, exerciseId, questionId } = req.params;
    const {
      tabType,
      subcategory
    } = req.body;

    // Validate entity type
    if (!type || !modelMap[type]) {
      return res.status(400).json({
        message: [{ key: "error", value: `Invalid entity type: ${type}. Valid types: modules, submodules, topics, subtopics` }]
      });
    }

    // Validate required parameters
    if (!tabType) {
      return res.status(400).json({
        message: [{ key: "error", value: "tabType is required (I_Do, We_Do, You_Do)" }]
      });
    }

    if (!subcategory) {
      return res.status(400).json({
        message: [{ key: "error", value: "Subcategory is required (e.g., 'Practical', 'Project Development')" }]
      });
    }

    // Get the model from modelMap
    const { model } = modelMap[type];

    if (!model) {
      return res.status(400).json({
        message: [{ key: "error", value: `Model not found for type: ${type}` }]
      });
    }

    // Find the entity
    const entity = await model.findById(id);

    if (!entity) {
      return res.status(404).json({
        message: [{ key: "error", value: `${type} with ID ${id} not found` }]
      });
    }

    // Check if pedagogy exists
    if (!entity.pedagogy) {
      return res.status(404).json({
        message: [{ key: "error", value: "No pedagogy structure found in this entity" }]
      });
    }

    // Check if tabType exists
    if (!entity.pedagogy[tabType]) {
      return res.status(404).json({
        message: [{ key: "error", value: `No ${tabType} section found in pedagogy` }]
      });
    }

    // Convert Map to object if needed
    const tabData = entity.pedagogy[tabType] instanceof Map
      ? Object.fromEntries(entity.pedagogy[tabType])
      : entity.pedagogy[tabType];

    // Check if subcategory exists
    if (!tabData[subcategory]) {
      return res.status(404).json({
        message: [{ key: "error", value: `Subcategory "${subcategory}" not found in ${tabType}` }]
      });
    }

    const exercises = tabData[subcategory];

    if (!Array.isArray(exercises)) {
      return res.status(400).json({
        message: [{ key: "error", value: `Invalid exercises format in subcategory "${subcategory}"` }]
      });
    }

    // Find the exercise by ID
    let foundExercise = null;
    let foundExerciseIndex = -1;

    for (let i = 0; i < exercises.length; i++) {
      const exercise = exercises[i];

      // Check all possible ID fields
      const matches = (
        (exercise._id && exercise._id.toString() === exerciseId) ||
        (exercise.exerciseInformation?.exerciseId === exerciseId) ||
        (exercise.exerciseInformation?._id?.toString() === exerciseId)
      );

      if (matches) {
        foundExercise = exercise;
        foundExerciseIndex = i;
        break;
      }
    }

    if (!foundExercise) {
      console.error(`❌ Exercise with ID "${exerciseId}" not found in subcategory "${subcategory}"`);

      // Log all available exercises for debugging
      const availableExercises = exercises.map((ex, idx) => ({
        index: idx,
        _id: ex._id?.toString(),
        exerciseId: ex.exerciseInformation?.exerciseId,
        name: ex.exerciseInformation?.exerciseName,
        exerciseLevel: ex.exerciseInformation?.exerciseLevel,
        questionsCount: ex.questions?.length || 0
      }));

      return res.status(404).json({
        message: [{
          key: "error",
          value: `Exercise with ID "${exerciseId}" not found in subcategory "${subcategory}". Available exercises: ${availableExercises.length}`
        }],
        availableExercises
      });
    }

    // Check if questions array exists
    if (!foundExercise.questions || !Array.isArray(foundExercise.questions)) {
      return res.status(404).json({
        message: [{ key: "error", value: `No questions found in exercise "${foundExercise.exerciseInformation?.exerciseName}"` }]
      });
    }

    // Find the question by ID
    const questionIndex = foundExercise.questions.findIndex(q => 
      q._id && q._id.toString() === questionId
    );

    if (questionIndex === -1) {
      // Log available questions for debugging
      const availableQuestions = foundExercise.questions.map((q, idx) => ({
        index: idx,
        _id: q._id?.toString(),
        title: q.title,
        difficulty: q.difficulty,
        score: q.score
      }));

      return res.status(404).json({
        message: [{
          key: "error",
          value: `Question with ID "${questionId}" not found in exercise "${foundExercise.exerciseInformation?.exerciseName}"`
        }],
        availableQuestions
      });
    }

    // Get the question data before deletion for response
    const deletedQuestion = foundExercise.questions[questionIndex];
    const questionTitle = deletedQuestion.title || "Question";

    // Remove the question from the array
    foundExercise.questions.splice(questionIndex, 1);

    // Update the exercise in the array
    exercises[foundExerciseIndex] = foundExercise;

    // Update the entity's pedagogy structure
    if (entity.pedagogy[tabType] instanceof Map) {
      entity.pedagogy[tabType].set(subcategory, exercises);
    } else {
      entity.pedagogy[tabType][subcategory] = exercises;
    }

    // Mark as modified
    entity.markModified(`pedagogy.${tabType}.${subcategory}`);
    entity.markModified(`pedagogy.${tabType}.${subcategory}.${foundExerciseIndex}.questions`);

    // Update timestamps
    entity.updatedBy = req.user?.email || "system";
    entity.updatedAt = new Date();

    // Save entity
    await entity.save();

    // Calculate updated totals
    const totalQuestions = foundExercise.questions.length;
    const totalScore = foundExercise.questions.reduce((sum, q) => sum + (q.score || 0), 0);

    // Prepare exercise data with all settings including securitySettings
    const exerciseData = {
      _id: foundExercise._id?.toString() || exerciseId,
      exerciseId: foundExercise.exerciseInformation?.exerciseId || exerciseId,
      exerciseName: foundExercise.exerciseInformation?.exerciseName || "Exercise",
      exerciseLevel: foundExercise.exerciseInformation?.exerciseLevel || "medium",
      description: foundExercise.exerciseInformation?.description || "",
      totalQuestions: totalQuestions,
      totalScore: totalScore,
      estimatedTime: foundExercise.exerciseInformation?.estimatedTime || 60,
      
      // Include all settings
      programmingSettings: foundExercise.programmingSettings || {},
      compilerSettings: foundExercise.compilerSettings || {},
      availabilityPeriod: foundExercise.availabilityPeriod || {},
      questionBehavior: foundExercise.questionBehavior || {},
      evaluationSettings: foundExercise.evaluationSettings || {},
      groupSettings: foundExercise.groupSettings || {},
      scoreSettings: foundExercise.scoreSettings || {},
      securitySettings: foundExercise.securitySettings || {},
      
      createdAt: foundExercise.createdAt,
      updatedAt: foundExercise.updatedAt,
      createdBy: foundExercise.createdBy,
      updatedBy: foundExercise.updatedBy
    };

    const responseData = {
      deletedQuestion: {
        _id: deletedQuestion._id?.toString(),
        title: deletedQuestion.title,
        description: deletedQuestion.description,
        difficulty: deletedQuestion.difficulty,
        score: deletedQuestion.score,
        deletedAt: new Date()
      },
      exercise: exerciseData,
      entity: {
        type: type,
        id: entity._id.toString(),
        title: entity.title || entity.name || "Entity",
        tabType: tabType,
        subcategory: subcategory
      },
      location: {
        tabType: tabType,
        subcategory: subcategory,
        exerciseIndex: foundExerciseIndex,
        exerciseId: foundExercise._id.toString(),
        deletedQuestionId: questionId.toString(),
        deletedQuestionIndex: questionIndex
      },
      metadata: {
        totalQuestionsAfterDeletion: totalQuestions,
        questionsDeleted: 1,
        remainingQuestions: totalQuestions
      }
    };

    return res.status(200).json({
      message: [{
        key: "success",
        value: `Question "${questionTitle}" deleted successfully from "${foundExercise.exerciseInformation?.exerciseName}"`
      }],
      data: responseData
    });

  } catch (err) {
    console.error("❌ Delete question error:", err);
    console.error("❌ Error stack:", err.stack);
    console.error("❌ Error details:", {
      name: err.name,
      message: err.message,
      code: err.code,
      keyValue: err.keyValue
    });

    res.status(500).json({
      message: [{
        key: "error",
        value: `Internal server error: ${err.message}`
      }],
      error: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
};





exports.getUserExerciseGradeAnalytics = async (req, res) => {
  try {
    const userId = req.user._id;
    const { exerciseId } = req.params;
    const { 
      courseId, 
      category = null,
      subcategory = null
    } = req.query;

    if (!exerciseId || !courseId) {
      return res.status(400).json({
        success: false,
        message: "exerciseId parameter and courseId query are required"
      });
    }

    console.log(`\n🚀 START getUserExerciseGradeAnalytics`);
    console.log(`User: ${userId}, Course: ${courseId}, Exercise: ${exerciseId}`);
    console.log(`Searching with category: ${category || 'ALL'}, subcategory: ${subcategory || 'ALL'}`);

    // 1. Find user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const userCourse = user.courses.find(c => 
      c.courseId && c.courseId.toString() === courseId
    );

    if (!userCourse) {
      return res.status(404).json({
        success: false,
        message: "User is not enrolled in this course"
      });
    }

    console.log(`✅ User course found`);

    // 2. SEARCH USER ANSWERS - IMPROVED SEARCH LOGIC
    let userQuestions = [];
    let foundCategory = null;
    let foundSubcategory = null;
    let foundUserExercise = null;
    
    console.log(`\n🔍 SEARCHING USER ANSWERS...`);
    
    // Define search locations
    const searchCategories = category ? [category] : ['I_Do', 'We_Do', 'You_Do'];
    const searchSubcategories = subcategory ? [subcategory] : ['practical', 'assessments', 'assesments', 'homework', 'practice'];
    
    // Helper function to extract questions from exercise
    const extractQuestionsFromExercise = (exercise) => {
      if (!exercise) return [];
      
      // Check multiple possible locations for questions
      if (exercise.questions && Array.isArray(exercise.questions)) {
        return exercise.questions;
      }
      if (exercise.question && Array.isArray(exercise.question)) {
        return exercise.question;
      }
      if (Array.isArray(exercise)) {
        return exercise; // The exercise itself might be an array of questions
      }
      return [];
    };
    
    // Search through all possible locations
    for (const cat of searchCategories) {
      console.log(`\n🔍 Checking category: ${cat}`);
      
      if (!userCourse.answers || !userCourse.answers[cat]) {
        console.log(`  No answers in category "${cat}"`);
        continue;
      }
      
      const categoryData = userCourse.answers[cat];
      console.log(`  Category data type: ${typeof categoryData}`);
      
      // Handle Map format
      if (categoryData instanceof Map) {
        console.log(`  It's a Map with ${categoryData.size} entries`);
        
        // Search all subcategories in this Map
        for (const subcat of searchSubcategories) {
          console.log(`    🔍 Checking subcategory: ${subcat}`);
          
          const exercises = categoryData.get(subcat);
          if (!exercises) {
            console.log(`    No exercises in "${subcat}"`);
            continue;
          }
          
          console.log(`    Found ${Array.isArray(exercises) ? exercises.length : 1} exercises`);
          
          // Convert to array if needed
          const exerciseArray = Array.isArray(exercises) ? exercises : [exercises];
          
          // Search for the exercise
          const targetId = exerciseId.toString ? exerciseId.toString() : String(exerciseId);
          
          for (const exercise of exerciseArray) {
            if (!exercise || !exercise.exerciseId) continue;
            
            const exId = exercise.exerciseId.toString ? exercise.exerciseId.toString() : String(exercise.exerciseId);
            
            if (exId === targetId) {
              console.log(`    ✅✅✅ FOUND EXERCISE in ${cat}/${subcat}!`);
              console.log(`      Exercise ID: ${exId}`);
              console.log(`      Exercise Name: ${exercise.exerciseName || 'No name'}`);
              
              foundCategory = cat;
              foundSubcategory = subcat;
              foundUserExercise = exercise;
              
              // Extract questions
              userQuestions = extractQuestionsFromExercise(exercise);
              console.log(`      Extracted ${userQuestions.length} user questions`);
              
              // Log question details
              userQuestions.forEach((q, i) => {
                const qId = q.questionId ? 
                  (q.questionId.toString ? q.questionId.toString() : String(q.questionId)) : 
                  'NO_ID';
                console.log(`      Q${i + 1}: ID=${qId}, score=${q.score || 0}, totalScore=${q.totalScore || 0}`);
              });
              
              break;
            }
          }
          
          if (foundUserExercise) break;
        }
      } 
      // Handle Object format
      else if (categoryData && typeof categoryData === 'object') {
        console.log(`  It's an object with keys: ${Object.keys(categoryData)}`);
        
        // Search all subcategories
        for (const subcat of searchSubcategories) {
          console.log(`    🔍 Checking subcategory: ${subcat}`);
          
          if (!categoryData[subcat]) {
            console.log(`    No data in "${subcat}"`);
            continue;
          }
          
          let exercises = categoryData[subcat];
          if (!Array.isArray(exercises)) {
            exercises = [exercises];
          }
          
          console.log(`    Found ${exercises.length} exercises`);
          
          // Search for the exercise
          const targetId = exerciseId.toString ? exerciseId.toString() : String(exerciseId);
          
          for (const exercise of exercises) {
            if (!exercise || !exercise.exerciseId) continue;
            
            const exId = exercise.exerciseId.toString ? exercise.exerciseId.toString() : String(exercise.exerciseId);
            
            if (exId === targetId) {
              console.log(`    ✅✅✅ FOUND EXERCISE in ${cat}/${subcat}!`);
              
              foundCategory = cat;
              foundSubcategory = subcat;
              foundUserExercise = exercise;
              
              // Extract questions
              userQuestions = extractQuestionsFromExercise(exercise);
              console.log(`      Extracted ${userQuestions.length} user questions`);
              
              break;
            }
          }
          
          if (foundUserExercise) break;
        }
      }
      
      if (foundUserExercise) break;
    }
    
    console.log(`\n📊 USER ANSWERS SUMMARY:`);
    console.log(`  Found in: ${foundCategory}/${foundSubcategory}`);
    console.log(`  Found exercise: ${!!foundUserExercise}`);
    console.log(`  Total user questions: ${userQuestions.length}`);
    
    if (userQuestions.length > 0) {
      const withScores = userQuestions.filter(q => q && (q.score > 0 || q.totalScore > 0));
      console.log(`  Questions with scores > 0: ${withScores.length}`);
      
      userQuestions.forEach((q, i) => {
        if (q) {
          const qId = q.questionId ? 
            (q.questionId.toString ? q.questionId.toString() : String(q.questionId)) : 
            'NO_ID';
          console.log(`  Q${i + 1}: ID=${qId}, score=${q.score || 0}, totalScore=${q.totalScore || 0}, status=${q.status || 'unknown'}`);
        }
      });
    } else {
      console.log(`  ⚠️ No user questions found`);
    }

    // 3. FIND EXERCISE DETAILS FROM COURSE STRUCTURE
    let exerciseDetails = null;
    let allQuestions = [];
    
    console.log(`\n🔍 Searching for exercise details in course structure...`);
    
    // Function to find exercise in pedagogy
    const findExerciseInPedagogy = (pedagogy, targetExerciseId) => {
      if (!pedagogy) return null;
      
      const targetIdStr = targetExerciseId.toString ? targetExerciseId.toString() : String(targetExerciseId);
      
      const categories = ['I_Do', 'We_Do', 'You_Do'];
      const subcategories = ['practical', 'assessments', 'assesments', 'homework'];
      
      for (const cat of categories) {
        if (pedagogy[cat]) {
          const sectionData = pedagogy[cat];
          
          // Handle Map format
          if (sectionData instanceof Map) {
            for (const subcat of subcategories) {
              const exercises = sectionData.get(subcat);
              if (exercises && Array.isArray(exercises)) {
                const found = exercises.find(ex => {
                  if (!ex._id) return false;
                  const exId = ex._id.toString ? ex._id.toString() : String(ex._id);
                  return exId === targetIdStr;
                });
                if (found) {
                  console.log(`  Found in pedagogy: ${cat}/${subcat}`);
                  return { exercise: found, category: cat, subcategory: subcat };
                }
              }
            }
          } 
          // Handle Object format
          else if (typeof sectionData === 'object') {
            for (const subcat of subcategories) {
              if (sectionData[subcat] && Array.isArray(sectionData[subcat])) {
                const found = sectionData[subcat].find(ex => {
                  if (!ex._id) return false;
                  const exId = ex._id.toString ? ex._id.toString() : String(ex._id);
                  return exId === targetIdStr;
                });
                if (found) {
                  console.log(`  Found in pedagogy: ${cat}/${subcat}`);
                  return { exercise: found, category: cat, subcategory: subcat };
                }
              }
            }
          }
        }
      }
      
      return null;
    };
    
    // Search in all entity models
    const entityModels = [
      { name: 'Module1', model: Module1 },
      { name: 'SubModule1', model: SubModule1 },
      { name: 'Topic1', model: Topic1 },
      { name: 'SubTopic1', model: SubTopic1 }
    ];
    
    let foundInEntity = null;
    
    for (const { name, model } of entityModels) {
      try {
        const entities = await model.find({ courses: courseId }).lean();
        console.log(`  Checking ${name}: ${entities.length} entities`);
        
        for (const entity of entities) {
          const result = findExerciseInPedagogy(entity.pedagogy, exerciseId);
          if (result) {
            exerciseDetails = result.exercise;
            foundInEntity = {
              type: name,
              id: entity._id,
              title: entity.title || entity.name || "Entity"
            };
            
            // Get questions from exercise
            allQuestions = exerciseDetails.questions || [];
            
            console.log(`  ✅ EXERCISE FOUND in ${name}: "${entity.title || entity.name}"`);
            console.log(`    Exercise Name: ${exerciseDetails.exerciseInformation?.exerciseName}`);
            console.log(`    Total Questions: ${allQuestions.length}`);
            
            // Log exercise questions
            allQuestions.forEach((q, i) => {
              const qId = q._id ? q._id.toString() : 'NO_ID';
              console.log(`    Q${i + 1}: "${q.title || 'Untitled'}", ID=${qId}, score=${q.score || 10}`);
            });
            
            break;
          }
        }
        
        if (exerciseDetails) break;
      } catch (err) {
        console.log(`  Error checking ${name}: ${err.message}`);
      }
    }

    if (!exerciseDetails) {
      console.log(`❌ Exercise not found in course structure`);
      return res.status(404).json({
        success: false,
        message: "Exercise not found in course structure"
      });
    }

    // 4. MATCH QUESTIONS WITH DETAILED DEBUGGING
    console.log(`\n🔍 MATCHING QUESTIONS...`);
    console.log(`User questions to match: ${userQuestions.length}`);
    console.log(`Exercise questions: ${allQuestions.length}`);
    
    // Create a map of user questions for quick lookup
    const userQuestionMap = new Map();
    userQuestions.forEach((userQ, index) => {
      if (userQ && userQ.questionId) {
        const qId = userQ.questionId.toString ? userQ.questionId.toString() : String(userQ.questionId);
        userQuestionMap.set(qId, {
          data: userQ,
          index: index
        });
        console.log(`  User Q${index + 1}: ID=${qId}, score=${userQ.score || 0}`);
      }
    });
    
    // Match exercise questions with user attempts
    const questionsWithScores = allQuestions.map((exerciseQuestion, index) => {
      const exerciseQId = exerciseQuestion._id ? exerciseQuestion._id.toString() : null;
      const exerciseTitle = exerciseQuestion.title || `Question ${index + 1}`;
      
      let userAttempt = null;
      let matchedBy = null;
      
      if (exerciseQId && userQuestionMap.size > 0) {
        console.log(`\n🔍 Matching: "${exerciseTitle}" (${exerciseQId})`);
        
        // Look for exact match
        if (userQuestionMap.has(exerciseQId)) {
          const userQData = userQuestionMap.get(exerciseQId);
          userAttempt = userQData.data;
          matchedBy = 'exact_id_match';
          console.log(`  ✅ EXACT MATCH! Score: ${userAttempt.score || 0}/${userAttempt.totalScore || 0}`);
        } else {
          console.log(`  ❌ No exact match found for ID: ${exerciseQId}`);
          
          // Try partial matching if needed
          for (const [userQId, userQData] of userQuestionMap.entries()) {
            if (userQId.includes(exerciseQId) || exerciseQId.includes(userQId)) {
              userAttempt = userQData.data;
              matchedBy = 'partial_id_match';
              console.log(`  ⚠️ PARTIAL MATCH: ${userQId} ≈ ${exerciseQId}`);
              break;
            }
          }
        }
      } else {
        console.log(`\n⚠️ No user questions to match with: "${exerciseTitle}"`);
      }
      
      // Calculate scores
      const questionMaxScore = exerciseQuestion.score || 10;
      const userScore = userAttempt?.score || 0;
      const totalScore = userAttempt?.totalScore || questionMaxScore;
      const percentage = totalScore > 0 ? (userScore / totalScore) * 100 : 0;
      
      return {
        _id: exerciseQuestion._id,
        sequence: exerciseQuestion.sequence || index + 1,
        title: exerciseTitle,
        difficulty: exerciseQuestion.difficulty || 'medium',
        maxScore: questionMaxScore,
        userScore: userScore,
        totalScore: totalScore,
        percentage: percentage.toFixed(2),
        isCorrect: userAttempt?.isCorrect || (userAttempt?.status === 'solved') || percentage >= 70,
        userAttempt: userAttempt ? {
          status: userAttempt.status || 'attempted',
          attempts: userAttempt.attempts || 1,
          score: userAttempt.score,
          totalScore: userAttempt.totalScore,
          feedback: userAttempt.feedback || '',
          language: userAttempt.language || '',
          submittedAt: userAttempt.submittedAt,
          evaluatedAt: userAttempt.evaluatedAt,
          matchedBy: matchedBy
        } : null,
        debug: {
          exerciseQuestionId: exerciseQId,
          userQuestionId: userAttempt?.questionId?.toString?.(),
          matched: !!userAttempt
        }
      };
    });

    // 5. CALCULATE ANALYTICS
    const evaluatedQuestions = questionsWithScores.filter(q => q.userScore > 0);
    const attemptedQuestions = questionsWithScores.filter(q => q.userAttempt);
    const correctQuestions = questionsWithScores.filter(q => q.isCorrect);
    
    console.log(`\n📊 FINAL RESULTS:`);
    console.log(`  Total exercise questions: ${allQuestions.length}`);
    console.log(`  User attempts found: ${userQuestions.length}`);
    console.log(`  Matched questions: ${attemptedQuestions.length}`);
    console.log(`  Questions with scores > 0: ${evaluatedQuestions.length}`);
    console.log(`  Correct questions: ${correctQuestions.length}`);
    
    const totalUserScore = evaluatedQuestions.reduce((sum, q) => sum + q.userScore, 0);
    const totalMaxScore = questionsWithScores.reduce((sum, q) => sum + q.maxScore, 0);
    const overallPercentage = totalMaxScore > 0 ? (totalUserScore / totalMaxScore) * 100 : 0;
    
    console.log(`  Total User Score: ${totalUserScore.toFixed(2)} / ${totalMaxScore}`);
    console.log(`  Overall Percentage: ${overallPercentage.toFixed(2)}%`);

    // 6. PREPARE RESPONSE
    const response = {
      success: true,
      data: {
        user: {
          _id: user._id,
          name: `${user.firstName} ${user.lastName || ''}`,
          email: user.email
        },
        exercise: {
          _id: exerciseId,
          name: exerciseDetails.exerciseInformation?.exerciseName || "Exercise",
          totalQuestions: allQuestions.length,
          foundInCategory: foundCategory,
          foundInSubcategory: foundSubcategory,
          entity: foundInEntity
        },
        summary: {
          totalQuestions: allQuestions.length,
          attemptedQuestions: attemptedQuestions.length,
          evaluatedQuestions: evaluatedQuestions.length,
          correctQuestions: correctQuestions.length,
          totalScore: totalUserScore.toFixed(2),
          maxPossibleScore: totalMaxScore,
          overallPercentage: overallPercentage.toFixed(2),
          completionRate: allQuestions.length > 0 ? 
            ((attemptedQuestions.length / allQuestions.length) * 100).toFixed(2) : "0.00",
          averageScore: attemptedQuestions.length > 0 ? 
            (totalUserScore / attemptedQuestions.length).toFixed(2) : "0.00"
        },
        questions: questionsWithScores,
        grade: {
          obtained: totalUserScore,
          outOf: totalMaxScore,
          percentage: overallPercentage.toFixed(2),
          letterGrade: getLetterGrade(overallPercentage),
          isPassing: overallPercentage >= 70
        },
        debug: {
          userQuestionsFound: userQuestions.length,
          exerciseQuestionsFound: allQuestions.length,
          matchesFound: attemptedQuestions.length,
          searchLocation: `${foundCategory}/${foundSubcategory}`,
          userQuestions: userQuestions.map(q => ({
            questionId: q.questionId ? 
              (q.questionId.toString ? q.questionId.toString() : String(q.questionId)) : 
              null,
            score: q.score || 0,
            totalScore: q.totalScore || 0,
            status: q.status || 'unknown'
          })),
          matchingDetails: {
            exactMatches: questionsWithScores.filter(q => q.userAttempt?.matchedBy === 'exact_id_match').length,
            partialMatches: questionsWithScores.filter(q => q.userAttempt?.matchedBy === 'partial_id_match').length,
            noMatches: questionsWithScores.filter(q => !q.userAttempt).length
          }
        }
      }
    };

    console.log(`\n✅ getUserExerciseGradeAnalytics COMPLETE`);
    console.log(`Response sent with ${attemptedQuestions.length} matched questions`);
    
    return res.status(200).json(response);

  } catch (error) {
    console.error("❌ getUserExerciseGradeAnalytics error:", error);
    console.error("❌ Error stack:", error.stack);
    
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};



// Helper function for letter grade
function getLetterGrade(percentage) {
  if (percentage >= 90) return 'A';
  if (percentage >= 80) return 'B';
  if (percentage >= 70) return 'C';
  if (percentage >= 60) return 'D';
  return 'F';
}






// Get all exercises for a course with user scores and questions
exports.getCourseExercisesWithUserScores = async (req, res) => {
  try {
    const { courseId } = req.params;
    const userId = req.user._id; // Authenticated user (or pass userId if admin)
    const { targetUserId } = req.query; // Optional: for admin viewing other users

    const finalUserId = targetUserId || userId;

    console.log(`📊 Fetching exercises for Course: ${courseId}, User: ${finalUserId}`);

    if (!courseId) {
      return res.status(400).json({
        success: false,
        message: "courseId parameter is required"
      });
    }

    // 1. Find the user to get their progress
    const user = await User.findById(finalUserId)
      .select('firstName lastName email courses')
      .lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    // 2. Find user's course progress
    const userCourse = user.courses?.find(c => 
      c.courseId && c.courseId.toString() === courseId
    );

    if (!userCourse) {
      return res.status(404).json({
        success: false,
        message: "User is not enrolled in this course"
      });
    }

    // 3. Get all entities (modules, submodules, topics, subtopics) for this course
    const allEntities = [];
    
    // Get modules
    const modules = await Module1.find({ courses: courseId })
      .select('_id title description level duration pedagogy')
      .lean();
    modules.forEach(mod => allEntities.push({ ...mod, type: 'module' }));

    // Get submodules
    const subModules = await SubModule1.find({ courses: courseId })
      .select('_id title description level duration pedagogy')
      .lean();
    subModules.forEach(sub => allEntities.push({ ...sub, type: 'submodule' }));

    // Get topics
    const topics = await Topic1.find({ courses: courseId })
      .select('_id title description level duration pedagogy')
      .lean();
    topics.forEach(topic => allEntities.push({ ...topic, type: 'topic' }));

    // Get subtopics
    const subTopics = await SubTopic1.find({ courses: courseId })
      .select('_id title description level duration pedagogy')
      .lean();
    subTopics.forEach(st => allEntities.push({ ...st, type: 'subtopic' }));

    // 4. Extract all exercises from all entities
    const allExercises = [];
    const entityMap = new Map(); // Map entity ID to entity info

    allEntities.forEach(entity => {
      entityMap.set(entity._id.toString(), {
        type: entity.type,
        title: entity.title,
        description: entity.description
      });

      if (entity.pedagogy) {
        // Search through all pedagogy sections
        ['I_Do', 'We_Do', 'You_Do'].forEach(section => {
          const sectionData = entity.pedagogy[section];
          if (!sectionData) return;

          // Handle both Map and object formats
          let subcategories = [];
          if (sectionData instanceof Map) {
            subcategories = Array.from(sectionData.entries());
          } else if (typeof sectionData === 'object') {
            subcategories = Object.entries(sectionData);
          }

          subcategories.forEach(([subcategory, value]) => {
            if (!value) return;

            let exercisesArray = [];
            if (Array.isArray(value)) {
              exercisesArray = value;
            } else if (value.exercises && Array.isArray(value.exercises)) {
              exercisesArray = value.exercises;
            } else if (value._id) {
              // Single exercise object
              exercisesArray = [value];
            }

            exercisesArray.forEach(exercise => {
              if (exercise && exercise._id) {
                allExercises.push({
                  ...exercise,
                  entity: {
                    id: entity._id,
                    type: entity.type,
                    title: entity.title
                  },
                  section,
                  subcategory,
                  location: `${entity.type}/${entity.title}/${section}/${subcategory}`
                });
              }
            });
          });
        });
      }
    });

    // 5. Get user's progress for these exercises
    const userProgressMap = new Map();
    
    // Search in user's course progress
    if (userCourse.answers) {
      ['I_Do', 'We_Do', 'You_Do'].forEach(section => {
        const sectionData = userCourse.answers[section];
        if (!sectionData) return;

        // Handle both Map and object formats
        let subcategories = [];
        if (sectionData instanceof Map) {
          subcategories = Array.from(sectionData.entries());
        } else if (typeof sectionData === 'object') {
          subcategories = Object.entries(sectionData);
        }

        subcategories.forEach(([subcategory, value]) => {
          if (!value) return;

          let exercisesArray = [];
          if (Array.isArray(value)) {
            exercisesArray = value;
          } else if (typeof value === 'object' && value.exercises) {
            exercisesArray = value.exercises;
          } else if (value._id) {
            exercisesArray = [value];
          }

          exercisesArray.forEach(userExercise => {
            if (userExercise && userExercise.exerciseId) {
              userProgressMap.set(userExercise.exerciseId.toString(), {
                status: userExercise.status || 'not_started',
                questions: userExercise.questions || [],
                totalScore: calculateTotalScore(userExercise.questions || []),
                averageScore: calculateAverageScore(userExercise.questions || []),
                completionRate: calculateCompletionRate(userExercise.questions || []),
                lastAccessed: userExercise.updatedAt
              });
            }
          });
        });
      });
    }

    // Helper functions
    function calculateTotalScore(questions) {
      return questions.reduce((sum, q) => sum + (q.score || 0), 0);
    }

    function calculateAverageScore(questions) {
      if (questions.length === 0) return 0;
      return calculateTotalScore(questions) / questions.length;
    }

    function calculateCompletionRate(questions) {
      if (questions.length === 0) return 0;
      const solved = questions.filter(q => 
        q.status === 'solved' || q.isCorrect === true
      ).length;
      return (solved / questions.length) * 100;
    }

    // 6. Combine exercises with user progress
    const exercisesWithProgress = allExercises.map(exercise => {
      const userProgress = userProgressMap.get(exercise._id.toString());
      const questions = exercise.questions || [];
      
      // Calculate exercise statistics
      const totalQuestions = questions.length;
      const totalPoints = questions.reduce((sum, q) => sum + (q.score || 0), 0);
      
      // Calculate difficulty distribution
      const difficultyCount = {
        easy: questions.filter(q => q.difficulty === 'easy').length,
        medium: questions.filter(q => q.difficulty === 'medium').length,
        hard: questions.filter(q => q.difficulty === 'hard').length
      };

      // Get user's question attempts
      const userQuestionAttempts = userProgress?.questions || [];
      const userQuestionMap = new Map();
      userQuestionAttempts.forEach(q => {
        if (q.questionId) {
          userQuestionMap.set(q.questionId.toString(), q);
        }
      });

      // Map questions with user attempts
      const questionsWithAttempts = questions.map(q => {
        const userAttempt = userQuestionMap.get(q._id?.toString());
        return {
          _id: q._id,
          title: q.title,
          difficulty: q.difficulty,
          score: q.score,
          maxScore: q.score,
          userScore: userAttempt?.score || 0,
          status: userAttempt?.status || 'not_attempted',
          isCorrect: userAttempt?.isCorrect || false,
          attempts: userAttempt?.attempts || 0,
          submittedAt: userAttempt?.submittedAt,
          feedback: userAttempt?.feedback,
          language: userAttempt?.language
        };
      });

      return {
        _id: exercise._id,
        exerciseId: exercise.exerciseInformation?.exerciseId,
        exerciseName: exercise.exerciseInformation?.exerciseName || 'Unnamed Exercise',
        description: exercise.exerciseInformation?.description || '',
        exerciseLevel: exercise.exerciseInformation?.exerciseLevel || 'intermediate',
        totalQuestions,
        totalPoints,
        estimatedTime: exercise.exerciseInformation?.estimatedTime || 0,
        
        // Entity location
        entity: exercise.entity,
        section: exercise.section,
        subcategory: exercise.subcategory,
        location: exercise.location,
        
        // User progress
        userProgress: userProgress || {
          status: 'not_started',
          totalScore: 0,
          averageScore: 0,
          completionRate: 0,
          lastAccessed: null
        },
        
        // Difficulty analysis
        difficultyCount,
        
        // Questions with user attempts
        questions: questionsWithAttempts,
        
        // Overall statistics
        statistics: {
          attemptedQuestions: questionsWithAttempts.filter(q => q.status !== 'not_attempted').length,
          solvedQuestions: questionsWithAttempts.filter(q => q.isCorrect === true).length,
          averageScore: calculateAverageScore(userQuestionAttempts),
          totalScore: calculateTotalScore(userQuestionAttempts),
          accuracy: userQuestionAttempts.length > 0 
            ? (questionsWithAttempts.filter(q => q.isCorrect).length / userQuestionAttempts.length) * 100 
            : 0
        },
        
        // Dates
        createdAt: exercise.createdAt,
        startDate: exercise.availabilityPeriod?.startDate,
        endDate: exercise.availabilityPeriod?.endDate,
        
        // Settings
        programmingLanguages: exercise.programmingSettings?.selectedLanguages || [],
        practiceMode: exercise.configurationType?.practiceMode || false,
        manualEvaluation: exercise.configurationType?.manualEvaluation || false
      };
    });

    // 7. Calculate overall course statistics
    const courseStatistics = {
      totalExercises: exercisesWithProgress.length,
      totalQuestions: exercisesWithProgress.reduce((sum, ex) => sum + ex.totalQuestions, 0),
      totalPoints: exercisesWithProgress.reduce((sum, ex) => sum + ex.totalPoints, 0),
      
      completedExercises: exercisesWithProgress.filter(ex => 
        ex.userProgress.status === 'completed' || 
        ex.userProgress.completionRate >= 100
      ).length,
      
      inProgressExercises: exercisesWithProgress.filter(ex => 
        ex.userProgress.status === 'in_progress' || 
        (ex.userProgress.completionRate > 0 && ex.userProgress.completionRate < 100)
      ).length,
      
      notStartedExercises: exercisesWithProgress.filter(ex => 
        ex.userProgress.status === 'not_started' || 
        ex.userProgress.completionRate === 0
      ).length,
      
      overallScore: exercisesWithProgress.reduce((sum, ex) => sum + ex.userProgress.totalScore, 0),
      overallAverage: exercisesWithProgress.length > 0 
        ? exercisesWithProgress.reduce((sum, ex) => sum + ex.userProgress.averageScore, 0) / exercisesWithProgress.length 
        : 0,
      
      overallCompletion: exercisesWithProgress.length > 0 
        ? exercisesWithProgress.reduce((sum, ex) => sum + ex.userProgress.completionRate, 0) / exercisesWithProgress.length 
        : 0,
      
      byDifficulty: {
        easy: {
          total: exercisesWithProgress.reduce((sum, ex) => sum + ex.difficultyCount.easy, 0),
          solved: exercisesWithProgress.reduce((sum, ex) => 
            sum + ex.questions.filter(q => q.difficulty === 'easy' && q.isCorrect).length, 0
          )
        },
        medium: {
          total: exercisesWithProgress.reduce((sum, ex) => sum + ex.difficultyCount.medium, 0),
          solved: exercisesWithProgress.reduce((sum, ex) => 
            sum + ex.questions.filter(q => q.difficulty === 'medium' && q.isCorrect).length, 0
          )
        },
        hard: {
          total: exercisesWithProgress.reduce((sum, ex) => sum + ex.difficultyCount.hard, 0),
          solved: exercisesWithProgress.reduce((sum, ex) => 
            sum + ex.questions.filter(q => q.difficulty === 'hard' && q.isCorrect).length, 0
          )
        }
      }
    };

    // 8. Prepare response
    const response = {
      success: true,
      data: {
        user: {
          _id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email
        },
        course: {
          _id: courseId,
          exercisesCount: exercisesWithProgress.length
        },
        exercises: exercisesWithProgress,
        statistics: courseStatistics,
        summary: {
          fetchedAt: new Date(),
          totalEntities: allEntities.length,
          exercisesFound: exercisesWithProgress.length,
          userProgressAvailable: userProgressMap.size > 0
        }
      }
    };

    return res.status(200).json(response);

  } catch (error) {
    console.error("❌ Get course exercises with user scores error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message
    });
  }
};














// Get all exercises for a course (Admin/Program Coordinator View - No enrollment required)
exports.getCourseExercisesAdminView = async (req, res) => {
  try {
    const { courseId } = req.params;
    const { 
      includeQuestions = 'false', 
      includeUserProgress = 'false',
      userId = null  // Optional: if you want to check a specific user's progress
    } = req.query;

    console.log(`👨‍💼 Admin fetching exercises for Course: ${courseId}`);

    if (!courseId) {
      return res.status(400).json({
        success: false,
        message: "courseId parameter is required"
      });
    }

    // 1. Get course details
    const course = await CourseStructure.findById(courseId)
      .select('courseName courseCode description startDate endDate status')
      .lean();

    if (!course) {
      return res.status(404).json({
        success: false,
        message: "Course not found"
      });
    }

    console.log(`📚 Course found: ${course.courseName}`);

    // 2. Get all entities for this course
    const allEntities = [];
    
    // Get modules
    const modules = await Module1.find({ courses: courseId })
      .select('_id title description level duration orderIndex pedagogy')
      .sort({ orderIndex: 1 })
      .lean();
    modules.forEach(mod => allEntities.push({ ...mod, type: 'module' }));

    // Get submodules
    const subModules = await SubModule1.find({ courses: courseId })
      .select('_id title description level duration orderIndex pedagogy')
      .sort({ orderIndex: 1 })
      .lean();
    subModules.forEach(sub => allEntities.push({ ...sub, type: 'submodule' }));

    // Get topics
    const topics = await Topic1.find({ courses: courseId })
      .select('_id title description level duration orderIndex pedagogy')
      .sort({ orderIndex: 1 })
      .lean();
    topics.forEach(topic => allEntities.push({ ...topic, type: 'topic' }));

    // Get subtopics
    const subTopics = await SubTopic1.find({ courses: courseId })
      .select('_id title description level duration orderIndex pedagogy')
      .sort({ orderIndex: 1 })
      .lean();
    subTopics.forEach(st => allEntities.push({ ...st, type: 'subtopic' }));

    console.log(`📦 Found ${allEntities.length} entities for course`);

    // 3. Extract all exercises from all entities
    const allExercises = [];
    const entityMap = new Map();

    allEntities.forEach(entity => {
      entityMap.set(entity._id.toString(), {
        type: entity.type,
        title: entity.title,
        description: entity.description,
        level: entity.level,
        duration: entity.duration,
        orderIndex: entity.orderIndex
      });

      if (entity.pedagogy) {
        // Search through all pedagogy sections
        ['I_Do', 'We_Do', 'You_Do'].forEach(section => {
          const sectionData = entity.pedagogy[section];
          if (!sectionData) return;

          // Handle both Map and object formats
          let subcategories = [];
          if (sectionData instanceof Map) {
            subcategories = Array.from(sectionData.entries());
          } else if (typeof sectionData === 'object') {
            subcategories = Object.entries(sectionData);
          }

          subcategories.forEach(([subcategory, value]) => {
            if (!value) return;

            let exercisesArray = [];
            if (Array.isArray(value)) {
              exercisesArray = value;
            } else if (value.exercises && Array.isArray(value.exercises)) {
              exercisesArray = value.exercises;
            } else if (value._id) {
              exercisesArray = [value];
            }

            exercisesArray.forEach(exercise => {
              if (exercise && exercise._id) {
                allExercises.push({
                  ...exercise,
                  entity: {
                    id: entity._id,
                    type: entity.type,
                    title: entity.title,
                    description: entity.description,
                    level: entity.level,
                    duration: entity.duration,
                    orderIndex: entity.orderIndex
                  },
                  section,
                  subcategory,
                  location: `${entity.type}/${entity.title}/${section}/${subcategory}`
                });
              }
            });
          });
        });
      }
    });

    console.log(`📊 Found ${allExercises.length} exercises in course`);

    // 4. Optional: Get user progress if userId is provided
    let userProgressMap = new Map();
    let userDetails = null;
    
    if (userId && includeUserProgress === 'true') {
      const user = await User.findById(userId)
        .select('firstName lastName email courses')
        .lean();

      if (user) {
        userDetails = {
          _id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email
        };

        // Find user's course progress
        const userCourse = user.courses?.find(c => 
          c.courseId && c.courseId.toString() === courseId
        );

        if (userCourse && userCourse.answers) {
          ['I_Do', 'We_Do', 'You_Do'].forEach(section => {
            const sectionData = userCourse.answers[section];
            if (!sectionData) return;

            // Handle both Map and object formats
            let subcategories = [];
            if (sectionData instanceof Map) {
              subcategories = Array.from(sectionData.entries());
            } else if (typeof sectionData === 'object') {
              subcategories = Object.entries(sectionData);
            }

            subcategories.forEach(([subcategory, value]) => {
              if (!value) return;

              let exercisesArray = [];
              if (Array.isArray(value)) {
                exercisesArray = value;
              } else if (typeof value === 'object' && value.exercises) {
                exercisesArray = value.exercises;
              } else if (value._id) {
                exercisesArray = [value];
              }

              exercisesArray.forEach(userExercise => {
                if (userExercise && userExercise.exerciseId) {
                  userProgressMap.set(userExercise.exerciseId.toString(), {
                    status: userExercise.status || 'not_started',
                    questions: userExercise.questions || [],
                    totalScore: userExercise.questions?.reduce((sum, q) => sum + (q.score || 0), 0) || 0,
                    averageScore: userExercise.questions?.length > 0 ? 
                      (userExercise.questions.reduce((sum, q) => sum + (q.score || 0), 0) / userExercise.questions.length) : 0,
                    completionRate: userExercise.questions?.length > 0 ? 
                      (userExercise.questions.filter(q => q.status === 'solved' || q.isCorrect === true).length / userExercise.questions.length * 100) : 0,
                    lastAccessed: userExercise.updatedAt,
                    startedAt: userExercise.createdAt
                  });
                }
              });
            });
          });
          console.log(`👤 Found progress for user ${userId}: ${userProgressMap.size} exercises`);
        }
      }
    }

    // 5. Format exercises for response
    const formattedExercises = allExercises.map(exercise => {
      const questions = exercise.questions || [];
      const totalQuestions = questions.length;
      const totalPoints = questions.reduce((sum, q) => sum + (q.score || 0), 0);
      
      // Get user progress for this exercise if available
      const userProgress = userProgressMap.get(exercise._id.toString());
      
      // Format exercise data
      const formattedExercise = {
        _id: exercise._id,
        exerciseId: exercise.exerciseInformation?.exerciseId,
        exerciseName: exercise.exerciseInformation?.exerciseName || 'Unnamed Exercise',
        description: exercise.exerciseInformation?.description || '',
        exerciseLevel: exercise.exerciseInformation?.exerciseLevel || 'intermediate',
        totalQuestions,
        totalPoints,
        estimatedTime: exercise.exerciseInformation?.estimatedTime || 0,
        
        // Entity location
        entity: exercise.entity,
        section: exercise.section,
        subcategory: exercise.subcategory,
        location: exercise.location,
        
        // Settings
        programmingLanguages: exercise.programmingSettings?.selectedLanguages || [],
        practiceMode: exercise.configurationType?.practiceMode || false,
        manualEvaluation: exercise.configurationType?.manualEvaluation || false,
        
        // Dates
        createdAt: exercise.createdAt,
        startDate: exercise.availabilityPeriod?.startDate,
        endDate: exercise.availabilityPeriod?.endDate,
        status: exercise.availabilityPeriod?.startDate && exercise.availabilityPeriod?.endDate ? 
          (new Date() < new Date(exercise.availabilityPeriod.startDate) ? 'scheduled' : 
           new Date() > new Date(exercise.availabilityPeriod.endDate) ? 'expired' : 'active') : 
          'no_dates',
        
        // Question statistics
        questionStatistics: {
          easy: questions.filter(q => q.difficulty === 'easy').length,
          medium: questions.filter(q => q.difficulty === 'medium').length,
          hard: questions.filter(q => q.difficulty === 'hard').length,
          totalQuestions
        }
      };

      // Include questions if requested
      if (includeQuestions === 'true') {
        formattedExercise.questions = questions.map(q => ({
          _id: q._id,
          title: q.title,
          description: q.description,
          difficulty: q.difficulty,
          score: q.score,
          timeLimit: q.timeLimit,
          memoryLimit: q.memoryLimit,
          isActive: q.isActive !== false
        }));
      }

      // Include user progress if available and requested
      if (includeUserProgress === 'true' && userProgress) {
        formattedExercise.userProgress = {
          status: userProgress.status,
          totalScore: userProgress.totalScore,
          averageScore: userProgress.averageScore,
          completionRate: userProgress.completionRate,
          lastAccessed: userProgress.lastAccessed,
          startedAt: userProgress.startedAt,
          questionsAttempted: userProgress.questions?.length || 0,
          questionsSolved: userProgress.questions?.filter(q => 
            q.status === 'solved' || q.isCorrect === true
          ).length || 0
        };
      }

      return formattedExercise;
    });

    // 6. Sort exercises by entity type and order
    formattedExercises.sort((a, b) => {
      // First by entity type order
      const entityOrder = { module: 1, submodule: 2, topic: 3, subtopic: 4 };
      const entityA = entityOrder[a.entity.type] || 5;
      const entityB = entityOrder[b.entity.type] || 5;
      if (entityA !== entityB) return entityA - entityB;
      
      // Then by entity order index
      if (a.entity.orderIndex !== b.entity.orderIndex) {
        return (a.entity.orderIndex || 999) - (b.entity.orderIndex || 999);
      }
      
      // Then by entity title
      return a.entity.title.localeCompare(b.entity.title);
    });

    // 7. Group exercises by entity type for better organization
    const exercisesByEntityType = {
      modules: formattedExercises.filter(ex => ex.entity.type === 'module'),
      submodules: formattedExercises.filter(ex => ex.entity.type === 'submodule'),
      topics: formattedExercises.filter(ex => ex.entity.type === 'topic'),
      subtopics: formattedExercises.filter(ex => ex.entity.type === 'subtopic')
    };

    // 8. Calculate course statistics
    const courseStatistics = {
      totalEntities: allEntities.length,
      totalExercises: formattedExercises.length,
      totalQuestions: formattedExercises.reduce((sum, ex) => sum + ex.totalQuestions, 0),
      totalPoints: formattedExercises.reduce((sum, ex) => sum + ex.totalPoints, 0),
      
      byEntityType: {
        modules: {
          count: exercisesByEntityType.modules.length,
          questions: exercisesByEntityType.modules.reduce((sum, ex) => sum + ex.totalQuestions, 0)
        },
        submodules: {
          count: exercisesByEntityType.submodules.length,
          questions: exercisesByEntityType.submodules.reduce((sum, ex) => sum + ex.totalQuestions, 0)
        },
        topics: {
          count: exercisesByEntityType.topics.length,
          questions: exercisesByEntityType.topics.reduce((sum, ex) => sum + ex.totalQuestions, 0)
        },
        subtopics: {
          count: exercisesByEntityType.subtopics.length,
          questions: exercisesByEntityType.subtopics.reduce((sum, ex) => sum + ex.totalQuestions, 0)
        }
      },
      
      bySection: {
        I_Do: formattedExercises.filter(ex => ex.section === 'I_Do').length,
        We_Do: formattedExercises.filter(ex => ex.section === 'We_Do').length,
        You_Do: formattedExercises.filter(ex => ex.section === 'You_Do').length
      },
      
      byDifficulty: {
        easy: formattedExercises.reduce((sum, ex) => sum + ex.questionStatistics.easy, 0),
        medium: formattedExercises.reduce((sum, ex) => sum + ex.questionStatistics.medium, 0),
        hard: formattedExercises.reduce((sum, ex) => sum + ex.questionStatistics.hard, 0)
      },
      
      byStatus: {
        active: formattedExercises.filter(ex => ex.status === 'active').length,
        scheduled: formattedExercises.filter(ex => ex.status === 'scheduled').length,
        expired: formattedExercises.filter(ex => ex.status === 'expired').length,
        no_dates: formattedExercises.filter(ex => ex.status === 'no_dates').length
      }
    };

    // 9. Prepare final response
    const response = {
      success: true,
      data: {
        course: {
          _id: course._id,
          name: course.courseName,
          code: course.courseCode,
          description: course.description,
          startDate: course.startDate,
          endDate: course.endDate,
          status: course.status
        },
        
        // User details if provided
        ...(userDetails && { user: userDetails }),
        
        // Exercises in different formats
        exercises: formattedExercises,
        exercisesByEntityType,
        
        // Statistics
        statistics: courseStatistics,
        
        // Summary
        summary: {
          fetchedAt: new Date(),
          totalExercises: formattedExercises.length,
          includeQuestions: includeQuestions === 'true',
          includeUserProgress: includeUserProgress === 'true',
          userProgressAvailable: userProgressMap.size > 0
        }
      }
    };

    console.log(`✅ Admin view generated for course ${courseId}`);
    console.log(`   Total exercises: ${formattedExercises.length}`);
    console.log(`   Total questions: ${courseStatistics.totalQuestions}`);
    console.log(`   User progress included: ${includeUserProgress === 'true'}`);

    return res.status(200).json(response);

  } catch (error) {
    console.error("❌ Get course exercises (admin view) error:", error);
    console.error("❌ Error stack:", error.stack);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message
    });
  }
};

// Get enrolled students for a specific exercise (Admin/Program Coordinator View)
exports.getEnrolledStudentsForExercise = async (req, res) => {
  try {
    const { courseId, exerciseId } = req.params;
    const { 
      includeProgress = 'true',
      search = '',
      page = 1,
      limit = 20,
      sortBy = 'name', // name, progress, score, lastAccessed
      sortOrder = 'asc' // asc, desc
    } = req.query;

    console.log(`👨‍🏫 Fetching enrolled students for Exercise: ${exerciseId} in Course: ${courseId}`);

    if (!courseId || !exerciseId) {
      return res.status(400).json({
        success: false,
        message: "courseId and exerciseId parameters are required"
      });
    }

    // 1. Get course details
    const course = await CourseStructure.findById(courseId)
      .select('courseName courseCode description')
      .lean();

    if (!course) {
      return res.status(404).json({
        success: false,
        message: "Course not found"
      });
    }

    // 2. Get exercise details to verify it exists
    let exerciseDetails = null;
    let exerciseFoundIn = null;
    
    // Search for exercise in all entity types
    const entityModels = [
      { name: 'Module1', model: Module1 },
      { name: 'SubModule1', model: SubModule1 },
      { name: 'Topic1', model: Topic1 },
      { name: 'SubTopic1', model: SubTopic1 }
    ];

    for (const { name, model } of entityModels) {
      try {
        const entities = await model.find({ courses: courseId })
          .select('_id title pedagogy')
          .lean();

        for (const entity of entities) {
          if (entity.pedagogy) {
            ['I_Do', 'We_Do', 'You_Do'].forEach(section => {
              if (entity.pedagogy[section]) {
                const sectionData = entity.pedagogy[section];
                let subcategories = [];
                
                if (sectionData instanceof Map) {
                  subcategories = Array.from(sectionData.entries());
                } else if (typeof sectionData === 'object') {
                  subcategories = Object.entries(sectionData);
                }

                subcategories.forEach(([subcategory, exercises]) => {
                  if (!exercises) return;
                  
                  let exercisesArray = [];
                  if (Array.isArray(exercises)) {
                    exercisesArray = exercises;
                  } else if (exercises._id) {
                    exercisesArray = [exercises];
                  }

                  const exercise = exercisesArray.find(ex => 
                    ex._id && ex._id.toString() === exerciseId
                  );

                  if (exercise) {
                    exerciseDetails = {
                      ...exercise,
                      entity: {
                        type: name,
                        id: entity._id,
                        title: entity.title
                      },
                      section,
                      subcategory
                    };
                    exerciseFoundIn = { name, entity, section, subcategory };
                  }
                });
              }
            });
          }
        }
        if (exerciseDetails) break;
      } catch (err) {
        console.log(`Error searching in ${name}:`, err.message);
      }
    }

    if (!exerciseDetails) {
      return res.status(404).json({
        success: false,
        message: "Exercise not found in course structure"
      });
    }

    console.log(`✅ Exercise found: ${exerciseDetails.exerciseInformation?.exerciseName || 'Unnamed'}`);

    // 3. Get all enrolled users for this course - FIXED: Use safe query
    const enrolledUsers = await User.find({
      courses: { $exists: true, $ne: null }
    })
    .select('_id firstName lastName email profile phone status createdAt role courses')
    .lean();

    console.log(`👥 Found ${enrolledUsers.length} users with courses data`);

    // Filter users who are enrolled in this specific course
    const enrolledInCourse = enrolledUsers.filter(user => {
      // Check if user has courses array
      if (!user.courses || !Array.isArray(user.courses)) {
        return false;
      }
      
      // Check if any course matches the courseId
      return user.courses.some(course => 
        course && course.courseId && course.courseId.toString() === courseId
      );
    });

    console.log(`📊 ${enrolledInCourse.length} users enrolled in course ${courseId}`);

    // 4. Process each user to find their exercise progress - FIXED: Added null checks
    const studentsWithProgress = await Promise.all(
      enrolledInCourse.map(async (user) => {
        // FIX: Added null check for user.courses
        const userCourses = user.courses || [];
        const userCourse = userCourses.find(c => 
          c && c.courseId && c.courseId.toString() === courseId
        );

        let exerciseProgress = null;
        let questionAttempts = [];
        let overallScore = 0;
        let completionPercentage = 0;
        let lastActivity = null;
        let status = 'not_started';

        if (userCourse && userCourse.answers) {
          // Search through all sections for this exercise
          ['I_Do', 'We_Do', 'You_Do'].forEach(section => {
            const sectionData = userCourse.answers[section];
            if (!sectionData) return;

            // Handle both Map and object formats
            let subcategories = [];
            if (sectionData instanceof Map) {
              subcategories = Array.from(sectionData.entries());
            } else if (typeof sectionData === 'object') {
              subcategories = Object.entries(sectionData);
            }

            subcategories.forEach(([subcategory, exercises]) => {
              if (!exercises) return;

              let exercisesArray = [];
              if (Array.isArray(exercises)) {
                exercisesArray = exercises;
              } else if (typeof exercises === 'object' && exercises._id) {
                exercisesArray = [exercises];
              }

              // FIX: Added null check for exercisesArray
              if (!exercisesArray || !Array.isArray(exercisesArray)) {
                return;
              }

              const userExercise = exercisesArray.find(ex => 
                ex && ex.exerciseId && ex.exerciseId.toString() === exerciseId
              );

              if (userExercise) {
                exerciseProgress = userExercise;
                questionAttempts = userExercise.questions || [];
                
                // Calculate overall score
                overallScore = questionAttempts.reduce((sum, q) => sum + (q.score || 0), 0);
                
                // Calculate completion percentage
                const totalQuestions = exerciseDetails.questions?.length || 0;
                const attemptedQuestions = questionAttempts.length;
                completionPercentage = totalQuestions > 0 ? 
                  (attemptedQuestions / totalQuestions) * 100 : 0;
                
                // Determine status
                if (questionAttempts.length === 0) {
                  status = 'not_started';
                } else if (questionAttempts.some(q => q.status === 'submitted' || q.status === 'attempted')) {
                  status = 'in_progress';
                } else if (questionAttempts.every(q => q.status === 'solved' || q.status === 'completed')) {
                  status = 'completed';
                } else if (questionAttempts.some(q => q.status === 'evaluated')) {
                  status = 'evaluated';
                }
                
                lastActivity = userExercise.updatedAt || userExercise.createdAt;
              }
            });
          });
        }

        // Get user role name
        let roleName = 'Student';
        if (user.role) {
          if (mongoose.Types.ObjectId.isValid(user.role)) {
            const roleDoc = await mongoose.model('Role').findById(user.role).lean();
            roleName = roleDoc?.renameRole || roleDoc?.originalRole || 'Student';
          } else if (typeof user.role === 'string') {
            roleName = user.role;
          }
        }

        // FIX: Get enrollment date safely
        let enrolledAt = user.createdAt;
        if (userCourse && userCourse.enrolledAt) {
          enrolledAt = userCourse.enrolledAt;
        } else if (userCourse && userCourse.createdAt) {
          enrolledAt = userCourse.createdAt;
        }

        return {
          _id: user._id,
          name: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
          firstName: user.firstName || '',
          lastName: user.lastName || '',
          email: user.email || '',
          profile: user.profile || '',
          phone: user.phone || '',
          status: user.status || 'active',
          role: roleName,
          enrolledAt: enrolledAt,
          lastAccessed: userCourse?.lastAccessed,
          
          // Exercise-specific progress
          exerciseProgress: includeProgress === 'true' ? {
            status,
            overallScore,
            completionPercentage: completionPercentage.toFixed(2),
            questionsAttempted: questionAttempts.length,
            questionsTotal: exerciseDetails.questions?.length || 0,
            lastActivity,
            startedAt: exerciseProgress?.createdAt,
            submittedAt: exerciseProgress?.updatedAt,
            
            // Detailed question attempts
            questionAttempts: includeProgress === 'true' ? questionAttempts.map(q => ({
              questionId: q.questionId,
              title: q.questionTitle || `Question ${q.questionId?.toString().substring(0, 8)}...`,
              score: q.score || 0,
              totalScore: q.totalScore || 0,
              status: q.status || 'attempted',
              isCorrect: q.isCorrect || false,
              attempts: q.attempts || 1,
              submittedAt: q.submittedAt,
              evaluatedAt: q.evaluatedAt,
              feedback: q.feedback || ''
            })) : [],
            
            // Multi-file project info if applicable
            projectType: exerciseProgress?.projectType,
            fileCount: exerciseProgress?.questions?.[0]?.files?.length || 0,
            folderCount: exerciseProgress?.questions?.[0]?.folders?.length || 0
          } : null
        };
      })
    );

    // 5. Apply search filter if provided
    let filteredStudents = studentsWithProgress;
    if (search) {
      const searchLower = search.toLowerCase();
      filteredStudents = studentsWithProgress.filter(student =>
        (student.name && student.name.toLowerCase().includes(searchLower)) ||
        (student.email && student.email.toLowerCase().includes(searchLower)) ||
        (student.role && student.role.toLowerCase().includes(searchLower))
      );
    }

    // 6. Apply sorting
    filteredStudents.sort((a, b) => {
      let aValue, bValue;
      
      switch (sortBy) {
        case 'progress':
          aValue = a.exerciseProgress?.completionPercentage || 0;
          bValue = b.exerciseProgress?.completionPercentage || 0;
          break;
        case 'score':
          aValue = a.exerciseProgress?.overallScore || 0;
          bValue = b.exerciseProgress?.overallScore || 0;
          break;
        case 'lastAccessed':
          aValue = a.exerciseProgress?.lastActivity ? new Date(a.exerciseProgress.lastActivity).getTime() : 0;
          bValue = b.exerciseProgress?.lastActivity ? new Date(b.exerciseProgress.lastActivity).getTime() : 0;
          break;
        case 'name':
        default:
          aValue = a.name ? a.name.toLowerCase() : '';
          bValue = b.name ? b.name.toLowerCase() : '';
      }
      
      if (sortOrder === 'desc') {
        return bValue > aValue ? 1 : bValue < aValue ? -1 : 0;
      } else {
        return aValue > bValue ? 1 : aValue < bValue ? -1 : 0;
      }
    });

    // 7. Apply pagination
    const totalStudents = filteredStudents.length;
    const startIndex = (parseInt(page) - 1) * parseInt(limit);
    const endIndex = startIndex + parseInt(limit);
    const paginatedStudents = filteredStudents.slice(startIndex, endIndex);

    // 8. Calculate exercise statistics
    const exerciseStatistics = {
      totalEnrolled: enrolledInCourse.length,
      studentsWithProgress: studentsWithProgress.filter(s => 
        s.exerciseProgress && s.exerciseProgress.status !== 'not_started'
      ).length,
      
      byStatus: {
        not_started: studentsWithProgress.filter(s => 
          s.exerciseProgress && s.exerciseProgress.status === 'not_started'
        ).length,
        in_progress: studentsWithProgress.filter(s => 
          s.exerciseProgress && s.exerciseProgress.status === 'in_progress'
        ).length,
        completed: studentsWithProgress.filter(s => 
          s.exerciseProgress && s.exerciseProgress.status === 'completed'
        ).length,
        evaluated: studentsWithProgress.filter(s => 
          s.exerciseProgress && s.exerciseProgress.status === 'evaluated'
        ).length
      },
      
      averageScore: studentsWithProgress.length > 0 ?
        studentsWithProgress.reduce((sum, s) => sum + (s.exerciseProgress?.overallScore || 0), 0) / 
        studentsWithProgress.length : 0,
      
      averageCompletion: studentsWithProgress.length > 0 ?
        studentsWithProgress.reduce((sum, s) => sum + parseFloat(s.exerciseProgress?.completionPercentage || 0), 0) / 
        studentsWithProgress.length : 0,
      
      scoreDistribution: {
        '0-20': studentsWithProgress.filter(s => (s.exerciseProgress?.overallScore || 0) <= 20).length,
        '21-40': studentsWithProgress.filter(s => (s.exerciseProgress?.overallScore || 0) > 20 && 
                                                  (s.exerciseProgress?.overallScore || 0) <= 40).length,
        '41-60': studentsWithProgress.filter(s => (s.exerciseProgress?.overallScore || 0) > 40 && 
                                                  (s.exerciseProgress?.overallScore || 0) <= 60).length,
        '61-80': studentsWithProgress.filter(s => (s.exerciseProgress?.overallScore || 0) > 60 && 
                                                  (s.exerciseProgress?.overallScore || 0) <= 80).length,
        '81-100': studentsWithProgress.filter(s => (s.exerciseProgress?.overallScore || 0) > 80).length
      }
    };

    // 9. Prepare final response
    const responseData = {
      success: true,
      data: {
        course: {
          _id: course._id,
          name: course.courseName,
          code: course.courseCode,
          description: course.description
        },
        
        exercise: {
          _id: exerciseDetails._id,
          exerciseId: exerciseDetails.exerciseInformation?.exerciseId,
          name: exerciseDetails.exerciseInformation?.exerciseName || 'Unnamed Exercise',
          description: exerciseDetails.exerciseInformation?.description || '',
          level: exerciseDetails.exerciseInformation?.exerciseLevel || 'intermediate',
          totalQuestions: exerciseDetails.questions?.length || 0,
          totalPoints: exerciseDetails.questions?.reduce((sum, q) => sum + (q.score || 0), 0) || 0,
          
          location: {
            entityType: exerciseFoundIn?.name,
            entityTitle: exerciseFoundIn?.entity?.title,
            section: exerciseFoundIn?.section,
            subcategory: exerciseFoundIn?.subcategory
          },
          
          // Quick access to question titles for reference
          questions: exerciseDetails.questions?.map(q => ({
            _id: q._id,
            title: q.title || 'Untitled Question',
            difficulty: q.difficulty || 'medium',
            score: q.score || 0
          })) || []
        },
        
        students: paginatedStudents,
        
        statistics: exerciseStatistics,
        
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: totalStudents,
          pages: Math.ceil(totalStudents / parseInt(limit)),
          showing: paginatedStudents.length
        },
        
        filters: {
          search,
          includeProgress: includeProgress === 'true',
          sortBy,
          sortOrder
        },
        
        summary: {
          fetchedAt: new Date(),
          totalEnrolled: enrolledInCourse.length,
          exerciseFound: true,
          exerciseName: exerciseDetails.exerciseInformation?.exerciseName || 'Unnamed Exercise'
        }
      }
    };

    console.log(`✅ Exercise student list generated`);
    console.log(`   Total enrolled: ${enrolledInCourse.length}`);
    console.log(`   With progress: ${exerciseStatistics.studentsWithProgress}`);
    console.log(`   Page ${page}: ${paginatedStudents.length} students`);

    return res.status(200).json(responseData);

  } catch (error) {
    console.error("❌ Get enrolled students for exercise error:", error);
    console.error("❌ Error stack:", error.stack);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};


// Get exercise questions with student's answers for admin/coordinator view
exports.getStudentExerciseQuestions = async (req, res) => {
  try {
    const { courseId, studentId, exerciseId } = req.params;
    const { 
      includeCorrectAnswers = 'true',  // Whether to include correct answers
      includeTestCases = 'false',      // Whether to include test cases
      includeHints = 'false'           // Whether to include hints
    } = req.query;

    console.log(`👨‍🏫 Admin viewing student exercise questions`);
    console.log(`Course: ${courseId}, Student: ${studentId}, Exercise: ${exerciseId}`);

    // 1. Validate required parameters
    if (!courseId || !studentId || !exerciseId) {
      return res.status(400).json({
        success: false,
        message: "courseId, studentId, and exerciseId are required"
      });
    }

    // 2. Get student details
    const student = await User.findById(studentId)
      .select('_id firstName lastName email profile status createdAt')
      .lean();

    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student not found"
      });
    }

    // 3. Get course details
    const course = await CourseStructure.findById(courseId)
      .select('courseName courseCode description')
      .lean();

    if (!course) {
      return res.status(404).json({
        success: false,
        message: "Course not found"
      });
    }

    // 4. Check if student is enrolled
    const studentWithCourses = await User.findById(studentId)
      .select('courses')
      .lean();

    const isEnrolled = studentWithCourses?.courses?.some(c => 
      c.courseId && c.courseId.toString() === courseId
    );

    if (!isEnrolled) {
      return res.status(404).json({
        success: false,
        message: "Student is not enrolled in this course"
      });
    }

    // 5. Find the exercise in course structure to get question details
    let exerciseDetails = null;
    let exerciseLocation = null;
    
    // Search in all entity types
    const entityModels = [
      { name: 'Module1', model: Module1 },
      { name: 'SubModule1', model: SubModule1 },
      { name: 'Topic1', model: Topic1 },
      { name: 'SubTopic1', model: SubTopic1 }
    ];

    for (const { name, model } of entityModels) {
      try {
        const entities = await model.find({ courses: courseId })
          .select('_id title pedagogy')
          .lean();

        for (const entity of entities) {
          if (entity.pedagogy) {
            ['I_Do', 'We_Do', 'You_Do'].forEach(section => {
              if (entity.pedagogy[section]) {
                const sectionData = entity.pedagogy[section];
                let subcategories = [];
                
                if (sectionData instanceof Map) {
                  subcategories = Array.from(sectionData.entries());
                } else if (typeof sectionData === 'object') {
                  subcategories = Object.entries(sectionData);
                }

                subcategories.forEach(([subcategory, exercises]) => {
                  if (!exercises) return;
                  
                  let exercisesArray = [];
                  if (Array.isArray(exercises)) {
                    exercisesArray = exercises;
                  } else if (exercises._id) {
                    exercisesArray = [exercises];
                  }

                  const exercise = exercisesArray.find(ex => 
                    ex._id && ex._id.toString() === exerciseId
                  );

                  if (exercise) {
                    exerciseDetails = exercise;
                    exerciseLocation = {
                      entityType: name,
                      entityId: entity._id,
                      entityTitle: entity.title,
                      section,
                      subcategory,
                      fullPath: `${name}/${entity.title}/${section}/${subcategory}`
                    };
                  }
                });
              }
            });
          }
        }
        if (exerciseDetails) break;
      } catch (err) {
        console.log(`Error searching in ${name}:`, err.message);
      }
    }

    if (!exerciseDetails) {
      return res.status(404).json({
        success: false,
        message: "Exercise not found in course structure"
      });
    }

    console.log(`✅ Exercise found: ${exerciseDetails.exerciseInformation?.exerciseName}`);

    // 6. Get student's answers for this exercise
    const studentWithAnswers = await User.findById(studentId)
      .select('courses')
      .lean();

    let studentAnswers = [];
    let exerciseProgress = null;
    let foundInCategory = null;

    if (studentWithAnswers?.courses) {
      const userCourse = studentWithAnswers.courses.find(c => 
        c.courseId && c.courseId.toString() === courseId
      );

      if (userCourse && userCourse.answers) {
        // Search through all categories
        ['I_Do', 'We_Do', 'You_Do'].forEach(category => {
          if (userCourse.answers[category]) {
            const categoryData = userCourse.answers[category];
            
            // Handle both Map and object formats
            let exercisesArray = [];
            if (categoryData instanceof Map) {
              const allExercises = [];
              categoryData.forEach((exArray, key) => {
                if (Array.isArray(exArray)) {
                  allExercises.push(...exArray);
                }
              });
              exercisesArray = allExercises;
            } else if (typeof categoryData === 'object') {
              exercisesArray = Object.values(categoryData).flat();
            }
            
            const userExercise = exercisesArray.find(ex => 
              ex.exerciseId && ex.exerciseId.toString() === exerciseId
            );
            
            if (userExercise) {
              studentAnswers = userExercise.questions || [];
              exerciseProgress = {
                status: userExercise.status || 'not_started',
                totalScore: userExercise.questions?.reduce((sum, q) => sum + (q.score || 0), 0) || 0,
                averageScore: userExercise.questions?.length > 0 ? 
                  (userExercise.questions.reduce((sum, q) => sum + (q.score || 0), 0) / userExercise.questions.length) : 0,
                questionsAttempted: userExercise.questions?.length || 0,
                lastActivity: userExercise.updatedAt || userExercise.createdAt,
                startedAt: userExercise.createdAt,
                projectType: userExercise.projectType,
                fileCount: userExercise.questions?.[0]?.files?.length || 0,
                folderCount: userExercise.questions?.[0]?.folders?.length || 0
              };
              foundInCategory = category;
            }
          }
        });
      }
    }

    console.log(`📝 Found ${studentAnswers.length} student answers for this exercise`);

    // 7. Create a map of student answers for easy lookup
    const studentAnswerMap = new Map();
    studentAnswers.forEach(answer => {
      if (answer.questionId) {
        const questionId = answer.questionId.toString ? answer.questionId.toString() : String(answer.questionId);
        studentAnswerMap.set(questionId, answer);
      }
    });

    // 8. Get exercise questions and combine with student answers
    const exerciseQuestions = exerciseDetails.questions || [];
    
    const questionsWithStudentAnswers = exerciseQuestions.map((question, index) => {
      const questionId = question._id?.toString();
      const studentAnswer = questionId ? studentAnswerMap.get(questionId) : null;
      
      // Format the question with student answer
      const formattedQuestion = {
        _id: question._id,
        sequence: question.sequence || index + 1,
        title: question.title || `Question ${index + 1}`,
        description: question.description || '',
        difficulty: question.difficulty || 'medium',
        score: question.score || 10,
        timeLimit: question.timeLimit || 2000,
        memoryLimit: question.memoryLimit || 256,
        isActive: question.isActive !== false,
        createdAt: question.createdAt,
        
        // Student's attempt (if any)
        studentAttempt: studentAnswer ? {
          _id: studentAnswer._id,
          questionId: studentAnswer.questionId,
          questionTitle: studentAnswer.questionTitle || question.title,
          
          // Code submission details
          codeAnswer: studentAnswer.codeAnswer || '',
          language: studentAnswer.language || '',
          
          // Multi-file project details
          files: studentAnswer.files || [],
          folders: studentAnswer.folders || [],
          projectStructure: studentAnswer.projectStructure || {},
          entryPoints: studentAnswer.entryPoints || [],
          isMultiFile: !!(studentAnswer.files && studentAnswer.files.length > 0),
          
          // Evaluation details
          score: studentAnswer.score || 0,
          totalScore: studentAnswer.totalScore || question.score || 10,
          percentage: studentAnswer.totalScore > 0 ? 
            ((studentAnswer.score || 0) / studentAnswer.totalScore * 100).toFixed(2) : 
            (question.score > 0 ? ((studentAnswer.score || 0) / question.score * 100).toFixed(2) : 0),
          isCorrect: studentAnswer.isCorrect || false,
          status: studentAnswer.status || 'attempted',
          attempts: studentAnswer.attempts || 1,
          feedback: studentAnswer.feedback || '',
          
          // Submission details
          submittedAt: studentAnswer.submittedAt,
          evaluatedAt: studentAnswer.evaluatedAt,
          evaluatedBy: studentAnswer.evaluatedBy,
          createdAt: studentAnswer.createdAt,
          updatedAt: studentAnswer.updatedAt
        } : null,
        
        // Question details (conditionally included)
        ...(includeCorrectAnswers === 'true' && {
          sampleInput: question.sampleInput || '',
          sampleOutput: question.sampleOutput || '',
          constraints: question.constraints || [],
          solutions: question.solutions || {}
        }),
        
        ...(includeHints === 'true' && {
          hints: question.hints || []
        }),
        
        ...(includeTestCases === 'true' && {
          testCases: question.testCases || []
        })
      };
      
      return formattedQuestion;
    });

    // 9. Calculate statistics
    const attemptedQuestions = questionsWithStudentAnswers.filter(q => q.studentAttempt).length;
    const solvedQuestions = questionsWithStudentAnswers.filter(q => 
      q.studentAttempt && (q.studentAttempt.isCorrect || q.studentAttempt.status === 'solved')
    ).length;
    
    const totalScoreObtained = questionsWithStudentAnswers.reduce((sum, q) => 
      sum + (q.studentAttempt?.score || 0), 0
    );
    
    const totalPossibleScore = questionsWithStudentAnswers.reduce((sum, q) => 
      sum + q.score, 0
    );
    
    const overallPercentage = totalPossibleScore > 0 ? 
      (totalScoreObtained / totalPossibleScore * 100).toFixed(2) : 0;

    // 10. Prepare response
    const response = {
      success: true,
      data: {
        // Student information
        student: {
          _id: student._id,
          name: `${student.firstName} ${student.lastName || ''}`,
          email: student.email,
          profile: student.profile || '',
          status: student.status || 'active',
          enrolled: isEnrolled
        },
        
        // Course information
        course: {
          _id: course._id,
          name: course.courseName,
          code: course.courseCode,
          description: course.description
        },
        
        // Exercise information
        exercise: {
          _id: exerciseDetails._id,
          exerciseId: exerciseDetails.exerciseInformation?.exerciseId,
          name: exerciseDetails.exerciseInformation?.exerciseName || 'Unnamed Exercise',
          description: exerciseDetails.exerciseInformation?.description || '',
          level: exerciseDetails.exerciseInformation?.exerciseLevel || 'intermediate',
          totalDuration: exerciseDetails.exerciseInformation?.totalDuration || 0,
          createdAt: exerciseDetails.createdAt,
          
          // Location in course structure
          location: exerciseLocation,
          
          // Exercise settings
          programmingLanguages: exerciseDetails.programmingSettings?.selectedLanguages || [],
          practiceMode: exerciseDetails.configurationType?.practiceMode || false,
          manualEvaluation: exerciseDetails.configurationType?.manualEvaluation || false,
          availabilityPeriod: exerciseDetails.availabilityPeriod || {}
        },
        
        // Questions with student answers
        questions: questionsWithStudentAnswers,
        
        // Student's overall progress for this exercise
        studentProgress: {
          ...exerciseProgress,
          questionsAttempted: attemptedQuestions,
          questionsTotal: questionsWithStudentAnswers.length,
          questionsSolved: solvedQuestions,
          completionPercentage: questionsWithStudentAnswers.length > 0 ? 
            (attemptedQuestions / questionsWithStudentAnswers.length * 100).toFixed(2) : 0,
          totalScoreObtained,
          totalPossibleScore,
          overallPercentage,
          foundInCategory
        },
        
        // Statistics
        statistics: {
          totalQuestions: questionsWithStudentAnswers.length,
          attemptedQuestions,
          solvedQuestions,
          pendingQuestions: questionsWithStudentAnswers.length - attemptedQuestions,
          averageScore: attemptedQuestions > 0 ? (totalScoreObtained / attemptedQuestions).toFixed(2) : 0,
          byDifficulty: {
            easy: {
              total: questionsWithStudentAnswers.filter(q => q.difficulty === 'easy').length,
              attempted: questionsWithStudentAnswers.filter(q => q.difficulty === 'easy' && q.studentAttempt).length,
              solved: questionsWithStudentAnswers.filter(q => q.difficulty === 'easy' && q.studentAttempt?.isCorrect).length
            },
            medium: {
              total: questionsWithStudentAnswers.filter(q => q.difficulty === 'medium').length,
              attempted: questionsWithStudentAnswers.filter(q => q.difficulty === 'medium' && q.studentAttempt).length,
              solved: questionsWithStudentAnswers.filter(q => q.difficulty === 'medium' && q.studentAttempt?.isCorrect).length
            },
            hard: {
              total: questionsWithStudentAnswers.filter(q => q.difficulty === 'hard').length,
              attempted: questionsWithStudentAnswers.filter(q => q.difficulty === 'hard' && q.studentAttempt).length,
              solved: questionsWithStudentAnswers.filter(q => q.difficulty === 'hard' && q.studentAttempt?.isCorrect).length
            }
          }
        },
        
        // Summary
        summary: {
          fetchedAt: new Date(),
          includeCorrectAnswers: includeCorrectAnswers === 'true',
          includeTestCases: includeTestCases === 'true',
          includeHints: includeHints === 'true',
          hasStudentAnswers: studentAnswers.length > 0,
          isMultiFileProject: questionsWithStudentAnswers.some(q => q.studentAttempt?.isMultiFile)
        }
      }
    };

    console.log(`✅ Generated student exercise questions view`);
    console.log(`   Total questions: ${questionsWithStudentAnswers.length}`);
    console.log(`   Student attempts: ${attemptedQuestions}`);
    console.log(`   Overall score: ${totalScoreObtained}/${totalPossibleScore}`);

    return res.status(200).json(response);

  } catch (error) {
    console.error("❌ Get student exercise questions error:", error);
    console.error("❌ Error stack:", error.stack);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message
    });
  }
};






