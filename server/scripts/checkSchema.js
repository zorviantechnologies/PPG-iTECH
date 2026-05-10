const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
    ssl: false
});

async function checkSchema() {
    try {
        const res = await pool.query(`
            SELECT enumlabel 
            FROM pg_enum 
            JOIN pg_type ON pg_enum.enumtypid = pg_type.oid 
            WHERE typname = 'user_role'
        `);
        console.log('Enum user_role labels:', res.rows.map(r => r.enumlabel));
        process.exit(0);
    } catch (error) {
        process.exit(1);
    }
}

checkSchema();
