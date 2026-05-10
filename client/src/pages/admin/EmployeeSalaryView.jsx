import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Layout from '../../components/Layout';
import api from '../../utils/api';
import { FaArrowLeft } from 'react-icons/fa';
import { useAuth } from '../../context/AuthContext';

const toCurrency = (v) => Number(v || 0).toLocaleString('en-IN');
const getWithPayDays = (row) => Number(row?.with_pay_count ?? row?.total_present ?? 0);
const getWithoutPayDays = (row) => Number(row?.without_pay_count ?? row?.total_lop ?? 0);

const EmployeeSalaryView = () => {
    const { empId } = useParams();
    const { user } = useAuth();
    const navigate = useNavigate();
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchTimeline = async () => {
            setLoading(true);
            try {
                const { data } = await api.get(`/salary/timeline?empId=${encodeURIComponent(empId || '')}`);
                setRows(Array.isArray(data) ? data : []);
            } catch (error) {
                console.error('Failed to fetch employee salary timeline:', error);
                setRows([]);
            } finally {
                setLoading(false);
            }
        };

        fetchTimeline();
    }, [empId]);

    return (
        <Layout>
            <div className="max-w-6xl mx-auto">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-6">
                    <div>
                        <h1 className="text-3xl md:text-4xl font-black text-gray-800 tracking-tighter">Employee <span className="text-sky-600">Salary</span></h1>
                        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mt-2">Employee ID: {empId}</p>
                    </div>
                    <button
                        onClick={() => navigate(`/${user.role}/payroll/history`)}
                        className="bg-sky-600 text-white px-8 py-4 rounded-2xl shadow-xl shadow-sky-100 hover:bg-sky-700 transition-all flex items-center font-black uppercase tracking-widest text-xs active:scale-95 group"
                    >
                        <FaArrowLeft className="mr-3 group-hover:-translate-x-1 transition-transform" /> Back
                    </button>
                </div>

                <div className="modern-card !p-0 overflow-hidden border-sky-100">
                    <div className="bg-sky-50/30 p-6 border-b border-sky-50 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <h2 className="text-lg font-black text-gray-800 uppercase tracking-widest">Salary Ledger</h2>
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-gray-50/50">
                            <tr>
                                <th className="p-6 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-sky-50">Period</th>
                                <th className="p-6 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-sky-50 text-right">With/Without Pay</th>
                                <th className="p-6 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-sky-50 text-right">Gross</th>
                                <th className="p-6 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-sky-50 text-right">Deductions</th>
                                <th className="p-6 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-sky-50 text-right">Net</th>
                                <th className="p-6 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-sky-50 text-center">Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {!loading && rows.map((r) => (
                                <tr key={r.id} className="hover:bg-sky-50/20 transition-all group border-b border-sky-50/10">
                                    <td className="p-6">
                                        <span className="text-xs font-black text-gray-600 bg-gray-50 px-3 py-1.5 rounded-xl border border-gray-100 whitespace-nowrap">{r.from_date || '-'} to {r.to_date || '-'}</span>
                                    </td>
                                    <td className="p-6 text-right">
                                        <div className="flex flex-col items-end gap-1">
                                            <span className="text-sm font-black text-emerald-600">{getWithPayDays(r).toFixed(1)} <span className="text-[9px] text-gray-400 uppercase">Paid</span></span>
                                            <span className="text-sm font-black text-rose-600">{getWithoutPayDays(r).toFixed(1)} <span className="text-[9px] text-gray-400 uppercase">Unpaid</span></span>
                                        </div>
                                    </td>
                                    <td className="p-6 text-right">
                                        <span className="text-sm font-black text-gray-700 bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-100 whitespace-nowrap">Rs {toCurrency(r.gross_salary || r.monthly_salary || 0)}</span>
                                    </td>
                                    <td className="p-6 text-right">
                                        <span className="text-sm font-black text-rose-600 bg-rose-50 px-3 py-1.5 rounded-lg border border-rose-100 whitespace-nowrap">Rs {toCurrency(r.deductions_applied || 0)}</span>
                                    </td>
                                    <td className="p-6 text-right">
                                        <span className="text-sm font-black text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-100 whitespace-nowrap">Rs {toCurrency(r.calculated_salary || 0)}</span>
                                    </td>
                                    <td className="p-6 text-center">
                                        {String(r.status).toLowerCase() === 'paid' ? (
                                            <span className="inline-block text-[9px] font-black uppercase tracking-[0.1em] px-4 py-1.5 rounded-xl border-2 shadow-sm bg-emerald-600 text-white border-emerald-600">Paid</span>
                                        ) : (
                                            <span className="inline-block text-[9px] font-black uppercase tracking-[0.1em] px-4 py-1.5 rounded-xl border-2 shadow-sm bg-amber-50 text-amber-600 border-amber-100">Pending</span>
                                        )}
                                    </td>
                                </tr>
                            ))}

                            {loading && (
                                <tr>
                                    <td colSpan={6} className="p-32 text-center text-gray-500">
                                        <div className="flex flex-col items-center gap-4">
                                            <div className="h-14 w-14 border-4 border-sky-100 border-t-sky-600 rounded-full animate-spin"></div>
                                            <p className="text-[10px] font-black text-sky-500 uppercase tracking-[0.2em] mt-2">Loading records...</p>
                                        </div>
                                    </td>
                                </tr>
                            )}

                            {!loading && rows.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="p-32 text-center text-gray-400">
                                        <div className="flex flex-col items-center gap-6 opacity-20 grayscale">
                                            <FaArrowLeft size={64} className="text-gray-400" />
                                            <div>
                                                <p className="text-xl font-black text-gray-800 tracking-tight">No Records</p>
                                                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 mt-1">No salary records found for this view.</p>
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

export default EmployeeSalaryView;
