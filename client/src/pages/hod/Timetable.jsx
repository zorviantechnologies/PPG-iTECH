import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Layout from '../../components/Layout';
import api from '../../utils/api';
import Swal from 'sweetalert2';
import { useAuth } from '../../context/AuthContext';
import { finalizePrintWindow } from '../../utils/printUtils';
import { FaPlus, FaTrash, FaEdit, FaSearch, FaCalendarAlt, FaUserTie, FaClock, FaDoorOpen, FaBookOpen, FaArrowLeft, FaPrint, FaFileAlt } from 'react-icons/fa';
import { motion, AnimatePresence } from 'framer-motion';
import { useTimetableConfig } from '../../hooks/useTimetableConfig';

const to12h = (timeStr) => {
    if (!timeStr) return '';
    const [h, m] = timeStr.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
};

const Timetable = ({ showToggle = true }) => {
    const { user } = useAuth();
    const { empId } = useParams();
    const navigate = useNavigate();
    // viewOnlyMode: opened from a Schedule button for a specific staff — lock to that staff only
    const viewOnlyMode = !!empId;
    const [view, setView] = useState('my'); // 'my' or 'staff'
    const [timetable, setTimetable] = useState([]);
    const [staffList, setStaffList] = useState([]);
    const [selectedStaff, setSelectedStaff] = useState('');
    const [loading, setLoading] = useState(false);
    const { config: periodConfig, teachingPeriods, periodNumbers, allSlots, getPeriodConfig } = useTimetableConfig();

    const isManager = user?.role === 'admin' || user?.role === 'hod' || user?.role === 'principal';
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    useEffect(() => {
        if (!user) return;
        if (empId) {
            setView('staff');
            setSelectedStaff(empId);
        }
    }, [empId, user]);

    useEffect(() => {
        fetchStaff();
    }, []);

    useEffect(() => {
        fetchTimetable();
    }, [view, selectedStaff]);

    const fetchStaff = async () => {
        try {
            // Fetch all staff across departments to allow viewing their schedules
            const { data } = await api.get('/employees?all=true');
            setStaffList(data);
        } catch (error) { console.error(error); }
    };

    const fetchTimetable = async () => {
        setLoading(true);
        try {
            let query = '/timetable';
            if (view === 'staff') {
                if (!selectedStaff) {
                    setTimetable([]);
                    setLoading(false);
                    return;
                }
                query += `?emp_id=${selectedStaff}`;
            }
            const { data } = await api.get(query);
            setTimetable(data);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const handleAction = async (entry = null) => {
        const currentStaffId = entry?.emp_id || (view === 'staff' ? selectedStaff : user.emp_id);
        const pCfg = entry?.period_number ? getPeriodConfig(entry.period_number) : null;
        const initStart = (entry?.start_time || pCfg?.start_time || '').slice(0, 5);
        const initEnd = (entry?.end_time || pCfg?.end_time || '').slice(0, 5);

        const { value: formValues } = await Swal.fire({
            title: entry ? 'Edit Period' : 'Add New Period',
            showCloseButton: true,
            html: `
                <div class="swal-custom-form">                    <div class="swal-field-group">
                        <label>Staff Member</label>
                        <input id="swal_emp_id" value="${currentStaffId}" type="hidden">
                        <div style="padding:10px 14px; background:#f8fafc; border:2px solid #f1f5f9; border-radius:14px; font-weight:700; font-size:14px; color:#303c54;">
                            ${staffList.find(s => s.emp_id === currentStaffId)?.name || user.name}
                        </div>
                    </div>

                    <div class="swal-field-group">
                         <label>Day of Week</label>
                         <select id="day_of_week" class="swal2-input custom-select">
                             ${['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map(d => `<option value="${d}" ${entry?.day_of_week === d ? 'selected' : ''}>${d}</option>`).join('')}
                         </select>
                     </div>
                     <div class="swal-field-group">
                         <label>Period Number</label>
                         <select id="period_number" class="swal2-input custom-select" onchange="
                             var cfg = ${JSON.stringify(periodConfig)};
                             var sel = this.value;
                             var p = cfg.find(function(c){ return c.period_number == sel; });
                             if(p){ document.getElementById('start_time').value = p.start_time ? p.start_time.slice(0,5) : ''; document.getElementById('end_time').value = p.end_time ? p.end_time.slice(0,5) : ''; }
                         ">
                             ${teachingPeriods.map(p => `<option value="${p.period_number}" ${entry?.period_number === p.period_number ? 'selected' : ''}>${p.label || 'Period ' + p.period_number}${p.start_time ? ' (' + to12h(p.start_time) + ' – ' + to12h(p.end_time) + ')' : ''}</option>`).join('')}
                         </select>
                     </div>
                     <div class="swal-field-group">
                        <label>Subject Name</label>
                        <input id="subject" class="swal2-input" placeholder="Enter Subject..." value="${entry?.subject || ''}">
                    </div>
                    <div class="swal-field-group half">
                        <label>Subject Code</label>
                        <input id="subject_code" class="swal2-input" placeholder="E.g. CS601" value="${entry?.subject_code || ''}">
                    </div>
                    <div class="swal-field-group half">
                        <label>Room Number</label>
                        <input id="room_number" class="swal2-input" placeholder="Room #" value="${entry?.room_number || ''}">
                    </div>
                    <div class="swal-field-group half">
                       <label>Start Time</label>
                       <input id="start_time" type="time" class="swal2-input" value="${initStart}">
                    </div>
                    <div class="swal-field-group half">
                       <label>End Time</label>
                       <input id="end_time" type="time" class="swal2-input" value="${initEnd}">
                    </div>
                </div>
            `,
            focusConfirm: false,
            confirmButtonColor: '#2563eb',
            confirmButtonText: entry ? 'Update Schedule' : 'Add Period',
            background: '#fff',
            color: '#1e3a8a',
            customClass: {
                popup: 'swal-modern-popup'
            },
            preConfirm: () => {
                const emp_id = document.getElementById('swal_emp_id')?.value;
                if (!emp_id) {
                    Swal.showValidationMessage('Please select a staff member');
                    return false;
                }
                const periodRaw = document.getElementById('period_number')?.value;
                const period_number = parseInt(periodRaw, 10);
                if (!periodRaw || isNaN(period_number)) {
                    Swal.showValidationMessage('Please select a valid period');
                    return false;
                }
                const subject = document.getElementById('subject')?.value?.trim();
                if (!subject) {
                    Swal.showValidationMessage('Please enter a subject name');
                    return false;
                }
                // Use config times as default if staff left times blank
                const cfgPeriod = getPeriodConfig(period_number);
                const startEl = document.getElementById('start_time');
                const endEl = document.getElementById('end_time');
                const start_time = startEl?.value || (cfgPeriod?.start_time ? cfgPeriod.start_time.slice(0, 5) : null);
                const end_time = endEl?.value || (cfgPeriod?.end_time ? cfgPeriod.end_time.slice(0, 5) : null);
                return {
                    emp_id,
                    day_of_week: document.getElementById('day_of_week').value,
                    period_number,
                    subject,
                    subject_code: document.getElementById('subject_code')?.value || '',
                    room_number: document.getElementById('room_number')?.value || '',
                    start_time,
                    end_time
                };
            }
        });

        if (formValues) {
            try {
                if (entry) {
                    await api.put(`/timetable/${entry.id}`, formValues);
                } else {
                    await api.post('/timetable', formValues);
                }
                Swal.fire({
                    title: 'Schedule Updated',
                    text: entry ? 'Schedule updated successfully.' : 'New period added.',
                    icon: 'success',
                    confirmButtonColor: '#2563eb'
                });
                fetchTimetable();
            } catch (error) {
                const msg = error.response?.data?.message || error.message || 'Operation failed';
                Swal.fire({ title: 'Error', text: msg, icon: 'error', confirmButtonColor: '#2563eb' });
            }
        }
    };

    const handleDelete = async (id) => {
        const result = await Swal.fire({
            title: 'Delete Period?',
            text: "This will permanently remove this period from the timetable.",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#ef4444',
            confirmButtonText: 'Yes, Delete',
            background: '#fff',
            color: '#1e3a8a'
        });

        if (result.isConfirmed) {
            try {
                await api.delete(`/timetable/${id}`);
                fetchTimetable();
                Swal.fire({
                    title: 'Deleted!',
                    text: 'Entry has been removed.',
                    icon: 'success',
                    confirmButtonColor: '#2563eb'
                });
            } catch (error) {
                Swal.fire('Error', 'Failed to delete', 'error');
            }
        }
    };

    const periods = periodNumbers.length > 0 ? periodNumbers : [1, 2, 3, 4, 5, 6, 7, 8];
    const displaySlots = allSlots.length > 0 ? allSlots : periodConfig;

    if (!user || loading) return (
        <Layout>
            <div className="flex flex-col items-center justify-center py-32 gap-4">
                <div className="h-12 w-12 border-4 border-sky-100 border-t-sky-600 rounded-full animate-spin" />
                <p className="text-[10px] font-black text-sky-500 uppercase tracking-widest">Initialising Schedule...</p>
            </div>
        </Layout>
    );

    const handlePrint = async () => {
        const printWindow = window.open('', '_blank', 'width=1200,height=800');
        if (!printWindow) return;

        const staffName = view === 'staff'
            ? (staffList.find(s => s.emp_id === selectedStaff)?.name || selectedStaff)
            : (staffList.find(s => s.emp_id === user.emp_id)?.name || user.name || 'My Timetable');

        const slotsHtml = displaySlots.map(slot => {
                if (slot.is_break) return `<th class="break-col"></th>`; 
            return `<th>${slot.label || 'Period ' + slot.period_number} &bull; <span style="font-size:7pt;font-weight:400;color:#6b7280;">${slot.start_time ? to12h(slot.start_time) + ' – ' + to12h(slot.end_time) : ''}</span></th>`;
        }).join('');

        const rowsHtml = days.map((day, dIdx) => {
            const cells = displaySlots.map(slot => {
                        if (slot.is_break) {
                    if (dIdx !== 0) return '';
                    return `<td class="break-col" rowspan="${days.length}" style="vertical-align:middle; text-align:center;">
                        <div style="display:inline-block; writing-mode:vertical-rl; transform:rotate(180deg); white-space:nowrap;">
                            <span style="font-weight:900;color:#c2410c;margin-bottom:4px;font-size:7pt;text-transform:uppercase;letter-spacing:2px;">BREAK</span>
                            <span style="font-weight:700;color:#c2410c;opacity:0.6;font-size:5.5pt;text-align:center;">
                                ${slot.start_time ? to12h(slot.start_time) + ' – ' + to12h(slot.end_time) : ''}
                            </span>
                        </div>
                    </td>`;
                }
                const p = slot.period_number;
                const entries = timetable.filter(t => t.day_of_week === day && t.period_number === p);
                if (entries.length === 0) return `<td class="empty"></td>`;
                return `<td>${entries.map(e => `<div style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;"><strong>${e.subject || '—'}</strong>${e.subject_code ? ` <span class="code">(${e.subject_code})</span>` : ''}</div><div style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${e.room_number ? `<span class="room">Room: ${e.room_number}</span>` : ''}${e.staff_name ? ` &bull; <span class="staff">${e.staff_name}</span>` : ''}</div>`).join('<hr style="margin:2px 0;border-color:#e5e7eb;">')}</td>`;
            }).join('');
            return `<tr><td class="day-col">${day}</td>${cells}</tr>`;
        }).join('');

        printWindow.document.write(`<!doctype html><html><head><meta charset="UTF-8"><title>Timetable – ${staffName}</title>
        <style>
            @page { size: landscape; margin: 0.6cm; }
            * { box-sizing: border-box; }
            body { font-family: Arial, Helvetica, sans-serif; font-size: 9pt; color: #111827; margin: 0; padding: 12px; position: relative; }
            .print-brand { position: absolute; top: 12px; right: 12px; text-align: right; }
            .print-brand .app-name { font-size: 11pt; font-weight: 800; color: #1e3a8a; margin: 0; letter-spacing: 0.5px; }
            .print-brand .print-time { font-size: 8pt; color: #6b7280; margin: 2px 0 0; }
            h1 { margin: 0 0 4px; font-size: 15pt; font-weight: 800; color: #1e3a8a; }
            .meta { margin-bottom: 12px; font-size: 9pt; color: #6b7280; border-bottom: 2px solid #e0e7ff; padding-bottom: 6px; }
            table { width: 100%; border-collapse: collapse; table-layout: fixed; }
            th, td { border: 1px solid #9ca3af; padding: 4px 5px; font-size: 8pt; vertical-align: top; word-wrap: normal; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            th { background: #e5e7eb; font-weight: 700; text-transform: uppercase; font-size: 7.5pt; letter-spacing: 0.1px; color: #374151; text-align: center; }
            th.break-col { border-bottom: none !important; }
            td.break-col { border-top: none !important; }
            .day-col { width: 8%; font-weight: 700; text-align: center; background: #f1f5f9; color: #1e40af; text-transform: uppercase; font-size: 8pt; }
            .break-col { background: #fff7ed; color: #c2410c; text-align: center; font-size: 7.5pt; font-weight: 800; padding: 4px; }
            /* removed vertical divider for break column */
            .empty { background: #f9fafb; }
            .code { font-size: 7.5pt; color: #2563eb; font-weight: 700; }
            .room { font-size: 7.5pt; color: #059669; }
            .staff { font-size: 7.5pt; color: #7c3aed; }
            tr:hover { background: #f3f4f6; }
            @media print { body { padding: 0; } tr { page-break-inside: avoid; } thead { display: table-header-group; } }
        </style></head><body>
        <div class="print-brand"><p class="app-name">PPG EMP HUB</p><p class="print-time">${new Date().toLocaleString('en-GB')}</p></div>
        <h1>Timetable</h1>
        <div class="meta">Staff: <strong>${staffName}</strong> &nbsp;|&nbsp; Printed: ${new Date().toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}</div>
        <table><thead><tr><th class="day-col">Day</th>${slotsHtml}</tr></thead><tbody>${rowsHtml}</tbody></table>
        </body></html>`);
        printWindow.document.close();
        await finalizePrintWindow({
            printWindow,
            title: `Timetable - ${staffName}`,
            delay: 250,
            modeLabel: 'the timetable report'
        });
    };

    return (
        <Layout>
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
            >
                {/* Header */}
                <div className="flex flex-col justify-between items-start mb-10 gap-6">
                    <div className="flex items-center gap-4">
                        {viewOnlyMode && (
                            <button
                                onClick={() => navigate(-1)}
                                className="h-12 w-12 rounded-2xl bg-white border border-gray-100 flex items-center justify-center text-gray-400 hover:bg-sky-50 hover:text-sky-600 transition-all shadow-sm active:scale-90"
                            >
                                <FaArrowLeft size={16} />
                            </button>
                        )}
                        <div>
                            <h1 className="text-3xl font-black text-gray-800 tracking-tight">Timetable</h1>
                            {viewOnlyMode ? (
                                <p className="text-gray-500 font-medium mt-1">
                                    Viewing schedule for: <span className="font-black text-sky-600">
                                        {staffList.find(s => s.emp_id === empId)?.name || empId}
                                    </span>
                                </p>
                            ) : (
                                null
                            )}
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        {/* Only show the My/Staff toggle when NOT in view-only mode */}
                        {!viewOnlyMode && (
                            <div className="flex items-center gap-4 bg-white p-2 rounded-2xl shadow-xl shadow-sky-50/50 border border-sky-50">
                                {isManager && showToggle && (
                                    <div className="flex p-1 bg-gray-50 rounded-xl border border-gray-100/50">
                                        <button
                                            onClick={() => setView('my')}
                                            className={`px-6 py-2.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${view === 'my' ? 'bg-sky-600 text-white shadow-lg shadow-sky-100' : 'text-gray-400 hover:text-sky-600'}`}
                                        >
                                            My Timetable
                                        </button>
                                        <button
                                            onClick={() => setView('staff')}
                                            className={`px-6 py-2.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${view === 'staff' ? 'bg-sky-600 text-white shadow-lg shadow-sky-100' : 'text-gray-400 hover:text-sky-600'}`}
                                        >
                                            Staff Timetable
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                        {/* Print Button */}
                        <button
                            onClick={handlePrint}
                            className="no-print flex items-center gap-2 px-6 py-2.5 bg-sky-600 text-white rounded-xl font-bold hover:bg-sky-700 transition-all shadow-lg shadow-sky-200 active:scale-95"
                        >
                            <FaFileAlt /> Report Timetable
                        </button>
                    </div>
                </div>

                {/* Staff selector: only shown in 'staff' view AND not in view-only mode */}
                {view === 'staff' && isManager && !viewOnlyMode && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-white p-8 rounded-3xl shadow-xl shadow-sky-50/50 mb-10 border border-sky-50 flex flex-col gap-6 items-end"
                    >
                        <div className="flex-1 w-full text-left">
                            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 ml-1">Select Staff</label>
                            <div className="relative group">
                                <FaUserTie className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300 group-focus-within:text-sky-500 transition-colors" />
                                <select
                                    className="w-full pl-12 pr-4 py-4 bg-gray-50 border border-gray-100 rounded-2xl outline-none focus:ring-4 focus:ring-sky-100 focus:border-sky-500 transition-all font-bold text-gray-700 text-sm appearance-none"
                                    value={selectedStaff}
                                    onChange={(e) => setSelectedStaff(e.target.value)}
                                >
                                    <option value="">Select Staff...</option>
                                    {staffList.map(s => <option key={s.emp_id} value={s.emp_id}>{s.name} ({s.designation})</option>)}
                                </select>
                            </div>
                        </div>
                    </motion.div>
                )}

                <div className="styled-table-container modern-card !p-0 overflow-hidden border-sky-100">
                    <div className="overflow-x-auto -mx-0">
                        <table className="w-full border-collapse min-w-[980px] md:min-w-[1100px] table-fixed">
                            <thead>
                                <tr className="bg-sky-50/50">
                                    <th
                                        className="p-3 border-b border-r border-sky-100 font-black text-[10px] text-sky-500 tracking-[0.08em] text-center w-32 md:w-40 whitespace-nowrap"
                                        style={{ writingMode: 'horizontal-tb', textOrientation: 'mixed', transform: 'none', minWidth: '160px', maxWidth: '160px', whiteSpace: 'nowrap', wordBreak: 'normal' }}
                                    >
                                        Timeline
                                    </th>
                                    {displaySlots.map((slot, idx) => {
                                        const isBreak = slot.is_break;
                                        return (
                                            <th key={idx} className={`border-r text-center ${isBreak ? 'bg-slate-50 border-sky-100 border-b-0' : 'p-4 border-b border-sky-100'}`} style={{ width: `${100 / displaySlots.length}%`, minWidth: isBreak ? '44px' : '140px' }}>
                                                {!isBreak && (
                                                    <>
                                                        <div className="flex items-center justify-center gap-2">
                                                            <p className={`font-black text-[10px] uppercase tracking-[0.2em] text-gray-600`}>
                                                                {slot.label || (slot.period_number ? `Period ${slot.period_number}` : '')}
                                                            </p>
                                                        </div>
                                                        {slot.start_time && (
                                                            <p className={`text-[9px] font-bold mt-0.5 text-gray-300`}>
                                                                {to12h(slot.start_time)} – {to12h(slot.end_time)}
                                                            </p>
                                                        )}
                                                    </>
                                                )}
                                            </th>
                                        );
                                    })}
                                </tr>
                            </thead>
                            <tbody>
                                {days.map((day, dIdx) => (
                                    <tr key={day} className="group">
                                        <td
                                            className="p-3 border-b border-r border-sky-50 bg-gray-50/30 text-center font-black text-gray-700 text-[11px] lg:text-xs tracking-[0.08em] whitespace-nowrap w-32 md:w-40"
                                            style={{ writingMode: 'horizontal-tb', textOrientation: 'mixed', transform: 'none', minWidth: '160px', maxWidth: '160px', whiteSpace: 'nowrap', wordBreak: 'normal' }}
                                        >
                                            {day}
                                        </td>
                                        {displaySlots.map((slot, idx) => {
                                            const isBreak = slot.is_break;
                                            if (isBreak) {
                                                if (dIdx !== 0) return null;
                                                return (
                                                    <td key={idx} rowSpan={days.length} className="border-b border-r border-sky-100 bg-orange-50/50 align-middle text-center p-2 relative group">
                                                        <div className="relative h-full flex items-center justify-center pointer-events-none">
                                                            <div className="whitespace-nowrap font-black uppercase tracking-[0.2em]" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
                                                                <span className="text-[10px] text-orange-600">Break</span>
                                                                <span className="text-[8px] text-orange-300 mx-2 px-1 text-center font-bold">——</span>
                                                                <span className="text-[8px] font-bold text-orange-400">
                                                                    {slot.start_time ? `${to12h(slot.start_time)} - ${to12h(slot.end_time)}` : ''}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </td>
                                                );
                                            }
                                            const p = slot.period_number;
                                            const entries = timetable.filter(t => t.day_of_week === day && t.period_number === p);
                                            return (
                                                <td key={idx} className="p-2 border-b border-r border-sky-50 align-top h-24 relative group/cell hover:bg-sky-50/20 transition-all w-[140px] max-w-[140px]">
                                                    <AnimatePresence>
                                                        {entries.map((entry, eIdx) => (
                                                            <motion.div
                                                                key={entry.id}
                                                                initial={{ opacity: 0, scale: 0.95 }}
                                                                animate={{ opacity: 1, scale: 1 }}
                                                                className="h-full min-w-0 bg-white border-2 border-sky-100 p-2.5 md:p-3 rounded-2xl shadow-lg shadow-sky-50/50 flex flex-col justify-between overflow-hidden relative group/entry hover:border-sky-500 transition-all"
                                                            >
                                                                <div className="space-y-2 min-w-0">
                                                                    <div className="flex items-start justify-between gap-2">
                                                                        <span className="px-2 py-0.5 bg-sky-100 text-sky-600 rounded-lg text-[8px] font-black uppercase tracking-widest max-w-[70px] truncate">{entry.subject_code || 'N/A'}</span>
                                                                        <div className="flex gap-2 opacity-100 md:opacity-0 md:group-hover/entry:opacity-100 transition-all md:transform md:translate-y-[-10px] md:group-hover/entry:translate-y-0">
                                                                            <button onClick={() => handleAction(entry)} className="text-sky-400 hover:text-sky-600 transition-colors"><FaEdit size={12} /></button>
                                                                            <button onClick={() => handleDelete(entry.id)} className="text-rose-400 hover:text-rose-600 transition-colors"><FaTrash size={12} /></button>
                                                                        </div>
                                                                    </div>
                                                                    <p className="text-xs md:text-sm font-black text-gray-800 tracking-tight line-clamp-2 leading-snug break-words">{entry.subject}</p>
                                                                </div>

                                                                <div className="mt-2 pt-2 border-t border-gray-50 flex flex-col gap-1 min-w-0">
                                                                    <div className="flex items-center gap-2 text-[8px] md:text-[10px] font-black text-gray-400 uppercase tracking-widest min-w-0">
                                                                        <FaClock className="text-sky-300" />
                                                                        <span className="truncate">{to12h(getPeriodConfig(entry.period_number)?.start_time || entry.start_time)} - {to12h(getPeriodConfig(entry.period_number)?.end_time || entry.end_time)}</span>
                                                                    </div>
                                                                    {entry.room_number && (
                                                                        <div className="flex items-center gap-1.5 text-[8px] md:text-[9px] font-black text-sky-500 uppercase tracking-widest min-w-0">
                                                                            <FaDoorOpen size={10} /> <span className="truncate">{entry.room_number}</span>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </motion.div>
                                                        ))}
                                                    </AnimatePresence>

                                                    {entries.length === 0 && (isManager || view === 'my') && (
                                                        <div className="h-full flex items-center justify-center opacity-100 md:opacity-0 md:group-hover/cell:opacity-100 transition-all duration-300 md:transform md:scale-95 md:group-hover/cell:scale-100">
                                                            <button
                                                                onClick={() => handleAction({ day_of_week: day, period_number: p })}
                                                                className="w-full h-full flex flex-col items-center justify-center text-gray-200 border-2 border-dashed border-gray-100 rounded-2xl hover:border-sky-200 hover:text-sky-300 hover:bg-white transition-all gap-2"
                                                            >
                                                                <div className="h-10 w-10 rounded-full bg-gray-50 flex items-center justify-center group-hover/cell:bg-sky-50 transition-colors">
                                                                    <FaPlus size={16} />
                                                                </div>
                                                                <span className="text-[9px] font-black uppercase tracking-widest">Add Period</span>
                                                            </button>
                                                        </div>
                                                    )}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {loading && (
                    <div className="mt-8 flex items-center justify-center gap-3">
                        <div className="h-2 w-2 bg-sky-600 rounded-full animate-bounce"></div>
                        <div className="h-2 w-2 bg-sky-600 rounded-full animate-bounce delay-100"></div>
                        <div className="h-2 w-2 bg-sky-600 rounded-full animate-bounce delay-200"></div>
                        <span className="text-[10px] font-black text-sky-600 uppercase tracking-widest ml-2">Syncing Grid States...</span>
                    </div>
                )}
            </motion.div>
        </Layout >
    );
};

export default Timetable;

