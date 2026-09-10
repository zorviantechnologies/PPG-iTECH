import { useState, useEffect, useCallback } from 'react';
import Layout from '../../components/Layout';
import api from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    FaFileInvoice, FaUpload, FaDownload, FaGlobe, FaEye, 
    FaTrash, FaPlus, FaCheckCircle, FaExclamationTriangle, 
    FaSearch, FaFilter, FaBuilding, FaGraduationCap, FaSave, FaSync, FaLock 
} from 'react-icons/fa';
import Swal from 'sweetalert2';

const ExamResultsPortal = () => {
    const { user } = useAuth();
    const [departments, setDepartments] = useState([]);
    const [selectedDept, setSelectedDept] = useState('');
    const [selectedYear, setSelectedYear] = useState('1');
    const [selectedSem, setSelectedSem] = useState('1');
    const [resultCategory, setResultCategory] = useState('internal'); // 'internal' | 'semester'

    const examName = resultCategory === 'semester' ? 'Semester Result' : 'Internal / Assessment Result';
    const isAdmin = user?.role === 'admin';
    const canManageCurrentType = resultCategory === 'internal' || isAdmin;
    
    const [resultsData, setResultsData] = useState([]);
    const [summaryStats, setSummaryStats] = useState({ totalEntries: 0, passCount: 0, failCount: 0, passPercentage: 0 });
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState('');
    const [isPublishing, setIsPublishing] = useState(false);

    // Modal / Upload State
    const [showUploadModal, setShowUploadModal] = useState(false);
    const [csvFile, setCsvFile] = useState(null);
    const [parsedPreview, setParsedPreview] = useState([]);
    const [uploading, setUploading] = useState(false);

    // Single Manual Entry State
    const [manualEntry, setManualEntry] = useState({
        student_reg_no: '',
        student_name: '',
        subject_code: '',
        subject_name: '',
        internal_marks: '20',
        external_marks: '60',
        max_marks: '100'
    });

    const getSemestersForYear = (year) => {
        const yr = Number(year) || 1;
        if (yr === 1) return [1, 2];
        if (yr === 2) return [3, 4];
        if (yr === 3) return [5, 6];
        if (yr === 4) return [7, 8];
        return [1, 2];
    };

    const handleYearChange = (yr) => {
        const yrStr = String(yr);
        setSelectedYear(yrStr);
        const validSemesters = getSemestersForYear(yrStr);
        if (!validSemesters.includes(Number(selectedSem))) {
            setSelectedSem(String(validSemesters[0]));
        }
    };

    const fetchResults = useCallback(async () => {
        setLoading(true);
        try {
            const queryParams = new URLSearchParams();
            if (selectedDept) queryParams.append('department_id', selectedDept);
            if (selectedYear) queryParams.append('academic_year', selectedYear);
            if (selectedSem) queryParams.append('semester', selectedSem);
            if (examName) queryParams.append('exam_name', examName);
            if (search) queryParams.append('search', search);

            const [resData, deptData] = await Promise.all([
                api.get(`/results?${queryParams.toString()}`),
                api.get('/departments')
            ]);

            setResultsData(resData.data?.results || []);
            setSummaryStats(resData.data?.summary || { totalEntries: 0, passCount: 0, failCount: 0, passPercentage: 0 });
            setDepartments(deptData.data || []);
            
            if (deptData.data?.length > 0 && !selectedDept) {
                setSelectedDept(deptData.data[0].id);
            }
        } catch (err) {
            console.error('Error fetching results:', err);
        } finally {
            setLoading(false);
        }
    }, [selectedDept, selectedYear, selectedSem, examName, search]);

    useEffect(() => {
        fetchResults();
    }, [fetchResults]);

    // Check if current view is fully published
    const isCurrentSetPublished = resultsData.length > 0 && resultsData.every(r => r.published);

    const handleTogglePublish = async () => {
        const targetState = !isCurrentSetPublished;
        const yearSuffix = selectedYear === '1' ? '1st' : selectedYear === '2' ? '2nd' : selectedYear === '3' ? '3rd' : '4th';
        const confirmMsg = targetState 
            ? `Publish exam results for ${yearSuffix} Year (Semester ${selectedSem})? Students will be able to view their grade cards.`
            : `Unpublish exam results? Students will no longer see these results on their portal.`;

        const result = await Swal.fire({
            title: targetState ? 'Publish Results?' : 'Unpublish Results?',
            text: confirmMsg,
            icon: targetState ? 'question' : 'warning',
            showCancelButton: true,
            confirmButtonColor: targetState ? '#10b981' : '#f59e0b',
            confirmButtonText: targetState ? 'Yes, Publish' : 'Yes, Unpublish'
        });

        if (result.isConfirmed) {
            setIsPublishing(true);
            try {
                await api.put('/results/publish', {
                    department_id: selectedDept || null,
                    academic_year: selectedYear,
                    semester: selectedSem,
                    exam_name: examName,
                    published: targetState
                });
                Swal.fire('Updated!', `Results have been ${targetState ? 'published' : 'unpublished'}.`, 'success');
                fetchResults();
            } catch (err) {
                Swal.fire('Error', 'Failed to update result publication status', 'error');
            } finally {
                setIsPublishing(false);
            }
        }
    };

    // Download CSV Template
    const handleDownloadTemplate = () => {
        const headers = ['Register Number,Student Name,Subject Code,Subject Name,Internal Marks,External Marks,Total Marks,Max Marks'];
        const sampleRows = [
            '712524205001,John Doe,CS8591,Computer Networks,18,65,83,100',
            '711522104002,Jane Smith,CS8591,Computer Networks,19,72,91,100'
        ];
        const blob = new Blob([[headers, ...sampleRows].join('\n')], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Exam_Results_Template_Year${selectedYear}_Sem${selectedSem}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    // Export Filtered Results to CSV File
    const handleExportCSV = () => {
        if (!resultsData || resultsData.length === 0) {
            return Swal.fire('Warning', 'No result data available to download', 'warning');
        }

        const headers = ['Register Number,Student Name,Department,Academic Year,Semester,Exam Name,Subject Code,Subject Name,Internal Marks,External Marks,Total Marks,Max Marks,Grade,Status,Published'];
        const rows = resultsData.map(r => {
            const dept = (r.department_name || '').replace(/,/g, ' ');
            const sName = (r.student_name || '').replace(/,/g, ' ');
            const subName = (r.subject_name || '').replace(/,/g, ' ');
            const eName = (r.exam_name || examName || '').replace(/,/g, ' ');

            return `${r.student_reg_no || ''},"${sName}","${dept}",${r.academic_year || selectedYear},${r.semester || selectedSem},"${eName}",${r.subject_code || ''},"${subName}",${r.internal_marks || 0},${r.external_marks || 0},${r.total_marks || 0},${r.max_marks || 100},${r.grade || ''},${r.status || ''},${r.published ? 'Yes' : 'No'}`;
        });

        const blob = new Blob([[headers.join('\n'), ...rows].join('\n')], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Exam_Results_Year${selectedYear}_Sem${selectedSem}_Export.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    // Parse CSV File
    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setCsvFile(file);
        const reader = new FileReader();
        reader.onload = (event) => {
            const text = event.target.result;
            const lines = text.split(/\r\n|\n/).filter(line => line.trim() !== '');
            if (lines.length <= 1) {
                return Swal.fire('Error', 'CSV file is empty or missing data rows', 'error');
            }

            const parsed = [];
            for (let i = 1; i < lines.length; i++) {
                const parts = lines[i].split(',').map(p => p.trim().replace(/^["']|["']$/g, ''));
                if (parts.length >= 4) {
                    const regNo = parts[0];
                    const name = parts[1];
                    const code = parts[2];
                    const sName = parts[3];
                    const internal = parseFloat(parts[4] || 0);
                    const external = parseFloat(parts[5] || 0);
                    const total = parts[6] ? parseFloat(parts[6]) : (internal + external);
                    const max = parts[7] ? parseFloat(parts[7]) : 100;

                    parsed.push({
                        student_reg_no: regNo,
                        student_name: name,
                        subject_code: code,
                        subject_name: sName,
                        internal_marks: internal,
                        external_marks: external,
                        total_marks: total,
                        max_marks: max
                    });
                }
            }
            setParsedPreview(parsed);
        };
        reader.readAsText(file);
    };

    // Upload Parsed Results
    const handleSaveBulkUpload = async () => {
        if (parsedPreview.length === 0) {
            return Swal.fire('Warning', 'No parsed rows to upload', 'warning');
        }

        setUploading(true);
        try {
            const payload = {
                results: parsedPreview,
                department_id: selectedDept || null,
                academic_year: selectedYear,
                semester: selectedSem,
                exam_name: examName,
                published: false
            };

            const { data } = await api.post('/results/upload', payload);
            Swal.fire('Success', data.message || 'Results uploaded successfully!', 'success');
            setShowUploadModal(false);
            setParsedPreview([]);
            setCsvFile(null);
            fetchResults();
        } catch (err) {
            Swal.fire('Error', err?.response?.data?.message || 'Failed to upload results', 'error');
        } finally {
            setUploading(false);
        }
    };

    // Add Manual Entry
    const handleAddManualEntry = async (e) => {
        e.preventDefault();
        if (!manualEntry.student_reg_no || !manualEntry.subject_code) {
            return Swal.fire('Warning', 'Register Number and Subject Code are required', 'warning');
        }

        const internal = parseFloat(manualEntry.internal_marks || 0);
        const external = parseFloat(manualEntry.external_marks || 0);
        const total = internal + external;

        const singleItem = {
            student_reg_no: manualEntry.student_reg_no,
            student_name: manualEntry.student_name || manualEntry.student_reg_no,
            subject_code: manualEntry.subject_code,
            subject_name: manualEntry.subject_name || manualEntry.subject_code,
            internal_marks: internal,
            external_marks: external,
            total_marks: total,
            max_marks: parseFloat(manualEntry.max_marks || 100)
        };

        try {
            await api.post('/results/upload', {
                results: [singleItem],
                department_id: selectedDept || null,
                academic_year: selectedYear,
                semester: selectedSem,
                exam_name: examName
            });
            Swal.fire('Saved', 'Exam result added successfully!', 'success');
            setManualEntry({
                student_reg_no: '',
                student_name: '',
                subject_code: '',
                subject_name: '',
                internal_marks: '20',
                external_marks: '60',
                max_marks: '100'
            });
            fetchResults();
        } catch (err) {
            Swal.fire('Error', 'Failed to save entry', 'error');
        }
    };

    const handleDeleteResult = async (id) => {
        try {
            await api.delete(`/results/${id}`);
            fetchResults();
        } catch (err) {
            Swal.fire('Error', 'Failed to delete entry', 'error');
        }
    };

    return (
        <Layout title="Examination Results Portal">
            <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">

                {/* Top Category Switcher Tabs: Internal / Assessment Result vs Semester Result */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-4 rounded-3xl border border-gray-100 shadow-sm">
                    <div className="flex items-center gap-2 p-1 bg-gray-100 rounded-2xl w-full sm:w-auto">
                        <button
                            onClick={() => setResultCategory('internal')}
                            className={`flex-1 sm:flex-none px-6 py-3 rounded-xl font-black text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${
                                resultCategory === 'internal'
                                    ? 'bg-sky-600 text-white shadow-md'
                                    : 'text-gray-600 hover:text-sky-600'
                            }`}
                        >
                            <FaFileInvoice /> Internal / Assessment Result
                        </button>
                        <button
                            onClick={() => setResultCategory('semester')}
                            className={`flex-1 sm:flex-none px-6 py-3 rounded-xl font-black text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${
                                resultCategory === 'semester'
                                    ? 'bg-indigo-600 text-white shadow-md'
                                    : 'text-gray-600 hover:text-indigo-600'
                            }`}
                        >
                            <FaGraduationCap /> Semester Result
                        </button>
                    </div>

                    {/* Action Buttons: Export CSV, CSV Template & Bulk Upload CSV */}
                    <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto justify-end">
                        <button
                            onClick={handleExportCSV}
                            disabled={resultsData.length === 0}
                            className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold px-4 py-2.5 rounded-2xl shadow-sm hover:shadow transition-all text-xs flex items-center gap-2 active:scale-95"
                            title="Download uploaded marks for selected filters"
                        >
                            <FaDownload /> Download CSV
                        </button>
                        {canManageCurrentType && (
                            <>
                                <button
                                    onClick={handleDownloadTemplate}
                                    className="bg-white hover:bg-gray-50 text-gray-700 font-bold px-4 py-2.5 rounded-2xl border border-gray-200 shadow-sm hover:shadow transition-all text-xs flex items-center gap-2 active:scale-95"
                                >
                                    <FaDownload className="text-sky-600" /> CSV Template
                                </button>
                                <button
                                    onClick={() => setShowUploadModal(true)}
                                    className="bg-sky-600 hover:bg-sky-700 text-white font-bold px-5 py-2.5 rounded-2xl shadow-lg shadow-sky-100 transition-all text-xs flex items-center gap-2 active:scale-95"
                                >
                                    <FaUpload /> Bulk Upload CSV
                                </button>
                            </>
                        )}
                    </div>
                </div>

                {!canManageCurrentType && (
                    <div className="bg-amber-50 border border-amber-200 text-amber-800 px-5 py-3 rounded-2xl text-xs font-bold flex items-center gap-3 shadow-sm">
                        <FaLock className="text-amber-600 shrink-0 text-base" />
                        <span>Semester Results upload and publishing options are managed exclusively by Admin. You are in read-only view mode.</span>
                    </div>
                )}

                {/* Department & Year / Semester Tabs Selector */}
                <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm space-y-4">
                    
                    {/* Academic Year Tabs (1st Year, 2nd Year, 3rd Year, 4th Year) */}
                    <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-gray-100 no-scrollbar">
                        {[1, 2, 3, 4].map((yr) => (
                            <button
                                key={yr}
                                onClick={() => handleYearChange(yr)}
                                className={`px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all shrink-0 flex items-center gap-2 ${
                                    String(selectedYear) === String(yr)
                                        ? 'bg-indigo-600 text-white shadow-md scale-[1.02]'
                                        : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
                                }`}
                            >
                                <FaGraduationCap /> {yr === 1 ? '1st Year' : yr === 2 ? '2nd Year' : yr === 3 ? '3rd Year' : '4th Year'}
                            </button>
                        ))}
                    </div>

                    {/* Department & Semester Controls */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 pt-2">
                        
                        <div>
                            <label className="block text-[10px] font-black uppercase text-gray-400 mb-1">Department</label>
                            <select
                                value={selectedDept}
                                onChange={(e) => setSelectedDept(e.target.value)}
                                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500"
                            >
                                <option value="">All Departments</option>
                                {departments.map(d => (
                                    <option key={d.id} value={d.id}>{d.name}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-[10px] font-black uppercase text-gray-400 mb-1">Semester</label>
                            <select
                                value={selectedSem}
                                onChange={(e) => setSelectedSem(e.target.value)}
                                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500"
                            >
                                {getSemestersForYear(selectedYear).map(s => (
                                    <option key={s} value={String(s)}>Semester {s}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-[10px] font-black uppercase text-gray-400 mb-1">Result Category</label>
                            <select
                                value={resultCategory}
                                onChange={(e) => setResultCategory(e.target.value)}
                                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500"
                            >
                                <option value="internal">Internal / Assessment Result</option>
                                <option value="semester">Semester Result</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-[10px] font-black uppercase text-gray-400 mb-1">Search Result</label>
                            <div className="relative">
                                <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs" />
                                <input
                                    type="text"
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    placeholder="Reg No, Subject..."
                                    className="w-full pl-8 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:outline-none focus:border-indigo-500"
                                />
                            </div>
                        </div>

                    </div>
                </div>

                {/* Publish Bar & Metrics */}
                <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
                    
                    {/* Summary Badges */}
                    <div className="flex items-center gap-4 text-xs">
                        <div>
                            <span className="text-gray-400 font-bold uppercase text-[10px] block">Total Records</span>
                            <span className="font-black text-gray-800 text-base">{summaryStats.totalEntries}</span>
                        </div>
                        <div className="h-8 w-px bg-gray-200" />
                        <div>
                            <span className="text-emerald-500 font-bold uppercase text-[10px] block">Pass Count</span>
                            <span className="font-black text-emerald-600 text-base">{summaryStats.passCount}</span>
                        </div>
                        <div className="h-8 w-px bg-gray-200" />
                        <div>
                            <span className="text-red-500 font-bold uppercase text-[10px] block">Fail Count</span>
                            <span className="font-black text-red-600 text-base">{summaryStats.failCount}</span>
                        </div>
                        <div className="h-8 w-px bg-gray-200" />
                        <div>
                            <span className="text-indigo-500 font-bold uppercase text-[10px] block">Pass Percentage</span>
                            <span className="font-black text-indigo-600 text-base">{summaryStats.passPercentage}%</span>
                        </div>
                    </div>

                    {/* Publish / Unpublish Action Button */}
                    <div className="flex items-center gap-3">
                        <span className={`text-xs font-bold px-3 py-1 rounded-full border ${
                            isCurrentSetPublished 
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                                : 'bg-amber-50 text-amber-700 border-amber-200'
                        }`}>
                            Status: {isCurrentSetPublished ? 'Published to Students' : 'Draft / Unpublished'}
                        </span>
                        {canManageCurrentType && (
                            <button
                                onClick={handleTogglePublish}
                                disabled={isPublishing || resultsData.length === 0}
                                className={`px-5 py-2.5 rounded-xl font-bold text-xs text-white shadow-md transition-all flex items-center gap-2 disabled:opacity-50 ${
                                    isCurrentSetPublished 
                                        ? 'bg-amber-600 hover:bg-amber-700' 
                                        : 'bg-emerald-600 hover:bg-emerald-700'
                                }`}
                            >
                                <FaGlobe /> {isCurrentSetPublished ? 'Unpublish Results' : 'Publish Results to Students'}
                            </button>
                        )}
                    </div>

                </div>

                {/* Manual Add Form Drawer */}
                {canManageCurrentType && (
                    <details className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden group">
                        <summary className="p-4 font-bold text-xs text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-50 flex items-center justify-between">
                            <span className="flex items-center gap-2 text-indigo-600"><FaPlus /> Add Single Result Entry Manually</span>
                            <span className="text-gray-400 text-xs">Click to expand</span>
                        </summary>
                        <form onSubmit={handleAddManualEntry} className="p-4 border-t border-gray-100 bg-gray-50/50 space-y-3">
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                            <input
                                type="text"
                                placeholder="Student Reg No *"
                                value={manualEntry.student_reg_no}
                                onChange={(e) => setManualEntry(prev => ({ ...prev, student_reg_no: e.target.value }))}
                                className="px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs"
                                required
                            />
                            <input
                                type="text"
                                placeholder="Student Name"
                                value={manualEntry.student_name}
                                onChange={(e) => setManualEntry(prev => ({ ...prev, student_name: e.target.value }))}
                                className="px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs"
                            />
                            <input
                                type="text"
                                placeholder="Subject Code (e.g. CS8591) *"
                                value={manualEntry.subject_code}
                                onChange={(e) => setManualEntry(prev => ({ ...prev, subject_code: e.target.value }))}
                                className="px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs"
                                required
                            />
                            <input
                                type="text"
                                placeholder="Subject Name"
                                value={manualEntry.subject_name}
                                onChange={(e) => setManualEntry(prev => ({ ...prev, subject_name: e.target.value }))}
                                className="px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs"
                            />
                            <input
                                type="number"
                                placeholder="Internal Marks"
                                value={manualEntry.internal_marks}
                                onChange={(e) => setManualEntry(prev => ({ ...prev, internal_marks: e.target.value }))}
                                className="px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs"
                            />
                            <input
                                type="number"
                                placeholder="External Marks"
                                value={manualEntry.external_marks}
                                onChange={(e) => setManualEntry(prev => ({ ...prev, external_marks: e.target.value }))}
                                className="px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs"
                            />
                            <input
                                type="number"
                                placeholder="Max Marks"
                                value={manualEntry.max_marks}
                                onChange={(e) => setManualEntry(prev => ({ ...prev, max_marks: e.target.value }))}
                                className="px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs"
                            />
                            <button
                                type="submit"
                                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-4 py-2 rounded-xl text-xs transition-colors flex items-center justify-center gap-1"
                            >
                                <FaSave /> Save Entry
                            </button>
                        </div>
                    </form>
                </details>
                )}

                {/* Results Data Table */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    {loading ? (
                        <div className="p-12 text-center text-gray-400">Loading exam results...</div>
                    ) : resultsData.length === 0 ? (
                        <div className="p-12 text-center text-gray-400 space-y-3">
                            <FaFileInvoice className="text-4xl text-gray-300 mx-auto" />
                            <p className="font-semibold text-gray-600">No examination results uploaded for selected year & department</p>
                            <button
                                onClick={() => setShowUploadModal(true)}
                                className="text-xs text-indigo-600 hover:underline font-bold"
                            >
                                Upload CSV File Now
                            </button>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-gray-50 text-gray-400 uppercase text-[10px] font-black tracking-wider border-b border-gray-100">
                                    <tr>
                                        <th className="py-3 px-5">Reg No & Name</th>
                                        <th className="py-3 px-4">Subject</th>
                                        <th className="py-3 px-3">Internal</th>
                                        <th className="py-3 px-3">External</th>
                                        <th className="py-3 px-3">Total</th>
                                        <th className="py-3 px-3">Grade</th>
                                        <th className="py-3 px-3">Result</th>
                                        <th className="py-3 px-4 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {resultsData.map((res) => (
                                        <tr key={res.id} className="hover:bg-gray-50/80 transition-colors">
                                            <td className="py-3.5 px-5">
                                                <div className="font-mono font-bold text-gray-800 text-xs">{res.student_reg_no}</div>
                                                <div className="text-xs text-gray-500">{res.student_name}</div>
                                            </td>
                                            <td className="py-3.5 px-4">
                                                <span className="font-mono font-bold text-indigo-600 text-xs bg-indigo-50 px-2 py-0.5 rounded mr-2">
                                                    {res.subject_code}
                                                </span>
                                                <span className="text-xs text-gray-700">{res.subject_name}</span>
                                            </td>
                                            <td className="py-3.5 px-3 font-semibold text-xs text-gray-600">{res.internal_marks}</td>
                                            <td className="py-3.5 px-3 font-semibold text-xs text-gray-600">{res.external_marks}</td>
                                            <td className="py-3.5 px-3 font-bold text-xs text-gray-900">{res.total_marks} / {res.max_marks}</td>
                                            <td className="py-3.5 px-3">
                                                <span className={`px-2 py-0.5 rounded font-black text-xs ${
                                                    ['O', 'A+', 'A'].includes(res.grade) 
                                                        ? 'bg-emerald-100 text-emerald-800' 
                                                        : res.grade === 'RA' || res.grade === 'F'
                                                            ? 'bg-red-100 text-red-800' 
                                                            : 'bg-blue-100 text-blue-800'
                                                }`}>
                                                    {res.grade}
                                                </span>
                                            </td>
                                            <td className="py-3.5 px-3">
                                                <span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase ${
                                                    (res.status || '').toUpperCase() === 'PASS'
                                                        ? 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                                                        : 'bg-red-50 text-red-600 border border-red-200'
                                                }`}>
                                                    {res.status}
                                                </span>
                                            </td>
                                            <td className="py-3.5 px-4 text-right">
                                                <button
                                                    onClick={() => handleDeleteResult(res.id)}
                                                    className="p-1.5 text-red-500 hover:bg-red-50 rounded transition-colors"
                                                    title="Delete Entry"
                                                >
                                                    <FaTrash />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* Bulk CSV Upload Modal */}
                {showUploadModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                        <div className="bg-white rounded-3xl p-6 md:p-8 max-w-2xl w-full shadow-2xl space-y-6">
                            <div className="flex items-center justify-between border-b border-gray-100 pb-4">
                                <h2 className="text-lg font-black text-gray-800 flex items-center gap-2">
                                    <FaUpload className="text-indigo-600" /> Bulk Upload Exam Results (CSV)
                                </h2>
                                <button
                                    onClick={() => setShowUploadModal(false)}
                                    className="text-gray-400 hover:text-gray-600 text-lg font-bold"
                                >
                                    ✕
                                </button>
                            </div>

                            <div className="space-y-4">
                                <div className="p-4 bg-indigo-50/50 rounded-2xl border border-indigo-100 text-xs text-indigo-900 space-y-2">
                                    <p className="font-bold">Instructions for CSV File:</p>
                                    <p>File headers must include: <code className="bg-white px-1.5 py-0.5 rounded border border-indigo-200">Register Number, Student Name, Subject Code, Subject Name, Internal Marks, External Marks, Total Marks, Max Marks</code></p>
                                </div>

                                <input
                                    type="file"
                                    accept=".csv"
                                    onChange={handleFileChange}
                                    className="w-full text-xs text-gray-500 file:mr-4 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                                />

                                {parsedPreview.length > 0 && (
                                    <div className="max-h-48 overflow-y-auto rounded-xl border border-gray-200 p-2 text-xs">
                                        <p className="font-bold text-gray-700 mb-2">Parsed {parsedPreview.length} items preview:</p>
                                        <table className="w-full text-left">
                                            <thead>
                                                <tr className="text-gray-400 uppercase text-[9px]">
                                                    <th>Reg No</th>
                                                    <th>Subject</th>
                                                    <th>Total</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {parsedPreview.slice(0, 5).map((row, idx) => (
                                                    <tr key={idx} className="border-t border-gray-100">
                                                        <td className="py-1 font-mono">{row.student_reg_no}</td>
                                                        <td className="py-1">{row.subject_code}</td>
                                                        <td className="py-1 font-bold">{row.total_marks}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                        {parsedPreview.length > 5 && (
                                            <p className="text-[10px] text-gray-400 mt-2">...and {parsedPreview.length - 5} more rows</p>
                                        )}
                                    </div>
                                )}
                            </div>

                            <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-100">
                                <button
                                    onClick={() => setShowUploadModal(false)}
                                    className="px-4 py-2 text-xs font-bold text-gray-500 hover:bg-gray-100 rounded-xl"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleSaveBulkUpload}
                                    disabled={uploading || parsedPreview.length === 0}
                                    className="px-6 py-2.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-md disabled:opacity-50"
                                >
                                    {uploading ? 'Processing...' : `Confirm Upload (${parsedPreview.length} records)`}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

            </div>
        </Layout>
    );
};

export default ExamResultsPortal;
