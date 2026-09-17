const { queryWithRetry, withDbClient } = require('../config/db');

// @desc    Get allocated classes and subjects for logged-in staff
// @route   GET /api/student-attendance/allocated-classes
// @access  Private (Staff, HOD, Admin, Principal)
exports.getAllocatedClasses = async (req, res) => {
    try {
        const { role, emp_id, department_id } = req.user;

        let query = `
            SELECT DISTINCT 
                t.department_id,
                d.name as department_name,
                t.academic_year,
                t.semester,
                COALESCE(t.section, 'A') as section,
                t.subject,
                t.subject_code,
                t.emp_id,
                u.name as staff_name,
                t.day_of_week,
                t.period_number,
                t.start_time,
                t.end_time
            FROM timetable t
            LEFT JOIN departments d ON t.department_id = d.id
            LEFT JOIN users u ON t.emp_id = u.emp_id
            WHERE 1=1
        `;

        const params = [];
        let paramIndex = 1;

        // Role-based restrictions
        if (role === 'staff') {
            query += ` AND t.emp_id = $${paramIndex++}`;
            params.push(emp_id);
        } else if (role === 'hod' && department_id) {
            query += ` AND (t.department_id = $${paramIndex++} OR t.emp_id = $${paramIndex++})`;
            params.push(department_id, emp_id);
        }

        query += ` ORDER BY t.academic_year ASC, t.semester ASC, t.subject ASC`;

        const { rows } = await queryWithRetry(query, params);

        // Fallback: If staff has no timetable entries, fetch department default classes
        if (rows.length === 0 && role === 'staff' && department_id) {
            const { rows: fallbackRows } = await queryWithRetry(`
                SELECT 
                    d.id as department_id,
                    d.name as department_name,
                    1 as academic_year,
                    1 as semester,
                    'A' as section,
                    'General Class' as subject,
                    'GEN101' as subject_code
                FROM departments d
                WHERE d.id = $1
            `, [department_id]);
            return res.json(fallbackRows);
        }

        res.json(rows);
    } catch (error) {
        console.error('Error fetching allocated classes:', error);
        res.status(500).json({ message: 'Failed to fetch allocated classes: ' + error.message });
    }
};

// @desc    Get student list for a class with existing attendance status
// @route   GET /api/student-attendance/students-for-class
// @access  Private (Staff, HOD, Admin, Principal)
exports.getStudentsForAttendance = async (req, res) => {
    try {
        const {
            department_id,
            academic_year,
            semester,
            section = 'A',
            date,
            period_number,
            subject
        } = req.query;

        if (!department_id || !academic_year || !semester) {
            return res.status(400).json({ message: 'Department, Academic Year, and Semester are required.' });
        }

        // 1. Check if logged in staff is allocated to this class/subject in timetable
        let isAllocated = true;
        if (req.user.role === 'staff') {
            const { rows: allocCheck } = await queryWithRetry(`
                SELECT id FROM timetable 
                WHERE emp_id = $1 
                  AND department_id = $2 
                  AND academic_year = $3 
                  AND semester = $4
            `, [req.user.emp_id, department_id, academic_year, semester]);

            if (allocCheck.length === 0) {
                isAllocated = false;
            }
        }

        // 2. Fetch all students belonging to this class profile
        const { rows: students } = await queryWithRetry(`
            SELECT 
                s.id as student_id,
                s.user_id,
                s.reg_no,
                s.roll_no,
                s.academic_year,
                s.semester,
                s.section,
                u.name,
                u.gender,
                u.profile_pic,
                d.name as department_name
            FROM students s
            JOIN users u ON s.user_id = u.id
            LEFT JOIN departments d ON u.department_id = d.id
            WHERE u.department_id = $1
              AND s.academic_year = $2
              AND s.semester = $3
              AND (LOWER(s.section) = LOWER($4) OR $4 = 'All' OR s.section IS NULL)
              AND u.role = 'student'
            ORDER BY s.reg_no ASC, u.name ASC
        `, [department_id, academic_year, semester, section]);

        // 3. Fetch existing attendance records if date and period_number are specified
        let existingAttendanceMap = {};
        if (date && period_number) {
            const { rows: attRecords } = await queryWithRetry(`
                SELECT student_id, status, subject, subject_code, marked_by_emp_id
                FROM student_attendance
                WHERE department_id = $1
                  AND academic_year = $2
                  AND semester = $3
                  AND date = $4
                  AND period_number = $5
            `, [department_id, academic_year, semester, date, period_number]);

            attRecords.forEach(rec => {
                existingAttendanceMap[rec.student_id] = rec;
            });
        }

        // 4. Combine student list with attendance status
        const studentsWithAttendance = students.map(st => {
            const att = existingAttendanceMap[st.student_id];
            return {
                ...st,
                status: att ? att.status : 'Present', // Default to Present for quick marking
                is_marked: !!att,
                marked_by_emp_id: att ? att.marked_by_emp_id : null
            };
        });

        res.json({
            is_allocated: isAllocated,
            count: studentsWithAttendance.length,
            students: studentsWithAttendance
        });

    } catch (error) {
        console.error('Error fetching students for attendance:', error);
        res.status(500).json({ message: 'Failed to fetch student list: ' + error.message });
    }
};

// @desc    Record/Update hour-wise student attendance
// @route   POST /api/student-attendance/mark
// @access  Private (Staff, HOD, Admin, Principal)
exports.markStudentAttendance = async (req, res) => {
    const {
        department_id,
        academic_year,
        semester,
        section = 'A',
        subject,
        subject_code,
        date,
        period_number,
        start_time,
        end_time,
        attendance_records
    } = req.body;

    if (!department_id || !academic_year || !semester || !subject || !date || !period_number) {
        return res.status(400).json({ message: 'Department, Academic Year, Semester, Subject, Date, and Period Number are required.' });
    }

    if (!Array.isArray(attendance_records) || attendance_records.length === 0) {
        return res.status(400).json({ message: 'No student attendance records provided.' });
    }

    // Allocation enforcement for staff role
    if (req.user.role === 'staff') {
        const { rows: allocCheck } = await queryWithRetry(`
            SELECT id FROM timetable 
            WHERE emp_id = $1 
              AND department_id = $2 
              AND academic_year = $3 
              AND semester = $4
        `, [req.user.emp_id, department_id, academic_year, semester]);

        if (allocCheck.length === 0) {
            return res.status(403).json({
                message: 'Access Denied: You are not authorized or allocated to record attendance for this subject/class.'
            });
        }
    }

    try {
        const marked_by_emp_id = req.user.emp_id || String(req.user.id);

        await withDbClient(async (client) => {
            await client.query('BEGIN');

            for (const rec of attendance_records) {
                const { student_id, user_id, status } = rec;
                const finalStatus = (status || 'Present').trim() === 'Absent' ? 'Absent' : 'Present';

                await client.query(`
                    INSERT INTO student_attendance (
                        student_id,
                        user_id,
                        department_id,
                        academic_year,
                        semester,
                        section,
                        subject,
                        subject_code,
                        date,
                        period_number,
                        start_time,
                        end_time,
                        status,
                        marked_by_emp_id,
                        updated_at
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, CURRENT_TIMESTAMP)
                    ON CONFLICT (student_id, date, period_number)
                    DO UPDATE SET
                        status = EXCLUDED.status,
                        subject = EXCLUDED.subject,
                        subject_code = EXCLUDED.subject_code,
                        marked_by_emp_id = EXCLUDED.marked_by_emp_id,
                        updated_at = CURRENT_TIMESTAMP
                `, [
                    student_id,
                    user_id,
                    department_id,
                    academic_year,
                    semester,
                    section,
                    subject,
                    subject_code || '',
                    date,
                    period_number,
                    start_time || '',
                    end_time || '',
                    finalStatus,
                    marked_by_emp_id
                ]);
            }

            await client.query('COMMIT');
        });

        res.status(200).json({
            message: `Successfully recorded attendance for ${attendance_records.length} students for Period ${period_number} on ${date}.`,
            count: attendance_records.length
        });

    } catch (error) {
        console.error('Error recording student attendance:', error);
        res.status(500).json({ message: 'Failed to record attendance: ' + error.message });
    }
};

// @desc    Get student's own attendance (Hour-wise, Date-wise, Subject breakdown)
// @route   GET /api/student-attendance/my-attendance
// @access  Private (Student, or Admin/Staff with student query)
exports.getMyAttendance = async (req, res) => {
    try {
        let targetUserId = req.user.id;
        let targetEmpId = req.user.emp_id;

        // If admin/staff querying for a specific student
        if (['admin', 'staff', 'hod', 'principal'].includes(req.user.role) && req.query.user_id) {
            targetUserId = req.query.user_id;
        }

        // Find student profile info
        const { rows: studentProfiles } = await queryWithRetry(`
            SELECT 
                s.id as student_id,
                s.user_id,
                s.reg_no,
                s.roll_no,
                s.academic_year,
                s.semester,
                s.section,
                s.batch,
                u.name as student_name,
                u.email,
                u.department_id,
                d.name as department_name
            FROM students s
            JOIN users u ON s.user_id = u.id
            LEFT JOIN departments d ON u.department_id = d.id
            WHERE u.id = $1 OR s.id = $1 OR u.emp_id = $2
        `, [targetUserId, targetEmpId || '']);

        if (studentProfiles.length === 0) {
            return res.status(404).json({ message: 'Student profile not found' });
        }

        const student = studentProfiles[0];

        // Filters
        const { academic_year, semester, month, subject, date } = req.query;

        let attQuery = `
            SELECT 
                sa.id,
                sa.student_id,
                sa.user_id,
                sa.department_id,
                sa.academic_year,
                sa.semester,
                sa.section,
                sa.subject,
                sa.subject_code,
                sa.date,
                sa.period_number,
                sa.start_time,
                sa.end_time,
                sa.status,
                sa.marked_by_emp_id,
                sa.created_at,
                u.name as marked_by_name
            FROM student_attendance sa
            LEFT JOIN users u ON sa.marked_by_emp_id = u.emp_id OR sa.marked_by_emp_id = CAST(u.id AS VARCHAR)
            WHERE sa.student_id = $1
        `;

        const params = [student.student_id];
        let paramIndex = 2;

        if (academic_year && academic_year !== 'all') {
            attQuery += ` AND sa.academic_year = $${paramIndex++}`;
            params.push(academic_year);
        }

        if (semester && semester !== 'all') {
            attQuery += ` AND sa.semester = $${paramIndex++}`;
            params.push(semester);
        }

        if (month && month !== 'all') {
            attQuery += ` AND TO_CHAR(sa.date, 'YYYY-MM') = $${paramIndex++}`;
            params.push(month);
        }

        if (subject && subject !== 'all') {
            attQuery += ` AND LOWER(sa.subject) = LOWER($${paramIndex++})`;
            params.push(subject);
        }

        if (date && date !== 'all') {
            attQuery += ` AND sa.date = $${paramIndex++}`;
            params.push(date);
        }

        attQuery += ` ORDER BY sa.date DESC, sa.period_number ASC`;

        const { rows: attendanceLogs } = await queryWithRetry(attQuery, params);

        // Compute summary calculations
        const workingHours = attendanceLogs.length; // Each record represents 1 hour/period session
        const hoursAttended = attendanceLogs.filter(a => a.status === 'Present').length;
        const absentHours = attendanceLogs.filter(a => a.status === 'Absent').length;
        const attendancePercentage = workingHours > 0 ? ((hoursAttended / workingHours) * 100).toFixed(1) : '100.0';

        // Compute Subject-wise breakdown
        const subjectMap = {};
        attendanceLogs.forEach(log => {
            const key = log.subject || 'General';
            if (!subjectMap[key]) {
                subjectMap[key] = {
                    subject: key,
                    subject_code: log.subject_code || '',
                    working_hours: 0,
                    hours_attended: 0,
                    absent_hours: 0,
                    percentage: '100.0'
                };
            }
            subjectMap[key].working_hours += 1;
            if (log.status === 'Present') {
                subjectMap[key].hours_attended += 1;
            } else {
                subjectMap[key].absent_hours += 1;
            }
        });

        const subjectSummary = Object.values(subjectMap).map(sub => {
            const pct = sub.working_hours > 0 ? ((sub.hours_attended / sub.working_hours) * 100).toFixed(1) : '100.0';
            return {
                ...sub,
                percentage: pct,
                is_eligible: parseFloat(pct) >= 75.0
            };
        });

        res.json({
            student_profile: student,
            summary: {
                working_hours: workingHours,
                hours_attended: hoursAttended,
                absent_hours: absentHours,
                attendance_percentage: attendancePercentage,
                is_eligible: parseFloat(attendancePercentage) >= 75.0
            },
            subject_summary: subjectSummary,
            attendance_logs: attendanceLogs
        });

    } catch (error) {
        console.error('Error fetching student attendance details:', error);
        res.status(500).json({ message: 'Failed to fetch student attendance: ' + error.message });
    }
};

// @desc    Get overall class attendance summary report for staff/admin
// @route   GET /api/student-attendance/report
// @access  Private (Staff, HOD, Admin, Principal)
exports.getAttendanceReport = async (req, res) => {
    try {
        const { department_id, academic_year, semester, section = 'A', month, date } = req.query;

        let query = `
            SELECT 
                s.id as student_id,
                s.reg_no,
                s.roll_no,
                u.name as student_name,
                COUNT(sa.id) as total_conducted_hours,
                COUNT(CASE WHEN sa.status = 'Present' THEN 1 END) as attended_hours,
                COUNT(CASE WHEN sa.status = 'Absent' THEN 1 END) as absent_hours
            FROM students s
            JOIN users u ON s.user_id = u.id
            LEFT JOIN student_attendance sa ON s.id = sa.student_id
        `;

        const params = [];
        let paramIndex = 1;
        const whereClauses = ["u.role = 'student'"];

        if (department_id) {
            whereClauses.push(`u.department_id = $${paramIndex++}`);
            params.push(department_id);
        }
        if (academic_year) {
            whereClauses.push(`s.academic_year = $${paramIndex++}`);
            params.push(academic_year);
        }
        if (semester) {
            whereClauses.push(`s.semester = $${paramIndex++}`);
            params.push(semester);
        }
        if (section && section !== 'All') {
            whereClauses.push(`LOWER(s.section) = LOWER($${paramIndex++})`);
            params.push(section);
        }
        if (month) {
            whereClauses.push(`TO_CHAR(sa.date, 'YYYY-MM') = $${paramIndex++}`);
            params.push(month);
        }

        query += ` WHERE ` + whereClauses.join(' AND ');
        query += ` GROUP BY s.id, s.reg_no, s.roll_no, u.name ORDER BY s.reg_no ASC`;

        const { rows } = await queryWithRetry(query, params);

        const report = rows.map(r => {
            const conducted = parseInt(r.total_conducted_hours, 10) || 0;
            const attended = parseInt(r.attended_hours, 10) || 0;
            const absent = parseInt(r.absent_hours, 10) || 0;
            const pct = conducted > 0 ? ((attended / conducted) * 100).toFixed(1) : '100.0';
            return {
                ...r,
                total_conducted_hours: conducted,
                attended_hours: attended,
                absent_hours: absent,
                percentage: pct,
                is_eligible: parseFloat(pct) >= 75.0
            };
        });

        res.json(report);
    } catch (error) {
        console.error('Error generating attendance report:', error);
        res.status(500).json({ message: 'Failed to generate attendance report: ' + error.message });
    }
};
