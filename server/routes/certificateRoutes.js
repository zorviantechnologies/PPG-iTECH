const express = require('express');
const router = express.Router();
const {
    uploadCertificate,
    getCertificates,
    getCertificateFile,
    deleteCertificate
} = require('../controllers/certificateController');
const { protect } = require('../middleware/authMiddleware');

router.use(protect);

// Get certificate file (must be above /:userId to avoid route clash)
router.get('/file/:certId', getCertificateFile);

// Upload & list certificates for a user (admin can upload for anyone, user can upload for self)
router.post('/:userId', uploadCertificate);
router.get('/:userId', getCertificates);

// Delete a certificate (admin can delete any, user can delete own)
router.delete('/:certId', deleteCertificate);

module.exports = router;
