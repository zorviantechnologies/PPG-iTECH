const { pool } = require('../config/db');

exports.getSettings = async (req, res) => {
    try {
        const { rows } = await pool.query('SELECT key, value FROM app_settings');
        const settings = {};
        rows.forEach(r => settings[r.key] = r.value);
        res.json(settings);
    } catch (error) {
        console.error('getSettings ERROR:', error);
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

exports.updateSetting = async (req, res) => {
    try {
        const { key } = req.params;
        const { value } = req.body;
        
        await pool.query(`
            INSERT INTO app_settings (key, value)
            VALUES ($1, $2)
            ON CONFLICT (key) DO UPDATE SET value = $2
        `, [key, value]);
        
        res.json({ message: 'Setting updated successfully' });
    } catch (error) {
        console.error('updateSetting ERROR:', error);
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};
