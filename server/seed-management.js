const { Pool } = require('pg');
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'itech',
  password: '1234',
  port: 5432
});

async function setup() {
  try {
    // Check if management user exists
    const { rows } = await pool.query("SELECT * FROM users WHERE role = 'management'");
    if (rows.length === 0) {
      console.log('Creating management user...');
      await pool.query(
        "INSERT INTO users (emp_id, name, role, pin, password) VALUES ($1, $2, $3, $4, $5)",
        ['Management', 'Management', 'management', '1234', 'no-password-login-via-pin']
      );
    } else {
      console.log('Management user already exists.');
    }
  } catch (err) {
    console.error('Setup error:', err);
  } finally {
    pool.end();
  }
}

setup();
