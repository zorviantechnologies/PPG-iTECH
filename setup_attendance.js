const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: './server/.env' });

const pool = new Pool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 5432,
    ssl: {
        rejectUnauthorized: false
    }
});

// Parse CSV
function parseCSV(content) {
    let currentLine = '';
    let inQuotes = false;
    const lines = [];
    
    for (let i = 0; i < content.length; i++) {
        const char = content[i];
        const nextChar = content[i + 1];
        
        if (char === '"') {
            inQuotes = !inQuotes;
            currentLine += char;
        } else if ((char === '\n' || char === '\r') && !inQuotes) {
            if (currentLine.trim()) {
                lines.push(currentLine);
            }
            currentLine = '';
            if (char === '\r' && nextChar === '\n') i++;
        } else {
            currentLine += char;
        }
    }
    if (currentLine.trim()) {
        lines.push(currentLine);
    }
    
    const headers = [];
    const rows = [];
    
    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
        const line = lines[lineIdx];
        const values = [];
        let current = '';
        let inQuotes = false;
        
        for (let j = 0; j < line.length; j++) {
            const char = line[j];
            
            if (char === '"') {
                if (inQuotes && line[j + 1] === '"') {
                    current += '"';
                    j++;
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (char === ',' && !inQuotes) {
                values.push(current.trim().replace(/^"|"$/g, ''));
                current = '';
            } else {
                current += char;
            }
        }
        values.push(current.trim().replace(/^"|"$/g, ''));
        
        if (lineIdx === 0) {
            headers.push(...values);
        } else if (values.some(v => v !== '')) {
            const row = {};
            headers.forEach((header, idx) => {
                row[header] = values[idx] !== undefined ? values[idx] : '';
            });
            rows.push(row);
        }
    }
    
    return rows;
}

function prepareValue(value) {
    if (value === '' || value === 'null') return null;
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
}

async function createAttendanceRecordsTable(client) {
    console.log('Ensuring attendance_records table exists...');
    try {
        // Create or update attendance_records table
        await client.query(`
            CREATE TABLE IF NOT EXISTS attendance_records (
                id SERIAL PRIMARY KEY,
                emp_id VARCHAR(20) NOT NULL,
                date DATE NOT NULL,
                in_time TIME,
                out_time TIME,
                status VARCHAR(50) DEFAULT 'Absent',
                remarks TEXT,
                FOREIGN KEY (emp_id) REFERENCES users(emp_id) ON DELETE CASCADE,
                UNIQUE (emp_id, date)
            )
        `);
        console.log('✓ attendance_records table ready');
    } catch (err) {
        console.error('Error creating attendance_records table:', err.message);
        throw err;
    }
}

async function injectAttendanceRecords(client, data) {
    console.log('Injecting attendance_records...');
    let inserted = 0;
    let skipped = 0;

    for (const row of data) {
        try {
            const query = `
                INSERT INTO attendance_records (
                    id, emp_id, date, in_time, out_time, status, remarks
                ) VALUES ($1, $2, $3, $4, $5, $6, $7)
                ON CONFLICT (emp_id, date) DO UPDATE SET
                    in_time = EXCLUDED.in_time,
                    out_time = EXCLUDED.out_time,
                    status = EXCLUDED.status,
                    remarks = EXCLUDED.remarks
            `;
            
            const values = [
                parseInt(row.id),
                row.emp_id,
                row.date ? new Date(row.date) : null,
                row.in_time ? row.in_time : null,
                row.out_time ? row.out_time : null,
                row.status || 'Absent',
                prepareValue(row.remarks)
            ];
            
            await client.query(query, values);
            inserted++;
        } catch (err) {
            console.log(`Skipped row ID ${row.id}: ${err.message}`);
            skipped++;
        }
    }
    
    console.log(`✓ attendance_records: ${inserted} inserted, ${skipped} skipped`);
    return inserted;
}

async function createAttendanceCalculationView(client) {
    console.log('Creating attendance calculation view...');
    try {
        await client.query(`
            CREATE OR REPLACE VIEW attendance_summary AS
            SELECT
                TRIM(ar.emp_id) as emp_id,
                ar.date,
                ar.status,
                ar.remarks,
                ar.in_time,
                ar.out_time,
                CASE 
                    WHEN ar.status = 'Present' THEN 1.0
                    WHEN ar.status IN ('Holiday', 'Leave') THEN 0.0
                    WHEN ar.status = 'OD' THEN 1.0
                    WHEN ar.status IN ('CL', 'ML', 'Comp Leave') THEN 0.0
                    WHEN ar.status = 'Absent' THEN 0.0
                    ELSE 0.0
                END as attendance_value
            FROM attendance_records ar
        `);
        console.log('✓ attendance_summary view created');
    } catch (err) {
        console.error('Error creating view:', err.message);
    }
}

async function createAttendanceAggregateFunction(client) {
    console.log('Creating attendance aggregate function...');
    try {
        await client.query(`
            CREATE OR REPLACE FUNCTION get_employee_attendance(
                p_emp_id VARCHAR,
                p_from_date DATE,
                p_to_date DATE
            ) RETURNS TABLE (
                emp_id VARCHAR,
                from_date DATE,
                to_date DATE,
                present_days NUMERIC,
                absent_days NUMERIC,
                leave_days NUMERIC,
                od_days NUMERIC,
                comp_leave_days NUMERIC,
                holiday_days NUMERIC,
                total_working_days NUMERIC
            ) AS $$
            WITH RECURSIVE date_range AS (
                SELECT p_from_date::date as d
                UNION ALL
                SELECT (d + 1)::date FROM date_range 
                WHERE d < p_to_date::date
            ),
            calendar_with_holidays AS (
                SELECT 
                    dr.d,
                    COALESCE(h.type, 
                        CASE WHEN EXTRACT(DOW FROM dr.d) IN (0, 6) THEN 'Holiday' 
                             ELSE 'Working Day' 
                        END
                    ) AS day_type
                FROM date_range dr
                LEFT JOIN holidays h ON h.h_date = dr.d
            ),
            attendance_data AS (
                SELECT
                    cd.d as date,
                    COALESCE(ar.status, CASE WHEN cd.day_type = 'Holiday' THEN 'Holiday' ELSE 'Absent' END) as status,
                    cd.day_type
                FROM calendar_with_holidays cd
                LEFT JOIN attendance_records ar ON ar.emp_id = p_emp_id AND ar.date = cd.d
            )
            SELECT
                p_emp_id::VARCHAR,
                p_from_date,
                p_to_date,
                COALESCE(SUM(CASE WHEN status = 'Present' THEN 1 ELSE 0 END), 0)::NUMERIC as present_days,
                COALESCE(SUM(CASE WHEN status = 'Absent' THEN 1 ELSE 0 END), 0)::NUMERIC as absent_days,
                COALESCE(SUM(CASE WHEN status IN ('Leave', 'CL', 'ML') THEN 1 ELSE 0 END), 0)::NUMERIC as leave_days,
                COALESCE(SUM(CASE WHEN status = 'OD' THEN 1 ELSE 0 END), 0)::NUMERIC as od_days,
                COALESCE(SUM(CASE WHEN status = 'Comp Leave' THEN 1 ELSE 0 END), 0)::NUMERIC as comp_leave_days,
                COALESCE(SUM(CASE WHEN status = 'Holiday' THEN 1 ELSE 0 END), 0)::NUMERIC as holiday_days,
                COALESCE(SUM(CASE WHEN day_type = 'Working Day' THEN 1 ELSE 0 END), 0)::NUMERIC as total_working_days
            FROM attendance_data;
            $$ LANGUAGE SQL STABLE;
        `);
        console.log('✓ get_employee_attendance function created');
    } catch (err) {
        console.error('Error creating function:', err.message);
    }
}

async function main() {
    const client = await pool.connect();
    try {
        console.log('Connected to database');
        console.log('Starting attendance data setup...\n');

        // 1. Create attendance_records table
        await createAttendanceRecordsTable(client);

        // 2. Read and inject attendance data
        const attendancePath = path.join(__dirname, 'datas', 'attendance_records_rows.csv');
        let totalInjected = 0;
        if (fs.existsSync(attendancePath)) {
            const content = fs.readFileSync(attendancePath, 'utf8');
            const data = parseCSV(content);
            totalInjected = await injectAttendanceRecords(client, data);
        } else {
            console.log('⚠ attendance_records_rows.csv not found');
        }

        // 3. Create views and functions
        await createAttendanceCalculationView(client);
        await createAttendanceAggregateFunction(client);

        // 4. Verify data
        const countResult = await client.query('SELECT COUNT(*) FROM attendance_records');
        const count = countResult.rows[0].count;

        console.log('\n✓ Attendance data setup completed!');
        console.log(`Total attendance records in database: ${count}`);

        if (totalInjected > 0) {
            console.log(`\n✅ Successfully injected ${totalInjected} new attendance records`);
        }

    } catch (err) {
        console.error('Error during setup:', err.message);
    } finally {
        client.release();
        await pool.end();
    }
}

main();
