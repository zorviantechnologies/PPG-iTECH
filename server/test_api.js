const axios = require('axios');

async function testApi() {
    try {
        const response = await axios.get('http://localhost:5000/api/attendance/summary?month=2026-02');
        console.log('API RESPONSE STATUS:', response.status);
        console.log('API RESPONSE DATA:', JSON.stringify(response.data, null, 2));
    } catch (err) {
        if (err.response) {
            console.log('API ERROR:', err.response.status, err.response.data);
        } else {
            console.log('NETWORK ERROR:', err.message);
        }
    }
}

testApi();
