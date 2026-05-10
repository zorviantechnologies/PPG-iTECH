require('dotenv').config({ path: './server/.env' });
const { pool } = require('./server/config/db');
const check = async () => {
    try {
        const { rows } = await pool.query(`
            SELECT enumlabel 
            FROM pg_enum 
            JOIN pg_type ON pg_enum.enumtypid = pg_type.oid 
            WHERE pg_type.typname = 'attendance_status'
        `);
        console.log('Attendance Status Enum:', rows.map(r => r.enumlabel));
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};
check();
