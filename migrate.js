const { Pool } = require('pg');
require('dotenv').config({ path: './server/.env' });

const pool = new Pool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 5432,
    ssl: {
        rejectUnauthorized: false
    }
});

const fs = require('fs');
const path = require('path');

async function migrate() {
    const client = await pool.connect();
    try {
        console.log('Connected to Supabase PostgreSQL');
        const sqlPath = path.join(__dirname, 'database', 'schema_pg.sql');
        console.log(`Reading schema from: ${sqlPath}`);
        const sql = fs.readFileSync(sqlPath, 'utf8');

        console.log('Applying schema...');
        await client.query(sql);
        console.log('Schema applied successfully!');
    } catch (err) {
        console.error('Migration failed:', err.message);
    } finally {
        client.release();
        await pool.end();
    }
}

migrate();
