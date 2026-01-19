const PedagogyView = require('../../../models/Courses/moduleStructure/pedagogyViewModal');
const mongoose = require('mongoose');
const Module1 = mongoose.model('Module1');
const SubModule1 = mongoose.model('SubModule1');
const Topic1 = mongoose.model('Topic1');
const SubTopic1 = mongoose.model('SubTopic1');
const CourseStructure = mongoose.model('Course-Structure');
const LevelView = require('../../../models/Courses/moduleStructure/levelModel');
const User = require("../../../models/UserModel");


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
    const { courseId } = req.params;

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

    // Get complete course progress for all participants
    const participantsWithFullData = await Promise.all(
      course.singleParticipants.map(async (participant) => {
        if (!participant.user) {
          return {
            ...participant,
            user_Data: null
          };
        }

        // Get the complete course progress data for this specific course
        const user = await User.findById(participant.user._id)
          .select('courses')
          .lean();

        // Find the full course progress for this specific course
        const fullCourseProgress = user?.courses?.find(
          course => course.courseId && course.courseId.toString() === courseId
        );

        // Merge the basic user data with complete course progress
        const userData = {
          ...participant.user,
          courses: fullCourseProgress ? [fullCourseProgress] : []
        };

        // Clean up the data
        const cleanUserData = JSON.parse(JSON.stringify(userData, (key, value) => {
          // Remove unwanted fields
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
          user_Data: cleanUserData
        };
      })
    );

    // Fetch course structure components
    const [modules, subModules, topics, subTopics] = await Promise.all([
      Module1.find({ courses: courseId }).select('-__v -createdAt -updatedAt').lean(),
      SubModule1.find({ moduleId: { $in: await Module1.find({ courses: courseId }).distinct('_id') } })
        .select('-__v -createdAt -updatedAt').lean(),
      Topic1.find({
        $or: [
          { moduleId: { $in: await Module1.find({ courses: courseId }).distinct('_id') } },
          { subModuleId: { $in: await SubModule1.find().distinct('_id') } }
        ]
      }).select('-__v -createdAt -updatedAt').lean(),
      SubTopic1.find({ 
        topicId: { $in: await Topic1.find().distinct('_id') } 
      }).select('-__v -createdAt -updatedAt').lean()
    ]);

    // Structure modules with their relationships
    const structuredModules = modules.map(module => {
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
    });

    // Construct final response
    const responseData = {
      _id: course._id,
      courseName: course.courseName,
      courseCode: course.courseCode,
      description: course.description,
      singleParticipants: participantsWithFullData,
      modules: structuredModules,
      meta: {
        participantsCount: participantsWithFullData.length,
        modulesCount: modules.length,
        subModulesCount: subModules.length,
        topicsCount: topics.length,
        subTopicsCount: subTopics.length
      }
    };

    res.status(200).json({
      success: true,
      data: responseData,
      message: "Course data with complete user progress fetched successfully"
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
      
      const fileResult = findFileById(pedagogyElement, updateFileId);
      
      if (!fileResult) {
        return res.status(404).json({ 
          message: [{ key: "error", value: "File not found" }] 
        });
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
      
      // Get file settings from request
      const showToStudentsValue = req.body.showToStudents === 'true' || req.body.showToStudents === true;
      const allowDownloadValue = req.body.allowDownload === 'true' || req.body.allowDownload === true;
      
      console.log('📋 File settings from request:', {
        showToStudents: showToStudentsValue,
        allowDownload: allowDownloadValue,
        hasSettings: !!req.body.showToStudents
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






exports.addExercise = async (req, res) => {
  try {
    const { type, id } = req.params;
    const { 
      tabType,
      subcategory,
      exerciseInformation,
      programmingSettings,
      compilerSettings,
      availabilityPeriod,
      questionBehavior,
      evaluationSettings,
      groupSettings,
      scoreSettings,
      securitySettings // ← ADD THIS LINE
    } = req.body;

    // Validate entity type
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

    const exerciseInfo = parseIfNeeded(exerciseInformation);
    const progSettings = programmingSettings ? parseIfNeeded(programmingSettings) : {};
    const compSettings = compilerSettings ? parseIfNeeded(compilerSettings) : {};
    const availPeriod = availabilityPeriod ? parseIfNeeded(availabilityPeriod) : {};
    const qBehavior = questionBehavior ? parseIfNeeded(questionBehavior) : {};
    const evalSettings = evaluationSettings ? parseIfNeeded(evaluationSettings) : {};
    const grpSettings = groupSettings ? parseIfNeeded(groupSettings) : {};
    const scrSettings = scoreSettings ? parseIfNeeded(scoreSettings) : {
      scoreType: 'evenMarks',
      evenMarks: 0,
      separateMarks: {
        general: [],
        levelBased: {
          easy: [],
          medium: [],
          hard: []
        }
      },
      levelBasedMarks: {
        easy: 0,
        medium: 0,
        hard: 0
      },
      totalMarks: 0
    };
    
    // ADD THIS SECTION for securitySettings parsing
    const secSettings = securitySettings ? parseIfNeeded(securitySettings) : {
      timerEnabled: false,
      timerType: 'exercise',
      timerDuration: 60,
      cameraMicEnabled: false,
      restrictMinimize: false,
      fullScreenMode: false,
      tabSwitchAllowed: true,
      maxTabSwitches: 3,
      disableClipboard: false,
    
    };

    // Validate required fields
    if (!exerciseInfo || !exerciseInfo.exerciseName) {
      return res.status(400).json({ 
        message: [{ key: "error", value: "Exercise information with exerciseName is required" }] 
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

    // Process level configuration
    let levelConfig = progSettings?.levelConfiguration || {
      levelType: 'levelBased',
      levelBased: { easy: 0, medium: 0, hard: 0 },
      general: 0
    };

    // Calculate total questions based on level configuration
    let totalQuestions = 0;
    if (levelConfig.levelType === 'levelBased') {
      totalQuestions = (levelConfig.levelBased?.easy || 0) + 
                       (levelConfig.levelBased?.medium || 0) + 
                       (levelConfig.levelBased?.hard || 0);
    } else {
      totalQuestions = levelConfig.general || 0;
    }

    // Calculate total marks based on configuration
    const calculateTotalMarks = (scoreConfig, levelConfig) => {
      const { scoreType, evenMarks, separateMarks, levelBasedMarks } = scoreConfig;
      
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

    // Update the score settings with calculated total marks
    scrSettings.totalMarks = calculateTotalMarks(scrSettings, levelConfig);

    // Create new exercise object
    const newExercise = {
      _id: new mongoose.Types.ObjectId(),
      exerciseInformation: {
        exerciseId: exerciseId,
        exerciseName: exerciseInfo.exerciseName || "",
        description: exerciseInfo.description || "",
        exerciseLevel: exerciseInfo.exerciseLevel || 'beginner',
        totalQuestions: totalQuestions,
        totalPoints: scrSettings.totalMarks || 0
      },
      programmingSettings: {
        selectedModule: progSettings?.selectedModule || 'Core Programming',
        selectedLanguages: progSettings?.selectedLanguages || [],
        levelConfiguration: {
          levelType: levelConfig.levelType,
          levelBased: {
            easy: levelConfig.levelBased?.easy || 0,
            medium: levelConfig.levelBased?.medium || 0,
            hard: levelConfig.levelBased?.hard || 0
          },
          general: levelConfig.general || 0
        }
      },
      compilerSettings: {
        allowCopyPaste: compSettings?.allowCopyPaste ?? true,
        autoSuggestion: compSettings?.autoSuggestion ?? true,
        autoCloseBrackets: compSettings?.autoCloseBrackets ?? true,
        theme: compSettings?.theme || 'light',
        fontSize: compSettings?.fontSize || 14,
        tabSize: compSettings?.tabSize || 2
      },
      availabilityPeriod: {
        startDate: availPeriod?.startDate ? new Date(availPeriod.startDate) : null,
        endDate: availPeriod?.endDate ? new Date(availPeriod.endDate) : null,
        gracePeriodAllowed: availPeriod?.gracePeriodAllowed ?? false,
        gracePeriodDate: availPeriod?.gracePeriodDate ? new Date(availPeriod.gracePeriodDate) : null,
        extendedDays: availPeriod?.extendedDays || 0
      },
      questionBehavior: {
        shuffleQuestions: qBehavior?.shuffleQuestions ?? false,
        allowNext: qBehavior?.allowNext ?? true,
        allowSkip: qBehavior?.allowSkip ?? false,
        attemptLimitEnabled: qBehavior?.attemptLimitEnabled ?? false,
        maxAttempts: qBehavior?.maxAttempts ?? 3,
        showPoints: qBehavior?.showPoints ?? true,
        showDifficulty: qBehavior?.showDifficulty ?? true,
        allowHintUsage: qBehavior?.allowHintUsage ?? true,
        allowTestRun: qBehavior?.allowTestRun ?? true
      },
      evaluationSettings: {
        practiceMode: evalSettings?.practiceMode ?? true,
        manualEvaluation: {
          enabled: evalSettings?.manualEvaluation?.enabled ?? false,
          submissionNeeded: evalSettings?.manualEvaluation?.submissionNeeded ?? false
        },
        aiEvaluation: evalSettings?.aiEvaluation ?? false,
        automationEvaluation: evalSettings?.automationEvaluation ?? false,
        passingScore: evalSettings?.passingScore || 70,
        showResultsImmediately: evalSettings?.showResultsImmediately ?? false,
        allowReview: evalSettings?.allowReview ?? true
      },
      groupSettings: {
        groupSettingsEnabled: grpSettings?.groupSettingsEnabled ?? false,
        showExistingUsers: grpSettings?.showExistingUsers ?? true,
        selectedGroups: grpSettings?.selectedGroups || [],
        chatEnabled: grpSettings?.chatEnabled ?? false,
        collaborationEnabled: grpSettings?.collaborationEnabled ?? false
      },
      scoreSettings: scrSettings,
      
      // ADD THIS SECTION for securitySettings
      securitySettings: {
        timerEnabled: secSettings?.timerEnabled ?? false,
        timerType: secSettings?.timerType || 'exercise',
        timerDuration: secSettings?.timerDuration || 60,
        cameraMicEnabled: secSettings?.cameraMicEnabled ?? false,
        restrictMinimize: secSettings?.restrictMinimize ?? false,
        fullScreenMode: secSettings?.fullScreenMode ?? false,
        tabSwitchAllowed: secSettings?.tabSwitchAllowed ?? true,
        maxTabSwitches: secSettings?.maxTabSwitches || 3,
        disableClipboard: secSettings?.disableClipboard ?? false,
      
      },

      createdAt: new Date(),
      createdBy: req.user?.email || "roobankr5@gmail.com",
      version: 1
    };

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
    
    return res.status(201).json({
      message: [{ key: "success", value: `Exercise added successfully to ${subcategory}` }],
      data: {
        exercise: newExercise,
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

// Get Exercises by Subcategory
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

// Update Exercise
exports.updateExercise = async (req, res) => {
  try {
    const { type, id, exerciseId } = req.params;
    const { 
      tabType,
      subcategory,
      exerciseInformation,
      programmingSettings,
      compilerSettings,
      availabilityPeriod,
      questionBehavior,
      evaluationSettings,
      groupSettings,
      scoreSettings,
      securitySettings // ← ADDED THIS LINE
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

    const exerciseInfo = exerciseInformation ? parseIfNeeded(exerciseInformation) : null;
    const progSettings = programmingSettings ? parseIfNeeded(programmingSettings) : null;
    const compSettings = compilerSettings ? parseIfNeeded(compilerSettings) : null;
    const availPeriod = availabilityPeriod ? parseIfNeeded(availabilityPeriod) : null;
    const qBehavior = questionBehavior ? parseIfNeeded(questionBehavior) : null;
    const evalSettings = evaluationSettings ? parseIfNeeded(evaluationSettings) : null;
    const grpSettings = groupSettings ? parseIfNeeded(groupSettings) : null;
    const scrSettings = scoreSettings ? parseIfNeeded(scoreSettings) : null;
    const secSettings = securitySettings ? parseIfNeeded(securitySettings) : null; // ← ADDED THIS LINE

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

    // Get existing level config as plain object
    let levelConfig = existingExercise.programmingSettings?.levelConfiguration 
      ? convertToPlainObject(existingExercise.programmingSettings.levelConfiguration) 
      : {
          levelType: 'levelBased',
          levelBased: { easy: 0, medium: 0, hard: 0 },
          general: 0
        };

    // Ensure levelBased exists with proper structure
    if (!levelConfig.levelBased) {
      levelConfig.levelBased = { easy: 0, medium: 0, hard: 0 };
    }

    // Handle level configuration updates if programmingSettings is provided
    if (progSettings?.levelConfiguration) {
      const newLevelConfig = progSettings.levelConfiguration;
      
      // Create a clean levelConfig object
      levelConfig = {
        levelType: newLevelConfig.levelType || levelConfig.levelType,
        general: newLevelConfig.general !== undefined ? newLevelConfig.general : levelConfig.general,
        levelBased: {
          easy: newLevelConfig.levelBased?.easy !== undefined ? newLevelConfig.levelBased.easy : (levelConfig.levelBased?.easy || 0),
          medium: newLevelConfig.levelBased?.medium !== undefined ? newLevelConfig.levelBased.medium : (levelConfig.levelBased?.medium || 0),
          hard: newLevelConfig.levelBased?.hard !== undefined ? newLevelConfig.levelBased.hard : (levelConfig.levelBased?.hard || 0)
        }
      };
    }

    // Calculate total questions based on level configuration with safe access
    let totalQuestions = 0;
    if (levelConfig.levelType === 'levelBased') {
      const easy = levelConfig.levelBased?.easy || 0;
      const medium = levelConfig.levelBased?.medium || 0;
      const hard = levelConfig.levelBased?.hard || 0;
      totalQuestions = easy + medium + hard;
    } else {
      totalQuestions = levelConfig.general || 0;
    }

    // First, convert existing exercise to plain object to avoid Mongoose internal properties
    const plainExistingExercise = convertToPlainObject(existingExercise);

    // Calculate total marks if score settings are being updated
    const calculateTotalMarks = (scoreConfig, levelConfig) => {
      const { scoreType, evenMarks, separateMarks, levelBasedMarks } = scoreConfig;
      
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

    // Get existing or default security settings
    const existingSecuritySettings = plainExistingExercise.securitySettings || {
      timerEnabled: false,
      timerType: 'exercise',
      timerDuration: 60,
      cameraMicEnabled: false,
      restrictMinimize: false,
      fullScreenMode: false,
      tabSwitchAllowed: true,
      maxTabSwitches: 3,
      disableClipboard: false
    };

    // Calculate total marks for score settings
    let totalMarks = 0;
    if (scrSettings) {
      // Merge existing and new score settings
      const mergedScoreSettings = {
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
      
      totalMarks = calculateTotalMarks(mergedScoreSettings, levelConfig);
      mergedScoreSettings.totalMarks = totalMarks;
    }

    const updateData = {
      ...plainExistingExercise,
      exerciseInformation: {
        ...plainExistingExercise.exerciseInformation,
        ...(exerciseInfo && {
          exerciseId: exerciseInfo.exerciseId || plainExistingExercise.exerciseInformation?.exerciseId,
          exerciseName: exerciseInfo.exerciseName || plainExistingExercise.exerciseInformation?.exerciseName,
          description: exerciseInfo.description !== undefined ? exerciseInfo.description : plainExistingExercise.exerciseInformation?.description,
          exerciseLevel: exerciseInfo.exerciseLevel || plainExistingExercise.exerciseInformation?.exerciseLevel,
          totalQuestions: totalQuestions,
          totalPoints: totalMarks || plainExistingExercise.exerciseInformation?.totalPoints || 0
        })
      },
      programmingSettings: {
        // Convert existing programming settings to plain object
        selectedModule: plainExistingExercise.programmingSettings?.selectedModule || 'Core Programming',
        selectedLanguages: plainExistingExercise.programmingSettings?.selectedLanguages || [],
        levelConfiguration: plainExistingExercise.programmingSettings?.levelConfiguration || {
          levelType: 'levelBased',
          levelBased: { easy: 0, medium: 0, hard: 0 },
          general: 0
        },
        // Apply updates from request
        ...(progSettings && {
          selectedModule: progSettings.selectedModule || plainExistingExercise.programmingSettings?.selectedModule || 'Core Programming',
          selectedLanguages: progSettings.selectedLanguages || plainExistingExercise.programmingSettings?.selectedLanguages || [],
          // Use the clean levelConfig object
          levelConfiguration: levelConfig
        })
      },
      compilerSettings: {
        ...plainExistingExercise.compilerSettings,
        ...(compSettings && {
          allowCopyPaste: compSettings.allowCopyPaste !== undefined ? compSettings.allowCopyPaste : plainExistingExercise.compilerSettings?.allowCopyPaste,
          autoSuggestion: compSettings.autoSuggestion !== undefined ? compSettings.autoSuggestion : plainExistingExercise.compilerSettings?.autoSuggestion,
          autoCloseBrackets: compSettings.autoCloseBrackets !== undefined ? compSettings.autoCloseBrackets : plainExistingExercise.compilerSettings?.autoCloseBrackets,
          theme: compSettings.theme !== undefined ? compSettings.theme : plainExistingExercise.compilerSettings?.theme,
          fontSize: compSettings.fontSize !== undefined ? compSettings.fontSize : plainExistingExercise.compilerSettings?.fontSize,
          tabSize: compSettings.tabSize !== undefined ? compSettings.tabSize : plainExistingExercise.compilerSettings?.tabSize
        })
      },
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
      questionBehavior: {
        ...plainExistingExercise.questionBehavior,
        ...(qBehavior && {
          shuffleQuestions: qBehavior.shuffleQuestions !== undefined ? qBehavior.shuffleQuestions : plainExistingExercise.questionBehavior?.shuffleQuestions,
          allowNext: qBehavior.allowNext !== undefined ? qBehavior.allowNext : plainExistingExercise.questionBehavior?.allowNext,
          allowSkip: qBehavior.allowSkip !== undefined ? qBehavior.allowSkip : plainExistingExercise.questionBehavior?.allowSkip,
          attemptLimitEnabled: qBehavior.attemptLimitEnabled !== undefined ? qBehavior.attemptLimitEnabled : plainExistingExercise.questionBehavior?.attemptLimitEnabled,
          maxAttempts: qBehavior.maxAttempts !== undefined ? qBehavior.maxAttempts : plainExistingExercise.questionBehavior?.maxAttempts,
          showPoints: qBehavior.showPoints !== undefined ? qBehavior.showPoints : plainExistingExercise.questionBehavior?.showPoints,
          showDifficulty: qBehavior.showDifficulty !== undefined ? qBehavior.showDifficulty : plainExistingExercise.questionBehavior?.showDifficulty,
          allowHintUsage: qBehavior.allowHintUsage !== undefined ? qBehavior.allowHintUsage : plainExistingExercise.questionBehavior?.allowHintUsage,
          allowTestRun: qBehavior.allowTestRun !== undefined ? qBehavior.allowTestRun : plainExistingExercise.questionBehavior?.allowTestRun
        })
      },
      evaluationSettings: {
        ...plainExistingExercise.evaluationSettings,
        ...(evalSettings && {
          practiceMode: evalSettings.practiceMode !== undefined ? evalSettings.practiceMode : plainExistingExercise.evaluationSettings?.practiceMode,
          manualEvaluation: {
            ...plainExistingExercise.evaluationSettings?.manualEvaluation,
            ...(evalSettings.manualEvaluation && {
              enabled: evalSettings.manualEvaluation.enabled !== undefined ? evalSettings.manualEvaluation.enabled : plainExistingExercise.evaluationSettings?.manualEvaluation?.enabled,
              submissionNeeded: evalSettings.manualEvaluation.submissionNeeded !== undefined ? evalSettings.manualEvaluation.submissionNeeded : plainExistingExercise.evaluationSettings?.manualEvaluation?.submissionNeeded
            })
          },
          aiEvaluation: evalSettings.aiEvaluation !== undefined ? evalSettings.aiEvaluation : plainExistingExercise.evaluationSettings?.aiEvaluation,
          automationEvaluation: evalSettings.automationEvaluation !== undefined ? evalSettings.automationEvaluation : plainExistingExercise.evaluationSettings?.automationEvaluation,
          passingScore: evalSettings.passingScore !== undefined ? evalSettings.passingScore : plainExistingExercise.evaluationSettings?.passingScore,
          showResultsImmediately: evalSettings.showResultsImmediately !== undefined ? evalSettings.showResultsImmediately : plainExistingExercise.evaluationSettings?.showResultsImmediately,
          allowReview: evalSettings.allowReview !== undefined ? evalSettings.allowReview : plainExistingExercise.evaluationSettings?.allowReview
        })
      },
      groupSettings: {
        ...plainExistingExercise.groupSettings,
        ...(grpSettings && {
          groupSettingsEnabled: grpSettings.groupSettingsEnabled !== undefined ? grpSettings.groupSettingsEnabled : plainExistingExercise.groupSettings?.groupSettingsEnabled,
          showExistingUsers: grpSettings.showExistingUsers !== undefined ? grpSettings.showExistingUsers : plainExistingExercise.groupSettings?.showExistingUsers,
          selectedGroups: grpSettings.selectedGroups || plainExistingExercise.groupSettings?.selectedGroups || [],
          chatEnabled: grpSettings.chatEnabled !== undefined ? grpSettings.chatEnabled : plainExistingExercise.groupSettings?.chatEnabled,
          collaborationEnabled: grpSettings.collaborationEnabled !== undefined ? grpSettings.collaborationEnabled : plainExistingExercise.groupSettings?.collaborationEnabled
        })
      },
      scoreSettings: {
        ...(plainExistingExercise.scoreSettings || {
          scoreType: 'evenMarks',
          evenMarks: 10,
          separateMarks: {
            general: [],
            levelBased: {
              easy: [],
              medium: [],
              hard: []
            }
          },
          levelBasedMarks: {
            easy: 10,
            medium: 15,
            hard: 20
          },
          totalMarks: 0
        }),
        ...(scrSettings && {
          scoreType: scrSettings.scoreType !== undefined ? scrSettings.scoreType : (plainExistingExercise.scoreSettings?.scoreType || 'evenMarks'),
          evenMarks: scrSettings.evenMarks !== undefined ? scrSettings.evenMarks : (plainExistingExercise.scoreSettings?.evenMarks || 10),
          separateMarks: scrSettings.separateMarks || (plainExistingExercise.scoreSettings?.separateMarks || {
            general: [],
            levelBased: { easy: [], medium: [], hard: [] }
          }),
          levelBasedMarks: scrSettings.levelBasedMarks || (plainExistingExercise.scoreSettings?.levelBasedMarks || {
            easy: 10,
            medium: 15,
            hard: 20
          }),
          totalMarks: scrSettings.totalMarks !== undefined ? scrSettings.totalMarks : (plainExistingExercise.scoreSettings?.totalMarks || 0)
        })
      },
      // ADD THIS SECTION for securitySettings
      securitySettings: {
        timerEnabled: secSettings?.timerEnabled !== undefined ? secSettings.timerEnabled : existingSecuritySettings.timerEnabled,
        timerType: secSettings?.timerType || existingSecuritySettings.timerType,
        timerDuration: secSettings?.timerDuration !== undefined ? secSettings.timerDuration : existingSecuritySettings.timerDuration,
        cameraMicEnabled: secSettings?.cameraMicEnabled !== undefined ? secSettings.cameraMicEnabled : existingSecuritySettings.cameraMicEnabled,
        restrictMinimize: secSettings?.restrictMinimize !== undefined ? secSettings.restrictMinimize : existingSecuritySettings.restrictMinimize,
        fullScreenMode: secSettings?.fullScreenMode !== undefined ? secSettings.fullScreenMode : existingSecuritySettings.fullScreenMode,
        tabSwitchAllowed: secSettings?.tabSwitchAllowed !== undefined ? secSettings.tabSwitchAllowed : existingSecuritySettings.tabSwitchAllowed,
        maxTabSwitches: secSettings?.maxTabSwitches !== undefined ? secSettings.maxTabSwitches : existingSecuritySettings.maxTabSwitches,
        disableClipboard: secSettings?.disableClipboard !== undefined ? secSettings.disableClipboard : existingSecuritySettings.disableClipboard,
      
      },
      updatedAt: new Date(),
      updatedBy: req.user?.email || "roobankr5@gmail.com"
    };

    // If score settings were updated, recalculate total marks
    if (scrSettings) {
      updateData.scoreSettings.totalMarks = totalMarks;
      updateData.exerciseInformation.totalPoints = totalMarks;
    }

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
        levelConfiguration: cleanUpdateData.programmingSettings.levelConfiguration,
        scoreSettings: cleanUpdateData.scoreSettings,
        securitySettings: cleanUpdateData.securitySettings, // ← ADD THIS LINE
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
      category = 'We_Do',
      subcategory,
      status,
      isLocked,
      reason
    } = req.body;
 
    console.log(`🔒 LOCK REQ: User: ${userId} | Ex: ${exerciseId} | Locked: ${isLocked}`);
 
    if (!courseId || !exerciseId || !subcategory) {
      return res.status(400).json({ message: [{ key: "error", value: "Missing required fields" }] });
    }
 
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: [{ key: "error", value: "User not found" }] });
 
    // 1. Find Course Index (Important for markModified)
    const courseIndex = user.courses.findIndex(c => c.courseId && c.courseId.toString() === courseId);
   
    if (courseIndex === -1) {
      return res.status(404).json({ message: [{ key: "error", value: "Course not enrolled" }] });
    }
 
    const userCourse = user.courses[courseIndex];
 
    // 2. Ensure Path Exists
    if (!userCourse.answers) userCourse.answers = { I_Do: new Map(), We_Do: new Map(), You_Do: new Map() };
   
    const categoryKey = category || 'We_Do';
    if (!userCourse.answers[categoryKey]) userCourse.answers[categoryKey] = new Map();
   
    const categoryMap = userCourse.answers[categoryKey];
   
    // 3. Get Exercises Array (Clone it to ensure Mongoose detects change on set)
    let exercisesArray = categoryMap.get(subcategory) || [];
    // If it's a Mongoose Array, convert to JS array to edit, then reset
    if (exercisesArray.toObject) exercisesArray = exercisesArray.toObject();
 
    // 4. Update or Push
    const exerciseIndex = exercisesArray.findIndex(ex => ex.exerciseId && ex.exerciseId.toString() === exerciseId);
 
    if (exerciseIndex > -1) {
      // Update Existing
      if (status) exercisesArray[exerciseIndex].status = status;
      if (isLocked !== undefined) exercisesArray[exerciseIndex].isLocked = isLocked;
      // If terminated and no specific lock status sent, force lock
      else if (status === 'terminated') exercisesArray[exerciseIndex].isLocked = true;
     
      console.log("✅ Updated Existing Entry:", exercisesArray[exerciseIndex]);
    } else {
      // Create New
      const newEntry = {
        exerciseId: new mongoose.Types.ObjectId(exerciseId),
        status: status || 'in-progress',
        isLocked: isLocked !== undefined ? isLocked : (status === 'terminated'),
        questions: []
      };
      exercisesArray.push(newEntry);
      console.log("✅ Created New Entry:", newEntry);
    }
 
    // 5. CRITICAL: Save and Mark Modified explicitly
    categoryMap.set(subcategory, exercisesArray);
   
    // Mark the SPECIFIC path modified.
    // Mongoose Maps need this to know data changed inside the Map.
    user.markModified(`courses.${courseIndex}.answers.${categoryKey}`);
   
    await user.save();
 
    return res.status(200).json({
      message: [{ key: "success", value: "Exercise status updated successfully" }]
    });
 
  } catch (error) {
    console.error("Lock Exercise Error:", error);
    return res.status(500).json({ message: [{ key: "error", value: "Internal server error" }] });
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
          status: exercise.status || 'in-progress'
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
      tabType ,
      subcategory,
      title,
      description,
      difficulty = 'medium',
      score = 10, // ✅ Change to 'score'
      sampleInput = '',
      sampleOutput = '',
      constraints = [],
      hints = [],
      testCases = [],
      solutions = {},
      timeLimit = 2000,
      memoryLimit = 256,
      isActive = true,
      sequence = 0
    } = req.body;

    if (!type || !modelMap[type]) {
      return res.status(400).json({
        message: [{ key: "error", value: `Invalid entity type: ${type}. Valid types: modules, submodules, topics, subtopics` }]
      });
    }

    // Validate required fields
    if (!title || !title.trim()) {
      return res.status(400).json({
        message: [{ key: "error", value: "Question title is required" }]
      });
    }

    if (!description || !description.trim()) {
      return res.status(400).json({
        message: [{ key: "error", value: "Question description is required" }]
      });
    }

    if (!subcategory) {
      return res.status(400).json({
        message: [{ key: "error", value: "Subcategory is required (e.g., 'Practical', 'Project Development')" }]
      });
    }

    // Validate difficulty
    const validDifficulties = ['easy', 'medium', 'hard'];
    if (!validDifficulties.includes(difficulty)) {
      return res.status(400).json({
        message: [{ key: "error", value: `Invalid difficulty. Valid values: ${validDifficulties.join(', ')}` }]
      });
    }

    // Validate points
    // Validate score
    // if (typeof score !== 'number' || score < 1) { // CHANGE: points -> score
    //   return res.status(400).json({ 
    //     message: [{ key: "error", value: "Score must be a number between 1 and 100" }] // CHANGE: Points -> Score
    //   });
    // }

    // Validate test cases structure
    if (testCases.length > 0) {
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

    // Generate question ID
    const questionId = new mongoose.Types.ObjectId();

    // Create question object
    // Create question object
    const newQuestion = {
      _id: questionId,
      title: title.trim(),
      description: description.trim(),
      difficulty,
      score, // CHANGE: points -> score
      sampleInput: sampleInput || '',
      sampleOutput: sampleOutput || '',
      constraints: Array.isArray(constraints) ? constraints.filter(c => c && c.trim()) : [],
      hints: Array.isArray(hints) ? hints.map((hint, index) => ({
        _id: new mongoose.Types.ObjectId(),
        hintText: hint.hintText || hint,
        pointsDeduction: hint.pointsDeduction || 0,
        isPublic: hint.isPublic !== undefined ? hint.isPublic : true,
        sequence: hint.sequence || index
      })) : [],
      testCases: Array.isArray(testCases) ? testCases.map((testCase, index) => ({
        _id: new mongoose.Types.ObjectId(),
        input: testCase.input,
        expectedOutput: testCase.expectedOutput,
        isSample: testCase.isSample !== undefined ? testCase.isSample : false,
        isHidden: testCase.isHidden !== undefined ? testCase.isHidden : true,
        points: testCase.points || 1, // Keep points for test cases if needed
        explanation: testCase.explanation || `Test case ${index + 1}`,
        sequence: testCase.sequence || index
      })) : [],
      solutions: solutions && typeof solutions === 'object' ? {
        startedCode: solutions.startedCode || '',
        functionName: solutions.functionName || '',
        language: solutions.language || ''
      } : {
        startedCode: '',
        functionName: '',
        language: ''
      },
      timeLimit,
      memoryLimit,
      isActive,
      sequence: sequence === 0 ? (foundExercise.questions?.length || 0) : sequence,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    if (!foundExercise.questions) {
      foundExercise.questions = [];
    }

    // Add question to exercise
    foundExercise.questions.push(newQuestion);

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
    const responseData = {
      question: newQuestion,
      exercise: {
        exerciseId: foundExercise.exerciseInformation?.exerciseId || foundExercise._id.toString(),
        exerciseName: foundExercise.exerciseInformation?.exerciseName || "Exercise",
        exerciseLevel: foundExercise.exerciseInformation?.exerciseLevel || "medium",
        totalQuestions: foundExercise.questions.length,
        totalScore: foundExercise.questions.reduce((sum, q) => sum + q.score, 0) // CHANGE: points -> score
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
        questionId: questionId.toString(),
        questionIndex: foundExercise.questions.length - 1
      }
    };

    return res.status(201).json({
      message: [{
        key: "success",
        value: `Question "${title}" added successfully to "${foundExercise.exerciseInformation?.exerciseName}" in ${subcategory}`
      }],
      data: responseData
    });

  } catch (err) {
    console.error("❌ Add question error:", err);
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




