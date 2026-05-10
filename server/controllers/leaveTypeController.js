const { pool } = require('../config/db');

// @desc    Get all leave types
// @route   GET /api/leave-types
// @access  Private (any authenticated user)
exports.getAllLeaveTypes = async (req, res) => {
    try {
        const { rows } = await pool.query(
            'SELECT * FROM leave_types ORDER BY is_default DESC, id ASC'
        );
        res.json(rows);
    } catch (error) {
        console.error('getAllLeaveTypes ERROR:', error);
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

// @desc    Create a new leave type
// @route   POST /api/leave-types
// @access  Admin only
exports.createLeaveType = async (req, res) => {
    try {
        const { key, label, full_name, color, default_days } = req.body;

        if (!key || !label || !full_name) {
            return res.status(400).json({ message: 'Key, label, and full_name are required' });
        }

        // Check if key already exists
        const { rows: existing } = await pool.query(
            'SELECT id FROM leave_types WHERE key = $1', [key]
        );
        if (existing.length > 0) {
            return res.status(400).json({ message: 'A leave type with this key already exists' });
        }

        const { rows } = await pool.query(
            `INSERT INTO leave_types (key, label, full_name, color, default_days, is_default)
             VALUES ($1, $2, $3, $4, $5, FALSE)
             RETURNING *`,
            [key, label, full_name, color || 'blue', default_days || 12]
        );

        res.status(201).json(rows[0]);
    } catch (error) {
        console.error('createLeaveType ERROR:', error);
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

// @desc    Update a leave type
// @route   PUT /api/leave-types/:id
// @access  Admin only
exports.updateLeaveType = async (req, res) => {
    try {
        const { id } = req.params;
        const { key, label, full_name, color, default_days } = req.body;

        if (!key || !label || !full_name) {
            return res.status(400).json({ message: 'Key, label, and full_name are required' });
        }

        // Check duplicate key (excluding self)
        const { rows: existing } = await pool.query(
            'SELECT id FROM leave_types WHERE key = $1 AND id != $2', [key, id]
        );
        if (existing.length > 0) {
            return res.status(400).json({ message: 'Another leave type with this key already exists' });
        }

        const { rows } = await pool.query(
            `UPDATE leave_types 
             SET key = $1, label = $2, full_name = $3, color = $4, default_days = $5, updated_at = NOW()
             WHERE id = $6
             RETURNING *`,
            [key, label, full_name, color || 'blue', default_days || 12, id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ message: 'Leave type not found' });
        }

        res.json(rows[0]);
    } catch (error) {
        console.error('updateLeaveType ERROR:', error);
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

// @desc    Delete a leave type
// @route   DELETE /api/leave-types/:id
// @access  Admin only
exports.deleteLeaveType = async (req, res) => {
    try {
        const { id } = req.params;

        // Check if it's a default type
        const { rows: check } = await pool.query(
            'SELECT is_default, label FROM leave_types WHERE id = $1', [id]
        );
        if (check.length === 0) {
            return res.status(404).json({ message: 'Leave type not found' });
        }
        if (check[0].is_default) {
            return res.status(400).json({ message: 'Cannot delete default leave types' });
        }

        await pool.query('DELETE FROM leave_types WHERE id = $1', [id]);
        res.json({ message: 'Leave type deleted successfully' });
    } catch (error) {
        console.error('deleteLeaveType ERROR:', error);
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};
