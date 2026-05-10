import { useState, useEffect } from 'react';
import Layout from '../../components/Layout';
import api from '../../utils/api';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Info, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const InstitutionalCalendar = () => {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [holidays, setHolidays] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedDay, setSelectedDay] = useState(null);

    useEffect(() => {
        fetchHolidays();
    }, [currentDate]);

    const fetchHolidays = async () => {
        setLoading(true);
        try {
            const month = currentDate.getMonth() + 1;
            const year = currentDate.getFullYear();
            const { data } = await api.get(`holidays?month=${month}&year=${year}`);
            setHolidays(data);
            setLoading(false);
        } catch (error) {
            console.error('Fetch error:', error);
            setLoading(false);
        }
    };

    const getDaysInMonth = (date) => {
        const year = date.getFullYear();
        const month = date.getMonth();
        return new Date(year, month + 1, 0).getDate();
    };

    const getFirstDayOfMonth = (date) => {
        const year = date.getFullYear();
        const month = date.getMonth();
        return new Date(year, month, 1).getDay();
    };

    const formatDateStr = (year, month, day) => {
        const mm = (month + 1).toString().padStart(2, '0');
        const dd = day.toString().padStart(2, '0');
        return `${year}-${mm}-${dd}`;
    };

    const renderDays = () => {
        const days = [];
        const daysInMonth = getDaysInMonth(currentDate);
        const firstDay = getFirstDayOfMonth(currentDate);

        for (let i = 0; i < firstDay; i++) {
            days.push(<div key={`empty-${i}`} className="p-4 bg-gray-50/10 border-b border-r border-gray-100"></div>);
        }

        for (let i = 1; i <= daysInMonth; i++) {
            const dateObj = new Date(currentDate.getFullYear(), currentDate.getMonth(), i);
            const dayOfWeek = dateObj.getDay();
            const dateStr = formatDateStr(currentDate.getFullYear(), currentDate.getMonth(), i);

            const holiday = holidays.find(h => h.h_date === dateStr);
            const isToday = i === new Date().getDate() &&
                currentDate.getMonth() === new Date().getMonth() &&
                currentDate.getFullYear() === new Date().getFullYear();

            const isFirstSaturday = dayOfWeek === 6 && i <= 7;
            let type = (dayOfWeek === 0 || (dayOfWeek === 6 && !isFirstSaturday)) ? 'Holiday' : 'Working Day';
            let caption = type;

            if (holiday) {
                type = holiday.type;
                caption = holiday.caption;
            }

            let bgColor = 'bg-white';
            let textColor = 'text-gray-600';
            let accentColor = 'bg-gray-200';

            if (type === 'Holiday') {
                bgColor = 'bg-rose-50 border-rose-100';
                textColor = 'text-rose-600';
                accentColor = 'bg-rose-500';
            } else if (type === 'Working Day') {
                bgColor = 'bg-emerald-50 border-emerald-100';
                textColor = 'text-emerald-600';
                accentColor = 'bg-emerald-500';
            } else if (type === 'Special') {
                bgColor = 'bg-amber-50 border-amber-100';
                textColor = 'text-amber-600';
                accentColor = 'bg-amber-500';
            }

            days.push(
                <motion.div
                    key={i}
                    whileHover={{ zIndex: 10, scale: 1.02 }}
                    onClick={() => setSelectedDay({ day: i, type, caption, dateStr })}
                    className={`p-4 border-b border-r border-gray-100 h-24 relative transition-all group cursor-pointer ${bgColor} ${isToday ? 'ring-2 ring-sky-600 ring-inset' : ''} ${selectedDay?.day === i ? 'ring-2 ring-sky-400 ring-inset' : ''}`}
                >
                    <div className="flex justify-between items-start">
                        <span className={`text-sm font-black ${textColor}`}>
                            {i.toString().padStart(2, '0')}
                        </span>
                    </div>

                    <div className={`absolute bottom-2 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full ${accentColor}`}></div>
                </motion.div>
            );
        }
        return days;
    };

    return (
        <Layout>
            <div className="mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                <div>
                    <h1 className="text-3xl font-black text-gray-800 tracking-tight flex items-center gap-3">
                        <CalendarIcon className="text-sky-600" />
                        Institutional Calendar
                    </h1>
                </div>

                <div className="flex items-center bg-white p-1 rounded-2xl shadow-xl shadow-sky-50/50 border border-sky-50">
                    <button
                        onClick={() => setCurrentDate(new Date(currentDate.setMonth(currentDate.getMonth() - 1)))}
                        className="p-3 rounded-xl hover:bg-sky-50 text-gray-400 hover:text-sky-600 transition-all"
                    >
                        <ChevronLeft size={20} />
                    </button>
                    <div className="px-6 flex flex-col items-center min-w-[180px]">
                        <span className="text-[10px] font-black text-sky-500 uppercase tracking-widest leading-none">
                            {currentDate.getFullYear()}
                        </span>
                        <span className="text-lg font-black text-gray-800 uppercase tracking-tight mt-1">
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

            <div className="flex gap-4 mb-6 flex-wrap items-center">
                <div className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-600 rounded-xl border border-emerald-100 text-[10px] font-black uppercase tracking-widest">
                    <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                    Working Day
                </div>
                <div className="flex items-center gap-2 px-4 py-2 bg-rose-50 text-rose-600 rounded-xl border border-rose-100 text-[10px] font-black uppercase tracking-widest">
                    <div className="w-2 h-2 rounded-full bg-rose-500"></div>
                    Holiday
                </div>
                <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 text-amber-600 rounded-xl border border-amber-100 text-[10px] font-black uppercase tracking-widest">
                    <div className="w-2 h-2 rounded-full bg-amber-500"></div>
                    Event / Special
                </div>
                <div className="flex-1"></div>
                <div className="flex items-center gap-2 text-[10px] font-black text-gray-400 uppercase tracking-widest bg-gray-50 px-4 py-2 rounded-xl">
                    <Info size={12} />
                    Read Only Mode
                </div>
            </div>

            {/* Selected Day Caption - Above Calendar */}
            <AnimatePresence>
                {selectedDay && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="mb-4 px-6 py-4 rounded-2xl border shadow-md flex items-center justify-between"
                        style={{
                            background: selectedDay.type === 'Holiday' ? '#fff1f2' : selectedDay.type === 'Special' ? '#fffbeb' : '#ecfdf5',
                            borderColor: selectedDay.type === 'Holiday' ? '#fecdd3' : selectedDay.type === 'Special' ? '#fde68a' : '#a7f3d0'
                        }}
                    >
                        <div className="flex items-center gap-4">
                            <div className={`w-3 h-3 rounded-full ${
                                selectedDay.type === 'Holiday' ? 'bg-rose-500' :
                                selectedDay.type === 'Special' ? 'bg-amber-500' : 'bg-emerald-500'
                            }`}></div>
                            <div>
                                <p className="text-xs font-black text-gray-400 uppercase tracking-widest">
                                    {selectedDay.dateStr} &middot; {selectedDay.type}
                                </p>
                                <p className="text-lg font-black text-gray-800 mt-0.5">
                                    {selectedDay.caption}
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={() => setSelectedDay(null)}
                            className="p-2 rounded-xl hover:bg-white/60 text-gray-400 hover:text-gray-600 transition-all"
                        >
                            <X size={18} />
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>

            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="modern-card overflow-hidden !p-0 border-gray-100 shadow-2xl shadow-sky-100/20"
            >
                <div className="grid grid-cols-7 text-center bg-gray-50/80 backdrop-blur-sm border-b border-gray-100">
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                        <div key={day} className="p-5 text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">
                            {day}
                        </div>
                    ))}
                </div>
                <div className="grid grid-cols-7">
                    {loading ? (
                        <div className="col-span-7 py-20 text-center">
                            <div className="h-10 w-10 border-4 border-sky-100 border-t-sky-600 rounded-full animate-spin mx-auto mb-4"></div>
                            <p className="text-[10px] font-black text-sky-500 uppercase tracking-widest">Syncing institutional schedule...</p>
                        </div>
                    ) : renderDays()}
                </div>
            </motion.div>

        </Layout>
    );
};

export default InstitutionalCalendar;
