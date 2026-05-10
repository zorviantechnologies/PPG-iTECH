const { pool } = require('./config/db');

async function inspectEnum() {
    try {
        const query = `
            SELECT e.enumlabel
            FROM pg_type t 
            JOIN pg_enum e ON t.oid = e.enumtypid  
            WHERE t.typname = 'attendance_status'
            ORDER BY e.enumsortorder
        `;
        const result = await pool.query(query);
        console.log('Actual enum values for attendance_status:');
        console.log(result.rows.map(r => r.enumlabel));
    } catch (error) {
        console.error('Error inspecting enum:', error.message);
    } finally {
        await pool.end();
    }
}

inspectEnum();
