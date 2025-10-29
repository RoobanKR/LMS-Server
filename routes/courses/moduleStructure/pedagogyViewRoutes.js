const express = require('express');
const router = express.Router();
const { userAuth } = require('../../../middlewares/userAuth');
const { createPedagogyView, getAllPedagogyViews, getPedagogyViewById, updatePedagogyView, deletePedagogyView, deleteDocument, getAllCoursesData, duplicateCourseHierarchy, updateEntity } = require('../../../controllers/courses/moduleStructure/pedagogyView');

// Routes
router.post('/pedagogy-view/create',userAuth, createPedagogyView);
router.get('/pedagogy-view/getAll',userAuth, getAllPedagogyViews);
router.get('/pedagogy-view/getByid/:id',userAuth, getPedagogyViewById);
router.put('/pedagogy-view/update/:id',userAuth, updatePedagogyView);
router.delete('/pedagogy-view/delete/:activityType/:itemId', deletePedagogyView);


router.delete('/delete/:model/:id', deleteDocument);


// common data fetch for course related data
router.get('/getAll/courses-data/:courseId', getAllCoursesData);

router.post('/dupicate-date',userAuth, duplicateCourseHierarchy);

router.put("/uploadResourses/:type/:id", updateEntity);

module.exports = router;
