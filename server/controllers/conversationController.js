const { pool } = require('../config/db');

// Helper: get io from the express app (avoids circular dependency)
const getIO = (req) => req.app.get('io');

// @desc    Create new conversation/thread
// @route   POST /api/conversations
// @access  Private
exports.createConversation = async (req, res) => {
    const { title, target_role, target_dept_id, target_user_ids } = req.body;

    try {
        const { rows } = await pool.query(
            'INSERT INTO conversations (title, creator_id, target_role, target_dept_id, target_user_ids) VALUES ($1, $2, $3, $4, $5) RETURNING id',
            [title, req.user.emp_id, target_role || 'all', target_dept_id || null, target_user_ids || null]
        );

        const conversationId = rows[0].id;

        // Notify relevant users? Optional for now.

        res.status(201).json({ id: conversationId, message: 'Conversation started' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Get conversations based on role/dept
// @route   GET /api/conversations
// @access  Private
exports.getConversations = async (req, res) => {
    try {
        const query = `
            SELECT c.id, c.title, c.creator_id, c.target_role, c.target_dept_id, c.target_user_ids,
                   to_char(c.created_at, 'YYYY-MM-DD"T"HH24:MI:SS') as created_at,
                   u.name as creator_name, u.role as creator_role,
                   (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id) as message_count,
                   (SELECT to_char(MAX(created_at), 'YYYY-MM-DD"T"HH24:MI:SS')
                    FROM messages WHERE conversation_id = c.id) as last_message_time
            FROM conversations c
            JOIN users u ON c.creator_id = u.emp_id
            WHERE c.creator_id = $4
                OR $4 = ANY(c.target_user_ids)
                OR (
                    c.target_user_ids IS NULL
                    AND (c.target_role = 'all' OR c.target_role = $1 OR (c.target_role = 'staff' AND $2 IN ('hod', 'principal', 'admin')))
                    AND (c.target_dept_id IS NULL OR c.target_dept_id = $3)
                )
            ORDER BY c.created_at DESC
        `;

        const { rows } = await pool.query(query, [req.user.role, req.user.role, req.user.department_id, req.user.emp_id]);
        res.json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Get messages for a conversation
// @route   GET /api/conversations/:id/messages
// @access  Private
exports.getMessages = async (req, res) => {
    try {
        const { rows } = await pool.query(`
            SELECT m.id, m.conversation_id, m.sender_id, m.content,
                   to_char(m.created_at, 'YYYY-MM-DD"T"HH24:MI:SS') as created_at,
                   u.name as sender_name, u.profile_pic, u.role as sender_role
            FROM messages m
            JOIN users u ON m.sender_id = u.emp_id
            WHERE m.conversation_id = $1
            ORDER BY m.created_at ASC
        `, [req.params.id]);

        res.json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Send message in conversation
// @route   POST /api/conversations/:id/messages
// @access  Private
exports.sendMessage = async (req, res) => {
    const { content, client_timestamp } = req.body;
    const conversationId = req.params.id;

    try {
        // Use client timestamp if provided to match dashboard clock, otherwise use server time
        const insertQuery = client_timestamp
            ? 'INSERT INTO messages (conversation_id, sender_id, content, created_at) VALUES ($1, $2, $3, $4) RETURNING id'
            : 'INSERT INTO messages (conversation_id, sender_id, content) VALUES ($1, $2, $3) RETURNING id';
        
        const insertParams = client_timestamp
            ? [conversationId, req.user.emp_id, content, client_timestamp]
            : [conversationId, req.user.emp_id, content];

        const { rows: resultRows } = await pool.query(insertQuery, insertParams);

        const { rows: newMessageRows } = await pool.query(`
            SELECT m.id, m.conversation_id, m.sender_id, m.content,
                   to_char(m.created_at, 'YYYY-MM-DD"T"HH24:MI:SS') as created_at,
                   u.name as sender_name, u.role as sender_role, u.profile_pic
            FROM messages m
            JOIN users u ON m.sender_id = u.emp_id
            WHERE m.id = $1
        `, [resultRows[0].id]);

        // Real-time Emit via Socket
        const io = getIO(req);
        if (io) {
            // Emit to the conversation room for active chatters
            io.to(`conv_${conversationId}`).emit('new_message', newMessageRows[0]);
            
            // Also emit a general notification to participants so they see it even if not in the chat room
            const { rows: participants } = await pool.query(
                `SELECT creator_id, target_role, target_dept_id, target_user_ids FROM conversations WHERE id = $1`,
                [conversationId]
            );
            
            if (participants.length > 0) {
                const conv = participants[0];
                const senderId = req.user.emp_id;
                const senderName = req.user.name;

                // Simple Broad Notification for anyone interested (could be more targeted)
                // We emit a 'notification_received' payload so Header.jsx picks it up
                const msgNotif = {
                    id: Date.now(),
                    message: `New message from ${senderName}: ${content.substring(0, 50)}${content.length > 50 ? '...' : ''}`,
                    type: 'message',
                    metadata: { conversationId, messageId: newMessageRows[0].id },
                    created_at: new Date().toISOString()
                };

                // Emit to targeted users
                if (conv.target_user_ids) {
                    conv.target_user_ids.forEach(uid => {
                        if (uid !== senderId) io.to(uid).emit('notification_received', msgNotif);
                    });
                    // Also notify creator if sender is not creator
                    if (conv.creator_id !== senderId) io.to(conv.creator_id).emit('notification_received', msgNotif);
                } else {
                    // Role or Dept based: Emit to all (Header handles filtering if needed, but better to target here)
                    // For now, emit globally but with a 'target' flag
                    io.emit('notification_received', { ...msgNotif, target_role: conv.target_role, target_dept: conv.target_dept_id, sender_id: senderId });
                }
            }
        }

        res.status(201).json(newMessageRows[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Update conversation title
// @route   PUT /api/conversations/:id
// @access  Private
exports.updateConversation = async (req, res) => {
    const { title } = req.body;
    try {
        const { rowCount } = await pool.query(
            'UPDATE conversations SET title = $1 WHERE id = $2 AND creator_id = $3',
            [title, req.params.id, req.user.emp_id]
        );
        if (rowCount === 0) return res.status(403).json({ message: 'Not authorized' });

        // Emit topic update
        const io = getIO(req);
        if (io) io.emit('update_topic', { id: parseInt(req.params.id), title });

        res.json({ message: 'Topic updated' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Delete conversation
// @route   DELETE /api/conversations/:id
// @access  Private
exports.deleteConversation = async (req, res) => {
    try {
        const { rowCount } = await pool.query(
            'DELETE FROM conversations WHERE id = $1 AND creator_id = $2',
            [req.params.id, req.user.emp_id]
        );
        if (rowCount === 0) return res.status(403).json({ message: 'Not authorized' });

        // Emit topic deletion
        const io = getIO(req);
        if (io) io.emit('delete_topic', parseInt(req.params.id));

        res.json({ message: 'Topic deleted' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Update message content
// @route   PUT /api/conversations/messages/:id
// @access  Private
exports.updateMessage = async (req, res) => {
    const { content, conversation_id } = req.body;
    try {
        const { rowCount } = await pool.query(
            'UPDATE messages SET content = $1 WHERE id = $2 AND sender_id = $3',
            [content, req.params.id, req.user.emp_id]
        );
        if (rowCount === 0) return res.status(403).json({ message: 'Not authorized' });

        // Emit message update
        const io = getIO(req);
        if (io) io.to(`conv_${conversation_id}`).emit('update_message', { id: parseInt(req.params.id), content, conversation_id: parseInt(conversation_id) });

        res.json({ message: 'Message updated' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Delete message
// @route   DELETE /api/conversations/messages/:id
// @access  Private
exports.deleteMessage = async (req, res) => {
    const { conversation_id } = req.query; // Pass as query param for delete
    try {
        const { rowCount } = await pool.query(
            'DELETE FROM messages WHERE id = $1 AND sender_id = $2',
            [req.params.id, req.user.emp_id]
        );
        if (rowCount === 0) return res.status(403).json({ message: 'Not authorized' });

        // Emit message deletion
        const io = getIO(req);
        if (io) io.to(`conv_${conversation_id}`).emit('delete_message', { id: parseInt(req.params.id), conversation_id: parseInt(conversation_id) });

        res.json({ message: 'Message deleted' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};
