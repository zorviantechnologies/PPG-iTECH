import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    Activity, 
    Search, 
    Filter, 
    RefreshCcw, 
    Printer,
    User, 
    Clock, 
    Shield, 
    AlertCircle, 
    ExternalLink,
    Terminal,
    MapPin,
    Eye
} from 'lucide-react';
import api from '../../utils/api';
import Layout from '../../components/Layout';
import Swal from 'sweetalert2';
import { formatTimestamp } from '../../utils/timeFormatter';

const ActivityLogs = () => {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterAction, setFilterAction] = useState('ALL');
    const [selectedLog, setSelectedLog] = useState(null);

    const fetchLogs = async () => {
        setLoading(true);
        try {
            const { data } = await api.get('/activity-logs');
            setLogs(data);
        } catch (error) {
            console.error('Fetch Logs Error:', error);
            Swal.fire({
                icon: 'error',
                title: 'Failed to Fetch Logs',
                text: 'Could not retrieve security audit logs from the server.',
                confirmButtonColor: '#2563eb'
            });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchLogs();
    }, []);

    const normalizeLog = (log = {}) => {
        const rawDetails = log.details;
        let parsedDetails = null;

        if (rawDetails && typeof rawDetails === 'object' && !Array.isArray(rawDetails)) {
            parsedDetails = rawDetails;
        } else if (typeof rawDetails === 'string' && rawDetails.trim().startsWith('{')) {
            try {
                parsedDetails = JSON.parse(rawDetails);
            } catch {
                parsedDetails = null;
            }
        }

        return {
            ...log,
            created_at: log.created_at || null,
            user_name: String(log.user_name || 'NA'),
            emp_id: String(log.emp_id || 'NA'),
            action: String(log.action || 'UNKNOWN'),
            details_normalized: parsedDetails
        };
    };

    const filteredLogs = logs.filter(log => {
        const matchesSearch = 
            log.user_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            log.emp_id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            log.action?.toLowerCase().includes(searchTerm.toLowerCase());
        
        const matchesAction = filterAction === 'ALL' || log.action === filterAction;
        
        return matchesSearch && matchesAction;
    }).map(normalizeLog);

    const failedLogins = logs.filter(l => l.action === 'FAILED_LOGIN');

    const uniqueActions = ['ALL', ...new Set(logs.map(l => l.action))];

    const getActionColor = (action) => {
        switch (action) {
            case 'LOGIN': return 'text-emerald-600 bg-emerald-50 border-emerald-100';
            case 'FAILED_LOGIN': return 'text-red-700 bg-red-100 border-red-200 animate-pulse';
            case 'DELETE_EMPLOYEE': return 'text-rose-600 bg-rose-50 border-rose-100';
            case 'UPDATE_EMPLOYEE': return 'text-amber-600 bg-amber-50 border-amber-100';
            case 'CREATE_EMPLOYEE': return 'text-blue-600 bg-blue-50 border-blue-100';
            case 'UPDATE_PROFILE_PIC': return 'text-indigo-600 bg-indigo-50 border-indigo-100';
            default: return 'text-slate-600 bg-slate-50 border-slate-100';
        }
    };

    const handlePrintLogs = () => {
        const safeRows = filteredLogs || [];
        if (!safeRows.length) {
            Swal.fire({
                icon: 'info',
                title: 'No Data',
                text: 'No logs available for print preview.'
            });
            return;
        }

        const escapeHtml = (value) => String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');

        const rowsHtml = safeRows.map((log, index) => `
            <tr>
                <td>${index + 1}</td>
                <td>${escapeHtml(log.created_at ? new Date(log.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'NA')} ${escapeHtml(log.created_at ? formatTimestamp(log.created_at) : 'NA')}</td>
                <td>${escapeHtml(log.user_name || 'NA')}</td>
                <td>${escapeHtml(log.emp_id || 'NA')}</td>
                <td>${escapeHtml((log.action || 'UNKNOWN').replace(/_/g, ' '))}</td>
            </tr>
        `).join('');

        const printWindow = window.open('', '_blank', 'width=1200,height=800');
        if (!printWindow) {
            Swal.fire({
                icon: 'warning',
                title: 'Popup Blocked',
                text: 'Allow popups to open print preview.'
            });
            return;
        }

        printWindow.document.write(`
            <!doctype html>
            <html>
                <head>
                    <meta charset="UTF-8" />
                    <title>Detail Logs Print Preview</title>
                    <style>
                        @page { size: A4 landscape; margin: 10mm; }
                        body { font-family: Arial, sans-serif; color: #0f172a; margin: 0; padding: 0; }
                        .wrap { padding: 16px; }
                        .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; }
                        .title { margin: 0; font-size: 20px; font-weight: 800; }
                        .meta { margin-top: 4px; font-size: 11px; color: #475569; }
                        table { width: 100%; border-collapse: collapse; table-layout: fixed; }
                        th, td { border: 1px solid #cbd5e1; padding: 8px; font-size: 11px; text-align: left; word-break: break-word; }
                        th { background: #f1f5f9; font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; }
                        tbody tr:nth-child(even) { background: #f8fafc; }
                        .center { text-align: center; }
                    </style>
                </head>
                <body>
                    <div class="wrap">
                        <div class="header">
                            <div>
                                <h1 class="title">Detail Logs</h1>
                                <p class="meta">Total Events: ${safeRows.length}</p>
                            </div>
                            <p class="meta">Generated: ${new Date().toLocaleString('en-GB')}</p>
                        </div>
                        <table>
                            <thead>
                                <tr>
                                    <th class="center" style="width:70px;">S.No</th>
                                    <th style="width:260px;">Timestamp</th>
                                    <th>User</th>
                                    <th style="width:130px;">Employee ID</th>
                                    <th style="width:220px;">Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${rowsHtml}
                            </tbody>
                        </table>
                    </div>
                </body>
            </html>
        `);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => {
            printWindow.print();
        }, 200);
    };

    return (
        <Layout userRole="admin">
            <div className="p-6 lg:p-10 space-y-8 bg-slate-50/50 min-h-screen">
                {/* Header Section */}
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                    <div className="space-y-2">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-200">
                                <Activity className="text-white" size={24} />
                            </div>
                            <div>
                                <h1 className="text-3xl font-black text-slate-800 tracking-tight">Security Audit Logs</h1>

                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={handlePrintLogs}
                            className="flex items-center gap-2 px-6 py-3 bg-white border border-slate-200 rounded-2xl text-slate-700 font-bold text-sm shadow-sm hover:shadow-md transition-all"
                        >
                            <Printer size={16} />
                            Print Preview
                        </motion.button>

                        <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={fetchLogs}
                            disabled={loading}
                            className="flex items-center gap-2 px-6 py-3 bg-white border border-slate-200 rounded-2xl text-slate-700 font-bold text-sm shadow-sm hover:shadow-md transition-all disabled:opacity-50"
                        >
                            <RefreshCcw size={16} className={`${loading ? 'animate-spin' : ''}`} />
                            Refresh Logs
                        </motion.button>
                    </div>
                </div>

                {failedLogins.length > 0 && (
                    <motion.div 
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-red-50 border border-red-200 rounded-3xl p-5 md:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm"
                    >
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-red-100 text-red-600 rounded-2xl flex items-center justify-center shrink-0">
                                <AlertCircle size={24} className="animate-bounce" />
                            </div>
                            <div>
                                <h3 className="text-red-800 font-black text-sm uppercase tracking-widest">Unauthorized Access Attempts Detected!</h3>
                                <p className="text-red-600 text-xs font-semibold mt-1">
                                    The system has logged {failedLogins.length} failed login attempts with invalid details or unknown credentials. 
                                </p>
                            </div>
                        </div>
                        <button 
                            onClick={() => { setFilterAction('FAILED_LOGIN'); setSearchTerm(''); }}
                            className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-black text-[10px] uppercase tracking-widest rounded-xl transition-all shadow-lg shadow-red-200"
                        >
                            Review Alerts
                        </button>
                    </motion.div>
                )}

                {/* Filters Section */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="relative group col-span-2">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" size={18} />
                        <input
                            type="text"
                            placeholder="Search by name, ID, or action..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-12 pr-5 py-4 bg-white border border-slate-200 rounded-2xl outline-none focus:ring-4 focus:ring-blue-500/5 focus:border-blue-500 transition-all font-medium text-slate-700 placeholder:text-slate-400"
                        />
                    </div>
                    
                    <div className="relative">
                        <Filter className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <select
                            value={filterAction}
                            onChange={(e) => setFilterAction(e.target.value)}
                            className="w-full pl-12 pr-5 py-4 bg-white border border-slate-200 rounded-2xl outline-none focus:ring-4 focus:ring-blue-500/5 focus:border-blue-500 appearance-none transition-all font-bold text-slate-700 text-sm uppercase tracking-wider cursor-pointer"
                        >
                            {uniqueActions.map(action => (
                                <option key={action} value={action}>{action.replace(/_/g, ' ')}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* Content Table */}
                <div className="bg-white border border-slate-200 rounded-[2rem] overflow-hidden shadow-sm relative">
                    {loading && (
                        <div className="absolute inset-0 bg-white/60 backdrop-blur-sm z-20 flex items-center justify-center">
                            <div className="flex flex-col items-center gap-4">
                                <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
                                <p className="font-bold text-slate-600 animate-pulse">Decrypting Audit Trail...</p>
                            </div>
                        </div>
                    )}

                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[980px] text-left border-collapse table-fixed">
                            <colgroup>
                                <col className="w-[92px]" />
                                <col className="w-[260px]" />
                                <col className="w-[360px]" />
                                <col className="w-[260px]" />
                            </colgroup>
                            <thead>
                                <tr className="bg-slate-50 border-b border-slate-100">
                                    <th className="px-6 lg:px-8 py-4 lg:py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] whitespace-nowrap align-middle text-center">S.No</th>
                                    <th className="px-6 lg:px-8 py-4 lg:py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] whitespace-nowrap align-middle">Timestamp</th>
                                    <th className="px-6 lg:px-8 py-4 lg:py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] whitespace-nowrap align-middle">User</th>
                                    <th className="px-6 lg:px-8 py-4 lg:py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] whitespace-nowrap align-middle text-center">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                <AnimatePresence mode='popLayout'>
                                    {filteredLogs.length > 0 ? (
                                        filteredLogs.map((log, index) => (
                                            <motion.tr
                                                key={log.id}
                                                initial={{ opacity: 0, y: 10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                transition={{ delay: index * 0.02 }}
                                                onClick={() => {
                                                    let detailsObj = log.details_normalized;

                                                    if (detailsObj && typeof detailsObj === 'object' && Object.keys(detailsObj).length > 0) {
                                                        // Sort details: Target ID first, then Emp ID, then others
                                                        const detailKeys = Object.keys(detailsObj).sort((a, b) => {
                                                            if (a === 'target_id') return -1;
                                                            if (b === 'target_id') return 1;
                                                            if (a === 'emp_id') return -1;
                                                            if (b === 'emp_id') return 1;
                                                            return 0;
                                                        });

                                                        const detailsList = detailKeys.map(key => {
                                                            const value = detailsObj[key];
                                                            const isHighlight = ['target_id', 'emp_id'].includes(key);
                                                            const label = key === 'target_id' ? 'System Target ID' : key === 'emp_id' ? 'Employee ID' : key.replace(/_/g, ' ');
                                                            return `
                                                                <div style="display: grid; grid-template-columns: 160px minmax(0, 1fr); align-items: start; border-bottom: 1px solid #e2e8f0; padding: 12px 10px; gap: 12px; ${isHighlight ? 'background: #eff6ff; border-radius: 8px; margin: 2px 0;' : ''}">
                                                                    <span style="font-weight: 800; text-transform: uppercase; font-size: 10px; color: ${isHighlight ? '#1e40af' : '#64748b'}; white-space: nowrap; letter-spacing: 0.05em;">${label}</span>
                                                                    <span style="font-weight: 800; font-size: 13px; color: ${isHighlight ? '#1e293b' : '#334155'}; text-align: left; word-break: break-word;">${value || '—'}</span>
                                                                </div>
                                                            `;
                                                        }).join('');

                                                        Swal.fire({
                                                            title: `${log.action?.replace(/_/g, ' ')} Details`,
                                                            html: `
                                                                <div style="text-align: left; background: #f8fafc; border-radius: 12px; padding: 15px; margin-top: 10px; border: 1px solid #e2e8f0;">
                                                                    ${detailsList}
                                                                </div>
                                                            `,
                                                            showConfirmButton: false,
                                                            showCloseButton: true,
                                                            width: '450px',
                                                            background: '#ffffff',
                                                            customClass: {
                                                                popup: 'rounded-[30px] border-4 border-blue-50/50 shadow-2xl',
                                                                title: 'text-2xl font-black text-slate-800 tracking-tight pt-5'
                                                            }
                                                        });
                                                    } else {
                                                        Swal.fire({
                                                            title: `${log.action?.replace(/_/g, ' ')} Details`,
                                                            html: `
                                                                <div style="text-align: left; background: #f8fafc; border-radius: 12px; padding: 15px; margin-top: 10px; border: 1px solid #e2e8f0;">
                                                                    <div style="display: grid; grid-template-columns: 160px minmax(0, 1fr); align-items: start; border-bottom: 1px solid #e2e8f0; padding: 12px 10px; gap: 12px;">
                                                                        <span style="font-weight: 800; text-transform: uppercase; font-size: 10px; color: #64748b; white-space: nowrap; letter-spacing: 0.05em;">Employee ID</span>
                                                                        <span style="font-weight: 800; font-size: 13px; color: #334155; text-align: left; word-break: break-word;">${log.emp_id || 'NA'}</span>
                                                                    </div>
                                                                    <div style="display: grid; grid-template-columns: 160px minmax(0, 1fr); align-items: start; border-bottom: 1px solid #e2e8f0; padding: 12px 10px; gap: 12px;">
                                                                        <span style="font-weight: 800; text-transform: uppercase; font-size: 10px; color: #64748b; white-space: nowrap; letter-spacing: 0.05em;">User</span>
                                                                        <span style="font-weight: 800; font-size: 13px; color: #334155; text-align: left; word-break: break-word;">${log.user_name || 'NA'}</span>
                                                                    </div>
                                                                    <div style="display: grid; grid-template-columns: 160px minmax(0, 1fr); align-items: start; padding: 12px 10px; gap: 12px;">
                                                                        <span style="font-weight: 800; text-transform: uppercase; font-size: 10px; color: #64748b; white-space: nowrap; letter-spacing: 0.05em;">Info</span>
                                                                        <span style="font-weight: 800; font-size: 13px; color: #334155; text-align: left; word-break: break-word;">No extra detail fields available</span>
                                                                    </div>
                                                                </div>
                                                            `,
                                                            showConfirmButton: false,
                                                            showCloseButton: true,
                                                            width: '450px',
                                                            background: '#ffffff',
                                                            customClass: {
                                                                popup: 'rounded-[30px] border-4 border-blue-50/50 shadow-2xl',
                                                                title: 'text-2xl font-black text-slate-800 tracking-tight pt-5'
                                                            }
                                                        });
                                                    }
                                                }}
                                                className="hover:bg-slate-50/50 transition-colors group cursor-pointer align-middle"
                                            >
                                                <td className="px-6 lg:px-8 py-4 lg:py-5 text-center align-middle">
                                                    <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-lg border border-slate-200 bg-white px-2 text-[11px] font-black text-slate-500">
                                                        {index + 1}
                                                    </span>
                                                </td>
                                                <td className="px-6 lg:px-8 py-4 lg:py-5 align-middle">
                                                    <div className="flex flex-col">
                                                        <span className="text-slate-700 font-bold text-sm whitespace-nowrap leading-tight">
                                                            {log.created_at ? new Date(log.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'NA'}
                                                        </span>
                                                        <span className="text-slate-400 font-medium text-[11px] flex items-center gap-1 whitespace-nowrap mt-1">
                                                            <Clock size={10} />
                                                            {log.created_at ? formatTimestamp(log.created_at) : 'NA'}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="px-6 lg:px-8 py-4 lg:py-5 align-middle">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-9 h-9 bg-slate-100 rounded-xl flex items-center justify-center text-slate-500 font-black text-xs border border-slate-100 group-hover:bg-blue-50 group-hover:text-blue-600 group-hover:border-blue-100 transition-colors">
                                                            {(log.user_name || 'NA').charAt(0)}
                                                        </div>
                                                        <div className="flex flex-col min-w-0">
                                                            <span className="text-slate-700 font-bold text-sm group-hover:text-blue-600 transition-colors truncate">{log.user_name || 'NA'}</span>
                                                            <span className="text-slate-400 font-medium text-[11px] uppercase tracking-tighter truncate">{log.emp_id || 'NA'}</span>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-6 lg:px-8 py-4 lg:py-5 text-center align-middle">
                                                    <span className={`inline-flex items-center justify-center px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider border whitespace-nowrap ${getActionColor(log.action || 'UNKNOWN')}`}>
                                                        {(log.action || 'UNKNOWN').replace(/_/g, ' ')}
                                                    </span>
                                                </td>
                                            </motion.tr>
                                        ))
                                    ) : (
                                        <tr>
                                            <td colSpan="4" className="px-8 py-20 text-center">
                                                <div className="flex flex-col items-center gap-4">
                                                    <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center text-slate-200">
                                                        <AlertCircle size={32} />
                                                    </div>
                                                    <div className="space-y-1">
                                                        <p className="font-black text-slate-400 uppercase tracking-widest text-xs">Zero Logs Found</p>
                                                        <p className="text-slate-300 text-sm font-medium">No activity matches your current filters.</p>
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </AnimatePresence>
                            </tbody>
                        </table>
                    </div>
                </div>
                
                {/* Stats Footer */}
                <div className="flex items-center justify-between text-slate-400 font-black text-[10px] uppercase tracking-[0.25em] px-4">
                    <p>Audit Trail Version 2.4.0</p>
                    <p>Total Events: {filteredLogs.length}</p>
                </div>
            </div>
        </Layout>
    );
};

export default ActivityLogs;
