const { Client } = require('pg');
require('dotenv').config();

async function show() {
    const clients = [
        { name: 'SOURCE (OLD)', config: { host: 'aws-1-ap-south-1.pooler.supabase.com', user: 'postgres.zolybloevqjxtfishmcg', password: 'a,b,c,d.1234', database: 'postgres', port: 5432, ssl: { rejectUnauthorized: false } } },
        { name: 'DEST (NEW)', config: { host: process.env.DB_HOST, user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: 'postgres', port: 5432, ssl: { rejectUnauthorized: false } } }
    ];

    for (const item of clients) {
        console.log(`\n--- Tables in ${item.name} ---`);
        const c = new Client(item.config);
        try {
            await c.connect();
            const res = await c.query('SELECT table_name FROM information_schema.tables WHERE table_schema = \'public\' ORDER BY table_name');
            for (const r of res.rows) {
                console.log(`- ${r.table_name}`);
            }
        } catch (e) {
            console.error('Error:', e.message);
        } finally {
            await c.end();
        }
    }
}
show();
