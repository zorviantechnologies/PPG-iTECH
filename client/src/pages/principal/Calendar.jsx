import { useState, useEffect } from 'react';
import Layout from '../../components/Layout';
import { useAuth } from '../../context/AuthContext';
import { ChevronLeft, ChevronRight, Edit3, Save, X, Calendar as CalendarIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const Calendar = () => {
    const [currentDate, setCurrentDate] = useState(new Date());
    const { user } = useAuth();
    const [caption, setCaption] = useState('');
    const [editingCaption, setEditingCaption] = useState(false);

    // Calendar Logic
    const getDaysInMonth = (date) => {
        const year = date.getFullYear();
        const month = date.getMonth();
        return new Date(year, month + 1, 0).getDate();
    };
    const getFirstDayOfMonth = (date) => {
        const year = date.getFullYear();
        const month = date.getMonth();
        return new Date(year, month, 1).getDay(); // 0 = Sunday
    };
    const daysInMonth = getDaysInMonth(currentDate);
    const firstDay = getFirstDayOfMonth(currentDate);

    const renderDays = () => {
        const days = [];
        for (let i = 0; i < firstDay; i++) {
            days.push(<div key={`empty-${i}`} className="p-4 bg-gray-50/30 border-b border-r border-sky-50/50"></div>);
        }
        for (let i = 1; i <= daysInMonth; i++) {
            const dateObj = new Date(currentDate.getFullYear(), currentDate.getMonth(), i);
            const isToday =
                i === new Date().getDate() &&
                currentDate.getMonth() === new Date().getMonth() &&
                currentDate.getFullYear() === new Date().getFullYear();

            const dayOfWeek = dateObj.getDay();
            const isFirstSaturday = dayOfWeek === 6 && i <= 7;
            const isWeekend = dayOfWeek === 0 || (dayOfWeek === 6 && !isFirstSaturday); // Sunday & non-first Saturdays

            days.push(
                <motion.div
                    key={i}
                    whileHover={{ zIndex: 10, scale: 1.02 }}
                    className={`p-4 border-b border-r border-sky-50/50 h-32 relative transition-all group ${isToday ? 'bg-sky-600 shadow-lg shadow-sky-100' : isWeekend ? 'bg-rose-50/50' : 'bg-white hover:bg-sky-50/30'
                        }`}
                >
                    <span className={`text-sm font-black transition-colors ${isToday ? 'text-white' : isWeekend ? 'text-rose-500' : 'text-gray-400 group-hover:text-sky-500'
                        }`}>
                        {i.toString().padStart(2, '0')}
                    </span>

                    {isToday && (
                        <div className="absolute bottom-3 right-3 h-2 w-2 rounded-full bg-white animate-ping"></div>
                    )}

                    <div className="mt-2">
                        {/* Placeholder for events/leaves */}
                        {isWeekend && (
                            <span className="text-[10px] font-black uppercase text-rose-300 tracking-widest">Holiday</span>
                        )}
                    </div>
                </motion.div>
            );
        }
        return days;
    };

    return (
        <Layout>
            <div className="mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                <div>
                    <h1 className="text-3xl font-black text-gray-800 tracking-tight">Academic Calendar</h1>
                    <p className="text-gray-500 font-medium mt-1">Schedule, events, and holidays.</p>
                </div>

                <div className="flex items-center bg-white p-2 rounded-2xl shadow-xl shadow-sky-50/50 border border-sky-50">
                    <button
                        onClick={() => setCurrentDate(new Date(currentDate.setMonth(currentDate.getMonth() - 1)))}
                        className="p-3 rounded-xl hover:bg-sky-50 text-gray-400 hover:text-sky-600 transition-all"
                    >
                        <ChevronLeft size={20} />
                    </button>
                    <div className="px-6 flex flex-col items-center min-w-[180px]">
                        <span className="text-xs font-black text-sky-500 uppercase tracking-widest">
                            {currentDate.getFullYear()}
                        </span>
                        <span className="text-lg font-black text-gray-800 uppercase tracking-tight">
                            {currentDate.toLocaleString('default', { month: 'long' })}
                        </span>
                    </div>
                    <button
                        onClick={() => setCurrentDate(new Date(currentDate.setMonth(currentDate.getMonth() + 1)))}
                        className="p-3 rounded-xl hover:bg-sky-50 text-gray-400 hover:text-sky-600 transition-all"
                    >
                        <ChevronRight size={20} />
                    </button>
                </div>
            </div>

            <motion.div
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                className="modern-card overflow-hidden !p-0 border-sky-100"
            >
                <div className="grid grid-cols-7 text-center bg-sky-50/50 border-b border-sky-100">
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, idx) => (
                        <div key={day} className={`p-4 text-[10px] font-black uppercase tracking-[0.2em] ${idx === 0 || idx === 6 ? 'text-rose-400' : 'text-sky-400'
                            }`}>
                            {day}
                        </div>
                    ))}
                </div>
                <div className="grid grid-cols-7">
                    {renderDays()}
                </div>
            </motion.div>

            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="mt-8 bg-white p-6 rounded-3xl border border-sky-50 shadow-xl shadow-sky-50/50 flex flex-col md:flex-row items-center justify-between gap-6"
            >
                <div className="flex items-center gap-5 flex-1 w-full">
                    <div className="h-12 w-12 rounded-2xl bg-sky-50 flex items-center justify-center text-sky-600">
                        <CalendarIcon size={24} />
                    </div>
                    <div className="flex-1">
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Monthly Focus</span>
                        <AnimatePresence mode="wait">
                            {editingCaption && (user.role === 'principal' || user.role === 'admin') ? (
                                <motion.div
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: 10 }}
                                    className="flex items-center gap-3 w-full"
                                >
                                    <input
                                        type="text"
                                        value={caption}
                                        onChange={e => setCaption(e.target.value)}
                                        className="flex-1 bg-gray-50 border border-gray-100 p-3 rounded-xl outline-none focus:ring-4 focus:ring-sky-100 focus:border-sky-500 font-bold text-gray-700"
                                        placeholder="Enter month highlight..."
                                        autoFocus
                                    />
                                    <button
                                        className="p-3 bg-sky-600 text-white rounded-xl shadow-lg shadow-sky-100 hover:bg-sky-700 transition-all group"
                                        onClick={() => setEditingCaption(false)}
                                    >
                                        <Save size={18} className="group-hover:scale-110" />
                                    </button>
                                    <button
                                        className="p-3 bg-gray-100 text-gray-500 rounded-xl hover:bg-gray-200 transition-all"
                                        onClick={() => setEditingCaption(false)}
                                    >
                                        <X size={18} />
                                    </button>
                                </motion.div>
                            ) : (
                                <motion.div
                                    initial={{ opacity: 0, x: 10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -10 }}
                                    className="flex items-center justify-between w-full"
                                >
                                    <span className="text-xl font-black text-sky-900 tracking-tight">
                                        {caption || 'No specific highlight for this month.'}
                                    </span>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>

                {!editingCaption && (user.role === 'principal' || user.role === 'admin') && (
                    <button
                        className="bg-sky-50 text-sky-600 px-6 py-3 rounded-xl font-black uppercase tracking-widest text-[10px] flex items-center gap-2 hover:bg-sky-600 hover:text-white transition-all shadow-sm group"
                        onClick={() => setEditingCaption(true)}
                    >
                        <Edit3 size={14} className="group-hover:rotate-12 transition-transform" />
                        Edit Focus
                    </button>
                )}
            </motion.div>
        </Layout>
    );
};

export default Calendar;

