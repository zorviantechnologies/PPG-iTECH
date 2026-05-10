import { useState, useEffect, useRef } from 'react';
import Layout from '../../components/Layout';
import api from '../../utils/api';
import Swal from 'sweetalert2';
import { useSocket } from '../../context/SocketContext';
import {
    FaEdit, FaSearch, FaCalendarAlt, FaCheckCircle,
    FaUserTie, FaBuilding, FaSave, FaTimes, FaClipboardList, FaPlus, FaTrash
} from 'react-icons/fa';
import { motion, AnimatePresence } from 'framer-motion';



const colorMap = {
    blue: { bg: 'bg-sky-50', text: 'text-sky-600', bar: 'bg-sky-500', border: 'border-sky-100' },
    rose: { bg: 'bg-rose-50', text: 'text-rose-600', bar: 'bg-rose-500', border: 'border-rose-100' },
    amber: { bg: 'bg-amber-50', text: 'text-amber-600', bar: 'bg-amber-500', border: 'border-amber-100' },
    purple: { bg: 'bg-purple-50', text: 'text-purple-600', bar: 'bg-purple-500', border: 'border-purple-100' },
    gray: { bg: 'bg-gray-50', text: 'text-gray-600', bar: 'bg-gray-400', border: 'border-gray-100' },
    emerald: { bg: 'bg-emerald-50', text: 'text-emerald-600', bar: 'bg-emerald-500', border: 'border-emerald-100' },
    indigo: { bg: 'bg-indigo-50', text: 'text-indigo-600', bar: 'bg-indigo-500', border: 'border-indigo-100' },
};

const LeaveLimitation = () => {
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const [staffData, setStaffData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [editingId, setEditingId] = useState(null);  // emp_id being edited
    const [editValues, setEditValues] = useState({});
    const [selectedEmpIds, setSelectedEmpIds] = useState([]);
    const [fromDate, setFromDate] = useState(firstDay);
    const [toDate, setToDate] = useState(lastDay);
    const [leaveTypes, setLeaveTypes] = useState([]);
    const [showAddLeaveType, setShowAddLeaveType] = useState(false);
    const socket = useSocket();
    const hasLoadedOnceRef = useRef(false);
    const autoRefreshInFlightRef = useRef(false);
    const limitsRequestRef = useRef(null);
    const selectedYear = new Date(fromDate).getFullYear();

    const mapEmployeesToDefaultLimits = (employees, year) => {
        return (employees || []).filter((e) => e?.emp_id).map((emp) => ({
            emp_id: emp.emp_id,
            name: emp.name,
            designation: emp.designation,
            role: emp.role,
            profile_pic: emp.profile_pic,
            department_name: emp.department_name,
            year,
            from_month: fromDate,
            to_month: toDate,
            updated_at: null,
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
            comp_earned: 0,
        }));
    };

    useEffect(() => {
        fetchLimits();
    }, [selectedYear]);

    useEffect(() => {
        fetchLeaveTypes();
    }, []);

    useEffect(() => {
        if (!socket) return;
        const handler = () => fetchLimits({ silent: true });
        socket.on('leave_limits_updated', handler);
        return () => socket.off('leave_limits_updated', handler);
    }, [socket, selectedYear]);

    useEffect(() => {
        const triggerFastAutoRefresh = async () => {
            if (autoRefreshInFlightRef.current) return;
            autoRefreshInFlightRef.current = true;
            try {
                await fetchLimits({ silent: true });
            } finally {
                autoRefreshInFlightRef.current = false;
            }
        };

        const onVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                triggerFastAutoRefresh();
            }
        };

        const onFocus = () => {
            triggerFastAutoRefresh();
        };

        document.addEventListener('visibilitychange', onVisibilityChange);
        window.addEventListener('focus', onFocus);

        return () => {
            document.removeEventListener('visibilitychange', onVisibilityChange);
            window.removeEventListener('focus', onFocus);
        };
    }, [selectedYear]);

    const fetchLeaveTypes = async () => {
        try {
            const { data } = await api.get('/leave-types');
            const types = data.filter(t => t.key !== 'lop').map(t => ({
                id: t.id,
                key: t.key,
                label: t.label,
                full: t.full_name,
                color: t.color,
                defaultDays: t.default_days,
                isDefault: t.is_default
            }));

            // Add Permission Letter as a virtual type for tracking limits
            types.push({
                key: 'permission',
                label: 'PL',
                full: 'Permission Letter',
                color: 'indigo',
                defaultDays: 2,
                isDefault: true,
                isVirtual: true
            });

            setLeaveTypes(types);
        } catch (error) {
            console.error('Failed to fetch leave types', error);
        }
    };

    const fetchLimits = async ({ silent = false } = {}) => {
        if (limitsRequestRef.current) {
            return limitsRequestRef.current;
        }

        const run = (async () => {
        if (!silent || !hasLoadedOnceRef.current) {
            setLoading(true);
        }
        try {
            const { data } = await api.get(`/leave-limits?year=${selectedYear}`);

            // Filter data based on month range if additional date fields exist
            // For now, we show all data for the selected year
            // This can be enhanced when month-specific leave records are available
            if (Array.isArray(data) && data.length > 0) {
                setStaffData(data);
            } else {
                const { data: employees } = await api.get('/employees?all=true');
                setStaffData(mapEmployeesToDefaultLimits(employees, selectedYear));
            }
        } catch (error) {
            console.error('Failed to fetch limits', error);
            try {
                const { data: employees } = await api.get('/employees?all=true');
                setStaffData(mapEmployeesToDefaultLimits(employees, selectedYear));
            } catch (fallbackError) {
                console.error('Fallback employee fetch failed', fallbackError);
                setStaffData([]);
            }
        } finally {
            hasLoadedOnceRef.current = true;
            setLoading(false);
        }
        })();

        limitsRequestRef.current = run;
        try {
            await run;
        } finally {
            limitsRequestRef.current = null;
        }
    };

    const noLimitTypes = ['od', 'ml', 'comp', 'comp_leave'];

    // Map leave type key to DB column prefix (comp_leave → comp)
    const colPrefix = (key) => key === 'comp_leave' ? 'comp' : key;

    const startEdit = (emp) => {
        setEditingId(emp.emp_id);
        const values = {
            cl_limit: emp.cl_limit ?? 12,
            ml_limit: emp.ml_limit ?? 12,
            od_limit: emp.od_limit ?? 10,
            comp_limit: emp.comp_limit ?? 6,
            lop_limit: emp.lop_limit ?? 30,
            permission_limit: emp.permission_limit ?? 2,
        };
        setEditValues(values);
    };

    const cancelEdit = () => {
        setEditingId(null);
        setEditValues({});
    };

    const saveEdit = async (emp_id) => {
        try {
            const year = new Date(fromDate).getFullYear();
            await api.put(`/leave-limits/${encodeURIComponent(emp_id)}`, { year, fromDate, toDate, ...editValues });
            Swal.fire({
                title: 'Limits Updated!',
                text: 'Leave limits have been saved successfully.',
                icon: 'success',
                timer: 1500,
                showConfirmButton: false,
            });
            setEditingId(null);
            fetchLimits();
        } catch (error) {
            const backendMsg = error.response?.data?.message;
            const backendErr = error.response?.data?.error;
            Swal.fire({
                title: 'Error',
                text: backendErr ? `${backendMsg || 'Failed to save.'} (${backendErr})` : (backendMsg || 'Failed to save.'),
                icon: 'error'
            });
        }
    };

    const handleAddLeaveType = async () => {
        const { value: formValues } = await Swal.fire({
            title: 'Add Custom Leave Type',
            html: `
                <div style="display:grid; gap:16px; text-align:left; padding:10px;">
                    <div>
                        <label style="font-size:12px; font-weight:900; color:#6b7280; text-transform:uppercase; letter-spacing:0.1em; display:block; margin-bottom:8px;">Leave Type Name</label>
                        <input id="leave_name" type="text" placeholder="e.g., Paternity Leave" 
                            style="width:100%; padding:10px 14px; border:2px solid #e5e7eb; border-radius:12px; font-weight:600; font-size:14px; outline:none;">
                    </div>
                    <div>
                        <label style="font-size:12px; font-weight:900; color:#6b7280; text-transform:uppercase; letter-spacing:0.1em; display:block; margin-bottom:8px;">Short Code</label>
                        <input id="leave_code" type="text" placeholder="e.g., PL" maxlength="10"
                            style="width:100%; padding:10px 14px; border:2px solid #e5e7eb; border-radius:12px; font-weight:600; font-size:14px; outline:none;">
                    </div>
                    <div>
                        <label style="font-size:12px; font-weight:900; color:#6b7280; text-transform:uppercase; letter-spacing:0.1em; display:block; margin-bottom:8px;">Default Days</label>
                        <input id="leave_days" type="number" min="0" max="365" value="10"
                            style="width:100%; padding:10px 14px; border:2px solid #e5e7eb; border-radius:12px; font-weight:600; font-size:14px; outline:none;">
                    </div>
                    <div>
                        <label style="font-size:12px; font-weight:900; color:#6b7280; text-transform:uppercase; letter-spacing:0.1em; display:block; margin-bottom:8px;">Color</label>
                        <select id="leave_color" style="width:100%; padding:10px 14px; border:2px solid #e5e7eb; border-radius:12px; font-weight:600; font-size:14px; outline:none;">
                            <option value="blue">Blue</option>
                            <option value="rose">Rose</option>
                            <option value="amber">Amber</option>
                            <option value="purple">Purple</option>
                            <option value="gray">Gray</option>
                            <option value="emerald">Emerald</option>
                            <option value="indigo">Indigo</option>
                        </select>
                    </div>
                </div>
            `,
            showCancelButton: true,
            confirmButtonColor: '#2563eb',
            confirmButtonText: 'Add Leave Type',
            focusConfirm: false,
            preConfirm: () => {
                const name = document.getElementById('leave_name')?.value;
                const code = document.getElementById('leave_code')?.value;
                const days = document.getElementById('leave_days')?.value;
                const color = document.getElementById('leave_color')?.value;

                if (!name || !code) {
                    Swal.showValidationMessage('Please fill in all required fields');
                    return false;
                }

                return { name, code, days: parseInt(days), color };
            }
        });

        if (formValues) {
            try {
                await api.post('/leave-types', {
                    key: formValues.code.toLowerCase().replace(/\s+/g, '_'),
                    label: formValues.code.toUpperCase(),
                    full_name: formValues.name,
                    color: formValues.color,
                    default_days: formValues.days
                });
                fetchLeaveTypes();
                Swal.fire({ title: 'Success!', text: 'Leave type added successfully.', icon: 'success', confirmButtonColor: '#2563eb' });
            } catch (error) {
                Swal.fire({ title: 'Error', text: error.response?.data?.message || 'Failed to add leave type.', icon: 'error' });
            }
        }
    };

    const handleEditLeaveType = async (leaveType) => {
        const { value: formValues } = await Swal.fire({
            title: 'Edit Leave Type',
            html: `
                <div style="display:grid; gap:16px; text-align:left; padding:10px;">
                    <div>
                        <label style="font-size:12px; font-weight:900; color:#6b7280; text-transform:uppercase; letter-spacing:0.1em; display:block; margin-bottom:8px;">Leave Type Name</label>
                        <input id="leave_name" type="text" value="${leaveType.full}" 
                            style="width:100%; padding:10px 14px; border:2px solid #e5e7eb; border-radius:12px; font-weight:600; font-size:14px; outline:none;">
                    </div>
                    <div>
                        <label style="font-size:12px; font-weight:900; color:#6b7280; text-transform:uppercase; letter-spacing:0.1em; display:block; margin-bottom:8px;">Short Code</label>
                        <input id="leave_code" type="text" value="${leaveType.label}" maxlength="10"
                            style="width:100%; padding:10px 14px; border:2px solid #e5e7eb; border-radius:12px; font-weight:600; font-size:14px; outline:none;">
                    </div>
                    <div>
                        <label style="font-size:12px; font-weight:900; color:#6b7280; text-transform:uppercase; letter-spacing:0.1em; display:block; margin-bottom:8px;">Default Days</label>
                        <input id="leave_days" type="number" min="0" max="365" value="${leaveType.defaultDays}"
                            style="width:100%; padding:10px 14px; border:2px solid #e5e7eb; border-radius:12px; font-weight:600; font-size:14px; outline:none;">
                    </div>
                    <div>
                        <label style="font-size:12px; font-weight:900; color:#6b7280; text-transform:uppercase; letter-spacing:0.1em; display:block; margin-bottom:8px;">Color</label>
                        <select id="leave_color" style="width:100%; padding:10px 14px; border:2px solid #e5e7eb; border-radius:12px; font-weight:600; font-size:14px; outline:none;">
                            <option value="blue" ${leaveType.color === 'blue' ? 'selected' : ''}>Blue</option>
                            <option value="rose" ${leaveType.color === 'rose' ? 'selected' : ''}>Rose</option>
                            <option value="amber" ${leaveType.color === 'amber' ? 'selected' : ''}>Amber</option>
                            <option value="purple" ${leaveType.color === 'purple' ? 'selected' : ''}>Purple</option>
                            <option value="gray" ${leaveType.color === 'gray' ? 'selected' : ''}>Gray</option>
                            <option value="emerald" ${leaveType.color === 'emerald' ? 'selected' : ''}>Emerald</option>
                            <option value="indigo" ${leaveType.color === 'indigo' ? 'selected' : ''}>Indigo</option>
                        </select>
                    </div>
                </div>
            `,
            showCancelButton: true,
            confirmButtonColor: '#2563eb',
            confirmButtonText: 'Update Leave Type',
            focusConfirm: false,
            preConfirm: () => {
                const name = document.getElementById('leave_name')?.value;
                const code = document.getElementById('leave_code')?.value;
                const days = document.getElementById('leave_days')?.value;
                const color = document.getElementById('leave_color')?.value;

                if (!name || !code) {
                    Swal.showValidationMessage('Please fill in all required fields');
                    return false;
                }

                return { name, code, days: parseInt(days), color };
            }
        });

        if (formValues) {
            try {
                await api.put(`/leave-types/${leaveType.id}`, {
                    key: formValues.code.toLowerCase().replace(/\s+/g, '_'),
                    label: formValues.code.toUpperCase(),
                    full_name: formValues.name,
                    color: formValues.color,
                    default_days: formValues.days
                });
                fetchLeaveTypes();
                Swal.fire({ title: 'Success!', text: 'Leave type updated successfully.', icon: 'success', confirmButtonColor: '#2563eb' });
            } catch (error) {
                Swal.fire({ title: 'Error', text: error.response?.data?.message || 'Failed to update leave type.', icon: 'error' });
            }
        }
    };

    const handleDeleteLeaveType = async (leaveType) => {
        if (leaveType.isDefault) {
            Swal.fire({ title: 'Cannot Delete', text: 'Default leave types cannot be deleted.', icon: 'warning', confirmButtonColor: '#2563eb' });
            return;
        }
        const result = await Swal.fire({
            title: 'Delete Leave Type?',
            text: `Are you sure you want to delete "${leaveType.full}"? This action cannot be undone.`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#ef4444',
            cancelButtonColor: '#6b7280',
            confirmButtonText: 'Yes, Delete',
            cancelButtonText: 'Cancel'
        });

        if (result.isConfirmed) {
            try {
                await api.delete(`/leave-types/${leaveType.id}`);
                fetchLeaveTypes();
                Swal.fire({ title: 'Deleted!', text: 'Leave type has been removed.', icon: 'success', confirmButtonColor: '#2563eb' });
            } catch (error) {
                Swal.fire({ title: 'Error', text: error.response?.data?.message || 'Failed to delete leave type.', icon: 'error' });
            }
        }
    };

    const handleBulkSet = async () => {
        const defaultYear = new Date(fromDate || new Date().toISOString().slice(0, 10)).getFullYear();
        const defaultMonth = (fromDate || new Date().toISOString().slice(0, 10)).slice(0, 7);
        const { value: formValues } = await Swal.fire({
            title: 'Set CL Yearly & PL Monthly Auto',
            html: `
                <div style="display:grid; gap:16px; text-align:left; padding:10px 0;">
                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px; padding:12px; background:#f8fafc; border-radius:12px; margin-bottom:8px;">
                        <div>
                            <label style="font-size:11px; font-weight:900; color:#64748b; text-transform:uppercase; letter-spacing:0.1em; display:block; margin-bottom:6px;">CL Year</label>
                            <input id="bulk_year" type="number" min="2000" max="2100" value="${defaultYear}" 
                                style="width:100%; padding:8px 12px; border:2px solid #e5e7eb; border-radius:10px; font-weight:600; font-size:13px; outline:none;">
                        </div>
                        <div>
                            <label style="font-size:11px; font-weight:900; color:#64748b; text-transform:uppercase; letter-spacing:0.1em; display:block; margin-bottom:6px;">PL Start Month</label>
                            <input id="bulk_permission_month" type="month" value="${defaultMonth}" 
                                style="width:100%; padding:8px 12px; border:2px solid #e5e7eb; border-radius:10px; font-weight:600; font-size:13px; outline:none;">
                        </div>
                    </div>
                    <div style="border-top:2px solid #e5e7eb; padding-top:12px;">
                        <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:10px;">
                            <label style="font-size:12px; font-weight:900; color:#6b7280; text-transform:uppercase; letter-spacing:0.1em; flex:1;">
                                Casual Leave (CL) <span style="color:#0369a1; font-size:9px; margin-left:8px; background:#e0f2fe; padding:2px 6px; border-radius:6px; border:1px solid #bae6fd;">Yearly Limit</span>
                            </label>
                            <input id="bulk_cl_limit" type="number" min="0" max="365" value="12"
                                style="width:80px; padding:8px 12px; border:2px solid #e5e7eb; border-radius:12px; font-weight:700; font-size:14px; text-align:center; outline:none;">
                        </div>
                        <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:10px;">
                            <label style="font-size:12px; font-weight:900; color:#6b7280; text-transform:uppercase; letter-spacing:0.1em; flex:1;">
                                Permission Letter (PL) <span style="color:#4f46e5; font-size:9px; margin-left:8px; background:#eef2ff; padding:2px 6px; border-radius:6px; border:1px solid #c7d2fe;">Monthly Limit</span>
                            </label>
                            <input id="bulk_permission_limit" type="number" min="0" max="31" value="2"
                                style="width:80px; padding:8px 12px; border:2px solid #e5e7eb; border-radius:12px; font-weight:700; font-size:14px; text-align:center; outline:none;">
                        </div>
                        <div style="margin-top:8px; padding:8px 12px; background:#f0fdf4; border-radius:10px; font-size:11px; color:#16a34a; font-weight:700;">
                            CL will be saved as yearly value. PL monthly limit starts from selected month and continues every month until you change it again.
                        </div>
                    </div>
                </div>
            `,
            showCancelButton: true,
            confirmButtonColor: '#2563eb',
            confirmButtonText: 'Apply to All',
            focusConfirm: false,
            width: '550px',
            preConfirm: () => {
                const yearRaw = document.getElementById('bulk_year')?.value;
                const clRaw = document.getElementById('bulk_cl_limit')?.value;
                const plRaw = document.getElementById('bulk_permission_limit')?.value;
                const permissionMonth = document.getElementById('bulk_permission_month')?.value;

                const year = Number.parseInt(yearRaw, 10);
                const clLimit = Number.parseInt(clRaw, 10);
                const permissionLimit = Number.parseInt(plRaw, 10);

                if (!Number.isFinite(year) || year < 2000 || year > 2100) {
                    Swal.showValidationMessage('Please provide a valid CL year.');
                    return false;
                }
                if (!Number.isFinite(clLimit) || clLimit < 0 || clLimit > 365) {
                    Swal.showValidationMessage('CL yearly limit should be between 0 and 365.');
                    return false;
                }
                if (!Number.isFinite(permissionLimit) || permissionLimit < 0 || permissionLimit > 31) {
                    Swal.showValidationMessage('PL monthly limit should be between 0 and 31.');
                    return false;
                }
                if (!/^\d{4}-\d{2}$/.test(String(permissionMonth || ''))) {
                    Swal.showValidationMessage('Please select a valid PL month.');
                    return false;
                }

                return {
                    year,
                    cl_limit: clLimit,
                    permission_limit: permissionLimit,
                    permission_month: permissionMonth,
                };
            }
        });

        if (formValues) {
            const selectedTargets = Array.from(new Set(selectedEmpIds.map((id) => String(id || '').trim()).filter(Boolean)));
            if (!selectedTargets.length) {
                Swal.fire({
                    title: 'Select Employees',
                    text: 'Please select at least one employee or use Select All before bulk update.',
                    icon: 'info',
                    confirmButtonColor: '#2563eb'
                });
                return;
            }
            const payload = {
                year: formValues.year,
                emp_ids: selectedTargets,
                cl_limit: formValues.cl_limit,
                permission_limit: formValues.permission_limit,
                permission_month: formValues.permission_month
            };

            Swal.fire({
                title: 'Applying...',
                text: 'Updating registry limits for all personnel...',
                didOpen: () => Swal.showLoading(),
                allowOutsideClick: false,
                allowEscapeKey: false
            });

            try {
                const { data } = await api.post('/leave-limits/bulk', payload);

                const successCount = Number(data?.updatedCount || 0);
                const failCount = Number(data?.failedCount || 0);
                const firstFailure = Array.isArray(data?.failedEmployees) && data.failedEmployees.length > 0
                    ? {
                        empId: data.failedEmployees[0].emp_id,
                        message: data.failedEmployees[0].error || 'Unknown error'
                    }
                    : null;

                if (successCount === 0) {
                    throw new Error(firstFailure ? `First failure (${firstFailure.empId}): ${firstFailure.message}` : 'Bulk update failed for all employees.');
                }

                await fetchLimits();
                Swal.fire({
                    title: failCount > 0 ? 'Bulk Set Partial' : 'Bulk Set Complete!',
                    text: failCount > 0
                        ? `${successCount} updated, ${failCount} failed.${firstFailure ? ` ${firstFailure.empId}: ${firstFailure.message}` : ''}`
                        : `Synchronized limits for ${successCount} personnel. PL will auto-apply month-to-month until changed.`,
                    icon: failCount > 0 ? 'warning' : 'success',
                    confirmButtonColor: '#2563eb'
                });
                if (failCount === 0) {
                    setSelectedEmpIds([]);
                }
            } catch (error) {
                console.error('Bulk update fail:', error);
                const failedEmployees = error?.response?.data?.failedEmployees;
                const firstFailure = Array.isArray(failedEmployees) && failedEmployees.length > 0
                    ? failedEmployees[0]
                    : null;
                const detail = firstFailure
                    ? ` First failure (${firstFailure.emp_id}): ${firstFailure.error || 'Unknown error'}`
                    : '';
                Swal.fire({
                    title: 'Critical Error',
                    text: `${error?.response?.data?.message || error?.response?.data?.error || error.message || 'The bulk operation could not be completed.'}${detail}`,
                    icon: 'error'
                });
            }
        }
    };


    const filtered = staffData.filter(emp =>
        emp.name?.toLowerCase().includes(search.toLowerCase()) ||
        emp.department_name?.toLowerCase().includes(search.toLowerCase()) ||
        emp.designation?.toLowerCase().includes(search.toLowerCase())
    );

    const visibleEmpIds = filtered
        .map((emp) => String(emp?.emp_id || '').trim())
        .filter(Boolean);
    const allVisibleSelected = visibleEmpIds.length > 0 && visibleEmpIds.every((id) => selectedEmpIds.includes(id));

    const toggleSelectAllVisible = () => {
        if (!visibleEmpIds.length) return;
        if (allVisibleSelected) {
            setSelectedEmpIds((prev) => prev.filter((id) => !visibleEmpIds.includes(id)));
            return;
        }
        setSelectedEmpIds((prev) => Array.from(new Set([...prev, ...visibleEmpIds])));
    };

    useEffect(() => {
        const validIds = new Set((staffData || []).map((emp) => String(emp?.emp_id || '').trim()).filter(Boolean));
        setSelectedEmpIds((prev) => prev.filter((id) => validIds.has(id)));
    }, [staffData]);

    const inputClass = "w-16 text-center border-2 border-gray-100 rounded-xl p-2 font-black text-sm focus:border-sky-500 focus:ring-4 focus:ring-sky-50 outline-none transition-all";

    return (
        <Layout>
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                {/* Header */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-6">
                    <div>
                        <h1 className="text-3xl font-black text-gray-800 tracking-tight">Leave Balances</h1>

                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-3 w-full">
                        <div className="flex items-center gap-3">
                            {/* Month Range Selector */}
                            <div className="flex items-center gap-2 bg-white border border-sky-100 rounded-2xl px-4 py-2 shadow-lg shadow-sky-50/50">
                                <span className="text-xs font-black text-gray-500 uppercase tracking-widest">From</span>
                                <input
                                    type="date"
                                    value={fromDate}
                                    onChange={e => setFromDate(e.target.value)}
                                    className="bg-transparent font-black text-sm text-gray-700 outline-none"
                                />
                                <span className="text-gray-300">→</span>
                                <span className="text-xs font-black text-gray-500 uppercase tracking-widest">To</span>
                                <input
                                    type="date"
                                    value={toDate}
                                    onChange={e => setToDate(e.target.value)}
                                    className="bg-transparent font-black text-sm text-gray-700 outline-none"
                                />
                            </div>
                        </div>

                        {/* Bulk Set Buttons */}
                        <div className="flex items-center gap-2">
                            <button
                                onClick={toggleSelectAllVisible}
                                className="bg-white text-sky-600 border border-sky-200 px-4 py-3 rounded-2xl font-black text-xs uppercase tracking-widest shadow-sm hover:bg-sky-50 transition-all active:scale-95"
                            >
                                {allVisibleSelected ? 'Unselect All' : 'Select All'}
                            </button>
                            <button
                                onClick={() => setSelectedEmpIds([])}
                                className="bg-white text-gray-600 border border-gray-200 px-4 py-3 rounded-2xl font-black text-xs uppercase tracking-widest shadow-sm hover:bg-gray-50 transition-all active:scale-95"
                            >
                                Clear Selection
                            </button>
                            <button
                                onClick={handleBulkSet}
                                className="bg-sky-600 text-white px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-sky-100 hover:bg-sky-700 transition-all flex items-center gap-2 active:scale-95"
                            >
                                <FaClipboardList size={14} /> Bulk Set ({selectedEmpIds.length})
                            </button>
                        </div>
                    </div>
                </div>

                {/* Legend & Leave Type Management */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-lg shadow-sky-50/30 p-5 mb-8">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
                        <h2 className="text-xs font-black text-gray-400 uppercase tracking-widest">Leave Types</h2>
                        <button
                            onClick={handleAddLeaveType}
                            className="flex items-center gap-2 bg-sky-600 text-white px-4 py-2 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-md shadow-sky-100 hover:bg-sky-700 transition-all active:scale-95"
                        >
                            <FaPlus size={10} /> Add Leave Type
                        </button>
                    </div>
                    <div className="flex flex-wrap gap-3">
                        {leaveTypes.map(t => {
                            const c = colorMap[t.color] || colorMap.blue;
                            return (
                                <div key={t.key} className={`flex items-center gap-2.5 pl-4 pr-2 py-2 ${c.bg} ${c.border} border rounded-2xl group/lt`}>
                                    <div className={`h-2.5 w-2.5 rounded-full ${c.bar}`} />
                                    <span className={`text-[10px] font-black uppercase tracking-widest ${c.text}`}>{t.full}</span>
                                    <span className="text-[9px] font-bold text-gray-400">({t.label})</span>
                                    <div className="flex items-center gap-1 ml-1 pl-2 border-l border-gray-200">
                                        <button
                                            onClick={() => handleEditLeaveType(t)}
                                            className="h-6 w-6 flex items-center justify-center rounded-lg text-gray-400 hover:text-sky-600 hover:bg-sky-100 transition-all"
                                            title={`Edit ${t.full}`}
                                        >
                                            <FaEdit size={11} />
                                        </button>
                                        {!t.isDefault && !t.isVirtual && (
                                            <button
                                                onClick={() => handleDeleteLeaveType(t)}
                                                className="h-6 w-6 flex items-center justify-center rounded-lg text-gray-400 hover:text-rose-600 hover:bg-rose-100 transition-all"
                                                title={`Delete ${t.full}`}
                                            >
                                                <FaTrash size={11} />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Search */}
                <div className="relative mb-6 group">
                    <FaSearch className="absolute left-5 top-1/2 -translate-y-1/2 text-sky-300 group-focus-within:text-sky-500 transition-colors" />
                    <input
                        type="text"
                        placeholder="Search by name, department, or designation..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="w-full pl-14 pr-6 py-4 bg-white border border-gray-100 rounded-2xl outline-none focus:ring-4 focus:ring-sky-100 focus:border-sky-500 transition-all font-bold text-gray-700 text-sm shadow-lg shadow-sky-50/30"
                    />
                </div>

                {/* Table Card */}
                <div className="modern-card !p-0 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full border-collapse text-left">
                            <thead>
                                <tr className="bg-sky-50/50 border-b border-sky-100">
                                    <th className="p-5 text-center w-14">
                                        <input
                                            type="checkbox"
                                            checked={allVisibleSelected}
                                            onChange={toggleSelectAllVisible}
                                            className="h-4 w-4 accent-sky-600 cursor-pointer"
                                            aria-label="Select all visible employees"
                                        />
                                    </th>
                                    <th className="p-5 text-[10px] font-black text-gray-400 uppercase tracking-widest min-w-[220px]">Employee</th>
                                    {leaveTypes.map(t => (
                                        <th key={t.key} className="p-5 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center min-w-[120px]">
                                            {t.label}
                                            <div className="text-[8px] text-gray-300 normal-case font-bold tracking-normal mt-0.5">{t.full}</div>
                                        </th>
                                    ))}
                                    <th className="p-5 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center w-28">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-sky-50/80">
                                {loading ? (
                                    <tr>
                                        <td colSpan={leaveTypes.length + 3} className="p-16 text-center">
                                            <div className="flex items-center justify-center gap-3">
                                                <div className="h-2 w-2 bg-sky-600 rounded-full animate-bounce" />
                                                <div className="h-2 w-2 bg-sky-600 rounded-full animate-bounce delay-100" />
                                                <div className="h-2 w-2 bg-sky-600 rounded-full animate-bounce delay-200" />
                                            </div>
                                        </td>
                                    </tr>
                                ) : filtered.length === 0 ? (
                                    <tr>
                                        <td colSpan={leaveTypes.length + 3} className="p-16 text-center opacity-30">
                                            <FaUserTie size={40} className="mx-auto mb-3" />
                                            <p className="font-black text-sm">No employee found</p>
                                        </td>
                                    </tr>
                                ) : filtered.map((emp, idx) => {
                                    const isEditing = editingId === emp.emp_id;
                                    return (
                                        <motion.tr
                                            key={emp.emp_id}
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            transition={{ delay: idx * 0.02 }}
                                            className={`group transition-all ${isEditing ? 'bg-sky-50/40' : 'hover:bg-gray-50/50'}`}
                                        >
                                            <td className="p-5 text-center">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedEmpIds.includes(String(emp.emp_id))}
                                                    onChange={() => setSelectedEmpIds((prev) => (
                                                        prev.includes(String(emp.emp_id))
                                                            ? prev.filter((id) => id !== String(emp.emp_id))
                                                            : [...prev, String(emp.emp_id)]
                                                    ))}
                                                    className="h-4 w-4 accent-sky-600 cursor-pointer"
                                                    aria-label={`Select ${emp.name}`}
                                                />
                                            </td>

                                            {/* Employee Info */}
                                            <td className="p-5">
                                                <div className="flex items-center gap-3">
                                                    <img
                                                        src={emp.profile_pic || `https://ui-avatars.com/api/?name=${encodeURIComponent(emp.name || '?')}&size=80&background=0ea5e9&color=fff&bold=true`}
                                                        alt=""
                                                        className="h-9 w-9 rounded-xl object-cover shadow-sm shrink-0"
                                                    />
                                                    <div>
                                                        <p className="text-sm font-black text-gray-800 tracking-tight">{emp.name}</p>
                                                        <div className="flex items-center gap-2 mt-0.5">
                                                            <span className="text-[9px] font-black text-sky-500 uppercase tracking-widest">{emp.designation || emp.role}</span>
                                                            {emp.department_name && (
                                                                <>
                                                                    <span className="text-gray-200">•</span>
                                                                    <span className="text-[9px] font-bold text-gray-400">{emp.department_name}</span>
                                                                </>
                                                            )}
                                                        </div>
                                                        {emp.from_month && emp.to_month && (
                                                            <p className="text-[8px] font-bold text-emerald-500 mt-0.5">
                                                                {new Date(emp.from_month).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                                                                {' '}→{' '}
                                                                {new Date(emp.to_month).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                                                            </p>
                                                        )}
                                                        {emp.updated_at && (
                                                            <p className="text-[8px] font-bold text-sky-500 mt-0.5">
                                                                Updated: {new Date(emp.updated_at).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>
                                            </td>

                                            {/* Leave Type Cells */}
                                            {leaveTypes.map(t => {
                                                const prefix = colPrefix(t.key);
                                                const limitKey = `${prefix}_limit`;
                                                const takenKey = `${prefix}_taken`;
                                                const isNoLimit = noLimitTypes.includes(t.key);
                                                const isComp = t.key === 'comp' || t.key === 'comp_leave';
                                                const limit = isComp ? (emp.comp_earned ?? 0) : (isNoLimit ? null : (isEditing ? editValues[limitKey] : (emp[limitKey] ?? '-')));
                                                const taken = emp[takenKey] ?? 0;
                                                const pct = limit > 0 ? Math.min(100, Math.round((taken / limit) * 100)) : 0;
                                                const c = colorMap[t.color];
                                                const isOver = limit > 0 && taken >= limit;

                                                return (
                                                    <td key={t.key} className="p-4 text-center">
                                                        {isNoLimit && !isComp ? (
                                                            <div className="flex flex-col items-center gap-2">
                                                                <span className={`text-sm font-black text-gray-800`}>{taken}</span>
                                                                <span className="text-[9px] font-black text-emerald-500 uppercase tracking-widest">No Limit</span>
                                                            </div>
                                                        ) : isComp ? (
                                                            <div className="flex flex-col items-center gap-2">
                                                                <div className="flex items-center gap-1">
                                                                    <span className={`text-sm font-black ${isOver ? 'text-rose-600' : 'text-gray-800'}`}>{taken}</span>
                                                                    <span className="text-gray-300 text-xs">/</span>
                                                                    <span className={`text-sm font-black ${c.text}`}>{limit}</span>
                                                                </div>
                                                                <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                                                    <div
                                                                        className={`h-full rounded-full transition-all ${isOver ? 'bg-rose-500' : c.bar}`}
                                                                        style={{ width: `${pct}%` }}
                                                                    />
                                                                </div>
                                                                <span className={`text-[8px] font-black uppercase tracking-widest text-indigo-400`}>Auto</span>
                                                            </div>
                                                        ) : isEditing ? (
                                                            <input
                                                                type="number"
                                                                min="0"
                                                                max="365"
                                                                value={editValues[limitKey] ?? ''}
                                                                onChange={e => setEditValues(prev => ({ ...prev, [limitKey]: parseInt(e.target.value) || 0 }))}
                                                                className={inputClass}
                                                            />
                                                        ) : (
                                                            <div className="flex flex-col items-center gap-2">
                                                                <div className="flex items-center gap-1">
                                                                    <span className={`text-sm font-black ${isOver ? 'text-rose-600' : 'text-gray-800'}`}>{taken}</span>
                                                                    <span className="text-gray-300 text-xs">/</span>
                                                                    <span className={`text-sm font-black ${c.text}`}>{limit}</span>
                                                                </div>
                                                                <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                                                    <div
                                                                        className={`h-full rounded-full transition-all ${isOver ? 'bg-rose-500' : c.bar}`}
                                                                        style={{ width: `${pct}%` }}
                                                                    />
                                                                </div>
                                                                <span className={`text-[8px] font-black uppercase tracking-widest ${isOver ? 'text-rose-400' : 'text-gray-300'}`}>
                                                                    {isOver ? 'Exceeded' : `${pct}%`}
                                                                </span>
                                                            </div>
                                                        )}
                                                    </td>
                                                );
                                            })}

                                            {/* Actions */}
                                            <td className="p-4 text-center">
                                                {isEditing ? (
                                                    <div className="flex items-center justify-center gap-2">
                                                        <button
                                                            onClick={() => saveEdit(emp.emp_id)}
                                                            className="h-9 w-9 bg-emerald-50 text-emerald-600 rounded-xl hover:bg-emerald-600 hover:text-white transition-all flex items-center justify-center active:scale-90"
                                                            title="Save"
                                                        >
                                                            <FaSave size={13} />
                                                        </button>
                                                        <button
                                                            onClick={cancelEdit}
                                                            className="h-9 w-9 bg-rose-50 text-rose-500 rounded-xl hover:bg-rose-500 hover:text-white transition-all flex items-center justify-center active:scale-90"
                                                            title="Cancel"
                                                        >
                                                            <FaTimes size={13} />
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <button
                                                        onClick={() => startEdit(emp)}
                                                        className="h-9 w-9 bg-sky-50 text-sky-500 rounded-xl hover:bg-sky-600 hover:text-white transition-all flex items-center justify-center mx-auto opacity-0 group-hover:opacity-100 active:scale-90"
                                                        title="Edit Limits"
                                                    >
                                                        <FaEdit size={13} />
                                                    </button>
                                                )}
                                            </td>
                                        </motion.tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>

                <p className="text-[10px] font-black text-gray-300 uppercase tracking-[0.3em] text-center mt-6">
                    {new Date(fromDate).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                    {' '}to{' '}
                    {new Date(toDate).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                    {' '}· Leave Management · {filtered.length} employee{filtered.length !== 1 ? 's' : ''}
                </p>
            </motion.div>
        </Layout >
    );
};

export default LeaveLimitation;
