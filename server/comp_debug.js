const { pool } = require('./config/db');

async function comprehensiveDebug() {
    try {
        console.log('--- Database Enum Labels ---');
        const enumRes = await pool.query(`
            SELECT enumlabel FROM pg_enum e 
            JOIN pg_type t ON e.enumtypid = t.oid 
            WHERE t.typname = 'attendance_status'
        `);
        console.log(JSON.stringify(enumRes.rows.map(r => r.enumlabel)));

        console.log('\n--- Status Strings in Attendance Table ---');
        const tableRes = await pool.query("SELECT DISTINCT status FROM attendance");
        console.log(JSON.stringify(tableRes.rows.map(r => r.status)));

    } catch (error) {
        console.error('Debug failed:', error.message);
    } finally {
        await pool.end();
    }
}

comprehensiveDebug();
