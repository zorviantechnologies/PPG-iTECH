const { pool, queryWithRetry, isRetryableDbError } = require('../config/db');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const logActivity = require('../utils/activityLogger');
const { OAuth2Client } = require('google-auth-library');
const axios = require('axios');

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Generate JWT
const generateToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET, {
        expiresIn: '30d',
    });
};

// @desc    Auth user via Google OAuth (ID token verification & database email check)
// @route   POST /api/auth/google
// @access  Public
exports.googleLogin = async (req, res) => {
    const { credential, idToken, email } = req.body;
    let verifiedEmail = null;

    try {
        const tokenToVerify = credential || idToken;

        if (tokenToVerify) {
            // 1. Authenticate user using Google OAuth / Google Identity Services & verify token
            try {
                if (process.env.GOOGLE_CLIENT_ID) {
                    const ticket = await googleClient.verifyIdToken({
                        idToken: tokenToVerify,
                        audience: process.env.GOOGLE_CLIENT_ID,
                    });
                    const payload = ticket.getPayload();
                    if (payload && payload.email_verified) {
                        verifiedEmail = payload.email;
                    }
                } else {
                    // Query Google tokeninfo endpoint if client ID is dynamically validated
                    const response = await axios.get(`https://oauth2.googleapis.com/tokeninfo?id_token=${tokenToVerify}`);
                    if (response.data && (response.data.email_verified === 'true' || response.data.email_verified === true)) {
                        verifiedEmail = response.data.email;
                    }
                }
            } catch (tokenVerificationError) {
                console.warn('ID Token verification failed, falling back to decoded identity:', tokenVerificationError.message);
                try {
                    const decoded = jwt.decode(tokenToVerify);
                    if (decoded && decoded.email) {
                        verifiedEmail = decoded.email;
                    }
                } catch (e) {}
            }
        }

        // 2. Fallback to direct email parameter if provided and no token was verified
        if (!verifiedEmail && email) {
            verifiedEmail = email;
        }

        // 3. Normalize email consistently (trim whitespace & lowercase)
        const trimmedEmail = verifiedEmail?.trim()?.toLowerCase();

        if (!trimmedEmail) {
            return res.status(400).json({ message: 'Google authentication failed: Could not retrieve a valid email address.' });
        }

        // 4. Query "user_login" table joined with "users" to check if verified email exists in user_login
        const { rows } = await queryWithRetry(
            `SELECT ul.user_id, ul.email as login_email, u.* 
             FROM user_login ul
             JOIN users u ON u.id = ul.user_id
             WHERE LOWER(TRIM(ul.email)) = $1 
               AND u.role IN ('admin', 'principal', 'hod', 'staff', 'accounts', 'management', 'student')`,
            [trimmedEmail]
        );
        const user = rows[0];

        // 5. If email exists in user_login table, allow user to log in and create application session
        if (user) {
            await logActivity(user.id, 'LOGIN', { emp_id: user.emp_id, email_id: user.email || user.personal_email || trimmedEmail, method: 'GOOGLE_OAUTH' }, req.ip);

            return res.json({
                id: user.id,
                emp_id: user.emp_id,
                name: user.name,
                role: user.role,
                department_id: user.department_id,
                profile_pic: user.profile_pic,
                email: user.email || user.personal_email || user.login_email,
                token: generateToken(user.id),
            });
        } else {
            // 6. If email does NOT exist in user_login, do NOT allow access.
            await logActivity(null, 'FAILED_LOGIN', { email: trimmedEmail, reason: 'Email not found in user_login table' }, req.ip);
            return res.status(401).json({ message: 'Access Denied: This email is not registered in the user login table. Please contact the administrator.' });
        }
    } catch (error) {
        console.error('Google Login Error:', error);
        if (isRetryableDbError(error)) {
            return res.status(503).json({ message: 'Database is currently busy or unavailable. Please try again in a few seconds.' });
        }
        res.status(500).json({ message: 'Authentication error occurred. Please try again.' });
    }
};

// @desc    Get list of registered employee emails for Google login selection
// @route   GET /api/auth/registered-emails
// @access  Public
exports.getRegisteredEmails = async (req, res) => {
    try {
        const { rows } = await queryWithRetry(
            `SELECT DISTINCT LOWER(TRIM(COALESCE(ul.email, u.email, u.personal_email))) as email, u.name, u.role
             FROM users u
             LEFT JOIN user_login ul ON ul.user_id = u.id
             WHERE (
                (ul.email IS NOT NULL AND TRIM(ul.email) != '') OR
                (u.email IS NOT NULL AND TRIM(u.email) != '') OR
                (u.personal_email IS NOT NULL AND TRIM(u.personal_email) != '')
             )
             AND u.role IN ('admin', 'principal', 'hod', 'staff', 'accounts', 'management', 'student')
             ORDER BY email ASC`
        );
        res.json(rows);
    } catch (error) {
        console.error('Error fetching registered emails:', error);
        res.status(500).json({ message: 'Failed to fetch registered emails' });
    }
};

// @desc    Auth user & get token via Employee Email Address (or ID)
// @route   POST /api/auth/login
// @access  Public
exports.loginUser = async (req, res) => {
    const { email, emp_id } = req.body;

    const identifier = (email || emp_id)?.trim();

    if (!identifier) {
        return res.status(400).json({ message: 'Please enter your registered employee email address' });
    }

    try {
        // Query user_login table joined with users
        const { rows } = await queryWithRetry(
            `SELECT ul.user_id, ul.email as login_email, u.* 
             FROM user_login ul
             JOIN users u ON u.id = ul.user_id
             WHERE (LOWER(TRIM(ul.email)) = LOWER(TRIM($1)) OR LOWER(TRIM(u.emp_id)) = LOWER(TRIM($1))) 
               AND u.role IN ('admin', 'principal', 'hod', 'staff', 'accounts', 'management', 'student')`,
            [identifier]
        );
        const user = rows[0];

        if (user) {
            await logActivity(user.id, 'LOGIN', { emp_id: user.emp_id, email_id: user.email || user.personal_email || user.login_email }, req.ip);

            return res.json({
                id: user.id,
                emp_id: user.emp_id,
                name: user.name,
                role: user.role,
                department_id: user.department_id,
                profile_pic: user.profile_pic,
                email: user.email || user.personal_email || user.login_email,
                token: generateToken(user.id),
            });
        } else {
            await logActivity(null, 'FAILED_LOGIN', { identifier, reason: 'Identifier not in user_login table' }, req.ip);
            return res.status(401).json({ message: `Access Denied: The email '${identifier}' is not registered in the user_login table.` });
        }
    } catch (error) {
        console.error('Login Error:', error);
        if (isRetryableDbError(error)) {
            return res.status(503).json({ message: 'Database is currently busy or unavailable. Please try again in a few seconds.' });
        }
        res.status(500).json({ message: 'Server Error' });
    }
};


// @desc    Management login with PIN / Email
// @route   POST /api/auth/management-login
// @access  Public
exports.managementLogin = async (req, res) => {
    const { email, emp_id, pin } = req.body;
    const identifier = (email || emp_id)?.trim();

    if (!pin) {
        return res.status(400).json({ message: 'Please provide a PIN' });
    }

    try {
        let query, params;

        if (identifier) {
            // If email/emp_id provided, find that specific management user
            query = "SELECT id, name, pin, emp_id, email FROM users WHERE role = 'management' AND (LOWER(emp_id) = LOWER($1) OR LOWER(email) = LOWER($1) OR LOWER(personal_email) = LOWER($1))";
            params = [identifier];
        } else {
            // Fallback: find any management user (supports the old button flow)
            query = "SELECT id, name, pin, emp_id, email FROM users WHERE role = 'management' LIMIT 1";
            params = [];
        }

        const { rows: mgmtUsers } = await queryWithRetry(query, params);

        if (mgmtUsers.length === 0) {
            return res.status(401).json({ message: 'Invalid management account or email' });
        }

        const mgmt = mgmtUsers[0];

        if (pin.trim() !== mgmt.pin) {
            return res.status(401).json({ message: 'Invalid management PIN' });
        }

        res.json({
            role: 'management',
            name: mgmt.name,
            emp_id: mgmt.emp_id,
            email: mgmt.email,
            token: generateToken(mgmt.id),
        });
    } catch (error) {
        console.error('Management Login Error:', error);
        if (isRetryableDbError(error)) {
            return res.status(503).json({ message: 'Database is currently busy. Please try again shortly.' });
        }
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Get user profile
// @route   GET /api/auth/profile
// @access  Private
exports.getUserProfile = async (req, res) => {
    try {
        const { rows } = await queryWithRetry(`
            SELECT u.*, d.name as department_name
            FROM users u
            LEFT JOIN departments d ON u.department_id = d.id
            WHERE u.id = $1
        `, [req.user.id]);
        if (rows.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }
        res.json(rows[0]);
    } catch (error) {
        console.error('getProfile Error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Update profile picture
// @route   PUT /api/auth/profile-pic
// @access  Private
exports.updateProfilePic = async (req, res) => {
    const { profile_pic } = req.body;

    if (!profile_pic) {
        return res.status(400).json({ message: 'Please provide profile_pic URL' });
    }

    try {
        const { rows } = await queryWithRetry(
            'UPDATE users SET profile_pic = $1 WHERE id = $2 RETURNING *',
            [profile_pic, req.user.id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }

        const user = rows[0];
        res.json({
            message: 'Profile picture updated successfully',
            user: {
                id: user.id,
                emp_id: user.emp_id,
                name: user.name,
                role: user.role,
                profile_pic: user.profile_pic
            }
        });
        await logActivity(req.user.id, 'UPDATE_PROFILE_PIC', { emp_id: user.emp_id }, req.ip);
    } catch (error) {
        console.error(error);
        if (isRetryableDbError(error)) {
            return res.status(503).json({ message: 'Database is busy. Please try again shortly.' });
        }
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Update own profile (self-service)
// @route   PUT /api/auth/profile
// @access  Private
exports.updateProfile = async (req, res) => {
    const {
        mobile, whatsapp, email, blood_group, religion, nationality, community,
        aadhar, pan, account_no, bank_name, branch, ifsc, pin_code,
        pf_number, uan_number, permanent_address, communication_address,
        father_name, mother_name, marital_status, profile_pic, pin, emp_id,
        emergency_contact, personal_email, bank_account_name, other_experience,
        spouse_name, children
    } = req.body;

    try {
        if (emp_id) {
            const { rows: existing } = await queryWithRetry('SELECT id FROM users WHERE LOWER(emp_id) = LOWER($1) AND id != $2', [emp_id.trim(), req.user.id]);
            if (existing.length > 0) return res.status(400).json({ message: 'Employee ID already taken' });
        }

        let hashedPassword;
        if (pin) {
            hashedPassword = await bcrypt.hash(pin, 10);
        }

        const query = `
            UPDATE users SET 
                mobile = $1, whatsapp = $2, email = $3, blood_group = $4, religion = $5,
                nationality = $6, community = $7,
                aadhar = $8, pan = $9, account_no = $10, bank_name = $11, branch = $12,
                ifsc = $13, pin_code = $14, pf_number = $15, uan_number = $16,
                permanent_address = $17, communication_address = $18,
                father_name = $19, mother_name = $20, marital_status = $21,
                profile_pic = COALESCE($22, profile_pic),
                pin = COALESCE($23, pin), password = COALESCE($24, password),
                emp_id = COALESCE($26, emp_id), emergency_contact = $27, personal_email = $28,
                bank_account_name = $29, other_experience = $30, spouse_name = $31, children = $32
            WHERE id = $25
            RETURNING id, emp_id, name, role, profile_pic, department_id
        `;

        const { rows } = await queryWithRetry(query, [
            mobile || null, whatsapp || null, email || null, blood_group || null, religion || null,
            nationality || 'Indian', community || null,
            aadhar || null, pan || null, account_no || null, bank_name || null, branch || null,
            ifsc || null, pin_code || null, pf_number || null, uan_number || null,
            permanent_address || null, communication_address || null,
            father_name || null, mother_name || null, marital_status || null,
            profile_pic || null, pin || null, hashedPassword || null,
            req.user.id, emp_id || null, emergency_contact || null, personal_email || null,
            bank_account_name || null, other_experience || null, spouse_name || null, JSON.stringify(Array.isArray(children) ? children : [])
        ]);

        if (rows.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }

        res.json({ message: 'Profile updated successfully', user: rows[0] });
    } catch (error) {
        console.error('Update Profile Error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Update own display name only
// @route   PUT /api/auth/profile-name
// @access  Private
exports.updateProfileName = async (req, res) => {
    const { name } = req.body;

    const cleanName = String(name || '').trim();
    if (!cleanName) {
        return res.status(400).json({ message: 'Name is required' });
    }
    if (cleanName.length < 2) {
        return res.status(400).json({ message: 'Name must be at least 2 characters' });
    }

    try {
        const { rows } = await queryWithRetry(
            `UPDATE users
             SET name = $1
             WHERE id = $2
             RETURNING id, emp_id, name, role, profile_pic, department_id`,
            [cleanName, req.user.id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }

        res.json({ message: 'Name updated successfully', user: rows[0] });
    } catch (error) {
        console.error('Update Profile Name Error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Check if Employee ID exists
// @route   POST /api/auth/check-id
// @access  Public
exports.checkEmployeeId = async (req, res) => {
    const { emp_id } = req.body;

    if (!emp_id) {
        return res.status(400).json({ message: 'Please provide emp_id' });
    }

    try {
        const { rows } = await queryWithRetry(
            'SELECT id, name, pin, password, role FROM users WHERE LOWER(emp_id) = LOWER($1)',
            [emp_id.trim()]
        );

        if (rows.length > 0) {
            const user = rows[0];
            let pinLength = 4;
            if (user.pin) {
                pinLength = user.pin.trim().length;
            } else {
                pinLength = '4or6';
            }

            return res.json({ 
                exists: true, 
                name: user.name, 
                role: user.role, 
                pin_length: pinLength 
            });
        }

        res.json({ exists: false });
    } catch (error) {
        console.error('Check ID Error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Update management profile (only for management users)
// @route   PUT /api/auth/management-profile
// @access  Private (Management)
exports.updateManagementProfile = async (req, res) => {
    const { pin, emp_id } = req.body;
    
    try {
        // Find the management user ID
        const { rows } = await queryWithRetry("SELECT id FROM users WHERE role = 'management' LIMIT 1");
        if (rows.length === 0) {
            return res.status(404).json({ message: 'Management user not found' });
        }
        const mgmtId = rows[0].id;

        if (pin && emp_id) {
             await queryWithRetry(
                "UPDATE users SET pin = $1, emp_id = $2 WHERE id = $3",
                [pin.trim(), emp_id.trim(), mgmtId]
            );
        } else if (pin) {
            await queryWithRetry(
                "UPDATE users SET pin = $1 WHERE id = $2",
                [pin.trim(), mgmtId]
            );
        } else if (emp_id) {
            await queryWithRetry(
                "UPDATE users SET emp_id = $1 WHERE id = $2",
                [emp_id.trim(), mgmtId]
            );
        }

        res.json({ message: 'Management profile updated successfully' });
    } catch (error) {
        console.error('Update Management Profile Error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};
