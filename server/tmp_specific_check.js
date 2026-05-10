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

async function check() {
    try {
        const att = await pool.query("SELECT COUNT(*) FROM attendance");
        console.log("Count in 'attendance':", att.rows[0].count);
        try {
            const attRec = await pool.query("SELECT COUNT(*) FROM attendance_records");
            console.log("Count in 'attendance_records':", attRec.rows[0].count);
        } catch (e) { console.log("'attendance_records' table does not exist"); }
    } catch (err) {
        console.error(err.message);
    } finally {
        await pool.end();
    }
}
check();
