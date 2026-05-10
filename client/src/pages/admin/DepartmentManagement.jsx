import { useState, useEffect } from 'react';
import Layout from '../../components/Layout';
import api from '../../utils/api';
import { useNavigate } from 'react-router-dom';
import Swal from 'sweetalert2';
import { FaTrash, FaPlus, FaLayerGroup, FaBuilding, FaProjectDiagram, FaArrowRight, FaPen, FaPrint } from 'react-icons/fa';
import { motion, AnimatePresence } from 'framer-motion';
import { finalizePrintWindow } from '../../utils/printUtils';

const DepartmentManagement = () => {
    const [departments, setDepartments] = useState([]);
    const [allEmployees, setAllEmployees] = useState([]);
    const navigate = useNavigate();

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [deptRes, empRes] = await Promise.all([
                    api.get('/departments'),
                    api.get('/employees')
                ]);
                setDepartments(deptRes.data);
                setAllEmployees(empRes.data);
            } catch (error) {
                console.error("Error fetching data", error);
            }
        };
        fetchData();
    }, []);

    const handleViewStaff = (dept) => {
        navigate(`/admin/departments/${dept.id}/staff`);
        window.dispatchEvent(new CustomEvent('closeSidebar'));
    };

    const handleDelete = async (id) => {
        Swal.fire({
            title: 'Delete Department?',
            text: "This will remove the department and affect the staff assigned to it.",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#ef4444',
            confirmButtonText: 'Yes, Delete',
            cancelButtonColor: '#64748b',
            background: '#fff',
            customClass: {
                popup: 'rounded-[40px]',
                title: 'font-black text-gray-800 tracking-tight'
            }
        }).then(async (result) => {
            if (result.isConfirmed) {
                try {
                    await api.delete(`/departments/${id}`);
                    const [deptRes, empRes] = await Promise.all([
                        api.get('/departments'),
                        api.get('/employees')
                    ]);
                    setDepartments(deptRes.data);
                    setAllEmployees(empRes.data);
                    Swal.fire({
                        title: 'Department Deleted',
                        text: 'The department has been removed.',
                        icon: 'success',
                        confirmButtonColor: '#2563eb'
                    });
                } catch (error) {
                    Swal.fire({
                        title: 'Error',
                        text: 'Failed to delete department. It might have staff assigned.',
                        icon: 'error',
                        confirmButtonColor: '#2563eb'
                    });
                }
            }
        });
    };

    const handleAction = (dept = null) => {
        if (dept) {
            navigate(`/admin/departments/edit/${dept.id}`);
        } else {
            navigate('/admin/departments/new');
        }
        window.dispatchEvent(new CustomEvent('closeSidebar'));
    };

    const handlePrint = async () => {
        if (!departments || departments.length === 0) return;
        const printWindow = window.open('', '_blank', 'width=1200,height=800');
        if (!printWindow) return;
        const escHtml = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const roleColors = { hod: '#0891b2', staff: '#16a34a', admin: '#7c3aed', principal: '#2563eb' };

        const rows = [];
        departments.forEach((dept) => {
            const deptStaff = allEmployees
                .filter((emp) => String(emp.department_id) === String(dept.id))
                .sort((a, b) => {
                    if (a.role === 'hod' && b.role !== 'hod') return -1;
                    if (a.role !== 'hod' && b.role === 'hod') return 1;
                    return String(a.name || '').localeCompare(String(b.name || ''));
                });

            deptStaff.forEach((member) => {
                rows.push({ dept, member });
            });
        });

        const contentHtml = rows.length > 0
            ? `
                <table>
                    <thead>
                        <tr>
                            <th style="width:48px; text-align:center;">#</th>
                            <th style="width:50px; text-align:center;">Photo</th>
                            <th style="width:120px;">Department</th>
                            <th style="width:90px;">Code</th>
                            <th style="width:100px;">Emp ID</th>
                            <th>Name</th>
                            <th style="width:80px;">Role</th>
                            <th>Designation</th>
                            <th>Email</th>
                            <th style="width:110px;">Mobile</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows.map(({ dept, member }, idx) => `
                            <tr style="${idx % 2 === 0 ? 'background:#fff;' : 'background:#f8fafc;'}">
                                <td style="padding:8px 10px; text-align:center; font-size:8.5pt; font-weight:800; color:#334155;">${idx + 1}</td>
                                <td style="padding:8px 10px; text-align:center;">
                                    <img src="${escHtml(member.profile_pic || `https://ui-avatars.com/api/?name=${encodeURIComponent(member.name)}&size=60&background=2563eb&color=fff&bold=true`)}"
                                        style="width:36px;height:36px;border-radius:8px;object-fit:cover;" onerror="this.style.display='none'" />
                                </td>
                                <td style="padding:8px 10px; font-size:8.5pt; font-weight:700; color:#1e293b;">${escHtml(dept.name)}</td>
                                <td style="padding:8px 10px; font-size:8.5pt; font-weight:700; color:#334155;">${escHtml(dept.code || '—')}</td>
                                <td style="padding:8px 10px; font-size:9pt; font-weight:900; color:#1e3a8a;">${escHtml(member.emp_id)}</td>
                                <td style="padding:8px 10px; font-size:9pt; font-weight:700; color:#1e293b;">${escHtml(member.name)}</td>
                                <td style="padding:8px 10px;">
                                    <span style="background:${(roleColors[member.role] || '#475569')}22; color:${(roleColors[member.role] || '#475569')}; border:1px solid ${(roleColors[member.role] || '#475569')}44; padding:2px 6px; border-radius:10px; font-size:7.5pt; font-weight:900; text-transform:uppercase;">${escHtml(member.role)}</span>
                                </td>
                                <td style="padding:8px 10px; font-size:8.5pt; color:#334155;">${escHtml(member.designation || '—')}</td>
                                <td style="padding:8px 10px; font-size:8pt; color:#475569;">${escHtml(member.email || '—')}</td>
                                <td style="padding:8px 10px; font-size:8.5pt; color:#475569;">${escHtml(member.mobile || '—')}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `
            : '<p style="text-align:center; color:#64748b; font-style:italic; margin-top: 40px;">No personnel data available for this report.</p>';

        printWindow.document.write(`
            <!doctype html><html><head><meta charset="UTF-8">
            <title>Department Personnel Registry</title>
            <style>
                @page { size: landscape; margin: 1cm; }
                body { font-family: 'Segoe UI', Arial, sans-serif; color: #1e293b; margin: 0; padding: 10px; }
                .header { display:flex; justify-content:space-between; align-items:flex-end; margin-bottom:20px; border-bottom:3px solid #1e3a8a; padding-bottom:12px; }
                .header h1 { margin:0; color:#1e3a8a; font-size:18pt; font-weight:900; } 
                .meta { font-size:9pt; color:#64748b; font-weight:bold; margin-top:5px; }
                .brand { font-weight:900; color:#1e3a8a; font-size:11pt; text-align:right; } 
                .gen-date { font-size:8pt; color:#94a3b8; text-align:right; }
                table { width:100%; border-collapse:collapse; background: #fff; border: 1px solid #e2e8f0; } 
                thead tr { background:#1e3a8a; }
                thead th { padding:10px; font-size:8pt; font-weight:900; color:#fff; text-transform:uppercase; letter-spacing:0.05em; text-align:left; border-right: 1px solid #334155; }
                thead th:last-child { border-right: none; }
                tbody tr { border-bottom:1px solid #e2e8f0; }
                tbody td { border-right: 1px solid #e2e8f0; }
                tbody td:last-child { border-right: none; }
            </style></head><body>
            <div class="header">
                <div><h1>Institutional Personnel Registry</h1><p class="meta">Comprehensive Departmental Overview</p></div>
                <div><div class="brand">PPG EMP HUB</div><div class="gen-date">Generated: ${new Date().toLocaleString('en-GB')}</div></div>
            </div>
            ${contentHtml}
            </body></html>
        `);
        printWindow.document.close();
        await finalizePrintWindow({
            printWindow,
            title: 'Department Management Report',
            modeLabel: 'the department management report',
            closeAfterPrint: true,
            delay: 350
        });
    };

    return (
        <Layout>
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="max-w-7xl mx-auto"
            >
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-12 gap-6">
                    <div>
                        <h1 className="text-4xl font-black text-gray-800 tracking-tighter flex items-center gap-4">
                            Departments
                            <span className="bg-sky-100 text-sky-700 font-bold px-3 py-1 rounded-xl text-sm uppercase tracking-widest">
                                Total Faculty: {allEmployees.length}
                            </span>
                        </h1>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={handlePrint}
                            className="p-4 bg-sky-600 text-white rounded-2xl shadow-lg shadow-sky-100 hover:bg-sky-700 transition-all flex items-center justify-center gap-2 group font-black uppercase tracking-widest text-[10px]"
                            title="Department Report"
                        >
                            <FaPrint className="group-hover:scale-110 transition-transform" />
                            <span className="hidden sm:inline">Report</span>
                        </button>
                        <button
                            onClick={() => handleAction()}
                            className="bg-sky-600 text-white px-10 py-5 rounded-2xl shadow-xl shadow-sky-100 hover:bg-sky-800 transition-all font-black uppercase tracking-[0.2em] text-[10px] flex items-center gap-4 active:scale-95 group"
                        >
                            <FaPlus className="group-hover:rotate-90 transition-transform duration-500" />
                            Add Department
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
                    <AnimatePresence mode="popLayout">
                        {departments.map((dept, idx) => (
                            <motion.div
                                key={dept.id}
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.9 }}
                                transition={{ delay: idx * 0.05 }}
                                className="group bg-white p-10 rounded-[40px] shadow-xl shadow-sky-50/50 border border-transparent hover:border-sky-100 hover:shadow-2xl transition-all duration-500 relative overflow-hidden"
                            >
                                <div className="absolute top-0 right-0 w-48 h-48 bg-sky-50 rounded-full -mr-24 -mt-24 opacity-30 group-hover:scale-125 transition-transform duration-700"></div>

                                <div className="flex justify-between items-start relative z-10 mb-8">
                                    <div className="h-16 w-16 rounded-[24px] bg-gradient-to-br from-sky-500 to-sky-700 flex items-center justify-center text-white shadow-lg shadow-sky-200 group-hover:rotate-6 transition-transform">
                                        <FaLayerGroup size={24} />
                                    </div>
                                    <div className="flex gap-2 relative z-10">
                                        <button
                                            onClick={() => handleAction(dept)}
                                            className="h-10 w-10 bg-sky-50 text-sky-600 rounded-xl flex items-center justify-center hover:bg-sky-600 hover:text-white transition-all active:scale-90"
                                            title="Edit Department"
                                        >
                                            <FaPen size={14} />
                                        </button>
                                        <button
                                            onClick={() => handleDelete(dept.id)}
                                            className="h-10 w-10 bg-rose-50 text-rose-500 rounded-xl flex items-center justify-center hover:bg-rose-500 hover:text-white transition-all active:scale-90"
                                            title="Purge Node"
                                        >
                                            <FaTrash size={14} />
                                        </button>
                                    </div>
                                </div>

                                <div className="relative z-10 space-y-4">
                                    <div className="flex items-center gap-3">
                                        <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Active Department</p>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <h3 className="text-2xl font-black text-gray-800 tracking-tight group-hover:text-sky-600 transition-colors">{dept.name}</h3>
                                        {dept.code && (
                                            <span className="px-2 py-1 bg-sky-50 border border-sky-100 rounded-lg text-[9px] font-black text-sky-600 tracking-widest">{dept.code}</span>
                                        )}
                                    </div>

                                    <div className="flex items-center gap-6 pt-4 border-t border-gray-50">
                                        <div className="flex items-center gap-2 text-gray-400">
                                            <span className="px-2 py-1 bg-gray-50 border border-gray-100 rounded-lg text-[9px] font-black text-gray-600 tracking-widest">{dept.code || 'NO-CODE'}</span>
                                        </div>
                                        <div className="flex items-center gap-2 text-gray-400">
                                            <FaBuilding size={10} />
                                            <span className="text-[9px] font-bold uppercase tracking-widest">Division</span>
                                        </div>
                                        <button
                                            onClick={() => handleViewStaff(dept)}
                                            className="ml-auto text-sky-600 hover:text-sky-800 text-[10px] font-black uppercase tracking-widest hover:underline"
                                        >
                                            View Staff & HODs
                                        </button>
                                    </div>
                                </div>

                                <div className="absolute bottom-0 left-0 w-full h-1 bg-gradient-to-r from-sky-500 to-transparent scale-x-0 group-hover:scale-x-100 transition-transform origin-left duration-500"></div>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                </div>

            </motion.div>
        </Layout>
    );
};

export default DepartmentManagement;

