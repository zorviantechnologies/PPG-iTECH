const { pool } = require('./config/db');

async function checkSchema() {
    try {
        const { rows } = await pool.query(
            "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'attendance_records'"
        );
        console.log('--- attendance_records schema ---');
        console.log(rows);

        const { rows: users_schema } = await pool.query(
            "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'users'"
        );
        console.log('--- users schema ---');
        console.log(users_schema);
        
        const { rows: salary_schema } = await pool.query(
            "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'salary_records'"
        );
        console.log('--- salary_records schema ---');
        console.log(salary_schema);

    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}
checkSchema();
