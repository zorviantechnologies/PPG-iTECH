require('dotenv').config();
const jwt = require('jsonwebtoken');
const axios = require('axios');

async function testHttpApplyLeave() {
    try {
        console.log("Generating token for EMP003...");
        const token = jwt.sign(
            { emp_id: 'EMP003', id: 4 }, // Guessing ID doesn't matter much as long as emp_id is there
            process.env.JWT_SECRET || 'fallback_secret',
            { expiresIn: '30d' }
        );
        console.log("Token:", token.substring(0, 20) + "...");

        const res = await axios.post('http://localhost:5000/api/leaves', {
            leave_type: 'CL',
            from_date: '2026-04-01',
            to_date: '2026-04-02',
            days_count: 2,
            reason: 'Test HTTP request',
            subject: 'HTTP Test',
            replacements: [{ staff_id: 'EMP002', periods: '1, 2' }]
        }, {
            headers: { Authorization: `Bearer ${token}` }
        });

        console.log("SUCCESS:", res.status, res.data);
    } catch (err) {
        if (err.response) {
            console.error("HTTP ERROR:", err.response.status, err.response.data);
        } else {
            console.error("NETWORK ERROR:", err.message);
        }
    }
}

testHttpApplyLeave();
