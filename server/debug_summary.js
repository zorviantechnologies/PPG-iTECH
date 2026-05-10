require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 5432,
    ssl: { rejectUnauthorized: false }
});

async function debugSummary() {
    const client = await pool.connect();
    try {
        const month = '2026-02';
        console.log('DEBUGGING SUMMARY FOR MONTH:', month);

        // 1. Check all users with eligible roles
        const { rows: users } = await client.query(`
            SELECT emp_id, name, role, department_id 
            FROM users 
            WHERE role IN ('principal', 'hod', 'staff')
        `);
        console.log('Eligible Users:', users.length);

        // 2. Check all attendance for Feb
        const { rows: att } = await client.query(`
            SELECT emp_id, date, status 
            FROM attendance 
            WHERE TO_CHAR(date, 'YYYY-MM') = '2026-02'
        `);
        console.log('Feb Attendance Records:', att.length);

        // 3. Run the actual query used in controller
        const { rows: result } = await client.query(`
            SELECT
                u.emp_id, u.name, u.role,
                COALESCE(SUM(CASE WHEN a.status = 'Present' THEN 1 ELSE 0 END), 0) as total_present,
                COALESCE(SUM(CASE WHEN a.status IN ('CL', 'ML', 'Comp Leave') THEN 1 ELSE 0 END), 0) as total_leave,
                COALESCE(SUM(CASE WHEN a.status = 'OD' THEN 1 ELSE 0 END), 0) as total_od,
                COALESCE(SUM(CASE WHEN a.status = 'LOP' THEN 1 ELSE 0 END), 0) as total_lop,
                COALESCE(SUM(CASE WHEN a.status = 'Absent' THEN 1 ELSE 0 END), 0) as total_absent
            FROM users u
            LEFT JOIN attendance a ON u.emp_id = a.emp_id AND TO_CHAR(a.date, 'YYYY-MM') = $1
            WHERE u.role IN ('principal', 'hod', 'staff')
            GROUP BY u.emp_id, u.name, u.role
        `, [month]);

        console.log('Final Result Count:', result.length);

        require('fs').writeFileSync('debug_summary_output.json', JSON.stringify({
            users_count: users.length,
            att_count: att.length,
            result_count: result.length,
            result: result
        }, null, 2));

        console.log('Debug info written to debug_summary_output.json');

    } catch (err) {
        console.error(err);
    } finally {
        client.release();
        await pool.end();
    }
}

debugSummary();
