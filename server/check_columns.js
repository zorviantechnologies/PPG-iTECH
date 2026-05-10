const { pool } = require('./config/db');

const check = async () => {
    try {
        const tables = ['attendance_records', 'leave_requests', 'permission_requests'];
        for (const table of tables) {
            const res = await pool.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = '${table}'`);
            console.log(`Table: ${table}`);
            res.rows.forEach(r => console.log(`  - ${r.column_name} (${r.data_type})`));
        }
        process.exit(0);
    } catch (err) {
        console.error(err.message);
        process.exit(1);
    }
};

check();
