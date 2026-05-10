import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../../components/Layout';
import api from '../../utils/api';
import { FaCheckCircle, FaTimesCircle, FaHourglassHalf, FaClock, FaCalendarCheck, FaSearch } from 'react-icons/fa';
import { motion } from 'framer-motion';
import { useAuth } from '../../context/AuthContext';

const LeaveHistory = () => {
    const { user } = useAuth();
    const [leaves, setLeaves] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('All');
    const [leaveTypesMap, setLeaveTypesMap] = useState({});
    const navigate = useNavigate();

    const getLeaveTypeName = (type) => leaveTypesMap[type] || type;

    useEffect(() => {
        fetchLeaveHistory();
        fetchLeaveTypes();
    }, []);

    const fetchLeaveTypes = async () => {
        try {
            const { data } = await api.get('/leave-types');
            const map = {};
            data.forEach(t => { map[t.label] = `${t.full_name} (${t.label})`; });
            setLeaveTypesMap(map);
        } catch { console.error('Failed to fetch leave types'); }
    };

    const fetchLeaveHistory = async () => {
        try {
            const { data } = await api.get('/leaves/history');
            setLeaves(data);
        } catch (error) {
            console.error('Error fetching leave history', error);
        } finally {
            setLoading(false);
        }
    };

    const filtered = leaves.filter(l => {
        const matchSearch = !search ||
            l.applicant_name?.toLowerCase().includes(search.toLowerCase()) ||
            l.leave_type?.toLowerCase().includes(search.toLowerCase()) ||
            l.subject?.toLowerCase().includes(search.toLowerCase()) ||
            l.department_name?.toLowerCase().includes(search.toLowerCase());
        const matchStatus = statusFilter === 'All' || l.status === statusFilter;
        return matchSearch && matchStatus;
    });

    const statusCounts = {
        All: leaves.length,
        Pending: leaves.filter(l => l.status === 'Pending').length,
        Approved: leaves.filter(l => l.status === 'Approved').length,
        Rejected: leaves.filter(l => l.status === 'Rejected').length,
    };

    return (
        <Layout>
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="max-w-7xl mx-auto"
            >
                <div className="mb-10">
                    <h1 className="text-3xl font-black text-gray-800 tracking-tight">Leave Request History</h1>
                    <p className="text-gray-500 font-medium mt-1">Complete history of all employee leave requests.</p>
                </div>

                {/* Filters */}
                <div className="modern-card !p-6 mb-8 flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
                    <div className="relative flex-1 max-w-md">
                        <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" size={14} />
                        <input
                            type="text"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Search by name, type, subject, department..."
                            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none"
                        />
                    </div>
                    <div className="flex gap-2 flex-wrap">
                        {['All', 'Pending', 'Approved', 'Rejected'].map(s => (
                            <button
                                key={s}
                                onClick={() => setStatusFilter(s)}
                                className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${statusFilter === s
                                        ? 'bg-sky-600 text-white shadow-lg'
                                        : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                                    }`}
                            >
                                {s} ({statusCounts[s]})
                            </button>
                        ))}
                    </div>
                </div>

                {/* Table */}
                {loading ? (
                    <div className="flex justify-center py-20">
                        <div className="h-10 w-10 border-4 border-sky-600 border-t-transparent rounded-full animate-spin"></div>
                    </div>
                ) : (
                    <div className="modern-card !p-0 overflow-hidden border-sky-100">
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="bg-sky-50/50 border-b border-sky-100">
                                        <th className="p-4 text-left text-[10px] font-black text-sky-800 uppercase tracking-widest">Employee</th>
                                        <th className="p-4 text-left text-[10px] font-black text-sky-800 uppercase tracking-widest">Department</th>
                                        <th className="p-4 text-left text-[10px] font-black text-sky-800 uppercase tracking-widest">Leave Type</th>
                                        <th className="p-4 text-left text-[10px] font-black text-sky-800 uppercase tracking-widest">Subject</th>
                                        <th className="p-4 text-center text-[10px] font-black text-sky-800 uppercase tracking-widest">Days</th>
                                        <th className="p-4 text-left text-[10px] font-black text-sky-800 uppercase tracking-widest">From</th>
                                        <th className="p-4 text-left text-[10px] font-black text-sky-800 uppercase tracking-widest">To</th>
                                        <th className="p-4 text-center text-[10px] font-black text-sky-800 uppercase tracking-widest">Status</th>
                                        <th className="p-4 text-left text-[10px] font-black text-sky-800 uppercase tracking-widest">Applied On</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filtered.map((leave, idx) => (
                                        <motion.tr
                                            key={leave.id}
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            transition={{ delay: idx * 0.02 }}
                                            onClick={() => {
                                                navigate(`/principal/profile/${leave.emp_id}`);
                                                window.dispatchEvent(new CustomEvent('closeSidebar'));
                                            }}
                                            className="border-b border-gray-50 hover:bg-sky-50/30 transition-colors cursor-pointer"
                                        >
                                            <td className="p-4">
                                                <div className="flex items-center gap-3">
                                                    <img
                                                        src={leave.applicant_pic || `https://ui-avatars.com/api/?name=${encodeURIComponent(leave.applicant_name || '?')}&size=80&background=0ea5e9&color=fff&bold=true`}
                                                        alt=""
                                                        className="h-9 w-9 rounded-xl object-cover shadow-sm"
                                                    />
                                                    <span className="text-sm font-bold text-gray-800">{leave.applicant_name}</span>
                                                </div>
                                            </td>
                                            <td className="p-4">
                                                <span className="text-xs text-gray-500">{leave.department_name || '-'}</span>
                                            </td>
                                            <td className="p-4">
                                                <span className="text-[10px] font-black text-sky-600 uppercase tracking-widest">{getLeaveTypeName(leave.leave_type)}</span>
                                            </td>
                                            <td className="p-4">
                                                <span className="text-xs text-gray-500 line-clamp-1">{leave.subject || '-'}</span>
                                            </td>
                                            <td className="p-4 text-center">
                                                <span className="text-sm font-bold text-gray-700">
                                                    { Number(leave.days_count) > 0 ? leave.days_count : (leave.hours && Number(leave.hours) > 0 ? `${leave.hours} Hours` : leave.days_count) }
                                                    {(() => {
                                                        try {
                                                            const details = typeof leave.dates_detail === 'string' ? JSON.parse(leave.dates_detail) : leave.dates_detail;
                                                            if (details && details.length === 1 && !details[0].is_full_day) {
                                                                return ` (${details[0].from_time} - ${details[0].to_time})`;
                                                            }
                                                        } catch (e) { }
                                                        return '';
                                                    })()}
                                                </span>
                                            </td>
                                            <td className="p-4">
                                                <span className="text-xs text-gray-500">{(() => {
                                                    try {
                                                        const details = typeof leave.dates_detail === 'string' ? JSON.parse(leave.dates_detail) : leave.dates_detail;
                                                        if (details && details.length === 1 && !details[0].is_full_day) {
                                                            return `${new Date(leave.from_date).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' })} | ${details[0].from_time} - ${details[0].to_time}`;
                                                        }
                                                    } catch (e) { }
                                                    return new Date(leave.from_date).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });
                                                })()}</span>
                                            </td>
                                            <td className="p-4">
                                                <span className="text-xs text-gray-500">{new Date(leave.to_date).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                                            </td>
                                            <td className="p-4 text-center">
                                                <div className={`inline-flex items-center gap-1.5 py-1 px-3 rounded-lg border text-[9px] font-black uppercase tracking-widest ${leave.status === 'Approved' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                                                        leave.status === 'Rejected' ? 'bg-rose-50 text-rose-600 border-rose-100' :
                                                            'bg-amber-50 text-amber-600 border-amber-100'
                                                    }`}>
                                                    {leave.status === 'Approved' ? <FaCheckCircle size={10} /> :
                                                        leave.status === 'Rejected' ? <FaTimesCircle size={10} /> :
                                                            <FaHourglassHalf size={10} />}
                                                    {leave.status}
                                                </div>
                                            </td>
                                            <td className="p-4">
                                                <span className="text-xs text-gray-400">{new Date(leave.created_at).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                                            </td>
                                        </motion.tr>
                                    ))}
                                    {filtered.length === 0 && !loading && (
                                        <tr>
                                            <td colSpan="9" className="p-20 text-center">
                                                <div className="flex flex-col items-center gap-4 opacity-20">
                                                    <FaCalendarCheck size={48} />
                                                    <p className="text-sm font-bold italic">No leave requests found.</p>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </motion.div>
        </Layout>
    );
};

export default LeaveHistory;
