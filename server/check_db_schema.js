const { pool } = require('./config/db');

async function checkSchema() {
    try {
        console.log('Checking certificates table...');
        const certRes = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'certificates'");
        console.log('Certificates Columns:', certRes.rows);

        console.log('Checking users table...');
        const userRes = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'users'");
        console.log('Users Columns:', userRes.rows);
        
        process.exit(0);
    } catch (err) {
        console.error('Error checking schema:', err);
        process.exit(1);
    }
}

checkSchema();
