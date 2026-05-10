const { pool } = require('../config/db');

async function checkRoles() {
    try {
        const res = await pool.query("SELECT DISTINCT role FROM users");
        console.log('Roles found:', res.rows.map(r => r.role));
        process.exit(0);
    } catch (error) {
        console.error('Error fetching roles:', error);
        process.exit(1);
    }
}

checkRoles();
