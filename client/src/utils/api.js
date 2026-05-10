import axios from 'axios';
import { encryptPayload } from './crypto';

const normalizeApiBase = (rawBase) => {
    const base = String(rawBase || '').trim().replace(/\/+$/, '');
    if (!base) return '/api';
    if (base.endsWith('/api')) return base;
    return `${base}/api`;
};

const api = axios.create({
    baseURL: normalizeApiBase(import.meta.env.VITE_API_URL),
});

// Add a request interceptor: attach token and AES-GCM encrypt JSON bodies
api.interceptors.request.use(
    async (config) => {
        const token = localStorage.getItem('token');
        if (token) {
            config.headers = config.headers || {};
            config.headers.Authorization = `Bearer ${token}`;
        }

        // Only encrypt for mutating requests and when explicit opt-out header is not set
        const method = (config.method || '').toLowerCase();
        const isFormData = typeof FormData !== 'undefined' && config.data instanceof FormData;
        if (['post', 'put', 'patch', 'delete'].includes(method) && !config.headers['X-Disable-Encrypt'] && !isFormData) {
            try {
                const encrypted = await encryptPayload(config.data || {});
                // Replace payload with encrypted object and mark header
                config.data = encrypted;
                config.headers['X-Encrypted'] = '1';
                config.headers['Content-Type'] = 'application/json';
            } catch (err) {
                // If encryption fails, reject the request
                return Promise.reject(err);
            }
        }

        // Ensure multipart uploads are sent as-is for server-side multer parsing.
        if (isFormData) {
            if (config.headers['X-Encrypted']) delete config.headers['X-Encrypted'];
            if (config.headers['Content-Type']) delete config.headers['Content-Type'];
        }

        return config;
    },
    (error) => Promise.reject(error)
);

export default api;
