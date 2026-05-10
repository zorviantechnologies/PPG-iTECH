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

async function checkLeaveTables() {
    const client = await pool.connect();
    try {
        const { rows: tables } = await client.query(`
            SELECT table_name FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name IN ('leave_requests', 'leave_approvals', 'leave_balances', 'leave_settings')
        `);

        const result = { tables: tables.map(t => t.table_name), settings: [], balanceCols: [], requestCols: [] };

        try {
            const { rows: settings } = await client.query('SELECT * FROM leave_settings');
            result.settings = settings;
        } catch (e) {
            result.settingsError = e.message;
        }
        try {
            const { rows: cols } = await client.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'leave_balances'`);
            result.balanceCols = cols.map(c => c.column_name);
        } catch (e) {
            result.balanceError = e.message;
        }
        try {
            const { rows: cols2 } = await client.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'leave_requests'`);
            result.requestCols = cols2.map(c => c.column_name);
        } catch (e) {
            result.requestError = e.message;
        }

        require('fs').writeFileSync('leave_tables_check.json', JSON.stringify(result, null, 2));
        console.log('Done - see leave_tables_check.json');

    } finally {
        client.release();
        await pool.end();
    }
}

checkLeaveTables();
