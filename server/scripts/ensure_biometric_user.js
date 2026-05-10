const bcrypt = require('bcryptjs');
const { pool } = require('../config/db');

const empId = process.argv[2];

if (!empId) {
  console.error('Usage: node server/scripts/ensure_biometric_user.js <emp_id>');
  process.exit(1);
}

(async () => {
  try {
    const safeEmpId = String(empId).trim();
    const placeholderPassword = `AUTO_BIOMETRIC_${safeEmpId}_${Date.now()}`;
    const passwordHash = await bcrypt.hash(placeholderPassword, 10);

    const result = await pool.query(
      `INSERT INTO users (emp_id, password, role, name, designation)
       VALUES ($1, $2, 'staff', $3, 'Biometric Imported')
       ON CONFLICT (emp_id) DO NOTHING
       RETURNING emp_id`,
      [safeEmpId, passwordHash, `Biometric User ${safeEmpId}`]
    );

    if (result.rowCount > 0) {
      console.log(`INSERTED ${safeEmpId}`);
    } else {
      console.log(`ALREADY_EXISTS ${safeEmpId}`);
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
