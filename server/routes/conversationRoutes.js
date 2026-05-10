const express = require('express');
const router = express.Router();
const {
    createConversation,
    getConversations,
    getMessages,
    sendMessage,
    updateConversation,
    deleteConversation,
    updateMessage,
    deleteMessage
} = require('../controllers/conversationController');
const { protect } = require('../middleware/authMiddleware');

router.use(protect);

router.route('/')
    .post(createConversation)
    .get(getConversations);

router.route('/:id')
    .put(updateConversation)
    .delete(deleteConversation);

router.route('/:id/messages')
    .get(getMessages)
    .post(sendMessage);

router.route('/messages/:id')
    .put(updateMessage)
    .delete(deleteMessage);

module.exports = router;
