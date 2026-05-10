const express = require('express');
const router = express.Router();
const multer = require('multer');
const {
    getEmployees,
    getEmployeeById,
    createEmployee,
    updateEmployee,
    deleteEmployee,
    getTodayBirthdays,
    importEmployeesFromFile,
    getEmployeeImportHistory,
    rollbackEmployeeImport,
    downloadEmployeeImportSample
} = require('../controllers/employeeController');
const { protect, restrictTo } = require('../middleware/authMiddleware');

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const name = String(file?.originalname || '').toLowerCase();
        if (name.endsWith('.xlsx') || name.endsWith('.csv')) {
            return cb(null, true);
        }
        return cb(new Error('Only .xlsx or .csv files are allowed for import.'));
    }
});

router.use(protect);

router.get('/birthdays/today', getTodayBirthdays);
router.get('/import/sample', restrictTo('admin'), downloadEmployeeImportSample);
router.get('/import/history', restrictTo('admin'), getEmployeeImportHistory);
router.post('/import', restrictTo('admin'), upload.single('file'), importEmployeesFromFile);
router.post('/import/:importId/rollback', restrictTo('admin'), rollbackEmployeeImport);

router.get('/', getEmployees);
router.post('/', restrictTo('admin'), createEmployee);

router.route('/:id')
    .get(getEmployeeById)
    .put(restrictTo('admin'), updateEmployee)
    .delete(restrictTo('admin'), deleteEmployee);

module.exports = router;
