const { pool } = require('./config/db');

async function checkStatus() {
    try {
        const result = await pool.query("SELECT DISTINCT status FROM attendance");
        console.log('Statuses currently in attendance table:', JSON.stringify(result.rows, null, 2));

        const enumResult = await pool.query(`
            SELECT n.nspname as schema, t.typname as type, e.enumlabel as value
            FROM pg_type t 
            JOIN pg_enum e ON t.oid = e.enumtypid  
            JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
            WHERE t.typname = 'attendance_status'
        `);
        console.log('Enum definition for attendance_status:', JSON.stringify(enumResult.rows, null, 2));
    } catch (error) {
        console.error('Error checking status:', error.message);
    } finally {
        await pool.end();
    }
}

checkStatus();
