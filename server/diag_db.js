const { Client } = require('pg');
const dns = require('dns').promises;

async function check() {
    const host = 'aws-1-ap-south-1.pooler.supabase.com';
    try {
        const addresses = await dns.resolve4(host);
        console.log(`DNS resolve ${host}: ${addresses.join(', ')}`);
        
        const client = new Client({
            host: host,
            user: 'postgres.zolybloevqjxtfishmcg',
            password: 'a,b,c,d.1234',
            database: 'postgres',
            port: 5432,
            ssl: { rejectUnauthorized: false }
        });
        
        console.log('Connecting...');
        await client.connect();
        console.log('✅ Success!');
        await client.end();
    } catch (err) {
        console.error('❌ Failed:', err.message);
        if (err.stack) console.error(err.stack);
    }
}

check();
