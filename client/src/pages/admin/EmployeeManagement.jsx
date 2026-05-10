import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../../components/Layout';
import api from '../../utils/api';
import Swal from 'sweetalert2';
import { runPrintWindow } from '../../utils/printUtils';
import { FaEdit, FaTrash, FaUserPlus, FaSearch, FaFilter, FaUsers, FaIdBadge, FaEnvelope, FaPhone, FaPrint, FaEye } from 'react-icons/fa';
import { motion, AnimatePresence } from 'framer-motion';



const EmployeeManagement = () => {
    const [employees, setEmployees] = useState([]);
    const [filteredEmployees, setFilteredEmployees] = useState([]);
    const [departments, setDepartments] = useState([]);
    const navigate = useNavigate();

    // Search & Filter State
    const [searchQuery, setSearchQuery] = useState('');
    const [filterRole, setFilterRole] = useState('');
    const [filterDept, setFilterDept] = useState('');

    useEffect(() => {
        fetchEmployees();
        fetchDepartments();
    }, []);

    useEffect(() => {
        applyFilters();
    }, [employees, searchQuery, filterRole, filterDept]);

    const fetchEmployees = async () => {
        try {
            const { data } = await api.get('/employees');
            setEmployees(data);
        } catch (error) { console.error(error); }
    };

    const fetchDepartments = async () => {
        try {
            const { data } = await api.get('/departments');
            setDepartments(data);
        } catch (error) { console.error(error); }
    };

    const applyFilters = () => {
        let result = employees;
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            result = result.filter(e =>
                String(e.emp_id || '').toLowerCase().includes(query) ||
                String(e.emp_code || '').toLowerCase().includes(query) ||
                String(e.name || '').toLowerCase().includes(query)
            );
        }
        if (filterRole) {
            result = result.filter(e => e.role === filterRole);
        }
        if (filterDept) {
            result = result.filter(e => String(e.department_id) === String(filterDept));
        }
        setFilteredEmployees(result);
    };

    const handleDelete = async (e, id) => {
        e.stopPropagation();

        const emp = employees.find(x => x.id === id);
        const isHodOrStaff = emp && (emp.role === 'hod' || emp.role === 'staff');

        const result = await Swal.fire({
            title: 'Delete Employee?',
            html: isHodOrStaff
                ? `<p class="text-gray-700 text-sm">This will permanently remove <strong>${emp?.name}</strong> from the database.</p>
                   <div class="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-xl text-left">
                     <p class="text-amber-700 text-xs font-bold">⚠️ Any <strong>pending leave requests</strong> by this ${emp?.role?.toUpperCase()} will be automatically <strong>rejected</strong> before deletion.</p>
                   </div>`
                : `<p class="text-gray-700 text-sm">This will permanently remove <strong>${emp?.name}</strong> from the database.</p>`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#ef4444',
            confirmButtonText: 'Yes, Delete',
            cancelButtonColor: '#64748b',
            background: '#fff',
            customClass: {
                popup: 'rounded-2xl',
                title: 'font-black text-gray-800'
            }
        });

        if (result.isConfirmed) {
            try {
                const { data } = await api.delete(`/employees/${id}`);
                setEmployees(employees.filter(e => e.id !== id));
                Swal.fire({
                    title: 'Employee Deleted',
                    text: data.message || 'The employee has been removed successfully.',
                    icon: 'success',
                    confirmButtonColor: '#2563eb'
                });
            } catch (error) {
                Swal.fire({
                    title: 'System Error',
                    text: error.response?.data?.message || 'Failed to delete employee.',
                    icon: 'error',
                    confirmButtonColor: '#2563eb'
                });
            }
        }
    };

    const handleEdit = (e, emp) => {
        e.stopPropagation();
        navigate(`/admin/employees/edit/${emp.id}`);
        window.dispatchEvent(new CustomEvent('closeSidebar'));
    };

    const handleAdd = () => {
        navigate('/admin/employees/new');
        window.dispatchEvent(new CustomEvent('closeSidebar'));
    };

    const handleView = (e, emp) => {
        e.stopPropagation();
        navigate(`/admin/profile/${emp.emp_id}`);
        window.dispatchEvent(new CustomEvent('closeSidebar'));
    };

    const getExportRows = () => filteredEmployees.map((emp) => ({
        emp_id: emp.emp_id || '',
        emp_code: emp.emp_code || '',
        employee_name: emp.name || '',
        role: emp.role || '',
        category: emp.community || '',
        caste: emp.caste || '',
        department: emp.department_name || '',
        designation: emp.designation || '',
        email: emp.email || '',
        phone: emp.mobile || '',
        whatsapp: emp.whatsapp || '',
        dob: emp.dob || '',
        doj: emp.doj || '',
        gender: emp.gender || '',
        blood_group: emp.blood_group || '',
        religion: emp.religion || '',
        nationality: emp.nationality || '',
        aadhar: emp.aadhar || '',
        pan: emp.pan || '',
        account_no: emp.account_no || '',
        bank_name: emp.bank_name || '',
        branch: emp.branch || '',
        ifsc: emp.ifsc || '',
        pin_code: emp.pin_code || '',
        pf_number: emp.pf_number || '',
        uan_number: emp.uan_number || '',
        permanent_address: emp.permanent_address || '',
        communication_address: emp.communication_address || '',
        father_name: emp.father_name || '',
        mother_name: emp.mother_name || '',
        marital_status: emp.marital_status || '',
        monthly_salary: emp.monthly_salary || '',
        experience: emp.experience || '',
        profile_link: `${window.location.origin}/admin/profile/${encodeURIComponent(emp.emp_id || '')}`
    }));

    const handlePrint = async () => {
        if (!filteredEmployees || filteredEmployees.length === 0) {
            Swal.fire({ icon: 'warning', title: 'No Data', text: 'No employees available for this report.' });
            return;
        }

        const rows = getExportRows();
        const escapeHtml = (value) => String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');

        const rowsHtml = rows.map((r, idx) => `
            <tr>
                <td>${idx + 1}</td>
                <td>${escapeHtml(r.emp_id)}</td>
                <td>${escapeHtml(r.employee_name)}</td>
                <td>${escapeHtml(String(r.role || '').toUpperCase())}</td>
                <td>${escapeHtml(r.department)}</td>
                <td>${escapeHtml(r.designation)}</td>
                <td>${escapeHtml(r.email)}</td>
                <td>${escapeHtml(r.phone)}</td>
                <td class="excel-only">${escapeHtml(r.emp_code)}</td>
                <td class="excel-only">${escapeHtml(r.category)}</td>
                <td class="excel-only">${escapeHtml(r.caste)}</td>
                <td class="excel-only">${escapeHtml(r.whatsapp)}</td>
                <td class="excel-only">${escapeHtml(r.dob)}</td>
                <td class="excel-only">${escapeHtml(r.doj)}</td>
                <td class="excel-only">${escapeHtml(r.gender)}</td>
                <td class="excel-only">${escapeHtml(r.blood_group)}</td>
                <td class="excel-only">${escapeHtml(r.religion)}</td>
                <td class="excel-only">${escapeHtml(r.nationality)}</td>
                <td class="excel-only">${escapeHtml(r.aadhar)}</td>
                <td class="excel-only">${escapeHtml(r.pan)}</td>
                <td class="excel-only">${escapeHtml(r.account_no)}</td>
                <td class="excel-only">${escapeHtml(r.bank_name)}</td>
                <td class="excel-only">${escapeHtml(r.branch)}</td>
                <td class="excel-only">${escapeHtml(r.ifsc)}</td>
                <td class="excel-only">${escapeHtml(r.pin_code)}</td>
                <td class="excel-only">${escapeHtml(r.pf_number)}</td>
                <td class="excel-only">${escapeHtml(r.uan_number)}</td>
                <td class="excel-only">${escapeHtml(r.permanent_address)}</td>
                <td class="excel-only">${escapeHtml(r.communication_address)}</td>
                <td class="excel-only">${escapeHtml(r.father_name)}</td>
                <td class="excel-only">${escapeHtml(r.mother_name)}</td>
                <td class="excel-only">${escapeHtml(r.marital_status)}</td>
                <td class="excel-only">${escapeHtml(r.monthly_salary)}</td>
                <td class="excel-only">${escapeHtml(r.experience)}</td>
                <td class="excel-only">${escapeHtml(r.profile_link)}</td>
            </tr>
        `).join('');

        const html = `<!doctype html>
<html>
<head>
    <meta charset="UTF-8" />
    <title>Employee Management Report</title>
    <style>
        @page { size: A4 landscape; margin: 14mm; }
        body { font-family: Arial, sans-serif; color: #0f172a; }
        .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 14px; }
        .title { font-size: 18px; font-weight: 700; margin: 0; }
        .meta { font-size: 12px; color: #475569; margin-top: 4px; }
        table { width: 100%; border-collapse: collapse; font-size: 11px; }
        th, td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: left; white-space: nowrap; }
        th { background: #e2e8f0; font-weight: 700; }
        tbody tr:nth-child(even) { background: #f8fafc; }
        .excel-only { display: table-cell; }
        body.excel-preview .excel-only { display: table-cell; }
    </style>
</head>
<body>
    <div class="header">
        <div>
            <p class="title">Employee Management Report</p>
            <p class="meta">Total Employees: ${rows.length}</p>
        </div>
        <p class="meta">Generated: ${new Date().toLocaleString('en-GB')}</p>
    </div>
    <table>
        <thead>
            <tr>
                <th>#</th>
                <th>Emp ID</th>
                <th>Name</th>
                <th>Role</th>
                <th>Department</th>
                <th>Designation</th>
                <th>Email</th>
                <th>Phone</th>
                <th class="excel-only">Emp Code</th>
                <th class="excel-only">Category</th>
                <th class="excel-only">Caste</th>
                <th class="excel-only">WhatsApp</th>
                <th class="excel-only">DOB</th>
                <th class="excel-only">DOJ</th>
                <th class="excel-only">Gender</th>
                <th class="excel-only">Blood Group</th>
                <th class="excel-only">Religion</th>
                <th class="excel-only">Nationality</th>
                <th class="excel-only">Aadhar</th>
                <th class="excel-only">PAN</th>
                <th class="excel-only">Account No</th>
                <th class="excel-only">Bank Name</th>
                <th class="excel-only">Branch</th>
                <th class="excel-only">IFSC</th>
                <th class="excel-only">PIN Code</th>
                <th class="excel-only">PF Number</th>
                <th class="excel-only">UAN Number</th>
                <th class="excel-only">Permanent Address</th>
                <th class="excel-only">Communication Address</th>
                <th class="excel-only">Father Name</th>
                <th class="excel-only">Mother Name</th>
                <th class="excel-only">Marital Status</th>
                <th class="excel-only">Monthly Salary</th>
                <th class="excel-only">Experience</th>
                <th class="excel-only">Profile Link</th>
            </tr>
        </thead>
        <tbody>
            ${rowsHtml}
        </tbody>
    </table>
</body>
</html>`;

        await runPrintWindow({
            title: 'Employee Management Report',
            html,
            windowFeatures: 'width=1200,height=800',
            closeAfterPrint: false,
        });
    };

    return (
        <Layout>
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="max-w-7xl mx-auto"
            >
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-6">
                    <div>
                        <h1 className="text-3xl font-black text-gray-800 tracking-tight">Employee Management</h1>

                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={handlePrint}
                            className="p-4 bg-sky-600 text-white rounded-2xl shadow-lg shadow-sky-100 hover:bg-sky-700 transition-all flex items-center justify-center gap-2 group font-black uppercase tracking-widest text-[10px]"
                            title="Employee Report"
                        >
                            <FaPrint className="group-hover:scale-110 transition-transform" />
                            <span className="hidden sm:inline">Report</span>
                        </button>
                        <button
                            onClick={handleAdd}
                            className="bg-sky-600 text-white px-8 py-4 rounded-2xl shadow-xl shadow-sky-100 hover:bg-sky-700 transition-all flex items-center font-black uppercase tracking-widest text-xs active:scale-95 group"
                        >
                            <FaUserPlus className="mr-3 group-hover:scale-110 transition-transform" /> Add New Employee
                        </button>
                    </div>
                </div>

                {/* Search and Filters */}
                <div className="bg-white/80 backdrop-blur-xl p-8 rounded-[32px] shadow-xl shadow-sky-50/50 mb-10 border border-black/50 overflow-hidden flex flex-col md:flex-row gap-8 items-end transition-all duration-300 hover:scale-[1.01]">
                    <div className="flex-1 w-full">
                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 ml-1">Search Employee Code / Name</label>
                        <div className="relative group">
                            <FaSearch className="absolute left-5 top-1/2 -translate-y-1/2 text-sky-300 group-focus-within:text-sky-500 transition-colors" />
                            <input
                                type="text"
                                placeholder="Search Employee Code or name..."
                                className="w-full pl-14 pr-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl outline-none focus:ring-4 focus:ring-sky-100 focus:border-sky-500 transition-all font-bold text-gray-700 text-sm"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                    </div>
                    <div className="w-full md:w-64">
                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 ml-1">Role</label>
                        <div className="relative">
                            <select
                                className="w-full p-4 bg-gray-50 border border-gray-100 rounded-2xl outline-none focus:ring-4 focus:ring-sky-100 focus:border-sky-500 transition-all font-bold text-gray-700 text-sm appearance-none"
                                value={filterRole}
                                onChange={(e) => setFilterRole(e.target.value)}
                            >
                                <option value="">All Roles</option>
                                <option value="admin">admin</option>
                                <option value="principal">principal</option>
                                <option value="hod">hod</option>
                                <option value="staff">staff</option>
                            </select>
                            <FaFilter className="absolute right-5 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none" />
                        </div>
                    </div>
                    <div className="w-full md:w-72">
                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 ml-1">Department</label>
                        <div className="relative">
                            <select
                                className="w-full p-4 bg-gray-50 border border-gray-100 rounded-2xl outline-none focus:ring-4 focus:ring-sky-100 focus:border-sky-500 transition-all font-bold text-gray-700 text-sm appearance-none"
                                value={filterDept}
                                onChange={(e) => setFilterDept(e.target.value)}
                            >
                                <option value="">All Departments</option>
                                {departments.map(d => (
                                    <option key={d.id} value={d.id}>
                                        {d.name} {d.code ? `(${d.code})` : ''}
                                    </option>
                                ))}
                            </select>
                            <FaUsers className="absolute right-5 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none" />
                        </div>
                    </div>
                </div>

                {/* Employee List */}
                <div className="modern-card !p-0 overflow-hidden border-sky-100 shadow-2xl">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-gray-50/50">
                                    <th className="p-6 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] border-b border-sky-50">Employee</th>
                                    <th className="p-6 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] border-b border-sky-50">Role & Department</th>
                                    <th className="p-6 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] border-b border-sky-50">Contact Info</th>
                                    <th className="p-6 text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] border-b border-sky-50 text-center">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-sky-50/10">
                                <AnimatePresence mode="popLayout">
                                    {filteredEmployees.map((emp, idx) => (
                                        <motion.tr
                                            key={emp.id}
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            exit={{ opacity: 0, scale: 0.98 }}
                                            transition={{ delay: idx * 0.03 }}
                                            className="hover:bg-sky-50/20 transition-all"
                                        >
                                            <td className="p-6">
                                                <div className="flex items-center gap-5">
                                                    <div className="relative">
                                                        <img
                                                            className="h-14 w-14 rounded-2xl border-2 border-white shadow-xl ring-2 ring-sky-50 object-cover group-hover:scale-110 transition-transform"
                                                            src={emp.profile_pic || `https://ui-avatars.com/api/?name=${emp.name}&background=3b82f6&color=fff&bold=true`}
                                                            alt=""
                                                        />
                                                        <div className="absolute -bottom-1 -right-1 h-5 w-5 bg-emerald-500 rounded-lg border-2 border-white shadow-sm"></div>
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-black text-gray-800 tracking-tight">{emp.name}</p>
                                                        <div className="flex items-center gap-2 mt-1">
                                                            <FaIdBadge className="text-sky-500 text-[10px]" />
                                                            <p className="text-[10px] font-black text-sky-500 uppercase tracking-widest">{emp.emp_id}</p>

                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="p-6">
                                                <p className="text-sm text-gray-800 font-black tracking-tight">{emp.department_name}</p>
                                                <div className="flex flex-col items-start gap-1 mt-1">
                                                     <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-md tracking-[0.1em] ${emp.role === 'admin' ? 'bg-violet-100 text-violet-600' :
                                                        emp.role === 'principal' ? 'bg-indigo-100 text-indigo-600' :
                                                            emp.role === 'hod' ? 'bg-sky-100 text-sky-600' : 'bg-gray-100 text-gray-500'
                                                        }`}>
                                                        {emp.role === 'admin' ? 'Admin' :
                                                         emp.role === 'principal' ? 'Principal' :
                                                         emp.role === 'hod' ? 'HOD' :
                                                         emp.role === 'staff' ? 'Staff' : emp.role}
                                                     </span>
                                                    <span className="text-[9px] text-gray-400 font-bold uppercase tracking-widest">{emp.designation || 'N/A'}</span>
                                                </div>
                                            </td>
                                            <td className="p-6">
                                                <div className="space-y-1.5">
                                                    <div className="flex items-center gap-2 text-gray-500">
                                                        <FaEnvelope className="text-sky-300 text-[10px]" />
                                                        <p className="text-[11px] font-medium tracking-tight truncate max-w-[180px]">{emp.email}</p>
                                                    </div>
                                                    <div className="flex items-center gap-2 text-gray-500">
                                                        <FaPhone className="text-sky-300 text-[10px]" />
                                                        <p className="text-[11px] font-medium tracking-tight">{emp.mobile}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="p-6">
                                                <div className="flex justify-center gap-3">
                                                    <button
                                                        onClick={(e) => handleView(e, emp)}
                                                        className="h-10 w-10 bg-indigo-50 text-indigo-600 rounded-xl hover:bg-indigo-600 hover:text-white transition-all shadow-sm flex items-center justify-center active:scale-90 group/btn"
                                                        title="View Profile"
                                                    >
                                                        <FaEye className="group-hover/btn:scale-110 transition-transform" />
                                                    </button>
                                                    <button
                                                        onClick={(e) => handleEdit(e, emp)}
                                                        className="h-10 w-10 bg-sky-50 text-sky-600 rounded-xl hover:bg-sky-600 hover:text-white transition-all shadow-sm flex items-center justify-center active:scale-90 group/btn"
                                                        title="Modify Record"
                                                    >
                                                        <FaEdit className="group-hover/btn:scale-110 transition-transform" />
                                                    </button>
                                                    <button
                                                        onClick={(e) => handleDelete(e, emp.id)}
                                                        className="h-10 w-10 bg-rose-50 text-rose-500 rounded-xl hover:bg-rose-500 hover:text-white transition-all shadow-sm flex items-center justify-center active:scale-90 group/btn"
                                                        title="Terminate Access"
                                                    >
                                                        <FaTrash className="group-hover/btn:scale-110 transition-transform" />
                                                    </button>
                                                </div>
                                            </td>
                                        </motion.tr>
                                    ))}
                                </AnimatePresence>
                                {filteredEmployees.length === 0 && (
                                    <tr>
                                        <td colSpan="4" className="p-32 text-center">
                                            <div className="flex flex-col items-center gap-6 opacity-20 grayscale">
                                                <FaUsers size={64} className="text-gray-400" />
                                                <div>
                                                    <p className="text-xl font-black text-gray-800 tracking-tight">No Personnel Detected</p>
                                                    <p className="text-sm font-bold uppercase tracking-widest text-gray-400 mt-1">No identifiers match the specified matrix parameters.</p>
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </motion.div>
        </Layout>
    );
};

export default EmployeeManagement;
