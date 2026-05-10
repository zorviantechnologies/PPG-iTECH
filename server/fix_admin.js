/**
 * fix_admin.js — run from inside server/ with: node fix_admin.js
 * Drops existing tables, applies the full schema, and upserts admin user.
 */

require('dotenv').config();
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

const DROP_STATEMENTS = [
    `DROP TABLE IF EXISTS biometric_logs CASCADE`,
    `DROP TABLE IF EXISTS notifications CASCADE`,
    `DROP TABLE IF EXISTS birthday_log CASCADE`,
    `DROP TABLE IF EXISTS leave_approvals CASCADE`,
    `DROP TABLE IF EXISTS leave_settings CASCADE`,
    `DROP TABLE IF EXISTS salary_records CASCADE`,
    `DROP TABLE IF EXISTS timetable CASCADE`,
    `DROP TABLE IF EXISTS messages CASCADE`,
    `DROP TABLE IF EXISTS conversations CASCADE`,
    `DROP TABLE IF EXISTS purchases CASCADE`,
    `DROP TABLE IF EXISTS leave_balances CASCADE`,
    `DROP TABLE IF EXISTS leave_requests CASCADE`,
    `DROP TABLE IF EXISTS attendance CASCADE`,
    `DROP TABLE IF EXISTS users CASCADE`,
    `DROP TABLE IF EXISTS departments CASCADE`,
    `DROP TABLE IF EXISTS holidays CASCADE`,
];

const SCHEMA_STATEMENTS = [
    // Tables — users first (no FK deps except departments)
    `CREATE TABLE departments (
        id SERIAL PRIMARY KEY,
        name VARCHAR(50) NOT NULL UNIQUE
    )`,

    `CREATE TABLE users (
        id SERIAL PRIMARY KEY,
        emp_id VARCHAR(20) NOT NULL UNIQUE,
        emp_code VARCHAR(50),
        password VARCHAR(255) NOT NULL,
        pin VARCHAR(10),
        role user_role NOT NULL,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(100) UNIQUE,
        mobile VARCHAR(15),
        department_id INT REFERENCES departments(id) ON DELETE SET NULL,
        designation VARCHAR(50),
        profile_pic TEXT,
        dob DATE,
        doj DATE,
        gender gender_type,
        blood_group VARCHAR(5),
        religion VARCHAR(50),
        nationality VARCHAR(50),
        caste VARCHAR(50),
        community VARCHAR(50),
        whatsapp VARCHAR(15),
        aadhar VARCHAR(20),
        pan VARCHAR(20),
        account_no VARCHAR(30),
        bank_name VARCHAR(100),
        branch VARCHAR(100),
        ifsc VARCHAR(20),
        pin_code VARCHAR(10),
        pf_number VARCHAR(30),
        uan_number VARCHAR(30),
        permanent_address TEXT,
        communication_address TEXT,
        father_name VARCHAR(100),
        mother_name VARCHAR(100),
        marital_status VARCHAR(20),
        monthly_salary DECIMAL(10, 2),
        experience VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,

    `CREATE TABLE attendance (
        id SERIAL PRIMARY KEY,
        emp_id VARCHAR(20) NOT NULL REFERENCES users(emp_id) ON DELETE CASCADE,
        date DATE NOT NULL,
        in_time TIME,
        out_time TIME,
        status attendance_status DEFAULT 'Absent',
        UNIQUE (emp_id, date)
    )`,

    `CREATE TABLE leave_requests (
        id SERIAL PRIMARY KEY,
        emp_id VARCHAR(20) NOT NULL REFERENCES users(emp_id) ON DELETE CASCADE,
        leave_type leave_type_enum NOT NULL,
        from_date DATE NOT NULL,
        to_date DATE NOT NULL,
        days_count INT DEFAULT 1,
        reason TEXT,
        alternative_staff_id VARCHAR(20),
        status approval_status DEFAULT 'Pending',
        approver_role approver_role_type,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,

    `CREATE TABLE leave_balances (
        id SERIAL PRIMARY KEY,
        emp_id VARCHAR(20) NOT NULL REFERENCES users(emp_id) ON DELETE CASCADE,
        year INT NOT NULL,
        cl_taken INT DEFAULT 0,
        ml_taken INT DEFAULT 0,
        od_taken INT DEFAULT 0,
        comp_taken INT DEFAULT 0,
        lop_taken INT DEFAULT 0,
        UNIQUE (emp_id, year)
    )`,

    `CREATE TABLE purchases (
        id SERIAL PRIMARY KEY,
        emp_id VARCHAR(20) NOT NULL REFERENCES users(emp_id) ON DELETE CASCADE,
        item_name VARCHAR(100) NOT NULL,
        quantity INT NOT NULL,
        priority priority_type DEFAULT 'Medium',
        status purchase_status DEFAULT 'Pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,

    `CREATE TABLE conversations (
        id SERIAL PRIMARY KEY,
        title VARCHAR(100) NOT NULL,
        creator_id VARCHAR(20) NOT NULL REFERENCES users(emp_id),
        target_role target_role_type DEFAULT 'all',
        target_dept_id INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,

    `CREATE TABLE messages (
        id SERIAL PRIMARY KEY,
        conversation_id INT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        sender_id VARCHAR(20) NOT NULL REFERENCES users(emp_id),
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,

    `CREATE TABLE timetable (
        id SERIAL PRIMARY KEY,
        emp_id VARCHAR(20) NOT NULL REFERENCES users(emp_id) ON DELETE CASCADE,
        day_of_week day_of_week_type NOT NULL,
        period_number INT NOT NULL,
        start_time TIME,
        end_time TIME,
        subject VARCHAR(100),
        subject_code VARCHAR(20),
        room_number VARCHAR(20)
    )`,

    `CREATE TABLE salary_records (
        id SERIAL PRIMARY KEY,
        emp_id VARCHAR(20) NOT NULL REFERENCES users(emp_id) ON DELETE CASCADE,
        month INT NOT NULL,
        year INT NOT NULL,
        total_present INT DEFAULT 0,
        total_leave INT DEFAULT 0,
        total_lop INT DEFAULT 0,
        calculated_salary DECIMAL(10, 2),
        status salary_status DEFAULT 'Pending',
        generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (emp_id, month, year)
    )`,

    `CREATE TABLE leave_settings (
        id SERIAL PRIMARY KEY,
        leave_type leave_type_enum NOT NULL UNIQUE,
        max_days INT NOT NULL,
        restriction_window_start TIME,
        restriction_window_end TIME
    )`,

    `CREATE TABLE leave_approvals (
        id SERIAL PRIMARY KEY,
        leave_request_id INT NOT NULL REFERENCES leave_requests(id) ON DELETE CASCADE,
        approver_id VARCHAR(20) NOT NULL REFERENCES users(emp_id),
        approver_type approver_type_enum NOT NULL,
        status approval_status DEFAULT 'Pending',
        comments TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,

    `CREATE TABLE birthday_log (
        id SERIAL PRIMARY KEY,
        emp_id VARCHAR(20) NOT NULL REFERENCES users(emp_id) ON DELETE CASCADE,
        wish_year INT NOT NULL,
        sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (emp_id, wish_year)
    )`,

    `CREATE TABLE notifications (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(20) NOT NULL REFERENCES users(emp_id) ON DELETE CASCADE,
        message TEXT NOT NULL,
        is_read BOOLEAN DEFAULT FALSE,
        type notification_type_enum DEFAULT 'system',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,

    `CREATE TABLE biometric_logs (
        id SERIAL PRIMARY KEY,
        device_id VARCHAR(50),
        emp_id VARCHAR(20) NOT NULL,
        log_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        type biometric_log_type
    )`,

    `CREATE TABLE holidays (
        id SERIAL PRIMARY KEY,
        h_date DATE NOT NULL UNIQUE,
        caption VARCHAR(100),
        type VARCHAR(50) DEFAULT 'Holiday'
    )`,
];

async function migrate() {
    const client = await pool.connect();
    try {
        await client.query('SET search_path TO public');
        console.log('✅ Connected to Supabase PostgreSQL\n');

        console.log('--- DROPPING OLD TABLES ---');
        for (const stmt of DROP_STATEMENTS) {
            await client.query(stmt);
            console.log(`  ✔ ${stmt}`);
        }

        console.log('\n--- CREATING NEW TABLES ---');
        for (const stmt of SCHEMA_STATEMENTS) {
            try {
                await client.query(stmt);
                const firstLine = stmt.trim().split('\n')[0].substring(0, 60);
                console.log(`  ✔ ${firstLine}...`);
            } catch (err) {
                console.error(`  ❌ Failed: ${err.message.substring(0, 80)}`);
                throw err; // Stop if table creation fails
            }
        }

        // Upsert admin with real bcrypt hash
        console.log('\n--- INSERTING ADMIN USER ---');
        const hashedPassword = await bcrypt.hash('Admin@1234', 10);
        await client.query(`
            INSERT INTO public.users (emp_id, password, pin, role, name)
            VALUES ($1, $2, $3, 'admin', 'Super Admin')
            ON CONFLICT (emp_id) DO UPDATE SET
                password = EXCLUDED.password,
                pin = EXCLUDED.pin,
                name = EXCLUDED.name
        `, ['@PPG ZORVIAN', hashedPassword, '638581']);

        console.log('✅ Admin user upserted!');

        console.log('\n🔑 Login Credentials:');
        console.log('   Employee ID : @PPG ZORVIAN');
        console.log('   PIN         : 638581');
        console.log('\n   (Optional password if needed: Admin@1234)');

    } catch (err) {
        console.error('\n❌ Critical Error:', err.message);
    } finally {
        client.release();
        await pool.end();
    }
}

migrate();
