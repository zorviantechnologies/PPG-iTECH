require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 5432,
    ssl: { rejectUnauthorized: false }
});

async function simulateApplyLeave() {
    console.log("Simulating Apply Leave");
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const req = {
            user: { emp_id: 'EMP003', name: 'Manoj', department_id: 2 },
            body: {
                leave_type: 'CL',
                from_date: '2026-03-05',
                to_date: '2026-03-06',
                days_count: 2,
                reason: 'Test reason',
                subject: 'Test Subject',
                replacements: [{ staff_id: 'EMP002', periods: '1, 2' }]
            }
        };

        const {
            leave_type, from_date, to_date, days_count,
            reason, subject, replacements, is_half_day, hours
        } = req.body;

        // 0. Check Leave Limits
        const { rows: settings } = await client.query(
            'SELECT max_days FROM leave_settings WHERE leave_type = $1',
            [leave_type]
        );
        const maxDaysAllowed = settings[0]?.max_days || 15;

        const currentYear = new Date().getFullYear();
        const { rows: balance } = await client.query(
            'SELECT * FROM leave_balances WHERE emp_id = $1 AND year = $2',
            [req.user.emp_id, currentYear]
        );

        // Ensure test user exists in users table (for local simulation environments)
        const { rows: userRows } = await client.query('SELECT emp_id FROM users WHERE emp_id = $1', [req.user.emp_id]);
        if (userRows.length === 0) {
            const hashed = bcrypt.hashSync('testpassword', 8);
            await client.query(
                `INSERT INTO users (emp_id, name, role, department_id, password) VALUES ($1, $2, $3, $4, $5)`,
                [req.user.emp_id, req.user.name, req.user.role || 'staff', req.user.department_id || 2, hashed]
            );
            console.log('Inserted test user into users table for simulation.');
        }

        console.log("Balance length: ", balance.length);
        if (balance.length === 0) {
            await client.query(
                'INSERT INTO leave_balances (emp_id, year) VALUES ($1, $2)',
                [req.user.emp_id, currentYear]
            );
        }

        const columnMap = { 'CL': 'cl_taken', 'ML': 'ml_taken', 'OD': 'od_taken', 'Comp Leave': 'comp_taken', 'LOP': 'lop_taken' };
        const taken = balance[0] ? (balance[0][columnMap[leave_type]] || 0) : 0;
        const totalDays = parseFloat(days_count) || 0;

        if (taken + totalDays > maxDaysAllowed) {
            throw new Error(`Leave limit exceeded for ${leave_type}. Allowed: ${maxDaysAllowed}, Taken: ${taken}`);
        }

        // 1. Create main leave request
        const validReplacements = replacements ? replacements.filter(r => r.staff_id && r.staff_id !== '') : [];
        const firstReplacementId = validReplacements.length > 0 ? validReplacements[0].staff_id : null;

        // Ensure replacement users exist (to satisfy FK on leave_approvals)
        for (const rep of validReplacements) {
            const { rows: repUser } = await client.query('SELECT emp_id FROM users WHERE emp_id = $1', [rep.staff_id]);
            if (repUser.length === 0) {
                const hashed = bcrypt.hashSync('testpassword', 8);
                await client.query(
                    `INSERT INTO users (emp_id, name, role, department_id, password) VALUES ($1, $2, $3, $4, $5)`,
                    [rep.staff_id, `Rep ${rep.staff_id}`, 'staff', req.user.department_id || 2, hashed]
                );
                console.log(`Inserted replacement user ${rep.staff_id} for simulation.`);
            }
        }

        const { rows: resultRows } = await client.query(
            `INSERT INTO leave_requests (emp_id, leave_type, from_date, to_date, days_count, reason, subject, alternative_staff_id, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'Pending')
             RETURNING id`,
            [req.user.emp_id, leave_type, from_date, to_date, totalDays, reason, subject || 'Leave Request', firstReplacementId]
        );

        const requestId = resultRows[0].id;
        console.log("Request ID:", requestId);

        // 2. Initial Approval Step: Replacements or HOD
        if (validReplacements.length > 0) {
            for (const rep of validReplacements) {
                await client.query(
                    `INSERT INTO leave_approvals (leave_request_id, approver_id, approver_type, status, comments)
                     VALUES ($1, $2, 'replacement', 'Pending', $3)`,
                    [requestId, rep.staff_id, rep.periods ? `Periods: ${rep.periods}` : 'Standard Replacement']
                );

                await client.query(
                    `INSERT INTO notifications (user_id, message, type) VALUES ($1, $2, 'leave')`,
                    [rep.staff_id, `${req.user.name} has requested you as a replacement (${rep.periods || 'Standard'}) for their leave.`]
                );
            }
        } else {
            // Straight to HOD
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

                await client.query(
                    `INSERT INTO notifications (user_id, message, type) VALUES ($1, $2, 'leave')`,
                    [hodId, `New leave request from ${req.user.name} requires your approval.`]
                );
            }
        }

        await client.query('ROLLBACK'); // Rollback just so we don't pollute the DB during testing
        console.log("Simulation SUCCESS. Everything works.");
    } catch (err) {
        await client.query('ROLLBACK');
        console.error("Simulation ERROR:", err.message);
    } finally {
        client.release();
        await pool.end();
    }
}

simulateApplyLeave();
