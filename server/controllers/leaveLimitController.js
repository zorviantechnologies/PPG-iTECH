const { pool } = require('../config/db');

const currentYear = () => new Date().getFullYear();
const currentMonthKey = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }).slice(0, 7);

const normalizePeriodDate = (rawValue, isEndDate = false) => {
    if (!rawValue) return null;

    const value = String(rawValue).trim();
    if (!value) return null;

    // Supports both YYYY-MM and YYYY-MM-DD
    if (/^\d{4}-\d{2}$/.test(value)) {
        if (!isEndDate) return `${value}-01`;
        const [y, m] = value.split('-').map(Number);
        return new Date(y, m, 0).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

    return null;
};

const toMonthKey = (dateValue) => {
    if (!dateValue) return null;
    return String(dateValue).slice(0, 7);
};

const sanitizeLimit = (value, fallback = null) => {
    if (value === undefined || value === null || value === '') return fallback;
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(0, Math.min(365, parsed));
};

// Backward-compatible guard for deployments where migrations were missed.
const ensureLeaveLimitSchema = async (db) => {
    await db.query(`
        ALTER TABLE leave_limits
            ADD COLUMN IF NOT EXISTS permission_limit INT DEFAULT 2,
            ADD COLUMN IF NOT EXISTS from_month VARCHAR(10),
            ADD COLUMN IF NOT EXISTS to_month VARCHAR(10),
            ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    `);

    await db.query(`
        ALTER TABLE leave_balances
            ADD COLUMN IF NOT EXISTS permission_taken INT DEFAULT 0,
            ADD COLUMN IF NOT EXISTS last_permission_reset_month VARCHAR(7)
    `);

    // Make ON CONFLICT (emp_id, year) reliable on older databases.
    await db.query(`
        DELETE FROM leave_limits a
        USING leave_limits b
        WHERE a.ctid < b.ctid
          AND a.emp_id = b.emp_id
          AND a.year = b.year
    `);

    await db.query(`
        DELETE FROM leave_balances a
        USING leave_balances b
        WHERE a.ctid < b.ctid
          AND a.emp_id = b.emp_id
          AND a.year = b.year
    `);

    await db.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS ux_leave_limits_emp_year
        ON leave_limits(emp_id, year)
    `);

    await db.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS ux_leave_balances_emp_year
        ON leave_balances(emp_id, year)
    `);
};

// Ensure a leave_limits row exists for an employee for the given year, also fix NULLs
const ensureLimitRow = async (client, emp_id, year) => {
    await client.query(`
        INSERT INTO leave_limits (emp_id, year, cl_limit, ml_limit, od_limit, comp_limit, lop_limit, permission_limit)
        VALUES ($1, $2, 12, 12, 10, 6, 30, 2)
        ON CONFLICT (emp_id, year) DO UPDATE SET
            cl_limit   = COALESCE(leave_limits.cl_limit,   EXCLUDED.cl_limit),
            ml_limit   = COALESCE(leave_limits.ml_limit,   EXCLUDED.ml_limit),
            od_limit   = COALESCE(leave_limits.od_limit,   EXCLUDED.od_limit),
            comp_limit = COALESCE(leave_limits.comp_limit, EXCLUDED.comp_limit),
            lop_limit  = COALESCE(leave_limits.lop_limit,  EXCLUDED.lop_limit),
            permission_limit = COALESCE(leave_limits.permission_limit, EXCLUDED.permission_limit)
    `, [emp_id, year]);
};

const ensureMonthlyPermissionReset = async (client, emp_id, year, monthKey) => {
    await client.query(
        `INSERT INTO leave_balances (emp_id, year, permission_taken, last_permission_reset_month)
         VALUES ($1, $2, 0, $3)
         ON CONFLICT (emp_id, year)
         DO UPDATE SET
             permission_taken = CASE
                 WHEN leave_balances.last_permission_reset_month IS DISTINCT FROM $3 THEN 0
                 ELSE COALESCE(leave_balances.permission_taken, 0)
             END,
             last_permission_reset_month = $3`,
        [emp_id, year, monthKey]
    );
};

// @desc    Get leave limits for all staff (Admin only) with their taken balance
// @route   GET /api/leave-limits
// @access  Admin
exports.getAllLeaveLimits = async (req, res) => {
    try {
        await ensureLeaveLimitSchema(pool);

        const year = parseInt(req.query.year) || currentYear();
        const monthKey = currentMonthKey();

        // Get all employees with an employee id
        const { rows: employees } = await pool.query(`
            SELECT emp_id, name, designation, role, department_id
            FROM users
            WHERE emp_id IS NOT NULL
            ORDER BY name ASC
        `);

        // Ensure all employees have a limit record for this year
        const client = await pool.connect();
        try {
            for (const emp of employees) {
                await ensureLimitRow(client, emp.emp_id, year);
                await ensureMonthlyPermissionReset(client, emp.emp_id, year, monthKey);
            }
        } finally {
            client.release();
        }

        // Fetch limits + balances + dept name
        const { rows } = await pool.query(`
            SELECT 
                u.emp_id, u.name, u.designation, u.role, u.profile_pic, d.name AS department_name,
                ll.id AS limit_id, ll.year, ll.from_month, ll.to_month,
                ll.updated_at,
                COALESCE(ll.cl_limit, 12)   AS cl_limit,
                COALESCE(ll.ml_limit, 12)   AS ml_limit,
                COALESCE(ll.od_limit, 10)   AS od_limit,
                COALESCE(ll.comp_limit, 6)  AS comp_limit,
                COALESCE(ll.lop_limit, 30)  AS lop_limit,
                COALESCE(ll.permission_limit, 2) AS permission_limit,
                COALESCE(lb.cl_taken, 0)    AS cl_taken,
                COALESCE(lb.ml_taken, 0)    AS ml_taken,
                COALESCE(lb.od_taken, 0)    AS od_taken,
                COALESCE(lb.comp_taken, 0)  AS comp_taken,
                COALESCE(lb.lop_taken, 0)   AS lop_taken,
                COALESCE(lb.permission_taken, 0) AS permission_taken,
                COALESCE(comp_earned.cnt, 0) AS comp_earned
            FROM users u
            LEFT JOIN departments d ON u.department_id = d.id
            LEFT JOIN leave_limits ll ON ll.emp_id = u.emp_id AND ll.year = $1
            LEFT JOIN leave_balances lb ON lb.emp_id = u.emp_id AND lb.year = $1
            LEFT JOIN LATERAL (
                SELECT COUNT(*) AS cnt FROM leave_requests lr
                WHERE lr.emp_id = u.emp_id
                  AND lr.request_type = 'comp_credit'
                  AND lr.status = 'Approved'
                  AND EXTRACT(YEAR FROM lr.from_date) = $1
            ) comp_earned ON true
            WHERE u.emp_id IS NOT NULL
            ORDER BY u.name ASC
        `, [year]);

        res.json(rows);
    } catch (error) {
        console.error('getAllLeaveLimits ERROR:', error);
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

// @desc    Get leave limits for the logged-in staff member (staff view)
// @route   GET /api/leave-limits/my
// @access  Private
exports.getMyLeaveLimits = async (req, res) => {
    try {
        await ensureLeaveLimitSchema(pool);

        const year = parseInt(req.query.year) || currentYear();
        const emp_id = req.user.emp_id;
        const monthKey = currentMonthKey();

        // Ensure row exists
        const client = await pool.connect();
        try {
            await ensureLimitRow(client, emp_id, year);
            await ensureMonthlyPermissionReset(client, emp_id, year, monthKey);
        } finally {
            client.release();
        }

        const { rows } = await pool.query(`
            SELECT 
                ll.year,
                ll.updated_at,
                ll.from_month,
                ll.to_month,
                COALESCE(ll.cl_limit, 12)   AS cl_limit,
                COALESCE(ll.ml_limit, 12)   AS ml_limit,
                COALESCE(ll.od_limit, 10)   AS od_limit,
                COALESCE(ll.comp_limit, 6)  AS comp_limit,
                COALESCE(ll.lop_limit, 30)  AS lop_limit,
                COALESCE(ll.permission_limit, 2) AS permission_limit,
                COALESCE(lb.cl_taken, 0)   AS cl_taken,
                COALESCE(lb.ml_taken, 0)   AS ml_taken,
                COALESCE(lb.od_taken, 0)   AS od_taken,
                COALESCE(lb.comp_taken, 0) AS comp_taken,
                COALESCE(lb.lop_taken, 0)  AS lop_taken,
                COALESCE(lb.permission_taken, 0) AS permission_taken,
                COALESCE(comp_earned.cnt, 0) AS comp_earned
            FROM leave_limits ll
            LEFT JOIN leave_balances lb ON lb.emp_id = ll.emp_id AND lb.year = ll.year
            LEFT JOIN LATERAL (
                SELECT COUNT(*) AS cnt FROM leave_requests lr
                WHERE lr.emp_id = ll.emp_id
                  AND lr.request_type = 'comp_credit'
                  AND lr.status = 'Approved'
                  AND EXTRACT(YEAR FROM lr.from_date) = ll.year
            ) comp_earned ON true
            WHERE ll.emp_id = $1 AND ll.year = $2
        `, [emp_id, year]);

        if (rows.length === 0) {
            return res.json({
                year,
                updated_at: null,
                from_month: null,
                to_month: null,
                cl_limit: 12, ml_limit: 12, od_limit: 10, comp_limit: 6, lop_limit: 30, permission_limit: 2,
                cl_taken: 0, ml_taken: 0, od_taken: 0, comp_taken: 0, lop_taken: 0, permission_taken: 0,
                comp_earned: 0
            });
        }

        res.json(rows[0]);
    } catch (error) {
        console.error('getMyLeaveLimits ERROR:', error);
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

// @desc    Update leave limits for a specific employee (Admin only)
// @route   PUT /api/leave-limits/:emp_id
// @access  Admin
exports.updateLeaveLimit = async (req, res) => {
    try {
        await ensureLeaveLimitSchema(pool);

        const { emp_id } = req.params;
        const normalizedEmpId = decodeURIComponent(String(emp_id || '')).trim();
        if (!normalizedEmpId) {
            return res.status(400).json({ message: 'emp_id is required' });
        }
        const year = parseInt(req.body.year) || currentYear();
        const {
            cl_limit,
            ml_limit,
            od_limit,
            comp_limit,
            comp_leave_limit,
            lop_limit,
            permission_limit,
            fromMonth,
            toMonth,
            fromDate,
            toDate
        } = req.body;

        const normalizedCompLimit = sanitizeLimit(comp_limit ?? comp_leave_limit, 6);
        const normalizedClLimit = sanitizeLimit(cl_limit, 12);
        const normalizedMlLimit = sanitizeLimit(ml_limit, 12);
        const normalizedOdLimit = sanitizeLimit(od_limit, 10);
        const normalizedLopLimit = sanitizeLimit(lop_limit, 30);
        const normalizedPermissionLimit = sanitizeLimit(permission_limit, 2);

        const resolvedFromDate = normalizePeriodDate(fromDate || fromMonth, false);
        const resolvedToDate = normalizePeriodDate(toDate || toMonth, true);

        await pool.query(`
            INSERT INTO leave_limits (emp_id, year, cl_limit, ml_limit, od_limit, comp_limit, lop_limit, permission_limit, from_month, to_month, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
            ON CONFLICT (emp_id, year) 
            DO UPDATE SET
                cl_limit = $3,
                ml_limit = $4,
                od_limit = $5,
                comp_limit = $6,
                lop_limit = $7,
                permission_limit = $8,
                from_month = $9,
                to_month = $10,
                updated_at = NOW()
        `, [
            normalizedEmpId,
            year,
            normalizedClLimit,
            normalizedMlLimit,
            normalizedOdLimit,
            normalizedCompLimit,
            normalizedLopLimit,
            normalizedPermissionLimit,
            resolvedFromDate !== undefined ? resolvedFromDate : null,
            resolvedToDate !== undefined ? resolvedToDate : null
        ]);

        // Keep monthly PL counters aligned with month change semantics.
        const monthKey = currentMonthKey();
        const client = await pool.connect();
        try {
            await ensureMonthlyPermissionReset(client, normalizedEmpId, year, monthKey);
        } finally {
            client.release();
        }

        // Notify all clients that leave limits were updated
        const io = req.app.get('io');
        if (io) io.emit('leave_limits_updated', { emp_id: normalizedEmpId, year });

        res.json({ message: 'Leave limits updated successfully' });
    } catch (error) {
        console.error('updateLeaveLimit ERROR:', error);
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

// @desc    Bulk update leave limits for all employees (Admin only)
// @route   POST /api/leave-limits/bulk
// @access  Admin
exports.bulkUpdateLeaveLimits = async (req, res) => {
    const client = await pool.connect();
    try {
        await ensureLeaveLimitSchema(client);

        const year = parseInt(req.body.year) || currentYear();
        const {
            cl_limit,
            ml_limit,
            od_limit,
            comp_limit,
            comp_leave_limit,
            lop_limit,
            permission_limit,
            permission_month,
            fromMonth,
            toMonth,
            fromDate,
            toDate,
            emp_ids
        } = req.body;

        const hasClLimit = cl_limit !== undefined && cl_limit !== null && cl_limit !== '';
        const hasMlLimit = ml_limit !== undefined && ml_limit !== null && ml_limit !== '';
        const hasOdLimit = od_limit !== undefined && od_limit !== null && od_limit !== '';
        const hasCompLimit = (comp_limit !== undefined && comp_limit !== null && comp_limit !== '')
            || (comp_leave_limit !== undefined && comp_leave_limit !== null && comp_leave_limit !== '');
        const hasLopLimit = lop_limit !== undefined && lop_limit !== null && lop_limit !== '';
        const hasPermissionLimit = permission_limit !== undefined && permission_limit !== null && permission_limit !== '';

        if (!hasClLimit && !hasMlLimit && !hasOdLimit && !hasCompLimit && !hasLopLimit && !hasPermissionLimit) {
            return res.status(400).json({ message: 'Provide at least one limit to update.' });
        }

        const normalizedCompLimit = hasCompLimit ? sanitizeLimit(comp_limit ?? comp_leave_limit, 6) : null;
        const normalizedClLimit = hasClLimit ? sanitizeLimit(cl_limit, 12) : null;
        const normalizedMlLimit = hasMlLimit ? sanitizeLimit(ml_limit, 12) : null;
        const normalizedOdLimit = hasOdLimit ? sanitizeLimit(od_limit, 10) : null;
        const normalizedLopLimit = hasLopLimit ? sanitizeLimit(lop_limit, 30) : null;
        const normalizedPermissionLimit = hasPermissionLimit ? sanitizeLimit(permission_limit, 2) : null;

        const hasPeriod = Boolean(fromDate || toDate || fromMonth || toMonth);
        let resolvedFromDate = null;
        let resolvedToDate = null;
        if (hasPeriod) {
            resolvedFromDate = normalizePeriodDate(fromDate || fromMonth, false);
            resolvedToDate = normalizePeriodDate(toDate || toMonth, true);

            if (!resolvedFromDate || !resolvedToDate) {
                return res.status(400).json({ message: 'Invalid period. From Date and To Date are required in YYYY-MM-DD format.' });
            }
            if (new Date(resolvedFromDate) > new Date(resolvedToDate)) {
                return res.status(400).json({ message: 'Invalid period. From Date cannot be after To Date.' });
            }
        }

        const resolvedPermissionMonth = /^\d{4}-\d{2}$/.test(String(permission_month || '').trim())
            ? String(permission_month).trim()
            : (hasPermissionLimit ? currentMonthKey() : null);

        let employees = [];
        if (Array.isArray(emp_ids) && emp_ids.length > 0) {
            const selectedEmpIds = Array.from(
                new Set(
                    emp_ids
                        .map((id) => String(id || '').trim())
                        .filter(Boolean)
                )
            );

            if (selectedEmpIds.length === 0) {
                return res.status(400).json({ message: 'No valid employee IDs provided for bulk update.' });
            }

            const { rows } = await client.query(
                `SELECT DISTINCT emp_id
                 FROM users
                 WHERE emp_id IS NOT NULL
                   AND TRIM(emp_id) <> ''
                   AND TRIM(emp_id) = ANY($1::text[])`,
                [selectedEmpIds]
            );
            employees = rows;
        } else {
            const { rows } = await client.query(
                `SELECT DISTINCT emp_id
                 FROM users
                 WHERE emp_id IS NOT NULL
                   AND TRIM(emp_id) <> ''`
            );
            employees = rows;
        }

        if (!employees.length) {
            return res.status(400).json({ message: 'No matching employees found for bulk update.' });
        }

        const failedEmployees = [];
        let updatedCount = 0;

        for (const emp of employees) {
            const normalizedEmpId = String(emp.emp_id || '').trim();
            if (!normalizedEmpId) {
                continue;
            }

            try {
                await ensureLimitRow(client, normalizedEmpId, year);

                await client.query(
                    `UPDATE leave_limits
                     SET
                        cl_limit = COALESCE($3, cl_limit),
                        ml_limit = COALESCE($4, ml_limit),
                        od_limit = COALESCE($5, od_limit),
                        comp_limit = COALESCE($6, comp_limit),
                        lop_limit = COALESCE($7, lop_limit),
                        permission_limit = COALESCE($8, permission_limit),
                        from_month = COALESCE($9, from_month),
                        to_month = COALESCE($10, to_month),
                        updated_at = NOW()
                     WHERE emp_id = $1 AND year = $2`,
                    [
                        normalizedEmpId,
                        year,
                        normalizedClLimit,
                        normalizedMlLimit,
                        normalizedOdLimit,
                        normalizedCompLimit,
                        normalizedLopLimit,
                        normalizedPermissionLimit,
                        resolvedFromDate,
                        resolvedToDate
                    ]
                );

                // PL is monthly: reset against the requested month (or current month when omitted).
                if (hasPermissionLimit) {
                    const resetMonthKey = resolvedPermissionMonth || toMonthKey(resolvedFromDate) || currentMonthKey();
                    await ensureMonthlyPermissionReset(client, normalizedEmpId, year, resetMonthKey);
                }
                updatedCount += 1;
            } catch (employeeError) {
                failedEmployees.push({ emp_id: normalizedEmpId, error: employeeError.message });
            }
        }

        if (updatedCount === 0) {
            return res.status(500).json({
                message: 'Bulk leave limits update failed for all employees',
                updatedCount: 0,
                failedCount: failedEmployees.length,
                failedEmployees
            });
        }

        const io = req.app.get('io');
        if (io) io.emit('leave_limits_updated', { year, bulk: true });

        const failedCount = failedEmployees.length;
        const statusCode = failedCount > 0 ? 207 : 200;
        res.status(statusCode).json({
            message: failedCount > 0
                ? 'Bulk leave limits updated with partial failures'
                : 'Bulk leave limits updated successfully',
            updatedCount,
            failedCount,
            failedEmployees
        });
    } catch (error) {
        console.error('bulkUpdateLeaveLimits ERROR:', error);
        res.status(500).json({ message: 'Server Error', error: error.message });
    } finally {
        client.release();
    }
};
