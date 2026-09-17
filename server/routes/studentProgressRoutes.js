const express = require('express');
const router = express.Router();
const { protect, restrictTo } = require('../middleware/authMiddleware');
const {
    getStudentProgressProfile,
    updateAcademicDetails,
    saveProject,
    deleteProject,
    addCertification,
    deleteCertification,
    addInternship,
    deleteInternship,
    addSkill,
    deleteSkill,
    saveCodingProfiles,
    fetchPublicCodingStats
} = require('../controllers/studentProgressController');

router.use(protect);

router.get('/profile', getStudentProgressProfile);
router.put('/academic-details', updateAcademicDetails);

// Portfolio Projects
router.post('/projects', saveProject);
router.delete('/projects/:id', deleteProject);

// Certifications
router.post('/certifications', addCertification);
router.delete('/certifications/:id', deleteCertification);

// Internships
router.post('/internships', addInternship);
router.delete('/internships/:id', deleteInternship);

// Skills
router.post('/skills', addSkill);
router.delete('/skills/:id', deleteSkill);

// Coding Profiles & Public Stats
router.post('/coding-profiles', saveCodingProfiles);
router.post('/fetch-coding-stats', fetchPublicCodingStats);

module.exports = router;
