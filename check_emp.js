require('dotenv').config({ path: './server/.env' });
const { queryWithRetry, pool } = require('./server/config/db');

async function checkEmp() {
    try {
        const { rows } = await queryWithRetry(
            "SELECT emp_id, name, role FROM users LIMIT 10"
        );
        console.log('ROWS COUNT:', rows.length);
        console.log('ROWS:', JSON.stringify(rows));
    } catch (err) {
        console.error('ERROR:', err);
    } finally {
        if (pool) await pool.end();
    }
}

checkEmp();
