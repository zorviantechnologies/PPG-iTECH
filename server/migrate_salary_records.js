const { pool } = require('./server/config/db');

async function migrate() {
    try {
        console.log('Starting migration for salary_records...');
        
        // Add columns if they don't exist
        await pool.query(`
            ALTER TABLE salary_records 
            ADD COLUMN IF NOT EXISTS with_pay_count NUMERIC(10, 2) DEFAULT 0,
            ADD COLUMN IF NOT EXISTS without_pay_count NUMERIC(10, 2) DEFAULT 0,
            ADD COLUMN IF NOT EXISTS deductions_applied NUMERIC(10, 2) DEFAULT 0,
            ADD COLUMN IF NOT EXISTS gross_salary NUMERIC(12, 2) DEFAULT 0,
            ADD COLUMN IF NOT EXISTS total_days_in_period INTEGER DEFAULT 0
        `);

        console.log('Migration successful!');
    } catch (err) {
        console.error('MIGRATION ERROR:', err);
    } finally {
        await pool.end();
    }
}

migrate();
