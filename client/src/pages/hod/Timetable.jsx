import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Layout from '../../components/Layout';
import api from '../../utils/api';
import Swal from 'sweetalert2';
import { useAuth } from '../../context/AuthContext';
import { finalizePrintWindow } from '../../utils/printUtils';
import { 
    FaPlus, FaTrash, FaEdit, FaUserTie, FaClock, FaDoorOpen, 
    FaBookOpen, FaArrowLeft, FaFileAlt, FaBuilding, FaGraduationCap, 
    FaCalendarAlt, FaLayerGroup, FaFilter, FaInfoCircle,
    FaFileExcel, FaUpload, FaDownload, FaTimes, FaCheckCircle, FaCog
} from 'react-icons/fa';
import { motion, AnimatePresence } from 'framer-motion';
import { useTimetableConfig } from '../../hooks/useTimetableConfig';
import * as XLSX from 'xlsx';

const to12h = (timeStr) => {
    if (!timeStr) return '';
    const [h, m] = timeStr.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
};

const Timetable = ({ showToggle = true }) => {
    const { user, activeModule } = useAuth();
    const { empId } = useParams();
    const navigate = useNavigate();

    const isAdminStudentPage = ['admin', 'accounts'].includes(user?.role) && activeModule === 'students';

    const viewOnlyMode = !!empId;
    const [view, setView] = useState(() => {
        if (empId) return 'staff';
        if (['admin', 'accounts', 'hod'].includes(user?.role)) return 'class';
        return 'my';
    });

    const [timetable, setTimetable] = useState([]);
    const [staffList, setStaffList] = useState([]);
    const [departments, setDepartments] = useState([]);
    
    // Class Timetable Filters
    const [selectedDept, setSelectedDept] = useState('');
    const [selectedYear, setSelectedYear] = useState('3'); // Default 3rd Year as in user prompt example
    const [selectedSem, setSelectedSem] = useState('5');   // Default Semester 5
    const [selectedSec, setSelectedSec] = useState('A');
    
    // Staff view filter
    const [selectedStaff, setSelectedStaff] = useState('');
    const [loading, setLoading] = useState(false);

    // Excel Upload Modal & State
    const [showExcelModal, setShowExcelModal] = useState(false);
    const [excelPreview, setExcelPreview] = useState([]);
    const [uploadingExcel, setUploadingExcel] = useState(false);

    const { config: periodConfig, teachingPeriods, periodNumbers, allSlots, getPeriodConfig } = useTimetableConfig();

    const isManager = user?.role === 'admin' || user?.role === 'hod' || user?.role === 'principal' || user?.role === 'accounts';
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
        fetchDepartments();
    }, []);

    useEffect(() => {
        fetchTimetable();
    }, [view, selectedStaff, selectedDept, selectedYear, selectedSem, selectedSec]);

    const fetchStaff = async () => {
        try {
            const { data } = await api.get('/employees?all=true');
            setStaffList(data || []);
        } catch (error) { console.error(error); }
    };

    const fetchDepartments = async () => {
        try {
            const { data } = await api.get('/departments');
            setDepartments(data || []);
            if (data.length > 0 && !selectedDept) {
                const userDept = user?.department_id ? String(user.department_id) : String(data[0].id);
                setSelectedDept(userDept);
            }
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
            } else if (view === 'class') {
                if (!selectedDept || !selectedYear || !selectedSem) {
                    setTimetable([]);
                    setLoading(false);
                    return;
                }
                query += `?department_id=${selectedDept}&academic_year=${selectedYear}&semester=${selectedSem}&section=${selectedSec}`;
            }

            const { data } = await api.get(query);
            setTimetable(data || []);
        } catch (error) {
            console.error('Fetch Timetable Error:', error);
        } finally {
            setLoading(false);
        }
    };

    // Excel Template Download Handler
    const handleDownloadTemplate = () => {
        const currentDeptObj = departments.find(d => String(d.id) === String(selectedDept));
        const deptCode = currentDeptObj?.code || 'DEPT';
        
        const templateData = [
            {
                "Day": "Monday",
                "Period Number": 1,
                "Start Time": "09:00",
                "End Time": "09:50",
                "Subject Name": "Data Structures & Algorithms",
                "Subject Code": "CS301",
                "Room Number": "Room 204",
                "Staff ID": "5001"
            },
            {
                "Day": "Monday",
                "Period Number": 2,
                "Start Time": "09:50",
                "End Time": "10:40",
                "Subject Name": "Database Management Systems",
                "Subject Code": "CS302",
                "Room Number": "Lab 2",
                "Staff ID": "5002"
            },
            {
                "Day": "Tuesday",
                "Period Number": 1,
                "Start Time": "09:00",
                "End Time": "09:50",
                "Subject Name": "Operating Systems",
                "Subject Code": "CS303",
                "Room Number": "Room 204",
                "Staff ID": "5003"
            },
            {
                "Day": "Wednesday",
                "Period Number": 1,
                "Start Time": "09:00",
                "End Time": "09:50",
                "Subject Name": "Computer Networks",
                "Subject Code": "CS304",
                "Room Number": "Room 204",
                "Staff ID": "5001"
            }
        ];

        const worksheet = XLSX.utils.json_to_sheet(templateData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Class Timetable");
        
        const fileName = `Timetable_Template_${deptCode}_Year${selectedYear || '3'}_Sem${selectedSem || '5'}.xlsx`;
        XLSX.writeFile(workbook, fileName);
    };

    // Excel File Selector Handler
    const handleExcelFileSelect = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const bstr = evt.target.result;
                const wb = XLSX.read(bstr, { type: 'binary' });
                const wsname = wb.SheetNames[0];
                const ws = wb.Sheets[wsname];
                const data = XLSX.utils.sheet_to_json(ws);
                
                if (!data || data.length === 0) {
                    Swal.fire('Empty File', 'The uploaded file contains no data rows.', 'warning');
                    return;
                }

                setExcelPreview(data);
                setShowExcelModal(true);
            } catch (err) {
                console.error('Excel Parsing Error:', err);
                Swal.fire('Error', 'Failed to parse Excel file. Please upload a valid .xlsx or .csv sheet.', 'error');
            }
        };
        reader.readAsBinaryString(file);

        // Reset file input so re-selecting same file triggers event
        e.target.value = '';
    };

    // Bulk Import Excel Save Handler
    const handleSaveExcelImport = async () => {
        if (!selectedDept || !selectedYear || !selectedSem) {
            Swal.fire('Selection Required', 'Please select Department, Academic Year, and Semester first.', 'warning');
            return;
        }
        if (excelPreview.length === 0) return;

        setUploadingExcel(true);
        try {
            const payload = {
                department_id: selectedDept,
                academic_year: selectedYear,
                semester: selectedSem,
                section: selectedSec,
                entries: excelPreview
            };

            const res = await api.post('/timetable/bulk', payload);
            Swal.fire({
                title: 'Timetable Imported!',
                text: res.data?.message || `Successfully saved ${excelPreview.length} period entries.`,
                icon: 'success',
                confirmButtonColor: '#2563eb'
            });

            setShowExcelModal(false);
            setExcelPreview([]);
            fetchTimetable();
        } catch (err) {
            console.error('Save Excel Error:', err);
            Swal.fire('Import Failed', err.response?.data?.message || err.message || 'Failed to save timetable entries', 'error');
        } finally {
            setUploadingExcel(false);
        }
    };

    const handleAction = async (entry = null) => {
        if (view === 'class' && (!selectedDept || !selectedYear || !selectedSem)) {
            Swal.fire('Filter Required', 'Please select Department, Academic Year, and Semester first.', 'warning');
            return;
        }

        const currentStaffId = entry?.emp_id || (view === 'staff' ? selectedStaff : '');
        const pCfg = entry?.period_number ? getPeriodConfig(entry.period_number) : null;
        const initStart = (entry?.start_time || pCfg?.start_time || '').slice(0, 5);
        const initEnd = (entry?.end_time || pCfg?.end_time || '').slice(0, 5);

        const staffOptionsHtml = [
            '<option value="">-- Optional / Unassigned Faculty --</option>',
            ...staffList.map(s => `<option value="${s.emp_id}" ${currentStaffId === s.emp_id ? 'selected' : ''}>${s.name} (${s.emp_id})</option>`)
        ].join('');

        const { value: formValues } = await Swal.fire({
            title: entry ? 'Edit Period Entry' : 'Add New Class Period',
            showCloseButton: true,
            html: `
                <div class="swal-custom-form">
                    <div class="swal-field-group">
                        <label>Assigned Faculty / Teacher</label>
                        <select id="swal_emp_id" class="swal2-input custom-select">
                            ${staffOptionsHtml}
                        </select>
                    </div>

                    <div class="swal-field-group">
                         <label>Day of Week</label>
                         <select id="day_of_week" class="swal2-input custom-select">
                             ${days.map(d => `<option value="${d}" ${(entry?.day_of_week || 'Monday') === d ? 'selected' : ''}>${d}</option>`).join('')}
                         </select>
                     </div>

                     <div class="swal-field-group">
                         <label>Period Slot</label>
                         <select id="period_number" class="swal2-input custom-select" onchange="
                             var cfg = ${JSON.stringify(periodConfig)};
                             var sel = this.value;
                             var p = cfg.find(function(c){ return c.period_number == sel; });
                             if(p){ 
                                 if(p.start_time) document.getElementById('start_time').value = p.start_time.slice(0,5); 
                                 if(p.end_time) document.getElementById('end_time').value = p.end_time.slice(0,5); 
                             }
                         ">
                             ${teachingPeriods.map(p => `<option value="${p.period_number}" ${(entry?.period_number || 1) === p.period_number ? 'selected' : ''}>${p.label || 'Period ' + p.period_number}${p.start_time ? ' (' + to12h(p.start_time) + ' – ' + to12h(p.end_time) + ')' : ''}</option>`).join('')}
                         </select>
                     </div>

                     <div class="swal-field-group">
                        <label>Subject Name</label>
                        <input id="subject" class="swal2-input" placeholder="e.g. Data Structures & Algorithms" value="${entry?.subject || ''}">
                    </div>

                    <div class="swal-field-group half">
                        <label>Subject Code</label>
                        <input id="subject_code" class="swal2-input" placeholder="e.g. CS301" value="${entry?.subject_code || ''}">
                    </div>

                    <div class="swal-field-group half">
                        <label>Classroom / Room #</label>
                        <input id="room_number" class="swal2-input" placeholder="e.g. Room 204" value="${entry?.room_number || ''}">
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
            confirmButtonText: entry ? 'Update Period' : 'Save Period',
            background: '#fff',
            color: '#1e3a8a',
            customClass: {
                popup: 'swal-modern-popup'
            },
            preConfirm: () => {
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

                const cfgPeriod = getPeriodConfig(period_number);
                const startEl = document.getElementById('start_time');
                const endEl = document.getElementById('end_time');
                const start_time = startEl?.value || (cfgPeriod?.start_time ? cfgPeriod.start_time.slice(0, 5) : null);
                const end_time = endEl?.value || (cfgPeriod?.end_time ? cfgPeriod.end_time.slice(0, 5) : null);

                return {
                    emp_id: document.getElementById('swal_emp_id')?.value || null,
                    department_id: selectedDept ? parseInt(selectedDept, 10) : null,
                    academic_year: selectedYear ? parseInt(selectedYear, 10) : 1,
                    semester: selectedSem ? parseInt(selectedSem, 10) : 1,
                    section: selectedSec || 'A',
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
                    title: 'Timetable Updated',
                    text: entry ? 'Period entry updated successfully.' : 'New period added to class timetable.',
                    icon: 'success',
                    timer: 1500,
                    showConfirmButton: false
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
            title: 'Delete Period Entry?',
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
                    text: 'Timetable entry removed.',
                    icon: 'success',
                    timer: 1500,
                    showConfirmButton: false
                });
            } catch (error) {
                Swal.fire('Error', 'Failed to delete entry', 'error');
            }
        }
    };

    const displaySlots = allSlots.length > 0 ? allSlots : periodConfig;
    const isClassSelectionComplete = selectedDept && selectedYear && selectedSem;

    const handlePrint = async () => {
        const printWindow = window.open('', '_blank', 'width=1200,height=800');
        if (!printWindow) return;

        const currentDeptName = departments.find(d => String(d.id) === String(selectedDept))?.name || 'Department';
        const titleLabel = view === 'class'
            ? `${currentDeptName} – Year ${selectedYear} (Sem ${selectedSem}) Sec ${selectedSec}`
            : view === 'staff'
                ? (staffList.find(s => s.emp_id === selectedStaff)?.name || selectedStaff)
                : (user?.name || 'My Timetable');

        const slotsHtml = displaySlots.map(slot => {
            if (slot.is_break) return `<th class="break-col"></th>`; 
            return `<th>${slot.label || 'Period ' + slot.period_number} &bull; <span style="font-size:7pt;font-weight:400;color:#6b7280;">${slot.start_time ? to12h(slot.start_time) + ' – ' + to12h(slot.end_time) : ''}</span></th>`;
        }).join('');

        const rowsHtml = days.map((day, dIdx) => {
            const cells = displaySlots.map(slot => {
                if (slot.is_break) {
                    if (dIdx !== 0) return '';
                    return `<td class="break-col" rowspan="${days.length}" style="vertical-align:middle; text-align:center;">
                        <div style="font-weight:900; color:#c2410c; font-size:7.5pt; text-transform:uppercase; letter-spacing:1px;">BREAK</div>
                        <div style="font-weight:700; color:#ea580c; font-size:6.5pt; margin-top:2px;">
                            ${slot.start_time ? to12h(slot.start_time) + ' – ' + to12h(slot.end_time) : ''}
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

        printWindow.document.write(`<!doctype html><html><head><meta charset="UTF-8"><title>Timetable – ${titleLabel}</title>
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
            .empty { background: #f9fafb; }
            .code { font-size: 7.5pt; color: #2563eb; font-weight: 700; }
            .room { font-size: 7.5pt; color: #059669; }
            .staff { font-size: 7.5pt; color: #7c3aed; }
            tr:hover { background: #f3f4f6; }
            @media print { body { padding: 0; } tr { page-break-inside: avoid; } thead { display: table-header-group; } }
        </style></head><body>
        <div class="print-brand"><p class="app-name">PPG EMP HUB</p><p class="print-time">${new Date().toLocaleString('en-GB')}</p></div>
        <h1>Class Timetable</h1>
        <div class="meta">Class: <strong>${titleLabel}</strong> &nbsp;|&nbsp; Printed: ${new Date().toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}</div>
        <table><thead><tr><th class="day-col">Day</th>${slotsHtml}</tr></thead><tbody>${rowsHtml}</tbody></table>
        </body></html>`);
        printWindow.document.close();
        await finalizePrintWindow({
            printWindow,
            title: `Timetable - ${titleLabel}`,
            delay: 250,
            modeLabel: 'the timetable report'
        });
    };

    return (
        <Layout>
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                
                {/* Header Section */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
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
                            <h1 className="text-3xl font-black text-gray-800 tracking-tight flex items-center gap-3">
                                <FaCalendarAlt className="text-sky-600" /> Class Timetable Setup
                            </h1>
                            {!isAdminStudentPage && (
                                <p className="text-xs font-semibold text-gray-500 mt-0.5">
                                    Select Year & Department to setup timetables, import Excel sheets, and view saved schedules
                                </p>
                            )}
                        </div>
                    </div>

                    <div className="flex items-center gap-3 flex-wrap">
                        {isManager && (
                            <button
                                onClick={() => navigate('/admin/timetable-setup')}
                                className="flex items-center gap-2 px-4 py-2.5 bg-gray-50 text-gray-700 border border-gray-200 rounded-2xl font-bold text-xs hover:bg-gray-100 transition-all shadow-sm"
                            >
                                <FaCog className="text-sky-600" /> Period Timing Config
                            </button>
                        )}

                        {!viewOnlyMode && isManager && showToggle && !isAdminStudentPage && (
                            <div className="flex p-1 bg-white rounded-2xl border border-sky-100 shadow-sm">
                                <button
                                    onClick={() => setView('class')}
                                    className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${view === 'class' ? 'bg-sky-600 text-white shadow-md' : 'text-gray-500 hover:text-sky-600'}`}
                                >
                                    Class Timetable
                                </button>
                                <button
                                    onClick={() => setView('staff')}
                                    className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${view === 'staff' ? 'bg-sky-600 text-white shadow-md' : 'text-gray-500 hover:text-sky-600'}`}
                                >
                                    Faculty Timetable
                                </button>
                                <button
                                    onClick={() => setView('my')}
                                    className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${view === 'my' ? 'bg-sky-600 text-white shadow-md' : 'text-gray-500 hover:text-sky-600'}`}
                                >
                                    My Schedule
                                </button>
                            </div>
                        )}

                        <button
                            onClick={handlePrint}
                            className="flex items-center gap-2 px-5 py-2.5 bg-sky-600 text-white rounded-2xl font-bold text-xs uppercase tracking-wider hover:bg-sky-700 transition-all shadow-md shadow-sky-100 active:scale-95"
                        >
                            <FaFileAlt /> Print Report
                        </button>
                    </div>
                </div>

                {/* Filter Panel & Excel Upload Actions for Class Timetable */}
                {view === 'class' && (
                    <div className="bg-white p-6 rounded-3xl shadow-xl shadow-sky-50/50 border border-sky-50 space-y-5">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-100 pb-4">
                            <div className="flex items-center gap-2">
                                <FaFilter className="text-sky-600" />
                            </div>

                            {/* Excel Upload & Download Template Buttons */}
                            {isClassSelectionComplete && isManager && (
                                <div className="flex items-center gap-2 flex-wrap">
                                    <button
                                        onClick={handleDownloadTemplate}
                                        className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl font-bold text-xs hover:bg-emerald-100 transition-all shadow-sm active:scale-95"
                                    >
                                        <FaDownload /> Download Excel Template
                                    </button>

                                    <label className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl font-bold text-xs uppercase tracking-wider hover:bg-indigo-700 transition-all shadow-md shadow-indigo-100 active:scale-95 cursor-pointer">
                                        <FaUpload /> Upload Excel Sheet
                                        <input
                                            type="file"
                                            accept=".xlsx, .xls, .csv"
                                            onChange={handleExcelFileSelect}
                                            className="hidden"
                                        />
                                    </label>
                                </div>
                            )}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            {/* Department Select */}
                            <div>
                                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Department</label>
                                <div className="relative">
                                    <FaBuilding className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs" />
                                    <select
                                        value={selectedDept}
                                        onChange={(e) => setSelectedDept(e.target.value)}
                                        className="w-full pl-9 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl outline-none focus:ring-2 focus:ring-sky-500 font-bold text-xs text-gray-700 transition-all"
                                    >
                                        <option value="">-- Choose Department --</option>
                                        {departments.map(d => (
                                            <option key={d.id} value={d.id}>{d.name} ({d.code})</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {/* Year Select */}
                            <div>
                                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Academic Year</label>
                                <div className="relative">
                                    <FaGraduationCap className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs" />
                                    <select
                                        value={selectedYear}
                                        onChange={(e) => {
                                            const yr = e.target.value;
                                            setSelectedYear(yr);
                                            if (yr === '1') setSelectedSem('1');
                                            else if (yr === '2') setSelectedSem('3');
                                            else if (yr === '3') setSelectedSem('5');
                                            else if (yr === '4') setSelectedSem('7');
                                        }}
                                        className="w-full pl-9 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl outline-none focus:ring-2 focus:ring-sky-500 font-bold text-xs text-gray-700 transition-all"
                                    >
                                        <option value="">-- Choose Year --</option>
                                        <option value="1">Year 1 (1st Year)</option>
                                        <option value="2">Year 2 (2nd Year)</option>
                                        <option value="3">Year 3 (3rd Year)</option>
                                        <option value="4">Year 4 (4th Year)</option>
                                    </select>
                                </div>
                            </div>

                            {/* Semester Select */}
                            <div>
                                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Semester</label>
                                <div className="relative">
                                    <FaLayerGroup className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs" />
                                    <select
                                        value={selectedSem}
                                        onChange={(e) => setSelectedSem(e.target.value)}
                                        className="w-full pl-9 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl outline-none focus:ring-2 focus:ring-sky-500 font-bold text-xs text-gray-700 transition-all"
                                    >
                                        <option value="">-- Choose Semester --</option>
                                        {(selectedYear === '1' ? [1, 2] :
                                          selectedYear === '2' ? [3, 4] :
                                          selectedYear === '3' ? [5, 6] :
                                          selectedYear === '4' ? [7, 8] :
                                          [1, 2, 3, 4, 5, 6, 7, 8]).map(s => (
                                            <option key={s} value={String(s)}>Semester {s}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {/* Section Select */}
                            <div>
                                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Section</label>
                                <select
                                    value={selectedSec}
                                    onChange={(e) => setSelectedSec(e.target.value)}
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl outline-none focus:ring-2 focus:ring-sky-500 font-bold text-xs text-gray-700 transition-all"
                                >
                                    <option value="A">Section A</option>
                                    <option value="B">Section B</option>
                                    <option value="C">Section C</option>
                                    <option value="All">All Sections</option>
                                </select>
                            </div>
                        </div>
                    </div>
                )}

                {/* Filter for Faculty Timetable */}
                {view === 'staff' && isManager && !viewOnlyMode && (
                    <div className="bg-white p-6 rounded-3xl shadow-xl shadow-sky-50/50 border border-sky-50">
                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Select Faculty Member</label>
                        <div className="relative">
                            <FaUserTie className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" />
                            <select
                                className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl outline-none focus:ring-2 focus:ring-sky-500 font-bold text-sm text-gray-700"
                                value={selectedStaff}
                                onChange={(e) => setSelectedStaff(e.target.value)}
                            >
                                <option value="">Select Staff...</option>
                                {staffList.map(s => <option key={s.emp_id} value={s.emp_id}>{s.name} ({s.designation})</option>)}
                            </select>
                        </div>
                    </div>
                )}

                {/* Prompt Card if Class Selection Incomplete */}
                {view === 'class' && !isClassSelectionComplete ? (
                    <div className="bg-sky-50/60 border border-sky-100 rounded-3xl p-12 text-center space-y-3">
                        <FaInfoCircle className="text-4xl text-sky-500 mx-auto animate-bounce" />
                        <h3 className="text-lg font-black text-sky-900">Select Department, Academic Year, and Semester</h3>
                        <p className="text-xs text-sky-600 font-medium max-w-md mx-auto">
                            Please select the Department, Academic Year, and Semester above to view or upload the class timetable.
                        </p>
                    </div>
                ) : (
                    /* Timetable Grid Table */
                    <div className="styled-table-container modern-card !p-0 overflow-hidden border-sky-100 bg-white">
                        <div className="p-4 bg-gray-50/80 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
                            <div className="flex items-center gap-2 text-xs font-bold text-gray-700">
                                <FaBookOpen className="text-indigo-600" />
                                <span className="px-2.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-mono text-[10px]">
                                    {departments.find(d => String(d.id) === String(selectedDept))?.name || 'Dept'} &bull; Year {selectedYear} (Sem {selectedSem}) Sec {selectedSec}
                                </span>
                            </div>

                            {isManager && (
                                <button
                                    onClick={() => handleAction()}
                                    className="px-4 py-2 bg-sky-600 text-white rounded-xl text-xs font-black uppercase tracking-wider hover:bg-sky-700 transition-all flex items-center gap-1.5 shadow-sm active:scale-95"
                                >
                                    <FaPlus /> Add Period Slot
                                </button>
                            )}
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full border-collapse min-w-[980px] md:min-w-[1100px] table-fixed">
                                <thead>
                                    <tr className="bg-sky-50/50">
                                        <th
                                            className="p-3 border-b border-r border-sky-100 font-black text-[10px] text-sky-500 tracking-[0.08em] text-center w-32 md:w-40 whitespace-nowrap"
                                            style={{ writingMode: 'horizontal-tb', textOrientation: 'mixed', transform: 'none', whiteSpace: 'nowrap', wordBreak: 'normal' }}
                                        >
                                            Timeline
                                        </th>
                                        {displaySlots.map((slot, idx) => {
                                            const isBreak = slot.is_break;
                                            return (
                                                <th
                                                    key={idx}
                                                    className={`border-r text-center ${isBreak ? 'bg-slate-50 border-sky-100 border-b-0' : 'p-3 border-b border-sky-100'}`}
                                                    style={{ width: `${100 / displaySlots.length}%`, minWidth: isBreak ? '44px' : '140px', writingMode: 'horizontal-tb', textOrientation: 'mixed', transform: 'none', whiteSpace: 'nowrap' }}
                                                >
                                                    {!isBreak && (
                                                        <div className="flex flex-col items-center justify-center gap-0.5">
                                                            <p className="font-black text-[10px] uppercase tracking-[0.15em] text-gray-700 whitespace-nowrap">
                                                                {slot.label || (slot.period_number ? `Period ${slot.period_number}` : '')}
                                                            </p>
                                                            {slot.start_time && (
                                                                <p className="text-[9px] font-bold text-gray-400 whitespace-nowrap">
                                                                    {to12h(slot.start_time)} – {to12h(slot.end_time)}
                                                                </p>
                                                            )}
                                                        </div>
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
                                                style={{ writingMode: 'horizontal-tb', textOrientation: 'mixed', transform: 'none', whiteSpace: 'nowrap', wordBreak: 'normal' }}
                                            >
                                                {day}
                                            </td>
                                            {displaySlots.map((slot, idx) => {
                                                const isBreak = slot.is_break;
                                                if (isBreak) {
                                                    if (dIdx !== 0) return null;
                                                    return (
                                                        <td
                                                            key={idx}
                                                            rowSpan={days.length}
                                                            className="border-b border-r border-sky-100 bg-orange-50/60 align-middle text-center p-2"
                                                            style={{ writingMode: 'horizontal-tb', textOrientation: 'mixed', transform: 'none', whiteSpace: 'nowrap' }}
                                                        >
                                                            <div className="flex flex-col items-center justify-center gap-1 font-black uppercase text-orange-600">
                                                                <span className="text-[10px] tracking-wider font-extrabold whitespace-nowrap">BREAK</span>
                                                                {slot.start_time && (
                                                                    <span className="text-[8px] text-orange-400 font-bold whitespace-nowrap">
                                                                        {to12h(slot.start_time)} – {to12h(slot.end_time)}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </td>
                                                    );
                                                }
                                                const p = slot.period_number;
                                                const entries = timetable.filter(t => t.day_of_week === day && t.period_number === p);
                                                return (
                                                    <td key={idx} className="p-2 border-b border-r border-sky-50 align-top h-24 relative group/cell hover:bg-sky-50/20 transition-all w-[140px] max-w-[140px]">
                                                        <AnimatePresence>
                                                            {entries.map((entry) => (
                                                                <motion.div
                                                                    key={entry.id}
                                                                    initial={{ opacity: 0, scale: 0.95 }}
                                                                    animate={{ opacity: 1, scale: 1 }}
                                                                    className="h-full min-w-0 bg-white border-2 border-sky-100 p-2.5 md:p-3 rounded-2xl shadow-lg shadow-sky-50/50 flex flex-col justify-between overflow-hidden relative group/entry hover:border-sky-500 transition-all"
                                                                >
                                                                    <div className="space-y-1.5 min-w-0">
                                                                        <div className="flex items-start justify-between gap-1">
                                                                            <span className="px-2 py-0.5 bg-sky-100 text-sky-700 rounded-lg text-[8px] font-black uppercase tracking-widest truncate max-w-[75px]">
                                                                                {entry.subject_code || 'N/A'}
                                                                            </span>
                                                                            {isManager && (
                                                                                <div className="flex gap-1.5 opacity-100 md:opacity-0 md:group-hover/entry:opacity-100 transition-all">
                                                                                    <button onClick={() => handleAction(entry)} className="text-sky-400 hover:text-sky-600 transition-colors"><FaEdit size={11} /></button>
                                                                                    <button onClick={() => handleDelete(entry.id)} className="text-rose-400 hover:text-rose-600 transition-colors"><FaTrash size={11} /></button>
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                        <p className="text-xs font-black text-gray-800 tracking-tight line-clamp-2 leading-snug break-words">{entry.subject}</p>
                                                                    </div>

                                                                    <div className="mt-2 pt-2 border-t border-gray-100 flex flex-col gap-1 min-w-0">
                                                                        <div className="flex items-center gap-1.5 text-[8px] font-black text-gray-400 uppercase tracking-widest min-w-0">
                                                                            <FaClock className="text-sky-400 shrink-0" />
                                                                            <span className="truncate">{to12h(getPeriodConfig(entry.period_number)?.start_time || entry.start_time)} - {to12h(getPeriodConfig(entry.period_number)?.end_time || entry.end_time)}</span>
                                                                        </div>
                                                                        {entry.room_number && (
                                                                            <div className="flex items-center gap-1 text-[8px] font-black text-emerald-600 uppercase tracking-widest min-w-0">
                                                                                <FaDoorOpen size={9} className="shrink-0" /> <span className="truncate">{entry.room_number}</span>
                                                                            </div>
                                                                        )}
                                                                        {entry.staff_name && (
                                                                            <div className="flex items-center gap-1 text-[8px] font-bold text-indigo-600 truncate">
                                                                                <FaUserTie size={9} className="shrink-0" /> <span className="truncate">{entry.staff_name}</span>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </motion.div>
                                                            ))}
                                                        </AnimatePresence>

                                                        {entries.length === 0 && isManager && (
                                                            <div className="h-full flex items-center justify-center opacity-100 md:opacity-0 md:group-hover/cell:opacity-100 transition-all duration-300">
                                                                <button
                                                                    onClick={() => handleAction({ day_of_week: day, period_number: p })}
                                                                    className="w-full h-full flex flex-col items-center justify-center text-gray-300 border-2 border-dashed border-gray-100 rounded-2xl hover:border-sky-300 hover:text-sky-500 hover:bg-white transition-all gap-1.5"
                                                                >
                                                                    <div className="h-8 w-8 rounded-full bg-gray-50 flex items-center justify-center group-hover/cell:bg-sky-50 transition-colors">
                                                                        <FaPlus size={12} />
                                                                    </div>
                                                                    <span className="text-[8px] font-black uppercase tracking-widest">Add Period</span>
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
                )}

                {loading && (
                    <div className="py-6 flex items-center justify-center gap-3">
                        <div className="h-2 w-2 bg-sky-600 rounded-full animate-bounce"></div>
                        <div className="h-2 w-2 bg-sky-600 rounded-full animate-bounce delay-100"></div>
                        <div className="h-2 w-2 bg-sky-600 rounded-full animate-bounce delay-200"></div>
                        <span className="text-[10px] font-black text-sky-600 uppercase tracking-widest ml-2">Loading Timetable Grid...</span>
                    </div>
                )}

                {/* Excel Preview & Import Confirmation Modal */}
                <AnimatePresence>
                    {showExcelModal && (
                        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md">
                            <motion.div
                                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                                className="bg-white rounded-3xl p-6 md:p-8 max-w-4xl w-full shadow-2xl border border-gray-100 space-y-6 max-h-[90vh] flex flex-col"
                            >
                                <div className="flex items-center justify-between border-b border-gray-100 pb-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center text-xl">
                                            <FaFileSpreadsheet />
                                        </div>
                                        <div>
                                            <h3 className="text-lg font-black text-gray-800 tracking-tight">Excel Import Preview</h3>
                                            <p className="text-xs text-gray-500">
                                                {excelPreview.length} period rows parsed for {departments.find(d => String(d.id) === String(selectedDept))?.name || 'Dept'} Year {selectedYear} (Sem {selectedSem})
                                            </p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => { setShowExcelModal(false); setExcelPreview([]); }}
                                        className="p-2 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                                    >
                                        <FaTimes />
                                    </button>
                                </div>

                                <div className="flex-1 overflow-auto border border-gray-100 rounded-2xl">
                                    <table className="w-full text-left text-xs">
                                        <thead className="bg-gray-50 font-black uppercase text-[10px] text-gray-500 tracking-wider sticky top-0">
                                            <tr>
                                                <th className="p-3">Day</th>
                                                <th className="p-3">Period #</th>
                                                <th className="p-3">Subject Name</th>
                                                <th className="p-3">Subject Code</th>
                                                <th className="p-3">Room</th>
                                                <th className="p-3">Staff ID</th>
                                                <th className="p-3">Times</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {excelPreview.map((row, rIdx) => (
                                                <tr key={rIdx} className="hover:bg-gray-50">
                                                    <td className="p-3 font-bold text-gray-800">{row.Day || row.day_of_week || 'Monday'}</td>
                                                    <td className="p-3 font-mono font-bold text-indigo-600">{row['Period Number'] || row.period_number || 1}</td>
                                                    <td className="p-3 font-semibold text-gray-900">{row['Subject Name'] || row.subject || '—'}</td>
                                                    <td className="p-3 font-mono text-sky-600">{row['Subject Code'] || row.subject_code || '—'}</td>
                                                    <td className="p-3 text-gray-600">{row['Room Number'] || row.room_number || 'TBA'}</td>
                                                    <td className="p-3 font-mono text-purple-600">{row['Staff ID'] || row.emp_id || 'Unassigned'}</td>
                                                    <td className="p-3 text-gray-500 font-mono">
                                                        {(row['Start Time'] || row.start_time || '')} - {(row['End Time'] || row.end_time || '')}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>

                                <div className="flex items-center justify-end gap-3 border-t border-gray-100 pt-4">
                                    <button
                                        onClick={() => { setShowExcelModal(false); setExcelPreview([]); }}
                                        className="px-5 py-2.5 rounded-xl font-bold text-xs text-gray-500 hover:bg-gray-100 transition-all"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleSaveExcelImport}
                                        disabled={uploadingExcel}
                                        className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white rounded-xl font-bold text-xs uppercase tracking-wider hover:bg-indigo-700 transition-all shadow-md shadow-indigo-100 disabled:opacity-50"
                                    >
                                        <FaCheckCircle /> {uploadingExcel ? 'Importing...' : 'Save & Replace Timetable'}
                                    </button>
                                </div>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>

            </motion.div>
        </Layout>
    );
};

export default Timetable;
