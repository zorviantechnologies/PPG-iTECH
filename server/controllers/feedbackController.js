const { pool } = require('../config/db');

// @desc    Submit app feedback (sent to emp_id 5001 and 5045)
// @route   POST /api/feedback
// @access  Private
exports.submitFeedback = async (req, res) => {
    try {
        const fromEmpId = String(req.user?.emp_id || '').trim();
        const ratingRaw = String(req.body?.rating || '').trim().toLowerCase();
        const message = String(req.body?.message || '').trim();

        const ratingMap = {
            difficult: 'Difficult',
            good: 'Good',
            excellent: 'Excellent'
        };

        const rating = ratingMap[ratingRaw] || 'General';

        if (!fromEmpId) {
            return res.status(400).json({ message: 'Invalid sender employee id.' });
        }
        if (!message) {
            return res.status(400).json({ message: 'Please enter your feedback message.' });
        }

        const recipients = ['5001', '5045'];
        for (const toEmpId of recipients) {
            await pool.query(
                `INSERT INTO feedback_messages (from_emp_id, to_emp_id, rating, message, submitted_by_role)
                 VALUES ($1, $2, $3, $4, $5)`,
                [fromEmpId, toEmpId, rating, message, req.user?.role || null]
            );
        }

        return res.status(201).json({ message: 'Feedback submitted successfully to 5001 and 5045.' });
    } catch (error) {
        console.error('submitFeedback error:', error);
        return res.status(500).json({ message: 'Failed to submit feedback.' });
    }
};

// @desc    Get all feedbacks sent to emp_id 5001 / 5045
// @route   GET /api/feedback/inbox
// @access  Private (emp_id 5001 / 5045 only)
exports.getFeedbackInbox = async (req, res) => {
    try {
        const requesterEmpId = String(req.user?.emp_id || '').trim();
        if (!['5001', '5045'].includes(requesterEmpId)) {
            return res.status(403).json({ message: 'Only employee 5001 or 5045 can view feedback inbox.' });
        }

        const { rows } = await pool.query(
            `SELECT f.id,
                    f.from_emp_id,
                    f.to_emp_id,
                    f.rating,
                    f.message,
                    f.submitted_by_role,
                    f.created_at,
                    u.name AS from_name,
                    u.department_id,
                    d.name AS department_name,
                    u.designation
             FROM feedback_messages f
             LEFT JOIN users u ON TRIM(u.emp_id) = TRIM(f.from_emp_id)
             LEFT JOIN departments d ON d.id = u.department_id
               WHERE TRIM(f.to_emp_id) = TRIM($1)
             ORDER BY f.created_at DESC`
              , [requesterEmpId]
        );

        return res.json(rows);
    } catch (error) {
        console.error('getFeedbackInbox error:', error);
        return res.status(500).json({ message: 'Failed to load feedback inbox.' });
    }
};

// @desc    Delete a single feedback from inbox
// @route   DELETE /api/feedback/:id
// @access  Private (emp_id 5001 / 5045 only)
exports.deleteFeedback = async (req, res) => {
    try {
        const requesterEmpId = String(req.user?.emp_id || '').trim();
        if (!['5001', '5045'].includes(requesterEmpId)) {
            return res.status(403).json({ message: 'Only employee 5001 or 5045 can delete feedback.' });
        }

        const feedbackId = Number(req.params?.id);
        if (!Number.isInteger(feedbackId) || feedbackId <= 0) {
            return res.status(400).json({ message: 'Invalid feedback id.' });
        }

        const { rowCount } = await pool.query(
            `DELETE FROM feedback_messages
             WHERE id = $1 AND TRIM(to_emp_id) = TRIM($2)`,
            [feedbackId, requesterEmpId]
        );

        if (rowCount === 0) {
            return res.status(404).json({ message: 'Feedback not found in your inbox.' });
        }

        return res.json({ message: 'Feedback deleted successfully.' });
    } catch (error) {
        console.error('deleteFeedback error:', error);
        return res.status(500).json({ message: 'Failed to delete feedback.' });
    }
};

// @desc    Delete selected feedbacks from inbox
// @route   DELETE /api/feedback
// @access  Private (emp_id 5001 / 5045 only)
exports.bulkDeleteFeedback = async (req, res) => {
    try {
        const requesterEmpId = String(req.user?.emp_id || '').trim();
        if (!['5001', '5045'].includes(requesterEmpId)) {
            return res.status(403).json({ message: 'Only employee 5001 or 5045 can delete feedback.' });
        }

        const rawIds = Array.isArray(req.body?.ids) ? req.body.ids : [];
        const ids = rawIds
            .map((id) => Number(id))
            .filter((id) => Number.isInteger(id) && id > 0);

        if (!ids.length) {
            return res.status(400).json({ message: 'Please provide at least one valid feedback id.' });
        }

        const uniqueIds = [...new Set(ids)];
        const { rowCount } = await pool.query(
            `DELETE FROM feedback_messages
             WHERE id = ANY($1::int[]) AND TRIM(to_emp_id) = TRIM($2)`,
            [uniqueIds, requesterEmpId]
        );

        return res.json({
            message: rowCount > 0 ? 'Selected feedback deleted successfully.' : 'No matching feedback found in your inbox.',
            deletedCount: rowCount
        });
    } catch (error) {
        console.error('bulkDeleteFeedback error:', error);
        return res.status(500).json({ message: 'Failed to delete selected feedback.' });
    }
};
