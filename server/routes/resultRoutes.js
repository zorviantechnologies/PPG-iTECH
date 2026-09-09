const express = require('express');
const router = express.Router();
const { protect, restrictTo } = require('../middleware/authMiddleware');
const {
    getResults,
    uploadBulkResults,
    publishResults,
    deleteResult,
    getMyResults
} = require('../controllers/resultController');

router.use(protect);

router.get('/my-results', getMyResults);

router.route('/')
    .get(getResults);

router.post('/upload', restrictTo('admin', 'staff', 'principal', 'hod', 'accounts'), uploadBulkResults);
router.put('/publish', restrictTo('admin', 'staff', 'principal', 'hod', 'accounts'), publishResults);

router.delete('/:id', restrictTo('admin', 'staff'), deleteResult);

module.exports = router;
