const { pool } = require('./config/db');

async function getEnums() {
    try {
        const result = await pool.query(`
            SELECT t.typname, e.enumlabel
            FROM pg_type t
            JOIN pg_enum e ON t.oid = e.enumtypid
            WHERE t.typname IN ('attendance_status', 'leave_type_enum')
            ORDER BY t.typname, e.enumsortorder
        `);

        const enums = {};
        result.rows.forEach(row => {
            if (!enums[row.typname]) enums[row.typname] = [];
            enums[row.typname].push(row.enumlabel);
        });

        console.log('--- EXACT ENUM VALUES ---');
        console.log(JSON.stringify(enums, null, 2));
        console.log('-------------------------');
    } catch (error) {
        console.error('Error fetching enums:', error.message);
    } finally {
        await pool.end();
    }
}

getEnums();
