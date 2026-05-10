const axios = require('axios');
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');
dotenv.config();

const test = async () => {
    try {
        // We need an admin user ID for the token
        const token = jwt.sign({ id: 1 }, process.env.JWT_SECRET || 'your_jwt_secret_key_change_in_production');
        const res = await axios.get('http://localhost:5000/api/activity-logs', {
            headers: { Authorization: `Bearer ${token}` }
        });
        console.log('API SUCCESS:', res.data.length, 'logs');
    } catch (err) {
        console.error('API ERROR:', err.response?.status, err.response?.data || err.message);
    }
};

test();
