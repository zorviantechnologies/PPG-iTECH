import { useState, useEffect } from 'react';
import Layout from '../../components/Layout';
import api from '../../utils/api';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Save, X, Edit3, CheckCircle, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Swal from 'sweetalert2';

const AdminCalendar = () => {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [holidays, setHolidays] = useState([]);
    const [loading, setLoading] = useState(true);
    const [pendingChanges, setPendingChanges] = useState([]);
    const [isSaving, setIsSaving] = useState(false);
    const [selectedDay, setSelectedDay] = useState(null);

    useEffect(() => {
        fetchHolidays();
        setPendingChanges([]);
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

    const handleToggleHoliday = (day) => {
        const dateObj = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
        const dayOfWeek = dateObj.getDay();
        const dateStr = formatDateStr(currentDate.getFullYear(), currentDate.getMonth(), day);

        const existingHoliday = holidays.find(h => h.h_date === dateStr);
        const pendingChange = pendingChanges.find(p => p.date === dateStr);

        let currentType;
        let currentCaption;

        if (pendingChange) {
            currentType = pendingChange.type;
            currentCaption = pendingChange.caption;
        } else if (existingHoliday) {
            currentType = existingHoliday.type;
            currentCaption = existingHoliday.caption;
        } else {
            const isFirstSat = dayOfWeek === 6 && day <= 7;
            const defaultIsHoliday = dayOfWeek === 0 || (dayOfWeek === 6 && !isFirstSat);
            currentType = defaultIsHoliday ? 'Holiday' : 'Working Day';
            currentCaption = currentType;
        }

        let newType;
        if (currentType === 'Special') {
            newType = 'Working Day';
        } else {
            newType = currentType === 'Holiday' ? 'Working Day' : 'Holiday';
        }

        const newCaption = (currentCaption === 'Holiday' || currentCaption === 'Working Day' || currentCaption === 'Special') ? newType : currentCaption;

        const newPendingChange = {
            date: dateStr,
            caption: newCaption,
            type: newType
        };

        setPendingChanges(prev => {
            const filtered = prev.filter(p => p.date !== dateStr);
            return [...filtered, newPendingChange];
        });
    };

    const handleEditCaption = async (day) => {
        const dateStr = formatDateStr(currentDate.getFullYear(), currentDate.getMonth(), day);
        const existingHoliday = holidays.find(h => h.h_date === dateStr);
        const pendingChange = pendingChanges.find(p => p.date === dateStr);

        let initialCaption = '';
        let currentType = '';

        if (pendingChange) {
            initialCaption = pendingChange.caption;
            currentType = pendingChange.type;
        } else if (existingHoliday) {
            initialCaption = existingHoliday.caption;
            currentType = existingHoliday.type;
        } else {
            const dateObj = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
            const dayOfWeek = dateObj.getDay();
            const isFirstSat = dayOfWeek === 6 && day <= 7;
            currentType = (dayOfWeek === 0 || (dayOfWeek === 6 && !isFirstSat)) ? 'Holiday' : 'Working Day';
            initialCaption = currentType;
        }

        const { value: caption } = await Swal.fire({
            title: 'Edit Caption',
            input: 'text',
            inputValue: initialCaption,
            showCancelButton: true,
            confirmButtonColor: '#2563eb',
            inputValidator: (value) => {
                if (!value) return 'Caption is required';
            }
        });

        if (caption) {
            let newType = currentType;
            if (caption !== 'Holiday' && caption !== 'Working Day') {
                newType = 'Special';
            } else {
                newType = caption;
            }

            const newPendingChange = {
                date: dateStr,
                caption: caption,
                type: newType
            };

            setPendingChanges(prev => {
                const filtered = prev.filter(p => p.date !== dateStr);
                return [...filtered, newPendingChange];
            });
        }
    };

    const handleSaveAll = async () => {
        if (pendingChanges.length === 0) return;

        setIsSaving(true);
        console.log('Attempting to save pending changes:', pendingChanges);

        try {
            for (const change of pendingChanges) {
                console.log(`Sending update for date: ${change.date}`, change);
                const response = await api.post('holidays', change);
                console.log(`Response for ${change.date}:`, response.data);
            }

            await Swal.fire({
                icon: 'success',
                title: 'Successfully Saved',
                text: `${pendingChanges.length} changes were successfully committed.`,
                timer: 2000,
                showConfirmButton: false
            });

            setPendingChanges([]);
            await fetchHolidays();
        } catch (error) {
            console.error('BATCH SAVE FAILED:', error);
            const serverError = error.response?.data?.error || error.response?.data?.message || 'Unknown server error';
            const sqlError = error.response?.data?.sqlMessage || '';

            console.error('Server side details:', { serverError, sqlError });

            Swal.fire({
                icon: 'error',
                title: 'Save Error',
                html: `
                    <div class="text-left bg-gray-50 p-3 rounded text-xs font-mono">
                        <p class="font-bold text-red-600 mb-1">${error.message}</p>
                        <p class="text-gray-600 mb-1">Server: ${serverError}</p>
                        ${sqlError ? `<p class="text-rose-500">SQL: ${sqlError}</p>` : ''}
                    </div>
                    <p class="mt-4 text-sm">Failed to save calendar changes. Please check the console for more details.</p>
                `,
            });
        } finally {
            setIsSaving(false);
        }
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

            const existingHoliday = holidays.find(h => h.h_date === dateStr);
            const pendingChange = pendingChanges.find(p => p.date === dateStr);

            const isFirstSaturday = dayOfWeek === 6 && i <= 7;
            let type = (dayOfWeek === 0 || (dayOfWeek === 6 && !isFirstSaturday)) ? 'Holiday' : 'Working Day';
            let caption = type;

            if (pendingChange) {
                type = pendingChange.type;
                caption = pendingChange.caption;
            } else if (existingHoliday) {
                type = existingHoliday.type;
                caption = existingHoliday.caption;
            }

            const isModified = !!pendingChange;

            let bgColor = 'bg-white';
            let textColor = 'text-gray-600';
            let accentColor = 'bg-gray-200';

            if (type === 'Holiday') {
                bgColor = 'bg-rose-50 border-rose-100 shadow-inner';
                textColor = 'text-rose-600';
                accentColor = 'bg-rose-500';
            } else if (type === 'Working Day') {
                bgColor = 'bg-emerald-50 border-emerald-100 shadow-inner';
                textColor = 'text-emerald-600';
                accentColor = 'bg-emerald-500';
            } else if (type === 'Special') {
                bgColor = 'bg-amber-50 border-amber-100 shadow-inner';
                textColor = 'text-amber-600';
                accentColor = 'bg-amber-500';
            }

            const ringClass = isModified ? 'ring-2 ring-sky-500 ring-inset ring-offset-0 z-10' : '';

            days.push(
                <motion.div
                    key={i}
                    whileHover={{ zIndex: 10, scale: 1.02, boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)' }}
                    className={`p-4 border-b border-r border-gray-100 h-24 relative transition-all group cursor-pointer ${bgColor} ${ringClass} ${selectedDay?.day === i ? 'ring-2 ring-sky-400 ring-inset' : ''}`}
                    onClick={() => setSelectedDay({ day: i, type, caption, dateStr })}
                    onDoubleClick={() => handleToggleHoliday(i)}
                >
                    <div className="flex justify-between items-start">
                        <span className={`text-sm font-black transition-colors ${textColor}`}>
                            {i.toString().padStart(2, '0')}
                        </span>
                        <div className="flex gap-1">
                            {isModified && (
                                <motion.span
                                    initial={{ scale: 0.8 }}
                                    animate={{ scale: 1 }}
                                    className="text-[8px] bg-sky-600 text-white px-1.5 py-0.5 rounded-sm font-black uppercase tracking-tighter"
                                >
                                    Unsaved
                                </motion.span>
                            )}
                            <button
                                onClick={(e) => { e.stopPropagation(); handleEditCaption(i); }}
                                className="hidden group-hover:block p-1 bg-white rounded-lg shadow-sm text-gray-400 hover:text-sky-600 transition-all border border-gray-100"
                            >
                                <Edit3 size={12} />
                            </button>
                        </div>
                    </div>

                    <div className={`absolute bottom-2 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full ${accentColor}`}></div>

                    <p className="text-[8px] font-bold text-gray-400/50 opacity-0 group-hover:opacity-100 transition-opacity absolute bottom-4 left-1/2 -translate-x-1/2 whitespace-nowrap">
                        Double click to toggle
                    </p>
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
                        Manage Calendar
                    </h1>

                </div>

                <div className="flex items-center gap-4">
                    <AnimatePresence>
                        {pendingChanges.length > 0 && (
                            <motion.button
                                initial={{ x: 20, opacity: 0 }}
                                animate={{ x: 0, opacity: 1 }}
                                exit={{ x: 20, opacity: 0 }}
                                onClick={handleSaveAll}
                                disabled={isSaving}
                                className="flex items-center gap-2 bg-sky-600 hover:bg-sky-700 text-white px-6 py-3 rounded-2xl font-black uppercase tracking-widest text-xs shadow-lg shadow-sky-200 transition-all active:scale-95 disabled:opacity-75"
                            >
                                {isSaving ? (
                                    <Loader2 className="animate-spin" size={16} />
                                ) : (
                                    <Save size={16} />
                                )}
                                {isSaving ? 'Processing...' : `Save ${pendingChanges.length} Changes`}
                            </motion.button>
                        )}
                    </AnimatePresence>

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
            </div>

            <div className="flex gap-4 mb-6 flex-wrap items-center">
                <div className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-600 rounded-xl border border-emerald-100 text-[10px] font-black uppercase tracking-widest">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                    Working Day
                </div>
                <div className="flex items-center gap-2 px-4 py-2 bg-rose-50 text-rose-600 rounded-xl border border-rose-100 text-[10px] font-black uppercase tracking-widest">
                    <div className="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></div>
                    Holiday
                </div>
                <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 text-amber-600 rounded-xl border border-amber-100 text-[10px] font-black uppercase tracking-widest">
                    <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></div>
                    Special Event (Yellow)
                </div>
                {pendingChanges.length > 0 && (
                    <div className="flex items-center gap-2 px-4 py-2 bg-sky-50 text-sky-600 rounded-xl border border-sky-100 text-[10px] font-black uppercase tracking-widest ring-1 ring-sky-500">
                        <CheckCircle size={10} />
                        {pendingChanges.length} Pending
                    </div>
                )}
            </div>

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
                    {renderDays()}
                </div>
            </motion.div>

        </Layout>
    );
};

export default AdminCalendar;
