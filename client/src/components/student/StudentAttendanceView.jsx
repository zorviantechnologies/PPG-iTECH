import { useState, useEffect, useCallback } from 'react';
import api from '../../utils/api';
import { motion } from 'framer-motion';
import {
    FaCalendarCheck, FaClock, FaTimes, FaCheck, FaFilter,
    FaBookOpen, FaUserCheck, FaExclamationTriangle, FaCalendarAlt, FaRedo
} from 'react-icons/fa';

const StudentAttendanceView = () => {
    const [attendanceData, setAttendanceData] = useState(null);
    const [loading, setLoading] = useState(true);

    // Filters
    const [filterYear, setFilterYear] = useState('all');
    const [filterSem, setFilterSem] = useState('all');
    const [filterMonth, setFilterMonth] = useState('all');
    const [filterSubject, setFilterSubject] = useState('all');
    const [filterDate, setFilterDate] = useState('all');

    const fetchMyAttendance = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (filterYear !== 'all') params.append('academic_year', filterYear);
            if (filterSem !== 'all') params.append('semester', filterSem);
            if (filterMonth !== 'all') params.append('month', filterMonth);
            if (filterSubject !== 'all') params.append('subject', filterSubject);
            if (filterDate !== 'all') params.append('date', filterDate);

            const res = await api.get(`/student-attendance/my-attendance?${params.toString()}`);
            setAttendanceData(res.data || null);
        } catch (err) {
            console.error('Error fetching student attendance:', err);
        } finally {
            setLoading(false);
        }
    }, [filterYear, filterSem, filterMonth, filterSubject, filterDate]);

    useEffect(() => {
        fetchMyAttendance();
    }, [fetchMyAttendance]);

    const handleResetFilters = () => {
        setFilterYear('all');
        setFilterSem('all');
        setFilterMonth('all');
        setFilterSubject('all');
        setFilterDate('all');
    };

    const summary = attendanceData?.summary || {
        working_hours: 0,
        hours_attended: 0,
        absent_hours: 0,
        attendance_percentage: '100.0',
        is_eligible: true
    };

    const subjectSummary = attendanceData?.subject_summary || [];
    const attendanceLogs = attendanceData?.attendance_logs || [];

    // Extract unique subjects for filter dropdown
    const availableSubjects = Array.from(
        new Set(attendanceLogs.map(l => l.subject).filter(Boolean))
    );

    const formatDayName = (dateStr) => {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        return d.toLocaleDateString('en-US', { weekday: 'short' });
    };

    return (
        <div className="space-y-6">
            
            {/* Header Banner */}
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-sky-900 via-indigo-900 to-slate-900 p-6 sm:p-8 text-white shadow-xl">
                <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-sky-500/20 rounded-full blur-3xl pointer-events-none" />
                <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="space-y-2">
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-xs font-semibold text-sky-200">
                            <FaCalendarCheck /> My Hour-Wise Attendance Dashboard
                        </div>
                        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
                            Personal Attendance & Hours Record
                        </h1>
                        <p className="text-sm text-sky-200/90 max-w-2xl">
                            Track your hour-wise conducted classes, attended hours, absent hours, and subject breakdown updated in real time by your staff.
                        </p>
                    </div>
                </div>
            </div>

            {/* Attendance Percentage & Eligibility Banner */}
            <div className={`p-5 rounded-2xl border flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm ${
                summary.is_eligible 
                    ? 'bg-emerald-50/80 border-emerald-200 text-emerald-900' 
                    : 'bg-rose-50/80 border-rose-200 text-rose-900'
            }`}>
                <div className="flex items-center gap-3">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-white text-xl font-black shadow-md ${
                        summary.is_eligible ? 'bg-emerald-600 shadow-emerald-500/30' : 'bg-rose-600 shadow-rose-500/30'
                    }`}>
                        {summary.is_eligible ? <FaCheck /> : <FaExclamationTriangle />}
                    </div>
                    <div>
                        <h3 className="text-base font-extrabold">
                            Overall Attendance Status: {summary.is_eligible ? 'ELIGIBLE' : 'ATTENDANCE SHORTAGE WARNING'}
                        </h3>
                        <p className="text-xs font-medium opacity-90 mt-0.5">
                            {summary.is_eligible 
                                ? 'Your attendance meets or exceeds the mandatory 75.0% academic requirement.' 
                                : 'Your overall attendance is below 75.0%. Please ensure regular attendance to maintain examination eligibility.'}
                        </p>
                    </div>
                </div>
                <div className="text-center sm:text-right shrink-0">
                    <span className="text-xs uppercase font-bold tracking-wider opacity-75">Total Score</span>
                    <p className="text-3xl font-black tracking-tight">{summary.attendance_percentage}%</p>
                </div>
            </div>

            {/* Metrics Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                
                {/* Total Working Hours */}
                <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center justify-between">
                    <div>
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Conducted Working Hours</p>
                        <p className="text-2xl font-black text-slate-900 mt-1">{summary.working_hours} hrs</p>
                    </div>
                    <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600 text-xl font-bold">
                        <FaClock />
                    </div>
                </div>

                {/* Hours Attended */}
                <div className="bg-emerald-50/70 border border-emerald-200 rounded-2xl p-5 shadow-sm flex items-center justify-between">
                    <div>
                        <p className="text-xs font-bold text-emerald-700 uppercase tracking-wider">Hours Attended (Present)</p>
                        <p className="text-2xl font-black text-emerald-800 mt-1">{summary.hours_attended} hrs</p>
                    </div>
                    <div className="w-12 h-12 rounded-xl bg-emerald-500 text-white flex items-center justify-center text-xl font-bold">
                        <FaUserCheck />
                    </div>
                </div>

                {/* Absent Hours */}
                <div className="bg-rose-50/70 border border-rose-200 rounded-2xl p-5 shadow-sm flex items-center justify-between">
                    <div>
                        <p className="text-xs font-bold text-rose-700 uppercase tracking-wider">Absent Hours</p>
                        <p className="text-2xl font-black text-rose-800 mt-1">{summary.absent_hours} hrs</p>
                    </div>
                    <div className="w-12 h-12 rounded-xl bg-rose-500 text-white flex items-center justify-center text-xl font-bold">
                        <FaTimes />
                    </div>
                </div>

                {/* Attendance Percentage */}
                <div className="bg-sky-50/70 border border-sky-200 rounded-2xl p-5 shadow-sm flex items-center justify-between">
                    <div>
                        <p className="text-xs font-bold text-sky-700 uppercase tracking-wider">Attendance Percentage</p>
                        <p className="text-2xl font-black text-sky-900 mt-1">{summary.attendance_percentage}%</p>
                    </div>
                    <div className="w-12 h-12 rounded-xl bg-sky-500 text-white flex items-center justify-center text-xl font-bold">
                        <FaCalendarCheck />
                    </div>
                </div>
            </div>

            {/* Filter Bar Panel */}
            <div className="bg-white/80 backdrop-blur-xl rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                        <FaFilter className="text-sky-600" /> Filter My Attendance Log
                    </h3>
                    <button
                        type="button"
                        onClick={handleResetFilters}
                        className="text-xs font-bold text-sky-600 hover:text-sky-700 flex items-center gap-1 transition-colors"
                    >
                        <FaRedo className="text-[10px]" /> Reset Filters
                    </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                    
                    {/* Academic Year Filter */}
                    <div className="space-y-1">
                        <label className="text-[11px] font-bold uppercase text-slate-500">Academic Year</label>
                        <select
                            value={filterYear}
                            onChange={(e) => setFilterYear(e.target.value)}
                            className="w-full px-2.5 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-sky-500"
                        >
                            <option value="all">All Years</option>
                            <option value="1">Year 1</option>
                            <option value="2">Year 2</option>
                            <option value="3">Year 3</option>
                            <option value="4">Year 4</option>
                        </select>
                    </div>

                    {/* Semester Filter */}
                    <div className="space-y-1">
                        <label className="text-[11px] font-bold uppercase text-slate-500">Semester</label>
                        <select
                            value={filterSem}
                            onChange={(e) => setFilterSem(e.target.value)}
                            className="w-full px-2.5 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-sky-500"
                        >
                            <option value="all">All Semesters</option>
                            {[1, 2, 3, 4, 5, 6, 7, 8].map(s => (
                                <option key={s} value={s}>Semester {s}</option>
                            ))}
                        </select>
                    </div>

                    {/* Month Filter */}
                    <div className="space-y-1">
                        <label className="text-[11px] font-bold uppercase text-slate-500">Month</label>
                        <input
                            type="month"
                            value={filterMonth === 'all' ? '' : filterMonth}
                            onChange={(e) => setFilterMonth(e.target.value || 'all')}
                            className="w-full px-2.5 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-sky-500"
                        />
                    </div>

                    {/* Subject Filter */}
                    <div className="space-y-1">
                        <label className="text-[11px] font-bold uppercase text-slate-500">Subject</label>
                        <select
                            value={filterSubject}
                            onChange={(e) => setFilterSubject(e.target.value)}
                            className="w-full px-2.5 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-sky-500"
                        >
                            <option value="all">All Subjects</option>
                            {availableSubjects.map(sub => (
                                <option key={sub} value={sub}>{sub}</option>
                            ))}
                        </select>
                    </div>

                    {/* Date Filter */}
                    <div className="space-y-1 col-span-2 sm:col-span-1">
                        <label className="text-[11px] font-bold uppercase text-slate-500">Specific Date</label>
                        <input
                            type="date"
                            value={filterDate === 'all' ? '' : filterDate}
                            onChange={(e) => setFilterDate(e.target.value || 'all')}
                            className="w-full px-2.5 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-sky-500"
                        />
                    </div>
                </div>
            </div>

            {/* Subject-Wise Attendance Breakdown Table */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden p-5 space-y-4">
                <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                    <FaBookOpen className="text-sky-600" /> Subject-Wise Attendance Summary
                </h3>

                {subjectSummary.length === 0 ? (
                    <p className="text-xs text-slate-400 py-4 text-center">No subject attendance records found for current filters.</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs border-collapse">
                            <thead>
                                <tr className="bg-slate-50 text-slate-600 uppercase tracking-wider font-bold border-b border-slate-200">
                                    <th className="py-3 px-4">Subject Name</th>
                                    <th className="py-3 px-4 text-center">Conducted Hours</th>
                                    <th className="py-3 px-4 text-center">Attended Hours</th>
                                    <th className="py-3 px-4 text-center">Absent Hours</th>
                                    <th className="py-3 px-4 text-center">Subject %</th>
                                    <th className="py-3 px-4 text-center">Eligibility</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {subjectSummary.map((sub, idx) => (
                                    <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                                        <td className="py-3 px-4 font-bold text-slate-800">
                                            {sub.subject} {sub.subject_code ? <span className="text-slate-400 font-normal">({sub.subject_code})</span> : ''}
                                        </td>
                                        <td className="py-3 px-4 text-center font-bold text-slate-700">{sub.working_hours} hrs</td>
                                        <td className="py-3 px-4 text-center font-bold text-emerald-600">{sub.hours_attended} hrs</td>
                                        <td className="py-3 px-4 text-center font-bold text-rose-600">{sub.absent_hours} hrs</td>
                                        <td className="py-3 px-4 text-center font-black text-slate-900">{sub.percentage}%</td>
                                        <td className="py-3 px-4 text-center">
                                            <span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wide ${
                                                sub.is_eligible 
                                                    ? 'bg-emerald-100 text-emerald-800' 
                                                    : 'bg-rose-100 text-rose-800'
                                            }`}>
                                                {sub.is_eligible ? 'Eligible' : 'Shortage'}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Detailed Hour-Wise & Date-Wise Log Table */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden p-5 space-y-4">
                <div className="flex items-center justify-between">
                    <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                        <FaCalendarAlt className="text-sky-600" /> Detailed Hour-Wise & Date-Wise Log
                    </h3>
                    <span className="text-xs font-semibold text-slate-500">Showing {attendanceLogs.length} sessions</span>
                </div>

                {loading ? (
                    <div className="py-12 flex flex-col items-center justify-center gap-3 text-slate-400">
                        <div className="h-8 w-8 border-4 border-sky-200 border-t-sky-600 rounded-full animate-spin" />
                        <p className="text-xs font-semibold">Loading attendance logs...</p>
                    </div>
                ) : attendanceLogs.length === 0 ? (
                    <div className="py-12 text-center text-slate-500 space-y-2">
                        <FaCalendarCheck className="text-4xl text-slate-300 mx-auto" />
                        <p className="text-sm font-bold">No attendance logs available.</p>
                        <p className="text-xs text-slate-400">Attendance entered by allocated staff will automatically show up here.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs border-collapse">
                            <thead>
                                <tr className="bg-slate-50 text-slate-600 uppercase tracking-wider font-bold border-b border-slate-200">
                                    <th className="py-3 px-4">Date</th>
                                    <th className="py-3 px-4">Day</th>
                                    <th className="py-3 px-4">Hour / Session</th>
                                    <th className="py-3 px-4">Subject</th>
                                    <th className="py-3 px-4 text-center">Status</th>
                                    <th className="py-3 px-4">Faculty / Marked By</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {attendanceLogs.map((log) => {
                                    const isPresent = log.status === 'Present';
                                    return (
                                        <tr key={log.id} className="hover:bg-slate-50/80 transition-colors">
                                            <td className="py-3 px-4 font-bold text-slate-900">{log.date}</td>
                                            <td className="py-3 px-4 font-semibold text-slate-500">{formatDayName(log.date)}</td>
                                            <td className="py-3 px-4 font-bold text-sky-700">
                                                Hour {log.period_number}
                                                {log.start_time ? <span className="text-slate-400 font-normal block text-[10px]">{log.start_time} - {log.end_time}</span> : ''}
                                            </td>
                                            <td className="py-3 px-4 font-bold text-slate-800">
                                                {log.subject}
                                                {log.subject_code ? <span className="text-slate-400 font-normal ml-1">({log.subject_code})</span> : ''}
                                            </td>
                                            <td className="py-3 px-4 text-center">
                                                <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-extrabold ${
                                                    isPresent
                                                        ? 'bg-emerald-100 text-emerald-800'
                                                        : 'bg-rose-100 text-rose-800'
                                                }`}>
                                                    {isPresent ? <FaCheck className="text-[10px]" /> : <FaTimes className="text-[10px]" />}
                                                    {log.status}
                                                </span>
                                            </td>
                                            <td className="py-3 px-4 font-medium text-slate-600">
                                                {log.marked_by_name || log.marked_by_emp_id || 'Allocated Staff'}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};

export default StudentAttendanceView;
