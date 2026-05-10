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

async function run() {
    try {
        console.log("--- SEARCHING FOR APPROVED LEAVES VS ATTENDANCE ---");
        const res = await pool.query(`
            SELECT l.id, l.emp_id, l.from_date, l.status as leave_status, a.status as att_status
            FROM leave_requests l
            LEFT JOIN attendance_records a ON l.emp_id = a.emp_id AND (a.date::date = l.from_date::date)
            WHERE l.status = 'Approved'
            ORDER BY l.id DESC LIMIT 10
        `);
        console.log(JSON.stringify(res.rows, null, 2));
    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}
run();
