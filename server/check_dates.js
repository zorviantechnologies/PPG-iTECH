const { pool } = require('./config/db');

async function checkDates() {
    try {
        const result = await pool.query(
            "SELECT DISTINCT TO_CHAR(date, 'YYYY-MM-DD') as date_str FROM attendance WHERE emp_id = 'EMP001' ORDER BY date_str LIMIT 5"
        );
        console.log('Inserted dates (first 5):', JSON.stringify(result.rows, null, 2));
    } catch (error) {
        console.error('Error checking dates:', error.message);
    } finally {
        await pool.end();
    }
}

checkDates();
