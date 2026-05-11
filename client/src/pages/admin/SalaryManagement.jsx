import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Layout from '../../components/Layout';
import api from '../../utils/api';
import Swal from 'sweetalert2';
import { runPrintWindow } from '../../utils/printUtils';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import { motion, AnimatePresence } from 'framer-motion';
import {
    FaCheckCircle,
    FaClock,
    FaCog,
    FaEnvelope,
    FaEye,
    FaFileAlt,
    FaFilter,
    FaHistory,
    FaMoneyBillWave,
    FaPaperPlane,
    FaRedoAlt,
    FaSearch,
    FaTimesCircle,
    FaWallet
} from 'react-icons/fa';

const formatIso = (d) => d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

const getCurrentPayrollCycle = () => {
    const now = new Date();
    const day = now.getDate();
    const anchorMonth = day >= 26 ? now.getMonth() : now.getMonth() - 1;
    const anchorYear = day >= 26 ? now.getFullYear() : new Date(now.getFullYear(), now.getMonth() - 1, 1).getFullYear();

    const from = new Date(anchorYear, anchorMonth, 26);
    const to = new Date(anchorYear, anchorMonth + 1, 25);

    return {
        fromDate: formatIso(from),
        toDate: formatIso(to),
        month: to.getMonth() + 1,
        year: to.getFullYear()
    };
};

const getCycleByMonthYear = (month, year) => {
    const safeMonth = Number(month) || 1;
    const safeYear = Number(year) || new Date().getFullYear();
    const to = new Date(safeYear, safeMonth - 1, 25);
    const from = new Date(safeYear, safeMonth - 2, 26);

    return {
        fromDate: formatIso(from),
        toDate: formatIso(to),
        month: safeMonth,
        year: safeYear
    };
};

const toCurrency = (v) => Number(v || 0).toLocaleString('en-IN');
const getTodayIso = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
const normalizeEmpId = (v) => String(v || '').trim().toLowerCase();
const normalizeDateOnly = (v) => {
    if (!v) return '';
    const raw = String(v);
    return raw.includes('T') ? raw.slice(0, 10) : raw;
};
// Prefer new granular fields; fall back to legacy aggregated fields using logical OR so exactly 0 doesn't hide legacy values
const getPresentDays = (row) => Number(row?.present_days || row?.total_present || 0) || 0;
const getWithPayDays = (row) => Number(row?.with_pay_days || row?.with_pay_count || row?.total_present || 0) || 0;
const getWithoutPayDays = (row) => Number(row?.without_pay_days || row?.without_pay_count || row?.total_lop || 0) || 0;
const getTotalPayableDays = (row) => Number(row?.total_payable_days || row?.with_pay_count || row?.total_present || 0) || 0;

const isSameCycle = (row, cycle) => {
    const rowMonth = Number(row?.month);
    const rowYear = Number(row?.year);
    const monthYearMatch = Number.isFinite(rowMonth) && Number.isFinite(rowYear)
        ? (rowMonth === Number(cycle?.month) && rowYear === Number(cycle?.year))
        : false;

    const dateMatch = normalizeDateOnly(row?.from_date) === normalizeDateOnly(cycle?.fromDate)
        && normalizeDateOnly(row?.to_date) === normalizeDateOnly(cycle?.toDate);

    return monthYearMatch || dateMatch;
};
const getWorkingDaysFromRange = (fromDate, toDate) => {
    if (!fromDate || !toDate) return 0;
    const from = new Date(fromDate);
    const to = new Date(toDate);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) return 0;

    // Use total calendar days as requested (not just business days).
    const diffTime = Math.abs(to - from);
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
};
const parseDeductionItems = (raw) => {
    if (!raw) return [];
    try {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (!Array.isArray(parsed)) return [];
        return parsed
            .map((item) => {
                const label = String(item?.type || item?.name || item?.label || 'Deduction').trim();
                const amount = Number(item?.amount ?? item?.value ?? item?.deductionAmount ?? item?.deduction_amount ?? 0) || 0;
                return { label, amount };
            })
            .filter((item) => item.label && item.amount > 0);
    } catch {
        return [];
    }
};

const getMonthlyPfAmountFromLabel = (label, fallbackAmount) => {
    const safeLabel = String(label || '');
    const safeFallbackAmount = Number(fallbackAmount || 0) || 0;

    // New format: PF Basic: X, PF Deduction % Per Month: Y%
    const basicMatch = safeLabel.match(/pf\s*basic\s*:\s*(\d+(?:\.\d+)?)/i);
    const monthlyRateMatch = safeLabel.match(/pf\s*deduction\s*%\s*per\s*month\s*:\s*(\d+(?:\.\d+)?)\s*%/i);
    if (basicMatch && monthlyRateMatch) {
        const basic = Number(basicMatch[1] || 0);
        const monthlyRate = Number(monthlyRateMatch[1] || 0);
        if (Number.isFinite(basic) && Number.isFinite(monthlyRate) && basic > 0 && monthlyRate >= 0) {
            return (basic * monthlyRate) / 100;
        }
    }

    // Legacy format fallback: PF Basic with percentage in label.
    const legacyBasicMatch = safeLabel.match(/pf\s*basic\s*[:=]?\s*(\d+(?:\.\d+)?)/i);
    const anyPercentMatch = safeLabel.match(/(\d+(?:\.\d+)?)\s*%/);
    if (legacyBasicMatch && anyPercentMatch) {
        const basic = Number(legacyBasicMatch[1] || 0);
        const rate = Number(anyPercentMatch[1] || 0);
        if (Number.isFinite(basic) && Number.isFinite(rate) && basic > 0 && rate >= 0) {
            return (basic * rate) / 100;
        }
    }

    return safeFallbackAmount;
};

const getDetailedDeductionBreakdown = (raw, computed) => {
    const details = {
        employPf: 0,
        employeeEsi: 0,
        esiGross: 0,
        salaryAdvance: 0,
        hostelFoodFees: 0,
        busFees: 0,
        lwf: 0,
        tds: 0,
        other: 0,
        otherLabel: ''
    };

    if (computed) {
        const employeeEsi = Number(computed.employee_esi ?? computed.employeeEsi ?? 0) || 0;
        const esiGross = Number(computed.esi_gross ?? computed.esiGross ?? 0) || 0;
        if (employeeEsi > 0) details.employeeEsi = employeeEsi;
        if (esiGross > 0) details.esiGross = esiGross;
    }

    const items = parseDeductionItems(raw);
    items.forEach((item) => {
        const label = String(item.label || '').toLowerCase();
        const amount = Number(item.amount || 0);
        if (!amount) return;

        if (label.includes('pf')) {
            details.employPf += getMonthlyPfAmountFromLabel(item.label, amount);
            return;
        }
        if (label.includes('salary advance') || label.includes('advance')) {
            details.salaryAdvance += amount;
            return;
        }
        if (label.includes('hostel') || label.includes('food')) {
            details.hostelFoodFees += amount;
            return;
        }
        if (label.includes('bus')) {
            details.busFees += amount;
            return;
        }
        if (label.includes('lwf')) {
            details.lwf += amount;
            return;
        }
        if (label.includes('tds')) {
            details.tds += amount;
            return;
        }

        details.other += amount;
        if (!details.otherLabel) {
            const parsedOtherName = String(item.label || '').split(':').slice(1).join(':').trim();
            details.otherLabel = parsedOtherName;
        }
    });

    return details;
};
const getDeductionBreakdownText = (raw, computed) => {
    const details = getDetailedDeductionBreakdown(raw, computed);
    const lines = [];
    if (details.employPf > 0) lines.push(`Employ PF=${toCurrency(details.employPf)}`);
    if (details.employeeEsi > 0) lines.push(`Employee ESI=${toCurrency(details.employeeEsi)}`);
    if (details.esiGross > 0) lines.push(`ESI Gross=${toCurrency(details.esiGross)}`);
    if (details.salaryAdvance > 0) lines.push(`Salary Advance=${toCurrency(details.salaryAdvance)}`);
    if (details.hostelFoodFees > 0) lines.push(`Hostel/Food=${toCurrency(details.hostelFoodFees)}`);
    if (details.busFees > 0) lines.push(`Bus Fees=${toCurrency(details.busFees)}`);
    if (details.lwf > 0) lines.push(`LWF=${toCurrency(details.lwf)}`);
    if (details.tds > 0) lines.push(`TDS=${toCurrency(details.tds)}`);
    if (details.other > 0) {
        const otherLabel = details.otherLabel ? `Other (${details.otherLabel})` : 'Other';
        lines.push(`${otherLabel}=${toCurrency(details.other)}`);
    }
    return lines.join(', ');
};
const formatGeneratedAt = () => {
    const now = new Date();
    return `${now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} ${now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`;
};
const escapeHtml = (value) => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

const getEarnedSalary = (row) => {
    const fixedSalary = Number(row?.monthly_salary || row?.gross_salary || 0);
    const totalDays = Number(row?.total_days_in_period || 0);
    const payableDays = Number(row?.with_pay_count ?? row?.total_present ?? 0);
    if (!Number.isFinite(fixedSalary) || fixedSalary <= 0) return 0;
    if (!Number.isFinite(totalDays) || totalDays <= 0) return fixedSalary;
    const normalizedPayable = Math.max(0, Math.min(totalDays, payableDays));
    return (fixedSalary / totalDays) * normalizedPayable;
};

const BASIC_SALARY_PERCENT = 55.2;
const PERFORMANCE_PERCENT = 36.8;
const CONVEYANCE_PERCENT = 8;

const getSalaryConceptSplit = (amount) => {
    const safeAmount = Number(amount || 0);
    if (!Number.isFinite(safeAmount) || safeAmount <= 0) {
        return { basicSalary: 0, performance: 0, conveyance: 0 };
    }

    // Use paise-level math to keep split totals accurate after rounding.
    const amountInPaise = Math.round(safeAmount * 100);
    const basicInPaise = Math.round((amountInPaise * BASIC_SALARY_PERCENT) / 100);
    const performanceInPaise = Math.round((amountInPaise * PERFORMANCE_PERCENT) / 100);
    const conveyanceInPaise = amountInPaise - basicInPaise - performanceInPaise;

    return {
        basicSalary: basicInPaise / 100,
        performance: performanceInPaise / 100,
        conveyance: conveyanceInPaise / 100
    };
};

const getEarnedSalaryConceptSplit = (earnedSalary) => getSalaryConceptSplit(earnedSalary);

const normalizeSalaryRow = (row) => {
    if (!row || typeof row !== 'object') return row;

    const normalized = { ...row };
    normalized.id = row.id ?? row.salary_id ?? row.record_id ?? row.salaryRecordId ?? `history_${row.emp_id || row.empId || ''}_${row.month || ''}_${row.year || ''}`;
    normalized.emp_id = row.emp_id ?? row.empId ?? row.employee_id ?? row.employeeId ?? '';
    normalized.name = row.name ?? row.employee_name ?? row.employeeName ?? row.full_name ?? row.fullName ?? '-';
    normalized.department_name = row.department_name ?? row.department ?? row.dept_name ?? row.departmentName ?? '';
    normalized.role = row.role ?? row.employee_role ?? row.employeeRole ?? '';
    normalized.profile_pic = row.profile_pic ?? row.profile_picture_url ?? row.profilePicture ?? '';

    normalized.month = Number(row.month ?? row.pay_month ?? row.payMonth ?? 0) || row.month;
    normalized.year = Number(row.year ?? row.pay_year ?? row.payYear ?? 0) || row.year;
    normalized.from_date = row.from_date ?? row.fromDate ?? row.period_start ?? row.periodStart ?? '';
    normalized.to_date = row.to_date ?? row.toDate ?? row.period_end ?? row.periodEnd ?? '';

    normalized.monthly_salary = Number(row.monthly_salary ?? row.monthlySalary ?? row.fixed_salary ?? row.fixedSalary ?? 0) || 0;
    normalized.gross_salary = Number(row.gross_salary ?? row.grossSalary ?? row.earned_salary ?? row.earnedSalary ?? normalized.monthly_salary) || 0;
    normalized.total_present = Number(row.total_present ?? row.totalPresent ?? row.with_pay_count ?? row.withPayCount ?? 0) || 0;
    normalized.total_lop = Number(row.total_lop ?? row.totalLop ?? row.without_pay_count ?? row.withoutPayCount ?? 0) || 0;
    normalized.with_pay_count = Number(row.with_pay_count ?? row.withPayCount ?? normalized.total_present) || 0;
    normalized.without_pay_count = Number(row.without_pay_count ?? row.withoutPayCount ?? normalized.total_lop) || 0;
    normalized.total_days_in_period = Number(row.total_days_in_period ?? row.totalDaysInPeriod ?? row.total_days ?? row.totalDays ?? 0) || 0;
    normalized.deductions_applied = Number(row.deductions_applied ?? row.deductionsApplied ?? row.total_deductions ?? row.totalDeductions ?? 0) || 0;
    normalized.calculated_salary = Number(row.calculated_salary ?? row.calculatedSalary ?? row.net_salary ?? row.netSalary ?? 0) || 0;
    // New granular breakdown fields - carefully fallback to legacy values if the new fields are exactly 0 (which happens due to DB DEFAULT 0 on old records)
    normalized.present_days = Number(row.present_days || row.total_present || 0) || 0;
    normalized.with_pay_days = Number(row.with_pay_days || row.with_pay_count || row.total_present || 0) || 0;
    normalized.without_pay_days = Number(row.without_pay_days || row.without_pay_count || row.total_lop || 0) || 0;
    normalized.total_payable_days = Number(row.total_payable_days || row.with_pay_count || row.total_present || 0) || 0;

    normalized.status = String(row.status ?? row.salary_status ?? row.salaryStatus ?? 'Pending');

    return normalized;
};

const fadeUp = {
    hidden: { opacity: 0, y: 16 },
    show: { opacity: 1, y: 0 }
};

const staggerWrap = {
    hidden: { opacity: 0 },
    show: {
        opacity: 1,
        transition: { staggerChildren: 0.06 }
    }
};

const SalaryManagement = () => {
    const { user } = useAuth();
    const socket = useSocket();
    const navigate = useNavigate();
    const location = useLocation();

    const canInstitutionWide = user?.role === 'admin' || user?.role === 'management' || user?.role === 'accounts';
    const isHistoryPage = /\/payroll\/history$/.test(location.pathname);
    const isPersonalView = !canInstitutionWide;
    const isAdmin = user?.role === 'admin' || user?.role === 'accounts';
    const isManagement = user?.role === 'management';
    // Live salary page (admin): hide Status & Actions. History page: show both. Personal views: always show.
    const showStatusColumn = isHistoryPage || isPersonalView;
    const showActionsColumn = isHistoryPage || isPersonalView;
    const showInstitutionActionButtons = canInstitutionWide && !isPersonalView;
    const showSelectionBar = canInstitutionWide && !isPersonalView && !isManagement && !isHistoryPage;

    const tableColumnCount = (showSelectionBar ? 1 : 0)
        + 6 // Employee/Period, Pay stats, Fixed, Gross, Deductions, Net
        + (showStatusColumn ? 1 : 0)
        + (showActionsColumn ? 1 : 0);

    const currentCycle = useMemo(() => getCurrentPayrollCycle(), []);
    const [selectedMonth, setSelectedMonth] = useState(currentCycle.month);
    const [selectedYear, setSelectedYear] = useState(currentCycle.year);

    const selectedCycle = useMemo(() => {
        if (isHistoryPage) return getCycleByMonthYear(selectedMonth, selectedYear);
        return currentCycle;
    }, [isHistoryPage, selectedMonth, selectedYear, currentCycle]);

    const [rows, setRows] = useState([]);
    const [, setLiveDaily] = useState(null);
    const [loading, setLoading] = useState(false);
    const [hasLoaded, setHasLoaded] = useState(false);
    const [selectedIds, setSelectedIds] = useState([]);
    const [activeRole, setActiveRole] = useState('all');
    const [activeDepartment, setActiveDepartment] = useState('all');
    const [departments, setDepartments] = useState([]);
    const [calendarTotals, setCalendarTotals] = useState({ workingDays: null, holidays: null });
    const [attendanceStatusOptions, setAttendanceStatusOptions] = useState([]);

    const [paidStatuses, setPaidStatuses] = useState(() => {
        const saved = localStorage.getItem('salary_paid_statuses');
        return saved ? JSON.parse(saved) : ['Present', 'CL', 'ML', 'Comp Leave', 'OD', 'Holiday'];
    });
    const [unpaidStatuses, setUnpaidStatuses] = useState(() => {
        const saved = localStorage.getItem('salary_unpaid_statuses');
        return saved ? JSON.parse(saved) : ['Absent', 'LOP'];
    });
    const refreshOnReturnRef = useRef(true);
    const autoRefreshInFlightRef = useRef(false);

    const filteredRows = useMemo(() => {
        const matchesSelectedCycle = (r) => {
            const rowMonth = Number(r.month);
            const rowYear = Number(r.year);
            const monthYearMatch = Number.isFinite(rowMonth) && Number.isFinite(rowYear)
                ? (rowMonth === Number(selectedCycle.month) && rowYear === Number(selectedCycle.year))
                : false;

            const dateMatch = normalizeDateOnly(r.from_date) === normalizeDateOnly(selectedCycle.fromDate)
                && normalizeDateOnly(r.to_date) === normalizeDateOnly(selectedCycle.toDate);

            return monthYearMatch || dateMatch;
        };

        const baseRows = (isPersonalView && isHistoryPage)
            ? (() => {
                const matched = rows.filter(matchesSelectedCycle);
                return matched.length ? matched : rows;
            })()
            : rows;

        return baseRows.filter((r) => {
                const roleValue = String(r.role || '').toLowerCase();
                const roleMatch = activeRole === 'all' || roleValue === activeRole;
                const deptMatch = activeDepartment === 'all' || String(r.department_name || '').toLowerCase() === activeDepartment;
                return roleMatch && deptMatch;
            });
    }, [
        rows,
        activeRole,
        activeDepartment,
        isPersonalView,
        isHistoryPage,
        selectedCycle.fromDate,
        selectedCycle.toDate,
        selectedCycle.month,
        selectedCycle.year
    ]);

    const departmentOptions = useMemo(() => {
        const fromRows = rows
            .map((r) => String(r.department_name || '').trim())
            .filter(Boolean);
        const fromMaster = departments
            .map((d) => String(d.name || '').trim())
            .filter(Boolean);
        return Array.from(new Set([...fromMaster, ...fromRows]));
    }, [rows, departments]);

    const summary = useMemo(() => {
        const gross = filteredRows.reduce((acc, row) => acc + Number(row.gross_salary || row.monthly_salary || 0), 0);
        const net = filteredRows.reduce((acc, row) => acc + Number(row.calculated_salary || 0), 0);
        return { gross, net };
    }, [filteredRows]);

    const totalCycleDays = useMemo(() => {
        return getWorkingDaysFromRange(selectedCycle.fromDate, selectedCycle.toDate);
    }, [selectedCycle]);

    const cycleWorkingDays = useMemo(() => {
        const fromCalendar = Number(calendarTotals.workingDays);
        if (Number.isFinite(fromCalendar) && fromCalendar > 0) return fromCalendar;
        return totalCycleDays;
    }, [calendarTotals.workingDays, totalCycleDays]);

    const cycleHolidayDays = useMemo(() => {
        const fromCalendar = Number(calendarTotals.holidays);
        if (Number.isFinite(fromCalendar) && fromCalendar >= 0) return fromCalendar;
        const computed = totalCycleDays - cycleWorkingDays;
        return computed > 0 ? computed : 0;
    }, [calendarTotals.holidays, totalCycleDays, cycleWorkingDays]);

    const livePersonalOverview = useMemo(() => {
        if (!isPersonalView || !rows.length) return null;

        const currentCycleRecord = rows.find((r) => isSameCycle(r, selectedCycle));
        const liveRow = isHistoryPage ? currentCycleRecord : (currentCycleRecord || rows[0]);
        if (!liveRow) return null;

        return {
            monthlySalary: Number(liveRow.monthly_salary || 0),
            gross: Number(liveRow.gross_salary || liveRow.monthly_salary || 0),
            deductions: Number(liveRow.deductions_applied || 0),
            net: Number(liveRow.calculated_salary || 0),
            paidDays: getWithPayDays(liveRow),
            unpaidDays: getWithoutPayDays(liveRow),
            workingDays: Number(liveRow.total_days_in_period || 0) || cycleWorkingDays,
            fromDate: liveRow.from_date || selectedCycle.fromDate,
            toDate: liveRow.to_date || selectedCycle.toDate
        };
    }, [isPersonalView, isHistoryPage, rows, selectedCycle, cycleWorkingDays]);

    const refreshRows = async () => {
        setLoading(true);
        try {
            if (isPersonalView) {
                if (isHistoryPage) {
                    const { data } = await api.get('/salary?history=true');
                    setRows(Array.isArray(data) ? data.map(normalizeSalaryRow) : []);
                    setLiveDaily(null);
                    setHasLoaded(true);
                    setLoading(false);
                    return;
                }

                const [{ data: currentCycleRows }, dailyRes] = await Promise.all([
                    api.get(`/salary?month=${currentCycle.month}&year=${currentCycle.year}&fromDate=${currentCycle.fromDate}&toDate=${currentCycle.toDate}`),
                    user?.emp_id
                        ? api.get(`/salary/daily?emp_id=${encodeURIComponent(user.emp_id)}&fromDate=${currentCycle.fromDate}&toDate=${currentCycle.toDate}`)
                            .catch(() => ({ data: null }))
                        : Promise.resolve({ data: null })
                ]);

                const currentRows = Array.isArray(currentCycleRows) ? currentCycleRows.map(normalizeSalaryRow) : [];
                const myCurrent = currentRows.find((r) => (
                    normalizeEmpId(r.emp_id) === normalizeEmpId(user?.emp_id)
                    && isSameCycle(r, currentCycle)
                ));
                setRows(myCurrent ? [myCurrent] : []);
                setLiveDaily(dailyRes?.data || null);
                setHasLoaded(true);
                setLoading(false);
                return;
            }

            const params = new URLSearchParams();
            params.set('month', String(selectedCycle.month));
            params.set('year', String(selectedCycle.year));
            params.set('fromDate', selectedCycle.fromDate);
            params.set('toDate', selectedCycle.toDate);
            params.set('paidStatuses', JSON.stringify(paidStatuses));
            params.set('unpaidStatuses', JSON.stringify(unpaidStatuses));

            const { data } = await api.get(`/salary?${params.toString()}`);
            setRows(Array.isArray(data) ? data.map(normalizeSalaryRow) : []);
            setLiveDaily(null);
            setHasLoaded(true);
        } catch (error) {
            console.error('Failed to fetch salaries:', error);
            setRows([]);
            setLiveDaily(null);
        } finally {
            setLoading(false);
        }
    };

    const refreshCalendarTotals = useCallback(async () => {
        if (!canInstitutionWide || isPersonalView) {
            setCalendarTotals({ workingDays: null, holidays: null });
            return;
        }

        try {
            const params = new URLSearchParams({
                startDate: selectedCycle.fromDate,
                endDate: selectedCycle.toDate
            });
            const { data } = await api.get(`/attendance/summary?${params.toString()}`);
            if (Array.isArray(data) && data.length > 0) {
                const workingDays = Number(data[0]?.total_working_days || 0);
                const holidays = Number(data[0]?.total_holidays || 0);
                setCalendarTotals({ workingDays, holidays });
            } else {
                setCalendarTotals({ workingDays: null, holidays: null });
            }
        } catch (error) {
            console.error('Failed to fetch calendar totals:', error);
            setCalendarTotals({ workingDays: null, holidays: null });
        }
    }, [canInstitutionWide, isPersonalView, selectedCycle.fromDate, selectedCycle.toDate]);

    const handleRefreshRows = async () => {
        if (canInstitutionWide && !isHistoryPage && !isPersonalView) {
            try {
                await api.post('/salary/calculate', {
                    month: currentCycle.month,
                    year: currentCycle.year,
                    fromDate: currentCycle.fromDate,
                    toDate: currentCycle.toDate,
                    paidStatuses,
                    unpaidStatuses,
                    forceRecalculateAll: true
                });
            } catch (error) {
                console.error('Manual calculate failed:', error?.response?.data || error.message);
            }
        }
        await refreshRows();
    };

    const handleForceRecalculateAll = async () => {
        if (!canInstitutionWide || isPersonalView || isHistoryPage) return;

        const confirm = await Swal.fire({
            title: 'Recalculate All Employee Salaries?',
            text: `${selectedCycle.fromDate} to ${selectedCycle.toDate} for all employees. Paid records will stay Paid but values will be recalculated from attendance.`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Yes, Recalculate All',
            confirmButtonColor: '#0284c7'
        });
        if (!confirm.isConfirmed) return;

        setLoading(true);
        try {
            const { data } = await api.post('/salary/calculate', {
                month: selectedCycle.month,
                year: selectedCycle.year,
                fromDate: selectedCycle.fromDate,
                toDate: selectedCycle.toDate,
                paidStatuses,
                unpaidStatuses,
                forceRecalculateAll: true
            });

            await refreshRows();
            Swal.fire('Recalculated', data?.message || 'All salary records were recalculated successfully.', 'success');
        } catch (error) {
            console.error('Force recalculation failed:', error?.response?.data || error.message);
            Swal.fire('Error', 'Failed to recalculate all salary records.', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        let mounted = true;

        const triggerAutoRefreshOnce = async () => {
            if (!mounted || autoRefreshInFlightRef.current || !refreshOnReturnRef.current) return;
            autoRefreshInFlightRef.current = true;
            refreshOnReturnRef.current = false;
            try {
                // One-time fast refresh when user lands/returns to this page.
                await refreshRows();
            } finally {
                autoRefreshInFlightRef.current = false;
            }
        };

        const markRefreshNeeded = () => {
            refreshOnReturnRef.current = true;
        };

        const onVisibilityChange = () => {
            if (document.visibilityState === 'hidden') {
                markRefreshNeeded();
                return;
            }
            triggerAutoRefreshOnce();
        };

        // Route switch to any payroll page should refresh once automatically.
        markRefreshNeeded();
        triggerAutoRefreshOnce();

        document.addEventListener('visibilitychange', onVisibilityChange);

        return () => {
            mounted = false;
            document.removeEventListener('visibilitychange', onVisibilityChange);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [location.pathname]);

    useEffect(() => {
        refreshCalendarTotals();
    }, [refreshCalendarTotals]);

    useEffect(() => {
        if (!socket || isPersonalView) return;

        const handleCalendarUpdate = () => {
            refreshCalendarTotals();
        };

        socket.on('calendar_updated', handleCalendarUpdate);
        return () => {
            socket.off('calendar_updated', handleCalendarUpdate);
        };
    }, [socket, isPersonalView, refreshCalendarTotals]);

    useEffect(() => {
        const fetchDepartments = async () => {
            if (!canInstitutionWide) return;
            try {
                const { data } = await api.get('/departments');
                setDepartments(Array.isArray(data) ? data : []);
            } catch (error) {
                console.error('Failed to fetch departments:', error);
                setDepartments([]);
            }
        };
        fetchDepartments();
    }, [canInstitutionWide]);

    useEffect(() => {
        const fetchStatusOptions = async () => {
            if (!canInstitutionWide || isHistoryPage || isPersonalView) return;
            try {
                const params = new URLSearchParams({
                    startDate: selectedCycle.fromDate,
                    endDate: selectedCycle.toDate
                });
                const { data } = await api.get(`/attendance/status-options?${params.toString()}`);
                setAttendanceStatusOptions(Array.isArray(data) ? data : []);
            } catch (error) {
                console.error('Failed to fetch attendance status options:', error);
                setAttendanceStatusOptions([]);
            }
        };

        fetchStatusOptions();
    }, [canInstitutionWide, isHistoryPage, isPersonalView, selectedCycle.fromDate, selectedCycle.toDate]);

    const openAttendanceConfig = () => {
        const allStatuses = Array.from(new Set([
            ...attendanceStatusOptions,
            ...paidStatuses,
            ...unpaidStatuses
        ])).filter(Boolean);

        const renderStatusCheckboxes = (statuses, group) => statuses.map((status) => {
            const escaped = escapeHtml(status);
            const safeId = `swal-${group}-${String(status).replace(/[^a-zA-Z0-9_-]/g, '_')}`;
            const checked = group === 'paid'
                ? paidStatuses.includes(status)
                : unpaidStatuses.includes(status);

            return `
                <label for="${safeId}" class="flex items-center gap-2 py-1 text-xs">
                    <input id="${safeId}" data-group="${group}" data-status="${escaped}" type="checkbox" ${checked ? 'checked' : ''}>
                    <span>${escaped}</span>
                </label>
            `;
        }).join('');

        Swal.fire({
            title: 'Attendance Status Calculations',
            html: `
                <div class="text-left text-sm">
                    <div class="mb-4">
                        <label class="block font-bold text-gray-600 mb-2">Statuses with Pay</label>
                        <div id="swal-paid-list" class="max-h-52 overflow-y-auto border border-gray-200 rounded-lg px-3 py-2 bg-gray-50">
                            ${renderStatusCheckboxes(allStatuses, 'paid')}
                        </div>
                    </div>
                    <div>
                        <label class="block font-bold text-gray-600 mb-2">Statuses without Pay (LOP)</label>
                        <div id="swal-unpaid-list" class="max-h-52 overflow-y-auto border border-gray-200 rounded-lg px-3 py-2 bg-gray-50">
                            ${renderStatusCheckboxes(allStatuses, 'unpaid')}
                        </div>
                    </div>
                    <p class="text-xs text-gray-500 mt-4">Select available attendance statuses. Changes will trigger salary recalculation for the current period.</p>
                </div>
            `,
            focusConfirm: false,
            showCancelButton: true,
            confirmButtonText: 'Save & Recalculate',
            preConfirm: () => {
                const paid = Array.from(document.querySelectorAll('#swal-paid-list input[type="checkbox"]:checked'))
                    .map((el) => el.getAttribute('data-status') || '')
                    .map((s) => s.trim())
                    .filter(Boolean);
                const unpaid = Array.from(document.querySelectorAll('#swal-unpaid-list input[type="checkbox"]:checked'))
                    .map((el) => el.getAttribute('data-status') || '')
                    .map((s) => s.trim())
                    .filter(Boolean);

                if (!paid.length && !unpaid.length) {
                    Swal.showValidationMessage('Select at least one status in with-pay or without-pay.');
                    return null;
                }

                return { paid, unpaid };
            }
        }).then(async (result) => {
            if (result.isConfirmed) {
                const { paid, unpaid } = result.value;
                setPaidStatuses(paid);
                setUnpaidStatuses(unpaid);
                localStorage.setItem('salary_paid_statuses', JSON.stringify(paid));
                localStorage.setItem('salary_unpaid_statuses', JSON.stringify(unpaid));

                try {
                    if (canInstitutionWide && !isHistoryPage) {
                        await api.post('/salary/calculate', {
                            month: currentCycle.month,
                            year: currentCycle.year,
                            fromDate: currentCycle.fromDate,
                            toDate: currentCycle.toDate,
                            paidStatuses: paid,
                            unpaidStatuses: unpaid,
                            forceRecalculateAll: true
                        });
                    }
                    await handleRefreshRows();
                    Swal.fire('Saved!', 'Attendance rules updated and salaries recalculated.', 'success');
                } catch (error) {
                    console.error('Failed to save config:', error);
                    Swal.fire('Warning', 'Configuration saved locally. Recalculation failed.', 'warning');
                }
            }
        });
    };

    const handlePublishSelected = async () => {
        if (!selectedIds.length) return;
        
        const confirm = await Swal.fire({
            title: 'Publish Salaries?',
            text: `Are you sure you want to publish salaries for ${selectedIds.length} selected employees? This will mark them as Paid and notify the employees.`,
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'Yes, Publish',
            confirmButtonColor: '#0ea5e9'
        });

        if (!confirm.isConfirmed) return;

        setLoading(true);
        try {
            const { data } = await api.post('/salary/publish', {
                month: selectedCycle.month,
                year: selectedCycle.year,
                fromDate: selectedCycle.fromDate,
                toDate: selectedCycle.toDate,
                emp_ids: selectedIds
            });
            
            Swal.fire('Published!', data.message, 'success');
            setSelectedIds([]);
            await handleRefreshRows();
        } catch (error) {
            console.error('Failed to publish salaries:', error);
            Swal.fire('Error', 'Failed to publish selected salaries.', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handlePublishPeriod = async () => {
        const confirm = await Swal.fire({
            title: 'Publish Salaries for this Period? ',
            text: `${selectedCycle.fromDate} to ${selectedCycle.toDate} (All employees)` ,
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'Yes, Publish',
            confirmButtonColor: '#0ea5e9'
        });

        if (!confirm.isConfirmed) return;

        setLoading(true);
        try {
            const { data } = await api.post('/salary/publish', {
                month: selectedCycle.month,
                year: selectedCycle.year,
                fromDate: selectedCycle.fromDate,
                toDate: selectedCycle.toDate
            });

            Swal.fire('Published!', data.message, 'success');
            setSelectedIds([]);
            await handleRefreshRows();
        } catch (error) {
            console.error('Failed to publish salaries:', error);
            Swal.fire('Error', 'Failed to publish salaries for this period.', 'error');
        } finally {
            setLoading(false);
        }
    };

    const toggleSelectAll = () => {
        if (selectedIds.length === filteredRows.length) {
            setSelectedIds([]);
        } else {
            setSelectedIds(filteredRows.map(r => r.emp_id));
        }
    };

    const toggleSelectOne = (empId) => {
        setSelectedIds(prev => 
            prev.includes(empId) ? prev.filter(id => id !== empId) : [...prev, empId]
        );
    };

    const updateStatus = async (row, nextStatus) => {
        if (String(row.id).startsWith('history_')) {
            Swal.fire('Not allowed', 'Archived history entries cannot be changed.', 'info');
            return;
        }

        if (nextStatus === 'Pending' && row.status === 'Paid') {
            const confirm = await Swal.fire({
                title: 'Revert to Unpaid?',
                text: 'This record was previously published as Paid. Are you sure you want to revert it to Pending? This will allow future recalculations to update this record.',
                icon: 'warning',
                showCancelButton: true,
                confirmButtonText: 'Yes, Revert',
                confirmButtonColor: '#e11d48'
            });
            if (!confirm.isConfirmed) return;
        }

        await api.put(`/salary/${row.id}/status`, { status: nextStatus });

        if (nextStatus === 'Paid') {
            const viewUrl = `${window.location.origin}/${String(row.role || 'staff').toLowerCase()}/payroll`;
            await api.post('/salary/notify-paid', {
                emp_id: row.emp_id,
                name: row.name,
                email: row.email,
                fromDate: selectedCycle.fromDate,
                toDate: selectedCycle.toDate,
                amount: row.calculated_salary,
                viewUrl
            });
        }
    };

    const printPaymentSlip = async (row) => {
        const fixedSalary = Number(row.monthly_salary ?? row.gross_salary ?? 0);
        const earnedSalary = getEarnedSalary(row);
        const deduction = Number(row.deductions_applied || 0);
        const net = Number(row.calculated_salary || 0);
        const withPay = getWithPayDays(row).toFixed(1);
        const withoutPay = getWithoutPayDays(row).toFixed(1);
        const generatedAt = formatGeneratedAt();

        const html = `
            <html>
                <head>
                    <title>Payment Slip - ${escapeHtml(row.name)}</title>
                    <style>
                        @page { size: A4; margin: 10mm; }
                        * { box-sizing: border-box; }
                        body { font-family: Arial, sans-serif; margin: 0; color: #0f172a; }
                        .slip {
                            border: 2px solid #dbeafe;
                            border-radius: 16px;
                            padding: 18px;
                            background: linear-gradient(180deg, #f8fbff 0%, #ffffff 100%);
                        }
                        .page-head {
                            display: flex;
                            justify-content: space-between;
                            align-items: flex-start;
                            margin-bottom: 12px;
                        }
                        .head-center {
                            text-align: center;
                            font-size: 18px;
                            font-weight: 900;
                            letter-spacing: 0.05em;
                            color: #0f172a;
                            flex: 1;
                        }
                        .brand-right {
                            text-align: right;
                            font-size: 10px;
                            font-weight: 700;
                            color: #334155;
                            line-height: 1.4;
                            min-width: 190px;
                        }
                        .head {
                            display: flex;
                            justify-content: space-between;
                            align-items: center;
                            gap: 12px;
                            border-bottom: 1px dashed #bfdbfe;
                            padding-bottom: 12px;
                            margin-bottom: 14px;
                        }
                        .title { font-weight: 900; letter-spacing: 0.04em; font-size: 24px; margin: 0; }
                        .meta { font-size: 12px; color: #475569; margin-top: 4px; }
                        .chip { font-size: 11px; font-weight: 700; background: #e0f2fe; color: #0369a1; padding: 6px 10px; border-radius: 999px; border: 1px solid #bae6fd; }
                        .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-bottom: 12px; }
                        .box { border: 1px solid #e2e8f0; border-radius: 12px; padding: 10px; background: #fff; }
                        .lbl { font-size: 10px; color: #64748b; text-transform: uppercase; letter-spacing: 0.12em; font-weight: 700; }
                        .val { font-size: 14px; font-weight: 800; margin-top: 4px; }
                        table { width: 100%; border-collapse: collapse; margin-top: 8px; }
                        th, td { border: 1px solid #e2e8f0; padding: 10px; font-size: 12px; text-align: left; }
                        th { background: #eff6ff; text-transform: uppercase; letter-spacing: 0.08em; font-size: 10px; }
                        .right { text-align: right; }
                        .footer { margin-top: 12px; font-size: 10px; color: #64748b; }
                    </style>
                </head>
                <body>
                    <div class="slip">
                        <div class="page-head">
                            <div></div>
                            <div class="head-center">PPG MANAGEMENT SALARY</div>
                            <div class="brand-right">
                                <div>PPG EMP HUB</div>
                                <div>Generated: ${escapeHtml(generatedAt)}</div>
                                <div>Payroll Payment Slip</div>
                            </div>
                        </div>
                        <div class="head">
                            <div>
                                <p class="title">Payment Slip</p>
                                <p class="meta">${escapeHtml(row.from_date || selectedCycle.fromDate)} to ${escapeHtml(row.to_date || selectedCycle.toDate)}</p>
                            </div>
                            <span class="chip">${escapeHtml(String(row.status || 'Pending'))}</span>
                        </div>

                        <div class="grid">
                            <div class="box"><div class="lbl">Employee</div><div class="val">${escapeHtml(row.name)}</div></div>
                            <div class="box"><div class="lbl">Employee ID</div><div class="val">${escapeHtml(row.emp_id)}</div></div>
                            <div class="box"><div class="lbl">Department</div><div class="val">${escapeHtml(row.department_name || '-')}</div></div>
                            <div class="box"><div class="lbl">Role</div><div class="val">${escapeHtml(row.role || '-')}</div></div>
                        </div>

                        <table>
                            <thead>
                                <tr>
                                    <th>Description</th>
                                    <th class="right">Amount (Rs)</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr><td>Fixed Salary</td><td class="right">${toCurrency(fixedSalary)}</td></tr>
                                <tr><td>Present Days</td><td class="right">${Number(row?.present_days ?? 0).toFixed(1)}</td></tr>
                                <tr><td>With Pay Days (Leave)</td><td class="right">${withPay}</td></tr>
                                <tr><td>Total Payable Days</td><td class="right">${(Number(row?.total_payable_days ?? 0) || (Number(row?.present_days ?? 0) + Number(row?.with_pay_days ?? 0))).toFixed(1)}</td></tr>
                                <tr><td>Without Pay (Deducted)</td><td class="right" style="color:#dc2626">${withoutPay}</td></tr>
                                <tr><td>Earned Salary</td><td class="right">${toCurrency(earnedSalary)}</td></tr>
                                <tr><td>Total Deductions</td><td class="right">${toCurrency(deduction)}</td></tr>
                                <tr><td>Net Salary</td><td class="right">${toCurrency(net)}</td></tr>
                            </tbody>
                        </table>

                        <p class="footer">Generated from Salary Records.</p>
                    </div>
                </body>
            </html>
        `;

        await runPrintWindow({
            title: `Payment Slip - ${row.name}`,
            html,
            windowFeatures: 'width=900,height=900',
            delay: 250,
            modeLabel: 'the payment slip'
        });
    };

    const printAllHistoryRows = async () => {
        const generatedAt = formatGeneratedAt();

        const bodyRows = filteredRows.map((r, index) => `
            ${(() => {
                const detail = getDetailedDeductionBreakdown(r.deductions, r);
                const monthlyFixed = Number(r.monthly_salary ?? 0);
                const grossSalary = Number(r.gross_salary ?? getEarnedSalary(r) ?? 0);
                const totalDeductions = Number(r.deductions_applied || 0);
                const netSalary = Number(r.calculated_salary || 0);
                const otherLabel = detail.otherLabel ? `Other (${detail.otherLabel})` : 'Other';
                return `
            <tr>
                <td>${index + 1}</td>
                <td>${escapeHtml(r.name)}</td>
                <td>${escapeHtml(r.emp_id)}</td>
                <td>${escapeHtml(r.department_name || '-')}</td>
                <td class="right">${toCurrency(grossSalary)}</td>
                <td class="right">${toCurrency(monthlyFixed)}</td>
                <td class="right">${toCurrency(detail.employPf)}</td>
                <td class="right">${toCurrency(detail.salaryAdvance)}</td>
                <td class="right">${toCurrency(detail.hostelFoodFees)}</td>
                <td class="right">${toCurrency(detail.busFees)}</td>
                <td class="right">${toCurrency(detail.lwf)}</td>
                <td class="right">${toCurrency(detail.tds)}</td>
                <td class="right" title="${escapeHtml(otherLabel)}">${toCurrency(detail.other)}</td>
                <td class="right">${toCurrency(totalDeductions)}</td>
                <td class="right">${toCurrency(netSalary)}</td>
                <td>${escapeHtml(String(r.status || 'Pending'))}</td>
            </tr>
                `;
            })()}
        `).join('');

        const html = `
            <html>
                <head>
                    <title>Salary History - All Employees</title>
                    <style>
                        @page { size: A4 portrait; margin: 8mm; }
                        * { box-sizing: border-box; }
                        body { font-family: Arial, sans-serif; margin: 0; color: #111827; }
                        .wrap { width: 100%; }
                        .head { margin-bottom: 10px; }
                        .title { margin: 0; font-size: 20px; font-weight: 900; letter-spacing: 0.03em; }
                        .sub { margin-top: 4px; font-size: 11px; color: #4b5563; }
                        .brand-right { text-align: right; font-size: 10px; font-weight: 700; color: #334155; line-height: 1.4; margin-bottom: 8px; }
                        table { width: 100%; border-collapse: collapse; }
                        thead { display: table-header-group; }
                        tr { page-break-inside: avoid; }
                        th, td { border: 1px solid #dbeafe; padding: 7px; font-size: 10px; vertical-align: top; }
                        th { background: #eff6ff; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 800; }
                        .right { text-align: right; }
                    </style>
                </head>
                <body>
                    <div class="wrap">
                        <div class="brand-right">
                            <div>PPG EMP HUB</div>
                            <div>Generated: ${escapeHtml(generatedAt)}</div>
                            <div>Salary History Records</div>
                        </div>
                        <div class="head">
                            <p class="title">Salary History Records</p>
                            <p class="sub">Cycle: ${escapeHtml(selectedCycle.fromDate)} to ${escapeHtml(selectedCycle.toDate)} | Total Employees: ${filteredRows.length}</p>
                        </div>
                        <table>
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th>Employee</th>
                                    <th>Emp ID</th>
                                    <th>Department</th>
                                    <th class="right">Gross Salary</th>
                                    <th class="right">Fixed Salary</th>
                                    <th class="right">Employ PF</th>
                                    <th class="right">Salary Advance</th>
                                    <th class="right">Hostel/Food Fees</th>
                                    <th class="right">Bus Fees</th>
                                    <th class="right">LWF</th>
                                    <th class="right">TDS</th>
                                    <th class="right">Other</th>
                                    <th class="right">Total Deductions</th>
                                    <th class="right">Net Salary</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${bodyRows}
                                <tr style="font-weight: 800; background: #eff6ff;">
                                    <td colspan="4" class="right">TOTAL</td>
                                    <td class="right">${toCurrency(filteredRows.reduce((acc, r) => acc + Number(r.gross_salary ?? getEarnedSalary(r) ?? 0), 0))}</td>
                                    <td colspan="9"></td>
                                    <td class="right">${toCurrency(filteredRows.reduce((acc, r) => acc + Number(r.calculated_salary || 0), 0))}</td>
                                    <td></td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </body>
            </html>
        `;

        await runPrintWindow({
            title: 'Salary History - All Employees',
            html,
            windowFeatures: 'width=1100,height=900',
            delay: 250,
            modeLabel: 'the salary history report'
        });
    };

    const reportCurrentSalaryRows = async () => {
        if (!filteredRows.length) {
            Swal.fire('No Data', 'No salary records available for this report.', 'info');
            return;
        }

        const generatedAt = formatGeneratedAt();
        const bodyRows = filteredRows.map((r, index) => `
            ${(() => {
                const detail = getDetailedDeductionBreakdown(r.deductions, r);
                const otherLabel = detail.otherLabel ? `Other (${detail.otherLabel})` : 'Other';
                const fixedSalary = Number(r.monthly_salary ?? 0);
                const grossSalary = Number(r.gross_salary ?? getEarnedSalary(r) ?? 0);
                const earnedSalary = Number(getEarnedSalary(r) || 0);
                const earnedSplit = getEarnedSalaryConceptSplit(earnedSalary);
                const totalDays = Number(r.total_days_in_period || totalCycleDays || 0);
                const workingDays = Number(cycleWorkingDays || 0);
                const presentDays = getPresentDays(r);
                const withPayDays = getWithPayDays(r);
                const paidDays = getTotalPayableDays(r); // present + with_pay
                const unpaidDays = getWithoutPayDays(r);
                return `
            <tr>
                <td>${index + 1}</td>
                <td>${escapeHtml(r.name)}</td>
                <td>${escapeHtml(r.emp_id)}</td>
                <td>${escapeHtml(r.department_name || '-')}</td>
                <td class="right">${totalDays.toFixed(1)}</td>
                <td class="right">${workingDays.toFixed(1)}</td>
                <td class="right">${toCurrency(fixedSalary)}</td>
                <td class="right">${toCurrency(grossSalary)}</td>
                <td class="right excel-only">${presentDays.toFixed(1)}</td>
                <td class="right excel-only">${withPayDays.toFixed(1)}</td>
                <td class="right excel-only">${paidDays.toFixed(1)}</td>
                <td class="right excel-only">${unpaidDays.toFixed(1)}</td>
                <td class="right excel-only">${toCurrency(earnedSalary)}</td>
                <td class="right excel-only">${toCurrency(earnedSplit.basicSalary)}</td>
                <td class="right excel-only">${toCurrency(earnedSplit.performance)}</td>
                <td class="right excel-only">${toCurrency(earnedSplit.conveyance)}</td>
                <td class="right">${toCurrency(detail.employPf)}</td>
                <td class="right">${toCurrency(detail.salaryAdvance)}</td>
                <td class="right">${toCurrency(detail.hostelFoodFees)}</td>
                <td class="right">${toCurrency(detail.busFees)}</td>
                <td class="right">${toCurrency(detail.lwf)}</td>
                <td class="right">${toCurrency(detail.tds)}</td>
                <td class="right" title="${escapeHtml(otherLabel)}">${toCurrency(detail.other)}</td>
                <td class="right">${toCurrency(r.deductions_applied || 0)}</td>
                <td class="right">${toCurrency(r.calculated_salary || 0)}</td>
                <td>${escapeHtml(String(r.status || 'Pending'))}</td>
            </tr>
                `;
            })()}
        `).join('');

        const html = `
            <html>
                <head>
                    <title>Salary Records Report</title>
                    <style>
                        @page { size: A4 landscape; margin: 8mm; }
                        * { box-sizing: border-box; }
                        body { font-family: Arial, sans-serif; margin: 0; color: #111827; }
                        .wrap { width: 100%; }
                        .head { margin-bottom: 10px; }
                        .title { margin: 0; font-size: 20px; font-weight: 900; letter-spacing: 0.03em; }
                        .sub { margin-top: 4px; font-size: 11px; color: #4b5563; }
                        .brand-right { text-align: right; font-size: 10px; font-weight: 700; color: #334155; line-height: 1.4; margin-bottom: 8px; }
                        table { width: 100%; border-collapse: collapse; }
                        thead { display: table-header-group; }
                        tr { page-break-inside: avoid; }
                        th, td { border: 1px solid #dbeafe; padding: 7px; font-size: 10px; vertical-align: top; }
                        th { background: #eff6ff; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 800; }
                        .right { text-align: right; }
                        .excel-only { display: none; }
                        body.excel-preview .excel-only { display: table-cell; }
                    </style>
                </head>
                <body>
                    <div class="wrap">
                        <div class="brand-right">
                            <div>PPG EMP HUB</div>
                            <div>Generated: ${escapeHtml(generatedAt)}</div>
                            <div>Salary Records</div>
                        </div>
                        <div class="head">
                            <p class="title">Salary Records Report</p>
                            <p class="sub">Cycle: ${escapeHtml(selectedCycle.fromDate)} to ${escapeHtml(selectedCycle.toDate)} | Total Employees: ${filteredRows.length}</p>
                        </div>
                        <table>
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th>Employee</th>
                                    <th>Emp ID</th>
                                    <th>Department</th>
                                    <th class="right">Total Days</th>
                                    <th class="right">Total Working Days</th>
                                    <th class="right">Fixed Salary</th>
                                    <th class="right">Gross Salary</th>
                                    <th class="right excel-only">Present Days</th>
                                    <th class="right excel-only">With Pay Days</th>
                                    <th class="right excel-only">Total Payable Days</th>
                                    <th class="right excel-only">Without Pay Days</th>
                                    <th class="right excel-only">Earned Salary</th>
                                    <th class="right excel-only">Basic Salary</th>
                                    <th class="right excel-only">Performance</th>
                                    <th class="right excel-only">Conveyance</th>
                                    <th class="right">Employ PF</th>
                                    <th class="right">Salary Advance</th>
                                    <th class="right">Hostel/Food Fees</th>
                                    <th class="right">Bus Fees</th>
                                    <th class="right">LWF</th>
                                    <th class="right">TDS</th>
                                    <th class="right">Other</th>
                                    <th class="right">Total Deductions</th>
                                    <th class="right">Net Salary</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${bodyRows}
                                <tr style="font-weight: 800; background: #eff6ff;">
                                    <td colspan="7" class="right">TOTAL</td>
                                    <td class="right">${toCurrency(filteredRows.reduce((acc, r) => acc + Number(r.gross_salary ?? getEarnedSalary(r) ?? 0), 0))}</td>
                                    <td colspan="8" class="excel-only"></td>
                                    <td colspan="8"></td>
                                    <td class="right">${toCurrency(filteredRows.reduce((acc, r) => acc + Number(r.calculated_salary || 0), 0))}</td>
                                    <td></td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </body>
            </html>
        `;

        await runPrintWindow({
            title: 'Salary Records Report',
            html,
            windowFeatures: 'width=1200,height=900',
            delay: 250,
            modeLabel: 'the salary records report'
        });
    };

    const handleBulkMark = async (status) => {
        const chosen = filteredRows.filter((r) => selectedIds.includes(r.emp_id));
        if (!chosen.length) {
            Swal.fire('No selection', 'Select one or more records first.', 'info');
            return;
        }

        const result = await Swal.fire({
            title: `Mark ${chosen.length} records as ${status}?`,
            text: `${selectedCycle.fromDate} to ${selectedCycle.toDate}`,
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'Confirm'
        });
        if (!result.isConfirmed) return;

        const settled = await Promise.allSettled(
            chosen.map(async (r) => {
                await updateStatus(r, status);
            })
        );

        const failed = settled.filter((s) => s.status === 'rejected').length;
        setSelectedIds([]);
        await handleRefreshRows();

        if (failed > 0) {
            Swal.fire('Partial Success', `${chosen.length - failed} updated, ${failed} failed.`, 'warning');
        } else {
            Swal.fire('Success', `${chosen.length} records updated.`, 'success');
        }
    };

    const handleSubmitReport = async () => {
        const { value } = await Swal.fire({
            title: 'Submit Salary Report',
            html: `
                <select id="salary-report-type" class="swal2-input">
                    <option value="Salary Credit Delay">Salary Credit Delay</option>
                    <option value="Pay Mismatch">Pay Mismatch</option>
                    <option value="Attendance Mismatch">Attendance Mismatch</option>
                    <option value="Deduction Clarification">Deduction Clarification</option>
                    <option value="Other">Other</option>
                </select>
                <textarea id="salary-report-reason" class="swal2-textarea" placeholder="Enter reason"></textarea>
            `,
            focusConfirm: false,
            preConfirm: () => {
                const reportType = document.getElementById('salary-report-type')?.value || 'Other';
                const reason = document.getElementById('salary-report-reason')?.value?.trim() || '';
                if (!reason) {
                    Swal.showValidationMessage('Reason is required');
                    return null;
                }
                return { reportType, reason };
            },
            showCancelButton: true,
            confirmButtonText: 'Submit'
        });

        if (!value) return;

        try {
            await api.post('/salary/reports', value);
            Swal.fire('Submitted', 'Your report has been sent to admin.', 'success');
        } catch (error) {
            console.error('Failed to submit report:', error);
            Swal.fire('Error', error?.response?.data?.message || 'Report submission failed.', 'error');
        }
    };


    useEffect(() => {
        if (!isHistoryPage) {
            setSelectedIds([]);
        }
    }, [isHistoryPage]);

    const renderFilterControls = canInstitutionWide && (
        <motion.div
            variants={fadeUp}
            transition={{ duration: 0.35, ease: 'easeOut' }}
            className="modern-card p-6 border-sky-100 mb-6"
        >
            <div className="flex items-center gap-3 mb-4">
                <div className="h-10 w-10 rounded-xl bg-sky-500 flex items-center justify-center text-white shadow-lg shadow-sky-100">
                    <FaFilter size={14} />
                </div>
                <div>
                    <p className="text-sm font-black text-gray-800 tracking-tight">Salary Filters</p>
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">Role and department based records</p>
                </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 mb-2">Select Role</label>
                    <select
                        value={activeRole}
                        onChange={(e) => setActiveRole(e.target.value)}
                        className="w-full px-4 py-3 rounded-2xl bg-gray-50 border border-gray-100 text-sm font-bold text-gray-700 outline-none focus:ring-4 focus:ring-sky-100"
                    >
                        <option value="all">All Roles</option>
                        <option value="principal">Principal</option>
                        <option value="hod">HOD</option>
                        <option value="staff">Staff</option>
                        <option value="management">Management</option>
                    </select>
                </div>
                <div>
                    <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 mb-2">Select Department</label>
                    <select
                        value={activeDepartment}
                        onChange={(e) => setActiveDepartment(e.target.value)}
                        className="w-full px-4 py-3 rounded-2xl bg-gray-50 border border-gray-100 text-sm font-bold text-gray-700 outline-none focus:ring-4 focus:ring-sky-100"
                    >
                        <option value="all">All Departments</option>
                        {departmentOptions.map((name) => (
                            <option key={name} value={name.toLowerCase()}>{name}</option>
                        ))}
                    </select>
                </div>
            </div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-400 mt-4">Filtered records: {filteredRows.length}</p>
        </motion.div>
    );

    return (
        <Layout>
            <motion.div
                initial="hidden"
                animate="show"
                variants={staggerWrap}
                className="max-w-7xl mx-auto pb-4"
            >
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-6">
                    <div>
                        <h1 className="text-3xl md:text-4xl font-black text-gray-800 tracking-tighter">
                            {isPersonalView ? (
                                isHistoryPage
                                    ? <>My Salary <span className="text-sky-600">History</span></>
                                    : <>My Salary <span className="text-sky-600">Details</span></>
                            ) : isHistoryPage ? (
                                <>Salary <span className="text-sky-600">History</span></>
                            ) : (
                                <>Salary <span className="text-sky-600">Management</span></>
                            )}
                        </h1>
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 mt-2">
                            {isPersonalView
                                ? (isHistoryPage
                                    ? 'View your published salary for past payroll months.'
                                    : 'Your own salary for the exact current payroll month is shown here with live updates.')
                                : isHistoryPage
                                    ? 'Select period by month and year using fixed cycle 26 to 25.'
                                    : 'Current live payroll period is fixed and not editable.'}
                        </p>
                    </div>

                    <div className="flex flex-wrap gap-4">
                        {isAdmin && !isHistoryPage && (
                            <button
                                onClick={openAttendanceConfig}
                                className="bg-sky-600 text-white px-8 py-4 rounded-2xl shadow-xl shadow-sky-100 hover:bg-sky-700 transition-all active:scale-95 flex items-center font-black uppercase tracking-[0.2em] text-[10px]"
                            >
                                <FaCog className="mr-3 group-hover:-rotate-12 transition-transform" /> Calculations
                            </button>
                        )}

                        {isPersonalView && !isHistoryPage && (
                            <button
                                onClick={() => navigate(`/${user.role}/payroll/history`)}
                                className="bg-sky-600 text-white px-8 py-4 rounded-2xl shadow-xl shadow-sky-100 hover:bg-sky-700 transition-all active:scale-95 flex items-center font-black uppercase tracking-[0.2em] text-[10px]"
                            >
                                <FaHistory className="mr-3 group-hover:-rotate-12 transition-transform" /> History
                            </button>
                        )}
                        {isPersonalView && isHistoryPage && (
                            <button
                                onClick={() => navigate(`/${user.role}/payroll`)}
                                className="bg-sky-600 text-white px-8 py-4 rounded-2xl shadow-xl shadow-sky-100 hover:bg-sky-700 transition-all active:scale-95 flex items-center font-black uppercase tracking-[0.2em] text-[10px]"
                            >
                                <FaSearch className="mr-3 group-hover:scale-110 transition-transform" /> Live
                            </button>
                        )}
                        {canInstitutionWide && (
                            <>
                                {!isHistoryPage && (
                                    <>
                                        <button
                                            onClick={reportCurrentSalaryRows}
                                            className="bg-sky-600 text-white px-8 py-4 rounded-2xl shadow-xl shadow-sky-100 hover:bg-sky-700 transition-all active:scale-95 flex items-center font-black uppercase tracking-[0.2em] text-[10px]"
                                        >
                                            <FaFileAlt className="mr-3 group-hover:scale-110 transition-transform" /> Report
                                        </button>
                                        {isAdmin && (
                                            <button
                                                onClick={() => navigate(`/${user.role}/payroll/reports`)}
                                                className="bg-sky-600 text-white px-8 py-4 rounded-2xl shadow-xl shadow-sky-100 hover:bg-sky-700 transition-all active:scale-95 flex items-center font-black uppercase tracking-[0.2em] text-[10px]"
                                            >
                                                <FaEnvelope className="mr-3 group-hover:scale-110 transition-transform" /> Complaints
                                            </button>
                                        )}
                                        <button
                                            onClick={() => navigate(`/${user.role}/payroll/history`)}
                                            className="bg-sky-600 text-white px-8 py-4 rounded-2xl shadow-xl shadow-sky-100 hover:bg-sky-700 transition-all active:scale-95 flex items-center font-black uppercase tracking-[0.2em] text-[10px]"
                                        >
                                            <FaHistory className="mr-3 group-hover:-rotate-12 transition-transform" /> History
                                        </button>
                                    </>
                                )}
                                {isHistoryPage && (
                                    <button
                                        onClick={() => navigate(`/${user.role}/payroll`)}
                                        className="bg-sky-600 text-white px-8 py-4 rounded-2xl shadow-xl shadow-sky-100 hover:bg-sky-700 transition-all active:scale-95 flex items-center font-black uppercase tracking-[0.2em] text-[10px]"
                                    >
                                        <FaSearch className="mr-3 group-hover:scale-110 transition-transform" /> Live
                                    </button>
                                )}
                            </>
                        )}
                    </div>
                </div>

                {!isPersonalView && (
                    <motion.div variants={staggerWrap} className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                        <motion.div variants={fadeUp} transition={{ duration: 0.35 }} className="modern-card p-6 border-sky-50 shadow-xl shadow-sky-50/50 flex items-center gap-4 transition-all duration-300 hover:-translate-y-1 group">
                            <div className="h-12 w-12 rounded-xl bg-sky-500 flex items-center justify-center text-white shadow-lg shadow-sky-100 group-hover:scale-110 group-hover:-translate-y-1 transition-transform"><FaMoneyBillWave size={20} /></div>
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">Gross Total</p>
                                <p className="text-xl font-black text-gray-800 tracking-tighter">Rs {toCurrency(summary.gross)}</p>
                            </div>
                        </motion.div>
                        <motion.div variants={fadeUp} transition={{ duration: 0.35 }} className="modern-card p-6 border-emerald-50 shadow-xl shadow-emerald-50/50 flex items-center gap-4 transition-all duration-300 hover:-translate-y-1 group">
                            <div className="h-12 w-12 rounded-xl bg-emerald-500 flex items-center justify-center text-white shadow-lg shadow-emerald-100 group-hover:scale-110 group-hover:-translate-y-1 transition-transform"><FaWallet size={20} /></div>
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">Net Total</p>
                                <p className="text-xl font-black text-emerald-700 tracking-tighter">Rs {toCurrency(summary.net)}</p>
                            </div>
                        </motion.div>
                    </motion.div>
                )}

                {renderFilterControls}

                {isPersonalView && livePersonalOverview && (
                    <motion.div variants={staggerWrap} className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                        <motion.div variants={fadeUp} transition={{ duration: 0.35 }} className="modern-card p-5 border-sky-50">
                            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">Monthly Salary</p>
                            <p className="mt-2 text-xl font-black text-gray-800 tracking-tighter">Rs {toCurrency(livePersonalOverview.monthlySalary)}</p>
                            <p className="text-[10px] font-bold text-gray-400 mt-2">{livePersonalOverview.fromDate} to {livePersonalOverview.toDate}</p>
                        </motion.div>
                        <motion.div variants={fadeUp} transition={{ duration: 0.35 }} className="modern-card p-5 border-rose-50">
                            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">Total Deductions</p>
                            <p className="mt-2 text-xl font-black text-rose-700 tracking-tighter">Rs {toCurrency(livePersonalOverview.deductions)}</p>
                        </motion.div>
                    </motion.div>
                )}

                {showSelectionBar && (
                    <motion.div
                        variants={fadeUp}
                        transition={{ duration: 0.35, ease: 'easeOut' }}
                        className="modern-card p-6 border-sky-100 mb-6 flex flex-wrap gap-3 items-center"
                    >
                        <button onClick={toggleSelectAll} className="bg-gray-100 text-gray-600 px-6 py-3 rounded-2xl hover:bg-gray-200 transition-all font-black uppercase tracking-[0.2em] text-[10px] active:scale-95">{selectedIds.length === filteredRows.length ? 'Clear Selection' : 'Select All'}</button>
                        
                        {selectedIds.length > 0 && (
                            <button 
                                onClick={handlePublishSelected} 
                                className="bg-emerald-600 text-white px-6 py-3 rounded-2xl shadow-lg shadow-emerald-100 hover:bg-emerald-700 transition-all font-black uppercase tracking-[0.2em] text-[10px] active:scale-95 flex items-center gap-2 animate-bounce-subtle"
                            >
                                <FaCheckCircle /> Publish Selected ({selectedIds.length})
                            </button>
                        )}

                        <button onClick={() => handleBulkMark('Paid')} className="bg-sky-600 text-white px-6 py-3 rounded-2xl shadow-lg shadow-sky-100 hover:bg-sky-700 transition-all font-black uppercase tracking-[0.2em] text-[10px] active:scale-95 flex items-center gap-2"><FaCheckCircle /> Publish All</button>
                        <button onClick={() => handleBulkMark('Pending')} className="bg-sky-600 text-white px-6 py-3 rounded-2xl shadow-lg shadow-sky-100 hover:bg-sky-700 transition-all font-black uppercase tracking-[0.2em] text-[10px] active:scale-95 flex items-center gap-2"><FaClock /> Mark All Unpaid</button>
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 ml-auto bg-gray-50 px-4 py-2 rounded-xl">Selected: {selectedIds.length}</span>
                    </motion.div>
                )}

                <motion.div
                    variants={fadeUp}
                    transition={{ duration: 0.4, ease: 'easeOut' }}
                    className="modern-card !p-0 overflow-hidden border-sky-100"
                >
                    <div className="bg-sky-50/30 p-6 border-b border-sky-50 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-xl bg-sky-500 flex items-center justify-center text-white shadow-lg shadow-sky-100">
                                <FaFileAlt size={18} />
                            </div>
                            <h2 className="text-lg font-black text-gray-800 uppercase tracking-widest">Salary Records</h2>
                        </div>
                        <div className="flex flex-wrap items-center justify-end gap-3">
                            <button
                                onClick={handleRefreshRows}
                                className="bg-white text-sky-600 border border-sky-200 px-4 py-2 rounded-xl shadow-lg shadow-sky-50 hover:bg-sky-50 transition-all active:scale-95 flex items-center font-black uppercase tracking-[0.2em] text-[10px]"
                                title="Refresh salary records"
                            >
                                <FaRedoAlt className={`mr-2 transition-transform ${loading ? 'animate-spin' : ''}`} /> Refresh
                            </button>
                            {!isPersonalView && !isHistoryPage && (
                                <button
                                    onClick={handleForceRecalculateAll}
                                    className="bg-sky-600 text-white px-4 py-2 rounded-xl shadow-lg shadow-sky-100 hover:bg-sky-700 transition-all active:scale-95 flex items-center font-black uppercase tracking-[0.2em] text-[10px]"
                                    title="Recalculate all employee salary records from attendance"
                                >
                                    <FaRedoAlt className={`mr-2 transition-transform ${loading ? 'animate-spin' : ''}`} /> Recalculate All Employees
                                </button>
                            )}
                            {!isPersonalView && !isHistoryPage && (
                                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">
                                    <span>Payroll Period</span>
                                    <span className="px-3 py-2 rounded-xl bg-sky-50 text-sky-700 border border-sky-100 normal-case tracking-normal text-xs font-bold">{selectedCycle.fromDate} to {selectedCycle.toDate}</span>
                                    <span className="px-3 py-2 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-100 normal-case tracking-normal text-xs font-bold">Total Working Days: {cycleWorkingDays}</span>
                                    <span className="px-3 py-2 rounded-xl bg-rose-50 text-rose-700 border border-rose-100 normal-case tracking-normal text-xs font-bold">Holidays: {cycleHolidayDays}</span>
                                </div>
                            )}
                            {isHistoryPage && (
                                <>
                                    <div className="flex items-center gap-2">
                                        <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">Month</label>
                                        <select
                                            className="px-3 py-2 rounded-xl border border-gray-100 bg-gray-50 text-sm font-bold text-gray-700"
                                            value={selectedMonth}
                                            onChange={(e) => setSelectedMonth(Number(e.target.value))}
                                        >
                                            {Array.from({ length: 12 }).map((_, i) => (
                                                <option key={i + 1} value={i + 1}>{i + 1}</option>
                                            ))}
                                        </select>
                                        <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">Year</label>
                                        <input
                                            type="number"
                                            className="px-3 py-2 rounded-xl border border-gray-100 bg-gray-50 w-24 text-sm font-bold text-gray-700"
                                            value={selectedYear}
                                            onChange={(e) => setSelectedYear(Number(e.target.value))}
                                        />
                                    </div>
                                    <button
                                        onClick={printAllHistoryRows}
                                        className="bg-sky-600 text-white px-4 py-2 rounded-xl shadow-lg shadow-sky-100 hover:bg-sky-700 transition-all active:scale-95 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em]"
                                    >
                                        <FaFileAlt /> Report All
                                    </button>

                                    {(isAdmin || isManagement) && (
                                        <button
                                            onClick={handlePublishPeriod}
                                            className="bg-emerald-600 text-white px-4 py-2 rounded-xl shadow-lg shadow-emerald-100 hover:bg-emerald-700 transition-all active:scale-95 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em]"
                                            title="Publish salaries for the selected period"
                                        >
                                            <FaCheckCircle /> Publish Period
                                        </button>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                    <div className="px-4 pb-2 md:hidden">
                        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-gray-400">Swipe left and right to view all salary columns</p>
                    </div>
                    <div className="overflow-x-auto -mx-2 px-2 md:mx-0 md:px-0">
                        <table className="min-w-max w-full text-left border-collapse whitespace-nowrap">
                            <thead>
                                <tr className="bg-sky-50/30">
                                    {showSelectionBar && (
                                        <th className="p-3 md:p-4 w-12 border-b border-sky-50">
                                            <div className="flex justify-center">
                                                <input
                                                    type="checkbox"
                                                    className="w-4 h-4 rounded border-sky-200 text-sky-600 focus:ring-sky-500 cursor-pointer"
                                                    checked={selectedIds.length === filteredRows.length && filteredRows.length > 0}
                                                    onChange={toggleSelectAll}
                                                />
                                            </div>
                                        </th>
                                    )}
                                    <th className="p-3 md:p-6 text-[9px] md:text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-sky-50 whitespace-nowrap">{isPersonalView ? 'Period' : 'Employee'}</th>
                                    <th className="p-3 md:p-6 text-[9px] md:text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-sky-50 text-right whitespace-nowrap">With Pay / Without Pay</th>
                                    <th className="p-3 md:p-6 text-[9px] md:text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-sky-50 text-right whitespace-nowrap">Fixed Salary</th>
                                    <th className="p-3 md:p-6 text-[9px] md:text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-sky-50 text-right whitespace-nowrap">Gross Salary</th>
                                    <th className="p-3 md:p-6 text-[9px] md:text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-sky-50 text-right whitespace-nowrap">Deductions</th>
                                    <th className="p-3 md:p-6 text-[9px] md:text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-sky-50 text-right whitespace-nowrap">Net Salary</th>
                                    {showStatusColumn && <th className="p-3 md:p-6 text-[9px] md:text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-sky-50 text-center whitespace-nowrap">Status</th>}
                                    {showActionsColumn && <th className="p-3 md:p-6 text-[9px] md:text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-sky-50 text-center whitespace-nowrap">Actions</th>}
                                </tr>
                            </thead>
                        <tbody>
                            <AnimatePresence mode="popLayout">
                                {!loading && filteredRows.map((r, idx) => {
                                const fixedSalary = Number(r.monthly_salary ?? 0);
                                const grossSalary = Number(r.gross_salary ?? getEarnedSalary(r) ?? 0);
                                return (
                                <motion.tr
                                    key={r.id}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.98 }}
                                    transition={{ delay: idx * 0.03 }}
                                    className="hover:bg-sky-50/20 transition-all group border-b border-sky-50/10"
                                >
                                    {showSelectionBar && (
                                        <td className="p-3 md:p-6">
                                            <div className="flex justify-center">
                                                <input
                                                    type="checkbox"
                                                    className="w-4 h-4 rounded border-sky-200 text-sky-600 focus:ring-sky-500 cursor-pointer"
                                                    checked={selectedIds.includes(r.emp_id)}
                                                    onChange={() => toggleSelectOne(r.emp_id)}
                                                />
                                            </div>
                                        </td>
                                    )}
                                    {isPersonalView ? (
                                        <td className="p-3 md:p-6 whitespace-nowrap">
                                            <span className="text-xs md:text-sm font-bold text-gray-700 bg-gray-50 px-2.5 md:px-3 py-1.5 rounded-lg border border-gray-100 whitespace-nowrap">{r.from_date || '-'} to {r.to_date || '-'}</span>
                                        </td>
                                    ) : (
                                        <td className="p-3 md:p-6 whitespace-nowrap">
                                            <div className="flex items-center gap-3">
                                                <img
                                                    src={r.profile_pic || r.profile_picture_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(r.name || '?')}&background=0ea5e9&color=fff&bold=true`}
                                                    alt={r.name}
                                                    className="h-8 w-8 md:h-10 md:w-10 rounded-xl object-cover border border-sky-100 shadow-sm"
                                                />
                                                <p className="text-xs md:text-sm font-black text-gray-800 tracking-tight">{r.name} <span className="text-[9px] md:text-[10px] text-sky-500 ml-2">{r.emp_id}</span>{r.department_name ? <span className="text-[9px] md:text-[10px] text-gray-500 ml-2">{r.department_name}</span> : null}</p>
                                            </div>
                                        </td>
                                    )}
                                    <td className="p-3 md:p-6 text-right whitespace-nowrap" title="With Pay / Without Pay">
                                        <span className="text-xs md:text-sm font-black text-sky-700 bg-sky-50 px-2.5 md:px-3 py-1.5 rounded-lg border border-sky-100 whitespace-nowrap">
                                            {getWithPayDays(r).toFixed(1)}/{getWithoutPayDays(r).toFixed(1)}
                                        </span>
                                    </td>
                                    <td className="p-3 md:p-6 text-right whitespace-nowrap" title="Fixed Salary">
                                        <span className="text-xs md:text-sm font-bold text-gray-700 bg-gray-50 px-2.5 md:px-3 py-1.5 rounded-lg border border-gray-100 whitespace-nowrap">Rs {toCurrency(fixedSalary)}</span>
                                    </td>
                                    <td className="p-3 md:p-6 text-right whitespace-nowrap">
                                        <div className="inline-flex flex-col items-end gap-1 bg-gray-50 px-2.5 md:px-3 py-1.5 rounded-lg border border-gray-100">
                                            <span className="text-xs md:text-sm font-bold text-gray-800 whitespace-nowrap">Rs {toCurrency(grossSalary)}</span>
                                        </div>
                                    </td>
                                    <td className="p-3 md:p-6 text-right whitespace-nowrap">
                                        <span className="text-xs md:text-sm font-bold text-rose-600 bg-rose-50 px-2.5 md:px-3 py-1.5 rounded-lg border border-rose-100 whitespace-nowrap">Rs {toCurrency(r.deductions_applied || 0)}</span>
                                    </td>
                                    <td className="p-3 md:p-6 text-right whitespace-nowrap">
                                        <span className="text-xs md:text-sm font-black text-emerald-700 bg-emerald-50 px-2.5 md:px-3 py-1.5 rounded-lg border border-emerald-100 whitespace-nowrap">Rs {toCurrency(r.calculated_salary || 0)}</span>
                                    </td>
                                    {showStatusColumn && (
                                        <td className="p-3 md:p-6 text-center whitespace-nowrap">
                                            {String(r.status).toLowerCase() === 'paid' ? (
                                                <span className="inline-block text-[8px] md:text-[9px] font-black uppercase tracking-[0.1em] px-3 md:px-4 py-1.5 rounded-xl border-2 shadow-sm bg-emerald-600 text-white border-emerald-600">Paid</span>
                                            ) : (
                                                <span className="inline-block text-[8px] md:text-[9px] font-black uppercase tracking-[0.1em] px-3 md:px-4 py-1.5 rounded-xl bg-amber-50 text-amber-600 border border-amber-100 animate-pulse">Pending</span>
                                            )}
                                        </td>
                                    )}
                                    {showActionsColumn && <td className="p-3 md:p-6 whitespace-nowrap">
                                        <div className="flex justify-center gap-2">
                                            <button
                                                onClick={() => printPaymentSlip(r)}
                                                className="h-8 w-8 md:h-10 md:w-10 bg-sky-50 text-sky-600 rounded-xl hover:bg-sky-600 hover:text-white transition-all active:scale-95 group/btn"
                                                title="Payslip"
                                            >
                                                <FaFileAlt className="group-hover/btn:scale-125 transition-transform" />
                                            </button>
                                            {showInstitutionActionButtons && (
                                                <button
                                                    onClick={() => navigate(`/${user.role}/payroll/employee/${encodeURIComponent(normalizeEmpId(r.emp_id))}`)}
                                                    className="h-8 w-8 md:h-10 md:w-10 bg-sky-50 text-sky-600 rounded-xl hover:bg-sky-600 hover:text-white transition-all active:scale-95 group/btn"
                                                    title="View employee salary page"
                                                >
                                                    <FaEye className="group-hover/btn:scale-125 transition-transform" />
                                                </button>
                                            )}
                                            {!isHistoryPage && showInstitutionActionButtons && (
                                                <>
                                                    <button
                                                        disabled={String(r.id).startsWith('history_')}
                                                        onClick={async () => {
                                                            try {
                                                                await updateStatus(r, 'Paid');
                                                                await handleRefreshRows();
                                                                Swal.fire('Success', 'Marked as paid.', 'success');
                                                            } catch (error) {
                                                                console.error(error);
                                                                Swal.fire('Error', error?.response?.data?.message || 'Failed to mark paid.', 'error');
                                                            }
                                                        }}
                                                        className="h-8 w-8 md:h-10 md:w-10 bg-sky-50 text-sky-600 rounded-xl hover:bg-sky-600 hover:text-white transition-all active:scale-95 group/btn disabled:opacity-40 disabled:cursor-not-allowed"
                                                        title="Publish salary"
                                                    >
                                                        <FaCheckCircle className="group-hover/btn:scale-125 transition-transform" />
                                                    </button>
                                                    {isAdmin && (
                                                        <button
                                                            onClick={async () => {
                                                                try {
                                                                    await updateStatus(r, 'Pending');
                                                                    await handleRefreshRows();
                                                                    Swal.fire('Success', 'Marked as unpaid.', 'success');
                                                                } catch (error) {
                                                                    console.error(error);
                                                                    Swal.fire('Error', error?.response?.data?.message || 'Failed to mark unpaid.', 'error');
                                                                }
                                                            }}
                                                            className="h-8 w-8 md:h-10 md:w-10 bg-sky-50 text-sky-600 rounded-xl hover:bg-sky-600 hover:text-white transition-all active:scale-95 group/btn"
                                                            title="Mark unpaid"
                                                        >
                                                            <FaTimesCircle className="group-hover/btn:scale-125 transition-transform" />
                                                        </button>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    </td>}
                                </motion.tr>
                                );
                            })}
                            </AnimatePresence>

                            {loading && (
                                        <tr>
                                            <td colSpan={tableColumnCount} className="p-16 md:p-32 text-center text-gray-500">
                                                <div className="flex flex-col items-center gap-4">
                                                    <div className="h-14 w-14 border-4 border-sky-100 border-t-sky-600 rounded-full animate-spin"></div>
                                                    <p className="text-[10px] font-black text-sky-500 uppercase tracking-[0.2em] mt-2">Loading payroll records...</p>
                                                </div>
                                            </td>
                                        </tr>
                                    )}

                                    {!loading && filteredRows.length === 0 && (
                                        <tr>
                                            <td colSpan={tableColumnCount} className="p-16 md:p-32 text-center">
                                                <div className="flex flex-col items-center gap-6 opacity-20 grayscale">
                                                    <FaMoneyBillWave size={64} className="text-gray-400" />
                                                    <div>
                                                        <p className="text-xl font-black text-gray-800 tracking-tight">No Records</p>
                                                        <p className="text-sm font-bold uppercase tracking-[0.2em] text-gray-400 mt-1">{hasLoaded ? 'No salary records found for this view.' : 'Click refresh to load salary records.'}</p>
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </motion.div>

                <div className="mt-4 text-xs text-gray-500">
                    <FaMoneyBillWave className="inline mr-1" />
                    Period logic: fixed payroll cycle uses date range 26 to 25.
                </div>
            </motion.div>
        </Layout>
    );
};

export default SalaryManagement;
