const { pool } = require('./config/db');

async function verifySummary() {
    try {
        const month = '2026-02';
        const query = `
            SELECT 
                u.emp_id, u.name, u.role,
                SUM(CASE WHEN status = 'Present' THEN 1 ELSE 0 END) as total_present,
                SUM(CASE WHEN status IN ('Leave', 'CL', 'ML', 'Comp Leave') THEN 1 ELSE 0 END) as total_leave,
                SUM(CASE WHEN status = 'OD' THEN 1 ELSE 0 END) as total_od,
                SUM(CASE WHEN status = 'LOP' THEN 1 ELSE 0 END) as total_lop
            FROM attendance a
            JOIN users u ON a.emp_id = u.emp_id
            WHERE TO_CHAR(a.date, 'YYYY-MM') = $1
            GROUP BY u.emp_id, u.name, u.role
        `;
        const result = await pool.query(query, [month]);
        console.log('Attendance Summary for Feb 2026:');
        console.table(result.rows);

        if (result.rows.length === 0) {
            console.log('ERROR: No summary records found for Feb 2026!');
        } else {
            console.log(`Success: Found ${result.rows.length} employee records.`);
        }
    } catch (error) {
        console.error('Error verifying summary:', error.message);
    } finally {
        await pool.end();
    }
}

verifySummary();
