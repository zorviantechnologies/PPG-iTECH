require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 5432,
    ssl: { rejectUnauthorized: false }
});

async function checkFebData() {
    const client = await pool.connect();
    try {
        const { rows: countRows } = await client.query(`
            SELECT COUNT(*) as count 
            FROM attendance 
            WHERE TO_CHAR(date, 'YYYY-MM') = '2026-02'
        `);

        const { rows: users } = await client.query(`
            SELECT emp_id, name, role FROM users WHERE role IN ('principal', 'hod', 'staff')
        `);

        const summary = {
            total_feb_records: parseInt(countRows[0].count),
            eligible_users: users.length,
            sample_records: []
        };

        if (summary.total_feb_records > 0) {
            const { rows: sample } = await client.query(`
                SELECT emp_id, date, status, in_time, out_time 
                FROM attendance 
                WHERE TO_CHAR(date, 'YYYY-MM') = '2026-02'
                LIMIT 5
            `);
            summary.sample_records = sample;
        }

        require('fs').writeFileSync('feb_check.json', JSON.stringify(summary, null, 2));
        console.log('Results written to feb_check.json');

    } catch (err) {
        console.error(err);
    } finally {
        client.release();
        await pool.end();
    }
}

checkFebData();
