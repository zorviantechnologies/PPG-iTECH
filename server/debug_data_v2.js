const { pool } = require('./config/db');

async function debugData() {
    try {
        console.log('--- Checking Users ---');
        const { rows: users } = await pool.query("SELECT emp_id, name, role, monthly_salary FROM users");
        console.log(users);

        console.log('--- Checking Attendance for Principal ---');
        const principal = users.find(u => u.role === 'principal');
        if (principal) {
            const { rows: att } = await pool.query(
                "SELECT count(*) FROM attendance_records WHERE emp_id = $1",
                [principal.emp_id]
            );
            console.log(`Principal ${principal.emp_id} has ${att[0].count} attendance records.`);
        }

        console.log('--- Checking Salary Records ---');
        const { rows: salaries } = await pool.query("SELECT * FROM salary_records");
        console.log(salaries);

    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}
debugData();
