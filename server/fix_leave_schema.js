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

async function fixLeaveTable() {
    const client = await pool.connect();
    try {
        console.log('Adding missing subject column to leave_requests...');
        await client.query(`
            ALTER TABLE leave_requests 
            ADD COLUMN IF NOT EXISTS subject VARCHAR(255)
        `);
        console.log('✅ subject column added (or already existed)');

        // Verify columns now
        const { rows } = await client.query(`
            SELECT column_name FROM information_schema.columns 
            WHERE table_name = 'leave_requests'
            ORDER BY ordinal_position
        `);
        console.log('leave_requests columns now:', rows.map(r => r.column_name));

    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        client.release();
        await pool.end();
    }
}

fixLeaveTable();
