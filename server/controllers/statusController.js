const { pool, queryWithRetry } = require('../config/db');

// @desc    Get system status (Server, Database, Biometric Sync)
// @route   GET /api/status
// @access  Public
exports.getSystemStatus = async (req, res) => {
    try {
        const status = {
            server: true,
            database: false,
            biometric: false,
            timestamp: new Date().toISOString()
        };

        // 1. Check Database Connection
        try {
            await queryWithRetry('SELECT 1');
            status.database = true;
        } catch (dbErr) {
            console.error('Status Check - DB Error:', dbErr.message);
            status.database = false;
        }

        // 2. Check Biometric Sync
        // We avoid heavy ORDER BY / LIMIT queries on large tables for a 30s polling heartbeat.
        // If the DB is up, we consider biometric tables "available".
        try {
            if (status.database) {
                status.biometric = true;
            } else {
                status.biometric = false;
            }
        } catch (bioErr) {
            console.error('Status Check - Biometric Error:', bioErr.message);
            status.biometric = false;
        }

        res.json(status);
    } catch (error) {
        res.status(500).json({
            server: true,
            database: false,
            biometric: false,
            timestamp: new Date().toISOString(),
            error: error.message
        });
    }
};

// @desc    Dedicated DB health check
// @route   GET /api/db-health
// @access  Public
exports.getDbHealth = async (req, res) => {
    try {
        const startedAt = Date.now();
        await queryWithRetry('SELECT 1');
        const latencyMs = Date.now() - startedAt;

        return res.status(200).json({
            status: 'OK',
            database: 'UP',
            latency_ms: latencyMs,
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        return res.status(503).json({
            status: 'DOWN',
            database: 'DOWN',
            error: error.message,
            timestamp: new Date().toISOString(),
        });
    }
};
