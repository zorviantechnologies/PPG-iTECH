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

async function fix() {
  const payloads = [
    { emp_id: '844', log_time: '2026-03-30 09:03:24', type: 'IN' },
    { emp_id: '1119', log_time: '2026-03-30 09:03:27', type: 'IN' }
  ];

  try {
    for (const p of payloads) {
      console.log(`Inserting log for ${p.emp_id}...`);
      await pool.query(
        `INSERT INTO biometric_logs (emp_id, log_time, type, device_id) 
         VALUES ($1, $2, $3, $4) 
         ON CONFLICT (emp_id, log_time) DO NOTHING`,
        [p.emp_id, p.log_time, p.type, 'MANUAL_FIX']
      );
    }

    // Now trigger rebuild for both
    const controller = require('./controllers/biometricController');
    const todayStr = '2026-03-30';
    
    console.log("Rebuilding attendance records for 844...");
    await controller.rebuildAttendanceFromBiometricTimeline('844', todayStr);
    
    console.log("Rebuilding attendance records for 1119...");
    await controller.rebuildAttendanceFromBiometricTimeline('1119', todayStr);
    
    console.log("FIX COMPLETED.");
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
fix();
