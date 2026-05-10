const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
    ssl: false
});

async function checkManagement() {
    try {
        const res = await pool.query("SELECT * FROM users WHERE emp_id ILIKE 'Management'");
        console.log('Management Users:', res.rows.map(r => ({ id: r.id, emp_id: r.emp_id, role: r.role })));
        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

checkManagement();
