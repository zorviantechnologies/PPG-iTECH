const { pool } = require('./config/db');

async function verifyAttendance() {
    try {
        const result = await pool.query(
            "SELECT emp_id, COUNT(*) as record_count FROM attendance WHERE date >= '2026-02-01' AND date <= '2026-02-28' GROUP BY emp_id"
        );
        console.log('Attendance records for Feb 2026:');
        result.rows.forEach(row => {
            console.log(`Employee: ${row.emp_id}, Records: ${row.record_count}`);
        });

        const sample = await pool.query(
            "SELECT * FROM attendance WHERE emp_id = 'EMP001' AND date >= '2026-02-01' AND date <= '2026-02-07' ORDER BY date"
        );
        console.log('\nSample for EMP001 (First week of Feb):');
        console.table(sample.rows);

    } catch (error) {
        console.error('Error verifying attendance:', error.message);
    } finally {
        await pool.end();
    }
}

verifyAttendance();
