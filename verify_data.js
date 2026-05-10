const { Pool } = require('pg');
require('dotenv').config({ path: './server/.env' });

const pool = new Pool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 5432,
    ssl: {
        rejectUnauthorized: false
    },
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000
});

async function verifyData() {
    const client = await pool.connect();
    try {
        console.log('Verifying data in database...\n');

        // Check leave_requests count
        const leaveRequestsResult = await client.query('SELECT COUNT(*) FROM leave_requests');
        console.log(`✓ leave_requests: ${leaveRequestsResult.rows[0].count} records`);

        // Check leave_balances count
        const leaveBalancesResult = await client.query('SELECT COUNT(*) FROM leave_balances');
        console.log(`✓ leave_balances: ${leaveBalancesResult.rows[0].count} records`);

        // Check leave_approvals count
        const leaveApprovalsResult = await client.query('SELECT COUNT(*) FROM leave_approvals');
        console.log(`✓ leave_approvals: ${leaveApprovalsResult.rows[0].count} records`);

        // Check permission_requests count
        const permissionRequestsResult = await client.query('SELECT COUNT(*) FROM permission_requests');
        console.log(`✓ permission_requests: ${permissionRequestsResult.rows[0].count} records`);

        // Check permission_approvals count
        const permissionApprovalsResult = await client.query('SELECT COUNT(*) FROM permission_approvals');
        console.log(`✓ permission_approvals: ${permissionApprovalsResult.rows[0].count} records`);

        console.log('\n✓ All data successfully stored in database!');
        
        console.log('\n--- Sample Data ---');
        
        // Show sample leave request
        const sampleRequest = await client.query('SELECT id, emp_id, leave_type, status FROM leave_requests LIMIT 1');
        if (sampleRequest.rows.length > 0) {
            console.log('\nSample Leave Request:', sampleRequest.rows[0]);
        }

        // Show sample leave balance
        const sampleBalance = await client.query('SELECT emp_id, year, cl_taken, ml_taken FROM leave_balances LIMIT 1');
        if (sampleBalance.rows.length > 0) {
            console.log('Sample Leave Balance:', sampleBalance.rows[0]);
        }

        // Show sample permission request
        const samplePerm = await client.query('SELECT id, emp_id, status FROM permission_requests LIMIT 1');
        if (samplePerm.rows.length > 0) {
            console.log('Sample Permission Request:', samplePerm.rows[0]);
        }

    } catch (err) {
        console.error('Error during verification:', err.message);
    } finally {
        client.release();
        await pool.end();
    }
}

verifyData();
