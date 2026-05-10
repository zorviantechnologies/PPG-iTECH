require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 5432,
});

async function migrate() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Add permission_limit to leave_limits (if missing)
        await client.query(`
            ALTER TABLE leave_limits
            ADD COLUMN IF NOT EXISTS permission_limit INTEGER DEFAULT 2
        `);
        console.log('✓ leave_limits.permission_limit ensured');

        // Add permission_taken to leave_balances (if missing)
        await client.query(`
            ALTER TABLE leave_balances
            ADD COLUMN IF NOT EXISTS permission_taken INTEGER DEFAULT 0
        `);
        console.log('✓ leave_balances.permission_taken ensured');

        await client.query('COMMIT');
        console.log('✅ Migration complete!');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('❌ Migration failed:', err.message);
        process.exit(1);
    } finally {
        client.release();
        process.exit(0);
    }
}

migrate();
