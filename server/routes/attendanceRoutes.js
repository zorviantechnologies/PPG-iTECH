const express = require('express');
const router = express.Router();
const { getAttendance, getAttendanceSummary, getAttendanceTrend, getAttendanceStatusOptions } = require('../controllers/attendanceController');
const { protect, restrictTo } = require('../middleware/authMiddleware');

router.use(protect);

router.get('/', getAttendance);
router.get('/status-options', getAttendanceStatusOptions);
router.get('/summary', getAttendanceSummary);
router.get('/stats/trend', getAttendanceTrend);

module.exports = router;
