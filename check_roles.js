const { pool } = require('./server/config/db');

async function checkRoles() {
    try {
        const { rows } = await pool.query('SELECT role, COUNT(*) FROM users GROUP BY role');
        console.log('--- DATABASE ROLES ---');
        console.table(rows);
        process.exit(0);
    } catch (e) {
        console.error('Error checking roles:', e);
        process.exit(1);
    }
}

checkRoles();
