const { pool } = require('./config/db');
const { rebuildAttendanceFromBiometricTimeline } = require('./controllers/biometricController');

async function test() {
  try {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const { rows: logs } = await pool.query('SELECT DISTINCT emp_id FROM biometric_logs WHERE log_time::date = $1', [today]);
    console.log(`Found ${logs.length} users with logs today.`);

    for (const log of logs) {
      try {
        console.log(`Rebuilding for ${log.emp_id}...`);
        await rebuildAttendanceFromBiometricTimeline(log.emp_id, today);
      } catch (err) {
        console.error(`Error for ${log.emp_id}:`, err.message);
      }
    }
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
test();
