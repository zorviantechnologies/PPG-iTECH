const { pool } = require('../config/db');

// @desc    Get all holidays for a specific month/year
// @route   GET /api/holidays
exports.getHolidays = async (req, res) => {
    try {
        const { month, year } = req.query;
        let query = 'SELECT id, TO_CHAR(h_date, \'YYYY-MM-DD\') as h_date, caption, type FROM holidays';
        const params = [];

        if (month && year) {
            query += ' WHERE EXTRACT(MONTH FROM h_date) = $1 AND EXTRACT(YEAR FROM h_date) = $2';
            params.push(month, year);
        }

        const { rows } = await pool.query(query, params);
        res.json(rows);
    } catch (error) {
        console.error('getHolidays Error:', error);
        res.status(500).json({ message: 'Server Error fetching holidays' });
    }
};

// @desc    Toggle holiday status or update caption
// @route   POST /api/holidays
exports.updateHoliday = async (req, res) => {
    const { date, caption, type } = req.body;

    console.log('Received holiday update request:', req.body);

    if (!date) {
        console.warn('Update failed: Missing date');
        return res.status(400).json({ message: 'Missing required field: date' });
    }

    try {
        // Use UPSERT logic
        const query = `
            INSERT INTO holidays (h_date, caption, type)
            VALUES ($1, $2, $3)
            ON CONFLICT (h_date) DO UPDATE SET
            caption = EXCLUDED.caption,
            type = EXCLUDED.type
        `;

        const { rowCount } = await pool.query(query, [date, caption || 'Holiday', type || 'Holiday']);
        console.log('Update query result rowCount:', rowCount);

        const io = req.app.get('io');
        if (io) {
            io.emit('calendar_updated', {
                action: 'upsert',
                date,
                type: type || 'Holiday',
                caption: caption || 'Holiday'
            });
        }

        res.json({ message: 'Holiday updated successfully' });
    } catch (error) {
        console.error('CRITICAL: updateHoliday Error:', {
            message: error.message,
            sql: error.sql,
            sqlMessage: error.sqlMessage,
            stack: error.stack
        });
        res.status(500).json({
            message: 'Server Error updating holiday',
            error: error.message,
            sqlMessage: error.sqlMessage
        });
    }
};

// @desc    Delete a holiday record (revert to working day)
// @route   DELETE /api/holidays/:date
exports.deleteHoliday = async (req, res) => {
    try {
        await pool.query('DELETE FROM holidays WHERE h_date = $1', [req.params.date]);

        const io = req.app.get('io');
        if (io) {
            io.emit('calendar_updated', {
                action: 'delete',
                date: req.params.date
            });
        }

        res.json({ message: 'Holiday removed' });
    } catch (error) {
        console.error('deleteHoliday Error:', error);
        res.status(500).json({ message: 'Server Error removing holiday' });
    }
};
