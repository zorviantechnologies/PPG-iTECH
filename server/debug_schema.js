const { pool } = require('./config/db');
const fs = require('fs');
async function checkSchema() {
    try {
        const results = {};
        const depts = await pool.query("SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = 'departments'");
        results.departments = depts.rows;

        console.log("Checking enum types...");
        const enums = await pool.query("SELECT t.typname, e.enumlabel FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid");
        results.enums = enums.rows;

        fs.writeFileSync('schema_info.json', JSON.stringify(results, null, 2));
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkSchema();
