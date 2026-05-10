const { pool } = require('./config/db');

async function debugEnum() {
    try {
        const query = `
            SELECT enumlabel, length(enumlabel) as len
            FROM pg_enum e
            JOIN pg_type t ON e.enumtypid = t.oid
            WHERE t.typname = 'attendance_status'
            ORDER BY enumsortorder
        `;
        const result = await pool.query(query);
        console.log('Detailed Enum Debug:');
        result.rows.forEach(r => {
            console.log(`Label: "${r.enumlabel}" (Length: ${r.len})`);
        });
    } catch (error) {
        console.error('Enum debug failed:', error.message);
    } finally {
        await pool.end();
    }
}

debugEnum();
