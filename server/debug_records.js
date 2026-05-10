const { pool } = require('./config/db');

async function debug() {
    try {
        const today = new Date().toISOString().split('T')[0];
        console.log('Today:', today);

        const { rows: todayRecords } = await pool.query(`
            SELECT a.*, u.name, u.role 
            FROM attendance a 
            LEFT JOIN users u ON a.emp_id = u.emp_id 
            WHERE a.date = $1
        `, [today]);

        console.log('Records for today:', JSON.stringify(todayRecords, null, 2));

        const { rows: employees } = await pool.query("SELECT emp_id, name, role FROM users WHERE role IN ('principal', 'hod', 'staff')");
        console.log('All matching employees:', JSON.stringify(employees, null, 2));

    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}

debug();
