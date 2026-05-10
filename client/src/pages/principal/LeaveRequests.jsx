import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../../components/Layout';
import api from '../../utils/api';
import Swal from 'sweetalert2';
import { FaCheck, FaTimes, FaComment, FaCalendarDay, FaUserTag, FaClock, FaCheckCircle, FaHourglassHalf, FaGift, FaFileAlt, FaTimesCircle } from 'react-icons/fa';
import { motion, AnimatePresence } from 'framer-motion';

import { useAuth } from '../../context/AuthContext';

const LeaveRequests = () => {
    const { user } = useAuth();
    const [leaves, setLeaves] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedIds, setSelectedIds] = useState([]);
    const [leaveTypesMap, setLeaveTypesMap] = useState({});
    const [permissions, setPermissions] = useState([]);
    const navigate = useNavigate();

    // Helper function to get full leave type name
    const getLeaveTypeName = (type) => {
        return leaveTypesMap[type] || type;
    };

    useEffect(() => {
        fetchLeaves();
        fetchLeaveTypes();
        fetchPermissions();
    }, []);

    const fetchLeaveTypes = async () => {
        try {
            const { data } = await api.get('/leave-types');
            const map = {};
            data.forEach(t => {
                map[t.label] = `${t.full_name} (${t.label})`;
            });
            setLeaveTypesMap(map);
        } catch { console.error('Failed to fetch leave types'); }
    };

    const fetchPermissions = async () => {
        try {
            const { data } = await api.get('/permissions');
            setPermissions(data);
        } catch (err) { console.error('Failed to fetch permissions', err); }
    };

    const handlePermissionAction = async (id, status) => {
        const { value: comments } = await Swal.fire({
            title: `${status === 'Approved' ? 'Approve' : 'Reject'} Permission?`,
            input: 'textarea',
            inputLabel: 'Comments (Optional)',
            inputPlaceholder: 'Enter your comments...',
            showCancelButton: true,
            confirmButtonColor: status === 'Approved' ? '#059669' : '#ef4444',
            confirmButtonText: `Yes, ${status}`,
        });
        if (comments !== undefined) {
            try {
                await api.put(`/permissions/${id}/approve`, { status, comments });
                Swal.fire({ title: 'Updated', text: 'Permission request updated.', icon: 'success', confirmButtonColor: '#2563eb' });
                fetchPermissions();
            } catch (err) {
                Swal.fire({ title: 'Error', text: err.response?.data?.message || 'Failed to update.', icon: 'error', confirmButtonColor: '#2563eb' });
            }
        }
    };

    const fetchLeaves = async () => {
        try {
            const { data } = await api.get('/leaves');
            setLeaves(data);
            setLoading(false);
            setSelectedIds([]); // Clear selection on refresh
        } catch (error) {
            console.error("Error fetching leaves", error);
            setLoading(false);
        }
    };

    const handleAction = async (id, status) => {
        const reqObj = leaves.find((l) => l.id === id);
        const isMedicalLeave = String(reqObj?.leave_type || '').toUpperCase() === 'ML';
        const { value: comments } = await Swal.fire({
            title: status === 'Approved'
                ? (isMedicalLeave ? 'Final Verify ML Docs and Approve?' : 'Approve Leave?')
                : 'Reject Leave?',
            input: 'textarea',
            inputLabel: 'Comments (Optional)',
            inputPlaceholder: 'Enter your message to the employee...',
            showCancelButton: true,
            confirmButtonColor: status === 'Approved' ? '#059669' : '#ef4444',
            confirmButtonText: `Yes, ${status}`,
            background: '#fff',
            color: '#1e3a8a',
            customClass: {
                popup: 'swal-modern-popup'
            }
        });

        if (comments !== undefined) {
            try {
                await api.put(`/leaves/${id}/approve`, { status, comments });
                Swal.fire({
                    title: 'Leave Updated',
                    text: 'The decision has been saved and the employee notified.',
                    icon: 'success',
                    confirmButtonColor: '#2563eb'
                });
                fetchLeaves();
            } catch (error) {
                Swal.fire({
                    title: 'Sync Error',
                    text: error.response?.data?.message || 'Failed to update ledger.',
                    icon: 'error',
                    confirmButtonColor: '#2563eb'
                });
            }
        }
    };

    const handleBulkAction = async (status) => {
        if (selectedIds.length === 0) return;

        const { value: comments } = await Swal.fire({
            title: `${status === 'Approved' ? 'Approve' : 'Reject'} ${selectedIds.length} Requests?`,
            input: 'textarea',
            inputLabel: 'Comments (Optional)',
            inputPlaceholder: 'This comment will apply to all selected requests...',
            showCancelButton: true,
            confirmButtonColor: status === 'Approved' ? '#059669' : '#ef4444',
            confirmButtonText: `Yes, ${status} All`,
            background: '#fff',
        });

        if (comments !== undefined) {
            try {
                Swal.fire({
                    title: 'Processing...',
                    didOpen: () => Swal.showLoading()
                });

                await Promise.all(selectedIds.map(id => api.put(`/leaves/${id}/approve`, { status, comments })));

                Swal.fire({
                    title: 'Bulk Process Complete',
                    text: `Successfully processed ${selectedIds.length} requests.`,
                    icon: 'success',
                    confirmButtonColor: '#2563eb'
                });
                fetchLeaves();
            } catch (error) {
                Swal.fire({
                    title: 'Bulk Action Failed',
                    text: 'Some requests might not have been updated.',
                    icon: 'error',
                    confirmButtonColor: '#2563eb'
                });
            }
        }
    };

    const handleViewMedicalDocuments = (leave) => {
        const data = leave?.ml_doc_file_data;
        if (!data) {
            Swal.fire({ title: 'No Document', text: 'Medical documents are not uploaded yet.', icon: 'info', confirmButtonColor: '#2563eb' });
            return;
        }
        const win = window.open('', '_blank', 'noopener,noreferrer,width=1000,height=800');
        if (!win) return;
        const safeName = leave?.ml_doc_file_name || 'medical-document';
        win.document.write(`
            <html>
                <head><title>${safeName}</title></head>
                <body style="margin:0;">
                    <iframe src="${data}" style="width:100%;height:100vh;border:none;"></iframe>
                </body>
            </html>
        `);
        win.document.close();
    };

    const toggleSelect = (id) => {
        setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
    };

    const toggleSelectAll = () => {
        if (selectedIds.length === pendingLeaves.length) {
            setSelectedIds([]);
        } else {
            setSelectedIds(pendingLeaves.map(l => l.id));
        }
    };

    const pendingLeaves = leaves.filter(l => l.my_approval_status === 'Pending');
    const pastLeaves = leaves.filter(l => (l.my_approval_status === 'Approved' || l.my_approval_status === 'Rejected') && l.emp_id !== user?.emp_id);
    const pendingPerms = permissions.filter(p => p.my_approval_status === 'Pending' && p.emp_id !== user?.emp_id);
    const pastPerms = permissions.filter(p => (p.my_approval_status === 'Approved' || p.my_approval_status === 'Rejected') && p.emp_id !== user?.emp_id);

    const [activeTab, setActiveTab] = useState(() => {
        const hash = window.location.hash.replace('#', '');
        return hash === 'permission' ? 'permissions' : 'leaves';
    });

    useEffect(() => {
        const handleHash = () => {
            const hash = window.location.hash.replace('#', '');
            if (hash === 'permission') setActiveTab('permissions');
            else if (hash === 'leaves' || hash === '') setActiveTab('leaves');
        };
        handleHash();
        window.addEventListener('hashchange', handleHash);
        return () => window.removeEventListener('hashchange', handleHash);
    }, []);

    return (
        <Layout>
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="max-w-7xl mx-auto"
            >
                <div className="mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                    <div>
                        <h1 className="text-3xl font-black text-gray-800 tracking-tight">Incoming Requests</h1>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-2">Authorization & Approval Center</p>
                    </div>

                    <div className="flex bg-gray-100/50 p-1.5 rounded-2xl border border-gray-100">
                        <button
                            onClick={() => setActiveTab('leaves')}
                            className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                                activeTab === 'leaves' 
                                ? 'bg-white text-sky-600 shadow-md ring-1 ring-sky-50' 
                                : 'text-gray-400 hover:text-gray-600'
                            }`}
                        >
                            Leaves ({pendingLeaves.length})
                        </button>
                        <button
                            onClick={() => setActiveTab('permissions')}
                            className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                                activeTab === 'permissions' 
                                ? 'bg-white text-teal-600 shadow-md ring-1 ring-teal-50' 
                                : 'text-gray-400 hover:text-gray-600'
                            }`}
                        >
                            Permissions ({pendingPerms.length})
                        </button>
                    </div>
                </div>

                {activeTab === 'permissions' ? (
                    <div className="space-y-12 animate-in fade-in duration-500">
                        {/* Pending Permission Approvals */}
                        {pendingPerms.length > 0 ? (
                            <div className="modern-card !p-0 overflow-hidden border-teal-100">
                                <div className="bg-teal-50/30 p-6 border-b border-teal-50 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="h-10 w-10 rounded-xl bg-teal-100 flex items-center justify-center text-teal-600 shadow-sm border border-teal-100">
                                            <FaFileAlt size={18} />
                                        </div>
                                        <h2 className="text-lg font-black text-gray-800 uppercase tracking-widest">Pending Permission Requests</h2>
                                    </div>
                                    <span className="bg-teal-600 text-white px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest shadow-lg shadow-teal-100">
                                        {pendingPerms.length} Requests
                                    </span>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left border-collapse">
                                        <thead>
                                            <tr className="bg-gray-50/50">
                                                <th className="p-5 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-teal-50">Employee</th>
                                                <th className="p-5 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-teal-50">Date & Time</th>
                                                <th className="p-5 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-teal-50">Reason</th>
                                                <th className="p-5 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-teal-50 text-center">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-teal-50/50">
                                            <AnimatePresence>
                                                {pendingPerms.map((perm, idx) => (
                                                    <motion.tr key={perm.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: idx * 0.05 }} className="hover:bg-teal-50/20 transition-all group">
                                                        <td className="p-5">
                                                            <div className="flex items-center gap-4">
                                                                <img
                                                                    src={perm.applicant_pic || `https://ui-avatars.com/api/?name=${encodeURIComponent(perm.applicant_name || '?')}&size=100&background=14b8a6&color=fff&bold=true`}
                                                                    alt=""
                                                                    className="h-12 w-12 rounded-2xl object-cover shadow-lg"
                                                                />
                                                                <div>
                                                                    <p className="text-sm font-black text-gray-800 tracking-tight">{perm.applicant_name}</p>
                                                                    <p className="text-[10px] font-black text-teal-500 uppercase tracking-widest mt-0.5">{perm.department_name}</p>
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className="p-5">
                                                            <p className="text-sm font-black text-gray-700">{new Date(perm.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                                                            <p className="text-[10px] font-bold text-gray-400 mt-0.5">{perm.from_time?.slice(0, 5)} — {perm.to_time?.slice(0, 5)}</p>
                                                        </td>
                                                        <td className="p-5 max-w-xs">
                                                            <p className="text-sm font-black text-gray-800 truncate">{perm.subject || 'Permission Request'}</p>
                                                            <p className="text-xs text-gray-400 font-medium line-clamp-2 mt-1 leading-relaxed">{perm.reason}</p>
                                                        </td>
                                                        <td className="p-5">
                                                            <div className="flex justify-center gap-3">
                                                                <button onClick={() => handlePermissionAction(perm.id, 'Approved')} className="h-10 w-10 bg-emerald-50 text-emerald-600 rounded-xl hover:bg-emerald-600 hover:text-white transition-all shadow-sm flex items-center justify-center active:scale-90" title="Approve">
                                                                    <FaCheck />
                                                                </button>
                                                                <button onClick={() => handlePermissionAction(perm.id, 'Rejected')} className="h-10 w-10 bg-rose-50 text-rose-600 rounded-xl hover:bg-rose-600 hover:text-white transition-all shadow-sm flex items-center justify-center active:scale-90" title="Reject">
                                                                    <FaTimes />
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </motion.tr>
                                                ))}
                                            </AnimatePresence>
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        ) : (
                            <div className="p-20 text-center flex flex-col items-center gap-6 opacity-20">
                                <div className="h-20 w-20 rounded-full bg-teal-50 text-teal-600 flex items-center justify-center">
                                    <FaCheckCircle size={48} />
                                </div>
                                <div>
                                    <p className="text-lg font-black text-gray-800 tracking-tight">No Pending Permissions</p>
                                    <p className="text-sm font-bold uppercase tracking-widest text-gray-500 mt-1">All permission requests have been updated.</p>
                                </div>
                            </div>
                        )}

                        {/* Past Permission Requests */}
                        {pastPerms.length > 0 && (
                            <div className="modern-card !p-0 overflow-hidden border-gray-100">
                                <div className="bg-gray-50/30 p-6 border-b border-gray-100 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="h-10 w-10 rounded-xl bg-gray-100 flex items-center justify-center text-gray-500 shadow-sm border border-gray-100">
                                            <FaFileAlt size={18} />
                                        </div>
                                        <h2 className="text-lg font-black text-gray-700 uppercase tracking-widest">Past Permission Requests</h2>
                                    </div>
                                    <span className="bg-gray-200 text-gray-600 px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest">
                                        {pastPerms.length} Processed
                                    </span>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left border-collapse">
                                        <thead>
                                            <tr className="bg-gray-50/50">
                                                <th className="p-5 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100">Employee</th>
                                                <th className="p-5 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100">Date & Time</th>
                                                <th className="p-5 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100">Reason</th>
                                                <th className="p-5 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100 text-center">Your Decision</th>
                                                <th className="p-5 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100 text-center">Overall Status</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-50">
                                            {pastPerms.map((perm, idx) => (
                                                <motion.tr key={perm.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: idx * 0.03 }} className="hover:bg-gray-50/30 transition-all">
                                                    <td className="p-5">
                                                        <div className="flex items-center gap-4">
                                                            <img
                                                                src={perm.applicant_pic || `https://ui-avatars.com/api/?name=${encodeURIComponent(perm.applicant_name || '?')}&size=100&background=14b8a6&color=fff&bold=true`}
                                                                alt=""
                                                                className="h-12 w-12 rounded-2xl object-cover shadow-lg"
                                                            />
                                                            <div>
                                                                <p className="text-sm font-black text-gray-800 tracking-tight">{perm.applicant_name}</p>
                                                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-0.5">{perm.department_name}</p>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="p-5">
                                                        <p className="text-sm font-black text-gray-700">{new Date(perm.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                                                        <p className="text-[10px] font-bold text-gray-400 mt-0.5">{perm.from_time?.slice(0, 5)} — {perm.to_time?.slice(0, 5)}</p>
                                                    </td>
                                                    <td className="p-5 max-w-xs">
                                                        <p className="text-sm font-black text-gray-800 truncate">{perm.subject || 'Permission Request'}</p>
                                                        <p className="text-xs text-gray-400 font-medium line-clamp-2 mt-1 leading-relaxed">{perm.reason}</p>
                                                    </td>
                                                    <td className="p-5 text-center">
                                                        <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest ${perm.my_approval_status === 'Approved' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' :
                                                            'bg-rose-50 text-rose-600 border border-rose-100'
                                                            }`}>
                                                            {perm.my_approval_status === 'Approved' ? <FaCheckCircle size={10} /> : <FaTimesCircle size={10} />}
                                                            {perm.my_approval_status}
                                                        </span>
                                                    </td>
                                                    <td className="p-5 text-center">
                                                        <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest ${perm.status === 'Approved' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' :
                                                            perm.status === 'Rejected' ? 'bg-rose-50 text-rose-600 border border-rose-100' :
                                                                'bg-amber-50 text-amber-600 border border-amber-100'
                                                            }`}>
                                                            {perm.status === 'Approved' ? <FaCheckCircle size={10} /> :
                                                                perm.status === 'Rejected' ? <FaTimesCircle size={10} /> :
                                                                    <FaHourglassHalf size={10} />}
                                                            {perm.status}
                                                        </span>
                                                    </td>
                                                </motion.tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="space-y-12 animate-in fade-in duration-500">


                <div className="modern-card !p-0 overflow-hidden border-sky-100 mb-12">
                    <div className="bg-sky-50/30 p-6 border-b border-sky-50 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-xl bg-sky-100 flex items-center justify-center text-sky-600 shadow-sm border border-sky-100">
                                <FaHourglassHalf size={18} className={loading ? 'animate-spin' : ''} />
                            </div>
                            <h2 className="text-lg font-black text-gray-800 uppercase tracking-widest">Pending Requests</h2>
                        </div>
                        <div className="flex items-center gap-4">
                            {selectedIds.length > 0 && (
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.9 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    className="flex items-center gap-2 bg-white border border-sky-100 p-1 rounded-xl shadow-sm"
                                >
                                    <button
                                        onClick={() => handleBulkAction('Approved')}
                                        className="px-4 py-2 bg-emerald-50 text-emerald-600 rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-emerald-600 hover:text-white transition-all active:scale-95"
                                    >
                                        Approve Selected ({selectedIds.length})
                                    </button>
                                    <button
                                        onClick={() => handleBulkAction('Rejected')}
                                        className="px-4 py-2 bg-rose-50 text-rose-600 rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-rose-600 hover:text-white transition-all active:scale-95"
                                    >
                                        Reject Selected
                                    </button>
                                </motion.div>
                            )}
                            <span className="bg-sky-600 text-white px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest shadow-lg shadow-sky-100">
                                {pendingLeaves.length} Requests
                            </span>
                        </div>
                    </div>

                    {loading ? (
                        <div className="p-20 text-center flex flex-col items-center gap-4">
                            <div className="h-12 w-12 border-4 border-sky-100 border-t-sky-600 rounded-full animate-spin"></div>
                            <p className="text-[10px] font-black text-sky-500 uppercase tracking-[0.2em]">Synchronizing Requests...</p>
                        </div>
                    ) : pendingLeaves.length > 0 ? (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-gray-50/50">
                                        <th className="p-5 w-12 border-b border-sky-50">
                                            <div className="flex justify-center">
                                                <input
                                                    type="checkbox"
                                                    className="w-4 h-4 rounded border-sky-200 text-sky-600 focus:ring-sky-500 cursor-pointer"
                                                    checked={selectedIds.length === pendingLeaves.length && pendingLeaves.length > 0}
                                                    onChange={toggleSelectAll}
                                                />
                                            </div>
                                        </th>
                                        <th className="p-3 md:p-5 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-sky-50">Employee</th>
                                        <th className="p-3 md:p-5 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-sky-50">Leave Details</th>
                                        <th className="p-3 md:p-5 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-sky-50">Reason</th>
                                        <th className="p-3 md:p-5 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-sky-50">Role</th>
                                        <th className="p-3 md:p-5 text-[10px] font-black text-gray-500 uppercase tracking-widest border-b border-sky-50 text-center">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-sky-50/50">
                                    <AnimatePresence>
                                        {pendingLeaves.map((leave, idx) => (
                                            <motion.tr
                                                key={leave.id}
                                                initial={{ opacity: 0 }}
                                                animate={{ opacity: 1 }}
                                                exit={{ opacity: 0, x: -20 }}
                                                transition={{ delay: idx * 0.05 }}
                                                className={`transition-all group ${selectedIds.includes(leave.id) ? 'bg-sky-50/40' : 'hover:bg-sky-50/20'}`}
                                            >
                                                <td className="p-3 md:p-5 align-top">
                                                    <div className="flex justify-center">
                                                        <input
                                                            type="checkbox"
                                                            className="w-4 h-4 rounded border-sky-200 text-sky-600 focus:ring-sky-500 cursor-pointer"
                                                            checked={selectedIds.includes(leave.id)}
                                                            onChange={() => toggleSelect(leave.id)}
                                                        />
                                                    </div>
                                                </td>
                                                <td className="p-3 md:p-5 align-top">
                                                    <div
                                                        className="flex items-center gap-4 cursor-pointer group/profile"
                                                        onClick={() => {
                                                            const rolePrefix = user?.role === 'admin' ? 'admin' :
                                                                user?.role === 'principal' ? 'principal' :
                                                                    user?.role === 'hod' ? 'hod' : 'staff';
                                                            navigate(`/${rolePrefix}/profile/${leave.applicant_id || leave.emp_id}`);
                                                            window.dispatchEvent(new CustomEvent('closeSidebar'));
                                                        }}
                                                    >
                                                        <img
                                                            src={leave.applicant_pic || `https://ui-avatars.com/api/?name=${encodeURIComponent(leave.applicant_name || '?')}&size=100&background=0ea5e9&color=fff&bold=true`}
                                                            alt=""
                                                            className="h-12 w-12 rounded-2xl object-cover shadow-lg group-hover/profile:scale-110 transition-transform"
                                                        />
                                                        <div>
                                                            <p className="text-sm font-black text-gray-800 tracking-tight group-hover/profile:text-sky-600 transition-colors break-words whitespace-normal">{leave.applicant_name}</p>
                                                            <p className="text-[10px] font-black text-sky-500 uppercase tracking-widest mt-0.5">{leave.department_name}</p>
                                                            <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest mt-0.5">{leave.applicant_role || 'staff'}</p>
                                                            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mt-0.5">{leave.applicant_designation || 'N/A'}</p>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="p-3 md:p-5 align-top">
                                                    <div className="space-y-1.5">
                                                        {leave.request_type === 'comp_credit' ? (
                                                            <span className="inline-block px-2 py-0.5 bg-purple-100 text-purple-600 rounded-md text-[8px] font-black uppercase tracking-widest mb-1">
                                                                <FaGift className="inline mr-1" size={8} /> Comp Off Request
                                                            </span>
                                                        ) : (
                                                            <span className="inline-block px-2 py-0.5 bg-sky-100 text-sky-600 rounded-md text-[8px] font-black uppercase tracking-widest mb-1">
                                                                {getLeaveTypeName(leave.leave_type)}
                                                                {leave.days_count > 0 && (
                                                                    <> • {leave.days_count} Days</>
                                                                )}
                                                                {leave.hours && Number(leave.hours) > 0 && (
                                                                    <>
                                                                        {leave.days_count < 1 ? ` • ${leave.hours} Hours` : ` | ${leave.hours} Hours`}
                                                                        {(() => {
                                                                            try {
                                                                                const details = typeof leave.dates_detail === 'string' ? JSON.parse(leave.dates_detail) : leave.dates_detail;
                                                                                if (details && details.length === 1 && !details[0].is_full_day) {
                                                                                    return ` (${details[0].from_time} - ${details[0].to_time})`;
                                                                                }
                                                                            } catch (e) { }
                                                                            return '';
                                                                        })()}
                                                                    </>
                                                                )}
                                                            </span>
                                                        )}
                                                        <div className="flex items-center gap-2 text-[10px] font-black text-gray-400 uppercase tracking-widest">
                                                            <FaCalendarDay className="text-sky-200" />
                                                            {leave.days_count > 0
                                                                ? `${new Date(leave.from_date).toLocaleDateString('en-US', { day: '2-digit', month: 'short' })} - ${new Date(leave.to_date).toLocaleDateString('en-US', { day: '2-digit', month: 'short' })}`
                                                                : (leave.hours && Number(leave.hours) > 0
                                                                    ? (Number(leave.days_count) === 0 ? (() => {
                                                                        try {
                                                                            const details = typeof leave.dates_detail === 'string' ? JSON.parse(leave.dates_detail) : leave.dates_detail;
                                                                            if (details && details.length === 1 && !details[0].is_full_day) {
                                                                                return `${new Date(leave.from_date).toLocaleDateString('en-US', { day: '2-digit', month: 'short' })} | ${details[0].from_time} - ${details[0].to_time}`;
                                                                            }
                                                                        } catch (e) { }
                                                                        return `${leave.hours} Hours`;
                                                                    })() : `${leave.hours} Hours`)
                                                                    : `${new Date(leave.from_date).toLocaleDateString('en-US', { day: '2-digit', month: 'short' })}`
                                                                )
                                                            }
                                                        </div>
                                                        {String(leave.leave_type || '').toUpperCase() === 'ML' && (
                                                            <div className="flex flex-wrap gap-1 mt-2">
                                                                <span className={`px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-widest border ${leave.ml_document_submitted ? 'bg-sky-50 text-sky-600 border-sky-100' : 'bg-gray-50 text-gray-500 border-gray-100'}`}>
                                                                    {leave.ml_document_submitted ? 'Docs Submitted' : 'Docs Pending'}
                                                                </span>
                                                                <span className={`px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-widest border ${leave.ml_hod_verified ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-amber-50 text-amber-600 border-amber-100'}`}>
                                                                    {leave.ml_hod_verified ? 'HOD Verified' : 'HOD Verify Pending'}
                                                                </span>
                                                            </div>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="p-3 md:p-5 max-w-xs align-top">
                                                    <p className="text-sm font-black text-gray-800 tracking-tight break-words whitespace-normal sm:truncate">{leave.subject || (leave.request_type === 'comp_credit' ? 'Comp Off Request' : 'Leave Request')}</p>
                                                    <p className="text-xs text-gray-400 font-medium mt-1 leading-relaxed break-words whitespace-normal sm:line-clamp-2">{leave.reason}</p>
                                                </td>
                                                <td className="p-3 md:p-5 align-top">
                                                    <div className="flex flex-col gap-2">
                                                        <div className="flex items-center gap-2">
                                                            <div className="h-6 w-6 rounded-lg bg-gray-50 flex items-center justify-center text-gray-400 border border-gray-100">
                                                                <FaUserTag size={10} />
                                                            </div>
                                                            <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest">
                                                                {leave.my_approver_type}
                                                            </span>
                                                        </div>
                                                        {leave.approval_notes && (
                                                            <div className="px-2 py-1 bg-sky-50 text-sky-600 rounded-md text-[8px] font-black uppercase tracking-tight border border-sky-100">
                                                                {leave.approval_notes}
                                                            </div>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="p-3 md:p-5 align-top">
                                                    <div className="flex justify-center gap-3">
                                                        {String(leave.leave_type || '').toUpperCase() === 'ML' && leave.ml_document_submitted && (
                                                            <button
                                                                onClick={() => handleViewMedicalDocuments(leave)}
                                                                className="h-10 w-10 bg-sky-50 text-sky-600 rounded-xl hover:bg-sky-600 hover:text-white transition-all shadow-sm flex items-center justify-center group/btn active:scale-90"
                                                                title="View ML documents"
                                                            >
                                                                <FaFileAlt className="group-hover/btn:scale-125 transition-transform" />
                                                            </button>
                                                        )}
                                                        <button
                                                            onClick={() => handleAction(leave.id, 'Approved')}
                                                            className="h-10 w-10 bg-emerald-50 text-emerald-600 rounded-xl hover:bg-emerald-600 hover:text-white transition-all shadow-sm flex items-center justify-center group/btn active:scale-90"
                                                            title={String(leave.leave_type || '').toUpperCase() === 'ML' ? 'Final Verify ML Docs' : 'Authorize'}
                                                        >
                                                            <FaCheck className="group-hover/btn:scale-125 transition-transform" />
                                                        </button>
                                                        <button
                                                            onClick={() => handleAction(leave.id, 'Rejected')}
                                                            className="h-10 w-10 bg-rose-50 text-rose-600 rounded-xl hover:bg-rose-600 hover:text-white transition-all shadow-sm flex items-center justify-center group/btn active:scale-90"
                                                            title="Decline"
                                                        >
                                                            <FaTimes className="group-hover/btn:scale-125 transition-transform" />
                                                        </button>
                                                    </div>
                                                </td>
                                            </motion.tr>
                                        ))}
                                    </AnimatePresence>
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div className="p-20 text-center flex flex-col items-center gap-6 opacity-20">
                            <div className="h-20 w-20 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center">
                                <FaCheckCircle size={48} />
                            </div>
                            <div>
                                <p className="text-lg font-black text-gray-800 tracking-tight">No Pending Requests</p>
                                <p className="text-sm font-bold uppercase tracking-widest text-gray-500 mt-1">All leave requests have been processed.</p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Past Requests Section */}
                {pastLeaves.length > 0 && (
                    <div className="modern-card !p-0 overflow-hidden border-gray-100">
                        <div className="bg-gray-50/30 p-6 border-b border-gray-100 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="h-10 w-10 rounded-xl bg-gray-100 flex items-center justify-center text-gray-500 shadow-sm border border-gray-100">
                                    <FaClock size={18} />
                                </div>
                                <h2 className="text-lg font-black text-gray-700 uppercase tracking-widest">Past Requests</h2>
                            </div>
                            <span className="bg-gray-200 text-gray-600 px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest">
                                {pastLeaves.length} Processed
                            </span>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-gray-50/50">
                                        <th className="p-5 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100">Employee</th>
                                        <th className="p-5 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100">Leave Details</th>
                                        <th className="p-5 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100">Reason</th>
                                        <th className="p-5 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100 text-center">Your Decision</th>
                                        <th className="p-5 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100 text-center">Overall Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    <AnimatePresence>
                                        {pastLeaves.map((leave, idx) => (
                                            <motion.tr
                                                key={leave.id}
                                                initial={{ opacity: 0 }}
                                                animate={{ opacity: 1 }}
                                                transition={{ delay: idx * 0.03 }}
                                                className="hover:bg-gray-50/30 transition-all group"
                                            >
                                                <td className="p-3 md:p-5 align-top">
                                                    <div
                                                        className="flex items-center gap-4 cursor-pointer group/profile"
                                                        onClick={() => {
                                                            const rolePrefix = user?.role === 'admin' ? 'admin' :
                                                                user?.role === 'principal' ? 'principal' :
                                                                    user?.role === 'hod' ? 'hod' : 'staff';
                                                            navigate(`/${rolePrefix}/profile/${leave.applicant_id || leave.emp_id}`);
                                                            window.dispatchEvent(new CustomEvent('closeSidebar'));
                                                        }}
                                                    >
                                                        <img
                                                            src={leave.applicant_pic || `https://ui-avatars.com/api/?name=${encodeURIComponent(leave.applicant_name || '?')}&size=100&background=0ea5e9&color=fff&bold=true`}
                                                            alt=""
                                                            className="h-12 w-12 rounded-2xl object-cover shadow-lg group-hover/profile:scale-110 transition-transform"
                                                        />
                                                        <div>
                                                            <p className="text-sm font-black text-gray-800 tracking-tight group-hover/profile:text-sky-600 transition-colors break-words whitespace-normal">{leave.applicant_name}</p>
                                                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-0.5">{leave.department_name}</p>
                                                            <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest mt-0.5">{leave.applicant_role || 'staff'}</p>
                                                            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mt-0.5">{leave.applicant_designation || 'N/A'}</p>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="p-3 md:p-5 align-top">
                                                    <div className="space-y-1.5">
                                                        {leave.request_type === 'comp_credit' ? (
                                                            <span className="inline-block px-2 py-0.5 bg-purple-100 text-purple-600 rounded-md text-[8px] font-black uppercase tracking-widest mb-1">
                                                                <FaGift className="inline mr-1" size={8} /> Comp Off Request
                                                            </span>
                                                        ) : (
                                                            <span className="inline-block px-2 py-0.5 bg-sky-100 text-sky-600 rounded-md text-[8px] font-black uppercase tracking-widest mb-1">
                                                                {getLeaveTypeName(leave.leave_type)} &bull; { (Number(leave.days_count) > 0) ? `${leave.days_count} Days` : (leave.hours && Number(leave.hours) > 0) ? `${leave.hours} Hours` : `${leave.days_count} Days` }
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
                                                        )}
                                                        <div className="flex items-center gap-2 text-[10px] font-black text-gray-400 uppercase tracking-widest">
                                                            <FaCalendarDay className="text-gray-300" />
                                                            {new Date(leave.from_date).toLocaleDateString('en-US', { day: '2-digit', month: 'short' })} - {new Date(leave.to_date).toLocaleDateString('en-US', { day: '2-digit', month: 'short' })}
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="p-3 md:p-5 max-w-xs align-top">
                                                    <p className="text-sm font-black text-gray-800 tracking-tight break-words whitespace-normal sm:truncate">{leave.subject || (leave.request_type === 'comp_credit' ? 'Comp Off Request' : 'Leave Request')}</p>
                                                    <p className="text-xs text-gray-400 font-medium mt-1 leading-relaxed break-words whitespace-normal sm:line-clamp-2">{leave.reason}</p>
                                                </td>
                                                <td className="p-3 md:p-5 text-center align-top">
                                                    <div className="flex flex-col items-center gap-1">
                                                        <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest ${leave.my_approval_status === 'Approved'
                                                            ? 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                                                            : 'bg-rose-50 text-rose-600 border border-rose-100'
                                                            }`}>
                                                            {leave.my_approval_status === 'Approved' ? <FaCheckCircle size={10} /> : <FaTimes size={10} />}
                                                            {leave.my_approval_status}
                                                        </span>
                                                        {leave.approval_acted_at && (
                                                            <span className="text-[8px] font-bold text-gray-400">
                                                                {new Date(leave.approval_acted_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="p-3 md:p-5 text-center align-top">
                                                    <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest ${leave.status === 'Approved' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' :
                                                        leave.status === 'Rejected' ? 'bg-rose-50 text-rose-600 border border-rose-100' :
                                                            'bg-amber-50 text-amber-600 border border-amber-100'
                                                        }`}>
                                                        {leave.status === 'Approved' ? <FaCheckCircle size={10} /> :
                                                            leave.status === 'Rejected' ? <FaTimes size={10} /> :
                                                                <FaHourglassHalf size={10} />}
                                                        {leave.status}
                                                    </span>
                                                </td>
                                            </motion.tr>
                                        ))}
                                    </AnimatePresence>
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
        )}
    </motion.div>
</Layout>
);
};

export default LeaveRequests;

