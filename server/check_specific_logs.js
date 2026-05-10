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

async function check() {
  try {
    const ids = ['844', '1119'];
    const { rows: logs } = await pool.query('SELECT emp_id, log_time FROM biometric_logs WHERE emp_id = ANY($1) AND log_time::date = CURRENT_DATE', [ids]);
    console.log("LOGS:", JSON.stringify(logs, null, 2));
    
    const { rows: att } = await pool.query('SELECT user_id, intime, outtime FROM biometric_attendance WHERE user_id = ANY($1) AND date = CURRENT_DATE', [ids]);
    console.log("BIOMETRIC ATTENDANCE:", JSON.stringify(att, null, 2));

    const { rows: rec } = await pool.query('SELECT emp_id, in_time, out_time FROM attendance_records WHERE emp_id = ANY($1) AND date = CURRENT_DATE', [ids]);
    console.log("ATTENDANCE RECORDS:", JSON.stringify(rec, null, 2));

    process.exit(0);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
check();
