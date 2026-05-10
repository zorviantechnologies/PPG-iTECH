const { pool } = require('../config/db');

// @desc    Get all departments
// @route   GET /api/departments
// @access  Private
exports.getDepartments = async (req, res) => {
    try {
        let query = 'SELECT * FROM departments';
        const params = [];

        if (req.user.role === 'hod' || req.user.role === 'staff') {
            query += ' WHERE id = $1';
            params.push(req.user.department_id);
        }

        const { rows } = await pool.query(query, params);
        res.json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Create department
// @route   POST /api/departments
// @access  Private (Admin)
exports.createDepartment = async (req, res) => {
    const { name, code } = req.body;
    try {
        await pool.query('INSERT INTO departments (name, code) VALUES ($1, $2)', [name, code]);
        res.status(201).json({ message: 'Department created' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Update department
// @route   PUT /api/departments/:id
// @access  Private (Admin)
exports.updateDepartment = async (req, res) => {
    const { name, code } = req.body;
    try {
        await pool.query('UPDATE departments SET name = $1, code = $2 WHERE id = $3', [name, code, req.params.id]);
        res.json({ message: 'Department updated' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Delete department
// @route   DELETE /api/departments/:id
// @access  Private (Admin)
exports.deleteDepartment = async (req, res) => {
    try {
        await pool.query('DELETE FROM departments WHERE id = $1', [req.params.id]);
        res.json({ message: 'Department deleted' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};
