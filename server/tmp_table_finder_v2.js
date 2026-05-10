const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 5432,
    ssl: { rejectUnauthorized: false }
});

async function findTable() {
    try {
        const { rows } = await pool.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' AND table_name LIKE '%attendance%'
        `);
        console.log("Matching tables in public schema:");
        for (const r of rows) {
            const { rows: count } = await pool.query(`SELECT COUNT(*) FROM "${r.table_name}"`);
            console.log(`- ${r.table_name}: ${count[0].count} rows`);
        }
    } catch (err) {
        console.error(err.message);
    } finally {
        await pool.end();
    }
}
findTable();
