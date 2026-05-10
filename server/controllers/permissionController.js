const { pool } = require('../config/db');
const { createNotification } = require('./notificationController');

const insertPermissionApprovalStepIfMissing = async ({ client, permissionId, approverId, approverType }) => {
    if (!permissionId || !approverId || !approverType) return false;

    const { rows: existing } = await client.query(
        `SELECT id FROM permission_approvals
         WHERE permission_id = $1
           AND approver_id = $2
           AND approver_type = $3
           AND status = 'Pending'
         LIMIT 1`,
        [permissionId, approverId, approverType]
    );

    if (existing.length > 0) return false;

    await client.query(
        `INSERT INTO permission_approvals (permission_id, approver_id, approver_type, status)
         VALUES ($1, $2, $3, 'Pending')`,
        [permissionId, approverId, approverType]
    );
    return true;
};

// @desc    Apply for permission
// @route   POST /api/permissions
// @access  Private
exports.applyPermission = async (req, res) => {
    const { date, from_time, to_time, subject, reason } = req.body;
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // 0. Check Permission Limit — Use explicitly formatted date to avoid timezone shift errors
        const dateStrForYear = new Date(date).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
        const [year, month, day] = dateStrForYear.split('-').map(Number);
        const currentYear = year;
        const startOfMonth = `${year}-${String(month).padStart(2, '0')}-01`;
        const endOfMonth = new Date(year, month, 0).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

        // Fetch monthly limit (default to 2)
        const { rows: limitRows } = await client.query(
            `SELECT permission_limit FROM leave_limits WHERE emp_id = $1 AND year = $2`,
            [req.user.emp_id, currentYear]
        );
        const monthlyLimit = limitRows[0]?.permission_limit ?? 2;

        // Count approved/pending permissions this month
        const { rows: countRows } = await client.query(
            `SELECT COUNT(*) as count FROM permission_requests 
             WHERE emp_id = $1 AND status != 'Rejected' AND date BETWEEN $2 AND $3`,
            [req.user.emp_id, startOfMonth, endOfMonth]
        );
        const countThisMonth = parseInt(countRows[0].count);

        if (countThisMonth >= monthlyLimit) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                message: `Monthly permission limit reached (${monthlyLimit} allowed). You have already used ${countThisMonth} this month.`
            });
        }

        // Increment balance
        await client.query(
            `INSERT INTO leave_balances (emp_id, year, permission_taken) 
             VALUES ($1, $2, 1) 
             ON CONFLICT (emp_id, year) 
             DO UPDATE SET permission_taken = COALESCE(leave_balances.permission_taken, 0) + 1`,
            [req.user.emp_id, currentYear]
        );

        // 1. Create permission request
        const { rows } = await client.query(
            `INSERT INTO permission_requests (emp_id, date, from_time, to_time, subject, reason, status)
             VALUES ($1, $2, $3, $4, $5, $6, 'Pending') RETURNING id`,
            [req.user.emp_id, date, from_time, to_time, subject || 'Permission Request', reason]
        );
        const permissionId = rows[0].id;

        // 2. Determine next approver
        const { replacement_staff_id } = req.body;
        const normalizedReplacementId = String(replacement_staff_id || '').trim();

        if (normalizedReplacementId) {
            await insertPermissionApprovalStepIfMissing({
                client,
                permissionId,
                approverId: normalizedReplacementId,
                approverType: 'replacement'
            });

            const reqDateStrInLocal = new Date(date).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' });
            await createNotification(normalizedReplacementId, `${req.user.name} has requested you as an alternative staff for their permission on ${reqDateStrInLocal}.`, 'permission', { permissionId }, client);
        } else if (req.user.role === 'hod') {
            const { rows: principalRows } = await client.query(
                `SELECT emp_id FROM users WHERE role = 'principal' LIMIT 1`
            );
            if (principalRows.length > 0) {
                const inserted = await insertPermissionApprovalStepIfMissing({
                    client,
                    permissionId,
                    approverId: principalRows[0].emp_id,
                    approverType: 'principal'
                });
                if (inserted) {
                    await createNotification(principalRows[0].emp_id, `New permission request from HOD ${req.user.name} requires your approval.`, 'permission', { permissionId }, client);
                }
            }
        } else {
            // Send to HOD for approval if available, otherwise to Principal
            const { rows: hodRows } = await client.query(
                `SELECT emp_id FROM users WHERE department_id = $1 AND role = 'hod'`,
                [req.user.department_id]
            );

            if (hodRows.length > 0) {
                const hodId = hodRows[0].emp_id;
                const inserted = await insertPermissionApprovalStepIfMissing({
                    client,
                    permissionId,
                    approverId: hodId,
                    approverType: 'hod'
                });

                if (inserted) {
                    const reqDateStrInLocal = new Date(date).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' });
                    await createNotification(hodId, `New permission request from ${req.user.name} for ${reqDateStrInLocal}.`, 'permission', { permissionId }, client);
                }
            } else {
                const { rows: principalRows } = await client.query(
                    `SELECT emp_id FROM users WHERE role = 'principal' LIMIT 1`
                );
                if (principalRows.length > 0) {
                    const inserted = await insertPermissionApprovalStepIfMissing({
                        client,
                        permissionId,
                        approverId: principalRows[0].emp_id,
                        approverType: 'principal'
                    });
                    if (inserted) {
                        await createNotification(principalRows[0].emp_id, `New permission request from ${req.user.name} requires your approval.`, 'permission', { permissionId }, client);
                    }
                }
            }
        }

        await client.query('COMMIT');
        res.status(201).json({ message: 'Permission request submitted.' });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('APPLY PERMISSION ERROR:', error);
        res.status(500).json({ message: 'Server Error: ' + error.message });
    } finally {
        client.release();
    }
};

// @desc    Get permission requests (own + those needing approval)
// @route   GET /api/permissions
// @access  Private
exports.getPermissions = async (req, res) => {
    try {
        const { rows } = await pool.query(`
            SELECT p.*, u.name as applicant_name, u.role as applicant_role, 
                   u.profile_pic as applicant_pic, d.name as department_name,
                   pa.status as my_approval_status, pa.approver_type as my_approver_type, 
                   pa.comments as approval_notes, pa.updated_at as approval_acted_at
            FROM permission_requests p
            JOIN users u ON p.emp_id = u.emp_id
            LEFT JOIN departments d ON u.department_id = d.id
            LEFT JOIN permission_approvals pa ON p.id = pa.permission_id AND pa.approver_id = $1
            WHERE p.emp_id = $2 OR pa.approver_id = $3
            ORDER BY p.created_at DESC
        `, [req.user.emp_id, req.user.emp_id, req.user.emp_id]);

        res.json(rows);
    } catch (error) {
        console.error('GET PERMISSIONS ERROR:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Approve/Reject permission request
// @route   PUT /api/permissions/:id/approve
// @access  Private
exports.approvePermission = async (req, res) => {
    const { status, comments } = req.body;
    const permissionId = req.params.id;
    const userId = req.user.emp_id;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Find pending approval for this user
        const { rows: approval } = await client.query(
            `SELECT * FROM permission_approvals WHERE permission_id = $1 AND approver_id = $2 AND status = 'Pending'`,
            [permissionId, userId]
        );

        if (approval.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: 'Pending approval not found' });
        }

        const currentStep = approval[0];

        // 2. Update approval status
        await client.query(
            'UPDATE permission_approvals SET status = $1, comments = $2, updated_at = NOW() WHERE id = $3',
            [status, comments, currentStep.id]
        );

        // 3. Handle Rejection
        if (status === 'Rejected') {
            await client.query(
                'UPDATE permission_requests SET status = $1 WHERE id = $2',
                ['Rejected', permissionId]
            );

            // Revert balance
            const { rows: permInfo } = await client.query('SELECT emp_id, date FROM permission_requests WHERE id = $1', [permissionId]);
            if (permInfo.length > 0) {
                const year = new Date(permInfo[0].date).getFullYear();
                await client.query(
                    `UPDATE leave_balances SET permission_taken = GREATEST(0, COALESCE(permission_taken, 0) - 1) WHERE emp_id = $1 AND year = $2`,
                    [permInfo[0].emp_id, year]
                );
            }

            const { rows: reqRows } = await client.query(
                'SELECT emp_id FROM permission_requests WHERE id = $1',
                [permissionId]
            );

            await createNotification(reqRows[0].emp_id, `Your permission request has been REJECTED by ${req.user.name}.`, 'permission', { isStatusUpdate: true }, client);
        }

        // 4. Handle Approval & Escalation
        if (status === 'Approved') {
            if (currentStep.approver_type === 'replacement') {
                const { rows: reqRows } = await client.query(`
                    SELECT u.department_id, u.name, u.role FROM permission_requests p 
                    JOIN users u ON p.emp_id = u.emp_id WHERE p.id = $1
                `, [permissionId]);
                const applicant = reqRows[0];

                if (applicant?.role === 'hod') {
                    const { rows: principalRows } = await client.query(
                        `SELECT emp_id FROM users WHERE role = 'principal' LIMIT 1`
                    );
                    if (principalRows.length > 0) {
                        const inserted = await insertPermissionApprovalStepIfMissing({
                            client,
                            permissionId,
                            approverId: principalRows[0].emp_id,
                            approverType: 'principal'
                        });
                        if (inserted) {
                            await createNotification(principalRows[0].emp_id, `Permission request from HOD ${applicant.name} (alternative staff approved) requires your approval.`, 'permission', { permissionId }, client);
                        }
                    }
                } else {
                    const { rows: hodRows } = await client.query(
                        `SELECT emp_id FROM users WHERE department_id = $1 AND role = 'hod'`,
                        [applicant?.department_id]
                    );
    
                    if (hodRows.length > 0) {
                        const inserted = await insertPermissionApprovalStepIfMissing({
                            client,
                            permissionId,
                            approverId: hodRows[0].emp_id,
                            approverType: 'hod'
                        });
                        if (inserted) {
                            await createNotification(hodRows[0].emp_id, `Permission request from ${applicant.name} (alternative staff approved) requires your HOD approval before Principal review.`, 'permission', { permissionId }, client);
                        }
                    } else {
                        const { rows: principalRows } = await client.query(
                            `SELECT emp_id FROM users WHERE role = 'principal' LIMIT 1`
                        );
                        if (principalRows.length > 0) {
                            const inserted = await insertPermissionApprovalStepIfMissing({
                                client,
                                permissionId,
                                approverId: principalRows[0].emp_id,
                                approverType: 'principal'
                            });
                            if (inserted) {
                                await createNotification(principalRows[0].emp_id, `Permission request from ${applicant.name} (alternative staff approved) requires your approval.`, 'permission', { permissionId }, client);
                            }
                        }
                    }
                }
            } else if (currentStep.approver_type === 'hod') {
                // Escalate to principal
                const { rows: principalRows } = await client.query(
                    `SELECT emp_id FROM users WHERE role = 'principal' LIMIT 1`
                );

                if (principalRows.length > 0) {
                    const inserted = await insertPermissionApprovalStepIfMissing({
                        client,
                        permissionId,
                        approverId: principalRows[0].emp_id,
                        approverType: 'principal'
                    });
                    if (inserted) {
                        await createNotification(principalRows[0].emp_id, `Permission request escalated to Principal for final approval.`, 'permission', { permissionId }, client);
                    }
                }
            } else if (currentStep.approver_type === 'principal' || currentStep.approver_type === 'admin') {
                // Final approval — mark permission as approved
                await client.query(
                    'UPDATE permission_requests SET status = $1 WHERE id = $2',
                    ['Approved', permissionId]
                );

                // Get the permission details to mark attendance as Present
                const { rows: permReq } = await client.query(
                    'SELECT emp_id, date, from_time, to_time FROM permission_requests WHERE id = $1',
                    [permissionId]
                );
                if (permReq.length > 0) {
                    const { emp_id, date, from_time, to_time } = permReq[0];
                    const dateStr = new Date(date).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

                    // Calculate duration for remarks
                    const [fH, fM] = from_time.split(':').map(Number);
                    const [tH, tM] = to_time.split(':').map(Number);
                    let diff = (tH * 60 + tM) - (fH * 60 + fM);
                    if (diff < 0) diff += 1440;
                    const durationStr = `${Math.floor(diff / 60)}h ${diff % 60}m`;
                    const remarks = `Permission: ${from_time}-${to_time} (Duration: ${durationStr})`;

                    // Try to update attendance_records; if no row was updated, insert a new attendance record
                    const updRec = await client.query(
                        `UPDATE attendance_records 
                         SET status = 'Present', 
                             in_time = COALESCE(in_time, $3),
                             remarks = CASE 
                                            WHEN remarks IS NULL OR remarks = '' THEN $4 
                                            WHEN remarks NOT LIKE '%' || $4 || '%' THEN remarks || ' | ' || $4 
                                            ELSE remarks 
                                       END
                         WHERE emp_id = $1 AND date = $2 RETURNING *`,
                        [emp_id, dateStr, from_time, remarks]
                    );

                    if (updRec.rowCount === 0) {
                        // No attendance_records row existed — try insert inside a SAVEPOINT
                        await client.query('SAVEPOINT sp_attendance');
                        try {
                            await client.query(
                                `INSERT INTO attendance_records (emp_id, date, status, in_time, remarks) VALUES ($1, $2, 'Present', $3, $4)`,
                                [emp_id, dateStr, from_time, remarks]
                            );
                        } catch (e) {
                            // If insert failed, rollback to savepoint and try legacy table updates/inserts
                            await client.query('ROLLBACK TO SAVEPOINT sp_attendance');
                            try {
                                const updLegacy = await client.query(
                                    `UPDATE attendance SET status = 'Present', in_time = COALESCE(in_time, $3) WHERE emp_id = $1 AND date = $2 RETURNING *`,
                                    [emp_id, dateStr, from_time]
                                );
                                if (updLegacy.rowCount === 0) {
                                    await client.query(
                                        `INSERT INTO attendance (emp_id, date, status, in_time) VALUES ($1, $2, 'Present', $3)`,
                                        [emp_id, dateStr, from_time]
                                    );
                                }
                            } catch (e2) {
                                // If fallback also fails, rollback to savepoint and rethrow to outer handler (which will rollback transaction)
                                await client.query('ROLLBACK TO SAVEPOINT sp_attendance');
                                throw e2;
                            }
                        } finally {
                            // Release savepoint if possible (ignore errors)
                            try { await client.query('RELEASE SAVEPOINT sp_attendance'); } catch (__) { }
                        }
                    }

                    await createNotification(emp_id, `Your permission request for ${new Date(date).toLocaleDateString('en-IN')} has been APPROVED. Attendance marked as Present.`, 'permission', { isStatusUpdate: true }, client);

                    const io = req.app.get('io');
                    if (io) {
                        io.emit('attendance_updated', { emp_id });
                    }
                }
            }
        }

        await client.query('COMMIT');
        res.json({ message: `Permission ${status} successfully at ${currentStep.approver_type} level.` });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('APPROVE PERMISSION ERROR:', error);
        res.status(500).json({ message: 'Server Error: ' + error.message });
    } finally {
        client.release();
    }
};

// @desc    Delete permission request (only own & pending)
// @route   DELETE /api/permissions/:id
// @access  Private
exports.deletePermission = async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const { rows: reqData } = await client.query('SELECT emp_id, date, status FROM permission_requests WHERE id = $1', [req.params.id]);

        if (reqData.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: 'Permission request not found.' });
        }

        const request = reqData[0];
        if (request.status !== 'Pending' || request.emp_id !== req.user.emp_id) {
            await client.query('ROLLBACK');
            return res.status(403).json({ message: 'Not authorized' });
        }

        // Revert balance
        const year = new Date(request.date).getFullYear();
        await client.query(
            `UPDATE leave_balances SET permission_taken = GREATEST(0, COALESCE(permission_taken, 0) - 1) WHERE emp_id = $1 AND year = $2`,
            [request.emp_id, year]
        );

        await client.query(`DELETE FROM permission_requests WHERE id = $1`, [req.params.id]);
        await client.query('COMMIT');
        res.json({ message: 'Permission request deleted and balance reverted.' });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('DELETE PERMISSION ERROR:', error);
        res.status(500).json({ message: 'Server Error' });
    } finally {
        client.release();
    }
};
