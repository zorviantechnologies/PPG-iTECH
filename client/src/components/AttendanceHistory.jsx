import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { FaCalendarAlt, FaClock, FaHistory, FaCheckCircle, FaTimesCircle, FaBus } from 'react-icons/fa';
import api from '../utils/api';
import { useSocket } from '../context/SocketContext';
import { formatTo12Hr } from '../utils/timeFormatter';

const AttendanceHistory = ({ empId, month: propMonth, startDate, endDate, recentOnly = true, statusFilter = null, onLoadSummary = null }) => {
    const [records, setRecords] = useState([]);
    const [holidayDateSet, setHolidayDateSet] = useState(new Set());
    const [loading, setLoading] = useState(true);
    const socket = useSocket();

    const fetchAttendance = useCallback(async () => {
        let data;
        try {
            const selectedMonth = propMonth || new Date().toISOString().slice(0, 7);
            let query = `/attendance?emp_id=${empId}`;
            if (statusFilter) {
                query += `&month=${selectedMonth}`;
            } else if (recentOnly) {
                query += `&onlyUploaded=true&month=${selectedMonth}`;
            } else if (startDate && endDate) {
                query += `&startDate=${startDate}&endDate=${endDate}`;
            } else {
                query += `&month=${selectedMonth}`;
            }

            const [response, holidayResponse] = await Promise.all([
                api.get(query),
                (() => {
                    const [year, month] = String(selectedMonth).split('-');
                    if (!year || !month) return Promise.resolve({ data: [] });
                    return api.get(`/holidays?month=${Number(month)}&year=${Number(year)}`).catch(() => ({ data: [] }));
                })()
            ]);

            data = response.data;
            setRecords(data || []);

            const holidaySet = new Set();
            (holidayResponse?.data || []).forEach((h) => {
                if (h?.h_date) holidaySet.add(String(h.h_date).slice(0, 10));
            });
            setHolidayDateSet(holidaySet);
        } catch (error) {
            console.error('Error fetching attendance history', error);
        } finally {
            setLoading(false);
            if (onLoadSummary && data) {
                 const isHalfDay = (r) => (r.remarks || '').toLowerCase().includes('0.5') || (r.remarks || '').toLowerCase().includes('half day');
                 const getUnit = (r) => isHalfDay(r) ? 0.5 : 1;

                 // Working days is usually the count of distinct dates that aren't weekends/holidays
                 const workingDayRecords = data.filter(r => r.status && !['Weekend', 'Holiday'].includes(r.status));
                 const workingDays = workingDayRecords.length; // Count of days

                 const holidays = data.filter(r => r.status === 'Holiday').length;
                 
                 // Summations of units
                 const absent = data.filter(r => String(r.status).includes('Absent')).reduce((acc, r) => acc + getUnit(r), 0);
                 const lop = data.filter(r => String(r.status).includes('LOP') || String(r.remarks).includes('LOP') || String(r.remarks).includes('Loss of Pay')).reduce((acc, r) => acc + getUnit(r), 0);
                 const lateEntry = data.filter(r => String(r.remarks).includes('Late Entry') || String(r.status).includes('Late Entry')).length;
                 
                 onLoadSummary({ workingDays, holidays, absent, lop, lateEntry });
            }
        }
    }, [empId, propMonth, startDate, endDate, recentOnly, statusFilter, onLoadSummary]);

    useEffect(() => {
        fetchAttendance();
    }, [statusFilter, propMonth, fetchAttendance]);

    useEffect(() => {
        if (!socket) return;
        socket.on('attendance_updated', fetchAttendance);
        return () => socket.off('attendance_updated', fetchAttendance);
    }, [socket, fetchAttendance]);

    // Apply client-side status filter
    const displayedRecords = statusFilter
        ? records.filter(r => {
            const s = r.status || '';
            const rem = r.remarks || '';
            if (statusFilter === 'Present') return s.includes('Present');
            if (statusFilter === 'Absent') {
                if (!s.includes('Absent')) return false;
                const dateStr = String(r.date || '').slice(0, 10);
                const dow = dateStr ? new Date(`${dateStr}T00:00:00`).getDay() : -1;
                const isWeekend = dow === 0 || dow === 6;
                const isHoliday = holidayDateSet.has(dateStr);
                return !isWeekend && !isHoliday;
            }
            if (statusFilter === 'OD') return s.includes('OD') || rem.includes('OD') || rem.includes('On Duty');
            if (statusFilter === 'CL') return (s.includes('CL') || rem.includes('CL') || rem.includes('Casual')) && !s.includes('Comp') && !rem.includes('Comp');
            if (statusFilter === 'ML') return s.includes('ML') || rem.includes('ML') || rem.includes('Medical');
            if (statusFilter === 'Comp Leave') return s.includes('Comp Leave') || rem.includes('Comp Leave') || rem.includes('Comp');
            if (statusFilter === 'Late Entry') return rem.includes('Late Entry');
            if (statusFilter === 'LOP') return s.includes('LOP') || rem.includes('LOP') || rem.includes('Loss of Pay');
            return s.includes(statusFilter) || rem.includes(statusFilter);
        })
        : recentOnly ? records : records;

    const calculateHours = (inTime, outTime) => {
        if (!inTime || !outTime) return '—';
        const start = new Date(`2000-01-01T${inTime}`);
        const end = new Date(`2000-01-01T${outTime}`);
        const diff = (end - start) / (1000 * 60 * 60);
        return diff > 0 ? `${diff.toFixed(1)} hrs` : '—';
    };

    const getStatusIcon = (status) => {
        if (!status) return <FaCalendarAlt className="text-amber-500" />;
        const s = status.toUpperCase();
        if (s.includes('PRESENT')) return <FaCheckCircle className="text-emerald-500" />;
        if (s.includes('ABSENT')) return <FaTimesCircle className="text-rose-500" />;
        if (s.includes('LOP')) return <FaTimesCircle className="text-rose-700" />;
        if (s.includes('OD')) return <FaBus className="text-sky-500" />;
        if (status === 'Late Entry') return <FaClock className="text-orange-500" />;
        return <FaCalendarAlt className="text-amber-500" />;
    };

    const isLateEntry = (record) => (record.remarks || '').includes('Late Entry');

    // Remarks format from biometric controller (pipe-separated sections):
    //   "Working Hours: 7h 30m | Alerts: Late Entry (09:07), Early Exit (16:30) | Approved Segments: CL: 09:00-11:00 (2h 0m)"
    // Also may be simpler strings from manual entry like "Late Entry", "Leave approved", etc.
    //
    // When a statusFilter is active, extract ONLY the relevant part:
    //  - Late Entry  → show only the Alerts section (or any 'Late Entry' mention)
    //  - LOP         → show only Working Hours (key indicator of LOP reason)
    //  - OD/CL/ML/Comp Leave → show matching Approved Segments entry
    //  - Present     → show Working Hours
    //  - Absent      → show '—' (no attendance data)
    //  - No filter   → show full raw remarks
    const getRelevantRemark = (record) => {
        const raw = (record.remarks || '').trim();
        const fallbackStatus = String(record.status || '').trim();
        if (!raw || raw === '—') return fallbackStatus || '—';
        if (!statusFilter) return raw; // no filter → full remarks

        // Split into pipe-separated sections
        const sections = raw.split('|').map(s => s.trim()).filter(Boolean);

        // Helper to find a section that starts with a given key (case-insensitive)
        const getSection = (key) => {
            const found = sections.find(s => s.toLowerCase().startsWith(key.toLowerCase()));
            return found ? found.replace(/^[^:]+:\s*/i, '').trim() : null;
        };

        if (statusFilter === 'Late Entry') {
            // Show only the Alerts section, like "Late Entry (09:07)"
            const alerts = getSection('Alerts');
            if (alerts) {
                // Filter just the Late Entry flag from alerts (could have Early Exit too)
                const lePart = alerts.split(',').map(a => a.trim()).filter(a =>
                    a.toLowerCase().includes('late entry') || a.toLowerCase().includes('late')
                ).join(', ');
                return lePart || alerts;
            }
            // Fallback: scan whole string for "Late Entry" keyword
            const match = raw.match(/Late Entry[^,|]*/i);
            return match ? match[0].trim() : raw;
        }

        if (statusFilter === 'Present') {
            // Show working hours — most relevant for a present record
            const wh = getSection('Working Hours');
            return wh ? `Working Hours: ${wh}` : '—';
        }

        if (statusFilter === 'LOP') {
            // Show working hours (explains why LOP happened) + any alerts
            const wh = getSection('Working Hours');
            const alerts = getSection('Alerts');
            const parts = [];
            if (wh) parts.push(`Working Hours: ${wh}`);
            if (alerts) parts.push(`Alerts: ${alerts}`);
            return parts.length > 0 ? parts.join(' | ') : raw;
        }

        if (statusFilter === 'Absent') {
            return fallbackStatus || '—';
        }

        // For leave types (OD, CL, ML, Comp Leave) — show the matching Approved Segment
        const leaveKeywords = {
            'OD': ['od', 'on duty'],
            'CL': ['cl', 'casual leave'],
            'ML': ['ml', 'medical leave'],
            'Comp Leave': ['comp leave', 'compensatory'],
        };

        const keywords = leaveKeywords[statusFilter];
        if (keywords) {
            const segs = getSection('Approved Segments');
            if (segs) {
                // Segments are pipe-separated within the section, or just inline
                const segParts = segs.split(/\|/).map(p => p.trim()).filter(Boolean);
                const relevant = segParts.filter(p =>
                    keywords.some(kw => p.toLowerCase().includes(kw))
                );
                return relevant.length > 0 ? relevant.join(' | ') : segs;
            }
            // Fallback: scan raw string
            const match = raw.match(new RegExp(`${keywords[0]}[^|]*`, 'i'));
            return match ? match[0].trim() : raw;
        }

        // Default fallback — show full remarks
        return raw;
    };

    if (loading) return (
        <div className="py-10 flex justify-center">
            <div className="h-8 w-8 border-4 border-sky-100 border-t-sky-600 rounded-full animate-spin" />
        </div>
    );

    return (
        <div className="mt-12 bg-white rounded-[40px] shadow-xl shadow-sky-50/50 border border-sky-50 overflow-hidden">
            <div className="p-8 border-b border-gray-50 bg-gray-50/30">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-4">
                        <div className="h-10 w-10 rounded-xl bg-sky-600 text-white flex items-center justify-center shadow-lg shadow-sky-200">
                            <FaHistory />
                        </div>
                        <div>
                            <h2 className="text-sm font-black text-gray-800 uppercase tracking-widest">
                                {statusFilter ? `${statusFilter} Records` : 'Recent Attendance History'}
                            </h2>
                            <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">
                                {statusFilter
                                    ? `${displayedRecords.length} record(s) found for status: ${statusFilter}`
                                    : recentOnly
                                        ? `Showing full uploaded records for ${propMonth || 'this month'}`
                                        : (startDate && endDate
                                            ? `Records from ${startDate} to ${endDate}`
                                            : `Showing all records for ${propMonth || 'this month'}`)}
                            </p>
                        </div>
                    </div>
                </div>
                {/* Live Date Display */}
                <div className="flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-sky-50 to-blue-50 rounded-2xl border border-sky-100">
                    <div className="flex items-center gap-2">
                        <FaCalendarAlt className="text-sky-600 text-sm" />
                        <div>
                            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Live Date</p>
                            <p className="text-sm font-black text-gray-800">
                                {new Date().toLocaleDateString('en-US', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
                            </p>
                        </div>
                    </div>
                    <span className="ml-auto px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border bg-sky-50 text-sky-600 border-sky-100 flex items-center gap-1.5">
                        <span className="h-1.5 w-1.5 bg-sky-500 rounded-full animate-ping" />
                        Live
                    </span>
                </div>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-gray-50/50">
                            <th className="px-8 py-5 text-[9px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-50">Date</th>
                            <th className="px-8 py-5 text-[9px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-50">Status</th>
                            <th className="px-8 py-5 text-[9px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-50">In Time</th>
                            <th className="px-8 py-5 text-[9px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-50">Out Time</th>
                            <th className="px-8 py-5 text-[9px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-50">Work Hours</th>
                            <th className="px-8 py-5 text-[9px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-50">Remarks</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                        {displayedRecords.length === 0 ? (
                            <tr>
                                <td colSpan="6" className="px-8 py-12 text-center text-gray-400 text-[10px] font-bold uppercase tracking-widest italic">
                                    {recentOnly ? 'No uploaded attendance records found for this month.' : 'No attendance records found for this period.'}
                                </td>
                            </tr>
                        ) : (
                            displayedRecords.map((record, idx) => (
                                <motion.tr
                                    key={record.id || idx}
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: idx * 0.05 }}
                                    className="hover:bg-sky-50/30 transition-colors group"
                                >
                                    <td className="px-8 py-5">
                                        <div className="flex items-center gap-3">
                                            <div className="h-8 w-8 rounded-lg bg-gray-50 text-gray-400 flex items-center justify-center text-xs group-hover:bg-white transition-colors border border-gray-100">
                                                <FaCalendarAlt />
                                            </div>
                                            <span className="text-[11px] font-black text-gray-700 tracking-tight">
                                                {new Date(String(record.date).slice(0, 10) + 'T00:00:00+05:30').toLocaleDateString('en-US', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' })}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-8 py-5">
                                        <div className="flex items-center gap-2">
                                            {isLateEntry(record) ? <FaClock className="text-orange-500" /> : getStatusIcon(record.status)}
                                            <span className={`text-[9px] font-black uppercase tracking-widest ${
                                                isLateEntry(record) ? 'text-orange-600' :
                                                String(record.status).toUpperCase().includes('PRESENT') ? 'text-emerald-600' :
                                                String(record.status).toUpperCase().includes('LOP') ? 'text-rose-700' :
                                                String(record.status).toUpperCase().includes('ABSENT') ? 'text-rose-500' :
                                                String(record.status).toUpperCase().includes('OD') ? 'text-sky-600' : 'text-amber-500'
                                                }`}>
                                                {isLateEntry(record) ? (
                                                    <span>
                                                        {String(record.status).startsWith('Present') ? 'LE' : `${record.status} (LE)`}
                                                    </span>
                                                ) : (
                                                    String(record.status).startsWith('Present +') 
                                                        ? `P / ${record.status.replace('Present +', '').trim()}` 
                                                        : record.status
                                                )}
                                                {(record.in_time && record.out_time && 
                                                  !['Present', 'Absent', 'Holiday', 'Weekend', 'LOP'].includes(record.status) &&
                                                  !String(record.status).startsWith('Present +')
                                                ) && (
                                                    <span className="ml-1 opacity-70">
                                                        ({formatTo12Hr(record.in_time.slice(0, 5))} - {formatTo12Hr(record.out_time.slice(0, 5))})
                                                    </span>
                                                )}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-8 py-5">
                                        <div className="flex items-center gap-2">
                                            <FaClock className="text-gray-300 text-[10px]" />
                                            <span className="text-[11px] font-black text-gray-600">{formatTo12Hr(record.in_time)}</span>
                                        </div>
                                    </td>
                                    <td className="px-8 py-5">
                                        <div className="flex items-center gap-2">
                                            <FaClock className="text-gray-300 text-[10px]" />
                                            <span className="text-[11px] font-black text-gray-600">{formatTo12Hr(record.out_time)}</span>
                                        </div>
                                    </td>
                                    <td className="px-8 py-5">
                                        <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${record.in_time && record.out_time
                                            ? 'bg-sky-50 text-sky-600 border-sky-100'
                                            : 'bg-gray-50 text-gray-400 border-gray-100'
                                            }`}>
                                            {calculateHours(record.in_time, record.out_time)}
                                        </span>
                                    </td>
                                    <td className="px-8 py-5">
                                        <span className={`text-[10px] font-bold italic ${statusFilter ? 'text-gray-700' : 'text-gray-500'}`}
                                            title={record.remarks || ''}
                                        >
                                            {getRelevantRemark(record)}
                                        </span>
                                    </td>
                                </motion.tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default AttendanceHistory;
