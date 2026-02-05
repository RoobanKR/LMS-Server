const PedagogyView = require('../../../models/Courses/moduleStructure/pedagogyViewModal');
const mongoose = require('mongoose');
const Module1 = mongoose.model('Module1');
const SubModule1 = mongoose.model('SubModule1');
const Topic1 = mongoose.model('Topic1');
const SubTopic1 = mongoose.model('SubTopic1');
const CourseStructure = mongoose.model('Course-Structure');
const LevelView = require('../../../models/Courses/moduleStructure/levelModel');
const User = require("../../../models/UserModel");
const Role = require('../../../models/RoleModel'); 


const { createClient } = require("@supabase/supabase-js");
const supabaseKey = process.env.SUPABASE_KEY;
const supabaseUrl = process.env.SUPABASE_URL;
const supabase = createClient(supabaseUrl, supabaseKey);

const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const ffprobePath = require('ffprobe-static').path;
const path = require('path');
const fs = require('fs');


// Configure ffmpeg paths
ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);
  exports.createPedagogyView = async (req, res) => {
    try {
      const { institution, courses, pedagogies, createdBy } = req.body;

      if (!courses || !pedagogies || !Array.isArray(pedagogies)) {
        return res.status(400).json({
          message: [{ key: 'error', value: 'Required fields are missing (institution, courses, pedagogies)' }]
        });
      }

      const newPedagogy = new PedagogyView({
        institution: req.user.institution,
        courses,
        pedagogies,
        createdBy: req.user.email
      });

      const savedPedagogy = await newPedagogy.save();

      return res.status(201).json({
        message: [{ key: 'success', value: 'PedagogyView created successfully' }],
        pedagogyView: savedPedagogy
      });
    } catch (err) {
      console.error('Error creating PedagogyView:', err);
      return res.status(500).json({ message: [{ key: 'error', value: 'Internal server error' }] });
    }
  };

  exports.getAllPedagogyViews = async (req, res) => {
    try {
      const pedagogies = await PedagogyView.find()
      
      return res.status(200).json({
        message: [{ key: 'success', value: 'PedagogyViews retrieved successfully' }],
        pedagogyViews: pedagogies
      });
    } catch (err) {
      console.error('Error retrieving PedagogyViews:', err);
      return res.status(500).json({ message: [{ key: 'error', value: 'Internal server error' }] });
    }
  };

  exports.getPedagogyViewById = async (req, res) => {
    try {
      const pedagogy = await PedagogyView.findById(req.params.id)
      
      if (!pedagogy) {
        return res.status(404).json({ message: [{ key: 'error', value: 'PedagogyView not found' }] });
      }

      return res.status(200).json({
        message: [{ key: 'success', value: 'PedagogyView retrieved successfully' }],
        pedagogyView: pedagogy
      });
    } catch (err) {
      console.error('Error retrieving PedagogyView by ID:', err);
      return res.status(500).json({ message: [{ key: 'error', value: 'Internal server error' }] });
    }
  };

  exports.updatePedagogyView = async (req, res) => {
  try {
    const { institution, courses, pedagogies } = req.body;
    
    if (!courses || !pedagogies || !Array.isArray(pedagogies)) {
      return res.status(400).json({
        message: [{ key: 'error', value: 'Required fields are missing (courses, pedagogies)' }]
      });
    }

    let pedagogyView = await PedagogyView.findOne({ courses });

    if (!pedagogyView) {
      pedagogyView = new PedagogyView({
        institution: req.user.institution,
        courses,
        pedagogies: [],
        createdBy: req.user.email
      });
    }

    for (const incomingPedagogy of pedagogies) {
      const matchingPedagogy = pedagogyView.pedagogies.find(existingPedagogy => {
        return (
          arraysEqual(
            existingPedagogy.module?.map(id => id.toString()) || [], 
            incomingPedagogy.module?.map(id => id.toString()) || []
          ) &&
          arraysEqual(
            existingPedagogy.subModule?.map(id => id.toString()) || [], 
            incomingPedagogy.subModule?.map(id => id.toString()) || []
          ) &&
          arraysEqual(
            existingPedagogy.topic?.map(id => id.toString()) || [], 
            incomingPedagogy.topic?.map(id => id.toString()) || []
          ) &&
          arraysEqual(
            existingPedagogy.subTopic?.map(id => id.toString()) || [], 
            incomingPedagogy.subTopic?.map(id => id.toString()) || []
          )
        );
      });

      if (matchingPedagogy) {
        if (incomingPedagogy.iDo) {
          matchingPedagogy.iDo = mergeActivityArrays(matchingPedagogy.iDo, incomingPedagogy.iDo);
        }
        if (incomingPedagogy.weDo) {
          matchingPedagogy.weDo = mergeActivityArrays(matchingPedagogy.weDo, incomingPedagogy.weDo);
        }
        if (incomingPedagogy.youDo) {
          matchingPedagogy.youDo = mergeActivityArrays(matchingPedagogy.youDo, incomingPedagogy.youDo);
        }
        matchingPedagogy.updatedAt = new Date();
      } else {
        pedagogyView.pedagogies.push({
          ...incomingPedagogy,
          createdAt: new Date(),
          updatedAt: new Date()
        });
      }
    }

    pedagogyView.updatedBy = req.user.email;
    pedagogyView.updatedAt = new Date();
    pedagogyView.markModified('pedagogies');

    const savedPedagogy = await pedagogyView.save();

    return res.status(200).json({
      message: [{ key: 'success', value: 'Pedagogy updated successfully' }],
      pedagogyView: savedPedagogy
    });

  } catch (err) {
    console.error('Error updating pedagogy:', err);
    return res.status(500).json({ 
      message: [{ key: 'error', value: 'Internal server error' }] 
    });
  }
};





function mergeActivityArrays(existing = [], incoming = []) {
  const merged = [...existing];
  
  for (const incomingActivity of incoming) {
    const existingIndex = merged.findIndex(a => a.type === incomingActivity.type);
    
    if (existingIndex !== -1) {
      merged[existingIndex] = { ...merged[existingIndex], ...incomingActivity };
    } else {
      merged.push(incomingActivity);
    }
  }
  
  return merged;
}

function arraysEqual(arr1, arr2) {
  if (arr1.length !== arr2.length) return false;
  
  const sorted1 = [...arr1].sort();
  const sorted2 = [...arr2].sort();
  
  return sorted1.every((val, index) => val === sorted2[index]);
}

exports.deletePedagogyView = async (req, res) => {
  try {
    const { activityType, itemId } = req.params;

    // Validate activityType
    const validActivityTypes = ["iDo", "weDo", "youDo"];
    if (!validActivityTypes.includes(activityType)) {
      return res.status(400).json({
        success: false,
        message: "Invalid activity type. Must be one of: iDo, weDo, youDo"
      });
    }

    // Validate itemId
    if (!mongoose.Types.ObjectId.isValid(itemId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid item ID format"
      });
    }

    // Step 1: Remove the specific activity item
    let doc = await PedagogyView.findOneAndUpdate(
      { [`pedagogies.${activityType}._id`]: itemId },
      {
        $pull: {
          [`pedagogies.$[].${activityType}`]: { _id: itemId }
        }
      },
      { new: true }
    );

    if (!doc) {
      return res.status(404).json({
        success: false,
        message: "Activity item not found in any pedagogy"
      });
    }

    // Step 2: Filter out pedagogy objects with all activity arrays empty
    doc.pedagogies = doc.pedagogies.filter(p =>
      (p.iDo && p.iDo.length) ||
      (p.weDo && p.weDo.length) ||
      (p.youDo && p.youDo.length)
    );

    // Step 3: If no pedagogies remain, delete the whole document
    if (doc.pedagogies.length === 0) {
      await PedagogyView.findByIdAndDelete(doc._id);
      return res.status(200).json({
        success: true,
        message: "Activity item deleted and document removed because no pedagogies remain"
      });
    }

    // Step 4: Save updated document if some pedagogies remain
    await doc.save();

    res.status(200).json({
      success: true,
      message: "Activity item deleted successfully",
      data: doc
    });

  } catch (error) {
    console.error("Error deleting activity item:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message
    });
  }
};






exports.deleteDocument = async (req, res) => {
  const { model, id } = req.params; // id can be "id1,id2,id3"

  try {
    // Validate model
    if (!['Module1', 'SubModule1', 'Topic1', 'SubTopic1', 'pedagogy-view', 'level-view'].includes(model)) {
      return res.status(400).json({ message: 'Invalid model specified' });
    }

    // Split comma-separated IDs
    let ids = id.split(",").map(v => v.trim());

    // Validate IDs
    ids = ids.filter(mongoose.Types.ObjectId.isValid);
    if (ids.length === 0) {
      return res.status(400).json({ message: 'Invalid ID(s) format' });
    }

    // Get model instance
    let modelInstance;
    switch (model) {
      case 'Module1':
        modelInstance = Module1;
        break;
      case 'SubModule1':
        modelInstance = SubModule1;
        break;
      case 'Topic1':
        modelInstance = Topic1;
        break;
      case 'SubTopic1':
        modelInstance = SubTopic1;
        break;
      case 'pedagogy-view':
        modelInstance = PedagogyView;
        break;
      case 'level-view':
        modelInstance = LevelView;
        break;
    }

    let deletedCount = 0;

    for (const docId of ids) {
      const docToDelete = await modelInstance.findById(docId);
      if (!docToDelete) continue;

      // Cascade deletion
      await performCascadeDeletion(model, docId);

      // Delete main document
      await modelInstance.findByIdAndDelete(docId);

      if (model !== 'pedagogy-view' && model !== 'level-view') {
        await cleanUpPedagogyReferences(model, docId);
        await cleanUpLevelReferences(model, docId);
        await cleanUpCourseHierarchy(model, docId, docToDelete.courses);
      }

      deletedCount++;
    }

    return res.status(200).json({
      message: `Deleted ${deletedCount} ${model} document(s) successfully`
    });
  } catch (error) {
    console.error('Error deleting documents:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};


async function performCascadeDeletion(model, deletedId) {
  try {

    if (model === 'Module1') {
      const directTopics = await Topic1.find({ moduleId: deletedId });
      
      for (const topic of directTopics) {
        const subTopics = await SubTopic1.find({ topicId: topic._id });
        
        for (const subTopic of subTopics) {
          await cleanUpPedagogyReferences('SubTopic1', subTopic._id);
          await cleanUpLevelReferences('SubTopic1', subTopic._id);
          await SubTopic1.findByIdAndDelete(subTopic._id);
        }
        
        await cleanUpPedagogyReferences('Topic1', topic._id);
        await cleanUpLevelReferences('Topic1', topic._id);
        await Topic1.findByIdAndDelete(topic._id);
      }

      const subModules = await SubModule1.find({ moduleId: deletedId });
      
      for (const subModule of subModules) {
        const topics = await Topic1.find({ subModuleId: subModule._id });
        
        for (const topic of topics) {
          const subTopics = await SubTopic1.find({ topicId: topic._id });
          
          for (const subTopic of subTopics) {
            await cleanUpPedagogyReferences('SubTopic1', subTopic._id);
            await cleanUpLevelReferences('SubTopic1', subTopic._id);
            await SubTopic1.findByIdAndDelete(subTopic._id);
          }
          
          await cleanUpPedagogyReferences('Topic1', topic._id);
          await cleanUpLevelReferences('Topic1', topic._id);
          await Topic1.findByIdAndDelete(topic._id);
        }
        
        await cleanUpPedagogyReferences('SubModule1', subModule._id);
        await cleanUpLevelReferences('SubModule1', subModule._id);
        await SubModule1.findByIdAndDelete(subModule._id);
      }
    }
    else if (model === 'SubModule1') {
      const topics = await Topic1.find({ subModuleId: deletedId });
      for (const topic of topics) {
        const subTopics = await SubTopic1.find({ topicId: topic._id });
        
        for (const subTopic of subTopics) {
          await cleanUpPedagogyReferences('SubTopic1', subTopic._id);
          await cleanUpLevelReferences('SubTopic1', subTopic._id);
          await SubTopic1.findByIdAndDelete(subTopic._id);
        }
        
        await cleanUpPedagogyReferences('Topic1', topic._id);
        await cleanUpLevelReferences('Topic1', topic._id);
        await Topic1.findByIdAndDelete(topic._id);
      }
    }
    else if (model === 'Topic1') {
      const subTopics = await SubTopic1.find({ topicId: deletedId });
      
      for (const subTopic of subTopics) {
        await cleanUpPedagogyReferences('SubTopic1', subTopic._id);
        await cleanUpLevelReferences('SubTopic1', subTopic._id);
        await SubTopic1.findByIdAndDelete(subTopic._id);
      }
    }

  } catch (error) {
    console.error('Error in cascade deletion:', error);
    throw error;
  }
}

async function cleanUpPedagogyReferences(model, deletedId) {
  try {
    
    const fieldMap = {
      'Module1': 'module',
      'SubModule1': 'subModule',
      'Topic1': 'topic',
      'SubTopic1': 'subTopic'
    };
    const field = fieldMap[model];

    const pedagogyViews = await PedagogyView.find({
      [`pedagogies.${field}`]: deletedId
    });


    for (const pView of pedagogyViews) {
      let shouldUpdate = false;
      let removedPedagogies = 0;
      
      for (let i = pView.pedagogies.length - 1; i >= 0; i--) {
        const pedagogy = pView.pedagogies[i];
        const pedagogyId = pedagogy._id;
      
        if (pedagogy[field] && pedagogy[field].some(refId => refId.toString() === deletedId.toString())) {
          pView.pedagogies.splice(i, 1);
          shouldUpdate = true;
          removedPedagogies++;
        }
      }
      
      if (pView.pedagogies.length === 0) {
        await PedagogyView.findByIdAndDelete(pView._id);
      } 
      else if (shouldUpdate) {
        await pView.save();
      }
    }

  } catch (error) {
    console.error('Error cleaning up pedagogy references:', error);
    throw error;
  }
}

async function cleanUpLevelReferences(model, deletedId) {
  try {
    
    const fieldMap = {
      'Module1': 'module',
      'SubModule1': 'subModule',
      'Topic1': 'topic',
      'SubTopic1': 'subTopic'
    };
    const field = fieldMap[model];

    const levelViews = await LevelView.find({
      [`levels.${field}`]: deletedId
    });


    for (const lView of levelViews) {
      let shouldUpdate = false;
      let removedLevels = 0;
      
      for (let i = lView.levels.length - 1; i >= 0; i--) {
        const level = lView.levels[i];
                if (level[field] && level[field].some(refId => refId.toString() === deletedId.toString())) {
          lView.levels.splice(i, 1);
          shouldUpdate = true;
          removedLevels++;
        }
      }
      
      if (lView.levels.length === 0) {
        await LevelView.findByIdAndDelete(lView._id);
      } 
      else if (shouldUpdate) {
        await lView.save();
      }
    }

  } catch (error) {
    console.error('Error cleaning up level references:', error);
    throw error;
  }
}

async function cleanUpCourseHierarchy(model, deletedId, courseId) {
  try {
    const course = await CourseStructure.findById(courseId);
    if (!course) return;
    if (!course.courseHierarchy) {
      course.courseHierarchy = { modules: [] };
    }
    if (!course.courseHierarchy.modules) {
      course.courseHierarchy.modules = [];
    }

    if (model === 'Module1') {
      course.courseHierarchy.modules = course.courseHierarchy.modules.filter(
        mod => mod._id.toString() !== deletedId.toString()
      );
    } 
    else if (model === 'SubModule1') {
      for (const module of course.courseHierarchy.modules) {
        if (module.subModules) {
          module.subModules = module.subModules.filter(
            subMod => subMod._id.toString() !== deletedId.toString()
          );
        }
      }
    }
    else if (model === 'Topic1') {
      for (const module of course.courseHierarchy.modules) {
        if (module.subModules) {
          for (const subModule of module.subModules) {
            if (subModule.topics) {
              subModule.topics = subModule.topics.filter(
                topic => topic._id.toString() !== deletedId.toString()
              );
            }
          }
        }
      }
    }
    else if (model === 'SubTopic1') {
      for (const module of course.courseHierarchy.modules) {
        if (module.subModules) {
          for (const subModule of module.subModules) {
            if (subModule.topics) {
              for (const topic of subModule.topics) {
                if (topic.subTopics) {
                  topic.subTopics = topic.subTopics.filter(
                    subTopic => subTopic._id.toString() !== deletedId.toString()
                  );
                  
                  if (topic.subTopics.length === 0) {
                    subModule.topics = subModule.topics.filter(
                      t => t._id.toString() !== topic._id?.toString()
                    );
                  }
                }
              }
            }
          }
        }
      }
    }

    cleanEmptyHierarchyArrays(course.courseHierarchy);

    course.markModified('courseHierarchy');
    await course.save();
  } catch (error) {
    console.error('Error cleaning up course hierarchy:', error);
    throw error;
  }
}

function cleanEmptyHierarchyArrays(hierarchy) {
  if (!hierarchy?.modules) return;

  for (let i = hierarchy.modules.length - 1; i >= 0; i--) {
    const module = hierarchy.modules[i];
    
    if (module.subModules) {
      for (let j = module.subModules.length - 1; j >= 0; j--) {
        const subModule = module.subModules[j];
        
        if (subModule.topics) {
          for (let k = subModule.topics.length - 1; k >= 0; k--) {
            const topic = subModule.topics[k];
                        if (topic.subTopics && topic.subTopics.length === 0) {
              subModule.topics.splice(k, 1);
            }
          }
          
          if (subModule.topics.length === 0) {
            module.subModules.splice(j, 1);
          }
        }
        
        if (!subModule.topics || subModule.topics.length === 0) {
          module.subModules.splice(j, 1);
        }
      }
      
      if (module.subModules.length === 0) {
        hierarchy.modules.splice(i, 1);
      }
    }
    
    if (!module.subModules || module.subModules.length === 0) {
      hierarchy.modules.splice(i, 1);
    }
  }
}

exports.getAllCoursesData = async (req, res) => {
  try {
    const { courseId } = req.params;

     const course = await CourseStructure.findById(courseId).lean().populate({
      path: "singleParticipants",
      populate: [
        {
          path: "user", // First populate user from enrollment
          populate: {
            path: "role", // Then populate role inside user
            model: "Role" // Make sure to specify the model name if different
          }
        }
      ]
    });

    if (!course) {
      return res.status(404).json({
        success: false,
        message: "Course not found"
      });
    }

    const modules = await Module1.find({ courses: courseId }).lean();

    const subModules = await SubModule1.find({
      moduleId: { $in: modules.map(m => m._id) }
    }).lean();

    const topics = await Topic1.find({
      $or: [
        { moduleId: { $in: modules.map(m => m._id) } },
        { subModuleId: { $in: subModules.map(sm => sm._id) } }
      ]
    }).lean();

    const subTopics = await SubTopic1.find({
      topicId: { $in: topics.map(t => t._id) }
    }).lean();

   
    const structuredCourse = {
      ...course,
      modules: modules.map(module => {
        const moduleSubModules = subModules.filter(
          sm => sm.moduleId?.toString() === module._id.toString()
        );

        const processedSubModules = moduleSubModules.map(subModule => {
          const subModuleTopics = topics.filter(
            t => t.subModuleId?.toString() === subModule._id.toString()
          );

          const processedTopics = subModuleTopics.map(topic => ({
            ...topic,
            subTopics: subTopics.filter(
              st => st.topicId?.toString() === topic._id.toString()
            )
          }));

          return {
            ...subModule,
            topics: processedTopics
          };
        });

        const moduleDirectTopics = topics.filter(
          t =>
            t.moduleId?.toString() === module._id.toString() &&
            (!t.subModuleId || !moduleSubModules.some(sm => sm._id.toString() === t.subModuleId?.toString()))
        );

        const processedDirectTopics = moduleDirectTopics.map(topic => ({
          ...topic,
          subTopics: subTopics.filter(
            st => st.topicId?.toString() === topic._id.toString()
          )
        }));

        return {
          ...module,
          subModules: processedSubModules,
          topics: processedDirectTopics
        };
      })
    };

    res.status(200).json({
      success: true,
      data: structuredCourse
    });

  } catch (error) {
    console.error("Error fetching course structure:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message
    });
  }
};



exports.getAllCoursesDataWithoutAINotes = async (req, res) => {
  try {
    const { courseId, exerciseId } = req.params;

    if (!exerciseId) {
      return res.status(400).json({
        success: false,
        message: "Exercise ID is required"
      });
    }

    // Find the course with participants and complete user data
    const course = await CourseStructure.findById(courseId)
      .populate({
        path: 'singleParticipants.user',
        select: '-notes -ai_history -password -tokens -__v -notifications',
        populate: [
          {
            path: 'role',
            select: 'name description'
          },
          {
            path: 'courses.courseId',
            select: 'courseName courseCode description'
          }
        ]
      })
      .lean();

    if (!course) {
      return res.status(404).json({
        success: false,
        message: "Course not found"
      });
    }

    // Process participants data
    const singleParticipants = await Promise.all(
      course.singleParticipants.map(async (participant) => {
        if (!participant.user) {
          return {
            ...participant,
            user_Data: null,
            hasExerciseProgress: false,
            exerciseProgress: null
          };
        }

        // Get user's course progress
        const user = await User.findById(participant.user._id)
          .select('courses')
          .lean();

        // Find course progress for this specific course
        const courseProgress = user?.courses?.find(
          cp => cp.courseId && cp.courseId.toString() === courseId
        );

        let hasExerciseProgress = false;
        let exerciseProgress = null;

        if (courseProgress && courseProgress.answers) {
          // Search for this exercise in user's progress
          for (const category in courseProgress.answers) {
            const categoryData = courseProgress.answers[category];
            if (categoryData && typeof categoryData === 'object') {
              for (const key in categoryData) {
                let exercises = categoryData[key];
                
                // Ensure exercises is an array
                let exercisesArray = [];
                if (Array.isArray(exercises)) {
                  exercisesArray = exercises;
                } else if (exercises && typeof exercises === 'object') {
                  exercisesArray = Object.values(exercises);
                }
                
                // Find exercise in this category
                const foundExercise = exercisesArray.find(ex => 
                  ex && ex.exerciseId && ex.exerciseId.toString() === exerciseId
                );
                
                if (foundExercise) {
                  hasExerciseProgress = true;
                  exerciseProgress = {
                    category,
                    subcategory: key,
                    ...foundExercise
                  };
                  break;
                }
              }
            }
            if (hasExerciseProgress) break;
          }
        }

        // Clean user data
        const cleanUserData = JSON.parse(JSON.stringify(participant.user, (key, value) => {
          if (key === 'notes' || key === 'ai_history' || key === 'password' || 
              key === 'tokens' || key === '__v' || key === '$__' || 
              key === '$isNew' || value === undefined) {
            return undefined;
          }
          return value;
        }));

        return {
          _id: participant._id,
          status: participant.status,
          enableEnrolmentDates: participant.enableEnrolmentDates,
          enrolmentStartsDate: participant.enrolmentStartsDate,
          enrolmentEndsDate: participant.enrolmentEndsDate,
          createdAt: participant.createdAt,
          updatedAt: participant.updatedAt,
          user_Data: cleanUserData,
          hasExerciseProgress,
          exerciseProgress
        };
      })
    );

    // Count participants with exercise progress
    const participantsWithProgress = singleParticipants.filter(p => p.hasExerciseProgress).length;

    // Find topics that contain the exercise
    const topics = await Topic1.find({ courses: courseId })
      .select('-__v -createdAt -updatedAt')
      .lean();

    // Find the specific exercise within topics
    let foundExercise = null;
    let parentTopic = null;
    let exerciseCategory = null;
    let exerciseSubcategory = null;

    // Search for exercise in topics
    for (const topic of topics) {
      if (topic.pedagogy) {
        const searchResult = searchForExerciseInPedagogy(topic.pedagogy, exerciseId);
        if (searchResult.found) {
          foundExercise = searchResult.found;
          parentTopic = topic;
          exerciseCategory = searchResult.category;
          exerciseSubcategory = searchResult.subcategory;
          break;
        }
      }
    }

    if (!foundExercise) {
      return res.status(404).json({
        success: false,
        message: "Exercise not found in any topic for this course"
      });
    }

    // Helper function to search for exercise in pedagogy
    function searchForExerciseInPedagogy(pedagogy, targetExerciseId) {
      for (const category in pedagogy) {
        const categoryData = pedagogy[category];
        if (categoryData && typeof categoryData === 'object') {
          for (const subcategory in categoryData) {
            const subcategoryData = categoryData[subcategory];
            
            if (Array.isArray(subcategoryData)) {
              // Search in array
              const exercise = subcategoryData.find(ex => 
                ex && ex._id && ex._id.toString() === targetExerciseId
              );
              if (exercise) {
                return { found: exercise, category, subcategory };
              }
            } else if (subcategoryData && subcategoryData._id && 
                       subcategoryData._id.toString() === targetExerciseId) {
              // Search in object
              return { found: subcategoryData, category, subcategory };
            }
          }
        }
      }
      return { found: null, category: null, subcategory: null };
    }

    // Fetch course structure components
    const modules = await Module1.find({ courses: courseId })
      .select('-__v -createdAt -updatedAt')
      .lean();

    // Get parent module for the topic
    let parentModule = null;
    if (parentTopic) {
      parentModule = modules.find(
        module => module._id.toString() === parentTopic.moduleId?.toString()
      );
    }

    // Build clean exercise response without duplication
    const cleanExerciseResponse = {
      _id: foundExercise._id,
      exerciseName: foundExercise.exerciseInformation?.exerciseName || 'Unnamed Exercise',
      description: foundExercise.exerciseInformation?.description || '',
      exerciseLevel: foundExercise.exerciseInformation?.exerciseLevel || '',
      totalQuestions: foundExercise.exerciseInformation?.totalQuestions || 0,
      estimatedTime: foundExercise.exerciseInformation?.estimatedTime || 0,
      category: exerciseCategory,
      subcategory: exerciseSubcategory,
      questions: foundExercise.questions || [],
      programmingSettings: foundExercise.programmingSettings || {},
      scoreSettings: foundExercise.scoreSettings || {},
      parentTopic: parentTopic ? {
        _id: parentTopic._id,
        title: parentTopic.title,
        description: parentTopic.description
      } : null,
      parentModule: parentModule ? {
        _id: parentModule._id,
        moduleName: parentModule.title,
        description: parentModule.description
      } : null,
      createdAt: foundExercise.createdAt,
      updatedAt: foundExercise.updatedAt
    };

    // Prepare modules data without duplicating exercise info
    const modulesData = modules.map(module => {
      // Get topics for this module
      const moduleTopics = topics.filter(t => 
        t.moduleId?.toString() === module._id.toString()
      );

      const topicsData = moduleTopics.map(topic => {
        // Check if this topic contains the searched exercise
        const containsSearchedExercise = topic._id.toString() === parentTopic?._id?.toString();
        
        // Get exercises from this topic (excluding the searched exercise to avoid duplication)
        let topicExercises = [];
        if (topic.pedagogy) {
          topicExercises = getAllExercisesFromPedagogy(topic.pedagogy);
          
          // Remove the searched exercise from the list
          topicExercises = topicExercises.filter(ex => 
            ex._id.toString() !== exerciseId
          );
        }

        return {
          _id: topic._id,
          title: topic.title,
          description: topic.description,
          level: topic.level,
          duration: topic.duration,
          index: topic.index,
          containsSearchedExercise,
          otherExercises: topicExercises.map(ex => ({
            _id: ex._id,
            name: ex.exerciseInformation?.exerciseName || 'Unnamed Exercise',
            category: ex.category,
            subcategory: ex.subcategory
          }))
        };
      });

      return {
        _id: module._id,
        title: module.title,
        description: module.description,
        level: module.level,
        duration: module.duration,
        index: module.index,
        topics: topicsData
      };
    });

    // Helper function to get all exercises from pedagogy
    function getAllExercisesFromPedagogy(pedagogy) {
      const exercises = [];
      
      for (const category in pedagogy) {
        const categoryData = pedagogy[category];
        if (categoryData && typeof categoryData === 'object') {
          for (const subcategory in categoryData) {
            const subcategoryData = categoryData[subcategory];
            
            if (Array.isArray(subcategoryData)) {
              subcategoryData.forEach(exercise => {
                if (exercise && exercise._id) {
                  exercises.push({
                    ...exercise,
                    category,
                    subcategory
                  });
                }
              });
            } else if (subcategoryData && subcategoryData._id) {
              exercises.push({
                ...subcategoryData,
                category,
                subcategory
              });
            }
          }
        }
      }
      
      return exercises;
    }

    // Construct final response
    const responseData = {
      _id: course._id,
      courseName: course.courseName,
      courseCode: course.courseCode,
      description: course.description,
      exercise: cleanExerciseResponse,
      singleParticipants: singleParticipants,
      modules: modulesData,
     
    };

    res.status(200).json({
      success: true,
      data: responseData,
      message: `Course data with exercise ID fetched successfully (${exerciseCategory || 'unknown'}/${exerciseSubcategory || 'unknown'})`
    });

  } catch (error) {
    console.error("Error fetching course structure:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message
    });
  }
};

exports.studentDashboardAnalyticsOptimized = async (req, res) => {
  try { 
    const { institution } = req.user;

    // Get all courses with ALL basic info
    const courses = await CourseStructure.find({ institution })
      .select('courseName courseCode description courseDuration courseLevel serviceType courseImage clientName createdAt updatedAt')
      .lean();

    if (!courses || courses.length === 0) {
      return res.status(200).json({
        success: true,
        data: [],
        message: "No courses found"
      });
    }

    // Get all course IDs as strings
    const courseIds = courses.map(course => course._id.toString());

    // Get all module IDs for these courses with ALL fields
    const allModules = await Module1.find({ courses: { $in: courseIds } })
      .select('-__v -createdAt -updatedAt')
      .lean();

    // Extract module IDs
    const moduleIds = allModules.map(module => module._id.toString());

    // Batch fetch all related data in parallel with ALL fields
    const [
      allSubModules,
      allTopics,
      allSubTopics,
      allParticipants
    ] = await Promise.all([
      // Get all submodules for these modules with ALL fields
      SubModule1.find({ moduleId: { $in: moduleIds } })
        .select('-__v -createdAt -updatedAt')
        .lean(),
      // Get all topics for these modules and submodules with ALL fields
      Topic1.find({
        $or: [
          { moduleId: { $in: moduleIds } },
          { subModuleId: { $in: await SubModule1.find({ moduleId: { $in: moduleIds } }).distinct('_id') } }
        ]
      })
      .select('-__v -createdAt -updatedAt')
      .lean(),
      // Get all subtopics with ALL fields
      SubTopic1.find()
        .select('-__v -createdAt -updatedAt')
        .lean(),
      // Get all participants with user data for all courses
      CourseStructure.find({ institution })
        .populate({
          path: 'singleParticipants.user',
          select: 'firstName lastName email phone department role status'
        })
        .select('singleParticipants')
        .lean()
    ]);

    // Organize data by course for faster access
    const modulesByCourse = {};
    const participantsByCourse = {};

    // Organize modules by course
    allModules.forEach(module => {
      // Handle both array and single course reference
      const moduleCourses = Array.isArray(module.courses) 
        ? module.courses 
        : [module.courses];
      
      moduleCourses.forEach(courseRef => {
        if (courseRef) {
          const courseId = courseRef.toString();
          if (!modulesByCourse[courseId]) {
            modulesByCourse[courseId] = [];
          }
          modulesByCourse[courseId].push(module);
        }
      });
    });

    // Organize participants by course
    allParticipants.forEach(course => {
      participantsByCourse[course._id.toString()] = course.singleParticipants || [];
    });

    // Process each course
    const coursesWithData = courses.map(course => {
      const courseIdStr = course._id.toString();
      const courseModules = modulesByCourse[courseIdStr] || [];
      const courseModuleIds = courseModules.map(m => m._id.toString());
      
      // Filter submodules for this course
      const courseSubModules = allSubModules.filter(
        sm => sm.moduleId && courseModuleIds.includes(sm.moduleId.toString())
      );
      
      const courseSubModuleIds = courseSubModules.map(sm => sm._id.toString());
      
      // Filter topics for this course
      const courseTopics = allTopics.filter(
        t => (t.moduleId && courseModuleIds.includes(t.moduleId.toString())) ||
             (t.subModuleId && courseSubModuleIds.includes(t.subModuleId.toString()))
      );
      
      const courseTopicIds = courseTopics.map(t => t._id.toString());
      
      // Filter subtopics for this course
      const courseSubTopics = allSubTopics.filter(
        st => st.topicId && courseTopicIds.includes(st.topicId.toString())
      );

      // Count participants for this course
      const courseParticipants = participantsByCourse[courseIdStr] || [];
      const activeParticipants = courseParticipants.filter(p => p.status === 'active').length;

      // Structure modules with their nested data
      const structuredModules = courseModules.map(module => {
        const moduleSubModules = courseSubModules.filter(
          sm => sm.moduleId && sm.moduleId.toString() === module._id.toString()
        );

        const subModuleIds = moduleSubModules.map(sm => sm._id.toString());
        
        const moduleTopics = courseTopics.filter(
          t => (t.moduleId && t.moduleId.toString() === module._id.toString()) ||
               (t.subModuleId && subModuleIds.includes(t.subModuleId.toString()))
        );

        const processedSubModules = moduleSubModules.map(subModule => {
          const subModuleTopics = courseTopics.filter(
            t => t.subModuleId && t.subModuleId.toString() === subModule._id.toString()
          );

          const processedTopics = subModuleTopics.map(topic => ({
            ...topic,
            subTopics: courseSubTopics.filter(
              st => st.topicId && st.topicId.toString() === topic._id.toString()
            )
          }));

          return {
            ...subModule,
            topics: processedTopics
          };
        });

        return {
          ...module,
          subModules: processedSubModules,
          topics: moduleTopics.filter(
            t => !t.subModuleId || !subModuleIds.includes(t.subModuleId.toString())
          ).map(topic => ({
            ...topic,
            subTopics: courseSubTopics.filter(
              st => st.topicId && st.topicId.toString() === topic._id.toString()
            )
          }))
        };
      });

      return {
        ...course,
        _id: courseIdStr, // Ensure _id is string
        stats: {
          participants: courseParticipants.length,
          activeParticipants,
          modules: courseModules.length,
          subModules: courseSubModules.length,
          topics: courseTopics.length,
          subTopics: courseSubTopics.length
        },
        modules: structuredModules,
        participants: courseParticipants
      };
    });

    // Calculate overall analytics
    const overallStats = {
      totalCourses: coursesWithData.length,
      totalModules: coursesWithData.reduce((sum, course) => sum + course.stats.modules, 0),
      totalSubModules: coursesWithData.reduce((sum, course) => sum + course.stats.subModules, 0),
      totalTopics: coursesWithData.reduce((sum, course) => sum + course.stats.topics, 0),
      totalSubTopics: coursesWithData.reduce((sum, course) => sum + course.stats.subTopics, 0),
      totalParticipants: coursesWithData.reduce((sum, course) => sum + course.stats.participants, 0),
      totalActiveParticipants: coursesWithData.reduce((sum, course) => sum + course.stats.activeParticipants, 0)
    };

    // Calculate courses by level and service type
    const coursesByLevel = {};
    const coursesByService = {};

    coursesWithData.forEach(course => {
      const level = course.courseLevel || 'Not Specified';
      const service = course.serviceType || 'Not Specified';
      
      coursesByLevel[level] = (coursesByLevel[level] || 0) + 1;
      coursesByService[service] = (coursesByService[service] || 0) + 1;
    });

    res.status(200).json({
      success: true,
      data: {
        courses: coursesWithData,
        analytics: overallStats,
        summary: {
          coursesByLevel,
          coursesByService
        }
      },
      message: "All courses analytics fetched successfully"
    });

  } catch (error) {
    console.error("Error fetching courses analytics:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message
    });
  }
};

// staffAnalyticsController.js


exports.staffStudentAnalytics = async (req, res) => {
  try {
    const { institution } = req.user;
    const staffId = req.user._id;

    // Get all courses with participants
    const courses = await CourseStructure.find({ institution })
      .select('courseName courseCode courseLevel serviceType courseImage')
      .populate({
        path: 'singleParticipants.user',
        select: 'firstName lastName email department role',
        populate: {
          path: 'role',
          select: 'renameRole originalRole roleValue',
          model: 'Role'
        }
      })
      .lean();

    if (!courses || courses.length === 0) {
      return res.status(200).json({
        success: true,
        data: [],
        message: "No courses found"
      });
    }

    // Filter courses to only those with students
    const coursesWithStudents = courses.filter(course => 
      course.singleParticipants && 
      course.singleParticipants.length > 0
    );

    const allCourseIds = coursesWithStudents.map(course => course._id.toString());

    // Get user answers for all courses WITH role populated
    const allUsers = await User.find({ 
      institution, 
      'courses.courseId': { $in: allCourseIds }
    })
    .select('firstName lastName email department courses role')
    .populate({
      path: 'role',
      select: 'renameRole originalRole roleValue',
      model: 'Role'
    })
    .lean();

    // Filter only students based on role value
    const studentUsers = allUsers.filter(user => {
      const roleValue = user.role?.roleValue || user.role?.renameRole || '';
      return roleValue.toLowerCase() === 'student';
    });

    // Get all modules for these courses
    const allModules = await Module1.find({ courses: { $in: allCourseIds } })
      .select('title courses')
      .lean();

    // Organize modules by course
    const modulesByCourse = {};
    allModules.forEach(module => {
      const moduleCourses = Array.isArray(module.courses) ? module.courses : [module.courses];
      moduleCourses.forEach(courseId => {
        const courseIdStr = courseId.toString();
        if (!modulesByCourse[courseIdStr]) {
          modulesByCourse[courseIdStr] = [];
        }
        modulesByCourse[courseIdStr].push(module);
      });
    });

    // Process analytics for each course
    const coursesAnalytics = coursesWithStudents.map(course => {
      const courseIdStr = course._id.toString();
      const courseStudents = course.singleParticipants || [];
      
      // Filter only students (roleValue = 'Student')
      const studentParticipants = courseStudents.filter(participant => {
        const student = participant.user;
        if (!student || !student.role) return false;
        
        const roleValue = student.role.roleValue || student.role.renameRole || '';
        return roleValue.toLowerCase() === 'student';
      });
      
      // Process each student's progress
      const studentsAnalytics = studentParticipants.map(participant => {
        const student = participant.user;
        if (!student) return null;

        // Find user from studentUsers for their answers
        const userData = studentUsers.find(u => u._id.toString() === student._id.toString());
        if (!userData) return null;

        // Get student's course data
        const studentCourse = userData.courses?.find(c => 
          c.courseId && c.courseId.toString() === courseIdStr
        );

        if (!studentCourse?.answers) {
          return {
            student: {
              _id: student._id,
              firstName: student.firstName,
              lastName: student.lastName,
              email: student.email,
              department: student.department,
              role: {
                renameRole: student.role?.renameRole,
                originalRole: student.role?.originalRole,
                roleValue: student.role?.roleValue
              }
            },
            progress: {
              overall: 0,
              weDo: {
                practical: { completed: 0, total: 0, percentage: 0 },
                project_development: { completed: 0, total: 0, percentage: 0 },
                others: { completed: 0, total: 0, percentage: 0 }
              },
              youDo: {
                assessments: { completed: 0, total: 0, percentage: 0 }
              }
            }
          };
        }

        // Calculate We_Do progress
        const weDoPractical = studentCourse.answers.We_Do?.practical || [];
        const weDoProject = studentCourse.answers.We_Do?.project_development || [];
        const weDoOthers = studentCourse.answers.We_Do?.others || [];

        // Calculate You_Do progress
        const youDoAssessments = studentCourse.answers.You_Do?.assessments || [];

        // Helper function to calculate completion
        const calculateCompletion = (exercises) => {
          if (!exercises || exercises.length === 0) return { completed: 0, total: 0, percentage: 0 };
          
          let completed = 0;
          let totalQuestions = 0;
          let attemptedQuestions = 0;

          exercises.forEach(exercise => {
            if (exercise.questions && exercise.questions.length > 0) {
              totalQuestions += exercise.questions.length;
              const attempted = exercise.questions.filter(q => 
                q.status === 'attempted' || q.status === 'evaluated' || q.submittedAt
              ).length;
              attemptedQuestions += attempted;
              
              if (attempted > 0) {
                completed++;
              }
            }
          });

          return {
            completed,
            total: exercises.length,
            percentage: exercises.length > 0 ? Math.round((completed / exercises.length) * 100) : 0,
            questionProgress: totalQuestions > 0 ? Math.round((attemptedQuestions / totalQuestions) * 100) : 0
          };
        };

        const practicalProgress = calculateCompletion(weDoPractical);
        const projectProgress = calculateCompletion(weDoProject);
        const othersProgress = calculateCompletion(weDoOthers);
        const assessmentsProgress = calculateCompletion(youDoAssessments);

        // Calculate overall progress (weighted average)
        const weDoTotal = practicalProgress.total + projectProgress.total + othersProgress.total;
        const weDoWeighted = 
          (practicalProgress.percentage * practicalProgress.total +
           projectProgress.percentage * projectProgress.total +
           othersProgress.percentage * othersProgress.total) / 
          (weDoTotal || 1);

        const overallProgress = Math.round(
          (weDoWeighted * 0.7) + (assessmentsProgress.percentage * 0.3)
        );

        return {
          student: {
            _id: student._id,
            firstName: student.firstName,
            lastName: student.lastName,
            email: student.email,
            department: student.department,
            role: {
              renameRole: student.role?.renameRole,
              originalRole: student.role?.originalRole,
              roleValue: student.role?.roleValue
            },
            enrolledAt: participant.createdAt
          },
          progress: {
            overall: overallProgress,
            weDo: {
              practical: practicalProgress,
              project_development: projectProgress,
              others: othersProgress
            },
            youDo: {
              assessments: assessmentsProgress
            }
          },
          lastActivity: studentCourse.lastAccessed || null
        };
      }).filter(student => student !== null);

      // Calculate course-level statistics
      const courseStats = {
        totalStudents: studentsAnalytics.length,
        averageProgress: studentsAnalytics.length > 0 
          ? Math.round(studentsAnalytics.reduce((sum, s) => sum + s.progress.overall, 0) / studentsAnalytics.length)
          : 0,
        completedStudents: studentsAnalytics.filter(s => s.progress.overall >= 80).length,
        inProgressStudents: studentsAnalytics.filter(s => s.progress.overall > 0 && s.progress.overall < 80).length,
        notStartedStudents: studentsAnalytics.filter(s => s.progress.overall === 0).length,
        
        weDoStats: {
          practical: {
            averageCompletion: studentsAnalytics.length > 0
              ? Math.round(studentsAnalytics.reduce((sum, s) => sum + s.progress.weDo.practical.percentage, 0) / studentsAnalytics.length)
              : 0
          },
          project_development: {
            averageCompletion: studentsAnalytics.length > 0
              ? Math.round(studentsAnalytics.reduce((sum, s) => sum + s.progress.weDo.project_development.percentage, 0) / studentsAnalytics.length)
              : 0
          }
        }
      };

      return {
        course: {
          _id: course._id,
          courseName: course.courseName,
          courseCode: course.courseCode,
          courseLevel: course.courseLevel,
          serviceType: course.serviceType,
          courseImage: course.courseImage,
          totalModules: modulesByCourse[courseIdStr]?.length || 0,
          totalParticipants: course.singleParticipants?.length || 0,
          totalStudents: studentParticipants.length
        },
        stats: courseStats,
        students: studentsAnalytics
      };
    });

    // Calculate overall institution statistics
    const overallStats = {
      totalCourses: coursesAnalytics.length,
      totalStudents: coursesAnalytics.reduce((sum, course) => sum + course.stats.totalStudents, 0),
      averageCourseProgress: coursesAnalytics.length > 0
        ? Math.round(coursesAnalytics.reduce((sum, course) => sum + course.stats.averageProgress, 0) / coursesAnalytics.length)
        : 0,
      
      performanceDistribution: {
        excellent: coursesAnalytics.filter(course => course.stats.averageProgress >= 80).length,
        good: coursesAnalytics.filter(course => course.stats.averageProgress >= 50 && course.stats.averageProgress < 80).length,
        average: coursesAnalytics.filter(course => course.stats.averageProgress >= 30 && course.stats.averageProgress < 50).length,
        poor: coursesAnalytics.filter(course => course.stats.averageProgress < 30).length
      },
      
      weDoEngagement: {
        practical: Math.round(coursesAnalytics.reduce((sum, course) => 
          sum + course.stats.weDoStats.practical.averageCompletion, 0) / coursesAnalytics.length || 0),
        project: Math.round(coursesAnalytics.reduce((sum, course) => 
          sum + course.stats.weDoStats.project_development.averageCompletion, 0) / coursesAnalytics.length || 0)
      }
    };

    res.status(200).json({
      success: true,
      data: {
        courses: coursesAnalytics,
        overall: overallStats
      },
      message: "Staff analytics fetched successfully"
    });

  } catch (error) {
    console.error("Error fetching staff analytics:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message
    });
  }
};

// Get detailed student progress for a specific course
exports.getStudentCourseProgress = async (req, res) => {
  try {
    const { courseId, studentId } = req.params;
    const { institution } = req.user;

    // Get course details
    const course = await CourseStructure.findOne({ 
      _id: courseId, 
      institution 
    }).select('courseName courseCode courseLevel').lean();

    if (!course) {
      return res.status(404).json({
        success: false,
        message: "Course not found"
      });
    }

    // First, find the Student role document
    const studentRole = await Role.findOne({
      institution,
      $or: [
        { roleValue: 'Student' },
        { renameRole: 'Student' },
        { originalRole: 'Student' }
      ]
    }).select('_id').lean();

    if (!studentRole) {
      return res.status(404).json({
        success: false,
        message: "Student role not found"
      });
    }

    // Get student details with role populated
    const student = await User.findOne({
      _id: studentId,
      institution,
      role: studentRole._id  // Use the ObjectId of the Student role
    })
    .select('firstName lastName email department phone role')
    .populate({
      path: 'role',
      select: 'renameRole originalRole roleValue',
      model: 'Role'
    })
    .lean();

    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student not found"
      });
    }

    // Get student's course data with answers
    const studentCourse = await User.findOne({
      _id: studentId,
      'courses.courseId': courseId
    }).select('courses.$').lean();

    if (!studentCourse?.courses?.[0]) {
      return res.status(200).json({
        success: true,
        data: {
          course,
          student: {
            _id: student._id,
            firstName: student.firstName,
            lastName: student.lastName,
            email: student.email,
            department: student.department,
            phone: student.phone,
            role: {
              renameRole: student.role?.renameRole,
              originalRole: student.role?.originalRole,
              roleValue: student.role?.roleValue
            }
          },
          progress: {
            overall: 0,
            exercises: []
          }
        }
      });
    }

    const courseData = studentCourse.courses[0];
    const answers = courseData.answers || {};

    // Get all modules and their exercises for this course
    const modules = await Module1.find({ courses: courseId })
      .select('title')
      .lean();

    // Get all submodules and topics to map exercises
    const subModules = await SubModule1.find({ 
      moduleId: { $in: modules.map(m => m._id) } 
    }).select('title moduleId').lean();

    const topics = await Topic1.find({
      $or: [
        { moduleId: { $in: modules.map(m => m._id) } },
        { subModuleId: { $in: subModules.map(sm => sm._id) } }
      ]
    }).select('title moduleId subModuleId').lean();

    // Process We_Do exercises
    const weDoExercises = [];
    
    // Process practical exercises
    if (answers.We_Do?.practical) {
      answers.We_Do.practical.forEach((exercise, index) => {
        weDoExercises.push({
          type: 'We_Do',
          category: 'practical',
          exerciseId: exercise.exerciseId || `PRAC-${index + 1}`,
          exerciseName: exercise.exerciseInformation?.exerciseName || `Practical Exercise ${index + 1}`,
          status: exercise.questions?.some(q => q.status === 'evaluated') ? 'evaluated' :
                 exercise.questions?.some(q => q.status === 'attempted') ? 'attempted' : 'not_started',
          completedQuestions: exercise.questions?.filter(q => 
            q.status === 'attempted' || q.status === 'evaluated'
          ).length || 0,
          totalQuestions: exercise.questions?.length || 0,
          score: exercise.score || 0,
          maxScore: exercise.maxScore || 0,
          lastAttempt: exercise.lastAttempt,
          attempts: exercise.attempts || 0
        });
      });
    }

    // Process project development exercises
    if (answers.We_Do?.project_development) {
      answers.We_Do.project_development.forEach((exercise, index) => {
        weDoExercises.push({
          type: 'We_Do',
          category: 'project_development',
          exerciseId: exercise.exerciseId || `PROJ-${index + 1}`,
          exerciseName: exercise.exerciseInformation?.exerciseName || `Project Exercise ${index + 1}`,
          status: exercise.questions?.some(q => q.status === 'evaluated') ? 'evaluated' :
                 exercise.questions?.some(q => q.status === 'attempted') ? 'attempted' : 'not_started',
          completedQuestions: exercise.questions?.filter(q => 
            q.status === 'attempted' || q.status === 'evaluated'
          ).length || 0,
          totalQuestions: exercise.questions?.length || 0,
          score: exercise.score || 0,
          maxScore: exercise.maxScore || 0,
          lastAttempt: exercise.lastAttempt,
          attempts: exercise.attempts || 0
        });
      });
    }

    // Process You_Do assessments
    const youDoExercises = [];
    if (answers.You_Do?.assessments) {
      answers.You_Do.assessments.forEach((assessment, index) => {
        youDoExercises.push({
          type: 'You_Do',
          category: 'assessment',
          exerciseId: assessment.exerciseId || `ASSESS-${index + 1}`,
          exerciseName: assessment.exerciseInformation?.exerciseName || `Assessment ${index + 1}`,
          status: assessment.status || 'not_started',
          completedQuestions: assessment.questions?.filter(q => 
            q.status === 'attempted' || q.status === 'evaluated'
          ).length || 0,
          totalQuestions: assessment.questions?.length || 0,
          score: assessment.score || 0,
          maxScore: assessment.maxScore || 0,
          lastAttempt: assessment.lastAttempt,
          attempts: assessment.attempts || 0,
          submissionDate: assessment.submittedAt,
          evaluated: assessment.evaluated || false
        });
      });
    }

    const allExercises = [...weDoExercises, ...youDoExercises];
    
    // Calculate overall progress
    const totalExercises = allExercises.length;
    const completedExercises = allExercises.filter(e => 
      e.status === 'evaluated' || e.completedQuestions > 0
    ).length;
    
    const overallProgress = totalExercises > 0 
      ? Math.round((completedExercises / totalExercises) * 100) 
      : 0;

    // Calculate average score
    const scoredExercises = allExercises.filter(e => e.score > 0);
    const averageScore = scoredExercises.length > 0
      ? Math.round(scoredExercises.reduce((sum, e) => sum + e.score, 0) / scoredExercises.length)
      : 0;

    res.status(200).json({
      success: true,
      data: {
        course,
        student: {
          _id: student._id,
          firstName: student.firstName,
          lastName: student.lastName,
          email: student.email,
          department: student.department,
          phone: student.phone,
          role: {
            renameRole: student.role?.renameRole,
            originalRole: student.role?.originalRole,
            roleValue: student.role?.roleValue
          }
        },
        progress: {
          overall: overallProgress,
          averageScore,
          totalExercises,
          completedExercises,
          pendingExercises: totalExercises - completedExercises,
          exercises: allExercises
        },
        summary: {
          weDo: {
            practical: weDoExercises.filter(e => e.category === 'practical'),
            project_development: weDoExercises.filter(e => e.category === 'project_development')
          },
          youDo: {
            assessments: youDoExercises
          }
        }
      }
    });

  } catch (error) {
    console.error("Error fetching student course progress:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message
    });
  }
};

exports.duplicateCourseHierarchy = async (req, res) => {
  try {
    const {
      duplicateCourseId,
      newCourseId,
      institutionId,
      createdBy,
      duplicate,
      selectedModules,
    } = req.body;

    if (!duplicateCourseId || !newCourseId) {
      return res.status(400).json({
        message: [{ key: "error", value: "Source and target courses are required" }],
      });
    }

    if (!duplicate || !Array.isArray(duplicate) || duplicate.length === 0) {
      return res.status(400).json({
        message: [{ key: "error", value: "Please specify what to duplicate (e.g., ['Module','Topic'])" }],
      });
    }

    // 🔹 ID Maps
    const moduleIdMap = new Map();
    const subModuleIdMap = new Map();
    const topicIdMap = new Map();
    const subTopicIdMap = new Map();

    // 🔹 Step 1: Fetch source modules (all or selected)
    let sourceModules = [];
    if (duplicate.includes("Module")) {
      if (selectedModules && selectedModules.length > 0) {
        sourceModules = await Module1.find({
          courses: duplicateCourseId,
          _id: { $in: selectedModules },
        });
      } else {
        sourceModules = await Module1.find({ courses: duplicateCourseId });
      }
    }

    // 🔹 Step 2: Clone hierarchy dynamically
    for (const mod of sourceModules) {
      // --- get last index for Module in newCourse ---
      const lastModule = await Module1.findOne({ courses: newCourseId })
        .sort({ index: -1 })
        .lean();
      const nextModuleIndex = lastModule ? lastModule.index + 1 : 1;

      const newModule = await Module1.create({
        institution: institutionId || mod.institution,
        courses: newCourseId,
        title: mod.title,
        description: mod.description,
        duration: mod.duration,
        index: nextModuleIndex,
        level: mod.level,
        pedagogy: mod.pedagogy, // ✅ carry pedagogy too
        createdBy: createdBy || mod.createdBy,
        updatedBy: createdBy || mod.updatedBy,
      });

      moduleIdMap.set(mod._id.toString(), newModule._id);

      // -------- CASE 2,3,4: Module → SubModule ...
      if (duplicate.includes("SubModule")) {
        const subModules = await SubModule1.find({ moduleId: mod._id });
        for (const sub of subModules) {
          const lastSubModule = await SubModule1.findOne({ moduleId: newModule._id })
            .sort({ index: -1 })
            .lean();
          const nextSubIndex = lastSubModule ? lastSubModule.index + 1 : 1;

          const newSubModule = await SubModule1.create({
            institution: institutionId || sub.institution,
            courses: newCourseId,
            moduleId: newModule._id,
            title: sub.title,
            description: sub.description,
            duration: sub.duration,
            index: nextSubIndex,
            level: sub.level,
            pedagogy: sub.pedagogy,
            createdBy: createdBy || sub.createdBy,
            updatedBy: createdBy || sub.updatedBy,
          });

          subModuleIdMap.set(sub._id.toString(), newSubModule._id);

          if (duplicate.includes("Topic")) {
            const topics = await Topic1.find({ subModuleId: sub._id });
            for (const topic of topics) {
              const lastTopic = await Topic1.findOne({ subModuleId: newSubModule._id })
                .sort({ index: -1 })
                .lean();
              const nextTopicIndex = lastTopic ? lastTopic.index + 1 : 1;

              const newTopic = await Topic1.create({
                institution: institutionId || topic.institution,
                courses: newCourseId,
                moduleId: newModule._id,
                subModuleId: newSubModule._id,
                title: topic.title,
                description: topic.description,
                duration: topic.duration,
                index: nextTopicIndex,
                level: topic.level,
                pedagogy: topic.pedagogy,
                createdBy: createdBy || topic.createdBy,
                updatedBy: createdBy || topic.updatedBy,
              });

              topicIdMap.set(topic._id.toString(), newTopic._id);

              if (duplicate.includes("SubTopic")) {
                const subTopics = await SubTopic1.find({ topicId: topic._id });
                for (const st of subTopics) {
                  const lastSubTopic = await SubTopic1.findOne({ topicId: newTopic._id })
                    .sort({ index: -1 })
                    .lean();
                  const nextSubTopicIndex = lastSubTopic ? lastSubTopic.index + 1 : 1;

                  const newSubTopic = await SubTopic1.create({
                    institution: institutionId || st.institution,
                    courses: newCourseId,
                    topicId: newTopic._id,
                    title: st.title,
                    description: st.description,
                    duration: st.duration,
                    index: nextSubTopicIndex,
                    level: st.level,
                    pedagogy: st.pedagogy,
                    createdBy: createdBy || st.createdBy,
                    updatedBy: createdBy || st.updatedBy,
                  });

                  subTopicIdMap.set(st._id.toString(), newSubTopic._id);
                }
              }
            }
          }
        }
      }

      // -------- CASE 5,6: Module → Topic (no SubModule)
      if (!duplicate.includes("SubModule") && duplicate.includes("Topic")) {
        const topics = await Topic1.find({ moduleId: mod._id });
        for (const topic of topics) {
          const lastTopic = await Topic1.findOne({ moduleId: newModule._id })
            .sort({ index: -1 })
            .lean();
          const nextTopicIndex = lastTopic ? lastTopic.index + 1 : 1;

          const newTopic = await Topic1.create({
            institution: institutionId || topic.institution,
            courses: newCourseId,
            moduleId: newModule._id,
            title: topic.title,
            description: topic.description,
            duration: topic.duration,
            index: nextTopicIndex,
            level: topic.level,
            pedagogy: topic.pedagogy,
            createdBy: createdBy || topic.createdBy,
            updatedBy: createdBy || topic.updatedBy,
          });

          topicIdMap.set(topic._id.toString(), newTopic._id);

          if (duplicate.includes("SubTopic")) {
            const subTopics = await SubTopic1.find({ topicId: topic._id });
            for (const st of subTopics) {
              const lastSubTopic = await SubTopic1.findOne({ topicId: newTopic._id })
                .sort({ index: -1 })
                .lean();
              const nextSubTopicIndex = lastSubTopic ? lastSubTopic.index + 1 : 1;

              const newSubTopic = await SubTopic1.create({
                institution: institutionId || st.institution,
                courses: newCourseId,
                topicId: newTopic._id,
                title: st.title,
                description: st.description,
                duration: st.duration,
                index: nextSubTopicIndex,
                level: st.level,
                pedagogy: st.pedagogy,
                createdBy: createdBy || st.createdBy,
                updatedBy: createdBy || st.updatedBy,
              });

              subTopicIdMap.set(st._id.toString(), newSubTopic._id);
            }
          }
        }
      }
    }

    // 🔹 Step 3: Clone LevelView (same as before, but index already handled above)
    // 🔹 Step 4: Clone PedagogyView (same as before)

    return res.status(200).json({
      message: [{ key: "success", value: "Selected course hierarchy duplicated successfully" }],
      modulesCloned: moduleIdMap.size,
      subModulesCloned: subModuleIdMap.size,
      topicsCloned: topicIdMap.size,
      subTopicsCloned: subTopicIdMap.size,
    });
  } catch (err) {
    console.error("Error duplicating course hierarchy:", err);
    return res.status(500).json({
      message: [{ key: "error", value: "Internal server error" }],
    });
  }
};


const modelMap = {
  modules: { model: Module1, path: "modules" },
  submodules: { model: SubModule1, path: "submodules" },
  topics: { model: Topic1, path: "topics" },
  subtopics: { model: SubTopic1, path: "subtopics" },
};

// Normalize duration
const normalizeDuration = (duration) => {
  if (!duration) return null;
  if (typeof duration === "string" && !isNaN(duration)) {
    return Number(duration);
  }
  return duration;
};


class VideoProcessor {
  static async processVideo(inputBuffer, fileName, targetResolutions = ['2160p', '1440p', '1080p', '720p', '480p', '360p','240p']) {
    const tempDir = path.join(__dirname, '../temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const baseFileName = path.parse(fileName).name;
    const uniqueId = Date.now();
    const inputPath = path.join(tempDir, `input_${uniqueId}_${fileName}`);
    const outputFiles = {};

    try {
      // Write buffer to temporary file
      fs.writeFileSync(inputPath, inputBuffer);

      // Validate input video
      console.log('🔍 Validating input video...');
      const validation = await this.validateVideo(inputPath);
      if (!validation.isValid) {
        console.warn('⚠️ Input video may have compatibility issues');
        console.warn(`   Video codec: ${validation.metadata?.streams?.find(s => s.codec_type === 'video')?.codec_name}`);
        console.warn(`   Audio codec: ${validation.metadata?.streams?.find(s => s.codec_type === 'audio')?.codec_name}`);
      } else {
        console.log('✅ Input video is web-compatible (H.264/AAC)');
      }

      // Get video information
      const videoInfo = await this.getVideoInfo(inputPath);
      
      console.log(`📊 Original video info: ${videoInfo.width}x${videoInfo.height}, duration: ${videoInfo.duration}s`);
      
      // Filter resolutions based on original video quality
      const supportedResolutions = this.getSupportedResolutions(videoInfo.width, targetResolutions);
      console.log(`🎯 Target resolutions: ${supportedResolutions.join(', ')}`);

      // Process each supported resolution in parallel
      const processingPromises = supportedResolutions.map(resolution => 
        this.convertResolution(inputPath, baseFileName, resolution, videoInfo, uniqueId)
      );

      // Always add base/original version
      console.log('📦 Adding base version to processing queue...');
      processingPromises.push(this.saveBaseVersion(inputPath, baseFileName, uniqueId));

      // Wait for all conversions to complete
      const results = await Promise.allSettled(processingPromises);
      
      // Combine successful results
      results.forEach((result, index) => {
        if (result.status === 'fulfilled' && result.value) {
          outputFiles[result.value.resolution] = result.value;
          console.log(`✅ Successfully processed: ${result.value.resolution}`);
        } else if (result.status === 'rejected') {
          console.error(`❌ Failed to process resolution:`, result.reason?.message || result.reason);
        }
      });

      console.log(`🎉 Video processing complete! Generated ${Object.keys(outputFiles).length} versions`);
      return outputFiles;

    } catch (error) {
      console.error('❌ Critical error in video processing:', error);
      throw error;
    } finally {
      // Cleanup temporary input file with retry logic
      await this.safeDeleteFile(inputPath);
    }
  }

  static getSupportedResolutions(originalWidth, targetResolutions) {
    const resolutionMap = {
      '2160p': 3840,
      '1440p': 2560,
      '1080p': 1920,
      '720p': 1280,
      '480p': 854,
      '360p': 640,
      '240p': 426
    };

    return targetResolutions.filter(resolution => {
      const targetWidth = resolutionMap[resolution];
      return targetWidth && originalWidth >= targetWidth;
    });
  }

  static getVideoInfo(inputPath) {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(inputPath, (err, metadata) => {
        if (err) return reject(err);
        
        const videoStream = metadata.streams.find(stream => stream.codec_type === 'video');
        if (!videoStream) {
          return reject(new Error('No video stream found'));
        }

        resolve({
          width: videoStream.width,
          height: videoStream.height,
          duration: metadata.format.duration,
          bitrate: metadata.format.bit_rate,
          codec: videoStream.codec_name,
          audioCodec: metadata.streams.find(s => s.codec_type === 'audio')?.codec_name
        });
      });
    });
  }

  static convertResolution(inputPath, baseFileName, resolution, originalInfo, uniqueId) {
    return new Promise((resolve, reject) => {
      const resolutionMap = {
        '2160p': 3840,
        '1440p': 2560,
        '1080p': 1920,
        '720p': 1280,
        '480p': 854,
        '360p': 640,
        '240p': 426
      };

      const targetWidth = resolutionMap[resolution];
      const outputFileName = `${baseFileName}_${resolution}_${uniqueId}.mp4`;
      const outputPath = path.join(path.dirname(inputPath), outputFileName);

      console.log(`🔄 Converting to ${resolution} (${targetWidth}px width)...`);

      const command = ffmpeg(inputPath)
        .videoCodec('libx264')
        .size(`${targetWidth}x?`)
        .videoBitrate('800k')
        .audioCodec('aac')
        .audioBitrate('128k')
        .outputOptions([
          '-preset fast',
          '-crf 23',
          '-movflags +faststart',
          '-pix_fmt yuv420p'
        ])
        .output(outputPath)
        .on('start', (commandLine) => {
          console.log(`🚀 Started ${resolution}: ${commandLine}`);
        })
        .on('progress', (progress) => {
          if (progress.percent) {
            console.log(`⏳ ${resolution}: ${Math.round(progress.percent)}%`);
          }
        })
        .on('end', async () => {
          console.log(`✅ ${resolution} conversion completed`);
          try {
            const outputBuffer = fs.readFileSync(outputPath);
            await this.safeDeleteFile(outputPath);
            resolve({
              resolution,
              buffer: outputBuffer,
              fileName: outputFileName,
              width: targetWidth
            });
          } catch (error) {
            reject(error);
          }
        })
        .on('error', async (err) => {
          console.error(`❌ ${resolution} conversion failed:`, err.message);
          await this.safeDeleteFile(outputPath);
          reject(err);
        });

      command.run();
    });
  }

  static saveBaseVersion(inputPath, baseFileName, uniqueId) {
    return new Promise((resolve, reject) => {
      const outputFileName = `${baseFileName}_base_${uniqueId}.mp4`;
      const outputPath = path.join(path.dirname(inputPath), outputFileName);

      console.log('💾 Saving base version with web optimization...');

      ffmpeg(inputPath)
        .videoCodec('libx264')
        .audioCodec('aac')
        .outputOptions([
          '-preset fast',
          '-crf 23',
          '-movflags +faststart',
          '-pix_fmt yuv420p'
        ])
        .output(outputPath)
        .on('start', (commandLine) => {
          console.log(`🚀 Started base version: ${commandLine}`);
        })
        .on('progress', (progress) => {
          if (progress.percent) {
            console.log(`⏳ Base version: ${Math.round(progress.percent)}%`);
          }
        })
        .on('end', async () => {
          console.log('✅ Base version saved and optimized');
          try {
            const outputBuffer = fs.readFileSync(outputPath);
            await this.safeDeleteFile(outputPath);
            resolve({
              resolution: 'base',
              buffer: outputBuffer,
              fileName: outputFileName
            });
          } catch (error) {
            reject(error);
          }
        })
        .on('error', async (err) => {
          console.error('❌ Base version failed:', err.message);
          await this.safeDeleteFile(outputPath);
          reject(err);
        })
        .run();
    });
  }

  static async validateVideo(filePath) {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(filePath, (err, metadata) => {
        if (err) return reject(err);
        
        const videoStream = metadata.streams.find(s => s.codec_type === 'video');
        const audioStream = metadata.streams.find(s => s.codec_type === 'audio');
        
        console.log('📊 Video validation:', {
          videoCodec: videoStream?.codec_name,
          audioCodec: audioStream?.codec_name,
          duration: metadata.format.duration,
          size: metadata.format.size
        });
        
        resolve({
          isValid: videoStream?.codec_name === 'h264' && audioStream?.codec_name === 'aac',
          metadata
        });
      });
    });
  }

  static async safeDeleteFile(filePath, maxRetries = 5) {
    if (!fs.existsSync(filePath)) return;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        fs.unlinkSync(filePath);
        console.log(`🗑️ Deleted: ${path.basename(filePath)}`);
        return;
      } catch (error) {
        if (error.code === 'EBUSY' && attempt < maxRetries) {
          console.log(`⚠️ File busy, retrying (${attempt}/${maxRetries})...`);
          await new Promise(resolve => setTimeout(resolve, 100 * attempt));
        } else {
          console.warn(`⚠️ Could not delete ${filePath}:`, error.message);
          return;
        }
      }
    }
  }
}

// Upload Original Video (Fallback)
const uploadOriginalVideo = async (file, type, section, name, pathParts, targetFolder, isUpdate, updateFileId, pedagogyElement, supabase) => {
  const uniqueFileName = `${Date.now()}_${file.name}`;
  const storageFolderPath = pathParts.length > 0 ? pathParts.join('/') : "root";
  
  // Store in resolutions/base folder
  const storagePath = `courses/${type}s/${section}/${name}/${storageFolderPath}/resolutions/base/${uniqueFileName}`;

  const { error: uploadError } = await supabase.storage
    .from("smartlms")
    .upload(storagePath, file.data, { contentType: file.mimetype });

  if (uploadError) throw uploadError;

  const fileUrl = `${process.env.SUPABASE_URL}/storage/v1/object/public/smartlms/${storagePath}`;
  const fileUrlMap = new Map();
  fileUrlMap.set('base', fileUrl);

  const newFile = {
    _id: new mongoose.Types.ObjectId(),
    fileName: file.name,
    fileType: file.mimetype,
    fileUrl: fileUrlMap,
    size: file.size.toString(),
    uploadedAt: new Date(),
    isVideo: true,
    availableResolutions: ['base'],
  };

  if (isUpdate && updateFileId) {
    const fileResult = findFileById(pedagogyElement, updateFileId);
    if (fileResult && Array.isArray(fileResult.parent)) {
      fileResult.parent[fileResult.index] = {
        ...fileResult.parent[fileResult.index],
        ...newFile,
        updatedAt: new Date(),
      };
    }
  } else {
    targetFolder.files.push(newFile);
  }
};

// Upload to Resolution Specific Folder
const uploadToResolutionFolder = async (fileBuffer, fileName, resolution, type, section, name, pathParts) => {
  const storageFolderPath = pathParts.length > 0 ? pathParts.join('/') : "root";
  
  // Store in resolutions/{resolution} folder
  const storagePath = `courses/${type}s/${section}/${name}/${storageFolderPath}/resolutions/${resolution}/${fileName}`;

  const { error: uploadError } = await supabase.storage
    .from("smartlms")
    .upload(storagePath, fileBuffer, { 
      contentType: 'video/mp4',
      upsert: true
    });

  if (uploadError) {
    throw new Error(`Failed to upload ${resolution} version: ${uploadError.message}`);
  }

  return `${process.env.SUPABASE_URL}/storage/v1/object/public/smartlms/${storagePath}`;
};

// Delete from Resolution Folder
const deleteFromResolutionFolder = async (fileUrl, type, section, name, pathParts) => {
  try {
    // Extract the path after "smartlms/" to get the storage path
    const storagePath = fileUrl.split('/storage/v1/object/public/smartlms/')[1];
    
    if (storagePath) {
      const { error: deleteError } = await supabase.storage
        .from("smartlms")
        .remove([storagePath]);

      if (deleteError) {
        console.warn(`Failed to delete file from storage: ${deleteError.message}`);
      } else {
        console.log(`✅ Deleted file from storage: ${storagePath}`);
      }
    }
  } catch (error) {
    console.warn('Error deleting file from storage:', error);
  }
};

// Debug Folder Structure
const debugFolderStructure = (folders, depth = 0) => {
  const indent = '  '.repeat(depth);
  folders.forEach(folder => {
    console.log(`${indent}📁 ${folder.name} (${folder.files ? folder.files.length : 0} files)`);
    if (folder.files && folder.files.length > 0) {
      folder.files.forEach(file => {
        console.log(`${indent}  📄 ${file.fileName}${file.isVideo ? ' 🎬' : ''}`);
      });
    }
    if (folder.subfolders && folder.subfolders.length > 0) {
      debugFolderStructure(folder.subfolders, depth + 1);
    }
  });
};


const findOrCreateFolder = (folders, pathParts) => {
    if (!Array.isArray(folders)) {
        folders = [];
    }
    
    if (pathParts.length === 0) {
        return { folders, targetFolder: null };
    }

    const [current, ...rest] = pathParts;
    let folder = folders.find((f) => f.name === current);

    if (!folder) {
        console.log(`📁 Creating new folder: ${current}`);
        folder = { 
            _id: new mongoose.Types.ObjectId(),
            name: current, 
            files: [], 
            subfolders: [],
            createdAt: new Date(),
            updatedAt: new Date()
        };
        folders.push(folder);
    }

    // Ensure arrays exist
    if (!Array.isArray(folder.files)) folder.files = [];
    if (!Array.isArray(folder.subfolders)) folder.subfolders = [];

    if (rest.length > 0) {
        return findOrCreateFolder(folder.subfolders, rest);
    }
    
    return { folders: folder.subfolders, targetFolder: folder };
};
const findFolderByPathForNav = (folders, pathParts) => {
  if (!Array.isArray(folders) || pathParts.length === 0) {
    return { folders: [], targetFolder: null };
  }

  const [current, ...rest] = pathParts;
  const folder = folders.find((f) => f.name === current);

  if (!folder) return { folders: [], targetFolder: null };
  
  if (rest.length === 0) {
    return { 
      folders: Array.isArray(folder.subfolders) ? folder.subfolders : [], 
      files: Array.isArray(folder.files) ? folder.files : [],
      targetFolder: folder 
    };
  }

  if (!Array.isArray(folder.subfolders)) {
    return { folders: [], targetFolder: null };
  }
  
  return findFolderByPathForNav(folder.subfolders, rest);
};

const findFolderByPath = (folders, pathParts) => {
  if (!Array.isArray(folders)) {
    return null;
  }
  
  if (pathParts.length === 0) return { folders };

  const [current, ...rest] = pathParts;
  const folder = folders.find((f) => f.name === current);

  if (!folder) return null;
  if (rest.length === 0) return { parent: folders, folder, index: folders.indexOf(folder) };

  if (!Array.isArray(folder.subfolders)) {
    return null;
  }
  
  return findFolderByPath(folder.subfolders, rest);
};

const findFileById = (pedagogyElement, fileId) => {
  const filesArray = Array.isArray(pedagogyElement.files) ? pedagogyElement.files : [];
  
  const rootFile = filesArray.find(f => f._id && f._id.toString() === fileId);
  if (rootFile) {
    return { parent: filesArray, file: rootFile, index: filesArray.indexOf(rootFile) };
  }

  const searchInFolders = (folders) => {
    if (!Array.isArray(folders)) {
      return null;
    }
    
    for (let folder of folders) {
      const folderFiles = Array.isArray(folder.files) ? folder.files : [];
      const fileInFolder = folderFiles.find(f => f._id && f._id.toString() === fileId);
      
      if (fileInFolder) {
        return { parent: folderFiles, file: fileInFolder, index: folderFiles.indexOf(fileInFolder) };
      }
      
      const result = searchInFolders(folder.subfolders);
      if (result) return result;
    }
    return null;
  };

  const foldersArray = Array.isArray(pedagogyElement.folders) ? pedagogyElement.folders : [];
  return searchInFolders(foldersArray);
};




exports.updateEntity = async (req, res) => {
  try {
    const { type, id } = req.params;

    if (!modelMap[type]) {
      return res.status(400).json({ message: [{ key: "error", value: "Invalid entity type" }] });
    }

    const { model } = modelMap[type];
    const entity = await model.findById(id);
    if (!entity) {
      return res.status(404).json({ message: [{ key: "error", value: `${type} not found` }] });
    }

    const {
      courses,
      moduleId,
      subModuleId,
      topicId,
      index,
      title,
      description,
      duration,
      level,
      pedagogy,
      tabType,
      subcategory,
      folderPath,
      folderName,
      isUpdate,
      updateFileId,
      action,
      showToStudents,
      allowDownload,
      selectedFileType,
            fileDescription, // NEW: Add file description
      tags, // NEW: Add tags
    } = req.body;

    // Update simple fields
    if (courses) entity.courses = courses;
    if (moduleId) entity.moduleId = moduleId;
    if (subModuleId) entity.subModuleId = subModuleId;
    if (topicId) entity.topicId = topicId;
    if (index !== undefined) entity.index = index;
    if (title) entity.title = title;
    if (description) entity.description = description;
    if (duration) entity.duration = normalizeDuration(duration);
    if (level) entity.level = level;

    // Initialize pedagogy if not exists
    if (!entity.pedagogy) {
      entity.pedagogy = { I_Do: new Map(), We_Do: new Map(), You_Do: new Map() };
    }

    const section = tabType;
    const name = subcategory;

    if (!entity.pedagogy[section]) entity.pedagogy[section] = new Map();
    
    if (!entity.pedagogy[section].get(name)) {
      entity.pedagogy[section].set(name, { 
        description: "", 
        files: [], 
        folders: []
      });
    }

    const pedagogyElement = entity.pedagogy[section].get(name);

    if (!Array.isArray(pedagogyElement.files)) {
      pedagogyElement.files = [];
    }
    if (!Array.isArray(pedagogyElement.folders)) {
      pedagogyElement.folders = [];
    }

    // FILE SETTINGS UPDATE ACTION
    if (action === 'updateFileSettings' && updateFileId) {
      // Get showToStudents and allowDownload from req.body
      const showToStudentsValue = req.body.showToStudents === 'true' || req.body.showToStudents === true;
      const allowDownloadValue = req.body.allowDownload === 'true' || req.body.allowDownload === true;
  const fileDescriptionValue = req.body.fileDescription || ""; // Get file description
  const tagsValue = req.body.tags || []; // Get tags
      const fileResult = findFileById(pedagogyElement, updateFileId);
      
      if (!fileResult) {
        return res.status(404).json({ 
          message: [{ key: "error", value: "File not found" }] 
        });
      }
   if (fileDescriptionValue !== undefined) {
    fileResult.file.fileDescription = fileDescriptionValue;
  }

  // Update tags
  if (tagsValue) {
    try {
      const parsedTags = typeof tagsValue === 'string' ? JSON.parse(tagsValue) : tagsValue;
      if (Array.isArray(parsedTags)) {
        fileResult.file.tags = parsedTags.map(tag => ({
          tagName: tag.tagName || tag.name || '',
          tagColor: tag.tagColor || tag.color || '#3B82F6'
        }));
      }
    } catch (error) {
      console.error("Error parsing tags:", error);
    }
  }

      // Ensure fileSettings object exists
      if (!fileResult.file.fileSettings) {
        fileResult.file.fileSettings = {};
      }

      // Update file settings
      fileResult.file.fileSettings = {
        showToStudents: showToStudentsValue !== undefined ? showToStudentsValue : (fileResult.file.fileSettings?.showToStudents ?? true),
        allowDownload: allowDownloadValue !== undefined ? allowDownloadValue : (fileResult.file.fileSettings?.allowDownload ?? true),
        lastModified: new Date()
      };

      // Mark the entity as modified
      entity.markModified(`pedagogy.${section}.${name}`);

      entity.updatedBy = req.user?.email || "roobankr5@gmail.com";
      entity.updatedAt = new Date();

      const updatedEntity = await entity.save();

      return res.status(200).json({
        message: [{ key: "success", value: "File settings updated successfully" }],
        data: updatedEntity,
      });
    }

    // FOLDER CREATION
    if (action === 'createFolder' && folderName) {
      const pathParts = folderPath ? folderPath.split("/").filter(p => p) : [];
      
      console.log('🔍 BACKEND FOLDER CREATION:', {
        section,
        name,
        folderPath,
        pathParts,
        folderName,
        existingFolders: pedagogyElement.folders ? pedagogyElement.folders.length : 0
      });

      if (!Array.isArray(pedagogyElement.folders)) {
        pedagogyElement.folders = [];
      }

      let targetFolders = pedagogyElement.folders;
      
      if (pathParts.length > 0) {
        for (const pathPart of pathParts) {
          let foundFolder = targetFolders.find(f => f.name === pathPart);
          
          if (!foundFolder) {
            console.log('❌ Parent folder not found:', pathPart);
            return res.status(404).json({ 
              message: [{ key: "error", value: `Parent folder '${pathPart}' not found` }] 
            });
          }
          
          if (!Array.isArray(foundFolder.subfolders)) {
            foundFolder.subfolders = [];
          }
          
          targetFolders = foundFolder.subfolders;
        }
      }

      const existingFolder = targetFolders.find(f => f.name === folderName);
      if (existingFolder) {
        console.log('❌ Folder already exists:', folderName);
        return res.status(400).json({ 
          message: [{ key: "error", value: `Folder '${folderName}' already exists` }] 
        });
      }

      const newFolder = {
        _id: new mongoose.Types.ObjectId(),
        name: folderName,
        files: [],
        subfolders: [],
        createdAt: new Date(),
        updatedAt: new Date()
      };

      console.log('📁 Adding new folder to target:', {
        targetLocation: pathParts.length > 0 ? `inside ${pathParts.join('/')}` : 'root',
        targetFoldersCount: targetFolders.length,
        newFolderName: folderName
      });

      targetFolders.push(newFolder);
      
      entity.markModified(`pedagogy.${section}.${name}`);
      
      entity.updatedBy = req.user?.email || "roobankr5@gmail.com";
      entity.updatedAt = new Date();

      try {
        const updatedEntity = await entity.save();

        console.log('✅ Folder created successfully in database at location:', 
          pathParts.length > 0 ? `${pathParts.join('/')}/${folderName}` : folderName);

        return res.status(200).json({
          message: [{ key: "success", value: `Folder '${folderName}' created successfully` }],
          data: updatedEntity,
        });
      } catch (saveError) {
        console.error('❌ Failed to save folder to database:', saveError);
        return res.status(500).json({ 
          message: [{ key: "error", value: "Failed to save folder to database" }] 
        });
      }
    }
      // FOLDER DELETION
    if (action === 'deleteFolder' && folderName) {
      const pathParts = folderPath ? folderPath.split("/").filter(p => p) : [];
      const fullPath = [...pathParts, folderName];
      
      const result = findFolderByPath(pedagogyElement.folders, fullPath);
      
      if (!result || !result.parent) {
        return res.status(404).json({ 
          message: [{ key: "error", value: `Folder '${folderName}' not found` }] 
        });
      }

      const deleteFolderFilesRecursively = async (folder, currentPath = []) => {
        const filesArray = Array.isArray(folder.files) ? folder.files : [];
        
        for (let file of filesArray) {
          try {
            if (file.fileUrl instanceof Map) {
              // Delete all resolution versions
              for (const [resolution, fileUrl] of file.fileUrl) {
                await deleteFromResolutionFolder(fileUrl, type, section, name, currentPath);
              }
            } else {
              // Delete single file
              await deleteFromResolutionFolder(file.fileUrl, type, section, name, currentPath);
            }
          } catch (storageError) {
            console.warn("Storage deletion error:", storageError);
          }
        }

        const subfoldersArray = Array.isArray(folder.subfolders) ? folder.subfolders : [];
        for (let subfolder of subfoldersArray) {
          await deleteFolderFilesRecursively(subfolder, [...currentPath, subfolder.name]);
        }
      };

      await deleteFolderFilesRecursively(result.folder, fullPath);

      if (Array.isArray(result.parent)) {
        result.parent.splice(result.index, 1);
      }
      
      entity.updatedBy = req.user?.email || "roobankr5@gmail.com";
      entity.updatedAt = Date.now();

      const updatedEntity = await entity.save();

      return res.status(200).json({
        message: [{ key: "success", value: `Folder '${folderName}' and all contents deleted successfully` }],
        data: updatedEntity,
      });
    }
 if (action === 'deleteFile' && updateFileId) {
      const fileResult = findFileById(pedagogyElement, updateFileId);

      if (!fileResult) {
        return res.status(404).json({ 
          message: [{ key: "error", value: "File not found" }] 
        });
      }

      try {
        const fileUrlMap = fileResult.file.fileUrl;
        
        if (fileUrlMap instanceof Map) {
          // Delete all resolution versions
          for (const [resolution, fileUrl] of fileUrlMap) {
            await deleteFromResolutionFolder(fileUrl, type, section, name, folderPath ? folderPath.split("/").filter(p => p) : []);
          }
        } else {
          // Delete single file
          await deleteFromResolutionFolder(fileResult.file.fileUrl, type, section, name, folderPath ? folderPath.split("/").filter(p => p) : []);
        }
      } catch (storageError) {
        console.warn("Storage deletion error:", storageError);
      }

      if (Array.isArray(fileResult.parent)) {
        fileResult.parent.splice(fileResult.index, 1);
      }
      
      entity.updatedBy = req.user?.email || "roobankr5@gmail.com";
      entity.updatedAt = Date.now();

      const updatedEntity = await entity.save();

      return res.status(200).json({
        message: [{ key: "success", value: "File and all resolutions deleted successfully" }],
        data: updatedEntity,
      });
    }
    // FILE UPLOAD WITH FILE SETTINGS
    if (req.files && req.files.files) {
      const files = Array.isArray(req.files.files) ? req.files.files : [req.files.files];
      const pathParts = folderPath ? folderPath.split("/").filter(p => p) : [];
            const fileDescriptionValue = req.body.fileDescription || ""; // NEW: Get file description

      // Get file settings from request
      const showToStudentsValue = req.body.showToStudents === 'true' || req.body.showToStudents === true;
      const allowDownloadValue = req.body.allowDownload === 'true' || req.body.allowDownload === true;
        let parsedTags = [];
      if (req.body.tags) {
        try {
          parsedTags = typeof req.body.tags === 'string' ? JSON.parse(req.body.tags) : req.body.tags;
        } catch (error) {
          console.error("Error parsing tags:", error);
        }
      }

      console.log('📋 File settings from request:', {
        showToStudents: showToStudentsValue,
        allowDownload: allowDownloadValue,
        hasSettings: !!req.body.showToStudents,
         fileDescription: fileDescriptionValue, // NEW: Log file description
        tags: parsedTags, // NEW: Log tags
      });

      const isReferenceUpload = selectedFileType === "reference" || req.body.fileType === "reference";

      console.log('📁 FILE UPLOAD TO FOLDER:', {
        pathParts,
        folderPath,
        filesCount: files.length,
        isReferenceUpload
      });

      let currentFolders = pedagogyElement.folders;
      let targetFolder = pedagogyElement;

      if (pathParts.length > 0) {
        for (const folderName of pathParts) {
          if (!Array.isArray(currentFolders)) {
            currentFolders = [];
            if (targetFolder !== pedagogyElement) {
              targetFolder.subfolders = currentFolders;
            } else {
              pedagogyElement.folders = currentFolders;
            }
          }

          let foundFolder = currentFolders.find(f => f.name === folderName);
          
          if (!foundFolder) {
            foundFolder = {
              _id: new mongoose.Types.ObjectId(),
              name: folderName,
              files: [],
              subfolders: []
            };
            currentFolders.push(foundFolder);
          }

          targetFolder = foundFolder;
          currentFolders = foundFolder.subfolders;
        }
      }

      if (!Array.isArray(targetFolder.files)) {
        targetFolder.files = [];
      }

      const uploadedFileNames = new Set(targetFolder.files.map(f => f.fileName));
      
      for (let file of files) {
        if (!isUpdate && uploadedFileNames.has(file.name)) {
          console.log(`⚠️ File ${file.name} already exists, skipping upload`);
          continue;
        }

        // Process different file types
        if (file.mimetype.startsWith('video/')) {
          // Video processing logic
          try {
            console.log(`🎬 Processing video: ${file.name}`);
            
            const targetResolutions = ['2160p', '1440p', '1080p', '720p', '480p', '360p','240p'];
            
            const processedVersions = await VideoProcessor.processVideo(
              file.data, 
              file.name, 
              targetResolutions
            );

            if (!processedVersions || Object.keys(processedVersions).length === 0) {
              console.log('❌ No versions were processed, falling back to original upload');
              await uploadOriginalVideo(file, type, section, name, pathParts, targetFolder, isUpdate, updateFileId, pedagogyElement, supabase);
              continue;
            }

            const fileUrlMap = new Map();
            const availableResolutions = [];

            for (const [resolution, processedFile] of Object.entries(processedVersions)) {
              if (!processedFile || !processedFile.buffer) {
                console.warn(`⚠️ Skipping ${resolution}: No buffer available`);
                continue;
              }

              try {
                const fileUrl = await uploadToResolutionFolder(
                  processedFile.buffer,
                  processedFile.fileName,
                  resolution,
                  type,
                  section,
                  name,
                  pathParts
                );

                fileUrlMap.set(resolution, fileUrl);
                availableResolutions.push(resolution);

                console.log(`✅ Uploaded ${resolution} version to resolutions/${resolution}/ folder`);
              } catch (uploadError) {
                console.error(`❌ Failed to upload ${resolution} version:`, uploadError.message);
              }
            }

            if (availableResolutions.length === 0) {
              console.log('🔄 No resolutions uploaded successfully, falling back to original upload');
              await uploadOriginalVideo(file, type, section, name, pathParts, targetFolder, isUpdate, updateFileId, pedagogyElement, supabase);
              continue;
            }

            // ✅ CREATE VIDEO FILE WITH SETTINGS
            const newFile = {
              _id: new mongoose.Types.ObjectId(),
              fileName: file.name,
              fileType: file.mimetype,
              fileUrl: fileUrlMap,
              size: file.size.toString(),
              uploadedAt: new Date(),
              isVideo: true,
              isReference: isReferenceUpload,
              availableResolutions: availableResolutions.sort((a, b) => {
                const order = {'2160p': 7, '1440p': 6, '1080p': 5, '720p': 4, '480p': 3, '360p': 2,'240p':1, 'base': 0};
                return (order[b] || 0) - (order[a] || 0);
              }),
               fileDescription: fileDescriptionValue,
              // ✅ TAGS ADDED HERE
              tags: parsedTags.map(tag => ({
                tagName: tag.tagName || tag.name || '',
                tagColor: tag.tagColor || tag.color || '#3B82F6'
              })),
              // ✅ FILE SETTINGS ADDED HERE
              fileSettings: {
                showToStudents: showToStudentsValue,
                allowDownload: allowDownloadValue,
                lastModified: new Date()
              }
            };

            if (isUpdate && updateFileId) {
              const fileResult = findFileById(pedagogyElement, updateFileId);
              if (fileResult && Array.isArray(fileResult.parent)) {
                // Delete old resolution files before updating
                const oldFile = fileResult.file;
                if (oldFile.fileUrl instanceof Map) {
                  for (const [resolution, fileUrl] of oldFile.fileUrl) {
                    try {
                      await deleteFromResolutionFolder(fileUrl, type, section, name, pathParts);
                    } catch (delError) {
                      console.warn(`⚠️ Could not delete old ${resolution}:`, delError.message);
                    }
                  }
                }
                
                // ✅ PRESERVE EXISTING SETTINGS IF NOT PROVIDED
                fileResult.parent[fileResult.index] = {
                  ...fileResult.parent[fileResult.index],
                  ...newFile,
                  updatedAt: new Date(),
                   fileDescription: fileDescriptionValue || fileResult.file.fileDescription || "",
                  tags: parsedTags.length > 0 ? parsedTags.map(tag => ({
                    tagName: tag.tagName || tag.name || '',
                    tagColor: tag.tagColor || tag.color || '#3B82F6'
                  })) : fileResult.file.tags || [],
                  fileSettings: {
                    showToStudents: req.body.showToStudents !== undefined ? showToStudentsValue : (fileResult.file.fileSettings?.showToStudents ?? true),
                    allowDownload: req.body.allowDownload !== undefined ? allowDownloadValue : (fileResult.file.fileSettings?.allowDownload ?? true),
                    lastModified: new Date()
                  }
                };
              }
            } else {
              targetFolder.files.push(newFile);
            }

          } catch (videoError) {
            console.error('❌ Video processing error:', videoError);
            try {
              await uploadOriginalVideo(file, type, section, name, pathParts, targetFolder, isUpdate, updateFileId, pedagogyElement, supabase);
            } catch (fallbackError) {
              console.error('❌ Fallback upload also failed:', fallbackError);
            }
          }
        } else {
          // NON-VIDEO FILE OR ARCHIVE UPLOAD
          const uniqueFileName = `${Date.now()}_${file.name}`;
          const storageFolderPath = pathParts.length > 0 ? pathParts.join('/') : "root";
          const storagePath = `courses/${type}s/${section}/${name}/${storageFolderPath}/${uniqueFileName}`;

          const isArchive = /\.(zip|rar|tar)$/i.test(file.name);
          const fileTypeLabel = isArchive ? "archive" : "regular";


          const { error: uploadError } = await supabase.storage
            .from("smartlms")
            .upload(storagePath, file.data, { contentType: file.mimetype });

          if (uploadError) {
            console.error("File upload error:", uploadError);
            continue;
          }

          const fileUrl = `${process.env.SUPABASE_URL}/storage/v1/object/public/smartlms/${storagePath}`;
          const fileUrlMap = new Map();
          fileUrlMap.set('base', fileUrl);

          // ✅ CREATE NON-VIDEO FILE WITH SETTINGS
          const newFile = {
            _id: new mongoose.Types.ObjectId(),
            fileName: file.name,
            fileType: file.mimetype || (isArchive ? "application/octet-stream" : "unknown"),
            fileUrl: fileUrlMap,
            size: file.size.toString(),
            uploadedAt: new Date(),
            isVideo: false,
             fileDescription: fileDescriptionValue,
            // ✅ TAGS ADDED HERE
            tags: parsedTags.map(tag => ({
              tagName: tag.tagName || tag.name || '',
              tagColor: tag.tagColor || tag.color || '#3B82F6'
            })),
            isArchive,
            isReference: isReferenceUpload,
            availableResolutions: [],
            // ✅ FILE SETTINGS ADDED HERE
            fileSettings: {
              showToStudents: showToStudentsValue,
              allowDownload: allowDownloadValue,
              lastModified: new Date()
            }
          };

          if (isUpdate && updateFileId) {
            const fileResult = findFileById(pedagogyElement, updateFileId);
            if (fileResult && Array.isArray(fileResult.parent)) {
              // ✅ PRESERVE EXISTING SETTINGS IF NOT PROVIDED
              fileResult.parent[fileResult.index] = {
                ...fileResult.parent[fileResult.index],
                ...newFile,
                updatedAt: new Date(),
                 fileDescription: fileDescriptionValue || fileResult.file.fileDescription || "",
                tags: parsedTags.length > 0 ? parsedTags.map(tag => ({
                  tagName: tag.tagName || tag.name || '',
                  tagColor: tag.tagColor || tag.color || '#3B82F6'
                })) : fileResult.file.tags || [],
                fileSettings: {
                  showToStudents: req.body.showToStudents !== undefined ? showToStudentsValue : (fileResult.file.fileSettings?.showToStudents ?? true),
                  allowDownload: req.body.allowDownload !== undefined ? allowDownloadValue : (fileResult.file.fileSettings?.allowDownload ?? true),
                  lastModified: new Date()
                }
              };
            }
          } else {
            targetFolder.files.push(newFile);
          }
        }
      }

      entity.markModified(`pedagogy.${section}.${name}`);
      entity.updatedBy = req.user?.email || "roobankr5@gmail.com";
      entity.updatedAt = new Date();
      
      await entity.save();
    }

    // URL LINK HANDLING WITH FILE SETTINGS
    if (req.body.fileUrl && !req.files) {
      const { fileUrl, fileName, fileType } = req.body;

      if (!fileUrl) {
        return res.status(400).json({ 
          message: [{ key: "error", value: "File URL is required" }] 
        });
      }

      // Get file settings from request
      const showToStudentsValue = req.body.showToStudents === 'true' || req.body.showToStudents === true;
      const allowDownloadValue = req.body.allowDownload === 'true' || req.body.allowDownload === true;

      const isReferenceUpload = selectedFileType === "reference" || req.body.selectedFileType === "reference";
     const fileDescriptionValue = req.body.fileDescription || ""; // NEW: Get file description
  const tagsValue = req.body.tags || []; // FIXED: Get tags

      // NEW: Parse tags from request
    let parsedTags = [];
  if (tagsValue) {
    try {
      parsedTags = typeof tagsValue === 'string' ? JSON.parse(tagsValue) : tagsValue;
    } catch (error) {
      console.error("Error parsing tags:", error);
    }
  }
      const pathParts = folderPath ? folderPath.split("/").filter(p => p) : [];
      let currentFolders = pedagogyElement.folders;
      let targetFolder = pedagogyElement;

      if (pathParts.length > 0) {
        for (const folderName of pathParts) {
          if (!Array.isArray(currentFolders)) {
            currentFolders = [];
            if (targetFolder !== pedagogyElement) {
              targetFolder.subfolders = currentFolders;
            } else {
              pedagogyElement.folders = currentFolders;
            }
          }

          let foundFolder = currentFolders.find(f => f.name === folderName);
          if (!foundFolder) {
            foundFolder = {
              _id: new mongoose.Types.ObjectId(),
              name: folderName,
              files: [],
              subfolders: [],
            };
            currentFolders.push(foundFolder);
          }

          targetFolder = foundFolder;
          currentFolders = foundFolder.subfolders;
        }
      }

      if (!Array.isArray(targetFolder.files)) {
        targetFolder.files = [];
      }

      const fileUrlMap = new Map();
      fileUrlMap.set("base", fileUrl);

      // ✅ CREATE URL FILE WITH SETTINGS
      const newFile = {
        _id: new mongoose.Types.ObjectId(),
        fileName: fileName || "External URL",
        fileType: fileType || "text/uri-list",
        fileUrl: fileUrlMap,
        size: "0",
        uploadedAt: new Date(),
        isVideo: false,
        isReference: isReferenceUpload,
        availableResolutions: [],
         fileDescription: fileDescriptionValue, // ✅ FIXED: Add file description
    // ✅ TAGS ADDED HERE - ensure proper format
    tags: parsedTags.map(tag => ({
      tagName: tag.tagName || tag.name || '',
      tagColor: tag.tagColor || tag.color || '#3B82F6'
    })),
        // ✅ FILE SETTINGS ADDED HERE
        fileSettings: {
          showToStudents: showToStudentsValue,
          allowDownload: allowDownloadValue,
          lastModified: new Date()
        }
      };

      if (isUpdate && updateFileId) {
        const fileResult = findFileById(pedagogyElement, updateFileId);
        if (fileResult && Array.isArray(fileResult.parent)) {
          // ✅ PRESERVE EXISTING SETTINGS IF NOT PROVIDED
          fileResult.parent[fileResult.index] = {
            ...fileResult.parent[fileResult.index],
            ...newFile,
            updatedAt: new Date(),
              fileDescription: fileDescriptionValue || fileResult.file.fileDescription || "",
            tags: parsedTags.length > 0 ? parsedTags.map(tag => ({
              tagName: tag.tagName || tag.name || '',
              tagColor: tag.tagColor || tag.color || '#3B82F6'
            })) : fileResult.file.tags || [],
            fileSettings: {
              showToStudents: req.body.showToStudents !== undefined ? showToStudentsValue : (fileResult.file.fileSettings?.showToStudents ?? true),
              allowDownload: req.body.allowDownload !== undefined ? allowDownloadValue : (fileResult.file.fileSettings?.allowDownload ?? true),
              lastModified: new Date()
            }
          };
        }
      } else {
        targetFolder.files.push(newFile);
      }

      entity.markModified(`pedagogy.${section}.${name}`);
      entity.updatedBy = req.user?.email || "roobankr5@gmail.com";
      entity.updatedAt = new Date();

      await entity.save();

      return res.status(200).json({
        message: [{ key: "success", value: "URL added successfully" }],
        data: entity,
      });
    }

    // Update description only
    if (pedagogy) {
      const parsedPedagogy = typeof pedagogy === "string" ? JSON.parse(pedagogy) : pedagogy;

      for (let section of ["I_Do", "We_Do", "You_Do"]) {
        if (!parsedPedagogy[section]) continue;
        if (!entity.pedagogy[section]) entity.pedagogy[section] = new Map();

        for (let [name, element] of Object.entries(parsedPedagogy[section])) {
          const existing = entity.pedagogy[section].get(name) || { files: [], folders: [] };
          entity.pedagogy[section].set(name, {
            description: element.description || "",
            files: existing.files,
            folders: existing.folders,
          });
        }
      }
    }

    // If no specific action was handled, update timestamps
    if (!action && !req.files && !req.body.fileUrl) {
      entity.updatedBy = req.user?.email || "roobankr5@gmail.com";
      entity.updatedAt = new Date();

      const updatedEntity = await entity.save();
      const populatedEntity = await model.findById(updatedEntity._id);

      return res.status(200).json({
        message: [{ key: "success", value: `${type} updated successfully` }],
        data: populatedEntity,
      });
    }

    // For actions that already returned a response, return success
    return res.status(200).json({
      message: [{ key: "success", value: "Operation completed successfully" }],
      data: entity,
    });

  } catch (err) {
    console.error("Update error:", err);
    res.status(500).json({ message: [{ key: "error", value: "Internal server error" }] });
  }
};

// Separate endpoint for updating only file settings
exports.updateFileSettings = async (req, res) => {
  try {
    const { type, id } = req.params;
    const { 
      tabType, 
      subcategory, 
      updateFileId, 
      showToStudents, 
      allowDownload,
      folderPath = '' 
    } = req.body;

    if (!modelMap[type]) {
      return res.status(400).json({ message: [{ key: "error", value: "Invalid entity type" }] });
    }

    const { model } = modelMap[type];
    const entity = await model.findById(id);
    if (!entity) {
      return res.status(404).json({ message: [{ key: "error", value: `${type} not found` }] });
    }

    // Initialize pedagogy if not exists
    if (!entity.pedagogy) {
      entity.pedagogy = { I_Do: new Map(), We_Do: new Map(), You_Do: new Map() };
    }

    const section = tabType;
    const name = subcategory;

    if (!entity.pedagogy[section]) entity.pedagogy[section] = new Map();
    
    if (!entity.pedagogy[section].get(name)) {
      entity.pedagogy[section].set(name, { 
        description: "", 
        files: [], 
        folders: []
      });
    }

    const pedagogyElement = entity.pedagogy[section].get(name);

    // Find the file
    const pathParts = folderPath ? folderPath.split("/").filter(p => p) : [];
    let targetFolder = pedagogyElement;

    if (pathParts.length > 0) {
      let currentFolders = pedagogyElement.folders || [];
      for (const folderName of pathParts) {
        if (!Array.isArray(currentFolders)) {
          currentFolders = [];
        }
        
        const foundFolder = currentFolders.find(f => f.name === folderName);
        if (!foundFolder) {
          return res.status(404).json({ 
            message: [{ key: "error", value: `Folder '${folderName}' not found` }] 
          });
        }
        
        targetFolder = foundFolder;
        currentFolders = foundFolder.subfolders || [];
      }
    }

    if (!Array.isArray(targetFolder.files)) {
      targetFolder.files = [];
    }

    const fileIndex = targetFolder.files.findIndex(f => f._id.toString() === updateFileId);
    if (fileIndex === -1) {
      // Also search in root files
      const rootFileIndex = pedagogyElement.files.findIndex(f => f._id.toString() === updateFileId);
      if (rootFileIndex === -1) {
        return res.status(404).json({ 
          message: [{ key: "error", value: "File not found" }] 
        });
      }
      
      // Update root file settings
      if (!pedagogyElement.files[rootFileIndex].fileSettings) {
        pedagogyElement.files[rootFileIndex].fileSettings = {};
      }
      
      pedagogyElement.files[rootFileIndex].fileSettings = {
        showToStudents: showToStudents !== undefined ? showToStudents : (pedagogyElement.files[rootFileIndex].fileSettings?.showToStudents),
        allowDownload: allowDownload !== undefined ? allowDownload : (pedagogyElement.files[rootFileIndex].fileSettings?.allowDownload),
        lastModified: new Date()
      };
    } else {
      // Update folder file settings
      if (!targetFolder.files[fileIndex].fileSettings) {
        targetFolder.files[fileIndex].fileSettings = {};
      }
      
      targetFolder.files[fileIndex].fileSettings = {
        showToStudents: showToStudents !== undefined ? showToStudents : (targetFolder.files[fileIndex].fileSettings?.showToStudents ?? true),
        allowDownload: allowDownload !== undefined ? allowDownload : (targetFolder.files[fileIndex].fileSettings?.allowDownload ?? true),
        lastModified: new Date()
      };
    }

    entity.markModified(`pedagogy.${section}.${name}`);
    entity.updatedBy = req.user?.email || "roobankr5@gmail.com";
    entity.updatedAt = new Date();

    const updatedEntity = await entity.save();

    return res.status(200).json({
      message: [{ key: "success", value: "File settings updated successfully" }],
      data: updatedEntity,
    });
  } catch (err) {
    console.error("Update file settings error:", err);
    res.status(500).json({ message: [{ key: "error", value: "Internal server error" }] });
  }
};



