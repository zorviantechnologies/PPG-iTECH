import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FaArrowLeft, FaSave, FaBuilding, FaProjectDiagram } from 'react-icons/fa';
import Layout from '../../components/Layout';
import api from '../../utils/api';
import Swal from 'sweetalert2';
import { motion } from 'framer-motion';

const inputClass = "w-full p-5 bg-gray-50 border border-gray-100 rounded-2xl outline-none focus:ring-4 focus:ring-sky-100 focus:border-sky-500 transition-all font-bold text-gray-700 text-lg";
const labelClass = "block text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-4 ml-1";

const DepartmentFormPage = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(id ? true : false);
    const [formData, setFormData] = useState({ name: '', code: '' });

    useEffect(() => {
        if (id) {
            fetchDepartment();
        }
    }, [id]);

    const fetchDepartment = async () => {
        try {
            const { data } = await api.get('/departments');
            const dept = data.find(d => String(d.id) === String(id));
            if (dept) {
                setFormData({ name: dept.name, code: dept.code });
            } else {
                Swal.fire('Error', 'Department not found', 'error');
                navigate('/admin/departments');
            }
            setLoading(false);
        } catch (error) {
            console.error(error);
            setLoading(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.name) {
            return Swal.fire('Incomplete', 'Please enter a department name', 'warning');
        }

        try {
            if (id) {
                await api.put(`/departments/${id}`, formData);
                Swal.fire({
                    title: 'Updated',
                    text: 'Department details have been synchronized.',
                    icon: 'success',
                    timer: 1500,
                    showConfirmButton: false
                });
            } else {
                await api.post('/departments', formData);
                Swal.fire({
                    title: 'Created',
                    text: 'New department node added to hierarchy.',
                    icon: 'success',
                    timer: 1500,
                    showConfirmButton: false
                });
            }
            navigate('/admin/departments');
            window.dispatchEvent(new CustomEvent('closeSidebar'));
        } catch (error) {
            Swal.fire('Failure', error.response?.data?.message || 'Operation failed', 'error');
        }
    };

    if (loading) return (
        <Layout>
            <div className="flex h-screen items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-sky-600"></div>
            </div>
        </Layout>
    );

    return (
        <Layout>
            <div className="max-w-3xl mx-auto py-10">
                <div className="mb-12 flex items-center gap-6">
                    <button
                        onClick={() => navigate('/admin/departments')}
                        className="h-14 w-14 rounded-2xl bg-white border border-gray-100 flex items-center justify-center text-gray-400 hover:bg-rose-50 hover:text-rose-500 transition-all shadow-sm active:scale-90"
                    >
                        <FaArrowLeft size={20} />
                    </button>
                    <div>
                        <h1 className="text-4xl font-black text-gray-800 tracking-tight">
                            {id ? 'Modify Department' : 'New Department Node'}
                        </h1>
                        <p className="text-[10px] font-black text-sky-500 uppercase tracking-[0.2em] mt-1">Institutional Structure Configuration</p>
                    </div>
                </div>

                <motion.div
                    initial={{ opacity: 0, scale: 0.98, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    className="bg-white p-12 rounded-[40px] shadow-2xl border border-sky-50 relative overflow-hidden"
                >
                    <div className="absolute top-0 right-0 w-64 h-64 bg-sky-50 rounded-full -mr-32 -mt-32 opacity-20" />

                    <form onSubmit={handleSubmit} className="relative z-10 space-y-10">
                        <div className="flex items-center gap-5 mb-4">
                            <div className="h-12 w-12 rounded-2xl bg-sky-600 text-white flex items-center justify-center shadow-xl shadow-sky-100">
                                <FaBuilding size={20} />
                            </div>
                            <h3 className="text-xl font-black text-gray-800 tracking-tight uppercase">Department Information</h3>
                        </div>

                        <div>
                            <label className={labelClass}>Department Name</label>
                            <input
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                className={inputClass}
                                placeholder="e.g. Computer Science & Engineering"
                                required
                            />
                        </div>

                        <div>
                            <label className={labelClass}>Department Code (Unique Identifier)</label>
                            <input
                                value={formData.code}
                                onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                                className={inputClass}
                                placeholder="e.g. CSE-2026"
                            />
                        </div>

                        <div className="pt-8 border-t border-gray-50 flex gap-6">
                            <button
                                type="button"
                                onClick={() => navigate('/admin/departments')}
                                className="flex-1 py-5 rounded-2xl border border-gray-100 text-gray-400 text-[10px] font-black uppercase tracking-widest hover:bg-gray-50 transition-all active:scale-95"
                            >
                                Discard
                            </button>
                            <button
                                type="submit"
                                className="flex-[2] bg-sky-600 text-white py-5 rounded-2xl shadow-2xl shadow-sky-100 hover:bg-sky-800 transition-all font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-3 active:scale-95 group"
                            >
                                <FaSave className="group-hover:scale-125 transition-transform" />
                                {id ? 'Synchronize Data' : 'Initialize Node'}
                            </button>
                        </div>
                    </form>
                </motion.div>
            </div>
        </Layout>
    );
};

export default DepartmentFormPage;
