import { useState, useEffect, useMemo } from 'react';
import Layout from '../../components/Layout';
import api from '../../utils/api';
import { FaSearch, FaUser, FaCalendarAlt, FaEdit, FaSave, FaTimes, FaArrowLeft, FaClock } from 'react-icons/fa';
import { motion, AnimatePresence } from 'framer-motion';
import Swal from 'sweetalert2';
import { formatTo12Hr } from '../../utils/timeFormatter';
import AttendanceHistory from '../../components/AttendanceHistory';

const AccountsAttendancePage = () => {
    const [employees, setEmployees] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedEmp, setSelectedEmp] = useState(null);
    const [loading, setLoading] = useState(true);
    
    // For detail view
    const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
    const [editingPunch, setEditingPunch] = useState(null); // { id, in_time, out_time, status, remarks, date }
    const [isUpdating, setIsUpdating] = useState(false);

    useEffect(() => {
        const fetchEmployees = async () => {
            try {
                const { data } = await api.get('/users');
                // Filter for staff, hod, principal and sort ascending
                const filtered = data
                    .filter(u => ['staff', 'hod', 'principal'].includes(u.role))
                    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
                setEmployees(filtered);
            } catch (error) {
                console.error(error);
            } finally {
                setLoading(false);
            }
        };
        fetchEmployees();
    }, []);

    const filteredEmployees = useMemo(() => {
        if (!searchTerm) return employees;
        const low = searchTerm.toLowerCase();
        return employees.filter(e => 
            (e.name || '').toLowerCase().includes(low) || 
            (e.emp_id || '').toLowerCase().includes(low)
        );
    }, [employees, searchTerm]);

    const handleUpdateAttendance = async (e) => {
        e.preventDefault();
        if (!editingPunch) return;
        
        setIsUpdating(true);
        try {
            await api.put(`/attendance/${editingPunch.id}`, {
                in_time: editingPunch.in_time,
                out_time: editingPunch.out_time,
                status: editingPunch.status,
                remarks: editingPunch.remarks
            });
            
            Swal.fire({
                icon: 'success',
                title: 'Updated',
                text: 'Attendance record updated successfully.',
                timer: 1500,
                showConfirmButton: false
            });
            setEditingPunch(null);
            // The AttendanceHistory component will auto-refresh via Socket.io
        } catch (error) {
            console.error(error);
            Swal.fire('Error', 'Failed to update attendance', 'error');
        } finally {
            setIsUpdating(false);
        }
    };

    if (loading) return (
        <Layout>
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="h-12 w-12 border-4 border-sky-100 border-t-sky-600 rounded-full animate-spin" />
            </div>
        </Layout>
    );

    return (
        <Layout>
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <AnimatePresence mode="wait">
                    {!selectedEmp ? (
                        <motion.div
                            key="list"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                        >
                            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
                                <div>
                                    <h1 className="text-3xl font-black text-gray-800 tracking-tight">Accounts <span className="text-sky-600">Attendance Manager</span></h1>
                                    <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-1">Select an employee to manage attendance</p>
                                </div>
                                <div className="relative w-full md:w-96">
                                    <FaSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                                    <input 
                                        type="text"
                                        placeholder="Search by name or employee ID..."
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        className="w-full pl-12 pr-4 py-4 bg-white border border-gray-100 rounded-[20px] shadow-sm focus:ring-4 focus:ring-sky-50 focus:border-sky-500 outline-none transition-all font-bold text-gray-700"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                                {filteredEmployees.map((emp) => (
                                    <motion.div
                                        key={emp.id}
                                        whileHover={{ y: -5 }}
                                        onClick={() => setSelectedEmp(emp)}
                                        className="bg-white p-6 rounded-[32px] border border-gray-50 shadow-xl shadow-sky-500/5 hover:shadow-sky-500/10 transition-all cursor-pointer group"
                                    >
                                        <div className="flex items-center gap-4">
                                            <div className="h-16 w-16 rounded-2xl bg-sky-50 text-sky-600 flex items-center justify-center text-2xl font-black shadow-inner group-hover:bg-sky-600 group-hover:text-white transition-all">
                                                {emp.name?.[0]?.toUpperCase() || <FaUser />}
                                            </div>
                                            <div>
                                                <h3 className="text-lg font-black text-gray-800 tracking-tight group-hover:text-sky-600 transition-colors">{emp.name}</h3>
                                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{emp.emp_id}</p>
                                                <span className="inline-block mt-2 px-3 py-1 bg-gray-50 text-gray-400 text-[9px] font-black uppercase tracking-widest rounded-full group-hover:bg-sky-50 group-hover:text-sky-600 transition-colors">
                                                    {emp.role}
                                                </span>
                                            </div>
                                        </div>
                                    </motion.div>
                                ))}
                            </div>
                        </motion.div>
                    ) : (
                        <motion.div
                            key="detail"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                        >
                            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-6">
                                <div className="flex items-center gap-6">
                                    <button 
                                        onClick={() => setSelectedEmp(null)}
                                        className="h-14 w-14 rounded-2xl bg-white border border-gray-100 flex items-center justify-center text-gray-400 hover:text-sky-600 transition-all shadow-xl shadow-sky-500/5 hover:-translate-x-1"
                                    >
                                        <FaArrowLeft size={18} />
                                    </button>
                                    <div>
                                        <h1 className="text-3xl font-black text-gray-800 tracking-tight">{selectedEmp.name}</h1>
                                        <div className="flex items-center gap-3 mt-1">
                                            <span className="text-xs font-black text-sky-600 uppercase tracking-widest">{selectedEmp.emp_id}</span>
                                            <span className="h-1 w-1 bg-gray-300 rounded-full"></span>
                                            <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">{selectedEmp.role}</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-4">
                                    <div className="relative">
                                        <FaCalendarAlt className="absolute left-4 top-1/2 -translate-y-1/2 text-sky-500" />
                                        <input 
                                            type="month"
                                            value={selectedMonth}
                                            onChange={(e) => setSelectedMonth(e.target.value)}
                                            className="pl-12 pr-6 py-4 bg-white border border-gray-100 rounded-2xl shadow-sm focus:ring-4 focus:ring-sky-50 outline-none transition-all font-black text-gray-700 text-sm"
                                        />
                                    </div>
                                </div>
                            </div>

                            <AttendanceHistory 
                                empId={selectedEmp.emp_id} 
                                month={selectedMonth}
                                recentOnly={false}
                                onEditRecord={(record) => setEditingPunch({
                                    id: record.record_id || record.id,
                                    in_time: record.in_time ? record.in_time.slice(0, 5) : '',
                                    out_time: record.out_time ? record.out_time.slice(0, 5) : '',
                                    status: record.status,
                                    remarks: record.remarks,
                                    date: record.date
                                })}
                            />
                            
                            {/* Override the table rows in AttendanceHistory or implement a separate list here */}
                            <div className="mt-8 bg-amber-50 p-6 rounded-3xl border border-amber-100">
                                <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest mb-2 flex items-center gap-2">
                                    <FaClock /> Note for Accounts
                                </p>
                                <p className="text-xs text-amber-800 font-medium leading-relaxed">
                                    You can edit any attendance record by clicking on it in the list above. Updating the In/Out times will automatically recalculate total hours and mark the status as 'Present' if it was previously marked as Absent or Unpaid.
                                </p>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Edit Punch Modal */}
                <AnimatePresence>
                    {editingPunch && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
                        >
                            <motion.div
                                initial={{ scale: 0.95, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                className="bg-white rounded-[40px] shadow-2xl w-full max-w-md overflow-hidden border border-gray-100"
                            >
                                <div className="bg-sky-600 px-8 py-8 text-white">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-4">
                                            <div className="h-12 w-12 rounded-2xl bg-white/20 flex items-center justify-center">
                                                <FaEdit size={24} />
                                            </div>
                                            <div>
                                                <h2 className="text-2xl font-black tracking-tight">Edit Attendance</h2>
                                                <p className="text-[10px] font-black text-sky-100 uppercase tracking-widest mt-1">
                                                    {new Date(editingPunch.date).toLocaleDateString('en-US', { day: '2-digit', month: 'long', year: 'numeric' })}
                                                </p>
                                            </div>
                                        </div>
                                        <button onClick={() => setEditingPunch(null)} className="p-2 hover:bg-white/20 rounded-xl transition-colors">
                                            <FaTimes size={20} />
                                        </button>
                                    </div>
                                </div>

                                <form onSubmit={handleUpdateAttendance} className="p-8 space-y-6">
                                    <div className="grid grid-cols-2 gap-6">
                                        <div>
                                            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 ml-1">Punch In</label>
                                            <input 
                                                type="time"
                                                value={editingPunch.in_time || ''}
                                                onChange={(e) => setEditingPunch({ ...editingPunch, in_time: e.target.value })}
                                                className="w-full p-4 bg-gray-50 border border-gray-100 rounded-2xl outline-none focus:ring-4 focus:ring-sky-100 focus:border-sky-500 transition-all font-bold text-gray-700"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 ml-1">Punch Out</label>
                                            <input 
                                                type="time"
                                                value={editingPunch.out_time || ''}
                                                onChange={(e) => setEditingPunch({ ...editingPunch, out_time: e.target.value })}
                                                className="w-full p-4 bg-gray-50 border border-gray-100 rounded-2xl outline-none focus:ring-4 focus:ring-sky-100 focus:border-sky-500 transition-all font-bold text-gray-700"
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 ml-1">Current Status</label>
                                        <select 
                                            value={editingPunch.status}
                                            onChange={(e) => setEditingPunch({ ...editingPunch, status: e.target.value })}
                                            className="w-full p-4 bg-gray-50 border border-gray-100 rounded-2xl outline-none focus:ring-4 focus:ring-sky-100 focus:border-sky-500 transition-all font-bold text-gray-700 appearance-none"
                                        >
                                            <option value="Present">Present</option>
                                            <option value="Absent">Absent</option>
                                            <option value="Unpaid">Unpaid</option>
                                            <option value="OD">On Duty</option>
                                            <option value="CL">Casual Leave</option>
                                            <option value="ML">Medical Leave</option>
                                            <option value="Comp Leave">Comp Leave</option>
                                            <option value="Holiday">Holiday</option>
                                        </select>
                                    </div>

                                    <div>
                                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 ml-1">Remarks</label>
                                        <textarea 
                                            value={editingPunch.remarks || ''}
                                            onChange={(e) => setEditingPunch({ ...editingPunch, remarks: e.target.value })}
                                            rows={3}
                                            placeholder="Reason for manual edit..."
                                            className="w-full p-4 bg-gray-50 border border-gray-100 rounded-2xl outline-none focus:ring-4 focus:ring-sky-100 focus:border-sky-500 transition-all font-bold text-gray-700 resize-none"
                                        />
                                    </div>

                                    <div className="flex gap-4 pt-2">
                                        <button 
                                            type="button"
                                            onClick={() => setEditingPunch(null)}
                                            className="flex-1 py-4 border border-gray-100 text-gray-400 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-gray-50 transition-all"
                                        >
                                            Cancel
                                        </button>
                                        <button 
                                            type="submit"
                                            disabled={isUpdating}
                                            className="flex-1 py-4 bg-sky-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-sky-700 transition-all shadow-xl shadow-sky-100 flex items-center justify-center gap-3 disabled:opacity-50"
                                        >
                                            {isUpdating ? (
                                                <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                            ) : (
                                                <FaSave />
                                            )}
                                            {isUpdating ? 'Saving...' : 'Save Changes'}
                                        </button>
                                    </div>
                                </form>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </Layout>
    );
};

export default AccountsAttendancePage;
