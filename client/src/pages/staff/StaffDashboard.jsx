import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import Layout from '../../components/Layout';
import api from '../../utils/api';
import { useAuth } from '@/context/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import { useSocket } from '@/context/SocketContext';
import { FaUserCheck, FaUserTimes, FaBus, FaFileAlt, FaCalendarDay, FaCalendarAlt, FaStar, FaBriefcase, FaTimes, FaFilter, FaClock, FaBookOpen, FaDoorOpen, FaChalkboardTeacher } from 'react-icons/fa';
import AttendanceHistory from '@/components/AttendanceHistory';
import PersonalAttendanceChart from '@/components/PersonalAttendanceChart';
import { useTimetableConfig } from '@/hooks/useTimetableConfig';
import { formatTo12Hr } from '@/utils/timeFormatter';
import { getCurrentDayStatus } from '@/utils/currentDayStatus';

const StaffDashboard = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const socket = useSocket();
    const [myStats, setMyStats] = useState({ present: 0, absent: 0, od: 0, cl: 0, ml: 0, comp_leave: 0, lop: 0, late_entry: 0 });
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);
    const [monthStats, setMonthStats] = useState({ workingDays: 0, holidays: 0, specialEvents: 0 });
    const [currentDayStatus, setCurrentDayStatus] = useState({ type: 'workingDays', detail: 'Regular working day' });
    const [todayTimetable, setTodayTimetable] = useState([]);
    const { getPeriodConfig } = useTimetableConfig();
    const [statusFilter, setStatusFilter] = useState(null); // null = show all
    const historyRef = useRef(null);

    const fetchData = useCallback(async () => {
        if (!user) return;
        try {
            const { data: profileData } = await api.get('/auth/profile');
            setProfile(profileData);
            const date = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
            const month = date.slice(0, 7);
            const { data: records } = await api.get(`/attendance?month=${month}&emp_id=${user.emp_id}`);

            // Fetch holiday/calendar data for month summary
            const now = new Date();
            const curMonth = now.getMonth() + 1;
            const curYear = now.getFullYear();
            const { data: holidayData } = await api.get(`holidays?month=${curMonth}&year=${curYear}`);
            setCurrentDayStatus(getCurrentDayStatus({ today: date, holidayData }));
            const daysInMonth = new Date(curYear, curMonth, 0).getDate();
            
            const holidayDateSet = new Set();
            (holidayData || []).forEach(h => { holidayDateSet.add(h.h_date); });
            
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
                // Skip absent on holidays/weekends
                if (s.includes('ABSENT') && !isNonWorking) counts.absent++;
                if (s.includes('OD') || rem.includes('OD') || rem.includes('ON DUTY')) counts.od++;
                if ((s.includes('CL') || rem.includes('CL') || rem.includes('CASUAL')) && !s.includes('COMP') && !rem.includes('COMP')) counts.cl++;
                if (s.includes('ML') || rem.includes('ML') || rem.includes('MEDICAL')) counts.ml++;
                if (s.includes('COMP LEAVE') || rem.includes('COMP LEAVE') || rem.includes('COMPENSATORY')) counts.comp_leave++;
                if (s.includes('LOP') || rem.includes('LOP') || rem.includes('LOSS OF PAY')) counts.lop++;
                if (rem.includes('LATE ENTRY') || s.includes('LATE ENTRY')) counts.late_entry++;
            });
            setMyStats(counts);

            let hCount = 0, sCount = 0;
            (holidayData || []).forEach(h => {
                if (h.type === 'Holiday') hCount++;
                else if (h.type === 'Special') sCount++;
            });
            for (let d = 1; d <= daysInMonth; d++) {
                const dow = new Date(curYear, curMonth - 1, d).getDay();
                const ds = `${curYear}-${String(curMonth).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
                if ((dow === 0 || dow === 6) && !holidayDateSet.has(ds)) hCount++;
            }
            setMonthStats({ workingDays: daysInMonth - hCount - sCount, holidays: hCount, specialEvents: sCount });

            // Fetch today's timetable
            const { data: ttData } = await api.get('/timetable');
            const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
            const today = dayNames[new Date().getDay()];
            const entries = (ttData || [])
                .filter(t => t.day_of_week === today)
                .sort((a, b) => (a.period_number - b.period_number));

            const { data: leaveRows } = await api.get('/leaves');
            const replacementRows = (leaveRows || []).filter((l) => {
                const from = String(l.from_date || '').slice(0, 10);
                const to = String(l.to_date || '').slice(0, 10);
                return l.my_approver_type === 'replacement'
                    && l.my_approval_status === 'Approved'
                    && from && to
                    && from <= date
                    && to >= date;
            });

            const replacementPeriods = [];
            replacementRows.forEach((row) => {
                const periodText = String(row.approval_notes || '').replace(/^Periods:\s*/i, '').trim();
                periodText.split(',').forEach((chunk) => {
                    const periodNo = Number(String(chunk).replace(/[^0-9]/g, ''));
                    if (!Number.isFinite(periodNo) || periodNo <= 0) return;
                    replacementPeriods.push({
                        period_number: periodNo,
                        subject: `Replacement - ${row.applicant_name || row.emp_id}`,
                        subject_code: 'REPL',
                        room_number: '',
                        start_time: getPeriodConfig(periodNo)?.start_time || null,
                        end_time: getPeriodConfig(periodNo)?.end_time || null
                    });
                });
            });

            const combined = [...entries, ...replacementPeriods].sort((a, b) => (a.period_number - b.period_number));
            setTodayTimetable(combined);
        } catch (error) {
            console.error('Staff dashboard error', error);
        } finally {
            setLoading(false);
        }
    }, [user]);

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 60000);
        return () => clearInterval(interval);
    }, [fetchData]);

    useEffect(() => {
        if (!socket) return;
        socket.on('attendance_updated', fetchData);
        return () => socket.off('attendance_updated', fetchData);
    }, [socket, fetchData]);

    const handleStatClick = (filter) => {
        setStatusFilter(prev => prev === filter ? null : filter);
        // Smooth scroll to history section
        setTimeout(() => {
            historyRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
    };

    useEffect(() => {
        const handleHash = () => {
            if (location.hash === '#personal-attendance') {
                document.getElementById('personal-attendance-section')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            } else if (location.hash === '#attendance-history') {
                historyRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        };
        handleHash();
        window.addEventListener('hashchange', handleHash);
        return () => window.removeEventListener('hashchange', handleHash);
    }, [location.hash]);

    const stats = [
        { label: 'Present', value: myStats.present, filterKey: 'Present', icon: <FaUserCheck />, colorClass: 'text-sky-600', bgClass: 'bg-sky-50', borderClass: 'border-sky-100', gradientClass: 'from-sky-500 to-sky-700' },
        { label: 'Absent', value: myStats.absent, filterKey: 'Absent', icon: <FaUserTimes />, colorClass: 'text-rose-600', bgClass: 'bg-rose-50', borderClass: 'border-rose-100', gradientClass: 'from-rose-500 to-rose-700' },
        { label: 'Loss Of Pay', value: myStats.lop, filterKey: 'LOP', icon: <FaTimes />, colorClass: 'text-rose-800', bgClass: 'bg-rose-100', borderClass: 'border-rose-200', gradientClass: 'from-rose-600 to-rose-800' },
        { label: 'On Duty', value: myStats.od, filterKey: 'OD', icon: <FaBriefcase />, colorClass: 'text-emerald-600', bgClass: 'bg-emerald-50', borderClass: 'border-emerald-100', gradientClass: 'from-emerald-500 to-emerald-700' },
        { label: 'Casual Leave', value: myStats.cl, filterKey: 'CL', icon: <FaCalendarDay />, colorClass: 'text-amber-600', bgClass: 'bg-amber-50', borderClass: 'border-amber-100', gradientClass: 'from-amber-500 to-amber-700' },
        { label: 'Medical Leave', value: myStats.ml, filterKey: 'ML', icon: <FaFileAlt />, colorClass: 'text-purple-600', bgClass: 'bg-purple-50', borderClass: 'border-purple-100', gradientClass: 'from-purple-500 to-purple-700' },
        { label: 'Comp Leave', value: myStats.comp_leave, filterKey: 'Comp Leave', icon: <FaStar />, colorClass: 'text-indigo-600', bgClass: 'bg-indigo-50', borderClass: 'border-indigo-100', gradientClass: 'from-indigo-500 to-indigo-700' },
        { label: 'Late Entry', value: myStats.late_entry, filterKey: 'Late Entry', icon: <FaClock />, colorClass: 'text-orange-600', bgClass: 'bg-orange-50', borderClass: 'border-orange-100', gradientClass: 'from-orange-500 to-orange-700' },
    ];

    const currentMonth = new Date().toLocaleString('default', { month: 'long', year: 'numeric' });

    return (
        <Layout>
            {/* Header */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-10">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                        <h1 className="text-4xl font-black text-gray-800 tracking-tighter">
                            My <span className="text-[#4A90E2]">Dashboard</span>
                        </h1>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em] mt-2">
                            {currentMonth} · Personal Attendance Record
                        </p>
                    </div>
                </div>
            </motion.div>

            {/* Today's Timetable Section */}
            <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }} className="mb-10">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <div className="h-2 w-2 bg-sky-500 rounded-full animate-pulse" />
                        <h2 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Today's Schedule</h2>
                    </div>
                    <button 
                        onClick={() => navigate('/staff/timetables')}
                        className="text-[9px] font-black text-sky-600 uppercase tracking-widest hover:underline"
                    >
                        View Full Timetable
                    </button>
                </div>

                <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide -mx-2 px-2">
                    {todayTimetable.length > 0 ? (
                        todayTimetable.map((period, idx) => (
                            <motion.div
                                key={idx}
                                whileHover={{ y: -5 }}
                                className="min-w-[240px] bg-white border border-gray-100 rounded-[24px] p-5 shadow-sm hover:shadow-xl hover:shadow-sky-500/5 transition-all relative overflow-hidden group"
                            >
                                <div className="absolute top-0 right-0 p-3">
                                    <span className="text-[9px] font-black text-sky-500/20 uppercase tracking-widest group-hover:text-sky-500/40 transition-colors">
                                        P{period.period_number}
                                    </span>
                                </div>
                                <div className="flex flex-col h-full">
                                    <div className="flex items-center gap-2 mb-3">
                                        <div className="h-8 w-8 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center">
                                            <FaBookOpen size={12} />
                                        </div>
                                        <div className="overflow-hidden">
                                            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest truncate">{period.subject_code || 'SUBJECT'}</p>
                                            <h3 className="text-sm font-black text-gray-800 truncate tracking-tight">{period.subject}</h3>
                                        </div>
                                    </div>
                                    
                                    <div className="mt-auto space-y-2">
                                        <div className="flex items-center gap-2 text-[10px] font-bold text-gray-500">
                                            <FaClock className="text-sky-400" size={10} />
                                            <span>
                                                {formatTo12Hr(getPeriodConfig(period.period_number)?.start_time || period.start_time)} – {formatTo12Hr(getPeriodConfig(period.period_number)?.end_time || period.end_time)}
                                            </span>
                                        </div>
                                        {period.room_number && (
                                            <div className="flex items-center gap-2 text-[10px] font-bold text-sky-600 bg-sky-50/50 w-fit px-2 py-0.5 rounded-lg">
                                                <FaDoorOpen size={10} />
                                                <span className="uppercase tracking-widest">Room: {period.room_number}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </motion.div>
                        ))
                    ) : (
                        <div className="w-full bg-gray-50/50 border border-dashed border-gray-200 rounded-[32px] p-8 flex flex-col items-center justify-center text-center">
                            <div className="h-12 w-12 rounded-2xl bg-white border border-gray-100 flex items-center justify-center text-gray-300 mb-3 shadow-sm">
                                <FaChalkboardTeacher size={20} />
                            </div>
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">No classes scheduled for today</p>
                            <p className="text-[9px] text-gray-300 font-bold mt-1 uppercase tracking-wider">Enjoy your free time!</p>
                        </div>
                    )}
                </div>
            </motion.div>

            {/* Monthly Summary Bar */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="mb-10 lg:hidden">
                <div className="grid grid-cols-3 gap-4">
                    <motion.div
                        whileHover={{ scale: 1.03, y: -3 }}
                        whileTap={{ scale: 0.97 }}
                        onClick={() => navigate('/staff/calendar')}
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
                        onClick={() => navigate('/staff/calendar')}
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
                        onClick={() => navigate('/staff/calendar')}
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


            {loading ? (
                <div className="flex flex-col items-center justify-center py-32 gap-4">
                    <div className="h-12 w-12 border-4 border-sky-100 border-t-sky-600 rounded-full animate-spin" />
                    <p className="text-[10px] font-black text-sky-500 uppercase tracking-widest">Loading attendance...</p>
                </div>
            ) : (
                <>
                    {/* Personal Attendance Section */}
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-16">
                        <div id="personal-attendance-section" className="flex items-center gap-4 mb-8">
                            <div className="h-1 w-12 bg-sky-600 rounded-full"></div>
                            <h2 className="text-xl font-black text-gray-800 tracking-tight uppercase tracking-[0.1em]">Your Personal Attendance</h2>
                        </div>
                        
                        <PersonalAttendanceChart 
                            stats={myStats} 
                            onStatClick={handleStatClick} 
                            activeFilter={statusFilter} 
                            monthStats={monthStats}
                            currentDayStatus={currentDayStatus}
                            onMonthStatsClick={() => navigate('/staff/calendar')}
                        />
                    </motion.div>

                    {/* Filter Active Banner */}
                    <AnimatePresence>
                        {statusFilter && (
                            <motion.div
                                initial={{ opacity: 0, y: -10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                className="mb-6 flex items-center gap-3 px-5 py-3 bg-sky-50 border border-sky-200 rounded-2xl text-sm font-black text-sky-700"
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
                </>
            )}

            {/* Attendance History Section */}
            <div ref={historyRef}>
                <AttendanceHistory empId={user?.emp_id} statusFilter={statusFilter} />
            </div>
        </Layout>
    );
};

export default StaffDashboard;

