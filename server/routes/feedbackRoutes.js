const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const {
	submitFeedback,
	getFeedbackInbox,
	deleteFeedback,
	bulkDeleteFeedback
} = require('../controllers/feedbackController');

router.post('/', protect, submitFeedback);
router.get('/inbox', protect, getFeedbackInbox);
router.delete('/', protect, bulkDeleteFeedback);
router.delete('/:id', protect, deleteFeedback);

module.exports = router;
