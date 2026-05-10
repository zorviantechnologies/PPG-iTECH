const { Pool } = require('pg');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '.env') });

console.log('--- Testing Database Connection with Credentials ---');
console.log('Host:', process.env.DB_HOST);
console.log('User:', process.env.DB_USER);
console.log('Database:', process.env.DB_NAME);
console.log('Port:', process.env.DB_PORT || 5432);

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

const testConn = async () => {
    try {
        console.log('Attempting to connect...');
        const client = await pool.connect();
        console.log('✅ Connection Successful!');
        const res = await client.query('SELECT NOW()');
        console.log('Server Date/Time:', res.rows[0].now);
        client.release();
    } catch (err) {
        console.error('❌ Connection Failed!');
        console.error('Error Code:', err.code);
        console.error('Error Message:', err.message);
        console.error('Full Error:', err);
    } finally {
        await pool.end();
    }
};

testConn();
