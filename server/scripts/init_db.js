const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '../.env') });

const initDB = async () => {
    try {
        // Create connection without selecting database first to create it
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || 'a,b,c,d.1234'
        });

        console.log('Connected to MySQL server.');

        const schemaPath = path.join(__dirname, '../../database/schema.sql');
        const schema = fs.readFileSync(schemaPath, 'utf8');

        // Split queries by semicolon (simple split, assumes valid SQL without semicolons in strings)
        // Better to use a parser or just run the whole thing if driver supports multiple statements.
        // mysql2 supports multipleStatements: true option.

        await connection.end();

        const multiConnection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || 'a,b,c,d.1234',
            multipleStatements: true
        });

        console.log('Executing schema script...');
        await multiConnection.query(schema);
        console.log('Database initialized successfully.');

        await multiConnection.end();
        process.exit(0);
    } catch (error) {
        console.error('Database initialization failed:', error);
        process.exit(1);
    }
};

initDB();
