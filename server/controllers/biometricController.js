const { pool, queryWithRetry, withDbClient } = require('../config/db');
const { createNotification } = require('./notificationController');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

const PENDING_DIR = path.join(__dirname, '..', 'data');
const PENDING_FILE = path.join(PENDING_DIR, 'biometric_pending_logs.jsonl');
const MIN_PUNCH_INTERVAL_MS = 10 * 60 * 1000;
const DB_RETRY_INTERVAL_MS = Number(process.env.BIOMETRIC_DB_RETRY_INTERVAL_MS || 7000);
const DB_RECOVERY_BATCH_SIZE = Number(process.env.BIOMETRIC_DB_RECOVERY_BATCH_SIZE || 10);
const DB_RECOVERY_ITEM_DELAY_MS = Number(process.env.BIOMETRIC_DB_RECOVERY_ITEM_DELAY_MS || 120);

const dbRuntimeState = {
    status: 'DB_CONNECTED',
    lastError: null,
    lastCheckedAt: null,
    lastRecoveredAt: null,
};

const inMemoryPendingLogs = [];
let pendingLogsLoaded = false;
let recoveryWorkerStarted = false;
let recoveryWorkerRunning = false;

const apiCache = new Map();
const CACHE_TTL = 30000; // 30 seconds

const getCachedResult = (cacheKey) => {
    const cached = apiCache.get(cacheKey);
    if (cached && Date.now() - cached.time < CACHE_TTL) return cached.data;
    if (cached) apiCache.delete(cacheKey);
    return null;
};

const setCachedResult = (cacheKey, data) => {
    apiCache.set(cacheKey, { data, time: Date.now() });
};

const normalizePunchType = (rawType, dateRef) => {
    const val = String(rawType ?? '').trim().toUpperCase();
    if (val === 'IN' || val === '0') return 'IN';
    if (val === 'OUT' || val === '1') return 'OUT';
    const dt = dateRef instanceof Date && !Number.isNaN(dateRef.getTime()) ? dateRef : new Date();
    return dt.getHours() < 12 ? 'IN' : 'OUT';
};

const calculateWorkingHours = (inTime, outTime) => {
    const parseToMinutes = (value) => {
        const [h, m] = String(value || '').split(':').map((n) => Number(n));
        if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
        return (h * 60) + m;
    };

    const inMins = parseToMinutes(inTime);
    const outMins = parseToMinutes(outTime);
    if (inMins === null || outMins === null || outMins < inMins) return '0h 0m';

    const total = outMins - inMins;
    const hours = Math.floor(total / 60);
    const minutes = total % 60;
    return `${hours}h ${minutes}m`;
};

const removeStatusFromRemarks = (value) => String(value || '')
    .replace(/\bStatus\s*:\s*[^|]+(\|\s*)?/gi, '')
    .replace(/\s*\|\s*/g, ' | ')
    .replace(/^\s*\|\s*|\s*\|\s*$/g, '')
    .trim();

const admsLastSeenState = {
    heartbeat: null,
    heartbeatMeta: null,
    cdata: null,
    cdataMeta: null,
};

const admsCommandQueue = []; // Queue of { sn: string, command: string, id: string }

const toIsoNow = () => new Date().toISOString();

const toIstParts = (date) => {
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    });
    const parts = formatter.formatToParts(date).reduce((acc, part) => {
        if (part.type !== 'literal') acc[part.type] = part.value;
        return acc;
    }, {});
    const dateStr = `${parts.year}-${parts.month}-${parts.day}`;
    let hour = parts.hour;
    if (hour === '24') hour = '00';
    const timeStr = `${hour}:${parts.minute}:${parts.second}`;
    return { dateStr, timeStr, timestamp: `${dateStr} ${timeStr}` };
};

const upsertBiometricAttendanceFromLogs = async (empId, dateStr, client = pool) => {
    // We treat log_time as already being in IST local time (timestamp without time zone)
    // to avoid triple-conversion bugs that shift dashboard data by 5.5 hours.
    await client.query(
        `WITH agg AS (
            SELECT
                MIN(log_time::time) AS first_punch,
                MAX(log_time::time) AS last_punch
            FROM biometric_logs
            WHERE emp_id = $1
            AND log_time::date = $2::date
        )
        INSERT INTO biometric_attendance (user_id, date, intime, outtime)
        SELECT $1, $2::date, first_punch, last_punch
        FROM agg
        WHERE first_punch IS NOT NULL
        ON CONFLICT (user_id, date)
        DO UPDATE SET
            intime = LEAST(biometric_attendance.intime, EXCLUDED.intime),
            outtime = GREATEST(biometric_attendance.outtime, EXCLUDED.outtime)`,
        [empId, dateStr]
    );
};

exports.markAdmsHeartbeatSeen = (meta = null) => {
    admsLastSeenState.heartbeat = toIsoNow();
    admsLastSeenState.heartbeatMeta = meta;
};

exports.markAdmsCdataSeen = (meta = null) => {
    admsLastSeenState.cdata = toIsoNow();
    admsLastSeenState.cdataMeta = meta;
};

// @desc    Store a command for an ADMS device to pick up on its next heartbeat poll
exports.enqueueAdmsCommand = (sn, commandText) => {
    const id = `CMD_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    admsCommandQueue.push({ id, sn, command: commandText, status: 'pending' });
    console.log(`[BIOMETRIC] Command enqueued for SN=${sn}: ${commandText} (ID: ${id})`);
    return id;
};

// @desc    Retrieve the next pending command for a device SN
exports.getNextAdmsCommand = (sn) => {
    const idx = admsCommandQueue.findIndex(c => c.sn === sn && c.status === 'pending');
    if (idx !== -1) {
        const cmd = admsCommandQueue[idx];
        cmd.status = 'sent';
        cmd.sentAt = toIsoNow();
        // ZKTeco format: C:ID:COMMANDNAME ARGS
        return `C:${cmd.id}:${cmd.command}`;
    }
    return null;
};

// @desc    Confirm command execution from device
exports.reportAdmsCommandStatus = (id, status) => {
    const cmd = admsCommandQueue.find(c => c.id === id);
    if (cmd) {
        cmd.status = status || 'completed';
        cmd.completedAt = toIsoNow();
        console.log(`[BIOMETRIC] Command ${id} marked as ${cmd.status}`);
    }
};

// @desc    Get ADMS last heartbeat/cdata seen times
// @route   GET /api/biometric/adms-last-seen
// @access  Private (Admin)
exports.getAdmsLastSeen = async (req, res) => {
    return res.status(200).json({
        heartbeat_last_seen_at: admsLastSeenState.heartbeat,
        cdata_last_seen_at: admsLastSeenState.cdata,
        heartbeat_meta: admsLastSeenState.heartbeatMeta,
        cdata_meta: admsLastSeenState.cdataMeta,
        now: toIsoNow(),
    });
};

const isTransientDbError = (error) => {
    if (!error) return false;
    const code = String(error.code || '').toUpperCase();
    const msg = String(error.message || '').toLowerCase();
    return (
        ['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ETIMEDOUT', '53300'].includes(code) ||
        msg.includes('maxclientsinsessionmode') ||
        msg.includes('getaddrinfo enotfound') ||
        msg.includes('too many clients')
    );
};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));

const normalizePendingPayload = (payload = {}, fallbackTimestamp = new Date().toISOString()) => {
    const empId = String(payload.emp_id || payload.user_id || '').trim();
    const timestamp = payload.timestamp || payload.recordTime || fallbackTimestamp;
    return {
        emp_id: empId,
        timestamp,
        device_id: payload.device_id || payload.device_ip || 'ZK_ZKTECO',
        type: payload.type || null,
        raw: payload.raw || null,
    };
};

const markDbDisconnected = (error) => {
    dbRuntimeState.status = 'DB_DISCONNECTED';
    dbRuntimeState.lastError = error?.message || 'Unknown DB error';
    dbRuntimeState.lastCheckedAt = new Date().toISOString();
};

const markDbConnected = () => {
    const wasDisconnected = dbRuntimeState.status === 'DB_DISCONNECTED';
    dbRuntimeState.status = 'DB_CONNECTED';
    dbRuntimeState.lastError = null;
    dbRuntimeState.lastCheckedAt = new Date().toISOString();
    if (wasDisconnected) {
        dbRuntimeState.lastRecoveredAt = new Date().toISOString();
        console.log('[BIOMETRIC] DB recovered. Resuming queued punch replay.');
    }
};

const persistPendingQueueSnapshot = () => {
    try {
        if (!fs.existsSync(PENDING_DIR)) {
            fs.mkdirSync(PENDING_DIR, { recursive: true });
        }

        if (inMemoryPendingLogs.length === 0) {
            if (fs.existsSync(PENDING_FILE)) fs.unlinkSync(PENDING_FILE);
            return;
        }

        const lines = inMemoryPendingLogs.map((entry) => JSON.stringify(entry));
        fs.writeFileSync(PENDING_FILE, `${lines.join('\n')}\n`, 'utf8');
    } catch (err) {
        console.error('Failed to persist biometric pending queue snapshot:', err.message);
    }
};

const loadPendingQueueFromFile = () => {
    if (pendingLogsLoaded) return;
    pendingLogsLoaded = true;

    try {
        if (!fs.existsSync(PENDING_FILE)) return;
        const raw = fs.readFileSync(PENDING_FILE, 'utf8');
        const lines = raw.split('\n').filter(Boolean);

        for (const line of lines) {
            try {
                const entry = JSON.parse(line);
                const normalized = normalizePendingPayload(entry?.payload || {}, entry?.queued_at || new Date().toISOString());
                if (!normalized.emp_id) continue;
                inMemoryPendingLogs.push({
                    queued_at: entry?.queued_at || new Date().toISOString(),
                    reason: entry?.reason || 'Recovered from disk',
                    payload: normalized,
                });
            } catch (lineErr) {
                console.error('Skipping invalid queued biometric line:', lineErr.message);
            }
        }

        if (inMemoryPendingLogs.length > 0) {
            console.log(`[BIOMETRIC] Loaded ${inMemoryPendingLogs.length} queued punches from disk.`);
        }
    } catch (err) {
        console.error('Failed to load biometric pending queue from disk:', err.message);
    }
};

const queuePendingBiometricLog = (payload, error) => {
    try {
        loadPendingQueueFromFile();

        const normalized = normalizePendingPayload(payload, new Date().toISOString());
        if (!normalized.emp_id) return;

        if (!fs.existsSync(PENDING_DIR)) {
            fs.mkdirSync(PENDING_DIR, { recursive: true });
        }

        const entry = {
            queued_at: new Date().toISOString(),
            reason: error?.message || 'Unknown DB error',
            payload: normalized,
        };

        inMemoryPendingLogs.push(entry);

        fs.appendFileSync(PENDING_FILE, `${JSON.stringify(entry)}\n`, 'utf8');
    } catch (queueErr) {
        console.error('Failed to queue pending biometric log:', queueErr.message);
    }
};

const drainPendingBiometricLogs = async (limit = 25) => {
    loadPendingQueueFromFile();
    if (inMemoryPendingLogs.length === 0) return { replayed: 0, remaining: 0, failed: 0 };

    let replayed = 0;
    let failed = 0;

    while (inMemoryPendingLogs.length > 0 && replayed < limit) {
        const entry = inMemoryPendingLogs[0];

        try {
            const payload = entry && entry.payload ? entry.payload : {};
            const queuedEmpId = String(payload.emp_id || payload.user_id || '').trim();
            if (!queuedEmpId) {
                inMemoryPendingLogs.shift();
                continue;
            }

            const queuedLogDate = payload.timestamp ? new Date(payload.timestamp) : new Date(entry.queued_at || Date.now());
            await runWithSequenceFix(
                `INSERT INTO biometric_logs (device_id, emp_id, log_time, type)
                 VALUES ($1, $2, $3, $4)
                 ON CONFLICT (emp_id, log_time) DO NOTHING`,
                [payload.device_id || 'PENDING_QUEUE', queuedEmpId, queuedLogDate, payload.type || (queuedLogDate.getHours() < 12 ? 'IN' : 'OUT')],
                'biometric_logs'
            );
            const queuedDateStr = queuedLogDate.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
            await rebuildAttendanceFromBiometricTimeline(queuedEmpId, queuedDateStr);

            inMemoryPendingLogs.shift();
            replayed += 1;
            if (DB_RECOVERY_ITEM_DELAY_MS > 0) {
                await delay(DB_RECOVERY_ITEM_DELAY_MS);
            }
        } catch (err) {
            if (isTransientDbError(err)) {
                markDbDisconnected(err);
                break;
            }

            failed += 1;
            const blocked = inMemoryPendingLogs.shift();
            if (blocked) inMemoryPendingLogs.push(blocked);
            console.error('Failed replaying queued biometric punch:', err.message);
        }
    }

    persistPendingQueueSnapshot();

    return { replayed, remaining: inMemoryPendingLogs.length, failed };
};

const startPendingRecoveryWorker = () => {
    if (recoveryWorkerStarted) return;
    recoveryWorkerStarted = true;
    loadPendingQueueFromFile();

    setInterval(async () => {
        if (recoveryWorkerRunning) return;
        recoveryWorkerRunning = true;

        try {
            try {
                // Using pool.query directly here is fine as it's a heartbeat/ping,
                // but let's use a very short timeout or just queryWithRetry
                await queryWithRetry('SELECT 1', [], { retries: 0 });
                markDbConnected();
            } catch (pingErr) {
                markDbDisconnected(pingErr);
                return;
            }

            if (inMemoryPendingLogs.length > 0) {
                const result = await drainPendingBiometricLogs(DB_RECOVERY_BATCH_SIZE);
                if (result.replayed > 0 || result.failed > 0) {
                    console.log(`[BIOMETRIC] Queue replay: replayed=${result.replayed}, failed=${result.failed}, remaining=${result.remaining}`);
                }
            }
        } finally {
            recoveryWorkerRunning = false;
        }
    }, Math.max(5000, DB_RETRY_INTERVAL_MS));
};

startPendingRecoveryWorker();

const ensureBiometricUser = async (empId) => {
    const safeEmpId = String(empId || '').trim();
    if (!safeEmpId) return;

    const placeholderPassword = `AUTO_BIOMETRIC_${safeEmpId}_${Date.now()}`;
    const passwordHash = await bcrypt.hash(placeholderPassword, 10);

    await queryWithRetry(
        `INSERT INTO users (emp_id, password, role, name, designation)
         VALUES ($1, $2, 'staff', $3, 'Biometric Imported')
         ON CONFLICT (emp_id) DO NOTHING`,
        [safeEmpId, passwordHash, `Biometric User ${safeEmpId}`]
    );
};

// Defined as a local const so internal callers (receiveLog, drainPendingBiometricLogs,
// rebuildTodayPunches) can all call it without going through exports.*
const rebuildAttendanceFromBiometricTimeline = async (normalizedEmpId, dateStr, client = pool) => {
    const toMins = (t) => {
        if (!t) return 0;
        const [h, m] = t.split(':').map(Number);
        return (h || 0) * 60 + (m || 0);
    };

    const { rows: allPunches } = await client.query(
        `SELECT log_time FROM biometric_logs
         WHERE TRIM(emp_id) = $1 AND log_time::date = $2::date
         ORDER BY log_time ASC`,
        [normalizedEmpId, dateStr]
    );

    const { rows: approvedLeaves } = await client.query(
        `SELECT leave_type, is_half_day, dates_detail FROM leave_requests
         WHERE emp_id = $1 AND status = 'Approved'
         AND from_date <= $2 AND to_date >= $2`,
        [normalizedEmpId, dateStr]
    );

    const { rows: approvedPerms } = await client.query(
        `SELECT from_time, to_time FROM permission_requests
         WHERE emp_id = $1 AND status = 'Approved' AND date = $2`,
        [normalizedEmpId, dateStr]
    );

    let segments = [];
    let physIn = null;
    let physOut = null;

    if (allPunches.length > 0) {
        physIn = new Date(allPunches[0].log_time).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' });
        if (allPunches.length > 1) {
            physOut = new Date(allPunches[allPunches.length - 1].log_time).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' });
        }
        segments.push({ type: 'Present', from: physIn, to: physOut || physIn, fromMins: toMins(physIn), toMins: toMins(physOut || physIn) });
    }

    approvedLeaves.forEach((leave) => {
        let details = [];
        try {
            details = Array.isArray(leave.dates_detail) ? leave.dates_detail : (typeof leave.dates_detail === 'string' ? JSON.parse(leave.dates_detail) : []);
        } catch (e) { details = []; }

        const dayDetail = details.find((d) => d.date === dateStr);
        if (dayDetail && (dayDetail.day_type || !dayDetail.is_full_day)) {
            let f;
            let t;
            if (dayDetail.day_type === 'Half Day AM') { f = '09:00'; t = '13:00'; }
            else if (dayDetail.day_type === 'Half Day PM') { f = '13:30'; t = '16:45'; }
            else { f = dayDetail.from_time || '09:00'; t = dayDetail.to_time || '16:45'; }
            segments.push({ type: leave.leave_type, from: f, to: t, fromMins: toMins(f), toMins: toMins(t), day_type: dayDetail.day_type });
        } else if (!leave.is_half_day) {
            segments.push({ type: leave.leave_type, from: '09:00', to: '16:45', fromMins: toMins('09:00'), toMins: toMins('16:45'), isFull: true });
        }
    });

    approvedPerms.forEach((perm) => {
        segments.push({ type: 'Permission', from: perm.from_time, to: perm.to_time, fromMins: toMins(perm.from_time), toMins: toMins(perm.to_time) });
    });

    const STD_IN_MINS = 540;
    const LATE_GRACE_IN_MINS = 540; // 09:00 or earlier is Present
    const STD_OUT_MINS = 1005;
    const MORNING_HALF_DAY_END_MINS = 755;
    const EVENING_HALF_DAY_START_MINS = 810;

    let flags = [];
    let workingHoursStr = '0h 0m';
    let dbStatus = 'Present';

    if (physIn) {
        const inMins = toMins(physIn);
        const outMins = physOut ? toMins(physOut) : inMins;
        const diff = outMins - inMins;
        workingHoursStr = `${Math.floor(diff / 60)}h ${diff % 60}m`;

        const leaveSegments = segments.filter((s) => s.type !== 'Present' && s.type !== 'Permission');
        const leaveInfo = leaveSegments.length > 0 ? leaveSegments.map((s) => `${s.type} (${s.from}-${s.to})`).join(' + ') : null;

        if (!physOut) {
            // Do not mark LOP or add missing-out alerts when only IN punch exists.
            // Keep provisional status as Present and wait for possible later OUT punch.
            dbStatus = leaveInfo ? `Present + ${leaveInfo}` : 'Present';
        } else {
            let isLateEntry = false;
            let isEarlyExit = false;
            let isLateCovered = true;
            let isEarlyCovered = true;
            let lateLopUnits = 0;
            let earlyLopUnits = 0;

            if (inMins > LATE_GRACE_IN_MINS) {
                isLateEntry = true;
                isLateCovered = segments.filter(s => s.type !== 'Present' && s.type !== 'Permission').some(s => s.fromMins <= STD_IN_MINS && s.toMins >= inMins);
                flags.push(`Late Entry (${physIn})`);
                if (!isLateCovered) {
                    // If late after 9:00 and not covered by leave, mark as LOP
                    lateLopUnits = inMins <= MORNING_HALF_DAY_END_MINS ? 0.5 : 1;
                    if (lateLopUnits === 0.5) flags.push('Late LOP (Morning)');
                    else flags.push('Late LOP (Full Day)');
                }
            }

            if (outMins < STD_OUT_MINS && outMins > inMins) {
                isEarlyExit = true;
                isEarlyCovered = segments.filter(s => s.type !== 'Present' && s.type !== 'Permission').some(s => s.fromMins <= outMins && s.toMins >= STD_OUT_MINS);
                flags.push(`Early Exit (${physOut})`);
                if (!isEarlyCovered) {
                    earlyLopUnits = outMins >= EVENING_HALF_DAY_START_MINS ? 0.5 : 1;
                    if (earlyLopUnits === 0.5) flags.push('Early Exit LOP (Evening)');
                    else flags.push('Early Exit LOP (Full Day)');
                }
            }

            const lopUnits = Math.min(1, lateLopUnits + earlyLopUnits);

            if (lopUnits >= 1) {
                dbStatus = leaveInfo ? `LOP + ${leaveInfo}` : 'LOP';
            } else if (lopUnits === 0.5) {
                // Check if it was Late Entry specifically
                if (isLateEntry && !isLateCovered) {
                    dbStatus = leaveInfo ? `LOP (Late) + ${leaveInfo}` : 'LOP (Late Entry) + Present';
                } else if (isEarlyExit && !isEarlyCovered) {
                    dbStatus = leaveInfo ? `LOP (Early) + ${leaveInfo}` : 'LOP (Early Exit) + Present';
                } else {
                    dbStatus = 'LOP + Present';
                }
            } else {
                dbStatus = leaveInfo ? (isLateEntry ? `Present (Late) + ${leaveInfo}` : `Present + ${leaveInfo}`) : (isLateEntry ? 'Present (Late Entry)' : 'Present');
            }
        }
    } else {
        const fullDay = segments.find((s) => s.isFull);
        const otherSegments = segments.filter((s) => s.type !== 'Present' && s.type !== 'Permission' && !s.isFull);
        const leaveInfo = otherSegments.length > 0 ? otherSegments.map((s) => `${s.type} (${s.from}-${s.to})`).join(' + ') : null;
        if (fullDay) dbStatus = fullDay.type;
        else if (leaveInfo) dbStatus = `Absent + ${leaveInfo}`;
        else dbStatus = 'Absent';
    }

    // MAP TO VALID DATABASE ENUM VALUES (Present, LOP, Absent, CL, ML, OD, etc.)
    // Detailed info like "LOP (Late) + CL" must go in remarks because the status column is a strict ENUM.
    let enumStatus = 'Present';
    if (dbStatus.includes('LOP')) {
        enumStatus = 'LOP';
    } else if (dbStatus.includes('Absent')) {
        enumStatus = 'Absent';
    } else if (dbStatus.includes('CL')) {
        enumStatus = 'CL';
    } else if (dbStatus.includes('ML')) {
        enumStatus = 'ML';
    } else if (dbStatus.includes('OD')) {
        enumStatus = 'OD';
    } else if (dbStatus.includes('Comp Leave')) {
        enumStatus = 'Comp Leave';
    } else if (dbStatus.includes('Holiday')) {
        enumStatus = 'Holiday';
    } else if (dbStatus.includes('Weekend')) {
        enumStatus = 'Weekend';
    } else if (dbStatus.includes('Present')) {
        enumStatus = 'Present';
    }


    const approvedInfoList = segments
        .filter((s) => s.type !== 'Present')
        .map((s) => {
            const fromTimeStr = new Date(`2000-01-01T${s.from}`).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
            const toTimeStr = new Date(`2000-01-01T${s.to}`).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
            const durationInMins = s.toMins - s.fromMins;
            const h = Math.floor(durationInMins / 60);
            const m = durationInMins % 60;
            return `${s.type}${s.day_type ? ' (' + s.day_type + ')' : ''}: ${fromTimeStr}-${toTimeStr} (${h}h ${m}m)`;
        });

    const finalRemarks = removeStatusFromRemarks([
        `Working Hours: ${workingHoursStr}`,
        flags.length > 0 ? `Alerts: ${flags.join(', ')}` : null,
        approvedInfoList.length > 0 ? `Approved Segments: ${approvedInfoList.join(' | ')}` : null
    ].filter(Boolean).join(' | '));


    await runWithSequenceFix(
        `INSERT INTO biometric_attendance (user_id, date, intime, outtime)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, date)
         DO UPDATE SET
            intime = EXCLUDED.intime,
            outtime = EXCLUDED.outtime`,
        [normalizedEmpId, dateStr, physIn || null, physOut || null],
        'biometric_attendance',
        client
    );

    await runWithSequenceFix(
        `INSERT INTO attendance_records (emp_id, date, in_time, out_time, status, remarks)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (emp_id, date)
         DO UPDATE SET
            in_time = EXCLUDED.in_time,
            out_time = EXCLUDED.out_time,
            status = EXCLUDED.status,
            remarks = EXCLUDED.remarks`,
        [normalizedEmpId, dateStr, physIn || null, physOut || null, enumStatus, finalRemarks || null],
        'attendance_records',
        client
    );

    return { dbStatus, enumStatus, remarks: finalRemarks || null, physIn, physOut };
};

// Export so routes and external callers can use it
exports.rebuildAttendanceFromBiometricTimeline = rebuildAttendanceFromBiometricTimeline;

// Helper: run a query, and on unique-violation (23505) attempt to reset sequence for given table and retry once
async function runWithSequenceFix(queryText, params = [], tableName = null, client = pool) {
    try {
        return await client.query(queryText, params);
    } catch (err) {
        if (err && err.code === '23505' && tableName) {
            try {
                const seqRes = await client.query("SELECT pg_get_serial_sequence($1, 'id') as seqname", [tableName]);
                const seqName = seqRes.rows[0] && seqRes.rows[0].seqname;
                if (seqName) {
                    const maxRes = await client.query(`SELECT COALESCE(MAX(id), 0) as maxid FROM ${tableName}`);
                    const next = parseInt(maxRes.rows[0].maxid, 10) + 1;
                    await client.query('SELECT setval($1, $2, false)', [seqName, next]);
                    console.warn(`Sequence ${seqName} for ${tableName} was out of sync. Reset to ${next} and retrying query.`);
                    return await client.query(queryText, params);
                }
            } catch (fixErr) {
                console.error('Error fixing sequence for', tableName, fixErr);
            }
        }
        throw err;
    }
}

// @desc    Receive biometric log from device
// @route   POST /api/biometric/log
// @access  Public (or protected with device key)
exports.receiveLog = async (req, res) => {
    const { device_id, emp_id, user_id, timestamp, recordTime, type, device_ip, skipDuplicateGuard } = req.body;
    const finalEmpId = String(emp_id || user_id || '').trim();

    if (!finalEmpId) {
        return res.status(400).json({ message: 'emp_id or user_id is required' });
    }

    if (dbRuntimeState.status === 'DB_DISCONNECTED') {
        queuePendingBiometricLog(req.body, new Error('DB_DISCONNECTED'));
        return res.status(202).json({
            message: 'DB disconnected. Punch queued for replay.',
            state: dbRuntimeState.status,
            queued: true,
        });
    }

    // Optimization: Use withDbClient to run all related queries on a SINGLE connection.
    // This prevents opening many connections per request.
    return await withDbClient(async (client) => {
        try {
            markDbConnected();
            const normalizedEmpId = finalEmpId;
            const deviceId = device_id || device_ip || 'ZK_ZKTECO';
            const finalTimestamp = timestamp || recordTime;
            
            // Use provided timestamp or current server time
            const logDate = finalTimestamp ? new Date(finalTimestamp) : new Date();
            if (Number.isNaN(logDate.getTime())) {
                return res.status(400).json({ message: 'Invalid timestamp format' });
            }
            const normalizedPunchType = normalizePunchType(type, logDate);
            const istParts = toIstParts(logDate);
            const dateStr = istParts.dateStr;
            const timeStr = new Intl.DateTimeFormat('en-US', {
                timeZone: 'Asia/Kolkata',
                hour: '2-digit',
                minute: '2-digit',
                hour12: true,
            }).format(logDate);

            // 1. Process only known employees
            const { rows: userRows } = await client.query(
                'SELECT 1 FROM users WHERE emp_id = $1 LIMIT 1',
                [normalizedEmpId]
            );

            if (userRows.length === 0) {
                return res.status(202).json({
                    message: `Employee ${normalizedEmpId} is not registered. Punch skipped.`,
                    skipped: true,
                    reason: 'UNKNOWN_EMPLOYEE'
                });
            }

            // 2. Debouncer
            if (!skipDuplicateGuard) {
                const { rows: nearPunchRows } = await client.query(
                    `SELECT id, log_time
                     FROM biometric_logs
                     WHERE TRIM(emp_id) = $1
                     AND log_time >= ($2::timestamp - interval '2 minutes')
                     AND log_time <= ($2::timestamp + interval '2 minutes')
                     LIMIT 1`,
                    [normalizedEmpId, istParts.timestamp]
                );

                if (nearPunchRows.length > 0) {
                    return res.status(200).json({
                        message: `Duplicate punch ignored. Already exists within 2 minutes.`,
                        skipped: true,
                        reason: 'DUPLICATE_OR_TOO_SOON'
                    });
                }
            }

            // 3. Store raw log
            await runWithSequenceFix(
                `INSERT INTO biometric_logs (device_id, emp_id, log_time, type) 
                 VALUES ($1, $2, $3, $4)
                 ON CONFLICT (emp_id, log_time) 
                 DO NOTHING`,
                [deviceId || 'ADMS', normalizedEmpId, istParts.timestamp, normalizedPunchType],
                'biometric_logs',
                client
            );

            // 4. Sync summaries & Rebuild
            await upsertBiometricAttendanceFromLogs(normalizedEmpId, dateStr, client);
            
            let syncResult = { dbStatus: 'Present', physIn: null, physOut: null };
            if (!req.body.skipRebuild) {
                syncResult = await rebuildAttendanceFromBiometricTimeline(normalizedEmpId, dateStr, client);
            }

            // 5. Notifications
            let userName = normalizedEmpId;
            try {
                const { rows: nameRows } = await client.query("SELECT name FROM users WHERE TRIM(emp_id) = TRIM($1)", [normalizedEmpId]);
                if (nameRows.length > 0) userName = nameRows[0].name;
            } catch (e) {
                console.error('Name lookup failed:', e);
            }

            const statusLabel = syncResult.enumStatus || syncResult.dbStatus || 'Present';
            const inTimeLabel = syncResult.physIn || '--:--';
            const outTimeLabel = syncResult.physOut || 'Pending';
            const remarksLabel = removeStatusFromRemarks(syncResult.remarks || '') || (normalizedPunchType === 'OUT'
                ? 'Attendance completed successfully.'
                : 'Punch-in recorded successfully.');
            
            const message = normalizedPunchType === 'OUT'
                ? `🔔 Attendance Notification\n\nEmployee Name   : ${userName}\nEmployee ID     : ${normalizedEmpId}\nPunch-In Time   : ${inTimeLabel}\nPunch-Out Time  : ${outTimeLabel}\nStatus          : ${statusLabel}\n\nRemark : ${remarksLabel}`
                : `🔔 Attendance Notification\n\nEmployee Name : ${userName}\nEmployee ID   : ${normalizedEmpId}\nPunch-In Time : ${timeStr}\nStatus        : ${statusLabel}\n\nRemark : ${remarksLabel}`;

            // Asynchronous notifications (don't block the response)
            (async () => {
                try {
                    await createNotification(normalizedEmpId, message, 'attendance', null, null, true);
                    const { rows: admins } = await pool.query("SELECT emp_id FROM users WHERE role IN ('admin', 'management')");
                    for (const admin of admins) {
                        if ((admin.emp_id || '').trim() !== normalizedEmpId) {
                            await createNotification(admin.emp_id, message, 'attendance', null, null, true);
                        }
                    }
                } catch (e) { console.error('Notify error:', e); }
            })();

            // Socket emit
            const io = req.app.get('io');
            if (io) {
                io.emit('biometric_punch', {
                    emp_id: normalizedEmpId,
                    name: userName,
                    type: normalizedPunchType,
                    message,
                    time: timeStr,
                    date: dateStr,
                    in_time: syncResult.physIn || null,
                    out_time: syncResult.physOut || null,
                    status: statusLabel,
                    remarks: syncResult.remarks || null,
                });
            }

            return res.status(200).json({ message: 'Log processed successfully' });
        } catch (error) {
            console.error('🔴 Biometric processing error:', error);
            if (isTransientDbError(error)) {
                markDbDisconnected(error);
                queuePendingBiometricLog(req.body, error);
                return res.status(202).json({ message: 'Biometric punch queued' });
            }
            return res.status(500).json({ message: 'Biometric processing failed', error: error.message });
        }
    }); // End withDbClient
};

// @desc    Get biometric attendance data
// @route   GET /api/biometric/data
// @desc    Get raw biometric punch logs for auditing
// @route   GET /api/biometric/raw-logs
exports.getRawBiometricLogs = async (req, res) => {
    try {
        const { emp_id, date, limit = 50, offset = 0 } = req.query;
        
        const cacheKey = `raw_logs_${JSON.stringify(req.query)}`;
        const cached = getCachedResult(cacheKey);
        if (cached) return res.json(cached);

        let query = `
            SELECT l.id, l.emp_id, l.log_time, l.device_id, l.type, u.name 
            FROM biometric_logs l
            LEFT JOIN users u ON TRIM(l.emp_id) = u.emp_id
            WHERE 1=1
        `;
        const params = [];
        if (emp_id) {
            params.push(emp_id);
            query += ` AND TRIM(l.emp_id) = $${params.length}`;
        }
        if (date) {
            params.push(date);
            query += ` AND l.log_time::date = $${params.length}`;
        }
        query += ` ORDER BY l.log_time ASC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        params.push(limit, offset);

        const { rows } = await queryWithRetry(query, params);
        setCachedResult(cacheKey, rows);
        res.json(rows);
    } catch (error) {
        console.error('Error fetching raw biometric logs:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Get biometric attendance data
exports.getBiometricData = async (req, res) => {
    try {
        const { emp_id, date, month, startDate, endDate, limit = 100, offset = 0 } = req.query;
        
        const cacheKey = `bio_data_${JSON.stringify(req.query)}`;
        const cached = getCachedResult(cacheKey);
        if (cached) return res.json(cached);

        let query = `
            SELECT b.id, b.user_id, b.date, b.intime, b.outtime, u.name, u.role, d.name as department_name, 
                   ar.status as att_status, ar.remarks as att_remarks
            FROM biometric_attendance b
            JOIN users u ON b.user_id = u.emp_id
            LEFT JOIN departments d ON u.department_id = d.id
            LEFT JOIN attendance_records ar ON b.user_id = ar.emp_id AND b.date = ar.date
            WHERE u.role NOT IN ('admin', 'management')
        `;
        const params = [];

        if (emp_id) {
            params.push(emp_id);
            query += ` AND b.user_id = $${params.length}`;
        }
        if (date) {
            params.push(date);
            query += ` AND b.date = $${params.length}`;
        } else if (startDate && endDate) {
            params.push(startDate, endDate);
            query += ` AND b.date >= $${params.length - 1} AND b.date <= $${params.length}`;
        } else if (month) {
            params.push(`${month}%`);
            query += ` AND b.date::text LIKE $${params.length}`;
        }

        query += ` ORDER BY b.date ASC, b.intime ASC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        params.push(limit, offset);

        const { rows } = await queryWithRetry(query, params);
        setCachedResult(cacheKey, rows);
        res.json(rows);
    } catch (error) {
        console.error('Error fetching biometric data:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Get all registered employee IDs (internal bridge utility)
exports.getRegisteredEmpIds = async (req, res) => {
    try {
        console.log('📡 Bridge is fetching Employee IDs...');
        const result = await queryWithRetry('SELECT emp_id FROM users');
        const ids = result.rows
            .filter(r => r.emp_id) // Skip users with no ID
            .map(r => String(r.emp_id).trim());
            
        console.log(`✅ Bridge Sync: Sending list of ${ids.length} registered users.`);
        res.json(ids);
    } catch (error) {
        // 🎯 Catch the exact error reason
        console.error('❌ Database Access Error:', error.message);
        res.status(500).json({ 
            message: 'Database Access Error', 
            error: error.message 
        });
    }
};

// @desc    Get biometric statistics
exports.getBiometricStats = async (req, res) => {
    try {
        const cacheKey = 'bio_stats_today';
        const cached = getCachedResult(cacheKey);
        if (cached) return res.json(cached);

        const { rows: stats } = await queryWithRetry(`
            SELECT 
                COUNT(DISTINCT b.user_id) as total_users,
                COUNT(*) as total_punches_today,
                (SELECT COUNT(*) FROM users WHERE role NOT IN ('admin', 'management')) as total_registered
            FROM biometric_attendance b
            JOIN users u ON b.user_id = u.emp_id
            WHERE b.date = CURRENT_DATE AND u.role NOT IN ('admin', 'management')
        `);
        setCachedResult(cacheKey, stats[0]);
        res.json(stats[0]);
    } catch (error) {
        console.error('Error fetching biometric stats:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Retroactively rebuild attendance status from biometric logs for a range or today
// @route   POST /api/biometric/rebuild-today
// @access  Private (Admin)
exports.rebuildTodayPunches = async (req, res) => {
    try {
        const { fromDate, toDate } = req.body;
        const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
        
        const start = fromDate || todayStr;
        const end = toDate || todayStr;

        console.log(`[BIOMETRIC] Rebuilding attendance from ${start} to ${end}`);

        // Get all employees who have biometric logs in the range
        const { rows: affectedEmployees } = await queryWithRetry(
            `SELECT DISTINCT TRIM(emp_id) as emp_id, log_time::date as log_date
             FROM biometric_logs
             WHERE log_time::date >= $1::date
               AND log_time::date <= $2::date`,
            [start, end]
        );

        if (affectedEmployees.length === 0) {
            return res.status(200).json({ message: 'No biometric punches found for the specified range.', updated: 0 });
        }

        let updated = 0;
        let errors = 0;
        const results = [];

        for (const row of affectedEmployees) {
            try {
                const dateStr = row.log_date; // This will be YYYY-MM-DD string due to pg-types parser
                const result = await rebuildAttendanceFromBiometricTimeline(row.emp_id, dateStr);
                updated++;
                results.push({ emp_id: row.emp_id, date: dateStr, status: result.dbStatus, in: result.physIn, out: result.physOut });
            } catch (err) {
                errors++;
                console.error(`Failed to rebuild attendance for ${row.emp_id} on ${row.log_date}:`, err.message);
            }
        }

        // Emit real-time update so dashboards refresh
        const io = req.app.get('io');
        if (io) io.emit('attendance_updated', { range: { start, end }, action: 'rebuild', count: updated });

        return res.status(200).json({
            message: `Rebuilt attendance for ${updated} records (${errors} errors).`,
            range: { start, end },
            updated,
            errors,
            results: results.slice(0, 50) // Don't overwhelm response if thousands
        });
    } catch (error) {
        console.error('Error rebuilding attendance from logs:', error);
        return res.status(500).json({ message: 'Failed to rebuild attendance', error: error.message });
    }
};

// @desc    Backfill today's manual attendance times into biometric live tables
// @route   POST /api/biometric/backfill-today-from-attendance
// @access  Private (Admin/Management)
exports.backfillTodayFromAttendance = async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const insertLogsResult = await client.query(`
            WITH source_rows AS (
                SELECT
                    ar.emp_id,
                    ar.date::date AS att_date,
                    NULLIF(TRIM(ar.in_time::text), '')::time AS in_time_val,
                    NULLIF(TRIM(ar.out_time::text), '')::time AS out_time_val
                FROM attendance_records ar
                WHERE ar.date::date = (NOW() AT TIME ZONE 'Asia/Kolkata')::date
                  AND (ar.in_time IS NOT NULL OR ar.out_time IS NOT NULL)
            ), candidate_logs AS (
                SELECT emp_id, (att_date::timestamp + in_time_val) AS log_time, 'IN'::text AS log_type
                FROM source_rows
                WHERE in_time_val IS NOT NULL
                UNION ALL
                SELECT emp_id, (att_date::timestamp + out_time_val) AS log_time, 'OUT'::text AS log_type
                FROM source_rows
                WHERE out_time_val IS NOT NULL
            )
            INSERT INTO biometric_logs (device_id, emp_id, log_time, type)
            SELECT
                'MANUAL_ATTENDANCE_SYNC',
                cl.emp_id,
                cl.log_time,
                cl.log_type::biometric_log_type
            FROM candidate_logs cl
            WHERE NOT EXISTS (
                SELECT 1
                FROM biometric_logs b
                WHERE b.emp_id = cl.emp_id
                  AND b.log_time = cl.log_time
                  AND COALESCE(b.type::text, '') = cl.log_type
            )
            RETURNING emp_id
        `);

        const upsertBiometricAttendanceResult = await client.query(`
            WITH today_rollup AS (
                SELECT
                    b.emp_id AS user_id,
                    b.log_time::date AS punch_date,
                    MIN(b.log_time::time) AS first_punch,
                    MAX(b.log_time::time) AS last_punch
                FROM biometric_logs b
                WHERE b.log_time::date = (NOW() AT TIME ZONE 'Asia/Kolkata')::date
                GROUP BY b.emp_id, b.log_time::date
            )
            INSERT INTO biometric_attendance (user_id, date, intime, outtime)
            SELECT user_id, punch_date, first_punch, last_punch
            FROM today_rollup
            ON CONFLICT (user_id, date)
            DO UPDATE SET
                intime = EXCLUDED.intime,
                outtime = EXCLUDED.outtime
            RETURNING user_id
        `);

        await client.query('COMMIT');

        return res.status(200).json({
            message: 'Today attendance backfill to biometric live data completed',
            insertedBiometricLogs: insertLogsResult.rowCount,
            upsertedBiometricAttendanceRows: upsertBiometricAttendanceResult.rowCount,
            date: new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }),
        });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error backfilling today attendance to biometric data:', error);
        return res.status(500).json({
            message: 'Failed to backfill today attendance into biometric live data',
            error: error.message,
        });
    } finally {
        client.release();
    }
};
// @desc    Initiate a pull of all logs from the device memory
// @route   POST /api/biometric/pull-logs
// @access  Private (Admin)
exports.pullLogs = async (req, res) => {
    try {
        const { sn } = req.body;
        if (!sn) return res.status(400).json({ message: 'Device Serial Number (SN) is required' });

        // DATA QUERY ATTLOG is the standard ADMS command to request all attendance logs
        exports.enqueueAdmsCommand(sn, 'DATA QUERY ATTLOG');

        return res.status(200).json({ 
            message: `Pull Logs command enqueued for device ${sn}. It will be delivered on the next device poll.`,
            sn 
        });
    } catch (error) {
        console.error('Error enqueuing pull logs command:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};
