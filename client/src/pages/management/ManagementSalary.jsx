import { useState, useEffect } from 'react';
import Layout from '../../components/Layout';
import api from '../../utils/api';
import { finalizePrintWindow } from '../../utils/printUtils';
import { FaFilter, FaFileAlt, FaClock, FaMoneyBillWave, FaShieldAlt, FaChartLine, FaWallet, FaCheckCircle } from 'react-icons/fa';
import { motion, AnimatePresence } from 'framer-motion';

const ManagementSalary = () => {
    const [salaries, setSalaries] = useState([]);
    const now = new Date();
    const firstDay = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
    const [fromDate, setFromDate] = useState(firstDay);
    const [toDate, setToDate] = useState(lastDay);
    const [loading, setLoading] = useState(true);
    const [activeRole, setActiveRole] = useState('all');

    useEffect(() => {
        fetchSalaries();
    }, [fromDate, toDate]);

    const fetchSalaries = async () => {
        setLoading(true);
        try {
            const d = new Date(fromDate);
            const m = d.getMonth() + 1;
            const y = d.getFullYear();
            const { data } = await api.get(`/salary?month=${m}&year=${y}`);
            setSalaries(data);
            setLoading(false);
        } catch (error) {
            console.error(error);
            setLoading(false);
        }
    };

    const escapeHtml = (value) => String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

    const handlePrint = async () => {
        const items = salaries.filter(s => activeRole === 'all' || s.role === activeRole);
        if (!items || items.length === 0) return;

        const printWindow = window.open('', '_blank', 'width=1200,height=800');
        if (!printWindow) return;

        const title = 'Salary Report';
        const headings = ['#', 'Name', 'Department', 'Role', 'Present', 'Monthly Salary', 'Computed Pay', 'Status'];
        const useLandscape = items.length > 15;

        const rowsHtml = items.map((s, idx) => `
            <tr>
                <td style="text-align:center">${idx + 1}</td>
                <td>${escapeHtml(s.name)}</td>
                <td>${escapeHtml(s.department_name)}</td>
                <td>${escapeHtml(s.role)}</td>
                <td style="text-align:center">${s.total_present ?? 0}</td>
                <td style="text-align:right">&#8377;${Number(s.monthly_salary ?? 0).toLocaleString()}</td>
                <td style="text-align:right">&#8377;${Number(s.calculated_salary ?? 0).toLocaleString()}</td>
                <td>${escapeHtml(s.status)}</td>
            </tr>
        `).join('');

        const totalGross = items.reduce((acc, s) => acc + parseFloat(s.calculated_salary || 0), 0);
        const totalPaid = items.filter(s => s.status === 'Paid').reduce((acc, s) => acc + parseFloat(s.calculated_salary || 0), 0);
        const totalPending = items.filter(s => s.status === 'Pending').reduce((acc, s) => acc + parseFloat(s.calculated_salary || 0), 0);

        const d = new Date(fromDate);
        const periodLabel = d.toLocaleString('default', { month: 'long', year: 'numeric' });

        printWindow.document.write(`
            <!doctype html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>${escapeHtml(title)}</title>
                <style>
                    @page { size: ${useLandscape ? 'landscape' : 'portrait'}; margin: 0.5cm; }
                    * { box-sizing: border-box; }
                    body { font-family: Arial, Helvetica, sans-serif; padding: 12px; color: #111827; margin: 0; font-size: 10pt; position: relative; }
                    h1 { margin: 0 0 6px; font-size: 16pt; font-weight: bold; color: #1e3a8a; }
                    .print-brand { position: absolute; top: 12px; right: 12px; text-align: right; }
                    .print-brand .app-name { font-size: 11pt; font-weight: 800; color: #1e3a8a; margin: 0; letter-spacing: 0.5px; }
                    .print-brand .print-time { font-size: 8pt; color: #6b7280; margin: 2px 0 0; }
                    .meta { margin-bottom: 12px; color: #6b7280; font-size: 9pt; border-bottom: 2px solid #e5e7eb; padding-bottom: 6px; }
                    table { width: 100%; border-collapse: collapse; table-layout: auto; }
                    th, td { border: 1px solid #9ca3af; padding: 6px 8px; font-size: 9pt; text-align: left; vertical-align: top; word-wrap: break-word; }
                    th { background: #e5e7eb; font-weight: 700; text-transform: uppercase; font-size: 8pt; letter-spacing: 0.3px; color: #374151; }
                    tr:nth-child(even) { background: #f9fafb; }
                    tr { page-break-inside: avoid; }
                    thead { display: table-header-group; }
                    .summary { margin-top: 16px; display: flex; gap: 24px; font-size: 10pt; font-weight: 700; }
                    .summary span { color: #6b7280; font-weight: 400; }
                    @media print { body { padding: 0; } }
                </style>
            </head>
            <body>
                <div class="print-brand">
                    <p class="app-name">PPG EMP HUB</p>
                    <p class="print-time">${new Date().toLocaleString('en-GB')}</p>
                </div>
                <h1>${escapeHtml(title)}</h1>
                <div class="meta">
                    Period: ${escapeHtml(periodLabel)}${activeRole !== 'all' ? ` | Role: ${escapeHtml(activeRole.toUpperCase())}` : ''} |
                    Records: ${items.length}
                </div>
                <table>
                    <thead>
                        <tr>${headings.map(h => `<th>${escapeHtml(h)}</th>`).join('')}</tr>
                    </thead>
                    <tbody>${rowsHtml}</tbody>
                </table>
                <div class="summary">
                    <div><span>Gross Total:</span> &#8377;${totalGross.toLocaleString()}</div>
                    <div><span>Paid:</span> &#8377;${totalPaid.toLocaleString()}</div>
                    <div><span>Pending:</span> &#8377;${totalPending.toLocaleString()}</div>
                </div>
            </body>
            </html>
        `);
        printWindow.document.close();
        await finalizePrintWindow({
            printWindow,
            title,
            delay: 250,
            modeLabel: 'the salary report'
        });
    };

    const handlePrintSlip = async (s) => {
        const printWindow = window.open('', '_blank', 'width=800,height=600');
        if (!printWindow) return;

        const d = new Date(fromDate);
        const periodLabel = d.toLocaleString('default', { month: 'long', year: 'numeric' });

        printWindow.document.write(`
            <!doctype html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>Salary Slip - ${escapeHtml(s.name)}</title>
                <style>
                    body { font-family: Arial, sans-serif; padding: 40px; color: #333; line-height: 1.6; }
                    .header { text-align: center; border-bottom: 2px solid #7c3aed; padding-bottom: 20px; margin-bottom: 30px; }
                    .header h1 { margin: 0; color: #5b21b6; font-size: 24px; }
                    .header p { margin: 5px 0; color: #6b7280; font-size: 14px; }
                    .slip-title { text-align: center; font-size: 18px; font-weight: bold; margin-bottom: 30px; text-decoration: underline; }
                    .grid { display: grid; grid-template-cols: 1fr 1fr; gap: 20px; margin-bottom: 30px; }
                    .box { border: 1px solid #e5e7eb; padding: 15px; border-radius: 8px; }
                    .label { font-weight: bold; color: #6b7280; font-size: 12px; text-transform: uppercase; }
                    .value { font-size: 16px; font-weight: bold; margin-top: 5px; }
                    .table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                    .table th, .table td { border: 1px solid #e5e7eb; padding: 12px; text-align: left; }
                    .table th { background: #f9fafb; color: #6b7280; font-size: 12px; }
                    .total-row { background: #f3f4f6; font-weight: bold; }
                    .footer { margin-top: 50px; display: flex; justify-content: space-between; }
                    .sig { border-top: 1px solid #333; width: 200px; text-align: center; padding-top: 10px; font-size: 12px; }
                    @media print { body { padding: 0; } .no-print { display: none; } }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>PPG EDUCATION INSTITUTIONS</h1>
                    <p>Management Payroll - Pay Slip</p>
                </div>
                
                <div class="slip-title">SALARY SLIP FOR ${escapeHtml(periodLabel).toUpperCase()}</div>

                <div class="grid">
                    <div class="box">
                        <div class="label">Employee Name</div>
                        <div class="value">${escapeHtml(s.name)}</div>
                        <div class="label" style="margin-top:10px">Employee ID</div>
                        <div class="value">${escapeHtml(s.emp_id)}</div>
                    </div>
                    <div class="box">
                        <div class="label">Department</div>
                        <div class="value">${escapeHtml(s.department_name || 'N/A')}</div>
                        <div class="label" style="margin-top:10px">Designation</div>
                        <div class="value">${escapeHtml(s.role)}</div>
                    </div>
                </div>

                <table class="table">
                    <thead>
                        <tr>
                            <th>Description</th>
                            <th style="text-align:right">Details</th>
                            <th style="text-align:right">Amount</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>Basic Monthly Salary</td>
                            <td style="text-align:right">-</td>
                            <td style="text-align:right">₹${Number(s.monthly_salary).toLocaleString()}</td>
                        </tr>
                        <tr>
                            <td>Attendance Details</td>
                            <td style="text-align:right">Paid Days: ${s.total_present} / ${new Date(s.year, s.month, 0).getDate()}</td>
                            <td style="text-align:right">-</td>
                        </tr>
                        <tr>
                            <td>Loss of Pay (LOP) Deduction</td>
                            <td style="text-align:right">${s.total_lop || 0} Days</td>
                            <td style="text-align:right; color:#e11d48">- ₹${(Number(s.monthly_salary) - Number(s.calculated_salary)).toLocaleString()}</td>
                        </tr>
                        <tr class="total-row">
                            <td colspan="2" style="text-align:right">NET PAYROLL AMOUNT</td>
                            <td style="text-align:right">₹${Number(s.calculated_salary).toLocaleString()}</td>
                        </tr>
                    </tbody>
                </table>

                <div class="footer">
                    <div class="sig">Staff Signature</div>
                    <div class="sig">Management Authority</div>
                </div>
            </body>
            </html>
        `);
        printWindow.document.close();
        await finalizePrintWindow({
            printWindow,
            title: `Salary Slip - ${s.name}`,
            delay: 500,
            modeLabel: 'the salary slip'
        });
    };

    return (
        <Layout>
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="max-w-7xl mx-auto"
            >
                {/* Header Section */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-6">
                    <div>
                        <h1 className="text-3xl md:text-4xl font-black text-gray-800 tracking-tighter">Management <span className="text-[#7C3AED]">Salary</span></h1>
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 mt-2">Overview of salaries and reports.</p>
                    </div>
                </div>

                {/* Period Select Row at Top */}
                <div className="modern-card p-6 mb-10 border-purple-100 no-print flex flex-col md:flex-row gap-6 md:justify-between md:items-end">
                    <div className="space-y-4 flex-1">
                        <div className="flex items-center gap-3">
                            <div className="bg-purple-100 p-2 rounded-lg text-purple-600">
                                <FaFilter size={14} />
                            </div>
                            <h2 className="text-sm font-black text-gray-800 uppercase tracking-widest">Filter by Period</h2>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-4">
                            <div className="relative group flex-1 max-w-[200px]">
                                <input
                                    type="date"
                                    value={fromDate}
                                    onChange={(e) => setFromDate(e.target.value)}
                                    className="w-full bg-gray-50 text-gray-800 text-sm font-bold px-4 py-3 rounded-xl border border-gray-200 focus:border-purple-500 focus:ring-4 focus:ring-purple-500/10 transition-all outline-none"
                                />
                            </div>
                            <div className="flex items-center text-gray-400 font-bold px-2">TO</div>
                            <div className="relative group flex-1 max-w-[200px]">
                                <input
                                    type="date"
                                    value={toDate}
                                    onChange={(e) => setToDate(e.target.value)}
                                    className="w-full bg-gray-50 text-gray-800 text-sm font-bold px-4 py-3 rounded-xl border border-gray-200 focus:border-purple-500 focus:ring-4 focus:ring-purple-500/10 transition-all outline-none"
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Role Tabs */}
                <div className="flex flex-wrap gap-4 mb-6 no-print">
                    {[
                        { id: 'all', label: 'All Personnel', icon: <FaChartLine /> },
                        { id: 'principal', label: 'Principal', icon: <FaShieldAlt /> },
                        { id: 'hod', label: 'HODs', icon: <FaShieldAlt /> },
                        { id: 'staff', label: 'Staff members', icon: <FaFileAlt /> }
                    ].map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveRole(tab.id)}
                            className={`flex flex-1 sm:flex-none items-center justify-center gap-2 px-6 py-3 rounded-xl font-bold text-xs transition-all duration-300 ${activeRole === tab.id
                                ? 'bg-purple-600 text-white shadow-lg shadow-purple-200 scale-105'
                                : 'bg-white text-gray-500 hover:bg-purple-50 hover:text-purple-600 border border-gray-200'
                                }`}
                        >
                            <span>{tab.icon}</span>
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Master Analytical Matrix */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10 no-print">
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        className="bg-white p-6 rounded-3xl shadow-lg shadow-purple-50/50 border border-purple-50 relative group overflow-hidden"
                    >
                        <div className="flex items-center justify-between gap-4">
                            <div className="flex items-center gap-4">
                                <div className="h-10 w-10 rounded-xl bg-purple-600 flex items-center justify-center text-white shadow-lg shadow-purple-100">
                                    <FaMoneyBillWave size={16} />
                                </div>
                                <div>
                                    <h3 className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Gross Total</h3>
                                    <p className="text-lg font-black text-gray-800 tracking-tighter text-purple-600">
                                        ₹{salaries
                                            .filter(s => activeRole === 'all' || (s.role || '').toLowerCase() === activeRole.toLowerCase())
                                            .reduce((acc, curr) => acc + parseFloat(curr.calculated_salary), 0).toLocaleString()}
                                    </p>
                                </div>
                            </div>
                            <div className="text-[9px] font-bold text-purple-500 uppercase tracking-widest opacity-40 group-hover:opacity-100 transition-opacity">Total Salary</div>
                        </div>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        className="bg-white p-6 rounded-3xl shadow-lg shadow-purple-50/50 border border-purple-50 relative group overflow-hidden"
                    >
                        <div className="flex items-center justify-between gap-4">
                            <div className="flex items-center gap-4">
                                <div className="h-10 w-10 rounded-xl bg-emerald-500 flex items-center justify-center text-white shadow-lg shadow-emerald-100">
                                    <FaWallet size={16} />
                                </div>
                                <div>
                                    <h3 className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Paid Amount</h3>
                                    <p className="text-lg font-black text-gray-800 tracking-tighter text-emerald-600">
                                        ₹{salaries
                                            .filter(s => (activeRole === 'all' || (s.role || '').toLowerCase() === activeRole.toLowerCase()) && s.status === 'Paid')
                                            .reduce((acc, curr) => acc + parseFloat(curr.calculated_salary), 0).toLocaleString()}
                                    </p>
                                </div>
                            </div>
                            <div className="text-[9px] font-bold text-emerald-500 uppercase tracking-widest opacity-40 group-hover:opacity-100 transition-opacity">Paid</div>
                        </div>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        className="bg-white p-6 rounded-3xl shadow-lg shadow-purple-50/50 border border-purple-50 relative group overflow-hidden"
                    >
                        <div className="flex items-center justify-between gap-4">
                            <div className="flex items-center gap-4">
                                <div className="h-10 w-10 rounded-xl bg-amber-400 flex items-center justify-center text-white shadow-lg shadow-amber-100">
                                    <FaClock size={16} />
                                </div>
                                <div>
                                    <h3 className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Pending Amount</h3>
                                    <p className="text-lg font-black text-gray-800 tracking-tighter text-amber-500">
                                        ₹{salaries
                                            .filter(s => (activeRole === 'all' || (s.role || '').toLowerCase() === activeRole.toLowerCase()) && s.status === 'Pending')
                                            .reduce((acc, curr) => acc + parseFloat(curr.calculated_salary), 0).toLocaleString()}
                                    </p>
                                </div>
                            </div>
                            <div className="text-[9px] font-bold text-amber-500 uppercase tracking-widest opacity-40 group-hover:opacity-100 transition-opacity">Unpaid</div>
                        </div>
                    </motion.div>
                </div>

                {/* Master Ledger Table */}
                <div className="mb-10 modern-card !p-0 overflow-hidden border-purple-100">
                    <div className="bg-purple-50/30 p-6 border-b border-purple-50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <h2 className="text-lg font-black text-gray-800 uppercase tracking-widest">Master Ledger</h2>
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead className="bg-gray-50/50">
                                <tr>
                                    <th className="p-6 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-purple-50 text-left">Employee</th>
                                    <th className="p-6 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-purple-50 text-center">Attendance</th>
                                    <th className="p-6 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-purple-50 text-right">Computed Pay</th>
                                    <th className="p-6 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-purple-50 text-center">Status</th>
                                    <th className="p-6 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-purple-50 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                <AnimatePresence mode="popLayout">
                                    {salaries
                                        .filter(s => activeRole === 'all' || (s.role || '').toLowerCase() === activeRole.toLowerCase())
                                        .map((s, idx) => (
                                            <motion.tr
                                                key={s.id}
                                                initial={{ opacity: 0, x: 20 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                exit={{ opacity: 0, x: -20 }}
                                                transition={{ delay: idx * 0.03 }}
                                                className="hover:bg-purple-50/20 transition-all group border-b border-purple-50/10"
                                            >
                                                <td className="p-6">
                                                    <div className="flex items-center gap-4">
                                                        <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-purple-50 to-white border border-purple-100 flex items-center justify-center text-purple-600 font-black text-lg shadow-sm group-hover:scale-110 group-hover:rotate-3 transition-all overflow-hidden shrink-0">
                                                            <img src={s.profile_pic || `https://ui-avatars.com/api/?name=${encodeURIComponent(s.name || '?')}&size=100&background=9333ea&color=fff&bold=true`} alt="" className="h-full w-full object-cover" />
                                                        </div>
                                                        <div>
                                                            <p className="text-sm font-black text-gray-800 tracking-tight">{s.name}</p>
                                                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">{s.emp_id} {s.department_name ? `| ${s.department_name}` : ''}</p>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="p-6">
                                                    <div className="flex flex-col items-center gap-3">
                                                        <div className="flex gap-4 text-[9px] font-black uppercase tracking-widest">
                                                            <span className="text-purple-500 bg-purple-50 px-2 py-1 rounded-md" title="Total Payable Days">PAID: {s.total_present}</span>
                                                            <span className="text-gray-400 bg-gray-50 px-2 py-1 rounded-md" title="Total Days in Month">MONTH: {new Date(s.year, s.month, 0).getDate()}</span>
                                                            <span className="text-rose-500 bg-rose-50 px-2 py-1 rounded-md" title="Loss of Pay Days">LOP: {s.total_lop || 0}</span>
                                                        </div>
                                                        <div className="w-32 bg-gray-100 h-1.5 rounded-full overflow-hidden shadow-inner p-px">
                                                            <motion.div
                                                                initial={{ width: 0 }}
                                                                animate={{ width: `${(s.total_present / new Date(s.year, s.month, 0).getDate()) * 100}%` }}
                                                                className="bg-gradient-to-r from-purple-400 to-purple-600 h-full rounded-full shadow-[0_0_12px_rgba(124,58,237,0.3)]"
                                                            ></motion.div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="p-6 text-right">
                                                    <div className="flex flex-col items-end gap-1">
                                                        <span className="text-[10px] text-gray-400 line-through font-bold tracking-widest mb-1">₹{Number(s.monthly_salary || 0).toLocaleString()}</span>
                                                        <span className="text-sm font-black text-gray-700 bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-100 whitespace-nowrap">₹{Number(s.calculated_salary || 0).toLocaleString()}</span>
                                                    </div>
                                                </td>
                                                <td className="p-6 text-center">
                                                    {String(s.status).toLowerCase() === 'paid' ? (
                                                        <span className="inline-block text-[9px] font-black uppercase tracking-[0.1em] px-4 py-1.5 rounded-xl border-2 shadow-sm bg-emerald-600 text-white border-emerald-600">Paid</span>
                                                    ) : (
                                                        <span className="inline-block text-[9px] font-black uppercase tracking-[0.1em] px-4 py-1.5 rounded-xl border-2 shadow-sm bg-amber-50 text-amber-600 border-amber-100 animate-pulse">Pending</span>
                                                    )}
                                                </td>
                                                <td className="p-6 text-right">
                                                    <button
                                                        onClick={() => handlePrintSlip(s)}
                                                        className="h-10 w-10 bg-purple-50 text-purple-600 rounded-xl flex items-center justify-center hover:bg-purple-600 hover:text-white transition-all active:scale-95 shadow-sm border border-purple-100 mx-auto lg:ml-auto lg:mr-0 group/btn"
                                                        title="Slip Report"
                                                    >
                                                        <FaFileAlt className="group-hover/btn:scale-110 transition-transform" />
                                                    </button>
                                                </td>
                                            </motion.tr>
                                        ))}
                                </AnimatePresence>
                            </tbody>
                        </table>
                    </div>
                </div>
            </motion.div>
        </Layout>
    );
};

export default ManagementSalary;
