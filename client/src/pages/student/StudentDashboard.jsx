import { useState, useEffect, useCallback } from 'react';
import Layout from '../../components/Layout';
import api from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    FaUserGraduate, FaCalendarCheck, FaBookOpen, FaFileAlt, 
    FaAward, FaCheckCircle, FaTimesCircle, FaBuilding, 
    FaClock, FaGraduationCap, FaSync 
} from 'react-icons/fa';

const StudentDashboard = ({ defaultTab = 'results' }) => {
    const { user } = useAuth();
    const [profile, setProfile] = useState(null);
    const [myResults, setMyResults] = useState([]);
    const [attendance, setAttendance] = useState([]);
    const [timetable, setTimetable] = useState([]);
    const [loading, setLoading] = useState(true);
    
    const [selectedYearTab, setSelectedYearTab] = useState('1');
    const [activeSectionTab, setActiveSectionTab] = useState(defaultTab); // 'results', 'timetable', 'attendance'

    useEffect(() => {
        if (defaultTab) {
            setActiveSectionTab(defaultTab);
        }
    }, [defaultTab]);

    const fetchStudentData = useCallback(async () => {
        setLoading(true);
        try {
            const [profileRes, resultsRes, attRes, ttRes] = await Promise.all([
                api.get('/auth/profile'),
                api.get('/results/my-results'),
                api.get(`/attendance?emp_id=${user?.emp_id}`),
                api.get('/timetable')
            ]);

            setProfile(profileRes.data || {});
            setMyResults(resultsRes.data || []);
            setAttendance(attRes.data || []);
            setTimetable(ttRes.data || []);

            if (profileRes.data?.academic_year) {
                setSelectedYearTab(String(profileRes.data.academic_year));
            }
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

    // Filter results for selected year
    const yearFilteredResults = myResults.filter(r => String(r.academic_year) === String(selectedYearTab));

    // Calculate attendance percentage
    const totalAttDays = attendance.length;
    const presentDays = attendance.filter(a => (a.status || '').toUpperCase().includes('PRESENT')).length;
    const attPercentage = totalAttDays > 0 ? ((presentDays / totalAttDays) * 100).toFixed(1) : '100.0';

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

                {/* Main Section Navigation Tabs */}
                <div className="flex items-center gap-2 border-b border-gray-100 pb-2">
                    <button
                        onClick={() => setActiveSectionTab('results')}
                        className={`px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all flex items-center gap-2 ${
                            activeSectionTab === 'results'
                                ? 'bg-indigo-600 text-white shadow-md'
                                : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
                        }`}
                    >
                        <FaAward /> Examination Results
                    </button>
                    <button
                        onClick={() => setActiveSectionTab('timetable')}
                        className={`px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all flex items-center gap-2 ${
                            activeSectionTab === 'timetable'
                                ? 'bg-indigo-600 text-white shadow-md'
                                : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
                        }`}
                    >
                        <FaBookOpen /> Class Timetable
                    </button>
                    <button
                        onClick={() => setActiveSectionTab('attendance')}
                        className={`px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all flex items-center gap-2 ${
                            activeSectionTab === 'attendance'
                                ? 'bg-indigo-600 text-white shadow-md'
                                : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
                        }`}
                    >
                        <FaCalendarCheck /> Attendance Logs
                    </button>
                </div>

                {/* Section 1: Examination Results */}
                {activeSectionTab === 'results' && (
                    <div className="space-y-6">
                        
                        {/* Year Selector Sub-Tabs */}
                        <div className="flex items-center gap-2">
                            {[1, 2, 3, 4].map(yr => (
                                <button
                                    key={yr}
                                    onClick={() => setSelectedYearTab(String(yr))}
                                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                                        String(selectedYearTab) === String(yr)
                                            ? 'bg-sky-50 text-sky-700 border-2 border-sky-500'
                                            : 'bg-white text-gray-400 border border-gray-200 hover:bg-gray-50'
                                    }`}
                                >
                                    Year {yr}
                                </button>
                            ))}
                        </div>

                        {/* Grade Sheet Card */}
                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden p-6 space-y-4">
                            <h2 className="text-sm font-black uppercase tracking-wider text-gray-800 flex items-center gap-2 border-b border-gray-100 pb-3">
                                <FaAward className="text-indigo-600" /> Academic Performance & Grade Card
                            </h2>

                            {loading ? (
                                <div className="p-8 text-center text-gray-400">Loading exam results...</div>
                            ) : yearFilteredResults.length === 0 ? (
                                <div className="p-8 text-center text-gray-400 space-y-2">
                                    <FaFileAlt className="text-3xl text-gray-300 mx-auto" />
                                    <p className="font-semibold text-gray-600 text-sm">No published examination results available for Year {selectedYearTab}</p>
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left text-sm">
                                        <thead className="bg-gray-50 text-gray-400 uppercase text-[10px] font-black tracking-wider border-b border-gray-100">
                                            <tr>
                                                <th className="py-3 px-4">Subject Code</th>
                                                <th className="py-3 px-4">Subject Name</th>
                                                <th className="py-3 px-3">Internal</th>
                                                <th className="py-3 px-3">External</th>
                                                <th className="py-3 px-3">Total</th>
                                                <th className="py-3 px-3">Grade</th>
                                                <th className="py-3 px-3">Status</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {yearFilteredResults.map((r) => (
                                                <tr key={r.id} className="hover:bg-gray-50/80 transition-colors">
                                                    <td className="py-3 px-4 font-mono font-bold text-indigo-600">{r.subject_code}</td>
                                                    <td className="py-3 px-4 font-semibold text-gray-800">{r.subject_name}</td>
                                                    <td className="py-3 px-3 text-gray-600">{r.internal_marks}</td>
                                                    <td className="py-3 px-3 text-gray-600">{r.external_marks}</td>
                                                    <td className="py-3 px-3 font-bold text-gray-900">{r.total_marks} / {r.max_marks}</td>
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
                )}

                {/* Section 2: Class Timetable */}
                {activeSectionTab === 'timetable' && (
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
                        <h2 className="text-sm font-black uppercase tracking-wider text-gray-800 flex items-center gap-2 border-b border-gray-100 pb-3">
                            <FaBookOpen className="text-indigo-600" /> Today's Class Schedule
                        </h2>
                        {timetable.length === 0 ? (
                            <p className="text-xs text-gray-400 py-6 text-center">No timetable entries registered for today</p>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {timetable.map((tt) => (
                                    <div key={tt.id} className="bg-gray-50 p-4 rounded-2xl border border-gray-100 space-y-1">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[10px] font-black uppercase text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
                                                Period {tt.period_number}
                                            </span>
                                            <span className="text-xs font-mono text-gray-500">{tt.start_time} - {tt.end_time}</span>
                                        </div>
                                        <p className="font-bold text-gray-800 text-sm mt-1">{tt.subject}</p>
                                        <p className="text-xs text-gray-400">Room: {tt.room_number || 'TBA'}</p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Section 3: Attendance Logs */}
                {activeSectionTab === 'attendance' && (
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
                        <h2 className="text-sm font-black uppercase tracking-wider text-gray-800 flex items-center gap-2 border-b border-gray-100 pb-3">
                            <FaCalendarCheck className="text-indigo-600" /> Attendance History
                        </h2>
                        {attendance.length === 0 ? (
                            <p className="text-xs text-gray-400 py-6 text-center">No attendance logs available for current period</p>
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
                                        {attendance.map((att) => (
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
                )}

            </div>
        </Layout>
    );
};

export default StudentDashboard;
