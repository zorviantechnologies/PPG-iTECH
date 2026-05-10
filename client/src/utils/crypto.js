// AES-256-GCM encryption helper for frontend
// Reads base64 key from VITE_API_ENC_KEY (set at build time). Exports encryptPayload(obj)

function b64ToBuf(b64) {
    return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
}

function bufToB64(buf) {
    let binary = '';
    const bytes = new Uint8Array(buf);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
}

async function getKey() {
    const b64 = import.meta.env.VITE_API_ENC_KEY;
    if (!b64) throw new Error('VITE_API_ENC_KEY not configured');
    const raw = b64ToBuf(b64);
    if (raw.length !== 32) throw new Error('VITE_API_ENC_KEY must be 32 bytes (base64-encoded)');
    return await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt']);
}

export async function encryptPayload(obj) {
    const key = await getKey();
    const iv = crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV for GCM
    const data = new TextEncoder().encode(JSON.stringify(obj || {}));
    const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, tagLength: 128 }, key, data);

    // encrypted is ciphertext + tag (in WebCrypto it's combined). We'll split tag (16 bytes)
    const encBuf = new Uint8Array(encrypted);
    const tagLen = 16;
    const tag = encBuf.slice(encBuf.length - tagLen);
    const cipher = encBuf.slice(0, encBuf.length - tagLen);

    return {
        enc: 1,
        iv: bufToB64(iv.buffer),
        cipher: bufToB64(cipher.buffer),
        tag: bufToB64(tag.buffer),
    };
}

export default { encryptPayload };
