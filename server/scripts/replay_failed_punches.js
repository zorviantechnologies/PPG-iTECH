const axios = require('axios');

const args = process.argv.slice(2);

const getArg = (name, fallback = '') => {
  const prefix = `--${name}=`;
  const found = args.find((a) => a.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
};

const apiUrl = getArg('url', 'http://localhost:5000/api/biometric/log');
const timestamp = getArg('timestamp', new Date().toISOString());
const type = getArg('type', 'IN').toUpperCase();
const deviceId = getArg('device', 'MAIN_DEVICE_01_RECOVERY');
const idsRaw = getArg('ids', '');

if (!idsRaw) {
  console.error('Missing required --ids argument (comma-separated emp IDs).');
  process.exit(1);
}

const ids = idsRaw
  .split(',')
  .map((x) => x.trim())
  .filter(Boolean);

(async () => {
  console.log(`Replaying ${ids.length} failed punch records...`);
  console.log(`API: ${apiUrl}`);
  console.log(`Timestamp: ${timestamp}`);
  console.log(`Type: ${type}`);

  const results = [];

  for (const empId of ids) {
    try {
      const res = await axios.post(apiUrl, {
        emp_id: empId,
        device_id: deviceId,
        timestamp,
        type,
      });

      results.push({ empId, status: res.status, ok: true, body: res.data });
      console.log(`OK  ${empId} -> ${res.status}`);
    } catch (err) {
      const status = err.response?.status || 0;
      const body = err.response?.data || { message: err.message };
      results.push({ empId, status, ok: false, body });
      console.log(`ERR ${empId} -> ${status} ${body?.message || err.message}`);
    }
  }

  const okCount = results.filter((r) => r.ok).length;
  const failCount = results.length - okCount;
  console.log(`Done. Success: ${okCount}, Failed: ${failCount}`);

  if (failCount > 0) {
    process.exitCode = 2;
  }
})();
