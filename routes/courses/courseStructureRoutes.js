const express = require("express");
const { userAuth } = require("../../middlewares/userAuth");
const {
  createCourseStructure,
  getCourseStructure,
  getCourseStructureById,
  updateCourseStructure,
  deleteCourseStructure,
} = require("../../controllers/courses/courseStructure");
const router = express.Router();

router.post("/courses-structure/create", userAuth, createCourseStructure);

router.get("/courses-structure/getAll", userAuth, getCourseStructure);

router.get("/courses-structure/getById/:id", userAuth, getCourseStructureById);
router.put("/courses-structure/update/:id", userAuth, updateCourseStructure);
router.delete("/courses-structure/delete/:id", userAuth, deleteCourseStructure);

module.exports = router;
