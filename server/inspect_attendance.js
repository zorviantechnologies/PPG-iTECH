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

async function inspect() {
    const client = await pool.connect();
    try {
        const { rows: cols } = await client.query(`
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'attendance'
            ORDER BY ordinal_position
        `);
        require('fs').writeFileSync('attendance_inspection.json', JSON.stringify(cols, null, 2));
        console.log('Results written to attendance_inspection.json');
    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        client.release();
        await pool.end();
    }
}

inspect();
