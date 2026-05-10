const express = require('express');
const router = express.Router();
const { loginUser, getUserProfile, updateProfilePic, managementLogin, updateProfile, updateProfileName, checkEmployeeId, updateManagementProfile } = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');

router.post('/login', loginUser);
router.post('/check-id', checkEmployeeId);
router.post('/management-login', managementLogin);
router.get('/profile', protect, getUserProfile);
router.put('/profile', protect, updateProfile);
router.put('/profile-name', protect, updateProfileName);
router.put('/profile-pic', protect, updateProfilePic);
router.put('/management-profile', protect, updateManagementProfile);

module.exports = router;
