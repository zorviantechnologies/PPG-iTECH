const { Pool } = require('pg');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '.env') });

const pool = new Pool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT,
    ssl: { rejectUnauthorized: false }
});

async function getAdmin() {
    try {
        const { rows } = await pool.query("SELECT emp_id, pin FROM users WHERE role = 'admin' LIMIT 1;");
        console.log(JSON.stringify(rows[0]));
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

getAdmin();
