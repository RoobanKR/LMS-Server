const User = require('../../../models/UserModel');
const mongoose = require('mongoose');

const Module1 = mongoose.model('Module1');
const SubModule1 = mongoose.model('SubModule1');
const Topic1 = mongoose.model('Topic1');
const SubTopic1 = mongoose.model('SubTopic1');
const CourseStructure = mongoose.model('Course-Structure');


exports.submitAnswer = async (req, res) => {
  try {
    const userId = req.user._id;
    const {
      courseId,
      exerciseId,
      questionId,
      category,
      subcategory,
      selectedProgrammingLanguage,
      nodeId = "",
      nodeName = "",
      nodeType = "",
      screenRecord,
      code = "",
      score = 0,
      language = "",
      status = "attempted",
    } = req.body;



    // Validate required fields
    if (!courseId || !exerciseId || !questionId) {
      return res.status(400).json({
        success: false,
        message: "courseId, exerciseId, and questionId are required"
      });
    }

    // Validate category
    const validCategories = ['I_Do', 'We_Do', 'You_Do'];
    if (!validCategories.includes(category)) {
      return res.status(400).json({
        success: false,
        message: "Category must be one of: I_Do, We_Do, You_Do"
      });
    }

    // Find user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    // Prepare the question answer
    const questionAnswer = {
      questionId: new mongoose.Types.ObjectId(questionId),
      codeAnswer: code,
      language: language,
      score: score,
      status: status,
      isCorrect: status === 'solved' || score >= 70,
      attempts: 1,
      submittedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Find or create the course entry
    let courseIndex = user.courses.findIndex(c => 
      c.courseId && c.courseId.toString() === courseId
    );

    if (courseIndex === -1) {
      // Create new course entry
      const newCourse = {
        courseId: new mongoose.Types.ObjectId(courseId),
        answers: {
          I_Do: new Map(),
          We_Do: new Map(),
          You_Do: new Map()
        },
        lastAccessed: new Date(),
        createdAt: new Date(),
        updatedAt: new Date()
      };
      user.courses.push(newCourse);
      courseIndex = user.courses.length - 1;
    } else {
      // Update existing course
      user.courses[courseIndex].lastAccessed = new Date();
      user.courses[courseIndex].updatedAt = new Date();
    }

    // Ensure answers structure exists
    if (!user.courses[courseIndex].answers) {
      user.courses[courseIndex].answers = {
        I_Do: new Map(),
        We_Do: new Map(),
        You_Do: new Map()
      };
    }

    // Initialize category if it doesn't exist
    if (!user.courses[courseIndex].answers[category]) {
      user.courses[courseIndex].answers[category] = new Map();
    }

 // Determine the exercise key based on category
let exerciseKey;
if (category === 'We_Do' || category === 'You_Do') {
  // For both We_Do and You_Do, use subcategory as the key
  exerciseKey = subcategory;
} else {
  // For I_Do, use exerciseId as the key
  exerciseKey = exerciseId.toString();
}

    // Get or create the exercise array for this key
    let exerciseArray = user.courses[courseIndex].answers[category].get(exerciseKey);
    if (!exerciseArray) {
      exerciseArray = [];
      user.courses[courseIndex].answers[category].set(exerciseKey, exerciseArray);
    }

    // Find existing exercise in the array
    let exerciseIndex = exerciseArray.findIndex(
      ex => ex.exerciseId && ex.exerciseId.toString() === exerciseId
    );

 if (exerciseIndex === -1) {
  // Create new exercise entry
  const newExercise = {
    exerciseId: new mongoose.Types.ObjectId(exerciseId),
    questions: [questionAnswer],
    nodeId: nodeId,
    nodeName: nodeName,
    nodeType: nodeType,
    selectedProgrammingLanguage:selectedProgrammingLanguage,
    // Always set subcategory for both We_Do and You_Do
    subcategory: (category === 'We_Do' || category === 'You_Do') ? subcategory : undefined,
   
    createdAt: new Date(),
    updatedAt: new Date()
  };
  exerciseArray.push(newExercise);
} else {
  // Update existing exercise
  const existingExercise = exerciseArray[exerciseIndex];
  
  // Find existing question in this exercise
  const existingQuestionIndex = existingExercise.questions.findIndex(
    q => q.questionId && q.questionId.toString() === questionId
  );
  
  if (existingQuestionIndex === -1) {
    // Add new question to this exercise
    existingExercise.questions.push(questionAnswer);
  } else {
    // Update existing question in this exercise
    const existingQuestion = existingExercise.questions[existingQuestionIndex];
    existingExercise.questions[existingQuestionIndex] = {
      ...questionAnswer,
      attempts: (existingQuestion.attempts || 0) + 1,
      createdAt: existingQuestion.createdAt || new Date(),
      updatedAt: new Date()
    };
  }
  

  // Update exercise metadata
  existingExercise.updatedAt = new Date();
  if (nodeId) existingExercise.nodeId = nodeId;
  if (nodeName) existingExercise.nodeName = nodeName;
  if (nodeType) existingExercise.nodeType = nodeType;
  if (selectedProgrammingLanguage) existingExercise.selectedProgrammingLanguage = selectedProgrammingLanguage;
  // Always update subcategory for both We_Do and You_Do
  if ((category === 'We_Do' || category === 'You_Do') && subcategory) {
    existingExercise.subcategory = subcategory;
  }
}

    // Update the Map with modified array
    user.courses[courseIndex].answers[category].set(exerciseKey, exerciseArray);

    // Mark the modified paths for Mongoose
    user.markModified(`courses.${courseIndex}.answers.${category}`);
    
    // Save the user
    await user.save();

    res.status(200).json({
      success: true,
      message: "Answer submitted successfully",
      data: {
        courseId,
        exerciseId,
        questionId,
        category,
        subcategory: category === 'We_Do' ? subcategory : undefined,
        status,
        score,
        isCorrect: questionAnswer.isCorrect,
        user: {
          id: user._id,
          name: `${user.firstName} ${user.lastName || ''}`,
          email: user.email
        }
      }
    });

  } catch (error) {
    console.error("❌ Submit answer error:", error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};



exports.getAllUsers = async (req, res) => {
  try {
    const { courseId } = req.params;
    const { institutionId, status, roleId, search } = req.query;

    if (!courseId) {
      return res.status(400).json({
        success: false,
        message: "courseId parameter is required"
      });
    }

    // 1. Get course with populated participants
    const course = await CourseStructure.findById(courseId)
      .select('courseName courseCode description startDate endDate singleParticipants')
      .populate({
        path: "singleParticipants",
        populate: {
          path: "user",
          select: '_id email firstName lastName status'
        }
      })
      .lean();

    if (!course) {
      return res.status(404).json({
        success: false,
        message: "Course not found"
      });
    }

    // 2. Extract user IDs from participants
    const participantUserIds = course.singleParticipants
      .filter(participant => participant.user && participant.user._id)
      .map(participant => participant.user._id.toString());

    if (participantUserIds.length === 0) {
      return res.status(200).json({
        success: true,
        message: "No participants found in this course",
        data: {
          course: {
            _id: course._id,
            courseName: course.courseName,
            courseCode: course.courseCode,
            description: course.description,
            startDate: course.startDate,
            endDate: course.endDate,
            totalParticipants: 0
          },
          users: []
        }
      });
    }

    // 3. Build user filter
    let filter = { _id: { $in: participantUserIds } };
    
    // Search filter
    if (search) {
      filter.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } }
      ];
    }
    
    if (institutionId && institutionId !== 'all') {
      filter.institution = institutionId;
    }
    
    if (status && ['active', 'inactive'].includes(status)) {
      filter.status = status;
    }
    
    if (roleId && roleId !== 'all') {
      filter.role = roleId;
    }

    // 4. Get users with required fields
    const users = await User.find(filter)
      .populate({
        path: 'institution',
        select: 'inst_id inst_name inst_owner phone address basedOn'
      })
      .populate({
        path: 'role',
        select: 'originalRole renameRole roleValue'
      })
      .populate({
        path: 'courses.courseId',
        select: 'courseName courseCode',
        match: { _id: courseId },
        model: 'Course-Structure'
      })
      .select('-password -tokens -__v')
      .sort({ firstName: 1, lastName: 1 })
      .lean();

    if (!users || users.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No users found matching the criteria"
      });
    }

    // 5. Model mapping for fetching exercise details
    const modelMap = {
      'module': mongoose.model('Module1'),
      'submodule': mongoose.model('SubModule1'),
      'topic': mongoose.model('Topic1'),
      'subtopic': mongoose.model('SubTopic1')
    };

    // 6. Enrich each user with course progress data
    const enrichedUsers = await Promise.all(users.map(async (user) => {
      const formattedUser = {
        _id: user._id,
        institution: user.institution,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        gender: user.gender,
        profile: user.profile,
        role: user.role,
        status: user.status,
        createdAt: user.createdAt,
        createdBy: user.createdBy,
        updatedAt: user.updatedAt,
        permissions: user.permissions,
        courses: []
      };

      // Find the specific course in user's courses
      const userCourse = user.courses?.find(c => 
        c.courseId && c.courseId._id.toString() === courseId
      );

      if (userCourse) {
        const courseProgress = {
          courseId: userCourse.courseId?._id,
          courseName: userCourse.courseId?.courseName,
          courseCode: userCourse.courseId?.courseCode,
          lastAccessed: userCourse.lastAccessed,
          exercises: []
        };

        // Process We_Do exercises
        if (userCourse.answers?.We_Do?.practical) {
          const exercises = await Promise.all(
            userCourse.answers.We_Do.practical.map(async (practice) => {
              const exerciseData = {
                exerciseId: practice.exerciseId,
                nodeId: practice.nodeId,
                nodeName: practice.nodeName,
                nodeType: practice.nodeType,
                selectedProgrammingLanguage: practice.selectedProgrammingLanguage,
                subcategory: practice.subcategory || 'practical',
                createdAt: practice.createdAt,
                updatedAt: practice.updatedAt,
                exerciseDetails: null,
                questions: []
              };

              // Fetch exercise details WITHOUT storing allExerciseQuestions
              if (practice.nodeId && practice.nodeType) {
                try {
                  const nodeType = practice.nodeType.toLowerCase();
                  const Model = modelMap[nodeType];
                  
                  if (Model) {
                    const query = {
                      _id: practice.nodeId,
                      'pedagogy.We_Do.practical._id': practice.exerciseId
                    };
                    
                    const documentData = await Model.findOne(query)
                      .select('title pedagogy.We_Do.practical.$')
                      .lean();

                    if (documentData?.pedagogy?.We_Do?.practical?.[0]) {
                      const exercise = documentData.pedagogy.We_Do.practical[0];
                      
                      // Add exercise details only
                      exerciseData.exerciseDetails = {
                        exerciseName: exercise.exerciseInformation?.exerciseName,
                        description: exercise.exerciseInformation?.description,
                        exerciseLevel: exercise.exerciseInformation?.exerciseLevel,
                        totalQuestions: exercise.exerciseInformation?.totalQuestions,
                        totalPoints: exercise.exerciseInformation?.totalPoints,
                        estimatedTime: exercise.exerciseInformation?.estimatedTime
                      };

                      // Create a map of question details for quick lookup
                      const questionDetailsMap = new Map();
                      if (exercise.questions && Array.isArray(exercise.questions)) {
                        exercise.questions.forEach(q => {
                          questionDetailsMap.set(q._id.toString(), {
                            title: q.title,
                            description: q.description,
                            difficulty: q.difficulty,
                            score: q.score,
                            sampleInput: q.sampleInput,
                            sampleOutput: q.sampleOutput,
                            constraints: q.constraints || [],
                            hints: q.hints || [],
                            testCases: q.testCases || [],
                            solutions: q.solutions || {},
                            timeLimit: q.timeLimit,
                            memoryLimit: q.memoryLimit
                          });
                        });
                      }

                      // Process user's questions
                      if (practice.questions && Array.isArray(practice.questions)) {
                        exerciseData.questions = practice.questions.map(userQuestion => {
                          const questionData = {
                            questionId: userQuestion.questionId,
                            codeAnswer: userQuestion.codeAnswer,
                            language: userQuestion.language,
                            isCorrect: userQuestion.isCorrect,
                            score: userQuestion.score,
                            status: userQuestion.status,
                            attempts: userQuestion.attempts,
                            submittedAt: userQuestion.submittedAt,
                            createdAt: userQuestion.createdAt,
                            updatedAt: userQuestion.updatedAt,
                            questionDetails: null
                          };

                          // Get question details from map
                          const questionDetail = questionDetailsMap.get(userQuestion.questionId.toString());
                          if (questionDetail) {
                            questionData.questionDetails = questionDetail;
                          }

                          return questionData;
                        });
                      }
                    }
                  }
                } catch (error) {
                  console.warn(`Error fetching exercise details for user ${user._id}:`, error.message);
                }
              }

              return exerciseData;
            })
          );

          courseProgress.exercises = exercises;
        }

        formattedUser.courses = [courseProgress];
      } else {
        // User is enrolled but has no progress yet
        formattedUser.courses = [{
          courseId: course._id,
          courseName: course.courseName,
          courseCode: course.courseCode,
          lastAccessed: null,
          exercises: []
        }];
      }

      return formattedUser;
    }));

    // 7. Calculate overall statistics
    const courseStatistics = {
      totalEnrolled: participantUserIds.length,
      usersWithAccess: users.length,
      activeUsers: users.filter(u => u.status === 'active').length,
      inactiveUsers: users.filter(u => u.status === 'inactive').length,
      usersWithProgress: enrichedUsers.filter(u => 
        u.courses[0]?.exercises?.length > 0
      ).length,
      totalExercises: enrichedUsers.reduce((sum, user) => 
        sum + (user.courses[0]?.exercises?.length || 0), 0
      ),
      totalQuestionsAttempted: enrichedUsers.reduce((sum, user) => {
        const exercises = user.courses[0]?.exercises || [];
        return sum + exercises.reduce((exSum, ex) => 
          exSum + (ex.questions?.length || 0), 0);
      }, 0),
      totalQuestionsSolved: enrichedUsers.reduce((sum, user) => {
        const exercises = user.courses[0]?.exercises || [];
        return sum + exercises.reduce((exSum, ex) => 
          exSum + (ex.questions?.filter(q => q.isCorrect === true || q.status === 'solved').length || 0), 0);
      }, 0),
      averageCompletion: enrichedUsers.length > 0 ? 
        Math.round(enrichedUsers.filter(u => 
          u.courses[0]?.exercises?.length > 0
        ).length / enrichedUsers.length * 100) : 0
    };

    // 8. Return formatted response WITHOUT allExerciseQuestions
    res.status(200).json({
      success: true,
      message: `Found ${users.length} users enrolled in course "${course.courseName}"`,
      data: {
        course: {
          _id: course._id,
          courseName: course.courseName,
          courseCode: course.courseCode,
          description: course.description,
          startDate: course.startDate,
          endDate: course.endDate,
          totalParticipants: participantUserIds.length
        },
        users: enrichedUsers,
        statistics: courseStatistics,
        summary: {
          total: enrichedUsers.length,
          filters: {
            institutionId: institutionId || 'all',
            status: status || 'all',
            roleId: roleId || 'all',
            search: search || 'none'
          }
        }
      }
    });

  } catch (error) {
    console.error("Error in getAllUsers by course:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message
    });
  }
};




exports.evaluateStudentAnswer = async (req, res) => {
  try {
    const {
      courseId,
      exerciseId,
      exerciseName,
      questionId,
      questionTitle,
      participantId,
      score,
      totalScore, // Added totalScore
      feedback,
      status = "evaluated",
      category,
      subcategory,
    } = req.body;

    // Validate required fields
    if (!courseId || !exerciseId || !questionId || !participantId) {
      return res.status(400).json({
        success: false,
        message: "courseId, exerciseId, questionId, and participantId are required"
      });
    }

    // Validate score range
    if (score === undefined || score === null) {
      return res.status(400).json({
        success: false,
        message: "Score is required"
      });
    }

    if (score < 0 || score > 100) {
      return res.status(400).json({
        success: false,
        message: "Score must be between 0 and 100"
      });
    }

    // Validate totalScore if provided
    if (totalScore !== undefined && totalScore !== null) {
      if (totalScore < 0) {
        return res.status(400).json({
          success: false,
          message: "totalScore must be a positive number"
        });
      }
    }

    // Validate category
    const validCategories = ['I_Do', 'We_Do', 'You_Do'];
    if (!validCategories.includes(category)) {
      return res.status(400).json({
        success: false,
        message: "Category must be one of: I_Do, We_Do, You_Do"
      });
    }

    // Find the course to get course name
    const Course = require("../../../models/Courses/courseStructureModal"); // Adjust the path as needed
    
    let courseName = "";
    try {
      const course = await Course.findById(courseId).select("courseName");
      if (course) {
        courseName = course.courseName;
      }
    } catch (courseError) {
      console.warn("Could not fetch course name:", courseError.message);
      // Continue without course name - it's not critical for the evaluation
    }

    // Find the student (participant)
    const student = await User.findById(participantId);
    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student not found"
      });
    }

    // Find instructor who is evaluating
    const instructor = await User.findById(req.user._id);
    if (!instructor) {
      return res.status(404).json({
        success: false,
        message: "Instructor not found"
      });
    }

    // Find the course in student's courses
    let courseIndex = student.courses.findIndex(c => 
      c.courseId && c.courseId.toString() === courseId
    );

    // If course not found, create it
    if (courseIndex === -1) {
      const newCourse = {
        courseId: new mongoose.Types.ObjectId(courseId),
        answers: {
          I_Do: new Map(),
          We_Do: new Map(),
          You_Do: new Map()
        },
        lastAccessed: new Date(),
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      student.courses.push(newCourse);
      courseIndex = student.courses.length - 1;
    } else {
      // Course exists, update last accessed
      student.courses[courseIndex].lastAccessed = new Date();
    }

    // Ensure answers structure exists
    if (!student.courses[courseIndex].answers) {
      student.courses[courseIndex].answers = {
        I_Do: new Map(),
        We_Do: new Map(),
        You_Do: new Map()
      };
    }

    let foundAndUpdated = false;
    let evaluationDetails = null;

    // Get the category map
    let categoryMap = student.courses[courseIndex].answers[category];
    if (!categoryMap) {
      categoryMap = new Map();
      student.courses[courseIndex].answers[category] = categoryMap;
    }

    // Determine the exercise key based on category
    let exerciseKey;
    if (category) {
      exerciseKey = subcategory;
    } else {
      exerciseKey = exerciseId.toString();
    }

    // Get or create the exercise array for this key
    let exerciseArray = categoryMap.get(exerciseKey);
    if (!exerciseArray) {
      exerciseArray = [];
    }

    // Find existing exercise in the array
    let exerciseIndex = exerciseArray.findIndex(
      ex => ex.exerciseId && ex.exerciseId.toString() === exerciseId
    );

    // Prepare the question answer object - INCLUDING totalScore
    const questionAnswer = {
      questionId: new mongoose.Types.ObjectId(questionId),
      questionTitle: questionTitle || "",
      codeAnswer: "", // Empty code answer as requested
      language: "", // Default language
      score: score,
      totalScore: totalScore || 0, // Store totalScore (default to 0 if not provided)
      feedback: feedback,
      status: status,
      isCorrect: score >= 70,
      attempts: 1,
      submittedAt: new Date(),
      evaluatedBy: req.user._id,
      evaluatedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date()
    };

    if (exerciseIndex !== -1) {
      // Exercise exists, find or create question
      const exercise = exerciseArray[exerciseIndex];
      
      // Update exerciseName if provided
      if (exerciseName) {
        exercise.exerciseName = exerciseName;
      }
      
      // Find the question in this exercise
      const questionIndex = exercise.questions.findIndex(
        q => q.questionId && q.questionId.toString() === questionId
      );

      if (questionIndex !== -1) {
        // Question exists, update it
        const question = exercise.questions[questionIndex];
        
        // Store previous values for response
        const previousScore = question.score;
        const previousTotalScore = question.totalScore;
        const previousFeedback = question.feedback;
        const previousStatus = question.status;
        
        // Update the question (including totalScore)
        question.score = score;
        question.totalScore = totalScore || question.totalScore; // Update totalScore
        question.questionTitle = questionTitle || question.questionTitle;
        question.feedback = feedback || question.feedback;
        question.status = status;
        question.isCorrect = score >= 70;
        question.updatedAt = new Date();
        question.evaluatedBy = req.user._id;
        question.evaluatedAt = new Date();
        question.attempts = (question.attempts || 0) + 1;
        
        foundAndUpdated = true;
        evaluationDetails = {
          action: "updated_existing",
          category,
          exercise: {
            id: exercise.exerciseId,
            name: exercise.exerciseName,
            nodeId: exercise.nodeId,
            nodeName: exercise.nodeName,
            nodeType: exercise.nodeType,
            subcategory: exercise.subcategory
          },
          question: {
            id: question.questionId,
            title: question.questionTitle,
            previousScore,
            previousTotalScore,
            previousFeedback,
            previousStatus,
            newScore: score,
            newTotalScore: totalScore || question.totalScore,
            newFeedback: feedback,
            newStatus: status,
            isCorrect: question.isCorrect,
            language: question.language,
            codeAnswer: question.codeAnswer,
            attempts: question.attempts
          }
        };
      } else {
        // Question doesn't exist, add it to existing exercise
        exercise.questions.push(questionAnswer);
        exercise.updatedAt = new Date();
        
        foundAndUpdated = true;
        evaluationDetails = {
          action: "added_to_existing_exercise",
          category,
          exercise: {
            id: exercise.exerciseId,
            name: exercise.exerciseName,
            nodeId: exercise.nodeId,
            nodeName: exercise.nodeName,
            nodeType: exercise.nodeType,
            subcategory: exercise.subcategory
          },
          question: {
            id: questionAnswer.questionId,
            title: questionAnswer.questionTitle,
            codeAnswer: questionAnswer.codeAnswer,
            score: questionAnswer.score,
            totalScore: questionAnswer.totalScore, // Include totalScore
            feedback: questionAnswer.feedback,
            status: questionAnswer.status,
            isCorrect: questionAnswer.isCorrect,
            language: questionAnswer.language,
            attempts: questionAnswer.attempts
          }
        };
      }
      
      // Update the exercise in the array
      exerciseArray[exerciseIndex] = exercise;
      
    } else {
      // Exercise doesn't exist, create new exercise with question
      const newExercise = {
        exerciseId: new mongoose.Types.ObjectId(exerciseId),
        exerciseName: exerciseName || "",
        questions: [questionAnswer],
        nodeId: "",
        nodeName: "",
        nodeType: "",
        subcategory: category ? subcategory : undefined,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      exerciseArray.push(newExercise);
      foundAndUpdated = true;
      evaluationDetails = {
        action: "created_new_exercise",
        category,
        exercise: {
          id: newExercise.exerciseId,
          name: newExercise.exerciseName,
          nodeId: newExercise.nodeId,
          nodeName: newExercise.nodeName,
          nodeType: newExercise.nodeType,
          subcategory: newExercise.subcategory
        },
        question: {
          id: questionAnswer.questionId,
          title: questionAnswer.questionTitle,
          codeAnswer: questionAnswer.codeAnswer,
          score: questionAnswer.score,
          totalScore: questionAnswer.totalScore, // Include totalScore
          feedback: questionAnswer.feedback,
          status: questionAnswer.status,
          isCorrect: questionAnswer.isCorrect,
          language: questionAnswer.language,
          attempts: questionAnswer.attempts
        }
      };
    }

    // Update the map with modified array
    categoryMap.set(exerciseKey, exerciseArray);
    
    // Mark the modified paths for Mongoose
    student.markModified(`courses.${courseIndex}.answers.${category}`);
    
    // Update course last accessed
    student.courses[courseIndex].lastAccessed = new Date();
    student.courses[courseIndex].updatedAt = new Date();

    // **SEND NOTIFICATION TO STUDENT**
    const notificationTitle = "Answer Evaluated";
    let notificationMessage = "";
    
    // Use exerciseName and questionTitle in notification
    const exerciseDisplayName = exerciseName || "Exercise";
    const questionDisplayTitle = questionTitle || "Question";
    
    // Include totalScore in notification message
    const scoreDisplay = totalScore 
      ? `${score}/${totalScore}` 
      : `${score}/100`;
    
    if (score >= 70) {
      notificationMessage = `🎉 Excellent! Your answer for "${questionDisplayTitle}" in ${exerciseDisplayName} scored ${scoreDisplay} - Well done!`;
    } else if (score >= 50) {
      notificationMessage = `📝 Your answer for "${questionDisplayTitle}" in ${exerciseDisplayName} scored ${scoreDisplay} - Good attempt!`;
    } else {
      notificationMessage = `📋 Your answer for "${questionDisplayTitle}" in ${exerciseDisplayName} scored ${scoreDisplay} - Review the feedback for improvements.`;
    }

    if (feedback) {
      notificationMessage += ` Feedback: ${feedback}`;
    }

    // Create notification for the student
    const studentNotification = {
      title: notificationTitle,
      message: notificationMessage,
      type: score >= 70 ? 'success' : score >= 50 ? 'info' : 'warning',
      relatedEntity: 'assignment',
      relatedEntityId: questionId,
      isRead: false,
      metadata: {
        "Course Name": courseName || '',
        "Exercise Name": exerciseName || '',
        "Question Title": questionTitle || '',
        "Score": score, 
        "Total Score": totalScore || 0, // Include totalScore in metadata
        "Feedback": feedback || '',
        "Status": status,
        "Category": category,
        "Sub Category": subcategory || '',
        "Evaluated By Email": instructor.email,
        "Evaluated At": new Date().toISOString()
      },
      enrolledBy: instructor._id
    };

    // Add notification to student
    await student.addNotification(studentNotification);

    // Save the updated student document
    await student.save();

    // **SEND REAL-TIME NOTIFICATION (if using WebSocket)**
    if (global.io) {
      global.io.to(`user-${student._id}`).emit('new-notification', {
        ...studentNotification,
        _id: `eval-${Date.now()}`,
        createdAt: new Date().toISOString()
      });
    }

    // Also send notification to instructor's own record
    const instructorNotification = {
      title: "Evaluation Completed",
      message: `You evaluated ${student.firstName}'s answer for "${questionDisplayTitle}" in ${exerciseDisplayName}. Score: ${scoreDisplay}`,
      type: 'info',
      relatedEntity: 'assignment',
      relatedEntityId: questionId,
      isRead: false,
      metadata: {
        studentId: student._id,
        studentName: `${student.firstName} ${student.lastName || ''}`,
        studentEmail: student.email,
        courseId: courseId,
        courseName: courseName || '',
        exerciseId: exerciseId,
        exerciseName: exerciseName || '',
        questionId: questionId,
        questionTitle: questionTitle || '',
        score: score,
        totalScore: totalScore || 0, // Include totalScore in instructor notification
        feedback: feedback || '',
        evaluatedAt: new Date().toISOString()
      }
    };

    await instructor.addNotification(instructorNotification);
    await instructor.save();

    res.status(200).json({
      success: true,
      message: evaluationDetails.action === "updated_existing" 
        ? "Student answer evaluated successfully" 
        : "New answer entry created and evaluated",
      data: {
        student: {
          id: student._id,
          name: `${student.firstName} ${student.lastName || ''}`,
          email: student.email
        },
        instructor: {
          id: instructor._id,
          name: `${instructor.firstName} ${instructor.lastName || ''}`,
          email: instructor.email
        },
        course: {
          id: courseId,
          name: courseName || ''
        },
        exercise: {
          id: exerciseId,
          name: exerciseName || ''
        },
        question: {
          id: questionId,
          title: questionTitle || ''
        },
        score: {
          obtained: score,
          total: totalScore || 0, // Include totalScore in response
          percentage: totalScore ? ((score / totalScore) * 100).toFixed(2) : score
        },
        evaluationDetails,
        notification: {
          sentToStudent: true,
          message: notificationMessage,
          notificationId: studentNotification._id
        },
        evaluationInfo: {
          gradedBy: req?.user?._id || req.user?.email || 'instructor',
          evaluatedAt: new Date(),
          score,
          totalScore,
          feedback,
          status,
          category,
          subcategory: category ? subcategory : undefined
        }
      }
    });

  } catch (error) {
    console.error("❌ Evaluate student answer error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};



exports.getAnswerByQuestionId = async (req, res) => {
  try {
    // Extract parameters from query string (since it's a GET request)
    const { 
      courseId, 
      exerciseId, 
      questionId, 
      category = "We_Do", 
      subcategory 
    } = req.query;
    
    const userId = req.user._id;

    // 1. Validation
    if (!courseId || !exerciseId || !questionId) {
      return res.status(400).json({ 
        success: false, 
        message: "Missing required fields: courseId, exerciseId, or questionId" 
      });
    }

    // 2. Find User
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // 3. Find Course in User's Enrolled Courses
    const course = user.courses.find(c => c.courseId && c.courseId.toString() === courseId);
    
    // If course or answers map doesn't exist, return null data (not an error, just no answer yet)
    if (!course || !course.answers || !course.answers.get(category)) {
      return res.status(200).json({ success: true, data: null });
    }

    // 4. Resolve Exercise Key
    const exerciseKey = category === 'We_Do' ? subcategory : exerciseId;
    
    const categoryMap = course.answers.get(category);
    const exerciseArray = categoryMap ? categoryMap.get(exerciseKey) : null;

    if (!exerciseArray || !Array.isArray(exerciseArray)) {
      return res.status(200).json({ success: true, data: null });
    }

    // 5. Find the Specific Exercise Document
    const exercise = exerciseArray.find(ex => ex.exerciseId && ex.exerciseId.toString() === exerciseId);
    if (!exercise) {
      return res.status(200).json({ success: true, data: null });
    }

    // 6. Find the Specific Question Answer
    const questionAnswer = exercise.questions.find(q => q.questionId && q.questionId.toString() === questionId);

    if (questionAnswer) {
      return res.status(200).json({ 
        success: true, 
        data: questionAnswer.codeAnswer, 
        language: questionAnswer.language,
        status: questionAnswer.status,
        score: questionAnswer.score,
        attempts: questionAnswer.attempts || 0 // Added attempts to response for frontend check
      });
    } else {
      return res.status(200).json({ success: true, data: null });
    }

  } catch (error) {
    console.error("Error in getAnswerByQuestionId:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};


exports.submitMultipleFiles = async (req, res) => {
  try {
    const userId = req.user._id;
    const {
      courseId,
      exerciseId,
      questionId,
      category,
      subcategory,
      selectedProgrammingLanguage,
      nodeId = "",
      nodeName = "",
      nodeType = "",
      screenRecord,
      // Files array with folder paths
      files = [],
      // Folder hierarchy
      folders = [],
      folderHierarchy = [],
      projectStructure = {},
      entryPoints = [],
      hasFolders = false,
      folderCount = 0,
      totalFiles = 0,
      status = "submitted",
      totalScore = 0,
      score = 0,
      feedback = "",
      language = "multi-file",
      isMultiFile = true
    } = req.body;
 
    // Validate required fields
    if (!courseId || !exerciseId || !questionId) {
      return res.status(400).json({
        success: false,
        message: "courseId, exerciseId, and questionId are required"
      });
    }
 
    // Validate category
    const validCategories = ['I_Do', 'We_Do', 'You_Do'];
    if (!validCategories.includes(category)) {
      return res.status(400).json({
        success: false,
        message: "Category must be one of: I_Do, We_Do, You_Do"
      });
    }
 
    // Validate files array
    if (!files || !Array.isArray(files) || files.length === 0) {
      return res.status(400).json({
        success: false,
        message: "At least one file is required"
      });
    }
 
    // Validate each file
    for (const file of files) {
      if (!file.filename || !file.content || !file.language) {
        return res.status(400).json({
          success: false,
          message: "Each file must have filename, content, and language properties"
        });
      }
     
      // Validate file extension matches language
      const ext = file.filename.split('.').pop().toLowerCase();
      const langExtMap = {
        'html': ['html', 'htm'],
        'css': ['css'],
        'javascript': ['js', 'javascript'],
        'json': ['json'],
        'text': ['txt', 'md'],
        'markdown': ['md', 'markdown'],
        'xml': ['xml'],
        'sql': ['sql']
      };
     
      if (langExtMap[file.language] && !langExtMap[file.language].includes(ext)) {
        return res.status(400).json({
          success: false,
          message: `File ${file.filename} extension does not match language ${file.language}`
        });
      }
    }
 
    // Find user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }
 
    // Generate unique IDs for files and folders if not provided
    const processedFiles = files.map(file => ({
      id: file.id || `file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      filename: file.filename,
      content: file.content,
      language: file.language,
      path: file.path || `/${file.filename}`,
      folderPath: file.folderPath || '/',
      size: Buffer.byteLength(file.content, 'utf8'),
      isEntryPoint: file.isEntryPoint,
      lastModified: file.lastModified || new Date()
    }));
 
    const processedFolders = folders.map(folder => ({
      id: folder.id || `folder-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: folder.name,
      path: folder.path,
      parentPath: folder.parentPath || '/',
      depth: folder.depth || 0,
      fileCount: folder.children?.length || 0,
      subfolderCount: folder.folderChildren?.length || 0
    }));
 
    // Prepare question answer with folder structure
    const questionAnswer = {
      questionId: new mongoose.Types.ObjectId(questionId),
      questionTitle: req.body.questionTitle || `Question ${questionId}`,
      files: processedFiles,
      folders: processedFolders,
      projectStructure: {
        ...projectStructure,
        folders: folderHierarchy.length > 0 ? folderHierarchy.map(f => ({
          id: f.id || `folder-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          name: f.name,
          path: f.path,
          parentPath: f.parentPath || '/',
          depth: f.depth || 0,
          fileCount: f.fileCount || 0,
          subfolderCount: f.subfolderCount || 0
        })) : processedFolders,
        folderTree: buildFolderTreeForDB(processedFolders, processedFiles),
        hasFolders: hasFolders || processedFolders.length > 0,
        totalFolders: folderCount || processedFolders.length,
        totalFiles: totalFiles || processedFiles.length,
        entryPoints: entryPoints,
        fileDistribution: {
          html: processedFiles.filter(f => f.language === 'html').length,
          css: processedFiles.filter(f => f.language === 'css').length,
          javascript: processedFiles.filter(f => f.language === 'javascript').length,
          other: processedFiles.filter(f => !['html', 'css', 'javascript', 'sql'].includes(f.language)).length,
          sql: processedFiles.filter(f => f.language === 'sql').length
        }
      },
   
      codeAnswer: `Multi-file project with ${processedFiles.length} files${processedFolders.length > 0 ? ` in ${processedFolders.length} folders` : ''}`,
      language: 'multi-file',
      totalScore: totalScore,
      score: score,
      feedback: feedback,
      status: status,
      isCorrect: status === 'solved' || status === 'evaluated' || score >= 70,
      attempts: 1,
      submittedAt: new Date(),
      fileStructure: {
        totalFiles: processedFiles.length,
        htmlFiles: processedFiles.filter(f => f.language === 'html').length,
        cssFiles: processedFiles.filter(f => f.language === 'css').length,
        jsFiles: processedFiles.filter(f => f.language === 'javascript').length,
        sqlFiles: processedFiles.filter(f => f.language === 'sql').length,
        otherFiles: processedFiles.filter(f => !['html', 'css', 'javascript', 'sql'].includes(f.language)).length,
        folders: processedFolders.length,
        folderStructure: processedFolders.map(f => ({
          name: f.name,
          path: f.path,
          fileCount: f.fileCount
        }))
      }
    };
 
    // Helper function to build folder tree for DB storage
    function buildFolderTreeForDB(foldersList, filesList) {
      const tree = {};
     
      // Create folder nodes
      foldersList.forEach(folder => {
        tree[folder.path] = {
          id: folder.id,
          name: folder.name,
          path: folder.path,
          parentPath: folder.parentPath || '/',
          depth: folder.depth || 0,
          children: [],
          files: filesList
            .filter(f => f.folderPath === folder.path)
            .map(f => ({
              id: f.id,
              filename: f.filename,
              language: f.language,
              size: f.size
            }))
        };
      });
     
      // Build hierarchy
      foldersList.forEach(folder => {
        if (folder.parentPath !== '/' && tree[folder.parentPath]) {
          tree[folder.parentPath].children.push(tree[folder.path]);
        }
      });
     
      // Return root folders
      return foldersList
        .filter(folder => folder.parentPath === '/')
        .map(folder => tree[folder.path]);
    }
 
    // Find or create course entry
    let courseIndex = user.courses.findIndex(c =>
      c.courseId && c.courseId.toString() === courseId
    );
 
    if (courseIndex === -1) {
      user.courses.push({
        courseId: new mongoose.Types.ObjectId(courseId),
        answers: {
          I_Do: new Map(),
          We_Do: new Map(),
          You_Do: new Map()
        },
        lastAccessed: new Date()
      });
      courseIndex = user.courses.length - 1;
    }
 
    // Ensure answers structure exists
    if (!user.courses[courseIndex].answers) {
      user.courses[courseIndex].answers = {
        I_Do: new Map(),
        We_Do: new Map(),
        You_Do: new Map()
      };
    }
 
    // Initialize category
    if (!user.courses[courseIndex].answers[category]) {
      user.courses[courseIndex].answers[category] = new Map();
    }
 
    // Determine exercise key
    let exerciseKey;
    if (category === 'We_Do' || category === 'You_Do') {
      exerciseKey = subcategory || exerciseId.toString();
    } else {
      exerciseKey = exerciseId.toString();
    }
 
    // Get or create exercise array
    let exerciseArray = user.courses[courseIndex].answers[category].get(exerciseKey);
    if (!exerciseArray) {
      exerciseArray = [];
    }
 
    // Find or create exercise
    let exerciseIndex = exerciseArray.findIndex(
      ex => ex.exerciseId && ex.exerciseId.toString() === exerciseId
    );
 
    if (exerciseIndex === -1) {
      exerciseArray.push({
        exerciseId: new mongoose.Types.ObjectId(exerciseId),
        exerciseName: req.body.exerciseName || `Exercise ${exerciseId}`,
        questions: [questionAnswer],
        nodeId,
        nodeName,
        nodeType,
        selectedProgrammingLanguage,
        subcategory: (category === 'We_Do' || category === 'You_Do') ? subcategory : undefined,
        screenRecording: screenRecord,
        status: 'in-progress',
        projectType: 'multi-file',
        hasFolderStructure: processedFolders.length > 0,
        folderCount: processedFolders.length
      });
    } else {
      // Update existing exercise
      const existingExercise = exerciseArray[exerciseIndex];
     
      // Find existing question
      const questionIndex = existingExercise.questions.findIndex(
        q => q.questionId && q.questionId.toString() === questionId
      );
 
      if (questionIndex === -1) {
        existingExercise.questions.push(questionAnswer);
      } else {
        existingExercise.questions[questionIndex] = {
          ...existingExercise.questions[questionIndex],
          ...questionAnswer,
          attempts: (existingExercise.questions[questionIndex].attempts || 0) + 1,
          updatedAt: new Date()
        };
      }
 
      // Update exercise metadata
      existingExercise.updatedAt = new Date();
      existingExercise.projectType = 'multi-file';
      existingExercise.hasFolderStructure = processedFolders.length > 0;
      existingExercise.folderCount = processedFolders.length;
      existingExercise.status = status === 'completed' ? 'completed' : existingExercise.status;
    }
 
    // Save back to map
    user.courses[courseIndex].answers[category].set(exerciseKey, exerciseArray);
 
    // Mark modified
    user.markModified(`courses.${courseIndex}.answers.${category}`);
   
    await user.save();
 
    res.status(200).json({
      success: true,
      message: `Multi-file project submitted successfully${processedFolders.length > 0 ? ` with ${processedFolders.length} folders` : ''}`,
      data: {
        courseId,
        exerciseId,
        questionId,
        category,
        fileCount: processedFiles.length,
        folderCount: processedFolders.length,
        fileStructure: questionAnswer.fileStructure,
        submittedFiles: processedFiles.map(f => ({
          id: f.id,
          filename: f.filename,
          language: f.language,
          folderPath: f.folderPath,
          size: f.size,
          isEntryPoint: f.isEntryPoint
        })),
        folders: processedFolders.map(f => ({
          id: f.id,
          name: f.name,
          path: f.path,
          parentPath: f.parentPath,
          fileCount: f.fileCount
        })),
        entryPoints: questionAnswer.entryPoints,
        projectStructure: questionAnswer.projectStructure
      }
    });
 
  } catch (error) {
    console.error("Submit multi-files error:", error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};
 exports.getPreviousSubmission = async (req, res) => {
  try {
    const userId = req.user._id;
    const { courseId, exerciseId, questionId, category } = req.query;

    // Validate required parameters
    if (!courseId || !exerciseId || !questionId || !category) {
      return res.status(400).json({
        success: false,
        message: "Missing required parameters: courseId, exerciseId, questionId, category"
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: "User not found" 
      });
    }

    const course = user.courses.find(c => c.courseId.toString() === courseId);
    if (!course) {
      return res.status(404).json({ 
        success: false, 
        message: "Course not found" 
      });
    }

    let foundQuestion = null;
    let foundExercise = null;

    // Search through the category
    if (course.answers && course.answers[category]) {
      // Handle both Map and array formats
      let exercisesArray = [];
      
      if (course.answers[category] instanceof Map) {
        // Convert Map values to array
        exercisesArray = Array.from(course.answers[category].values()).flat();
      } else if (Array.isArray(course.answers[category])) {
        exercisesArray = course.answers[category];
      }

      // Find the exercise
      for (const exercise of exercisesArray) {
        if (exercise && exercise.exerciseId && exercise.exerciseId.toString() === exerciseId) {
          foundExercise = exercise;
          
          // Find the question
          if (exercise.questions && Array.isArray(exercise.questions)) {
            const question = exercise.questions.find(q =>
              q.questionId && q.questionId.toString() === questionId
            );
            
            if (question) {
              foundQuestion = question;
              break;
            }
          }
        }
      }
    }

    if (!foundQuestion) {
      return res.status(404).json({
        success: false,
        message: "No previous submission found for this question"
      });
    }

    // Prepare response with files and folders
    const responseData = {
      success: true,
      data: {
        // Files data
        files: foundQuestion.files || [],
        
        // Folders data
        folders: foundQuestion.folders || [],
        
        // Project structure
        projectStructure: foundQuestion.projectStructure || {},
        
        // Individual code snippets (for backward compatibility)
        htmlCode: foundQuestion.files?.find(f => f.language === 'html' && f.isEntryPoint)?.content ||
                 foundQuestion.files?.find(f => f.language === 'html')?.content || "",
        cssCode: foundQuestion.files?.find(f => f.language === 'css')?.content || "",
        jsCode: foundQuestion.files?.find(f => f.language === 'javascript')?.content || "",
        sqlCode: foundQuestion.files?.find(f => f.language === 'sql')?.content || "",
        
        // Metadata
        score: foundQuestion.score || 0,
        status: foundQuestion.status || 'submitted',
        submittedAt: foundQuestion.submittedAt || foundQuestion.createdAt,
        attempts: foundQuestion.attempts || 1,
        
        // Entry points
        entryPoints: foundQuestion.entryPoints || foundQuestion.files?.filter(f => f.isEntryPoint)?.map(f => ({
          filename: f.filename,
          path: f.path,
          language: f.language
        })) || [],
        
        // File statistics
        fileCount: foundQuestion.files?.length || 0,
        folderCount: foundQuestion.folders?.length || 0
      }
    };

    // Log for debugging
    console.log("Previous submission found:", {
      courseId,
      exerciseId,
      questionId,
      category,
      fileCount: responseData.data.fileCount,
      folderCount: responseData.data.folderCount,
      hasFiles: !!foundQuestion.files,
      hasFolders: !!foundQuestion.folders
    });

    res.status(200).json(responseData);

  } catch (error) {
    console.error("Get previous submission error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Internal server error"
    });
  }
};



// exports.submitMultipleFiles = async (req, res) => {
//   try {
//     const userId = req.user._id;
//     const {
//       courseId,
//       exerciseId,
//       questionId,
//       category,
//       subcategory,
//       selectedProgrammingLanguage,
//       nodeId = "",
//       nodeName = "",
//       nodeType = "",
//       screenRecord,
//       // Files array with folder paths
//       files = [],
//       // Folder hierarchy
//       folders = [],
//       folderHierarchy = [],
//       projectStructure = {},
//       entryPoints = [],
//       hasFolders = false,
//       folderCount = 0,
//       totalFiles = 0,
//       status = "submitted",
//       totalScore = 0,
//       score = 0,
//       feedback = "",
//       language = "multi-file",
//       isMultiFile = true
//     } = req.body;

//     // Validate required fields
//     if (!courseId || !exerciseId || !questionId) {
//       return res.status(400).json({
//         success: false,
//         message: "courseId, exerciseId, and questionId are required"
//       });
//     }

//     // Validate category
//     const validCategories = ['I_Do', 'We_Do', 'You_Do'];
//     if (!validCategories.includes(category)) {
//       return res.status(400).json({
//         success: false,
//         message: "Category must be one of: I_Do, We_Do, You_Do"
//       });
//     }

//     // Validate files array
//     if (!files || !Array.isArray(files) || files.length === 0) {
//       return res.status(400).json({
//         success: false,
//         message: "At least one file is required"
//       });
//     }

//     // Validate each file
//     for (const file of files) {
//       if (!file.filename || !file.content || !file.language) {
//         return res.status(400).json({
//           success: false,
//           message: "Each file must have filename, content, and language properties"
//         });
//       }
      
//       // Validate file extension matches language
//       const ext = file.filename.split('.').pop().toLowerCase();
//       const langExtMap = {
//         'html': ['html', 'htm'],
//         'css': ['css'],
//         'javascript': ['js', 'javascript'],
//         'json': ['json'],
//         'text': ['txt', 'md'],
//         'markdown': ['md', 'markdown'],
//         'xml': ['xml'],
//         'sql': ['sql']
//       };
      
//       if (langExtMap[file.language] && !langExtMap[file.language].includes(ext)) {
//         return res.status(400).json({
//           success: false,
//           message: `File ${file.filename} extension does not match language ${file.language}`
//         });
//       }
//     }

//     // Find user
//     const user = await User.findById(userId);
//     if (!user) {
//       return res.status(404).json({
//         success: false,
//         message: "User not found"
//       });
//     }

//     // Generate unique IDs for files and folders if not provided
//     const processedFiles = files.map(file => ({
//       id: file.id || `file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
//       filename: file.filename,
//       content: file.content,
//       language: file.language,
//       path: file.path || `/${file.filename}`,
//       folderPath: file.folderPath || '/',
//       size: Buffer.byteLength(file.content, 'utf8'),
//       isEntryPoint: file.isEntryPoint,
//       lastModified: file.lastModified || new Date()
//     }));

//     const processedFolders = folders.map(folder => ({
//       id: folder.id || `folder-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
//       name: folder.name,
//       path: folder.path,
//       parentPath: folder.parentPath || '/',
//       depth: folder.depth || 0,
//       fileCount: folder.children?.length || 0,
//       subfolderCount: folder.folderChildren?.length || 0
//     }));

//     // Prepare question answer with folder structure
//     const questionAnswer = {
//       questionId: new mongoose.Types.ObjectId(questionId),
//       questionTitle: req.body.questionTitle || `Question ${questionId}`,
//       files: processedFiles,
//       folders: processedFolders,
//       projectStructure: {
//         ...projectStructure,
//         folders: folderHierarchy.length > 0 ? folderHierarchy.map(f => ({
//           id: f.id || `folder-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
//           name: f.name,
//           path: f.path,
//           parentPath: f.parentPath || '/',
//           depth: f.depth || 0,
//           fileCount: f.fileCount || 0,
//           subfolderCount: f.subfolderCount || 0
//         })) : processedFolders,
//         folderTree: buildFolderTreeForDB(processedFolders, processedFiles),
//         hasFolders: hasFolders || processedFolders.length > 0,
//         totalFolders: folderCount || processedFolders.length,
//         totalFiles: totalFiles || processedFiles.length,
//         entryPoints: entryPoints,
//         fileDistribution: {
//           html: processedFiles.filter(f => f.language === 'html').length,
//           css: processedFiles.filter(f => f.language === 'css').length,
//           javascript: processedFiles.filter(f => f.language === 'javascript').length,
//           other: processedFiles.filter(f => !['html', 'css', 'javascript', 'sql'].includes(f.language)).length,
//           sql: processedFiles.filter(f => f.language === 'sql').length
//         }
//       },
    
//       codeAnswer: `Multi-file project with ${processedFiles.length} files${processedFolders.length > 0 ? ` in ${processedFolders.length} folders` : ''}`,
//       language: 'multi-file',
//       totalScore: totalScore,
//       score: score,
//       feedback: feedback,
//       status: status,
//       isCorrect: status === 'solved' || status === 'evaluated' || score >= 70,
//       attempts: 1,
//       submittedAt: new Date(),
//       fileStructure: {
//         totalFiles: processedFiles.length,
//         htmlFiles: processedFiles.filter(f => f.language === 'html').length,
//         cssFiles: processedFiles.filter(f => f.language === 'css').length,
//         jsFiles: processedFiles.filter(f => f.language === 'javascript').length,
//         sqlFiles: processedFiles.filter(f => f.language === 'sql').length,
//         otherFiles: processedFiles.filter(f => !['html', 'css', 'javascript', 'sql'].includes(f.language)).length,
//         folders: processedFolders.length,
//         folderStructure: processedFolders.map(f => ({
//           name: f.name,
//           path: f.path,
//           fileCount: f.fileCount
//         }))
//       }
//     };

//     // Helper function to build folder tree for DB storage
//     function buildFolderTreeForDB(foldersList, filesList) {
//       const tree = {};
      
//       // Create folder nodes
//       foldersList.forEach(folder => {
//         tree[folder.path] = {
//           id: folder.id,
//           name: folder.name,
//           path: folder.path,
//           parentPath: folder.parentPath || '/',
//           depth: folder.depth || 0,
//           children: [],
//           files: filesList
//             .filter(f => f.folderPath === folder.path)
//             .map(f => ({
//               id: f.id,
//               filename: f.filename,
//               language: f.language,
//               size: f.size
//             }))
//         };
//       });
      
//       // Build hierarchy
//       foldersList.forEach(folder => {
//         if (folder.parentPath !== '/' && tree[folder.parentPath]) {
//           tree[folder.parentPath].children.push(tree[folder.path]);
//         }
//       });
      
//       // Return root folders
//       return foldersList
//         .filter(folder => folder.parentPath === '/')
//         .map(folder => tree[folder.path]);
//     }

//     // Find or create course entry
//     let courseIndex = user.courses.findIndex(c => 
//       c.courseId && c.courseId.toString() === courseId
//     );

//     if (courseIndex === -1) {
//       user.courses.push({
//         courseId: new mongoose.Types.ObjectId(courseId),
//         answers: {
//           I_Do: new Map(),
//           We_Do: new Map(),
//           You_Do: new Map()
//         },
//         lastAccessed: new Date()
//       });
//       courseIndex = user.courses.length - 1;
//     }

//     // Ensure answers structure exists
//     if (!user.courses[courseIndex].answers) {
//       user.courses[courseIndex].answers = {
//         I_Do: new Map(),
//         We_Do: new Map(),
//         You_Do: new Map()
//       };
//     }

//     // Initialize category
//     if (!user.courses[courseIndex].answers[category]) {
//       user.courses[courseIndex].answers[category] = new Map();
//     }

//     // Determine exercise key
//     let exerciseKey;
//     if (category === 'We_Do' || category === 'You_Do') {
//       exerciseKey = subcategory || exerciseId.toString();
//     } else {
//       exerciseKey = exerciseId.toString();
//     }

//     // Get or create exercise array
//     let exerciseArray = user.courses[courseIndex].answers[category].get(exerciseKey);
//     if (!exerciseArray) {
//       exerciseArray = [];
//     }

//     // Find or create exercise
//     let exerciseIndex = exerciseArray.findIndex(
//       ex => ex.exerciseId && ex.exerciseId.toString() === exerciseId
//     );

//     if (exerciseIndex === -1) {
//       exerciseArray.push({
//         exerciseId: new mongoose.Types.ObjectId(exerciseId),
//         exerciseName: req.body.exerciseName || `Exercise ${exerciseId}`,
//         questions: [questionAnswer],
//         nodeId,
//         nodeName,
//         nodeType,
//         selectedProgrammingLanguage,
//         subcategory: (category === 'We_Do' || category === 'You_Do') ? subcategory : undefined,
//         screenRecording: screenRecord,
//         status: 'in-progress',
//         projectType: 'multi-file',
//         hasFolderStructure: processedFolders.length > 0,
//         folderCount: processedFolders.length
//       });
//     } else {
//       // Update existing exercise
//       const existingExercise = exerciseArray[exerciseIndex];
      
//       // Find existing question
//       const questionIndex = existingExercise.questions.findIndex(
//         q => q.questionId && q.questionId.toString() === questionId
//       );

//       if (questionIndex === -1) {
//         existingExercise.questions.push(questionAnswer);
//       } else {
//         existingExercise.questions[questionIndex] = {
//           ...existingExercise.questions[questionIndex],
//           ...questionAnswer,
//           attempts: (existingExercise.questions[questionIndex].attempts || 0) + 1,
//           updatedAt: new Date()
//         };
//       }

//       // Update exercise metadata
//       existingExercise.updatedAt = new Date();
//       existingExercise.projectType = 'multi-file';
//       existingExercise.hasFolderStructure = processedFolders.length > 0;
//       existingExercise.folderCount = processedFolders.length;
//       existingExercise.status = status === 'completed' ? 'completed' : existingExercise.status;
//     }

//     // Save back to map
//     user.courses[courseIndex].answers[category].set(exerciseKey, exerciseArray);

//     // Mark modified
//     user.markModified(`courses.${courseIndex}.answers.${category}`);
    
//     await user.save();

//     res.status(200).json({
//       success: true,
//       message: `Multi-file project submitted successfully${processedFolders.length > 0 ? ` with ${processedFolders.length} folders` : ''}`,
//       data: {
//         courseId,
//         exerciseId,
//         questionId,
//         category,
//         fileCount: processedFiles.length,
//         folderCount: processedFolders.length,
//         fileStructure: questionAnswer.fileStructure,
//         submittedFiles: processedFiles.map(f => ({
//           id: f.id,
//           filename: f.filename,
//           language: f.language,
//           folderPath: f.folderPath,
//           size: f.size,
//           isEntryPoint: f.isEntryPoint
//         })),
//         folders: processedFolders.map(f => ({
//           id: f.id,
//           name: f.name,
//           path: f.path,
//           parentPath: f.parentPath,
//           fileCount: f.fileCount
//         })),
//         entryPoints: questionAnswer.entryPoints,
//         projectStructure: questionAnswer.projectStructure
//       }
//     });

//   } catch (error) {
//     console.error("Submit multi-files error:", error);
//     res.status(500).json({
//       success: false,
//       message: error.message
//     });
//   }
// };

// exports.getPreviousSubmission = async (req, res) => {
//   try {
//     const userId = req.user._id;
//     const { courseId, exerciseId, questionId, category } = req.query;

//     // Validate
//     if (!courseId || !exerciseId || !questionId || !category) {
//       return res.status(400).json({
//         success: false,
//         message: "Missing required parameters"
//       });
//     }

//     const user = await User.findById(userId);
//     if (!user) {
//       return res.status(404).json({ success: false, message: "User not found" });
//     }

//     const course = user.courses.find(c => c.courseId.toString() === courseId);
//     if (!course) {
//       return res.status(404).json({ success: false, message: "Course not found" });
//     }

//     let foundQuestion = null;
//     let foundExercise = null;

//     // Search through the category
//     const categoryMap = course.answers[category];
//     if (categoryMap) {
//       for (const [key, exercises] of categoryMap) {
//         for (const exercise of exercises) {
//           if (exercise.exerciseId.toString() === exerciseId) {
//             foundExercise = exercise;
//             const question = exercise.questions.find(q => 
//               q.questionId && q.questionId.toString() === questionId
//             );
//             if (question) {
//               foundQuestion = question;
//               break;
//             }
//           }
//         }
//         if (foundQuestion) break;
//       }
//     }

//     if (!foundQuestion) {
//       return res.status(404).json({
//         success: false,
//         message: "No previous submission found"
//       });
//     }

//     // Return data in the format expected by frontend
//     res.status(200).json({
//       success: true,
//       data: {
//         htmlCode: foundQuestion.files?.find(f => f.language === 'html' && f.isEntryPoint)?.content || 
//                 foundQuestion.files?.find(f => f.language === 'html')?.content || "",
//         cssCode: foundQuestion.files?.find(f => f.language === 'css')?.content || "",
//         jsCode: foundQuestion.files?.find(f => f.language === 'javascript')?.content || "",
//         sqlCode: foundQuestion.files?.find(f => f.language === 'sql')?.content || "",
//         files: foundQuestion.files || [],
//         folders: foundQuestion.folders || [],
//         projectStructure: foundQuestion.projectStructure || {},
//         score: foundQuestion.score,
//         status: foundQuestion.status,
//         submittedAt: foundQuestion.submittedAt,
//         attempts: foundQuestion.attempts,
//         entryPoints: foundQuestion.entryPoints || []
//       }
//     });

//   } catch (error) {
//     console.error("Get previous submission error:", error);
//     res.status(500).json({
//       success: false,
//       message: error.message
//     });
//   }
// };



