const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
require('dotenv').config();

const config = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: 'postgres',
    port: 5432,
    ssl: { rejectUnauthorized: false }
};

const DATA_DIR = 'd:/project IT/PPG-iTECH-main/datas';

function parseCsvLine(line) {
    const result = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"') {
            if (inQuotes && line[i + 1] === '"') {
                cur += '"'; i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (c === ',' && !inQuotes) {
            result.push(cur.trim());
            cur = '';
        } else {
            cur += c;
        }
    }
    result.push(cur.trim());
    return result;
}

async function run() {
    const client = new Client(config);
    await client.connect();
    console.log('Connected.');

    try {
        await client.query("SET session_replication_role = 'replica'");

        // Load emp_id to user_id mapping
        console.log('Loading user mapping...');
        const userMap = {};
        try {
            const { rows: userRows } = await client.query('SELECT id, emp_id FROM users');
            userRows.forEach(u => {
                if (u.emp_id) userMap[String(u.emp_id).trim()] = u.id;
            });
        } catch (e) {
            console.error('Failed to load user mapping:', e.message);
        }

        const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.csv'));
        files.sort((a, b) => {
            if (a.includes('departments')) return -1;
            if (b.includes('departments')) return 1;
            if (a.includes('users')) return -1;
            if (b.includes('users')) return 1;
            return 0;
        });

        for (const file of files) {
            const tableName = file.replace('_rows.csv', '').replace('.csv', '');
            console.log(`\nProcessing ${tableName}...`);

            const content = fs.readFileSync(path.join(DATA_DIR, file), 'utf8');
            const lines = content.split('\n').filter(l => l.trim().length > 0);
            if (lines.length < 1) continue;

            let csvHeaders = parseCsvLine(lines[0]);
            
            // Check table existence/columns
            await client.query(`CREATE TABLE IF NOT EXISTS "${tableName}" (id SERIAL PRIMARY KEY)`);
            const { rows: columns } = await client.query(`
                SELECT column_name, udt_name, data_type 
                FROM information_schema.columns 
                WHERE table_name = $1
            `, [tableName]);
            
            const tableColSet = new Set(columns.map(c => c.column_name));
            
            // Map CSV headers to target columns
            let targetHeaders = [...csvHeaders];
            let empIdIdx = csvHeaders.indexOf('emp_id');
            let hasUserId = tableColSet.has('user_id');

            // If CSV has 'emp_id' and table has 'user_id' but CSV doesn't have 'user_id'
            // We will add 'user_id' to targetHeaders to be filled from mapping.
            let autoMapUserId = false;
            if (empIdIdx !== -1 && hasUserId && csvHeaders.indexOf('user_id') === -1) {
                targetHeaders.push('user_id');
                autoMapUserId = true;
                console.log(`   Mapping 'emp_id' to 'user_id' automatically.`);
            }

            // Ensure all target columns exist in DB
            for (const col of targetHeaders) {
                if (!tableColSet.has(col)) {
                    console.log(`   Adding missing column ${col}`);
                    await client.query(`ALTER TABLE "${tableName}" ADD COLUMN "${col}" TEXT`);
                    tableColSet.add(col);
                }
            }

            // Truncate
            await client.query(`TRUNCATE TABLE "${tableName}" RESTART IDENTITY CASCADE`);

            // Insert
            let insertCount = 0;
            let skipCount = 0;
            const hasId = tableColSet.has('id');

            for (let i = 1; i < lines.length; i++) {
                const rawValues = parseCsvLine(lines[i]);
                if (rawValues.join(',') === csvHeaders.join(',')) { skipCount++; continue; }
                if (rawValues.length !== csvHeaders.length) continue;

                let values = rawValues.map(v => (v === '' || v === 'NULL' || v === 'null') ? null : v);
                
                if (autoMapUserId) {
                    const empCode = String(values[empIdIdx] || '').trim();
                    values.push(userMap[empCode] || null);
                }

                const placeholders = targetHeaders.map((_, idx) => `$${idx + 1}`).join(', ');
                const colsStr = targetHeaders.map(h => `"${h}"`).join(', ');

                let sql = `INSERT INTO "${tableName}" (${colsStr}) VALUES (${placeholders})`;
                if (hasId) sql += ` ON CONFLICT (id) DO NOTHING`;

                try {
                    const r = await client.query(sql, values);
                    if (r.rowCount > 0) insertCount++;
                    else skipCount++;
                } catch (e) {
                    if (i < 5 || i % 100 === 0) console.error(`   Row ${i} error: ${e.message}`);
                }
            }
            console.log(`   Result: ${insertCount} inserted, ${skipCount} skipped.`);
        }

        // Sequences
        console.log('\nResetting sequences...');
        const { rows: tabs } = await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'");
        for (const t of tabs) {
            try {
                await client.query(`SELECT setval(pg_get_serial_sequence('"${t.table_name}"', 'id'), COALESCE(MAX(id), 1)) FROM "${t.table_name}"`);
            } catch (e) {}
        }

        console.log('DONE!');
    } catch (err) {
        console.error('FATAL:', err.message);
    } finally {
        await client.end();
    }
}
run();
