const { pool } = require('../config/db');
const { createNotification } = require('./notificationController');

// @desc    Create purchase request
// @route   POST /api/purchases
// @access  Private (Staff, HOD, Principal)
// WORKFLOW:
// - Staff: Creates request with status "Pending" → Notifies HOD for approval
// - HOD: Creates request with status "Approved_HOD" → Notifies Principal for approval
// - Principal: Creates request with status "Approved_Principal" → DIRECTLY to Admin (NO approval needed) ✓
exports.createPurchaseRequest = async (req, res) => {
    const { item_name, quantity, unit, specifications, estimated_cost } = req.body;

    try {
        let status = 'Pending';
        let notifyRole = 'hod';
        let notifyMsg = `New purchase request for ${item_name} from ${req.user.name}.`;

        if (req.user.role === 'hod') {
            status = 'Approved_HOD';
            notifyRole = 'principal';
            notifyMsg = `New purchase request for ${item_name} from HOD ${req.user.name}. Awaiting your approval.`;
        } else if (req.user.role === 'principal') {
            // Principal requests BYPASS all approvals and go directly to Admin
            status = 'Approved_Principal';
            notifyRole = 'admin';
            notifyMsg = `New purchase request for ${item_name} from Principal. Ready for procurement.`;
        }

        const query = `
            INSERT INTO purchases (
                emp_id, item_name, quantity, unit, status
            ) VALUES ($1, $2, $3, $4, $5)
            RETURNING id
        `;

        const { rows: purchaseRows } = await pool.query(query, [req.user.emp_id, item_name, quantity, unit || 'piece', status]);
        const purchaseId = purchaseRows[0].id;

        // Notify appropriate person based on role
        let notifyId = null;
        if (notifyRole === 'hod') {
            const { rows } = await pool.query('SELECT emp_id FROM users WHERE department_id = $1 AND role = \'hod\'', [req.user.department_id]);
            if (rows.length > 0) notifyId = rows[0].emp_id;
        } else {
            const { rows } = await pool.query('SELECT emp_id FROM users WHERE role = $1 LIMIT 1', [notifyRole]);
            if (rows.length > 0) notifyId = rows[0].emp_id;
        }

        if (notifyId) {
            await createNotification(notifyId, notifyMsg, 'purchase', { purchaseId });
        }

        res.status(201).json({ message: `Purchase request submitted with status: ${status}` });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Get purchase requests
// @route   GET /api/purchases
// @access  Private
exports.getPurchaseRequests = async (req, res) => {
    try {
        let query = `
            SELECT p.*, u.name as applicant_name, d.name as department_name
            FROM purchases p
            JOIN users u ON p.emp_id = u.emp_id
            LEFT JOIN departments d ON u.department_id = d.id
            WHERE 1=1
        `;
        const params = [];

        if (req.user.role === 'staff') {
            query += ' AND p.emp_id = $1';
            params.push(req.user.emp_id);
        } else if (req.user.role === 'hod') {
            // HOD sees their department's requests
            query += ' AND (u.department_id = $1 OR p.emp_id = $2)';
            params.push(req.user.department_id, req.user.emp_id);
        }

        query += ' ORDER BY p.created_at DESC';

        const { rows } = await pool.query(query, params);
        res.json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Update purchase status (Approval Chain)
// @route   PUT /api/purchases/:id/status
// @access  Private
exports.updatePurchaseStatus = async (req, res) => {
    const { status } = req.body; // Approved or Rejected
    const purchaseId = req.params.id;
    const userRole = req.user.role;

    try {
        const { rows: purchaseRows } = await pool.query(`
            SELECT p.*, u.name, u.emp_id as applicant_id, u.department_id 
            FROM purchases p 
            JOIN users u ON p.emp_id = u.emp_id 
            WHERE p.id = $1
        `, [purchaseId]);

        if (purchaseRows.length === 0) return res.status(404).json({ message: 'Request not found' });
        const p = purchaseRows[0];

        let nextStatus = '';
        let notifyId = '';
        let notifyMsg = '';

        if (status === 'Rejected') {
            nextStatus = 'Rejected';
            notifyId = p.applicant_id;
            notifyMsg = `Your purchase request for ${p.item_name} has been REJECTED by ${req.user.name}.`;
        } else {
            // Approval Escalation
            if (userRole === 'hod' && p.status === 'Pending') {
                nextStatus = 'Approved_HOD';
                // Notify Principal
                const { rows: principalRows } = await pool.query('SELECT emp_id FROM users WHERE role = \'principal\' LIMIT 1');
                if (principalRows.length > 0) {
                    notifyId = principalRows[0].emp_id;
                    notifyMsg = `Purchase request for ${p.item_name} from ${p.name} has been ACCEPTED by HOD. Needs your Principal approval.`;
                }
            }
            else if (userRole === 'principal' && p.status === 'Approved_HOD') {
                nextStatus = 'Approved_Principal';
                // Notify Admin
                const { rows: adminRows } = await pool.query('SELECT emp_id FROM users WHERE role = \'admin\' LIMIT 1');
                if (adminRows.length > 0) {
                    notifyId = adminRows[0].emp_id;
                    notifyMsg = `New Purchase Request for ${p.item_name} (Principal Accepted). Ready for procurement viewing.`;
                }
            }
            else if (userRole === 'admin' && (p.status === 'Approved_Principal' || p.status === 'Approved_Admin')) {
                // Admin can only move to 'Purchased' (completion), they don't have "Reject" or "Accept" (it's already accepted)
                nextStatus = 'Purchased';
                notifyId = p.applicant_id;
                notifyMsg = `Your purchase request for ${p.item_name} has been COMPLETED/PURCHASED.`;
            } else {
                return res.status(403).json({ message: 'You are not authorized to perform actions at this stage.' });
            }
        }

        await pool.query('UPDATE purchases SET status = $1 WHERE id = $2', [nextStatus, purchaseId]);

        if (notifyId) {
            await createNotification(notifyId, notifyMsg, 'purchase', { purchaseId });
        }

        res.json({ message: `Purchase request moved to ${nextStatus}` });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Delete purchase request
// @route   DELETE /api/purchases/:id
// @access  Private
exports.deletePurchaseRequest = async (req, res) => {
    try {
        const { id } = req.params;
        const { emp_id, role } = req.user;

        // Check if request exists and if user is authorized to delete it
        const { rows } = await pool.query('SELECT * FROM purchases WHERE id = $1', [id]);

        if (rows.length === 0) {
            return res.status(404).json({ message: 'Purchase request not found' });
        }

        const request = rows[0];

        // Only the applicant or an admin can delete the request
        if (request.emp_id !== emp_id && role !== 'admin') {
            return res.status(403).json({ message: 'Not authorized to delete this request' });
        }

        // Only allow deletion if it's still pending (optional but recommended for logic)
        // If the user wants to be able to delete anyway, we can remove this check.
        // The user said "user can delete the leave request" and "also add delete button in purchase request user csn delete the request".
        // I will allow deletion if it's not already completed/purchased.
        if (request.status === 'Purchased' && role !== 'admin') {
            return res.status(400).json({ message: 'Cannot delete a completed purchase request' });
        }

        await pool.query('DELETE FROM purchases WHERE id = $1', [id]);

        res.json({ message: 'Purchase request deleted successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};
