const { Pool, types } = require('pg');
const dotenv = require('dotenv');

dotenv.config();

// Prevent pg from converting DATE columns to JS Date objects (which shifts timezone).
// Return DATE values as plain 'YYYY-MM-DD' strings so they stay accurate.
types.setTypeParser(1082, (val) => val);

const normalizeFlag = (value) => String(value || '').trim().toLowerCase();
const sslFlag = normalizeFlag(process.env.DB_SSL || process.env.PGSSLMODE);
const connectionString = String(process.env.DATABASE_URL || '').trim();
const host = String(process.env.DB_HOST || '').toLowerCase();
let hostFromConnectionString = '';

if (connectionString) {
    try {
        const url = new URL(connectionString);
        hostFromConnectionString = String(url.hostname || '').toLowerCase();
    } catch (error) {
        console.warn('Invalid DATABASE_URL format. Falling back to DB_HOST/DB_* variables.');
    }
}

const resolvedHost = hostFromConnectionString || host;
const sslDisabled = ['0', 'false', 'no', 'disable'].includes(sslFlag);
const sslEnabledByFlag = ['1', 'true', 'yes', 'require', 'verify-ca', 'verify-full'].includes(sslFlag);
const sslEnabledByHost = resolvedHost.includes('supabase.co') || resolvedHost.includes('neon.tech') || resolvedHost.includes('render.com');
const useSsl = !sslDisabled && (sslEnabledByFlag || (!sslFlag && sslEnabledByHost));

// STRICT POOL LIMITS: Supabase/Render free/session mode have very low limits (often 10 total).
// We set max: 3 to ensure we don't hit "Max clients reached" easily as requested.
const poolMax = 3;

const poolConfig = {
    connectionString,
    ssl: useSsl ? { rejectUnauthorized: false } : false,
    max: poolMax,
    idleTimeoutMillis: 30000,     // Close idle clients after 30s to free up slots
    connectionTimeoutMillis: 2000, // Fast fail if no connection available (prevent hanging)
    keepAlive: true,
};

if (!connectionString) {
    delete poolConfig.connectionString;
    poolConfig.host = process.env.DB_HOST;
    poolConfig.user = process.env.DB_USER;
    poolConfig.password = process.env.DB_PASSWORD;
    poolConfig.database = process.env.DB_NAME;
    poolConfig.port = process.env.DB_PORT || 5432;
}

// Create a single shared pool instance
const pool = new Pool(poolConfig);

// SIMPLE LOGGING TO TRACK CONNECTION USAGE
pool.on('connect', (client) => {
    // console.log(`[DB] New client connected to pool. Total clients: ${pool.totalCount}, Idle: ${pool.idleCount}`);
});

pool.on('acquire', (client) => {
    // console.log(`[DB] Client acquired from pool. Total clients: ${pool.totalCount}, Idle: ${pool.idleCount}`);
});

pool.on('remove', (client) => {
    console.log(`[DB] Client removed from pool. Total clients: ${pool.totalCount}`);
});

/**
 * Checks if a DB error is "retryable" (transient network or load issue).
 */
const isRetryableDbError = (error) => {
    if (!error) return false;
    const code = String(error.code || '').toUpperCase();
    const msg = String(error.message || '').toLowerCase();
    
    return (
        [
            'ECONNREFUSED',
            'ETIMEDOUT',
            'ENOTFOUND',
            'EAI_AGAIN',
            '57P01', // admin_shutdown
            '57P03', // cannot_connect_now
            '53300', // too_many_connections
            '53400', // configuration_limit_exceeded
            'XX000', // internal_error
        ].includes(code) ||
        msg.includes('connection terminated') ||
        msg.includes('connection timeout') ||
        msg.includes('max clients reached') ||
        msg.includes('maxclientsinsessionmode') ||
        msg.includes('too many clients') ||
        msg.includes('terminating connection') ||
        msg.includes('database system is starting up')
    );
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Executes a query with built-in retry logic for transient database errors.
 * Use this for most queries to ensure stability.
 */
const queryWithRetry = async (text, params = [], options = {}) => {
    const maxRetries = options.retries !== undefined ? options.retries : 3;
    const delayMs = options.retryDelayMs || 500;

    let lastError;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            // Using pool.query directly is the safest way to ensure connection release
            return await pool.query(text, params);
        } catch (error) {
            lastError = error;
            if (attempt < maxRetries && isRetryableDbError(error)) {
                console.warn(`[DB RETRY] Query failed (attempt ${attempt + 1}/${maxRetries + 1}): ${error.message}`);
                await sleep(delayMs * (attempt + 1));
                continue;
            }
            throw error;
        }
    }
    throw lastError;
};

/**
 * Helper to safely handle a dedicated client from the pool.
 * Use this for transactions or when multiple queries must use the same connection.
 */
const withDbClient = async (handler) => {
    let client;
    let attempt = 0;
    const maxRetries = 2;

    while (attempt <= maxRetries) {
        try {
            client = await pool.connect();
            break;
        } catch (error) {
            if (attempt < maxRetries && isRetryableDbError(error)) {
                attempt++;
                await sleep(500 * attempt);
                continue;
            }
            throw error;
        }
    }

    try {
        return await handler(client);
    } finally {
        if (client) client.release();
    }
};

const connectDB = async () => {
    try {
        await queryWithRetry('SELECT 1');
        console.log('PostgreSQL Database Connected Successfully (Max Pool: ' + poolMax + ')');
    } catch (error) {
        console.error('CRITICAL: Database Connection Failed:', error.message);
    }
};

// Listen for pool errors to prevent process exit
pool.on('error', (err) => {
    console.error('Unexpected error on idle client:', err.message);
});

module.exports = { 
    pool, 
    poolConfig, 
    connectDB, 
    queryWithRetry, 
    withDbClient, 
    isRetryableDbError 
};


