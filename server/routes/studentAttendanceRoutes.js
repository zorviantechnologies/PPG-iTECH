const express = require('express');
const router = express.Router();
const { protect, restrictTo } = require('../middleware/authMiddleware');
const {
    getAllocatedClasses,
    getStudentsForAttendance,
    markStudentAttendance,
    getMyAttendance,
    getAttendanceReport,
    generateAttendanceOTP,
    getActiveAttendanceOTP,
    verifyAttendanceOTP,
    getAttendanceAuditLogs
} = require('../controllers/studentAttendanceController');

router.use(protect);

// Allocations & Student list
router.get('/allocated-classes', restrictTo('staff', 'hod', 'admin', 'principal'), getAllocatedClasses);
router.get('/students-for-class', restrictTo('staff', 'hod', 'admin', 'principal'), getStudentsForAttendance);
router.post('/mark', restrictTo('staff', 'hod'), markStudentAttendance);

// OTP-based Attendance Mechanism
router.post('/generate-otp', restrictTo('staff', 'hod'), generateAttendanceOTP);
router.get('/active-otp', getActiveAttendanceOTP);
router.post('/verify-otp', restrictTo('student'), verifyAttendanceOTP);
router.get('/audit-logs', restrictTo('staff', 'hod', 'admin', 'principal'), getAttendanceAuditLogs);

// Student view
router.get('/my-attendance', getMyAttendance);

// Reports
router.get('/report', restrictTo('staff', 'hod', 'admin', 'principal'), getAttendanceReport);

module.exports = router;
