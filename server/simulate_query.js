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

async function simulateQuery() {
    const client = await pool.connect();
    try {
        const month = '2026-02';
        let query = `
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
        `;
        const params = [month];
        query += ' GROUP BY u.emp_id, u.name, u.role';

        console.log('Running simulated query for month:', month);
        const { rows } = await client.query(query, params);
        console.log('Query result length:', rows.length);
        console.log(JSON.stringify(rows, null, 2));

    } catch (err) {
        console.error(err);
    } finally {
        client.release();
        await pool.end();
    }
}

simulateQuery();
