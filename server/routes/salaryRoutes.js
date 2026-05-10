const express = require('express');
const router = express.Router();
const {
    calculateSalary,
    getSalaryRecords,
    getSalaryTimeline,
    getDailyBreakdown,
    updateSalaryStatus,
    publishSalaries,
    notifyPaid,
    createSalaryReport,
    getSalaryReports,
    replySalaryReport
} = require('../controllers/salaryController');
const { protect, restrictTo } = require('../middleware/authMiddleware');

router.use(protect);

router.post('/calculate', restrictTo('admin', 'management'), calculateSalary);
router.post('/publish', restrictTo('admin', 'management'), publishSalaries);
router.post('/notify-paid', restrictTo('admin', 'management'), notifyPaid);
router.post('/reports', createSalaryReport);
router.get('/reports', getSalaryReports);
router.put('/reports/:id/reply', restrictTo('admin', 'management'), replySalaryReport);
router.get('/daily', getDailyBreakdown);
router.get('/timeline', getSalaryTimeline);
router.get('/', getSalaryRecords);
router.put('/:id/status', restrictTo('admin', 'management'), updateSalaryStatus);

module.exports = router;
