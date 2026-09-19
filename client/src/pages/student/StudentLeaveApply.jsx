import { useState, useEffect, useCallback } from 'react';
import Layout from '../../components/Layout';
import api from '../../utils/api';
import Swal from 'sweetalert2';
import { useAuth } from '../../context/AuthContext';
import { motion } from 'framer-motion';
import {
    FaPaperPlane, FaHistory, FaCalendarCheck,
    FaBalanceScale
} from 'react-icons/fa';

const StudentLeaveApply = () => {
    const { user } = useAuth();
    const [activeTab, setActiveTab] = useState('apply'); // 'apply', 'history', 'balance'
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    // Leave history & balances
    const [history, setHistory] = useState([]);
    const [leaveBalances, setLeaveBalances] = useState(null);

    // Form fields
    const [formData, setFormData] = useState({
        leave_type: 'Casual Leave',
        reason: '',
        from_date: '',
        to_date: '',
        day_type: 'Full Day'
    });

    const fetchLeaveData = useCallback(async () => {
        setLoading(true);
        try {
            const [histRes, balRes] = await Promise.all([
                api.get('/leaves/my-requests'),
                api.get('/leaves/my-balances')
            ]);
            setHistory(histRes.data || []);
            setLeaveBalances(balRes.data || null);
        } catch (err) {
            console.error('Error fetching student leave data:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchLeaveData();
    }, [fetchLeaveData]);

    const handleSubmitLeave = async (e) => {
        e.preventDefault();

        if (!formData.from_date || !formData.to_date) {
            Swal.fire({ icon: 'warning', title: 'Dates Required', text: 'Please select both From Date and To Date.', confirmButtonColor: '#0ea5e9' });
            return;
        }

        if (!formData.reason.trim()) {
            Swal.fire({ icon: 'warning', title: 'Reason Required', text: 'Please enter a valid reason for your leave request.', confirmButtonColor: '#0ea5e9' });
            return;
        }

        setSubmitting(true);
        try {
            const payload = {
                leave_type: formData.leave_type,
                reason: formData.reason,
                dates: [
                    {
                        date: formData.from_date,
                        day_type: formData.day_type
                    }
                ]
            };

            await api.post('/leaves/apply', payload);

            Swal.fire({
                icon: 'success',
                title: 'Leave Request Submitted! 🎓',
                text: 'Your leave application has been submitted successfully for approval.',
                timer: 2000,
                showConfirmButton: false
            });

            setFormData({
                leave_type: 'Casual Leave',
                reason: '',
                from_date: '',
                to_date: '',
                day_type: 'Full Day'
            });

            setActiveTab('history');
            fetchLeaveData();
        } catch (err) {
            console.error('Student Leave Submit Error:', err);
            Swal.fire({
                icon: 'error',
                title: 'Submission Failed',
                text: err.response?.data?.message || 'Failed to submit leave application.',
                confirmButtonColor: '#0ea5e9'
            });
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Layout>
            <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto space-y-6">

                {/* Top Banner */}
                <div className="rounded-3xl bg-gradient-to-r from-sky-900 via-indigo-900 to-slate-900 p-6 sm:p-8 text-white shadow-xl relative overflow-hidden">
                    <div className="relative z-10 space-y-2">
                        <span className="px-3 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-xs font-semibold text-sky-200 inline-flex items-center gap-2">
                            <FaCalendarCheck /> Student Leave & Absence Portal
                        </span>
                        <h1 className="text-2xl sm:text-3xl font-black tracking-tight">Student Leave Requests & Balances</h1>
                        <p className="text-xs sm:text-sm text-sky-200/90 max-w-xl">
                            Apply for academic leave, check approval status, and track your attendance leave quota.
                        </p>
                    </div>
                </div>

                {/* Tab Navigation */}
                <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
                    <button
                        type="button"
                        onClick={() => setActiveTab('apply')}
                        className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                            activeTab === 'apply'
                                ? 'bg-sky-600 text-white shadow-md shadow-sky-500/20'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                    >
                        <FaPaperPlane /> Apply for Leave
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveTab('history')}
                        className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                            activeTab === 'history'
                                ? 'bg-sky-600 text-white shadow-md shadow-sky-500/20'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                    >
                        <FaHistory /> Request History ({history.length})
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveTab('balance')}
                        className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                            activeTab === 'balance'
                                ? 'bg-sky-600 text-white shadow-md shadow-sky-500/20'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                    >
                        <FaBalanceScale /> Leave Balances
                    </button>
                </div>

                {/* TAB 1: APPLY FOR LEAVE */}
                {activeTab === 'apply' && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm space-y-6"
                    >
                        <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                            <FaPaperPlane className="text-sky-600" /> New Leave Application Form
                        </h2>

                        <form onSubmit={handleSubmitLeave} className="space-y-5">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold uppercase text-slate-600">Leave Type</label>
                                    <select
                                        value={formData.leave_type}
                                        onChange={(e) => setFormData({ ...formData, leave_type: e.target.value })}
                                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-sky-500"
                                    >
                                        <option value="Casual Leave">Casual Leave (CL)</option>
                                        <option value="Medical Leave">Medical Leave (ML)</option>
                                        <option value="On Duty">On Duty (OD)</option>
                                        <option value="Special Leave">Special Leave</option>
                                    </select>
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold uppercase text-slate-600">Duration Type</label>
                                    <select
                                        value={formData.day_type}
                                        onChange={(e) => setFormData({ ...formData, day_type: e.target.value })}
                                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-sky-500"
                                    >
                                        <option value="Full Day">Full Day</option>
                                        <option value="Half Day AM">Half Day (Morning)</option>
                                        <option value="Half Day PM">Half Day (Afternoon)</option>
                                    </select>
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold uppercase text-slate-600">From Date</label>
                                    <input
                                        type="date"
                                        value={formData.from_date}
                                        onChange={(e) => setFormData({ ...formData, from_date: e.target.value, to_date: formData.to_date || e.target.value })}
                                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-sky-500"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold uppercase text-slate-600">To Date</label>
                                    <input
                                        type="date"
                                        value={formData.to_date}
                                        onChange={(e) => setFormData({ ...formData, to_date: e.target.value })}
                                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-sky-500"
                                    />
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-xs font-bold uppercase text-slate-600">Reason for Leave</label>
                                <textarea
                                    rows={4}
                                    value={formData.reason}
                                    onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                                    placeholder="Please describe the reason for your leave request..."
                                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-xs font-medium text-slate-800 focus:ring-2 focus:ring-sky-500"
                                />
                            </div>

                            <div className="pt-2 text-right">
                                <button
                                    type="submit"
                                    disabled={submitting}
                                    className="px-6 py-3 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold shadow-lg shadow-sky-600/30 transition-all disabled:opacity-50 inline-flex items-center gap-2"
                                >
                                    {submitting ? (
                                        <>
                                            <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                            Submitting...
                                        </>
                                    ) : (
                                        <>
                                            <FaPaperPlane /> Submit Leave Request
                                        </>
                                    )}
                                </button>
                            </div>
                        </form>
                    </motion.div>
                )}

                {/* TAB 2: REQUEST HISTORY */}
                {activeTab === 'history' && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-4"
                    >
                        <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                            <FaHistory className="text-sky-600" /> My Leave Request History
                        </h2>

                        {loading ? (
                            <div className="py-12 text-center text-slate-400 text-xs font-semibold">Loading leave history...</div>
                        ) : history.length === 0 ? (
                            <div className="py-12 text-center text-slate-400 text-xs font-semibold">No leave requests submitted yet.</div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-xs border-collapse">
                                    <thead>
                                        <tr className="bg-slate-50 text-slate-600 uppercase font-bold border-b border-slate-200">
                                            <th className="py-3 px-4">Leave Type</th>
                                            <th className="py-3 px-4">Dates</th>
                                            <th className="py-3 px-4">Reason</th>
                                            <th className="py-3 px-4 text-center">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {history.map((req) => (
                                            <tr key={req.id} className="hover:bg-slate-50/80">
                                                <td className="py-3 px-4 font-bold text-slate-800">{req.leave_type || 'Casual Leave'}</td>
                                                <td className="py-3 px-4 font-semibold text-slate-600">
                                                    {req.from_date || req.date} {req.to_date && req.to_date !== req.from_date ? `to ${req.to_date}` : ''}
                                                </td>
                                                <td className="py-3 px-4 text-slate-600 max-w-xs truncate">{req.reason}</td>
                                                <td className="py-3 px-4 text-center">
                                                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase ${
                                                        (req.status || '').toLowerCase() === 'approved'
                                                            ? 'bg-emerald-100 text-emerald-800'
                                                            : (req.status || '').toLowerCase() === 'rejected'
                                                                ? 'bg-rose-100 text-rose-800'
                                                                : 'bg-amber-100 text-amber-800'
                                                    }`}>
                                                        {req.status || 'Pending'}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </motion.div>
                )}

                {/* TAB 3: LEAVE BALANCES */}
                {activeTab === 'balance' && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-4"
                    >
                        <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                            <FaBalanceScale className="text-sky-600" /> Student Leave Balances & Quota
                        </h2>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div className="p-5 rounded-2xl bg-sky-50 border border-sky-200 space-y-1">
                                <span className="text-[10px] font-bold text-sky-700 uppercase">Casual Leaves</span>
                                <p className="text-2xl font-black text-sky-900">{leaveBalances?.casual_leave || 12} Days</p>
                            </div>
                            <div className="p-5 rounded-2xl bg-emerald-50 border border-emerald-200 space-y-1">
                                <span className="text-[10px] font-bold text-emerald-700 uppercase">Medical Leaves</span>
                                <p className="text-2xl font-black text-emerald-900">{leaveBalances?.medical_leave || 5} Days</p>
                            </div>
                            <div className="p-5 rounded-2xl bg-indigo-50 border border-indigo-200 space-y-1">
                                <span className="text-[10px] font-bold text-indigo-700 uppercase">On Duty (OD) Quota</span>
                                <p className="text-2xl font-black text-indigo-900">{leaveBalances?.on_duty || 6} Days</p>
                            </div>
                        </div>
                    </motion.div>
                )}

            </div>
        </Layout>
    );
};

export default StudentLeaveApply;
