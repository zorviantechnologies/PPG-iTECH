const express = require('express');
const router = express.Router();
const { getSystemStatus, getDbHealth } = require('../controllers/statusController');

router.get('/', getSystemStatus);
router.get('/db-health', getDbHealth);

module.exports = router;
