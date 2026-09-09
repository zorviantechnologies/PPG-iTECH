import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import { FaUsers, FaUserGraduate, FaFileInvoice, FaArrowRight, FaTimes } from 'react-icons/fa';

const ModuleSelectionModal = ({ isOpen, onClose }) => {
    const { user, selectModule, activeModule } = useAuth();
    const navigate = useNavigate();

    if (!isOpen || !user || !['admin', 'accounts'].includes(user.role)) return null;

    const isAdmin = ['admin', 'accounts'].includes(user.role);

    const handleChoice = (moduleKey) => {
        selectModule(moduleKey);

        if (moduleKey === 'staff') navigate('/admin');
        else if (moduleKey === 'students') navigate('/admin/students');
        else if (moduleKey === 'results') navigate('/admin/results');

        if (onClose) onClose();
    };

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md">
                <motion.div
                    initial={{ opacity: 0, scale: 0.9, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9, y: 20 }}
                    transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                    className="bg-white rounded-3xl p-6 md:p-8 max-w-3xl w-full shadow-2xl border border-gray-100 relative overflow-hidden"
                >
                    {/* Background Glow */}
                    <div className="absolute -right-20 -top-20 w-60 h-60 bg-sky-100 rounded-full blur-3xl opacity-50 pointer-events-none" />
                    <div className="absolute -left-20 -bottom-20 w-60 h-60 bg-purple-100 rounded-full blur-3xl opacity-50 pointer-events-none" />

                    {/* Header */}
                    <div className="relative z-10 flex items-center justify-between mb-6 border-b border-gray-100 pb-4">
                        <div>
                            <span className="text-[10px] font-black uppercase tracking-widest text-sky-600 bg-sky-50 px-3 py-1 rounded-full">
                                Portal Navigation Chooser
                            </span>
                            <h2 className="text-2xl font-black text-gray-800 tracking-tight mt-1">
                                Welcome, {user.name}!
                            </h2>
                            <p className="text-xs text-gray-500 mt-0.5">
                                Select the portal module you wish to enter for your session:
                            </p>
                        </div>
                        {activeModule && (
                            <button
                                onClick={onClose}
                                className="p-2.5 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                            >
                                <FaTimes />
                            </button>
                        )}
                    </div>

                    {/* Module Cards Grid */}
                    <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        
                        {/* Module 1: Staff Portal */}
                        <motion.div
                            whileHover={{ scale: 1.02, y: -4 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => handleChoice('staff')}
                            className={`p-6 rounded-2xl border-2 transition-all cursor-pointer flex flex-col justify-between group ${
                                activeModule === 'staff'
                                    ? 'border-sky-500 bg-sky-50/50 shadow-lg shadow-sky-100'
                                    : 'border-gray-100 bg-white hover:border-sky-300 hover:shadow-xl'
                            }`}
                        >
                            <div>
                                <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-sky-500 to-indigo-600 text-white flex items-center justify-center text-xl shadow-md mb-4 group-hover:scale-110 transition-transform">
                                    <FaUsers />
                                </div>
                                <span className="text-[9px] font-black uppercase tracking-widest text-sky-600 block mb-1">
                                    Module 1
                                </span>
                                <h3 className="text-lg font-black text-gray-800 tracking-tight group-hover:text-sky-600 transition-colors">
                                    Staff Management
                                </h3>
                                <p className="text-xs text-gray-500 mt-2 leading-relaxed">
                                    {isAdmin 
                                        ? 'Access employee directory, department hierarchy, payroll, attendance records, and timetable setups.' 
                                        : 'Access personal timetable, leave applications, attendance history, and salary details.'}
                                </p>
                            </div>
                            <div className="mt-6 flex items-center gap-2 text-xs font-bold text-sky-600 group-hover:translate-x-1 transition-transform">
                                Enter Staff Module <FaArrowRight />
                            </div>
                        </motion.div>

                        {/* Module 2: Students Portal */}
                        <motion.div
                            whileHover={{ scale: 1.02, y: -4 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => handleChoice('students')}
                            className={`p-6 rounded-2xl border-2 transition-all cursor-pointer flex flex-col justify-between group ${
                                activeModule === 'students'
                                    ? 'border-indigo-500 bg-indigo-50/50 shadow-lg shadow-indigo-100'
                                    : 'border-gray-100 bg-white hover:border-indigo-300 hover:shadow-xl'
                            }`}
                        >
                            <div>
                                <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-500 to-purple-600 text-white flex items-center justify-center text-xl shadow-md mb-4 group-hover:scale-110 transition-transform">
                                    <FaUserGraduate />
                                </div>
                                <span className="text-[9px] font-black uppercase tracking-widest text-indigo-600 block mb-1">
                                    Module 2
                                </span>
                                <h3 className="text-lg font-black text-gray-800 tracking-tight group-hover:text-indigo-600 transition-colors">
                                    Student Information
                                </h3>
                                <p className="text-xs text-gray-500 mt-2 leading-relaxed">
                                    Manage student profiles, register numbers, roll numbers, academic year placements (1st-4th Year), and class details.
                                </p>
                            </div>
                            <div className="mt-6 flex items-center gap-2 text-xs font-bold text-indigo-600 group-hover:translate-x-1 transition-transform">
                                Enter Student Module <FaArrowRight />
                            </div>
                        </motion.div>

                        {/* Module 3: Results Portal (Admin Only) */}
                        {isAdmin && (
                            <motion.div
                                whileHover={{ scale: 1.02, y: -4 }}
                                whileTap={{ scale: 0.98 }}
                                onClick={() => handleChoice('results')}
                                className={`p-6 rounded-2xl border-2 transition-all cursor-pointer flex flex-col justify-between group md:col-span-2 lg:col-span-1 ${
                                    activeModule === 'results'
                                        ? 'border-purple-500 bg-purple-50/50 shadow-lg shadow-purple-100'
                                        : 'border-gray-100 bg-white hover:border-purple-300 hover:shadow-xl'
                                }`}
                            >
                                <div>
                                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-purple-500 to-pink-600 text-white flex items-center justify-center text-xl shadow-md mb-4 group-hover:scale-110 transition-transform">
                                        <FaFileInvoice />
                                    </div>
                                    <span className="text-[9px] font-black uppercase tracking-widest text-purple-600 block mb-1">
                                        Module 3
                                    </span>
                                    <h3 className="text-lg font-black text-gray-800 tracking-tight group-hover:text-purple-600 transition-colors">
                                        Results Upload Portal
                                    </h3>
                                    <p className="text-xs text-gray-500 mt-2 leading-relaxed">
                                        Upload, edit, and publish student examination results organized year-wise and department-wise.
                                    </p>
                                </div>
                                <div className="mt-6 flex items-center gap-2 text-xs font-bold text-purple-600 group-hover:translate-x-1 transition-transform">
                                    Enter Results Portal <FaArrowRight />
                                </div>
                            </motion.div>
                        )}

                    </div>

                </motion.div>
            </div>
        </AnimatePresence>
    );
};

export default ModuleSelectionModal;
