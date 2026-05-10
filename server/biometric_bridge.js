const ZKLib = require('zkteco-js');
const axios = require('axios');
const https = require('https');
require('dotenv').config();

/**
 * Realtime-only biometric bridge for ZKTeco/eSSL devices.
 * - No periodic getAttendances polling
 * - Realtime callback only enqueues punches
 * - Background worker drains queue in batches with retry/backoff
 */

const DEVICE_IP = process.env.BIOMETRIC_DEVICE_IP || '172.16.107.81';
const DEVICE_PORT = Number(process.env.BIOMETRIC_DEVICE_PORT || 4370);
const DEVICE_ID = process.env.BIOMETRIC_DEVICE_ID || 'MAIN_DEVICE_01';
const SERVER_API_URL =
  process.env.SERVER_API_BIOMETRIC_URL ||
  `http://localhost:${process.env.PORT || 5000}/api/biometric/log`;

const BATCH_SIZE = Math.max(1, Number(process.env.BIOMETRIC_QUEUE_BATCH_SIZE || 20));
const BATCH_INTERVAL_MS = Math.max(200, Number(process.env.BIOMETRIC_QUEUE_INTERVAL_MS || 1000));
const SEND_CONCURRENCY = Math.max(1, Number(process.env.BIOMETRIC_SEND_CONCURRENCY || 5));
const KEEP_ALIVE_MS = Math.max(30000, Number(process.env.BIOMETRIC_KEEP_ALIVE_MS || 45000));
const ALLOW_IDLE_RECONNECT = String(process.env.BIOMETRIC_IDLE_RECONNECT || '0').trim() === '1';
const RETRY_BASE_MS = Math.max(250, Number(process.env.BIOMETRIC_RETRY_BASE_MS || 1000));
const RETRY_MAX_MS = Math.max(5000, Number(process.env.BIOMETRIC_RETRY_MAX_MS || 60000));
const RECENT_SEEN_MAX = Math.max(1000, Number(process.env.BIOMETRIC_RECENT_SEEN_MAX || 5000));

const makeAxiosOptions = () => {
  const options = { timeout: 10000 };
  if (process.env.DISABLE_TLS_VERIFY === '1') {
    options.httpsAgent = new https.Agent({ rejectUnauthorized: false });
  }
  return options;
};

const safeParseDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

const normalizePunchType = (rawType, dateRef) => {
  const val = String(rawType ?? '').trim().toUpperCase();
  if (val === 'IN' || val === '0') return 'IN';
  if (val === 'OUT' || val === '1') return 'OUT';
  const dt = safeParseDate(dateRef) || new Date();
  return dt.getHours() < 12 ? 'IN' : 'OUT';
};

const buildPunchKey = (empId, timestampIso) =>
  `${String(empId || '').trim()}|${String(timestampIso || '').trim()}`;

const unwrapError = (err) => {
  const candidates = [
    err,
    err?.err,
    err?.err?.err,
    err?.error,
    err?.cause,
    err?.cause?.err,
  ].filter(Boolean);

  const core =
    candidates.find((c) => c instanceof Error) ||
    candidates.find((c) => typeof c?.message === 'string' || typeof c?.code === 'string') ||
    err;

  return {
    message: core?.message,
    code: core?.code,
    errno: core?.errno,
    syscall: core?.syscall,
    address: core?.address,
    port: core?.port,
    stack: core?.stack,
  };
};

const isLikelyDeviceError = (err) => {
  const details = unwrapError(err);
  const code = String(details?.code || '').toUpperCase();
  const msg = String(details?.message || '').toLowerCase();
  return (
    ['ETIMEDOUT', 'ECONNREFUSED', 'EHOSTUNREACH', 'ENETUNREACH', 'ECONNRESET'].includes(code) ||
    msg.includes('timeout') ||
    msg.includes('timed out') ||
    msg.includes('socket') ||
    msg.includes('connect')
  );
};

class BridgeRuntime {
  constructor() {
    this.zkInstance = null;
    this.reconnectTimer = null;
    this.keepAliveTimer = null;
    this.batchTimer = null;
    this.reconnectScheduled = false;
    this.processing = false;
    this.lastRealtimeAt = 0;

    this.queue = [];
    this.queuedKeys = new Set();
    this.recentKeys = new Set();
    this.recentOrder = [];
  }

  rememberRecent(key) {
    if (!key || this.recentKeys.has(key)) return;
    this.recentKeys.add(key);
    this.recentOrder.push(key);
    while (this.recentOrder.length > RECENT_SEEN_MAX) {
      const old = this.recentOrder.shift();
      if (old) this.recentKeys.delete(old);
    }
  }

  enqueueRealtime(data) {
    const empId = String(data?.userId ?? data?.deviceUserId ?? data?.uid ?? '').trim();
    if (!empId) return;

    const dt = safeParseDate(data?.recordTime ?? data?.timestamp ?? data?.time) || new Date();
    const timestampIso = dt.toISOString();
    const dedupeKey = buildPunchKey(empId, timestampIso);

    if (this.recentKeys.has(dedupeKey) || this.queuedKeys.has(dedupeKey)) {
      return;
    }

    this.queue.push({
      dedupeKey,
      payload: {
        emp_id: empId,
        device_id: DEVICE_ID,
        timestamp: timestampIso,
        type: normalizePunchType(data?.type ?? data?.state ?? data?.status ?? data?.punch, dt),
        raw: { source: 'realtime', data },
      },
      attempt: 0,
      nextAttemptAt: Date.now(),
      enqueuedAt: Date.now(),
    });

    this.queuedKeys.add(dedupeKey);
    this.lastRealtimeAt = Date.now();
    console.log(
      `[${new Date().toLocaleTimeString()}] 🔔 Enqueued realtime punch emp_id=${empId}. queue=${this.queue.length}`
    );
  }

  async postPunch(item) {
    await axios.post(SERVER_API_URL, item.payload, makeAxiosOptions());
  }

  async processBatch() {
    if (this.processing || this.queue.length === 0) return;
    this.processing = true;

    try {
      const now = Date.now();
      const eligible = [];

      for (let i = 0; i < this.queue.length && eligible.length < BATCH_SIZE; i += 1) {
        if (this.queue[i].nextAttemptAt <= now) {
          eligible.push(this.queue[i]);
        }
      }

      if (eligible.length === 0) return;

      for (let i = 0; i < eligible.length; i += SEND_CONCURRENCY) {
        const chunk = eligible.slice(i, i + SEND_CONCURRENCY);
        const settled = await Promise.allSettled(
          chunk.map(async (item) => {
            await this.postPunch(item);
            return item;
          })
        );

        for (let j = 0; j < settled.length; j += 1) {
          const item = chunk[j];
          const result = settled[j];

          if (result.status === 'fulfilled') {
            this.queue = this.queue.filter((q) => q !== item);
            this.queuedKeys.delete(item.dedupeKey);
            this.rememberRecent(item.dedupeKey);

            console.log(
              `[${new Date().toLocaleTimeString()}] ✅ Sent punch ${item.payload.emp_id} ${item.payload.timestamp}. queue=${this.queue.length}`
            );
            continue;
          }

          const err = result.reason || new Error('Unknown send error');
          item.attempt += 1;
          const backoff = Math.min(RETRY_BASE_MS * 2 ** (item.attempt - 1), RETRY_MAX_MS);
          item.nextAttemptAt = Date.now() + backoff;

          console.error(
            `[${new Date().toLocaleTimeString()}] ⚠️ Send failed (attempt ${item.attempt}) emp_id=${item.payload.emp_id}. retry_in=${backoff}ms. reason=${err.message}`
          );
        }
      }
    } finally {
      this.processing = false;
    }
  }

  async safeDisconnect() {
    if (!this.zkInstance || typeof this.zkInstance.disconnect !== 'function') return;
    try {
      await this.zkInstance.disconnect();
    } catch (err) {
      console.error(`[${new Date().toLocaleTimeString()}] Disconnect warning: ${err.message}`);
    }
  }

  scheduleReconnect(reason, delayMs = 10000) {
    if (this.reconnectScheduled) return;
    this.reconnectScheduled = true;

    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    console.error(
      `[${new Date().toLocaleTimeString()}] 🔁 Reconnecting in ${Math.round(delayMs / 1000)}s. reason=${reason}`
    );

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectScheduled = false;
      await this.start();
    }, delayMs);
  }

  startBatchLoop() {
    if (this.batchTimer) return;
    this.batchTimer = setInterval(() => {
      this.processBatch().catch((err) => {
        console.error(`[${new Date().toLocaleTimeString()}] Queue worker error:`, unwrapError(err));
      });
    }, BATCH_INTERVAL_MS);
  }

  startKeepAlive() {
    if (this.keepAliveTimer) clearInterval(this.keepAliveTimer);

    this.keepAliveTimer = setInterval(async () => {
      if (!this.zkInstance) return;

      try {
        // Prefer lightweight heartbeat methods if available in current zkteco-js build.
        if (typeof this.zkInstance.getTime === 'function') {
          await this.zkInstance.getTime();
        } else if (typeof this.zkInstance.getInfo === 'function') {
          await this.zkInstance.getInfo();
        }

        const ageMs = Date.now() - this.lastRealtimeAt;
        if (this.lastRealtimeAt > 0 && ageMs > KEEP_ALIVE_MS * 6) {
          if (ALLOW_IDLE_RECONNECT) {
            throw new Error(`No realtime events for ${Math.round(ageMs / 1000)}s`);
          }
          console.warn(
            `[${new Date().toLocaleTimeString()}] Keep-alive idle: no realtime events for ${Math.round(ageMs / 1000)}s (connection kept alive)`
          );
        }
      } catch (err) {
        const details = unwrapError(err);
        console.error(`[${new Date().toLocaleTimeString()}] Keep-alive failed:`, details);
        if (isLikelyDeviceError(err) || (ALLOW_IDLE_RECONNECT && String(details?.message || '').includes('No realtime events'))) {
          await this.safeDisconnect();
          this.scheduleReconnect(details?.message || 'keep-alive failure', 10000);
        }
      }
    }, KEEP_ALIVE_MS);
  }

  async start() {
    try {
      await this.safeDisconnect();

      this.zkInstance = new ZKLib(DEVICE_IP, DEVICE_PORT, 10000, 4000);
      console.log(
        `[${new Date().toLocaleTimeString()}] Connecting to biometric device ${DEVICE_IP}:${DEVICE_PORT}...`
      );

      await this.zkInstance.createSocket();
      this.lastRealtimeAt = Date.now();
      console.log(`[${new Date().toLocaleTimeString()}] ✅ Connected. Realtime listener active.`);

      // Realtime callback must only enqueue. No direct API writes here.
      this.zkInstance.getRealTimeLogs((data) => {
        try {
          this.enqueueRealtime(data);
        } catch (err) {
          console.error(`[${new Date().toLocaleTimeString()}] Realtime callback error:`, unwrapError(err));
        }
      });

      this.startBatchLoop();
      this.startKeepAlive();
    } catch (err) {
      const details = unwrapError(err);
      console.error(`[${new Date().toLocaleTimeString()}] ❌ Bridge start error:`, details);
      await this.safeDisconnect();
      this.scheduleReconnect(details?.message || 'initial connect failure', 10000);
    }
  }
}

const runtime = new BridgeRuntime();

process.on('uncaughtException', (err) => {
  console.error('Fatal Error:', err);
  runtime.scheduleReconnect('uncaughtException', 5000);
});

process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err);
});

runtime.start();
