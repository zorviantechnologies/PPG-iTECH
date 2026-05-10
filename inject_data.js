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

// Improved CSV parser that handles quoted fields and JSON content
function parseCSV(content) {
    const headers = [];
    const rows = [];
    let lineNumber = 0;
    
    // Split into lines, but preserve quoted content
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
            if (char === '\r' && nextChar === '\n') i++; // Handle \r\n
        } else {
            currentLine += char;
        }
    }
    if (currentLine.trim()) {
        lines.push(currentLine);
    }
    
    // Parse each line
    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
        const line = lines[lineIdx];
        const values = [];
        let current = '';
        let inQuotes = false;
        
        for (let j = 0; j < line.length; j++) {
            const char = line[j];
            
            if (char === '"') {
                if (inQuotes && line[j + 1] === '"') {
                    // Handle escaped quotes
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
            // First line is headers
            headers.push(...values);
        } else if (values.some(v => v !== '')) {
            // Only add non-empty rows
            const row = {};
            headers.forEach((header, idx) => {
                row[header] = values[idx] !== undefined ? values[idx] : '';
            });
            rows.push(row);
        }
    }
    
    return rows;
}

// Convert empty strings to null
function prepareValue(value) {
    if (value === '' || value === 'null') return null;
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
}

async function injectLeaveRequests(client, data) {
    console.log('Injecting leave_requests...');
    let inserted = 0;
    let skipped = 0;

    for (const row of data) {
        try {
            // Check if leave_requests table has all these columns first
            const query = `
                INSERT INTO leave_requests (
                    id, emp_id, leave_type, from_date, to_date, days_count, reason, 
                    alternative_staff_id, status, approver_role, created_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                ON CONFLICT (id) DO NOTHING
            `;
            
            const values = [
                parseInt(row.id),
                row.emp_id,
                row.leave_type,
                row.from_date ? new Date(row.from_date) : null,
                row.to_date ? new Date(row.to_date) : null,
                parseFloat(row.days_count) || 0,
                prepareValue(row.reason),
                prepareValue(row.alternative_staff_id),
                row.status,
                prepareValue(row.approver_role),
                row.created_at ? new Date(row.created_at) : new Date()
            ];
            
            await client.query(query, values);
            inserted++;
        } catch (err) {
            console.log(`Skipped row ID ${row.id}: ${err.message}`);
            skipped++;
        }
    }
    
    console.log(`✓ leave_requests: ${inserted} inserted, ${skipped} skipped`);
}

async function injectLeaveBalances(client, data) {
    console.log('Injecting leave_balances...');
    let inserted = 0;
    let skipped = 0;

    for (const row of data) {
        try {
            const query = `
                INSERT INTO leave_balances (
                    emp_id, year, cl_taken, ml_taken, od_taken, comp_taken, lop_taken, permission_taken, last_permission_reset_month
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                ON CONFLICT (emp_id, year) DO UPDATE SET
                    cl_taken = EXCLUDED.cl_taken,
                    ml_taken = EXCLUDED.ml_taken,
                    od_taken = EXCLUDED.od_taken,
                    comp_taken = EXCLUDED.comp_taken,
                    lop_taken = EXCLUDED.lop_taken,
                    permission_taken = EXCLUDED.permission_taken,
                    last_permission_reset_month = EXCLUDED.last_permission_reset_month
            `;
            
            const values = [
                row.emp_id,
                parseInt(row.year),
                parseFloat(row.cl_taken) || 0,
                parseFloat(row.ml_taken) || 0,
                parseFloat(row.od_taken) || 0,
                parseFloat(row.comp_taken) || 0,
                parseFloat(row.lop_taken) || 0,
                parseInt(row.permission_taken) || 0,
                prepareValue(row.last_permission_reset_month)
            ];
            
            await client.query(query, values);
            inserted++;
        } catch (err) {
            console.log(`Skipped row emp_id ${row.emp_id}: ${err.message}`);
            skipped++;
        }
    }
    
    console.log(`✓ leave_balances: ${inserted} inserted, ${skipped} skipped`);
}

async function injectLeaveApprovals(client, data) {
    console.log('Injecting leave_approvals...');
    let inserted = 0;
    let skipped = 0;

    for (const row of data) {
        try {
            const query = `
                INSERT INTO leave_approvals (
                    id, leave_request_id, approver_id, approver_type, status, comments, updated_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7)
                ON CONFLICT (id) DO NOTHING
            `;
            
            const values = [
                parseInt(row.id),
                parseInt(row.leave_request_id),
                row.approver_id,
                row.approver_type,
                row.status || 'Pending',
                prepareValue(row.comments),
                row.updated_at ? new Date(row.updated_at) : new Date()
            ];
            
            await client.query(query, values);
            inserted++;
        } catch (err) {
            console.log(`Skipped row ID ${row.id}: ${err.message}`);
            skipped++;
        }
    }
    
    console.log(`✓ leave_approvals: ${inserted} inserted, ${skipped} skipped`);
}

async function injectPermissionRequests(client, data) {
    console.log('Injecting permission_requests...');
    let inserted = 0;
    let skipped = 0;

    for (const row of data) {
        try {
            const query = `
                INSERT INTO permission_requests (
                    id, emp_id, date, from_time, to_time, subject, reason, status, created_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                ON CONFLICT (id) DO NOTHING
            `;
            
            const values = [
                parseInt(row.id),
                row.emp_id,
                row.date ? new Date(row.date) : null,
                row.from_time ? row.from_time : null,
                row.to_time ? row.to_time : null,
                prepareValue(row.subject),
                prepareValue(row.reason),
                row.status || 'Pending',
                row.created_at ? new Date(row.created_at) : new Date()
            ];
            
            await client.query(query, values);
            inserted++;
        } catch (err) {
            console.log(`Skipped row ID ${row.id}: ${err.message}`);
            skipped++;
        }
    }
    
    console.log(`✓ permission_requests: ${inserted} inserted, ${skipped} skipped`);
}

async function injectPermissionApprovals(client, data) {
    console.log('Injecting permission_approvals...');
    let inserted = 0;
    let skipped = 0;

    for (const row of data) {
        try {
            const query = `
                INSERT INTO permission_approvals (
                    id, permission_id, approver_id, approver_type, status, comments, updated_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7)
                ON CONFLICT (id) DO NOTHING
            `;
            
            const values = [
                parseInt(row.id),
                parseInt(row.permission_id),
                row.approver_id,
                row.approver_type,
                row.status || 'Pending',
                prepareValue(row.comments),
                row.updated_at ? new Date(row.updated_at) : new Date()
            ];
            
            await client.query(query, values);
            inserted++;
        } catch (err) {
            console.log(`Skipped row ID ${row.id}: ${err.message}`);
            skipped++;
        }
    }
    
    console.log(`✓ permission_approvals: ${inserted} inserted, ${skipped} skipped`);
}

async function createAttendanceRecordsTable(client) {
    console.log('Ensuring attendance_records table exists...');
    try {
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
}

async function main() {
    const client = await pool.connect();
    try {
        console.log('Connected to database');
        console.log('Starting data injection...\n');

        // Ensure attendance_records table exists
        await createAttendanceRecordsTable(client);

        // Read and inject leave_requests
        const leaveRequestsPath = path.join(__dirname, 'datas', 'leave_requests_rows.csv');
        if (fs.existsSync(leaveRequestsPath)) {
            const content = fs.readFileSync(leaveRequestsPath, 'utf8');
            const data = parseCSV(content);
            await injectLeaveRequests(client, data);
        }

        // Read and inject leave_balances
        const leaveBalancesPath = path.join(__dirname, 'datas', 'leave_balances_rows.csv');
        if (fs.existsSync(leaveBalancesPath)) {
            const content = fs.readFileSync(leaveBalancesPath, 'utf8');
            const data = parseCSV(content);
            await injectLeaveBalances(client, data);
        }

        // Read and inject leave_approvals
        const leaveApprovalsPath = path.join(__dirname, 'datas', 'leave_approvals_rows.csv');
        if (fs.existsSync(leaveApprovalsPath)) {
            const content = fs.readFileSync(leaveApprovalsPath, 'utf8');
            const data = parseCSV(content);
            await injectLeaveApprovals(client, data);
        }

        // Read and inject permission_requests
        const permissionRequestsPath = path.join(__dirname, 'datas', 'permission_requests_rows.csv');
        if (fs.existsSync(permissionRequestsPath)) {
            const content = fs.readFileSync(permissionRequestsPath, 'utf8');
            const data = parseCSV(content);
            await injectPermissionRequests(client, data);
        }

        // Read and inject permission_approvals
        const permissionApprovalsPath = path.join(__dirname, 'datas', 'permission_approvals_rows.csv');
        if (fs.existsSync(permissionApprovalsPath)) {
            const content = fs.readFileSync(permissionApprovalsPath, 'utf8');
            const data = parseCSV(content);
            await injectPermissionApprovals(client, data);
        }

        // Read and inject attendance_records
        const attendancePath = path.join(__dirname, 'datas', 'attendance_records_rows.csv');
        if (fs.existsSync(attendancePath)) {
            const content = fs.readFileSync(attendancePath, 'utf8');
            const data = parseCSV(content);
            await injectAttendanceRecords(client, data);
        }

        console.log('\n✓ Data injection completed successfully!');
    } catch (err) {
        console.error('Error during data injection:', err.message);
    } finally {
        client.release();
        await pool.end();
    }
}

main();
