const ZKLib = require('zkteco-js');
const axios = require('axios');
require('dotenv').config();

async function sync() {
  const DEVICE_IP = '172.16.100.81';
  // Use absolute URL to be sure
  const SERVER_URL = `http://localhost:${process.env.PORT || 5000}/api/biometric/log`;
  
  console.log(`[SYNC] Connecting to device at ${DEVICE_IP}...`);
  const zkInstance = new ZKLib(DEVICE_IP, 4370, 10000, 4000);

  try {
    await zkInstance.createSocket();
    console.log(`[SYNC] ✅ Connected! Fetching all attendance logs...`);
    
    // getAttendances is the standard method in zkteco-js
    const logs = await zkInstance.getAttendances();
    console.log(`[SYNC] Total logs on device: ${logs.data ? logs.data.length : 'N/A'}`);

    if (!logs.data || logs.data.length === 0) {
        console.log("[SYNC] No logs returned from device.");
        process.exit(0);
    }

    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const todayLogs = logs.data.filter(l => {
        const d = new Date(l.recordTime);
        const logDateStr = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
        return logDateStr === todayStr;
    });

    console.log(`[SYNC] Found ${todayLogs.length} logs for today.`);

    let success = 0;
    let skipped = 0;

    for (const log of todayLogs) {
        try {
            const resp = await axios.post(SERVER_URL, {
                emp_id: log.deviceUserId,
                timestamp: log.recordTime,
                type: new Date(log.recordTime).getHours() < 12 ? 'IN' : 'OUT',
                skipDuplicateGuard: true, // Allow multiple punches for same user
                skipRebuild: true // Don't rebuild on every punch to save DB connections
            });
            if (resp.status === 200) success++;
            else skipped++;
        } catch (err) {
            skipped++;
        }
    }

    console.log(`[SYNC] Results: ${success} inserted/updated, ${skipped} existing/failed.`);
    
    // Final step: Trigger one global rebuild for today
    console.log("[SYNC] Triggering final attendance rebuild for today...");
    await axios.post(`http://localhost:${process.env.PORT || 5000}/api/biometric/rebuild-today`, {});
    
    console.log("[SYNC] COMPLETE.");
    process.exit(0);
  } catch (err) {
    console.error(`[SYNC] FATAL ERROR:`, err.message);
    process.exit(1);
  }
}

sync();
