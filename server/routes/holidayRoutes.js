const express = require('express');
const router = express.Router();
const { getHolidays, updateHoliday, deleteHoliday } = require('../controllers/holidayController');
const { protect, restrictTo } = require('../middleware/authMiddleware');

router.get('/', protect, getHolidays);
router.post('/', protect, restrictTo('admin'), updateHoliday);
router.delete('/:date', protect, restrictTo('admin'), deleteHoliday);

module.exports = router;
