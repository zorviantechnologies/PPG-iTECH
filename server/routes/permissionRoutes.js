const express = require('express');
const router = express.Router();
const {
    applyPermission,
    getPermissions,
    approvePermission,
    deletePermission
} = require('../controllers/permissionController');
const { protect } = require('../middleware/authMiddleware');

router.use(protect);

router.route('/')
    .post(applyPermission)
    .get(getPermissions);

router.put('/:id/approve', approvePermission);
router.delete('/:id', deletePermission);

module.exports = router;
