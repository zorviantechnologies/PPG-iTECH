const { pool } = require('../config/db');

// Helper to safely parse integers and avoid "undefined" string casting errors in PostgreSQL
const safeInt = (val, fallback = null) => {
    if (val === undefined || val === null || val === 'undefined' || val === 'null' || val === '') return fallback;
    const parsed = parseInt(val, 10);
    return isNaN(parsed) ? fallback : parsed;
};

// @desc    Get timetable
// @route   GET /api/timetable
// @access  Private
exports.getTimetable = async (req, res) => {
    try {
        let { emp_id, department_id, academic_year, semester, section, day, all } = req.query;
        
        // If logged-in user is a student and filters aren't specified, automatically resolve student's class profile
        if (req.user.role === 'student' && (!department_id || department_id === 'undefined') && (!emp_id || emp_id === 'undefined')) {
            const { rows: studentProfile } = await pool.query(
                `SELECT u.department_id, s.academic_year, s.semester, s.section 
                 FROM users u 
                 JOIN students s ON u.id = s.user_id 
                 WHERE u.emp_id = $1 OR u.id = $2`,
                [req.user.emp_id || '', req.user.id || 0]
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
            LEFT JOIN users u ON (t.emp_id = u.emp_id OR CAST(u.id AS VARCHAR) = t.emp_id)
            LEFT JOIN departments d ON t.department_id = d.id
            WHERE 1=1
        `;
        const params = [];

        if (emp_id && emp_id !== 'undefined' && emp_id !== 'null') {
            query += ' AND t.emp_id = $' + (params.push(emp_id));
        }
        if (department_id && department_id !== 'undefined' && department_id !== 'null') {
            const dId = safeInt(department_id, null);
            if (dId !== null) query += ' AND t.department_id = $' + (params.push(dId));
        }
        if (academic_year && academic_year !== 'undefined' && academic_year !== 'null') {
            const yr = safeInt(academic_year, null);
            if (yr !== null) query += ' AND t.academic_year = $' + (params.push(yr));
        }
        if (semester && semester !== 'undefined' && semester !== 'null') {
            const sem = safeInt(semester, null);
            if (sem !== null) query += ' AND t.semester = $' + (params.push(sem));
        }
        if (section && section !== 'All' && section !== 'undefined') {
            query += ' AND (t.section = $' + (params.push(section)) + " OR t.section IS NULL OR t.section = '')";
        }
        if (day && day !== 'undefined') {
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

    const period_number = safeInt(req.body.period_number, null);

    if (period_number === null || period_number < 1) {
        return res.status(400).json({ message: 'Period number is required and must be a valid positive integer.' });
    }
    if (!day_of_week || day_of_week === 'undefined') {
        return res.status(400).json({ message: 'Day of week is required.' });
    }
    
    const resolvedDeptId = safeInt(department_id, null);
    const resolvedEmpId = (emp_id === 'undefined' || emp_id === 'null' || !emp_id) ? null : emp_id;

    if (!resolvedDeptId && !resolvedEmpId) {
        return res.status(400).json({ message: 'Department or Staff member is required.' });
    }

    try {
        const resolvedYear = safeInt(academic_year, 1);
        const resolvedSem = safeInt(semester, 1);
        const resolvedSec = section && section !== 'undefined' ? section : 'A';

        let finalStartTime = start_time || null;
        let finalEndTime = end_time || null;

        if ((!finalStartTime || !finalEndTime) && period_number) {
            const { rows: cfgRows } = await pool.query(
                'SELECT start_time, end_time FROM timetable_config WHERE period_number = $1 LIMIT 1',
                [period_number]
            );
            if (cfgRows.length > 0) {
                if (!finalStartTime) finalStartTime = cfgRows[0].start_time;
                if (!finalEndTime) finalEndTime = cfgRows[0].end_time;
            }
        }

        await pool.query(
            `INSERT INTO timetable (
                emp_id, department_id, academic_year, semester, section,
                day_of_week, period_number, start_time, end_time, subject, subject_code, room_number
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
            [
                resolvedEmpId, resolvedDeptId, resolvedYear, resolvedSem, resolvedSec,
                day_of_week, period_number, finalStartTime, finalEndTime,
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
    const entryId = safeInt(req.params.id, null);
    if (!entryId) {
        return res.status(400).json({ message: 'Invalid or missing timetable entry ID.' });
    }

    const {
        emp_id, department_id, academic_year, semester, section,
        day_of_week, start_time, end_time, subject, subject_code, room_number
    } = req.body;

    try {
        const { rows: entryRows } = await pool.query('SELECT * FROM timetable WHERE id = $1', [entryId]);
        if (entryRows.length === 0) return res.status(404).json({ message: 'Timetable entry not found' });

        const period_number = safeInt(req.body.period_number, entryRows[0].period_number);
        if (period_number === null || period_number < 1) {
            return res.status(400).json({ message: 'Period number is required and must be a valid positive integer.' });
        }

        const resolvedEmpId = emp_id !== undefined ? ((emp_id === 'undefined' || emp_id === 'null' || !emp_id) ? null : emp_id) : entryRows[0].emp_id;
        const resolvedDeptId = department_id !== undefined ? safeInt(department_id, entryRows[0].department_id) : entryRows[0].department_id;
        const resolvedYear = academic_year !== undefined ? safeInt(academic_year, entryRows[0].academic_year) : entryRows[0].academic_year;
        const resolvedSem = semester !== undefined ? safeInt(semester, entryRows[0].semester) : entryRows[0].semester;
        const resolvedSec = (section !== undefined && section !== 'undefined') ? section : entryRows[0].section;
        const resolvedDay = (day_of_week && day_of_week !== 'undefined') ? day_of_week : entryRows[0].day_of_week;

        let finalStartTime = start_time || entryRows[0].start_time;
        let finalEndTime = end_time || entryRows[0].end_time;

        if ((!finalStartTime || !finalEndTime) && period_number) {
            const { rows: cfgRows } = await pool.query(
                'SELECT start_time, end_time FROM timetable_config WHERE period_number = $1 LIMIT 1',
                [period_number]
            );
            if (cfgRows.length > 0) {
                if (!finalStartTime) finalStartTime = cfgRows[0].start_time;
                if (!finalEndTime) finalEndTime = cfgRows[0].end_time;
            }
        }

        await pool.query(
            `UPDATE timetable SET 
                emp_id = $1, department_id = $2, academic_year = $3, semester = $4, section = $5,
                day_of_week = $6, period_number = $7, start_time = $8, end_time = $9,
                subject = $10, subject_code = $11, room_number = $12
            WHERE id = $13`,
            [
                resolvedEmpId, resolvedDeptId, resolvedYear, resolvedSem, resolvedSec,
                resolvedDay, period_number, finalStartTime, finalEndTime,
                subject || null, subject_code || null, room_number || null, entryId
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
        const entryId = safeInt(req.params.id, null);
        if (!entryId) {
            return res.status(400).json({ message: 'Invalid or missing timetable entry ID.' });
        }

        const { rows: entryRows } = await pool.query('SELECT id FROM timetable WHERE id = $1', [entryId]);
        if (entryRows.length === 0) return res.status(404).json({ message: 'Entry not found' });

        await pool.query('DELETE FROM timetable WHERE id = $1', [entryId]);
        res.json({ message: 'Timetable entry deleted successfully' });
    } catch (error) {
        console.error('DELETE TIMETABLE ERROR:', error);
        res.status(500).json({ message: 'Server Error: ' + error.message });
    }
};
