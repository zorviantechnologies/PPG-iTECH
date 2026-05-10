import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../../components/Layout';
import api from '../../utils/api';
import { finalizePrintWindow } from '../../utils/printUtils';
import { FaUserTie, FaEye, FaCalendarAlt, FaIdBadge, FaEnvelope, FaPhone, FaBuilding, FaSuitcase, FaPrint } from 'react-icons/fa';
import { motion } from 'framer-motion';

const Department = () => {
    const navigate = useNavigate();
    const [staff, setStaff] = useState([]);
    const [deptInfo, setDeptInfo] = useState(null);

    useEffect(() => {
        const fetchStaff = async () => {
            try {
                const { data } = await api.get('/employees'); // Backend filters by HOD's dept
                const sorted = data.sort((a, b) => {
                    if (a.role === 'hod' && b.role !== 'hod') return -1;
                    if (a.role !== 'hod' && b.role === 'hod') return 1;
                    return 0;
                });
                setStaff(sorted);
            } catch (error) {
                console.error("Error fetching staff", error);
            }
        };
        const fetchDept = async () => {
            try {
                const { data } = await api.get('/departments');
                if (data.length > 0) setDeptInfo(data[0]);
            } catch (e) { /* ignore */ }
        };
        fetchStaff();
        fetchDept();
    }, []);

    const handlePrint = async () => {
        if (!staff || staff.length === 0) return;

        const printWindow = window.open('', '_blank', 'width=1200,height=800');
        if (!printWindow) return;

        const escHtml = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const roleColors = { hod: '#0891b2', staff: '#16a34a', admin: '#7c3aed', principal: '#2563eb' };

        const rowsHtml = staff.map((member, idx) => `
            <tr style="${idx % 2 === 0 ? 'background:#fff;' : 'background:#f8fafc;'}">
                <td style="padding:10px 12px; text-align:center;">
                    <img src="${escHtml(member.profile_pic || `https://ui-avatars.com/api/?name=${encodeURIComponent(member.name)}&size=60&background=2563eb&color=fff&bold=true`)}"
                         style="width:40px;height:40px;border-radius:10px;object-fit:cover;" onerror="this.style.display='none'" />
                </td>
                <td style="padding:10px 12px; font-size:9pt; font-weight:900; color:#1e3a8a;">${escHtml(member.emp_id)}</td>
                <td style="padding:10px 12px; font-size:9pt; font-weight:700; color:#1e293b;">${escHtml(member.name)}</td>
                <td style="padding:10px 12px;">
                    <span style="background:${(roleColors[member.role] || '#475569')}22; color:${(roleColors[member.role] || '#475569')}; border:1px solid ${(roleColors[member.role] || '#475569')}44; padding:2px 8px; border-radius:12px; font-size:8pt; font-weight:900; text-transform:uppercase;">${escHtml(member.role)}</span>
                </td>
                <td style="padding:10px 12px; font-size:9pt; color:#334155;">${escHtml(member.designation || '—')}</td>
                <td style="padding:10px 12px; font-size:8.5pt; color:#475569;">${escHtml(member.email || '—')}</td>
                <td style="padding:10px 12px; font-size:9pt; color:#475569;">${escHtml(member.mobile || '—')}</td>
            </tr>
        `).join('');

        printWindow.document.write(`
            <!doctype html><html><head><meta charset="UTF-8">
            <title>Departmental Matrix Report</title>
            <style>
                @page { size: landscape; margin: 0.7cm; }
                body { font-family: 'Segoe UI', Arial, sans-serif; color: #1e293b; margin: 0; padding: 10px; }
                .header { display:flex; justify-content:space-between; align-items:flex-end; margin-bottom:20px; border-bottom:3px solid #1e3a8a; padding-bottom:12px; }
                .header h1 { margin:0; color:#1e3a8a; font-size:18pt; font-weight:900; letter-spacing:-0.5px; }
                .meta { font-size:9pt; color:#64748b; font-weight:bold; margin-top:5px; }
                .brand { font-weight:900; color:#1e3a8a; font-size:11pt; text-align:right; }
                .gen-date { font-size:8pt; color:#94a3b8; text-align:right; }
                table { width:100%; border-collapse:collapse; }
                thead tr { background:#1e3a8a; }
                thead th { padding:10px 12px; font-size:8pt; font-weight:900; color:#fff; text-transform:uppercase; letter-spacing:0.08em; text-align:left; }
                tbody tr { border-bottom:1px solid #f1f5f9; }
            </style></head><body>
            <div class="header">
                <div>
                    <h1>Departmental Matrix — ${escHtml(deptInfo?.name || 'Department')}</h1>
                    <p class="meta">Department Code: ${escHtml(deptInfo?.code || '—')} &nbsp;|&nbsp; Total Personnel: ${staff.length}</p>
                </div>
                <div>
                    <div class="brand">PPG EMP HUB</div>
                    <div class="gen-date">Generated: ${new Date().toLocaleString('en-GB')}</div>
                </div>
            </div>
            <table>
                <thead><tr>
                    <th style="width:56px;">Photo</th>
                    <th>Emp ID</th><th>Name</th><th>Role</th><th>Designation</th><th>Email</th><th>Mobile</th>
                </tr></thead>
                <tbody>${rowsHtml}</tbody>
            </table>
            </body></html>
        `);
        printWindow.document.close();
        await finalizePrintWindow({
            printWindow,
            title: 'Departmental Matrix Report',
            delay: 250,
            modeLabel: 'the departmental matrix report'
        });
    };

    return (
        <Layout>
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-4">
                <div>
                    <h1 className="text-3xl font-black text-gray-800 tracking-tight">Departmental Matrix</h1>
                    <div className="flex items-center gap-3 mt-1">
                        {deptInfo?.code && (
                            <span className="px-2 py-1 bg-sky-50 border border-sky-100 rounded-lg text-[9px] font-black text-sky-600 tracking-widest">{deptInfo.code}</span>
                        )}
                        <span className="px-2 py-1 bg-gray-50 border border-gray-100 rounded-lg text-[9px] font-black text-gray-500 tracking-widest uppercase shadow-sm">
                            Total Staff: {staff.length}
                        </span>
                    </div>
                </div>
                <button
                    onClick={handlePrint}
                    className="p-4 bg-sky-600 text-white rounded-2xl shadow-lg shadow-sky-100 hover:bg-sky-700 transition-all flex items-center justify-center gap-2 group font-black uppercase tracking-widest text-[10px]"
                    title="Department Report"
                >
                    <FaPrint className="group-hover:scale-110 transition-transform" />
                    <span className="hidden sm:inline">Report</span>
                </button>
            </div>

            <div className="bg-white rounded-[32px] border border-gray-100 shadow-sm overflow-hidden">
                <div className="overflow-x-auto custom-scrollbar">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-gray-50/50">
                                <th className="p-6 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100 text-center">Profile</th>
                                <th className="p-6 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100">Emp ID</th>
                                <th className="p-6 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100">Name & Designation</th>
                                <th className="p-6 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100">Contact Info</th>
                                <th className="p-6 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100 text-center">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100/50">
                            {staff.map((member, idx) => (
                                <motion.tr 
                                    key={member.id || member.emp_id || idx}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: idx * 0.05 }}
                                    className="hover:bg-sky-50/30 transition-all group"
                                >
                                    <td className="p-5 w-24">
                                        <div className="h-14 w-14 rounded-2xl mx-auto overflow-hidden border-2 border-white shadow-md group-hover:scale-110 transition-transform">
                                            <img
                                                src={member.profile_pic || `https://ui-avatars.com/api/?name=${encodeURIComponent(member.name)}&background=3b82f6&color=fff&bold=true`}
                                                alt={member.name}
                                                className="w-full h-full object-cover"
                                            />
                                        </div>
                                    </td>
                                    <td className="p-5">
                                        <span className="text-xs font-black text-sky-600 bg-sky-100 px-3 py-1.5 rounded-xl shadow-sm border border-sky-100">{member.emp_id}</span>
                                    </td>
                                    <td className="p-5">
                                        <div className="flex flex-col">
                                            <span className="text-base font-black text-gray-800 tracking-tight">{member.name}</span>
                                            <div className="flex flex-wrap items-center gap-2 mt-1">
                                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{member.designation}</span>
                                                {member.role === 'hod' && (
                                                    <span className="text-[8px] font-black text-fuchsia-600 bg-fuchsia-50 px-2 py-0.5 rounded-lg border border-fuchsia-100 uppercase tracking-widest">HOD</span>
                                                )}
                                            </div>
                                        </div>
                                    </td>
                                    <td className="p-5">
                                        <div className="flex flex-col gap-2">
                                            <div className="flex items-center gap-3 text-xs text-gray-500 font-bold tracking-tight">
                                                <div className="h-6 w-6 rounded-lg bg-sky-50 flex items-center justify-center text-sky-500">
                                                    <FaEnvelope size={10} />
                                                </div>
                                                <span className="truncate">{member.email || 'N/A'}</span>
                                            </div>
                                            <div className="flex items-center gap-3 text-xs text-gray-500 font-bold tracking-tight">
                                                <div className="h-6 w-6 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-500">
                                                    <FaPhone size={10} />
                                                </div>
                                                <span>{member.mobile || 'N/A'}</span>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="p-5">
                                        <div className="flex items-center justify-center gap-3">
                                            <button
                                                onClick={() => {
                                                    navigate(`/hod/timetable/${member.emp_id}`);
                                                    window.dispatchEvent(new CustomEvent('closeSidebar'));
                                                }}
                                                className="h-12 w-12 bg-white text-gray-500 rounded-xl border border-gray-100 flex items-center justify-center hover:bg-gray-800 hover:text-white transition-all shadow-sm active:scale-90"
                                                title="View Timetable"
                                            >
                                                <FaCalendarAlt size={16} />
                                            </button>
                                        </div>
                                    </td>
                                </motion.tr>
                            ))}

                            {staff.length === 0 && (
                                <tr>
                                    <td colSpan="5" className="p-16 text-center text-gray-400">
                                        <FaUserTie size={48} className="mx-auto mb-4 opacity-20" />
                                        <div className="font-black text-sm uppercase tracking-widest text-gray-400">No staff found in your department.</div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </Layout>
    );
};

export default Department;
