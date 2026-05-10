const express = require('express');
const router = express.Router();
const {
	receiveLog,
	getBiometricData,
	getBiometricStats,
	getRegisteredEmpIds,
	backfillTodayFromAttendance,
	rebuildTodayPunches,
	getAdmsLastSeen,
	markAdmsHeartbeatSeen,
	markAdmsCdataSeen,
	getNextAdmsCommand,
	reportAdmsCommandStatus,
	pullLogs,
	getRawBiometricLogs,
	rebuildAttendanceFromBiometricTimeline,
} = require('../controllers/biometricController');
const { protect, restrictTo } = require('../middleware/authMiddleware');

// Route-level manual parser removed because it is now applied as global middleware in server.js

const parseAdmsLine = (line) => {
	const trimmed = String(line || '').trim();
	if (!trimmed) return null;
	if (/^(OK|ID|Device|GET|POST|SN=)/i.test(trimmed)) return null;

	const parts = trimmed.split(/\t|,/).map((p) => p.trim()).filter(Boolean);
	if (parts.length < 2) return null;

	const empId = parts[0];
	if (!empId) return null;

	let timestamp = null;
	for (let i = 0; i < parts.length; i += 1) {
		if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/.test(parts[i])) {
			timestamp = parts[i].replace(' ', 'T');
			break;
		}
		if (
			i + 1 < parts.length &&
			/^\d{4}-\d{2}-\d{2}$/.test(parts[i]) &&
			/^\d{2}:\d{2}(:\d{2})?$/.test(parts[i + 1])
		) {
			timestamp = `${parts[i]}T${parts[i + 1]}`;
			break;
		}
	}

	if (!timestamp) return null;

	let type = null;
	const directionToken = parts.find((p) => /^(IN|OUT)$/i.test(p));
	if (directionToken) {
		type = directionToken.toUpperCase();
	} else {
		const statusToken = parts.find((p) => /^[01]$/.test(p));
		if (statusToken === '0') type = 'IN';
		if (statusToken === '1') type = 'OUT';
	}

	return { emp_id: empId, timestamp, type };
};

const getAdmsBodyText = (req) => {
	if (typeof req.body === 'string') return req.body;
	if (Buffer.isBuffer(req.body)) return req.body.toString('utf8');
	if (req.body && typeof req.body === 'object') {
		if (typeof req.body.data === 'string') return req.body.data;
		if (typeof req.body.table === 'string') return req.body.table;
	}
	return '';
};

// ADMS heartbeat endpoint (device polls this URL)
router.get('/getrequest', (req, res) => {
	const sn = req.query.SN || req.query.sn || null;
	console.log(`📡 Device polling /iclock/getrequest (SN: ${sn})...`);
	
	markAdmsHeartbeatSeen({
		sn,
		ip: req.ip,
	});

	res.set('Content-Type', 'text/plain');

	// Check for pending commands for this specific device
	if (sn) {
		const cmd = getNextAdmsCommand(sn);
		if (cmd) {
			console.log(`[BIOMETRIC] Delivering command to SN=${sn}: ${cmd}`);
			return res.send(cmd);
		}
	}

	// "" (empty string) triggers the device to switch from check mode to push mode
	res.send('OK');
});

// ADMS command result endpoint (device sends results here)
router.all('/devicecmd', (req, res) => {
	const sn = req.query.SN || req.query.sn || null;
	console.log(`📡 Device reporting command result (SN: ${sn})...`);
	
	const rawBody = getAdmsBodyText(req);
	const lines = String(rawBody || '').split(/\r?\n/).filter(Boolean);
	
	for (const line of lines) {
		// Example: ID=CMD_123&Return=0
		const parts = line.split('&');
		const idPart = parts.find(p => p.startsWith('ID='));
		const returnPart = parts.find(p => p.startsWith('Return='));
		
		if (idPart) {
			const id = idPart.split('=')[1];
			const code = returnPart ? returnPart.split('=')[1] : '0';
			reportAdmsCommandStatus(id, code === '0' ? 'completed' : 'failed');
		}
	}

	res.set('Content-Type', 'text/plain');
	res.send('OK');
});

// ADMS attendance payload endpoint (some devices use POST, some can hit GET)
const handleCdata = async (req, res) => {
	console.log("🔥 METHOD:", req.method);
	console.log("🔥 QUERY:", req.query);
	console.log("🔥 BODY:", req.body);
	markAdmsCdataSeen({
		sn: req.query.SN || req.query.sn || null,
		ip: req.ip,
	});

	try {
		const rawBody = getAdmsBodyText(req);
		const lines = String(rawBody || '')
			.split(/\r?\n/)
			.map((l) => l.trim())
			.filter(Boolean)
			.slice(0, 1000);

		const parsed = lines
			.map(parseAdmsLine)
			.filter(Boolean);

		if (parsed.length === 0) {
			const fallbackEmpId = String(req.query.PIN || req.query.pin || req.query.emp_id || '').trim();
			const fallbackStamp = String(req.query.DateTime || req.query.datetime || req.query.timestamp || '').trim();
			if (fallbackEmpId && fallbackStamp) {
				parsed.push({
					emp_id: fallbackEmpId,
					timestamp: fallbackStamp.replace(' ', 'T'),
					type: null,
				});
			}
		}

		const deviceId = String(req.query.SN || req.query.sn || req.query.device_id || req.query.DeviceID || 'ADMS').trim();
		let processed = 0;
		let failed = 0;

		const uniqueUserDates = new Set();

		for (const punch of parsed) {
			const mockReq = {
				body: {
					device_id: deviceId,
					emp_id: punch.emp_id,
					timestamp: punch.timestamp,
					type: punch.type,
					skipRebuild: true, // Optimization for batch ADMS push
				},
				app: req.app,
			};

			const mockRes = {
				statusCode: 200,
				status(code) { this.statusCode = code; return this; },
				json(payload) { this.payload = payload; return this; },
				send(payload) { this.payload = payload; return this; },
			};

			// receiveLog stores the punch log. 
			// We wrap it to track success.
			try {
				await receiveLog(mockReq, mockRes);
				if (mockRes.statusCode >= 200 && mockRes.statusCode < 300) {
					processed += 1;
					// Track (emp_id | date) to rebuild attendance later once
					const dateOnly = punch.timestamp.split('T')[0];
					uniqueUserDates.add(`${String(punch.emp_id).trim()}|${dateOnly}`);
				} else {
					failed += 1;
				}
			} catch (err) {
				failed += 1;
			}
		}

		// After all punches are stored, trigger a single rebuild per user/date
		for (const pairing of uniqueUserDates) {
			const [empId, dateStr] = pairing.split('|');
			try {
				await rebuildAttendanceFromBiometricTimeline(empId, dateStr);
			} catch (rebuildErr) {
				console.error(`Batch rebuild failed for ${empId} on ${dateStr}:`, rebuildErr.message);
			}
		}

		console.log(`ADMS cdata processed. device=${deviceId}, total=${parsed.length}, success=${processed}, failed=${failed}, rebuilds=${uniqueUserDates.size}`);
	} catch (err) {
		console.error('ADMS cdata processing error:', err.message);
	}

	res.set('Content-Type', 'text/plain');
	res.send('OK');
};
router.all('/cdata', handleCdata);

// Endpoint for biometric device to push data (No auth for device, but can add secret key check inside controller)
router.post('/log', receiveLog);

// Backfill today's manually entered attendance times into biometric live data
router.post('/backfill-today-from-attendance', protect, restrictTo('admin', 'management'), backfillTodayFromAttendance);
// Retroactively rebuild today's attendance from biometric logs (apply 9AM LOP rule)
router.post('/rebuild-today', rebuildTodayPunches);

// Endpoints for web frontend to fetch data
router.get('/data', protect, getBiometricData);
router.get('/raw-logs', protect, getRawBiometricLogs);
router.get('/stats', protect, getBiometricStats);
router.get('/emp-ids', getRegisteredEmpIds); // Internal utility for bridge filtering
router.get('/adms-last-seen', protect, restrictTo('admin'), getAdmsLastSeen);
router.post('/pull-logs', protect, restrictTo('admin'), pullLogs);

module.exports = router;
