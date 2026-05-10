require('dotenv').config({path:'.env'});
const { pool } = require('./config/db.js');
async function run() {
  try {
    const r1 = await pool.query("DELETE FROM users WHERE designation = 'Biometric Imported'");
    console.log('DELETED AUTO-CREATED USERS:', r1.rowCount);
  } catch(e) {
    console.error('Error', e.message);
  } finally {
    await pool.end();
  }
}
run();
