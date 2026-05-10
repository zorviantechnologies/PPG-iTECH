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

async function checkSchema() {
    try {
        const { rows } = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'attendance_records'");
        console.log("SCHEMA:", JSON.stringify(rows, null, 2));
    } catch (err) {
        console.error(err.message);
    } finally {
        await pool.end();
    }
}
checkSchema();
