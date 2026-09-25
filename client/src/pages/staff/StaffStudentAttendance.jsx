import { useState, useEffect, useCallback } from 'react';
import Layout from '../../components/Layout';
import api from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import Swal from 'sweetalert2';
import { QRCodeSVG } from 'qrcode.react';
import {
    FaUserGraduate, FaCalendarCheck, FaCalendarDay,
    FaCheck, FaTimes, FaSearch, FaSave, FaExclamationTriangle,
    FaFilter, FaClock, FaBookOpen, FaBuilding, FaLayerGroup,
    FaKey, FaBolt, FaShieldAlt, FaHistory, FaSync, FaQrcode, FaTimesCircle, FaBan
} from 'react-icons/fa';

const StaffStudentAttendance = () => {
    const { user } = useAuth();
    const isAdmin = ['admin', 'accounts', 'principal'].includes(user?.role);
    const [departments, setDepartments] = useState([]);
    const [allocatedClasses, setAllocatedClasses] = useState([]);
    
    // Filter selection states
    const todayStr = new Date().toISOString().slice(0, 10);
    const [selectedDate, setSelectedDate] = useState(todayStr);
    const [selectedDeptId, setSelectedDeptId] = useState('');
    const [selectedYear, setSelectedYear] = useState('1');
    const [selectedSem, setSelectedSem] = useState('1');
    const [selectedSection, setSelectedSection] = useState('A');
    const [selectedSubject, setSelectedSubject] = useState('');
    const [selectedSubjectCode, setSelectedSubjectCode] = useState('');
    const [selectedPeriod, setSelectedPeriod] = useState('1');
    const [startTime, setStartTime] = useState('09:00 AM');
    const [endTime, setEndTime] = useState('10:00 AM');

    // Student list state
    const [students, setStudents] = useState([]);
    const [isAllocated, setIsAllocated] = useState(true);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    // OTP Generation State (15-second validity)
    const [generatingOtp, setGeneratingOtp] = useState(false);
    const [activeOtpData, setActiveOtpData] = useState(null);
    const [otpCountdown, setOtpCountdown] = useState(0);
    const [showOtpModal, setShowOtpModal] = useState(false);

    // QR Code Generation State (10-minute validity)
    const [generatingQr, setGeneratingQr] = useState(false);
    const [activeQrData, setActiveQrData] = useState(null);
    const [qrCountdown, setQrCountdown] = useState(0);
    const [showQrModal, setShowQrModal] = useState(false);
    const [verifyingQr, setVerifyingQr] = useState(false);

    // Interactive Generate OTP Modal States
    const [showOtpGenModal, setShowOtpGenModal] = useState(false);
    const [otpDeptId, setOtpDeptId] = useState('');
    const [otpYear, setOtpYear] = useState('1');
    const [otpSem, setOtpSem] = useState('1');
    const [otpSection, setOtpSection] = useState('A');
    const [otpSubject, setOtpSubject] = useState('');
    const [otpSubjectCode, setOtpSubjectCode] = useState('');
    const [otpPeriod, setOtpPeriod] = useState('1');

    // Audit Logs State
    const [showAuditModal, setShowAuditModal] = useState(false);
    const [auditLogs, setAuditLogs] = useState([]);
    const [loadingAudit, setLoadingAudit] = useState(false);

    // Pre-defined standard period times
    const periodPresets = [
        { period: 1, label: 'Hour 1 (09:00 AM - 10:00 AM)', start: '09:00 AM', end: '10:00 AM' },
        { period: 2, label: 'Hour 2 (10:00 AM - 11:00 AM)', start: '10:00 AM', end: '11:00 AM' },
        { period: 3, label: 'Hour 3 (11:15 AM - 12:15 PM)', start: '11:15 AM', end: '12:15 PM' },
        { period: 4, label: 'Hour 4 (12:15 PM - 01:15 PM)', start: '12:15 PM', end: '01:15 PM' },
        { period: 5, label: 'Hour 5 (02:00 PM - 03:00 PM)', start: '02:00 PM', end: '03:00 PM' },
        { period: 6, label: 'Hour 6 (03:00 PM - 04:00 PM)', start: '03:00 PM', end: '04:00 PM' },
        { period: 7, label: 'Hour 7 (04:00 PM - 05:00 PM)', start: '04:00 PM', end: '05:00 PM' },
    ];

    // Generate 15-second OTP directly using current class selection
    const handleGenerateOTP = async () => {
        if (isAdmin) {
            Swal.fire({ icon: 'warning', title: 'Admin View Only', text: 'Administrators cannot generate attendance OTPs. Only staff members can generate OTPs.', confirmButtonColor: '#0ea5e9' });
            return;
        }

        if (!selectedDeptId || !selectedSubject) {
            Swal.fire({ icon: 'warning', title: 'Subject & Department Required', text: 'Please select a valid department and enter a subject before generating OTP.', confirmButtonColor: '#0ea5e9' });
            return;
        }

        setGeneratingOtp(true);
        try {
            const payload = {
                department_id: parseInt(selectedDeptId, 10),
                academic_year: parseInt(selectedYear, 10),
                semester: parseInt(selectedSem, 10),
                section: selectedSection || 'A',
                subject: selectedSubject.trim(),
                subject_code: selectedSubjectCode ? selectedSubjectCode.trim() : '',
                date: selectedDate,
                period_number: parseInt(selectedPeriod, 10),
                start_time: startTime,
                end_time: endTime
            };

            const res = await api.post('/student-attendance/generate-otp', payload);
            setActiveOtpData(res.data);
            setOtpCountdown(15);
            setShowOtpModal(true);
        } catch (err) {
            console.error('Error generating OTP:', err);
            Swal.fire({
                icon: 'error',
                title: 'OTP Generation Failed',
                text: err.response?.data?.message || err.message,
                confirmButtonColor: '#0ea5e9'
            });
        } finally {
            setGeneratingOtp(false);
        }
    };

    // 10-Minute QR Countdown Timer Effect (continues running when modal is closed)
    useEffect(() => {
        if (qrCountdown <= 0) return;
        const timer = setInterval(() => {
            setQrCountdown(prev => {
                if (prev <= 1) {
                    setActiveQrData(null);
                    setShowQrModal(false);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(timer);
    }, [qrCountdown]);

    // Check for running OTP or QR session from server
    const checkServerActiveSession = useCallback(async () => {
        if (isAdmin || !selectedDeptId || !selectedYear || !selectedSem) return;
        try {
            const params = new URLSearchParams({
                department_id: selectedDeptId,
                academic_year: selectedYear,
                semester: selectedSem,
                section: selectedSection,
                date: selectedDate,
                period_number: selectedPeriod
            });
            const res = await api.get(`/student-attendance/active-otp?${params.toString()}`);
            if (res.data?.has_active_otp && res.data?.active_otp) {
                const active = res.data.active_otp;
                const remSec = active.remaining_seconds || 0;
                if (remSec > 0) {
                    if (remSec <= 15) {
                        setActiveOtpData(active);
                        setOtpCountdown(remSec);
                    } else {
                        setActiveQrData({ qr_code: active.otp_code, ...active });
                        setQrCountdown(remSec);
                    }
                }
            }
        } catch (err) {
            // Quiet fail
        }
    }, [isAdmin, selectedDeptId, selectedYear, selectedSem, selectedSection, selectedDate, selectedPeriod]);

    useEffect(() => {
        checkServerActiveSession();
    }, [checkServerActiveSession]);

    // Format seconds into MM:SS
    const formatTimeMMSS = (totalSeconds) => {
        if (totalSeconds <= 0) return '00:00';
        const mins = Math.floor(totalSeconds / 60);
        const secs = totalSeconds % 60;
        return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    };

    // Generate 10-minute Attendance QR Code
    const handleGenerateQR = async () => {
        if (isAdmin) {
            Swal.fire({ icon: 'warning', title: 'Admin View Only', text: 'Administrators cannot generate attendance QR codes. Only teaching staff can generate QR codes.', confirmButtonColor: '#0ea5e9' });
            return;
        }

        if (!selectedDeptId || !selectedSubject) {
            Swal.fire({ icon: 'warning', title: 'Subject & Department Required', text: 'Please select a valid department and enter a subject before generating QR Code.', confirmButtonColor: '#0ea5e9' });
            return;
        }

        setGeneratingQr(true);
        try {
            const payload = {
                department_id: parseInt(selectedDeptId, 10),
                academic_year: parseInt(selectedYear, 10),
                semester: parseInt(selectedSem, 10),
                section: selectedSection || 'A',
                subject: selectedSubject.trim(),
                subject_code: selectedSubjectCode ? selectedSubjectCode.trim() : '',
                date: selectedDate,
                period_number: parseInt(selectedPeriod, 10),
                start_time: startTime,
                end_time: endTime
            };

            const res = await api.post('/student-attendance/generate-qr', payload);
            setActiveQrData(res.data);
            setQrCountdown(600); // 10 Minutes = 600 Seconds
            setShowQrModal(true);
        } catch (err) {
            console.error('Error generating QR code:', err);
            Swal.fire({
                icon: 'error',
                title: 'QR Generation Failed',
                text: err.response?.data?.message || err.message,
                confirmButtonColor: '#0ea5e9'
            });
        } finally {
            setGeneratingQr(false);
        }
    };

    // Refresh live student attendance list while QR code is active
    const handleRefreshScannedAttendance = async () => {
        setVerifyingQr(true);
        try {
            await fetchClassStudents();
            Swal.fire({
                icon: 'success',
                title: 'Attendance List Refreshed!',
                text: 'Updated table with live student OTP/QR scans for this period.',
                timer: 1500,
                showConfirmButton: false
            });
        } catch (err) {
            console.error('Error refreshing attendance:', err);
        } finally {
            setVerifyingQr(false);
        }
    };

    // Stop / Deactivate active OTP or QR Code session immediately
    const handleStopQRSession = async () => {
        const confirm = await Swal.fire({
            title: 'Stop Attendance Session?',
            text: 'This will immediately stop and deactivate the QR Code / OTP so no further students can scan or enter it.',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#ef4444',
            cancelButtonColor: '#64748b',
            confirmButtonText: 'Yes, Stop Session'
        });

        if (!confirm.isConfirmed) return;

        try {
            const payload = {
                otp_code: activeQrData?.qr_code || activeOtpData?.otp_code,
                department_id: parseInt(selectedDeptId, 10),
                academic_year: parseInt(selectedYear, 10),
                semester: parseInt(selectedSem, 10),
                section: selectedSection || 'A',
                date: selectedDate,
                period_number: parseInt(selectedPeriod, 10)
            };

            await api.post('/student-attendance/stop-session', payload);

            setQrCountdown(0);
            setOtpCountdown(0);
            setShowQrModal(false);
            setShowOtpModal(false);
            setActiveQrData(null);
            setActiveOtpData(null);

            Swal.fire({
                icon: 'success',
                title: 'Session Stopped',
                text: 'The active QR Code / OTP session has been deactivated.',
                timer: 2000,
                showConfirmButton: false
            });

            fetchClassStudents();
        } catch (err) {
            console.error('Error stopping QR session:', err);
            Swal.fire({
                icon: 'error',
                title: 'Failed to Stop Session',
                text: err.response?.data?.message || err.message,
                confirmButtonColor: '#0ea5e9'
            });
        }
    };

    // Load initial metadata (departments & staff allocation)
    useEffect(() => {
        const fetchInitialData = async () => {
            try {
                const [deptRes, allocRes] = await Promise.all([
                    api.get('/departments'),
                    api.get('/student-attendance/allocated-classes')
                ]);

                setDepartments(deptRes.data || []);
                const allocs = allocRes.data || [];
                setAllocatedClasses(allocs);

                // Auto-select first allocation if available
                if (allocs.length > 0) {
                    const first = allocs[0];
                    setSelectedDeptId(String(first.department_id || ''));
                    setSelectedYear(String(first.academic_year || '1'));
                    setSelectedSem(String(first.semester || '1'));
                    setSelectedSection(first.section || 'A');
                    setSelectedSubject(first.subject || '');
                    setSelectedSubjectCode(first.subject_code || '');
                    if (first.period_number) {
                        setSelectedPeriod(String(first.period_number));
                    }
                } else if (user?.department_id) {
                    setSelectedDeptId(String(user.department_id));
                }
            } catch (err) {
                console.error('Error fetching initial allocation data:', err);
            }
        };

        fetchInitialData();
    }, [user]);

    // Handle allocation dropdown change
    const handleAllocationSelect = (e) => {
        const idx = e.target.value;
        if (idx === '') return;
        const item = allocatedClasses[idx];
        if (item) {
            setSelectedDeptId(String(item.department_id || ''));
            setSelectedYear(String(item.academic_year || '1'));
            setSelectedSem(String(item.semester || '1'));
            setSelectedSection(item.section || 'A');
            setSelectedSubject(item.subject || '');
            setSelectedSubjectCode(item.subject_code || '');
            if (item.period_number) {
                setSelectedPeriod(String(item.period_number));
                const matchPreset = periodPresets.find(p => p.period === parseInt(item.period_number, 10));
                if (matchPreset) {
                    setStartTime(matchPreset.start);
                    setEndTime(matchPreset.end);
                }
            }
        }
    };

    // Update period start/end time when period preset changes
    const handlePeriodChange = (pNum) => {
        setSelectedPeriod(String(pNum));
        const preset = periodPresets.find(p => p.period === parseInt(pNum, 10));
        if (preset) {
            setStartTime(preset.start);
            setEndTime(preset.end);
        }
    };

    // Helper to get allowed semesters for a given academic year
    const getSemestersForYear = (yearStr) => {
        const yr = parseInt(yearStr, 10);
        if (yr === 1) return [1, 2];
        if (yr === 2) return [3, 4];
        if (yr === 3) return [5, 6];
        if (yr === 4) return [7, 8];
        return [1, 2];
    };

    // Handle Year change and automatically align Semester selection
    const handleYearChange = (newYear) => {
        setSelectedYear(newYear);
        const availableSems = getSemestersForYear(newYear);
        if (!availableSems.includes(parseInt(selectedSem, 10))) {
            setSelectedSem(String(availableSems[0]));
        }
    };

    // Fetch students & attendance for selected class
    const fetchClassStudents = useCallback(async () => {
        if (!selectedDeptId || !selectedYear || !selectedSem) return;

        setLoading(true);
        try {
            const params = new URLSearchParams({
                department_id: selectedDeptId,
                academic_year: selectedYear,
                semester: selectedSem,
                section: selectedSection,
                date: selectedDate,
                period_number: selectedPeriod,
                subject: selectedSubject
            });

            const res = await api.get(`/student-attendance/students-for-class?${params.toString()}`);
            setIsAllocated(res.data.is_allocated !== false);
            setStudents(res.data.students || []);
        } catch (err) {
            console.error('Error fetching students:', err);
            Swal.fire({
                icon: 'error',
                title: 'Failed to fetch students',
                text: err.response?.data?.message || err.message,
                confirmButtonColor: '#0ea5e9'
            });
        } finally {
            setLoading(false);
        }
    }, [selectedDeptId, selectedYear, selectedSem, selectedSection, selectedDate, selectedPeriod, selectedSubject]);

    useEffect(() => {
        fetchClassStudents();
    }, [fetchClassStudents]);

    // Single student status toggle
    const handleToggleStatus = (studentId) => {
        if (isAdmin) return;
        setStudents(prev => prev.map(st => {
            if (st.student_id === studentId) {
                return {
                    ...st,
                    status: st.status === 'Present' ? 'Absent' : 'Present'
                };
            }
            return st;
        }));
    };

    // Bulk status actions
    const handleMarkAll = async (status) => {
        if (isAdmin) return;
        if (students.length === 0) return;

        const isPresent = status === 'Present';
        const result = await Swal.fire({
            title: isPresent ? 'Mark All Students as Present?' : 'Mark All Students as Absent?',
            text: `Are you sure you want to mark all ${students.length} student(s) as ${isPresent ? 'PRESENT' : 'ABSENT'} for Hour ${selectedPeriod}?`,
            icon: isPresent ? 'question' : 'warning',
            showCancelButton: true,
            confirmButtonText: `Yes, Mark All ${isPresent ? 'Present' : 'Absent'}`,
            cancelButtonText: 'Cancel',
            confirmButtonColor: isPresent ? '#10b981' : '#f43f5e',
            cancelButtonColor: '#64748b'
        });

        if (result.isConfirmed) {
            setStudents(prev => prev.map(st => ({ ...st, status })));
        }
    };

    // Save Attendance Handler
    const handleSaveAttendance = async () => {
        if (isAdmin) {
            Swal.fire({ icon: 'warning', title: 'Admin View Only', text: 'Administrators are in View-Only mode and cannot mark student attendance.', confirmButtonColor: '#0ea5e9' });
            return;
        }
        if (students.length === 0) {
            Swal.fire({ icon: 'warning', title: 'No students to record', confirmButtonColor: '#0ea5e9' });
            return;
        }

        if (!selectedSubject) {
            Swal.fire({ icon: 'warning', title: 'Subject Required', text: 'Please specify the subject name for this session.', confirmButtonColor: '#0ea5e9' });
            return;
        }

        const presentCount = students.filter(s => s.status === 'Present').length;
        const absentCount = students.filter(s => s.status === 'Absent').length;

        const confirm = await Swal.fire({
            title: 'Confirm Attendance Submission',
            html: `
                <div class="text-left text-sm space-y-2 p-2 bg-slate-50 rounded-xl border border-slate-200">
                    <p><strong>Date:</strong> ${selectedDate}</p>
                    <p><strong>Hour/Period:</strong> Hour ${selectedPeriod} (${startTime} - ${endTime})</p>
                    <p><strong>Subject:</strong> ${selectedSubject} ${selectedSubjectCode ? `(${selectedSubjectCode})` : ''}</p>
                    <p><strong>Section:</strong> Sem ${selectedSem} - Sec ${selectedSection}</p>
                    <hr class="my-2 border-slate-200" />
                    <div class="flex justify-between items-center text-base">
                        <span class="text-emerald-600 font-bold">Present: ${presentCount}</span>
                        <span class="text-rose-600 font-bold">Absent: ${absentCount}</span>
                        <span class="text-slate-700 font-bold">Total: ${students.length}</span>
                    </div>
                </div>
            `,
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'Yes, Save Record',
            cancelButtonText: 'Cancel',
            confirmButtonColor: '#0ea5e9',
            cancelButtonColor: '#64748b'
        });

        if (!confirm.isConfirmed) return;

        setSaving(true);
        try {
            const payload = {
                department_id: parseInt(selectedDeptId, 10),
                academic_year: parseInt(selectedYear, 10),
                semester: parseInt(selectedSem, 10),
                section: selectedSection,
                subject: selectedSubject,
                subject_code: selectedSubjectCode,
                date: selectedDate,
                period_number: parseInt(selectedPeriod, 10),
                start_time: startTime,
                end_time: endTime,
                attendance_records: students.map(s => ({
                    student_id: s.student_id,
                    user_id: s.user_id,
                    status: s.status
                }))
            };

            await api.post('/student-attendance/mark', payload);

            Swal.fire({
                icon: 'success',
                title: 'Attendance Recorded!',
                text: `Successfully saved hour-wise attendance for Period ${selectedPeriod}.`,
                timer: 2000,
                showConfirmButton: false
            });

            fetchClassStudents();
        } catch (err) {
            console.error('Error saving attendance:', err);
            Swal.fire({
                icon: 'error',
                title: 'Save Failed',
                text: err.response?.data?.message || 'Failed to save attendance record.',
                confirmButtonColor: '#0ea5e9'
            });
        } finally {
            setSaving(false);
        }
    };

    // OTP Countdown effect (15 seconds, continues running when modal is closed)
    useEffect(() => {
        if (otpCountdown <= 0) return;
        const timer = setInterval(() => {
            setOtpCountdown(prev => {
                if (prev <= 1) {
                    setActiveOtpData(null);
                    setShowOtpModal(false);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(timer);
    }, [otpCountdown]);



    // Fetch Audit Logs
    const fetchAuditLogs = async () => {
        setLoadingAudit(true);
        try {
            const res = await api.get('/student-attendance/audit-logs');
            setAuditLogs(res.data || []);
            setShowAuditModal(true);
        } catch (err) {
            console.error('Error fetching audit logs:', err);
        } finally {
            setLoadingAudit(false);
        }
    };

    // Filter students by search term
    const filteredStudents = students.filter(st => {
        const query = searchTerm.toLowerCase().trim();
        return (
            (st.name || '').toLowerCase().includes(query) ||
            (st.reg_no || '').toLowerCase().includes(query) ||
            (st.roll_no || '').toLowerCase().includes(query)
        );
    });

    const totalStudents = students.length;
    const presentCount = students.filter(s => s.status === 'Present').length;
    const absentCount = students.filter(s => s.status === 'Absent').length;
    const attPercentage = totalStudents > 0 ? ((presentCount / totalStudents) * 100).toFixed(1) : '0.0';

    return (
        <Layout>
            <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">

                {/* Admin View-Only Notice Banner */}
                {isAdmin && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="p-4 rounded-2xl bg-sky-50 border border-sky-200 text-sky-900 flex items-center gap-3 shadow-sm"
                    >
                        <FaShieldAlt className="text-sky-600 text-xl shrink-0" />
                        <div className="text-sm">
                            <span className="font-extrabold text-sky-900">Administrator View-Only Mode:</span> You are viewing student attendance as an Administrator. Admins cannot generate OTPs or mark attendance to students. Only allocated staff members can generate OTPs and record attendance.
                        </div>
                    </motion.div>
                )}

                {/* Warning Banner if Staff tries unallocated class */}
                {!isAllocated && !isAdmin && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 flex items-center gap-3"
                    >
                        <FaExclamationTriangle className="text-amber-500 text-xl shrink-0" />
                        <div className="text-sm">
                            <span className="font-bold">Notice:</span> You are not explicitly assigned to this class/subject in the active timetable.
                        </div>
                    </motion.div>
                )}

                {/* Filter & Allocation Selector Card */}
                <div className="bg-white/80 backdrop-blur-xl rounded-2xl p-5 border border-slate-200 shadow-sm space-y-5">
                    
                    {/* Top Row: Allocated Class Shortcut & Date Picker */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        
                        {/* Quick Allocation Dropdown */}
                        <div className="md:col-span-2 space-y-1.5">
                            <label className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                                <FaBookOpen className="text-sky-600" /> Select My Allocated Class & Subject
                            </label>
                            <select
                                onChange={handleAllocationSelect}
                                defaultValue=""
                                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-sm font-semibold text-slate-800 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition-all"
                            >
                                <option value="" disabled>-- Select from Assigned Timetable Allocations --</option>
                                {allocatedClasses.map((item, idx) => (
                                    <option key={idx} value={idx}>
                                        {item.department_name} | Yr {item.academic_year} - Sem {item.semester} (Sec {item.section || 'A'}) - {item.subject} {item.subject_code ? `(${item.subject_code})` : ''} - Period {item.period_number || 1}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Date Picker */}
                        <div className="space-y-1.5">
                            <label className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                                <FaCalendarDay className="text-sky-600" /> Attendance Date
                            </label>
                            <input
                                type="date"
                                value={selectedDate}
                                onChange={(e) => setSelectedDate(e.target.value)}
                                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-sm font-semibold text-slate-800 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition-all"
                            />
                        </div>
                    </div>

                    {/* Manual Filters Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-3 border-t border-slate-100">
                        
                        {/* Department */}
                        <div className="space-y-1">
                            <label className="text-[11px] font-bold uppercase text-slate-500">Department</label>
                            <select
                                value={selectedDeptId}
                                onChange={(e) => setSelectedDeptId(e.target.value)}
                                className="w-full px-2.5 py-2 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 focus:ring-2 focus:ring-sky-500"
                            >
                                <option value="">Select Dept</option>
                                {departments.map(d => (
                                    <option key={d.id} value={d.id}>{d.name}</option>
                                ))}
                            </select>
                        </div>

                        {/* Year */}
                        <div className="space-y-1">
                            <label className="text-[11px] font-bold uppercase text-slate-500">Academic Year</label>
                            <select
                                value={selectedYear}
                                onChange={(e) => handleYearChange(e.target.value)}
                                className="w-full px-2.5 py-2 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 focus:ring-2 focus:ring-sky-500"
                            >
                                <option value="1">Year 1</option>
                                <option value="2">Year 2</option>
                                <option value="3">Year 3</option>
                                <option value="4">Year 4</option>
                            </select>
                        </div>

                        {/* Semester */}
                        <div className="space-y-1">
                            <label className="text-[11px] font-bold uppercase text-slate-500">Semester</label>
                            <select
                                value={selectedSem}
                                onChange={(e) => setSelectedSem(e.target.value)}
                                className="w-full px-2.5 py-2 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 focus:ring-2 focus:ring-sky-500"
                            >
                                {getSemestersForYear(selectedYear).map(s => (
                                    <option key={s} value={String(s)}>Semester {s}</option>
                                ))}
                            </select>
                        </div>

                        {/* Section */}
                        <div className="space-y-1">
                            <label className="text-[11px] font-bold uppercase text-slate-500">Section</label>
                            <select
                                value={selectedSection}
                                onChange={(e) => setSelectedSection(e.target.value)}
                                className="w-full px-2.5 py-2 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 focus:ring-2 focus:ring-sky-500"
                            >
                                <option value="A">Section A</option>
                                <option value="B">Section B</option>
                                <option value="C">Section C</option>
                                <option value="All">All Sections</option>
                            </select>
                        </div>

                        {/* Subject */}
                        <div className="space-y-1 col-span-2 sm:col-span-1 lg:col-span-2">
                            <label className="text-[11px] font-bold uppercase text-slate-500">Subject Name</label>
                            <input
                                type="text"
                                value={selectedSubject}
                                onChange={(e) => setSelectedSubject(e.target.value)}
                                placeholder="e.g. Data Structures"
                                className="w-full px-2.5 py-2 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 focus:ring-2 focus:ring-sky-500"
                            />
                        </div>
                    </div>

                    {/* Period / Session Hour Selector Bar */}
                    <div className="pt-3 border-t border-slate-100">
                        <label className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5 mb-2">
                            <FaClock className="text-sky-600" /> Allocated Hour / Session Period
                        </label>
                        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
                            {periodPresets.map(preset => {
                                const isSelected = String(selectedPeriod) === String(preset.period);
                                return (
                                    <button
                                        key={preset.period}
                                        type="button"
                                        onClick={() => handlePeriodChange(preset.period)}
                                        className={`px-3 py-2 rounded-xl text-xs font-bold transition-all text-center flex flex-col items-center justify-center border ${
                                            isSelected
                                                ? 'bg-sky-600 text-white border-sky-600 shadow-md shadow-sky-500/20 scale-[1.02]'
                                                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-sky-50 hover:border-sky-300'
                                        }`}
                                    >
                                        <span>Hour {preset.period}</span>
                                        <span className={`text-[9px] font-normal ${isSelected ? 'text-sky-100' : 'text-slate-500'}`}>
                                            {preset.start}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* ACTIVE RUNNING SESSION BANNER (when modal is closed but timer is still running) */}
                <AnimatePresence>
                    {((!showOtpModal && otpCountdown > 0 && activeOtpData) || (!showQrModal && qrCountdown > 0 && activeQrData)) && (
                        <motion.div
                            initial={{ opacity: 0, y: -10, scale: 0.99 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -10, scale: 0.99 }}
                            className="rounded-2xl bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 p-4 text-white shadow-xl border-2 border-amber-300 flex flex-col lg:flex-row items-center justify-between gap-4"
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center text-white text-xl shrink-0 font-bold border border-white/30">
                                    {otpCountdown > 0 ? <FaBolt className="text-amber-200 animate-bounce" /> : <FaQrcode className="text-amber-200 animate-pulse" />}
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <span className="px-2 py-0.5 rounded-md bg-white/20 text-[10px] font-black uppercase tracking-wider text-amber-100 border border-white/20">
                                            {otpCountdown > 0 ? '15s OTP Active' : '10m QR Active'}
                                        </span>
                                        <span className="text-xs font-bold text-amber-100">
                                            Period {selectedPeriod} • {selectedSubject || 'Current Class'}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-3 mt-1">
                                        {otpCountdown > 0 ? (
                                            <p className="text-base font-black tracking-wider flex items-center gap-2">
                                                OTP Code: <span className="bg-white text-slate-900 px-2.5 py-0.5 rounded-lg font-mono font-black text-lg shadow-inner">{activeOtpData?.otp_code}</span>
                                            </p>
                                        ) : (
                                            <p className="text-sm font-black text-white flex items-center gap-2">
                                                Live QR Code Session Active
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto justify-end">
                                {/* Countdown Badge */}
                                <div className="px-3.5 py-1.5 rounded-xl bg-black/25 backdrop-blur-md border border-white/20 text-center shrink-0">
                                    <span className="block text-[9px] font-extrabold uppercase tracking-widest text-amber-200">Time Left</span>
                                    <span className="text-base font-black font-mono">
                                        {otpCountdown > 0 ? `${otpCountdown}s` : formatTimeMMSS(qrCountdown)}
                                    </span>
                                </div>

                                {/* View Modal button */}
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (otpCountdown > 0) setShowOtpModal(true);
                                        else setShowQrModal(true);
                                    }}
                                    className="px-3.5 py-2 rounded-xl bg-white text-slate-900 hover:bg-amber-100 font-black text-xs uppercase tracking-wider shadow-sm flex items-center gap-1.5 transition-all shrink-0 cursor-pointer"
                                >
                                    <FaSync className="text-sky-600" /> View {otpCountdown > 0 ? 'OTP Code' : 'QR Code'}
                                </button>

                                {/* Live Sync button */}
                                <button
                                    type="button"
                                    onClick={handleRefreshScannedAttendance}
                                    disabled={verifyingQr}
                                    className="px-3.5 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs uppercase tracking-wider shadow-sm flex items-center gap-1.5 transition-all shrink-0 cursor-pointer"
                                >
                                    <FaSync className={verifyingQr ? 'animate-spin' : ''} /> Live Sync
                                </button>

                                {/* Stop Session button */}
                                <button
                                    type="button"
                                    onClick={handleStopQRSession}
                                    className="px-3.5 py-2 rounded-xl bg-rose-700 hover:bg-rose-800 text-white font-black text-xs uppercase tracking-wider shadow-sm flex items-center gap-1.5 transition-all shrink-0 cursor-pointer"
                                >
                                    <FaTimesCircle /> Stop Session
                                </button>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Summary Metrics & Action Bar */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    
                    {/* Total Students Card */}
                    <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm flex items-center justify-between">
                        <div>
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Students</p>
                            <p className="text-2xl font-black text-slate-900 mt-1">{totalStudents}</p>
                        </div>
                        <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600 text-xl font-bold">
                            <FaUserGraduate />
                        </div>
                    </div>

                    {/* Present Count Card */}
                    <div className="bg-emerald-50/70 border border-emerald-200 rounded-2xl p-4 shadow-sm flex items-center justify-between">
                        <div>
                            <p className="text-xs font-bold text-emerald-700 uppercase tracking-wider">Present Count</p>
                            <p className="text-2xl font-black text-emerald-800 mt-1">{presentCount}</p>
                        </div>
                        <div className="w-12 h-12 rounded-xl bg-emerald-500 text-white flex items-center justify-center text-xl font-bold">
                            <FaCheck />
                        </div>
                    </div>

                    {/* Absent Count Card */}
                    <div className="bg-rose-50/70 border border-rose-200 rounded-2xl p-4 shadow-sm flex items-center justify-between">
                        <div>
                            <p className="text-xs font-bold text-rose-700 uppercase tracking-wider">Absent Count</p>
                            <p className="text-2xl font-black text-rose-800 mt-1">{absentCount}</p>
                        </div>
                        <div className="w-12 h-12 rounded-xl bg-rose-500 text-white flex items-center justify-center text-xl font-bold">
                            <FaTimes />
                        </div>
                    </div>

                    {/* Attendance Rate Card */}
                    <div className="bg-sky-50/70 border border-sky-200 rounded-2xl p-4 shadow-sm flex items-center justify-between">
                        <div>
                            <p className="text-xs font-bold text-sky-700 uppercase tracking-wider">Attendance Rate</p>
                            <p className="text-2xl font-black text-sky-900 mt-1">{attPercentage}%</p>
                        </div>
                        <div className="w-12 h-12 rounded-xl bg-sky-500 text-white flex items-center justify-center text-xl font-bold">
                            <FaCalendarCheck />
                        </div>
                    </div>
                </div>

                {/* Main Table Container */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden space-y-4 p-5">
                    
                    {/* Top Control Bar: Search & Quick Batch Buttons */}
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pb-3 border-b border-slate-100">
                        
                        {/* Search Input */}
                        <div className="relative w-full sm:w-72">
                            <FaSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs" />
                            <input
                                type="text"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                placeholder="Search by name or reg no..."
                                className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-xs font-medium text-slate-800 focus:ring-2 focus:ring-sky-500"
                            />
                        </div>

                        {/* Batch Action Buttons */}
                        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                            {!isAdmin ? (
                                <>
                                    <button
                                        type="button"
                                        onClick={() => handleMarkAll('Present')}
                                        className="px-3.5 py-2 rounded-xl bg-emerald-100 text-emerald-800 hover:bg-emerald-200 text-xs font-bold transition-all flex items-center gap-1.5"
                                    >
                                        <FaCheck /> Mark All Present
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleMarkAll('Absent')}
                                        className="px-3.5 py-2 rounded-xl bg-rose-100 text-rose-800 hover:bg-rose-200 text-xs font-bold transition-all flex items-center gap-1.5"
                                    >
                                        <FaTimes /> Mark All Absent
                                    </button>
                                </>
                            ) : (
                                <span className="px-3 py-1.5 rounded-xl bg-slate-100 text-slate-500 text-xs font-bold border border-slate-200">
                                    View Only (Admin)
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Student List Table */}
                    {loading ? (
                        <div className="py-12 flex flex-col items-center justify-center gap-3 text-slate-400">
                            <div className="h-8 w-8 border-4 border-sky-200 border-t-sky-600 rounded-full animate-spin" />
                            <p className="text-xs font-semibold">Loading student roster...</p>
                        </div>
                    ) : filteredStudents.length === 0 ? (
                        <div className="py-12 text-center text-slate-500 space-y-2">
                            <FaUserGraduate className="text-4xl text-slate-300 mx-auto" />
                            <p className="text-sm font-bold">No students found matching current filters.</p>
                            <p className="text-xs text-slate-400">Try selecting a different department, semester, section, or search query.</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs border-collapse">
                                <thead>
                                    <tr className="bg-slate-50 text-slate-600 uppercase tracking-wider font-bold border-b border-slate-200">
                                        <th className="py-3 px-4 w-12 text-center">#</th>
                                        <th className="py-3 px-4">Register No</th>
                                        <th className="py-3 px-4">Roll No</th>
                                        <th className="py-3 px-4">Student Name</th>
                                        <th className="py-3 px-4">Gender</th>
                                        <th className="py-3 px-4 text-center">Attendance Status (Hour {selectedPeriod})</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {filteredStudents.map((st, index) => {
                                        const isPresent = st.status === 'Present';
                                        return (
                                            <tr key={st.student_id} className="hover:bg-slate-50/80 transition-colors">
                                                <td className="py-3 px-4 text-center font-semibold text-slate-400">{index + 1}</td>
                                                <td className="py-3 px-4 font-bold text-slate-900">{st.reg_no}</td>
                                                <td className="py-3 px-4 font-medium text-slate-600">{st.roll_no || '-'}</td>
                                                <td className="py-3 px-4 font-bold text-slate-800 flex items-center gap-2">
                                                    <div className="w-7 h-7 rounded-full bg-sky-100 text-sky-800 flex items-center justify-center font-black text-xs shrink-0">
                                                        {st.name?.charAt(0).toUpperCase()}
                                                    </div>
                                                    {st.name}
                                                </td>
                                                <td className="py-3 px-4 capitalize font-medium text-slate-600">{st.gender || '-'}</td>
                                                <td className="py-3 px-4 text-center">
                                                    <div className="inline-flex p-1 rounded-xl bg-slate-100 border border-slate-200 gap-1">
                                                        <button
                                                            type="button"
                                                            disabled={isAdmin}
                                                            onClick={() => handleToggleStatus(st.student_id)}
                                                            className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all flex items-center gap-1.5 ${
                                                                isPresent
                                                                    ? 'bg-emerald-500 text-white shadow-sm shadow-emerald-500/30'
                                                                    : 'text-slate-600 hover:text-emerald-600'
                                                            } ${isAdmin ? 'cursor-not-allowed opacity-80' : ''}`}
                                                        >
                                                            <FaCheck /> Present
                                                        </button>
                                                        <button
                                                            type="button"
                                                            disabled={isAdmin}
                                                            onClick={() => handleToggleStatus(st.student_id)}
                                                            className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all flex items-center gap-1.5 ${
                                                                !isPresent
                                                                    ? 'bg-rose-500 text-white shadow-sm shadow-rose-500/30'
                                                                    : 'text-slate-600 hover:text-rose-600'
                                                            } ${isAdmin ? 'cursor-not-allowed opacity-80' : ''}`}
                                                        >
                                                            <FaTimes /> Absent
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* Bottom Save & OTP Action Panel */}
                    <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4">
                        <div className="text-xs text-slate-500 font-medium">
                            Recording <strong className="text-slate-800">{students.length}</strong> student entries for <strong className="text-slate-800">{selectedDate}</strong> (Hour {selectedPeriod}).
                        </div>

                        <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
                            <button
                                type="button"
                                onClick={fetchAuditLogs}
                                className="w-full sm:w-auto px-4 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all flex items-center justify-center gap-1.5"
                            >
                                <FaHistory /> Audit Logs
                            </button>

                            {!isAdmin ? (
                                <>
                                    <button
                                        type="button"
                                        onClick={handleGenerateQR}
                                        disabled={generatingQr}
                                        className="w-full sm:w-auto px-5 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white text-xs font-black shadow-lg shadow-emerald-500/20 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                                    >
                                        {generatingQr ? (
                                            <>
                                                <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                                Generating QR...
                                            </>
                                        ) : (
                                            <>
                                                <FaQrcode /> Generate 10-Min Attendance QR
                                            </>
                                        )}
                                    </button>

                                    <button
                                        type="button"
                                        onClick={handleGenerateOTP}
                                        disabled={generatingOtp}
                                        className="w-full sm:w-auto px-5 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white text-xs font-black shadow-lg shadow-amber-500/20 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                                    >
                                        {generatingOtp ? (
                                            <>
                                                <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                                Generating...
                                            </>
                                        ) : (
                                            <>
                                                <FaKey /> Generate 15s Attendance OTP
                                            </>
                                        )}
                                    </button>

                                    <button
                                        type="button"
                                        onClick={handleSaveAttendance}
                                        disabled={saving || loading || students.length === 0}
                                        className="w-full sm:w-auto px-6 py-3 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-extrabold shadow-lg shadow-sky-600/30 hover:shadow-sky-600/50 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                                    >
                                        {saving ? (
                                            <>
                                                <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                                Saving Record...
                                            </>
                                        ) : (
                                            <>
                                                <FaSave /> Save Attendance Record
                                            </>
                                        )}
                                    </button>
                                </>
                            ) : (
                                <div className="px-4 py-2.5 rounded-xl bg-slate-100 text-slate-500 text-xs font-bold border border-slate-200">
                                    OTP & Attendance Marking (Staff Only)
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* STAFF 10-MINUTE QR DISPLAY MODAL */}
            {showQrModal && activeQrData && (
                <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md flex items-center justify-center p-4">
                    <motion.div
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full text-center space-y-5 border border-emerald-200 shadow-2xl relative overflow-hidden"
                    >
                        <div className="absolute top-0 right-0 left-0 h-3 bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500" />

                        <div className="space-y-1 pt-2">
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-black uppercase tracking-wider">
                                <FaQrcode /> 10-Minute Attendance QR Code
                            </span>
                            <h3 className="text-xl font-black text-slate-900">Period {selectedPeriod} - {selectedSubject}</h3>
                            <p className="text-xs font-medium text-slate-500">
                                Scanning this QR code marks <strong>all students Present</strong> for this class session. Valid for <strong>10 minutes</strong>.
                            </p>
                        </div>

                        {/* QR Code Container */}
                        <div className="bg-slate-900 p-5 rounded-2xl border-2 border-emerald-400/40 shadow-inner space-y-3 flex flex-col items-center">
                            <div className="bg-white p-4 rounded-2xl shadow-lg border-2 border-emerald-400">
                                <QRCodeSVG
                                    value={activeQrData.qr_payload || JSON.stringify({
                                        type: 'ATTENDANCE_QR',
                                        qr_code: activeQrData.qr_code,
                                        period: selectedPeriod,
                                        subject: selectedSubject,
                                        date: selectedDate
                                    })}
                                    size={200}
                                    level="H"
                                    includeMargin={true}
                                />
                            </div>
                            <div className="text-center space-y-1">
                                <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 flex items-center justify-center gap-1">
                                    <FaShieldAlt className="text-emerald-400" /> Scan QR to Mark All Present
                                </span>
                                <span className="text-xs font-mono font-bold tracking-wider text-emerald-300 block">
                                    Token Code: {activeQrData.qr_code}
                                </span>
                            </div>
                        </div>

                        {/* Live 10-Minute Countdown Display */}
                        <div className="flex flex-col items-center justify-center space-y-1">
                            <div className={`px-5 py-2 rounded-2xl font-mono font-black text-2xl flex items-center justify-center border-2 gap-2 ${
                                qrCountdown > 120
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                                    : qrCountdown > 30
                                    ? 'bg-amber-50 text-amber-700 border-amber-300 animate-pulse'
                                    : 'bg-rose-50 text-rose-700 border-rose-400 animate-pulse'
                            }`}>
                                <FaClock size={18} />
                                {formatTimeMMSS(qrCountdown)}
                            </div>
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                {qrCountdown > 0 ? 'Remaining QR Code Validity (10 Minutes Max)' : 'QR CODE EXPIRED'}
                            </span>
                        </div>

                        {/* Action Buttons */}
                        <div className="pt-2 border-t space-y-2">
                            <button
                                type="button"
                                onClick={handleRefreshScannedAttendance}
                                disabled={verifyingQr}
                                className="w-full py-3 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-black shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                            >
                                {verifyingQr ? (
                                    <>
                                        <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                        Refreshing Attendance List...
                                    </>
                                ) : (
                                    <>
                                        <FaSync /> Refresh Live Attendance List
                                    </>
                                )}
                            </button>

                             <div className="flex flex-col sm:flex-row gap-2">
                                <button
                                    type="button"
                                    onClick={handleStopQRSession}
                                    className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-all flex items-center justify-center gap-1 shadow-sm"
                                >
                                    <FaTimesCircle /> Stop & Deactivate QR
                                </button>
                                <button
                                    type="button"
                                    onClick={handleGenerateQR}
                                    className="flex-1 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition-all flex items-center justify-center gap-1"
                                >
                                    <FaSync /> Regenerate 10-Min QR
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setShowQrModal(false)}
                                    className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-all"
                                >
                                    Close
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}

            {/* STAFF 15-SECOND OTP DISPLAY MODAL */}
            {showOtpModal && activeOtpData && (
                <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md flex items-center justify-center p-4">
                    <motion.div
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full text-center space-y-6 border border-amber-200 shadow-2xl relative overflow-hidden"
                    >
                        <div className="absolute top-0 right-0 left-0 h-3 bg-gradient-to-r from-amber-500 via-orange-500 to-red-500" />

                        <div className="space-y-1 pt-2">
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 text-amber-800 text-[10px] font-black uppercase tracking-wider">
                                <FaBolt /> Temporary Attendance OTP
                            </span>
                            <h3 className="text-xl font-black text-slate-900">Period {selectedPeriod} Attendance OTP</h3>
                            <p className="text-xs font-medium text-slate-500">
                                Display this code to students. It expires in <strong>15 seconds</strong>.
                            </p>
                        </div>

                        {/* Large OTP Code & QR Code Display */}
                        <div className="bg-slate-900 p-5 rounded-2xl border-2 border-amber-400/40 shadow-inner space-y-4 flex flex-col items-center">
                            <div className="bg-white p-3 rounded-2xl shadow-lg border border-amber-300">
                                <QRCodeSVG
                                    value={JSON.stringify({
                                        type: 'ATTENDANCE_QR',
                                        otp_code: activeOtpData.otp_code,
                                        period: selectedPeriod,
                                        subject: selectedSubject,
                                        date: selectedDate
                                    })}
                                    size={180}
                                    level="H"
                                    includeMargin={true}
                                />
                            </div>
                            <div className="text-center space-y-1">
                                <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 flex items-center justify-center gap-1">
                                    <FaQrcode className="text-amber-400" /> Scan QR or Enter OTP Code
                                </span>
                                <span className="text-4xl sm:text-5xl font-mono font-black tracking-widest block text-amber-300">
                                    {activeOtpData.otp_code}
                                </span>
                            </div>
                        </div>

                        {/* Live 15s Countdown Ring */}
                        <div className="flex flex-col items-center justify-center space-y-1">
                            <div className={`w-14 h-14 rounded-full font-black text-xl flex items-center justify-center border-4 ${
                                otpCountdown > 5 ? 'bg-amber-50 text-amber-600 border-amber-400' : 'bg-rose-50 text-rose-600 border-rose-500 animate-pulse'
                            }`}>
                                {otpCountdown}s
                            </div>
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                {otpCountdown > 0 ? 'Remaining Validity' : 'OTP EXPIRED'}
                            </span>
                        </div>

                        <div className="pt-2 border-t flex flex-col sm:flex-row gap-2">
                            <button
                                type="button"
                                onClick={handleStopQRSession}
                                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-all flex items-center justify-center gap-1 shadow-sm"
                            >
                                <FaTimesCircle /> Stop Session
                            </button>
                            <button
                                type="button"
                                onClick={handleGenerateOTP}
                                className="flex-1 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition-all flex items-center justify-center gap-1"
                            >
                                <FaSync /> Regenerate OTP
                            </button>
                            <button
                                type="button"
                                onClick={() => setShowOtpModal(false)}
                                className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-all"
                            >
                                Close
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}

            {/* AUDIT LOGS MODAL */}
            {showAuditModal && (
                <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md flex items-center justify-center p-4">
                    <motion.div
                        initial={{ scale: 0.95, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="bg-white rounded-3xl p-6 max-w-4xl w-full max-h-[85vh] flex flex-col space-y-4 border border-slate-200 shadow-2xl"
                    >
                        <div className="flex items-center justify-between border-b pb-3">
                            <div>
                                <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                                    <FaHistory className="text-sky-600" /> Attendance Audit Logs & Transparency History
                                </h3>
                                <p className="text-xs text-slate-400">Detailed records for OTP generation, OTP verification, attendance marking, and modifications.</p>
                            </div>
                            <button onClick={() => setShowAuditModal(false)} className="text-slate-400 hover:text-slate-600 font-bold text-lg">&times;</button>
                        </div>

                        <div className="flex-1 overflow-y-auto">
                            {loadingAudit ? (
                                <div className="py-12 text-center text-slate-400 text-xs font-semibold">Loading audit history...</div>
                            ) : auditLogs.length === 0 ? (
                                <div className="py-12 text-center text-slate-400 text-xs">No audit logs recorded yet.</div>
                            ) : (
                                <table className="w-full text-left text-xs border-collapse">
                                    <thead>
                                        <tr className="bg-slate-50 text-slate-600 uppercase font-bold border-b border-slate-200">
                                            <th className="py-2.5 px-3">Timestamp</th>
                                            <th className="py-2.5 px-3">Action</th>
                                            <th className="py-2.5 px-3">Performed By</th>
                                            <th className="py-2.5 px-3">Student / Details</th>
                                            <th className="py-2.5 px-3">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {auditLogs.map((log) => (
                                            <tr key={log.id} className="hover:bg-slate-50/80">
                                                <td className="py-2.5 px-3 font-mono text-[11px] text-slate-500">
                                                    {log.created_at ? new Date(log.created_at).toLocaleString() : ''}
                                                </td>
                                                <td className="py-2.5 px-3">
                                                    <span className="font-extrabold text-slate-800 bg-slate-100 px-2 py-0.5 rounded text-[10px]">
                                                        {log.action}
                                                    </span>
                                                </td>
                                                <td className="py-2.5 px-3 font-bold text-slate-700">
                                                    {log.user_name || log.emp_id || 'System'} ({log.user_role || 'staff'})
                                                </td>
                                                <td className="py-2.5 px-3 text-slate-600">
                                                    {log.student_name ? <strong className="text-slate-800 font-bold mr-1">{log.student_name}:</strong> : ''}
                                                    {log.details}
                                                </td>
                                                <td className="py-2.5 px-3">
                                                    <span className={`px-2 py-0.5 rounded font-extrabold text-[10px] uppercase ${
                                                        log.status === 'SUCCESS' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                                                    }`}>
                                                        {log.status}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>

                        <div className="pt-3 border-t text-right">
                            <button onClick={() => setShowAuditModal(false)} className="px-5 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold">Close Logs</button>
                        </div>
                    </motion.div>
                </div>
            )}
        </Layout>
    );
};

export default StaffStudentAttendance;
