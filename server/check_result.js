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
    const { rows } = await c.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_type='BASE TABLE'
    `);
    for (const r of rows) {
        const { rows: countRes } = await c.query(`SELECT count(*) FROM "${r.table_name}"`);
        console.log(`${r.table_name}: ${countRes[0].count}`);
        if (r.table_name === 'users') {
            const { rows: userSample } = await c.query(`SELECT id, name, role FROM users LIMIT 3`);
            console.log('--- User Sample ---');
            console.table(userSample);
        }
    }
    await c.end();
}
check();
