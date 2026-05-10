const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 5432,
    ssl: { rejectUnauthorized: false }
});

async function testGetAttendanceSummary() {
    // req.query
    const queryParams = {
        startDate: '2026-02-01',
        endDate: '2026-03-05',
        department_id: '2',
        role: 'staff'
    };

    try {
        const { date, month, startDate, endDate, role, department_id } = queryParams;

        const params = [];
        let dateCondition = '';

        if (date) {
            dateCondition = "(a.date AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date = $1";
            params.push(date);
        } else if (month) {
            dateCondition = "TO_CHAR(a.date AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM') = $1";
            params.push(month);
        } else if (startDate && endDate) {
            dateCondition = "(a.date AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date BETWEEN $1 AND $2";
            params.push(startDate, endDate);
        }

        let userFilter = "u.role IN ('principal', 'hod', 'staff')";
        if (department_id) {
            userFilter += ' AND u.department_id = $' + (params.push(department_id));
        }
        if (role) {
            userFilter += ' AND u.role = $' + (params.push(role));
        }

        const query = `
            SELECT 
                u.emp_id, u.name, u.role,
                COALESCE(SUM(CASE WHEN a.status = 'Present' THEN 1 ELSE 0 END), 0) as total_present,
                COALESCE(SUM(CASE WHEN a.status IN ('Comp Leave', 'CL', 'ML', 'Leave') THEN 1 ELSE 0 END), 0) as total_leave,
                COALESCE(SUM(CASE WHEN a.status = 'OD' THEN 1 ELSE 0 END), 0) as total_od,
                COALESCE(SUM(CASE WHEN a.status IN ('Absent', 'LOP') THEN 1 ELSE 0 END), 0) as total_lop
            FROM public.users u
            LEFT JOIN attendance_records a ON u.emp_id = a.emp_id AND ${dateCondition}
            WHERE ${userFilter}
            GROUP BY u.emp_id, u.name, u.role 
            ORDER BY u.name ASC
        `;

        console.log("FINAL QUERY:", query);
        console.log("PARAMS:", params);

        const { rows } = await pool.query(query, params);
        console.log("ROWS RETURNED:", rows.length);
        console.log("SAMPLE ROW:", rows[0]);
    } catch (err) {
        console.error("CRITICAL ERROR:", err.message);
    } finally {
        await pool.end();
    }
}

testGetAttendanceSummary();
