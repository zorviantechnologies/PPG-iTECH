const { pool } = require('./config/db');

async function debug() {
    try {
        const today = new Date().toISOString().split('T')[0];
        console.log('Today:', today);

        const { rows: todayRecords } = await pool.query('SELECT * FROM attendance WHERE date = $1', [today]);
        console.log(`Found ${todayRecords.length} records for today.`);
        if (todayRecords.length > 0) {
            console.log('Sample record:', todayRecords[0]);
        }

        const month = today.slice(0, 7);
        const { rows: monthSummary } = await pool.query(`
            SELECT 
                u.emp_id, u.name,
                COUNT(a.id) as record_count
            FROM users u
            LEFT JOIN attendance a ON u.emp_id = a.emp_id AND TO_CHAR(a.date, 'YYYY-MM') = $1
            WHERE u.role IN ('principal', 'hod', 'staff')
            GROUP BY u.emp_id, u.name
            HAVING COUNT(a.id) > 0
        `, [month]);

        console.log(`Month ${month} has ${monthSummary.length} employees with records.`);
        if (monthSummary.length > 0) {
            console.log('Sample summary row:', monthSummary[0]);
        }

        // Check for any records at all
        const { rows: total } = await pool.query('SELECT count(*) FROM attendance');
        console.log('Total records in table:', total[0].count);

    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}

debug();
