const { pool } = require('./config/db');
const fs = require('fs');

const run = async () => {
    const res = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'attendance_records'");
    fs.writeFileSync('att_cols.txt', JSON.stringify(res.rows, null, 2));
    process.exit(0);
};
run();
