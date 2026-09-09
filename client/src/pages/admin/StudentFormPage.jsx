import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Layout from '../../components/Layout';
import api from '../../utils/api';
import Swal from 'sweetalert2';
import { FaUserGraduate, FaArrowLeft, FaSave, FaIdCard, FaBuilding, FaPhone, FaEnvelope, FaKey } from 'react-icons/fa';

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
        setFormData(prev => ({ ...prev, [name]: value }));
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
        <Layout title={isEdit ? 'Edit Student' : 'Add New Student'}>
            <div className="p-4 md:p-6 lg:p-8 max-w-4xl mx-auto space-y-6">
                
                {/* Header */}
                <div className="flex items-center justify-between">
                    <button
                        onClick={() => navigate('/admin/students')}
                        className="text-sm text-gray-500 hover:text-sky-600 flex items-center gap-2 font-semibold transition-colors"
                    >
                        <FaArrowLeft /> Back to Students List
                    </button>
                    <h1 className="text-xl font-black text-gray-800 flex items-center gap-2">
                        <FaUserGraduate className="text-sky-600" /> {isEdit ? 'Edit Student Record' : 'Register New Student'}
                    </h1>
                </div>

                {loading ? (
                    <div className="p-12 text-center text-gray-400">Loading student form...</div>
                ) : (
                    <form onSubmit={handleSubmit} className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 md:p-8 space-y-6">
                        
                        {/* Section 1: Academic & Identity */}
                        <div className="space-y-4">
                            <h2 className="text-xs font-black uppercase tracking-wider text-sky-600 border-b border-gray-100 pb-2">
                                1. Academic & Registration Info
                            </h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 mb-1">Full Name *</label>
                                    <input
                                        type="text"
                                        name="name"
                                        value={formData.name}
                                        onChange={handleChange}
                                        placeholder="e.g. John Doe"
                                        required
                                        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:border-sky-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 mb-1">Register Number *</label>
                                    <input
                                        type="text"
                                        name="reg_no"
                                        value={formData.reg_no}
                                        onChange={handleChange}
                                        placeholder="e.g. 711522104001"
                                        disabled={isEdit}
                                        required
                                        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:border-sky-500 disabled:opacity-60"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 mb-1">Roll Number</label>
                                    <input
                                        type="text"
                                        name="roll_no"
                                        value={formData.roll_no}
                                        onChange={handleChange}
                                        placeholder="e.g. 22CSE01"
                                        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:border-sky-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 mb-1">Department</label>
                                    <select
                                        name="department_id"
                                        value={formData.department_id}
                                        onChange={handleChange}
                                        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:border-sky-500"
                                    >
                                        {departments.map(d => (
                                            <option key={d.id} value={d.id}>{d.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 mb-1">Academic Year</label>
                                    <select
                                        name="academic_year"
                                        value={formData.academic_year}
                                        onChange={handleChange}
                                        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:border-sky-500"
                                    >
                                        <option value="1">1st Year</option>
                                        <option value="2">2nd Year</option>
                                        <option value="3">3rd Year</option>
                                        <option value="4">4th Year</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 mb-1">Current Semester</label>
                                    <select
                                        name="semester"
                                        value={formData.semester}
                                        onChange={handleChange}
                                        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:border-sky-500"
                                    >
                                        {[1, 2, 3, 4, 5, 6, 7, 8].map(s => (
                                            <option key={s} value={s}>Semester {s}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 mb-1">Section</label>
                                    <input
                                        type="text"
                                        name="section"
                                        value={formData.section}
                                        onChange={handleChange}
                                        placeholder="e.g. A"
                                        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:border-sky-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 mb-1">Batch</label>
                                    <input
                                        type="text"
                                        name="batch"
                                        value={formData.batch}
                                        onChange={handleChange}
                                        placeholder="e.g. 2022-2026"
                                        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:border-sky-500"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Section 2: Contact & Login Credentials */}
                        <div className="space-y-4">
                            <h2 className="text-xs font-black uppercase tracking-wider text-sky-600 border-b border-gray-100 pb-2">
                                2. Contact & Student Credentials
                            </h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 mb-1">Student Email Address</label>
                                    <input
                                        type="email"
                                        name="email"
                                        value={formData.email}
                                        onChange={handleChange}
                                        placeholder="student@ppg.edu.in"
                                        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:border-sky-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 mb-1">Mobile Number</label>
                                    <input
                                        type="tel"
                                        name="mobile"
                                        value={formData.mobile}
                                        onChange={handleChange}
                                        placeholder="9876543210"
                                        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:border-sky-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 mb-1">Parent / Guardian Name</label>
                                    <input
                                        type="text"
                                        name="parent_name"
                                        value={formData.parent_name}
                                        onChange={handleChange}
                                        placeholder="Father/Mother/Guardian"
                                        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:border-sky-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 mb-1">Parent Phone Number</label>
                                    <input
                                        type="tel"
                                        name="parent_phone"
                                        value={formData.parent_phone}
                                        onChange={handleChange}
                                        placeholder="Emergency Phone"
                                        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:border-sky-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 mb-1">Gender</label>
                                    <select
                                        name="gender"
                                        value={formData.gender}
                                        onChange={handleChange}
                                        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:border-sky-500"
                                    >
                                        <option value="Male">Male</option>
                                        <option value="Female">Female</option>
                                        <option value="Other">Other</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 mb-1">Portal Login PIN</label>
                                    <input
                                        type="text"
                                        name="pin"
                                        value={formData.pin}
                                        onChange={handleChange}
                                        placeholder="4-digit PIN (Default: 1234)"
                                        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:border-sky-500 font-mono"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Submit Buttons */}
                        <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-100">
                            <button
                                type="button"
                                onClick={() => navigate('/admin/students')}
                                className="px-5 py-2.5 rounded-xl text-sm font-bold text-gray-500 hover:bg-gray-100 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={submitting}
                                className="px-6 py-2.5 rounded-xl text-sm font-bold text-white bg-sky-600 hover:bg-sky-700 shadow-md hover:shadow-lg transition-all flex items-center gap-2"
                            >
                                <FaSave /> {submitting ? 'Saving...' : isEdit ? 'Update Student' : 'Save Student'}
                            </button>
                        </div>

                    </form>
                )}

            </div>
        </Layout>
    );
};

export default StudentFormPage;
