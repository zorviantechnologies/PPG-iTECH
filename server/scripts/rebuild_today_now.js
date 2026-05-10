const { pool } = require('../config/db');
const { rebuildAttendanceFromBiometricTimeline } = require('../controllers/biometricController');

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  let retries = 3;

  while (retries > 0) {
    try {
      const { rows: logs } = await pool.query(
        'SELECT DISTINCT TRIM(emp_id) AS emp_id FROM biometric_logs WHERE log_time::date = $1 ORDER BY TRIM(emp_id)',
        [today]
      );

      console.log(`Rebuilding today=${today} for users=${logs.length}`);

      let updated = 0;
      let errors = 0;

      for (const row of logs) {
        try {
          await rebuildAttendanceFromBiometricTimeline(row.emp_id, today);
          updated += 1;
        } catch (err) {
          errors += 1;
          console.error(`Failed ${row.emp_id}: ${err.message}`);
        }
      }

      console.log(`DONE updated=${updated} errors=${errors}`);
      return;
    } catch (err) {
      retries -= 1;
      console.error(`Rebuild attempt failed: ${err.message}`);
      if (retries <= 0) {
        throw err;
      }
      await sleep(5000);
    }
  }
}

run()
  .catch((err) => {
    console.error('FINAL_ERROR:', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await pool.end();
    } catch (_) {}
  });
