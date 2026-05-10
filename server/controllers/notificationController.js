const { pool } = require('../config/db');
const sendEmail = require('../utils/sendEmail');
const socketUtil = require('../utils/socket');
const webpush = require('web-push');

// Configure web-push with VAPID keys
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(
        process.env.VAPID_SUBJECT || 'mailto:admin@example.com',
        process.env.VAPID_PUBLIC_KEY,
        process.env.VAPID_PRIVATE_KEY
    );
}

// @desc    Create a notification, send email, and trigger Web Push
exports.createNotification = async (emp_id, message, type = 'info', metadata = null, client = null, skipEmail = false) => {
    const db = client || pool;
    try {
        // 1. Insert into DB
        await db.query(
            'INSERT INTO notifications (user_id, message, type, metadata) VALUES ($1, $2, $3, $4)',
            [emp_id, message, type, metadata ? (typeof metadata === 'string' ? metadata : JSON.stringify(metadata)) : null]
        );

        // 3. Re-fetch the inserted notification to get details
        const { rows: notifRows } = await db.query(
            'SELECT id, user_id, message, is_read, type, metadata, created_at FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
            [emp_id]
        );

        // 4. Real-time emit via Socket
        const io = socketUtil.getIO();
        if (io && notifRows.length > 0) {
            const { rows: userRows } = await pool.query('SELECT id FROM users WHERE emp_id = $1', [emp_id]);
            if (userRows.length > 0) {
                io.to(userRows[0].id).emit('notification_received', notifRows[0]);
            }
        }

        // 5. Send Web Push Notification (Mobile/Desktop background)
        const { rows: subscriptions } = await db.query('SELECT subscription FROM push_subscriptions WHERE user_id = $1', [emp_id]);
        if (subscriptions.length > 0) {
            const payload = JSON.stringify({
                title: 'PPG EMP HUB',
                body: message,
                icon: '/ppg-logo.png',
                data: {
                    url: process.env.APP_URL || '/',
                    metadata: metadata
                }
            });

            subscriptions.forEach(sub => {
                let pushSub = sub.subscription;
                try {
                    if (typeof pushSub === 'string') {
                        pushSub = JSON.parse(pushSub);
                    }
                } catch (parseErr) {
                    console.error('Failed to parse push subscription:', parseErr);
                    return; // Skip this subscription
                }

                webpush.sendNotification(pushSub, payload).catch(async err => {
                    console.error('Push notification failed for a subscription:', err.statusCode || err.message);
                    if (err.statusCode === 410 || err.statusCode === 404) {
                        // Cleanup expired subscriptions. Try both stringified and direct formats depending on how it was stored
                        try {
                            // Using db.query instead of pool.query ensures it uses the passed transaction client if any
                            await db.query('DELETE FROM push_subscriptions WHERE subscription::text = $1', [JSON.stringify(sub.subscription)]);
                        } catch (delErr) {
                            console.error('Failed to clear expired subscription', delErr);
                        }
                    }
                });
            });
        }

        // 6. Fetch employee email and name then send email (if not skipped)
        if (!skipEmail) {
            const { rows } = await pool.query('SELECT email, name FROM users WHERE emp_id = $1', [emp_id]);
            
            if (rows.length > 0 && rows[0].email) {
                const { email, name } = rows[0];
                const appUrl = process.env.APP_URL || 'http://localhost:3000';
                const subject = `PPG iTech HUB: New ${type.charAt(0).toUpperCase() + type.slice(1)} Notification`;
                
                const html = `
                    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
                        <div style="background-color: #4A90E2; padding: 24px; text-align: center;">
                            <h1 style="color: white; margin: 0; font-size: 24px;">PPG iTech HUB</h1>
                        </div>
                        <div style="padding: 32px; background-color: white;">
                            <p style="font-size: 16px; color: #374151; margin-bottom: 24px;">Hello <strong>${name}</strong>,</p>
                            <p style="font-size: 16px; color: #4b5563; line-height: 1.5;">You have received a new notification in the application:</p>
                            <div style="background-color: #f9fafb; border-left: 4px solid #4A90E2; padding: 20px; margin: 24px 0; font-style: italic; color: #1f2937;">
                                "${message}"
                            </div>
                            <p style="font-size: 16px; color: #4b5563; margin-bottom: 32px;">Please click the button below to log in and view the details.</p>
                            <div style="text-align: center;">
                                <a href="${appUrl}" style="background-color: #4A90E2; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">View in Application</a>
                            </div>
                        </div>
                        <div style="background-color: #f3f4f6; padding: 16px; text-align: center; color: #6b7280; font-size: 12px;">
                            <p>© ${new Date().getFullYear()} PPG iTech HUB. All rights reserved.</p>
                            <p>This is an automated notification. Please do not reply to this email.</p>
                        </div>
                    </div>
                `;

                sendEmail({
                    email: email,
                    subject: subject,
                    html: html
                }).catch(err => console.error("Email notification failed:", err));
            }
        }
    } catch (error) {
        console.error("Error creating notification", error);
    }
};

// @desc    Save Push Subscription
// @route   POST /api/notifications/subscribe
// @access  Private
exports.subscribePush = async (req, res) => {
    const { subscription } = req.body;
    try {
        await pool.query(
            'INSERT INTO push_subscriptions (user_id, subscription) VALUES ($1, $2) ON CONFLICT (subscription) DO UPDATE SET user_id = EXCLUDED.user_id',
            [req.user.emp_id, JSON.stringify(subscription)]
        );
        res.status(201).json({ message: 'Subscribed successfully' });
    } catch (error) {
        console.error('Push Subscription Error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Get user notifications
// @route   GET /api/notifications
// @access  Private
exports.getNotifications = async (req, res) => {
    try {
        // Remove legacy login/security notification messages from the DB for this user.
        await pool.query(
            `DELETE FROM notifications
             WHERE user_id = $1 AND LOWER(type::text) = 'login'`,
            [req.user.emp_id]
        );

        const { rows } = await pool.query(
            `SELECT id, user_id, message, is_read, type, metadata,
                    to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS') as created_at
              FROM notifications 
              WHERE user_id = $1
                AND LOWER(type::text) <> 'login'
              ORDER BY created_at DESC 
              LIMIT 20`,
            [req.user.emp_id]
        );
        res.json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Mark notification as read
// @route   PUT /api/notifications/:id/read
// @access  Private
exports.markAsRead = async (req, res) => {
    try {
        await pool.query('UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2', [req.params.id, req.user.emp_id]);
        res.json({ message: 'Marked as read' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Mark all as read
// @route   PUT /api/notifications/read-all
// @access  Private
exports.markAllRead = async (req, res) => {
    try {
        await pool.query('UPDATE notifications SET is_read = true WHERE user_id = $1', [req.user.emp_id]);
        res.json({ message: 'All marked as read' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};
