const { pool, queryWithRetry } = require('../config/db');

const apiCache = new Map();
const CACHE_TTL = 30000; // 30 seconds

const getCachedResult = (cacheKey) => {
    const cached = apiCache.get(cacheKey);
    if (cached && Date.now() - cached.time < CACHE_TTL) return cached.data;
    if (cached) apiCache.delete(cacheKey);
    return null;
};

const setCachedResult = (cacheKey, data) => {
    apiCache.set(cacheKey, { data, time: Date.now() });
};

// @desc    Get attendance records (with filters)
// @route   GET /api/attendance
// @access  Private
exports.getAttendance = async (req, res) => {
    try {
        const { date, month, startDate, endDate, role, department_id, emp_id, onlyUploaded, recent, limit } = req.query;

        // Return only actual uploaded records when requested (no generated absent/holiday rows).
        if (onlyUploaded === 'true') {
            const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
            const safeLimit = Math.min(Math.max(parseInt(limit || '10', 10), 1), 100);

            const params = [];
            let userFilter = "u.role IN ('principal', 'hod', 'staff')";

            if (role) {
                userFilter += ` AND u.role = $${params.push(role)}`;
            }
            if (department_id) {
                userFilter += ` AND u.department_id = $${params.push(department_id)}`;
            }
            if (emp_id) {
                userFilter += ` AND u.emp_id = $${params.push(emp_id)}`;
            }
            if (req.user.role === 'staff') {
                userFilter += ` AND u.emp_id = $${params.push(req.user.emp_id)}`;
            }

            let uploadedDateCondition = `(a.date <= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date)`;

            if (recent !== 'true') {
                let start;
                let end;

                if (date) {
                    start = date;
                    end = date;
                } else if (month) {
                    start = `${month}-01`;
                    end = new Date(new Date(start).getFullYear(), new Date(start).getMonth() + 1, 0).toISOString().split('T')[0];
                } else if (startDate && endDate) {
                    start = startDate;
                    end = endDate;
                } else {
                    const now = new Date();
                    start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
                    end = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
                }

                if (start > today) return res.json([]);
                if (end > today) end = today;

                const startIdx = params.push(start);
                const endIdx = params.push(end);
                uploadedDateCondition = `a.date BETWEEN $${startIdx} AND $${endIdx}`;
            }

            const limitIdx = params.push(safeLimit);

            const uploadedQuery = `
                SELECT
                    a.date,
                    u.emp_id,
                    u.name,
                    u.role,
                    d.name as department_name,
                    a.status::text as status,
                    a.in_time,
                    a.out_time,
                    a.remarks,
                    a.id as record_id
                FROM attendance_records a
                JOIN users u ON u.emp_id = a.emp_id
                LEFT JOIN departments d ON u.department_id = d.id
                WHERE ${userFilter} AND ${uploadedDateCondition}
                ORDER BY a.date ASC, u.name ASC
                LIMIT $${limitIdx}
            `;

            const { rows } = await queryWithRetry(uploadedQuery, params);
            return res.json(rows);
        }

        let start, end;
        if (date) {
            start = end = date;
        } else if (month) {
            start = `${month}-01`;
            end = new Date(new Date(start).getFullYear(), new Date(start).getMonth() + 1, 0).toISOString().split('T')[0];
        } else if (startDate && endDate) {
            start = startDate;
            end = endDate;
        } else {
            // Default to current month
            const now = new Date();
            start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
            end = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
        }

        // Cap dates to current date (IST) to prevent showing future attendance
        const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
        if (start > today) return res.json([]);
        if (end > today) end = today;

        const params = [start, end];
        let userFilter = 'u.role IN (\'principal\', \'hod\', \'staff\')';
        const userParams = [];

        if (role) {
            userFilter += ' AND u.role = $' + (userParams.push(role) + 2);
            params.push(role);
        }
        if (department_id) {
            userFilter += ' AND u.department_id = $' + (userParams.push(department_id) + 2);
            params.push(department_id);
        }
        if (emp_id) {
            userFilter += ' AND u.emp_id = $' + (userParams.push(emp_id) + 2);
            params.push(emp_id);
        }

        if (req.user.role === 'staff') {
            userFilter += ' AND u.emp_id = $' + (userParams.push(req.user.emp_id) + 2);
            params.push(req.user.emp_id);
        }

        // Recursive CTE to generate date sequence + CROSS JOIN with filtered users
        // This ensures scientists get a row for EVERY day in the range.
        const query = `
            WITH RECURSIVE date_range AS (
                SELECT $1::date as d
                UNION ALL
                SELECT (d + 1)::date FROM date_range 
                WHERE d < $2::date AND d < (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date
            ),
            calendar_days AS (
                SELECT 
                    dr.d,
                    COALESCE(h.type, CASE WHEN EXTRACT(DOW FROM dr.d) IN (0, 6) THEN 'Holiday' ELSE 'Working Day' END) AS day_type
                FROM date_range dr
                LEFT JOIN holidays h ON h.h_date = dr.d
            ),
            target_users AS (
                SELECT u.emp_id, u.name, u.role, u.department_id, d.name as department_name
                FROM users u
                LEFT JOIN departments d ON u.department_id = d.id
                WHERE ${userFilter}
            )
            SELECT 
                cd.d as date,
                tu.emp_id,
                tu.name,
                tu.role,
                tu.department_name,
                COALESCE(a.status::text, CASE WHEN cd.day_type IN ('Holiday') THEN 'Holiday' ELSE 'Absent' END) as status,
                a.in_time,
                a.out_time,
                a.remarks,
                a.id as record_id
            FROM calendar_days cd
            CROSS JOIN target_users tu
            LEFT JOIN attendance_records a ON a.emp_id = tu.emp_id AND a.date = cd.d
            ORDER BY cd.d ASC, tu.name ASC
        `;

        const { rows } = await queryWithRetry(query, params);
        res.json(rows);
    } catch (error) {
        console.error('getAttendance ERROR:', error);
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

// @desc    Get attendance summary (Counts)
// @route   GET /api/attendance/summary
// @access  Private
exports.getAttendanceSummary = async (req, res) => {
    try {
        const { date, month, startDate, endDate, role, department_id } = req.query;
        
        const cacheKey = "sum_" + JSON.stringify(req.query);
        const cached = getCachedResult(cacheKey);
        if (cached) return res.json(cached);

        let start;
        let end;

        if (date) {
            start = date;
            end = date;
        } else if (month) {
            start = `${month}-01`;
            end = new Date(new Date(start).getFullYear(), new Date(start).getMonth() + 1, 0).toISOString().split('T')[0];
        } else if (startDate && endDate) {
            start = startDate;
            end = endDate;
        } else {
            return res.status(400).json({ message: 'Date, Month, or Range required' });
        }

        // Cap summary range to today (IST) so future dates are not counted.
        const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
        if (start > today) return res.json([]);
        if (end > today) end = today;

        const params = [start, end];

        let userFilter = "u.role IN ('principal', 'hod', 'staff')";
        if (department_id) {
            userFilter += ' AND u.department_id = $' + (params.length + 1);
            params.push(department_id);
        }
        if (role) {
            userFilter += ' AND u.role = $' + (params.length + 1);
            params.push(role);
        }

        const query = `
            WITH date_window AS (
                SELECT generate_series($1::date, $2::date, INTERVAL '1 day')::date AS d
            ),
            calendar_days AS (
                SELECT
                    dw.d,
                    COALESCE(h.type, CASE WHEN EXTRACT(DOW FROM dw.d) IN (0, 6) THEN 'Holiday' ELSE 'Working Day' END) AS day_type
                FROM date_window dw
                LEFT JOIN holidays h ON h.h_date = dw.d
            ),
            calendar_totals AS (
                SELECT
                    COALESCE(SUM(CASE WHEN day_type = 'Holiday' THEN 1 ELSE 0 END), 0) AS total_holidays,
                    COALESCE(SUM(CASE WHEN day_type IN ('Working Day', 'Special') THEN 1 ELSE 0 END), 0) AS total_working_days
                FROM calendar_days
            ),
            attendance_units AS (
                SELECT
                    u.emp_id,
                    a.id AS attendance_id,
                    COALESCE(a.status::text, '') AS status_text,
                    COALESCE(a.remarks, '') AS remarks_text,
                    CASE
                        WHEN COALESCE(a.status::text, '') ILIKE '%+%' THEN 0
                        WHEN COALESCE(a.remarks, '') ILIKE '%Half Day%'
                          OR COALESCE(a.remarks, '') ILIKE '%0.5%'
                          OR COALESCE(a.remarks, '') ILIKE '%1/2%'
                          OR COALESCE(a.status::text, '') ILIKE '%half%'
                        THEN 0.5
                        ELSE 1
                    END AS unit_value,
                    CASE
                        WHEN COALESCE(a.status::text, '') ILIKE '%+%' THEN 0.5
                        ELSE 0
                    END AS split_unit
                FROM public.users u
                LEFT JOIN attendance_records a ON u.emp_id = a.emp_id
                    AND a.date BETWEEN $1 AND $2
                WHERE ${userFilter}
            )
            SELECT 
                u.emp_id, u.name, u.role, u.department_id,
                MAX(COALESCE(au.status_text, '')) as status,
                MAX(COALESCE(au.remarks_text, '')) as remarks,
                COALESCE(SUM(
                    CASE 
                        WHEN au.status_text ILIKE '%+%' THEN
                            (CASE WHEN TRIM(split_part(au.status_text, '+', 1)) ILIKE 'Present' THEN au.split_unit ELSE 0 END)
                            +
                            (CASE WHEN TRIM(split_part(au.status_text, '+', 2)) ILIKE 'Present' THEN au.split_unit ELSE 0 END)
                        WHEN au.status_text ILIKE '%Present%' AND au.status_text NOT ILIKE '%Absent%' AND au.status_text NOT ILIKE '%LOP%' THEN au.unit_value
                        ELSE 0 
                    END
                ), 0) as total_present,
                COALESCE(SUM(
                    CASE
                        WHEN au.status_text ILIKE '%+%' THEN
                            (CASE WHEN TRIM(split_part(au.status_text, '+', 1)) ILIKE 'Absent' THEN au.split_unit ELSE 0 END)
                            +
                            (CASE WHEN TRIM(split_part(au.status_text, '+', 2)) ILIKE 'Absent' THEN au.split_unit ELSE 0 END)
                        WHEN au.status_text ILIKE '%Absent%' THEN au.unit_value
                        ELSE 0
                    END
                ), 0) as total_absent,
                COALESCE(SUM(
                    CASE
                        WHEN au.status_text ILIKE '%+%' THEN
                            (CASE WHEN TRIM(split_part(au.status_text, '+', 1)) ILIKE 'CL' OR TRIM(split_part(au.status_text, '+', 1)) ILIKE 'Casual Leave' THEN au.split_unit ELSE 0 END)
                            +
                            (CASE WHEN TRIM(split_part(au.status_text, '+', 2)) ILIKE 'CL' OR TRIM(split_part(au.status_text, '+', 2)) ILIKE 'Casual Leave' THEN au.split_unit ELSE 0 END)
                        WHEN (au.status_text ILIKE '%CL%' OR au.remarks_text ILIKE '%CL%' OR au.remarks_text ILIKE '%Casual Leave%')
                             AND au.status_text NOT ILIKE '%Comp Leave%'
                             AND au.remarks_text NOT ILIKE '%Comp Leave%'
                        THEN au.unit_value
                        ELSE 0
                    END
                ), 0) as total_cl,
                COALESCE(SUM(
                    CASE
                        WHEN au.status_text ILIKE '%+%' THEN
                            (CASE WHEN TRIM(split_part(au.status_text, '+', 1)) ILIKE 'ML' OR TRIM(split_part(au.status_text, '+', 1)) ILIKE 'Medical Leave' THEN au.split_unit ELSE 0 END)
                            +
                            (CASE WHEN TRIM(split_part(au.status_text, '+', 2)) ILIKE 'ML' OR TRIM(split_part(au.status_text, '+', 2)) ILIKE 'Medical Leave' THEN au.split_unit ELSE 0 END)
                        WHEN au.status_text ILIKE '%ML%' OR au.remarks_text ILIKE '%ML%' OR au.remarks_text ILIKE '%Medical Leave%'
                        THEN au.unit_value
                        ELSE 0
                    END
                ), 0) as total_ml,
                COALESCE(SUM(
                    CASE
                        WHEN au.status_text ILIKE '%+%' THEN
                            (CASE WHEN TRIM(split_part(au.status_text, '+', 1)) ILIKE 'Comp Leave' THEN au.split_unit ELSE 0 END)
                            +
                            (CASE WHEN TRIM(split_part(au.status_text, '+', 2)) ILIKE 'Comp Leave' THEN au.split_unit ELSE 0 END)
                        WHEN au.status_text ILIKE '%Comp Leave%' OR au.remarks_text ILIKE '%Comp Leave%'
                        THEN au.unit_value
                        ELSE 0
                    END
                ), 0) as total_comp,
                COALESCE(SUM(
                    CASE
                        WHEN au.status_text ILIKE '%+%' THEN
                            (CASE WHEN TRIM(split_part(au.status_text, '+', 1)) ILIKE 'OD' OR TRIM(split_part(au.status_text, '+', 1)) ILIKE 'On Duty' THEN au.split_unit ELSE 0 END)
                            +
                            (CASE WHEN TRIM(split_part(au.status_text, '+', 2)) ILIKE 'OD' OR TRIM(split_part(au.status_text, '+', 2)) ILIKE 'On Duty' THEN au.split_unit ELSE 0 END)
                        WHEN au.status_text ILIKE '%OD%' OR au.remarks_text ILIKE '%OD%' OR au.remarks_text ILIKE '%On Duty%'
                        THEN au.unit_value
                        ELSE 0
                    END
                ), 0) as total_od,
                COALESCE(SUM(
                    CASE
                        WHEN au.status_text ILIKE '%+%' THEN
                            (CASE WHEN TRIM(split_part(au.status_text, '+', 1)) ILIKE 'LOP' THEN au.split_unit ELSE 0 END)
                            +
                            (CASE WHEN TRIM(split_part(au.status_text, '+', 2)) ILIKE 'LOP' THEN au.split_unit ELSE 0 END)
                        WHEN au.status_text ILIKE '%LOP%' OR au.remarks_text ILIKE '%LOP%' OR au.remarks_text ILIKE '%Loss of Pay%'
                        THEN au.unit_value
                        ELSE 0
                    END
                ), 0) as total_lop,
                COALESCE(SUM(CASE WHEN au.status_text ILIKE '%Late%' OR au.remarks_text ILIKE '%Late Entry%' THEN 1 ELSE 0 END), 0) as total_late,
                COALESCE(
                    SUM(
                        CASE
                            WHEN au.status_text ILIKE '%+%' THEN
                                (CASE
                                    WHEN TRIM(split_part(au.status_text, '+', 1)) ILIKE 'CL'
                                      OR TRIM(split_part(au.status_text, '+', 1)) ILIKE 'ML'
                                      OR TRIM(split_part(au.status_text, '+', 1)) ILIKE 'OD'
                                      OR TRIM(split_part(au.status_text, '+', 1)) ILIKE 'Comp Leave'
                                      OR TRIM(split_part(au.status_text, '+', 1)) ILIKE 'Casual Leave'
                                      OR TRIM(split_part(au.status_text, '+', 1)) ILIKE 'Medical Leave'
                                      OR TRIM(split_part(au.status_text, '+', 1)) ILIKE 'On Duty'
                                    THEN au.split_unit ELSE 0 END)
                                +
                                (CASE
                                    WHEN TRIM(split_part(au.status_text, '+', 2)) ILIKE 'CL'
                                      OR TRIM(split_part(au.status_text, '+', 2)) ILIKE 'ML'
                                      OR TRIM(split_part(au.status_text, '+', 2)) ILIKE 'OD'
                                      OR TRIM(split_part(au.status_text, '+', 2)) ILIKE 'Comp Leave'
                                      OR TRIM(split_part(au.status_text, '+', 2)) ILIKE 'Casual Leave'
                                      OR TRIM(split_part(au.status_text, '+', 2)) ILIKE 'Medical Leave'
                                      OR TRIM(split_part(au.status_text, '+', 2)) ILIKE 'On Duty'
                                    THEN au.split_unit ELSE 0 END)
                            WHEN au.status_text ILIKE '%Comp Leave%'
                              OR au.remarks_text ILIKE '%Comp Leave%'
                              OR ((au.status_text ILIKE '%CL%' OR au.remarks_text ILIKE '%CL%' OR au.remarks_text ILIKE '%Casual Leave%') AND au.status_text NOT ILIKE '%Comp Leave%' AND au.remarks_text NOT ILIKE '%Comp Leave%')
                              OR au.status_text ILIKE '%ML%'
                              OR au.remarks_text ILIKE '%ML%'
                              OR au.remarks_text ILIKE '%Medical Leave%'
                              OR au.status_text ILIKE '%OD%'
                              OR au.remarks_text ILIKE '%OD%'
                              OR au.remarks_text ILIKE '%On Duty%'
                            THEN au.unit_value
                            ELSE 0
                        END
                    ),
                    0
                ) as total_leave,
                ct.total_working_days,
                ct.total_holidays
                , GREATEST(0, ct.total_working_days - COALESCE(COUNT(au.attendance_id), 0)) as total_computed_absent
                , COALESCE(SUM(
                    CASE
                        WHEN au.status_text ILIKE '%+%' THEN
                            (CASE WHEN TRIM(split_part(au.status_text, '+', 1)) ILIKE 'Absent' THEN au.split_unit ELSE 0 END)
                            +
                            (CASE WHEN TRIM(split_part(au.status_text, '+', 2)) ILIKE 'Absent' THEN au.split_unit ELSE 0 END)
                        WHEN au.status_text ILIKE '%Absent%' THEN au.unit_value
                        ELSE 0
                    END
                ), 0) + GREATEST(0, ct.total_working_days - COALESCE(COUNT(au.attendance_id), 0)) as total_actual_absent

            FROM public.users u
            CROSS JOIN calendar_totals ct
            LEFT JOIN attendance_units au ON au.emp_id = u.emp_id
            WHERE ${userFilter}
            GROUP BY u.emp_id, u.name, u.role, u.department_id, ct.total_working_days, ct.total_holidays
            ORDER BY u.name ASC
        `;

        const { rows } = await queryWithRetry(query, params);
        setCachedResult(cacheKey, rows);
        res.json(rows);
    } catch (error) {
        console.error('getAttendanceSummary ERROR:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Get 6-month attendance trend
// @route   GET /api/attendance/stats/trend
// @access  Private
exports.getAttendanceTrend = async (req, res) => {
    try {
        const query = `
            SELECT 
                TO_CHAR(date, 'Mon YYYY') as month_name,
                SUM(CASE WHEN status::text LIKE '%Present%' THEN 1 ELSE 0 END) as present,
                SUM(CASE WHEN status::text LIKE '%Leave%' OR status::text LIKE '%Comp Leave%' OR remarks LIKE '%Comp Leave:%' OR status::text LIKE '%CL%' OR remarks LIKE '%CL:%' OR status::text LIKE '%ML%' OR remarks LIKE '%ML:%' THEN 1 ELSE 0 END) as "leave",
                SUM(CASE WHEN status::text LIKE '%Absent%' OR status::text LIKE '%LOP%' THEN 1 ELSE 0 END) as lop
            FROM attendance_records
            WHERE date >= CURRENT_DATE - INTERVAL '6 months'
            GROUP BY TO_CHAR(date, 'YYYY-MM'), month_name
            ORDER BY TO_CHAR(date, 'YYYY-MM') ASC
        `;
        const { rows } = await queryWithRetry(query);
        res.json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Get distinct attendance status options
// @route   GET /api/attendance/status-options
// @access  Private
exports.getAttendanceStatusOptions = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const params = [];
        const where = [`status IS NOT NULL`, `TRIM(status::text) <> ''`];

        if (startDate) {
            params.push(startDate);
            where.push(`date >= $${params.length}::date`);
        }
        if (endDate) {
            params.push(endDate);
            where.push(`date <= $${params.length}::date`);
        }

        const query = `
            SELECT DISTINCT TRIM(status::text) AS status
            FROM attendance_records
            WHERE ${where.join(' AND ')}
            ORDER BY status ASC
        `;

        const { rows } = await queryWithRetry(query, params);
        const defaults = ['Present', 'CL', 'ML', 'Comp Leave', 'OD', 'Leave', 'Holiday', 'Weekend', 'Absent', 'LOP'];
        const merged = Array.from(new Set([
            ...defaults,
            ...rows.map((r) => String(r.status || '').trim()).filter(Boolean)
        ]));

        res.json(merged);
    } catch (error) {
        console.error('getAttendanceStatusOptions ERROR:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};


