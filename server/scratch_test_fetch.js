const fs = require('fs');

async function testPut() {
    const token = fs.readFileSync('token.txt', 'utf8').trim();
    try {
        const response = await fetch('http://localhost:5000/api/attendance/new', {
            method: 'PUT',
            headers: { 
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                emp_id: '186',
                date: '2026-05-12',
                in_time: '09:00',
                out_time: '17:00',
                status: 'LOP',
                remarks: 'test from script'
            })
        });
        const data = await response.json();
        console.log('API RESPONSE STATUS:', response.status);
        console.log('API RESPONSE DATA:', JSON.stringify(data, null, 2));
    } catch (err) {
        console.log('NETWORK ERROR:', err.message);
    }
}

testPut();
