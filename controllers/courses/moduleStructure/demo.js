const PedagogyView = require('../../../models/Courses/moduleStructure/pedagogyViewModal');
const mongoose = require('mongoose');
const Module1 = mongoose.model('Module1');
const SubModule1 = mongoose.model('SubModule1');
const Topic1 = mongoose.model('Topic1');
const SubTopic1 = mongoose.model('SubTopic1');
const CourseStructure = mongoose.model('Course-Structure');
const LevelView = require('../../../models/Courses/moduleStructure/levelModel');


const { createClient } = require("@supabase/supabase-js");
const supabaseKey = process.env.SUPABASE_KEY;
const supabaseUrl = process.env.SUPABASE_URL;
const supabase = createClient(supabaseUrl, supabaseKey);
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

    const course = await CourseStructure.findById(courseId).lean();
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
      _id: new mongoose.Types.ObjectId(), // Generate unique ID
      name: current, 
      files: [], 
      subfolders: [] 
    };
    folders.push(folder);
  }

  // Ensure arrays exist
  if (!Array.isArray(folder.files)) folder.files = [];
  if (!Array.isArray(folder.subfolders)) folder.subfolders = [];

  if (rest.length > 0) {
    return findOrCreateFolder(folder.subfolders, rest);
  }
  
  // Return the target folder for the final path part
  return { folders: folder.subfolders, targetFolder: folder };
};
// 🔎 Utility to find folder by path for navigation
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
// 🔎 Utility to find folder by path for deletion
const findFolderByPath = (folders, pathParts) => {
  // Ensure folders is an array
  if (!Array.isArray(folders)) {
    return null;
  }
  
  if (pathParts.length === 0) return { folders };

  const [current, ...rest] = pathParts;
  const folder = folders.find((f) => f.name === current);

  if (!folder) return null;
  if (rest.length === 0) return { parent: folders, folder, index: folders.indexOf(folder) };

  // Ensure subfolders is an array
  if (!Array.isArray(folder.subfolders)) {
    return null;
  }
  
  return findFolderByPath(folder.subfolders, rest);
};

// 🔎 Utility to find file by ID in nested structure
const findFileById = (pedagogyElement, fileId) => {
  // Ensure files is an array
  const filesArray = Array.isArray(pedagogyElement.files) ? pedagogyElement.files : [];
  
  // Search in root files
  const rootFile = filesArray.find(f => f._id && f._id.toString() === fileId);
  if (rootFile) {
    return { parent: filesArray, file: rootFile, index: filesArray.indexOf(rootFile) };
  }

  // Search recursively in folders
  const searchInFolders = (folders) => {
    // Ensure folders is an array
    if (!Array.isArray(folders)) {
      return null;
    }
    
    for (let folder of folders) {
      // Ensure folder.files is an array
      const folderFiles = Array.isArray(folder.files) ? folder.files : [];
      const fileInFolder = folderFiles.find(f => f._id && f._id.toString() === fileId);
      
      if (fileInFolder) {
        return { parent: folderFiles, file: fileInFolder, index: folderFiles.indexOf(fileInFolder) };
      }
      
      // Search in subfolders
      const result = searchInFolders(folder.subfolders);
      if (result) return result;
    }
    return null;
  };

  // Ensure pedagogyElement.folders is an array
  const foldersArray = Array.isArray(pedagogyElement.folders) ? pedagogyElement.folders : [];
  return searchInFolders(foldersArray);
};

// ✅ Enhanced update handler with file replacement support
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

    // ✅ Initialize pedagogy if not exists
    if (!entity.pedagogy) {
      entity.pedagogy = { I_Do: new Map(), We_Do: new Map(), You_Do: new Map() };
    }

    const section = tabType;
    const name = subcategory;

    if (!entity.pedagogy[section]) entity.pedagogy[section] = new Map();
    
    // ✅ ENSURE pedagogy element has proper structure
    if (!entity.pedagogy[section].get(name)) {
      entity.pedagogy[section].set(name, { 
        description: "", 
        files: [], 
        folders: []  // Ensure folders is initialized as array
      });
    }

    const pedagogyElement = entity.pedagogy[section].get(name);

    // ✅ ENSURE arrays exist in pedagogyElement
    if (!Array.isArray(pedagogyElement.files)) {
      pedagogyElement.files = [];
    }
    if (!Array.isArray(pedagogyElement.folders)) {
      pedagogyElement.folders = [];
    }

// ✅ FOLDER CREATION HANDLING - UPDATED
// ✅ FOLDER CREATION HANDLING - FIXED
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

  let targetFolders = pedagogyElement.folders;
  let parentFolder = null;
  
  // Navigate to the target folder using pathParts
  if (pathParts.length > 0) {
    const result = findOrCreateFolder(pedagogyElement.folders, pathParts);
    targetFolders = result.folders;
    parentFolder = result.targetFolder;
  }

  // ✅ ENSURE targetFolders is an array
  if (!Array.isArray(targetFolders)) {
    targetFolders = [];
    // Update the parent reference
    if (parentFolder) {
      parentFolder.subfolders = targetFolders;
    } else {
      pedagogyElement.folders = targetFolders;
    }
  }

  // Check if folder already exists in the target location
  const existingFolder = targetFolders.find(f => f.name === folderName);
  if (existingFolder) {
    console.log('❌ Folder already exists:', folderName);
    return res.status(400).json({ 
      message: [{ key: "error", value: `Folder '${folderName}' already exists` }] 
    });
  }

  // Create new folder with proper structure
  const newFolder = {
    _id: new mongoose.Types.ObjectId(), // Generate unique ID
    name: folderName,
    files: [],
    subfolders: [],
  };

  console.log('📁 Adding new folder to target:', {
    targetFoldersCount: targetFolders.length,
    newFolderName: folderName,
    parentFolder: parentFolder ? parentFolder.name : 'root'
  });

  targetFolders.push(newFolder);
  
  entity.updatedBy = req.user?.email || "system";
  entity.updatedAt = Date.now();

  const updatedEntity = await entity.save();

  console.log('✅ Folder created successfully in database');

  return res.status(200).json({
    message: [{ key: "success", value: `Folder '${folderName}' created successfully` }],
    data: updatedEntity,
  });
}
    // ✅ FOLDER UPDATE HANDLING
    if (action === 'updateFolder' && folderName) {
      const pathParts = folderPath ? folderPath.split("/").filter(p => p) : [];
      
      // Get the original folder name from the request
      const originalFolderName = req.body.originalFolderName;
      
      if (!originalFolderName) {
        return res.status(400).json({ 
          message: [{ key: "error", value: "Original folder name is required for update" }] 
        });
      }

      // Find the folder by its original name
      const fullPath = [...pathParts, originalFolderName];
      const result = findFolderByPath(pedagogyElement.folders, fullPath);
      
      if (!result || !result.folder) {
        return res.status(404).json({ 
          message: [{ key: "error", value: `Folder '${originalFolderName}' not found` }] 
        });
      }

      // Check if new name already exists (only if name is changing)
      if (folderName !== result.folder.name) {
        const siblingFolders = Array.isArray(result.parent) ? result.parent.filter(f => f.name !== result.folder.name) : [];
        const existingFolder = siblingFolders.find(f => f.name === folderName);
        if (existingFolder) {
          return res.status(400).json({ 
            message: [{ key: "error", value: `Folder '${folderName}' already exists` }] 
          });
        }
      }

      // Update the folder name
      result.folder.name = folderName;
      
      entity.updatedBy = req.user?.email || "system";
      entity.updatedAt = Date.now();

      const updatedEntity = await entity.save();

      return res.status(200).json({
        message: [{ key: "success", value: `Folder '${originalFolderName}' updated to '${folderName}' successfully` }],
        data: updatedEntity,
      });
    }

    // ✅ FOLDER DELETION HANDLING
    if (action === 'deleteFolder' && folderName) {
      const pathParts = folderPath ? folderPath.split("/").filter(p => p) : [];
      const fullPath = [...pathParts, folderName];
      
      const result = findFolderByPath(pedagogyElement.folders, fullPath);
      
      if (!result || !result.parent) {
        return res.status(404).json({ 
          message: [{ key: "error", value: `Folder '${folderName}' not found` }] 
        });
      }

      // ✅ Recursively delete all files from storage
      const deleteFolderFilesRecursively = async (folder, currentPath = []) => {
        // Ensure folder.files is an array
        const filesArray = Array.isArray(folder.files) ? folder.files : [];
        
        // Delete files in current folder
        for (let file of filesArray) {
          try {
            const fileName = file.fileUrl.split('/').pop();
            const storagePath = `courses/${type}s/${section}/${name}/${currentPath.join('/')}/${fileName}`;
            
            const { error: deleteError } = await supabase.storage
              .from("smartlms")
              .remove([storagePath]);

            if (deleteError) {
              console.warn("File deletion from storage failed:", deleteError);
            }
          } catch (storageError) {
            console.warn("Storage deletion error:", storageError);
          }
        }

        // Recursively delete files in subfolders
        const subfoldersArray = Array.isArray(folder.subfolders) ? folder.subfolders : [];
        for (let subfolder of subfoldersArray) {
          await deleteFolderFilesRecursively(subfolder, [...currentPath, subfolder.name]);
        }
      };

      // Delete all files in the folder and subfolders from storage
      await deleteFolderFilesRecursively(result.folder, fullPath);

      // ✅ Delete folder from database
      if (Array.isArray(result.parent)) {
        result.parent.splice(result.index, 1);
      }
      
      entity.updatedBy = req.user?.email || "system";
      entity.updatedAt = Date.now();

      const updatedEntity = await entity.save();

      return res.status(200).json({
        message: [{ key: "success", value: `Folder '${folderName}' and all contents deleted successfully` }],
        data: updatedEntity,
      });
    }

    // ✅ FILE DELETION HANDLING
// ✅ FILE DELETION HANDLING - UPDATED FOR MAP
if (action === 'deleteFile' && updateFileId) {
  const fileResult = findFileById(pedagogyElement, updateFileId);
  
  if (!fileResult) {
    return res.status(404).json({ 
      message: [{ key: "error", value: "File not found" }] 
    });
  }

  // ✅ Delete file from Supabase storage - Handle Map structure
  try {
    let fileUrlValue;
    if (fileResult.file.fileUrl instanceof Map) {
      fileUrlValue = fileResult.file.fileUrl.get('base'); // Get from Map
    } else {
      fileUrlValue = fileResult.file.fileUrl; // Fallback to string
    }
    
    const fileName = fileUrlValue.split('/').pop();
    const storagePath = `courses/${type}s/${section}/${name}/${folderPath || "root"}/${fileName}`;
    
    const { error: deleteError } = await supabase.storage
      .from("smartlms")
      .remove([storagePath]);

    if (deleteError) {
      console.warn("File deletion from storage failed:", deleteError);
    }
  } catch (storageError) {
    console.warn("Storage deletion error:", storageError);
  }

  // ✅ Delete file from database
  if (Array.isArray(fileResult.parent)) {
    fileResult.parent.splice(fileResult.index, 1);
  }
  
  entity.updatedBy = req.user?.email || "system";
  entity.updatedAt = Date.now();

  const updatedEntity = await entity.save();

  return res.status(200).json({
    message: [{ key: "success", value: "File deleted successfully" }],
    data: updatedEntity,
  });
}

// ✅ FIXED FILE UPLOAD FOR NESTED FOLDERS
// ✅ FIXED FILE UPLOAD FOR NESTED FOLDERS
if (req.files && req.files.files) {
  const files = Array.isArray(req.files.files) ? req.files.files : [req.files.files];
  const pathParts = folderPath ? folderPath.split("/").filter(p => p) : [];

  console.log('📁 FILE UPLOAD TO FOLDER:', {
    pathParts,
    folderPath,
    filesCount: files.length
  });

  // Start from the pedagogy element's folders
  let currentFolders = pedagogyElement.folders;
  let targetFolder = pedagogyElement; // Default target is root pedagogy element

  // ✅ CRITICAL FIX: Properly navigate to the target folder in nested structure
  if (pathParts.length > 0) {
    // Navigate through the folder structure to find the target folder
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
        console.log(`❌ Folder '${folderName}' not found in path, creating it`);
        foundFolder = {
          _id: new mongoose.Types.ObjectId(),
          name: folderName,
          files: [],
          subfolders: []
        };
        currentFolders.push(foundFolder);
      }

      // Move deeper into the folder structure
      targetFolder = foundFolder;
      currentFolders = foundFolder.subfolders;
    }
  }

  console.log('🎯 FINAL Target folder for upload:', {
    name: targetFolder.name || 'root',
    path: pathParts.join('/'),
    existingFiles: targetFolder.files ? targetFolder.files.length : 0
  });

  // ✅ ENSURE targetFolder.files is an array
  if (!Array.isArray(targetFolder.files)) {
    targetFolder.files = [];
  }

  // ✅ PREVENT DUPLICATE FILE UPLOADS
  const uploadedFileNames = new Set(targetFolder.files.map(f => f.fileName));
  
  for (let file of files) {
    // Check if file already exists (for non-update case)
    if (!isUpdate && uploadedFileNames.has(file.name)) {
      console.log(`⚠️ File ${file.name} already exists, skipping upload`);
      continue; // Skip duplicate file
    }

    const uniqueFileName = `${Date.now()}_${file.name}`;
    
    // Build storage path with nested folder structure
    const storageFolderPath = pathParts.length > 0 ? pathParts.join('/') : "root";
    const storagePath = `courses/${type}s/${section}/${name}/${storageFolderPath}/${uniqueFileName}`;

    console.log('💾 Saving file to storage path:', storagePath);

    // Upload file to storage
    const { error: uploadError } = await supabase.storage
      .from("smartlms")
      .upload(storagePath, file.data, { contentType: file.mimetype });

    if (uploadError) {
      console.error("File upload error:", uploadError);
      return res.status(500).json({ message: [{ key: "error", value: "File upload failed" }] });
    }

    const fileUrl = `${process.env.SUPABASE_URL}/storage/v1/object/public/smartlms/${storagePath}`;

    // ✅ FIXED: Create fileUrl as Map instead of string
    const fileUrlMap = new Map();
    fileUrlMap.set('base', fileUrl);

    // ✅ FIXED: Create new file object with proper Map structure
    const newFile = {
      _id: new mongoose.Types.ObjectId(),
      fileName: file.name,
      fileType: file.mimetype,
      fileUrl: fileUrlMap, // ✅ Now this is a Map, not a string
      size: file.size.toString(),
      uploadedAt: new Date(),
      isVideo: file.mimetype.startsWith('video/'),
      availableResolutions: file.mimetype.startsWith('video/') ? [] : undefined,
    };

    if (isUpdate && updateFileId) {
      // Update existing file - need to search recursively
      const fileResult = findFileById(pedagogyElement, updateFileId);
      if (fileResult && Array.isArray(fileResult.parent)) {
        // ✅ FIXED: Ensure fileUrl is Map when updating
        fileResult.parent[fileResult.index] = {
          ...fileResult.parent[fileResult.index],
          fileName: file.name,
          fileType: file.mimetype,
          fileUrl: fileUrlMap, // ✅ Use Map here too
          size: file.size.toString(),
          updatedAt: new Date(),
        };
        console.log('✅ File updated in database');
      }
    } else {
      // ✅ CRITICAL: Add new file to the CORRECT target folder
      targetFolder.files.push(newFile);
      console.log('✅ File saved to database in folder:', targetFolder.name || 'root', {
        folderFilesCount: targetFolder.files.length,
        fileName: file.name
      });
    }
  }

  // ✅ Save the entity to persist changes to database
  entity.updatedBy = req.user?.email || "system";
  entity.updatedAt = Date.now();
  
  console.log('💾 Saving entity to database with updated folder structure...');
  await entity.save();
  console.log('✅ Entity saved successfully with file in nested folder');
}

// 🔍 DEBUG: Log current folder structure
const debugFolderStructure = (folders, depth = 0) => {
  const indent = '  '.repeat(depth);
  folders.forEach(folder => {
    console.log(`${indent}📁 ${folder.name} (${folder.files ? folder.files.length : 0} files)`);
    if (folder.files && folder.files.length > 0) {
      folder.files.forEach(file => {
        console.log(`${indent}  📄 ${file.fileName}`);
      });
    }
    if (folder.subfolders && folder.subfolders.length > 0) {
      debugFolderStructure(folder.subfolders, depth + 1);
    }
  });
};

// Use it in your file upload section:
console.log('🔍 CURRENT FOLDER STRUCTURE:');
debugFolderStructure(pedagogyElement.folders || []);
    // ✅ Update description only
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

    entity.updatedBy = req.user?.email || "system";
    entity.updatedAt = Date.now();

    const updatedEntity = await entity.save();
    const populatedEntity = await model.findById(updatedEntity._id);

        res.status(200).json({
      message: [{ key: "success", value: `${type} updated successfully` }],
      data: populatedEntity, // Send complete data with nested structures
    });
  } catch (err) {
    console.error("Update error:", err);
    res.status(500).json({ message: [{ key: "error", value: "Internal server error" }] });
  }
};
