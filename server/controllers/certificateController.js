const { pool } = require('../config/db');

// @desc    Upload a certificate for an employee
// @route   POST /api/certificates/:userId
// @access  Private (Admin or Self)
exports.uploadCertificate = async (req, res) => {
    try {
        const { userId } = req.params;

        // Allow admin to upload for anyone, others can only upload for themselves
        if (req.user.role !== 'admin' && String(req.user.id) !== String(userId)) {
            return res.status(403).json({ message: 'You can only upload certificates for your own profile' });
        }

        const { certificate_name, file_name, file_type, file_data } = req.body;

        if (!certificate_name || !file_name || !file_type || !file_data) {
            return res.status(400).json({ message: 'All fields are required' });
        }

        const { rows } = await pool.query(
            `INSERT INTO certificates (user_id, certificate_name, file_name, file_type, file_data)
             VALUES ($1, $2, $3, $4, $5) RETURNING id, certificate_name, file_name, file_type, created_at`,
            [userId, certificate_name, file_name, file_type, file_data]
        );

        res.status(201).json(rows[0]);
    } catch (error) {
        console.error('UPLOAD CERTIFICATE ERROR:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Get all certificates for an employee
// @route   GET /api/certificates/:userId
// @access  Private (Admin, Principal, HOD, Self)
exports.getCertificates = async (req, res) => {
    try {
        const { userId } = req.params;

        const { rows } = await pool.query(
            `SELECT id, certificate_name, file_name, file_type, created_at
             FROM certificates WHERE user_id = $1 ORDER BY created_at DESC`,
            [userId]
        );

        res.json(rows);
    } catch (error) {
        console.error('GET CERTIFICATES ERROR:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Download/view a specific certificate
// @route   GET /api/certificates/file/:certId
// @access  Private
exports.getCertificateFile = async (req, res) => {
    try {
        const { certId } = req.params;

        const { rows } = await pool.query(
            `SELECT file_data, file_name, file_type FROM certificates WHERE id = $1`,
            [certId]
        );

        if (rows.length === 0) {
            return res.status(404).json({ message: 'Certificate not found' });
        }

        res.json(rows[0]);
    } catch (error) {
        console.error('GET CERTIFICATE FILE ERROR:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Delete a certificate
// @route   DELETE /api/certificates/:certId
// @access  Private (Admin or Owner)
exports.deleteCertificate = async (req, res) => {
    try {
        const { certId } = req.params;

        // Check ownership: admin can delete any, others can only delete their own
        if (req.user.role !== 'admin') {
            const { rows: certRows } = await pool.query(
                'SELECT user_id FROM certificates WHERE id = $1',
                [certId]
            );
            if (certRows.length === 0) {
                return res.status(404).json({ message: 'Certificate not found' });
            }
            if (String(certRows[0].user_id) !== String(req.user.id)) {
                return res.status(403).json({ message: 'You can only delete your own certificates' });
            }
        }

        const { rowCount } = await pool.query(
            'DELETE FROM certificates WHERE id = $1',
            [certId]
        );

        if (rowCount === 0) {
            return res.status(404).json({ message: 'Certificate not found' });
        }

        res.json({ message: 'Certificate deleted successfully' });
    } catch (error) {
        console.error('DELETE CERTIFICATE ERROR:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};
