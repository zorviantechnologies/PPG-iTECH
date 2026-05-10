const { pool, queryWithRetry } = require('../config/db');

const toIsoDate = (v) => String(v || '').slice(0, 10);
const getTodayIso = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
const getTotalDays = (from, to) => {
  const start = new Date(from);
  const end = new Date(to);
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) return 0;
  const diffTime = Math.abs(end - start);
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
};
const round2 = (v) => {
  const n = Number(v || 0);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
};

const BASIC_PERCENT = 55.2;
const ALLOWANCE_PERCENT = 36.8;
const CONVEYANCE_PERCENT = 8;

const normalizeStatusToken = (v) => String(v || '').trim().toLowerCase().replace(/\s+/g, ' ');
const isHalfDayMark = ({ statusText, remarksText }) => {
  const status = String(statusText || '').toLowerCase();
  const remarks = String(remarksText || '').toLowerCase();
  return (
    status.includes('half')
    || remarks.includes('half day')
    || remarks.includes('half-day')
    || remarks.includes('half')
    || remarks.includes('0.5')
    || remarks.includes('1/2')
  );
};

const classifyStatusUnits = ({ statusText, remarksText, paidSet, unpaidSet }) => {
  const rawStatus = String(statusText || '').trim();
  if (!rawStatus) return { paid: 0, unpaid: 0 };

  const half = isHalfDayMark({ statusText: rawStatus, remarksText });

  const tokenMatchesSet = (token, set) => {
    const norm = normalizeStatusToken(token);
    if (!norm) return false;
    if (set.has(norm)) return true;

    for (const s of set) {
      if (!s) continue;
      if (norm === s) return true;
      if (norm.includes(` ${s} `) || norm.startsWith(`${s} `) || norm.endsWith(` ${s}`)) return true;
    }
    return false;
  };

  const splitAndClassify = (parts, splitUnit) => parts.reduce((acc, token) => {
    if (tokenMatchesSet(token, paidSet)) acc.paid += splitUnit;
    if (tokenMatchesSet(token, unpaidSet)) acc.unpaid += splitUnit;
    return acc;
  }, { paid: 0, unpaid: 0 });

  if (rawStatus.includes('+')) {
    const parts = rawStatus.split('+').map((p) => String(p || '').trim()).filter(Boolean);
    const splitUnit = half ? 0.25 : 0.5;
    return splitAndClassify(parts, splitUnit);
  }

  if (/[\/,&]/.test(rawStatus)) {
    const parts = rawStatus.split(/[\/,&]/).map((p) => String(p || '').trim()).filter(Boolean);
    if (parts.length > 1) {
      const splitUnit = half ? 0.25 : 0.5;
      return splitAndClassify(parts, splitUnit);
    }
  }

  const unit = half ? 0.5 : 1;
  return {
    paid: tokenMatchesSet(rawStatus, paidSet) ? unit : 0,
    unpaid: tokenMatchesSet(rawStatus, unpaidSet) ? unit : 0
  };
};

const parseDeductionItems = (raw) => {
  if (!raw) return [];
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((d) => {
        const type = String(d?.type ?? d?.name ?? d?.label ?? '').trim();
        const code = String(d?.code ?? '').trim();
        const mode = String(d?.mode ?? '').trim().toLowerCase();
        const amountRaw = d?.amount ?? d?.value ?? d?.deductionAmount ?? d?.deduction_amount ?? 0;
        const amount = parseFloat(String(amountRaw).replace(/,/g, '')) || 0;
        return { type, code, mode, amount };
      })
      .filter((d) => d.type || d.code);
  } catch {
    return [];
  }
};

const computeEmployeeEsi = ({ grossSalary, conveyance }) => {
  const gross = Number(grossSalary || 0);
  const conv = Number(conveyance || 0);
  if (!Number.isFinite(gross) || gross <= 0) return { esiGross: 0, employeeEsi: 0 };
  if (gross > 20000) return { esiGross: 0, employeeEsi: 0 };
  const esiGross = Math.max(0, gross - (Number.isFinite(conv) ? conv : 0));
  const employeeEsi = esiGross * 0.0075;
  return { esiGross: round2(esiGross), employeeEsi: round2(employeeEsi) };
};

const computeDeductions = ({ rawDeductions, grossSalary, conveyance }) => {
  const items = parseDeductionItems(rawDeductions);
  let manualTotal = 0;
  let hasAutoEmployeeEsi = false;

  items.forEach((d) => {
    const label = String(d.type || '').toLowerCase();
    const code = String(d.code || '').toUpperCase();
    const mode = String(d.mode || '').toLowerCase();

    const looksLikeEmployeeEsi = code === 'EMPLOYEE_ESI' || label.includes('employee esi') || label === 'esi';
    if (looksLikeEmployeeEsi) {
      if (mode === 'manual') manualTotal += Number(d.amount || 0) || 0;
      else hasAutoEmployeeEsi = true;
      return;
    }

    manualTotal += Number(d.amount || 0) || 0;
  });

  const { esiGross, employeeEsi } = hasAutoEmployeeEsi
    ? computeEmployeeEsi({ grossSalary, conveyance })
    : { esiGross: 0, employeeEsi: 0 };

  const total = round2(Math.max(0, manualTotal) + Math.max(0, employeeEsi));
  return { total, esiGross, employeeEsi };
};

const computeSalaryMetrics = ({ monthlySalary, rawDeductions, totalDaysInPeriod, payableDays, unpaidDays }) => {
  const fixedSalary = parseFloat(String(monthlySalary || 0).replace(/,/g, '')) || 0;
  const divisor = totalDaysInPeriod > 0 ? totalDaysInPeriod : 1;
  const normalizedPayable = Math.max(0, Math.min(divisor, Number(payableDays || 0)));

  const dailySalary = fixedSalary / divisor;
  const earnedSalary = dailySalary * normalizedPayable;

  const basicSalary = earnedSalary * (BASIC_PERCENT / 100);
  const allowance = earnedSalary * (ALLOWANCE_PERCENT / 100);
  const conveyance = earnedSalary * (CONVEYANCE_PERCENT / 100);
  const grossSalary = basicSalary + allowance + conveyance;

  const computed = computeDeductions({ rawDeductions, grossSalary, conveyance });
  const deductionsApplied = Math.max(0, Number(computed.total || 0));
  const lopDays = Math.max(0, Number(unpaidDays || 0));
  const netSalary = Math.max(0, grossSalary - deductionsApplied);

  return {
    fixedSalary,
    dailySalary,
    earnedSalary,
    grossSalary,
    payableDays: normalizedPayable,
    lopDays,
    deductionsApplied,
    netSalary,
    esiGross: computed.esiGross || 0,
    employeeEsi: computed.employeeEsi || 0
  };
};

async function aggregateForPeriod({ empId, fromDate, toDate, paidSet, unpaidSet }) {
  const effectiveTo = toIsoDate(toDate) > getTodayIso() ? getTodayIso() : toIsoDate(toDate);
  const effectiveTotalDays = getTotalDays(fromDate, effectiveTo);

  const { rows } = await queryWithRetry(
    `WITH RECURSIVE date_range AS (
       SELECT $2::date AS d
       UNION ALL
       SELECT (d + 1)::date FROM date_range WHERE d < $3::date
     ),
     calendar_days AS (
       SELECT
         dr.d,
         COALESCE(h.type, CASE WHEN EXTRACT(DOW FROM dr.d) IN (0, 6) THEN 'Weekend' ELSE 'Working Day' END) AS day_type
       FROM date_range dr
       LEFT JOIN holidays h ON h.h_date = dr.d
     )
     SELECT
       cd.d AS date,
       cd.day_type,
       ar.status::text AS status,
       COALESCE(ar.remarks, '') AS remarks
     FROM calendar_days cd
     LEFT JOIN attendance_records ar
       ON TRIM(ar.emp_id) = TRIM($1)
      AND ar.date = cd.d
     ORDER BY cd.d`,
    [empId, fromDate, effectiveTo]
  );

  const presentMarkers = new Set(['present', 'p']);
  let presentDays = 0;
  let withPayDays = 0;
  let withoutPayDays = 0;
  let totalPayableDays = 0;

  for (const r of rows) {
    const resolvedStatus = (() => {
      const dayType = normalizeStatusToken(r.day_type);
      const rawStatus = String(r.status || '').trim();
      const normStatus = normalizeStatusToken(rawStatus);

      if (dayType.includes('holiday') && (!normStatus || normStatus === 'absent' || normStatus === 'lop')) return 'Holiday';
      if (dayType === 'weekend' && (!normStatus || normStatus === 'absent' || normStatus === 'lop')) return 'Weekend';

      if (rawStatus) return rawStatus;
      return 'Absent';
    })();

    const { paid, unpaid } = classifyStatusUnits({
      statusText: resolvedStatus,
      remarksText: r.remarks,
      paidSet,
      unpaidSet
    });

    if (paid > 0) {
      const rawStatus = String(resolvedStatus || '').trim();
      let presentPortion = 0;

      if (rawStatus.includes('+') || /[\/,&]/.test(rawStatus)) {
        const sep = rawStatus.includes('+') ? '+' : /[\/,&]/;
        const parts = rawStatus.split(sep).map((p) => String(p || '').trim()).filter(Boolean);
        const perPart = paid / Math.max(parts.length, 1);
        parts.forEach((part) => {
          if (presentMarkers.has(normalizeStatusToken(part))) presentPortion += perPart;
        });
      } else if (presentMarkers.has(normalizeStatusToken(rawStatus))) {
        presentPortion = paid;
      }

      presentDays += presentPortion;
      withPayDays += (paid - presentPortion);
      totalPayableDays += paid;
    }

    if (unpaid > 0) {
      withoutPayDays += unpaid;
    }
  }

  const normalizedPayable = round2(Math.max(0, Math.min(effectiveTotalDays, totalPayableDays)));
  const normalizedWithoutPay = round2(Math.max(0, effectiveTotalDays - normalizedPayable));

  return {
    present_days: round2(presentDays),
    // With pay should represent total payable days (present + payable leave/holiday)
    with_pay_days: normalizedPayable,
    without_pay_days: normalizedWithoutPay,
    total_payable_days: normalizedPayable
  };
}

function normalizePeriod(row) {
  const hasDates = row.from_date && row.to_date;
  if (hasDates) {
    return { fromDate: toIsoDate(row.from_date), toDate: toIsoDate(row.to_date) };
  }

  const y = Number(row.year) || new Date().getFullYear();
  const m = Number(row.month) || (new Date().getMonth() + 1);
  const to = new Date(y, m - 1, 25);
  const from = new Date(y, m - 2, 26);
  return { fromDate: toIsoDate(from), toDate: toIsoDate(to) };
}

async function run() {
  const cliStartArg = Number(process.argv[2] || 0) || 0;
  const envStartArg = Number(process.env.START_ID || 0) || 0;
  const startId = Math.max(cliStartArg, envStartArg, 0);

  const paidStatuses = ['Present', 'CL', 'ML', 'Comp Leave', 'OD', 'Leave', 'Holiday', 'Weekend'];
  const unpaidStatuses = ['Absent', 'LOP'];
  const paidSet = new Set([...paidStatuses, 'Holiday', 'Weekend'].map(normalizeStatusToken));
  const unpaidSet = new Set(unpaidStatuses.map(normalizeStatusToken));

  console.log(`Starting salary_records backfill from attendance... startId=${startId}`);

  const processTable = async (tableName) => {
    const { rows: records } = await queryWithRetry(`
            SELECT s.id, s.emp_id, s.month, s.year, s.from_date, s.to_date,
              s.calculated_salary, s.deductions_applied, s.esi_gross, s.employee_esi, s.gross_salary,
             u.monthly_salary, u.deductions
      FROM ${tableName} s
      LEFT JOIN users u ON TRIM(u.emp_id) = TRIM(s.emp_id)
      WHERE s.id >= $1
      ORDER BY s.id ASC
    `, [startId]);

    let updated = 0;
    let skipped = 0;
    let failed = 0;
    let lastProcessedId = startId;

    for (const row of records) {
      try {
        if (!row.emp_id) {
          lastProcessedId = row.id;
          skipped += 1;
          continue;
        }

        const { fromDate, toDate } = normalizePeriod(row);
        const effectiveToDate = toIsoDate(toDate) > getTodayIso() ? getTodayIso() : toIsoDate(toDate);
        const totalDaysInPeriod = getTotalDays(fromDate, effectiveToDate);
        const breakdown = await aggregateForPeriod({
          empId: String(row.emp_id).trim(),
          fromDate,
          toDate,
          paidSet,
          unpaidSet
        });

        const hasSalaryMaster = row.monthly_salary != null;
        const metrics = hasSalaryMaster
          ? computeSalaryMetrics({
              monthlySalary: Number(row.monthly_salary || 0),
              rawDeductions: row.deductions,
              totalDaysInPeriod,
              payableDays: breakdown.total_payable_days,
              unpaidDays: breakdown.without_pay_days
            })
          : {
              netSalary: Number(row.calculated_salary || 0),
              deductionsApplied: Number(row.deductions_applied || 0),
              esiGross: Number(row.esi_gross || 0),
              employeeEsi: Number(row.employee_esi || 0),
              grossSalary: Number(row.gross_salary || 0)
            };

        await queryWithRetry(
          `UPDATE ${tableName}
           SET total_present = $2,
               total_leave = $3,
               total_lop = $4,
               calculated_salary = $5,
               with_pay_count = $6,
               without_pay_count = $7,
               deductions_applied = $8,
               esi_gross = $9,
               employee_esi = $10,
               gross_salary = $11,
               total_days_in_period = $12,
               from_date = $13::date,
               to_date = $14::date,
               present_days = $15,
               with_pay_days = $16,
               without_pay_days = $17,
               total_payable_days = $18
           WHERE id = $1`,
          [
            row.id,
            breakdown.present_days,
            breakdown.with_pay_days,
            breakdown.without_pay_days,
            metrics.netSalary.toFixed(2),
            breakdown.with_pay_days,
            breakdown.without_pay_days,
            metrics.deductionsApplied.toFixed(2),
            metrics.esiGross.toFixed(2),
            metrics.employeeEsi.toFixed(2),
            metrics.grossSalary.toFixed(2),
            totalDaysInPeriod,
            fromDate,
            toDate,
            breakdown.present_days,
            breakdown.with_pay_days,
            breakdown.without_pay_days,
            breakdown.total_payable_days
          ]
        );

        lastProcessedId = row.id;
        updated += 1;
      } catch (err) {
        console.error(`[${tableName}] Resume from id=${row.id} with: node scripts/backfill_salary_records_from_attendance.js ${row.id}`);
        failed += 1;
        console.error(`Failed ${tableName} row id=${row.id} emp_id=${row.emp_id}:`, err.message);
      }
    }

    console.log(`${tableName} backfill completed. updated=${updated}, skipped=${skipped}, failed=${failed}, lastProcessedId=${lastProcessedId}`);
  };

  await processTable('salary_records');
  await processTable('salary_history');

  const consistencyCheck = await queryWithRetry(`
    SELECT COUNT(*)::int AS inconsistent
    FROM salary_records s
    WHERE abs(coalesce(s.with_pay_days,0) - coalesce(s.total_payable_days,0)) > 0.01
       OR abs(coalesce(s.with_pay_count,0) - coalesce(s.with_pay_days,0)) > 0.01
       OR abs(coalesce(s.without_pay_count,0) - coalesce(s.without_pay_days,0)) > 0.01
       OR abs((coalesce(s.with_pay_days,0) + coalesce(s.without_pay_days,0)) - coalesce(s.total_days_in_period,0)) > 0.01
  `);

  console.log('Post-backfill internal consistency issues (salary_records):', consistencyCheck.rows[0]?.inconsistent ?? 0);
}

run()
  .catch((err) => {
    console.error('Backfill script failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
