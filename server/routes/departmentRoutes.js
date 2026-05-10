const express = require('express');
const router = express.Router();
const { getDepartments, createDepartment, deleteDepartment, updateDepartment } = require('../controllers/departmentController');
const { protect, restrictTo } = require('../middleware/authMiddleware');

router.use(protect);

router.route('/')
    .get(getDepartments)
    .post(restrictTo('admin'), createDepartment);

router.route('/:id')
    .put(restrictTo('admin'), updateDepartment)
    .delete(restrictTo('admin'), deleteDepartment);

module.exports = router;
