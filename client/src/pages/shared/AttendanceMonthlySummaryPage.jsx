import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Layout from '../../components/Layout';
import api from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import { FaArrowLeft, FaCalendarAlt, FaFilter } from 'react-icons/fa';

const AttendanceMonthlySummaryPage = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { user } = useAuth();

    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const currentMonth = today.slice(0, 7);

    const routePrefix = useMemo(() => {
        const parts = location.pathname.split('/').filter(Boolean);
        return parts.length > 0 ? parts[0] : (user?.role || 'admin');
    }, [location.pathname, user?.role]);

    const [month, setMonth] = useState(currentMonth);
    const [departmentId, setDepartmentId] = useState(user?.role === 'hod' ? String(user.department_id || '') : '');
    const [role, setRole] = useState(() => (user?.role === 'hod' ? 'staff' : ''));
    const [departments, setDepartments] = useState([]);
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(false);

    const formatCount = (value) => Number(value || 0).toFixed(1);

    const fetchDepartments = async () => {
        try {
            const { data } = await api.get('/departments');
            setDepartments(Array.isArray(data) ? data : []);
        } catch (err) {
            console.error('Failed to load departments:', err);
        }
    };

    const fetchMonthlySummary = async () => {
        setLoading(true);
        try {
            let query = `/attendance/summary?month=${month}`;
            if (departmentId) query += `&department_id=${departmentId}`;
            if (role) query += `&role=${role}`;

            const { data } = await api.get(query);
            setRows(Array.isArray(data) ? data : []);
        } catch (err) {
            console.error('Failed to load monthly attendance summary:', err);
            setRows([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchDepartments();
    }, []);

    useEffect(() => {
        fetchMonthlySummary();
    }, [month, departmentId, role]);

    return (
        <Layout>
            <div className="flex flex-col gap-6 mb-8">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => navigate(`/${routePrefix}/attendance`)}
                        className="h-11 w-11 rounded-xl bg-white border border-gray-100 text-gray-500 hover:text-sky-600 shadow-sm"
                        title="Back to Attendance"
                    >
                        <FaArrowLeft className="mx-auto" />
                    </button>
                    <div>
                        <h1 className="text-2xl font-black text-gray-800 tracking-tight">Monthly Attendance Totals</h1>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.25em] mt-1">
                            Employee-wise LOP, OD, and Leave Types
                        </p>
                    </div>
                </div>

                <div className="bg-white border border-sky-50 rounded-2xl p-5 shadow-sm grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div>
                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Month</label>
                        <input
                            type="month"
                            max={currentMonth}
                            value={month}
                            onChange={(e) => setMonth(e.target.value)}
                            className="w-full p-3 rounded-xl border border-gray-100 bg-gray-50 font-bold text-sm"
                        />
                    </div>

                    <div>
                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Department</label>
                        <select
                            value={departmentId}
                            onChange={(e) => setDepartmentId(e.target.value)}
                            className="w-full p-3 rounded-xl border border-gray-100 bg-gray-50 font-bold text-sm"
                        >
                            <option value="">All Departments</option>
                            {departments.map((d) => (
                                <option key={d.id} value={d.id}>{d.name}</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Role</label>
                        <select
                            value={role}
                            onChange={(e) => setRole(e.target.value)}
                            className="w-full p-3 rounded-xl border border-gray-100 bg-gray-50 font-bold text-sm"
                        >
                            <option value="">All Roles</option>
                            <option value="principal">Principal</option>
                            <option value="hod">HOD</option>
                            <option value="staff">Staff</option>
                        </select>
                    </div>

                    <div className="flex items-end">
                        <button
                            onClick={fetchMonthlySummary}
                            className="w-full p-3 rounded-xl bg-sky-600 text-white font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2"
                        >
                            <FaFilter /> Refresh
                        </button>
                    </div>
                </div>
            </div>

            <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
                <div className="px-5 py-4 border-b border-gray-100 bg-sky-50/40 flex items-center gap-3">
                    <FaCalendarAlt className="text-sky-600" />
                    <span className="text-sm font-black text-gray-700">Month: {month}</span>
                </div>

                <div className="overflow-x-auto">
                    <table className="min-w-full text-left">
                        <thead>
                            <tr className="bg-gray-50">
                                <th className="p-4 text-[10px] font-black uppercase tracking-widest">Emp ID</th>
                                <th className="p-4 text-[10px] font-black uppercase tracking-widest">Name</th>
                                <th className="p-4 text-[10px] font-black uppercase tracking-widest">Role</th>
                                <th className="p-4 text-[10px] font-black uppercase tracking-widest text-center">LOP</th>
                                <th className="p-4 text-[10px] font-black uppercase tracking-widest text-center">OD</th>
                                <th className="p-4 text-[10px] font-black uppercase tracking-widest text-center">CL</th>
                                <th className="p-4 text-[10px] font-black uppercase tracking-widest text-center">ML</th>
                                <th className="p-4 text-[10px] font-black uppercase tracking-widest text-center">Comp Leave</th>
                                <th className="p-4 text-[10px] font-black uppercase tracking-widest text-center">Total Leave</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan={9} className="p-8 text-center text-sm font-bold text-gray-400">Loading monthly summary...</td>
                                </tr>
                            ) : rows.length === 0 ? (
                                <tr>
                                    <td colSpan={9} className="p-8 text-center text-sm font-bold text-gray-400">No records found for selected month.</td>
                                </tr>
                            ) : (
                                rows.map((rec) => (
                                    <tr key={rec.emp_id} className="border-t border-gray-50 hover:bg-sky-50/30">
                                        <td className="p-4 text-sm font-black text-sky-700">{rec.emp_id}</td>
                                        <td className="p-4 text-sm font-bold text-gray-700">{rec.name}</td>
                                        <td className="p-4 text-[10px] font-black uppercase text-gray-400">{rec.role}</td>
                                        <td className="p-4 text-sm font-black text-center text-rose-700">{formatCount(rec.total_lop)}</td>
                                        <td className="p-4 text-sm font-black text-center text-amber-600">{formatCount(rec.total_od)}</td>
                                        <td className="p-4 text-sm font-black text-center text-amber-500">{formatCount(rec.total_cl)}</td>
                                        <td className="p-4 text-sm font-black text-center text-orange-500">{formatCount(rec.total_ml)}</td>
                                        <td className="p-4 text-sm font-black text-center text-violet-600">{formatCount(rec.total_comp)}</td>
                                        <td className="p-4 text-sm font-black text-center text-sky-600">{formatCount(rec.total_leave)}</td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </Layout>
    );
};

export default AttendanceMonthlySummaryPage;
