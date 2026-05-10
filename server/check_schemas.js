const { pool } = require('./config/db');

async function check() {
    try {
        const { rows } = await pool.query(`
            SELECT table_schema, table_name, column_name, data_type, udt_name 
            FROM information_schema.columns 
            WHERE table_name = 'users' AND column_name = 'role'
        `);
        console.log('Users tables with role column:', JSON.stringify(rows, null, 2));
    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}

check();
