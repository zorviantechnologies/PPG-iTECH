const axios = require('axios');

async function testApi() {
    try {
        console.log('Testing /api/attendance/summary?month=2026-02...');
        const res = await axios.get('http://localhost:5000/api/attendance/summary?month=2026-02');
        console.log('STATUS:', res.status);
        console.log('DATA TYPE:', typeof res.data);
        console.log('IS ARRAY:', Array.isArray(res.data));
        console.log('LENGTH:', res.data.length);
        if (Array.isArray(res.data)) {
            console.log('FIRST ITEM:', JSON.stringify(res.data[0], null, 2));
        } else {
            console.log('DATA:', JSON.stringify(res.data, null, 2));
        }
    } catch (err) {
        console.error('ERROR:', err.response ? err.response.data : err.message);
    }
}

testApi();
