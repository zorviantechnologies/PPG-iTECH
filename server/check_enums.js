const { pool } = require('./config/db');
const fs = require('fs');

async function checkEnums() {
    try {
        const { rows: columns } = await pool.query(`
            SELECT column_name, udt_name 
            FROM information_schema.columns 
            WHERE table_name IN ('attendance', 'users') AND data_type = 'USER-DEFINED'
        `);

        const results = {};
        for (const col of columns) {
            const { rows: values } = await pool.query(`
                SELECT enumlabel 
                FROM pg_enum 
                JOIN pg_type ON pg_enum.enumtypid = pg_type.oid 
                WHERE pg_type.typname = $1
            `, [col.udt_name]);
            results[col.column_name] = { type: col.udt_name, values: values.map(v => v.enumlabel) };
        }

        fs.writeFileSync('enum_results.json', JSON.stringify(results, null, 2));
        console.log('Results written to enum_results.json');

    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}

checkEnums();
