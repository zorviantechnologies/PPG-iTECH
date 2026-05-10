import { useState, useEffect, useMemo } from 'react';
import Layout from '../../components/Layout';
import api from '../../utils/api';
import { FaFileDownload, FaSearch, FaFingerprint, FaClock, FaIdBadge, FaCalendarDay, FaSync } from 'react-icons/fa';
import { motion, AnimatePresence } from 'framer-motion';
import Swal from 'sweetalert2';
import { formatTo12Hr } from '../../utils/timeFormatter';
import { finalizePrintWindow } from '../../utils/printUtils';

const BiometricHistory = () => {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const firstDayOfMonth = today.slice(0, 8) + '01';
    
    const [startDate, setStartDate] = useState(firstDayOfMonth);
    const [endDate, setEndDate] = useState(today);
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    const fetchHistory = async () => {
        setLoading(true);
        try {
            const response = await api.get(`/biometric/data?startDate=${startDate}&endDate=${endDate}`);
            setLogs(response.data);
        } catch (error) {
            console.error('Error fetching biometric history:', error);
            Swal.fire({
                icon: 'error',
                title: 'Fetch Error',
                text: 'Could not retrieve biometric history.'
            });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchHistory();
    }, [startDate, endDate]);

    const filteredLogs = useMemo(() => {
        return logs.filter(log => 
            (log.name || log.user_id || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (log.user_id || '').toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [logs, searchTerm]);

    const calculateHours = (intime, outtime) => {
        if (!intime || !outtime) return '—';
        const parseTime = (timeValue) => {
            const parsed = String(timeValue).trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
            if (!parsed) return null;
            const hours = Number(parsed[1]);
            const minutes = Number(parsed[2]);
            return (hours * 60) + minutes;
        };
        const inM = parseTime(intime);
        const outM = parseTime(outtime);
        if (inM === null || outM === null) return '—';
        const worked = outM >= inM ? (outM - inM) : ((24 * 60) - inM + outM);
        const h = Math.floor(worked / 60);
        const m = worked % 60;
        return `${h}h ${String(m).padStart(2, '0')}m`;
    };

    const handlePrint = async () => {
        if (filteredLogs.length === 0) {
            Swal.fire({ icon: 'warning', title: 'No Data', text: 'No records available for this report.' });
            return;
        }

        const printWindow = window.open('', '_blank');
        const titleText = 'Biometric Sync History Report';
        
        const rowsHtml = filteredLogs.map((log, idx) => `
            <tr>
                <td>${idx + 1}</td>
                <td>${log.user_id}</td>
                <td>${log.name || log.user_id}</td>
                <td>${log.department_name || '-'}</td>
                <td>${new Date(log.date).toLocaleDateString('en-GB')}</td>
                <td>${formatTo12Hr(log.intime)}</td>
                <td>${formatTo12Hr(log.outtime)}</td>
                <td>${calculateHours(log.intime, log.outtime)}</td>
                <td>${log.att_status || (log.outtime ? 'Completed' : 'Active')}</td>
                <td>${log.att_remarks || '-'}</td>
            </tr>
        `).join('');

        printWindow.document.write(`
            <html>
                <head>
                    <title>${titleText}</title>
                    <style>
                        body { font-family: 'Segoe UI', Arial, sans-serif; padding: 20px; color: #1e293b; }
                        .header { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 30px; border-bottom: 3px solid #0284c7; padding-bottom: 15px; }
                        h1 { margin: 0; color: #0369a1; font-size: 22pt; font-weight: 900; }
                        .meta { font-size: 10pt; color: #64748b; font-weight: bold; }
                        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                        th, td { border: 1px solid #e2e8f0; padding: 12px 8px; text-align: left; font-size: 10pt; }
                        th { background: #f8fafc; font-weight: 800; color: #334155; text-transform: uppercase; font-size: 9pt; }
                        tr:nth-child(even) { background: #fdfdfd; }
                        .brand { font-weight: 900; color: #0369a1; font-size: 14pt; }
                    </style>
                </head>
                <body>
                    <div class="header">
                        <div>
                            <h1>${titleText}</h1>
                            <p class="meta">Period: ${new Date(startDate).toLocaleDateString('en-GB')} to ${new Date(endDate).toLocaleDateString('en-GB')}</p>
                        </div>
                        <div style="text-align: right">
                            <div class="brand">PPG EMP HUB</div>
                            <div class="meta">Generated: ${new Date().toLocaleString('en-GB')}</div>
                        </div>
                    </div>
                    <table>
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>Emp ID</th>
                                <th>Name</th>
                                <th>Department</th>
                                <th>Date</th>
                                <th>In Time</th>
                                <th>Out Time</th>
                                <th>Duration</th>
                                <th>Status</th>
                                <th>Alerts/Remarks</th>
                            </tr>
                        </thead>
                        <tbody>${rowsHtml}</tbody>
                    </table>
                </body>
            </html>
        `);
        printWindow.document.close();
        await finalizePrintWindow({
            printWindow,
            title: titleText,
            delay: 500,
            modeLabel: 'the biometric sync report',
            closeAfterPrint: true
        });
    };

    return (
        <Layout>
            <div className="space-y-8">
                {/* Header */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div className="flex items-center gap-4">
                        <div className="h-14 w-14 rounded-3xl bg-sky-600 text-white flex items-center justify-center shadow-xl shadow-sky-200">
                            <FaFingerprint size={24} />
                        </div>
                        <div>
                            <h1 className="text-3xl font-black text-gray-800 tracking-tight">Biometric History</h1>
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em]">Archived device synchronization logs</p>
                        </div>
                    </div>
                    <button
                        onClick={handlePrint}
                        className="flex items-center gap-3 px-8 py-4 bg-sky-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-sky-700 transition-all shadow-lg shadow-sky-100 group"
                    >
                        <FaFileDownload className="text-sm group-hover:scale-110 transition-transform" />
                        Generate Report
                    </button>
                </div>

                {/* Filters */}
                <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-white p-8 rounded-[32px] shadow-xl shadow-sky-500/5 border border-sky-50"
                >
                    <div className="space-y-3">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">From Date</label>
                        <div className="relative">
                            <FaCalendarDay className="absolute left-4 top-1/2 -translate-y-1/2 text-sky-500" />
                            <input
                                type="date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                className="w-full pl-12 pr-4 py-4 bg-gray-50 border border-gray-100 rounded-2xl outline-none focus:ring-4 focus:ring-sky-100 focus:border-sky-500 transition-all font-bold text-gray-700 text-sm"
                            />
                        </div>
                    </div>
                    <div className="space-y-3">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">To Date</label>
                        <div className="relative">
                            <FaCalendarDay className="absolute left-4 top-1/2 -translate-y-1/2 text-sky-500" />
                            <input
                                type="date"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                className="w-full pl-12 pr-4 py-4 bg-gray-50 border border-gray-100 rounded-2xl outline-none focus:ring-4 focus:ring-sky-100 focus:border-sky-500 transition-all font-bold text-gray-700 text-sm"
                            />
                        </div>
                    </div>
                    <div className="space-y-3">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Quick Search</label>
                        <div className="relative">
                            <FaSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Name or Employee ID..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full pl-12 pr-4 py-4 bg-gray-50 border border-gray-100 rounded-2xl outline-none focus:ring-4 focus:ring-sky-100 focus:border-sky-500 transition-all font-bold text-gray-700 text-sm"
                            />
                        </div>
                    </div>
                </motion.div>

                {/* Table */}
                <div className="bg-white rounded-[40px] shadow-2xl shadow-sky-500/5 border border-sky-50 overflow-hidden relative">
                    {loading && (
                        <div className="absolute inset-0 bg-white/60 backdrop-blur-sm z-10 flex items-center justify-center">
                            <div className="h-10 w-10 border-4 border-sky-100 border-t-sky-600 rounded-full animate-spin" />
                        </div>
                    )}
                    
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-gray-50/50">
                                    <th className="px-8 py-6 text-[9px] font-black text-gray-400 uppercase tracking-widest">Employee Details</th>
                                    <th className="px-8 py-6 text-[9px] font-black text-gray-400 uppercase tracking-widest">Department</th>
                                    <th className="px-8 py-6 text-[9px] font-black text-gray-400 uppercase tracking-widest text-center">Date</th>
                                    <th className="px-8 py-6 text-[9px] font-black text-gray-400 uppercase tracking-widest text-center">Punches</th>
                                    <th className="px-8 py-6 text-[9px] font-black text-gray-400 uppercase tracking-widest text-center">Duration</th>
                                    <th className="px-8 py-6 text-[9px] font-black text-gray-400 uppercase tracking-widest text-right">Att. Status</th>
                                    <th className="px-8 py-6 text-[9px] font-black text-gray-400 uppercase tracking-widest text-right">Sync Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {filteredLogs.length > 0 ? (
                                    filteredLogs.map((log, idx) => (
                                        <motion.tr 
                                            key={log.id}
                                            initial={{ opacity: 0, x: -10 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ delay: idx * 0.01 }}
                                            className="hover:bg-sky-50/30 transition-colors"
                                        >
                                            <td className="px-8 py-5">
                                                <div className="flex items-center gap-3">
                                                    <div className="h-10 w-10 rounded-xl bg-gray-100 flex items-center justify-center text-sky-600 font-black text-xs">
                                                        {log.name?.charAt(0) || <FaIdBadge />}
                                                    </div>
                                                    <div>
                                                        <p className="text-[11px] font-black text-gray-700">{log.name || 'Unknown'}</p>
                                                        <p className="text-[9px] font-bold text-gray-400 uppercase">{log.user_id}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-8 py-5">
                                                <span className="text-[10px] font-black text-gray-500 uppercase tracking-wider bg-gray-100 px-3 py-1.5 rounded-lg">
                                                    {log.department_name || 'N/A'}
                                                </span>
                                            </td>
                                            <td className="px-8 py-5 text-center">
                                                <div className="flex flex-col items-center">
                                                    <span className="text-xs font-black text-gray-700">
                                                        {new Date(log.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                                                    </span>
                                                    <span className="text-[9px] font-bold text-gray-400 uppercase">
                                                        {new Date(log.date).toLocaleDateString('en-GB', { year: 'numeric' })}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-8 py-5">
                                                <div className="flex justify-center gap-3">
                                                    <div className="text-center group">
                                                        <p className="text-[8px] font-black text-emerald-500 uppercase mb-0.5 group-hover:scale-110 transition-transform">In</p>
                                                        <p className="text-[10px] font-black text-gray-700">{formatTo12Hr(log.intime)}</p>
                                                    </div>
                                                    <div className="w-px h-8 bg-gray-100 self-center" />
                                                    <div className="text-center group">
                                                        <p className="text-[8px] font-black text-rose-500 uppercase mb-0.5 group-hover:scale-110 transition-transform">Out</p>
                                                        <p className="text-[10px] font-black text-gray-700">{formatTo12Hr(log.outtime)}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-8 py-5 text-center">
                                                <div className="inline-flex items-center gap-2 bg-sky-50 text-sky-700 px-3 py-1.5 rounded-xl border border-sky-100">
                                                    <FaClock size={10} className="text-sky-400" />
                                                    <span className="text-[11px] font-black">{calculateHours(log.intime, log.outtime)}</span>
                                                </div>
                                            </td>
                                            <td className="px-8 py-5 text-right">
                                                <div className="flex flex-col items-end gap-1">
                                                    <span className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest border ${
                                                        (log.att_status || '').includes('LOP') ? 'bg-rose-50 text-rose-600 border-rose-100' :
                                                        (log.att_status || '').includes('Late') ? 'bg-orange-50 text-orange-600 border-orange-100' :
                                                        (log.att_status || '').startsWith('Present') ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                                                        'bg-gray-50 text-gray-600 border-gray-100'
                                                    }`}>
                                                        {log.att_status || 'Pending Sync'}
                                                    </span>
                                                    {log.att_remarks && (
                                                        <span className="text-[8px] font-bold text-gray-400 italic max-w-[120px] truncate" title={log.att_remarks}>
                                                            {log.att_remarks}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-8 py-5 text-right">
                                                <span className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest border ${
                                                    log.outtime ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-sky-50 text-sky-600 border-sky-100'
                                                }`}>
                                                    {log.outtime ? 'Completed' : 'Active'}
                                                </span>
                                            </td>
                                        </motion.tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan="6" className="px-8 py-20 text-center">
                                            <div className="flex flex-col items-center gap-4">
                                                <div className="h-16 w-16 bg-gray-50 rounded-full flex items-center justify-center text-gray-300">
                                                    <FaSync size={24} className="animate-spin-slow" />
                                                </div>
                                                <div className="space-y-1">
                                                    <p className="text-sm font-black text-gray-400 uppercase tracking-widest">No Records Found</p>
                                                    <p className="text-xs text-gray-300 font-bold">Try adjusting your date range or search terms.</p>
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                    {/* Footer */}
                    <div className="p-8 border-t border-gray-50 bg-gray-50/30 flex justify-between items-center text-[9px] font-black text-gray-400 uppercase tracking-widest">
                        <span>Showing {filteredLogs.length} Entries</span>
                        <span className="text-sky-500">PPG iTECH BIOMETRIC SYSTEMS</span>
                    </div>
                </div>
            </div>
        </Layout>
    );
};

export default BiometricHistory;
