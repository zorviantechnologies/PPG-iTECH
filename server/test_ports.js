const { Pool } = require('pg');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '.env') });

const testPort = async (port) => {
    console.log(`--- Testing Connection on Port ${port} ---`);
    const pool = new Pool({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        port: port,
        ssl: { rejectUnauthorized: false }
    });

    try {
        const client = await pool.connect();
        console.log(`✅ Success on Port ${port}!`);
        client.release();
        return true;
    } catch (err) {
        console.error(`❌ Failed on Port ${port}: ${err.message}`);
        return false;
    } finally {
        await pool.end();
    }
};

const run = async () => {
    await testPort(5432);
    await testPort(6543);
};

run();
