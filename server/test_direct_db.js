const { Pool } = require('pg');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '.env') });

const testDirect = async () => {
    const directHost = 'db.emorgztggtmrvqtilkfj.supabase.co';
    console.log(`--- Testing Direct Connection to ${directHost} ---`);
    const pool = new Pool({
        host: directHost,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        port: 5432,
        ssl: { rejectUnauthorized: false }
    });

    try {
        const client = await pool.connect();
        console.log(`✅ Direct Connection Success!`);
        client.release();
        return true;
    } catch (err) {
        console.error(`❌ Direct Connection Failed: ${err.message}`);
        return false;
    } finally {
        await pool.end();
    }
};

testDirect();
