const { pool } = require('../config/db');

// @desc    Get timetable
// @route   GET /api/timetable
// @access  Private
exports.getTimetable = async (req, res) => {
    try {
        let { emp_id, department_id, academic_year, semester, section, day, all } = req.query;
        
        // If logged-in user is a student and filters aren't specified, automatically resolve student's class profile
        if (req.user.role === 'student' && !department_id && !emp_id) {
            const { rows: studentProfile } = await pool.query(
                `SELECT u.department_id, s.academic_year, s.semester, s.section 
                 FROM users u 
                 JOIN students s ON u.id = s.user_id 
                 WHERE u.emp_id = $1 OR u.id = $2`,
                [req.user.emp_id, req.user.id || 0]
            );
            if (studentProfile.length > 0) {
                department_id = studentProfile[0].department_id;
                academic_year = studentProfile[0].academic_year;
                semester = studentProfile[0].semester;
                section = studentProfile[0].section || 'A';
            }
        }

        let query = `
            SELECT t.*, u.name as staff_name, d.name as department_name 
            FROM timetable t
            LEFT JOIN users u ON t.emp_id = u.emp_id
            LEFT JOIN departments d ON t.department_id = d.id
            WHERE 1=1
        `;
        const params = [];

        if (emp_id) {
            query += ' AND t.emp_id = $' + (params.push(emp_id));
        }
        if (department_id) {
            query += ' AND t.department_id = $' + (params.push(department_id));
        }
        if (academic_year) {
            query += ' AND t.academic_year = $' + (params.push(parseInt(academic_year, 10)));
        }
        if (semester) {
            query += ' AND t.semester = $' + (params.push(parseInt(semester, 10)));
        }
        if (section && section !== 'All') {
            query += ' AND (t.section = $' + (params.push(section)) + " OR t.section IS NULL OR t.section = '')";
        }
        if (day) {
            query += ' AND t.day_of_week = $' + (params.push(day));
        }

        // Access Control & Defaults
        if (!emp_id && !department_id && all !== 'true') {
            if (req.user.role === 'staff') {
                query += ' AND t.emp_id = $' + (params.push(req.user.emp_id));
            } else if (req.user.role === 'hod') {
                query += ' AND (t.department_id = $' + (params.push(req.user.department_id)) + ' OR t.emp_id = $' + (params.push(req.user.emp_id)) + ')';
            }
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
            END, t.period_number, t.start_time`;

        const { rows } = await pool.query(query, params);
        res.json(rows);
    } catch (error) {
        console.error('GET TIMETABLE ERROR:', error);
        res.status(500).json({ message: 'Server Error: ' + error.message });
    }
};

// @desc    Create timetable entry
// @route   POST /api/timetable
// @access  Private (Admin, HOD, Staff)
exports.createTimetableEntry = async (req, res) => {
    const {
        emp_id, department_id, academic_year, semester, section,
        day_of_week, start_time, end_time, subject, subject_code, room_number
    } = req.body;

    const period_number = req.body.period_number !== undefined && req.body.period_number !== null && req.body.period_number !== ''
        ? parseInt(req.body.period_number, 10)
        : null;

    if (period_number === null || isNaN(period_number) || period_number < 1) {
        return res.status(400).json({ message: 'Period number is required and must be a valid positive integer.' });
    }
    if (!day_of_week) {
        return res.status(400).json({ message: 'Day of week is required.' });
    }
    if (!department_id && !emp_id) {
        return res.status(400).json({ message: 'Department or Staff member is required.' });
    }

    try {
        const resolvedEmpId = emp_id || null;
        const resolvedDeptId = department_id ? parseInt(department_id, 10) : null;
        const resolvedYear = academic_year ? parseInt(academic_year, 10) : 1;
        const resolvedSem = semester ? parseInt(semester, 10) : 1;
        const resolvedSec = section || 'A';

        await pool.query(
            `INSERT INTO timetable (
                emp_id, department_id, academic_year, semester, section,
                day_of_week, period_number, start_time, end_time, subject, subject_code, room_number
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
            [
                resolvedEmpId, resolvedDeptId, resolvedYear, resolvedSem, resolvedSec,
                day_of_week, period_number, start_time || null, end_time || null,
                subject || null, subject_code || null, room_number || null
            ]
        );
        res.status(201).json({ message: 'Timetable entry created successfully' });
    } catch (error) {
        console.error('CREATE TIMETABLE ERROR:', error);
        res.status(500).json({ message: 'Server Error: ' + error.message });
    }
};

// @desc    Update timetable entry
// @route   PUT /api/timetable/:id
// @access  Private (Admin, HOD, Staff)
exports.updateTimetableEntry = async (req, res) => {
    const {
        emp_id, department_id, academic_year, semester, section,
        day_of_week, start_time, end_time, subject, subject_code, room_number
    } = req.body;

    const period_number = req.body.period_number !== undefined && req.body.period_number !== null && req.body.period_number !== ''
        ? parseInt(req.body.period_number, 10)
        : null;

    if (period_number === null || isNaN(period_number)) {
        return res.status(400).json({ message: 'Period number is required and must be a valid integer.' });
    }

    try {
        const { rows: entryRows } = await pool.query('SELECT * FROM timetable WHERE id = $1', [req.params.id]);
        if (entryRows.length === 0) return res.status(404).json({ message: 'Timetable entry not found' });

        const resolvedEmpId = emp_id !== undefined ? (emp_id || null) : entryRows[0].emp_id;
        const resolvedDeptId = department_id !== undefined ? (department_id ? parseInt(department_id, 10) : null) : entryRows[0].department_id;
        const resolvedYear = academic_year !== undefined ? parseInt(academic_year, 10) : entryRows[0].academic_year;
        const resolvedSem = semester !== undefined ? parseInt(semester, 10) : entryRows[0].semester;
        const resolvedSec = section !== undefined ? section : entryRows[0].section;

        await pool.query(
            `UPDATE timetable SET 
                emp_id = $1, department_id = $2, academic_year = $3, semester = $4, section = $5,
                day_of_week = $6, period_number = $7, start_time = $8, end_time = $9,
                subject = $10, subject_code = $11, room_number = $12
            WHERE id = $13`,
            [
                resolvedEmpId, resolvedDeptId, resolvedYear, resolvedSem, resolvedSec,
                day_of_week, period_number, start_time || null, end_time || null,
                subject || null, subject_code || null, room_number || null, req.params.id
            ]
        );
        res.json({ message: 'Timetable entry updated successfully' });
    } catch (error) {
        console.error('UPDATE TIMETABLE ERROR:', error);
        res.status(500).json({ message: 'Server Error: ' + error.message });
    }
};

// @desc    Bulk Create / Replace timetable entries from Excel
// @route   POST /api/timetable/bulk
// @access  Private (Admin, HOD, Staff)
exports.bulkCreateTimetableEntries = async (req, res) => {
    const { department_id, academic_year, semester, section, entries } = req.body;

    if (!department_id || !academic_year || !semester) {
        return res.status(400).json({ message: 'Department, Academic Year, and Semester are required.' });
    }
    if (!Array.isArray(entries) || entries.length === 0) {
        return res.status(400).json({ message: 'No timetable entries provided in Excel file.' });
    }

    const deptId = parseInt(department_id, 10);
    const year = parseInt(academic_year, 10);
    const sem = parseInt(semester, 10);
    const sec = section || 'A';

    try {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Optionally clear existing entries for this class section before inserting new sheet
            await client.query(
                `DELETE FROM timetable 
                 WHERE department_id = $1 AND academic_year = $2 AND semester = $3 
                 AND (section = $4 OR section IS NULL OR section = '')`,
                [deptId, year, sem, sec]
            );

            let insertedCount = 0;
            for (const item of entries) {
                const day_of_week = item.day_of_week || item.Day || 'Monday';
                const period_number = parseInt(item.period_number || item['Period Number'] || 1, 10);
                const start_time = item.start_time || item['Start Time'] || null;
                const end_time = item.end_time || item['End Time'] || null;
                const subject = item.subject || item['Subject Name'] || item['Subject'] || '';
                const subject_code = item.subject_code || item['Subject Code'] || '';
                const room_number = item.room_number || item['Room Number'] || item['Room'] || '';
                const emp_id = item.emp_id || item['Staff ID'] || item['Faculty ID'] || null;

                if (subject.trim()) {
                    await client.query(
                        `INSERT INTO timetable (
                            emp_id, department_id, academic_year, semester, section,
                            day_of_week, period_number, start_time, end_time, subject, subject_code, room_number
                        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
                        [
                            emp_id, deptId, year, sem, sec,
                            day_of_week, period_number, start_time || null, end_time || null,
                            subject.trim(), subject_code ? subject_code.trim() : null, room_number ? room_number.trim() : null
                        ]
                    );
                    insertedCount++;
                }
            }

            await client.query('COMMIT');
            res.status(201).json({ message: `Successfully imported ${insertedCount} timetable periods.`, count: insertedCount });
        } catch (txErr) {
            await client.query('ROLLBACK');
            throw txErr;
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('BULK TIMETABLE ERROR:', error);
        res.status(500).json({ message: 'Failed to import timetable: ' + error.message });
    }
};

// @desc    Delete timetable entry
// @route   DELETE /api/timetable/:id
// @access  Private (Admin, HOD, Staff)
exports.deleteTimetableEntry = async (req, res) => {
    try {
        const { rows: entryRows } = await pool.query('SELECT id FROM timetable WHERE id = $1', [req.params.id]);
        if (entryRows.length === 0) return res.status(404).json({ message: 'Entry not found' });

        await pool.query('DELETE FROM timetable WHERE id = $1', [req.params.id]);
        res.json({ message: 'Timetable entry deleted successfully' });
    } catch (error) {
        console.error('DELETE TIMETABLE ERROR:', error);
        res.status(500).json({ message: 'Server Error: ' + error.message });
    }
};
