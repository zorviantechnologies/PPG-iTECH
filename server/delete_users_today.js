require('dotenv').config({path: require('path').resolve(__dirname, '.env')});
const { pool } = require('./config/db.js');

async function run() {
  try {
    // Check if created_at exists, but instead we just delete by name prefix and today's date if possible.
    // However, since they were all named 'Biometric User <emp_id>', we can safely delete by name prefix.
    const result = await pool.query(`
      DELETE FROM users 
      WHERE (designation = 'Biometric Imported' OR name LIKE 'Biometric User %')
    `);
    
    console.log('✅ DELETED AUTO-CREATED USERS:', result.rowCount);
  } catch (e) {
    if (e.message.includes('created_at')) {
       console.log('No created_at column, deleting by name only...');
    } else {
       console.error('Error:', e.message);
    }
  } finally {
    await pool.end();
  }
}
run();
