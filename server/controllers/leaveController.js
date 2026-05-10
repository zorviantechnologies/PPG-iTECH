const { pool } = require('../config/db');
const { createNotification } = require('./notificationController');

const ensureLeaveRequestDocumentSchema = async (client) => {
    await client.query(`
        ALTER TABLE leave_requests
        ADD COLUMN IF NOT EXISTS proof_file_name TEXT,
        ADD COLUMN IF NOT EXISTS proof_file_type TEXT,
        ADD COLUMN IF NOT EXISTS proof_file_data TEXT,
        ADD COLUMN IF NOT EXISTS ml_doc_file_name TEXT,
        ADD COLUMN IF NOT EXISTS ml_doc_file_type TEXT,
        ADD COLUMN IF NOT EXISTS ml_doc_file_data TEXT,
        ADD COLUMN IF NOT EXISTS ml_document_submitted BOOLEAN DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS ml_document_submitted_at TIMESTAMP,
        ADD COLUMN IF NOT EXISTS ml_hod_verified BOOLEAN DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS ml_hod_verified_by VARCHAR(50),
        ADD COLUMN IF NOT EXISTS ml_hod_verified_at TIMESTAMP,
        ADD COLUMN IF NOT EXISTS ml_principal_verified BOOLEAN DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS ml_principal_verified_by VARCHAR(50),
        ADD COLUMN IF NOT EXISTS ml_principal_verified_at TIMESTAMP
    `);
};

// @desc    Apply for leave
// @route   POST /api/leaves
// @access  Private
exports.applyLeave = async (req, res) => {
    const {
        leave_type, from_date, to_date, days_count,
        reason, subject, replacements, is_half_day, hours, dates_detail,
        proof_file_name, proof_file_type, proof_file_data
    } = req.body;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await ensureLeaveRequestDocumentSchema(client);

        // 0. Check Leave Limits — per-employee first, fall back to global settings
        // Use the requested from_date's year for limits instead of system year
        const leaveYear = from_date ? new Date(from_date).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }).split('-')[0] : new Date().getFullYear();
        const currentYear = parseInt(leaveYear);
        const columnLimitMap = {
            'CL': 'cl_limit', 'ML': 'ml_limit', 'OD': 'od_limit',
            'Comp Leave': 'comp_limit', 'LOP': 'lop_limit'
        };
        const columnTakenMap = {
            'CL': 'cl_taken', 'ML': 'ml_taken', 'OD': 'od_taken',
            'Comp Leave': 'comp_taken', 'LOP': 'lop_taken'
        };

        const limitCol = columnLimitMap[leave_type];
        const takenCol = columnTakenMap[leave_type];

        // Check per-employee limit for this year
        const { rows: perEmpLimit } = await client.query(
            `SELECT ${limitCol} AS max_days FROM leave_limits WHERE emp_id = $1 AND year = $2`,
            [req.user.emp_id, currentYear]
        );

        let maxDaysAllowed;
        if (perEmpLimit.length > 0 && perEmpLimit[0].max_days !== null) {
            maxDaysAllowed = perEmpLimit[0].max_days;
        } else {
            // Fall back to global settings
            const { rows: settings } = await client.query(
                'SELECT max_days FROM leave_settings WHERE leave_type = $1',
                [leave_type]
            );
            maxDaysAllowed = settings[0]?.max_days ?? 15;
        }

        const { rows: balance } = await client.query(
            'SELECT * FROM leave_balances WHERE emp_id = $1 AND year = $2',
            [req.user.emp_id, currentYear]
        );

        // If no balance record, create one
        if (balance.length === 0) {
            await client.query(
                'INSERT INTO leave_balances (emp_id, year) VALUES ($1, $2)',
                [req.user.emp_id, currentYear]
            );
        }

        const taken = balance[0] ? (balance[0][takenCol] || 0) : 0;
        const totalDays = parseFloat(days_count) || 0;

        if (taken + totalDays > maxDaysAllowed) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                message: `Leave limit exceeded for ${leave_type}. Allowed: ${maxDaysAllowed} days, Already taken: ${taken} days, Remaining: ${Math.max(0, maxDaysAllowed - taken)} days.`
            });
        }

        // Increment the taken count in leave_balances immediately upon application
        await client.query(
            `UPDATE leave_balances SET ${takenCol} = COALESCE(${takenCol}, 0) + $1 WHERE emp_id = $2 AND year = $3`,
            [totalDays, req.user.emp_id, currentYear]
        );

        // 1. Create main leave request
        const validReplacements = replacements ? replacements.filter(r => r.staff_id && r.staff_id !== '') : [];
        const firstReplacementId = validReplacements.length > 0 ? validReplacements[0].staff_id : null;

        const sanitizedHours = hours ? parseFloat(hours) : null;
        const hasOdProof = String(leave_type || '').toUpperCase() === 'OD' && proof_file_name && proof_file_type && proof_file_data;
        const { rows: resultRows } = await client.query(
            `INSERT INTO leave_requests (emp_id, leave_type, from_date, to_date, days_count, reason, subject, alternative_staff_id, status, is_half_day, hours, dates_detail, proof_file_name, proof_file_type, proof_file_data)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'Pending', $9, $10, $11, $12, $13, $14)
             RETURNING id`,
            [
                req.user.emp_id,
                leave_type,
                from_date,
                to_date,
                totalDays,
                reason,
                subject || 'Leave Request',
                firstReplacementId,
                is_half_day || false,
                sanitizedHours,
                JSON.stringify(dates_detail || []),
                hasOdProof ? proof_file_name : null,
                hasOdProof ? proof_file_type : null,
                hasOdProof ? proof_file_data : null
            ]
        );

        const requestId = resultRows[0].id;
        const hoursInfo = (is_half_day && hours) ? ` (${hours} Hours)` : '';

        // 2. Initial Approval Step: Replacements or HOD
        if (validReplacements.length > 0) {
            for (const rep of validReplacements) {
                await client.query(
                    `INSERT INTO leave_approvals (leave_request_id, approver_id, approver_type, status, comments)
                     VALUES ($1, $2, 'replacement', 'Pending', $3)`,
                    [requestId, rep.staff_id, rep.periods ? `Periods: ${rep.periods}` : 'Standard Replacement']
                );

                await createNotification(rep.staff_id, `${req.user.name} has requested you as a replacement (${rep.periods || 'Standard'})${hoursInfo} for their leave.`, 'leave', { requestId }, client);
            }
        } else {
            // Straight to HOD normally, but if applicant is HOD, send directly to Principal
            if (req.user.role === 'hod') {
                const { rows: principalRows } = await client.query('SELECT emp_id FROM users WHERE role = \'principal\' LIMIT 1');
                if (principalRows.length > 0) {
                    await client.query(
                        `INSERT INTO leave_approvals (leave_request_id, approver_id, approver_type, status)
                         VALUES ($1, $2, 'principal', 'Pending')`,
                        [requestId, principalRows[0].emp_id]
                    );

                    await createNotification(principalRows[0].emp_id, `New leave request from HOD ${req.user.name}${hoursInfo} requires your approval.`, 'leave', { requestId }, client);
                }
            } else {
                const { rows: hodRows } = await client.query(
                    `SELECT emp_id FROM users WHERE department_id = $1 AND role = 'hod'`,
                    [req.user.department_id]
                );
                const hodId = hodRows.length > 0 ? hodRows[0].emp_id : null;

                if (hodId) {
                    await client.query(
                        `INSERT INTO leave_approvals (leave_request_id, approver_id, approver_type, status)
                         VALUES ($1, $2, 'hod', 'Pending')`,
                        [requestId, hodId]
                    );

                    await createNotification(hodId, `New leave request from ${req.user.name}${hoursInfo} requires your approval.`, 'leave', { requestId }, client);
                } else {
                    // Fallback to principal if no HOD
                    const { rows: principalRows } = await client.query('SELECT emp_id FROM users WHERE role = \'principal\' LIMIT 1');
                    if (principalRows.length > 0) {
                        await client.query(
                            `INSERT INTO leave_approvals (leave_request_id, approver_id, approver_type, status)
                             VALUES ($1, $2, 'principal', 'Pending')`,
                            [requestId, principalRows[0].emp_id]
                        );

                        await createNotification(principalRows[0].emp_id, `New leave request from ${req.user.name}${hoursInfo} requires your approval.`, 'leave', null, client);
                    }
                }
            }
        }

        await client.query('COMMIT');
        res.status(201).json({ message: 'Leave application submitted for approval chain.' });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('APPLY LEAVE ERROR:', error);
        res.status(500).json({ message: 'Server Error: ' + error.message });
    } finally {
        client.release();
    }
};

// @desc    Get leave requests for the user or those requiring their approval
// @route   GET /api/leaves
// @access  Private
exports.getLeaveRequests = async (req, res) => {
    try {
        await ensureLeaveRequestDocumentSchema(pool);
        // Complex query to get requests where the user is either:
        // 1. The applicant
        // 2. An approver (pending or already acted on)
        const query = `
                 SELECT l.*, u.name as applicant_name, u.role as applicant_role, u.designation as applicant_designation, u.profile_pic as applicant_pic, d.name as department_name, 
                   ap.status as my_approval_status, ap.approver_type as my_approver_type, ap.comments as approval_notes,
                   ap.updated_at as approval_acted_at
            FROM leave_requests l
            JOIN users u ON l.emp_id = u.emp_id
            LEFT JOIN departments d ON u.department_id = d.id
            LEFT JOIN leave_approvals ap ON l.id = ap.leave_request_id AND ap.approver_id = $1
            WHERE l.emp_id = $2 
               OR ap.approver_id = $3
            ORDER BY (ap.status = 'Pending') DESC, l.created_at DESC
        `;

        const { rows } = await pool.query(query, [req.user.emp_id, req.user.emp_id, req.user.emp_id]);
        const parsed = rows.map(r => {
            let dates_detail = r.dates_detail || [];
            try {
                if (typeof dates_detail === 'string' && dates_detail.length > 0) dates_detail = JSON.parse(dates_detail);
            } catch (e) { dates_detail = []; }
            const hoursVal = r.hours !== null && r.hours !== undefined ? parseFloat(r.hours) : null;
            let single_day_time_range = null;
            if (Array.isArray(dates_detail) && dates_detail.length === 1 && dates_detail[0].is_full_day === false) {
                const f = new Date('2000-01-01T' + dates_detail[0].from_time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
                const t = new Date('2000-01-01T' + dates_detail[0].to_time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
                single_day_time_range = `${f} - ${t}`;
            }
            return { ...r, dates_detail, hours: hoursVal, single_day_time_range };
        });
        res.json(parsed);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Action on leave request (Approve/Reject) at a specific level
// @route   PUT /api/leaves/:id/approve
// @access  Private
exports.approveLeaveStep = async (req, res) => {
    const { status, comments, dates_detail } = req.body; // Approved or Rejected. dates_detail optional update from approver
    const requestId = req.params.id;
    const userId = req.user.emp_id;

    const client = await pool.connect(); // Changed from connection to client, and getConnection() to connect()
    try {
        await client.query('BEGIN'); // Changed from connection.beginTransaction() to client.query('BEGIN')
        await ensureLeaveRequestDocumentSchema(client);

        // Optional: if approver supplied updated per-day time details, persist them
        if (dates_detail && Array.isArray(dates_detail)) {
            await client.query('UPDATE leave_requests SET dates_detail = $1 WHERE id = $2', [JSON.stringify(dates_detail), requestId]);
        }

        // 1. Update current approval status
        const { rows: approval } = await client.query(
            'SELECT * FROM leave_approvals WHERE leave_request_id = $1 AND approver_id = $2 AND status = \'Pending\'',
            [requestId, userId]
        );

        if (approval.length === 0) {
            await client.query('ROLLBACK'); // Added rollback before returning
            return res.status(404).json({ message: 'Pending approval record not found' });
        }

        const currentStep = approval[0];
        const { rows: reqRows } = await client.query(
            `SELECT id, emp_id, leave_type, status, ml_document_submitted, ml_hod_verified, ml_principal_verified
             FROM leave_requests WHERE id = $1`,
            [requestId]
        );
        if (reqRows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: 'Leave request not found' });
        }
        const leaveReq = reqRows[0];
        const isMedicalLeave = String(leaveReq.leave_type || '').toUpperCase() === 'ML';

        if (status === 'Approved' && isMedicalLeave) {
            if (!leaveReq.ml_document_submitted) {
                await client.query('ROLLBACK');
                return res.status(400).json({ message: 'Medical documents are required before approval. Ask employee to upload and submit documents.' });
            }

            if (currentStep.approver_type === 'hod' && !leaveReq.ml_hod_verified) {
                await client.query(
                    `UPDATE leave_requests
                     SET ml_hod_verified = TRUE,
                         ml_hod_verified_by = $2,
                         ml_hod_verified_at = NOW()
                     WHERE id = $1`,
                    [requestId, userId]
                );
            }

            if ((currentStep.approver_type === 'principal' || currentStep.approver_type === 'admin')) {
                if (!leaveReq.ml_hod_verified && req.user.role !== 'admin') {
                    await client.query('ROLLBACK');
                    return res.status(400).json({ message: 'HOD must verify medical documents before principal final verification.' });
                }
                await client.query(
                    `UPDATE leave_requests
                     SET ml_principal_verified = TRUE,
                         ml_principal_verified_by = $2,
                         ml_principal_verified_at = NOW()
                     WHERE id = $1`,
                    [requestId, userId]
                );
            }
        }

        await client.query(
            'UPDATE leave_approvals SET status = $1, comments = $2 WHERE id = $3',
            [status, comments, currentStep.id]
        );

        // 2. Handle Rejection (Universal)
        if (status === 'Rejected') {
            await client.query('UPDATE leave_requests SET status = \'Rejected\' WHERE id = $1', [requestId]);

            // Revert leave balance (only for regular leave requests, not comp_credit)
            const { rows: reqDetails } = await client.query('SELECT emp_id, leave_type, from_date, days_count, request_type FROM leave_requests WHERE id = $1', [requestId]);
            const requestMeta = reqDetails[0] || null;
            if (reqDetails.length > 0) {
                const { emp_id, leave_type, from_date, days_count, request_type } = reqDetails[0];
                if (request_type !== 'comp_credit') {
                    const currentYear = new Date(from_date).getFullYear();
                    const columnTakenMap = {
                        'CL': 'cl_taken', 'ML': 'ml_taken', 'OD': 'od_taken',
                        'Comp Leave': 'comp_taken', 'LOP': 'lop_taken'
                    };
                    const takenCol = columnTakenMap[leave_type];
                    if (takenCol) {
                        await client.query(
                            `UPDATE leave_balances SET ${takenCol} = GREATEST(0, COALESCE(${takenCol}, 0) - $1) WHERE emp_id = $2 AND year = $3`,
                            [days_count, emp_id, currentYear]
                        );
                    }
                }
            }

            // Notify applicant
            const { rows: applicantRows } = await client.query('SELECT emp_id FROM leave_requests WHERE id = $1', [requestId]);
            const notifyMsg = requestMeta?.request_type === 'comp_credit'
                ? `Your comp off request has been REJECTED by ${req.user.name}.`
                : `Your leave request has been REJECTED by ${req.user.name}.`;
            await createNotification(applicantRows[0].emp_id, notifyMsg, 'leave', null, client);
        }

        // 3. Handle Approval & Escalate
        else if (status === 'Approved') {
            if (currentStep.approver_type === 'replacement') {
                // ... (existing replacement logic)
                const { rows: pendingReps } = await client.query(
                    'SELECT COUNT(*) as count FROM leave_approvals WHERE leave_request_id = $1 AND approver_type = \'replacement\' AND status = \'Pending\'',
                    [requestId]
                );

                if (parseInt(pendingReps[0].count) === 0) {
                    const { rows: applicantRows } = await client.query(`
                        SELECT u.department_id, u.name, u.role, l.is_half_day, l.hours FROM leave_requests l 
                        JOIN users u ON l.emp_id = u.emp_id WHERE l.id = $1
                    `, [requestId]);

                    const applicant = applicantRows[0];
                    const hoursInfo = (applicant?.is_half_day && applicant?.hours) ? ` (${applicant.hours} Hours)` : '';

                    if (applicant?.role === 'hod') {
                        // HOD request goes directly to Principal after replacements approve
                        const { rows: principalRows } = await client.query('SELECT emp_id FROM users WHERE role = \'principal\' LIMIT 1');
                        if (principalRows.length > 0) {
                            await client.query(`
                                INSERT INTO leave_approvals (leave_request_id, approver_id, approver_type, status)
                                VALUES ($1, $2, 'principal', 'Pending')
                            `, [requestId, principalRows[0].emp_id]);

                            await createNotification(principalRows[0].emp_id, `Leave request from HOD ${applicant.name}${hoursInfo} (All replacements approved) requires your approval.`, 'leave', null, client);
                        }
                    } else {
                        // Standard staff goes to HOD
                        const { rows: hodRows } = await client.query('SELECT emp_id FROM users WHERE department_id = $1 AND role = \'hod\'', [applicant?.department_id]);

                        if (hodRows.length > 0) {
                            await client.query(`
                                INSERT INTO leave_approvals (leave_request_id, approver_id, approver_type, status)
                                VALUES ($1, $2, 'hod', 'Pending')
                            `, [requestId, hodRows[0].emp_id]);

                            await createNotification(hodRows[0].emp_id, `Leave request from ${applicant?.name}${hoursInfo} (All replacements approved) requires your HOD approval.`, 'leave', null, client);
                        } else {
                            // Fallback to principal if no HOD assigned
                            const { rows: principalRows } = await client.query('SELECT emp_id FROM users WHERE role = \'principal\' LIMIT 1');
                            if (principalRows.length > 0) {
                                await client.query(`
                                    INSERT INTO leave_approvals (leave_request_id, approver_id, approver_type, status)
                                    VALUES ($1, $2, 'principal', 'Pending')
                                `, [requestId, principalRows[0].emp_id]);

                                await createNotification(principalRows[0].emp_id, `Leave request from ${applicant?.name}${hoursInfo} (All replacements approved) requires your approval.`, 'leave', null, client);
                            }
                        }
                    }
                }
            }
            else if (currentStep.approver_type === 'hod') {
                const { rows: principalRows } = await client.query('SELECT emp_id FROM users WHERE role = \'principal\' LIMIT 1');

                if (principalRows.length > 0) {
                    const { rows: reqData } = await client.query('SELECT is_half_day, hours FROM leave_requests WHERE id = $1', [requestId]);
                    const hoursInfo = (reqData[0]?.is_half_day && reqData[0]?.hours) ? ` (${reqData[0].hours} Hours)` : '';

                    await client.query(`
                        INSERT INTO leave_approvals (leave_request_id, approver_id, approver_type, status)
                        VALUES ($1, $2, 'principal', 'Pending')
                    `, [requestId, principalRows[0].emp_id]);

                    await createNotification(principalRows[0].emp_id, `Leave request${hoursInfo} escalated to Principal level for final approval.`, 'leave', null, client);
                }
            }
            else if (currentStep.approver_type === 'principal' || currentStep.approver_type === 'admin') {
                // Final Approval
                await client.query('UPDATE leave_requests SET status = \'Approved\' WHERE id = $1', [requestId]);

                const { rows: reqDetails } = await client.query('SELECT emp_id, leave_type, from_date, to_date, days_count, request_type, is_half_day, hours, dates_detail FROM leave_requests WHERE id = $1', [requestId]);
                const { emp_id, leave_type, from_date, to_date, days_count, request_type, is_half_day, hours, dates_detail } = reqDetails[0];

                const io = req.app.get('io');

                if (request_type === 'comp_credit') {
                    // Comp credit approved — comp_earned is derived from approved comp_credit requests
                    // No attendance update needed (already shows Present)
                    await createNotification(emp_id, `Your comp off request for ${new Date(from_date).toLocaleDateString('en-IN')} has been APPROVED. Comp leave credited!`, 'leave', null, client);

                    if (io) {
                        io.emit('leave_limits_updated', { emp_id, year: new Date(from_date).getFullYear() });
                    }
                } else {
                    // Regular leave — update attendance records for each date in the range
                    const startIso = String(from_date || '').slice(0, 10);
                    const endIso = String(to_date || '').slice(0, 10);
                    const start = new Date(`${startIso}T00:00:00Z`);
                    const end = new Date(`${endIso}T00:00:00Z`);
                    const datesDetail = Array.isArray(dates_detail) ? dates_detail : (typeof dates_detail === 'string' ? JSON.parse(dates_detail || '[]') : []);
                    const attendanceStatus = leave_type === 'OD' ? 'OD' : 'Leave';

                    for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
                        const dateStr = d.toISOString().slice(0, 10);

                        // Find matching date in datesDetail
                        const detail = datesDetail.find(dd => dd.date === dateStr);
                        let remarks;
                        if (detail && (detail.day_type || !detail.is_full_day)) {
                            const [fH, fM] = detail.from_time.split(':').map(Number);
                            const [tH, tM] = detail.to_time.split(':').map(Number);
                            let diff = (tH * 60 + tM) - (fH * 60 + fM);
                            if (diff < 0) diff += 1440;
                            const dur = `${Math.floor(diff / 60)}h ${diff % 60}m`;
                            const fromTimeStr = new Date(`2000-01-01T${detail.from_time}`).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
                            const toTimeStr = new Date(`2000-01-01T${detail.to_time}`).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
                            remarks = `${leave_type}${detail.day_type ? ' (' + detail.day_type + ')' : ''}: ${fromTimeStr}-${toTimeStr} (${dur})`;
                        } else {
                            remarks = `${leave_type} (Full Day)`;
                        }

                        // Pass null for in_time and out_time because they are reserved ONLY for physical punches
                        await client.query(`
                            INSERT INTO attendance_records (emp_id, date, status, in_time, out_time, remarks)
                            VALUES ($1, $2, $3, $4, $5, $6)
                            ON CONFLICT (emp_id, date) 
                            DO UPDATE SET 
                                status = 
                                    CASE 
                                        -- If it's a half-day/partial leave and they have in_time, keep 'Present' (or 'Present + ...')
                                        WHEN attendance_records.in_time IS NOT NULL THEN
                                            CASE 
                                                WHEN CAST(attendance_records.status AS text) LIKE 'Present%' THEN attendance_records.status
                                                ELSE 'Present'
                                            END
                                        -- Otherwise, use the specific leave type
                                        ELSE EXCLUDED.status
                                    END,
                                remarks = 
                                    CASE
                                        -- If existing remark is null/empty, use incoming
                                        WHEN attendance_records.remarks IS NULL OR attendance_records.remarks = '' THEN EXCLUDED.remarks
                                        -- If it's a full day leave, it might be replaced by a more specific partial one
                                        WHEN EXCLUDED.remarks LIKE '%:%' AND attendance_records.remarks LIKE '%Full Day%' THEN EXCLUDED.remarks
                                        -- Avoid duplication: if existing remarks doesn't contain the new one, append it
                                        WHEN attendance_records.remarks NOT LIKE '%' || EXCLUDED.remarks || '%' THEN attendance_records.remarks || ' | ' || EXCLUDED.remarks
                                        -- Otherwise keep existing
                                        ELSE attendance_records.remarks
                                    END
                        `, [emp_id, dateStr, attendanceStatus, null, null, remarks]);
                    }

                    await createNotification(emp_id, `Congratulations! Your leave request${(reqDetails[0].is_half_day && reqDetails[0].hours) ? ` (${reqDetails[0].hours} Hours)` : ''} has been FINALLY APPROVED.`, 'leave', null, client);

                    if (io) {
                        io.emit('attendance_updated', { emp_id, leave_type });
                    }
                }
            }
        }

        await client.query('COMMIT'); // Changed from connection.commit() to client.query('COMMIT')
        res.json({ message: `Leave ${status} successfully at ${currentStep.approver_type} level.` });
    } catch (error) {
        await client.query('ROLLBACK'); // Changed from connection.rollback() to client.query('ROLLBACK')
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    } finally {
        client.release(); // Changed from connection.release() to client.release()
    }
};

// @desc    Delete leave request
exports.deleteLeaveRequest = async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const { rows: reqData } = await client.query('SELECT emp_id, leave_type, from_date, days_count, status, request_type FROM leave_requests WHERE id = $1', [req.params.id]);
        if (reqData.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: 'Request not found' });
        }

        const request = reqData[0];

        if (req.user.role !== 'admin' && request.emp_id !== req.user.emp_id) {
            await client.query('ROLLBACK');
            return res.status(403).json({ message: 'Not authorized' });
        }

        if (request.status !== 'Pending' && req.user.role !== 'admin') {
            await client.query('ROLLBACK');
            return res.status(400).json({ message: 'Cannot delete processed request' });
        }

        // Only revert balance for Pending or Approved regular leave requests
        // Comp credit requests never deducted balance, so skip revert
        if ((request.status === 'Pending' || request.status === 'Approved') && request.request_type !== 'comp_credit') {
            const reqYearStr = new Date(request.from_date).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }).split('-')[0];
            const currentYear = parseInt(reqYearStr);
            const columnTakenMap = {
                'CL': 'cl_taken', 'ML': 'ml_taken', 'OD': 'od_taken',
                'Comp Leave': 'comp_taken', 'LOP': 'lop_taken'
            };
            const takenCol = columnTakenMap[request.leave_type];
            if (takenCol) {
                await client.query(
                    `UPDATE leave_balances SET ${takenCol} = GREATEST(0, COALESCE(${takenCol}, 0) - $1) WHERE emp_id = $2 AND year = $3`,
                    [request.days_count, request.emp_id, currentYear]
                );
            }
        }

        await client.query('DELETE FROM leave_requests WHERE id = $1', [req.params.id]);
        await client.query('COMMIT');
        res.json({ message: 'Leave request deleted and balance reverted if applicable' });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    } finally {
        client.release();
    }
};
// @desc    Get all employees on leave for a date range
exports.getLeaveConflicts = async (req, res) => {
    const { from, to } = req.query;
    if (!from || !to) return res.json([]);

    try {
        const query = `
            SELECT emp_id FROM leave_requests 
            WHERE status IN ('Approved', 'Pending')
            AND (
                (from_date <= $1 AND to_date >= $2) OR
                (from_date <= $3 AND to_date >= $4) OR
                (from_date >= $5 AND to_date <= $6)
            )
        `;
        const { rows } = await pool.query(query, [from, from, to, to, from, to]);
        res.json(rows.map(r => r.emp_id));
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Get all leave requests history (for principal/admin)
// @route   GET /api/leaves/history
// @access  Private (principal, admin)
exports.getAllLeaveHistory = async (req, res) => {
    try {
        await ensureLeaveRequestDocumentSchema(pool);
        const query = `
            SELECT l.*, u.name as applicant_name, u.role as applicant_role, u.designation as applicant_designation, u.profile_pic as applicant_pic, d.name as department_name
            FROM leave_requests l
            JOIN users u ON l.emp_id = u.emp_id
            LEFT JOIN departments d ON u.department_id = d.id
            ORDER BY l.created_at DESC
        `;
        const { rows } = await pool.query(query);
        const parsed = rows.map(r => {
            let dates_detail = r.dates_detail || [];
            try {
                if (typeof dates_detail === 'string' && dates_detail.length > 0) dates_detail = JSON.parse(dates_detail);
            } catch (e) { dates_detail = []; }
            const hoursVal = r.hours !== null && r.hours !== undefined ? parseFloat(r.hours) : null;
            let single_day_time_range = null;
            if (Array.isArray(dates_detail) && dates_detail.length === 1 && dates_detail[0].is_full_day === false) {
                const f = new Date('2000-01-01T' + dates_detail[0].from_time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
                const t = new Date('2000-01-01T' + dates_detail[0].to_time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
                single_day_time_range = `${f} - ${t}`;
            }
            return { ...r, dates_detail, hours: hoursVal, single_day_time_range };
        });
        res.json(parsed);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Upload medical documents for a medical leave request
// @route   POST /api/leaves/:id/medical-documents
// @access  Private (applicant only)
exports.uploadMedicalDocuments = async (req, res) => {
    const requestId = req.params.id;
    const { file_name, file_type, file_data } = req.body;

    if (!file_name || !file_type || !file_data) {
        return res.status(400).json({ message: 'file_name, file_type and file_data are required.' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await ensureLeaveRequestDocumentSchema(client);

        const { rows: reqRows } = await client.query(
            `SELECT l.id, l.emp_id, l.leave_type, l.status, u.name AS applicant_name, u.department_id, u.role
             FROM leave_requests l
             JOIN users u ON u.emp_id = l.emp_id
             WHERE l.id = $1`,
            [requestId]
        );

        if (reqRows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: 'Leave request not found.' });
        }

        const reqInfo = reqRows[0];
        if (String(reqInfo.emp_id || '') !== String(req.user.emp_id || '')) {
            await client.query('ROLLBACK');
            return res.status(403).json({ message: 'Only the applicant can upload medical documents.' });
        }
        if (String(reqInfo.leave_type || '').toUpperCase() !== 'ML') {
            await client.query('ROLLBACK');
            return res.status(400).json({ message: 'Medical documents can only be uploaded for Medical Leave (ML).' });
        }
        if (String(reqInfo.status || '').toLowerCase() !== 'pending') {
            await client.query('ROLLBACK');
            return res.status(400).json({ message: 'Documents can only be uploaded while the request is pending.' });
        }

        await client.query(
            `UPDATE leave_requests
             SET ml_doc_file_name = $2,
                 ml_doc_file_type = $3,
                 ml_doc_file_data = $4,
                 ml_document_submitted = TRUE,
                 ml_document_submitted_at = NOW(),
                 ml_hod_verified = FALSE,
                 ml_hod_verified_by = NULL,
                 ml_hod_verified_at = NULL,
                 ml_principal_verified = FALSE,
                 ml_principal_verified_by = NULL,
                 ml_principal_verified_at = NULL
             WHERE id = $1`,
            [requestId, file_name, file_type, file_data]
        );

        // Notify HOD first for document verification, else fallback to principal.
        let notified = false;
        if (String(reqInfo.role || '').toLowerCase() !== 'hod') {
            const { rows: hodRows } = await client.query(
                `SELECT emp_id FROM users WHERE department_id = $1 AND role = 'hod' LIMIT 1`,
                [reqInfo.department_id]
            );
            if (hodRows.length > 0) {
                await createNotification(
                    hodRows[0].emp_id,
                    `Medical documents uploaded by ${reqInfo.applicant_name}. Please verify ML documents and forward to principal.`,
                    'leave',
                    { requestId: reqInfo.id, flow: 'ml_doc_verification' },
                    client
                );
                notified = true;
            }
        }

        if (!notified) {
            const { rows: principalRows } = await client.query(`SELECT emp_id FROM users WHERE role = 'principal' LIMIT 1`);
            if (principalRows.length > 0) {
                await createNotification(
                    principalRows[0].emp_id,
                    `Medical documents uploaded by ${reqInfo.applicant_name}. Final ML document verification required.`,
                    'leave',
                    { requestId: reqInfo.id, flow: 'ml_doc_verification' },
                    client
                );
            }
        }

        await client.query('COMMIT');
        res.json({ message: 'Medical documents uploaded and submitted for verification.' });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('UPLOAD MEDICAL DOCUMENTS ERROR:', error);
        res.status(500).json({ message: 'Server Error: ' + error.message });
    } finally {
        client.release();
    }
};

// @desc    Get eligible dates for comp off (holidays/weekends where employee was Present)
// @route   GET /api/leaves/comp-dates
// @access  Private
exports.getEligibleCompDates = async (req, res) => {
    try {
        const year = parseInt(req.query.year) || new Date().getFullYear();
        const { rows } = await pool.query(`
            SELECT a.date, a.in_time, a.out_time
            FROM attendance_records a
            WHERE a.emp_id = $1
              AND a.status = 'Present'
              AND a.in_time IS NOT NULL 
              AND a.out_time IS NOT NULL
              AND EXTRACT(YEAR FROM a.date) = $2
              AND (
                EXTRACT(DOW FROM a.date) IN (0, 6)
                OR a.date IN (SELECT h_date FROM holidays WHERE EXTRACT(YEAR FROM h_date) = $2)
              )
              AND a.date NOT IN (
                SELECT lr.from_date FROM leave_requests lr
                WHERE lr.emp_id = $1 AND lr.request_type = 'comp_credit' AND lr.status != 'Rejected'
              )
            ORDER BY a.date DESC
        `, [req.user.emp_id, year]);
        res.json(rows);
    } catch (error) {
        console.error('GET ELIGIBLE COMP DATES ERROR:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Apply for comp off credit (employee worked on holiday)
// @route   POST /api/leaves/comp-credit
// @access  Private
exports.applyCompCredit = async (req, res) => {
    const { work_date, reason } = req.body;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Verify the date is a holiday or weekend
        const dateObj = new Date(work_date + 'T00:00:00Z');
        const dow = dateObj.getUTCDay(); // 0=Sun, 6=Sat
        const { rows: holidayCheck } = await client.query(
            'SELECT id FROM holidays WHERE h_date = $1', [work_date]
        );
        if (dow !== 0 && dow !== 6 && holidayCheck.length === 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ message: 'The selected date is not a holiday or weekend.' });
        }

        // 2. Verify employee has attendance (Present) on that date
        const { rows: attCheck } = await client.query(
            "SELECT id FROM attendance_records WHERE emp_id = $1 AND date = $2 AND status = 'Present'",
            [req.user.emp_id, work_date]
        );
        if (attCheck.length === 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ message: 'No attendance record found on this date. You must have punched in and out.' });
        }

        // 3. Check no duplicate comp credit request for this date
        const { rows: dupCheck } = await client.query(
            "SELECT id FROM leave_requests WHERE emp_id = $1 AND from_date = $2 AND request_type = 'comp_credit' AND status != 'Rejected'",
            [req.user.emp_id, work_date]
        );
        if (dupCheck.length > 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ message: 'A comp off request already exists for this date.' });
        }

        // 4. Create leave_request with request_type='comp_credit'
        const { rows: resultRows } = await client.query(
            `INSERT INTO leave_requests (emp_id, leave_type, from_date, to_date, days_count, reason, subject, status, request_type)
             VALUES ($1, 'Comp Leave', $2, $2, 1, $3, 'Comp Off Request', 'Pending', 'comp_credit')
             RETURNING id`,
            [req.user.emp_id, work_date, reason || 'Worked on holiday']
        );
        const requestId = resultRows[0].id;

        // 5. Route to approver based on role
        if (req.user.role === 'hod') {
            // HOD's request goes directly to principal
            const { rows: principalRows } = await client.query(
                "SELECT emp_id FROM users WHERE role = 'principal' LIMIT 1"
            );
            if (principalRows.length > 0) {
                await client.query(
                    `INSERT INTO leave_approvals (leave_request_id, approver_id, approver_type, status)
                     VALUES ($1, $2, 'principal', 'Pending')`,
                    [requestId, principalRows[0].emp_id]
                );
                await createNotification(principalRows[0].emp_id, `${req.user.name} (HOD) has requested comp off credit for working on a holiday (${work_date}).`, 'leave', null, client);
            }
        } else {
            // Staff request goes to department HOD
            const { rows: hodRows } = await client.query(
                "SELECT emp_id FROM users WHERE department_id = $1 AND role = 'hod'",
                [req.user.department_id]
            );
            if (hodRows.length > 0) {
                await client.query(
                    `INSERT INTO leave_approvals (leave_request_id, approver_id, approver_type, status)
                     VALUES ($1, $2, 'hod', 'Pending')`,
                    [requestId, hodRows[0].emp_id]
                );
                await createNotification(hodRows[0].emp_id, `${req.user.name} has requested comp off credit for working on a holiday (${work_date}).`, 'leave', null, client);
            }
        }

        await client.query('COMMIT');

        const io = req.app.get('io');
        if (io) io.emit('leave_updated');

        res.status(201).json({ message: 'Comp off request submitted for approval.' });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('APPLY COMP CREDIT ERROR:', error);
        res.status(500).json({ message: 'Server Error: ' + error.message });
    } finally {
        client.release();
    }
};
