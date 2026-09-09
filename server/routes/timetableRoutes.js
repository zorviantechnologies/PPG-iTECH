const express = require('express');
const router = express.Router();
const {
    getTimetable,
    createTimetableEntry,
    updateTimetableEntry,
    deleteTimetableEntry,
    bulkCreateTimetableEntries
} = require('../controllers/timetableController');
const {
    getTimetableConfig,
    saveTimetableConfig
} = require('../controllers/timetableConfigController');
const { protect, restrictTo } = require('../middleware/authMiddleware');

router.use(protect);

// Timetable Config (periods setup)
router.route('/config')
    .get(getTimetableConfig)
    .put(restrictTo('admin'), saveTimetableConfig);

// Bulk upload route
router.post('/bulk', restrictTo('admin', 'hod', 'staff'), bulkCreateTimetableEntries);

// Timetable entries
router.route('/')
    .get(getTimetable)
    .post(restrictTo('admin', 'hod', 'staff'), createTimetableEntry);

router.route('/:id')
    .put(restrictTo('admin', 'hod', 'staff'), updateTimetableEntry)
    .delete(restrictTo('admin', 'hod', 'staff'), deleteTimetableEntry);

module.exports = router;
