const { queryWithRetry, withDbClient, isRetryableDbError } = require('../config/db');
const bcrypt = require('bcryptjs');

// @desc    Get list of students (filtered by department, year, semester, search)
// @route   GET /api/students
// @access  Private (Admin, Staff, HOD, Principal, Accounts)
exports.getStudents = async (req, res) => {
    try {
        const { department_id, academic_year, semester, section, search } = req.query;

        let query = `
            SELECT 
                s.id as student_table_id,
                s.reg_no,
                s.roll_no,
                s.academic_year,
                s.semester,
                s.section,
                s.batch,
                s.parent_name,
                s.parent_phone,
                u.id as user_id,
                u.emp_id,
                u.name,
                u.email,
                u.mobile,
                u.gender,
                u.dob,
                u.department_id,
                u.profile_pic,
                u.pin,
                d.name as department_name
            FROM students s
            JOIN users u ON s.user_id = u.id
            LEFT JOIN departments d ON u.department_id = d.id
            WHERE u.role = 'student'
        `;

        const params = [];
        let paramIndex = 1;

        if (department_id) {
            query += ` AND u.department_id = $${paramIndex++}`;
            params.push(department_id);
        }

        if (academic_year) {
            query += ` AND s.academic_year = $${paramIndex++}`;
            params.push(academic_year);
        }

        if (semester) {
            query += ` AND s.semester = $${paramIndex++}`;
            params.push(semester);
        }

        if (section) {
            query += ` AND LOWER(s.section) = LOWER($${paramIndex++})`;
            params.push(section);
        }

        if (search) {
            query += ` AND (LOWER(u.name) LIKE $${paramIndex} OR LOWER(s.reg_no) LIKE $${paramIndex} OR LOWER(s.roll_no) LIKE $${paramIndex} OR LOWER(u.email) LIKE $${paramIndex})`;
            params.push(`%${search.trim().toLowerCase()}%`);
            paramIndex++;
        }

        query += ` ORDER BY s.academic_year ASC, s.reg_no ASC`;

        const { rows } = await queryWithRetry(query, params);
        res.json(rows);
    } catch (error) {
        console.error('Error fetching students:', error);
        res.status(500).json({ message: 'Failed to fetch students' });
    }
};

// @desc    Get single student detail by user ID or student ID
// @route   GET /api/students/:id
// @access  Private
exports.getStudentById = async (req, res) => {
    try {
        const { id } = req.params;
        const { rows } = await queryWithRetry(`
            SELECT 
                s.id as student_table_id,
                s.reg_no,
                s.roll_no,
                s.academic_year,
                s.semester,
                s.section,
                s.batch,
                s.parent_name,
                s.parent_phone,
                u.id as user_id,
                u.emp_id,
                u.name,
                u.email,
                u.mobile,
                u.gender,
                u.dob,
                u.department_id,
                u.profile_pic,
                u.pin,
                d.name as department_name
            FROM students s
            JOIN users u ON s.user_id = u.id
            LEFT JOIN departments d ON u.department_id = d.id
            WHERE u.id = $1 OR s.id = $1 OR s.reg_no = $1
        `, [id]);

        if (rows.length === 0) {
            return res.status(404).json({ message: 'Student not found' });
        }

        res.json(rows[0]);
    } catch (error) {
        console.error('Error fetching student detail:', error);
        res.status(500).json({ message: 'Failed to fetch student details' });
    }
};

// @desc    Create new student
// @route   POST /api/students
// @access  Private (Admin, Staff)
exports.createStudent = async (req, res) => {
    const {
        name, reg_no, roll_no, email, department_id,
        academic_year, semester, section, batch,
        gender, dob, mobile, parent_name, parent_phone, pin
    } = req.body;

    const cleanRegNo = String(reg_no || '').trim();
    const cleanName = String(name || '').trim();
    const cleanEmail = String(email || '').trim().toLowerCase();

    if (!cleanRegNo || !cleanName) {
        return res.status(400).json({ message: 'Register Number and Student Name are required' });
    }

    try {
        const result = await withDbClient(async (client) => {
            await client.query('BEGIN');

            // Check duplicate reg_no
            const { rows: existingReg } = await client.query('SELECT id FROM users WHERE LOWER(emp_id) = LOWER($1)', [cleanRegNo]);
            if (existingReg.length > 0) {
                await client.query('ROLLBACK');
                return { error: 'Register Number already exists in system' };
            }

            if (cleanEmail) {
                const { rows: existingEmail } = await client.query('SELECT user_id FROM user_login WHERE LOWER(email) = $1', [cleanEmail]);
                if (existingEmail.length > 0) {
                    await client.query('ROLLBACK');
                    return { error: 'Email address already registered' };
                }
            }

            const studentPin = String(pin || '1234').trim();
            const hashedPassword = await bcrypt.hash(studentPin, 10);

            // Insert into users
            const { rows: userRows } = await client.query(`
                INSERT INTO users (
                    emp_id, name, email, password, pin, role, department_id, mobile, gender, dob
                ) VALUES (
                    $1, $2, $3, $4, $5, 'student', $6, $7, $8, $9
                ) RETURNING id
            `, [
                cleanRegNo,
                cleanName,
                cleanEmail || null,
                hashedPassword,
                studentPin,
                department_id ? parseInt(department_id, 10) : null,
                mobile || null,
                gender || 'Other',
                dob || null
            ]);

            const userId = userRows[0].id;

            // Insert into students
            await client.query(`
                INSERT INTO students (
                    user_id, reg_no, roll_no, academic_year, semester, section, batch, parent_name, parent_phone
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9
                )
            `, [
                userId,
                cleanRegNo,
                roll_no || cleanRegNo,
                parseInt(academic_year || 1, 10),
                parseInt(semester || 1, 10),
                section || 'A',
                batch || `${new Date().getFullYear()}-${new Date().getFullYear() + 4}`,
                parent_name || null,
                parent_phone || null
            ]);

            // Insert into user_login if email exists
            if (cleanEmail) {
                await client.query(`
                    INSERT INTO user_login (user_id, email) VALUES ($1, $2)
                    ON CONFLICT (email) DO UPDATE SET user_id = EXCLUDED.user_id
                `, [userId, cleanEmail]);
            }

            await client.query('COMMIT');
            return { success: true, userId, reg_no: cleanRegNo };
        });

        if (result.error) {
            return res.status(400).json({ message: result.error });
        }

        res.status(201).json({ message: 'Student created successfully', student: result });
    } catch (error) {
        console.error('Error creating student:', error);
        res.status(500).json({ message: 'Failed to create student: ' + error.message });
    }
};

// @desc    Update student
// @route   PUT /api/students/:id
// @access  Private (Admin, Staff)
exports.updateStudent = async (req, res) => {
    const { id } = req.params;
    const {
        name, roll_no, email, department_id,
        academic_year, semester, section, batch,
        gender, dob, mobile, parent_name, parent_phone, pin
    } = req.body;

    try {
        const result = await withDbClient(async (client) => {
            await client.query('BEGIN');

            const { rows: studentRows } = await client.query(`
                SELECT s.user_id, s.reg_no FROM students s WHERE s.id = $1 OR s.user_id = $1
            `, [id]);

            if (studentRows.length === 0) {
                await client.query('ROLLBACK');
                return { error: 'Student record not found' };
            }

            const userId = studentRows[0].user_id;

            let hashedPassword = null;
            if (pin) {
                hashedPassword = await bcrypt.hash(String(pin).trim(), 10);
            }

            // Update users
            await client.query(`
                UPDATE users SET 
                    name = COALESCE($1, name),
                    email = COALESCE($2, email),
                    department_id = COALESCE($3, department_id),
                    mobile = COALESCE($4, mobile),
                    gender = COALESCE($5, gender),
                    dob = COALESCE($6, dob),
                    pin = COALESCE($7, pin),
                    password = COALESCE($8, password)
                WHERE id = $9
            `, [
                name || null,
                email ? String(email).trim().toLowerCase() : null,
                department_id ? parseInt(department_id, 10) : null,
                mobile || null,
                gender || null,
                dob || null,
                pin ? String(pin).trim() : null,
                hashedPassword,
                userId
            ]);

            // Update students
            await client.query(`
                UPDATE students SET
                    roll_no = COALESCE($1, roll_no),
                    academic_year = COALESCE($2, academic_year),
                    semester = COALESCE($3, semester),
                    section = COALESCE($4, section),
                    batch = COALESCE($5, batch),
                    parent_name = COALESCE($6, parent_name),
                    parent_phone = COALESCE($7, parent_phone)
                WHERE user_id = $8
            `, [
                roll_no || null,
                academic_year ? parseInt(academic_year, 10) : null,
                semester ? parseInt(semester, 10) : null,
                section || null,
                batch || null,
                parent_name || null,
                parent_phone || null,
                userId
            ]);

            if (email) {
                const cleanEmail = String(email).trim().toLowerCase();
                await client.query(`
                    INSERT INTO user_login (user_id, email) VALUES ($1, $2)
                    ON CONFLICT (email) DO UPDATE SET user_id = EXCLUDED.user_id
                `, [userId, cleanEmail]);
            }

            await client.query('COMMIT');
            return { success: true };
        });

        if (result.error) {
            return res.status(400).json({ message: result.error });
        }

        res.json({ message: 'Student updated successfully' });
    } catch (error) {
        console.error('Error updating student:', error);
        res.status(500).json({ message: 'Failed to update student' });
    }
};

// @desc    Delete student
// @route   DELETE /api/students/:id
// @access  Private (Admin)
exports.deleteStudent = async (req, res) => {
    const { id } = req.params;

    try {
        const { rows } = await queryWithRetry(`
            DELETE FROM users WHERE (id = $1 OR emp_id = $1) AND role = 'student' RETURNING id, name, emp_id
        `, [id]);

        if (rows.length === 0) {
            return res.status(404).json({ message: 'Student not found or already deleted' });
        }

        res.json({ message: 'Student deleted successfully', deleted: rows[0] });
    } catch (error) {
        console.error('Error deleting student:', error);
        res.status(500).json({ message: 'Failed to delete student' });
    }
};
