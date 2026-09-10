import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../../components/Layout';
import api from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import { motion } from 'framer-motion';
import { 
    FaUserGraduate, FaCalendarCheck, FaBookOpen, FaFileAlt, 
    FaAward, FaCheckCircle, FaTimesCircle, FaBuilding, 
    FaClock, FaGraduationCap, FaCalendarAlt, FaCalendarDay, 
    FaStar, FaFilter, FaArrowRight
} from 'react-icons/fa';

const StudentDashboard = ({ defaultTab = 'dashboard' }) => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [profile, setProfile] = useState(null);
    const [myResults, setMyResults] = useState([]);
    const [attendance, setAttendance] = useState([]);
    const [timetable, setTimetable] = useState([]);
    const [loading, setLoading] = useState(true);
    
    // Month stats (Working Days, Holidays, Special Events)
    const [monthStats, setMonthStats] = useState({ workingDays: 0, holidays: 0, specialEvents: 0 });

    const [selectedYearTab, setSelectedYearTab] = useState('1');
    const [selectedSemTab, setSelectedSemTab] = useState('all');
    const [selectedDayTab, setSelectedDayTab] = useState('All Days');
    const [activeSectionTab, setActiveSectionTab] = useState(defaultTab); // 'dashboard', 'results', 'timetable', 'attendance'
    const [resultCategoryTab, setResultCategoryTab] = useState('internal'); // 'internal' | 'semester'

    // Attendance page filter states
    const [attFilterMode, setAttFilterMode] = useState('all'); // 'all' | 'month' | 'semester'
    const [selectedAttMonth, setSelectedAttMonth] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
    const [selectedAttSem, setSelectedAttSem] = useState('all');

    useEffect(() => {
        if (defaultTab) {
            setActiveSectionTab(defaultTab);
        }
    }, [defaultTab]);

    const fetchStudentData = useCallback(async () => {
        setLoading(true);
        try {
            const now = new Date();
            const curMonth = now.getMonth() + 1;
            const curYear = now.getFullYear();

            const [profileRes, resultsRes, attRes, ttRes, holidayRes] = await Promise.all([
                api.get('/auth/profile'),
                api.get('/results/my-results'),
                api.get(`/attendance?emp_id=${user?.emp_id}`),
                api.get('/timetable'),
                api.get(`holidays?month=${curMonth}&year=${curYear}`)
            ]);

            setProfile(profileRes.data || {});
            setMyResults(resultsRes.data || []);
            setAttendance(attRes.data || []);
            setTimetable(ttRes.data || []);

            if (profileRes.data?.academic_year) {
                setSelectedYearTab(String(profileRes.data.academic_year));
            }

            // Calculate month stats cards
            const holidayData = holidayRes.data || [];
            const daysInMonth = new Date(curYear, curMonth, 0).getDate();
            const holidayDateSet = new Set();
            holidayData.forEach(h => { holidayDateSet.add(h.h_date); });

            let hCount = 0, sCount = 0;
            holidayData.forEach(h => {
                if (h.type === 'Holiday') hCount++;
                else if (h.type === 'Special') sCount++;
            });
            for (let d = 1; d <= daysInMonth; d++) {
                const dow = new Date(curYear, curMonth - 1, d).getDay();
                const ds = `${curYear}-${String(curMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                if ((dow === 0 || dow === 6) && !holidayDateSet.has(ds)) hCount++;
            }
            setMonthStats({
                workingDays: daysInMonth - hCount - sCount,
                holidays: hCount,
                specialEvents: sCount
            });

        } catch (err) {
            console.error('Error fetching student dashboard data:', err);
        } finally {
            setLoading(false);
        }
    }, [user]);

    useEffect(() => {
        if (user) {
            fetchStudentData();
        }
    }, [user, fetchStudentData]);

    const getSemestersForYear = (year) => {
        const yr = Number(year) || 1;
        if (yr === 1) return [1, 2];
        if (yr === 2) return [3, 4];
        if (yr === 3) return [5, 6];
        if (yr === 4) return [7, 8];
        return [1, 2];
    };

    // Filter results for selected year & semester
    const yearFilteredResults = myResults.filter(r => {
        const matchYear = String(r.academic_year) === String(selectedYearTab);
        const matchSem = selectedSemTab === 'all' || String(r.semester) === String(selectedSemTab);
        return matchYear && matchSem;
    });

    // Today's weekday string
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const todayName = dayNames[new Date().getDay()];
    const todayTimetable = timetable
        .filter(t => t.day_of_week === todayName)
        .sort((a, b) => (a.period_number - b.period_number));

    // Calculate attendance percentage
    const totalAttDays = attendance.length;
    const presentDays = attendance.filter(a => (a.status || '').toUpperCase().includes('PRESENT')).length;
    const attPercentage = totalAttDays > 0 ? ((presentDays / totalAttDays) * 100).toFixed(1) : '100.0';

    // Recent 10 days attendance for dashboard
    const recentAttendance = [...attendance]
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, 10);

    // Filtered attendance for full Attendance Page
    const filteredAttendanceList = attendance.filter(att => {
        if (attFilterMode === 'month' && selectedAttMonth) {
            return String(att.date).startsWith(selectedAttMonth);
        }
        if (attFilterMode === 'semester' && selectedAttSem !== 'all') {
            const semNum = Number(selectedAttSem);
            // Rough 6-month semester breakdown or matched if record has semester info
            if (att.semester) {
                return Number(att.semester) === semNum;
            }
        }
        return true;
    }).sort((a, b) => new Date(b.date) - new Date(a.date));

    return (
        <Layout title="Student Portal">
            <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
                
                {/* Profile Header Banner */}
                <div className="bg-gradient-to-r from-sky-600 via-indigo-600 to-purple-700 rounded-3xl p-6 md:p-8 text-white shadow-xl relative overflow-hidden">
                    <div className="absolute -right-10 -bottom-10 opacity-10 text-9xl">
                        <FaUserGraduate />
                    </div>
                    <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                        <div className="flex items-center gap-4">
                            <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-white/20 backdrop-blur-md p-1 border-2 border-white/40 shadow-inner overflow-hidden shrink-0">
                                {profile?.profile_pic ? (
                                    <img src={profile.profile_pic} alt={user?.name} className="w-full h-full object-cover rounded-full" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-white text-2xl font-black">
                                        {user?.name?.charAt(0)?.toUpperCase() || 'S'}
                                    </div>
                                )}
                            </div>
                            <div>
                                <span className="inline-flex items-center gap-1.5 bg-white/20 backdrop-blur-md px-3 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider mb-1">
                                    <FaGraduationCap /> Student Portal
                                </span>
                                <h1 className="text-2xl md:text-3xl font-black tracking-tight">{user?.name}</h1>
                                <p className="text-sky-100 text-xs md:text-sm font-mono mt-0.5">
                                    Reg No: <span className="font-bold text-white">{user?.emp_id}</span> | Dept: <span className="font-bold text-white">{profile?.department_name || 'Department'}</span>
                                </p>
                            </div>
                        </div>

                        {/* Quick Stats Badges */}
                        <div className="flex items-center gap-3">
                            <div className="bg-white/10 backdrop-blur-md px-4 py-2.5 rounded-2xl border border-white/20 text-center">
                                <span className="text-[10px] uppercase font-bold text-sky-200 block">Attendance</span>
                                <span className="text-lg font-black text-white">{attPercentage}%</span>
                            </div>
                            <div className="bg-white/10 backdrop-blur-md px-4 py-2.5 rounded-2xl border border-white/20 text-center">
                                <span className="text-[10px] uppercase font-bold text-sky-200 block">Current Year</span>
                                <span className="text-lg font-black text-white">{profile?.academic_year || 1}st Year</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 3 Monthly Summary Cards: Working Days, Holidays, Special Events */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <motion.div
                        whileHover={{ scale: 1.02, y: -2 }}
                        onClick={() => navigate('/student/calendar')}
                        className="bg-emerald-50/80 border border-emerald-200/80 rounded-2xl p-5 flex items-center gap-4 cursor-pointer hover:shadow-md hover:shadow-emerald-100 transition-all"
                    >
                        <div className="h-12 w-12 rounded-xl bg-emerald-500 text-white flex items-center justify-center text-xl shadow-sm shrink-0">
                            <FaCalendarAlt />
                        </div>
                        <div>
                            <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Working Days</p>
                            <p className="text-2xl font-black text-emerald-800 tracking-tighter">{Number(monthStats.workingDays || 0).toFixed(1)}</p>
                        </div>
                    </motion.div>

                    <motion.div
                        whileHover={{ scale: 1.02, y: -2 }}
                        onClick={() => navigate('/student/calendar')}
                        className="bg-rose-50/80 border border-rose-200/80 rounded-2xl p-5 flex items-center gap-4 cursor-pointer hover:shadow-md hover:shadow-rose-100 transition-all"
                    >
                        <div className="h-12 w-12 rounded-xl bg-rose-500 text-white flex items-center justify-center text-xl shadow-sm shrink-0">
                            <FaCalendarDay />
                        </div>
                        <div>
                            <p className="text-[10px] font-black text-rose-600 uppercase tracking-widest">Holidays</p>
                            <p className="text-2xl font-black text-rose-800 tracking-tighter">{Number(monthStats.holidays || 0).toFixed(1)}</p>
                        </div>
                    </motion.div>

                    <motion.div
                        whileHover={{ scale: 1.02, y: -2 }}
                        onClick={() => navigate('/student/calendar')}
                        className="bg-amber-50/80 border border-amber-200/80 rounded-2xl p-5 flex items-center gap-4 cursor-pointer hover:shadow-md hover:shadow-amber-100 transition-all"
                    >
                        <div className="h-12 w-12 rounded-xl bg-amber-500 text-white flex items-center justify-center text-xl shadow-sm shrink-0">
                            <FaStar />
                        </div>
                        <div>
                            <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest">Special Events</p>
                            <p className="text-2xl font-black text-amber-800 tracking-tighter">{Number(monthStats.specialEvents || 0).toFixed(1)}</p>
                        </div>
                    </motion.div>
                </div>



                {/* VIEW 1: MAIN STUDENT DASHBOARD (defaultTab='dashboard') */}
                {activeSectionTab === 'dashboard' && (
                    <div className="space-y-8">
                        
                        {/* Section A: Today's Timetable ONLY */}
                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
                            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                                <div>
                                    <h2 className="text-sm font-black uppercase tracking-wider text-gray-800 flex items-center gap-2">
                                        <FaBookOpen className="text-indigo-600" /> Today's Timetable ({todayName})
                                    </h2>
                                    <p className="text-xs text-gray-400 font-mono mt-0.5">
                                        {profile?.department_name || 'Department'} &bull; Year {profile?.academic_year || 1} (Sem {profile?.semester || 1}) Sec {profile?.section || 'A'}
                                    </p>
                                </div>
                                <button
                                    onClick={() => {
                                        setActiveSectionTab('timetable');
                                        navigate('/student/timetable');
                                    }}
                                    className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 uppercase tracking-wider"
                                >
                                    Full Timetable <FaArrowRight size={10} />
                                </button>
                            </div>

                            {loading ? (
                                <div className="py-8 text-center text-gray-400 text-xs font-semibold">Loading today's schedule...</div>
                            ) : todayTimetable.length === 0 ? (
                                <div className="p-8 text-center text-gray-400 bg-gray-50 rounded-2xl space-y-1">
                                    <FaBookOpen className="text-2xl text-gray-300 mx-auto" />
                                    <p className="font-bold text-gray-600 text-xs">No classes scheduled for today ({todayName})</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                    {todayTimetable.map(tt => (
                                        <div key={tt.id} className="bg-gray-50/80 p-4 rounded-2xl border border-gray-100 hover:border-indigo-200 transition-all space-y-2">
                                            <div className="flex items-center justify-between">
                                                <span className="text-[9px] font-black uppercase text-indigo-600 bg-indigo-100 px-2 py-0.5 rounded-md">
                                                    Period {tt.period_number}
                                                </span>
                                                <span className="text-[10px] font-mono font-bold text-gray-500">
                                                    {tt.start_time ? String(tt.start_time).slice(0, 5) : ''} - {tt.end_time ? String(tt.end_time).slice(0, 5) : ''}
                                                </span>
                                            </div>
                                            <div>
                                                <p className="font-black text-gray-800 text-sm leading-snug">{tt.subject}</p>
                                                {tt.subject_code && (
                                                    <span className="text-[10px] font-mono font-bold text-sky-600 block mt-0.5">{tt.subject_code}</span>
                                                )}
                                            </div>
                                            <div className="pt-2 border-t border-gray-200/60 flex items-center justify-between text-[10px] text-gray-500">
                                                <span>Room: <strong className="text-gray-700">{tt.room_number || 'TBA'}</strong></span>
                                                {tt.staff_name && (
                                                    <span className="font-semibold text-indigo-600 truncate max-w-[120px]">{tt.staff_name}</span>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Section B: Recent Attendance History (Last 10 Days ONLY) */}
                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
                            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                                <h2 className="text-sm font-black uppercase tracking-wider text-gray-800 flex items-center gap-2">
                                    <FaCalendarCheck className="text-indigo-600" /> Recent Attendance History (Last 10 Days)
                                </h2>
                                <button
                                    onClick={() => {
                                        setActiveSectionTab('attendance');
                                        navigate('/student/attendance');
                                    }}
                                    className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 uppercase tracking-wider"
                                >
                                    Full Attendance Log <FaArrowRight size={10} />
                                </button>
                            </div>

                            {loading ? (
                                <div className="py-8 text-center text-gray-400 text-xs font-semibold">Loading attendance...</div>
                            ) : recentAttendance.length === 0 ? (
                                <p className="text-xs text-gray-400 py-6 text-center">No attendance logs available for recent period</p>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left text-xs">
                                        <thead className="bg-gray-50 text-gray-400 uppercase font-bold border-b border-gray-100">
                                            <tr>
                                                <th className="py-2.5 px-4">Date</th>
                                                <th className="py-2.5 px-4">In Time</th>
                                                <th className="py-2.5 px-4">Out Time</th>
                                                <th className="py-2.5 px-4">Status</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {recentAttendance.map((att) => (
                                                <tr key={att.id}>
                                                    <td className="py-2.5 px-4 font-mono font-semibold">{String(att.date).slice(0, 10)}</td>
                                                    <td className="py-2.5 px-4 font-mono">{att.in_time || '--:--'}</td>
                                                    <td className="py-2.5 px-4 font-mono">{att.out_time || '--:--'}</td>
                                                    <td className="py-2.5 px-4">
                                                        <span className={`px-2 py-0.5 rounded font-bold ${
                                                            (att.status || '').toUpperCase().includes('PRESENT')
                                                                ? 'bg-emerald-50 text-emerald-600'
                                                                : 'bg-red-50 text-red-600'
                                                        }`}>
                                                            {att.status}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>

                    </div>
                )}

                {/* VIEW 2: EXAMINATION RESULTS PAGE */}
                {activeSectionTab === 'results' && (() => {
                    const internalResults = yearFilteredResults.filter(r => {
                        const name = (r.exam_name || '').toLowerCase();
                        return name.includes('internal') || name.includes('assessment') || !name.includes('semester');
                    });
                    const semesterResults = yearFilteredResults.filter(r => {
                        const name = (r.exam_name || '').toLowerCase();
                        return name.includes('semester');
                    });
                    const displayedStudentResults = resultCategoryTab === 'semester' ? semesterResults : internalResults;

                    return (
                    <div className="space-y-6">
                        
                        {/* Year & Semester Selector Sub-Tabs */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
                            {/* Year Tabs */}
                            <div className="flex items-center gap-2 overflow-x-auto pb-1">
                                {[1, 2, 3, 4].map(yr => (
                                    <button
                                        key={yr}
                                        onClick={() => {
                                            setSelectedYearTab(String(yr));
                                            setSelectedSemTab('all');
                                        }}
                                        className={`px-4 py-2 rounded-xl text-xs font-bold transition-all shrink-0 ${
                                            String(selectedYearTab) === String(yr)
                                                ? 'bg-indigo-600 text-white shadow-md'
                                                : 'bg-gray-50 text-gray-500 border border-gray-200 hover:bg-gray-100'
                                        }`}
                                    >
                                        Year {yr}
                                    </button>
                                ))}
                            </div>

                            {/* Semester Tabs for Selected Year */}
                            <div className="flex items-center gap-2 overflow-x-auto pb-1">
                                <button
                                    onClick={() => setSelectedSemTab('all')}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 ${
                                        selectedSemTab === 'all'
                                            ? 'bg-sky-500 text-white shadow-sm'
                                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                    }`}
                                >
                                    All Semesters
                                </button>
                                {getSemestersForYear(selectedYearTab).map(sem => (
                                    <button
                                        key={sem}
                                        onClick={() => setSelectedSemTab(String(sem))}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 ${
                                            String(selectedSemTab) === String(sem)
                                                ? 'bg-sky-500 text-white shadow-sm'
                                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                        }`}
                                    >
                                        Semester {sem}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Grade Sheet Card */}
                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden p-6 space-y-4">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 pb-3">
                                <h2 className="text-sm font-black uppercase tracking-wider text-gray-800 flex items-center gap-2">
                                    <FaAward className="text-indigo-600" /> Academic Performance & Grade Card
                                </h2>
                                <div className="flex items-center gap-2 p-1 bg-gray-100 rounded-xl">
                                    <button
                                        onClick={() => setResultCategoryTab('internal')}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                            resultCategoryTab === 'internal'
                                                ? 'bg-sky-600 text-white shadow-sm'
                                                : 'text-gray-600 hover:text-sky-600'
                                        }`}
                                    >
                                        Internal / Assessment Results ({internalResults.length})
                                    </button>
                                    <button
                                        onClick={() => setResultCategoryTab('semester')}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                            resultCategoryTab === 'semester'
                                                ? 'bg-indigo-600 text-white shadow-sm'
                                                : 'text-gray-600 hover:text-indigo-600'
                                        }`}
                                    >
                                        Semester Results ({semesterResults.length})
                                    </button>
                                </div>
                            </div>

                            {loading ? (
                                <div className="p-8 text-center text-gray-400">Loading exam results...</div>
                            ) : displayedStudentResults.length === 0 ? (
                                <div className="p-8 text-center text-gray-400 space-y-2">
                                    <FaFileAlt className="text-3xl text-gray-300 mx-auto" />
                                    <p className="font-semibold text-gray-600 text-sm">
                                        No published {resultCategoryTab === 'semester' ? 'Semester' : 'Internal / Assessment'} results available for Year {selectedYearTab} {selectedSemTab !== 'all' ? `(Semester ${selectedSemTab})` : ''}
                                    </p>
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left text-sm">
                                        <thead className="bg-gray-50 text-gray-400 uppercase text-[10px] font-black tracking-wider border-b border-gray-100">
                                            <tr>
                                                <th className="py-3 px-4">Result Category</th>
                                                <th className="py-3 px-4">Subject Code & Name</th>
                                                <th className="py-3 px-3">Internal</th>
                                                <th className="py-3 px-3">External / Assessment</th>
                                                <th className="py-3 px-3">Total</th>
                                                <th className="py-3 px-3">Grade</th>
                                                <th className="py-3 px-3">Status</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {displayedStudentResults.map((r) => (
                                                <tr key={r.id} className="hover:bg-gray-50/80 transition-colors">
                                                    <td className="py-3 px-4">
                                                        <div className="font-bold text-gray-800 text-xs">{r.exam_name || (resultCategoryTab === 'semester' ? 'Semester Result' : 'Internal Result')}</div>
                                                        <span className="inline-block mt-0.5 text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">
                                                            Sem {r.semester}
                                                        </span>
                                                    </td>
                                                    <td className="py-3 px-4">
                                                        <div className="font-mono font-bold text-indigo-600 text-xs">{r.subject_code}</div>
                                                        <div className="text-xs text-gray-700">{r.subject_name}</div>
                                                    </td>
                                                    <td className="py-3 px-3 font-semibold text-xs text-gray-700">{r.internal_marks}</td>
                                                    <td className="py-3 px-3 font-semibold text-xs text-gray-700">{r.external_marks}</td>
                                                    <td className="py-3 px-3 font-bold text-xs text-gray-900">{r.total_marks} / {r.max_marks}</td>
                                                    <td className="py-3 px-3">
                                                        <span className={`px-2 py-0.5 rounded font-black text-xs ${
                                                            ['O', 'A+', 'A'].includes(r.grade) 
                                                                ? 'bg-emerald-100 text-emerald-800' 
                                                                : r.grade === 'RA' || r.grade === 'F'
                                                                    ? 'bg-red-100 text-red-800' 
                                                                    : 'bg-blue-100 text-blue-800'
                                                        }`}>
                                                            {r.grade}
                                                        </span>
                                                    </td>
                                                    <td className="py-3 px-3">
                                                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase ${
                                                            (r.status || '').toUpperCase() === 'PASS'
                                                                ? 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                                                                : 'bg-red-50 text-red-600 border border-red-200'
                                                        }`}>
                                                            {r.status}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>

                    </div>
                    );
                })()}

                {/* VIEW 3: CLASS TIMETABLE PAGE (FULL WEEK) */}
                {activeSectionTab === 'timetable' && (
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-6">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-100 pb-4">
                            <div>
                                <h2 className="text-sm font-black uppercase tracking-wider text-gray-800 flex items-center gap-2">
                                    <FaBookOpen className="text-indigo-600" /> Class Timetable Schedule
                                </h2>
                                <p className="text-xs text-gray-400 mt-1 font-mono">
                                    {profile?.department_name || 'Department'} &bull; Year {profile?.academic_year || 1} (Semester {profile?.semester || 1}) Sec {profile?.section || 'A'}
                                </p>
                            </div>

                            {/* Day Filter Tabs */}
                            <div className="flex items-center gap-1.5 flex-wrap">
                                {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'All Days'].map((day) => (
                                    <button
                                        key={day}
                                        onClick={() => setSelectedDayTab(day)}
                                        className={`px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all ${
                                            selectedDayTab === day
                                                ? 'bg-indigo-600 text-white shadow-sm'
                                                : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
                                        }`}
                                    >
                                        {day}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {loading ? (
                            <div className="py-12 text-center text-gray-400 font-semibold text-xs">Loading class timetable...</div>
                        ) : timetable.length === 0 ? (
                            <div className="p-8 text-center text-gray-400 space-y-2">
                                <FaBookOpen className="text-3xl text-gray-300 mx-auto" />
                                <p className="font-semibold text-gray-600 text-sm">No class timetable entries set by Admin for your department & year</p>
                            </div>
                        ) : (
                            <div className="space-y-6">
                                {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
                                    .filter(d => selectedDayTab === 'All Days' || selectedDayTab === d)
                                    .map(day => {
                                        const dayEntries = timetable.filter(t => t.day_of_week === day);
                                        if (selectedDayTab !== 'All Days' && dayEntries.length === 0) {
                                            return (
                                                <div key={day} className="p-8 text-center text-gray-400 bg-gray-50 rounded-2xl">
                                                    No classes scheduled for {day}
                                                </div>
                                            );
                                        }
                                        if (dayEntries.length === 0) return null;

                                        return (
                                            <div key={day} className="space-y-3">
                                                <h3 className="text-xs font-black uppercase tracking-widest text-indigo-700 bg-indigo-50/70 inline-block px-3 py-1 rounded-lg">
                                                    {day}
                                                </h3>
                                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                                    {dayEntries.map(tt => (
                                                        <div key={tt.id} className="bg-gray-50/80 p-4 rounded-2xl border border-gray-100 hover:border-indigo-200 transition-all space-y-2">
                                                            <div className="flex items-center justify-between">
                                                                <span className="text-[9px] font-black uppercase text-indigo-600 bg-indigo-100 px-2 py-0.5 rounded-md">
                                                                    Period {tt.period_number}
                                                                </span>
                                                                <span className="text-[10px] font-mono font-bold text-gray-500">
                                                                    {tt.start_time ? String(tt.start_time).slice(0, 5) : ''} - {tt.end_time ? String(tt.end_time).slice(0, 5) : ''}
                                                                </span>
                                                            </div>
                                                            <div>
                                                                <p className="font-black text-gray-800 text-sm leading-snug">{tt.subject}</p>
                                                                {tt.subject_code && (
                                                                    <span className="text-[10px] font-mono font-bold text-sky-600 block mt-0.5">{tt.subject_code}</span>
                                                                )}
                                                            </div>
                                                            <div className="pt-2 border-t border-gray-200/60 flex items-center justify-between text-[10px] text-gray-500">
                                                                <span>Room: <strong className="text-gray-700">{tt.room_number || 'TBA'}</strong></span>
                                                                {tt.staff_name && (
                                                                    <span className="font-semibold text-indigo-600 truncate max-w-[120px]">{tt.staff_name}</span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        );
                                    })
                                }
                            </div>
                        )}
                    </div>
                )}

                {/* VIEW 4: ATTENDANCE LOG PAGE (MONTH-WISE & SEMESTER-WISE FILTERS) */}
                {activeSectionTab === 'attendance' && (
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-6">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-100 pb-4">
                            <div>
                                <h2 className="text-sm font-black uppercase tracking-wider text-gray-800 flex items-center gap-2">
                                    <FaCalendarCheck className="text-indigo-600" /> Full Attendance Log
                                </h2>
                                <p className="text-xs text-gray-400 mt-1 font-mono">
                                    Overall Attendance: <span className="font-bold text-indigo-600">{attPercentage}%</span> ({presentDays} / {totalAttDays} Days)
                                </p>
                            </div>

                            {/* Attendance Filter Controls */}
                            <div className="flex items-center gap-2 flex-wrap">
                                {/* Mode Selector */}
                                <div className="flex items-center p-1 bg-gray-100 rounded-xl">
                                    <button
                                        onClick={() => setAttFilterMode('all')}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                            attFilterMode === 'all'
                                                ? 'bg-indigo-600 text-white shadow-sm'
                                                : 'text-gray-600 hover:text-indigo-600'
                                        }`}
                                    >
                                        All History
                                    </button>
                                    <button
                                        onClick={() => setAttFilterMode('month')}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                            attFilterMode === 'month'
                                                ? 'bg-indigo-600 text-white shadow-sm'
                                                : 'text-gray-600 hover:text-indigo-600'
                                        }`}
                                    >
                                        Month-wise
                                    </button>
                                    <button
                                        onClick={() => setAttFilterMode('semester')}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                            attFilterMode === 'semester'
                                                ? 'bg-indigo-600 text-white shadow-sm'
                                                : 'text-gray-600 hover:text-indigo-600'
                                        }`}
                                    >
                                        Semester-wise
                                    </button>
                                </div>

                                {/* Month Picker Input */}
                                {attFilterMode === 'month' && (
                                    <input
                                        type="month"
                                        value={selectedAttMonth}
                                        onChange={(e) => setSelectedAttMonth(e.target.value)}
                                        className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-700 outline-none focus:ring-2 focus:ring-indigo-100"
                                    />
                                )}

                                {/* Semester Selector */}
                                {attFilterMode === 'semester' && (
                                    <select
                                        value={selectedAttSem}
                                        onChange={(e) => setSelectedAttSem(e.target.value)}
                                        className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-700 outline-none focus:ring-2 focus:ring-indigo-100"
                                    >
                                        <option value="all">All Semesters</option>
                                        {[1, 2, 3, 4, 5, 6, 7, 8].map(s => (
                                            <option key={s} value={s}>Semester {s}</option>
                                        ))}
                                    </select>
                                )}
                            </div>
                        </div>

                        {loading ? (
                            <div className="py-12 text-center text-gray-400 font-semibold text-xs">Loading attendance history...</div>
                        ) : filteredAttendanceList.length === 0 ? (
                            <div className="p-8 text-center text-gray-400 space-y-2">
                                <FaCalendarCheck className="text-3xl text-gray-300 mx-auto" />
                                <p className="font-semibold text-gray-600 text-sm">No attendance records found for selected filter criteria</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-xs">
                                    <thead className="bg-gray-50 text-gray-400 uppercase font-bold border-b border-gray-100">
                                        <tr>
                                            <th className="py-3 px-4">Date</th>
                                            <th className="py-3 px-4">In Time</th>
                                            <th className="py-3 px-4">Out Time</th>
                                            <th className="py-3 px-4">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {filteredAttendanceList.map((att) => (
                                            <tr key={att.id} className="hover:bg-gray-50/80 transition-colors">
                                                <td className="py-3 px-4 font-mono font-semibold">{String(att.date).slice(0, 10)}</td>
                                                <td className="py-3 px-4 font-mono">{att.in_time || '--:--'}</td>
                                                <td className="py-3 px-4 font-mono">{att.out_time || '--:--'}</td>
                                                <td className="py-3 px-4">
                                                    <span className={`px-2.5 py-1 rounded font-bold text-[10px] uppercase ${
                                                        (att.status || '').toUpperCase().includes('PRESENT')
                                                            ? 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                                                            : 'bg-red-50 text-red-600 border border-red-200'
                                                    }`}>
                                                        {att.status}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}

            </div>
        </Layout>
    );
};

export default StudentDashboard;
