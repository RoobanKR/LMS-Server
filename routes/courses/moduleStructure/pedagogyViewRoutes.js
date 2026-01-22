const express = require("express");
const router = express.Router();
const { userAuth } = require("../../../middlewares/userAuth");
const {
  createPedagogyView,
  getAllPedagogyViews,
  getPedagogyViewById,
  updatePedagogyView,
  deletePedagogyView,
  deleteDocument,
  getAllCoursesData,
  duplicateCourseHierarchy,
  updateEntity,
  updateFileSettings,
  addExercise,
  updateExercise,
  deleteExercise,
  getExercises,
  addQuestion,
  getQuestions,
  getQuestionById,
  updateQuestion,
  deleteQuestion,
  getAllCoursesDataWithoutAINotes,
  studentDashboardAnalyticsOptimized,
  lockExercise,
  getExerciseStatus,
} = require("../../../controllers/courses/moduleStructure/pedagogyView");

// Routes
router.post("/pedagogy-view/create", userAuth, createPedagogyView);
router.get("/pedagogy-view/getAll", userAuth, getAllPedagogyViews);
router.get("/pedagogy-view/getByid/:id", userAuth, getPedagogyViewById);
router.put("/pedagogy-view/update/:id", userAuth, updatePedagogyView);
router.delete(
  "/pedagogy-view/delete/:activityType/:itemId",
  deletePedagogyView
);

router.delete("/delete/:model/:id", deleteDocument);

// common data fetch for course related data
router.get("/getAll/courses-data/:courseId", getAllCoursesData);
router.get(
  "/getAll/courses-data/without-ai-notes/:courseId/:exerciseId",
  getAllCoursesDataWithoutAINotes
);

router.get(
  "/student-Dashboard/courses-data/analytics",
  userAuth,
  studentDashboardAnalyticsOptimized
);

router.post("/dupicate-date", userAuth, duplicateCourseHierarchy);

router.put("/uploadResourses/:type/:id", updateEntity);

router.put("/uploadResourses/:type/:id", userAuth, updateFileSettings);

// We Do Routes can be added here in future

router.put("/exercise/add/:type/:id", addExercise);

// Update a specific exercise by ID
router.put("/exercise/update/:type/:id/:exerciseId", updateExercise);

// Delete a specific exercise by ID
router.delete("/exercise/delete/:type/:id/:exerciseId", deleteExercise);

// Get exercises by subcategory
router.get("/exercise/get/:type/:id", getExercises);

router.post("/question-add/:type/:id/exercise/:exerciseId", addQuestion);

// Get all questions for an exercise
router.get("/questions-get/:type/:id/:exerciseId", getQuestions);

// Get single question by ID
router.get(
  "/exercise/:exerciseId/question/:questionId/question-getByid",
  getQuestionById
);

// Update question
router.put(
  "/question-update/:type/:id/:exerciseId/:questionId",
  updateQuestion
);

// Delete question
router.delete(
  "/question-delete/:type/:id/:exerciseId/:questionId",
  deleteQuestion
);

router.post('/exercise/lock', 
  userAuth,
  lockExercise
); 
// 2. Check Exercise Status
router.get("/exercise/status", userAuth, getExerciseStatus)
module.exports = router;
