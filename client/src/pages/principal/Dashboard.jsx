import { useState, useEffect, useRef } from 'react';
import { FaUserCheck, FaUserTimes, FaBus, FaFileAlt, FaBirthdayCake, FaCalendarDay, FaTimes, FaIdBadge, FaPhone, FaEnvelope, FaBuilding, FaArrowLeft, FaSuitcase, FaCalendarAlt, FaArrowRight, FaClipboardList, FaComments, FaShoppingBag, FaShoppingCart, FaStar, FaBriefcase, FaEye, FaFilter, FaClock, FaHistory } from 'react-icons/fa';
import Layout from '../../components/Layout';
import api from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import AttendanceHistory from '../../components/AttendanceHistory';
import MonthlyDetailsModal from '../../components/MonthlyDetailsModal';
import PersonalAttendanceChart from '../../components/PersonalAttendanceChart';
import { formatTo12Hr } from '../../utils/timeFormatter.js';
import { getCurrentDayStatus } from '../../utils/currentDayStatus';

// ── Small helper components ─────────────────────────────────────────────────
// InfoCard removed ... (it was already redundant or small)
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

const Dashboard = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [stats, setStats] = useState({
        present: 0, absent: 0, od: 0, cl: 0, ml: 0, comp_leave: 0, lop: 0, late_entry: 0,
        principal: { present: 0, absent: 0, od: 0, cl: 0, ml: 0, comp_leave: 0, lop: 0, late_entry: 0 },
        hod: { present: 0, absent: 0, od: 0, cl: 0, ml: 0, comp_leave: 0, lop: 0, late_entry: 0 },
        staff: { present: 0, absent: 0, od: 0, cl: 0, ml: 0, comp_leave: 0, lop: 0, late_entry: 0 }
    });
    const [myStats, setMyStats] = useState({ present: 0, absent: 0, od: 0, cl: 0, ml: 0, comp_leave: 0, lop: 0, late_entry: 0 });
    const [birthdays, setBirthdays] = useState([]);
    const [allEmployees, setAllEmployees] = useState([]);
    const [attendanceMap, setAttendanceMap] = useState({});
    const [detailedRecords, setDetailedRecords] = useState([]);
    const [monthStats, setMonthStats] = useState({ workingDays: 0, holidays: 0, specialEvents: 0 });
    const [workingDaysList, setWorkingDaysList] = useState([]);
    const [holidaysList, setHolidaysList] = useState([]);
    const [specialEventsList, setSpecialEventsList] = useState([]);
    const [currentDayStatus, setCurrentDayStatus] = useState({ type: 'workingDays', detail: 'Regular working day' });
    const [monthModal, setMonthModal] = useState({ open: false, title: '', items: [] });
    const [employeeModal, setEmployeeModal] = useState(null);
    const [selectedEmployeeHistory, setSelectedEmployeeHistory] = useState(null); // { emp_id, name }
    const [statusFilter, setStatusFilter] = useState(null);
    const [isNonWorkingDay, setIsNonWorkingDay] = useState(false);
    const historyRef = useRef(null);
    const socket = useSocket();

    const fetchDashboardData = async () => {
        try {
            const date = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
            const { data: summary } = await api.get(`/attendance/summary?date=${date}`);
            const { data: bdays } = await api.get('/employees/birthdays/today');
            setBirthdays(bdays);
            const { data: emps } = await api.get('/employees');
            setAllEmployees(emps);
            const month = date.slice(0, 7);

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

            const { data: records } = await api.get(`/attendance?month=${month}&emp_id=${user?.emp_id}`);
            setDetailedRecords(records || []);
            const counts = { present: 0, absent: 0, od: 0, cl: 0, ml: 0, comp_leave: 0, lop: 0, late_entry: 0 };
            (records || []).forEach(r => {
                const s = (r.status || '').toUpperCase();
                const rem = (r.remarks || '').toUpperCase();
                const recordDate = String(r.date).slice(0, 10);
                const isHoliday = holidayDateSet.has(recordDate);
                const dow = new Date(recordDate).getDay();
                const isWeekend = dow === 0 || dow === 6;
                const isNonWorking = isHoliday || isWeekend;

                if (s.includes('PRESENT')) counts.present++;
                if (s.includes('ABSENT') && !isNonWorking) counts.absent++;
                if (s.includes('OD') || rem.includes('OD')) counts.od++;
                if ((s.includes('CL') || rem.includes('CL') || rem.includes('CASUAL')) && !s.includes('COMP') && !rem.includes('COMP')) counts.cl++;
                if (s.includes('ML') || rem.includes('ML') || rem.includes('MEDICAL')) counts.ml++;
                if (s.includes('COMP LEAVE') || rem.includes('COMP LEAVE')) counts.comp_leave++;
                if (s.includes('LOP') || rem.includes('LOP')) counts.lop++;
                if (rem.includes('LATE ENTRY')) counts.late_entry++;
            });
            setMyStats(counts);
            // Build today's attendance map
            const { data: todayAtt } = await api.get(`/attendance?date=${date}`);
            const map = {};
            (todayAtt || []).forEach(r => { map[r.emp_id] = r; });
            setAttendanceMap(map);
            // Aggregate per-user rows into role-based stats
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
                const l = Number(r.total_leave) || 0;
                const o = Number(r.total_od) || 0;
                const lp = Number(r.total_lop) || 0;
                const late = Number(r.total_late) || 0;
                bucket.present += p;
                bucket.od += o;
                bucket.lop += lp;
                bucket.late_entry += late;
                
                // Only count as absent if it's a working day
                if (!isTodayNonWorking && p === 0 && l === 0 && o === 0 && lp === 0) {
                    bucket.absent += 1;
                    agg.absent += 1;
                }
                
                agg.present += p;
                agg.od += o;
                agg.lop += lp;
                agg.late_entry += late;
            });
            // Count individual leave types from attendance map
            (emps || []).forEach(emp => {
                const rec = map[emp.emp_id] || {};
                const s = (rec.status || '').toUpperCase();
                const rem = (rec.remarks || '').toUpperCase();
                const role = (emp.role || '').toLowerCase();
                const bucket = agg[role] || agg.staff;
                if ((s.includes('CL') || rem.includes('CL') || rem.includes('CASUAL')) && !s.includes('COMP') && !rem.includes('COMP')) { bucket.cl++; agg.cl++; }
                if (s.includes('ML') || rem.includes('ML') || rem.includes('MEDICAL')) { bucket.ml++; agg.ml++; }
                if (s.includes('COMP LEAVE') || rem.includes('COMP LEAVE')) { bucket.comp_leave++; agg.comp_leave++; }
            });
            setStats(agg);
            const daysInMonth = new Date(curYear, curMonth, 0).getDate();
            let hCount = 0, sCount = 0;
            const holidaysArr = [];
            const specialArr = [];
            (holidayData || []).forEach(h => {
                const item = { date: h.h_date, title: h.title || h.name || 'Holiday', desc: h.note || h.type || '' };
                if (h.type === 'Holiday') { hCount++; holidaysArr.push(item); }
                else if (h.type === 'Special') { sCount++; specialArr.push(item); }
            });

            const workingArr = [];
            for (let d = 1; d <= daysInMonth; d++) {
                const dow = new Date(curYear, curMonth - 1, d).getDay();
                const ds = `${curYear}-${String(curMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                if ((dow === 0 || dow === 6) && !holidayDateSet.has(ds)) {
                    hCount++;
                    // treat as holiday/weekend
                } else if (!holidayDateSet.has(ds)) {
                    // working day
                    workingArr.push({ date: ds, title: `Working Day`, desc: '' });
                }
            }

            setHolidaysList(holidaysArr);
            setSpecialEventsList(specialArr);
            setWorkingDaysList(workingArr);
            setMonthStats({ workingDays: workingArr.length, holidays: hCount, specialEvents: sCount });
        } catch (error) { console.error("Error fetching dashboard data", error); }
    };

    useEffect(() => {
        fetchDashboardData();
        const interval = setInterval(fetchDashboardData, 60000);
        return () => clearInterval(interval);
    }, []);

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

    const getFilteredEmployees = (roleKey, statusLabel) => {
        const roleEmps = allEmployees.filter(e => (e.role || '').toLowerCase() === roleKey);
        return roleEmps.filter(emp => {
            const rec = attendanceMap[emp.emp_id] || {};
            const s = (rec.status || '').toUpperCase();
            const rem = (rec.remarks || '').toUpperCase();
            if (statusLabel === 'Present') return s.includes('PRESENT');
            if (statusLabel === 'Absent') {
                if (isNonWorkingDay) return false;
                return !s || (s.includes('ABSENT') && !s.includes('LOP'));
            }
            if (statusLabel === 'On Duty') return s === 'OD' || rem.includes('OD') || rem.includes('ON DUTY');
            if (statusLabel === 'Casual Leave') return (s.includes('CL') || rem.includes('CL') || rem.includes('CASUAL')) && !s.includes('COMP') && !rem.includes('COMP');
            if (statusLabel === 'Medical Leave') return s === 'ML' || rem.includes('ML') || rem.includes('MEDICAL');
            if (statusLabel === 'Comp Leave') return s === 'COMP LEAVE' || rem.includes('COMP LEAVE');
            if (statusLabel === 'Loss Of Pay') return s === 'LOP' || rem.includes('LOP') || rem.includes('LOSS OF PAY');
            if (statusLabel === 'Late Entry') return rem.includes('LATE ENTRY');
            return false;
        });
    };

    const handleStatClick = (filterKey) => {
        if (statusFilter === filterKey) {
            setStatusFilter(null);
        } else {
            setStatusFilter(filterKey);
            if (historyRef.current) {
                historyRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }
    };

    const menuItems = [];

    const menuColorStyles = {
        blue: { bg: 'bg-sky-50', text: 'text-sky-600', border: 'border-sky-100', accent: 'bg-sky-500' },
        amber: { bg: 'bg-amber-50', text: 'text-amber-600', border: 'border-amber-100', accent: 'bg-amber-500' },
        indigo: { bg: 'bg-indigo-50', text: 'text-indigo-600', border: 'border-indigo-100', accent: 'bg-indigo-500' },
        emerald: { bg: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-100', accent: 'bg-emerald-500' },
        purple: { bg: 'bg-purple-50', text: 'text-purple-600', border: 'border-purple-100', accent: 'bg-purple-500' },
        pink: { bg: 'bg-pink-50', text: 'text-pink-600', border: 'border-pink-100', accent: 'bg-pink-500' }
    };

    // const navigate = (path) => window.location.href = path; // Removed to avoid collision with useNavigate hook

    return (
        <Layout>
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-10"
            >
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                        <h1 className="text-4xl font-black text-gray-800 tracking-tighter">
                            Portal <span className="text-[#4A90E2]">Dashboard</span>
                        </h1>
                    </div>
                    <div className="flex items-center gap-4">
                        {birthdays.length > 0 && (
                            <motion.div
                                whileHover={{ scale: 1.05 }}
                                className="bg-gradient-to-tr from-[#FF9A9E] to-[#FAD0C4] p-[1px] rounded-3xl shadow-2xl shadow-rose-200/50"
                            >
                                <div className="bg-white/90 backdrop-blur-md px-6 py-3 rounded-[23px] flex items-center gap-4">
                                    <div className="h-8 w-8 rounded-full bg-rose-50 flex items-center justify-center">
                                        <FaBirthdayCake className="text-rose-500 animate-bounce" />
                                    </div>
                                    <span className="text-[10px] font-black text-rose-600 uppercase tracking-widest">
                                        {birthdays.length} Personnel Birthdays Today!
                                    </span>
                                </div>
                            </motion.div>
                        )}
                    </div>
                </div>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="mb-10 lg:hidden">
                <div className="grid grid-cols-3 gap-4">
                    <motion.div
                        whileHover={{ scale: 1.03, y: -3 }}
                        whileTap={{ scale: 0.97 }}
                        onClick={() => navigate('/principal/calendar')}
                        className={`bg-emerald-50 border rounded-2xl p-5 flex items-center gap-4 cursor-pointer hover:border-emerald-300 hover:shadow-md hover:shadow-emerald-100 transition-all ${currentDayStatus.type === 'workingDays' ? 'border-blue-500 ring-2 ring-blue-100' : 'border-emerald-100'}`}
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
                        onClick={() => navigate('/principal/calendar')}
                        className={`bg-rose-50 border rounded-2xl p-5 flex items-center gap-4 cursor-pointer hover:border-rose-300 hover:shadow-md hover:shadow-rose-100 transition-all ${currentDayStatus.type === 'holidays' ? 'border-blue-500 ring-2 ring-blue-100' : 'border-rose-100'}`}
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
                        onClick={() => navigate('/principal/calendar')}
                        className={`bg-amber-50 border rounded-2xl p-5 flex items-center gap-4 cursor-pointer hover:border-amber-300 hover:shadow-md hover:shadow-amber-100 transition-all ${currentDayStatus.type === 'specialEvents' ? 'border-blue-500 ring-2 ring-blue-100' : 'border-amber-100'}`}
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

            {/* Monthly details modal */}
            <MonthlyDetailsModal
                isOpen={monthModal.open}
                onClose={() => setMonthModal({ open: false, title: '', items: [] })}
                title={monthModal.title}
                items={monthModal.items}
            />

            {/* Personal Attendance Section */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-16"
            >
                <div className="flex items-center gap-4 mb-8">
                    <div className="h-1 w-12 bg-sky-600 rounded-full"></div>
                    <h2 className="text-xl font-black text-gray-800 tracking-tight uppercase tracking-[0.1em]">Your Personal Attendance</h2>
                </div>
                
                <PersonalAttendanceChart 
                    stats={myStats} 
                    onStatClick={handleStatClick} 
                    activeFilter={statusFilter} 
                    monthStats={monthStats}
                    currentDayStatus={currentDayStatus}
                    onMonthStatsClick={() => navigate('/principal/calendar')}
                />
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

            {/* Stats Grid - Role Breakdown */}
            <div id="attendance-cores" className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
                {[
                    { key: 'hod', title: 'HODs', color: 'amber' },
                    { key: 'staff', title: 'Staff', color: 'purple' }
                ].map((role) => (
                    <motion.div
                        key={role.key}
                        whileHover={{ y: -8, scale: 1.02 }}
                        className="modern-card p-10 bg-white/70 backdrop-blur-xl border border-white/50 group relative overflow-hidden"
                    >
                        <div className="flex justify-between items-center mb-8 relative z-10">
                            <div>
                                <h2 className="text-[11px] font-black text-gray-400 uppercase tracking-[0.3em]">{role.title}</h2>
                                <p className="text-xl font-black text-gray-800 tracking-tighter mt-1">Attendance Core</p>
                            </div>
                            <div className={`p-4 rounded-2xl ${role.color === 'amber' ? 'bg-amber-500' : 'bg-purple-600'} text-white shadow-lg`}>
                                <FaUserCheck />
                            </div>
                        </div>

                        {/* Total Count Button */}
                        <button
                            onClick={() => {
                                navigate(`/principal/personnel/${role.key === 'hod' ? 'hod' : 'staff'}`);
                                window.dispatchEvent(new CustomEvent('closeSidebar'));
                            }}
                            className="w-full mb-6 py-3 px-5 rounded-[20px] bg-gray-50 border border-gray-100 text-[10px] font-black text-gray-500 uppercase tracking-widest hover:bg-sky-50 hover:border-sky-100 hover:text-sky-600 transition-all flex items-center justify-between group/btn relative z-10"
                        >
                            <span>Total {role.title}</span>
                            <div className="flex items-center gap-2">
                                <span className="flex items-center gap-1 bg-emerald-50 border border-emerald-100 text-emerald-600 font-black px-2 py-1 rounded-xl text-[9px] uppercase tracking-widest">
                                    <FaUserCheck size={8} /> {stats[role.key]?.present || 0} Available
                                </span>
                                <span className="bg-white border border-gray-200 text-gray-800 font-black px-3 py-1 rounded-xl text-sm group-hover/btn:bg-sky-600 group-hover/btn:text-white group-hover/btn:border-sky-600 transition-all">
                                    {role.key === 'hod' ? hodList.length : staffList.length}
                                </span>
                            </div>
                        </button>

                        <div className="space-y-6 relative z-10">
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
                                    className="flex items-center justify-between p-4 rounded-2xl bg-gray-50/50 hover:bg-white transition-all border border-transparent hover:border-gray-100 group/item cursor-pointer"
                                >
                                    <div className="flex items-center gap-4">
                                        <div className={`h-10 w-10 rounded-xl ${stat.bg} ${stat.color} flex items-center justify-center text-sm shadow-sm transition-transform group-hover/item:rotate-12`}>
                                            {stat.icon}
                                        </div>
                                        <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">{stat.label}</span>
                                    </div>
                                    <span className="text-lg font-black text-gray-800 tracking-tighter">{stat.value || 0}</span>
                                </div>
                            ))}
                        </div>

                        {/* Background Decor */}
                        <div className="absolute -bottom-10 -right-10 w-32 h-32 bg-gray-50 rounded-full blur-3xl opacity-50"></div>
                    </motion.div>
                ))}
            </div>

            {/* Quick Access Menu Grid Removed */}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
                {birthdays.length > 0 && (
                    <div className="bg-gradient-to-br from-[#8E9EFF] to-[#4A90E2] rounded-[40px] shadow-2xl shadow-sky-200/50 p-10 text-white relative overflow-hidden group">
                        <div className="absolute -bottom-10 -right-10 w-48 h-48 bg-white/10 rounded-full blur-3xl group-hover:scale-150 transition-transform duration-1000"></div>
                        <h2 className="text-[10px] font-black uppercase tracking-[0.2em] mb-10 flex items-center relative z-10">
                            Milestone <FaBirthdayCake className="ml-3 text-white animate-bounce" />
                        </h2>
                        <div className="space-y-4 relative z-10">
                            {birthdays.map(b => (
                                <div
                                    key={b.emp_id}
                                    onClick={() => {
                                        if (b.emp_id === user?.emp_id) {
                                            const rolePrefix = user?.role === 'admin' ? 'admin' :
                                                user?.role === 'principal' ? 'principal' :
                                                    user?.role === 'hod' ? 'hod' : 'staff';
                                            navigate(`/${rolePrefix}/profile/${b.emp_id}`);
                                            window.dispatchEvent(new CustomEvent('closeSidebar'));
                                        }
                                    }}
                                    className="flex items-center space-x-5 bg-white/10 backdrop-blur-md p-5 rounded-[24px] border border-white/10 hover:bg-white/20 transition-all cursor-pointer"
                                >
                                    <div className="h-12 w-12 rounded-[18px] bg-white flex items-center justify-center font-black text-[#4A90E2] text-xl shadow-lg overflow-hidden">
                                        <img src={b.profile_pic || `https://ui-avatars.com/api/?name=${encodeURIComponent(b.name || '?')}&size=100&background=4A90E2&color=fff&bold=true`} alt="" className="h-full w-full object-cover" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-black tracking-tight">{b.name}</p>
                                        <p className="text-[9px] font-bold text-sky-100 uppercase tracking-widest mt-0.5">Celebration Mode</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            <div ref={historyRef}>
                <AttendanceHistory empId={user?.emp_id} statusFilter={statusFilter} />
            </div>

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
                                                        onClick={() => { navigate(`/principal/timetable/${emp.emp_id}`); setEmployeeModal(null); window.dispatchEvent(new CustomEvent('closeSidebar')); }}
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
                                                            <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${
                                                                (attendanceMap[emp.emp_id]?.remarks || '').includes('Late Entry') ? 'bg-orange-50 text-orange-600 border-orange-100' :
                                                                attendanceMap[emp.emp_id]?.status?.startsWith('Present') ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 
                                                                'bg-sky-50 text-sky-600 border-sky-100'
                                                            }`}>
                                                                {(attendanceMap[emp.emp_id]?.remarks || '').includes('Late Entry') ? (
                                                                    <span>{attendanceMap[emp.emp_id]?.status === 'Present' ? 'LE' : `${attendanceMap[emp.emp_id]?.status} (LE)`}</span>
                                                                ) : attendanceMap[emp.emp_id]?.status?.startsWith('Present +') 
                                                                    ? `P / ${attendanceMap[emp.emp_id].status.replace('Present +', '').trim()}` 
                                                                    : (attendanceMap[emp.emp_id]?.status || 'N/A')}
                                                                {(attendanceMap[emp.emp_id]?.in_time && attendanceMap[emp.emp_id]?.out_time && 
                                                                  !['Present', 'Absent', 'Holiday', 'Weekend', 'LOP'].includes(attendanceMap[emp.emp_id]?.status) &&
                                                                  !String(attendanceMap[emp.emp_id]?.status).startsWith('Present')
                                                                ) && (
                                                                    <span className="ml-1 opacity-70">
                                                                        ({formatTo12Hr(attendanceMap[emp.emp_id].in_time)} - {formatTo12Hr(attendanceMap[emp.emp_id].out_time)})
                                                                    </span>
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
                        <div className="px-6 md:px-10 py-5 border-b border-gray-100 bg-gradient-to-r from-sky-50 to-blue-50 flex items-center justify-between flex-shrink-0" no-print>
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
                            <div className="max-w-5xl mx-auto pb-10">
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

export default Dashboard;
