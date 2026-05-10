import { useEffect, useState } from 'react';
import Layout from '../../components/Layout';
import api from '../../utils/api';
import Swal from 'sweetalert2';
import { FaEnvelopeOpenText, FaReply, FaSearch } from 'react-icons/fa';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';

const SalaryReports = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [reports, setReports] = useState([]);
    const [loading, setLoading] = useState(true);

    const fetchReports = async () => {
        setLoading(true);
        try {
            const { data } = await api.get('/salary/reports');
            setReports(Array.isArray(data) ? data : []);
        } catch (error) {
            console.error('Failed to fetch salary reports:', error);
            setReports([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchReports();
    }, []);

    const replyToReport = async (report) => {
        const { value } = await Swal.fire({
            title: `Reply to ${report.employee_name || report.emp_id}`,
            input: 'textarea',
            inputPlaceholder: 'Type admin reply...',
            inputValue: report.admin_reply || '',
            showCancelButton: true,
            confirmButtonText: 'Send Reply',
            preConfirm: (v) => {
                const text = String(v || '').trim();
                if (!text) {
                    Swal.showValidationMessage('Reply is required');
                    return null;
                }
                return text;
            }
        });

        if (!value) return;

        try {
            await api.put(`/salary/reports/${report.id}/reply`, { reply: value });
            await fetchReports();
            Swal.fire('Replied', 'Report reply sent successfully.', 'success');
        } catch (error) {
            console.error('Failed to reply report:', error);
            Swal.fire('Error', error?.response?.data?.message || 'Reply failed.', 'error');
        }
    };

    return (
        <Layout>
            <div className="max-w-7xl mx-auto">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-6">
                    <div>
                        <h1 className="text-3xl md:text-4xl font-black text-gray-800 tracking-tighter">Salary <span className="text-sky-600">Reports</span></h1>
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 mt-2">Employees can submit salary issues here. Admin can reply directly.</p>
                    </div>
                    <button
                        onClick={() => navigate(`/${user.role}/payroll`)}
                        className="bg-sky-600 text-white px-8 py-4 rounded-2xl shadow-xl shadow-sky-100 hover:bg-sky-700 transition-all flex items-center font-black uppercase tracking-widest text-xs active:scale-95 group"
                    >
                        <FaSearch className="mr-3 group-hover:scale-110 transition-transform" /> Back to Payroll
                    </button>
                </div>

                <div className="modern-card !p-0 overflow-hidden border-sky-100">
                    <div className="bg-sky-50/30 p-6 border-b border-sky-50 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <h2 className="text-lg font-black text-gray-800 uppercase tracking-widest">Reports Ledger</h2>
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-gray-50/50">
                            <tr>
                                <th className="p-6 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-sky-50 text-left">Employee</th>
                                <th className="p-6 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-sky-50 text-left">Type</th>
                                <th className="p-6 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-sky-50 text-left">Reason</th>
                                <th className="p-6 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-sky-50 text-left">Status</th>
                                <th className="p-6 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-sky-50 text-left">Admin Reply</th>
                                <th className="p-6 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-sky-50 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {!loading && reports.map((r) => (
                                <tr key={r.id} className="hover:bg-sky-50/20 transition-all group border-b border-sky-50/10">
                                    <td className="p-6">
                                        <div className="font-black text-sm text-gray-800">{r.employee_name || r.emp_id}</div>
                                        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{r.emp_id} {r.department_name ? `| ${r.department_name}` : ''}</div>
                                    </td>
                                    <td className="p-6">
                                        <span className="text-xs font-black text-gray-600 bg-gray-50 px-3 py-1.5 rounded-xl border border-gray-100 whitespace-nowrap">{r.report_type}</span>
                                    </td>
                                    <td className="p-6 text-sm text-gray-700 font-bold whitespace-pre-wrap">{r.reason}</td>
                                    <td className="p-6">
                                        {String(r.status).toLowerCase() === 'replied' ? (
                                            <span className="inline-block text-[9px] font-black uppercase tracking-[0.1em] px-4 py-1.5 rounded-xl border-2 shadow-sm bg-emerald-600 text-white border-emerald-600">Replied</span>
                                        ) : (
                                            <span className="inline-block text-[9px] font-black uppercase tracking-[0.1em] px-4 py-1.5 rounded-xl border-2 shadow-sm bg-amber-50 text-amber-600 border-amber-100">{r.status}</span>
                                        )}
                                    </td>
                                    <td className="p-6 text-sm text-gray-700 whitespace-pre-wrap">{r.admin_reply || '-'}</td>
                                    <td className="p-6">
                                        <div className="flex justify-end gap-2">
                                            <button
                                                onClick={() => replyToReport(r)}
                                                className="h-10 px-4 bg-indigo-50 text-indigo-600 rounded-xl hover:bg-indigo-600 hover:text-white transition-all shadow-sm flex items-center justify-center active:scale-90 font-black text-[10px] uppercase tracking-widest gap-2"
                                            >
                                                <FaReply /> Reply
                                            </button>
                                            <button
                                                onClick={() => navigate(`/${user.role}/payroll/employee/${encodeURIComponent(r.emp_id)}`)}
                                                className="h-10 w-10 bg-sky-50 text-sky-600 rounded-xl hover:bg-sky-600 hover:text-white transition-all shadow-sm flex items-center justify-center active:scale-90 group/btn"
                                                title="View Salary"
                                            >
                                                <FaSearch className="group-hover/btn:scale-125 transition-transform" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}

                            {loading && (
                                <tr>
                                    <td colSpan={6} className="p-32 text-center text-gray-500">
                                        <div className="flex flex-col items-center gap-4">
                                            <div className="h-14 w-14 border-4 border-sky-100 border-t-sky-600 rounded-full animate-spin"></div>
                                            <p className="text-[10px] font-black text-sky-500 uppercase tracking-[0.2em] mt-2">Loading reports...</p>
                                        </div>
                                    </td>
                                </tr>
                            )}

                            {!loading && reports.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="p-32 text-center">
                                        <div className="flex flex-col items-center gap-6 opacity-20 grayscale">
                                            <FaEnvelopeOpenText size={64} className="text-gray-400" />
                                            <div>
                                                <p className="text-xl font-black text-gray-800 tracking-tight">No Reports</p>
                                                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 mt-1">No salary reports found.</p>
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                    </div>
                </div>
            </div>
        </Layout>
    );
};

export default SalaryReports;
