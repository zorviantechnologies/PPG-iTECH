const { Client } = require('pg');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '.env') });

const oldConfig = { host: 'aws-1-ap-south-1.pooler.supabase.com', user: 'postgres.zolybloevqjxtfishmcg', password: 'a,b,c,d.1234', database: 'postgres', port: 5432, ssl: { rejectUnauthorized: false } };
const newConfig = { host: 'aws-1-ap-south-1.pooler.supabase.com', user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: 'postgres', port: 5432, ssl: { rejectUnauthorized: false } };

const tables = ['departments', 'users', 'leave_settings', 'leave_types', 'conversations', 'messages', 'leave_requests', 'leave_balances', 'leave_approvals', 'purchases', 'attendance_records', 'timetable', 'timetable_config', 'salary_records', 'birthday_log', 'notifications', 'biometric_logs', 'biometric_attendance', 'permission_requests', 'permission_approvals', 'leave_limits', 'certificates', 'push_subscriptions', 'feedback_messages', 'activity_logs'];

async function getColumns(client, table) {
    const { rows } = await client.query(`SELECT column_name FROM information_schema.columns WHERE table_name = $1 AND table_schema = 'public'`, [table]);
    return rows.map(r => r.column_name);
}

async function migrate() {
    console.log('🚀 SAFE DATA MIGRATION IN PROGRESS...');
    const sourceClient = new Client(oldConfig);
    const destClient = new Client(newConfig);

    try {
        await sourceClient.connect();
        await destClient.connect();

        // Ensure attendance_records rename if not done
        const { rows: att } = await destClient.query("SELECT 1 FROM information_schema.tables WHERE table_name = 'attendance' AND table_schema = 'public'");
        if (att.length > 0) {
            console.log("Renaming 'attendance' to 'attendance_records'...");
            await destClient.query("ALTER TABLE attendance RENAME TO attendance_records");
        }

        // Truncate in reverse
        for (const table of [...tables].reverse()) {
            await destClient.query(`TRUNCATE TABLE "${table}" RESTART IDENTITY CASCADE`);
        }

        for (const table of tables) {
            console.log(`Table: ${table}`);
            const sourceCols = await getColumns(sourceClient, table);
            const destCols = await getColumns(destClient, table);
            
            // Common columns only
            const commonCols = sourceCols.filter(c => destCols.includes(c));
            if (commonCols.length === 0) {
                console.log(`- ${table}: No common columns found.`);
                continue;
            }

            const colText = commonCols.map(c => `"${c}"`).join(', ');
            const { rows } = await sourceClient.query(`SELECT ${colText} FROM "${table}"`);
            if (rows.length === 0) {
                console.log(`- ${table}: Empty.`);
                continue;
            }

            const valText = commonCols.map((_, i) => `$${i + 1}`).join(', ');
            const q = `INSERT INTO "${table}" (${colText}) VALUES (${valText})`;

            for (const r of rows) {
                const values = commonCols.map(c => r[c]);
                await destClient.query(q, values);
            }
            console.log(`✅ ${table}: ${rows.length} rows migrated (${commonCols.length} columns).`);

            // Reset sequence
            try {
                const { rows: seq } = await destClient.query(`SELECT pg_get_serial_sequence('${table}', 'id') as seq`);
                if (seq[0] && seq[0].seq) {
                    await destClient.query(`SELECT setval('${seq[0].seq}', (SELECT COALESCE(max(id), 1) FROM "${table}"))`);
                }
            } catch (e) {}
        }
        console.log('\n✨ ALL SHARED DATA MIGRATED SUCCESSFULLY!');
    } catch (e) {
        console.error('Migration failed:', e.message);
    } finally {
        await sourceClient.end();
        await destClient.end();
    }
}
migrate();
