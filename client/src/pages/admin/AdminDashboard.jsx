import { useState, useEffect, useCallback } from 'react';
import Layout from '../../components/Layout';
import api from '../../utils/api';
import { useSocket } from '../../context/SocketContext';
import { useAuth } from '../../context/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { FaBirthdayCake, FaUserCheck, FaUserTimes, FaCalendarDay, FaFileAlt, FaTimes, FaCalendarAlt, FaStar, FaBriefcase, FaEye, FaClock, FaHistory, FaFilter, FaSync } from 'react-icons/fa';
import AttendanceHistory from '../../components/AttendanceHistory';
import { formatTo12Hr } from '../../utils/timeFormatter';
import { getCurrentDayStatus } from '../../utils/currentDayStatus';

// ── Small helper components ─────────────────────────────────────────────────
// Small helper components removed ...
const InfoCard = ({ icon, label, value, color }) => {
    const colors = {
        blue: 'text-sky-600 bg-sky-50 border-sky-100',
        indigo: 'text-indigo-600 bg-indigo-50 border-indigo-100',
        purple: 'text-purple-600 bg-purple-50 border-purple-100',
        emerald: 'text-emerald-600 bg-emerald-50 border-emerald-100',
    };
    return (
        <div className="bg-white p-6 rounded-[24px] border border-gray-100 flex items-start gap-4 shadow-sm group hover:shadow-md transition-shadow">
            <div className={`h-11 w-11 rounded-xl flex items-center justify-center text-sm ${colors[color] || colors.blue} transition-transform group-hover:rotate-12`}>
                {icon}
            </div>
            <div>
                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">{label}</p>
                <p className="text-xs font-black text-gray-800 tracking-tight break-all uppercase">{value}</p>
            </div>
        </div>
    );
};

// ── Main Component ──────────────────────────────────────────────────────────
const AdminDashboard = () => {
    const { user } = useAuth();
    const socket = useSocket();
    const navigate = useNavigate();
    const [stats, setStats] = useState({
        present: 0, absent: 0, od: 0, cl: 0, ml: 0, comp_leave: 0, lop: 0, late_entry: 0,
        principal: { present: 0, absent: 0, od: 0, cl: 0, ml: 0, comp_leave: 0, lop: 0, late_entry: 0 },
        hod: { present: 0, absent: 0, od: 0, cl: 0, ml: 0, comp_leave: 0, lop: 0, late_entry: 0 },
        staff: { present: 0, absent: 0, od: 0, cl: 0, ml: 0, comp_leave: 0, lop: 0, late_entry: 0 }
    });

    const [birthdays, setBirthdays] = useState([]);
    const [statusFilter, setStatusFilter] = useState(null);
    const [allEmployees, setAllEmployees] = useState([]);
    const [attendanceMap, setAttendanceMap] = useState({});
    const [monthStats, setMonthStats] = useState({ workingDays: 0, holidays: 0, specialEvents: 0 });
    const [currentDayStatus, setCurrentDayStatus] = useState({ type: 'workingDays', detail: 'Regular working day' });
    const [employeeModal, setEmployeeModal] = useState(null); // { role, statusLabel }
    const [selectedEmployeeHistory, setSelectedEmployeeHistory] = useState(null); // { emp_id, name }
    const [isNonWorkingDay, setIsNonWorkingDay] = useState(false);
    const [rebuildingToday, setRebuildingToday] = useState(false);
    const [rebuildResult, setRebuildResult] = useState(null);

    const handleRebuildToday = async () => {
        setRebuildingToday(true);
        setRebuildResult(null);
        try {
            const { data } = await api.post('/biometric/rebuild-today');
            setRebuildResult({ success: true, message: data.message, results: data.results || [] });
            fetchDashboardData(); // Refresh dashboard after rebuild
        } catch (err) {
            setRebuildResult({ success: false, message: err?.response?.data?.message || 'Rebuild failed' });
        } finally {
            setRebuildingToday(false);
        }
    };


    const fetchDashboardData = useCallback(async () => {
        try {
            const date = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
            
            // Replaced 4 calls with 2 essential ones. Summary now includes everything needed for counts/map.
            const [summaryRes, bdaysRes] = await Promise.all([
                api.get(`/attendance/summary?date=${date}`),
                api.get('/employees/birthdays/today')
            ]);
            
            const summary = summaryRes.data || [];
            setBirthdays(bdaysRes.data || []);
            setAllEmployees(summary.map(s => ({ ...s, status: s.status, remarks: s.remarks })));

            const map = {};
            summary.forEach(r => { map[r.emp_id] = { status: r.status, remarks: r.remarks }; });
            setAttendanceMap(map);

            const now = new Date();
            const curMonth = now.getMonth() + 1;
            const curYear = now.getFullYear();
            
            // We can fetch holiday data less once or on demand, but for now we keep it filtered.
            const { data: holidayData } = await api.get(`holidays?month=${curMonth}&year=${curYear}`);
            setCurrentDayStatus(getCurrentDayStatus({ today: date, holidayData }));
            
            const holidayDateSet = new Set();
            (holidayData || []).forEach(h => { if (h.h_date) holidayDateSet.add(h.h_date); });
            
            const isTodayHoliday = holidayDateSet.has(date);
            const todayDayOfWeek = new Date().getDay();
            const isTodayWeekend = todayDayOfWeek === 0 || todayDayOfWeek === 6;
            const isTodayNonWorking = isTodayHoliday || isTodayWeekend;
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
                const cl = Number(r.total_cl) || 0;
                const ml = Number(r.total_ml) || 0;
                const comp = Number(r.total_comp) || 0;
                
                bucket.present += p;
                bucket.od += o;
                bucket.lop += lp;
                bucket.late_entry += late;
                bucket.absent += abs;
                bucket.cl += cl;
                bucket.ml += ml;
                bucket.comp_leave += comp;
                
                agg.present += p;
                agg.od += o;
                agg.lop += lp;
                agg.late_entry += late;
                agg.absent += abs;
                agg.cl += cl;
                agg.ml += ml;
                agg.comp_leave += comp;
            });
            setStats(agg);

            // Month summary calcs
            const daysInMonth = new Date(curYear, curMonth, 0).getDate();
            let hCount = 0, sCount = 0;
            const fullHolidaySetWithWeekends = new Set(holidayDateSet);
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

    // Auto-refresh every 10 seconds
    useEffect(() => {
        fetchDashboardData();
        const interval = setInterval(fetchDashboardData, 60000);
        return () => clearInterval(interval);
    }, [fetchDashboardData]);

    // Real-time: refresh instantly when an employee is added/updated/deleted
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

    // Get employees matching a role + status label for the modal
    const getFilteredEmployees = (roleKey, statusLabel) => {
        const roleEmps = allEmployees.filter(e => (e.role || '').toLowerCase() === roleKey.toLowerCase());
        if (statusLabel === 'Total') return roleEmps;
        
        return roleEmps.filter(emp => {
            const r = attendanceMap[emp.emp_id]; // Full attendance record or undefined
            const s = String(r?.status || '').toUpperCase();
            const rem = String(r?.remarks || '').toUpperCase();

            if (statusLabel === 'Present') {
                // Present = has a record AND status contains Present but NOT LOP
                return r && s.includes('PRESENT') && !s.includes('LOP');
            }
            if (statusLabel === 'Absent') {
                if (isNonWorkingDay) return false;
                // Absent = no record at all, OR status is explicitly Absent (no LOP, no leave)
                if (!r || !s) return true;
                return s.includes('ABSENT') && !s.includes('LOP');
            }
            if (statusLabel === 'On Duty') return s.includes('OD') || rem.includes('OD') || rem.includes('ON DUTY');
            if (statusLabel === 'Casual Leave') return (s.includes('CL') || s.includes('LEAVE') || rem.includes('CL') || rem.includes('CASUAL')) && !s.includes('COMP') && !rem.includes('COMP');
            if (statusLabel === 'Medical Leave') return s.includes('ML') || rem.includes('ML') || rem.includes('MEDICAL');
            if (statusLabel === 'Comp Leave') return s.includes('COMP LEAVE') || rem.includes('COMP LEAVE') || rem.includes('COMPENSATORY');
            if (statusLabel === 'Loss Of Pay') return s.includes('LOP');
            if (statusLabel === 'Late Entry') return s.includes('LATE') || rem.includes('LATE ENTRY');
            return false;
        });
    };


    const handleStatClick = (filter) => {
        setStatusFilter(prev => prev === filter ? null : filter);
    };

    const roleConfigs = [
        {
            key: 'principal', title: 'Principal',
            accentClass: 'from-sky-500 to-sky-700',
            canViewAll: true,
            modalRole: 'principal',
            totalCount: principalList.length
        },
        {
            key: 'hod', title: 'HODs',
            accentClass: 'from-amber-400 to-amber-600',
            canViewAll: true,
            modalRole: 'hod',
            totalCount: hodList.length
        },
        {
            key: 'staff', title: 'Staff',
            accentClass: 'from-purple-500 to-purple-700',
            canViewAll: true,
            modalRole: 'staff',
            totalCount: staffList.length
        }
    ];

    const menuItems = [];

    const menuColorStyles = {
        blue: { bg: 'bg-sky-50', text: 'text-sky-600', border: 'border-sky-100', accent: 'bg-sky-500' },
        amber: { bg: 'bg-amber-50', text: 'text-amber-600', border: 'border-amber-100', accent: 'bg-amber-500' },
        indigo: { bg: 'bg-indigo-50', text: 'text-indigo-600', border: 'border-indigo-100', accent: 'bg-indigo-500' },
        emerald: { bg: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-100', accent: 'bg-emerald-500' },
        purple: { bg: 'bg-purple-50', text: 'text-purple-600', border: 'border-purple-100', accent: 'bg-purple-500' },
        pink: { bg: 'bg-pink-50', text: 'text-pink-600', border: 'border-pink-100', accent: 'bg-pink-500' }
    };




    return (
        <Layout>
            {/* Page Header */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-10">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                        <h1 className="text-4xl font-black text-gray-800 tracking-tighter">
                            Admin <span className="text-[#0EA5E9]">Dashboard</span>
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

            {/* Monthly Summary Bar (Mirrors Management) */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="mb-10">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <motion.div
                        whileHover={{ scale: 1.03, y: -3 }}
                        whileTap={{ scale: 0.97 }}
                        onClick={() => navigate('/admin/calendar')}
                        className={`bg-emerald-50 border rounded-2xl p-5 flex items-center gap-4 cursor-pointer hover:border-emerald-300 hover:shadow-md hover:shadow-emerald-100 transition-all font-sans ${currentDayStatus.type === 'workingDays' ? 'border-blue-500 ring-2 ring-blue-100' : 'border-emerald-100'}`}
                    >
                        <div className="h-11 w-11 rounded-xl bg-emerald-500 text-white flex items-center justify-center shadow-sm">
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
                        onClick={() => navigate('/admin/calendar')}
                        className={`bg-rose-50 border rounded-2xl p-5 flex items-center gap-4 cursor-pointer hover:border-rose-300 hover:shadow-md hover:shadow-rose-100 transition-all font-sans ${currentDayStatus.type === 'holidays' ? 'border-blue-500 ring-2 ring-blue-100' : 'border-rose-100'}`}
                    >
                        <div className="h-11 w-11 rounded-xl bg-rose-500 text-white flex items-center justify-center shadow-sm">
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
                        onClick={() => navigate('/admin/calendar')}
                        className={`bg-amber-50 border rounded-2xl p-5 flex items-center gap-4 cursor-pointer hover:border-amber-300 hover:shadow-md hover:shadow-amber-100 transition-all font-sans ${currentDayStatus.type === 'specialEvents' ? 'border-blue-500 ring-2 ring-blue-100' : 'border-amber-100'}`}
                    >
                        <div className="h-11 w-11 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-sm">
                            <FaStar />
                        </div>
                        <div>
                            <p className="text-[9px] font-black text-amber-500 uppercase tracking-widest">Special Events</p>
                            <p className="text-2xl font-black text-amber-700 tracking-tighter">{Number(monthStats.specialEvents || 0).toFixed(1)}</p>
                        </div>
                    </motion.div>
                </div>
            </motion.div>

            {/* Filter Active Banner */}
            <AnimatePresence>
                {statusFilter && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="mb-8 flex items-center gap-3 px-5 py-3 bg-sky-50 border border-sky-200 rounded-2xl text-sm font-black text-sky-700"
                    >
                        <FaFilter className="text-sky-500" />
                        <span>Showing records for: <span className="text-sky-900 uppercase">{statusFilter}</span></span>
                        <button
                            onClick={() => setStatusFilter(null)}
                            className="ml-auto flex items-center gap-1.5 px-3 py-1 bg-white border border-sky-200 rounded-xl text-[10px] font-black text-rose-500 hover:bg-rose-50 transition-all"
                        >
                            <FaTimes size={10} /> Clear Filter
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10 mb-10">
                {roleConfigs.map((role) => (
                    <motion.div
                        key={role.key}
                        whileHover={{ y: -8, scale: 1.02 }}
                        className="modern-card p-10 bg-white/70 backdrop-blur-xl border border-white/50 group relative overflow-hidden"
                    >
                        {/* Card Header */}
                        <div className="flex justify-between items-center mb-6 relative z-10">
                            <div>
                                <h2 className="text-[11px] font-black text-gray-400 uppercase tracking-[0.3em]">{role.title}</h2>
                                <p className="text-xl font-black text-gray-800 tracking-tighter mt-1">Attendance Core</p>
                            </div>
                            <div className={`p-3 rounded-2xl bg-gradient-to-br ${role.accentClass} text-white shadow-lg`}>
                                <FaUserCheck />
                            </div>
                        </div>

                        {/* "Total" button for HOD and Staff */}
                        {role.canViewAll && (
                            <button
                                onClick={() => setEmployeeModal({ role: role.key, statusLabel: 'Total', title: `Total ${role.title}` })}
                                className="w-full mb-6 py-3 px-4 rounded-2xl bg-gray-50 border border-gray-100 text-[10px] font-black text-gray-500 uppercase tracking-widest flex items-center justify-between relative z-10 hover:bg-sky-50 transition-all hover:border-sky-200 cursor-pointer"
                            >
                                <span>Total {role.title}</span>
                                <div className="flex items-center gap-2">
                                    <span className="flex items-center gap-1 bg-emerald-50 border border-emerald-100 text-emerald-600 font-black px-2 py-1 rounded-xl text-[9px] uppercase tracking-widest">
                                        <FaUserCheck size={8} /> {stats[role.key]?.present || 0} Available
                                    </span>
                                    <span className="bg-white border border-gray-200 text-gray-800 font-black px-3 py-1 rounded-xl text-sm transition-all">
                                        {role.totalCount}
                                    </span>
                                </div>
                            </button>
                        )}

                        {/* Attendance Stats */}
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
                                <button
                                    key={stat.label}
                                    onClick={() => setEmployeeModal({ role: role.key, statusLabel: stat.label, title: `${stat.label} - ${role.title}` })}
                                    className="w-full flex items-center justify-between p-3 rounded-2xl bg-gray-50/50 hover:bg-white transition-all border border-transparent hover:border-gray-100 group/item cursor-pointer"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={`h-9 w-9 rounded-xl ${stat.bg} ${stat.color} flex items-center justify-center text-sm shadow-sm transition-transform group-hover/item:rotate-12`}>
                                            {stat.icon}
                                        </div>
                                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{stat.label}</span>
                                    </div>
                                    <span className="text-lg font-black text-gray-800 tracking-tighter">{stat.value || 0}</span>
                                </button>
                            ))}
                        </div>

                        {/* Background Decor */}
                        <div className="absolute -bottom-10 -right-10 w-32 h-32 bg-gray-50 rounded-full blur-3xl opacity-50" />
                    </motion.div>
                ))}
            </div>


            {/* Quick Access Menu Grid Removed */}

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
                                        const rolePrefix = user?.role === 'admin' ? 'admin' :
                                            user?.role === 'principal' ? 'principal' :
                                                user?.role === 'hod' ? 'hod' : 'staff';
                                        navigate(`/${rolePrefix}/profile/${b.emp_id}`);
                                        window.dispatchEvent(new CustomEvent('closeSidebar'));
                                    }}
                                    className="flex items-center space-x-5 bg-white/10 backdrop-blur-md p-5 rounded-[28px] border border-white/20 hover:bg-white/25 transition-all cursor-pointer group shadow-lg shadow-black/5"
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


            {/* Employee List Full Screen */}
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
                            {/* Full Screen Header */}
                            <div className="px-6 md:px-10 py-5 border-b border-gray-100 bg-gradient-to-r from-sky-50 to-blue-50 flex items-center justify-between flex-shrink-0">
                                <div className="flex items-center gap-4">
                                    <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-sky-500 to-sky-700 flex items-center justify-center text-white shadow-lg">
                                        <FaUserCheck size={20} />
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{employeeModal.title}</p>
                                        <p className="text-xl font-black text-gray-800 tracking-tight">{employeeModal.statusLabel}</p>
                                    </div>
                                    <span className="ml-2 bg-sky-100 text-sky-700 px-4 py-1.5 rounded-xl text-xs font-black">{filtered.length} Employees</span>
                                </div>
                                <button onClick={() => setEmployeeModal(null)} className="p-3 rounded-2xl bg-white hover:bg-rose-50 text-gray-400 hover:text-rose-500 transition-all border border-gray-200 shadow-sm">
                                    <FaTimes size={18} />
                                </button>
                            </div>
                            {/* Full Screen Table */}
                            <div className="flex-1 overflow-auto px-6 md:px-10 py-6">
                                {filtered.length === 0 ? (
                                    <div className="flex items-center justify-center h-full">
                                        <p className="text-gray-400 text-lg font-bold">No employees found</p>
                                    </div>
                                ) : (
                                    <div className="overflow-x-auto">
                                        <table className="min-w-[700px] w-full text-left">
                                            <thead className="sticky top-0 z-10">
                                                <tr className="bg-gray-50">
                                                    <th className="px-5 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest whitespace-nowrap">#</th>
                                                    <th className="px-5 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest whitespace-nowrap">Emp ID</th>
                                                    <th className="px-5 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest whitespace-nowrap">Name</th>
                                                    <th className="px-5 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest whitespace-nowrap">Department</th>
                                                    <th className="px-5 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest whitespace-nowrap">Status</th>
                                                    <th className="px-5 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right whitespace-nowrap">Remarks</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-50">
                                                {filtered.map((emp, idx) => (
                                                    <motion.tr
                                                        key={emp.id || emp.emp_id}
                                                        initial={{ opacity: 0, y: 5 }}
                                                        animate={{ opacity: 1, y: 0 }}
                                                        transition={{ delay: idx * 0.02 }}
                                                        className="hover:bg-sky-50/50 transition-colors cursor-pointer"
                                                        onClick={() => { navigate(`/admin/timetable/${emp.emp_id}`); setEmployeeModal(null); window.dispatchEvent(new CustomEvent('closeSidebar')); }}
                                                    >
                                                        <td className="px-5 py-4 text-sm font-black text-gray-400 whitespace-nowrap">{idx + 1}</td>
                                                        <td className="px-5 py-4 text-sm font-black text-sky-900 whitespace-nowrap">{emp.emp_id}</td>
                                                        <td className="px-5 py-4 whitespace-nowrap">
                                                            <div className="flex items-center gap-3">
                                                                <img src={emp.profile_pic || `https://ui-avatars.com/api/?name=${encodeURIComponent(emp.name || '?')}&size=80&background=0ea5e9&color=fff&bold=true`} alt="" className="h-9 w-9 rounded-xl object-cover shrink-0" />
                                                                <span className="text-sm font-bold text-gray-800">{emp.name}</span>
                                                            </div>
                                                        </td>
                                                        <td className="px-5 py-4 text-sm font-medium text-gray-600 whitespace-nowrap">{emp.department_name || '—'}</td>
                                                        <td className="px-5 py-4 whitespace-nowrap">
                                                            <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${(attendanceMap[emp.emp_id]?.remarks || '').includes('Late Entry') ? 'bg-orange-50 text-orange-600 border-orange-100' :
                                                                    attendanceMap[emp.emp_id]?.status?.startsWith('Present') ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                                                                        'bg-sky-50 text-sky-600 border-sky-100'
                                                                }`}>
                                                                {(attendanceMap[emp.emp_id]?.remarks || '').includes('Late Entry') || (attendanceMap[emp.emp_id]?.status || '').includes('Late Entry') ? (
                                                                    <span>{attendanceMap[emp.emp_id]?.status === 'Present' ? 'LE' : `${attendanceMap[emp.emp_id]?.status} (LE)`}</span>
                                                                ) : attendanceMap[emp.emp_id]?.status?.startsWith('Present +')
                                                                    ? `P / ${attendanceMap[emp.emp_id].status.replace('Present +', '').trim()}`
                                                                    : (attendanceMap[emp.emp_id]?.status || (isNonWorkingDay ? 'N/A' : 'ABSENT'))}
                                                                {attendanceMap[emp.emp_id]?.status?.startsWith('Present') === false && attendanceMap[emp.emp_id]?.status !== 'Absent' && attendanceMap[emp.emp_id]?.in_time && attendanceMap[emp.emp_id]?.out_time && (
                                                                    <> ({formatTo12Hr(attendanceMap[emp.emp_id].in_time)} - {formatTo12Hr(attendanceMap[emp.emp_id].out_time)})</>
                                                                )}
                                                            </span>
                                                        </td>
                                                        <td className="px-5 py-4 text-right">
                                                            <p className="text-[10px] font-bold text-gray-500 italic truncate max-w-[150px] ml-auto" title={attendanceMap[emp.emp_id]?.remarks}>
                                                                {attendanceMap[emp.emp_id]?.remarks || '—'}
                                                            </p>
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
                        <div className="px-6 md:px-10 py-5 border-b border-gray-100 bg-gradient-to-r from-sky-50 to-blue-50 flex items-center justify-between flex-shrink-0">
                            <div className="flex items-center gap-4">
                                <div className="h-12 w-12 rounded-2xl bg-sky-600 flex items-center justify-center text-white shadow-lg">
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

export default AdminDashboard;
