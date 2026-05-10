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

async function check() {4
  const ids = ['5001', '505', '844', '1119', '242', '1112', '1181', '970', '878'];
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

  try {
    const { rows: userRows } = await pool.query('SELECT emp_id, role, name FROM users WHERE emp_id = ANY($1)', [ids]);
    console.log("USERS AND ROLES:", JSON.stringify(userRows, null, 2));

    const { rows: logs } = await pool.query('SELECT emp_id, log_time FROM biometric_logs WHERE log_time::date = $1 AND emp_id = ANY($2)', [today, ids]);
    console.log("BIOMETRIC_LOGS TODAY:", JSON.stringify(logs, null, 2));

    const { rows: summary } = await pool.query('SELECT user_id, intime, outtime FROM biometric_attendance WHERE date = $1 AND user_id = ANY($2)', [today, ids]);
    console.log("BIOMETRIC_ATTENDANCE TODAY:", JSON.stringify(summary, null, 2));

    const { rows: att } = await pool.query('SELECT emp_id, status FROM attendance_records WHERE date = $1 AND emp_id = ANY($2)', [today, ids]);
    console.log("ATTENDANCE_RECORDS TODAY:", JSON.stringify(att, null, 2));

    process.exit(0);
  } catch (err) {
    if (err.message.includes('MaxClients')) {
        console.error("MAX_CLIENTS_REACHED");
    } else {
        console.error(err);
    }
    process.exit(1);
  }
}
check();
