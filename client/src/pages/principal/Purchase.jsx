import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../../components/Layout';
import api from '../../utils/api';
import Swal from 'sweetalert2';
import { useAuth } from '../../context/AuthContext';
import { finalizePrintWindow } from '../../utils/printUtils';
import { FaShoppingCart, FaCheck, FaTimes, FaPlus, FaFilter, FaInfoCircle, FaHourglassHalf, FaBoxOpen, FaLayerGroup, FaExclamationTriangle, FaPrint } from 'react-icons/fa';
import { motion, AnimatePresence } from 'framer-motion';

const Purchase = () => {
    const { user } = useAuth();
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const getFilterOptions = () => {
        if (user.role === 'principal') return ['Pending', 'Approved_HOD', 'Purchased', 'Rejected'];
        return ['Pending', 'Purchased', 'Rejected'];
    };

    const filterOptions = getFilterOptions();
    const [filter, setFilter] = useState(user.role === 'principal' ? 'Approved_HOD' : 'Pending');
    const [selectedIds, setSelectedIds] = useState([]);
    const navigate = useNavigate();


    useEffect(() => {
        fetchRequests();
    }, []);

    const fetchRequests = async () => {
        try {
            const { data } = await api.get('/purchases');
            setRequests(data);
            setLoading(false);
            setSelectedIds([]); // Reset selection
        } catch (error) {
            console.error(error);
            setLoading(false);
        }
    };

    const handleNewRequest = () => {
        navigate(`/${user.role}/purchase/new`);
        window.dispatchEvent(new CustomEvent('closeSidebar'));
    };

    const handleAction = async (id, status) => {
        const actionText = status === 'Approved' ? 'Accept' : 'Reject';
        const result = await Swal.fire({
            title: `${actionText} Transaction?`,
            text: `Confirm final oversight for this procurement sequence.`,
            icon: 'question',
            showCancelButton: true,
            confirmButtonColor: status === 'Approved' ? '#059669' : '#ef4444',
            confirmButtonText: `Yes, ${status}`,
            background: '#fff',
            customClass: {
                popup: 'rounded-2xl',
                title: 'font-black text-gray-800'
            }
        });

        if (result.isConfirmed) {
            try {
                await api.put(`/purchases/${id}/status`, { status });
                Swal.fire({
                    title: 'Status Updated',
                    text: `Request status set to ${status.toLowerCase()}.`,
                    icon: 'success',
                    confirmButtonColor: '#2563eb'
                });
                fetchRequests();
            } catch (error) {
                Swal.fire({
                    title: 'Error',
                    text: error.response?.data?.message || 'Update failed',
                    icon: 'error',
                    confirmButtonColor: '#2563eb'
                });
            }
        }
    };

    const handleBulkAction = async (status) => {
        if (selectedIds.length === 0) return;

        const actionText = status === 'Approved' ? 'Approve' : 'Reject';
        const result = await Swal.fire({
            title: `Bulk ${actionText} ${selectedIds.length} Requests?`,
            text: `This will update the status of all selected purchase requests.`,
            icon: 'question',
            showCancelButton: true,
            confirmButtonColor: status === 'Approved' ? '#059669' : '#ef4444',
            confirmButtonText: `Yes, ${status} All`,
            background: '#fff',
        });

        if (result.isConfirmed) {
            try {
                Swal.fire({
                    title: 'Processing Bulk Action...',
                    didOpen: () => Swal.showLoading()
                });

                await Promise.all(selectedIds.map(id => api.put(`/purchases/${id}/status`, { status })));

                Swal.fire({
                    title: 'Success',
                    text: `Processed ${selectedIds.length} requests successfully.`,
                    icon: 'success',
                    confirmButtonColor: '#2563eb'
                });
                fetchRequests();
            } catch (error) {
                Swal.fire({
                    title: 'Bulk Action Failed',
                    text: 'Some updates might not have completed.',
                    icon: 'error',
                    confirmButtonColor: '#2563eb'
                });
            }
        }
    };

    const escapeHtml = (value) => String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

    const handlePrintRequests = async (items, title) => {
        if (!items || items.length === 0) {
            Swal.fire({
                title: 'Nothing to report',
                text: 'No purchased requests selected.',
                icon: 'info',
                confirmButtonColor: '#2563eb'
            });
            return;
        }

        const printWindow = window.open('', '_blank', 'width=1200,height=800');
        if (!printWindow) {
            Swal.fire({
                title: 'Popup blocked',
                text: 'Please allow popups to generate purchased reports.',
                icon: 'warning',
                confirmButtonColor: '#2563eb'
            });
            return;
        }

        // Calculate dynamic column widths based on content length
        const columnData = {
            item: items.map(r => (r.item_name || '').length),
            applicant: items.map(r => (r.applicant_name || '').length),
            department: items.map(r => (r.department_name || '-').length),
            status: items.map(r => ((r.status || '').replace('_', ' ')).length)
        };

        const maxLengths = {
            item: Math.max(...columnData.item, 4),
            applicant: Math.max(...columnData.applicant, 9),
            department: Math.max(...columnData.department, 10),
            status: Math.max(...columnData.status, 6)
        };

        // Determine if landscape is needed (more data = landscape)
        const useLandscape = items.length > 10 || maxLengths.item > 30;

        const rowsHtml = items.map((req, idx) => `
            <tr>
                <td class="col-index">${idx + 1}</td>
                <td class="col-item">${escapeHtml(req.item_name)}</td>
                <td class="col-qty">${escapeHtml(req.quantity)}</td>
                <td class="col-unit">${escapeHtml(req.unit || 'piece')}</td>
                <td class="col-applicant">${escapeHtml(req.applicant_name)}</td>
                <td class="col-dept">${escapeHtml(req.department_name || '-')}</td>
                <td class="col-status">${escapeHtml((req.status || '').replace('_', ' '))}</td>
                <td class="col-date">${req.created_at ? new Date(req.created_at).toLocaleString('en-GB') : '-'}</td>
            </tr>
        `).join('');

        printWindow.document.write(`
            <!doctype html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>${escapeHtml(title)}</title>
                <style>
                    @page {
                        size: ${useLandscape ? 'landscape' : 'portrait'};
                        margin: 0.5cm;
                    }
                    
                    * {
                        box-sizing: border-box;
                    }
                    
                    body {
                        font-family: Arial, Helvetica, sans-serif;
                        padding: 12px;
                        color: #111827;
                        margin: 0;
                        font-size: 10pt;
                        position: relative;
                    }
                    
                    .print-brand {
                        position: absolute;
                        top: 12px;
                        right: 12px;
                        text-align: right;
                    }
                    .print-brand .app-name {
                        font-size: 11pt;
                        font-weight: 800;
                        color: #1e3a8a;
                        margin: 0;
                        letter-spacing: 0.5px;
                    }
                    .print-brand .print-time {
                        font-size: 8pt;
                        color: #6b7280;
                        margin: 2px 0 0;
                    }
                    
                    h1 {
                        margin: 0 0 6px;
                        font-size: 16pt;
                        font-weight: bold;
                        color: #1e3a8a;
                    }
                    
                    .meta {
                        margin-bottom: 12px;
                        color: #6b7280;
                        font-size: 9pt;
                        border-bottom: 2px solid #e5e7eb;
                        padding-bottom: 6px;
                    }
                    
                    table {
                        width: 100%;
                        border-collapse: collapse;
                        table-layout: auto;
                    }
                    
                    th, td {
                        border: 1px solid #9ca3af;
                        padding: 6px 8px;
                        font-size: 9pt;
                        text-align: left;
                        vertical-align: top;
                        word-wrap: break-word;
                        overflow-wrap: break-word;
                    }
                    
                    th {
                        background: #e5e7eb;
                        font-weight: 700;
                        text-transform: uppercase;
                        font-size: 8pt;
                        letter-spacing: 0.3px;
                        color: #374151;
                        position: sticky;
                        top: 0;
                    }
                    
                    /* Dynamic column sizing based on content */
                    .col-index { width: 4%; text-align: center; }
                    .col-item { width: ${Math.min(maxLengths.item / 2 + 15, 30)}%; }
                    .col-qty { width: 8%; text-align: center; }
                    .col-unit { width: 8%; text-align: center; }
                    .col-applicant { width: ${Math.min(maxLengths.applicant / 2 + 10, 18)}%; }
                    .col-dept { width: ${Math.min(maxLengths.department / 2 + 10, 16)}%; }
                    .col-status { width: 12%; }
                    .col-date { width: 14%; font-size: 8pt; }
                    
                    tr:nth-child(even) {
                        background: #f9fafb;
                    }
                    
                    tr:hover {
                        background: #f3f4f6;
                    }
                    
                    /* Page break control */
                    tr {
                        page-break-inside: avoid;
                    }
                    
                    thead {
                        display: table-header-group;
                    }
                    
                    /* Print-specific styles */
                    @media print {
                        body {
                            padding: 0;
                        }
                        
                        table {
                            page-break-after: auto;
                        }
                        
                        tr {
                            page-break-inside: avoid;
                            page-break-after: auto;
                        }
                        
                        thead {
                            display: table-header-group;
                        }
                        
                        tfoot {
                            display: table-footer-group;
                        }
                    }
                </style>
            </head>
            <body>
                <div class="print-brand">
                    <p class="app-name">PPG EMP HUB</p>
                    <p class="print-time">${new Date().toLocaleString('en-GB')}</p>
                </div>
                <h1>${escapeHtml(title)}</h1>
                <div class="meta">
                    Total Records: ${items.length}
                </div>
                <table>
                    <thead>
                        <tr>
                            <th class="col-index">#</th>
                            <th class="col-item">Item</th>
                            <th class="col-qty">Qty</th>
                            <th class="col-unit">Unit</th>
                            <th class="col-applicant">Applicant</th>
                            <th class="col-dept">Department</th>
                            <th class="col-status">Status</th>
                            <th class="col-date">Created At</th>
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
            title,
            delay: 250,
            modeLabel: 'the purchase report'
        });
    };

    const toggleSelect = (id) => {
        setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
    };

    const toggleSelectAll = () => {
        const selectable = filter === 'Purchased'
            ? filteredRequests.filter(r => r.status === 'Purchased')
            : filteredRequests.filter(r => canApprove(r));

        if (selectedIds.length === selectable.length && selectable.length > 0) {
            setSelectedIds([]);
        } else {
            setSelectedIds(selectable.map(r => r.id));
        }
    };

    const handlePrintSelectedPurchased = async () => {
        const selectedPurchased = requests.filter(r => selectedIds.includes(r.id) && r.status === 'Purchased');
        await handlePrintRequests(selectedPurchased, 'Selected Purchased Requests');
    };

    const handlePrintAllPurchased = async () => {
        const allPurchased = filteredRequests.filter(r => r.status === 'Purchased');
        await handlePrintRequests(allPurchased, 'All Purchased Requests');
    };

    const handlePrintSingle = async (req) => {
        await handlePrintRequests([req], `Purchased Request - ${req.item_name}`);
    };

    const handleDelete = async (id) => {
        const result = await Swal.fire({
            title: 'Delete Purchase Request?',
            text: "This action cannot be undone.",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#ef4444',
            cancelButtonColor: '#1e3a8a',
            confirmButtonText: 'Yes, delete it!'
        });

        if (result.isConfirmed) {
            try {
                await api.delete(`/purchases/${id}`);
                Swal.fire({
                    title: 'Deleted!',
                    text: 'Request removed.',
                    icon: 'success',
                    timer: 1500,
                    showConfirmButton: false
                });
                fetchRequests();
            } catch (error) {
                Swal.fire({
                    title: 'Error',
                    text: error.response?.data?.message || 'Failed to delete.',
                    icon: 'error'
                });
            }
        }
    };

    const getStatusStyle = (status) => {
        switch (status) {
            case 'Pending': return 'bg-amber-50 text-amber-600 border-amber-100';
            case 'Approved_HOD': return 'bg-sky-50 text-sky-600 border-sky-100';
            case 'Approved_Principal': return 'bg-indigo-50 text-indigo-600 border-indigo-100';
            case 'Approved_Admin': return 'bg-violet-50 text-violet-600 border-violet-100';
            case 'Purchased': return 'bg-emerald-600 text-white border-emerald-600';
            case 'Rejected': return 'bg-rose-50 text-rose-600 border-rose-100';
            default: return 'bg-gray-50 text-gray-500 border-gray-100';
        }
    };

    const canApprove = (req) => {
        // HOD cannot approve/reject their own requests (those go directly to Principal)
        if (user.role === 'hod' && req.status === 'Pending' && req.emp_id !== user.emp_id) return true;
        
        // Principal can only approve HOD requests (status: Approved_HOD)
        // Principal's OWN requests bypass approval and go directly to Admin with status: Approved_Principal ✓
        if (user.role === 'principal' && req.status === 'Approved_HOD') return true;
        return false;
    };

    const filteredRequests = requests.filter(r => filter === 'All' || r.status === filter);

    return (
        <Layout>
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="max-w-7xl mx-auto"
            >
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-6">
                    <div>
                        <h1 className="text-3xl font-black text-gray-800 tracking-tight">Purchase Requests</h1>
                    </div>
                    <button
                        onClick={handleNewRequest}
                        className="bg-sky-600 text-white px-8 py-4 rounded-2xl shadow-xl shadow-sky-100 hover:bg-sky-700 transition-all flex items-center font-black uppercase tracking-widest text-xs active:scale-95 group"
                    >
                        <FaPlus className="mr-3 group-hover:rotate-90 transition-transform" /> New Request
                    </button>
                </div>

                {/* Filter Matrix */}
                <div className="flex items-center gap-4 mb-10 overflow-x-auto pb-4 custom-scrollbar">
                    <div className="flex items-center gap-2 bg-white p-1.5 rounded-2xl border border-sky-50 shadow-sm shrink-0">
                        {filterOptions.map(f => (
                            <button
                                key={f}
                                onClick={() => setFilter(f)}
                                className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${filter === f
                                    ? 'bg-sky-600 text-white shadow-lg shadow-sky-100 scale-105'
                                    : 'bg-transparent text-gray-400 hover:text-sky-500 hover:bg-sky-50'
                                    }`}
                            >
                                {f.replace('_', ' ')}
                            </button>
                        ))}
                    </div>
                    {filter === 'Purchased' && (
                        <button
                            onClick={handlePrintAllPurchased}
                            className="bg-white text-gray-700 px-6 py-3 rounded-xl shadow-xl shadow-gray-200/50 hover:bg-gray-50 transition-all font-black uppercase tracking-widest text-[10px] flex items-center gap-2 border border-gray-100 no-print"
                        >
                            <FaPrint className="text-sky-500" size={12} /> Report All Purchased
                        </button>
                    )}
                </div>

                <div className="modern-card !p-0 overflow-hidden border-sky-100">
                    <div className="bg-sky-50/30 p-6 border-b border-sky-50 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-xl bg-sky-100 flex items-center justify-center text-sky-600 shadow-sm">
                                <FaLayerGroup size={18} />
                            </div>
                            <h2 className="text-lg font-black text-gray-800 uppercase tracking-widest">Request History</h2>
                        </div>
                        {selectedIds.length > 0 && (
                            <motion.div
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                className="flex items-center gap-2 bg-white border border-sky-100 p-1.5 rounded-2xl shadow-sm"
                            >
                                {filter === 'Purchased' ? (
                                    <button
                                        onClick={handlePrintSelectedPurchased}
                                        className="px-6 py-2 bg-sky-50 text-sky-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-sky-600 hover:text-white transition-all active:scale-95 flex items-center gap-2"
                                    >
                                        <FaPrint size={10} /> Report Selected ({selectedIds.length})
                                    </button>
                                ) : (
                                    <>
                                        <button
                                            onClick={() => handleBulkAction('Approved')}
                                            className="px-6 py-2 bg-emerald-50 text-emerald-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-600 hover:text-white transition-all active:scale-95"
                                        >
                                            Approve Selected ({selectedIds.length})
                                        </button>
                                        <button
                                            onClick={() => handleBulkAction('Rejected')}
                                            className="px-6 py-2 bg-rose-50 text-rose-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-rose-600 hover:text-white transition-all active:scale-95"
                                        >
                                            Reject Selected
                                        </button>
                                    </>
                                )}
                            </motion.div>
                        )}
                    </div>

                    {loading ? (
                        <div className="p-32 text-center flex flex-col items-center gap-4">
                            <div className="h-14 w-14 border-4 border-sky-100 border-t-sky-600 rounded-full animate-spin"></div>
                            <p className="text-[10px] font-black text-sky-500 uppercase tracking-[0.2em] mt-2">Accessing Procurement Ledger...</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-gray-50/50">
                                        <th className="p-6 w-12 border-b border-sky-50">
                                            <div className="flex justify-center">
                                                <input
                                                    type="checkbox"
                                                    className="w-4 h-4 rounded border-sky-200 text-sky-600 focus:ring-sky-500 cursor-pointer"
                                                    checked={selectedIds.length === (filter === 'Purchased' ? filteredRequests.filter(r => r.status === 'Purchased').length : filteredRequests.filter(r => canApprove(r)).length)
                                                        && (filter === 'Purchased' ? filteredRequests.filter(r => r.status === 'Purchased').length : filteredRequests.filter(r => canApprove(r)).length) > 0}
                                                    onChange={toggleSelectAll}
                                                />
                                            </div>
                                        </th>
                                        <th className="p-6 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-sky-50">Item Name</th>
                                        <th className="p-6 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-sky-50 text-center">Quantity</th>
                                        <th className="p-6 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-sky-50 text-center">Unit</th>
                                        <th className="p-6 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-sky-50 text-center">Status</th>
                                        <th className="p-6 text-[10px] font-black text-gray-500 uppercase tracking-widest border-b border-sky-50 text-center">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-sky-50/10">
                                    <AnimatePresence mode="popLayout">
                                        {filteredRequests.map((req, idx) => (
                                            <motion.tr
                                                key={req.id}
                                                initial={{ opacity: 0 }}
                                                animate={{ opacity: 1 }}
                                                exit={{ opacity: 0, scale: 0.98 }}
                                                transition={{ delay: idx * 0.03 }}
                                                className={`transition-all group ${selectedIds.includes(req.id) ? 'bg-sky-50/40' : 'hover:bg-sky-50/20'}`}
                                            >
                                                <td className="p-6">
                                                    <div className="flex justify-center">
                                                        {canApprove(req) || (filter === 'Purchased' && req.status === 'Purchased') ? (
                                                            <input
                                                                type="checkbox"
                                                                className="w-4 h-4 rounded border-sky-200 text-sky-600 focus:ring-sky-500 cursor-pointer"
                                                                checked={selectedIds.includes(req.id)}
                                                                onChange={() => toggleSelect(req.id)}
                                                            />
                                                        ) : (
                                                            <div className="w-4 h-4 rounded bg-gray-50 border border-gray-100" title="Not actionable by you" />
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="p-6">
                                                    <div className="flex items-center gap-4">
                                                        <div className="h-12 w-12 rounded-2xl bg-white border border-sky-100 flex items-center justify-center text-sky-600 shadow-sm group-hover:scale-110 transition-transform">
                                                            <FaBoxOpen size={20} />
                                                        </div>
                                                        <div>
                                                            <p className="text-sm font-black text-gray-800 tracking-tight">{req.item_name}</p>
                                                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">Applicant: <span className="text-sky-500 font-black">{req.applicant_name}</span></p>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="p-6 text-center">
                                                    <span className="text-sm font-black text-gray-700 bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-100">{req.quantity}</span>
                                                </td>

                                                <td className="p-6 text-center">
                                                    <span className="text-sm font-black text-sky-600 bg-sky-50 px-3 py-1.5 rounded-lg border border-sky-100 uppercase tracking-wider">{req.unit || 'piece'}</span>
                                                </td>

                                                <td className="p-6 text-center">
                                                    <span className={`inline-block text-[9px] font-black uppercase tracking-[0.1em] px-4 py-1.5 rounded-xl border-2 shadow-sm ${getStatusStyle(req.status)}`}>
                                                        {req.status.replace('_', ' ')}
                                                    </span>
                                                </td>
                                                <td className="p-6">
                                                    <div className="flex justify-center gap-3">
                                                        {canApprove(req) ? (
                                                            <>
                                                                <button
                                                                    onClick={() => handleAction(req.id, 'Approved')}
                                                                    className="h-10 w-10 bg-emerald-50 text-emerald-600 rounded-xl hover:bg-emerald-600 hover:text-white transition-all shadow-sm flex items-center justify-center active:scale-90 group/btn"
                                                                    title="Accept Request"
                                                                >
                                                                    <FaCheck className="group-hover/btn:scale-125 transition-transform" />
                                                                </button>
                                                                <button
                                                                    onClick={() => handleAction(req.id, 'Rejected')}
                                                                    className="h-10 w-10 bg-rose-50 text-rose-600 rounded-xl hover:bg-rose-600 hover:text-white transition-all shadow-sm flex items-center justify-center active:scale-90 group/btn"
                                                                    title="Reject Request"
                                                                >
                                                                    <FaTimes className="group-hover/btn:scale-125 transition-transform" />
                                                                </button>
                                                            </>
                                                        ) : (
                                                            <div className="flex items-center gap-2">
                                                                {req.status === 'Purchased' ? (
                                                                    <button
                                                                        onClick={() => handlePrintSingle(req)}
                                                                        className="h-10 w-10 bg-sky-50 text-sky-600 rounded-xl hover:bg-sky-600 hover:text-white transition-all shadow-sm flex items-center justify-center active:scale-90 group/btn"
                                                                        title="Purchased Request Report"
                                                                    >
                                                                        <FaPrint className="group-hover/btn:scale-125 transition-transform" />
                                                                    </button>
                                                                ) : (
                                                                    <div className="flex items-center gap-2 text-[9px] font-black text-gray-300 uppercase tracking-widest italic bg-gray-50/50 px-3 py-2 rounded-xl">
                                                                        <FaInfoCircle size={10} /> Locked
                                                                    </div>
                                                                )}
                                                                {(req.emp_id === user.emp_id || user.role === 'admin') && req.status !== 'Purchased' && (
                                                                    <button
                                                                        onClick={() => handleDelete(req.id)}
                                                                        className="h-10 w-10 bg-rose-50 text-rose-600 rounded-xl hover:bg-rose-600 hover:text-white transition-all shadow-sm flex items-center justify-center active:scale-90 group/btn"
                                                                        title="Delete Request"
                                                                    >
                                                                        <FaTimes className="group-hover/btn:scale-125 transition-transform" />
                                                                    </button>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                </td>
                                            </motion.tr>
                                        ))}
                                    </AnimatePresence>
                                    {filteredRequests.length === 0 && !loading && (
                                        <tr>
                                            <td colSpan="5" className="p-32 text-center">
                                                <div className="flex flex-col items-center gap-6 opacity-20 grayscale">
                                                    <FaShoppingCart size={64} className="text-gray-400" />
                                                    <div>
                                                        <p className="text-xl font-black text-gray-800 tracking-tight">No Requests</p>
                                                        <p className="text-sm font-bold uppercase tracking-widest text-gray-400 mt-1">No purchase requests found.</p>
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </motion.div>
        </Layout>
    );
};

export default Purchase;

