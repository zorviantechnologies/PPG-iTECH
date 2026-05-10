const { pool } = require('./config/db');

async function inspect() {
    try {
        const { rows } = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'attendance'");
        console.log('Attendance Table Schema:', JSON.stringify(rows, null, 2));

        const { rows: userRows } = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'users'");
        console.log('Users Table Schema:', JSON.stringify(userRows, null, 2));

        const { rows: sampleAtt } = await pool.query("SELECT id, emp_id, date, status FROM attendance LIMIT 5");
        console.log('Sample Attendance Data:', JSON.stringify(sampleAtt, null, 2));

    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}

inspect();
