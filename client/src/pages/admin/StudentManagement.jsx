import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Layout from '../../components/Layout';
import api from '../../utils/api';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    FaUserGraduate, FaPlus, FaSearch, FaFilter, FaEdit, 
    FaTrash, FaBuilding, FaIdCard, FaPhone, FaEnvelope, 
    FaGraduationCap, FaUserCheck, FaCalendarAlt, FaSync 
} from 'react-icons/fa';
import Swal from 'sweetalert2';

const StudentManagement = () => {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const initialDeptId = searchParams.get('department_id') || searchParams.get('dept') || '';

    const [students, setStudents] = useState([]);
    const [departments, setDepartments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [selectedDept, setSelectedDept] = useState(initialDeptId);
    const [selectedYear, setSelectedYear] = useState('');
    const [selectedSem, setSelectedSem] = useState('');
    const [selectedSection, setSelectedSection] = useState('');

    useEffect(() => {
        const deptId = searchParams.get('department_id') || searchParams.get('dept');
        if (deptId !== null) {
            setSelectedDept(deptId);
        }
    }, [searchParams]);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const queryParams = new URLSearchParams();
            if (selectedDept) queryParams.append('department_id', selectedDept);
            if (selectedYear) queryParams.append('academic_year', selectedYear);
            if (selectedSem) queryParams.append('semester', selectedSem);
            if (selectedSection) queryParams.append('section', selectedSection);
            if (search) queryParams.append('search', search);

            const [studRes, deptRes] = await Promise.all([
                api.get(`/students?${queryParams.toString()}`),
                api.get('/departments')
            ]);

            setStudents(studRes.data || []);
            setDepartments(deptRes.data || []);
        } catch (error) {
            console.error('Error loading students:', error);
        } finally {
            setLoading(false);
        }
    }, [selectedDept, selectedYear, selectedSem, selectedSection, search]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleDelete = async (student) => {
        const result = await Swal.fire({
            title: 'Delete Student Record?',
            text: `Are you sure you want to remove ${student.name} (${student.reg_no})? This action cannot be undone.`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#ef4444',
            cancelButtonColor: '#64748b',
            confirmButtonText: 'Yes, Delete Student'
        });

        if (result.isConfirmed) {
            try {
                await api.delete(`/students/${student.user_id || student.reg_no}`);
                Swal.fire('Deleted!', 'Student record has been removed.', 'success');
                fetchData();
            } catch (err) {
                Swal.fire('Error', err?.response?.data?.message || 'Failed to delete student', 'error');
            }
        }
    };

    // Calculate metrics
    const totalStudents = students.length;
    const year1Count = students.filter(s => Number(s.academic_year) === 1).length;
    const year2Count = students.filter(s => Number(s.academic_year) === 2).length;
    const year3Count = students.filter(s => Number(s.academic_year) === 3).length;
    const year4Count = students.filter(s => Number(s.academic_year) === 4).length;

    return (
        <Layout title="Student Management Portal">
            <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
                
                {/* Top Header */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                        <h1 className="text-3xl font-black text-gray-800 tracking-tight flex items-center gap-3">
                            Student Management
                        </h1>
                    </div>
                    <button
                        onClick={() => navigate('/admin/students/new')}
                        className="bg-sky-600 hover:bg-sky-700 text-white font-bold px-6 py-3.5 rounded-2xl shadow-lg shadow-sky-100 hover:shadow-xl transition-all duration-300 flex items-center gap-2 text-sm shrink-0 active:scale-95"
                    >
                        <FaPlus /> Add Student
                    </button>
                </div>

                {/* Metrics Cards */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 md:gap-4">
                    <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex flex-col">
                        <span className="text-[10px] font-black uppercase tracking-wider text-gray-400">Total Students</span>
                        <span className="text-2xl font-black text-gray-800 mt-1">{totalStudents}</span>
                    </div>
                    <div className="bg-white p-4 rounded-2xl border border-sky-100 shadow-sm flex flex-col">
                        <span className="text-[10px] font-black uppercase tracking-wider text-sky-600">1st Year</span>
                        <span className="text-2xl font-black text-sky-700 mt-1">{year1Count}</span>
                    </div>
                    <div className="bg-white p-4 rounded-2xl border border-indigo-100 shadow-sm flex flex-col">
                        <span className="text-[10px] font-black uppercase tracking-wider text-indigo-600">2nd Year</span>
                        <span className="text-2xl font-black text-indigo-700 mt-1">{year2Count}</span>
                    </div>
                    <div className="bg-white p-4 rounded-2xl border border-purple-100 shadow-sm flex flex-col">
                        <span className="text-[10px] font-black uppercase tracking-wider text-purple-600">3rd Year</span>
                        <span className="text-2xl font-black text-purple-700 mt-1">{year3Count}</span>
                    </div>
                    <div className="bg-white p-4 rounded-2xl border border-emerald-100 shadow-sm flex flex-col col-span-2 md:col-span-1">
                        <span className="text-[10px] font-black uppercase tracking-wider text-emerald-600">4th Year</span>
                        <span className="text-2xl font-black text-emerald-700 mt-1">{year4Count}</span>
                    </div>
                </div>

                {/* Search & Filter Bar */}
                <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                        
                        {/* Search Input */}
                        <div className="relative lg:col-span-2">
                            <FaSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm" />
                            <input
                                type="text"
                                placeholder="Search by name, reg no, roll no..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:border-sky-500 transition-colors"
                            />
                        </div>

                        {/* Department Filter */}
                        <div>
                            <select
                                value={selectedDept}
                                onChange={(e) => {
                                    const val = e.target.value;
                                    setSelectedDept(val);
                                    if (val) {
                                        setSearchParams(prev => {
                                            const newParams = new URLSearchParams(prev);
                                            newParams.set('department_id', val);
                                            return newParams;
                                        });
                                    } else {
                                        setSearchParams(prev => {
                                            const newParams = new URLSearchParams(prev);
                                            newParams.delete('department_id');
                                            return newParams;
                                        });
                                    }
                                }}
                                className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:border-sky-500 transition-colors"
                            >
                                <option value="">All Departments</option>
                                {departments.map(d => (
                                    <option key={d.id} value={d.id}>{d.name}</option>
                                ))}
                            </select>
                        </div>

                        {/* Year Filter */}
                        <div>
                            <select
                                value={selectedYear}
                                onChange={(e) => {
                                    const yr = e.target.value;
                                    setSelectedYear(yr);
                                    if (yr === '1' && !['1', '2'].includes(String(selectedSem))) setSelectedSem('');
                                    else if (yr === '2' && !['3', '4'].includes(String(selectedSem))) setSelectedSem('');
                                    else if (yr === '3' && !['5', '6'].includes(String(selectedSem))) setSelectedSem('');
                                    else if (yr === '4' && !['7', '8'].includes(String(selectedSem))) setSelectedSem('');
                                }}
                                className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:border-sky-500 transition-colors"
                            >
                                <option value="">All Academic Years</option>
                                <option value="1">1st Year</option>
                                <option value="2">2nd Year</option>
                                <option value="3">3rd Year</option>
                                <option value="4">4th Year</option>
                            </select>
                        </div>

                        {/* Semester Filter */}
                        <div>
                            <select
                                value={selectedSem}
                                onChange={(e) => setSelectedSem(e.target.value)}
                                className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:border-sky-500 transition-colors"
                            >
                                <option value="">All Semesters</option>
                                {(selectedYear === '1' ? [1, 2] :
                                  selectedYear === '2' ? [3, 4] :
                                  selectedYear === '3' ? [5, 6] :
                                  selectedYear === '4' ? [7, 8] :
                                  [1, 2, 3, 4, 5, 6, 7, 8]).map(s => (
                                    <option key={s} value={s}>Semester {s}</option>
                                ))}
                            </select>
                        </div>

                    </div>
                </div>

                {/* Students List Table */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    {loading ? (
                        <div className="p-12 text-center text-gray-400">
                            <div className="w-8 h-8 border-4 border-sky-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                            Loading students...
                        </div>
                    ) : students.length === 0 ? (
                        <div className="p-12 text-center text-gray-400 space-y-3">
                            <FaUserGraduate className="text-4xl text-gray-300 mx-auto" />
                            <p className="font-semibold text-gray-600">No students found matching your criteria</p>
                            <button
                                onClick={() => { setSearch(''); setSelectedDept(''); setSelectedYear(''); setSelectedSem(''); }}
                                className="text-xs text-sky-600 hover:underline font-bold"
                            >
                                Clear Filters
                            </button>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-gray-50 text-gray-400 uppercase text-[10px] font-black tracking-wider border-b border-gray-100">
                                    <tr>
                                        <th className="py-4 px-6">Student Info</th>
                                        <th className="py-4 px-4">Reg No / Roll No</th>
                                        <th className="py-4 px-4">Department</th>
                                        <th className="py-4 px-4">Year / Sem</th>
                                        <th className="py-4 px-4">Parent / Contact</th>
                                        <th className="py-4 px-6 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {students.map((student) => (
                                        <tr key={student.student_table_id || student.user_id} className="hover:bg-gray-50/80 transition-colors">
                                            <td className="py-4 px-6">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-sky-500 to-indigo-600 text-white font-bold flex items-center justify-center text-sm shadow-sm overflow-hidden shrink-0">
                                                        {student.profile_pic ? (
                                                            <img src={student.profile_pic} alt={student.name} className="w-full h-full object-cover" />
                                                        ) : (
                                                            student.name?.charAt(0)?.toUpperCase() || 'S'
                                                        )}
                                                    </div>
                                                    <div>
                                                        <p className="font-bold text-gray-800 leading-snug">{student.name}</p>
                                                        <p className="text-xs text-gray-400 flex items-center gap-1">
                                                            <FaEnvelope className="text-[10px]" /> {student.email || 'No email registered'}
                                                        </p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="py-4 px-4 font-mono font-semibold text-gray-700">
                                                <div>{student.reg_no}</div>
                                                {student.roll_no && student.roll_no !== student.reg_no && (
                                                    <div className="text-xs text-gray-400">Roll: {student.roll_no}</div>
                                                )}
                                            </td>
                                            <td className="py-4 px-4">
                                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-sky-50 text-sky-700 border border-sky-100">
                                                    <FaBuilding className="text-[10px]" /> {student.department_name || 'Unassigned'}
                                                </span>
                                            </td>
                                            <td className="py-4 px-4">
                                                <div className="text-xs font-bold text-gray-800">Year {student.academic_year}</div>
                                                <div className="text-[11px] text-gray-400">Semester {student.semester} ({student.section || 'A'})</div>
                                            </td>
                                            <td className="py-4 px-4 text-xs text-gray-600">
                                                {student.parent_name && <div className="font-semibold">{student.parent_name}</div>}
                                                {student.parent_phone && (
                                                    <div className="text-gray-400 flex items-center gap-1 mt-0.5">
                                                        <FaPhone className="text-[9px]" /> {student.parent_phone}
                                                    </div>
                                                )}
                                                {!student.parent_name && !student.parent_phone && <span className="text-gray-300">-</span>}
                                            </td>
                                            <td className="py-4 px-6 text-right space-x-2">
                                                <button
                                                    onClick={() => navigate(`/admin/students/edit/${student.user_id || student.student_table_id}`)}
                                                    className="p-2 text-sky-600 hover:bg-sky-50 rounded-lg transition-colors"
                                                    title="Edit Student"
                                                >
                                                    <FaEdit />
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(student)}
                                                    className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                                    title="Delete Student"
                                                >
                                                    <FaTrash />
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

export default StudentManagement;
