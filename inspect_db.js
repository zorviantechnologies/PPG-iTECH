const { pool } = require('./server/config/db');

async function check() {
    try {
        const tables = ['attendance_records', 'biometric_logs', 'biometric_attendance', 'users'];
        for (const table of tables) {
            console.log(`--- Table: ${table} ---`);
            const res = await pool.query(`
                SELECT column_name, data_type, is_nullable
                FROM information_schema.columns 
                WHERE table_name = $1
            `, [table]);
            console.table(res.rows);
            
            const constraints = await pool.query(`
                SELECT conname, pg_get_constraintdef(c.oid)
                FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE contype IN ('p', 'u') AND conrelid = $1::regclass
            `, [table]);
            console.table(constraints.rows);
        }
    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}

check();
