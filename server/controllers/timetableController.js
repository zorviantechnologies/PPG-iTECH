const { pool } = require('../config/db');

// @desc    Get timetable
// @route   GET /api/timetable
// @access  Private
exports.getTimetable = async (req, res) => {
    try {
        const { emp_id, department_id, day } = req.query;
        let query = `
            SELECT t.*, u.name as staff_name 
            FROM timetable t
            JOIN users u ON t.emp_id = u.emp_id
            WHERE 1=1
        `;
        const params = [];

        if (emp_id) {
            query += ' AND t.emp_id = $' + (params.push(emp_id));
        }
        if (day) {
            query += ' AND t.day_of_week = $' + (params.push(day));
        }

        // Department filter logic:
        // Timetable is linked to staff (emp_id).
        // If filtering by dept, need to join users and check department_id. (Already joined)
        if (department_id) {
            query += ' AND u.department_id = $' + (params.push(department_id));
        }

        // Access Control & Defaults
        if (!emp_id && !department_id && req.query.all !== 'true') {
            // Default: show only their own timetable
            query += ' AND t.emp_id = $' + (params.push(req.user.emp_id));
        } else if (req.user.role === 'hod') {
            // HODs are restricted to their own department when viewing others
            if (!department_id) {
                query += ' AND u.department_id = $' + (params.push(req.user.department_id));
            }
        } else if (req.user.role === 'staff' && req.query.all !== 'true') {
             // Staff can only view their own OR a specific emp_id if they have the ID (implicitly allowed by the first IF or by providing emp_id)
             // We'll keep the department filter restricted if they try to use it? 
             // Actually, the current logic allows viewing any emp_id if passed. 
             // We'll stick to defaulting to self if nothing is passed.
        }

        query += ` ORDER BY 
            CASE day_of_week 
                WHEN 'Monday' THEN 1 
                WHEN 'Tuesday' THEN 2 
                WHEN 'Wednesday' THEN 3 
                WHEN 'Thursday' THEN 4 
                WHEN 'Friday' THEN 5 
                WHEN 'Saturday' THEN 6 
                WHEN 'Sunday' THEN 7 
                ELSE 8 
            END, t.start_time`;

        const { rows } = await pool.query(query, params);
        res.json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Create/Update timetable entry
// @route   POST /api/timetable
// @access  Private (Admin, HOD)
exports.createTimetableEntry = async (req, res) => {
    const {
        emp_id, day_of_week,
        start_time, end_time, subject, subject_code, room_number
    } = req.body;

    // Safely parse period_number as integer
    const period_number = req.body.period_number !== undefined && req.body.period_number !== null && req.body.period_number !== ''
        ? parseInt(req.body.period_number, 10)
        : null;

    if (period_number === null || isNaN(period_number) || period_number < 1) {
        return res.status(400).json({ message: 'Period number is required and must be a valid positive integer.' });
    }
    if (!emp_id) {
        return res.status(400).json({ message: 'Staff member (emp_id) is required.' });
    }
    if (!day_of_week) {
        return res.status(400).json({ message: 'Day of week is required.' });
    }

    try {
        // Staff can only manage their own timetable
        const resolvedEmpId = req.user.role === 'staff' ? req.user.emp_id : emp_id;

        // If HOD, check if staff belongs to their department
        if (req.user.role === 'hod') {
            const { rows: staffRows } = await pool.query('SELECT department_id FROM users WHERE emp_id = $1', [resolvedEmpId]);
            if (staffRows.length === 0 || staffRows[0].department_id !== req.user.department_id) {
                return res.status(403).json({ message: 'Not authorized to manage this staff timetable' });
            }
        }

        await pool.query(
            'INSERT INTO timetable (emp_id, day_of_week, period_number, start_time, end_time, subject, subject_code, room_number) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
            [resolvedEmpId, day_of_week, period_number, start_time || null, end_time || null, subject || null, subject_code || null, room_number || null]
        );
        res.status(201).json({ message: 'Timetable entry created' });
    } catch (error) {
        console.error('CREATE TIMETABLE ERROR:', {
            error: error.message,
            stack: error.stack,
            body: req.body
        });
        res.status(500).json({ message: 'Server Error: ' + error.message });
    }
};

// @desc    Update timetable entry
// @route   PUT /api/timetable/:id
// @access  Private (Admin, HOD)
exports.updateTimetableEntry = async (req, res) => {
    const {
        emp_id, day_of_week,
        start_time, end_time, subject, subject_code, room_number
    } = req.body;

    // Safely parse period_number as integer
    const period_number = req.body.period_number !== undefined && req.body.period_number !== null && req.body.period_number !== ''
        ? parseInt(req.body.period_number, 10)
        : null;

    if (period_number === null || isNaN(period_number)) {
        return res.status(400).json({ message: 'Period number is required and must be a valid integer (1-8).' });
    }

    try {
        const { rows: entryRows } = await pool.query('SELECT emp_id FROM timetable WHERE id = $1', [req.params.id]);
        if (entryRows.length === 0) return res.status(404).json({ message: 'Entry not found' });

        // Staff can only update their own entries
        if (req.user.role === 'staff' && entryRows[0].emp_id !== req.user.emp_id) {
            return res.status(403).json({ message: 'You can only edit your own timetable entries.' });
        }

        const targetEmpId = req.user.role === 'staff' ? req.user.emp_id : (emp_id || entryRows[0].emp_id);

        if (req.user.role === 'hod') {
            const { rows: staffRows } = await pool.query('SELECT department_id FROM users WHERE emp_id = $1', [targetEmpId]);
            if (staffRows.length === 0 || staffRows[0].department_id !== req.user.department_id) {
                return res.status(403).json({ message: 'Not authorized to manage this staff timetable' });
            }
        }

        await pool.query(
            'UPDATE timetable SET emp_id = $1, day_of_week = $2, period_number = $3, start_time = $4, end_time = $5, subject = $6, subject_code = $7, room_number = $8 WHERE id = $9',
            [targetEmpId, day_of_week, period_number, start_time || null, end_time || null, subject || null, subject_code || null, room_number || null, req.params.id]
        );
        res.json({ message: 'Timetable entry updated' });
    } catch (error) {
        console.error('UPDATE TIMETABLE ERROR:', {
            error: error.message,
            stack: error.stack,
            body: req.body,
            id: req.params.id
        });
        res.status(500).json({ message: 'Server Error: ' + error.message });
    }
};

// @desc    Delete timetable entry
// @route   DELETE /api/timetable/:id
// @access  Private (Admin, HOD)
exports.deleteTimetableEntry = async (req, res) => {
    try {
        const { rows: entryRows } = await pool.query('SELECT emp_id FROM timetable WHERE id = $1', [req.params.id]);
        if (entryRows.length === 0) return res.status(404).json({ message: 'Entry not found' });

        // Staff can only delete their own entries
        if (req.user.role === 'staff' && entryRows[0].emp_id !== req.user.emp_id) {
            return res.status(403).json({ message: 'You can only delete your own timetable entries.' });
        }

        if (req.user.role === 'hod') {
            const { rows: staffRows } = await pool.query('SELECT department_id FROM users WHERE emp_id = $1', [entryRows[0].emp_id]);
            if (staffRows.length === 0 || staffRows[0].department_id !== req.user.department_id) {
                return res.status(403).json({ message: 'Not authorized' });
            }
        }

        await pool.query('DELETE FROM timetable WHERE id = $1', [req.params.id]);
        res.json({ message: 'Timetable entry deleted' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};
