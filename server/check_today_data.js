const { pool } = require('./config/db');
const ids = ['5001', '5045', '984', '944', '69', '1141', '114', '1095', '1142', '817', '119', '439', '1148', '506', '1128', '819', '1134', '263', '1101', '370', '860', '930', '1127', '1173', '409', '848', '108', '317', '913', '802', '919', '92', '879', '1087', '1124', '36', '1103', '512', '1130', '1097', '1016', '215', '1093', '339', '1091', '1199', '1006', '1133', '1019', '1196', '130', '948', '192', '1003', '190', '1083', '1132', '1191', '158', '820', '77', '386', '912', '1090', '916', '101', '1096', '139', '911', '844', '1119', '943', '877', '234', '51', '242', '1112', '1181', '970', '878'];

async function check() {
  try {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

    const { rows: att } = await pool.query('SELECT user_id, intime, outtime FROM biometric_attendance WHERE date = $1 AND user_id = ANY($2)', [today, ids]);
    console.log("BIOMETRIC ATTENDANCE TODAY:", JSON.stringify(att, null, 2));

    const { rows: records } = await pool.query('SELECT emp_id, status, in_time, out_time FROM attendance_records WHERE date = $1 AND emp_id = ANY($2)', [today, ids]);
    console.log("ATTENDANCE RECORDS TODAY:", JSON.stringify(records, null, 2));

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
check();
