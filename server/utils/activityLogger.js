const { pool } = require('../config/db');

/**
 * Log user activity to the database
 * @param {number} userId - ID of the user performing the action
 * @param {string} action - Descriptive action name (e.g., 'LOGIN', 'UPDATE_EMPLOYEE')
 * @param {object} details - Any additional JSON data to store
 * @param {string} ip - IP address of the request
 */
const logActivity = async (userId, action, details = {}, ip = '') => {
    try {
        const query = `
            INSERT INTO activity_logs (user_id, action, details, ip_address, created_at)
            VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
        `;
        await pool.query(query, [userId, action, JSON.stringify(details), ip]);
    } catch (err) {
        console.error('ACTIVITY LOG ERROR:', err.message);
    }
};

module.exports = logActivity;
