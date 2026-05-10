const { pool } = require('./config/db');

const migrate = async () => {
    try {
        console.log('Migrating attendance_records...');
        await pool.query("ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS remarks TEXT");
        console.log('✅ Added remarks column to attendance_records');
        process.exit(0);
    } catch (err) {
        console.error('❌ Migration failed:', err.message);
        process.exit(1);
    }
};

migrate();
