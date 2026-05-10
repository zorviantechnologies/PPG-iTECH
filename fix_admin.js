/**
 * fix_admin.js
 * Run from project root: node fix_admin.js
 * Fixes the admin user login by setting a proper bcrypt-hashed password and plain PIN.
 */

require('dotenv').config({ path: './server/.env' });
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 5432,
    ssl: { rejectUnauthorized: false }
});

async function fixAdmin() {
    try {
        // Hash a known password for the admin just in case
        const hashedPassword = await bcrypt.hash('Admin@1234', 10);
        const pin = '638581';
        const emp_id = '@PPG ZORVIAN';

        // Check if admin exists
        const { rows } = await pool.query('SELECT * FROM users WHERE emp_id = $1', [emp_id]);

        if (rows.length === 0) {
            // Insert admin fresh
            await pool.query(
                `INSERT INTO users (emp_id, password, pin, role, name)
                 VALUES ($1, $2, $3, 'admin', 'Super Admin')`,
                [emp_id, hashedPassword, pin]
            );
            console.log('✅ Admin user created successfully!');
        } else {
            // Update existing admin with correct password and pin
            await pool.query(
                `UPDATE users SET password = $1, pin = $2 WHERE emp_id = $3`,
                [hashedPassword, pin, emp_id]
            );
            console.log('✅ Admin user updated successfully!');
        }

        console.log('');
        console.log('🔑 Login Credentials:');
        console.log(`   Employee ID : ${emp_id}`);
        console.log(`   PIN         : ${pin}`);
        console.log('');
        console.log('Test by logging in with those credentials at http://localhost:5173/');

    } catch (err) {
        console.error('❌ Error fixing admin:', err.message);
    } finally {
        await pool.end();
    }
}

fixAdmin();
