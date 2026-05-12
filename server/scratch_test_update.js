const { pool } = require('./config/db');

async function testUpdate() {
    try {
        const emp_id = '112'; // just a dummy
        const dateStr = '2026-05-12';
        const finalStatus = 'Present';

        console.log("Testing UPSERT...");
        await pool.query(
            `INSERT INTO attendance_records (emp_id, date, in_time, out_time, status, remarks, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, NOW())
             ON CONFLICT (emp_id, date)
             DO UPDATE SET in_time = EXCLUDED.in_time, 
                           out_time = EXCLUDED.out_time,
                           status = EXCLUDED.status, 
                           remarks = EXCLUDED.remarks, 
                           updated_at = NOW()`,
            [emp_id, dateStr, '09:00', '17:00', finalStatus, 'test']
        );
        console.log("Success!");
    } catch (e) {
        console.error("ERROR:", e.message);
        console.error("DETAIL:", e.detail);
    } finally {
        await pool.end();
    }
}

testUpdate();
