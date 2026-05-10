const { Client } = require('pg');
require('dotenv').config();
const config = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: 'postgres',
    port: 5432,
    ssl: { rejectUnauthorized: false }
};

async function check() {
    const c = new Client(config);
    await c.connect();
    const tabs = ['leave_requests','leave_approvals','leave_balances','permission_approvals','permission_requests'];
    for (const t of tabs) {
        try {
            const { rows: countRes } = await c.query(`SELECT count(1) FROM "${t}"`);
            console.log(`${t}: ${countRes[0].count}`);
            if (t === 'leave_requests') {
                const { rows: sample } = await c.query(`SELECT * FROM leave_requests ORDER BY id LIMIT 1`);
                console.log('--- Sample Leave Request ---');
                console.table(sample);
            }
        } catch (e) {
            console.log(`${t}: MISSING TABLE (${e.message})`);
        }
    }
    await c.end();
}
check();
