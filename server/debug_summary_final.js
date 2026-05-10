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

async function test() {
    try {
        const query = `
            SELECT 
                u.emp_id, u.name, u.role,
                COALESCE(SUM(CASE WHEN a.status::text = 'Present' THEN 1 ELSE 0 END), 0) as total_present,
                COALESCE(SUM(CASE WHEN a.status::text IN ('Comp Leave', 'CL', 'ML', 'Leave') THEN 1 ELSE 0 END), 0) as total_leave,
                COALESCE(SUM(CASE WHEN a.status::text = 'OD' THEN 1 ELSE 0 END), 0) as total_od,
                COALESCE(SUM(CASE WHEN a.status::text IN ('Absent', 'LOP') THEN 1 ELSE 0 END), 0) as total_lop
            FROM public.users u
            LEFT JOIN attendance_records a ON u.emp_id = a.emp_id 
                AND (a.date AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date BETWEEN '2026-02-01' AND '2026-03-05'
            WHERE u.role IN ('principal', 'hod', 'staff')
            GROUP BY u.emp_id, u.name, u.role
        `;
        const { rows } = await pool.query(query);
        console.log("SUCCESS! Row count:", rows.length);
        if (rows.length > 0) console.log("Sample:", rows[0]);
    } catch (err) {
        console.error("QUERY FAILED:", err.message);
    } finally {
        await pool.end();
    }
}
test();
