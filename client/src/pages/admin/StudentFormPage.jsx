import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Layout from '../../components/Layout';
import api from '../../utils/api';
import Swal from 'sweetalert2';
import { FaUserGraduate, FaArrowLeft, FaSave, FaIdCard, FaBuilding, FaPhone, FaEnvelope, FaKey, FaCalendarAlt, FaUserCheck } from 'react-icons/fa';

const StudentFormPage = () => {
    const navigate = useNavigate();
    const { id } = useParams();
    const isEdit = Boolean(id);

    const [departments, setDepartments] = useState([]);
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    const [formData, setFormData] = useState({
        name: '',
        reg_no: '',
        roll_no: '',
        email: '',
        department_id: '',
        academic_year: '1',
        semester: '1',
        section: 'A',
        batch: `${new Date().getFullYear()}-${new Date().getFullYear() + 4}`,
        gender: 'Male',
        dob: '',
        mobile: '',
        parent_name: '',
        parent_phone: '',
        pin: '1234'
    });

    useEffect(() => {
        const loadInitialData = async () => {
            setLoading(true);
            try {
                const { data: deptList } = await api.get('/departments');
                setDepartments(deptList || []);

                if (deptList.length > 0 && !formData.department_id) {
                    setFormData(prev => ({ ...prev, department_id: deptList[0].id }));
                }

                if (isEdit) {
                    const { data: studData } = await api.get(`/students/${id}`);
                    if (studData) {
                        setFormData({
                            name: studData.name || '',
                            reg_no: studData.reg_no || '',
                            roll_no: studData.roll_no || '',
                            email: studData.email || '',
                            department_id: studData.department_id || (deptList[0]?.id || ''),
                            academic_year: String(studData.academic_year || '1'),
                            semester: String(studData.semester || '1'),
                            section: studData.section || 'A',
                            batch: studData.batch || `${new Date().getFullYear()}-${new Date().getFullYear() + 4}`,
                            gender: studData.gender || 'Male',
                            dob: studData.dob ? String(studData.dob).slice(0, 10) : '',
                            mobile: studData.mobile || '',
                            parent_name: studData.parent_name || '',
                            parent_phone: studData.parent_phone || '',
                            pin: studData.pin || '1234'
                        });
                    }
                }
            } catch (err) {
                console.error('Error loading data:', err);
                Swal.fire('Error', 'Failed to load student form data', 'error');
            } finally {
                setLoading(false);
            }
        };

        loadInitialData();
    }, [id, isEdit]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        if (name === 'academic_year') {
            const defaultSem = value === '1' ? '1' : value === '2' ? '3' : value === '3' ? '5' : '7';
            setFormData(prev => ({ ...prev, [name]: value, semester: defaultSem }));
        } else {
            setFormData(prev => ({ ...prev, [name]: value }));
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.name || !formData.reg_no) {
            return Swal.fire('Warning', 'Please enter Student Name and Register Number', 'warning');
        }

        setSubmitting(true);
        try {
            if (isEdit) {
                await api.put(`/students/${id}`, formData);
                Swal.fire('Success', 'Student details updated successfully!', 'success');
            } else {
                await api.post('/students', formData);
                Swal.fire('Success', 'New student registered successfully!', 'success');
            }
            navigate('/admin/students');
        } catch (err) {
            console.error('Error saving student:', err);
            Swal.fire('Error', err?.response?.data?.message || 'Failed to save student details', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Layout title={isEdit ? 'Edit Student Record' : 'Register New Student'}>
            <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto space-y-8 w-full">
                
                {/* Full Width Top Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 pb-6">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => navigate('/admin/students')}
                            className="h-12 w-12 rounded-2xl bg-white border border-gray-100 flex items-center justify-center text-gray-500 hover:text-sky-600 hover:border-sky-200 transition-all shadow-sm shrink-0 active:scale-95"
                            title="Back to Students List"
                        >
                            <FaArrowLeft size={16} />
                        </button>
                        <div>
                            <span className="text-[10px] font-black text-sky-600 uppercase tracking-widest bg-sky-50 px-3 py-1 rounded-full">
                                Student Registration Portal
                            </span>
                            <h1 className="text-3xl font-black text-gray-800 tracking-tight mt-1 flex items-center gap-3">
                                {isEdit ? 'Edit Student Record' : 'Register New Student'}
                            </h1>
                        </div>
                    </div>
                </div>

                {loading ? (
                    <div className="p-16 text-center text-gray-400 bg-white rounded-3xl border border-gray-100 shadow-sm">
                        <div className="w-8 h-8 border-4 border-sky-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                        Loading student registration details...
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="space-y-8 w-full">
                        
                        {/* Section 1: Academic & Registration Info */}
                        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 md:p-8 space-y-6 w-full">
                            <div className="flex items-center justify-between border-b border-gray-100 pb-4">
                                <div>
                                    <h2 className="text-base font-black text-gray-800 flex items-center gap-2">
                                        <FaUserGraduate className="text-sky-600" /> Academic & Registration Information
                                    </h2>
                                    <p className="text-xs text-gray-400 mt-0.5">Define student name, register number, department allocation, and academic status.</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 mb-1.5">Full Name *</label>
                                    <input
                                        type="text"
                                        name="name"
                                        value={formData.name}
                                        onChange={handleChange}
                                        placeholder="e.g. John Doe"
                                        required
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:border-sky-500 focus:ring-4 focus:ring-sky-100 transition-all font-semibold"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-gray-700 mb-1.5">Register Number *</label>
                                    <input
                                        type="text"
                                        name="reg_no"
                                        value={formData.reg_no}
                                        onChange={handleChange}
                                        placeholder="e.g. 711522104001"
                                        disabled={isEdit}
                                        required
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:border-sky-500 focus:ring-4 focus:ring-sky-100 transition-all font-semibold font-mono disabled:opacity-60"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-gray-700 mb-1.5">Roll Number</label>
                                    <input
                                        type="text"
                                        name="roll_no"
                                        value={formData.roll_no}
                                        onChange={handleChange}
                                        placeholder="e.g. 22CSE01"
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:border-sky-500 focus:ring-4 focus:ring-sky-100 transition-all font-semibold font-mono"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-gray-700 mb-1.5">Department</label>
                                    <select
                                        name="department_id"
                                        value={formData.department_id}
                                        onChange={handleChange}
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:border-sky-500 focus:ring-4 focus:ring-sky-100 transition-all font-semibold"
                                    >
                                        {departments.map(d => (
                                            <option key={d.id} value={d.id}>{d.name}</option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-gray-700 mb-1.5">Academic Year</label>
                                    <select
                                        name="academic_year"
                                        value={formData.academic_year}
                                        onChange={handleChange}
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:border-sky-500 focus:ring-4 focus:ring-sky-100 transition-all font-semibold"
                                    >
                                        <option value="1">1st Year</option>
                                        <option value="2">2nd Year</option>
                                        <option value="3">3rd Year</option>
                                        <option value="4">4th Year</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-gray-700 mb-1.5">Current Semester</label>
                                    <select
                                        name="semester"
                                        value={formData.semester}
                                        onChange={handleChange}
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:border-sky-500 focus:ring-4 focus:ring-sky-100 transition-all font-semibold"
                                    >
                                        {(formData.academic_year === '1' ? [1, 2] :
                                          formData.academic_year === '2' ? [3, 4] :
                                          formData.academic_year === '3' ? [5, 6] :
                                          formData.academic_year === '4' ? [7, 8] :
                                          [1, 2, 3, 4, 5, 6, 7, 8]).map(s => (
                                            <option key={s} value={s}>Semester {s}</option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-gray-700 mb-1.5">Section</label>
                                    <input
                                        type="text"
                                        name="section"
                                        value={formData.section}
                                        onChange={handleChange}
                                        placeholder="e.g. A"
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:border-sky-500 focus:ring-4 focus:ring-sky-100 transition-all font-semibold"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-gray-700 mb-1.5">Batch</label>
                                    <input
                                        type="text"
                                        name="batch"
                                        value={formData.batch}
                                        onChange={handleChange}
                                        placeholder="e.g. 2022-2026"
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:border-sky-500 focus:ring-4 focus:ring-sky-100 transition-all font-semibold"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Section 2: Contact, Personal & Portal Credentials */}
                        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 md:p-8 space-y-6 w-full">
                            <div className="flex items-center justify-between border-b border-gray-100 pb-4">
                                <div>
                                    <h2 className="text-base font-black text-gray-800 flex items-center gap-2">
                                        <FaIdCard className="text-sky-600" /> Contact, Personal & Login Credentials
                                    </h2>
                                    <p className="text-xs text-gray-400 mt-0.5">Provide student email, phone, parent details, gender, and portal authentication PIN.</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 mb-1.5">Student Email Address</label>
                                    <input
                                        type="email"
                                        name="email"
                                        value={formData.email}
                                        onChange={handleChange}
                                        placeholder="student@ppg.edu.in"
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:border-sky-500 focus:ring-4 focus:ring-sky-100 transition-all font-semibold"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-gray-700 mb-1.5">Mobile Number</label>
                                    <input
                                        type="tel"
                                        name="mobile"
                                        value={formData.mobile}
                                        onChange={handleChange}
                                        placeholder="9876543210"
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:border-sky-500 focus:ring-4 focus:ring-sky-100 transition-all font-semibold"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-gray-700 mb-1.5">Gender</label>
                                    <select
                                        name="gender"
                                        value={formData.gender}
                                        onChange={handleChange}
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:border-sky-500 focus:ring-4 focus:ring-sky-100 transition-all font-semibold"
                                    >
                                        <option value="Male">Male</option>
                                        <option value="Female">Female</option>
                                        <option value="Other">Other</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-gray-700 mb-1.5">Date of Birth</label>
                                    <input
                                        type="date"
                                        name="dob"
                                        value={formData.dob}
                                        onChange={handleChange}
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:border-sky-500 focus:ring-4 focus:ring-sky-100 transition-all font-semibold"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-gray-700 mb-1.5">Parent / Guardian Name</label>
                                    <input
                                        type="text"
                                        name="parent_name"
                                        value={formData.parent_name}
                                        onChange={handleChange}
                                        placeholder="Father/Mother/Guardian"
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:border-sky-500 focus:ring-4 focus:ring-sky-100 transition-all font-semibold"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-gray-700 mb-1.5">Parent Phone Number</label>
                                    <input
                                        type="tel"
                                        name="parent_phone"
                                        value={formData.parent_phone}
                                        onChange={handleChange}
                                        placeholder="Emergency Contact Phone"
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:border-sky-500 focus:ring-4 focus:ring-sky-100 transition-all font-semibold"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-gray-700 mb-1.5">Portal Login PIN</label>
                                    <input
                                        type="text"
                                        name="pin"
                                        value={formData.pin}
                                        onChange={handleChange}
                                        placeholder="4-digit PIN (Default: 1234)"
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:border-sky-500 focus:ring-4 focus:ring-sky-100 transition-all font-semibold font-mono"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Submit Action Bar */}
                        <div className="flex items-center justify-end gap-4 pt-4">
                            <button
                                type="button"
                                onClick={() => navigate('/admin/students')}
                                className="px-6 py-3 rounded-2xl text-sm font-bold text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 transition-colors shadow-sm active:scale-95"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={submitting}
                                className="px-8 py-3 rounded-2xl text-sm font-bold text-white bg-sky-600 hover:bg-sky-700 shadow-lg shadow-sky-100 hover:shadow-xl transition-all flex items-center gap-2 active:scale-95"
                            >
                                <FaSave /> {submitting ? 'Saving Student...' : isEdit ? 'Update Student Record' : 'Register Student'}
                            </button>
                        </div>

                    </form>
                )}

            </div>
        </Layout>
    );
};

export default StudentFormPage;
