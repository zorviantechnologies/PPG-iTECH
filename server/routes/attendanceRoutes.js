const express = require('express');
const router = express.Router();
const { getAttendance, getAttendanceSummary, getAttendanceTrend, getAttendanceStatusOptions, updateAttendance } = require('../controllers/attendanceController');
const { protect, restrictTo } = require('../middleware/authMiddleware');

router.use(protect);

router.get('/', getAttendance);
router.get('/status-options', getAttendanceStatusOptions);
router.get('/summary', getAttendanceSummary);
router.get('/stats/trend', getAttendanceTrend);
router.put('/:recordId', updateAttendance);

module.exports = router;
