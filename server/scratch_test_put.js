const axios = require('axios');
const fs = require('fs');

async function testPut() {
    const token = fs.readFileSync('token.txt', 'utf8').trim();
    try {
        const response = await axios.put('http://localhost:5000/api/attendance/new', {
            emp_id: '186',
            date: '2026-05-12',
            in_time: '09:00',
            out_time: '17:00',
            status: 'LOP',
            remarks: 'test from script'
        }, {
            headers: { Authorization: `Bearer ${token}` }
        });
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

testPut();
