const jwt = require('jsonwebtoken');
const { pool } = require('../config/db');

// Simple in-memory cache for auth user lookups (avoids hitting remote Supabase on every request)
const userCache = new Map();
const CACHE_TTL = 60000; // 1 minute

function getCachedUser(id) {
    const entry = userCache.get(id);
    if (entry && Date.now() - entry.ts < CACHE_TTL) return entry.user;
    userCache.delete(id);
    return null;
}

function setCachedUser(id, user) {
    userCache.set(id, { user, ts: Date.now() });
}

// Protect routes - Verify JWT
exports.protect = async (req, res, next) => {
    if (
        !req.headers.authorization ||
        !req.headers.authorization.startsWith('Bearer')
    ) {
        return res.status(401).json({ message: 'Not authorized, no token' });
    }

    try {
        const token = req.headers.authorization.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        const ensureUserExists = async (id) => {
            const { rows } = await pool.query('SELECT id FROM users WHERE id = $1', [id]);
            return rows.length > 0;
        };

        // Check cache first
        let user = getCachedUser(decoded.id);
        if (user) {
            const stillExists = await ensureUserExists(decoded.id);
            if (!stillExists) {
                userCache.delete(decoded.id);
                return res.status(401).json({ message: 'User not found' });
            }
        } else {
            const { rows } = await pool.query(`
                SELECT u.id, u.emp_id, u.name, u.role, u.department_id, d.name as department_name
                FROM users u 
                LEFT JOIN departments d ON u.department_id = d.id 
                WHERE u.id = $1
            `, [decoded.id]);

            if (rows.length === 0) {
                return res.status(401).json({ message: 'User not found' });
            }
            user = rows[0];
            setCachedUser(decoded.id, user);
        }

        req.user = user;
        next();
    } catch (error) {
        console.error('AUTH ERROR:', error.message);
        return res.status(401).json({ message: 'Not authorized, token failed: ' + error.message });
    }
};

// Clear cache for a specific user (call after user updates)
exports.clearUserCache = (userId) => {
    userCache.delete(userId);
};

// Restrict to specific roles
exports.restrictTo = (...roles) => {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({
                message: `User role '${req.user.role}' is not authorized to access this route`
            });
        }
        next();
    };
};
