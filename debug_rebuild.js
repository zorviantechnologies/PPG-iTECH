require('dotenv').config({path:'server/.env'});
const { pool } = require('./server/config/db.js');
const { rebuildAttendanceFromBiometricTimeline } = require('./server/controllers/biometricController.js');

async function run() {
  try {
    const { rows } = await pool.query(`
      SELECT DISTINCT TRIM(emp_id) as emp_id, 
             (log_time AT TIME ZONE 'Asia/Kolkata')::date as log_date 
      FROM biometric_logs 
      WHERE (log_time AT TIME ZONE 'Asia/Kolkata')::date = '2026-03-29'::date 
      LIMIT 5
    `);
    
    console.log(`Found ${rows.length} rows to test`);
    
    for(const r of rows) {
      try {
        console.log('Testing:', r);
        await rebuildAttendanceFromBiometricTimeline(r.emp_id, r.log_date);
        console.log('OK for', r.emp_id);
      } catch(e) {
        console.error('FAIL for', r.emp_id, ':', e.message);
        console.error(e.stack);
      }
    }
  } catch(e) {
    console.error('Total DB Error:', e);
  } finally {
    await pool.end();
  }
}
run();
