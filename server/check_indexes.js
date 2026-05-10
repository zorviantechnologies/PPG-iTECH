const { pool } = require('./config/db');

async function checkIndex() {
    try {
        const { rows } = await pool.query(`
            SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'salary_records'
        `);
        console.log('--- Indexes for salary_records ---');
        console.log(rows);
    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}
checkIndex();
