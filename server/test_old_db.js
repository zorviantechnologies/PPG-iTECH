const { Client } = require('pg');

async function test() {
    const configs = [
        { name: 'POOLER', host: 'aws-1-ap-south-1.pooler.supabase.com' },
        { name: 'DIRECT', host: 'db.zolybloevqjxtfishmcg.supabase.co' }
    ];

    for (const conf of configs) {
        console.log(`\n--- Testing ${conf.name} (${conf.host}) ---`);
        const client = new Client({
            host: conf.host,
            user: 'postgres.zolybloevqjxtfishmcg',
            password: 'a,b,c,d.1234',
            database: 'postgres',
            port: 5432,
            ssl: { rejectUnauthorized: false },
            connectionTimeoutMillis: 5000
        });

        try {
            await client.connect();
            console.log(`✅ ${conf.name} connected!`);
            await client.end();
        } catch (e) {
            console.error(`❌ ${conf.name} failed:`, e.message);
        }
    }
}

test();
