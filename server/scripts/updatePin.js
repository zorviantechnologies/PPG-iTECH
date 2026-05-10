const { pool } = require('../config/db');

async function updatePin() {
    try {
        console.log('🔄 Updating Management PIN to 12345...');
        const res = await pool.query("UPDATE users SET pin = '12345' WHERE role = 'management'");
        console.log(`✅ Success! Updated ${res.rowCount} management users.`);
        process.exit(0);
    } catch (error) {
        console.error('❌ Update failed:', error);
        process.exit(1);
    }
}

updatePin();
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

async function updatePin() {
    try {
        console.log('🔄 Updating Management PIN to 12345...');
        const res = await pool.query("UPDATE users SET pin = '12345' WHERE role = 'management'");
        console.log(`✅ Success! Updated ${res.rowCount} management users.`);
        process.exit(0);
    } catch (error) {
        console.error('❌ Update failed:', error);
        process.exit(1);
    }
}

updatePin();
