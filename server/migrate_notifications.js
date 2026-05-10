const { pool } = require('./config/db');

async function migrate() {
    try {
        console.log('Adding metadata column to notifications table...');
        await pool.query('ALTER TABLE notifications ADD COLUMN IF NOT EXISTS metadata JSONB;');
        console.log('Migration successful.');
        process.exit(0);
    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    }
}

migrate();
