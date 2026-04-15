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
  updateEntity,          // ← must be here
  updateFileSettings,    // ← keep this too
  getAllCoursesDataWithoutAINotes,
  studentDashboardAnalyticsOptimized,
  getStudentCourseProgress,
  staffStudentAnalytics,
  createPage,
  updatePage,
  deletePage,
  addMCQQuestionToFile,
  getExerciseSubmissionStatus,

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

router.get(
  '/analytics/staff/analytics/students',
  userAuth,
  staffStudentAnalytics
);

router.get(
  '/analytics/staff/analytics/student-progress/:courseId/:studentId',
  userAuth,
 getStudentCourseProgress
);

router.post("/dupicate-date", userAuth, duplicateCourseHierarchy);

// ✅ ONLY these two lines for uploadResourses — no duplicates
router.put("/uploadResourses/:type/:id",          userAuth, updateEntity);
router.put("/uploadResourses/:type/:id/settings", userAuth, updateFileSettings);

// Pages routes
router.post(  "/pages/:type/:id/pages",         userAuth, createPage);
router.put(   "/pages/:type/:id/pages/:pageId", userAuth, updatePage);
router.delete("/pages/:type/:id/pages/:pageId", userAuth, deletePage);

router.post('/file-mcq-add/:type/:id', userAuth, addMCQQuestionToFile);

// Check which exercises have at least one student submission
// Query: courseId, tabType, subcategory, exerciseIds (comma-separated)
router.get('/analytics/exercise-submission-status', userAuth, getExerciseSubmissionStatus);
// In your routes file, update the two page routes:

// All three must have the same /pages/ prefix

module.exports = router;
