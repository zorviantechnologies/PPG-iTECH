import { useState, useEffect } from 'react';
import Layout from '../../components/Layout';
import api from '../../utils/api';
import Swal from 'sweetalert2';
import {
    FaPlus, FaTrash, FaSave, FaClock, FaGripVertical,
    FaToggleOn, FaToggleOff, FaInfoCircle, FaCalendarAlt
} from 'react-icons/fa';
import { motion, AnimatePresence } from 'framer-motion';

import { formatTo12Hr } from '../../utils/timeFormatter';

const to12h = (timeStr) => formatTo12Hr(timeStr);

const DEFAULT_PERIOD = (pos, periodNum) => ({
    sort_order: pos,
    period_number: periodNum,
    label: periodNum ? `Period ${periodNum}` : 'Break',
    start_time: '',
    end_time: '',
    is_break: !periodNum,
    _tempId: Math.random().toString(36).substr(2, 9),
});

const TimetableSetup = () => {
    const [periods, setPeriods] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [dirty, setDirty] = useState(false);
    const [punchTime, setPunchTime] = useState('09:00');
    const [punchOutTime, setPunchOutTime] = useState('16:00');

    useEffect(() => {
        fetchConfig();
    }, []);

    const fetchConfig = async () => {
        setLoading(true);
        try {
            const [timeRes, settingsRes] = await Promise.all([
                api.get('/timetable/config'),
                api.get('/settings')
            ]);
            
            const data = timeRes.data;
            if (data.length > 0) {
                setPeriods(data.map(p => ({ ...p, _tempId: p.id })));
            } else {
                // Default setup
                setPeriods([
                    DEFAULT_PERIOD(1, 1), DEFAULT_PERIOD(2, 2), DEFAULT_PERIOD(3, 3),
                    DEFAULT_PERIOD(4, null), // Break
                    DEFAULT_PERIOD(5, 4), DEFAULT_PERIOD(6, 5), DEFAULT_PERIOD(7, null), // Lunch
                    DEFAULT_PERIOD(8, 6), DEFAULT_PERIOD(9, 7), DEFAULT_PERIOD(10, 8),
                ]);
            }

            if (settingsRes.data && settingsRes.data.official_punch_time) {
                setPunchTime(settingsRes.data.official_punch_time);
            }
            if (settingsRes.data && settingsRes.data.official_punch_out_time) {
                setPunchOutTime(settingsRes.data.official_punch_out_time);
            }
        } catch { console.error('Failed to fetch timetable config or settings'); }
        finally { setLoading(false); }
    };

    const recomputePeriodNumbers = (list) => {
        let currentP = 0;
        return list.map((p, idx) => {
            const isBreak = p.is_break;
            const newP = isBreak ? null : ++currentP;
            return {
                ...p,
                sort_order: idx + 1,
                period_number: newP,
                // Only update label if it was a default label
                label: (p.label.startsWith('Period ') || p.label === 'Break')
                    ? (newP ? `Period ${newP}` : 'Break') : p.label
            };
        });
    };

    const addPeriod = () => {
        setPeriods(prev => {
            const newList = [...prev, DEFAULT_PERIOD(prev.length + 1, prev.filter(p => !p.is_break).length + 1)];
            return recomputePeriodNumbers(newList);
        });
        setDirty(true);
    };

    const removePeriod = (tempId) => {
        setPeriods(prev => {
            const newList = prev.filter(p => p._tempId !== tempId);
            return recomputePeriodNumbers(newList);
        });
        setDirty(true);
    };

    const updatePeriod = (tempId, field, value) => {
        setPeriods(prev => {
            let newList = prev.map(p =>
                p._tempId === tempId ? { ...p, [field]: value } : p
            );
            if (field === 'is_break') {
                newList = recomputePeriodNumbers(newList);
            }
            return newList;
        });
        setDirty(true);
    };

    const autoFillTimes = () => {
        const startHour = 8;     // 8:00 AM
        const durationMin = 50;  // 50 min per period
        const breakDuration = 10;
        const lunchDuration = 40;

        let cursor = startHour * 60;
        const updated = periods.map((p, idx) => {
            const start = cursor;
            let currentDur = durationMin;

            if (p.is_break) {
                currentDur = p.label.toLowerCase().includes('lunch') ? lunchDuration : breakDuration;
            }

            const end = start + currentDur;
            cursor = end;

            const fmt = (mins) => `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
            return { ...p, start_time: fmt(start), end_time: fmt(end) };
        });
        setPeriods(updated);
        setDirty(true);
    };

    const handleSave = async () => {
        // Validate
        for (const p of periods) {
            if (!p.start_time || !p.end_time) {
                Swal.fire({ title: 'Incomplete Config', text: `Please fill start & end time for ${p.label}.`, icon: 'warning', confirmButtonColor: '#2563eb' });
                return;
            }
        }

        const confirm = await Swal.fire({
            title: 'Save Timetable Configuration?',
            html: `<p style="color:#6b7280;">This updates the period structure and sequence for <span style="font-weight:900; color:#2563eb;">all ${periods.length} slots</span>. Breaks will not be counted in the period numbering.</p>`,
            icon: 'question',
            showCancelButton: true,
            confirmButtonColor: '#2563eb',
            confirmButtonText: 'Yes, Save Config',
        });

        if (!confirm.isConfirmed) return;

        setSaving(true);
        try {
            await Promise.all([
                api.put('/timetable/config', { periods }),
                api.put('/settings/official_punch_time', { value: punchTime }),
                api.put('/settings/official_punch_out_time', { value: punchOutTime })
            ]);
            Swal.fire({ title: 'Configuration Saved!', text: 'The timetable and settings have been updated successfully.', icon: 'success', timer: 2000, showConfirmButton: false });
            setDirty(false);
            fetchConfig();
        } catch (error) {
            Swal.fire({ title: 'Error', text: error.response?.data?.message || 'Failed to save.', icon: 'error', confirmButtonColor: '#2563eb' });
        } finally {
            setSaving(false);
        }
    };

    const totalMinutes = periods.reduce((acc, p) => {
        if (!p.start_time || !p.end_time || p.is_break) return acc;
        const [sh, sm] = p.start_time.split(':').map(Number);
        const [eh, em] = p.end_time.split(':').map(Number);
        return acc + ((eh * 60 + em) - (sh * 60 + sm));
    }, 0);
    const schoolStart = periods[0]?.start_time ? to12h(periods[0].start_time) : '--:--';
    const schoolEnd = periods[periods.length - 1]?.end_time ? to12h(periods[periods.length - 1].end_time) : '--:--';

    return (
        <Layout>
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                {/* Header */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-6">
                    <div>
                        <h1 className="text-3xl font-black text-gray-800 tracking-tight">Timetable Setup</h1>

                    </div>
                    <div className="flex items-center gap-3 flex-wrap">

                        <button
                            onClick={addPeriod}
                            className="px-5 py-3 bg-white border border-sky-100 rounded-2xl font-black text-xs uppercase tracking-widest text-sky-600 shadow-lg shadow-sky-50/50 hover:bg-sky-50 transition-all active:scale-95 flex items-center gap-2"
                        >
                            <FaPlus /> Add Slot
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={saving || !dirty}
                            className="px-6 py-3 bg-sky-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-sky-100 hover:bg-sky-700 transition-all active:scale-95 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <FaSave /> {saving ? 'Saving...' : 'Save Config'}
                        </button>
                    </div>
                </div>

                {/* Summary Stats */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-10">
                    {[
                        { label: 'Total Periods', value: periods.filter(p => !p.is_break).length, color: 'blue' },
                        { label: 'College Start', value: schoolStart, color: 'emerald' },
                        { label: 'College End', value: schoolEnd, color: 'violet' },
                        { label: 'Teaching Hours', value: `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`, color: 'amber' },
                    ].map(s => (
                        <div key={s.label} className={`modern-card p-6 border border-${s.color}-100 bg-${s.color}-50/30`}>
                            <p className={`text-[9px] font-black uppercase tracking-[0.3em] text-${s.color}-400 mb-2`}>{s.label}</p>
                            <p className={`text-2xl font-black text-${s.color}-700 tracking-tight`}>{loading ? '—' : s.value}</p>
                        </div>
                    ))}
                    
                    {/* Punch Time Config */}
                    <div className="modern-card p-6 border border-rose-100 bg-rose-50/30">
                        <p className="text-[9px] font-black uppercase tracking-[0.3em] text-rose-400 mb-2">Punch In</p>
                        <div className="flex items-center gap-2">
                            <input
                                type="time"
                                value={punchTime}
                                onChange={e => {
                                    setPunchTime(e.target.value);
                                    setDirty(true);
                                }}
                                className="bg-white border text-xl border-rose-200 rounded-xl px-2 py-1 font-black text-rose-700 outline-none focus:border-rose-400 w-full"
                            />
                        </div>
                    </div>

                    {/* Punch Out Time Config */}
                    <div className="modern-card p-6 border border-rose-100 bg-rose-50/30">
                        <p className="text-[9px] font-black uppercase tracking-[0.3em] text-rose-400 mb-2">Punch Out</p>
                        <div className="flex items-center gap-2">
                            <input
                                type="time"
                                value={punchOutTime}
                                onChange={e => {
                                    setPunchOutTime(e.target.value);
                                    setDirty(true);
                                }}
                                className="bg-white border text-xl border-rose-200 rounded-xl px-2 py-1 font-black text-rose-700 outline-none focus:border-rose-400 w-full"
                            />
                        </div>
                    </div>
                </div>

                <div className="p-4 bg-sky-50/60 rounded-2xl border border-sky-100 flex items-start gap-3 mb-8">
                    <FaInfoCircle className="text-sky-400 shrink-0 mt-0.5" />
                    <p className="text-xs font-bold text-gray-600">
                        Items marked as <span className="font-black text-amber-600">Breaks</span> are excluded from the period count. Period numbering automatically adjusts when slots are added, removed, or toggled.
                    </p>
                </div>

                {loading ? (
                    <div className="flex items-center justify-center py-24 gap-3">
                        <div className="h-2 w-2 bg-sky-600 rounded-full animate-bounce" />
                        <div className="h-2 w-2 bg-sky-600 rounded-full animate-bounce delay-100" />
                        <div className="h-2 w-2 bg-sky-600 rounded-full animate-bounce delay-200" />
                    </div>
                ) : (
                    <>
                        {/* Period Cards */}
                        <div className="space-y-4">
                            <AnimatePresence>
                                {periods.map((p, idx) => (
                                    <motion.div
                                        key={p._tempId}
                                        initial={{ opacity: 0, y: -10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, scale: 0.95 }}
                                        transition={{ delay: idx * 0.03 }}
                                        className={`modern-card p-6 flex flex-col md:flex-row items-start md:items-center gap-6 group ${p.is_break ? 'bg-amber-50/30 border-amber-100' : ''}`}
                                    >
                                        {/* Drag Handle + Period # */}
                                        <div className="flex items-center gap-3 shrink-0">
                                            <FaGripVertical className="text-gray-200 cursor-grab" />
                                            <div className={`h-12 w-12 rounded-2xl flex items-center justify-center text-xl font-black shadow-sm ${p.is_break ? 'bg-amber-100 text-amber-600' : 'bg-sky-600 text-white shadow-sky-100'}`}>
                                                {p.is_break ? '☕' : p.period_number}
                                            </div>
                                        </div>

                                        {/* Label */}
                                        <div className="flex-1 min-w-[140px]">
                                            <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-2">Label</label>
                                            <input
                                                type="text"
                                                value={p.label}
                                                onChange={e => updatePeriod(p._tempId, 'label', e.target.value)}
                                                placeholder={`Period ${p.period_number}`}
                                                className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl font-black text-sm text-gray-700 outline-none focus:ring-4 focus:ring-sky-100 focus:border-sky-500 transition-all"
                                            />
                                        </div>

                                        {/* Start Time */}
                                        <div className="min-w-[140px]">
                                            <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-2">Start Time</label>
                                            <div className="relative">
                                                <FaClock className="absolute left-3 top-1/2 -translate-y-1/2 text-sky-300 text-xs" />
                                                <input
                                                    type="time"
                                                    value={p.start_time || ''}
                                                    onChange={e => updatePeriod(p._tempId, 'start_time', e.target.value)}
                                                    className="w-full pl-8 pr-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl font-black text-sm text-gray-700 outline-none focus:ring-4 focus:ring-sky-100 focus:border-sky-500 transition-all"
                                                />
                                                <p className="absolute -bottom-5 left-1 text-[8px] font-black text-sky-400/60 uppercase tracking-widest">{p.start_time && to12h(p.start_time)}</p>
                                            </div>
                                        </div>

                                        {/* Divider Arrow */}
                                        <div className="text-gray-300 font-black text-lg hidden md:block">→</div>

                                        {/* End Time */}
                                        <div className="min-w-[140px]">
                                            <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-2">End Time</label>
                                            <div className="relative">
                                                <FaClock className="absolute left-3 top-1/2 -translate-y-1/2 text-sky-300 text-xs" />
                                                <input
                                                    type="time"
                                                    value={p.end_time || ''}
                                                    onChange={e => updatePeriod(p._tempId, 'end_time', e.target.value)}
                                                    className="w-full pl-8 pr-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl font-black text-sm text-gray-700 outline-none focus:ring-4 focus:ring-sky-100 focus:border-sky-500 transition-all"
                                                />
                                                <p className="absolute -bottom-5 left-1 text-[8px] font-black text-sky-400/60 uppercase tracking-widest">{p.end_time && to12h(p.end_time)}</p>
                                            </div>
                                        </div>

                                        {/* Duration Badge */}
                                        {p.start_time && p.end_time && (() => {
                                            const [sh, sm] = p.start_time.split(':').map(Number);
                                            const [eh, em] = p.end_time.split(':').map(Number);
                                            const dur = (eh * 60 + em) - (sh * 60 + sm);
                                            return dur > 0 ? (
                                                <div className={`px-4 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest shrink-0 ${p.is_break ? 'bg-amber-100 text-amber-700' : 'bg-sky-50 text-sky-600'}`}>
                                                    {dur} min
                                                </div>
                                            ) : null;
                                        })()}

                                        {/* Break Toggle */}
                                        <div className="flex flex-col items-center gap-1 shrink-0">
                                            <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Break</label>
                                            <button
                                                type="button"
                                                onClick={() => updatePeriod(p._tempId, 'is_break', !p.is_break)}
                                                className={`text-2xl transition-all ${p.is_break ? 'text-amber-500' : 'text-gray-200 hover:text-amber-300'}`}
                                            >
                                                {p.is_break ? <FaToggleOn /> : <FaToggleOff />}
                                            </button>
                                        </div>

                                        {/* Delete */}
                                        <button
                                            onClick={() => removePeriod(p._tempId)}
                                            className="h-10 w-10 rounded-2xl bg-rose-50 text-rose-400 hover:bg-rose-500 hover:text-white transition-all flex items-center justify-center shrink-0 opacity-0 group-hover:opacity-100 active:scale-90"
                                        >
                                            <FaTrash size={13} />
                                        </button>
                                    </motion.div>
                                ))}
                            </AnimatePresence>

                            {/* Add Period Card */}
                            <motion.button
                                onClick={addPeriod}
                                whileHover={{ scale: 1.01 }}
                                className="w-full py-6 border-2 border-dashed border-sky-100 rounded-3xl text-sky-300 hover:border-sky-400 hover:text-sky-500 hover:bg-sky-50/30 transition-all flex items-center justify-center gap-3 font-black text-sm uppercase tracking-widest"
                            >
                                <FaPlus /> Add Another Period
                            </motion.button>
                        </div>

                        {/* Visual Timeline */}
                        {periods.filter(p => p.start_time && p.end_time).length > 0 && (
                            <div className="mt-12">
                                <h2 className="text-sm font-black text-gray-500 uppercase tracking-[0.3em] mb-6">Visual Day Timeline</h2>
                                <div className="modern-card p-8 overflow-x-auto">
                                    <div className="relative flex items-stretch gap-1 min-w-[600px]">
                                        {periods.map((p, idx) => {
                                            if (!p.start_time || !p.end_time) return null;
                                            const [sh, sm] = p.start_time.split(':').map(Number);
                                            const [eh, em] = p.end_time.split(':').map(Number);
                                            const dur = (eh * 60 + em) - (sh * 60 + sm);
                                            const flex = Math.max(dur, 10);
                                            return (
                                                <motion.div
                                                    key={p._tempId}
                                                    initial={{ opacity: 0, scaleY: 0.5 }}
                                                    animate={{ opacity: 1, scaleY: 1 }}
                                                    transition={{ delay: idx * 0.05 }}
                                                    style={{ flex }}
                                                    className={`rounded-2xl p-3 flex flex-col justify-between min-w-[60px] ${p.is_break ? 'bg-amber-100 border-2 border-amber-200' : 'bg-sky-600 border-2 border-sky-700'}`}
                                                >
                                                    <p className={`text-[8px] font-black uppercase tracking-widest truncate ${p.is_break ? 'text-amber-700' : 'text-sky-100'}`}>{p.label}</p>
                                                    <div>
                                                        <p className={`text-[9px] font-black ${p.is_break ? 'text-amber-600' : 'text-white'}`}>{to12h(p.start_time)}</p>
                                                        <p className={`text-[8px] font-bold ${p.is_break ? 'text-amber-400' : 'text-sky-200'}`}>{to12h(p.end_time)}</p>
                                                    </div>
                                                </motion.div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </motion.div>
        </Layout>
    );
};

export default TimetableSetup;
