const { Pool } = require('pg');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

// Load environment variables from .env
dotenv.config({ path: path.join(__dirname, '.env') });

const poolConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: parseInt(process.env.DB_PORT || '5432'),
    ssl: {
        rejectUnauthorized: false
    }
};

const pool = new Pool(poolConfig);

async function runSqlFile(client, filePath) {
    const fileName = path.basename(filePath);
    const sql = fs.readFileSync(filePath, 'utf8');
    
    try {
        await client.query(sql);
        return { success: true, fileName };
    } catch (err) {
        // Detailed error reporting
        return { success: false, fileName, error: err.message, detail: err.detail, hint: err.hint };
    }
}

async function migrate() {
    process.stdout.write('--- Database Migration ---\n');
    
    let client;
    try {
        client = await pool.connect();
        const dbDir = path.join(__dirname, '..', 'database');
        
        const sqlFiles = [
            'schema_pg.sql',
            'migration_permissions.sql',
            'migration_leave_types.sql',
            'migration_leave_limits.sql',
            'migration_leave_limits_period_and_pl_reset.sql',
            'migration_comp_requests.sql',
            'migration_certificates.sql',
            'migration_biometric.sql',
            'migration_add_unit_to_purchases.sql',
            'migration_salary_records_period_lock.sql',
            'migration_timetable_config.sql',
            'fix_salary_constraint.sql'
        ];

        let failedFiles = [];

        for (const file of sqlFiles) {
            const filePath = path.join(dbDir, file);
            if (fs.existsSync(filePath)) {
                const result = await runSqlFile(client, filePath);
                if (result.success) {
                    process.stdout.write(`✅ ${file} applied\n`);
                } else {
                    process.stdout.write(`❌ ${file} failed: ${result.error}\n`);
                    if (result.detail) process.stdout.write(`   Detail: ${result.detail}\n`);
                    failedFiles.push(file);
                }
            }
        }

        if (failedFiles.length === 0) {
            process.stdout.write('\n✨ ALL MIGRATIONS COMPLETED SUCCESSFULLY!\n');
        } else {
            process.stdout.write(`\n⚠️  Finished with errors in: ${failedFiles.join(', ')}\n`);
        }

    } catch (err) {
        process.stdout.write(`\n❌ Error connecting: ${err.message}\n`);
    } finally {
        if (client) client.release();
        await pool.end();
    }
}

migrate();
