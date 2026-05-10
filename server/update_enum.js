const { pool } = require('./config/db');

const update = async () => {
    try {
        await pool.query("ALTER TYPE notification_type_enum ADD VALUE IF NOT EXISTS 'attendance'");
        console.log('✅ Added attendance to notification_type_enum');
        process.exit(0);
    } catch (err) {
        console.error('❌ Failed to update enum:', err.message);
        process.exit(1);
    }
};

update();
