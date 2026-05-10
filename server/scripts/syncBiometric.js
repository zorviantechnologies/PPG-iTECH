const ZKLib = require('zkteco-js');

/**
 * Syncs attendance data from a physical ZKteco device to the server API.
 * This script now supports filtering for a SPECIFIC DATE or all dates.
 * 
 * @param {string} deviceIp - Device IP Address
 * @param {string} targetDate - Optional (Format: 'YYYY-MM-DD'). If null, syncs ALL logs.
 * @param {number} devicePort - Default ZK port is 4370
 */
async function syncBiometricDevice(deviceIp, targetDate = null, devicePort = 4370) {
    const zk = new ZKLib(deviceIp, devicePort, 10000, 4000);
    
    try {
        console.log(`[SYNC] 📡 Connecting to device at ${deviceIp}:${devicePort}...`);
        await zk.createSocket();
        console.log('[SYNC] ✅ Connected successfully.');

        // 1. Fetch all attendance logs from device memory
        console.log('[SYNC] 📥 Retrieving logs from memory...');
        const logs = await zk.getAttendances();

        if (!logs || !logs.data || logs.data.length === 0) {
            console.log('[SYNC] ⚠️ No logs found on device.');
            return;
        }

        // 2. Filter for specific date if provided
        let logsToProcess = logs.data;
        if (targetDate) {
            console.log(`[SYNC] 🔍 Filtering logs for DATE: ${targetDate}`);
            logsToProcess = logs.data.filter(log => {
                const logDate = new Date(log.recordTime).toLocaleDateString('en-CA'); // YYYY-MM-DD
                return logDate === targetDate;
            });
        }

        console.log(`[SYNC] 📊 Total logs to process after filtering: ${logsToProcess.length}`);

        if (logsToProcess.length === 0) {
            console.log('[SYNC] ⚠️ No logs to process for the specified criteria.');
            return;
        }

        // 3. Push logs to server API
        console.log('[SYNC] 🚀 Pushing logs to server...');
        let success = 0;
        let errors = 0;
        
        // Track unique dates to rebuild at the end (optimization)
        const uniqueDates = new Set();
        if (targetDate) uniqueDates.add(targetDate);

        for (const log of logsToProcess) {
            try {
                const recordTime = log.recordTime; 
                if (!targetDate) {
                    const dateKey = new Date(recordTime).toLocaleDateString('en-CA');
                    uniqueDates.add(dateKey);
                }

                const response = await fetch('http://localhost:5000/api/biometric/log', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        user_id: log.deviceUserId, 
                        timestamp: recordTime,
                        device_ip: deviceIp,
                        skipRebuild: true // OPTIMIZATION: Don't rebuild DB for every single log
                    })
                });

                if (response.ok) {
                    success++;
                } else {
                    const errTxt = await response.text();
                    console.warn(`[SYNC] Failed to push log for user ${log.deviceUserId} at ${recordTime} (Code: ${response.status}): ${errTxt}`);
                    errors++;
                }
            } catch (err) {
                console.error(`[SYNC] Error pushing log:`, err.message);
                errors++;
            }

            if ((success + errors) % 50 === 0) {
                console.log(`[SYNC] Progress: ${success + errors}/${logsToProcess.length}...`);
            }
        }

        console.log(`[SYNC] Finished pushing logs. Success: ${success}, Errors: ${errors}`);

        // 4. Trigger a full rebuild for the affected dates to update attendance summaries correctly
        if (uniqueDates.size > 0) {
            const datesArray = Array.from(uniqueDates).sort();
            const fromDate = datesArray[0];
            const toDate = datesArray[datesArray.length - 1];

            console.log(`[SYNC] 🔄 Triggering attendance rebuild for ${uniqueDates.size} dates (Range: ${fromDate} to ${toDate})...`);
            
            try {
                const rebuildResponse = await fetch('http://localhost:5000/api/biometric/rebuild-today', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ fromDate, toDate })
                });
                
                if (rebuildResponse.ok) {
                    console.log(`[SYNC] Attendance summaries updated successfully via rebuild-range API.`);
                } else {
                    console.error('[SYNC] Failed to trigger attendance rebuild.');
                }
            } catch (rebuildErr) {
                console.error('[SYNC] Error during rebuild trigger:', rebuildErr.message);
            }
        }

    } catch (e) {
        console.error('[SYNC] ❌ Fatal error during sync:', e.message);
    } finally {
        try {
            await zk.disconnect();
        } catch (e) {}
    }
}

// Example usage patterns:
// ---------------------------------
// syncBiometricDevice('172.16.100.81');               // Sync ALL available device history
// syncBiometricDevice('172.16.100.81', '2026-03-29'); // Sync only a specific date

module.exports = { syncBiometricDevice };
