// routes/answerRoutes.js
const express = require('express');
const router = express.Router();
const { submitWeAnswer, getMyAnswers, getMySubmissions, getMyStatistics, updateMyAnswerScore, getAllUsers, getUserById, getUsersByCourse, evaluateStudentAnswer, getQuestionAnswersForEvaluation } = require('../../../controllers/courses/moduleStructure/answer');
const { userAuth } = require('../../../middlewares/userAuth');

const { 
  getAnswerByQuestionId 
} = require('../../../controllers/courses/moduleStructure/answer');



// Submit answer (logged-in user)
router.post('/courses/answers/submit', userAuth, submitWeAnswer);


router.get('/users/answer/:courseId', userAuth, getAllUsers);


router.post('/users/update/submission-score', userAuth,evaluateStudentAnswer);


// NEW ROUTE: Get single answer by questionId
router.get('/courses/answers/single', userAuth, getAnswerByQuestionId);


module.exports = router;