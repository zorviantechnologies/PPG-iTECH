const { Client } = require('pg');
require('dotenv').config();

console.log('Testing connection with:');
console.log('Host:', process.env.DB_HOST);
console.log('User:', process.env.DB_USER);
console.log('Password length:', process.env.DB_PASSWORD ? process.env.DB_PASSWORD.length : 0);

const client = new Client({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: parseInt(process.env.DB_PORT || '5432'),
    ssl: { rejectUnauthorized: false }
});

client.connect()
    .then(() => {
        console.log('✅ Connection successful!');
        return client.query('SELECT 1');
    })
    .then(() => {
        console.log('✅ Query 1 successful!');
        process.exit(0);
    })
    .catch(err => {
        console.error('❌ Connection failed:', err.message);
        process.exit(1);
    });
