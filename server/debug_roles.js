const { pool } = require('./config/db');

async function debugRoles() {
    try {
        const { rows } = await pool.query("SELECT DISTINCT role FROM users");
        console.log('Available Roles in DB:', rows);
    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}
debugRoles();
