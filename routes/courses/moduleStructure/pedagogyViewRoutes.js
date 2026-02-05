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
 
  getAllCoursesDataWithoutAINotes,
  studentDashboardAnalyticsOptimized,
  staffDashboardAnalytics,
  getStudentCourseProgress,
  staffStudentAnalytics,

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

router.put("/uploadResourses/:type/:id", updateEntity);

router.put("/uploadResourses/:type/:id", userAuth, updateFileSettings);

// We Do Routes can be added here in future


module.exports = router;
