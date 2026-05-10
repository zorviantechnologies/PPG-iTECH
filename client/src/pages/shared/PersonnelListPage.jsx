import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Layout from '../../components/Layout';
import api from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import { FaUserTie, FaEye, FaCalendarAlt, FaIdBadge, FaEnvelope, FaPhone, FaBuilding, FaSuitcase, FaArrowLeft, FaUsers, FaSearch, FaFilter } from 'react-icons/fa';
import { motion, AnimatePresence } from 'framer-motion';

const PersonnelListPage = () => {
    const { role } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();
    const [personnel, setPersonnel] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [filteredPersonnel, setFilteredPersonnel] = useState([]);

    useEffect(() => {
        const fetchPersonnel = async () => {
            try {
                const { data } = await api.get('/employees');
                const filtered = data.filter(e => (e.role || '').toLowerCase() === role.toLowerCase());
                setPersonnel(filtered);
                setFilteredPersonnel(filtered);
            } catch (error) {
                console.error("Error fetching personnel", error);
            } finally {
                setLoading(false);
            }
        };
        fetchPersonnel();
    }, [role]);

    useEffect(() => {
        const result = personnel.filter(p =>
            p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            p.emp_id.toLowerCase().includes(searchQuery.toLowerCase())
        );
        setFilteredPersonnel(result);
    }, [searchQuery, personnel]);

    return (
        <Layout>
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-6">
                <div className="flex items-center gap-6">
                    <button
                        onClick={() => navigate(-1)}
                        className="h-14 w-14 rounded-2xl bg-white border border-gray-100 flex items-center justify-center text-gray-400 hover:bg-white hover:text-sky-600 transition-all shadow-xl shadow-sky-500/5 hover:-translate-x-1 active:scale-90"
                    >
                        <FaArrowLeft size={18} />
                    </button>
                    <div>
                        <h1 className="text-3xl font-black text-gray-800 tracking-tight">Institutional <span className="text-sky-600 uppercase">{role}</span> Registry</h1>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.4em] mt-2">Active Staff Directory</p>
                    </div>
                </div>

                <div className="relative group w-full md:w-80">
                    <div className="absolute inset-y-0 left-0 pl-5 flex items-center pointer-events-none">
                        <FaSearch className="text-sky-300 group-focus-within:text-sky-500 transition-colors" />
                    </div>
                    <input
                        type="text"
                        placeholder={`Search ${role}...`}
                        className="w-full pl-14 pr-6 py-4 bg-white border border-gray-100 rounded-2xl outline-none focus:ring-4 focus:ring-sky-100 focus:border-sky-500 transition-all font-bold text-gray-700 text-sm shadow-xl shadow-sky-500/5 shadow-inner"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
            </div>

            {loading ? (
                <div className="flex flex-col items-center justify-center py-40 gap-6">
                    <div className="h-16 w-16 border-4 border-sky-50 border-t-sky-600 rounded-full animate-spin shadow-xl"></div>
                    <p className="text-[10px] font-black text-sky-600 uppercase tracking-[0.3em] animate-pulse">Compiling Registry Data...</p>
                </div>
            ) : (
                <div className="bg-white rounded-[40px] shadow-2xl shadow-sky-500/5 p-8 border border-white hover:border-sky-100 transition-colors group">
                    <div className="overflow-x-auto">
                        <table className="min-w-[80vw] md:w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b-2 border-sky-50">
                                    <th className="py-5 px-6 text-[10px] font-black text-sky-600 uppercase tracking-[0.2em] whitespace-nowrap">Personnel</th>
                                    <th className="py-5 px-6 text-[10px] font-black text-sky-600 uppercase tracking-[0.2em] whitespace-nowrap">Emp ID</th>
                                    <th className="py-5 px-6 text-[10px] font-black text-sky-600 uppercase tracking-[0.2em] whitespace-nowrap">Department</th>
                                    <th className="py-5 px-6 text-[10px] font-black text-sky-600 uppercase tracking-[0.2em] whitespace-nowrap">Email Identifier</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                <AnimatePresence mode="popLayout">
                                    {filteredPersonnel.map((member, idx) => (
                                        <motion.tr
                                            key={member.id}
                                            layout
                                            initial={{ opacity: 0, y: 15 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, scale: 0.95 }}
                                            transition={{ delay: idx * 0.05, duration: 0.3 }}
                                            className="group/row hover:bg-sky-50/50 transition-colors border-b border-gray-50 last:border-0"
                                        >
                                            <td className="py-4 px-6">
                                                <div className="flex items-center gap-4">
                                                    <img
                                                        src={member.profile_pic || `https://ui-avatars.com/api/?name=${encodeURIComponent(member.name)}&size=80&background=2563eb&color=fff&bold=true`}
                                                        className="w-12 h-12 rounded-[14px] object-cover shadow-sm bg-gray-100 border border-gray-100"
                                                        alt=""
                                                    />
                                                    <div>
                                                        <h3 className="text-sm font-black text-gray-800 tracking-tight group-hover/row:text-sky-600 transition-colors uppercase">{member.name}</h3>
                                                        <p className="text-[10px] font-black text-sky-500 uppercase tracking-[0.2em] mt-0.5">{member.role || 'staff'}</p>
                                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mt-0.5">{member.designation || 'N/A'}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="py-4 px-6">
                                                <span className="text-[11px] font-black text-gray-600 tracking-widest uppercase">{member.emp_id}</span>
                                            </td>
                                            <td className="py-4 px-6">
                                                <p className="text-xs font-black text-gray-700 tracking-tight">
                                                    {member.department_name || "Institutional"}
                                                </p>
                                            </td>
                                            <td className="py-4 px-6">
                                                <div className="flex flex-col gap-0.5">
                                                    <span className="text-[10px] font-black text-gray-700 tracking-tight lowercase">{member.email || '—'}</span>
                                                    <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest">Office Email</span>
                                                </div>
                                            </td>
                                        </motion.tr>
                                    ))}
                                </AnimatePresence>
                            </tbody>
                        </table>
                    </div>

                    {filteredPersonnel.length === 0 && (
                        <div className="col-span-full py-40 bg-white/50 backdrop-blur-xl rounded-[60px] border-4 border-dashed border-gray-100 flex flex-col items-center justify-center text-center gap-8 group">
                            <div className="h-32 w-32 rounded-[50px] bg-gray-50 flex items-center justify-center text-gray-200 group-hover:scale-110 group-hover:rotate-6 transition-all duration-700 shadow-inner">
                                <FaUsers size={60} />
                            </div>
                            <div>
                                <h3 className="text-3xl font-black text-gray-800 tracking-tight">Personnel Vacancy Identified</h3>
                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em] mt-3 italic">No registry records match current identity criteria</p>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </Layout>
    );
};

export default PersonnelListPage;
