const express = require('express');
const router = express.Router();
const {
    applyLeave,
    getLeaveRequests,
    approveLeaveStep,
    deleteLeaveRequest,
    getLeaveConflicts,
    getAllLeaveHistory,
    getEligibleCompDates,
    applyCompCredit,
    uploadMedicalDocuments
} = require('../controllers/leaveController');
const { protect, restrictTo } = require('../middleware/authMiddleware');

router.use(protect);

router.route('/')
    .post(applyLeave)
    .get(getLeaveRequests);

router.get('/conflicts', getLeaveConflicts);
router.get('/history', restrictTo('principal', 'admin'), getAllLeaveHistory);
router.get('/comp-dates', getEligibleCompDates);
router.post('/comp-credit', applyCompCredit);
router.post('/:id/medical-documents', uploadMedicalDocuments);

router.route('/:id/approve')
    .put(approveLeaveStep);

router.route('/:id')
    .delete(deleteLeaveRequest);

module.exports = router;
