const express = require('express');
const router = express.Router();
const { protect, restrictTo } = require('../middleware/authMiddleware');
const {
    getStudents,
    getStudentById,
    createStudent,
    updateStudent,
    deleteStudent
} = require('../controllers/studentController');

router.use(protect);

router.route('/')
    .get(getStudents)
    .post(restrictTo('admin', 'staff', 'principal', 'hod', 'accounts'), createStudent);

router.route('/:id')
    .get(getStudentById)
    .put(restrictTo('admin', 'staff', 'principal', 'hod', 'accounts'), updateStudent)
    .delete(restrictTo('admin'), deleteStudent);

module.exports = router;
