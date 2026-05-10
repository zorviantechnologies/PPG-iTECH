const express = require('express');
const router = express.Router();
const {
    createPurchaseRequest,
    getPurchaseRequests,
    updatePurchaseStatus,
    deletePurchaseRequest
} = require('../controllers/purchaseController');
const { protect } = require('../middleware/authMiddleware');

router.use(protect);

router.route('/')
    .post(createPurchaseRequest)
    .get(getPurchaseRequests);

router.route('/:id/status')
    .put(updatePurchaseStatus);

router.route('/:id')
    .delete(deletePurchaseRequest);

module.exports = router;
