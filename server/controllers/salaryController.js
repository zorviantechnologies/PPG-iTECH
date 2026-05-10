const { pool, queryWithRetry } = require('../config/db');

// Helper: count working days in a date range excluding weekends
// Helper: count total calendar days in a date range
const getTotalDays = (from, to) => {
    const start = new Date(from);
    const end = new Date(to);
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) return 0;
    const diffTime = Math.abs(end - start);
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
};

const toIsoDate = (v) => String(v || '').slice(0, 10);

const getTodayIso = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

const getEffectiveCalcTo = (toDate) => {
    const today = getTodayIso();
    return toIsoDate(toDate) > today ? today : toIsoDate(toDate);
};

const isInstitutionWideRole = (role) => ['admin', 'management'].includes(String(role || '').toLowerCase());

const buildPeriod = ({ month, year, fromDate, toDate }) => {
    const y = parseInt(year, 10);
    const m = parseInt(month, 10);
    if (fromDate && toDate) {
        return {
            fromDate: toIsoDate(fromDate),
            toDate: toIsoDate(toDate),
            month: new Date(toDate).getMonth() + 1,
            year: new Date(toDate).getFullYear()
        };
    }

    const safeYear = Number.isFinite(y) ? y : new Date().getFullYear();
    const safeMonth = Number.isFinite(m) ? m : (new Date().getMonth() + 1);

    // Dynamic Cycle: 26th of previous month to 25th of current month
    const to = new Date(safeYear, safeMonth - 1, 25);
    const from = new Date(safeYear, safeMonth - 2, 26);

    return {
        fromDate: toIsoDate(from.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })),
        toDate: toIsoDate(to.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })),
        month: safeMonth,
        year: safeYear
    };
};

const parseDeductions = (raw) => {
    try {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (!Array.isArray(parsed)) return 0;
        return parsed.reduce((sum, d) => {
            const amount = d?.amount ?? d?.value ?? d?.deductionAmount ?? d?.deduction_amount ?? 0;
            const numeric = parseFloat(String(amount).replace(/,/g, '')) || 0;
            return sum + numeric;
        }, 0);
    } catch {
        return 0;
    }
};

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

        // Support labels like "Morning LOP", "Evening Present", "Present (PM)", etc.
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

    // Also support separators like '/', '&', ',' in mixed-day statuses.
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

const round2 = (v) => {
    const n = Number(v || 0);
    if (!Number.isFinite(n)) return 0;
    return Math.round(n * 100) / 100;
};

const computeEmployeeEsi = ({ grossSalary, conveyance }) => {
    const gross = Number(grossSalary || 0);
    const conv = Number(conveyance || 0);
    if (!Number.isFinite(gross) || gross <= 0) return { esiGross: 0, employeeEsi: 0 };

    // Rule: Apply only when Gross ≤ 20000
    if (gross > 20000) return { esiGross: 0, employeeEsi: 0 };

    // Formula:
    // ESI Gross = Gross - Conveyance
    // Employee ESI = ESI Gross * 0.75%
    const esiGross = Math.max(0, gross - (Number.isFinite(conv) ? conv : 0));
    const employeeEsi = esiGross * 0.0075;
    return {
        esiGross: round2(esiGross),
        employeeEsi: round2(employeeEsi)
    };
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
            // If explicitly marked manual, treat as a normal fixed deduction amount.
            if (mode === 'manual') {
                manualTotal += Number(d.amount || 0) || 0;
            } else {
                hasAutoEmployeeEsi = true;
            }
            return;
        }

        manualTotal += Number(d.amount || 0) || 0;
    });

    const { esiGross, employeeEsi } = hasAutoEmployeeEsi
        ? computeEmployeeEsi({ grossSalary, conveyance })
        : { esiGross: 0, employeeEsi: 0 };

    const total = round2(Math.max(0, manualTotal) + Math.max(0, employeeEsi));
    return {
        total,
        esiGross,
        employeeEsi
    };
};

const BASIC_PERCENT = 55.2;
const ALLOWANCE_PERCENT = 36.8;
const CONVEYANCE_PERCENT = 8;

const ensureSalarySchema = async () => {
    await queryWithRetry(`
        ALTER TABLE salary_records
        ADD COLUMN IF NOT EXISTS with_pay_count NUMERIC(10, 2) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS without_pay_count NUMERIC(10, 2) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS deductions_applied NUMERIC(12, 2) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS esi_gross NUMERIC(12, 2) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS employee_esi NUMERIC(12, 2) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS gross_salary NUMERIC(12, 2) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS total_days_in_period INTEGER DEFAULT 0,
        ADD COLUMN IF NOT EXISTS from_date DATE,
        ADD COLUMN IF NOT EXISTS to_date DATE,
        ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP,
        ADD COLUMN IF NOT EXISTS present_days NUMERIC(10, 2) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS with_pay_days NUMERIC(10, 2) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS without_pay_days NUMERIC(10, 2) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS total_payable_days NUMERIC(10, 2) DEFAULT 0
    `);

    await queryWithRetry(`
        CREATE TABLE IF NOT EXISTS salary_history (
            id SERIAL PRIMARY KEY,
            source_salary_id INTEGER,
            emp_id VARCHAR(50) NOT NULL,
            month INTEGER,
            year INTEGER,
            total_present NUMERIC(10, 2),
            total_leave NUMERIC(10, 2),
            total_lop NUMERIC(10, 2),
            calculated_salary NUMERIC(12, 2),
            status VARCHAR(30),
            with_pay_count NUMERIC(10, 2),
            without_pay_count NUMERIC(10, 2),
            deductions_applied NUMERIC(12, 2),
            esi_gross NUMERIC(12, 2),
            employee_esi NUMERIC(12, 2),
            gross_salary NUMERIC(12, 2),
            total_days_in_period INTEGER,
            from_date DATE,
            to_date DATE,
            paid_at TIMESTAMP,
            archived_at TIMESTAMP DEFAULT NOW(),
            present_days NUMERIC(10, 2) DEFAULT 0,
            with_pay_days NUMERIC(10, 2) DEFAULT 0,
            without_pay_days NUMERIC(10, 2) DEFAULT 0,
            total_payable_days NUMERIC(10, 2) DEFAULT 0
        )
    `);

    await queryWithRetry(`
        ALTER TABLE salary_history
        ADD COLUMN IF NOT EXISTS esi_gross NUMERIC(12, 2) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS employee_esi NUMERIC(12, 2) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS present_days NUMERIC(10, 2) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS with_pay_days NUMERIC(10, 2) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS without_pay_days NUMERIC(10, 2) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS total_payable_days NUMERIC(10, 2) DEFAULT 0
    `);

    await queryWithRetry(`
        CREATE TABLE IF NOT EXISTS salary_reports (
            id SERIAL PRIMARY KEY,
            emp_id VARCHAR(50) NOT NULL,
            report_type VARCHAR(80) NOT NULL,
            reason TEXT NOT NULL,
            status VARCHAR(30) DEFAULT 'Open',
            admin_reply TEXT,
            replied_by VARCHAR(50),
            replied_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT NOW()
        )
    `);
};

// Categorise a single status token as: 'present', 'withpay', 'withoutpay', or 'other'
const classifyStatusCategory = (statusText, remarksText, paidSet, unpaidSet) => {
    const norm = normalizeStatusToken(statusText);
    // Present markers
    const presentMarkers = new Set(['present', 'p']);
    if (presentMarkers.has(norm)) return 'present';
    // Unpaid / LOP markers
    if (unpaidSet.has(norm)) return 'withoutpay';
    // Everything else in paid set = With Pay (CL, ML, OD, Holiday, Leave, etc.)
    if (paidSet.has(norm)) return 'withpay';
    return 'other';
};

const getAttendanceAggregateMap = async ({ fromDate, toDate, paidStatuses, unpaidStatuses }) => {
    try {
        const query = `
            WITH RECURSIVE date_range AS (
                SELECT $1::date as d
                UNION ALL
                SELECT (d + 1)::date FROM date_range 
                WHERE d < $2::date
            ),
            calendar_days AS (
                SELECT
                    dr.d,
                    COALESCE(h.type, CASE WHEN EXTRACT(DOW FROM dr.d) IN (0, 6) THEN 'Weekend' ELSE 'Working Day' END) AS day_type
                FROM date_range dr
                LEFT JOIN holidays h ON h.h_date = dr.d
            )
            SELECT
                TRIM(u.emp_id) AS emp_id,
                cd.d AS date,
                cd.day_type,
                ar.status::text AS status,
                COALESCE(ar.remarks, '') AS remarks
            FROM users u
            CROSS JOIN calendar_days cd
            LEFT JOIN attendance_records ar ON TRIM(ar.emp_id) = TRIM(u.emp_id) AND ar.date = cd.d
            WHERE u.role IN ('staff', 'hod', 'principal')
            ORDER BY TRIM(u.emp_id), cd.d
        `;
        const { rows } = await queryWithRetry(query, [fromDate, toDate]);

        const paidSet = new Set((Array.isArray(paidStatuses) ? paidStatuses : []).map(normalizeStatusToken));
        const unpaidSet = new Set((Array.isArray(unpaidStatuses) ? unpaidStatuses : []).map(normalizeStatusToken));

        // Tokens that unambiguously mean physically present (not leave / holiday)
        const presentMarkers = new Set(['present', 'p']);

        const map = {};
        rows.forEach((r) => {
            const key = String(r.emp_id || '').trim();
            if (!key) return;
            if (!map[key]) {
                map[key] = {
                    present_days: 0,
                    with_pay_days: 0,
                    without_pay_days: 0,
                    payable_days: 0,
                    unpaid_days: 0,
                    total_records: 0
                };
            }

            // classifyStatusUnits is the battle-tested fuzzy-matching source of truth.
            // It correctly handles OD, Comp Leave, half-days, separators, prefix/suffix labels, etc.
            const resolvedStatus = (() => {
                const dayType = normalizeStatusToken(r.day_type);
                const rawStatus = String(r.status || '').trim();
                const normStatus = normalizeStatusToken(rawStatus);

                // Calendar holidays/weekends are always payable for salary counts.
                // If an auto-generated/default row marked Absent/LOP exists, override it.
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

            // ── Granular breakdown: distribute paid units into present vs with_pay ──
            // We use the SAME paid amount from classifyStatusUnits so totals always match.
            if (paid > 0) {
                const rawStatus = String(resolvedStatus || '').trim();
                let presentPortion = 0;

                if (rawStatus.includes('+') || /[\/,&]/.test(rawStatus)) {
                    // Compound status e.g. "Present+LOP", "CL/Present"
                    const sep = rawStatus.includes('+') ? '+' : /[\/,&]/;
                    const parts = rawStatus.split(sep).map((p) => String(p || '').trim()).filter(Boolean);
                    const perPart = paid / Math.max(parts.length, 1);
                    parts.forEach((part) => {
                        if (presentMarkers.has(normalizeStatusToken(part))) {
                            presentPortion += perPart;
                        }
                    });
                } else {
                    if (presentMarkers.has(normalizeStatusToken(rawStatus))) {
                        presentPortion = paid;
                    }
                }

                map[key].present_days  += presentPortion;
                map[key].with_pay_days += round2(paid - presentPortion);
            }

            // ── Unpaid days (LOP / Absent) ──
            if (unpaid > 0) {
                map[key].without_pay_days += unpaid;
            }

            // ── Running totals straight from classifyStatusUnits (never overwritten) ──
            map[key].payable_days += paid;
            map[key].unpaid_days  += unpaid;

            if (normalizeStatusToken(resolvedStatus) !== 'absent') {
                map[key].total_records += 1;
            }
        });

        Object.keys(map).forEach((key) => {
            map[key].present_days     = round2(map[key].present_days);
            map[key].with_pay_days    = round2(map[key].with_pay_days);
            map[key].without_pay_days = round2(map[key].without_pay_days);
            map[key].payable_days     = round2(map[key].payable_days);  // === present + with_pay
            map[key].unpaid_days      = round2(map[key].unpaid_days);   // === without_pay
        });

        return map;
    } catch (error) {
        console.error('getAttendanceAggregateMap ERROR:', error);
        return {};
    }
};

const computeSalaryMetrics = ({ monthlySalary, rawDeductions, deductions, workingDaysInPeriod, payableDays, unpaidDays }) => {
    const fixedSalary = parseFloat(String(monthlySalary || 0).replace(/,/g, '')) || 0;
    const totalDays = Number(workingDaysInPeriod || 0);
    const divisor = totalDays > 0 ? totalDays : 1;
    const normalizedPayable = Math.max(0, Math.min(divisor, Number(payableDays || 0)));

    // Step 1: Earned Salary = (Fixed Salary / Total Days) * Pay Days
    const dailySalary = fixedSalary / divisor;
    const earnedSalary = dailySalary * normalizedPayable;

    // Step 2: Gross Salary split from earned salary.
    const basicSalary = earnedSalary * (BASIC_PERCENT / 100);
    const allowance = earnedSalary * (ALLOWANCE_PERCENT / 100);
    const conveyance = earnedSalary * (CONVEYANCE_PERCENT / 100);
    const grossSalary = basicSalary + allowance + conveyance;

    // Step 3 and 4: Net Salary = Gross Salary - Total Deduction
    const computed = rawDeductions
        ? computeDeductions({ rawDeductions, grossSalary, conveyance })
        : { total: Math.max(0, Number(deductions || 0)), esiGross: 0, employeeEsi: 0 };
    const deductionsApplied = Math.max(0, Number(computed.total || 0));
    const lopDays = Math.max(0, Number(unpaidDays || 0));
    const netSalary = Math.max(0, grossSalary - deductionsApplied);

    return {
        fixedSalary,
        dailySalary,
        earnedSalary,
        basicSalary,
        allowance,
        conveyance,
        grossSalary,
        payableDays: normalizedPayable,
        lopDays,
        deductionsApplied,
        netSalary,
        esiGross: computed.esiGross || 0,
        employeeEsi: computed.employeeEsi || 0
    };
};

const resolvePayableDaysFromAttendanceStats = (stats) => {
    // payable = present + with_pay (calculated in aggregator)
    const payable = Number(stats?.payable_days || 0);
    return Math.max(0, payable);
};

const resolveBreakdownFromStats = (stats, totalDaysInPeriod = 0) => {
    const totalDays = Math.max(0, Number(totalDaysInPeriod || 0));
    const presentDays = Math.max(0, round2(Number(stats?.present_days || 0)));
    const rawWithPayDays = Math.max(0, round2(Number(stats?.with_pay_days || 0)));

    // Keep present + with_pay as payable signal, but hard-normalize to period bounds.
    const payable = round2(Math.max(0, Math.min(totalDays || Number.MAX_SAFE_INTEGER, presentDays + rawWithPayDays)));

    // Critical invariant: with pay + without pay must equal total days in period.
    const withoutPay = totalDays > 0
        ? round2(Math.max(0, totalDays - payable))
        : Math.max(0, round2(Number(stats?.without_pay_days || stats?.unpaid_days || 0)));

    return {
        present_days: presentDays,
        // With pay should represent total payable days in live period (present + payable leave/holiday)
        with_pay_days: payable,
        without_pay_days: withoutPay,
        total_payable_days: payable
    };
};

// @desc    Calculate Salary (supports exact date range)
// @route   POST /api/salary/calculate
// @access  Private (Admin)
exports.calculateSalary = async (req, res) => {
    const {
        month,
        year,
        emp_id,
        forceRecalculateAll = false,
        paidStatuses = ['Present', 'CL', 'ML', 'Comp Leave', 'OD', 'Leave', 'Holiday'],
        unpaidStatuses = ['Absent', 'LOP'],
        fromDate,
        toDate
    } = req.body;

    try {
        const effectivePaidStatuses = Array.from(new Set([...(Array.isArray(paidStatuses) ? paidStatuses : []), 'Holiday', 'Weekend']));
        await ensureSalarySchema();
        const period = buildPeriod({ month, year, fromDate, toDate });
        const rangeFrom = period.fromDate;
        const rangeTo = period.toDate;
        const effectiveCalcTo = getEffectiveCalcTo(rangeTo);
        
        // Use live calendar days for ongoing periods (from cycle start to today).
        const totalDaysInPeriod = getTotalDays(rangeFrom, effectiveCalcTo);

        // 1. Fetch all eligible employees
        let usersQuery = `
            SELECT id, emp_id, name, monthly_salary, role, deductions
            FROM users
            WHERE LOWER(role::text) IN ('principal', 'hod', 'staff')
        `;
        const usersParams = [];
        if (emp_id) {
            usersQuery += ' AND TRIM(emp_id) = $1';
            usersParams.push(emp_id.trim());
        }
        const { rows: users } = await pool.query(usersQuery, usersParams);
        if (users.length === 0) {
            return res.json({ message: 'No eligible employees found', results: [] });
        }

        // 2. Fetch attendance aggregate within exact date range
        const statsMap = await getAttendanceAggregateMap({
            fromDate: rangeFrom,
            toDate: effectiveCalcTo,
            paidStatuses: effectivePaidStatuses,
            unpaidStatuses
        });

        // 3. Calculate and persist. Paid records are archived to history and reset to Pending.
        const results = [];
        for (const user of users) {
            const userEmpId = (user.emp_id || '').trim();
            if (!userEmpId) continue;

            // Fetch latest salary record for this period (exact date first, then month/year fallback)
            const { rows: existing } = await pool.query(
                                `SELECT id, status, paid_at
                                 FROM salary_records
                                 WHERE TRIM(emp_id) = $1
                                     AND (
                                                (from_date IS NOT NULL AND to_date IS NOT NULL AND from_date::date = $2::date AND to_date::date = $3::date)
                                                OR (month = $4 AND year = $5)
                                     )
                                 ORDER BY
                                     CASE WHEN (from_date IS NOT NULL AND to_date IS NOT NULL AND from_date::date = $2::date AND to_date::date = $3::date) THEN 0 ELSE 1 END,
                                     id DESC
                                 LIMIT 1`,
                                [userEmpId, rangeFrom, rangeTo, period.month, period.year]
            );

            // Skip recalculation if the record is already Paid (Published)
            // As per user request: "salry publish after admin page not change the published salary"
            if (existing.length > 0 && existing[0].status === 'Paid' && !forceRecalculateAll) {
                results.push({
                    emp_id: userEmpId,
                    name: user.name,
                    status: 'Paid',
                    message: 'Already Published (Skipped)'
                });
                continue;
            }

            const stats = statsMap[userEmpId] || {
                present_days: 0, with_pay_days: 0, without_pay_days: 0,
                payable_days: 0, unpaid_days: 0, total_records: 0
            };
            const breakdown = resolveBreakdownFromStats(stats, totalDaysInPeriod);
            const resolvedPayableDays = breakdown.total_payable_days; // present + with_pay
            const unpaidDays = breakdown.without_pay_days;

            // If zero attendance data AND no existing record → skip silently.
            // If an existing Pending record exists but attendance is now zero → still update it
            // so it reflects the latest (cleared) attendance rather than stale data.
            const hasAnyData = resolvedPayableDays > 0 || unpaidDays > 0;
            if (!hasAnyData && existing.length === 0) continue;
            
            const grossSource = parseFloat(user.monthly_salary) || 0;
            const metrics = computeSalaryMetrics({
                monthlySalary: grossSource,
                rawDeductions: user.deductions,
                workingDaysInPeriod: totalDaysInPeriod,
                payableDays: resolvedPayableDays,
                unpaidDays
            });


            if (existing.length > 0) {
                const preserveAsPaid = forceRecalculateAll && existing[0].status === 'Paid';
                const nextStatus = preserveAsPaid ? 'Paid' : 'Pending';
                const nextPaidAt = preserveAsPaid ? existing[0].paid_at : null;

                // UPDATE existing Pending record with full breakdown values
                await queryWithRetry(`
                    UPDATE salary_records
                    SET month = $2,
                        year = $3,
                        total_present = $4,
                        total_leave = $5,
                        total_lop = $6,
                        calculated_salary = $7,
                        with_pay_count = $8,
                        without_pay_count = $9,
                        deductions_applied = $10,
                        esi_gross = $11,
                        employee_esi = $12,
                        gross_salary = $13,
                        total_days_in_period = $14,
                        from_date = $15::date,
                        to_date = $16::date,
                        status = $17,
                        paid_at = $18,
                        present_days = $19,
                        with_pay_days = $20,
                        without_pay_days = $21,
                        total_payable_days = $22
                    WHERE id = $1
                `, [
                    existing[0].id,
                    period.month,
                    period.year,
                    breakdown.present_days,       // total_present
                    breakdown.with_pay_days,      // total_leave
                    breakdown.without_pay_days,   // total_lop
                    metrics.netSalary.toFixed(2),
                    breakdown.with_pay_days,      // with_pay_count (fixed: was total_payable_days)
                    breakdown.without_pay_days,   // without_pay_count
                    metrics.deductionsApplied.toFixed(2),
                    metrics.esiGross.toFixed(2),
                    metrics.employeeEsi.toFixed(2),
                    metrics.grossSalary.toFixed(2),
                    totalDaysInPeriod,
                    rangeFrom,
                    rangeTo,
                    nextStatus,
                    nextPaidAt,
                    breakdown.present_days,
                    breakdown.with_pay_days,
                    breakdown.without_pay_days,
                    breakdown.total_payable_days
                ]);
            } else {
                // INSERT a brand-new salary record
                await queryWithRetry(`
                    INSERT INTO salary_records (
                        emp_id, month, year, total_present, total_leave, total_lop,
                        calculated_salary, status, with_pay_count, without_pay_count,
                        deductions_applied, esi_gross, employee_esi, gross_salary,
                        total_days_in_period, from_date, to_date,
                        present_days, with_pay_days, without_pay_days, total_payable_days
                    ) VALUES (
                        $1, $2, $3, $4, $5, $6,
                        $7, 'Pending', $8, $9,
                        $10, $11, $12, $13,
                        $14, $15::date, $16::date,
                        $17, $18, $19, $20
                    )
                `, [
                    userEmpId,
                    period.month,
                    period.year,
                    breakdown.present_days,
                    breakdown.with_pay_days,
                    breakdown.without_pay_days,
                    metrics.netSalary.toFixed(2),
                    breakdown.with_pay_days,      // with_pay_count (fixed: was total_payable_days)
                    breakdown.without_pay_days,
                    metrics.deductionsApplied.toFixed(2),
                    metrics.esiGross.toFixed(2),
                    metrics.employeeEsi.toFixed(2),
                    metrics.grossSalary.toFixed(2),
                    totalDaysInPeriod,
                    rangeFrom,
                    rangeTo,
                    breakdown.present_days,
                    breakdown.with_pay_days,
                    breakdown.without_pay_days,
                    breakdown.total_payable_days
                ]);
            }

            results.push({
                emp_id: userEmpId,
                name: user.name,
                role: user.role,
                monthly_salary: metrics.fixedSalary,
                calculated_salary: metrics.netSalary.toFixed(2),
                present_days: breakdown.present_days,
                with_pay_days: breakdown.with_pay_days,
                without_pay_days: breakdown.without_pay_days,
                total_payable_days: breakdown.total_payable_days,
                payable_days: breakdown.total_payable_days,
                total_lop: breakdown.without_pay_days,
                range_days: totalDaysInPeriod,
                gross_salary: metrics.grossSalary.toFixed(2),
                deductions_applied: metrics.deductionsApplied.toFixed(2),
                esi_gross: metrics.esiGross.toFixed(2),
                employee_esi: metrics.employeeEsi.toFixed(2),
                from_date: rangeFrom,
                to_date: rangeTo
            });
        }

        // Emit real-time update to all connected clients
        const io = req.app.get('io');
        if (io) io.emit('salary_calculated', { month: period.month, year: period.year, fromDate: rangeFrom, toDate: rangeTo, count: results.length });

        res.json({ message: `Recalculated salaries for ${results.length} employees.`, results });
    } catch (error) {
        console.error('SALARY CALCULATION ERROR:', error);
        res.status(500).json({ message: 'Payroll calculation failed.', details: error.message });
    }
};

// @desc    Get Salary Records
// @route   GET /api/salary
// @access  Private
exports.getSalaryRecords = async (req, res) => {
    try {
        await ensureSalarySchema();
        const isHistoryMode = String(req.query.history || '').toLowerCase() === 'true';
        const { month, year, fromDate, toDate } = req.query;
        const paidStatuses = req.query.paidStatuses
            ? JSON.parse(req.query.paidStatuses)
            : ['Present', 'CL', 'ML', 'Comp Leave', 'OD', 'Leave', 'Holiday', 'Weekend'];
        const effectivePaidStatuses = Array.from(new Set([...(Array.isArray(paidStatuses) ? paidStatuses : []), 'Holiday', 'Weekend']));
        const unpaidStatuses = req.query.unpaidStatuses
            ? JSON.parse(req.query.unpaidStatuses)
            : ['Absent', 'LOP'];
        const period = buildPeriod({ month, year, fromDate, toDate });
        const effectiveCalcTo = getEffectiveCalcTo(period.toDate);
        const scopeWide = isInstitutionWideRole(req.user.role);

        if (isHistoryMode) {
            let historyQuery = `
                SELECT
                    merged.id,
                    merged.emp_id,
                    merged.month,
                    merged.year,
                    merged.total_present,
                    merged.total_leave,
                    merged.total_lop,
                    merged.calculated_salary,
                    merged.status,
                    merged.with_pay_count,
                    merged.without_pay_count,
                    merged.deductions_applied,
                    merged.esi_gross,
                    merged.employee_esi,
                    merged.gross_salary,
                    merged.total_days_in_period,
                    merged.from_date,
                    merged.to_date,
                    merged.paid_at,
                    merged.archived_at,
                    merged.is_history,
                    u.name,
                    u.role,
                    u.profile_pic,
                    u.monthly_salary,
                    u.deductions,
                    d.name AS department_name
                FROM (
                    SELECT
                        CONCAT('record_', s.id) AS id,
                        s.emp_id,
                        s.month,
                        s.year,
                        s.total_present,
                        s.total_leave,
                        s.total_lop,
                        s.calculated_salary,
                        s.status,
                        s.with_pay_count,
                        s.without_pay_count,
                        s.deductions_applied,
                        s.esi_gross,
                        s.employee_esi,
                        s.gross_salary,
                        s.total_days_in_period,
                        s.from_date,
                        s.to_date,
                        s.paid_at,
                        NULL::timestamp AS archived_at,
                        FALSE AS is_history
                    FROM salary_records s
                    WHERE s.status = 'Paid'

                    UNION ALL

                    SELECT
                        CONCAT('history_', h.id) AS id,
                        h.emp_id,
                        h.month,
                        h.year,
                        h.total_present,
                        h.total_leave,
                        h.total_lop,
                        h.calculated_salary,
                        h.status,
                        h.with_pay_count,
                        h.without_pay_count,
                        h.deductions_applied,
                        h.esi_gross,
                        h.employee_esi,
                        h.gross_salary,
                        h.total_days_in_period,
                        h.from_date,
                        h.to_date,
                        h.paid_at,
                        h.archived_at,
                        TRUE AS is_history
                    FROM salary_history h
                    WHERE h.status = 'Paid'
                ) merged
                LEFT JOIN users u ON TRIM(u.emp_id) = TRIM(merged.emp_id)
                LEFT JOIN departments d ON u.department_id = d.id
                WHERE 1=1
            `;
            const historyParams = [];

            if (!scopeWide) {
                historyParams.push(String(req.user.emp_id || '').trim());
                historyQuery += ` AND TRIM(merged.emp_id) = $${historyParams.length}`;
            }

            historyQuery += ' ORDER BY COALESCE(merged.paid_at, merged.archived_at, merged.to_date, merged.from_date) DESC, merged.id DESC';
            const { rows: historyRows } = await queryWithRetry(historyQuery, historyParams);

            const historyMapped = historyRows.map((r) => ({
                ...r,
                from_date: toIsoDate(r.from_date),
                to_date: toIsoDate(r.to_date),
                monthly_salary: parseFloat(r.gross_salary) || parseFloat(r.monthly_salary) || 0,
                gross_salary: parseFloat(r.gross_salary) || parseFloat(r.monthly_salary) || 0,
                esi_gross: parseFloat(r.esi_gross) || 0,
                employee_esi: parseFloat(r.employee_esi) || 0
            }));

            return res.json(historyMapped);
        }

        let usersQuery = `
            SELECT u.emp_id, u.name, u.role, u.profile_pic, u.monthly_salary, u.deductions, d.name AS department_name
            FROM users u
            LEFT JOIN departments d ON u.department_id = d.id
            WHERE LOWER(u.role::text) IN ('principal', 'hod', 'staff')
        `;
        const usersParams = [];

        if (!scopeWide) {
            usersQuery += ` AND TRIM(u.emp_id) = TRIM($1)`;
            usersParams.push(req.user.emp_id);
        }
        usersQuery += ` ORDER BY u.name ASC`;

        const { rows: users } = await pool.query(usersQuery, usersParams);
        if (users.length === 0) return res.json([]);

        const empIds = users.map((u) => u.emp_id.trim());
                const { rows: records } = await pool.query(`
                        SELECT s.*
                        FROM salary_records s
                        WHERE TRIM(s.emp_id) = ANY($1::text[])
                            AND (
                                    (s.from_date IS NOT NULL AND s.to_date IS NOT NULL AND s.from_date::date = $2::date AND s.to_date::date = $3::date)
                                    OR (s.month = $4 AND s.year = $5)
                            )
                        ORDER BY
                                CASE WHEN (s.from_date IS NOT NULL AND s.to_date IS NOT NULL AND s.from_date::date = $2::date AND s.to_date::date = $3::date) THEN 0 ELSE 1 END,
                                s.id DESC
                    `, [empIds, period.fromDate, period.toDate, period.month, period.year]);

        const recMap = {};
        // Prefer a Paid record if any exists for the same employee+period; otherwise use the newest.
        // This prevents a newer Pending duplicate from hiding the published (Paid) record.
        records.forEach((r) => {
            const k = String(r.emp_id || '').trim();
            if (!k) return;

            const current = recMap[k];
            if (!current) {
                recMap[k] = r;
                return;
            }

            if (String(current.status) !== 'Paid' && String(r.status) === 'Paid') {
                recMap[k] = r;
            }
        });

        const attendanceMap = await getAttendanceAggregateMap({
            fromDate: period.fromDate,
            toDate: effectiveCalcTo,
            paidStatuses: effectivePaidStatuses,
            unpaidStatuses
        });
        const totalDaysInPeriod = getTotalDays(period.fromDate, effectiveCalcTo);
        const merged = users.map((u) => {
            const key = String(u.emp_id || '').trim();
            const existing = recMap[key];

            // Staff/HOD/Principal should see their own salary details (Pending or Paid).
            if (!scopeWide) {
                if (existing) {
                    return {
                        ...existing,
                        name: u.name,
                        role: u.role,
                        profile_pic: u.profile_pic,
                        monthly_salary: parseFloat(u.monthly_salary) || parseFloat(u.base_salary) || 0,
                        department_name: u.department_name,
                        deductions: u.deductions,
                        from_date: toIsoDate(existing.from_date) || period.fromDate,
                        to_date: toIsoDate(existing.to_date) || period.toDate
                    };
                }

                const attendanceStats = attendanceMap[key] || {};
                const breakdown = resolveBreakdownFromStats(attendanceStats, totalDaysInPeriod);
                const payableDays = breakdown.total_payable_days;
                const unpaidDays = breakdown.without_pay_days;
                if (payableDays <= 0 && unpaidDays <= 0) {
                    return null;
                }

                const previewMetrics = computeSalaryMetrics({
                    monthlySalary: parseFloat(u.monthly_salary) || 0,
                    rawDeductions: u.deductions,
                    workingDaysInPeriod: totalDaysInPeriod,
                    payableDays,
                    unpaidDays
                });

                return {
                    id: `preview_${key}_${period.fromDate}_${period.toDate}`,
                    emp_id: key,
                    name: u.name,
                    role: u.role,
                    profile_pic: u.profile_pic,
                    department_name: u.department_name,
                    monthly_salary: parseFloat(u.monthly_salary) || 0,
                    gross_salary: previewMetrics.grossSalary.toFixed(2),
                    calculated_salary: previewMetrics.netSalary.toFixed(2),
                    total_present: breakdown.present_days,
                    total_leave: breakdown.with_pay_days,
                    total_lop: breakdown.without_pay_days,
                    present_days: breakdown.present_days,
                    with_pay_days: breakdown.with_pay_days,
                    without_pay_days: breakdown.without_pay_days,
                    total_payable_days: breakdown.total_payable_days,
                    with_pay_count: breakdown.with_pay_days,      // Fixed: was total_payable_days
                    without_pay_count: breakdown.without_pay_days,
                    deductions_applied: previewMetrics.deductionsApplied.toFixed(2),
                    esi_gross: previewMetrics.esiGross.toFixed(2),
                    employee_esi: previewMetrics.employeeEsi.toFixed(2),
                    total_days_in_period: totalDaysInPeriod,
                    from_date: period.fromDate,
                    to_date: period.toDate,
                    status: 'Pending',
                    month: period.month,
                    year: period.year,
                    is_preview: true,
                    deductions: u.deductions
                };
            }

            if (existing) {
                if (existing.status !== 'Paid') {
                    const attendanceStats = attendanceMap[key] || {};
                    const breakdown = resolveBreakdownFromStats(attendanceStats, totalDaysInPeriod);
                    const payableDays = breakdown.total_payable_days;
                    const unpaidDays = breakdown.without_pay_days;
                    if (payableDays <= 0 && unpaidDays <= 0) return null;

                    const metrics = computeSalaryMetrics({
                        monthlySalary: parseFloat(u.monthly_salary) || 0,
                        rawDeductions: u.deductions,
                        workingDaysInPeriod: totalDaysInPeriod,
                        payableDays,
                        unpaidDays
                    });

                    return {
                        ...existing,
                        name: u.name,
                        role: u.role,
                        profile_pic: u.profile_pic,
                        monthly_salary: parseFloat(u.monthly_salary) || 0,
                        department_name: u.department_name,
                        deductions: u.deductions,
                        total_present: breakdown.present_days,
                        total_leave: breakdown.with_pay_days,
                        total_lop: breakdown.without_pay_days,
                        present_days: breakdown.present_days,
                        with_pay_days: breakdown.with_pay_days,
                        without_pay_days: breakdown.without_pay_days,
                        total_payable_days: breakdown.total_payable_days,
                        with_pay_count: breakdown.with_pay_days,    // Fixed: was total_payable_days
                        without_pay_count: breakdown.without_pay_days,
                        deductions_applied: metrics.deductionsApplied.toFixed(2),
                        calculated_salary: metrics.netSalary.toFixed(2),
                        gross_salary: metrics.grossSalary.toFixed(2),
                        esi_gross: metrics.esiGross.toFixed(2),
                        employee_esi: metrics.employeeEsi.toFixed(2),
                        total_days_in_period: totalDaysInPeriod,
                        from_date: toIsoDate(existing.from_date) || period.fromDate,
                        to_date: toIsoDate(existing.to_date) || period.toDate
                    };
                }

                return {
                    ...existing,
                    name: u.name,
                    role: u.role,
                    profile_pic: u.profile_pic,
                    monthly_salary: parseFloat(u.monthly_salary) || parseFloat(u.base_salary) || 0,
                    department_name: u.department_name,
                    deductions: u.deductions,
                    from_date: toIsoDate(existing.from_date) || period.fromDate,
                    to_date: toIsoDate(existing.to_date) || period.toDate
                };
            }

            const gross = parseFloat(u.monthly_salary) || 0;
            const attendanceStats = attendanceMap[key] || {};
            const breakdown = resolveBreakdownFromStats(attendanceStats, totalDaysInPeriod);
            const payableDays = breakdown.total_payable_days;
            const unpaidDays = breakdown.without_pay_days;
            if (payableDays <= 0 && unpaidDays <= 0) return null;

            const metrics = computeSalaryMetrics({
                monthlySalary: gross,
                rawDeductions: u.deductions,
                workingDaysInPeriod: totalDaysInPeriod,
                payableDays,
                unpaidDays
            });

            return {
                id: `preview_${key}_${period.fromDate}_${period.toDate}`,
                emp_id: key,
                name: u.name,
                role: u.role,
                profile_pic: u.profile_pic,
                department_name: u.department_name,
                monthly_salary: gross,
                gross_salary: metrics.grossSalary.toFixed(2),
                calculated_salary: metrics.netSalary.toFixed(2),
                total_present: breakdown.present_days,
                total_leave: breakdown.with_pay_days,
                total_lop: breakdown.without_pay_days,
                present_days: breakdown.present_days,
                with_pay_days: breakdown.with_pay_days,
                without_pay_days: breakdown.without_pay_days,
                total_payable_days: breakdown.total_payable_days,
                with_pay_count: breakdown.with_pay_days,    // Fixed: was total_payable_days
                without_pay_count: breakdown.without_pay_days,
                deductions_applied: metrics.deductionsApplied.toFixed(2),
                esi_gross: metrics.esiGross.toFixed(2),
                employee_esi: metrics.employeeEsi.toFixed(2),
                total_days_in_period: totalDaysInPeriod,
                from_date: period.fromDate,
                to_date: period.toDate,
                status: 'Pending',
                month: period.month,
                year: period.year,
                is_preview: true
            };
        }).filter(Boolean);

        // For employees/non-admin, also fetch their historical paid records from salary_history
        if (!scopeWide) {
            const { rows: historyRecords } = await queryWithRetry(`
                SELECT h.*, u.name, u.role, u.profile_pic, d.name AS department_name, u.monthly_salary, u.deductions
                FROM (
                    SELECT s.*, FALSE AS is_history FROM salary_records s WHERE s.status = 'Paid'
                    UNION ALL
                    SELECT h.*, TRUE AS is_history FROM salary_history h WHERE h.status = 'Paid'
                ) h
                LEFT JOIN users u ON TRIM(u.emp_id) = TRIM(h.emp_id)
                LEFT JOIN departments d ON u.department_id = d.id
                WHERE TRIM(h.emp_id) = $1
                ORDER BY h.year DESC, h.month DESC
            `, [req.user.emp_id]);

            const historyMapped = historyRecords.map(r => ({
                ...r,
                id: `history_${r.id}`,
                is_history: true,
                from_date: toIsoDate(r.from_date),
                to_date: toIsoDate(r.to_date)
            }));

            // Merge current paid records with historical ones
            return res.json([...merged, ...historyMapped]);
        }

        res.json(merged);
    } catch (error) {
        console.error('GET SALARY ERROR:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Get Daily Salary Breakdown for a specific employee + period
// @route   GET /api/salary/daily?emp_id=&fromDate=&toDate=&paidStatuses=
// @access  Private
exports.getDailyBreakdown = async (req, res) => {
    try {
        const { emp_id, fromDate, toDate } = req.query;
        const paidStatuses = req.query.paidStatuses
            ? JSON.parse(req.query.paidStatuses)
            : ['Present', 'CL', 'ML', 'Comp Leave', 'OD', 'Leave', 'Holiday', 'Weekend'];

        if (!emp_id || !fromDate || !toDate) {
            return res.status(400).json({ message: 'emp_id, fromDate, toDate are required' });
        }

        if (!isInstitutionWideRole(req.user.role) && String(req.user.emp_id || '').trim() !== String(emp_id || '').trim()) {
            return res.status(403).json({ message: 'Not authorized to view this salary breakdown' });
        }

        // Fetch employee base salary
        const { rows: empRows } = await pool.query(
            `SELECT monthly_salary FROM users WHERE TRIM(emp_id) = $1`,
            [emp_id.trim()]
        );
        if (!empRows.length) return res.status(404).json({ message: 'Employee not found' });
        const baseSalary = parseFloat(empRows[0].monthly_salary) || 0;

        // Use total days instead of working days for daily rate
        const totalDays = Math.max(1, getTotalDays(fromDate, toDate));
        const dailyRate = baseSalary / totalDays;

        // Fetch daily attendance
        const { rows: attendance } = await pool.query(`
            SELECT date, status, remarks, punch_in, punch_out
            FROM attendance_records
            WHERE TRIM(emp_id) = $1 AND date::date >= $2::date AND date::date <= $3::date
            ORDER BY date ASC
        `, [emp_id.trim(), fromDate, toDate]);

        const attMap = {};
        attendance.forEach((a) => {
            attMap[toIsoDate(a.date)] = a;
        });

        // Build day-wise breakdown including missing days for full transparency
        const breakdown = [];
        const cursor = new Date(fromDate);
        const end = new Date(toDate);
        while (cursor <= end) {
            const iso = toIsoDate(cursor.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }));
            const dayOfWeek = cursor.getDay();
            const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
            const rec = attMap[iso];
            const st = (rec?.status || (isWeekend ? 'Holiday' : 'Absent')).trim();
            let dayFactor = 0;

            if (!isWeekend) {
                if (st.includes('+')) {
                    const parts = st.split('+').map((p) => p.trim());
                    parts.forEach((p) => { if (paidStatuses.includes(p)) dayFactor += 0.5; });
                } else if (paidStatuses.includes(st)) {
                    const remarks = (rec?.remarks || '').toLowerCase();
                    const isHalf = remarks.includes('half') || remarks.includes('0.5') || st.toLowerCase().includes('half');
                    dayFactor = isHalf ? 0.5 : 1.0;
                }
            }

            const grossEarned = (dailyRate * dayFactor).toFixed(2);
            breakdown.push({
                date: iso,
                status: st,
                punch_in: rec?.punch_in || null,
                punch_out: rec?.punch_out || null,
                day_factor: dayFactor,
                gross_earned: grossEarned,
                net_earned: grossEarned
            });
            cursor.setDate(cursor.getDate() + 1);
        }

        const totalGross = breakdown.reduce((acc, d) => acc + parseFloat(d.gross_earned), 0);
        res.json({
            emp_id,
            fromDate,
            toDate,
            total_days: totalDays,
            daily_rate: dailyRate.toFixed(2),
            base_salary: baseSalary,
            days_recorded: breakdown.length,
            total_gross: totalGross.toFixed(2),
            breakdown
        });
    } catch (error) {
        console.error('DAILY BREAKDOWN ERROR:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Update Salary Status (Mark as Paid)
// @route   PUT /api/salary/:id/status
// @access  Private (Admin)
exports.updateSalaryStatus = async (req, res) => {
    try {
        const { status } = req.body;
        const { rows } = await pool.query('SELECT status FROM salary_records WHERE id = $1', [req.params.id]);
        if (rows.length === 0) return res.status(404).json({ message: 'Salary record not found' });

        // Allow reverting status if the requester is an admin or specifically authorized.
        // We can just remove the block or log it.
        if (rows[0].status === 'Paid' && status !== 'Paid' && req.user.role !== 'admin') {
            return res.status(403).json({ message: 'Only administrators can revert Paid salary records' });
        }

        await pool.query(
            'UPDATE salary_records SET status = $1, paid_at = CASE WHEN $1 = \'Paid\' THEN COALESCE(paid_at, NOW()) ELSE paid_at END WHERE id = $2',
            [status, req.params.id]
        );
        res.json({ message: `Salary marked as ${status}` });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Publish salaries (marks as Paid). Supports selective publishing via emp_ids.
// @route   POST /api/salary/publish
// @access  Private (Admin)
exports.publishSalaries = async (req, res) => {
    const { month, year, fromDate, toDate, emp_ids } = req.body;
    const period = buildPeriod({ month, year, fromDate, toDate });

    try {
        await ensureSalarySchema();
        
        let query = `
            UPDATE salary_records
            SET status = 'Paid', paid_at = COALESCE(paid_at, NOW())
            WHERE (
                    (from_date IS NOT NULL AND to_date IS NOT NULL AND from_date::date = $1::date AND to_date::date = $2::date)
                    OR (month = $3 AND year = $4)
                )
        `;
        const params = [period.fromDate, period.toDate, period.month, period.year];

        if (Array.isArray(emp_ids) && emp_ids.length > 0) {
            query += ` AND TRIM(emp_id) = ANY($5::text[])`;
            params.push(emp_ids);
        }

        const { rowCount } = await pool.query(query, params);

        const io = req.app.get('io');
        if (io) io.emit('salary_published', { 
            month: period.month, 
            year: period.year, 
            fromDate: period.fromDate, 
            toDate: period.toDate,
            emp_ids: emp_ids || 'all'
        });

        res.json({ message: `${rowCount} salary records published`, count: rowCount });
    } catch (error) {
        console.error('PUBLISH SALARY ERROR:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Notify employee via email when salary is marked as Paid
// @route   POST /api/salary/notify-paid
// @access  Private (Admin)
exports.notifyPaid = async (req, res) => {
    const { emp_id, name, email, fromDate, toDate, amount, viewUrl } = req.body;

    try {
        // Fetch employee email if not provided in body
        let recipientEmail = email;
        if (!recipientEmail) {
            const { rows } = await pool.query('SELECT email FROM users WHERE TRIM(emp_id) = $1', [emp_id?.trim()]);
            recipientEmail = rows[0]?.email;
        }

        if (recipientEmail) {
            const sendEmail = require('../utils/sendEmail');
            const periodText = `${fromDate} to ${toDate}`;
            const amountFormatted = Number(amount || 0).toLocaleString('en-IN', { style: 'currency', currency: 'INR' });
            const safeViewUrl = typeof viewUrl === 'string' && /^https?:\/\//i.test(viewUrl) ? viewUrl : null;

            await sendEmail({
                email: recipientEmail,
                subject: `Salary Credited – PPG Management (${periodText})`,
                message: `Dear ${name},\n\nYour salary for the period ${periodText} has been credited.\nAmount: ${amountFormatted}\n\nPlease check your bank account.${safeViewUrl ? `\n\nView details: ${safeViewUrl}` : ''}\n\nRegards,\nPPG Management`,
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 30px; border: 1px solid #e2e8f0; border-radius: 16px;">
                        <div style="text-align:center; margin-bottom:24px;">
                            <h2 style="color:#1e3a8a; margin:0;">PPG EMP HUB</h2>
                            <p style="color:#64748b; font-size:13px; margin:4px 0;">Salary Management System</p>
                        </div>
                        <div style="background: linear-gradient(135deg, #10b981, #059669); border-radius:12px; padding:20px; text-align:center; margin-bottom:24px;">
                            <p style="color:white; font-size:13px; margin:0; font-weight:600;">✅ SALARY CREDITED</p>
                            <h1 style="color:white; font-size:32px; margin:8px 0;">${amountFormatted}</h1>
                        </div>
                        <p style="color:#374151;">Dear <strong>${name}</strong>,</p>
                        <p style="color:#374151;">Your salary for the period <strong>${periodText}</strong> has been credited to your registered bank account.</p>
                        <div style="background:#f8fafc; border-radius:8px; padding:16px; margin:20px 0;">
                            <table style="width:100%; font-size:13px;">
                                <tr><td style="color:#64748b; padding:4px 0;">Period</td><td style="font-weight:600; text-align:right;">${periodText}</td></tr>
                                <tr><td style="color:#64748b; padding:4px 0;">Net Amount</td><td style="font-weight:600; color:#10b981; text-align:right;">${amountFormatted}</td></tr>
                                <tr><td style="color:#64748b; padding:4px 0;">Status</td><td style="font-weight:600; color:#10b981; text-align:right;">✅ PAID</td></tr>
                            </table>
                        </div>
                        <p style="color:#374151;">Please check your bank account and verify the credit. For any queries, contact PPG Management.</p>
                        ${safeViewUrl ? `
                        <div style="text-align:center; margin: 24px 0;">
                            <a href="${safeViewUrl}" style="display:inline-block; background:#0ea5e9; color:#fff; text-decoration:none; font-weight:700; font-size:13px; padding:10px 16px; border-radius:10px;">View Salary Page</a>
                        </div>
                        ` : ''}
                        <div style="text-align:center; margin-top:30px; padding-top:20px; border-top:1px solid #e2e8f0;">
                            <p style="color:#94a3b8; font-size:11px;">PPG Education Institutions · Powered by ZORVIAN TECHNOLOGIES</p>
                        </div>
                    </div>
                `
            });
        }

        res.json({ message: 'Notification sent successfully' });
    } catch (error) {
        console.error('NOTIFY PAID ERROR:', error);
        // Don't fail if email bounces – just log and return OK
        res.json({ message: 'Salary marked paid (email notification may have failed)' });
    }
};

// @desc    Get salary timeline (all periods) for one employee
// @route   GET /api/salary/timeline?empId=
// @access  Private
exports.getSalaryTimeline = async (req, res) => {
    try {
        await ensureSalarySchema();
        const scopeWide = isInstitutionWideRole(req.user.role);
        const requestedEmp = String(req.query.empId || req.query.emp_id || '').trim();
        const targetEmpId = scopeWide ? requestedEmp : String(req.user.emp_id || '').trim();

        if (!targetEmpId) {
            return res.status(400).json({ message: 'empId is required' });
        }

        const { rows } = await pool.query(
            `
            SELECT
                merged.id,
                merged.is_history,
                merged.emp_id,
                merged.month,
                merged.year,
                merged.total_present,
                merged.total_leave,
                merged.total_lop,
                merged.calculated_salary,
                merged.status,
                merged.with_pay_count,
                merged.without_pay_count,
                merged.deductions_applied,
                merged.esi_gross,
                merged.employee_esi,
                merged.gross_salary,
                merged.total_days_in_period,
                merged.from_date,
                merged.to_date,
                merged.paid_at,
                merged.archived_at,
                u.name,
                u.role,
                u.profile_pic,
                u.monthly_salary,
                u.deductions,
                d.name AS department_name
            FROM (
                SELECT
                    CAST(s.id AS TEXT) AS id,
                    FALSE AS is_history,
                    s.emp_id,
                    s.month,
                    s.year,
                    s.total_present,
                    s.total_leave,
                    s.total_lop,
                    s.calculated_salary,
                    s.status,
                    s.with_pay_count,
                    s.without_pay_count,
                    s.deductions_applied,
                    s.esi_gross,
                    s.employee_esi,
                    s.gross_salary,
                    s.total_days_in_period,
                    s.from_date,
                    s.to_date,
                    s.paid_at,
                    NULL::timestamp AS archived_at
                FROM salary_records s
                WHERE TRIM(s.emp_id) = $1

                UNION ALL

                SELECT
                    CONCAT('history_', h.id) AS id,
                    TRUE AS is_history,
                    h.emp_id,
                    h.month,
                    h.year,
                    h.total_present,
                    h.total_leave,
                    h.total_lop,
                    h.calculated_salary,
                    h.status,
                    h.with_pay_count,
                    h.without_pay_count,
                    h.deductions_applied,
                    h.esi_gross,
                    h.employee_esi,
                    h.gross_salary,
                    h.total_days_in_period,
                    h.from_date,
                    h.to_date,
                    h.paid_at,
                    h.archived_at
                FROM salary_history h
                WHERE TRIM(h.emp_id) = $1
            ) merged
            LEFT JOIN users u ON TRIM(u.emp_id) = TRIM(merged.emp_id)
            LEFT JOIN departments d ON u.department_id = d.id
            ORDER BY COALESCE(merged.to_date, merged.from_date, merged.archived_at, merged.paid_at) DESC, merged.id DESC
            `,
            [targetEmpId]
        );

        const mapped = rows.map((r) => ({
            ...r,
            from_date: toIsoDate(r.from_date),
            to_date: toIsoDate(r.to_date),
            monthly_salary: parseFloat(r.gross_salary) || parseFloat(r.monthly_salary) || 0,
            gross_salary: parseFloat(r.gross_salary) || parseFloat(r.monthly_salary) || 0,
            calculated_salary: parseFloat(r.calculated_salary) || 0,
            deductions_applied: parseFloat(r.deductions_applied) || 0,
            esi_gross: parseFloat(r.esi_gross) || 0,
            employee_esi: parseFloat(r.employee_esi) || 0,
            total_present: parseFloat(r.total_present) || 0,
            total_lop: parseFloat(r.total_lop) || 0,
            with_pay_count: parseFloat(r.with_pay_count) || 0,
            without_pay_count: parseFloat(r.without_pay_count) || 0,
            total_days_in_period: parseInt(r.total_days_in_period, 10) || 0
        }));

        res.json(mapped);
    } catch (error) {
        console.error('GET SALARY TIMELINE ERROR:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Create salary report by employee
// @route   POST /api/salary/reports
// @access  Private
exports.createSalaryReport = async (req, res) => {
    try {
        await ensureSalarySchema();
        const empId = String(req.user.emp_id || '').trim();
        const reportType = String(req.body.reportType || req.body.report_type || 'Other').trim();
        const reason = String(req.body.reason || '').trim();

        if (!empId) return res.status(400).json({ message: 'Employee ID missing in token' });
        if (!reason) return res.status(400).json({ message: 'Reason is required' });

        const { rows } = await pool.query(
            `INSERT INTO salary_reports (emp_id, report_type, reason, status)
             VALUES ($1, $2, $3, 'Open')
             RETURNING *`,
            [empId, reportType || 'Other', reason]
        );

        const io = req.app.get('io');
        if (io) io.emit('salary_report_created', { id: rows[0].id, emp_id: empId, report_type: reportType });

        res.status(201).json(rows[0]);
    } catch (error) {
        console.error('CREATE SALARY REPORT ERROR:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Get salary reports (admin gets all, employee gets own)
// @route   GET /api/salary/reports
// @access  Private
exports.getSalaryReports = async (req, res) => {
    try {
        await ensureSalarySchema();
        const scopeWide = isInstitutionWideRole(req.user.role);

        let query = `
            SELECT
                sr.*,
                u.name AS employee_name,
                u.role AS employee_role,
                u.email AS employee_email,
                d.name AS department_name,
                au.name AS replied_by_name
            FROM salary_reports sr
            LEFT JOIN users u ON TRIM(u.emp_id) = TRIM(sr.emp_id)
            LEFT JOIN users au ON TRIM(au.emp_id) = TRIM(sr.replied_by)
            LEFT JOIN departments d ON u.department_id = d.id
            WHERE 1=1
        `;
        const params = [];

        if (!scopeWide) {
            params.push(String(req.user.emp_id || '').trim());
            query += ` AND TRIM(sr.emp_id) = $${params.length}`;
        }

        const statusFilter = String(req.query.status || '').trim();
        if (statusFilter) {
            params.push(statusFilter);
            query += ` AND sr.status = $${params.length}`;
        }

        query += ' ORDER BY sr.created_at DESC, sr.id DESC';

        const { rows } = await pool.query(query, params);
        res.json(rows);
    } catch (error) {
        console.error('GET SALARY REPORTS ERROR:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Reply to salary report
// @route   PUT /api/salary/reports/:id/reply
// @access  Private (Admin/Management)
exports.replySalaryReport = async (req, res) => {
    try {
        await ensureSalarySchema();
        const reportId = parseInt(req.params.id, 10);
        const reply = String(req.body.reply || req.body.admin_reply || '').trim();
        if (!Number.isInteger(reportId) || reportId <= 0) {
            return res.status(400).json({ message: 'Invalid report id' });
        }
        if (!reply) return res.status(400).json({ message: 'Reply is required' });

        const { rows } = await pool.query(
            `UPDATE salary_reports
             SET admin_reply = $1,
                 status = 'Replied',
                 replied_by = $2,
                 replied_at = NOW()
             WHERE id = $3
             RETURNING *`,
            [reply, String(req.user.emp_id || '').trim(), reportId]
        );

        if (!rows.length) return res.status(404).json({ message: 'Report not found' });

        const io = req.app.get('io');
        if (io) io.emit('salary_report_replied', { id: rows[0].id, emp_id: rows[0].emp_id });

        res.json(rows[0]);
    } catch (error) {
        console.error('REPLY SALARY REPORT ERROR:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};

