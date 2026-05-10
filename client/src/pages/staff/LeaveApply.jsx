import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import Layout from '@/components/Layout';
import api from '@/utils/api';
import Swal from 'sweetalert2';
import { useAuth } from '@/context/AuthContext';
import { formatTo12Hr } from '@/utils/timeFormatter';
import { useSocket } from '@/context/SocketContext';
import {
    FaPaperPlane, FaUserFriends, FaHistory, FaCalendarCheck,
    FaClock, FaInfoCircle, FaCheckCircle, FaTimesCircle,
    FaHourglassHalf, FaPlusCircle, FaInbox, FaCheck,
    FaTimes, FaUserTag, FaCalendarAlt, FaSearch, FaGift, FaFileAlt, FaCalendarDay, FaChevronRight, FaExchangeAlt, FaUpload
} from 'react-icons/fa';
import { motion, AnimatePresence } from 'framer-motion';

const LeaveApply = () => {
    const { user } = useAuth();
    const socket = useSocket();
    const location = useLocation();

    // Determine initial tab from hash or state
    let initialTab = 'apply';
    if (location.hash === '#approvals') initialTab = 'approvals';
    if (location.hash === '#history') initialTab = 'history';
    if (location.hash === '#permission') initialTab = 'permission';
    if (location.hash === '#compoff') initialTab = 'compoff';
    if (location.hash === '#balance') initialTab = 'balance';
    if (location.hash === '#apply') initialTab = 'apply';

    const [activeTab, setActiveTab] = useState(initialTab); // 'apply', 'approvals', 'history'
    const [pendingApprovals, setPendingApprovals] = useState([]);
    const [pastApprovals, setPastApprovals] = useState([]);
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedIds, setSelectedIds] = useState([]);
    const [myLimits, setMyLimits] = useState(null);
    const [limitYear, setLimitYear] = useState(new Date().getFullYear());
    const [balanceLoading, setBalanceLoading] = useState(false);
    const [leaveTypes, setLeaveTypes] = useState([]);
    const [eligibleCompDates, setEligibleCompDates] = useState([]);
    const [compLoading, setCompLoading] = useState(false);

    // Permission letter states
    const [permissions, setPermissions] = useState([]);
    const [permForm, setPermForm] = useState({ date: '', subject: '', reason: '', timeSlot: 'Morning', replacement_staff_id: '' });
    const [permSubmitting, setPermSubmitting] = useState(false);

    const [formData, setFormData] = useState({
        leave_type: 'CL',
        subject: '',
        reason: '',
        dates: [] // Each item: { date, is_full_day, from_time, to_time, replacements: [{staff_id, periods}] }
    });
    const [currentDate, setCurrentDate] = useState({
        date: '',
        day_type: 'Full Day', // 'Full Day', 'Half Day AM', 'Half Day PM'
        replacements: [{ staff_id: '', periods: '' }]
    });
    const [odProof, setOdProof] = useState({ file_name: '', file_type: '', file_data: '' });
    const [staffList, setStaffList] = useState([]);
    const [staffSearch, setStaffSearch] = useState('');
    const [conflicts, setConflicts] = useState([]);
    const [showStaffPicker, setShowStaffPicker] = useState(null); // { type: 'leave' | 'permission', index?: number }
    const [manageReplacements, setManageReplacements] = useState(null); // idx of the date in currentDate or formData.dates? Let's use it for the one being added.
    const [timetableRows, setTimetableRows] = useState([]);

    const getDateInputValue = (offsetDays = 0) => {
        const base = new Date();
        base.setHours(0, 0, 0, 0);
        base.setDate(base.getDate() + Number(offsetDays || 0));
        const y = base.getFullYear();
        const m = String(base.getMonth() + 1).padStart(2, '0');
        const d = String(base.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    };

    const quickDateOptions = [
        { label: 'Today', value: getDateInputValue(0) },
        { label: 'Tomorrow', value: getDateInputValue(1) },
        { label: 'Next Day', value: getDateInputValue(2) }
    ];

    // Helper function to get full leave type name
    const getLeaveTypeName = (type) => {
        const match = leaveTypes.find(ct => ct.label === type || ct.key === type);
        if (match) return `${match.full} (${match.label})`;
        return type;
    };

    useEffect(() => {
        const fetchLeaveTypes = async () => {
            try {
                const { data } = await api.get('/leave-types');
                setLeaveTypes(data.filter(t => t.key !== 'lop').map(t => ({
                    id: t.id,
                    key: t.key,
                    label: t.label,
                    full: t.full_name,
                    color: t.color,
                    defaultDays: t.default_days,
                    isDefault: t.is_default
                })));
            } catch { console.error('Failed to fetch leave types'); }
        };
        fetchLeaveTypes();
    }, []);

    // Listen to hash changes in case navigating from same page
    useEffect(() => {
        if (location.hash === '#approvals') {
            setActiveTab('approvals');
        } else if (location.hash === '#history') {
            setActiveTab('history');
        } else if (location.hash === '#permission') {
            setActiveTab('permission');
        } else if (location.hash === '#compoff') {
            setActiveTab('compoff');
        } else if (location.hash === '#balance') {
            setActiveTab('balance');
        } else if (location.hash === '#apply') {
            setActiveTab('apply');
        }
    }, [location.hash]);

    const fetchConflicts = async () => {
        try {
            const { data } = await api.get(`/leaves/conflicts?from=${formData.from_date}&to=${formData.to_date}`);
            setConflicts(data);
        } catch { console.error("Fetch conflicts failed"); }
    };

    const fetchStaff = async () => {
        try {
            // Fetch all staff across departments for replacement selection
            const { data } = await api.get('/employees?all=true');
            const blockedRoles = new Set(['admin', 'principal', 'management', 'institutional management']);
            const filtered = data.filter((emp) => {
                const role = String(emp?.role || '').trim().toLowerCase();
                const designation = String(emp?.designation || '').trim().toLowerCase();
                return !blockedRoles.has(role) && designation !== 'institutional management';
            });
            setStaffList(filtered);
        } catch { console.error("Fetch staff failed"); }
    };

    const fetchTimetable = async () => {
        try {
            const { data } = await api.get('/timetable');
            setTimetableRows(Array.isArray(data) ? data : []);
        } catch {
            setTimetableRows([]);
        }
    };

    const getDayNameFromDate = (dateStr) => {
        if (!dateStr) return '';
        const d = new Date(`${dateStr}T00:00:00`);
        if (Number.isNaN(d.getTime())) return '';
        return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d.getDay()];
    };

    const getMyTimetablePeriods = (dateStr) => {
        const dayName = getDayNameFromDate(dateStr);
        if (!dayName) return [];
        return timetableRows
            .filter((t) => String(t.emp_id) === String(user.emp_id) && String(t.day_of_week) === dayName)
            .map((t) => ({
                period_number: Number(t.period_number),
                subject: t.subject,
                start_time: t.start_time,
                end_time: t.end_time
            }))
            .filter((t) => Number.isFinite(t.period_number))
            .sort((a, b) => a.period_number - b.period_number);
    };

    const parseSelectedPeriods = (periodText) => {
        return String(periodText || '')
            .split(',')
            .map((v) => Number(String(v).replace(/[^0-9]/g, '')))
            .filter((n) => Number.isFinite(n) && n > 0);
    };

    const isStaffFreeForPeriods = (staffEmpId, dateStr, periodText) => {
        const selectedPeriods = parseSelectedPeriods(periodText);
        if (!selectedPeriods.length) return false;
        const dayName = getDayNameFromDate(dateStr);
        if (!dayName) return false;
        const staffDayRows = timetableRows.filter(
            (t) => String(t.emp_id) === String(staffEmpId) && String(t.day_of_week) === dayName
        );
        return selectedPeriods.every((p) => !staffDayRows.some((row) => Number(row.period_number) === p));
    };

    const fetchLeaves = async () => {
        setLoading(true);
        try {
            const { data } = await api.get('/leaves');
            // User's own applications
            const ownHistory = data.filter(l => l.emp_id === user.emp_id);
            const approvedReplacementHistory = data
                .filter(l => l.emp_id !== user.emp_id && l.my_approver_type === 'replacement' && l.my_approval_status === 'Approved')
                .map((l) => ({ ...l, is_replacement_history: true }));
            setHistory([...approvedReplacementHistory, ...ownHistory]);
            // Requests waiting for user's approval
            setPendingApprovals(data.filter(l => l.my_approval_status === 'Pending' && l.emp_id !== user.emp_id));
            // Past requests user already acted on
            setPastApprovals(data.filter(l => (l.my_approval_status === 'Approved' || l.my_approval_status === 'Rejected') && l.emp_id !== user.emp_id));
            setSelectedIds([]); // Reset selection
        } catch (error) {
            console.error("Error fetching leaves", error);
        } finally {
            setLoading(false);
        }
    };

    const fetchMyLimits = async () => {
        setBalanceLoading(true);
        try {
            const { data } = await api.get(`/leave-limits/my?year=${limitYear}`);
            setMyLimits(data);
        } catch (err) {
            console.error('Failed to fetch leave limits', err);
            // Fallback defaults so the balance tab still renders
            setMyLimits({
                year: limitYear,
                updated_at: null,
                from_month: null,
                to_month: null,
                cl_limit: 12,
                ml_limit: 12,
                od_limit: 10,
                comp_limit: 6,
                lop_limit: 30,
                permission_limit: 2,
                cl_taken: 0,
                ml_taken: 0,
                od_taken: 0,
                comp_taken: 0,
                lop_taken: 0,
                permission_taken: 0,
                comp_earned: 0
            });
        } finally { setBalanceLoading(false); }
    };

    const fetchEligibleCompDates = async () => {
        setCompLoading(true);
        try {
            const { data } = await api.get(`/leaves/comp-dates?year=${new Date().getFullYear()}`);
            setEligibleCompDates(data);
        } catch (err) {
            console.error('Failed to fetch comp dates', err);
        } finally { setCompLoading(false); }
    };

    const handleCompRequest = async (date) => {
        const dateStr = new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
        const { value: reason } = await Swal.fire({
            title: 'Request Comp Off',
            html: `<p style="font-size:13px; color:#64748b;">Request comp leave credit for working on <b>${dateStr}</b>?</p>`,
            input: 'textarea',
            inputLabel: 'Reason (Optional)',
            inputPlaceholder: 'Describe why you worked on this holiday...',
            showCancelButton: true,
            confirmButtonColor: '#7c3aed',
            confirmButtonText: 'Submit Request',
        });

        if (reason !== undefined) {
            try {
                await api.post('/leaves/comp-credit', { work_date: new Date(date).toLocaleDateString('en-CA'), reason });
                Swal.fire({
                    title: 'Request Submitted',
                    text: 'Your comp off request has been sent for approval.',
                    icon: 'success',
                    timer: 1500,
                    showConfirmButton: false
                });
                fetchEligibleCompDates();
                fetchLeaves();
                fetchMyLimits();
            } catch (error) {
                Swal.fire({
                    title: 'Error',
                    text: error.response?.data?.message || 'Failed to submit request.',
                    icon: 'error',
                    confirmButtonColor: '#7c3aed'
                });
            }
        }
    };

    // Permission letter functions
    const fetchPermissions = async () => {
        try {
            const { data } = await api.get('/permissions');
            setPermissions(data);
        } catch (e) {
            console.error('Fetch permissions failed', e);
        }
    };

    const handlePermissionSubmit = async (e) => {
        e.preventDefault();
        if (!permForm.date) {
            return Swal.fire({ title: 'Missing Date', text: 'Please select a date for the permission.', icon: 'warning', confirmButtonColor: '#2563eb' });
        }

        const config = permForm.timeSlot === 'Evening' 
            ? { from_time: '15:45', to_time: '16:45' } 
            : { from_time: '09:00', to_time: '10:00' };

        const timeText = permForm.timeSlot === 'Evening' ? '03:45 PM - 04:45 PM' : '09:00 AM - 10:00 AM';

        setPermSubmitting(true);
        try {
            await api.post('/permissions', { ...permForm, ...config });
            Swal.fire({ title: 'Submitted', text: `Permission request for ${timeText} sent for approval.`, icon: 'success', timer: 1500, showConfirmButton: false });
            setPermForm({ date: '', subject: '', reason: '', timeSlot: 'Morning', replacement_staff_id: '' });
            fetchPermissions();
        } catch (error) {
            Swal.fire({ title: 'Error', text: error.response?.data?.message || 'Failed to submit.', icon: 'error', confirmButtonColor: '#2563eb' });
        } finally {
            setPermSubmitting(false);
        }
    };

    const handlePermissionDelete = async (id) => {
        const { isConfirmed } = await Swal.fire({
            title: 'Cancel Permission?', text: 'This will delete the pending request.', icon: 'warning',
            showCancelButton: true, confirmButtonColor: '#ef4444', confirmButtonText: 'Delete'
        });
        if (isConfirmed) {
            try {
                await api.delete(`/permissions/${id}`);
                fetchPermissions();
            } catch (e) {
                Swal.fire({ title: 'Error', text: 'Could not delete.', icon: 'error' });
            }
        }
    };

    const handlePermissionAction = async (id, status) => {
        const { value: comments } = await Swal.fire({
            title: `${status === 'Approved' ? 'Approve' : 'Reject'} Permission?`,
            input: 'textarea', inputLabel: 'Comments (Optional)',
            showCancelButton: true,
            confirmButtonColor: status === 'Approved' ? '#059669' : '#ef4444',
            confirmButtonText: `Yes, ${status}`
        });
        if (comments !== undefined) {
            try {
                await api.put(`/permissions/${id}/approve`, { status, comments });
                Swal.fire({ title: 'Updated', icon: 'success', timer: 1500, showConfirmButton: false });
                fetchPermissions();
            } catch (error) {
                Swal.fire({ title: 'Error', text: error.response?.data?.message || 'Failed.', icon: 'error' });
            }
        }
    };

    useEffect(() => {
        fetchStaff();
        fetchTimetable();
        fetchLeaves();
        fetchEligibleCompDates();
        fetchPermissions();
    }, []);

    useEffect(() => {
        fetchMyLimits();
    }, [limitYear]);

    // Auto-refresh leave balance when admin updates leave limits
    useEffect(() => {
        if (!socket) return;
        const handler = () => fetchMyLimits();
        socket.on('leave_limits_updated', handler);
        return () => socket.off('leave_limits_updated', handler);
    }, [socket, limitYear]);

    // Compute pending permission approvals count for current user
    const approverTypesForUser = user.role === 'principal' ? ['principal', 'admin', 'replacement'] : [user.role, 'replacement'];
    const pendingPermissionCount = permissions.filter(
        p => p.my_approval_status === 'Pending' && p.emp_id !== user.emp_id && p.my_approver_type && approverTypesForUser.includes(p.my_approver_type)
    ).length;

    // Calculate total days and hours from dates array
    const calculateTotalDays = () => {
        if (formData.dates.length === 0) return { total: 0, isHalfDayOnly: false };
        let total = 0;
        formData.dates.forEach(d => {
            if (d.day_type === 'Full Day') {
                total += 1;
            } else {
                total += 0.5;
            }
        });
        return { total, isHalfDayOnly: (total < formData.dates.length && total > 0) };
    };

    const handleAction = async (id, status) => {
        // Allow approvers (HOD / Principal) to optionally edit per-day time ranges before approving
        const reqObj = pendingApprovals.find(p => p.id === id) || pastApprovals.find(p => p.id === id) || history.find(p => p.id === id);
        const isMedicalLeave = String(reqObj?.leave_type || '').toUpperCase() === 'ML';

        const approvalTitle = status === 'Approved'
            ? (isMedicalLeave
                ? (user.role === 'hod' ? 'Verify ML Docs and Move to Principal?' : user.role === 'principal' ? 'Final Verify ML Docs and Approve?' : 'Approve Medical Leave?')
                : 'Approve Leave?')
            : 'Reject Leave?';

        // Ask whether to edit times first (only Principal may edit times)
        let wantsEdit = false;
        if (user.role === 'principal') {
            const decision = await Swal.fire({
                title: `${status === 'Approved' ? 'Approve' : 'Reject'} Leave?`,
                text: 'You may edit per-day time ranges before approving.',
                showDenyButton: true,
                showCancelButton: true,
                confirmButtonText: `Approve / ${status}`,
                denyButtonText: 'Edit Times',
                cancelButtonText: 'Cancel',
                confirmButtonColor: status === 'Approved' ? '#059669' : '#ef4444'
            });

            if (decision.isDismissed) return; // Cancelled
            if (decision.isDenied) wantsEdit = true;
        }

        let updatedDates = null;
        if (wantsEdit) {
            const raw = JSON.stringify(reqObj?.dates_detail || [], null, 2);
            const { value: edited } = await Swal.fire({
                title: 'Edit Dates Detail (JSON)',
                input: 'textarea',
                inputLabel: 'Modify only from_time / to_time / is_full_day fields as needed',
                inputValue: raw,
                inputPlaceholder: 'Paste valid JSON array of date objects...',
                showCancelButton: true,
                confirmButtonText: 'Save & Continue',
                confirmButtonColor: '#2563eb',
                preConfirm: (val) => {
                    try {
                        const parsed = JSON.parse(val);
                        if (!Array.isArray(parsed)) throw new Error('Expected an array');
                        return parsed;
                    } catch (err) {
                        Swal.showValidationMessage('Invalid JSON: ' + err.message);
                        return false;
                    }
                }
            });

            if (edited === undefined) return; // cancelled
            updatedDates = edited;
        }

        const { value: comments } = await Swal.fire({
            title: approvalTitle,
            input: 'textarea',
            inputLabel: 'Comments (Optional)',
            inputPlaceholder: 'Enter your message to the employee...',
            showCancelButton: true,
            confirmButtonColor: status === 'Approved' ? '#059669' : '#ef4444',
            confirmButtonText: `Yes, ${status}`
        });

        if (comments === undefined) return; // cancelled

        try {
            const payload = { status, comments };
            if (updatedDates) payload.dates_detail = updatedDates;
            await api.put(`/leaves/${id}/approve`, payload);
            Swal.fire({ title: 'Updated', text: 'Process complete.', icon: 'success', timer: 1500, showConfirmButton: false });
            fetchLeaves();
        } catch (err) {
            Swal.fire({ title: 'Error', text: err.response?.data?.message || 'Failed to update.', icon: 'error' });
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
            } catch {
                Swal.fire({
                    title: 'Bulk Action Failed',
                    text: 'Some updates might not have completed.',
                    icon: 'error',
                });
            }
        }
    };

    const toggleSelect = (id) => {
        setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
    };

    const toggleSelectAll = () => {
        if (selectedIds.length === pendingApprovals.length && pendingApprovals.length > 0) {
            setSelectedIds([]);
        } else {
            setSelectedIds(pendingApprovals.map(l => l.id));
        }
    };

    const handleDelete = async (id) => {
        const result = await Swal.fire({
            title: 'Delete Leave Request?',
            text: "This action cannot be undone.",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#ef4444',
            cancelButtonColor: '#1e3a8a',
            confirmButtonText: 'Yes, delete it!'
        });

        if (result.isConfirmed) {
            try {
                await api.delete(`/leaves/${id}`);
                Swal.fire({
                    title: 'Deleted!',
                    text: 'Your leave request has been removed.',
                    icon: 'success',
                    timer: 1500,
                    showConfirmButton: false
                });
                fetchLeaves();
            } catch (error) {
                Swal.fire({
                    title: 'Error',
                    text: error.response?.data?.message || 'Failed to delete.',
                    icon: 'error'
                });
            }
        }
    };

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData({ ...formData, [name]: type === 'checkbox' ? checked : value });
    };

    const handleCurrentDateChange = (field, value) => {
        setCurrentDate({ ...currentDate, [field]: value });
    };

    const handleCurrentReplacementChange = (idx, field, value) => {
        const newReplacements = [...currentDate.replacements];
        newReplacements[idx][field] = value;
        setCurrentDate({ ...currentDate, replacements: newReplacements });
    };

    const addReplacementToCurrentDate = () => {
        setCurrentDate({
            ...currentDate,
            replacements: [...currentDate.replacements, { staff_id: '', periods: '' }]
        });
    };

    const removeReplacementFromCurrentDate = (idx) => {
        if (currentDate.replacements.length === 1) return;
        const newReplacements = currentDate.replacements.filter((_, i) => i !== idx);
        setCurrentDate({ ...currentDate, replacements: newReplacements });
    };

    const addDateToForm = () => {
        if (!currentDate.date) {
            return Swal.fire({ title: 'Missing Date', text: 'Please select a date first.', icon: 'warning', confirmButtonColor: '#2563eb' });
        }
        if (formData.dates.some(d => d.date === currentDate.date)) {
            return Swal.fire({ title: 'Duplicate Date', text: 'This date is already added.', icon: 'warning', confirmButtonColor: '#2563eb' });
        }
        
        const actualReplacements = currentDate.replacements.filter(r => r.staff_id);
        const hasInvalidReplacement = actualReplacements.some(rep => !rep.periods.trim());
        if (hasInvalidReplacement) {
             return Swal.fire({ title: 'Missing Period Info', text: 'Please ensure all selected replacement staff have their assigned periods filled.', icon: 'warning', confirmButtonColor: '#2563eb' });
        }

        const typeToTimes = {
            'Full Day': { from_time: '09:00', to_time: '16:45', is_full_day: true },
            'Half Day AM': { from_time: '09:00', to_time: '13:00', is_full_day: false },
            'Half Day PM': { from_time: '13:30', to_time: '16:45', is_full_day: false }
        };

        const config = typeToTimes[currentDate.day_type];

        setFormData({
            ...formData,
            dates: [...formData.dates, { ...currentDate, ...config }]
        });
        setCurrentDate({
            date: '',
            day_type: 'Full Day',
            replacements: [{ staff_id: '', periods: '' }]
        });
        setStaffSearch('');
    };

    const removeDateFromForm = (idx) => {
        const newDates = formData.dates.filter((_, i) => i !== idx);
        setFormData({ ...formData, dates: newDates });
    };

    const handleReplacementChange = (idx, field, value) => {
        // Legacy function - not used in new date-by-date approach
        const newReplacements = [...formData.replacements];
        newReplacements[idx][field] = value;
        setFormData({ ...formData, replacements: newReplacements });
    };

    const addReplacement = () => {
        // Legacy function - not used in new date-by-date approach
        setFormData({
            ...formData,
            replacements: [...formData.replacements, { staff_id: '', periods: '' }]
        });
    };

    const removeReplacement = (idx) => {
        // Legacy function - not used in new date-by-date approach
        if (formData.replacements.length === 1) return;
        const newReplacements = formData.replacements.filter((_, i) => i !== idx);
        setFormData({ ...formData, replacements: newReplacements });
    };

    const fileToDataUrl = (file) => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });

    const handleOdProofUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const dataUrl = await fileToDataUrl(file);
            setOdProof({
                file_name: file.name,
                file_type: file.type || 'application/octet-stream',
                file_data: dataUrl
            });
        } catch {
            Swal.fire({
                title: 'Upload Error',
                text: 'Failed to read selected file.',
                icon: 'error',
                confirmButtonColor: '#2563eb'
            });
        }
    };

    const handleUploadMedicalDocuments = async (leave) => {
        if (!leave || String(leave.leave_type || '').toUpperCase() !== 'ML') return;

        const { value: file } = await Swal.fire({
            title: 'Upload Medical Documents',
            input: 'file',
            inputAttributes: {
                accept: '.pdf,.png,.jpg,.jpeg,.webp,.doc,.docx',
                'aria-label': 'Upload medical documents'
            },
            showCancelButton: true,
            confirmButtonText: 'Upload & Submit',
            confirmButtonColor: '#2563eb'
        });

        if (!file) return;

        try {
            const fileData = await fileToDataUrl(file);
            await api.post(`/leaves/${leave.id}/medical-documents`, {
                file_name: file.name,
                file_type: file.type || 'application/octet-stream',
                file_data: fileData
            });

            Swal.fire({
                title: 'Submitted',
                text: 'Medical documents sent to HOD for verification.',
                icon: 'success',
                confirmButtonColor: '#2563eb'
            });
            fetchLeaves();
        } catch (error) {
            Swal.fire({
                title: 'Upload Failed',
                text: error.response?.data?.message || 'Failed to upload medical documents.',
                icon: 'error',
                confirmButtonColor: '#2563eb'
            });
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

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (formData.dates.length === 0) {
            return Swal.fire({
                title: 'No Dates Added',
                text: 'Please add at least one date for your leave request.',
                icon: 'warning',
                confirmButtonColor: '#2563eb'
            });
        }

        // Calculate from_date, to_date, days_count from dates array
        const sortedDates = formData.dates.map(d => d.date).sort();
        const from_date = sortedDates[0];
        const to_date = sortedDates[sortedDates.length - 1];
        const { total, isHalfDayOnly } = calculateTotalDays();

        // Flatten replacements from all dates
        const allReplacements = [];
        formData.dates.forEach(dateEntry => {
            dateEntry.replacements.forEach(rep => {
                if (rep.staff_id && rep.periods) {
                    allReplacements.push({
                        staff_id: rep.staff_id,
                        periods: rep.periods,
                        date: dateEntry.date
                    });
                }
            });
        });

        const payload = {
            leave_type: formData.leave_type,
            from_date,
            to_date,
            days_count: total,
            is_half_day: formData.dates.some(d => d.day_type !== 'Full Day'),
            hours: '',
            subject: formData.subject,
            reason: formData.reason,
            replacements: allReplacements,
            dates_detail: formData.dates // Include full date breakdown
        };

        if (String(formData.leave_type || '').toUpperCase() === 'OD' && odProof.file_data) {
            payload.proof_file_name = odProof.file_name;
            payload.proof_file_type = odProof.file_type;
            payload.proof_file_data = odProof.file_data;
        }

        try {
            await api.post('/leaves', payload);
            Swal.fire({
                title: 'Application Sent',
                text: 'Your leave request has been submitted for approval.',
                icon: 'success',
                confirmButtonColor: '#2563eb'
            });
            fetchLeaves();
            setFormData({
                leave_type: 'CL',
                subject: '',
                reason: '',
                dates: []
            });
            setOdProof({ file_name: '', file_type: '', file_data: '' });
        } catch (error) {
            Swal.fire({
                title: 'Error',
                text: error.response?.data?.message || 'Submission failed. Please try again.',
                icon: 'error',
                confirmButtonColor: '#2563eb'
            });
        }
    };

    const inputClass = "mt-2 block w-full bg-gray-50 border border-gray-100 rounded-2xl shadow-sm focus:ring-4 focus:ring-sky-100 focus:border-sky-500 p-4 outline-none transition-all font-bold text-gray-700 text-sm";
    const labelClass = "block text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1";

    return (
        <Layout>
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="max-w-7xl mx-auto"
            >
                <div className="mb-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                        <h1 className="text-3xl font-black text-gray-800 tracking-tight">Leave Management</h1>
                    </div>
                </div>

                {/* Unified Tab Navigation */}
                <div className="flex gap-4 mb-10 overflow-x-auto pb-4 no-scrollbar">
                    {[
                        { id: 'apply', label: 'New Application', icon: <FaCalendarCheck /> },
                        { id: 'permission', label: 'Permission Letter', icon: <FaFileAlt /> },
                        { id: 'compoff', label: 'Comp Off', icon: <FaGift /> },
                        { id: 'balance', label: 'Leave Balance', icon: <FaCalendarAlt /> },
                        { id: 'approvals', label: `Incoming Approvals (${pendingApprovals.length + pendingPermissionCount})`, icon: <FaInbox /> },
                        { id: 'history', label: 'My Leave History', icon: <FaHistory /> }
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-3 px-6 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all shrink-0 ${activeTab === tab.id
                                ? 'bg-sky-600 text-white shadow-xl shadow-sky-100'
                                : 'bg-white text-gray-400 hover:bg-gray-50 border border-gray-100'
                                }`}
                        >
                            {tab.icon}
                            {tab.label}
                        </button>
                    ))}
                </div>

                <AnimatePresence mode="wait">
                    {activeTab === 'apply' && (
                        <motion.div
                            key="apply-tab"
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 20 }}
                            className="modern-card p-10 relative overflow-hidden"
                        >
                            <div className="absolute top-0 left-0 w-full h-2 bg-sky-600"></div>
                            <div className="flex items-center gap-4 mb-10">
                                <div className="h-12 w-12 rounded-2xl bg-sky-50 flex items-center justify-center text-sky-600 shadow-sm border border-sky-100/50">
                                    <FaCalendarCheck size={24} />
                                </div>
                                <div>
                                    <h2 className="text-xl font-black text-gray-800 tracking-tight">Apply for Leave</h2>
                                    <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mt-1">Submit your leave request details below</p>
                                </div>
                            </div>

                            <form onSubmit={handleSubmit} className="space-y-8">
                                {/* Date Selection Section */}
                                <div className="space-y-6">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                        <div>
                                            <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-3 ml-1">Select Date *</label>
                                            <input
                                                type="date"
                                                value={currentDate.date}
                                                onChange={(e) => handleCurrentDateChange('date', e.target.value)}
                                                className="w-full px-6 py-5 bg-gray-50 border-2 border-gray-100 rounded-3xl font-bold text-sm text-gray-800 focus:ring-8 focus:ring-sky-50 focus:border-sky-500 transition-all outline-none shadow-sm"
                                            />
                                            <div className="mt-3 flex flex-wrap gap-2">
                                                {quickDateOptions.map((opt) => (
                                                    <button
                                                        key={`leave-${opt.label}`}
                                                        type="button"
                                                        onClick={() => handleCurrentDateChange('date', opt.value)}
                                                        className={`px-3 py-2 rounded-xl border text-[9px] font-black uppercase tracking-widest transition-all ${currentDate.date === opt.value
                                                            ? 'bg-sky-600 text-white border-sky-600'
                                                            : 'bg-white text-gray-500 border-gray-100 hover:bg-sky-50 hover:text-sky-700 hover:border-sky-200'
                                                        }`}
                                                    >
                                                        {opt.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-3 ml-1">Day Configuration *</label>
                                            <div className="flex gap-3 p-2 bg-gray-50 border-2 border-gray-100 rounded-[28px]">
                                                {['Full Day', 'Half Day AM', 'Half Day PM'].map(type => (
                                                    <button
                                                        key={type}
                                                        type="button"
                                                        onClick={() => handleCurrentDateChange('day_type', type)}
                                                        className={`flex-1 py-4 px-2 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${
                                                            currentDate.day_type === type 
                                                            ? 'bg-sky-600 text-white shadow-lg shadow-sky-100' 
                                                            : 'text-gray-400 hover:text-gray-600 hover:bg-white/50'
                                                        }`}
                                                    >
                                                        {type}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Inline Alternative Staff Manager */}
                                    <div>
                                        <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-3 ml-1">Alternative Staff Arrangement</label>
                                        <div className="space-y-4">
                                            {currentDate.replacements.map((rep, idx) => {
                                                const member = staffList.find(s => s.emp_id === rep.staff_id);
                                                const myPeriods = getMyTimetablePeriods(currentDate.date);
                                                return (
                                                    <div key={idx} className="bg-white p-5 rounded-3xl border-2 border-gray-100 flex flex-col md:flex-row gap-4 md:items-center shadow-sm hover:border-sky-200 transition-all">
                                                        {/* Staff selection button or display */}
                                                        <div className="flex-1">
                                                            {!rep.staff_id ? (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setShowStaffPicker({ type: 'leave', index: idx, date: currentDate.date })}
                                                                    disabled={!currentDate.date || !rep.periods}
                                                                    className="w-full py-4 border-2 border-dashed border-gray-200 rounded-2xl text-gray-400 font-black text-[10px] uppercase tracking-[0.2em] hover:text-sky-600 hover:border-sky-300 hover:bg-sky-50/50 transition-all flex items-center justify-center gap-3"
                                                                >
                                                                    <FaPlusCircle size={16} /> Pick Alternative Staff
                                                                </button>
                                                            ) : (
                                                                <div className="flex items-center gap-4">
                                                                    <img
                                                                        src={member?.profile_pic || `https://ui-avatars.com/api/?name=${encodeURIComponent(member?.name || '?')}&background=0ea5e9&color=fff&bold=true`}
                                                                        alt=""
                                                                        className="h-12 w-12 rounded-2xl object-cover shadow-md"
                                                                    />
                                                                    <div className="flex-1 min-w-0">
                                                                        <p className="font-black text-gray-800 tracking-tight text-sm truncate">{member?.name}</p>
                                                                        <p className="text-[10px] font-black text-sky-500 uppercase tracking-widest mt-0.5 truncate drop-shadow-sm">
                                                                            {member?.department_name}
                                                                        </p>
                                                                    </div>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => setShowStaffPicker({ type: 'leave', index: idx, date: currentDate.date })}
                                                                        disabled={!currentDate.date || !rep.periods}
                                                                        className="h-10 w-10 flex-shrink-0 rounded-xl bg-gray-50 text-gray-400 hover:bg-sky-600 hover:text-white transition-all flex items-center justify-center active:scale-90"
                                                                    >
                                                                        <FaExchangeAlt size={14} />
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => removeReplacementFromCurrentDate(idx)}
                                                                        className="h-10 w-10 flex-shrink-0 rounded-xl bg-gray-50 text-rose-400 hover:bg-rose-500 hover:text-white transition-all flex items-center justify-center active:scale-90"
                                                                    >
                                                                        <FaTimes size={14} />
                                                                    </button>
                                                                </div>
                                                            )}
                                                        </div>
                                                        <div className="md:w-72">
                                                            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-2">Select Period</p>
                                                            <div className="flex flex-wrap gap-2">
                                                                {myPeriods.length > 0 ? myPeriods.map((p) => (
                                                                    <button
                                                                        key={`${idx}-${p.period_number}`}
                                                                        type="button"
                                                                        onClick={() => handleCurrentReplacementChange(idx, 'periods', String(p.period_number))}
                                                                        className={`px-3 py-2 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all ${String(rep.periods) === String(p.period_number)
                                                                            ? 'bg-sky-600 text-white border-sky-600'
                                                                            : 'bg-gray-50 text-gray-500 border-gray-100 hover:bg-sky-50 hover:text-sky-700 hover:border-sky-200'
                                                                        }`}
                                                                    >
                                                                        P{p.period_number}
                                                                    </button>
                                                                )) : (
                                                                    <span className="text-[10px] font-bold text-gray-400">No timetable periods found for selected date.</span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                            
                                            {currentDate.replacements.length < 5 && currentDate.replacements[currentDate.replacements.length - 1].staff_id && (
                                                <button
                                                    type="button"
                                                    onClick={addReplacementToCurrentDate}
                                                    className="w-full py-4 border-2 border-dashed border-gray-200 rounded-2xl text-gray-400 font-black text-[10px] uppercase tracking-[0.2em] hover:text-sky-600 hover:border-sky-200 hover:bg-sky-50/30 transition-all flex items-center justify-center gap-3"
                                                >
                                                    <FaPlusCircle /> Add Another Replacement
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    <button
                                        type="button"
                                        onClick={addDateToForm}
                                        className="w-full bg-sky-600 text-white font-black py-5 rounded-3xl hover:bg-sky-700 transition-all flex items-center justify-center gap-3 uppercase tracking-[0.2em] text-[10px] active:scale-[0.98] shadow-2xl shadow-sky-100 group"
                                    >
                                        <FaPlusCircle className="group-hover:rotate-90 transition-transform" />
                                        Confirm & Add This Date
                                    </button>
                                </div>

                                    {/* Display Added Dates */}
                                    {formData.dates.length > 0 && (
                                        <div className="bg-white/90 backdrop-blur p-6 rounded-2xl border border-white shadow-sm">
                                            <div className="flex items-center justify-between mb-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="h-8 w-8 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600 shadow-sm border border-emerald-100">
                                                        <FaCheckCircle size={14} />
                                                    </div>
                                                    <h4 className="text-xs font-black text-gray-800 tracking-tight uppercase">Added Dates ({formData.dates.length})</h4>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Total: {(() => {
                                                        const { total, hours } = calculateTotalDays();
                                                        if (total > 0 && hours > 0) {
                                                            return `${total} days (${hours.toFixed(1)} hours)`;
                                                        } else if (total > 0) {
                                                            return `${total} days`;
                                                        } else if (hours > 0) {
                                                            return `${hours.toFixed(1)} hours`;
                                                        } else {
                                                            return '0';
                                                        }
                                                    })()}</p>
                                                </div>
                                            </div>
                                            <div className="space-y-3">
                                                {formData.dates.map((dateEntry, idx) => (
                                                    <motion.div
                                                        key={idx}
                                                        initial={{ opacity: 0, y: 10 }}
                                                        animate={{ opacity: 1, y: 0 }}
                                                        className="bg-gradient-to-r from-gray-50 to-white p-4 rounded-xl border border-gray-100 hover:border-sky-200 transition-all"
                                                    >
                                                        <div className="flex items-start justify-between mb-3">
                                                            <div className="flex items-center gap-3">
                                                                <div className="h-10 w-10 rounded-xl bg-sky-100 flex items-center justify-center text-sky-600 font-black text-xs border border-sky-200 shrink-0">
                                                                    {new Date(dateEntry.date).getDate()}
                                                                </div>
                                                                <div>
                                                                    <div className="flex items-center gap-2 mt-1">
                                                                        <span className={`px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-widest ${dateEntry.day_type === 'Full Day' ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'}`}>
                                                                            {dateEntry.day_type}
                                                                        </span>
                                                                        {dateEntry.day_type !== 'Full Day' && (
                                                                            <span className="text-[9px] font-bold text-gray-400 flex items-center gap-1">
                                                                                <FaClock size={8} /> {(() => {
                                                                                    if (dateEntry.day_type === 'Half Day AM') return '09:00 AM - 01:00 PM';
                                                                                    if (dateEntry.day_type === 'Half Day PM') return '01:30 PM - 04:45 PM';
                                                                                    return '';
                                                                                })()}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            <button
                                                                type="button"
                                                                onClick={() => removeDateFromForm(idx)}
                                                                className="h-8 w-8 rounded-lg bg-rose-50 text-rose-400 hover:bg-rose-500 hover:text-white transition-all flex items-center justify-center shrink-0 active:scale-90"
                                                                title="Remove Date"
                                                            >
                                                                <FaTimes size={10} />
                                                            </button>
                                                        </div>
                                                        {dateEntry.replacements.filter(r => r.staff_id).length > 0 && (
                                                            <div className="pl-13">
                                                                <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-2">Replacement Staff:</p>
                                                                <div className="flex flex-wrap gap-2">
                                                                    {dateEntry.replacements.filter(r => r.staff_id).map((rep, repIdx) => {
                                                                        const member = staffList.find(s => s.emp_id === rep.staff_id);
                                                                        return (
                                                                            <div key={repIdx} className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-gray-100 shadow-sm">
                                                                                <div className="h-6 w-6 rounded-md overflow-hidden border border-gray-100">
                                                                                    <img
                                                                                        src={member?.profile_pic || `https://ui-avatars.com/api/?name=${encodeURIComponent(member?.name || 'User')}&background=3b82f6&color=fff&bold=true`}
                                                                                        alt=""
                                                                                        className="w-full h-full object-cover"
                                                                                    />
                                                                                </div>
                                                                                <div className="flex flex-col">
                                                                                    <p className="text-[9px] font-black text-gray-700 tracking-tight">{member?.name || 'Unknown'}</p>
                                                                                    <p className="text-[7px] font-bold text-sky-500 uppercase tracking-widest">Periods: {rep.periods}</p>
                                                                                </div>
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </motion.div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                {/* Leave Type Selector - Always Visible */}
                                <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                >
                                    <label className={labelClass}>Leave Type *</label>
                                    <select name="leave_type" value={formData.leave_type} onChange={handleChange} className={inputClass} required>
                                        <option value="" disabled>Select leave type</option>
                                        {leaveTypes.map(ct => (
                                            <option key={ct.key} value={ct.label}>{ct.full} ({ct.label})</option>
                                        ))}
                                    </select>
                                </motion.div>

                                {String(formData.leave_type || '').toUpperCase() === 'OD' && (
                                    <motion.div
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                    >
                                        <label className={labelClass}>Upload Proof (Optional)</label>
                                        <input
                                            type="file"
                                            accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx"
                                            onChange={handleOdProofUpload}
                                            className={inputClass}
                                        />
                                        {odProof.file_name && (
                                            <p className="text-[10px] font-black text-sky-600 uppercase tracking-widest mt-2">
                                                Proof attached: {odProof.file_name}
                                            </p>
                                        )}
                                    </motion.div>
                                )}

                                <div>
                                    <label className={labelClass}>Subject</label>
                                    <input name="subject" value={formData.subject} onChange={handleChange} placeholder="Brief subject of leave request" className={inputClass} required />
                                </div>

                                <div>
                                    <label className={labelClass}>Reason</label>
                                    <textarea name="reason" value={formData.reason} onChange={handleChange} required rows="4" className={inputClass} placeholder="Provide a reason for your leave..."></textarea>
                                </div>

                                {/* Leave Balance Indicator */}
                                {myLimits && (() => {
                                    const matchedType = leaveTypes.find(t => t.label === formData.leave_type);
                                    const k = matchedType?.key;
                                    if (!k) return null;
                                    const prefix = k === 'comp_leave' ? 'comp' : k;
                                    const noLimitKinds = ['od', 'ml'];
                                    const isNoLimit = noLimitKinds.includes(k);
                                    const isComp = k === 'comp' || k === 'comp_leave';
                                    const limit = isComp ? (myLimits.comp_earned ?? 0) : (isNoLimit ? null : (myLimits[`${prefix}_limit`] ?? 0));
                                    const taken = myLimits[`${prefix}_taken`] ?? 0;
                                    const remaining = limit != null ? Math.max(0, limit - taken) : null;
                                    const isExceeded = limit != null && taken >= limit;
                                    const isWarning = limit != null && remaining <= 2 && !isExceeded;
                                    return (
                                        <div className={`p-5 rounded-3xl border flex items-center justify-between ${isExceeded ? 'bg-rose-50 border-rose-200'
                                                : isWarning ? 'bg-amber-50 border-amber-200'
                                                    : 'bg-emerald-50 border-emerald-100'
                                            }`}>
                                            <div className="flex items-center gap-3">
                                                {isExceeded
                                                    ? <FaTimesCircle className="text-rose-500" size={18} />
                                                    : isWarning
                                                        ? <FaHourglassHalf className="text-amber-500" size={18} />
                                                        : <FaCheckCircle className="text-emerald-500" size={18} />}
                                                <div>
                                                    <p className={`text-xs font-black uppercase tracking-widest ${isExceeded ? 'text-rose-700'
                                                            : isWarning ? 'text-amber-700'
                                                                : 'text-emerald-700'
                                                        }`}>
                                                        {isExceeded
                                                            ? 'Leave Limit Reached'
                                                            : isWarning
                                                                ? 'Low Balance Warning'
                                                                : 'Leave Balance Available'}
                                                    </p>
                                                    <p className="text-[10px] text-gray-500 font-bold mt-0.5">
                                                        {getLeaveTypeName(formData.leave_type)}
                                                        {' · '}{taken} taken
                                                        {limit != null ? ` of ${limit} days · ` : ' (No Limit)'}
                                                        {remaining != null && <span className="font-black">{remaining} days remaining</span>}
                                                    </p>
                                                </div>
                                            </div>
                                            {isExceeded && (
                                                <span className="text-[9px] font-black text-rose-600 uppercase tracking-widest bg-rose-100 px-3 py-1.5 rounded-xl">Cannot Apply</span>
                                            )}
                                        </div>
                                    );
                                })()}

                                <button
                                    type="submit"
                                    disabled={myLimits && (() => {
                                        const matchedType = leaveTypes.find(t => t.label === formData.leave_type);
                                        const k = matchedType?.key;
                                        if (!k) return false;
                                        const prefix = k === 'comp_leave' ? 'comp' : k;
                                        const noLimitKinds = ['od', 'ml'];
                                        if (noLimitKinds.includes(k)) return false; // no limit, always allow
                                        const isComp = k === 'comp' || k === 'comp_leave';
                                        const limit = isComp ? (myLimits.comp_earned ?? 0) : (myLimits[`${prefix}_limit`] ?? 0);
                                        const taken = myLimits[`${prefix}_taken`] ?? 0;
                                        return taken >= limit;
                                    })()}
                                    className="w-full bg-sky-600 text-white font-black py-5 rounded-2xl shadow-xl shadow-sky-100 hover:bg-sky-700 transition-all flex items-center justify-center gap-3 uppercase tracking-[0.2em] text-xs active:scale-95 group disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100"
                                >
                                    <FaPaperPlane className="group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
                                    Apply for Leave
                                </button>
                            </form>
                        </motion.div>
                    )}

                    {activeTab === 'permission' && (
                        <motion.div
                            key="permission-tab"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                        >
                            {/* Incoming Permission Approvals */}
                            {(() => {
                                // Only show requests where this user is the approver and approval is pending
                                // Principals can see principal/admin assignments; all users can also get replacement approvals.
                                const approverTypesForUser = user.role === 'principal' ? ['principal', 'admin', 'replacement'] : [user.role, 'replacement'];
                                const pendingPerms = permissions.filter(
                                    p => p.my_approval_status === 'Pending' && p.emp_id !== user.emp_id && p.my_approver_type && approverTypesForUser.includes(p.my_approver_type)
                                );
                                return pendingPerms.length > 0 ? (
                                    <div className="modern-card !p-0 overflow-hidden mb-8">
                                        <div className="bg-teal-50/30 p-6 border-b border-teal-50 flex items-center gap-3">
                                            <div className="h-10 w-10 rounded-xl bg-teal-100 flex items-center justify-center text-teal-600 shadow-sm border border-teal-100">
                                                <FaInbox size={18} />
                                            </div>
                                            <div>
                                                <h3 className="text-base font-black text-gray-800 tracking-tight uppercase">Incoming Permission Approvals</h3>
                                                <p className="text-[9px] font-black text-teal-500 uppercase tracking-widest mt-0.5">Action required</p>
                                            </div>
                                            <span className="ml-auto bg-teal-600 text-white px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest shadow-lg shadow-teal-100">
                                                {pendingPerms.length}
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
                                                    {pendingPerms.map(perm => (
                                                        <tr key={perm.id} className="hover:bg-teal-50/20 transition-all group">
                                                            <td className="p-5">
                                                                <div className="flex items-center gap-3">
                                                                    <img
                                                                        src={perm.applicant_pic || `https://ui-avatars.com/api/?name=${encodeURIComponent(perm.applicant_name || '?')}&size=80&background=14b8a6&color=fff&bold=true`}
                                                                        alt=""
                                                                        className="h-10 w-10 rounded-xl object-cover shadow-lg"
                                                                    />
                                                                    <div>
                                                                        <p className="text-sm font-black text-gray-800 tracking-tight">{perm.applicant_name}</p>
                                                                        <p className="text-[9px] font-black text-teal-500 uppercase tracking-widest mt-0.5">{perm.department_name}</p>
                                                                    </div>
                                                                </div>
                                                            </td>
                                                            <td className="p-5">
                                                                <p className="text-sm font-black text-gray-700">{new Date(perm.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                                                                <p className="text-[10px] font-bold text-gray-400 mt-0.5">{(() => {
                                                                    // Map back to display string if saved as day_type
                                                                    if (perm.from_time === '09:00:00') return 'Half Day AM (09:00 AM - 01:00 PM)';
                                                                    if (perm.from_time === '13:30:00' || perm.from_time === '13:00:00') return 'Half Day PM (01:30 PM - 04:45 PM)';
                                                                    return `${new Date('2000-01-01T' + perm.from_time).toLocaleTimeString('en-US', {hour:'2-digit', minute:'2-digit', hour12: true})} - ${new Date('2000-01-01T' + perm.to_time).toLocaleTimeString('en-US', {hour:'2-digit', minute:'2-digit', hour12: true})}`;
                                                                })()}</p>
                                                            </td>
                                                            <td className="p-5 max-w-xs">
                                                                <p className="text-sm font-black text-gray-800 truncate">{perm.subject || 'Permission Request'}</p>
                                                                <p className="text-[10px] text-gray-400 font-medium line-clamp-1 mt-1">{perm.reason}</p>
                                                            </td>
                                                            <td className="p-5">
                                                                <div className="flex justify-center gap-3">
                                                                    <button type="button" onClick={() => handlePermissionAction(perm.id, 'Approved')} className="h-10 w-10 bg-emerald-50 text-emerald-600 rounded-xl hover:bg-emerald-600 hover:text-white transition-all flex items-center justify-center active:scale-90 shadow-sm" title="Approve">
                                                                        <FaCheck />
                                                                    </button>
                                                                    <button type="button" onClick={() => handlePermissionAction(perm.id, 'Rejected')} className="h-10 w-10 bg-rose-50 text-rose-600 rounded-xl hover:bg-rose-600 hover:text-white transition-all flex items-center justify-center active:scale-90 shadow-sm" title="Reject">
                                                                        <FaTimes />
                                                                    </button>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                ) : null;
                            })()}
                            {/* Permission Application Form */}
                            <div className="modern-card p-10 relative overflow-hidden mb-8">
                                <div className="absolute top-0 left-0 w-full h-2 bg-teal-600"></div>
                                <div className="flex items-center gap-4 mb-8">
                                    <div className="h-12 w-12 rounded-2xl bg-teal-50 flex items-center justify-center text-teal-600 shadow-sm border border-teal-100/50">
                                        <FaFileAlt size={24} />
                                    </div>
                                    <div>
                                        <h2 className="text-xl font-black text-gray-800 tracking-tight">Permission Letter</h2>
                                        <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mt-1">Request permission for late arrival or early departure</p>
                                    </div>
                                </div>

                                <form onSubmit={handlePermissionSubmit} className="space-y-6">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                                        <div>
                                            <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Date *</label>
                                            <input
                                                type="date"
                                                value={permForm.date}
                                                onChange={e => setPermForm(p => ({ ...p, date: e.target.value }))}
                                                className="w-full px-5 py-4 bg-gray-50 border-2 border-gray-100 rounded-2xl font-bold text-sm text-gray-800 focus:ring-4 focus:ring-teal-100 focus:border-teal-300 transition-all outline-none"
                                                required
                                            />
                                            <div className="mt-3 flex flex-wrap gap-2">
                                                {quickDateOptions.map((opt) => (
                                                    <button
                                                        key={`perm-${opt.label}`}
                                                        type="button"
                                                        onClick={() => setPermForm(p => ({ ...p, date: opt.value }))}
                                                        className={`px-3 py-2 rounded-xl border text-[9px] font-black uppercase tracking-widest transition-all ${permForm.date === opt.value
                                                            ? 'bg-teal-600 text-white border-teal-600'
                                                            : 'bg-white text-gray-500 border-gray-100 hover:bg-teal-50 hover:text-teal-700 hover:border-teal-200'
                                                        }`}
                                                    >
                                                        {opt.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Time Slot *</label>
                                            <div className="flex gap-4">
                                                <button
                                                    type="button"
                                                    onClick={() => setPermForm(p => ({ ...p, timeSlot: 'Morning' }))}
                                                    className={`flex-1 py-4 px-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${permForm.timeSlot === 'Morning' ? 'bg-teal-600 text-white shadow-lg shadow-teal-100' : 'bg-gray-50 text-gray-400 hover:bg-gray-100 border-2 border-gray-100'}`}
                                                >
                                                    Morning <br/><span className="text-[11px] normal-case tracking-normal">09:00 - 10:00</span>
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setPermForm(p => ({ ...p, timeSlot: 'Evening' }))}
                                                    className={`flex-1 py-4 px-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${permForm.timeSlot === 'Evening' ? 'bg-teal-600 text-white shadow-lg shadow-teal-100' : 'bg-gray-50 text-gray-400 hover:bg-gray-100 border-2 border-gray-100'}`}
                                                >
                                                    Evening <br/><span className="text-[11px] normal-case tracking-normal">15:45 - 16:45</span>
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Alternative Staff (Optional)</label>
                                        <div 
                                            onClick={() => setShowStaffPicker({ type: 'permission' })}
                                            className="w-full px-5 py-4 bg-gray-50 border-2 border-gray-100 rounded-2xl cursor-pointer hover:border-teal-200 transition-all flex items-center justify-between group"
                                        >
                                            {permForm.replacement_staff_id ? (() => {
                                                const staff = staffList.find(s => s.emp_id === permForm.replacement_staff_id);
                                                return (
                                                    <div className="flex items-center gap-4">
                                                        <div className="h-10 w-10 rounded-xl overflow-hidden border-2 border-teal-50 shadow-sm">
                                                            <img
                                                                src={staff?.profile_pic || `https://ui-avatars.com/api/?name=${encodeURIComponent(staff?.name || 'User')}&background=14b8a6&color=fff&bold=true`}
                                                                alt=""
                                                                className="w-full h-full object-cover"
                                                            />
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-sm font-black text-gray-800 tracking-tight">{staff?.name}</p>
                                                            <p className="text-[9px] font-black text-teal-600 uppercase tracking-widest mt-0.5">
                                                                {staff?.designation || 'Staff'} • <span className="text-gray-400">{staff?.department_name || 'N/A'}</span>
                                                            </p>
                                                        </div>
                                                        <FaExchangeAlt className="text-gray-300 group-hover:text-teal-500 transition-colors ml-4" size={12} />
                                                    </div>
                                                );
                                            })() : (
                                                <div className="flex items-center gap-3 text-gray-400">
                                                    <FaUserTag size={16} />
                                                    <span className="font-bold text-sm">-- No Alternative Staff --</span>
                                                </div>
                                            )}
                                            {!permForm.replacement_staff_id && <FaChevronRight className="text-gray-300 group-hover:translate-x-1 transition-transform" size={12} />}
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Subject</label>
                                        <input
                                            type="text"
                                            value={permForm.subject}
                                            onChange={e => setPermForm(p => ({ ...p, subject: e.target.value }))}
                                            placeholder="e.g. Permission for late arrival"
                                            className="w-full px-5 py-4 bg-gray-50 border-2 border-gray-100 rounded-2xl font-bold text-sm text-gray-800 focus:ring-4 focus:ring-teal-100 focus:border-teal-300 transition-all outline-none"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Reason *</label>
                                        <textarea
                                            value={permForm.reason}
                                            onChange={e => setPermForm(p => ({ ...p, reason: e.target.value }))}
                                            rows={3}
                                            placeholder="Provide details for your permission request..."
                                            className="w-full px-5 py-4 bg-gray-50 border-2 border-gray-100 rounded-2xl font-bold text-sm text-gray-800 focus:ring-4 focus:ring-teal-100 focus:border-teal-300 transition-all outline-none resize-none"
                                            required
                                        />
                                    </div>

                                    <button
                                        type="submit"
                                        disabled={permSubmitting}
                                        className="w-full bg-teal-600 text-white font-black py-5 rounded-2xl hover:bg-teal-700 transition-all flex items-center justify-center gap-3 uppercase tracking-widest text-xs active:scale-[0.98] shadow-xl shadow-teal-100 group disabled:opacity-50"
                                    >
                                        <FaPaperPlane className="group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
                                        {permSubmitting ? 'Submitting...' : 'Submit Permission Request'}
                                    </button>
                                </form>
                            </div>



                            {/* My Permission Requests */}
                            {false && (() => {
                                const myPermissions = permissions.filter(p => p.emp_id === user.emp_id);
                                return myPermissions.length > 0 ? (
                                    <div className="modern-card p-10 relative overflow-hidden mb-8">
                                        <div className="flex items-center gap-4 mb-8">
                                            <div className="h-10 w-10 rounded-xl bg-teal-50 flex items-center justify-center text-teal-600 shadow-sm border border-teal-100">
                                                <FaHistory size={18} />
                                            </div>
                                            <h3 className="text-lg font-black text-gray-800 tracking-tight uppercase">My Permission Requests</h3>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                            {myPermissions.map((perm, idx) => (
                                                <motion.div
                                                    key={perm.id}
                                                    initial={{ opacity: 0, scale: 0.95 }}
                                                    animate={{ opacity: 1, scale: 1 }}
                                                    transition={{ delay: idx * 0.05 }}
                                                    className="bg-white p-6 rounded-2xl border border-gray-100 hover:border-teal-200 transition-all"
                                                >
                                                    <div className="flex justify-between items-start mb-4">
                                                        <div>
                                                            <span className="text-[8px] font-black text-teal-500 uppercase tracking-widest bg-teal-50 px-2 py-0.5 rounded">Permission</span>
                                                            <p className="text-sm font-black text-gray-800 tracking-tight mt-2">
                                                                {new Date(perm.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                                                            </p>
                                                        </div>
                                                        <div className={`flex items-center gap-1.5 py-1 px-2.5 rounded-lg border ${perm.status === 'Approved' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                                                            perm.status === 'Rejected' ? 'bg-rose-50 text-rose-600 border-rose-100' :
                                                                'bg-amber-50 text-amber-600 border-amber-100'
                                                            }`}>
                                                            {perm.status === 'Approved' ? <FaCheckCircle size={10} /> :
                                                                perm.status === 'Rejected' ? <FaTimesCircle size={10} /> :
                                                                    <FaHourglassHalf size={10} className="animate-spin-slow" />}
                                                            <span className="text-[9px] font-black uppercase tracking-widest">{perm.status}</span>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-3 mb-3 text-[10px] font-bold text-gray-500">
                                                        <span className="flex items-center gap-1">
                                                            <FaClock size={10} className="text-teal-400" /> 
                                                            {perm.from_time === '09:00:00' ? 'Half Day AM' : perm.from_time === '13:30:00' || perm.from_time === '13:00:00' ? 'Half Day PM' : 'Permission'}
                                                            {' ('}
                                                            {formatTo12Hr(perm.from_time)} - {formatTo12Hr(perm.to_time)}
                                                            {')'}
                                                        </span>
                                                    </div>
                                                    <p className="text-sm font-black text-gray-700 tracking-tight">{perm.subject || 'Permission Request'}</p>
                                                    <p className="text-xs text-gray-400 font-medium line-clamp-2 mt-1 leading-relaxed">{perm.reason}</p>
                                                    {perm.status === 'Pending' && (
                                                        <button
                                                            onClick={() => handlePermissionDelete(perm.id)}
                                                            className="mt-4 w-full bg-rose-50 text-rose-500 font-black py-2 rounded-xl hover:bg-rose-500 hover:text-white transition-all flex items-center justify-center gap-2 uppercase tracking-widest text-[9px]"
                                                        >
                                                            <FaTimes size={10} /> Cancel Request
                                                        </button>
                                                    )}
                                                </motion.div>
                                            ))}
                                        </div>
                                    </div>
                                ) : null;
                            })()}
                        </motion.div>
                    )}

                    {activeTab === 'compoff' && (
                        <motion.div
                            key="compoff-tab"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                        >
                            {/* Eligible Holiday Work Dates */}
                            <div className="modern-card p-10 relative overflow-hidden mb-8">
                                <div className="absolute top-0 left-0 w-full h-2 bg-purple-600"></div>
                                <div className="flex items-center gap-4 mb-8">
                                    <div className="h-12 w-12 rounded-2xl bg-purple-50 flex items-center justify-center text-purple-600 shadow-sm border border-purple-100/50">
                                        <FaGift size={24} />
                                    </div>
                                    <div>
                                        <h2 className="text-xl font-black text-gray-800 tracking-tight">Comp Off Requests</h2>
                                        <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mt-1">Request comp leave for working on holidays/weekends</p>
                                    </div>
                                </div>

                                <div className="p-4 bg-purple-50/50 rounded-2xl border border-purple-100 mb-8 flex items-start gap-3">
                                    <FaInfoCircle className="text-purple-400 shrink-0 mt-0.5" size={14} />
                                    <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest leading-relaxed">
                                        Dates below show your attendance on holidays &amp; weekends. Click "Request" to send comp off approval to your HOD, then principal.
                                    </p>
                                </div>

                                {compLoading ? (
                                    <div className="flex items-center justify-center py-16 gap-3">
                                        <div className="h-2 w-2 bg-purple-600 rounded-full animate-bounce" />
                                        <div className="h-2 w-2 bg-purple-600 rounded-full animate-bounce delay-100" />
                                        <div className="h-2 w-2 bg-purple-600 rounded-full animate-bounce delay-200" />
                                    </div>
                                ) : eligibleCompDates.length > 0 ? (
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                                        {eligibleCompDates.map((d, idx) => {
                                            const dateObj = new Date(d.date);
                                            const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'long' });
                                            const dateDisplay = dateObj.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
                                            const inTime = d.in_time ? new Date(d.in_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }) : '--';
                                            const outTime = d.out_time ? new Date(d.out_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }) : '--';
                                            return (
                                                <motion.div
                                                    key={d.date}
                                                    initial={{ opacity: 0, scale: 0.95 }}
                                                    animate={{ opacity: 1, scale: 1 }}
                                                    transition={{ delay: idx * 0.05 }}
                                                    className="bg-white p-6 rounded-2xl border border-purple-100 hover:border-purple-300 hover:shadow-lg transition-all group"
                                                >
                                                    <div className="flex justify-between items-start mb-4">
                                                        <div>
                                                            <p className="text-sm font-black text-gray-800 tracking-tight">{dateDisplay}</p>
                                                            <p className="text-[9px] font-black text-purple-500 uppercase tracking-widest mt-0.5">{dayName}</p>
                                                        </div>
                                                        <span className="text-[8px] font-black uppercase tracking-widest px-2 py-1 rounded-lg bg-purple-50 text-purple-600">Holiday</span>
                                                    </div>
                                                    <div className="flex items-center gap-4 mb-5 text-[10px] font-bold text-gray-500">
                                                        <span className="flex items-center gap-1"><FaClock size={10} className="text-emerald-400" /> In: {formatTo12Hr(d.in_time)}</span>
                                                        <span className="flex items-center gap-1"><FaClock size={10} className="text-rose-400" /> Out: {formatTo12Hr(d.out_time)}</span>
                                                    </div>
                                                    <button
                                                        onClick={() => handleCompRequest(d.date)}
                                                        className="w-full bg-purple-600 text-white font-black py-3 rounded-xl hover:bg-purple-700 transition-all flex items-center justify-center gap-2 uppercase tracking-widest text-[10px] active:scale-95 shadow-lg shadow-purple-100"
                                                    >
                                                        <FaPaperPlane size={10} />
                                                        Request Comp Off
                                                    </button>
                                                </motion.div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div className="text-center py-16 opacity-30">
                                        <FaGift size={48} className="mx-auto mb-4" />
                                        <p className="text-lg font-black tracking-tight">No Eligible Dates</p>
                                        <p className="text-sm font-bold uppercase tracking-widest text-gray-500 mt-1">Work on a holiday and punch in/out to see eligible dates here.</p>
                                    </div>
                                )}
                            </div>

                            {/* Comp Off Request History */}
                            {(() => {
                                const compHistory = history.filter(l => l.request_type === 'comp_credit');
                                return compHistory.length > 0 ? (
                                    <div className="modern-card p-10 relative overflow-hidden">
                                        <div className="flex items-center gap-4 mb-8">
                                            <div className="h-10 w-10 rounded-xl bg-purple-50 flex items-center justify-center text-purple-600 shadow-sm border border-purple-100">
                                                <FaHistory size={18} />
                                            </div>
                                            <h3 className="text-lg font-black text-gray-800 tracking-tight uppercase">My Comp Off Requests</h3>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                            {compHistory.map((leave, idx) => (
                                                <motion.div
                                                    key={leave.id}
                                                    initial={{ opacity: 0, scale: 0.95 }}
                                                    animate={{ opacity: 1, scale: 1 }}
                                                    transition={{ delay: idx * 0.05 }}
                                                    className="bg-white p-6 rounded-2xl border border-gray-100 hover:border-purple-200 transition-all"
                                                >
                                                    <div className="flex justify-between items-start mb-4">
                                                        <div>
                                                            <span className="text-[8px] font-black text-purple-500 uppercase tracking-widest bg-purple-50 px-2 py-0.5 rounded">Comp Off</span>
                                                            <p className="text-sm font-black text-gray-800 tracking-tight mt-2">
                                                                {new Date(leave.from_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                                                            </p>
                                                        </div>
                                                        <div className={`flex items-center gap-1.5 py-1 px-2.5 rounded-lg border ${leave.status === 'Approved' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                                                            leave.status === 'Rejected' ? 'bg-rose-50 text-rose-600 border-rose-100' :
                                                                'bg-amber-50 text-amber-600 border-amber-100'
                                                            }`}>
                                                            {leave.status === 'Approved' ? <FaCheckCircle size={10} /> :
                                                                leave.status === 'Rejected' ? <FaTimesCircle size={10} /> :
                                                                    <FaHourglassHalf size={10} className="animate-spin-slow" />}
                                                            <span className="text-[9px] font-black uppercase tracking-widest">{leave.status}</span>
                                                        </div>
                                                    </div>
                                                    <p className="text-xs text-gray-400 font-medium line-clamp-2 leading-relaxed">{leave.reason}</p>
                                                    {leave.status === 'Pending' && (
                                                        <button
                                                            onClick={() => handleDelete(leave.id)}
                                                            className="mt-4 w-full bg-rose-50 text-rose-500 font-black py-2 rounded-xl hover:bg-rose-500 hover:text-white transition-all flex items-center justify-center gap-2 uppercase tracking-widest text-[9px]"
                                                        >
                                                            <FaTimes size={10} /> Cancel Request
                                                        </button>
                                                    )}
                                                </motion.div>
                                            ))}
                                        </div>
                                    </div>
                                ) : null;
                            })()}
                        </motion.div>
                    )}

                    {activeTab === 'approvals' && (
                        <motion.div
                            key="approvals-tab"
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="modern-card !p-0 overflow-hidden"
                        >
                            <div className="bg-sky-50/30 p-8 border-b border-sky-50 flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <div className="h-12 w-12 rounded-2xl bg-sky-100 flex items-center justify-center text-sky-600 shadow-sm border border-sky-100">
                                        <FaInbox size={22} className={loading ? 'animate-spin' : ''} />
                                    </div>
                                    <div>
                                        <h2 className="text-xl font-black text-gray-800 tracking-tight uppercase">Pending for Me</h2>
                                        <p className="text-[10px] font-black text-sky-500 uppercase tracking-widest mt-1">Action required on these requests</p>
                                    </div>
                                </div>
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
                            </div>

                            {pendingApprovals.length > 0 ? (
                            <div className="overflow-x-auto">
                                <table className="w-full min-w-[1050px] text-left border-collapse table-auto">
                                    <thead>
                                        <tr className="bg-gray-50/50">
                                            <th className="p-4 md:p-6 w-12 border-b border-sky-50">
                                                <div className="flex justify-center">
                                                    <input
                                                        type="checkbox"
                                                        className="w-4 h-4 rounded border-sky-200 text-sky-600 focus:ring-sky-500 cursor-pointer"
                                                        checked={selectedIds.length === pendingApprovals.length && pendingApprovals.length > 0}
                                                        onChange={toggleSelectAll}
                                                    />
                                                </div>
                                            </th>
                                            <th className="p-4 md:p-6 w-[250px] text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-sky-50 whitespace-nowrap">Employee</th>
                                            <th className="p-4 md:p-6 w-[330px] text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-sky-50 whitespace-nowrap">Details</th>
                                            <th className="p-4 md:p-6 w-[300px] text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-sky-50 whitespace-nowrap">Reason</th>
                                            <th className="p-4 md:p-6 w-[160px] text-[10px] font-black text-gray-500 uppercase tracking-widest border-b border-sky-50 text-center whitespace-nowrap">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-sky-50/50">
                                        {pendingApprovals.map((leave) => (
                                            <tr key={leave.id} className={`transition-all group ${selectedIds.includes(leave.id) ? 'bg-sky-50/40' : 'hover:bg-sky-50/20'}`}>
                                                <td className="p-4 md:p-6 align-top">
                                                    <div className="flex justify-center">
                                                        <input
                                                            type="checkbox"
                                                            className="w-4 h-4 rounded border-sky-200 text-sky-600 focus:ring-sky-500 cursor-pointer"
                                                            checked={selectedIds.includes(leave.id)}
                                                            onChange={() => toggleSelect(leave.id)}
                                                        />
                                                    </div>
                                                </td>
                                                <td className="p-4 md:p-6 align-top">
                                                    <div className="flex items-center gap-4">
                                                        <img
                                                            src={leave.applicant_pic || `https://ui-avatars.com/api/?name=${encodeURIComponent(leave.applicant_name || '?')}&size=80&background=0ea5e9&color=fff&bold=true`}
                                                            alt=""
                                                            className="h-10 w-10 rounded-xl object-cover shadow-lg group-hover:scale-110 transition-transform"
                                                        />
                                                        <div className="min-w-0">
                                                            <p className="text-sm font-black text-gray-800 tracking-tight whitespace-nowrap overflow-hidden text-ellipsis max-w-[170px]">{leave.applicant_name}</p>
                                                            <p className="text-[9px] font-black text-sky-500 uppercase tracking-widest mt-0.5 whitespace-nowrap overflow-hidden text-ellipsis max-w-[170px]">{leave.department_name}</p>
                                                            <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest mt-0.5 whitespace-nowrap overflow-hidden text-ellipsis max-w-[170px]">{leave.applicant_role || 'staff'}</p>
                                                            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mt-0.5 whitespace-nowrap overflow-hidden text-ellipsis max-w-[170px]">{leave.applicant_designation || 'N/A'}</p>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="p-4 md:p-6 align-top">
                                                    <div className="space-y-1">
                                                        {leave.request_type === 'comp_credit' ? (
                                                            <span className="inline-block px-2 py-0.5 bg-purple-100 text-purple-600 rounded-md text-[8px] font-black uppercase tracking-widest mb-1">
                                                                <FaGift className="inline mr-1" size={8} /> Comp Off Request
                                                            </span>
                                                        ) : leave.my_approver_type === 'replacement' ? (
                                                            <span className="inline-block px-2 py-0.5 bg-amber-100 text-amber-700 rounded-md text-[8px] font-black uppercase tracking-widest mb-1">
                                                                <FaUserFriends className="inline mr-1" size={8} /> Replacement Request
                                                            </span>
                                                        ) : (
                                                            <span className="inline-block px-2 py-0.5 bg-sky-100 text-sky-600 rounded-md text-[8px] font-black uppercase tracking-widest mb-1">
                                                                {getLeaveTypeName(leave.leave_type)} &bull; { (Number(leave.days_count) > 0) ? `${leave.days_count} Days` : (leave.hours && Number(leave.hours) > 0) ? `${leave.hours} Hours` : `${leave.days_count} Days` }
                                                                {(() => {
                                                                    try {
                                                                        const details = typeof leave.dates_detail === 'string' ? JSON.parse(leave.dates_detail) : leave.dates_detail;
                                                                        if (details && details.length === 1 && !details[0].is_full_day) {
                                                                            return ` (${formatTo12Hr(details[0].from_time)} - ${formatTo12Hr(details[0].to_time)})`;
                                                                        }
                                                                    } catch (e) { }
                                                                    return '';
                                                                })()}
                                                            </span>
                                                        )}
                                                        <div className="flex items-center gap-2 text-[9px] font-black text-gray-400 uppercase tracking-widest">
                                                            <FaCalendarCheck className="text-sky-200" />
                                                            {new Date(leave.from_date).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Kolkata' })}
                                                            {(() => {
                                                                try {
                                                                    const details = typeof leave.dates_detail === 'string' ? JSON.parse(leave.dates_detail) : leave.dates_detail;
                                                                    if (details && details.length === 1 && !details[0].is_full_day) {
                                                                        return ` | ${formatTo12Hr(details[0].from_time)} - ${formatTo12Hr(details[0].to_time)}`;
                                                                    }
                                                                } catch (e) { }
                                                                return '';
                                                            })()}
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
                                                <td className="p-4 md:p-6 max-w-xs align-top">
                                                    <p className="text-sm font-black text-gray-800 tracking-tight whitespace-nowrap overflow-hidden text-ellipsis">{leave.subject || (leave.request_type === 'comp_credit' ? 'Comp Off Request' : 'Leave Request')}</p>
                                                    {leave.my_approver_type === 'replacement' && (
                                                        <p className="text-[10px] text-amber-600 font-bold mt-1 uppercase tracking-widest border border-amber-200 bg-amber-50 inline-block px-2 py-0.5 rounded-lg">
                                                            {leave.approval_notes || 'Requested as substitution'}
                                                        </p>
                                                    )}
                                                    <p className="text-[10px] text-gray-400 font-medium mt-1 leading-relaxed line-clamp-1">{leave.reason}</p>
                                                </td>
                                                <td className="p-4 md:p-6 align-top">
                                                    <div className="flex justify-center gap-3">
                                                        {String(leave.leave_type || '').toUpperCase() === 'ML' && leave.ml_document_submitted && (
                                                            <button
                                                                onClick={() => handleViewMedicalDocuments(leave)}
                                                                className="h-10 w-10 bg-sky-50 text-sky-600 rounded-xl hover:bg-sky-600 hover:text-white transition-all flex items-center justify-center group/btn active:scale-90 shadow-sm"
                                                                title="View ML documents"
                                                            >
                                                                <FaFileAlt />
                                                            </button>
                                                        )}
                                                        <button
                                                            onClick={() => handleAction(leave.id, 'Approved')}
                                                            className="h-10 w-10 bg-emerald-50 text-emerald-600 rounded-xl hover:bg-emerald-600 hover:text-white transition-all flex items-center justify-center group/btn active:scale-90 shadow-sm"
                                                            title={String(leave.leave_type || '').toUpperCase() === 'ML'
                                                                ? (user.role === 'hod' ? 'Verify ML Docs and Next' : user.role === 'principal' ? 'Final Verify ML Docs' : 'Approve ML')
                                                                : 'Approve'}
                                                        >
                                                            <FaCheck />
                                                        </button>
                                                        <button onClick={() => handleAction(leave.id, 'Rejected')} className="h-10 w-10 bg-rose-50 text-rose-600 rounded-xl hover:bg-rose-600 hover:text-white transition-all flex items-center justify-center group/btn active:scale-90 shadow-sm" title="Reject">
                                                            <FaTimes />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            ) : (
                            <div className="p-20 text-center opacity-30">
                                <FaInbox size={48} className="mx-auto mb-4" />
                                <p className="text-lg font-black tracking-tight">All caught up!</p>
                            </div>
                            )}

                            {/* Past Requests Section */}
                            {pastApprovals.length > 0 && (
                                <div className="mt-1 border-t border-sky-50">
                                    <div className="bg-gray-50/30 p-6 border-b border-gray-100 flex items-center gap-3">
                                        <div className="h-10 w-10 rounded-2xl bg-gray-100 flex items-center justify-center text-gray-500 shadow-sm border border-gray-100">
                                            <FaHistory size={16} />
                                        </div>
                                        <div>
                                            <h2 className="text-base font-black text-gray-700 tracking-tight uppercase">Past Requests</h2>
                                            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mt-0.5">Previously reviewed by you</p>
                                        </div>
                                        <span className="ml-auto bg-gray-200 text-gray-600 px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest">
                                            {pastApprovals.length}
                                        </span>
                                    </div>
                                    <div className="overflow-x-auto">
                                        <table className="w-full min-w-[980px] text-left border-collapse table-auto">
                                            <thead>
                                                <tr className="bg-gray-50/50">
                                                    <th className="p-6 w-[250px] text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100 whitespace-nowrap">Employee</th>
                                                    <th className="p-6 w-[330px] text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100 whitespace-nowrap">Details</th>
                                                    <th className="p-6 w-[250px] text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100 whitespace-nowrap">Reason</th>
                                                    <th className="p-6 w-[150px] text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100 text-center whitespace-nowrap">Your Decision</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-50">
                                                {pastApprovals.map((leave) => (
                                                    <tr key={leave.id} className="hover:bg-gray-50/30 transition-all group">
                                                        <td className="p-4 md:p-6 align-top">
                                                            <div className="flex items-center gap-4">
                                                                <img
                                                                    src={leave.applicant_pic || `https://ui-avatars.com/api/?name=${encodeURIComponent(leave.applicant_name || '?')}&size=80&background=0ea5e9&color=fff&bold=true`}
                                                                    alt=""
                                                                    className="h-10 w-10 rounded-xl object-cover shadow-lg"
                                                                />
                                                                <div className="min-w-0">
                                                                    <p className="text-sm font-black text-gray-800 tracking-tight whitespace-nowrap overflow-hidden text-ellipsis max-w-[170px]">{leave.applicant_name}</p>
                                                                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mt-0.5 whitespace-nowrap overflow-hidden text-ellipsis max-w-[170px]">{leave.department_name}</p>
                                                                    <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest mt-0.5 whitespace-nowrap overflow-hidden text-ellipsis max-w-[170px]">{leave.applicant_role || 'staff'}</p>
                                                                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mt-0.5 whitespace-nowrap overflow-hidden text-ellipsis max-w-[170px]">{leave.applicant_designation || 'N/A'}</p>
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className="p-4 md:p-6 align-top">
                                                            <div className="space-y-1">
                                                                {leave.request_type === 'comp_credit' ? (
                                                                    <span className="inline-block px-2 py-0.5 bg-purple-100 text-purple-600 rounded-md text-[8px] font-black uppercase tracking-widest mb-1">
                                                                        <FaGift className="inline mr-1" size={8} /> Comp Off Request
                                                                    </span>
                                                                ) : leave.my_approver_type === 'replacement' ? (
                                                                    <span className="inline-block px-2 py-0.5 bg-amber-100 text-amber-700 rounded-md text-[8px] font-black uppercase tracking-widest mb-1">
                                                                        <FaUserFriends className="inline mr-1" size={8} /> Replacement Request
                                                                    </span>
                                                                ) : (
                                                                    <span className="inline-block px-2 py-0.5 bg-sky-100 text-sky-600 rounded-md text-[8px] font-black uppercase tracking-widest mb-1">
                                                                        {getLeaveTypeName(leave.leave_type)} &bull; { (Number(leave.days_count) > 0) ? `${leave.days_count} Days` : (leave.hours && Number(leave.hours) > 0) ? `${leave.hours} Hours` : `${leave.days_count} Days` }
                                                                        {(() => {
                                                                            try {
                                                                                const details = typeof leave.dates_detail === 'string' ? JSON.parse(leave.dates_detail) : leave.dates_detail;
                                                                                if (details && details.length === 1 && !details[0].is_full_day) {
                                                                                    return ` (${formatTo12Hr(details[0].from_time)} - ${formatTo12Hr(details[0].to_time)})`;
                                                                                }
                                                                            } catch (e) { }
                                                                            return '';
                                                                        })()}
                                                                    </span>
                                                                )}
                                                                <div className="flex items-center gap-2 text-[9px] font-black text-gray-400 uppercase tracking-widest">
                                                                    <FaCalendarCheck className="text-sky-200" />
                                                                    {new Date(leave.from_date).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Kolkata' })}
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className="p-4 md:p-6 max-w-xs align-top">
                                                            <p className="text-sm font-black text-gray-800 tracking-tight whitespace-nowrap overflow-hidden text-ellipsis">{leave.subject || (leave.request_type === 'comp_credit' ? 'Comp Off Request' : 'Leave Request')}</p>
                                                            {leave.my_approver_type === 'replacement' && (
                                                                <p className="text-[10px] text-amber-600 font-bold mt-1 uppercase tracking-widest border border-amber-200 bg-amber-50 inline-block px-2 py-0.5 rounded-lg">
                                                                    {leave.approval_notes || 'Requested as substitution'}
                                                                </p>
                                                            )}
                                                            <p className="text-[10px] text-gray-400 font-medium mt-1 leading-relaxed line-clamp-1">{leave.reason}</p>
                                                        </td>
                                                        <td className="p-4 md:p-6 text-center align-top">
                                                            <div className="flex flex-col items-center gap-1">
                                                                <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest ${leave.my_approval_status === 'Approved'
                                                                    ? 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                                                                    : 'bg-rose-50 text-rose-600 border border-rose-100'
                                                                    }`}>
                                                                    {leave.my_approval_status === 'Approved' ? <FaCheckCircle size={10} /> : <FaTimesCircle size={10} />}
                                                                    {leave.my_approval_status}
                                                                </span>
                                                                {leave.approval_acted_at && (
                                                                    <span className="text-[8px] font-bold text-gray-400">
                                                                        {new Date(leave.approval_acted_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </motion.div>
                    )}

                    {activeTab === 'history' && (
                        <motion.div
                            key="history-tab"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                        >
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                                {history.length > 0 ? history.map((leave, idx) => (
                                    <motion.div
                                        key={leave.id}
                                        initial={{ opacity: 0, scale: 0.95 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        transition={{ delay: idx * 0.05 }}
                                        className="modern-card group p-8 bg-white hover:border-sky-200 transition-all border border-gray-100"
                                    >
                                        <div className="flex justify-between items-start mb-6">
                                            <div className="flex flex-col gap-1">
                                                <span className="text-[10px] font-black text-sky-500 uppercase tracking-[0.2em]">
                                                    {leave.is_replacement_history ? 'Replacement Approval' : getLeaveTypeName(leave.leave_type)}
                                                </span>
                                                <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest">{new Date(leave.created_at).toLocaleDateString()}</span>
                                            </div>
                                            <div className={`flex items-center gap-1.5 py-1 px-2.5 rounded-lg border ${(leave.is_replacement_history ? leave.my_approval_status : leave.status) === 'Approved' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                                                (leave.is_replacement_history ? leave.my_approval_status : leave.status) === 'Rejected' ? 'bg-rose-50 text-rose-600 border-rose-100' :
                                                    'bg-amber-50 text-amber-600 border-amber-100'
                                                }`}>
                                                {(leave.is_replacement_history ? leave.my_approval_status : leave.status) === 'Approved' ? <FaCheckCircle size={10} /> :
                                                    (leave.is_replacement_history ? leave.my_approval_status : leave.status) === 'Rejected' ? <FaTimesCircle size={10} /> :
                                                        <FaHourglassHalf size={10} className="animate-spin-slow" />}
                                                <span className="text-[9px] font-black uppercase tracking-widest">{leave.is_replacement_history ? leave.my_approval_status : leave.status}</span>
                                            </div>
                                            {!leave.is_replacement_history && leave.status === 'Pending' && (
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleDelete(leave.id);
                                                    }}
                                                    className="h-8 w-8 bg-rose-50 text-rose-500 rounded-lg hover:bg-rose-500 hover:text-white transition-all flex items-center justify-center shrink-0 ml-2"
                                                    title="Delete Request"
                                                >
                                                    <FaTimes size={12} />
                                                </button>
                                            )}
                                        </div>

                                        {String(leave.leave_type || '').toUpperCase() === 'ML' && (
                                            <div className="mb-4 flex flex-wrap gap-2">
                                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border ${leave.ml_document_submitted
                                                    ? 'bg-sky-50 text-sky-600 border-sky-100'
                                                    : 'bg-gray-50 text-gray-500 border-gray-100'
                                                    }`}>
                                                    <FaFileAlt size={10} />
                                                    {leave.ml_document_submitted ? 'Medical Docs Submitted' : 'Medical Docs Pending'}
                                                </span>
                                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border ${leave.ml_hod_verified
                                                    ? 'bg-emerald-50 text-emerald-600 border-emerald-100'
                                                    : 'bg-amber-50 text-amber-600 border-amber-100'
                                                    }`}>
                                                    <FaCheckCircle size={10} />
                                                    {leave.ml_hod_verified ? 'HOD Verified' : 'Waiting HOD Verify'}
                                                </span>
                                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border ${leave.ml_principal_verified
                                                    ? 'bg-emerald-50 text-emerald-600 border-emerald-100'
                                                    : 'bg-amber-50 text-amber-600 border-amber-100'
                                                    }`}>
                                                    <FaCheckCircle size={10} />
                                                    {leave.ml_principal_verified ? 'Principal Verified' : 'Waiting Principal Verify'}
                                                </span>
                                            </div>
                                        )}

                                        <h4 className="text-lg font-black text-gray-800 tracking-tight group-hover:text-sky-600 transition-colors">{leave.subject || (leave.is_replacement_history ? 'Replacement Approval' : 'Leave Request')}</h4>
                                        <p className="text-xs text-gray-400 font-medium mt-2 line-clamp-2 leading-relaxed">
                                            {leave.is_replacement_history ? (leave.approval_notes || leave.reason || 'Replacement duty approved by you.') : leave.reason}
                                        </p>

                                        <div className="mt-8 pt-6 border-t border-gray-50 flex items-center justify-between">
                                            <div className="flex items-center gap-2 text-[9px] font-black text-gray-400 uppercase tracking-widest">
                                                <FaClock size={10} className="text-sky-300" />
                                                {leave.is_replacement_history
                                                    ? (leave.approval_notes || 'Replacement')
                                                    : (Number(leave.days_count) > 0 ? `${leave.days_count} days` : (leave.hours && Number(leave.hours) > 0 ? `${leave.hours} Hours` : `${leave.days_count} days`))}
                                            </div>
                                            <div className="flex items-center gap-2 text-[9px] font-black text-gray-400 uppercase tracking-widest">
                                                <FaCalendarCheck size={10} className="text-sky-200" />
                                                {(() => {
                                                    try {
                                                        const details = typeof leave.dates_detail === 'string' ? JSON.parse(leave.dates_detail) : leave.dates_detail;
                                                        if (details && details.length === 1 && !details[0].is_full_day) {
                                                            return `${new Date(leave.from_date).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Kolkata' })} | ${formatTo12Hr(details[0].from_time)} - ${formatTo12Hr(details[0].to_time)}`;
                                                        }
                                                    } catch (e) { }
                                                    return new Date(leave.from_date).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Kolkata' });
                                                })()}
                                            </div>
                                        </div>

                                        {String(leave.leave_type || '').toUpperCase() === 'ML' && String(leave.status || '').toLowerCase() === 'pending' && (
                                            <button
                                                type="button"
                                                onClick={() => handleUploadMedicalDocuments(leave)}
                                                className="mt-4 w-full bg-sky-50 text-sky-600 font-black py-2.5 rounded-xl hover:bg-sky-600 hover:text-white transition-all flex items-center justify-center gap-2 uppercase tracking-widest text-[9px]"
                                            >
                                                <FaUpload size={10} /> Upload Medical Documents & Submit
                                            </button>
                                        )}
                                    </motion.div>
                                )) : (
                                    <div className="col-span-full py-20 text-center opacity-20">
                                        <FaHistory size={48} className="mx-auto mb-4" />
                                        <p className="font-bold italic text-sm">No leave history found.</p>
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    )}
                    {activeTab === 'balance' && (
                        <motion.div
                            key="balance-tab"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                        >
                            {myLimits?.from_month && myLimits?.to_month && (
                                <div className="mb-10 bg-white p-5 rounded-[32px] border border-sky-50/50 shadow-sm flex items-center gap-3">
                                    <FaCalendarAlt size={14} className="text-sky-500" />
                                    <div>
                                        <p className="text-[12px] font-black text-gray-700 tracking-wide">
                                            {new Date(myLimits.from_month).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                                            {' '}—{' '}
                                            {new Date(myLimits.to_month).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                                        </p>
                                        {myLimits?.updated_at && (
                                            <p className="text-[10px] font-black text-sky-500 uppercase tracking-widest mt-1">
                                                Last Updated: {new Date(myLimits.updated_at).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            )}

                            {balanceLoading ? (
                                <div className="flex items-center justify-center py-20 gap-3">
                                    <div className="h-2 w-2 bg-sky-600 rounded-full animate-bounce" />
                                    <div className="h-2 w-2 bg-sky-600 rounded-full animate-bounce delay-100" />
                                    <div className="h-2 w-2 bg-sky-600 rounded-full animate-bounce delay-200" />
                                </div>
                            ) : myLimits ? (() => {
                                const colorMap = {
                                    blue: { bg: 'bg-sky-50', text: 'text-sky-700', bar: 'bg-sky-500', border: 'border-sky-100' },
                                    rose: { bg: 'bg-rose-50', text: 'text-rose-700', bar: 'bg-rose-500', border: 'border-rose-100' },
                                    amber: { bg: 'bg-amber-50', text: 'text-amber-700', bar: 'bg-amber-500', border: 'border-amber-100' },
                                    purple: { bg: 'bg-purple-50', text: 'text-purple-700', bar: 'bg-purple-500', border: 'border-purple-100' },
                                    gray: { bg: 'bg-gray-50', text: 'text-gray-700', bar: 'bg-gray-400', border: 'border-gray-200' },
                                    emerald: { bg: 'bg-emerald-50', text: 'text-emerald-700', bar: 'bg-emerald-500', border: 'border-emerald-100' },
                                    indigo: { bg: 'bg-indigo-50', text: 'text-indigo-700', bar: 'bg-indigo-500', border: 'border-indigo-100' },
                                };
                                const iconMap = { cl: '🏖️', ml: '🏥', od: '🏢', comp: '⏱️', comp_leave: '⏱️' };
                                const noLimitTypes = ['od', 'ml', 'comp', 'comp_leave'];
                                // Map leave type key to DB column prefix (comp_leave → comp)
                                const colPrefix = (key) => key === 'comp_leave' ? 'comp' : key;
                                return (
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
                                        {leaveTypes.map((t, idx) => {
                                            // ... existing mapping
                                            const prefix = colPrefix(t.key);
                                            const isNoLimit = noLimitTypes.includes(t.key);
                                            const isComp = t.key === 'comp' || t.key === 'comp_leave';
                                            const limit = isComp ? (myLimits.comp_earned ?? 0) : (isNoLimit ? null : (myLimits[`${prefix}_limit`] ?? 0));
                                            const taken = myLimits[`${prefix}_taken`] ?? 0;
                                            const remaining = limit != null ? Math.max(0, limit - taken) : null;
                                            const pct = limit > 0 ? Math.min(100, Math.round((taken / limit) * 100)) : 0;
                                            const c = colorMap[t.color];
                                            const isOver = limit > 0 && taken >= limit;
                                            return (
                                                <motion.div
                                                    key={t.key}
                                                    initial={{ opacity: 0, scale: 0.95 }}
                                                    animate={{ opacity: 1, scale: 1 }}
                                                    transition={{ delay: idx * 0.05 }}
                                                    className={`modern-card p-6 border ${c.border} flex flex-col gap-4 relative overflow-hidden`}
                                                >
                                                    <div className="flex justify-between items-start">
                                                        <div className={`h-12 w-12 rounded-2xl ${c.bg} flex items-center justify-center text-xl shadow-sm border ${c.border}`}>{iconMap[t.key] || '📋'}</div>
                                                        {isNoLimit && !isComp ? (
                                                            <span className="text-[8px] font-black uppercase tracking-widest px-2 py-1 rounded-lg bg-emerald-50 text-emerald-600">No Limit</span>
                                                        ) : isComp ? (
                                                            <span className="text-[8px] font-black uppercase tracking-widest px-2 py-1 rounded-lg bg-indigo-50 text-indigo-600">Auto</span>
                                                        ) : (
                                                            <span className={`text-[8px] font-black uppercase tracking-widest px-2 py-1 rounded-lg ${remaining > 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                                                                {remaining > 0 ? 'Available' : 'Finished'}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div>
                                                        <p className={`text-[10px] font-black uppercase tracking-[0.2em] ${c.text}`}>{t.label}</p>
                                                        {isNoLimit && !isComp ? (
                                                            <div className="flex items-end gap-1.5 mt-1">
                                                                <span className="text-3xl font-black text-gray-800 tracking-tighter">{taken}</span>
                                                                <span className="text-[10px] font-bold text-gray-400 pb-1">used</span>
                                                            </div>
                                                        ) : isComp ? (
                                                            <div className="flex items-end gap-1.5 mt-1">
                                                                <span className={`text-3xl font-black tracking-tighter ${isOver ? 'text-rose-600' : 'text-gray-800'}`}>{taken}</span>
                                                                <span className="text-[10px] font-bold text-gray-400 pb-1">/ {limit} earned</span>
                                                            </div>
                                                        ) : (
                                                            <div className="flex items-end gap-1.5 mt-1">
                                                                <span className="text-3xl font-black text-gray-800 tracking-tighter">{remaining}</span>
                                                                <span className="text-[10px] font-bold text-gray-400 pb-1">/ {limit} d</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                    {(isNoLimit && !isComp) ? null : (
                                                        <div className="mt-2">
                                                            <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                                                <motion.div
                                                                    initial={{ width: 0 }}
                                                                    animate={{ width: `${pct}%` }}
                                                                    className={`h-full ${pct >= 100 ? 'bg-rose-500' : pct >= 75 ? 'bg-amber-500' : c.bar}`}
                                                                />
                                                            </div>
                                                            <div className="flex justify-between mt-2">
                                                                <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest">{taken} used</span>
                                                                <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest">{pct}%</span>
                                                            </div>
                                                        </div>
                                                    )}
                                                </motion.div>
                                            );
                                        })}
                                        {/* Permission Balance Card */}
                                        <motion.div
                                            initial={{ opacity: 0, scale: 0.95 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            transition={{ delay: 0.3 }}
                                            className="modern-card p-6 border border-indigo-100 flex flex-col gap-4 relative overflow-hidden bg-white"
                                        >
                                            <div className="flex justify-between items-start">
                                                <div className="h-12 w-12 rounded-2xl bg-indigo-50 flex items-center justify-center text-xl shadow-sm border border-indigo-100">✉️</div>
                                                <span className="text-[8px] font-black uppercase tracking-widest px-2 py-1 rounded-lg bg-indigo-50 text-indigo-600">Monthly</span>
                                            </div>
                                            <div>
                                                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-700">Permission Letter</p>
                                                <div className="flex items-end gap-1.5 mt-1">
                                                    <span className="text-3xl font-black text-gray-800 tracking-tighter">
                                                        {Math.max(0, (myLimits.permission_limit ?? 2) - (myLimits.permission_taken ?? 0))}
                                                    </span>
                                                    <span className="text-[10px] font-bold text-gray-400 pb-1">/ {myLimits.permission_limit ?? 2} left</span>
                                                </div>
                                            </div>
                                            <div className="mt-2">
                                                <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                                    <div className="h-full bg-indigo-500" style={{ width: `${Math.min(100, ((myLimits.permission_taken ?? 0) / (myLimits.permission_limit ?? 2)) * 100)}%` }} />
                                                </div>
                                                <div className="flex justify-between mt-2">
                                                    <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest">{myLimits.permission_taken ?? 0} used this month</span>
                                                </div>
                                            </div>
                                        </motion.div>
                                    </div>
                                );
                            })() : (
                                <div className="text-center py-20 opacity-30">
                                    <FaCalendarAlt size={48} className="mx-auto mb-4" />
                                    <p className="font-black">No leave data found.</p>
                                </div>
                            )}

                            <div className="mt-10 p-5 bg-sky-50/50 rounded-3xl border border-sky-100 flex items-start gap-3">
                                <FaInfoCircle className="text-sky-400 shrink-0 mt-0.5" size={16} />
                                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest leading-relaxed">
                                    Remaining balance represents your current eligibility. Applications exceeding these limits will be automatically rejected by the system.
                                </p>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Staff Selection Modal */}
                <AnimatePresence>
                    {showStaffPicker && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 z-[1000] bg-gray-900/60 backdrop-blur-sm flex items-center justify-center p-4 md:p-10"
                            onClick={() => setShowStaffPicker(null)}
                        >
                            <motion.div
                                initial={{ scale: 0.9, y: 30 }}
                                animate={{ scale: 1, y: 0 }}
                                exit={{ scale: 0.9, y: 30 }}
                                className="bg-white w-full max-w-2xl h-[85vh] md:h-[75vh] rounded-[40px] shadow-2xl overflow-hidden flex flex-col"
                                onClick={e => e.stopPropagation()}
                            >
                                {/* Modal Header */}
                                <div className="p-8 border-b border-gray-100 bg-gray-50/50">
                                    <div className="flex items-center justify-between mb-6">
                                        <div>
                                            <h3 className="text-xl font-black text-gray-800 tracking-tight uppercase">Select Alternative Staff</h3>
                                            <p className="text-[10px] font-black text-sky-500 uppercase tracking-widest mt-1">Pick a colleague for duty substitution</p>
                                        </div>
                                        <button 
                                            onClick={() => setShowStaffPicker(null)}
                                            className="h-12 w-12 rounded-2xl bg-white shadow-xl shadow-gray-100 border border-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-800 transition-all hover:rotate-90"
                                        >
                                            <FaTimes size={18} />
                                        </button>
                                    </div>
                                    <div className="relative group">
                                        <FaSearch className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-300 group-focus-within:text-sky-500 transition-colors" size={16} />
                                        <input
                                            type="text"
                                            placeholder="Search by name, department, or role..."
                                            className="w-full pl-14 pr-6 py-5 bg-white border-2 border-gray-100 rounded-[24px] outline-none focus:ring-8 focus:ring-sky-50 focus:border-sky-500 transition-all font-bold text-gray-700 text-sm shadow-sm"
                                            value={staffSearch}
                                            onChange={(e) => setStaffSearch(e.target.value)}
                                            autoFocus
                                        />
                                    </div>
                                </div>

                                {/* Staff List */}
                                <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar bg-white">
                                    {showStaffPicker.type === 'permission' && !staffSearch && (
                                        <div
                                            onClick={() => {
                                                setPermForm(p => ({ ...p, replacement_staff_id: '' }));
                                                setShowStaffPicker(null);
                                            }}
                                            className="flex items-center gap-4 p-5 rounded-3xl border-2 border-dashed border-gray-100 hover:border-gray-200 hover:bg-gray-50 cursor-pointer transition-all group"
                                        >
                                            <div className="h-14 w-14 rounded-2xl bg-gray-100 flex items-center justify-center text-gray-400">
                                                <FaUserTag size={24} />
                                            </div>
                                            <div className="flex-1">
                                                <p className="font-black text-gray-500 uppercase tracking-widest text-xs">No Alternative Staff</p>
                                                <p className="text-[10px] font-bold text-gray-300 mt-1">Click to clear current selection</p>
                                            </div>
                                        </div>
                                    )}

                                    {staffList
                                        .filter(s => s.emp_id !== user.emp_id)
                                        .filter(s => showStaffPicker.type !== 'leave' || isStaffFreeForPeriods(s.emp_id, showStaffPicker.date || currentDate.date, currentDate.replacements[showStaffPicker.index]?.periods))
                                        .filter(s =>
                                            s.name.toLowerCase().includes(staffSearch.toLowerCase()) ||
                                            (s.designation || '').toLowerCase().includes(staffSearch.toLowerCase()) ||
                                            (s.department_name || '').toLowerCase().includes(staffSearch.toLowerCase())
                                        )
                                        .map((member) => {
                                            const isSelected = showStaffPicker.type === 'leave' 
                                                ? currentDate.replacements[showStaffPicker.index]?.staff_id === member.emp_id
                                                : permForm.replacement_staff_id === member.emp_id;

                                            return (
                                                <div
                                                    key={member.emp_id}
                                                    onClick={() => {
                                                        if (showStaffPicker.type === 'leave') {
                                                            handleCurrentReplacementChange(showStaffPicker.index, 'staff_id', member.emp_id);
                                                        } else {
                                                            setPermForm(p => ({ ...p, replacement_staff_id: member.emp_id }));
                                                        }
                                                        setShowStaffPicker(null);
                                                        setStaffSearch('');
                                                    }}
                                                    className={`group flex items-center gap-5 p-5 rounded-[32px] border-2 transition-all cursor-pointer ${
                                                        isSelected 
                                                        ? 'bg-sky-50 border-sky-400 shadow-lg shadow-sky-50' 
                                                        : 'bg-white border-gray-50 hover:border-sky-200 hover:bg-sky-50/20'
                                                    }`}
                                                >
                                                    <div className="h-16 w-16 rounded-[24px] overflow-hidden border-2 border-white shadow-md group-hover:scale-110 transition-transform shrink-0">
                                                        <img
                                                            src={member.profile_pic || `https://ui-avatars.com/api/?name=${encodeURIComponent(member.name)}&background=3b82f6&color=fff&bold=true`}
                                                            alt=""
                                                            className="w-full h-full object-cover"
                                                        />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-3">
                                                            <p className={`font-black tracking-tight transition-colors ${isSelected ? 'text-sky-700 text-lg' : 'text-gray-800'}`}>
                                                                {member.name}
                                                            </p>
                                                            {isSelected && <FaCheckCircle className="text-sky-500 shrink-0" size={16} />}
                                                        </div>
                                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mt-1 group-hover:text-sky-500 transition-colors">
                                                            {member.designation || 'Staff'} <span className="mx-1 text-gray-200">•</span> {member.department_name || 'N/A'}
                                                        </p>
                                                    </div>
                                                    <div className={`h-10 w-10 rounded-2xl flex items-center justify-center transition-all ${
                                                        isSelected ? 'bg-sky-500 text-white' : 'bg-gray-50 text-gray-300 group-hover:bg-sky-100 group-hover:text-sky-600'
                                                    }`}>
                                                        <FaChevronRight size={14} />
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    
                                    {staffList.length > 0 && staffList.filter(s => s.emp_id !== user.emp_id).filter(s =>
                                            s.name.toLowerCase().includes(staffSearch.toLowerCase()) ||
                                            (s.designation || '').toLowerCase().includes(staffSearch.toLowerCase()) ||
                                            (s.department_name || '').toLowerCase().includes(staffSearch.toLowerCase())
                                        ).length === 0 && (
                                        <div className="py-20 text-center opacity-30">
                                            <FaSearch size={48} className="mx-auto mb-4" />
                                            <p className="text-lg font-black tracking-tight uppercase">No Staff Found</p>
                                            <p className="text-xs font-bold uppercase tracking-widest mt-1">Try a different name or department</p>
                                        </div>
                                    )}
                                </div>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </motion.div>

        </Layout>
    );
};

export default LeaveApply;
