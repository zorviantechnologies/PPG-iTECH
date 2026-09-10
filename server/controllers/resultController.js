const { queryWithRetry, withDbClient } = require('../config/db');

// Helper to calculate Grade and Pass/Fail Status
const calculateGradeAndStatus = (totalMarks, maxMarks = 100) => {
    const total = Number(totalMarks) || 0;
    const max = Number(maxMarks) || 100;
    const percentage = (total / max) * 100;

    let grade = 'RA';
    let status = 'FAIL';

    if (percentage >= 90) grade = 'O';
    else if (percentage >= 80) grade = 'A+';
    else if (percentage >= 70) grade = 'A';
    else if (percentage >= 60) grade = 'B+';
    else if (percentage >= 50) grade = 'B';
    else grade = 'RA';

    if (percentage >= 50) {
        status = 'PASS';
    } else {
        status = 'FAIL';
    }

    return { grade, status };
};

// @desc    Get examination results (filtered by year, department, semester, exam_name)
// @route   GET /api/results
// @access  Private
exports.getResults = async (req, res) => {
    try {
        const { department_id, academic_year, semester, exam_name, student_id, search, published_only } = req.query;
        const user = req.user;

        let query = `
            SELECT 
                r.*,
                d.name as department_name,
                u.name as fetched_student_name,
                u.emp_id as fetched_reg_no
            FROM exam_results r
            LEFT JOIN departments d ON r.department_id = d.id
            LEFT JOIN users u ON r.student_id = u.id
            WHERE 1=1
        `;

        const params = [];
        let paramIndex = 1;

        // If logged-in user is a student, enforce only their published results
        if (user.role === 'student') {
            query += ` AND (r.student_id = $${paramIndex} OR LOWER(r.student_reg_no) = LOWER($${paramIndex + 1}))`;
            params.push(user.id, user.emp_id);
            paramIndex += 2;
            query += ` AND r.published = TRUE`;
        } else if (published_only === 'true') {
            query += ` AND r.published = TRUE`;
        }

        if (department_id) {
            query += ` AND r.department_id = $${paramIndex++}`;
            params.push(department_id);
        }

        if (academic_year) {
            query += ` AND r.academic_year = $${paramIndex++}`;
            params.push(academic_year);
        }

        if (semester) {
            query += ` AND r.semester = $${paramIndex++}`;
            params.push(semester);
        }

        if (exam_name) {
            if (exam_name.toLowerCase().includes('semester')) {
                query += ` AND (LOWER(r.exam_name) LIKE '%semester%' OR LOWER(r.exam_name) = 'semester result')`;
            } else if (exam_name.toLowerCase().includes('internal') || exam_name.toLowerCase().includes('assessment')) {
                query += ` AND (LOWER(r.exam_name) LIKE '%internal%' OR LOWER(r.exam_name) LIKE '%assessment%' OR LOWER(r.exam_name) = 'internal / assessment result')`;
            } else {
                query += ` AND LOWER(r.exam_name) = LOWER($${paramIndex++})`;
                params.push(exam_name.trim());
            }
        }

        if (student_id) {
            query += ` AND r.student_id = $${paramIndex++}`;
            params.push(student_id);
        }

        if (search) {
            query += ` AND (LOWER(r.student_name) LIKE $${paramIndex} OR LOWER(r.student_reg_no) LIKE $${paramIndex} OR LOWER(r.subject_code) LIKE $${paramIndex} OR LOWER(r.subject_name) LIKE $${paramIndex})`;
            params.push(`%${search.trim().toLowerCase()}%`);
            paramIndex++;
        }

        query += ` ORDER BY r.academic_year ASC, r.semester ASC, r.student_reg_no ASC, r.subject_code ASC`;

        const { rows } = await queryWithRetry(query, params);

        // Calculate statistics
        const totalEntries = rows.length;
        const passCount = rows.filter(r => (r.status || '').toUpperCase() === 'PASS').length;
        const failCount = rows.filter(r => (r.status || '').toUpperCase() === 'FAIL').length;
        const absentCount = rows.filter(r => (r.status || '').toUpperCase() === 'ABSENT').length;
        const passPercentage = totalEntries > 0 ? ((passCount / totalEntries) * 100).toFixed(1) : 0;

        res.json({
            results: rows,
            summary: {
                totalEntries,
                passCount,
                failCount,
                absentCount,
                passPercentage
            }
        });
    } catch (error) {
        console.error('Error fetching exam results:', error);
        res.status(500).json({ message: 'Failed to fetch exam results' });
    }
};

// @desc    Bulk Upload / Save Examination Results (CSV or JSON Grid)
// @route   POST /api/results/upload
// @access  Private (Admin, Staff, HOD, Principal)
exports.uploadBulkResults = async (req, res) => {
    const { results, department_id, academic_year, semester, exam_name, published } = req.body;

    const targetExamName = String(exam_name || '').trim();
    if (targetExamName.toLowerCase().includes('semester') && req.user?.role !== 'admin') {
        return res.status(403).json({ message: 'Only Admin is authorized to upload Semester Results.' });
    }

    if (!Array.isArray(results) || results.length === 0) {
        return res.status(400).json({ message: 'No result items provided for upload' });
    }

    try {
        const uploaderName = req.user?.name || req.user?.emp_id || 'System Admin';

        const outcome = await withDbClient(async (client) => {
            await client.query('BEGIN');

            let insertedCount = 0;
            let updatedCount = 0;

            for (const item of results) {
                const regNo = String(item.student_reg_no || item.reg_no || item.register_number || '').trim();
                const studentName = String(item.student_name || item.name || '').trim();
                const subjectCode = String(item.subject_code || item.code || '').trim().toUpperCase();
                const subjectName = String(item.subject_name || item.subject || subjectCode).trim();
                const deptId = item.department_id || department_id || null;
                const year = parseInt(item.academic_year || academic_year || 1, 10);
                const sem = parseInt(item.semester || semester || 1, 10);
                const exam = String(item.exam_name || exam_name || 'Semester Exam').trim();

                if (!regNo || !subjectCode) continue;

                // Lookup student_id from users table if possible
                const { rows: studentRows } = await client.query(
                    "SELECT id, name FROM users WHERE LOWER(emp_id) = LOWER($1) AND role = 'student'",
                    [regNo]
                );

                const studentId = studentRows.length > 0 ? studentRows[0].id : null;
                const finalStudentName = studentName || (studentRows.length > 0 ? studentRows[0].name : regNo);

                const internal = parseFloat(item.internal_marks || 0);
                const external = parseFloat(item.external_marks || 0);
                let total = item.total_marks !== undefined ? parseFloat(item.total_marks) : (internal + external);
                const maxMarks = parseFloat(item.max_marks || 100);

                let grade = item.grade;
                let status = item.status;

                if (!grade || !status) {
                    const calc = calculateGradeAndStatus(total, maxMarks);
                    if (!grade) grade = calc.grade;
                    if (!status) status = calc.status;
                }

                // Check if existing record exists for this student, subject, and exam
                const { rows: existing } = await client.query(`
                    SELECT id FROM exam_results
                    WHERE LOWER(student_reg_no) = LOWER($1)
                      AND LOWER(subject_code) = LOWER($2)
                      AND LOWER(exam_name) = LOWER($3)
                      AND academic_year = $4
                      AND semester = $5
                `, [regNo, subjectCode, exam, year, sem]);

                if (existing.length > 0) {
                    await client.query(`
                        UPDATE exam_results SET
                            student_id = COALESCE($1, student_id),
                            student_name = $2,
                            department_id = COALESCE($3, department_id),
                            subject_name = $4,
                            internal_marks = $5,
                            external_marks = $6,
                            total_marks = $7,
                            max_marks = $8,
                            grade = $9,
                            status = $10,
                            published = COALESCE($11, published),
                            uploaded_by = $12
                        WHERE id = $13
                    `, [
                        studentId, finalStudentName, deptId, subjectName,
                        internal, external, total, maxMarks, grade, status,
                        published !== undefined ? Boolean(published) : null,
                        uploaderName, existing[0].id
                    ]);
                    updatedCount++;
                } else {
                    await client.query(`
                        INSERT INTO exam_results (
                            student_id, student_reg_no, student_name, department_id,
                            academic_year, semester, exam_name, subject_code, subject_name,
                            internal_marks, external_marks, total_marks, max_marks, grade, status, published, uploaded_by
                        ) VALUES (
                            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17
                        )
                    `, [
                        studentId, regNo, finalStudentName, deptId,
                        year, sem, exam, subjectCode, subjectName,
                        internal, external, total, maxMarks, grade, status,
                        published !== undefined ? Boolean(published) : false,
                        uploaderName
                    ]);
                    insertedCount++;
                }
            }

            await client.query('COMMIT');
            return { insertedCount, updatedCount };
        });

        res.status(200).json({
            message: `Successfully processed results: ${outcome.insertedCount} inserted, ${outcome.updatedCount} updated`,
            counts: outcome
        });
    } catch (error) {
        console.error('Error uploading bulk exam results:', error);
        res.status(500).json({ message: 'Failed to process bulk results upload: ' + error.message });
    }
};

// @desc    Toggle Publish / Unpublish Status for Exam Results
// @route   PUT /api/results/publish
// @access  Private (Admin, Staff, HOD, Principal)
exports.publishResults = async (req, res) => {
    const { department_id, academic_year, semester, exam_name, published } = req.body;

    const targetExamName = String(exam_name || '').trim();
    if (targetExamName.toLowerCase().includes('semester') && req.user?.role !== 'admin') {
        return res.status(403).json({ message: 'Only Admin is authorized to publish or unpublish Semester Results.' });
    }

    const isPublished = Boolean(published);

    try {
        let query = `UPDATE exam_results SET published = $1 WHERE 1=1`;
        const params = [isPublished];
        let pIdx = 2;

        if (department_id) {
            query += ` AND department_id = $${pIdx++}`;
            params.push(department_id);
        }

        if (academic_year) {
            query += ` AND academic_year = $${pIdx++}`;
            params.push(academic_year);
        }

        if (semester) {
            query += ` AND semester = $${pIdx++}`;
            params.push(semester);
        }

        if (exam_name) {
            query += ` AND LOWER(exam_name) = LOWER($${pIdx++})`;
            params.push(exam_name.trim());
        }

        query += ` RETURNING id`;

        const { rows } = await queryWithRetry(query, params);

        res.json({
            message: `Results ${isPublished ? 'published' : 'unpublished'} successfully for ${rows.length} records`,
            affectedRecords: rows.length,
            published: isPublished
        });
    } catch (error) {
        console.error('Error toggling result publish status:', error);
        res.status(500).json({ message: 'Failed to update result publish status' });
    }
};

// @desc    Delete single exam result entry
// @route   DELETE /api/results/:id
// @access  Private (Admin, Staff)
exports.deleteResult = async (req, res) => {
    const { id } = req.params;

    try {
        const { rows } = await queryWithRetry('DELETE FROM exam_results WHERE id = $1 RETURNING id', [id]);
        if (rows.length === 0) {
            return res.status(404).json({ message: 'Result record not found' });
        }
        res.json({ message: 'Exam result deleted successfully' });
    } catch (error) {
        console.error('Error deleting exam result:', error);
        res.status(500).json({ message: 'Failed to delete exam result' });
    }
};

// @desc    Get published results for logged in Student
// @route   GET /api/results/my-results
// @access  Private (Student)
exports.getMyResults = async (req, res) => {
    try {
        const user = req.user;

        const { rows } = await queryWithRetry(`
            SELECT 
                r.*,
                d.name as department_name
            FROM exam_results r
            LEFT JOIN departments d ON r.department_id = d.id
            WHERE (r.student_id = $1 OR LOWER(r.student_reg_no) = LOWER($2))
              AND r.published = TRUE
            ORDER BY r.academic_year DESC, r.semester DESC, r.subject_code ASC
        `, [user.id, user.emp_id]);

        res.json(rows);
    } catch (error) {
        console.error('Error fetching student results:', error);
        res.status(500).json({ message: 'Failed to fetch personal results' });
    }
};
