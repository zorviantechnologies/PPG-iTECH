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

async function testQuery() {
    const start = '2026-02-01';
    const end = '2026-02-28';
    const params = [start, end];
    let userFilter = "u.role IN ('principal', 'hod', 'staff')";

    // Cast a.status to text to avoid enum vs string mismatch
    const query = `
        WITH RECURSIVE date_range AS (
            SELECT $1::date as d
            UNION ALL
            SELECT (d + 1)::date FROM date_range WHERE d < $2::date
        ),
        target_users AS (
            SELECT u.emp_id, u.name, u.role, u.department_id, d.name as department_name
            FROM users u
            LEFT JOIN departments d ON u.department_id = d.id
            WHERE ${userFilter}
        )
        SELECT 
            dr.d as date,
            tu.emp_id,
            tu.name,
            tu.role,
            tu.department_name,
            COALESCE(a.status::text, CASE WHEN EXTRACT(DOW FROM dr.d) = 0 THEN 'Holiday' ELSE 'Absent' END) as status,
            a.in_time,
            a.out_time,
            a.id as record_id
        FROM date_range dr
        CROSS JOIN target_users tu
        LEFT JOIN attendance_records a ON a.emp_id = tu.emp_id AND (a.date AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date = dr.d
        ORDER BY dr.d DESC, tu.name ASC
        LIMIT 20
    `;

    try {
        const { rows } = await pool.query(query, params);
        console.log("Query Results (Top 20):");
        console.log(JSON.stringify(rows, null, 2).substring(0, 1000) + "...");
    } catch (err) {
        console.error("Query Failed:", err.message);
    } finally {
        await pool.end();
    }
}

testQuery();
