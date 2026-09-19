const { pool } = require('../config/db');

// @desc    Get all period configs
// @route   GET /api/timetable-config
exports.getTimetableConfig = async (req, res) => {
    try {
        const { rows } = await pool.query(
            'SELECT * FROM timetable_config ORDER BY sort_order ASC'
        );
        res.json(rows);
    } catch (error) {
        console.error('getTimetableConfig ERROR:', error);
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

// @desc    Save full timetable config (admin only)
// @route   PUT /api/timetable-config
exports.saveTimetableConfig = async (req, res) => {
    const { periods } = req.body;
    if (!Array.isArray(periods)) {
        return res.status(400).json({ message: 'Periods array is required.' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Clear existing config and replace with new one (simpler than complex upserts for ordered lists)
        await client.query('DELETE FROM timetable_config');

        for (const p of periods) {
            const pNum = p.is_break ? null : parseInt(p.period_number, 10);
            await client.query(`
                INSERT INTO timetable_config (sort_order, period_number, label, start_time, end_time, is_break)
                VALUES ($1, $2, $3, $4, $5, $6)
            `, [
                parseInt(p.sort_order),
                pNum,
                p.label,
                p.start_time || null,
                p.end_time || null,
                p.is_break || false
            ]);

            // Sync period times into existing class timetable entries for matching period_number
            if (!p.is_break && pNum && p.start_time && p.end_time) {
                await client.query(`
                    UPDATE timetable 
                    SET start_time = $1, end_time = $2 
                    WHERE period_number = $3
                `, [p.start_time, p.end_time, pNum]);
            }
        }

        await client.query('COMMIT');
        res.json({ message: 'Timetable configuration saved successfully.' });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('saveTimetableConfig ERROR:', error);
        res.status(500).json({ message: 'Server Error', error: error.message });
    } finally {
        client.release();
    }
};
