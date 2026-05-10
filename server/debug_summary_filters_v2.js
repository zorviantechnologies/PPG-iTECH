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

async function debugData() {
    try {
        const { rows: depts } = await pool.query("SELECT id, name FROM departments");
        console.log("DEPARTMENTS:", JSON.stringify(depts, null, 2));

        const { rows: users } = await pool.query("SELECT emp_id, name, role, department_id FROM users LIMIT 20");
        console.log("USERS:", JSON.stringify(users, null, 2));

        const { rows: sampleAtt } = await pool.query("SELECT emp_id, date, status FROM attendance_records LIMIT 5");
        console.log("ATTENDANCE SAMPLE:", JSON.stringify(sampleAtt, null, 2));
    } catch (err) {
        console.error(err.message);
    } finally {
        await pool.end();
    }
}
debugData();
