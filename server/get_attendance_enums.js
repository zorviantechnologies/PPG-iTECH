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

async function getEnums() {
    const client = await pool.connect();
    try {
        const { rows } = await client.query(`
            SELECT t.typname, e.enumlabel
            FROM pg_type t
            JOIN pg_enum e ON t.oid = e.enumtypid
            WHERE t.typname IN (
                SELECT DISTINCT pg_type.typname 
                FROM information_schema.columns 
                JOIN pg_type ON columns.udt_name = pg_type.typname
                WHERE table_name = 'attendance' AND column_name = 'status'
            )
        `);
        require('fs').writeFileSync('enums_output.json', JSON.stringify(rows, null, 2));
        console.log('Enums written to enums_output.json');
    } catch (err) {
        console.error(err);
    } finally {
        client.release();
        await pool.end();
    }
}

getEnums();
