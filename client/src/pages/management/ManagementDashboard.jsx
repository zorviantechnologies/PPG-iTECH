import { useState, useEffect, useCallback } from 'react';
import Layout from '../../components/Layout';
import api from '../../utils/api';
import { useSocket } from '../../context/SocketContext';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { FaBirthdayCake, FaUserCheck, FaUserTimes, FaCalendarDay, FaBus, FaFileAlt, FaTimes, FaCalendarAlt, FaStar, FaBriefcase, FaClock, FaHistory, FaEye } from 'react-icons/fa';
import AttendanceHistory from '../../components/AttendanceHistory';
import { formatTo12Hr } from '../../utils/timeFormatter';
import { getCurrentDayStatus } from '../../utils/currentDayStatus';

const ManagementDashboard = () => {
    const socket = useSocket();
    const navigate = useNavigate();
    const [stats, setStats] = useState({
        present: 0, absent: 0, od: 0, cl: 0, ml: 0, comp_leave: 0, lop: 0, late_entry: 0,
        principal: { present: 0, absent: 0, od: 0, cl: 0, ml: 0, comp_leave: 0, lop: 0, late_entry: 0 },
        hod: { present: 0, absent: 0, od: 0, cl: 0, ml: 0, comp_leave: 0, lop: 0, late_entry: 0 },
        staff: { present: 0, absent: 0, od: 0, cl: 0, ml: 0, comp_leave: 0, lop: 0, late_entry: 0 }
    });
    const [birthdays, setBirthdays] = useState([]);
    const [allEmployees, setAllEmployees] = useState([]);
    const [attendanceMap, setAttendanceMap] = useState({});
    const [monthStats, setMonthStats] = useState({ workingDays: 0, holidays: 0, specialEvents: 0 });
    const [currentDayStatus, setCurrentDayStatus] = useState({ type: 'workingDays', detail: 'Regular working day' });
    const [employeeModal, setEmployeeModal] = useState(null);
    const [selectedEmployeeHistory, setSelectedEmployeeHistory] = useState(null); // { emp_id, name }
    const [isNonWorkingDay, setIsNonWorkingDay] = useState(false);

    const fetchDashboardData = useCallback(async () => {
        try {
            const date = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
            const { data: summary } = await api.get(`/attendance/summary?date=${date}`);
            const { data: bdays } = await api.get('/employees/birthdays/today');
            setBirthdays(bdays);
            const { data: emps } = await api.get('/employees');
            setAllEmployees(emps);
            const { data: todayAtt } = await api.get(`/attendance?date=${date}`);
            const map = {};
            (todayAtt || []).forEach(r => { map[r.emp_id] = r; });
            setAttendanceMap(map);
            // Fetch holiday/calendar data first
            const now = new Date();
            const curMonth = now.getMonth() + 1;
            const curYear = now.getFullYear();
            const { data: holidayData } = await api.get(`holidays?month=${curMonth}&year=${curYear}`);
            setCurrentDayStatus(getCurrentDayStatus({ today: date, holidayData }));
            const holidayDateSet = new Set();
            (holidayData || []).forEach(h => { holidayDateSet.add(h.h_date); });
            
            const isTodayHoliday = holidayDateSet.has(date);
            const todayDOW = new Date().getDay();
            const isTodayNonWorking = isTodayHoliday || todayDOW === 0 || todayDOW === 6;
            setIsNonWorkingDay(isTodayNonWorking);

            const agg = {
                present: 0, absent: 0, od: 0, cl: 0, ml: 0, comp_leave: 0, lop: 0, late_entry: 0,
                principal: { present: 0, absent: 0, od: 0, cl: 0, ml: 0, comp_leave: 0, lop: 0, late_entry: 0 },
                hod: { present: 0, absent: 0, od: 0, cl: 0, ml: 0, comp_leave: 0, lop: 0, late_entry: 0 },
                staff: { present: 0, absent: 0, od: 0, cl: 0, ml: 0, comp_leave: 0, lop: 0, late_entry: 0 }
            };

            (summary || []).forEach(r => {
                const role = (r.role || '').toLowerCase();
                const bucket = agg[role] || agg.staff;
                const p = Number(r.total_present) || 0;
                const o = Number(r.total_od) || 0;
                const lp = Number(r.total_lop) || 0;
                const late = Number(r.total_late) || 0;
                const abs = Number(r.total_actual_absent || (r.total_absent > 0 ? r.total_absent : 0)) || 0;
                
                bucket.present += p;
                bucket.od += o;
                bucket.lop += lp;
                bucket.late_entry += late;
                bucket.absent += abs;
                
                agg.present += p;
                agg.od += o;
                agg.lop += lp;
                agg.late_entry += late;
                agg.absent += abs;
            });
            // Count individual leave types from attendance map
            (emps || []).forEach(emp => {
                const r = attendanceMap[emp.emp_id] || {};
                const s = (r.status || '').toUpperCase();
                const rem = (r.remarks || '').toUpperCase();
                const role = (emp.role || '').toLowerCase();
                const bucket = agg[role] || agg.staff;
                if ((s.includes('CL') || rem.includes('CL') || rem.includes('CASUAL')) && !s.includes('COMP') && !rem.includes('COMP')) { bucket.cl++; agg.cl++; }
                else if (s.includes('ML') || rem.includes('ML') || rem.includes('MEDICAL')) { bucket.ml++; agg.ml++; }
                else if (s.includes('COMP LEAVE') || rem.includes('COMP LEAVE') || rem.includes('COMPENSATORY')) { bucket.comp_leave++; agg.comp_leave++; }
            });
            setStats(agg);
            const daysInMonth = new Date(curYear, curMonth, 0).getDate();
            let hCount = 0, sCount = 0;
            (holidayData || []).forEach(h => {
                if (h.type === 'Holiday') hCount++;
                else if (h.type === 'Special') sCount++;
            });
            for (let d = 1; d <= daysInMonth; d++) {
                const dow = new Date(curYear, curMonth - 1, d).getDay();
                const ds = `${curYear}-${String(curMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                if ((dow === 0 || dow === 6) && !holidayDateSet.has(ds)) hCount++;
            }
            setMonthStats({ workingDays: daysInMonth - hCount - sCount, holidays: hCount, specialEvents: sCount });
        } catch (error) { console.error('Dashboard error', error); }
    }, []);

    useEffect(() => {
        fetchDashboardData();
        const interval = setInterval(fetchDashboardData, 60000);
        return () => clearInterval(interval);
    }, [fetchDashboardData]);

    useEffect(() => {
        if (!socket) return;
        socket.on('employee_updated', fetchDashboardData);
        socket.on('attendance_updated', fetchDashboardData);
        return () => {
            socket.off('employee_updated', fetchDashboardData);
            socket.off('attendance_updated', fetchDashboardData);
        };
    }, [socket, fetchDashboardData]);

    const hodList = allEmployees.filter(e => (e.role || '').toLowerCase() === 'hod');
    const staffList = allEmployees.filter(e => (e.role || '').toLowerCase() === 'staff');
    const principalList = allEmployees.filter(e => (e.role || '').toLowerCase() === 'principal');

    const getFilteredEmployees = (roleKey, statusLabel) => {
        const roleEmps = allEmployees.filter(e => (e.role || '').toLowerCase() === roleKey);
        if (statusLabel === 'All') return roleEmps;
        return roleEmps.filter(emp => {
            const r = attendanceMap[emp.emp_id];
            const s = String(r?.status || '').toUpperCase();
            const rem = String(r?.remarks || '').toUpperCase();
            if (statusLabel === 'Present') return r && s.includes('PRESENT') && !s.includes('LOP');
            if (statusLabel === 'Absent') {
                if (isNonWorkingDay) return false;
                if (!r || !s) return true;
                return s.includes('ABSENT') && !s.includes('LOP');
            }
            if (statusLabel === 'On Duty') return s.includes('OD') || rem.includes('OD');
            if (statusLabel === 'Casual Leave') return (s.includes('CL') || s.includes('LEAVE') || rem.includes('CL') || rem.includes('CASUAL')) && !s.includes('COMP') && !rem.includes('COMP');
            if (statusLabel === 'Medical Leave') return s.includes('ML') || rem.includes('ML') || rem.includes('MEDICAL');
            if (statusLabel === 'Comp Leave') return s.includes('COMP LEAVE') || rem.includes('COMP LEAVE');
            if (statusLabel === 'Loss Of Pay') return s.includes('LOP');
            if (statusLabel === 'Late Entry') return s.includes('LATE') || rem.includes('LATE ENTRY');
            return false;
        });
    };

    const roleConfigs = [
        { key: 'principal', title: 'Principal', accentClass: 'from-sky-500 to-sky-700', totalCount: principalList.length },
        { key: 'hod', title: 'HODs', accentClass: 'from-amber-400 to-amber-600', totalCount: hodList.length },
        { key: 'staff', title: 'Staff', accentClass: 'from-purple-500 to-purple-700', totalCount: staffList.length }
    ];

    return (
        <Layout>
            {/* Page Header */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-10">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                        <h1 className="text-4xl font-black text-gray-800 tracking-tighter">
                            Management <span className="text-[#7C3AED]">Dashboard</span>
                        </h1>

                    </div>
                    <div className="flex items-center gap-6">
                        {birthdays.length > 0 && (
                            <motion.div
                                whileHover={{ scale: 1.05 }}
                                className="bg-gradient-to-tr from-[#FF9A9E] to-[#FAD0C4] p-[1px] rounded-3xl shadow-2xl shadow-rose-200/50 cursor-pointer"
                                onClick={() => {
                                    document.getElementById('birthdays-section')?.scrollIntoView({ behavior: 'smooth' });
                                }}
                            >
                                <div className="bg-white/90 backdrop-blur-md px-6 py-3 rounded-[23px] flex items-center gap-4">
                                    <div className="h-8 w-8 rounded-full bg-rose-50 flex items-center justify-center">
                                        <FaBirthdayCake className="text-rose-500 animate-bounce" />
                                    </div>
                                    <span className="text-[10px] font-black text-rose-600 uppercase tracking-widest hover:text-rose-700 transition-colors">
                                        {birthdays.length} Personnel Birthdays Today! (Click to View)
                                    </span>
                                </div>
                            </motion.div>
                        )}
                    </div>
                </div>
            </motion.div>

            {/* Monthly Summary Bar — clickable → Calendar */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="mb-10">
                <div className="flex items-center gap-2 mb-3">
                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-[0.25em]">This Month's Overview</p>
                    <span className="text-[8px] font-black text-purple-400 uppercase tracking-widest bg-purple-50 border border-purple-100 px-2 py-0.5 rounded-lg animate-pulse">Click any card to view Calendar →</span>
                </div>
                <div className="grid grid-cols-3 gap-4">
                    <motion.div
                        whileHover={{ scale: 1.03, y: -3 }}
                        whileTap={{ scale: 0.97 }}
                        onClick={() => { navigate('/management/calendar'); window.dispatchEvent(new CustomEvent('closeSidebar')); }}
                        className={`bg-emerald-50 border rounded-2xl p-5 flex items-center gap-4 cursor-pointer hover:shadow-lg hover:shadow-emerald-100/60 transition-all group ${currentDayStatus.type === 'workingDays' ? 'border-blue-500 ring-2 ring-blue-100' : 'border-emerald-100'}`}
                    >
                        <div className="h-11 w-11 rounded-xl bg-emerald-500 text-white flex items-center justify-center shadow-sm group-hover:bg-emerald-600 transition-colors">
                            <FaCalendarAlt />
                        </div>
                        <div>
                            <p className="text-[9px] font-black text-emerald-500 uppercase tracking-widest">Working Days</p>
                            <p className="text-2xl font-black text-emerald-700 tracking-tighter">{Number(monthStats.workingDays || 0).toFixed(1)}</p>
                        </div>
                    </motion.div>
                    <motion.div
                        whileHover={{ scale: 1.03, y: -3 }}
                        whileTap={{ scale: 0.97 }}
                        onClick={() => { navigate('/management/calendar'); window.dispatchEvent(new CustomEvent('closeSidebar')); }}
                        className={`bg-rose-50 border rounded-2xl p-5 flex items-center gap-4 cursor-pointer hover:shadow-lg hover:shadow-rose-100/60 transition-all group ${currentDayStatus.type === 'holidays' ? 'border-blue-500 ring-2 ring-blue-100' : 'border-rose-100'}`}
                    >
                        <div className="h-11 w-11 rounded-xl bg-rose-500 text-white flex items-center justify-center shadow-sm group-hover:bg-rose-600 transition-colors">
                            <FaCalendarDay />
                        </div>
                        <div>
                            <p className="text-[9px] font-black text-rose-500 uppercase tracking-widest">Holidays</p>
                            <p className="text-2xl font-black text-rose-700 tracking-tighter">{Number(monthStats.holidays || 0).toFixed(1)}</p>
                        </div>
                    </motion.div>
                    <motion.div
                        whileHover={{ scale: 1.03, y: -3 }}
                        whileTap={{ scale: 0.97 }}
                        onClick={() => { navigate('/management/calendar'); window.dispatchEvent(new CustomEvent('closeSidebar')); }}
                        className={`bg-amber-50 border rounded-2xl p-5 flex items-center gap-4 cursor-pointer hover:shadow-lg hover:shadow-amber-100/60 transition-all group ${currentDayStatus.type === 'specialEvents' ? 'border-blue-500 ring-2 ring-blue-100' : 'border-amber-100'}`}
                    >
                        <div className="h-11 w-11 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-sm group-hover:bg-amber-600 transition-colors">
                            <FaStar />
                        </div>
                        <div>
                            <p className="text-[9px] font-black text-amber-500 uppercase tracking-widest">Special Events</p>
                            <p className="text-2xl font-black text-amber-700 tracking-tighter">{Number(monthStats.specialEvents || 0).toFixed(1)}</p>
                        </div>
                    </motion.div>
                </div>
            </motion.div>

            {/* Stats Grid */}
            <div id="attendance-cores" className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
                {roleConfigs.map((role) => (
                    <motion.div
                        key={role.key}
                        whileHover={{ y: -8, scale: 1.02 }}
                        className="modern-card p-10 bg-white/70 backdrop-blur-xl border border-white/50 group relative overflow-hidden"
                    >
                        <div className="flex justify-between items-center mb-6 relative z-10">
                            <div>
                                <h2 className="text-[11px] font-black text-gray-400 uppercase tracking-[0.3em]">{role.title}</h2>
                                <p className="text-xl font-black text-gray-800 tracking-tighter mt-1">Attendance Core</p>
                            </div>
                            <div className={`p-3 rounded-2xl bg-gradient-to-br ${role.accentClass} text-white shadow-lg`}>
                                <FaUserCheck />
                            </div>
                        </div>

                        <div
                            onClick={() => {
                                document.querySelector('main')?.scrollTo({ top: 0, behavior: 'smooth' });
                                setEmployeeModal({ role: role.key, statusLabel: 'All', title: role.title });
                            }}
                            className="w-full mb-6 py-3 px-4 rounded-2xl bg-gray-50 border border-gray-100 text-[10px] font-black text-gray-500 uppercase tracking-widest flex items-center justify-between relative z-10 cursor-pointer hover:bg-white hover:border-purple-200 hover:shadow-md transition-all"
                        >
                            <span>Total {role.title}</span>
                            <div className="flex items-center gap-2">
                                <span className="flex items-center gap-1 bg-emerald-50 border border-emerald-100 text-emerald-600 font-black px-2 py-1 rounded-xl text-[9px] uppercase tracking-widest">
                                    <FaUserCheck size={8} /> {stats[role.key]?.present || 0} Available
                                </span>
                                <span className="bg-white border border-gray-200 text-gray-800 font-black px-3 py-1 rounded-xl text-sm">
                                    {role.totalCount}
                                </span>
                            </div>
                        </div>

                        <div className="space-y-4 relative z-10">
                            {[
                                { label: 'Present', value: stats[role.key]?.present, icon: <FaUserCheck />, color: 'text-sky-600', bg: 'bg-sky-50' },
                                { label: 'Absent', value: stats[role.key]?.absent, icon: <FaUserTimes />, color: 'text-rose-600', bg: 'bg-rose-50' },
                                { label: 'Loss Of Pay', value: stats[role.key]?.lop, icon: <FaTimes />, color: 'text-rose-800', bg: 'bg-rose-100' },
                                { label: 'On Duty', value: stats[role.key]?.od, icon: <FaBriefcase />, color: 'text-emerald-600', bg: 'bg-emerald-50' },
                                { label: 'Casual Leave', value: stats[role.key]?.cl, icon: <FaCalendarDay />, color: 'text-amber-600', bg: 'bg-amber-50' },
                                { label: 'Medical Leave', value: stats[role.key]?.ml, icon: <FaFileAlt />, color: 'text-purple-600', bg: 'bg-purple-50' },
                                { label: 'Comp Leave', value: stats[role.key]?.comp_leave, icon: <FaStar />, color: 'text-indigo-600', bg: 'bg-indigo-50' },
                                { label: 'Late Entry', value: stats[role.key]?.late_entry, icon: <FaClock />, color: 'text-orange-600', bg: 'bg-orange-50' }
                            ].map((stat) => (
                                <div
                                    key={stat.label}
                                    onClick={() => {
                                        document.querySelector('main')?.scrollTo({ top: 0, behavior: 'smooth' });
                                        setEmployeeModal({ role: role.key, statusLabel: stat.label, title: role.title });
                                    }}
                                    className="flex items-center justify-between p-3 rounded-2xl bg-gray-50/50 hover:bg-white transition-all border border-transparent hover:border-gray-100 group/item cursor-pointer"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={`h-9 w-9 rounded-xl ${stat.bg} ${stat.color} flex items-center justify-center text-sm shadow-sm transition-transform group-hover/item:rotate-12`}>
                                            {stat.icon}
                                        </div>
                                        <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">{stat.label}</span>
                                    </div>
                                    <span className="text-lg font-black text-gray-800 tracking-tighter">{stat.value || 0}</span>
                                </div>
                            ))}
                        </div>

                        <div className="absolute -bottom-10 -right-10 w-32 h-32 bg-gray-50 rounded-full blur-3xl opacity-50" />
                    </motion.div>
                ))}
            </div>

            {/* Birthdays */}
            {birthdays.length > 0 && (
                <div id="birthdays-section" className="grid grid-cols-1 lg:grid-cols-3 gap-10">
                    <div className="bg-gradient-to-br from-[#8E9EFF] to-[#4A90E2] rounded-[40px] shadow-2xl shadow-sky-200/50 p-10 text-white relative overflow-hidden group">
                        <div className="absolute -bottom-10 -right-10 w-48 h-48 bg-white/10 rounded-full blur-3xl group-hover:scale-150 transition-transform duration-1000" />
                        <h2 className="text-[10px] font-black uppercase tracking-[0.2em] mb-10 flex items-center relative z-10">
                            Milestone <FaBirthdayCake className="ml-3 text-white animate-bounce" />
                        </h2>
                        <div className="space-y-4 relative z-10">
                            {birthdays.map(b => (
                                <motion.div
                                    key={b.emp_id}
                                    whileHover={{ x: 8 }}
                                    onClick={() => {
                                        navigate(`/management/profile/${b.emp_id}`);
                                        window.dispatchEvent(new CustomEvent('closeSidebar'));
                                    }}
                                    className="flex items-center space-x-5 bg-white/10 backdrop-blur-md p-5 rounded-[28px] border border-white/20 hover:bg-white/25 transition-all group shadow-lg shadow-black/5 cursor-pointer"
                                >
                                    <div className="h-14 w-14 rounded-2xl bg-white flex items-center justify-center shadow-xl overflow-hidden border-2 border-white ring-4 ring-white/10 shrink-0">
                                        <img
                                            src={b.profile_pic || `https://ui-avatars.com/api/?name=${encodeURIComponent(b.name || '?')}&background=ffffff&color=0EA5E9&bold=true`}
                                            alt={b.name}
                                            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                                        />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[13px] font-black tracking-tight text-white group-hover:translate-x-1 transition-transform truncate">{b.name}</p>
                                        <div className="flex items-center gap-2 mt-1">
                                            <span className="h-1.5 w-1.5 rounded-full bg-rose-400 animate-pulse" />
                                            <p className="text-[8px] font-black text-sky-100 uppercase tracking-widest">Wishes shared Today</p>
                                        </div>
                                    </div>
                                    <div className="h-8 w-8 rounded-full bg-white/20 flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-all -translate-x-4 group-hover:translate-x-0">
                                        <FaBirthdayCake size={12} />
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Employee List Modal */}
            <AnimatePresence>
                {employeeModal && (() => {
                    const filtered = getFilteredEmployees(employeeModal.role, employeeModal.statusLabel);
                    return (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 bg-white z-50 flex flex-col"
                        >
                            <div className="px-6 md:px-10 py-5 border-b border-gray-100 bg-gradient-to-r from-purple-50 to-violet-50 flex items-center justify-between flex-shrink-0">
                                <div className="flex items-center gap-4">
                                    <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-purple-500 to-purple-700 flex items-center justify-center text-white shadow-lg">
                                        <FaUserCheck size={20} />
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{employeeModal.title}</p>
                                        <p className="text-xl font-black text-gray-800 tracking-tight">{employeeModal.statusLabel}</p>
                                    </div>
                                    <span className="ml-2 bg-purple-100 text-purple-700 px-4 py-1.5 rounded-xl text-xs font-black">{filtered.length} Employees</span>
                                </div>
                                <button onClick={() => setEmployeeModal(null)} className="p-3 rounded-2xl bg-white hover:bg-rose-50 text-gray-400 hover:text-rose-500 transition-all border border-gray-200 shadow-sm">
                                    <FaTimes size={18} />
                                </button>
                            </div>
                            <div className="flex-1 overflow-auto px-6 md:px-10 py-6">
                                {filtered.length === 0 ? (
                                    <div className="flex items-center justify-center h-full">
                                        <p className="text-gray-400 text-lg font-bold">No employees found</p>
                                    </div>
                                ) : (
                                    <div className="overflow-x-auto">
                                        <table className="min-w-[600px] w-full text-left">
                                            <thead className="sticky top-0 z-10">
                                                <tr className="bg-gray-50">
                                                    <th className="px-5 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest whitespace-nowrap">#</th>
                                                    <th className="px-5 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest whitespace-nowrap">Emp ID</th>
                                                    <th className="px-5 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest whitespace-nowrap">Name</th>
                                                    <th className="px-5 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest whitespace-nowrap">Department</th>
                                                    <th className="px-5 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right whitespace-nowrap">Status</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-50">
                                                {filtered.map((emp, idx) => (
                                                    <motion.tr
                                                        key={emp.id || emp.emp_id}
                                                        initial={{ opacity: 0, y: 5 }}
                                                        animate={{ opacity: 1, y: 0 }}
                                                        transition={{ delay: idx * 0.02 }}
                                                        className="hover:bg-purple-50/50 transition-colors"
                                                    >
                                                        <td className="px-5 py-4 text-sm font-black text-gray-400 whitespace-nowrap">{idx + 1}</td>
                                                        <td className="px-5 py-4 text-sm font-black text-purple-900 whitespace-nowrap">{emp.emp_id}</td>
                                                        <td className="px-5 py-4 whitespace-nowrap">
                                                            <div className="flex items-center gap-3">
                                                                <img src={emp.profile_pic || `https://ui-avatars.com/api/?name=${encodeURIComponent(emp.name || '?')}&size=80&background=9333ea&color=fff&bold=true`} alt="" className="h-9 w-9 rounded-xl object-cover shrink-0" />
                                                                <span className="text-sm font-bold text-gray-800">{emp.name}</span>
                                                            </div>
                                                        </td>
                                                        <td className="px-5 py-4 text-sm font-medium text-gray-600 whitespace-nowrap">{emp.department_name || '—'}</td>
                                                        <td className="px-5 py-4 text-right whitespace-nowrap">
                                                            <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${
                                                                (attendanceMap[emp.emp_id]?.remarks || '').includes('Late Entry') || (attendanceMap[emp.emp_id]?.status || '').includes('Late Entry') ? 'bg-orange-50 text-orange-600 border-orange-100' :
                                                                attendanceMap[emp.emp_id]?.status?.startsWith('Present') ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 
                                                                'bg-purple-50 text-purple-600 border-purple-100'
                                                            }`}>
                                                                {(attendanceMap[emp.emp_id]?.remarks || '').includes('Late Entry') || (attendanceMap[emp.emp_id]?.status || '').includes('Late Entry') ? (
                                                                    <span>{attendanceMap[emp.emp_id]?.status === 'Present' ? 'LE' : `${attendanceMap[emp.emp_id]?.status} (LE)`}</span>
                                                                ) : attendanceMap[emp.emp_id]?.status?.startsWith('Present +') 
                                                                    ? `P / ${attendanceMap[emp.emp_id].status.replace('Present +', '').trim()}` 
                                                                    : (attendanceMap[emp.emp_id]?.status || (isNonWorkingDay ? 'N/A' : 'ABSENT'))}
                                                            </span>
                                                        </td>
                                                    </motion.tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    );
                })()}
            </AnimatePresence>

            {/* Recent Attendance History Modal */}
            <AnimatePresence>
                {selectedEmployeeHistory && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-white z-[60] flex flex-col"
                    >
                        <div className="px-6 md:px-10 py-5 border-b border-gray-100 bg-gradient-to-r from-purple-50 to-violet-50 flex items-center justify-between flex-shrink-0">
                            <div className="flex items-center gap-4">
                                <div className="h-12 w-12 rounded-2xl bg-purple-600 flex items-center justify-center text-white shadow-lg">
                                    <FaHistory size={20} />
                                </div>
                                <div>
                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{selectedEmployeeHistory.emp_id}</p>
                                    <p className="text-xl font-black text-gray-800 tracking-tight">{selectedEmployeeHistory.name} - History</p>
                                </div>
                            </div>
                            <button onClick={() => setSelectedEmployeeHistory(null)} className="p-3 rounded-2xl bg-white hover:bg-rose-50 text-gray-400 hover:text-rose-500 transition-all border border-gray-200 shadow-sm">
                                <FaTimes size={18} />
                            </button>
                        </div>
                        <div className="flex-1 overflow-auto px-6 md:px-10 py-8 bg-gray-50/30">
                            <div className="max-w-5xl mx-auto">
                                <AttendanceHistory 
                                    empId={selectedEmployeeHistory.emp_id} 
                                    recentOnly={false} 
                                    month={new Date().toISOString().slice(0, 7)}
                                />
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </Layout>
    );
};

export default ManagementDashboard;
