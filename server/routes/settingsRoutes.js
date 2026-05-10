const express = require('express');
const router = express.Router();
const { getSettings, updateSetting } = require('../controllers/settingsController');
const { protect, restrictTo } = require('../middleware/authMiddleware');

router.use(protect);

router.route('/')
    .get(getSettings);

router.route('/:key')
    .put(restrictTo('admin'), updateSetting);

module.exports = router;
