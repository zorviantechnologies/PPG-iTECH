const { pool } = require('./config/db');
async function check() {
    try {
        const res = await pool.query("SELECT column_name, data_type, udt_name FROM information_schema.columns WHERE table_name = 'attendance_records'");
        console.log(JSON.stringify(res.rows, null, 2));
    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}
check();
