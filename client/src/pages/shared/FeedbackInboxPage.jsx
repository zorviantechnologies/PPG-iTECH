import { useEffect, useState } from 'react';
import Layout from '../../components/Layout';
import api from '../../utils/api';
import Swal from 'sweetalert2';
import { FaCommentDots, FaSpinner, FaDownload, FaTrash } from 'react-icons/fa';
import { useAuth } from '../../context/AuthContext';
import { runPrintWindow } from '../../utils/printUtils';

const badgeClass = (rating) => {
    const v = String(rating || '').toLowerCase();
    if (v === 'excellent') return 'bg-emerald-50 text-emerald-700 border-emerald-100';
    if (v === 'good') return 'bg-sky-50 text-sky-700 border-sky-100';
    return 'bg-amber-50 text-amber-700 border-amber-100';
};

const FeedbackInboxPage = () => {
    const { user } = useAuth();
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);
    const [rows, setRows] = useState([]);
    const [selectedIds, setSelectedIds] = useState([]);

    const escHtml = (value) => String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');

    const exportPdf = async () => {
        if (!rows.length) return;

        const rowsHtml = rows.map((r, index) => `
            <tr>
                <td>${index + 1}</td>
                <td>${escHtml(r.from_name || r.from_emp_id || '-')}</td>
                <td>${escHtml(r.from_emp_id || '-')}</td>
                <td>${escHtml(r.designation || r.submitted_by_role || '-')}</td>
                <td>${escHtml(r.department_name || '-')}</td>
                <td>${escHtml(r.rating || 'General')}</td>
                <td style="white-space: pre-wrap;">${escHtml(r.message || '-')}</td>
                <td>${escHtml(r.created_at ? new Date(r.created_at).toLocaleString('en-GB') : '-')}</td>
            </tr>
        `).join('');

        const html = `
            <!doctype html>
            <html>
            <head>
                <meta charset="utf-8" />
                <title>Feedback Inbox Report</title>
                <style>
                    body { font-family: Arial, sans-serif; color: #0f172a; margin: 24px; }
                    .head { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; }
                    h1 { margin: 0; font-size: 22px; }
                    p { margin: 4px 0; font-size: 12px; color: #334155; }
                    table { width: 100%; border-collapse: collapse; margin-top: 12px; }
                    th, td { border: 1px solid #cbd5e1; padding: 8px; text-align: left; font-size: 11px; vertical-align: top; }
                    th { background: #eff6ff; font-weight: 700; }
                </style>
            </head>
            <body>
                <div class="head">
                    <div>
                        <h1>Employee Feedback Inbox</h1>
                        <p>Inbox Owner: ${escHtml(user?.emp_id || '-')}</p>
                        <p>Total Feedbacks: ${rows.length}</p>
                    </div>
                    <div>
                        <p>Generated: ${escHtml(new Date().toLocaleString('en-GB'))}</p>
                    </div>
                </div>
                <table>
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>From</th>
                            <th>Emp ID</th>
                            <th>Designation</th>
                            <th>Department</th>
                            <th>Rating</th>
                            <th>Message</th>
                            <th>Submitted</th>
                        </tr>
                    </thead>
                    <tbody>${rowsHtml}</tbody>
                </table>
            </body>
            </html>
        `;

        await runPrintWindow({
            title: `feedback-inbox-${String(user?.emp_id || 'receiver')}-${new Date().toLocaleDateString('en-CA')}`,
            html,
            modeLabel: 'feedback inbox report',
            closeAfterPrint: false
        });
    };

    const toggleRowSelection = (id) => {
        setSelectedIds((prev) => (
            prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]
        ));
    };

    const toggleSelectAll = () => {
        if (!rows.length) return;
        const allIds = rows.map((r) => r.id);
        setSelectedIds((prev) => (prev.length === allIds.length ? [] : allIds));
    };

    const removeRowsFromState = (ids) => {
        const idSet = new Set(ids);
        setRows((prev) => prev.filter((item) => !idSet.has(item.id)));
        setSelectedIds((prev) => prev.filter((id) => !idSet.has(id)));
    };

    const handleDeleteOne = async (id) => {
        const confirmed = await Swal.fire({
            icon: 'warning',
            title: 'Delete feedback?',
            text: 'This feedback will be removed from your inbox.',
            showCancelButton: true,
            confirmButtonText: 'Delete',
            cancelButtonText: 'Cancel',
            confirmButtonColor: '#dc2626'
        });

        if (!confirmed.isConfirmed) return;

        setActionLoading(true);
        try {
            await api.delete(`/feedback/${id}`);
            removeRowsFromState([id]);
            await Swal.fire({ icon: 'success', title: 'Deleted', text: 'Feedback deleted successfully.' });
        } catch (error) {
            await Swal.fire({
                icon: 'error',
                title: 'Delete failed',
                text: error?.response?.data?.message || 'Unable to delete feedback right now.'
            });
        } finally {
            setActionLoading(false);
        }
    };

    const handleDeleteSelected = async () => {
        if (!selectedIds.length) {
            await Swal.fire({ icon: 'info', title: 'No selection', text: 'Please select feedback entries to delete.' });
            return;
        }

        const confirmed = await Swal.fire({
            icon: 'warning',
            title: 'Delete selected feedback?',
            text: `${selectedIds.length} feedback entr${selectedIds.length > 1 ? 'ies' : 'y'} will be removed from your inbox.`,
            showCancelButton: true,
            confirmButtonText: 'Delete Selected',
            cancelButtonText: 'Cancel',
            confirmButtonColor: '#dc2626'
        });

        if (!confirmed.isConfirmed) return;

        setActionLoading(true);
        try {
            const { data } = await api.delete('/feedback', { data: { ids: selectedIds } });
            const deletedCount = Number(data?.deletedCount || 0);
            if (deletedCount > 0) {
                removeRowsFromState(selectedIds);
            }
            await Swal.fire({
                icon: deletedCount > 0 ? 'success' : 'info',
                title: deletedCount > 0 ? 'Deleted' : 'No matching feedback',
                text: data?.message || 'Bulk delete completed.'
            });
        } catch (error) {
            await Swal.fire({
                icon: 'error',
                title: 'Bulk delete failed',
                text: error?.response?.data?.message || 'Unable to delete selected feedback right now.'
            });
        } finally {
            setActionLoading(false);
        }
    };

    useEffect(() => {
        const fetchInbox = async () => {
            setLoading(true);
            try {
                const { data } = await api.get('/feedback/inbox');
                setRows(Array.isArray(data) ? data : []);
            } catch (error) {
                console.error('Failed to load feedback inbox:', error);
                setRows([]);
            } finally {
                setLoading(false);
            }
        };

        fetchInbox();
    }, []);

    return (
        <Layout>
            <div className="max-w-7xl mx-auto">
                <div className="mb-8">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <h1 className="text-3xl font-black text-gray-800 tracking-tight">Employee Feedback Inbox</h1>
                            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 mt-2">Visible only to employee 5001 and 5045</p>
                        </div>
                        <button
                            type="button"
                            onClick={exportPdf}
                            disabled={loading || actionLoading || rows.length === 0}
                            className="px-5 py-3 rounded-2xl bg-sky-600 text-white text-[10px] font-black uppercase tracking-widest shadow-lg shadow-sky-100 hover:bg-sky-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            <FaDownload /> Download PDF
                        </button>
                        <button
                            type="button"
                            onClick={handleDeleteSelected}
                            disabled={loading || actionLoading || rows.length === 0 || selectedIds.length === 0}
                            className="px-5 py-3 rounded-2xl bg-rose-600 text-white text-[10px] font-black uppercase tracking-widest shadow-lg shadow-rose-100 hover:bg-rose-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            <FaTrash /> Delete Selected
                        </button>
                    </div>
                </div>

                <div className="modern-card !p-0 overflow-hidden border-sky-100">
                    <div className="bg-sky-50/30 p-6 border-b border-sky-50">
                        <h2 className="text-lg font-black text-gray-800 uppercase tracking-widest">All Feedbacks</h2>
                    </div>

                    {loading ? (
                        <div className="p-20 text-center text-gray-500">
                            <div className="flex flex-col items-center gap-4">
                                <FaSpinner className="animate-spin text-sky-600" size={28} />
                                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-sky-500">Loading feedbacks...</p>
                            </div>
                        </div>
                    ) : rows.length === 0 ? (
                        <div className="p-20 text-center text-gray-400">
                            <div className="flex flex-col items-center gap-4 opacity-70">
                                <FaCommentDots size={44} />
                                <p className="text-sm font-black text-gray-700">No feedbacks yet</p>
                            </div>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead className="bg-gray-50/50">
                                    <tr>
                                        <th className="p-5 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-sky-50">
                                            <input
                                                type="checkbox"
                                                checked={rows.length > 0 && selectedIds.length === rows.length}
                                                onChange={toggleSelectAll}
                                                disabled={actionLoading || rows.length === 0}
                                                className="h-4 w-4 accent-sky-600 cursor-pointer"
                                                aria-label="Select all feedback"
                                            />
                                        </th>
                                        <th className="p-5 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-sky-50">From</th>
                                        <th className="p-5 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-sky-50">Department</th>
                                        <th className="p-5 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-sky-50">Rating</th>
                                        <th className="p-5 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-sky-50">Message</th>
                                        <th className="p-5 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-sky-50">Submitted</th>
                                        <th className="p-5 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-sky-50">Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map((r) => (
                                        <tr key={r.id} className="border-b border-sky-50/40 hover:bg-sky-50/20">
                                            <td className="p-5">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedIds.includes(r.id)}
                                                    onChange={() => toggleRowSelection(r.id)}
                                                    disabled={actionLoading}
                                                    className="h-4 w-4 accent-sky-600 cursor-pointer"
                                                    aria-label={`Select feedback ${r.id}`}
                                                />
                                            </td>
                                            <td className="p-5">
                                                <div className="text-sm font-black text-gray-800">{r.from_name || r.from_emp_id}</div>
                                                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{r.from_emp_id} | {r.designation || r.submitted_by_role || '-'}</div>
                                            </td>
                                            <td className="p-5 text-sm font-bold text-gray-700">{r.department_name || '-'}</td>
                                            <td className="p-5">
                                                <span className={`inline-block px-3 py-1 rounded-xl border text-[10px] font-black uppercase tracking-widest ${badgeClass(r.rating)}`}>
                                                    {r.rating}
                                                </span>
                                            </td>
                                            <td className="p-5 text-sm text-gray-700 font-bold whitespace-pre-wrap">{r.message}</td>
                                            <td className="p-5 text-xs text-gray-500 font-bold whitespace-nowrap">{new Date(r.created_at).toLocaleString('en-GB')}</td>
                                            <td className="p-5">
                                                <button
                                                    type="button"
                                                    onClick={() => handleDeleteOne(r.id)}
                                                    disabled={actionLoading}
                                                    className="px-3 py-2 rounded-xl bg-rose-50 text-rose-700 border border-rose-100 hover:bg-rose-100 text-[10px] font-black uppercase tracking-widest disabled:opacity-50 disabled:cursor-not-allowed"
                                                >
                                                    Delete
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </Layout>
    );
};

export default FeedbackInboxPage;
