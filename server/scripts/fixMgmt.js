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

async function fixManagement() {
    try {
        console.log('🔄 Fixing Management access...');
        
        // 1. Add management to enum
        try {
            await pool.query("ALTER TYPE user_role ADD VALUE 'management'");
            console.log('✅ Added management to user_role enum.');
        } catch (e) {
            if (e.code === '42710') console.log('ℹ️ Management already in enum.');
            else throw e;
        }

        // 2. Clear old mgmt users just in case
        // await pool.query("DELETE FROM users WHERE emp_id = 'Management' OR role = 'management'");

        // 3. Insert or update the management user
        const check = await pool.query("SELECT id FROM users WHERE role = 'management' LIMIT 1");
        if (check.rows.length > 0) {
            await pool.query("UPDATE users SET pin = '12345', emp_id = 'Management' WHERE role = 'management'");
            console.log('✅ Updated existing management user.');
        } else {
            const bcrypt = require('bcryptjs');
            const hashed = await bcrypt.hash('12345', 10);
            await pool.query(`
                INSERT INTO users (emp_id, pin, password, name, role, email)
                VALUES ('Management', '12345', $1, 'Institutional Management', 'management', 'management@ppg-itech.com')
            `, [hashed]);
            console.log('✅ Created new management user with PIN 12345.');
        }
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Failed:', error);
        process.exit(1);
    }
}

fixManagement();
