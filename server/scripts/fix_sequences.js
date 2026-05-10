const { Pool } = require('pg');
const pool = new Pool(require('../config/db').poolConfig || {});

(async () => {
  const client = await pool.connect();
  try {
    console.log('Detecting sequence for attendance_records.id...');
    const { rows: seqRows } = await client.query("SELECT pg_get_serial_sequence('attendance_records', 'id') AS seqname");
    const seqName = seqRows[0] && seqRows[0].seqname;
    if (!seqName) {
      console.error('Sequence for attendance_records.id not found. Ensure table exists and column is SERIAL.');
      process.exit(1);
    }
    console.log('Found sequence:', seqName);

    const { rows: maxRows } = await client.query('SELECT COALESCE(MAX(id), 0) AS maxid FROM attendance_records');
    const next = parseInt(maxRows[0].maxid, 10) + 1;
    console.log('Current max id =', maxRows[0].maxid, '; setting next sequence to', next);

    await client.query(`SELECT setval($1, $2, false)`, [seqName, next]);
    console.log('Sequence reset successfully.');
    process.exit(0);
  } catch (err) {
    console.error('Error resetting sequence:', err);
    process.exit(2);
  } finally {
    client.release();
    await pool.end();
  }
})();
