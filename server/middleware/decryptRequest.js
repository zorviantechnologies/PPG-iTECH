const crypto = require('crypto');

// Expect incoming encrypted JSON body like: { enc:1, iv: 'base64', cipher: 'base64', tag: 'base64' }
// Server env: API_ENC_KEY should be base64-encoded 32-byte key

function b64ToBuf(b64) {
    return Buffer.from(b64, 'base64');
}

module.exports = function decryptRequest(req, res, next) {
    try {
        // Only attempt decryption when header set or payload signals encryption
        const isEncryptedHeader = (req.headers['x-encrypted'] || '') === '1';
        const body = req.body;
        if (!isEncryptedHeader && !(body && body.enc)) {
            return next();
        }

        if (!process.env.API_ENC_KEY) {
            console.error('API_ENC_KEY not configured on server');
            return res.status(500).json({ error: 'Server encryption not configured' });
        }

        if (!body || !body.iv || !body.cipher || !body.tag) {
            return res.status(400).json({ error: 'Malformed encrypted payload' });
        }

        const key = b64ToBuf(process.env.API_ENC_KEY);
        if (key.length !== 32) {
            console.error('API_ENC_KEY has invalid length');
            return res.status(500).json({ error: 'Server encryption key invalid' });
        }

        const iv = b64ToBuf(body.iv);
        const cipher = b64ToBuf(body.cipher);
        const tag = b64ToBuf(body.tag);

        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(tag);

        let decrypted = decipher.update(cipher);
        decrypted = Buffer.concat([decrypted, decipher.final()]);

        // Parse JSON and replace req.body
        const parsed = JSON.parse(decrypted.toString('utf8'));

        // In non-production, log a masked version of the decrypted payload to help debugging
        if (process.env.NODE_ENV !== 'production') {
            try {
                const masked = Object.assign({}, parsed);
                if (masked.pin) masked.pin = '***';
                if (masked.password) masked.password = '***';
                console.log(`Decrypted payload for ${req.method} ${req.originalUrl}:`, masked);
            } catch (e) { /* ignore logging errors */ }
        }

        // Basic sanity check: ensure parsed is object
        if (!parsed || typeof parsed !== 'object') {
            console.error('Decrypted payload not an object');
            return res.status(400).json({ error: 'Decryption resulted in invalid payload' });
        }

        req.body = parsed;
        return next();
    } catch (err) {
        console.error('Decryption failed:', err && err.message ? err.message : err);
        // If configured, allow plaintext fallback for legacy clients
        if (process.env.ALLOW_PLAINTEXT_FALLBACK === '1') {
            console.warn('ALLOW_PLAINTEXT_FALLBACK enabled - proceeding with original request body');
            return next();
        }
        return res.status(400).json({ error: 'Decryption failed - possible key mismatch or malformed payload' });
    }
};
