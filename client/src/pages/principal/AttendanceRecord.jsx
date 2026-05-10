import { useState, useEffect, useMemo } from 'react';
import Layout from '../../components/Layout';
import api from '../../utils/api';
import { FaFileDownload, FaFilter, FaSearch, FaEye, FaCalendarAlt, FaSync, FaTimes, FaUserTimes } from 'react-icons/fa';
import { motion, AnimatePresence } from 'framer-motion';
import { finalizePrintWindow } from '../../utils/printUtils';
import { useSocket } from '../../context/SocketContext';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import BiometricMonitor from '../../components/biometric/BiometricMonitor';
import { formatTo12Hr, formatTimestamp } from '../../utils/timeFormatter.js';

const AttendanceRecord = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const routePrefix = location.pathname.split('/').filter(Boolean)[0] || (user?.role || 'admin');


    // Default to current month (1st to Today)
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const firstDayOfMonth = today.slice(0, 8) + '01';
    const [startDate, setStartDate] = useState(firstDayOfMonth);
    const [endDate, setEndDate] = useState(today);
    const [departmentId, setDepartmentId] = useState(user?.role === 'hod' ? String(user.department_id || '') : '');
    const [role, setRole] = useState(() => {
        const hash = window.location.hash.replace('#', '');
        if (hash === 'hod-core') return 'hod';
        if (hash === 'staff-core') return 'staff';
        if (hash === 'principal-core') return 'principal';
        return '';
    });
    const [summaryRecords, setSummaryRecords] = useState([]);
    const [detailedRecords, setDetailedRecords] = useState([]);
    const [biometricRecords, setBiometricRecords] = useState([]);
    const [departments, setDepartments] = useState([]);
    const [absentModal, setAbsentModal] = useState(null); // { emp_id, name, dates: [] }
    const [viewMode, setViewMode] = useState(() => {
        const hash = window.location.hash.replace('#', '');
        if (hash === 'summary') return 'summary';
        if (hash === 'detailed' || hash === 'logs') return 'detailed';
        if (hash === 'sync' || hash === 'biometric') return 'biometric';
        if (hash === 'hod-core' || hash === 'staff-core' || hash === 'principal-core') return 'table';
        return 'summary';
    });

    // Helper function to expand leave type abbreviations in status
    const expandStatusName = (status) => {
        if (!status) return '—';
        if (status.startsWith('Present +')) {
            const extra = status.replace('Present +', '').trim();
            return `P / ${extra}`;
        }
        const statusMap = {
            'CL': 'Casual Leave (CL)',
            'ML': 'Medical Leave (ML)',
            'OD': 'On Duty (OD)',
            'Comp Leave': 'Compensatory Leave'
        };
        return statusMap[status] || status;
    };

    const abbreviateStatus = (rec) => {
        if (!rec || !rec.status) return '—';
        const isLate = rec.remarks?.includes('Late Entry');
        let status = rec.status;
        let remarks = rec.remarks || '';
        let abbr = status;
        
        if (status.startsWith('Present +')) {
            const extra = status.replace('Present +', '').trim();
            abbr = `P / ${extra}`;
        } else if (status === 'Leave') {
            if (remarks.includes('CL') || remarks.includes('Casual')) abbr = 'CL';
            else if (remarks.includes('ML') || remarks.includes('Medical')) abbr = 'ML';
            else if (remarks.includes('OD') || remarks.includes('On Duty')) abbr = 'OD';
            else if (remarks.includes('Comp')) abbr = 'COMP';
            else abbr = 'L';
        } else {
            const map = {
                'Present': 'P', 'Absent': 'A', 'OD': 'OD', 'ML': 'ML',
                'CL': 'CL', 'Comp Leave': 'COMP', 'Holiday': 'H',
                'LOP': 'LOP'
            };
            abbr = map[status] || status;
        }
        
        const isHalfDay = (remarks || '').toLowerCase().includes('0.5') || (remarks || '').toLowerCase().includes('half day');
        if (isLate) {
            let label = '';
            if (abbr === 'P') label = 'LE';
            else if (abbr === 'LOP') label = 'LOP (LE)';
            else label = `${abbr} (LE)`;
            return isHalfDay ? `${label} (0.5)` : label;
        }
        return isHalfDay ? `${abbr} (0.5)` : abbr;
    };

    const getStatusCellColor = (rec) => {
        if (!rec) return 'text-gray-400';
        const status = rec.status || '';
        const remarks = rec.remarks || '';
        
        if (remarks.includes('Late Entry')) return 'text-orange-600 bg-orange-50';
        
        if (status.includes('Present')) return 'text-emerald-700 bg-emerald-50';
        if (status === 'Absent') return 'text-rose-700 bg-rose-50';
        if (status === 'LOP') return 'text-rose-800 bg-rose-100';
        if (status === 'Holiday') return 'text-gray-500 bg-gray-100';
        
        if (status === 'OD' || remarks.includes('OD') || remarks.includes('On Duty')) return 'text-sky-700 bg-sky-50';
        if (status === 'ML' || remarks.includes('ML') || remarks.includes('Medical')) return 'text-amber-700 bg-amber-50';
        if (status === 'CL' || remarks.includes('CL') || remarks.includes('Casual')) return 'text-amber-700 bg-amber-50';
        if (status === 'Comp Leave' || remarks.includes('Comp')) return 'text-violet-700 bg-violet-50';
        if (status === 'Leave') return 'text-amber-700 bg-amber-50';
        
        return 'text-gray-400';
    };

    // Group detailed records by employee for attendance sheet view
    const groupedByEmployee = useMemo(() => {
        const groups = {};
        detailedRecords.forEach(rec => {
            if (!groups[rec.emp_id]) {
                groups[rec.emp_id] = {
                    emp_id: rec.emp_id,
                    name: rec.name,
                    role: rec.role,
                    department_name: rec.department_name,
                    profile_pic: rec.profile_pic,
                    records: {},
                    totals: { P: 0, A: 0, LOP: 0, CL: 0, ML: 0, COMP: 0, OD: 0, H: 0, LE: 0 }
                };
            }
            groups[rec.emp_id].records[rec.date] = rec;
            
            // Calculate totals
            const status = rec.status || '';
            const remarks = rec.remarks || '';
            const isLate = (remarks || '').includes('Late Entry');
            const isHalfDay = (remarks || '').toLowerCase().includes('0.5') || (remarks || '').toLowerCase().includes('half day');
            const unit = isHalfDay ? 0.5 : 1;
            
            if (isLate) groups[rec.emp_id].totals.LE++;
            
            if (status.includes('Present')) groups[rec.emp_id].totals.P += unit;
            else if (status.includes('Absent')) groups[rec.emp_id].totals.A += unit;
            else if (status.includes('Holiday')) groups[rec.emp_id].totals.H += unit;
            else if (status.includes('LOP')) groups[rec.emp_id].totals.LOP += unit;
            
            // Map leave types from status or remarks
            if ((status.includes('CL') || remarks.includes('CL') || remarks.includes('Casual Leave')) && !status.includes('Comp') && !remarks.includes('Comp')) {
                groups[rec.emp_id].totals.CL += unit;
            } else if (status.includes('ML') || remarks.includes('ML') || remarks.includes('Medical Leave')) {
                groups[rec.emp_id].totals.ML += unit;
            } else if (status.includes('Comp Leave') || remarks.includes('Comp Leave')) {
                groups[rec.emp_id].totals.COMP += unit;
            } else if (status.includes('OD') || remarks.includes('OD') || remarks.includes('On Duty')) {
                groups[rec.emp_id].totals.OD += unit;
            }
        });
        return Object.values(groups);
    }, [detailedRecords]);

    // Sorted unique dates across all detailed records
    const uniqueDates = useMemo(() => {
        const dates = new Set();
        detailedRecords.forEach(rec => dates.add(String(rec.date).slice(0, 10)));
        return Array.from(dates).sort();
    }, [detailedRecords]);

    const firstColumnWidth = 118;
    const dayColumnWidth = uniqueDates.length >= 26 ? 64 : uniqueDates.length >= 18 ? 72 : 82;
    const attendanceTableMinWidth = firstColumnWidth + (uniqueDates.length * dayColumnWidth);

    useEffect(() => {
        const fetchDepts = async () => {
            try {
                const { data } = await api.get('/departments');
                setDepartments(data);
            } catch (error) { console.error(error); }
        };
        fetchDepts();
    }, []);

    useEffect(() => {
        const handleHash = () => {
            const hash = window.location.hash.replace('#', '');
            if (hash === 'summary') { setViewMode('summary'); setRole(''); }
            else if (hash === 'detailed' || hash === 'logs') { setViewMode('detailed'); setRole(''); }
            else if (hash === 'sync' || hash === 'biometric') { setViewMode('biometric'); setRole(''); }
            else if (hash === 'hod-core') { setViewMode('table'); setRole('hod'); }
            else if (hash === 'staff-core') { setViewMode('table'); setRole('staff'); }
            else if (hash === 'principal-core') { setViewMode('table'); setRole('principal'); }
        };
        handleHash();
        window.addEventListener('hashchange', handleHash);
        return () => window.removeEventListener('hashchange', handleHash);
    }, []);

    const socket = useSocket();

    const fetchAttendance = async () => {
        try {
            // Fetch Summary
            let summaryQuery = `/attendance/summary?startDate=${startDate}&endDate=${endDate}`;
            if (departmentId) summaryQuery += `&department_id=${departmentId}`;
            if (role) summaryQuery += `&role=${role}`;
            const { data: sData } = await api.get(summaryQuery);
            setSummaryRecords(sData);

            // Fetch Detailed
            let detailedQuery = `/attendance?startDate=${startDate}&endDate=${endDate}`;
            if (departmentId) detailedQuery += `&department_id=${departmentId}`;
            if (role) detailedQuery += `&role=${role}`;
            const { data: dData } = await api.get(detailedQuery);
            setDetailedRecords(dData);
        } catch (error) {
            console.error("Error fetching attendance", error);
        }
    };

    useEffect(() => {
        if (startDate && endDate) fetchAttendance();
    }, [startDate, endDate, departmentId, role]);

    useEffect(() => {
        if (!socket) return;

        const handleCalendarUpdate = () => {
            if (startDate && endDate) fetchAttendance();
        };

        socket.on('calendar_updated', handleCalendarUpdate);
        return () => {
            socket.off('calendar_updated', handleCalendarUpdate);
        };
    }, [socket, startDate, endDate, departmentId, role]);

    const calculateHours = (inTime, outTime) => {
        if (!inTime || !outTime) return '—';
        const start = new Date(`2000-01-01T${inTime}`);
        const end = new Date(`2000-01-01T${outTime}`);
        const diff = (end - start) / (1000 * 60 * 60);
        return diff > 0 ? `${diff.toFixed(1)} hrs` : '—';
    };

    const calculateBiometricHours = (intime, outtime) => {
        if (!intime || !outtime) return '—';

        const parseTime = (timeValue) => {
            const parsed = String(timeValue).trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
            if (!parsed) return null;
            const hours = Number(parsed[1]);
            const minutes = Number(parsed[2]);
            if (Number.isNaN(hours) || Number.isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
                return null;
            }
            return (hours * 60) + minutes;
        };

        const inMinutes = parseTime(intime);
        const outMinutes = parseTime(outtime);

        if (inMinutes === null || outMinutes === null) return '—';

        const worked = outMinutes >= inMinutes
            ? (outMinutes - inMinutes)
            : ((24 * 60) - inMinutes + outMinutes);

        const hours = Math.floor(worked / 60);
        const minutes = worked % 60;
        return `${hours}h ${String(minutes).padStart(2, '0')}m`;
    };

    const formatSheetTime = (timeValue) => {
        if (!timeValue) return '—';
        const parsed = String(timeValue).trim().match(/^(\d{1,2}):(\d{2})/);
        if (!parsed) return '—';
        const hh = String(Number(parsed[1])).padStart(2, '0');
        return `${hh}:${parsed[2]}`;
    };

    const formatDayCount = (value) => {
        const n = Number(value || 0);
        if (!Number.isFinite(n)) return '0.0';
        return n.toFixed(1);
    };

    const escapeHtml = (value) => String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');







    const handlePrint = async () => {
        if (!detailedRecords || detailedRecords.length === 0) {
            Swal.fire({ icon: 'warning', title: 'No Data', text: 'No matching records available for this report.' });
            return;
        }

        const printWindow = window.open('', '_blank', 'width=1200,height=800');
        if (!printWindow) return;

        let title = '';
        const useLandscape = viewMode === 'detailed' || 
                           (viewMode === 'summary' && summaryRecords.length > 5) || 
                           (viewMode === 'biometric' && biometricRecords.length > 5);

        let mainContentHtml = '';

        if (viewMode === 'detailed') {
            title = 'Detailed Attendance Sheet';
            mainContentHtml = groupedByEmployee.map(emp => {
                const datesRow = uniqueDates.map(date => {
                    const d = new Date(date + 'T00:00:00+05:30');
                    const isSun = d.getDay() === 0;
                    return `
                        <th style="border: 1px solid #cbd5e1; padding: 4px; background: ${isSun ? '#fff1f2' : '#f8fafc'}; min-width: 32px; text-align: center;">
                            <div style="font-size: 8pt; font-weight: 900; color: ${isSun ? '#f43f5e' : '#1e3a8a'};">${d.getDate()}</div>
                            <div style="font-size: 6pt; color: ${isSun ? '#fb7185' : '#64748b'};">${d.toLocaleDateString('en-US', { weekday: 'short' })}</div>
                        </th>
                    `;
                }).join('');

                const statusRow = uniqueDates.map(date => {
                    const rec = emp.records[date];
                    return `<td style="border: 1px solid #e2e8f0; padding: 4px; text-align: center; font-size: 8pt; font-weight: 900; color: #2563eb;">${rec ? abbreviateStatus(rec) : '-'}</td>`;
                }).join('');

                const inRow = uniqueDates.map(date => {
                    const rec = emp.records[date];
                    return `<td style="border: 1px solid #e2e8f0; padding: 4px; text-align: center; font-size: 7pt; color: #475569;">${rec?.in_time ? formatTo12Hr(rec.in_time) : '-'}</td>`;
                }).join('');

                const outRow = uniqueDates.map(date => {
                    const rec = emp.records[date];
                    return `<td style="border: 1px solid #e2e8f0; padding: 4px; text-align: center; font-size: 7pt; color: #475569;">${rec?.out_time ? formatTo12Hr(rec.out_time) : '-'}</td>`;
                }).join('');

                const totalRow = uniqueDates.map(date => {
                    const rec = emp.records[date];
                    return `<td style="border: 1px solid #e2e8f0; padding: 4px; text-align: center; font-size: 7pt; font-weight: 800; color: #0891b2; background: #f0f9ff;">${rec ? calculateHours(rec.in_time, rec.out_time) : '-'}</td>`;
                }).join('');

                const remarksHtml = Object.values(emp.records)
                    .filter(r => r.remarks && r.remarks.trim() !== '')
                    .sort((a, b) => new Date(a.date) - new Date(b.date))
                    .map(r => `<strong>${new Date(r.date + 'T00:00:00+05:30').toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' })}</strong>-${escapeHtml(r.remarks)}`)
                    .join(', ');

                return `
                    <div style="margin-bottom: 25px; page-break-inside: avoid; border: 2px solid #e2e8f0; border-radius: 12px; overflow: hidden;" class="print-avoid-break">
                        <div style="overflow-x: auto;">
                            <table style="width: 100%; border-collapse: collapse; table-layout: fixed;">
                                <thead>
                                    <tr style="background: #1e3a8a; color: white;">
                                        <th colspan="${uniqueDates.length + 1}" style="padding: 10px; font-size: 10pt; font-weight: 900; text-align: left; border: 1px solid #cbd5e1;">
                                            ${emp.emp_id} | ${emp.name} | ${emp.department_name || ''} - ${emp.role.toUpperCase()}
                                        </th>
                                    </tr>
                                    <tr style="background: #f1f5f9;">
                                        <th style="width: 80px; border: 1px solid #cbd5e1; padding: 6px; font-size: 8pt; color: #475569; text-align: left;">Day &rarr;</th>
                                        ${datesRow}
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr><td style="border: 1px solid #cbd5e1; padding: 6px; font-size: 8pt; font-weight: 800; background: #f8fafc; color: #475569;">Status</td>${statusRow}</tr>
                                    <tr><td style="border: 1px solid #cbd5e1; padding: 6px; font-size: 8pt; font-weight: 800; background: #f8fafc; color: #475569;">InTime</td>${inRow}</tr>
                                    <tr><td style="border: 1px solid #cbd5e1; padding: 6px; font-size: 8pt; font-weight: 800; background: #f8fafc; color: #475569;">OutTime</td>${outRow}</tr>
                                    <tr><td style="border: 1px solid #cbd5e1; padding: 6px; font-size: 8pt; font-weight: 800; background: #f1f5f9; color: #0369a1;">Total</td>${totalRow}</tr>
                                    <tr style="background: #fdfdfd;">
                                        <td style="border: 1px solid #cbd5e1; padding: 8px; font-size: 8pt; font-weight: 800; background: #f8fafc; color: #475569;">Remarks</td>
                                        <td colspan="${uniqueDates.length}" style="border: 1px solid #cbd5e1; padding: 10px; font-size: 8pt; font-style: italic; color: #1e40af; line-height: 1.4;">
                                            ${remarksHtml ? '(' + remarksHtml + ')' : '<span style="color: #cbd5e1;">-</span>'}
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                `;
            }).join('');
        } else {
            let listItems = [], listHeadings = [], getListRowData = () => [];
            if (viewMode === 'summary') {
                title = 'Attendance Summary report';
                listItems = summaryRecords;
                listHeadings = ['#', 'Emp ID', 'Name', 'Role', 'P', 'A', 'LOP', 'CL', 'ML', 'Comp', 'OD', 'LE'];
                getListRowData = (rec, idx) => [
                    idx + 1,
                    rec.emp_id,
                    rec.name,
                    rec.role,
                    formatDayCount(rec.total_present),
                    formatDayCount(rec.total_actual_absent ?? (Number(rec.total_absent || 0) + (rec.total_computed_absent || 0))),
                    formatDayCount(rec.total_lop),
                    formatDayCount(rec.total_cl),
                    formatDayCount(rec.total_ml),
                    formatDayCount(rec.total_comp),
                    formatDayCount(rec.total_od),
                    formatDayCount(rec.total_late)
                ];
            } else if (viewMode === 'biometric') {
                title = 'Biometric Activity report';
                listItems = biometricRecords;
                listHeadings = ['#', 'ID', 'Name', 'Date', 'In', 'Out', 'Hrs', 'Status'];
                getListRowData = (log, idx) => [idx + 1, log.user_id, log.name || log.user_id, new Date(String(log.date).slice(0, 10)).toLocaleDateString('en-GB'), formatTo12Hr(log.intime), formatTo12Hr(log.outtime), calculateBiometricHours(log.intime, log.outtime), log.outtime ? 'Comp' : 'Active'];
            }

            const rowsHtml = listItems.map((item, idx) => `<tr>${getListRowData(item, idx).map(v => `<td>${escapeHtml(String(v ?? ''))}</td>`).join('')}</tr>`).join('');
            mainContentHtml = `
                <table class="list-table">
                    <thead><tr>${listHeadings.map(h => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>
                    <tbody>${rowsHtml}</tbody>
                </table>
            `;
        }

        // Column styles are handled inside mainContentHtml where applicable

        printWindow.document.write(`
            <!doctype html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>${escapeHtml(title)}</title>
                <style>
                    @page { size: ${useLandscape ? 'landscape' : 'portrait'}; margin: 0.5cm; }
                    body { font-family: 'Segoe UI', Arial, sans-serif; padding: 10px; color: #1e293b; }
                    .header { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 20px; border-bottom: 3px solid #1e3a8a; padding-bottom: 10px; }
                    .header h1 { margin: 0; color: #1e3a8a; font-size: 18pt; font-weight: 900; letter-spacing: -0.5px; }
                    .meta { font-size: 9pt; color: #64748b; font-weight: bold; margin-top: 5px; }
                    .print-time { text-align: right; }
                    .brand { font-weight: 900; color: #1e3a8a; font-size: 11pt; }
                    .gen-date { font-size: 8pt; color: #94a3b8; }
                    table { width: 100%; border-collapse: collapse; }
                    .list-table th, .list-table td { border: 1px solid #cbd5e1; padding: 8px; font-size: 9pt; text-align: left; }
                    .list-table th { background: #f8fafc; font-weight: 800; color: #334155; text-transform: uppercase; font-size: 8pt; }
                </style>
            </head>
            <body>
                    <table style="width: 100%; border-bottom: 3px solid #1e3a8a; margin-bottom: 20px;">
                        <tr>
                            <td style="text-align: left; vertical-align: bottom; padding: 0 0 10px 0;">
                                <h1 style="margin: 0; color: #1e3a8a; font-size: 18pt; font-weight: 900; letter-spacing: -0.5px;">${escapeHtml(title)}</h1>
                                <p style="font-size: 9pt; color: #64748b; font-weight: bold; margin-top: 5px;">
                                    Period: ${new Date(startDate).toLocaleDateString('en-GB')} - ${new Date(endDate).toLocaleDateString('en-GB')}
                                    &nbsp;|&nbsp; Working Days: <b>${summaryRecords[0]?.total_working_days || 0}</b>
                                    &nbsp;|&nbsp; Holidays: <b>${summaryRecords[0]?.total_holidays || 0}</b>
                                </p>
                            </td>
                            <td style="text-align: right; vertical-align: bottom; padding: 0 0 10px 0;">
                                <div style="font-weight: 900; color: #1e3a8a; font-size: 11pt;">PPG EMP HUB</div>
                                <div style="font-size: 8pt; color: #94a3b8;">Generated: ${formatTimestamp(new Date())}</div>
                            </td>
                        </tr>
                    </table>
                ${mainContentHtml}
            </body>
            </html>
        `);
        printWindow.document.close();
        await finalizePrintWindow({
            printWindow,
            title,
            delay: 250,
            modeLabel: 'the attendance report'
        });
    };

    const StatusBadge = ({ status, inTime, outTime }) => {
        const colors = {
            'Present': 'bg-emerald-50 text-emerald-600 border-emerald-100',
            'Absent': 'bg-rose-50 text-rose-600 border-rose-100',
            'LOP': 'bg-rose-100 text-rose-800 border-rose-200',
            'OD': 'bg-sky-50 text-sky-600 border-sky-100',
            'Leave': 'bg-amber-50 text-amber-600 border-amber-100',
            'Comp Leave': 'bg-amber-50 text-amber-600 border-amber-100',
            'CL': 'bg-amber-50 text-amber-600 border-amber-100',
            'ML': 'bg-amber-50 text-amber-600 border-amber-100',
            'Holiday': 'bg-gray-50 text-gray-600 border-gray-100'
        };
        return (
            <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${
                status?.startsWith('Present') ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                (colors[status] || 'bg-gray-50 text-gray-400 border-gray-100')
            }`}>
                {expandStatusName(status)}
                {(inTime && outTime && 
                  !['Present', 'Absent', 'Holiday', 'Weekend'].includes(status) &&
                  !String(status).startsWith('Present')
                ) && (
                    <span className="ml-1 opacity-70">
                        ({formatTo12Hr(inTime)} - {formatTo12Hr(outTime)})
                    </span>
                )}
            </span>
        );
    };

    const handleViewEmployee = (rec) => {
        const rolePrefix = user?.role || 'admin';
        navigate(`/${rolePrefix}/attendance/${encodeURIComponent(rec.emp_id)}/${startDate}/${endDate}`);
        window.dispatchEvent(new CustomEvent('closeSidebar'));
    };

    return (
        <Layout>
            <div>
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
                    <div>
                        <h1 className="text-3xl font-black text-gray-800 tracking-tight">Attendance Records</h1>

                    </div>
                    <div className="flex bg-gray-100 p-1 rounded-2xl no-print">
                        <button
                            onClick={() => {
                                setViewMode('summary');
                                document.querySelector('main')?.scrollTo({ top: 0, behavior: 'smooth' });
                            }}
                            className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${viewMode === 'summary' ? 'bg-white text-sky-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                        >
                            Summary View
                        </button>
                        {(user?.role === 'admin' || user?.role === 'management') && (
                            <>
                                <button
                                    onClick={() => {
                                        setViewMode('detailed');
                                        document.querySelector('main')?.scrollTo({ top: 0, behavior: 'smooth' });
                                    }}
                                    className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${viewMode === 'detailed' ? 'bg-white text-sky-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                                >
                                    Detailed Logs
                                </button>
                                <button
                                    onClick={() => {
                                        setViewMode('biometric');
                                        document.querySelector('main')?.scrollTo({ top: 0, behavior: 'smooth' });
                                    }}
                                    className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${viewMode === 'biometric' ? 'bg-white text-emerald-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                                >
                                    Biometric Sync
                                </button>
                            </>
                        )}
                        <button
                            onClick={() => navigate(`/${routePrefix}/attendance/monthly-summary`)}
                            className="px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all text-gray-500 hover:text-sky-600"
                        >
                            Monthly Summary
                        </button>
                    </div>
                </div>

                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white p-6 md:p-8 rounded-[32px] shadow-xl shadow-sky-50/50 mb-10 border border-sky-50 no-print"
                >
                    {viewMode === 'biometric' ? (
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div className="h-12 w-12 rounded-2xl bg-emerald-500 text-white flex items-center justify-center shadow-lg shadow-emerald-200">
                                    <FaSearch size={18} />
                                </div>
                                <div>
                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Live Date</p>
                                    <p className="text-xl font-black text-gray-800">
                                        {new Date().toLocaleDateString('en-US', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
                                    </p>
                                </div>
                                <span className="ml-2 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border bg-emerald-50 text-emerald-600 border-emerald-100 flex items-center gap-1.5">
                                    <span className="h-1.5 w-1.5 bg-emerald-500 rounded-full animate-ping" />
                                    Live
                                </span>
                            </div>
                            <div className="flex gap-4">
                                <button
                                    onClick={() => navigate(`/${user?.role || 'admin'}/biometric-history`)}
                                    className="px-6 py-4 bg-white border border-emerald-100 text-emerald-600 rounded-2xl shadow-lg shadow-emerald-50 hover:bg-emerald-50 transition-all flex items-center gap-2 font-black text-[10px] uppercase tracking-widest group"
                                    title="View History"
                                >
                                    <FaSync className="group-hover:rotate-180 transition-transform duration-500" />
                                    History
                                </button>
                                <button
                                    onClick={handlePrint}
                                    className="p-4 bg-sky-600 text-white rounded-2xl shadow-lg shadow-sky-100 hover:bg-sky-700 transition-all flex items-center justify-center group"
                                    title="Report"
                                >
                                    <FaFileDownload className="group-hover:scale-110 transition-transform" />
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 items-end">
                            <div>
                                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 ml-1">From Date</label>
                                <input
                                    type="date"
                                    value={startDate}
                                    onChange={(e) => setStartDate(e.target.value)}
                                    className="w-full p-4 bg-gray-50 border border-gray-100 rounded-2xl outline-none focus:ring-4 focus:ring-sky-100 focus:border-sky-500 transition-all font-bold text-gray-700 text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 ml-1">To Date</label>
                                <input
                                    type="date"
                                    value={endDate}
                                    onChange={(e) => setEndDate(e.target.value)}
                                    className="w-full p-4 bg-gray-50 border border-gray-100 rounded-2xl outline-none focus:ring-4 focus:ring-sky-100 focus:border-sky-500 transition-all font-bold text-gray-700 text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 ml-1">Department</label>
                                <select
                                    value={departmentId}
                                    onChange={(e) => setDepartmentId(e.target.value)}
                                    className="w-full p-4 bg-gray-50 border border-gray-100 rounded-2xl outline-none focus:ring-4 focus:ring-sky-100 focus:border-sky-500 transition-all font-bold text-gray-700 text-sm appearance-none"
                                >
                                    <option value="">All Departments</option>
                                    {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                </select>
                            </div>
                            <div className="flex gap-4">
                                <select
                                    value={role}
                                    onChange={(e) => setRole(e.target.value)}
                                    className="flex-1 p-4 bg-gray-50 border border-gray-100 rounded-2xl outline-none focus:ring-4 focus:ring-sky-100 focus:border-sky-500 transition-all font-bold text-gray-700 text-sm appearance-none"
                                >
                                    <option value="">All Roles</option>
                                    <option value="principal">Principal</option>
                                    <option value="hod">HOD</option>
                                    <option value="staff">Staff</option>
                                </select>
                                <button
                                    onClick={fetchAttendance}
                                    className="p-4 bg-white border border-gray-100 text-sky-600 rounded-2xl shadow-lg shadow-sky-100 hover:bg-sky-50 transition-all flex items-center justify-center group"
                                    title="Refresh Data"
                                >
                                    <FaFilter className="group-hover:rotate-180 transition-transform duration-500" />
                                </button>
                                <button
                                    onClick={handlePrint}
                                    className="p-4 bg-sky-600 text-white rounded-2xl shadow-lg shadow-sky-100 hover:bg-sky-700 transition-all flex items-center justify-center group"
                                    title="Report"
                                >
                                    <FaFileDownload className="group-hover:scale-110 transition-transform" />
                                </button>
                            </div>
                        </div>
                    )}
                </motion.div>

                <AnimatePresence mode="wait">
                    {viewMode === 'summary' ? (
                        <motion.div
                            key="summary"
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 20 }}
                            className="styled-table-container modern-card overflow-hidden"
                        >
                            {/* Global Summary Info */}
                            <div className="p-6 border-b border-gray-100 bg-gradient-to-r from-sky-50 to-blue-50 flex flex-wrap items-center gap-8">
                                <div className="flex items-center gap-3">
                                    <div className="h-10 w-10 rounded-xl bg-white text-sky-600 flex items-center justify-center shadow-sm border border-sky-100">
                                        <FaCalendarAlt />
                                    </div>
                                    <div>
                                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Period Summary</p>
                                        <div className="flex items-center gap-4 mt-0.5">
                                            <div className="flex items-center gap-1.5">
                                                <span className="text-[10px] font-bold text-gray-500">Working Days:</span>
                                                <span className="text-sm font-black text-emerald-600">{summaryRecords[0]?.total_working_days || 0}</span>
                                            </div>
                                            <div className="h-3 w-px bg-gray-200" />
                                            <div className="flex items-center gap-1.5">
                                                <span className="text-[10px] font-bold text-gray-500">Holidays:</span>
                                                <span className="text-sm font-black text-rose-500">{summaryRecords[0]?.total_holidays || 0}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div className="ml-auto flex items-center gap-2">
                                    <span className="px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border bg-sky-50 text-sky-600 border-sky-100 flex items-center gap-1.5">
                                        <span className="h-1.5 w-1.5 bg-sky-500 rounded-full animate-ping" />
                                        Live Status
                                    </span>
                                </div>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="min-w-full styled-table text-left">
                                    <thead>
                                        <tr>
                                            <th className="p-5 text-xs font-black uppercase tracking-widest bg-gray-50/50">Emp ID</th>
                                            <th className="p-5 text-xs font-black uppercase tracking-widest bg-gray-50/50">Name</th>
                                            <th className="p-5 text-xs font-black uppercase tracking-widest bg-gray-50/50">Role</th>
                                            <th className="p-5 text-xs font-black uppercase tracking-widest bg-gray-50/50 text-center">Present</th>
                                            <th className="p-5 text-xs font-black uppercase tracking-widest bg-gray-50/50 text-center">Absent</th>
                                            <th className="p-5 text-xs font-black uppercase tracking-widest bg-gray-50/50 text-center">LOP</th>
                                            <th className="p-5 text-xs font-black uppercase tracking-widest bg-gray-50/50 text-center">CL</th>
                                            <th className="p-5 text-xs font-black uppercase tracking-widest bg-gray-50/50 text-center">ML</th>
                                            <th className="p-5 text-xs font-black uppercase tracking-widest bg-gray-50/50 text-center">Comp</th>
                                            <th className="p-5 text-xs font-black uppercase tracking-widest bg-gray-50/50 text-center">OD</th>
                                            <th className="p-5 text-xs font-black uppercase tracking-widest bg-gray-50/50 text-center">Late Entry</th>
                                            <th className="p-5 text-xs font-black uppercase tracking-widest bg-gray-50/50 text-center no-print">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {summaryRecords.map((rec) => (
                                            <tr key={rec.emp_id} className="hover:bg-sky-50/50 transition-colors border-b border-gray-50 last:border-0 text-left">
                                                <td className="p-5 text-sm font-black text-sky-900 text-left">{rec.emp_id}</td>
                                                <td className="p-5 text-sm font-bold text-gray-700 text-left">{rec.name}</td>
                                                <td className="p-5 text-[10px] font-black uppercase text-gray-400 tracking-wider text-left">
                                                    <span className="px-3 py-1 bg-gray-100 rounded-full">{rec.role}</span>
                                                </td>
                                                <td className="p-5 text-sm font-black text-center text-sky-600">{formatDayCount(rec.total_present)}</td>
                                                <td className="p-5 text-sm font-black text-center text-rose-500">
                                                    {formatDayCount(rec.total_actual_absent ?? (Number(rec.total_absent || 0) + (rec.total_computed_absent || 0)))}
                                                </td>
                                                <td className="p-5 text-sm font-black text-center text-rose-800">{formatDayCount(rec.total_lop)}</td>
                                                <td className="p-5 text-sm font-black text-center text-amber-500">{formatDayCount(rec.total_cl)}</td>
                                                <td className="p-5 text-sm font-black text-center text-orange-500">{formatDayCount(rec.total_ml)}</td>
                                                <td className="p-5 text-sm font-black text-center text-violet-500">{formatDayCount(rec.total_comp)}</td>
                                                <td className="p-5 text-sm font-black text-center text-amber-500">{formatDayCount(rec.total_od)}</td>
                                                <td className="p-5 text-sm font-black text-center text-orange-600">{formatDayCount(rec.total_late || 0)}</td>
                                                <td className="p-5 text-center no-print">
                                                    <button
                                                        onClick={() => handleViewEmployee(rec)}
                                                        className="p-3 bg-gray-50 text-gray-400 hover:text-sky-600 hover:bg-sky-50 rounded-xl transition-all"
                                                        title="View Detailed Records"
                                                    >
                                                        <FaEye size={16} />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </motion.div>
                    ) : viewMode === 'detailed' ? (
                        <motion.div
                            key="detailed"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            className="space-y-8"
                        >
                            {/* Legend */}
                            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-3 flex flex-wrap items-center gap-x-5 gap-y-2">
                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-1">Legend:</span>
                                {[
                                    { code: 'P', label: 'Present', cls: 'text-emerald-700 bg-emerald-50' },
                                    { code: 'A', label: 'Absent', cls: 'text-rose-700 bg-rose-50' },
                                    { code: 'LOP', label: 'Loss of Pay', cls: 'text-rose-800 bg-rose-100' },
                                    { code: 'OD', label: 'On Duty', cls: 'text-sky-700 bg-sky-50' },
                                    { code: 'ML', label: 'Medical Leave', cls: 'text-amber-700 bg-amber-50' },
                                    { code: 'CL', label: 'Casual Leave', cls: 'text-amber-700 bg-amber-50' },
                                    { code: 'COMP', label: 'Comp Leave', cls: 'text-violet-700 bg-violet-50' },
                                    { code: 'H', label: 'Holiday', cls: 'text-gray-500 bg-gray-100' },
                                    { code: 'LE', label: 'Late Entry', cls: 'text-orange-600 bg-orange-50' },
                                ].map(item => (
                                    <span key={item.code} className="flex items-center gap-1.5">
                                        <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-black ${item.cls}`}>{item.code}</span>
                                        <span className="text-[10px] text-gray-500">{item.label}</span>
                                    </span>
                                ))}
                            </div>

                            {/* Employee Attendance Sheets */}
                            {groupedByEmployee.map((emp) => (
                                <motion.div
                                    key={emp.emp_id}
                                    initial={{ opacity: 0, y: 12 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="bg-white rounded-2xl shadow-lg shadow-sky-50/50 border border-gray-100 overflow-hidden print-section"
                                >
                                    {/* Employee Header */}
                                    <div className="bg-gradient-to-r from-sky-700 to-sky-600 text-white px-4 sm:px-6 py-3 flex flex-wrap items-center gap-x-4 gap-y-1">
                                        <img src={emp.profile_pic || `https://ui-avatars.com/api/?name=${encodeURIComponent(emp.name || '?')}&size=80&background=0ea5e9&color=fff&bold=true`} alt="" className="h-9 w-9 rounded-xl object-cover flex-shrink-0" />
                                        <span className="text-sm font-black tracking-wide">{emp.emp_id}</span>
                                        <span className="text-sky-200 hidden sm:inline">|</span>
                                        <span className="text-sm font-bold">{emp.name}</span>
                                        {emp.department_name && (
                                            <>
                                                <span className="text-sky-200 hidden sm:inline">|</span>
                                                <span className="text-xs text-sky-200 font-medium">{emp.department_name}</span>
                                            </>
                                        )}
                                        <div className="ml-auto flex items-center gap-2">
                                            {[
                                                { label: 'P', val: emp.totals.P, color: 'bg-emerald-500/20' },
                                                { label: 'A', val: emp.totals.A, color: 'bg-rose-500/20' },
                                                { label: 'CL', val: emp.totals.CL, color: 'bg-amber-500/20' },
                                                { label: 'ML', val: emp.totals.ML, color: 'bg-orange-500/20' },
                                                { label: 'OD', val: emp.totals.OD, color: 'bg-sky-500/20' },
                                                { label: 'Comp', val: emp.totals.COMP, color: 'bg-violet-500/20' },
                                                { label: 'LE', val: emp.totals.LE, color: 'bg-orange-600/30' }
                                            ].map(t => t.val > 0 && (
                                                <div key={t.label} className={`flex items-center gap-1.5 px-2 py-1 ${t.color} rounded-lg border border-white/10`}>
                                                    <span className="text-[9px] font-black uppercase text-white/70">{t.label}</span>
                                                    <span className="text-[10px] font-black">{t.val}</span>
                                                </div>
                                            ))}
                                            <span className="ml-4 px-2.5 py-0.5 bg-white/15 rounded-full text-[9px] font-black uppercase tracking-wider block sm:inline">
                                                {emp.role}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Attendance Sheet Table */}
                                    <div className="overflow-x-auto attendance-sheet-scroll pb-1">
                                        <table className="w-full table-fixed border-separate border-spacing-0" style={{ minWidth: `${attendanceTableMinWidth}px` }}>
                                            <colgroup>
                                                <col style={{ width: `${firstColumnWidth}px`, minWidth: `${firstColumnWidth}px` }} />
                                                {uniqueDates.map(date => (
                                                    <col key={`col-${date}`} style={{ width: `${dayColumnWidth}px`, minWidth: `${dayColumnWidth}px` }} />
                                                ))}
                                            </colgroup>
                                            <thead>
                                                <tr>
                                                    <th className="sticky left-0 top-0 z-20 bg-gray-100 border border-gray-200 px-3 py-3 h-11 text-[10px] font-black uppercase tracking-wider text-gray-500 text-left">
                                                        Day &rarr;
                                                    </th>
                                                    {uniqueDates.map(date => {
                                                        const d = new Date(date + 'T00:00:00+05:30');
                                                        const dayNum = d.toLocaleDateString('en-US', { timeZone: 'Asia/Kolkata', day: '2-digit' });
                                                        const dayName = d.toLocaleDateString('en-US', { timeZone: 'Asia/Kolkata', weekday: 'short' });
                                                        const isSunday = d.getDay() === 0;
                                                        return (
                                                            <th key={date} className={`sticky top-0 z-10 border border-gray-200 px-1.5 py-2.5 h-11 text-center ${isSunday ? 'bg-rose-50' : 'bg-gray-50'}`}>
                                                                <div className={`text-[11px] font-black ${isSunday ? 'text-rose-500' : 'text-gray-700'}`}>{dayNum}</div>
                                                                <div className={`text-[8px] font-bold uppercase ${isSunday ? 'text-rose-400' : 'text-gray-400'}`}>{dayName}</div>
                                                            </th>
                                                        );
                                                    })}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {/* Status Row */}
                                                <tr>
                                                    <td className="sticky left-0 z-10 bg-white border border-gray-200 px-3 py-2.5 h-11 text-[10px] font-black uppercase tracking-wider text-gray-600 align-middle">
                                                        Status
                                                    </td>
                                                    {uniqueDates.map(date => {
                                                        const rec = emp.records[date];
                                                        return (
                                                            <td key={date} className="border border-gray-200 px-1 py-2 h-11 text-center align-middle">
                                                                {rec ? (
                                                                    <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-black leading-none ${getStatusCellColor(rec)}`}>
                                                                        {abbreviateStatus(rec)}
                                                                    </span>
                                                                ) : (
                                                                    <span className="text-gray-300 text-[10px]">&mdash;</span>
                                                                )}
                                                            </td>
                                                        );
                                                    })}
                                                </tr>
                                                {/* InTime Row */}
                                                <tr className="bg-gray-50/40">
                                                    <td className="sticky left-0 z-10 bg-gray-50 border border-gray-200 px-3 py-2.5 h-11 text-[10px] font-black uppercase tracking-wider text-gray-600 align-middle">
                                                        InTime
                                                    </td>
                                                    {uniqueDates.map(date => {
                                                        const rec = emp.records[date];
                                                        return (
                                                            <td key={date} className="border border-gray-200 px-1 py-2 h-11 text-center text-[10px] font-semibold text-gray-600 align-middle whitespace-nowrap">
                                                                {rec?.in_time ? formatSheetTime(rec.in_time) : <span className="text-gray-300">&mdash;</span>}
                                                            </td>
                                                        );
                                                    })}
                                                </tr>
                                                {/* OutTime Row */}
                                                <tr>
                                                    <td className="sticky left-0 z-10 bg-white border border-gray-200 px-3 py-2.5 h-11 text-[10px] font-black uppercase tracking-wider text-gray-600 align-middle">
                                                        OutTime
                                                    </td>
                                                    {uniqueDates.map(date => {
                                                        const rec = emp.records[date];
                                                        return (
                                                            <td key={date} className="border border-gray-200 px-1 py-2 h-11 text-center text-[10px] font-semibold text-gray-600 align-middle whitespace-nowrap">
                                                                {rec?.out_time ? formatSheetTime(rec.out_time) : <span className="text-gray-300">&mdash;</span>}
                                                            </td>
                                                        );
                                                    })}
                                                </tr>
                                                {/* Total Row */}
                                                <tr className="bg-sky-50/30">
                                                    <td className="sticky left-0 z-10 bg-sky-50 border border-gray-200 px-3 py-2.5 h-11 text-[10px] font-black uppercase tracking-wider text-sky-700 align-middle">
                                                        Total
                                                    </td>
                                                    {uniqueDates.map(date => {
                                                        const rec = emp.records[date];
                                                        return (
                                                            <td key={date} className="border border-gray-200 px-1 py-2 h-11 text-center text-[10px] font-black text-sky-600 align-middle whitespace-nowrap">
                                                                {rec ? calculateHours(rec.in_time, rec.out_time) : <span className="text-gray-300">&mdash;</span>}
                                                            </td>
                                                        );
                                                    })}
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>

                                    <div className="border-t border-gray-200 bg-slate-50/70 px-4 py-3 grid gap-3" style={{ gridTemplateColumns: `${firstColumnWidth}px minmax(0, 1fr)` }}>
                                        <div className="text-[10px] font-black uppercase tracking-wider text-gray-600">Remarks History</div>
                                        <div className="text-[10px] font-bold text-sky-700 italic leading-relaxed text-left">
                                            {(() => {
                                                const filtered = Object.values(emp.records).filter(r => r.remarks && r.remarks.trim() !== '');
                                                if (filtered.length === 0) return <span className="text-gray-300">No remarks found for this employee in the selected period.</span>;
                                                return (
                                                    <span className="inline leading-6">
                                                        (
                                                        {filtered.sort((a, b) => new Date(a.date) - new Date(b.date)).map((r, i) => (
                                                            <span key={r.date}>
                                                                <strong>{new Date(r.date + 'T00:00:00+05:30').toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' })}</strong>-{r.remarks}{i < filtered.length - 1 ? ', ' : ''}
                                                            </span>
                                                        ))}
                                                        )
                                                    </span>
                                                );
                                            })()}
                                        </div>
                                    </div>
                                </motion.div>
                            ))}
                        </motion.div>
                    ) : (
                        <motion.div
                            key="biometric"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                        >
                            <BiometricMonitor onDataChange={setBiometricRecords} />
                        </motion.div>
                    )}
                </AnimatePresence>

                {((viewMode === 'summary' ? summaryRecords.length : detailedRecords.length) === 0) && (
                    <div className="text-center py-20">
                        <div className="h-20 w-20 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-300">
                            <FaSearch size={30} />
                        </div>
                        <p className="text-gray-400 font-bold italic">No records found for the selected date range.</p>
                    </div>
                )}

            </div>

            {/* Absent Detail Modal */}
            <AnimatePresence>
                {absentModal && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-white z-50 flex flex-col"
                    >
                        {/* Header */}
                        <div className="px-6 md:px-10 py-5 border-b border-gray-100 bg-gradient-to-r from-rose-50 to-red-50 flex items-center justify-between flex-shrink-0">
                            <div className="flex items-center gap-4">
                                <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-rose-500 to-rose-700 flex items-center justify-center text-white shadow-lg">
                                    <FaUserTimes size={20} />
                                </div>
                                <div>
                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                                                        {absentModal.emp_id}{absentModal.department ? ` · ${absentModal.department}` : ''} · {absentModal.role?.toUpperCase()}
                                                    </p>
                                    <p className="text-xl font-black text-gray-800 tracking-tight">{absentModal.name} — Absent Days</p>
                                </div>
                                <span className="ml-2 bg-rose-100 text-rose-700 px-4 py-1.5 rounded-xl text-xs font-black">
                                    {absentModal.total} Absent Day{absentModal.total !== 1 ? 's' : ''}
                                </span>
                            </div>
                            <button
                                onClick={() => setAbsentModal(null)}
                                className="p-3 rounded-2xl bg-white hover:bg-rose-50 text-gray-400 hover:text-rose-500 transition-all border border-gray-200 shadow-sm"
                            >
                                <FaTimes size={18} />
                            </button>
                        </div>

                        {/* Body */}
                        <div className="flex-1 overflow-auto px-6 md:px-10 py-6">
                            {absentModal.dates.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-64 gap-4">
                                    <div className="h-16 w-16 rounded-full bg-rose-50 flex items-center justify-center text-rose-300">
                                        <FaUserTimes size={28} />
                                    </div>
                                    <div className="text-center">
                                        <p className="text-sm font-black text-gray-400 uppercase tracking-widest">No Absent Records Found</p>
                                        <p className="text-xs text-gray-300 mt-1">Absent days may be calculated but not stored as individual records.</p>
                                    </div>
                                    <div className="mt-2 px-6 py-4 bg-amber-50 border border-amber-100 rounded-2xl max-w-md text-center">
                                        <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest mb-1">Note</p>
                                        <p className="text-xs text-amber-700">
                                            Total absent = <strong>{absentModal.total} days</strong> calculated as: Working Days − (Present + Leaves + OD).
                                            Individual absent records are only created when explicitly marked.
                                        </p>
                                    </div>
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <div className="mb-4 flex items-center gap-2">
                                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Absent Dates for Period: {new Date(startDate).toLocaleDateString('en-GB')} – {new Date(endDate).toLocaleDateString('en-GB')}</span>
                                    </div>
                                    <table className="min-w-[500px] w-full text-left">
                                        <thead className="sticky top-0 z-10">
                                            <tr className="bg-gray-50">
                                                <th className="px-5 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">#</th>
                                                <th className="px-5 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Date</th>
                                                <th className="px-5 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Day</th>
                                                <th className="px-5 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Status</th>
                                                <th className="px-5 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Remarks</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-50">
                                            {absentModal.dates.map((rec, idx) => {
                                                const d = new Date(String(rec.date).slice(0, 10) + 'T00:00:00+05:30');
                                                const isSun = d.getDay() === 0;
                                                const isSat = d.getDay() === 6;
                                                return (
                                                    <motion.tr
                                                        key={rec.date || idx}
                                                        initial={{ opacity: 0, y: 5 }}
                                                        animate={{ opacity: 1, y: 0 }}
                                                        transition={{ delay: idx * 0.02 }}
                                                        className="hover:bg-rose-50/40 transition-colors"
                                                    >
                                                        <td className="px-5 py-4 text-sm font-black text-gray-300">{idx + 1}</td>
                                                        <td className="px-5 py-4 text-sm font-black text-gray-800 whitespace-nowrap">
                                                            {d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                                                        </td>
                                                        <td className="px-5 py-4 whitespace-nowrap">
                                                            <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${
                                                                isSun || isSat ? 'bg-gray-50 text-gray-400 border-gray-100' : 'bg-rose-50 text-rose-500 border-rose-100'
                                                            }`}>
                                                                {d.toLocaleDateString('en-US', { weekday: 'long' })}
                                                                {(isSun || isSat) ? ' (Weekend)' : ''}
                                                            </span>
                                                        </td>
                                                        <td className="px-5 py-4 whitespace-nowrap">
                                                            <span className="px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border bg-rose-50 text-rose-600 border-rose-100">
                                                                {rec.status || 'ABSENT'}
                                                            </span>
                                                        </td>
                                                        <td className="px-5 py-4 text-xs text-gray-500 italic max-w-[200px] truncate" title={rec.remarks || rec.status || ''}>
                                                            {rec.remarks || rec.status || '—'}
                                                        </td>
                                                    </motion.tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </Layout>
    );
};

export default AttendanceRecord;

