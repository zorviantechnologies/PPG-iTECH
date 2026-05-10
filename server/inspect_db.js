require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 5432,
    ssl: { rejectUnauthorized: false }
});

async function inspect() {
    const client = await pool.connect();
    try {
        await client.query('SET search_path TO public');

        // 1. List all tables in public schema
        const { rows: tables } = await client.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
            ORDER BY table_name
        `);
        console.log('\n📋 Tables in public schema:');
        if (tables.length === 0) {
            console.log('   (none — schema not applied yet)');
        } else {
            tables.forEach(t => console.log(`  - ${t.table_name}`));
        }

        // 2. Check users table columns if it exists
        const usersTable = tables.find(t => t.table_name === 'users');
        if (usersTable) {
            const { rows: cols } = await client.query(`
                SELECT column_name, data_type, is_nullable
                FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'users'
                ORDER BY ordinal_position
            `);
            console.log('\n📋 columns in public.users:');
            cols.forEach(c => console.log(`  ${c.column_name} (${c.data_type})`));
        }

        // 3. Check existing ENUM types
        const { rows: enums } = await client.query(`
            SELECT typname FROM pg_type 
            WHERE typcategory = 'E'
            ORDER BY typname
        `);
        console.log('\n📋 ENUM types:');
        enums.forEach(e => console.log(`  - ${e.typname}`));

    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        client.release();
        await pool.end();
    }
}

inspect();
