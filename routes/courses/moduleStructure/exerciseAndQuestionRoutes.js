const express = require("express");
const router = express.Router();
const { userAuth } = require("../../../middlewares/userAuth");
const {
  addExercise,
  updateExercise,
  deleteExercise,
  getExercises,
  addQuestion,
  getQuestions,
  getQuestionById,
  updateQuestion,
  deleteQuestion,
  lockExercise,
  getExerciseStatus,
  getCourseExercisesWithUserScores,
  getEnrolledStudentsForExercise,
  getStudentExerciseQuestions,
  getCourseExercisesAdminView,
  getUserExerciseGradeAnalytics,
  getExerciseById,
} = require("../../../controllers/courses/moduleStructure/exerciseAndQuestion");

// We Do Routes can be added here in future

router.put("/exercise/add/:type/:id", userAuth, addExercise);

// Update a specific exercise by ID
router.put("/exercise/update/:type/:id/:exerciseId", userAuth, updateExercise);

// Delete a specific exercise by ID
router.delete(
  "/exercise/delete/:type/:id/:exerciseId",
  userAuth,
  deleteExercise,
);

// Get exercises by subcategory
router.get("/exercise/get/:type/:id", userAuth, getExercises);

router.post(
  "/question-add/:type/:id/exercise/:exerciseId",
  userAuth,
  addQuestion,
);

// Get all questions for an exercise
router.get("/questions-get/:type/:id/:exerciseId", userAuth, getQuestions);

// Get single question by ID
router.get(
  "/exercise/:exerciseId/question/:questionId/question-getByid",
  userAuth,
  getQuestionById,
);

// Update question
router.put(
  "/question-update/:type/:id/:exerciseId/:questionId",
  userAuth,
  updateQuestion,
);

// Delete question
router.delete(
  "/question-delete/:type/:id/:exerciseId/:questionId",
  userAuth,
  deleteQuestion,
);


// Route for getting all exercises with user scores
router.get(
  '/course/:courseId/exercises-with-scores',
  userAuth,
  getCourseExercisesWithUserScores
);


router.get('/course/:courseId/exercises', userAuth, getCourseExercisesAdminView); // NEW ROUTE
router.get('/exercises/:courseId/:exerciseId/students', userAuth, getEnrolledStudentsForExercise); // NEW ROUTE


router.get(
  '/course/:courseId/student/:studentId/exercise/:exerciseId/questions',
  userAuth,
  getStudentExerciseQuestions
);

router.get(
  '/analytics/exercise/:exerciseId',
  userAuth,
  getUserExerciseGradeAnalytics
);
 

router.post("/exercise/lock", userAuth, lockExercise);
// 2. Check Exercise Status
router.get("/exercise/status", userAuth, getExerciseStatus);

router.get("/exercise/:exerciseId", userAuth, getExerciseById);


module.exports = router;
