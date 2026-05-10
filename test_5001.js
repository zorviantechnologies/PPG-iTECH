require('dotenv').config({path:'server/.env'});
const { pool } = require('./server/config/db.js');
async function run() {
  try {
    const { rows } = await pool.query("SELECT * FROM biometric_attendance WHERE user_id = '5001'");
    console.log(rows);
  } catch(e) {
    console.error(e);
  } finally {
    await pool.end();
  }
}
run();
