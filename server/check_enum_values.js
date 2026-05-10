const { pool } = require('./config/db');

const check = async () => {
    try {
        const res = await pool.query("SELECT enumlabel FROM pg_enum JOIN pg_type ON pg_enum.enumtypid = pg_type.oid WHERE pg_type.typname = 'notification_type_enum'");
        console.log('ENUM VALUES:', res.rows.map(r => r.enumlabel));
        process.exit(0);
    } catch (err) {
        console.error(err.message);
        process.exit(1);
    }
};

check();
