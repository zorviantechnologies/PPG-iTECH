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

        await client.query(`
            CREATE TABLE IF NOT EXISTS app_settings (
                key VARCHAR(100) PRIMARY KEY,
                value VARCHAR(255) NOT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✓ app_settings table ensured');

        // Insert default official punch time if not exists
        await client.query(`
            INSERT INTO app_settings (key, value)
            VALUES ('official_punch_time', '09:00')
            ON CONFLICT DO NOTHING
        `);
        console.log('✓ official_punch_time default set');

        await client.query('COMMIT');
        console.log('✅ Settings migration complete!');
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
