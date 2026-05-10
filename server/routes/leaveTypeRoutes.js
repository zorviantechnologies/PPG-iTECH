const express = require('express');
const router = express.Router();
const {
    getAllLeaveTypes,
    createLeaveType,
    updateLeaveType,
    deleteLeaveType
} = require('../controllers/leaveTypeController');
const { protect, restrictTo } = require('../middleware/authMiddleware');

router.use(protect);

// All authenticated users can view leave types
router.get('/', getAllLeaveTypes);

// Admin only: create, update, delete
router.post('/', restrictTo('admin'), createLeaveType);
router.put('/:id', restrictTo('admin'), updateLeaveType);
router.delete('/:id', restrictTo('admin'), deleteLeaveType);

module.exports = router;
