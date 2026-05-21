// routes/progressRoutes.js
const express = require('express');
const router = express.Router();
const progressController = require('../controllers/dynamicContent/progressController');

// Apply auth middleware to all routes

// PATCH endpoints for progress tracking
router.patch(
  '/progress/:userId/courses/:courseId/visit-node',
  progressController.recordNodeVisit
);

router.patch(
  '/progress/:userId/courses/:courseId/open-resource',
  progressController.recordResourceOpen
);

// GET endpoint to fetch progress
router.get(
  '/progress/:userId/courses/:courseId',
  progressController.getProgress
);

module.exports = router;