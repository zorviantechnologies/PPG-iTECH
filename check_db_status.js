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
    connectionTimeoutMillis: 15000
});

async function checkDatabaseStatus() {
    console.log('🔍 Database Connection Status Check\n');
    console.log('Configuration:');
    console.log(`  Host: ${process.env.DB_HOST}`);
    console.log(`  Port: ${process.env.DB_PORT || 5432}`);
    console.log(`  Database: ${process.env.DB_NAME}`);
    console.log(`  User: ${process.env.DB_USER}\n`);

    try {
        console.log('Attempting connection...');
        const client = await pool.connect();
        
        console.log('✓ Connected successfully!\n');

        // Check version
        const versionResult = await client.query('SELECT version()');
        console.log('Database Version:');
        console.log(`  ${versionResult.rows[0].version}\n`);

        // Check tables
        console.log('Leave & Permission Tables Status:');
        
        const tables = [
            'leave_requests',
            'leave_balances',
            'leave_approvals',
            'permission_requests',
            'permission_approvals'
        ];

        for (const table of tables) {
            try {
                const result = await client.query(`SELECT COUNT(*) FROM ${table}`);
                const count = result.rows[0].count;
                console.log(`  ✓ ${table}: ${count} records`);
            } catch (err) {
                console.log(`  ✗ ${table}: Error - ${err.message}`);
            }
        }

        // Check recent records
        console.log('\nRecent Data:');
        
        try {
            const recentRequests = await client.query(
                'SELECT id, emp_id, leave_type, status, created_at FROM leave_requests ORDER BY created_at DESC LIMIT 3'
            );
            if (recentRequests.rows.length > 0) {
                console.log('  Last 3 Leave Requests:');
                recentRequests.rows.forEach(row => {
                    console.log(`    - ID ${row.id}: ${row.emp_id} (${row.leave_type}) - ${row.status}`);
                });
            }
        } catch (err) {
            console.log(`  Error fetching recent requests: ${err.message}`);
        }

        console.log('\n✓ Database is working correctly!');
        client.release();
        
    } catch (err) {
        console.error('✗ Connection failed!');
        console.error(`Error: ${err.message}`);
        console.error(`Code: ${err.code}`);
        
        // Provide troubleshooting tips
        console.error('\nTroubleshooting:');
        if (err.code === 'ENOTFOUND') {
            console.error('  - The hostname could not be resolved');
            console.error('  - Check your internet connection');
            console.error('  - Verify the DB_HOST in your .env file');
        } else if (err.code === 'ETIMEDOUT') {
            console.error('  - Connection timed out');
            console.error('  - The database server may be offline or unreachable');
            console.error('  - Check your network connectivity');
        } else if (err.code === 'ECONNREFUSED') {
            console.error('  - Connection refused by the server');
            console.error('  - Verify the database host and port are correct');
        }
    } finally {
        await pool.end();
    }
}

checkDatabaseStatus();
