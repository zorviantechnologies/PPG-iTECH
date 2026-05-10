const { pool } = require('./config/db');

async function checkUsers() {
    try {
        const result = await pool.query(
            "SELECT emp_id, name, role FROM users WHERE emp_id IN ('EMP001', 'EMP002', 'EMP003')"
        );
        console.log('Employees found:', result.rows);
        if (result.rows.length < 3) {
            console.log('Some employees are missing. Please ensure EMP001, EMP002, and EMP003 are created.');
        }
    } catch (error) {
        console.error('Error checking users:', error.message);
    } finally {
        await pool.end();
    }
}

checkUsers();
