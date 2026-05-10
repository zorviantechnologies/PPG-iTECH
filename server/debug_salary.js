const { pool } = require('./config/db');

async function debug() {
    try {
        console.log('--- Debugging Salary Records ---');
        const { rows: users } = await pool.query("SELECT emp_id, name, role FROM users WHERE role = 'principal'");
        console.log('Principals found:', users);

        const { rows: salaries } = await pool.query("SELECT * FROM salary_records WHERE emp_id IN (SELECT emp_id FROM users WHERE role = 'principal')");
        console.log('Principal Salary Records:', salaries);

        const { rows: allSalaries } = await pool.query("SELECT * FROM salary_records LIMIT 5");
        console.log('Sample Salary Records:', allSalaries);

    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}
debug();
