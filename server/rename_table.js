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

async function renameTable() {
    try {
        console.log("Dropping empty 'attendance_records' table...");
        await pool.query("DROP TABLE IF EXISTS attendance_records CASCADE");

        console.log("Renaming 'attendance' to 'attendance_records'...");
        await pool.query("ALTER TABLE attendance RENAME TO attendance_records");

        console.log("Renaming sequence if it exists...");
        try {
            await pool.query("ALTER SEQUENCE attendance_id_seq RENAME TO attendance_records_id_seq");
        } catch (e) { console.log("Sequence rename skipped or not needed."); }

        console.log("Table renamed successfully!");

        const { rows } = await pool.query("SELECT COUNT(*) FROM attendance_records");
        console.log(`New 'attendance_records' row count: ${rows[0].count}`);
    } catch (err) {
        console.error("FAILED to rename table:", err.message);
    } finally {
        await pool.end();
    }
}

renameTable();
