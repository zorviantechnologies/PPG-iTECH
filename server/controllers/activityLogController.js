const { pool } = require('../config/db');

// @desc    Get activity logs
// @route   GET /api/activity-logs
// @access  Private (Admin)
exports.getActivityLogs = async (req, res) => {
    try {
        const { rows } = await pool.query(`
            SELECT a.*, COALESCE(u.name, 'Unknown / Unregistered') as user_name, COALESCE(u.emp_id, a.details->>'emp_id') as emp_id
            FROM activity_logs a
            LEFT JOIN users u ON a.user_id = u.id
            ORDER BY a.created_at DESC
            LIMIT 500
        `);
        res.json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};
