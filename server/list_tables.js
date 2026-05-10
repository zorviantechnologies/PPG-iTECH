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
    const { rows } = await c.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public'");
    console.log(rows.map(r => r.table_name).join(', '));
    await c.end();
}
check();
