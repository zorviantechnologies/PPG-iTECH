const express = require('express');
const router = express.Router();
const { getNotifications, markAsRead, markAllRead, subscribePush } = require('../controllers/notificationController');
const { protect } = require('../middleware/authMiddleware');

router.use(protect);

router.get('/', getNotifications);
router.post('/subscribe', subscribePush);
router.put('/read-all', markAllRead);
router.put('/:id/read', markAsRead);

module.exports = router;
