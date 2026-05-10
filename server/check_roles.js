require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT,
  max: 1
});

const ids = ['5001', '5045', '844', '1119', '242', '1112', '1181', '970', '878'];

async function check() {
  try {
    const { rows } = await pool.query('SELECT emp_id, name, role FROM users WHERE emp_id = ANY($1)', [ids]);
    console.log(JSON.stringify(rows, null, 2));
    process.exit(0);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
check();
