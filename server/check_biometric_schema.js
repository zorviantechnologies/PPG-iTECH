require('dotenv').config({path: require('path').resolve(__dirname, '.env')});
const { pool } = require('./config/db.js');

async function run() {
  try {
    const r = await pool.query(`
      SELECT table_name, column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name IN ('biometric_logs', 'biometric_attendance') 
      ORDER BY table_name, ordinal_position
    `);
    console.table(r.rows);
  } catch (e) {
    console.error(e);
  } finally {
    await pool.end();
  }
}
run();
