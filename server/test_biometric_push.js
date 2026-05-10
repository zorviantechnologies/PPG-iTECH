const axios = require('axios');

const test = async () => {
    try {
        console.log('Testing Biometric Endpoint: http://localhost:5000/api/biometric/log');
        const res = await axios.post('http://localhost:5000/api/biometric/log', {
            emp_id: '818',
            device_id: 'TEST_DEVICE',
            timestamp: new Date().toISOString(),
            type: 'IN'
        });
        console.log('SERVER RESPONSE:', res.status, res.data);
    } catch (err) {
        console.error('SERVER ERROR:', err.response?.status, err.response?.data || err.message);
    }
};

test();
