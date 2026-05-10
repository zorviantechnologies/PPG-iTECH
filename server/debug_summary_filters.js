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
        console.log("--- DEPARTMENTS ---");
        const { rows: depts } = await pool.query("SELECT id, name FROM departments");
        console.log(depts);

        console.log("--- USERS (Top 10) ---");
        const { rows: users } = await pool.query("SELECT emp_id, name, role, department_id FROM users LIMIT 10");
        console.log(users);

        console.log("--- TEST SUMMARY PARAMETERS (Feb 2026, Role=Staff) ---");
        // Let's assume the user might have selected 'IT' department but the ID might be something else in the backend.
        // We need to see the actual IDs.
    } catch (err) {
        console.error(err.message);
    } finally {
        await pool.end();
    }
}
debugData();
