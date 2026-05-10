const { pool } = require('./config/db');

const run = async () => {
    try {
        await pool.query(`
            INSERT INTO app_settings (key, value) 
            VALUES ('official_punch_time', '09:00'), ('official_logout_time', '16:45') 
            ON CONFLICT (key) DO NOTHING
        `);
        console.log('✅ App settings verified.');
        process.exit(0);
    } catch (err) {
        console.error('❌ Settings error:', err.message);
        process.exit(1);
    }
};

run();
