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

            // Record audit log for manual marking
            await client.query(`
                INSERT INTO attendance_audit_logs (
                    action, user_id, emp_id, user_role, department_id, academic_year, semester, section, subject, period_number, date, status, details
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'SUCCESS', $12)
            `, [
                'ATTENDANCE_MARKED',
                req.user.id,
                marked_by_emp_id,
                req.user.role,
                department_id,
                academic_year,
                semester,
                section,
                subject,
                period_number,
                date,
                `Recorded manual attendance for ${attendance_records.length} students`
            ]);

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

// @desc    Generate temporary attendance OTP (valid for 15 seconds ONLY)
// @route   POST /api/student-attendance/generate-otp
// @access  Private (Staff, HOD, Admin, Principal)
exports.generateAttendanceOTP = async (req, res) => {
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
        end_time
    } = req.body;

    if (!department_id || !academic_year || !semester || !subject || !date || !period_number) {
        return res.status(400).json({ message: 'Department, Academic Year, Semester, Subject, Date, and Period Number are required.' });
    }

    try {
        const emp_id = req.user.emp_id || String(req.user.id);
        const otp_code = Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit OTP
        const expiresAt = new Date(Date.now() + 15 * 1000); // 15 Seconds Expiry!

        await withDbClient(async (client) => {
            await client.query('BEGIN');

            // Deactivate previous active OTPs for the same session
            await client.query(`
                UPDATE attendance_otps 
                SET is_active = FALSE 
                WHERE department_id = $1 AND academic_year = $2 AND semester = $3 
                  AND section = $4 AND period_number = $5 AND date = $6
            `, [department_id, academic_year, semester, section, period_number, date]);

            // Insert new 15s OTP
            await client.query(`
                INSERT INTO attendance_otps (
                    otp_code, created_by_emp_id, created_by_user_id, department_id, academic_year,
                    semester, section, subject, subject_code, date, period_number, start_time,
                    end_time, expires_at, is_active
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, TRUE)
            `, [
                otp_code,
                emp_id,
                req.user.id,
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
                expiresAt
            ]);

            // Insert Audit Log
            await client.query(`
                INSERT INTO attendance_audit_logs (
                    action, user_id, emp_id, user_role, department_id, academic_year, semester, section,
                    subject, period_number, date, otp_code, status, details
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'SUCCESS', $13)
            `, [
                'OTP_GENERATED',
                req.user.id,
                emp_id,
                req.user.role,
                department_id,
                academic_year,
                semester,
                section,
                subject,
                period_number,
                date,
                otp_code,
                `Generated 15s attendance OTP for Period ${period_number}`
            ]);

            await client.query('COMMIT');
        });

        res.status(201).json({
            message: 'Attendance OTP generated successfully (Valid for 15 Seconds)',
            otp_code,
            validity_seconds: 15,
            expires_at: expiresAt.toISOString()
        });

    } catch (error) {
        console.error('Error generating attendance OTP:', error);
        res.status(500).json({ message: 'Failed to generate attendance OTP: ' + error.message });
    }
};

// @desc    Get active attendance OTP for class session
// @route   GET /api/student-attendance/active-otp
// @access  Private (All authenticated roles)
exports.getActiveAttendanceOTP = async (req, res) => {
    try {
        const { department_id, academic_year, semester, section = 'A', date, period_number } = req.query;

        const { rows } = await queryWithRetry(`
            SELECT 
                id, otp_code, created_by_emp_id, department_id, academic_year, semester, section,
                subject, subject_code, date, period_number, start_time, end_time, expires_at,
                GREATEST(0, ROUND(EXTRACT(EPOCH FROM (expires_at - CURRENT_TIMESTAMP)))) as remaining_seconds
            FROM attendance_otps
            WHERE is_active = TRUE
              AND expires_at > CURRENT_TIMESTAMP
              ${department_id ? 'AND department_id = $1' : ''}
              ${academic_year ? `AND academic_year = ${department_id ? '$2' : '$1'}` : ''}
              ${semester ? `AND semester = ${department_id ? '$3' : '$2'}` : ''}
            ORDER BY expires_at DESC LIMIT 1
        `, [department_id, academic_year, semester].filter(Boolean));

        if (rows.length === 0) {
            return res.json({ has_active_otp: false, active_otp: null });
        }

        const activeOtp = rows[0];

        // For student role, omit raw otp_code so they must enter the code displayed by staff
        if (req.user.role === 'student') {
            return res.json({
                has_active_otp: true,
                session_info: {
                    department_id: activeOtp.department_id,
                    academic_year: activeOtp.academic_year,
                    semester: activeOtp.semester,
                    section: activeOtp.section,
                    subject: activeOtp.subject,
                    period_number: activeOtp.period_number,
                    date: activeOtp.date,
                    remaining_seconds: parseInt(activeOtp.remaining_seconds, 10) || 0
                }
            });
        }

        // For staff/admin, return OTP code and countdown
        res.json({
            has_active_otp: true,
            active_otp: {
                ...activeOtp,
                remaining_seconds: parseInt(activeOtp.remaining_seconds, 10) || 0
            }
        });

    } catch (error) {
        console.error('Error fetching active attendance OTP:', error);
        res.status(500).json({ message: 'Failed to fetch active OTP status' });
    }
};

// @desc    Verify student attendance using active 15s OTP
// @route   POST /api/student-attendance/verify-otp
// @access  Private (Student)
exports.verifyAttendanceOTP = async (req, res) => {
    const { otp_code, department_id, academic_year, semester, section, subject, period_number, date } = req.body;

    const cleanOtp = String(otp_code || '').trim();

    if (!cleanOtp) {
        return res.status(400).json({ message: 'OTP code is required' });
    }

    try {
        // 1. Fetch student profile
        const { rows: stRows } = await queryWithRetry(`
            SELECT s.id as student_id, s.user_id, s.academic_year, s.semester, s.section, u.department_id, u.name
            FROM students s
            JOIN users u ON s.user_id = u.id
            WHERE u.id = $1
        `, [req.user.id]);

        if (stRows.length === 0) {
            return res.status(404).json({ message: 'Student profile record not found' });
        }

        const student = stRows[0];

        // 2. Query active OTP within the 15-second expiration window
        const { rows: otpRows } = await queryWithRetry(`
            SELECT * FROM attendance_otps
            WHERE otp_code = $1
              AND is_active = TRUE
              AND expires_at > CURRENT_TIMESTAMP
            ORDER BY created_at DESC LIMIT 1
        `, [cleanOtp]);

        if (otpRows.length === 0) {
            // Log failed attempt
            await queryWithRetry(`
                INSERT INTO attendance_audit_logs (
                    action, user_id, emp_id, user_role, target_student_id, otp_code, status, details
                ) VALUES ($1, $2, $3, $4, $5, $6, 'FAILED', $7)
            `, [
                'OTP_VERIFICATION_FAILED',
                req.user.id,
                req.user.emp_id,
                req.user.role,
                student.student_id,
                cleanOtp,
                'Attempted entry with expired or invalid OTP code'
            ]);

            return res.status(400).json({
                message: 'Invalid or Expired OTP. The attendance OTP remains valid for only 15 seconds after staff generation.'
            });
        }

        const activeOtp = otpRows[0];

        // 3. Enforce matching student class & authorized period details
        if (
            parseInt(student.department_id, 10) !== parseInt(activeOtp.department_id, 10) ||
            parseInt(student.academic_year, 10) !== parseInt(activeOtp.academic_year, 10) ||
            parseInt(student.semester, 10) !== parseInt(activeOtp.semester, 10)
        ) {
            await queryWithRetry(`
                INSERT INTO attendance_audit_logs (
                    action, user_id, emp_id, user_role, target_student_id, otp_code, status, details
                ) VALUES ($1, $2, $3, $4, $5, $6, 'UNAUTHORIZED', $7)
            `, [
                'OTP_VERIFICATION_UNAUTHORIZED',
                req.user.id,
                req.user.emp_id,
                req.user.role,
                student.student_id,
                cleanOtp,
                'Student attempted marking attendance for a class/department they do not belong to'
            ]);

            return res.status(403).json({
                message: 'Unauthorized: You cannot mark attendance for a class or department other than your allocated program.'
            });
        }

        // 4. Mark attendance for the student
        await withDbClient(async (client) => {
            await client.query('BEGIN');

            await client.query(`
                INSERT INTO student_attendance (
                    student_id, user_id, department_id, academic_year, semester, section,
                    subject, subject_code, date, period_number, start_time, end_time, status, marked_by_emp_id, updated_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'Present', $13, CURRENT_TIMESTAMP)
                ON CONFLICT (student_id, date, period_number)
                DO UPDATE SET
                    status = 'Present',
                    subject = EXCLUDED.subject,
                    subject_code = EXCLUDED.subject_code,
                    marked_by_emp_id = EXCLUDED.marked_by_emp_id,
                    updated_at = CURRENT_TIMESTAMP
            `, [
                student.student_id,
                student.user_id,
                activeOtp.department_id,
                activeOtp.academic_year,
                activeOtp.semester,
                activeOtp.section || 'A',
                activeOtp.subject,
                activeOtp.subject_code || '',
                activeOtp.date,
                activeOtp.period_number,
                activeOtp.start_time || '',
                activeOtp.end_time || '',
                activeOtp.created_by_emp_id
            ]);

            // Audit log success
            await client.query(`
                INSERT INTO attendance_audit_logs (
                    action, user_id, emp_id, user_role, target_student_id, department_id, academic_year,
                    semester, section, subject, period_number, date, otp_code, status, details
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'SUCCESS', $14)
            `, [
                'OTP_VERIFIED',
                req.user.id,
                req.user.emp_id,
                req.user.role,
                student.student_id,
                activeOtp.department_id,
                activeOtp.academic_year,
                activeOtp.semester,
                activeOtp.section,
                activeOtp.subject,
                activeOtp.period_number,
                activeOtp.date,
                cleanOtp,
                `Student ${student.name} verified attendance via 15s OTP for Period ${activeOtp.period_number}`
            ]);

            await client.query('COMMIT');
        });

        res.status(200).json({
            success: true,
            message: `Attendance confirmed successfully for ${activeOtp.subject} (Period ${activeOtp.period_number})!`,
            period_number: activeOtp.period_number,
            subject: activeOtp.subject
        });

    } catch (error) {
        console.error('Error verifying attendance OTP:', error);
        res.status(500).json({ message: 'Failed to verify attendance OTP: ' + error.message });
    }
};

// @desc    Get attendance audit logs
// @route   GET /api/student-attendance/audit-logs
// @access  Private (Staff, HOD, Admin, Principal)
exports.getAttendanceAuditLogs = async (req, res) => {
    try {
        const { rows } = await queryWithRetry(`
            SELECT 
                al.*,
                u.name as user_name,
                st_user.name as student_name
            FROM attendance_audit_logs al
            LEFT JOIN users u ON al.user_id = u.id
            LEFT JOIN students s ON al.target_student_id = s.id
            LEFT JOIN users st_user ON s.user_id = st_user.id
            ORDER BY al.created_at DESC
            LIMIT 100
        `);

        res.json(rows);
    } catch (error) {
        console.error('Error fetching audit logs:', error);
        res.status(500).json({ message: 'Failed to fetch attendance audit logs' });
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
