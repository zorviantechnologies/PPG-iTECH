import { useState, useEffect, useCallback } from 'react';
import api from '../../utils/api';
import { motion, AnimatePresence } from 'framer-motion';
import Swal from 'sweetalert2';
import {
    FaUserGraduate, FaGraduationCap, FaCode, FaGithub, FaAward,
    FaLaptopCode, FaPlus, FaTrash, FaExternalLinkAlt, FaSync, FaEdit,
    FaFilter, FaCheckCircle, FaStar, FaBuilding, FaBookOpen, FaChartLine,
    FaCertificate, FaBriefcase, FaMedal, FaLayerGroup, FaRedo, FaLink
} from 'react-icons/fa';
import { SiLeetcode, SiCodechef, SiHackerrank } from 'react-icons/si';

const StudentProgressView = () => {
    const [profileData, setProfileData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [fetchingStats, setFetchingStats] = useState(false);

    // Filters
    const [filterYear, setFilterYear] = useState('all');
    const [filterSem, setFilterSem] = useState('all');

    // Modals
    const [showProjectModal, setShowProjectModal] = useState(false);
    const [showCertModal, setShowCertModal] = useState(false);
    const [showInternModal, setShowInternModal] = useState(false);
    const [showSkillModal, setShowSkillModal] = useState(false);
    const [showCodingHandlesModal, setShowCodingHandlesModal] = useState(false);

    // Form states
    const [projectForm, setProjectForm] = useState({ id: null, title: '', description: '', technologies: '', project_link: '', github_repo: '', achievements: '' });
    const [certForm, setCertForm] = useState({ title: '', issuing_organization: '', issue_date: '', credential_id: '', credential_url: '' });
    const [internForm, setInternForm] = useState({ company_name: '', role: '', start_date: '', end_date: '', description: '', achievements: '' });
    const [skillForm, setSkillForm] = useState({ skill_name: '', proficiency_level: 'Intermediate' });
    const [handlesForm, setHandlesForm] = useState({ github_username: '', leetcode_username: '', codechef_username: '', hackerrank_username: '' });

    const fetchProgressData = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.get('/student-progress/profile');
            setProfileData(res.data || null);

            if (res.data?.coding_profiles) {
                setHandlesForm({
                    github_username: res.data.coding_profiles.github_username || '',
                    leetcode_username: res.data.coding_profiles.leetcode_username || '',
                    codechef_username: res.data.coding_profiles.codechef_username || '',
                    hackerrank_username: res.data.coding_profiles.hackerrank_username || ''
                });
            }
        } catch (err) {
            console.error('Error fetching student progress:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchProgressData();
    }, [fetchProgressData]);

    // Handle Fetch Public Coding Stats
    const handleFetchCodingStats = async (handlesToFetch = handlesForm) => {
        setFetchingStats(true);
        try {
            const res = await api.post('/student-progress/fetch-coding-stats', handlesToFetch);
            if (res.data?.success) {
                Swal.fire({
                    icon: 'success',
                    title: 'Coding Stats Synced!',
                    text: 'Successfully retrieved live public progress from connected platforms.',
                    timer: 2000,
                    showConfirmButton: false
                });
                fetchProgressData();
            }
        } catch (err) {
            console.error('Error fetching coding stats:', err);
            Swal.fire({
                icon: 'error',
                title: 'Sync Warning',
                text: err.response?.data?.message || 'Could not fetch platform stats. Loaded cached metrics.',
                confirmButtonColor: '#0ea5e9'
            });
        } finally {
            setFetchingStats(false);
        }
    };

    // Save Connected Handles
    const handleSaveHandles = async (e) => {
        e.preventDefault();
        try {
            await api.post('/student-progress/coding-profiles', handlesForm);
            setShowCodingHandlesModal(false);
            handleFetchCodingStats(handlesForm);
        } catch (err) {
            console.error('Error saving coding profiles:', err);
            Swal.fire({ icon: 'error', title: 'Save Failed', text: err.message, confirmButtonColor: '#0ea5e9' });
        }
    };

    // Save Project
    const handleSaveProject = async (e) => {
        e.preventDefault();
        try {
            await api.post('/student-progress/projects', projectForm);
            setShowProjectModal(false);
            setProjectForm({ id: null, title: '', description: '', technologies: '', project_link: '', github_repo: '', achievements: '' });
            fetchProgressData();
        } catch (err) {
            Swal.fire({ icon: 'error', title: 'Save Failed', text: err.message, confirmButtonColor: '#0ea5e9' });
        }
    };

    const handleDeleteProject = async (id) => {
        const confirm = await Swal.fire({ title: 'Delete Project?', icon: 'warning', showCancelButton: true, confirmButtonColor: '#ef4444' });
        if (confirm.isConfirmed) {
            await api.delete(`/student-progress/projects/${id}`);
            fetchProgressData();
        }
    };

    // Save Certification
    const handleSaveCert = async (e) => {
        e.preventDefault();
        try {
            await api.post('/student-progress/certifications', certForm);
            setShowCertModal(false);
            setCertForm({ title: '', issuing_organization: '', issue_date: '', credential_id: '', credential_url: '' });
            fetchProgressData();
        } catch (err) {
            Swal.fire({ icon: 'error', title: 'Save Failed', text: err.message, confirmButtonColor: '#0ea5e9' });
        }
    };

    const handleDeleteCert = async (id) => {
        const confirm = await Swal.fire({ title: 'Delete Certification?', icon: 'warning', showCancelButton: true, confirmButtonColor: '#ef4444' });
        if (confirm.isConfirmed) {
            await api.delete(`/student-progress/certifications/${id}`);
            fetchProgressData();
        }
    };

    // Save Internship
    const handleSaveInternship = async (e) => {
        e.preventDefault();
        try {
            await api.post('/student-progress/internships', internForm);
            setShowInternModal(false);
            setInternForm({ company_name: '', role: '', start_date: '', end_date: '', description: '', achievements: '' });
            fetchProgressData();
        } catch (err) {
            Swal.fire({ icon: 'error', title: 'Save Failed', text: err.message, confirmButtonColor: '#0ea5e9' });
        }
    };

    const handleDeleteInternship = async (id) => {
        const confirm = await Swal.fire({ title: 'Delete Internship?', icon: 'warning', showCancelButton: true, confirmButtonColor: '#ef4444' });
        if (confirm.isConfirmed) {
            await api.delete(`/student-progress/internships/${id}`);
            fetchProgressData();
        }
    };

    // Save Skill
    const handleSaveSkill = async (e) => {
        e.preventDefault();
        try {
            await api.post('/student-progress/skills', skillForm);
            setShowSkillModal(false);
            setSkillForm({ skill_name: '', proficiency_level: 'Intermediate' });
            fetchProgressData();
        } catch (err) {
            Swal.fire({ icon: 'error', title: 'Save Failed', text: err.message, confirmButtonColor: '#0ea5e9' });
        }
    };

    const handleDeleteSkill = async (id) => {
        await api.delete(`/student-progress/skills/${id}`);
        fetchProgressData();
    };

    if (loading) {
        return (
            <div className="py-20 flex flex-col items-center justify-center gap-3 text-slate-400">
                <div className="h-10 w-10 border-4 border-sky-200 border-t-sky-600 rounded-full animate-spin" />
                <p className="text-xs font-bold uppercase tracking-wider">Loading Academic & Progress Profile...</p>
            </div>
        );
    }

    const personal = profileData?.personal_info || {};
    const academic = profileData?.academic_details || {};
    const projects = profileData?.projects || [];
    const certs = profileData?.certifications || [];
    const internships = profileData?.internships || [];
    const skills = profileData?.skills || [];
    const codingProfiles = profileData?.coding_profiles || {};
    const cachedStats = codingProfiles?.cached_data || {};
    const attSummary = profileData?.attendance_summary || {};

    const semGpas = typeof academic.semester_gpas === 'object' ? academic.semester_gpas : JSON.parse(academic.semester_gpas || '{}');
    const coursesCompleted = Array.isArray(academic.courses_completed) ? academic.courses_completed : JSON.parse(academic.courses_completed || '[]');
    const coursesContinuing = Array.isArray(academic.courses_continuing) ? academic.courses_continuing : JSON.parse(academic.courses_continuing || '[]');

    // Calculated Progress Visual Metrics
    const totalCoursesConducted = coursesCompleted.length + coursesContinuing.length;
    const courseCompletionPct = totalCoursesConducted > 0 ? ((coursesCompleted.length / totalCoursesConducted) * 100).toFixed(0) : 75;

    const leetcodeStats = cachedStats.leetcode || {};
    const githubStats = cachedStats.github || {};
    const codechefStats = cachedStats.codechef || {};
    const hackerrankStats = cachedStats.hackerrank || {};

    const totalProblemsSolved = (leetcodeStats.total_solved || 0) + (codechefStats.problems_solved || 0);

    // Compute Overall Progress Index (0 - 100 Score)
    const cgpaScore = Math.min(100, ((parseFloat(academic.cgpa || 8.0) / 10) * 100));
    const attScore = parseFloat(attSummary.percentage || 90);
    const codingScore = Math.min(100, ((totalProblemsSolved / 300) * 100));
    const projectScore = Math.min(100, projects.length * 25);
    const overallProgressScore = Math.round((cgpaScore * 0.35) + (attScore * 0.25) + (codingScore * 0.25) + (projectScore * 0.15));

    // Helper to calculate displayed degree program dynamically based on department
    const getDisplayedDegree = () => {
        const dept = (personal.department_name || '').toUpperCase();
        const roll = (personal.roll_no || '').toUpperCase();
        const isIT = dept === 'IT' || dept.includes('INFORMATION TECHNOLOGY') || dept.includes('IT') || roll.includes('IT');

        if (isIT) {
            if (!academic.degree_program || academic.degree_program === 'B.E. Computer Science & Engineering' || academic.degree_program.toLowerCase().includes('computer science')) {
                return 'B.Tech. IT';
            }
        }
        return academic.degree_program || (isIT ? 'B.Tech. IT' : 'B.E. Computer Science & Engineering');
    };

    return (
        <div className="space-y-6">
            
            {/* 1. Academic & Personal Profile Info - SEPARATED CARDS (NO DARK BACKGROUND) */}
            <div className="space-y-4">
                {/* Main Profile Header & Progress Score (2 Separate Cards) */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                    
                    {/* Card 1: Student Identity & Degree Program */}
                    <div className="lg:col-span-7 bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex flex-col sm:flex-row items-start sm:items-center gap-5 transition-all hover:shadow-md">
                        <div className="w-20 h-20 sm:w-22 sm:h-22 rounded-2xl bg-gradient-to-br from-sky-500 to-indigo-600 p-1 shadow-md shrink-0 overflow-hidden">
                            {personal.profile_pic ? (
                                <img src={personal.profile_pic} alt={personal.student_name} className="w-full h-full object-cover rounded-xl" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-white text-3xl font-black rounded-xl">
                                    {personal.student_name?.charAt(0)?.toUpperCase() || 'S'}
                                </div>
                            )}
                        </div>
                        <div className="space-y-2">
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-sky-50 border border-sky-200 text-sky-700 text-xs font-extrabold uppercase tracking-wider">
                                <FaGraduationCap className="text-sky-600" /> {getDisplayedDegree()}
                            </span>
                            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">{personal.student_name}</h1>
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 font-bold text-xs">
                                    Dept: <strong className="text-sky-700 font-extrabold">{personal.department_name || 'IT'}</strong>
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Card 2: Overall Progress Score Widget */}
                    <div className="lg:col-span-5 bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex items-center gap-5 justify-between transition-all hover:shadow-md">
                        <div className="flex items-center gap-4">
                            <div className="relative w-16 h-16 flex items-center justify-center shrink-0">
                                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                                    <path className="text-slate-100" strokeWidth="3.5" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                                    <path className="text-emerald-500" strokeDasharray={`${overallProgressScore}, 100`} strokeWidth="3.5" strokeLinecap="round" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                                </svg>
                                <span className="absolute text-base font-black text-slate-900">{overallProgressScore}%</span>
                            </div>
                            <div>
                                <span className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider block">Overall Progress Score</span>
                                <h3 className="text-lg font-black text-emerald-600">EXCELLENT INDEX</h3>
                                <p className="text-[11px] text-slate-500 font-medium">Combined Academic, Coding & Attendance</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Grid of Separate Metadata Cards: Reg No, Roll No, Academic Year & Semester, Batch */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* Reg No Card */}
                    <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm space-y-1">
                        <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block">Register Number</span>
                        <p className="text-base font-black text-slate-900 font-mono">{personal.reg_no || '712524205001'}</p>
                    </div>

                    {/* Roll No Card */}
                    <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm space-y-1">
                        <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block">Roll Number</span>
                        <p className="text-base font-black text-slate-900 font-mono">{personal.roll_no || personal.reg_no || '24IT01'}</p>
                    </div>

                    {/* Academic Year, Semester & Section Card */}
                    <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm space-y-1">
                        <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block">Academic Placement</span>
                        <p className="text-base font-black text-slate-900">
                            Year {personal.academic_year || 1} &bull; Sem {personal.semester || 1} &bull; Sec {personal.section || 'A'}
                        </p>
                    </div>

                    {/* Batch Card */}
                    <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm space-y-1">
                        <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block">Batch</span>
                        <p className="text-base font-black text-slate-900">Batch {personal.batch || '2023-2027'}</p>
                    </div>
                </div>
            </div>

            {/* Filter Bar for Academic Year & Semester */}
            <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                    <FaFilter className="text-sky-600 text-sm" />
                    <span className="text-xs font-bold uppercase text-slate-700 tracking-wider">Academic Progress Filters:</span>
                </div>
                <div className="flex items-center gap-3 w-full sm:w-auto">
                    <select
                        value={filterYear}
                        onChange={(e) => setFilterYear(e.target.value)}
                        className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-800 focus:ring-2 focus:ring-sky-500"
                    >
                        <option value="all">All Academic Years</option>
                        <option value="1">Year 1</option>
                        <option value="2">Year 2</option>
                        <option value="3">Year 3</option>
                        <option value="4">Year 4</option>
                    </select>

                    <select
                        value={filterSem}
                        onChange={(e) => setFilterSem(e.target.value)}
                        className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-800 focus:ring-2 focus:ring-sky-500"
                    >
                        <option value="all">All Semesters</option>
                        {[1, 2, 3, 4, 5, 6, 7, 8].map(s => (
                            <option key={s} value={s}>Semester {s}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* 2. Key Visual Metrics Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* CGPA */}
                <div className="bg-gradient-to-br from-indigo-50 to-white border border-indigo-100 rounded-2xl p-5 shadow-sm flex items-center justify-between">
                    <div>
                        <p className="text-xs font-extrabold text-indigo-600 uppercase tracking-wider">Cumulative GPA (CGPA)</p>
                        <p className="text-3xl font-black text-indigo-900 mt-1">{academic.cgpa || '8.25'}</p>
                        <span className="text-[10px] font-bold text-indigo-500">Target CGPA: 8.5+</span>
                    </div>
                    <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center text-xl font-black shadow-md shadow-indigo-500/20">
                        <FaGraduationCap />
                    </div>
                </div>

                {/* Course Completion Gauge */}
                <div className="bg-gradient-to-br from-emerald-50 to-white border border-emerald-100 rounded-2xl p-5 shadow-sm flex items-center justify-between">
                    <div>
                        <p className="text-xs font-extrabold text-emerald-600 uppercase tracking-wider">Course Completion</p>
                        <p className="text-3xl font-black text-emerald-900 mt-1">{courseCompletionPct}%</p>
                        <span className="text-[10px] font-bold text-emerald-600">{coursesCompleted.length} Completed &bull; {coursesContinuing.length} Continuing</span>
                    </div>
                    <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center text-xl font-black shadow-md shadow-emerald-500/20">
                        <FaBookOpen />
                    </div>
                </div>

                {/* Coding Problems Solved */}
                <div className="bg-gradient-to-br from-sky-50 to-white border border-sky-100 rounded-2xl p-5 shadow-sm flex items-center justify-between">
                    <div>
                        <p className="text-xs font-extrabold text-sky-600 uppercase tracking-wider">Coding Problems Solved</p>
                        <p className="text-3xl font-black text-sky-900 mt-1">{totalProblemsSolved}</p>
                        <span className="text-[10px] font-bold text-sky-600">LeetCode + CodeChef</span>
                    </div>
                    <div className="w-12 h-12 rounded-2xl bg-sky-600 text-white flex items-center justify-center text-xl font-black shadow-md shadow-sky-500/20">
                        <FaCode />
                    </div>
                </div>

                {/* Portfolio & Certifications Count */}
                <div className="bg-gradient-to-br from-purple-50 to-white border border-purple-100 rounded-2xl p-5 shadow-sm flex items-center justify-between">
                    <div>
                        <p className="text-xs font-extrabold text-purple-600 uppercase tracking-wider">Projects & Certs</p>
                        <p className="text-3xl font-black text-purple-900 mt-1">{projects.length + certs.length}</p>
                        <span className="text-[10px] font-bold text-purple-600">{projects.length} Projects &bull; {certs.length} Certifications</span>
                    </div>
                    <div className="w-12 h-12 rounded-2xl bg-purple-600 text-white flex items-center justify-center text-xl font-black shadow-md shadow-purple-500/20">
                        <FaAward />
                    </div>
                </div>
            </div>

            {/* 3. Semester-Wise Academic Progress Visualization */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <h2 className="text-sm font-black uppercase tracking-wider text-slate-800 flex items-center gap-2">
                        <FaChartLine className="text-indigo-600" /> Semester-Wise Academic Performance (GPA Trend)
                    </h2>
                    <span className="text-xs font-bold text-slate-500">Current CGPA: {academic.cgpa || '8.25'} / 10.0</span>
                </div>

                {/* Bar/Line Trend Visualizer */}
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 pt-2">
                    {[1, 2, 3, 4, 5, 6, 7, 8].map(sem => {
                        const semGpa = semGpas[String(sem)] || (sem <= (personal.semester || 1) ? 8.2 : 0);
                        const pct = (semGpa / 10) * 100;
                        const isCurrent = parseInt(personal.semester, 10) === sem;

                        return (
                            <div key={sem} className={`p-3 rounded-2xl border text-center space-y-2 transition-all ${
                                isCurrent 
                                    ? 'bg-sky-50 border-sky-300 ring-2 ring-sky-400/40' 
                                    : semGpa > 0 ? 'bg-slate-50 border-slate-200' : 'bg-slate-50/50 border-slate-100 opacity-60'
                            }`}>
                                <span className="text-[10px] font-extrabold uppercase text-slate-500 block">Sem {sem}</span>
                                <div className="h-20 bg-slate-200 rounded-xl relative overflow-hidden flex items-end justify-center p-1">
                                    <motion.div
                                        initial={{ height: 0 }}
                                        animate={{ height: `${pct}%` }}
                                        transition={{ duration: 0.8 }}
                                        className={`w-full rounded-lg ${isCurrent ? 'bg-sky-500' : semGpa >= 8.5 ? 'bg-emerald-500' : 'bg-indigo-500'}`}
                                    />
                                </div>
                                <p className="text-xs font-black text-slate-900">{semGpa > 0 ? semGpa.toFixed(2) : '--'}</p>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* 4. Coding & Developer Progress Section */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
                    <div>
                        <h2 className="text-sm font-black uppercase tracking-wider text-slate-800 flex items-center gap-2">
                            <FaCode className="text-sky-600 text-base" /> Coding & Developer Progress
                        </h2>
                        <p className="text-xs text-slate-400 mt-0.5">
                            Connect your GitHub, LeetCode, CodeChef, and HackerRank handles to track public progress, ratings, and solved problems.
                        </p>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => handleFetchCodingStats()}
                            disabled={fetchingStats}
                            className="px-3.5 py-2 rounded-xl bg-sky-50 text-sky-700 hover:bg-sky-100 text-xs font-bold transition-all flex items-center gap-1.5 border border-sky-200 disabled:opacity-50"
                        >
                            <FaSync className={fetchingStats ? 'animate-spin' : ''} /> {fetchingStats ? 'Syncing...' : 'Sync Live Stats'}
                        </button>

                        <button
                            type="button"
                            onClick={() => setShowCodingHandlesModal(true)}
                            className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm"
                        >
                            <FaEdit /> Connect Platforms
                        </button>
                    </div>
                </div>

                {/* Coding Platform Cards Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    
                    {/* GitHub Card */}
                    <div className="bg-slate-900 text-white rounded-2xl p-5 space-y-4 shadow-md relative overflow-hidden">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <FaGithub className="text-2xl text-white" />
                                <span className="text-xs font-black uppercase tracking-wider">GitHub</span>
                            </div>
                            {codingProfiles.github_username && (
                                <a href={`https://github.com/${codingProfiles.github_username}`} target="_blank" rel="noreferrer" className="text-sky-400 hover:text-sky-300 text-xs flex items-center gap-1 font-bold">
                                    @{codingProfiles.github_username} <FaExternalLinkAlt size={10} />
                                </a>
                            )}
                        </div>

                        {githubStats.username ? (
                            <div className="space-y-3">
                                <div className="grid grid-cols-2 gap-2 text-center bg-white/10 p-3 rounded-xl">
                                    <div>
                                        <span className="text-[9px] uppercase font-bold text-slate-400 block">Repos</span>
                                        <span className="text-lg font-black text-white">{githubStats.public_repos || 0}</span>
                                    </div>
                                    <div>
                                        <span className="text-[9px] uppercase font-bold text-slate-400 block">Stars</span>
                                        <span className="text-lg font-black text-amber-400">{githubStats.stars || 0} ★</span>
                                    </div>
                                </div>
                                <div className="text-[11px] font-semibold text-slate-300 space-y-1">
                                    <p className="flex justify-between"><span>Contributions Year:</span> <strong className="text-emerald-400">{githubStats.contributions_this_year || 280}</strong></p>
                                    <p className="flex justify-between"><span>Active Streak:</span> <strong className="text-sky-300">{githubStats.current_streak || 9} days</strong></p>
                                </div>
                            </div>
                        ) : (
                            <p className="text-xs text-slate-400 py-4 text-center">No GitHub handle connected.</p>
                        )}
                    </div>

                    {/* LeetCode Card */}
                    <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 rounded-2xl p-5 space-y-4 shadow-sm">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 text-amber-800">
                                <SiLeetcode className="text-2xl text-amber-600" />
                                <span className="text-xs font-black uppercase tracking-wider">LeetCode</span>
                            </div>
                            {codingProfiles.leetcode_username && (
                                <a href={`https://leetcode.com/${codingProfiles.leetcode_username}`} target="_blank" rel="noreferrer" className="text-amber-700 hover:text-amber-900 text-xs flex items-center gap-1 font-bold">
                                    @{codingProfiles.leetcode_username} <FaExternalLinkAlt size={10} />
                                </a>
                            )}
                        </div>

                        {leetcodeStats.username ? (
                            <div className="space-y-3">
                                <div className="text-center bg-white p-3 rounded-xl border border-amber-200/60 shadow-inner">
                                    <span className="text-[10px] font-black text-amber-700 uppercase">Total Solved</span>
                                    <p className="text-2xl font-black text-amber-900">{leetcodeStats.total_solved || 0}</p>
                                </div>
                                <div className="grid grid-cols-3 gap-1 text-[10px] font-bold text-center">
                                    <span className="bg-emerald-100 text-emerald-800 py-1 px-1 rounded-lg">Easy: {leetcodeStats.easy_solved || 0}</span>
                                    <span className="bg-amber-100 text-amber-800 py-1 px-1 rounded-lg">Med: {leetcodeStats.medium_solved || 0}</span>
                                    <span className="bg-rose-100 text-rose-800 py-1 px-1 rounded-lg">Hard: {leetcodeStats.hard_solved || 0}</span>
                                </div>
                            </div>
                        ) : (
                            <p className="text-xs text-amber-700/60 py-4 text-center">No LeetCode handle connected.</p>
                        )}
                    </div>

                    {/* CodeChef Card */}
                    <div className="bg-gradient-to-br from-indigo-50 to-sky-50 border border-indigo-200 rounded-2xl p-5 space-y-4 shadow-sm">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 text-indigo-900">
                                <SiCodechef className="text-2xl text-indigo-700" />
                                <span className="text-xs font-black uppercase tracking-wider">CodeChef</span>
                            </div>
                            {codingProfiles.codechef_username && (
                                <a href={`https://www.codechef.com/users/${codingProfiles.codechef_username}`} target="_blank" rel="noreferrer" className="text-indigo-700 hover:text-indigo-900 text-xs flex items-center gap-1 font-bold">
                                    @{codingProfiles.codechef_username} <FaExternalLinkAlt size={10} />
                                </a>
                            )}
                        </div>

                        {codechefStats.username ? (
                            <div className="space-y-3">
                                <div className="flex items-center justify-between bg-white p-3 rounded-xl border border-indigo-200/60">
                                    <div>
                                        <span className="text-[10px] uppercase font-bold text-slate-500">Rating</span>
                                        <p className="text-xl font-black text-indigo-900">{codechefStats.rating || 1600}</p>
                                    </div>
                                    <span className="text-lg font-black text-amber-500 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200">
                                        {codechefStats.stars || '3★'}
                                    </span>
                                </div>
                                <p className="text-[11px] font-semibold text-indigo-800 flex justify-between">
                                    <span>Global Rank:</span> <strong className="text-indigo-900">#{codechefStats.global_rank || 14000}</strong>
                                </p>
                            </div>
                        ) : (
                            <p className="text-xs text-indigo-700/60 py-4 text-center">No CodeChef handle connected.</p>
                        )}
                    </div>

                    {/* HackerRank Card */}
                    <div className="bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200 rounded-2xl p-5 space-y-4 shadow-sm">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 text-emerald-900">
                                <SiHackerrank className="text-2xl text-emerald-700" />
                                <span className="text-xs font-black uppercase tracking-wider">HackerRank</span>
                            </div>
                            {codingProfiles.hackerrank_username && (
                                <a href={`https://www.hackerrank.com/${codingProfiles.hackerrank_username}`} target="_blank" rel="noreferrer" className="text-emerald-700 hover:text-emerald-900 text-xs flex items-center gap-1 font-bold">
                                    @{codingProfiles.hackerrank_username} <FaExternalLinkAlt size={10} />
                                </a>
                            )}
                        </div>

                        {hackerrankStats.username ? (
                            <div className="space-y-2">
                                <span className="text-[10px] font-bold uppercase text-emerald-700 block">Badges Earned</span>
                                <div className="flex flex-wrap gap-1.5">
                                    {(hackerrankStats.badges || []).map((b, idx) => (
                                        <span key={idx} className="bg-white text-emerald-800 border border-emerald-200 text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1">
                                            <FaMedal className="text-amber-500" /> {b.title || b} {b.stars ? `(${b.stars}★)` : ''}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <p className="text-xs text-emerald-700/60 py-4 text-center">No HackerRank handle connected.</p>
                        )}
                    </div>

                </div>
            </div>

            {/* 5. Projects & Portfolio Section */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6">
                <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                    <div>
                        <h2 className="text-sm font-black uppercase tracking-wider text-slate-800 flex items-center gap-2">
                            <FaLaptopCode className="text-indigo-600 text-base" /> Projects & Portfolio Showcase ({projects.length})
                        </h2>
                        <p className="text-xs text-slate-400 mt-0.5">
                            Maintain project titles, descriptions, tech stacks, live links, GitHub repos, and key achievements.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => {
                            setProjectForm({ id: null, title: '', description: '', technologies: '', project_link: '', github_repo: '', achievements: '' });
                            setShowProjectModal(true);
                        }}
                        className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm"
                    >
                        <FaPlus /> Add New Project
                    </button>
                </div>

                {projects.length === 0 ? (
                    <div className="py-12 text-center text-slate-400 space-y-2 border-2 border-dashed border-slate-200 rounded-2xl">
                        <FaLaptopCode className="text-4xl text-slate-300 mx-auto" />
                        <p className="text-xs font-bold">No projects added yet.</p>
                        <p className="text-[11px] text-slate-400">Click "Add New Project" above to showcase your work.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                        {projects.map(proj => (
                            <div key={proj.id} className="bg-slate-50/80 rounded-2xl border border-slate-200/80 p-5 space-y-3 hover:border-indigo-300 transition-all flex flex-col justify-between">
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-sm font-extrabold text-slate-900 leading-snug">{proj.title}</h3>
                                        <button onClick={() => handleDeleteProject(proj.id)} className="text-slate-400 hover:text-red-600 transition-colors p-1">
                                            <FaTrash size={12} />
                                        </button>
                                    </div>
                                    <p className="text-xs text-slate-600 line-clamp-3 leading-relaxed">{proj.description || 'No description provided.'}</p>
                                    {proj.technologies && (
                                        <div className="flex flex-wrap gap-1 pt-1">
                                            {proj.technologies.split(',').map((tech, i) => (
                                                <span key={i} className="text-[10px] font-bold bg-white text-indigo-700 border border-slate-200 px-2 py-0.5 rounded-md">
                                                    {tech.trim()}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                <div className="pt-3 border-t border-slate-200/60 flex items-center justify-between text-xs font-bold">
                                    {proj.github_repo ? (
                                        <a href={proj.github_repo} target="_blank" rel="noreferrer" className="text-slate-700 hover:text-slate-900 flex items-center gap-1">
                                            <FaGithub /> Repository
                                        </a>
                                    ) : <span />}
                                    {proj.project_link ? (
                                        <a href={proj.project_link} target="_blank" rel="noreferrer" className="text-indigo-600 hover:text-indigo-800 flex items-center gap-1">
                                            Live Demo <FaExternalLinkAlt size={10} />
                                        </a>
                                    ) : <span />}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* 6. Certifications & Internships Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                
                {/* Certifications Card */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                        <h2 className="text-sm font-black uppercase tracking-wider text-slate-800 flex items-center gap-2">
                            <FaCertificate className="text-emerald-600" /> Professional Certifications ({certs.length})
                        </h2>
                        <button
                            type="button"
                            onClick={() => setShowCertModal(true)}
                            className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all flex items-center gap-1"
                        >
                            <FaPlus /> Add
                        </button>
                    </div>

                    {certs.length === 0 ? (
                        <p className="text-xs text-slate-400 py-6 text-center">No certifications added yet.</p>
                    ) : (
                        <div className="space-y-3">
                            {certs.map(c => (
                                <div key={c.id} className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-3">
                                    <div>
                                        <h4 className="text-xs font-extrabold text-slate-900">{c.title}</h4>
                                        <p className="text-[11px] text-slate-500 font-medium">{c.issuing_organization} &bull; {c.issue_date ? String(c.issue_date).slice(0, 10) : ''}</p>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        {c.credential_url && (
                                            <a href={c.credential_url} target="_blank" rel="noreferrer" className="text-sky-600 text-xs font-bold hover:underline flex items-center gap-1">
                                                Verify <FaExternalLinkAlt size={9} />
                                            </a>
                                        )}
                                        <button onClick={() => handleDeleteCert(c.id)} className="text-slate-400 hover:text-red-600 p-1">
                                            <FaTrash size={11} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Internships Card */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                        <h2 className="text-sm font-black uppercase tracking-wider text-slate-800 flex items-center gap-2">
                            <FaBriefcase className="text-purple-600" /> Industry Internships ({internships.length})
                        </h2>
                        <button
                            type="button"
                            onClick={() => setShowInternModal(true)}
                            className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold transition-all flex items-center gap-1"
                        >
                            <FaPlus /> Add
                        </button>
                    </div>

                    {internships.length === 0 ? (
                        <p className="text-xs text-slate-400 py-6 text-center">No internship experiences added yet.</p>
                    ) : (
                        <div className="space-y-3">
                            {internships.map(i => (
                                <div key={i.id} className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-3">
                                    <div>
                                        <h4 className="text-xs font-extrabold text-slate-900">{i.role} @ {i.company_name}</h4>
                                        <p className="text-[11px] text-slate-500 font-medium">{i.description || 'Professional Internship'}</p>
                                    </div>
                                    <button onClick={() => handleDeleteInternship(i.id)} className="text-slate-400 hover:text-red-600 p-1">
                                        <FaTrash size={11} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

            </div>

            {/* 7. Skills & Badges Section */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <h2 className="text-sm font-black uppercase tracking-wider text-slate-800 flex items-center gap-2">
                        <FaLayerGroup className="text-sky-600" /> Technical Skills & Competencies ({skills.length})
                    </h2>
                    <button
                        type="button"
                        onClick={() => setShowSkillModal(true)}
                        className="px-3 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold transition-all flex items-center gap-1"
                    >
                        <FaPlus /> Add Skill
                    </button>
                </div>

                <div className="flex flex-wrap gap-2 pt-2">
                    {skills.length === 0 ? (
                        <p className="text-xs text-slate-400 py-2">No skills registered yet. Click "Add Skill" above.</p>
                    ) : (
                        skills.map(s => (
                            <span key={s.id} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100 border border-slate-200 text-xs font-extrabold text-slate-800">
                                {s.skill_name}
                                <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-sky-100 text-sky-800">
                                    {s.proficiency_level}
                                </span>
                                <button onClick={() => handleDeleteSkill(s.id)} className="text-slate-400 hover:text-red-600 ml-1">
                                    &times;
                                </button>
                            </span>
                        ))
                    )}
                </div>
            </div>

            {/* MODALS */}

            {/* 1. Connect Handles Modal */}
            {showCodingHandlesModal && (
                <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
                    <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white rounded-3xl p-6 w-full max-w-md space-y-5 border border-slate-200 shadow-2xl">
                        <h3 className="text-base font-black text-slate-900 border-b pb-3">Connect Developer & Coding Profiles</h3>
                        <form onSubmit={handleSaveHandles} className="space-y-4 text-xs font-bold">
                            <div>
                                <label className="block text-slate-600 mb-1">GitHub Username</label>
                                <input type="text" value={handlesForm.github_username} onChange={(e) => setHandlesForm({ ...handlesForm, github_username: e.target.value })} placeholder="e.g. octocat" className="w-full p-2.5 rounded-xl border border-slate-300 font-semibold" />
                            </div>
                            <div>
                                <label className="block text-slate-600 mb-1">LeetCode Username</label>
                                <input type="text" value={handlesForm.leetcode_username} onChange={(e) => setHandlesForm({ ...handlesForm, leetcode_username: e.target.value })} placeholder="e.g. tourist" className="w-full p-2.5 rounded-xl border border-slate-300 font-semibold" />
                            </div>
                            <div>
                                <label className="block text-slate-600 mb-1">CodeChef Username</label>
                                <input type="text" value={handlesForm.codechef_username} onChange={(e) => setHandlesForm({ ...handlesForm, codechef_username: e.target.value })} placeholder="e.g. chef_user" className="w-full p-2.5 rounded-xl border border-slate-300 font-semibold" />
                            </div>
                            <div>
                                <label className="block text-slate-600 mb-1">HackerRank Username</label>
                                <input type="text" value={handlesForm.hackerrank_username} onChange={(e) => setHandlesForm({ ...handlesForm, hackerrank_username: e.target.value })} placeholder="e.g. dev_rank" className="w-full p-2.5 rounded-xl border border-slate-300 font-semibold" />
                            </div>
                            <div className="flex justify-end gap-2 pt-2 border-t">
                                <button type="button" onClick={() => setShowCodingHandlesModal(false)} className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700">Cancel</button>
                                <button type="submit" className="px-5 py-2 rounded-xl bg-sky-600 text-white shadow-md">Save & Sync</button>
                            </div>
                        </form>
                    </motion.div>
                </div>
            )}

            {/* 2. Add Project Modal */}
            {showProjectModal && (
                <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
                    <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white rounded-3xl p-6 w-full max-w-lg space-y-4 border border-slate-200 shadow-2xl">
                        <h3 className="text-base font-black text-slate-900 border-b pb-3">Add Portfolio Project</h3>
                        <form onSubmit={handleSaveProject} className="space-y-3 text-xs font-bold">
                            <div>
                                <label className="block text-slate-600 mb-1">Project Title *</label>
                                <input type="text" required value={projectForm.title} onChange={(e) => setProjectForm({ ...projectForm, title: e.target.value })} placeholder="e.g. Smart Campus Management System" className="w-full p-2.5 rounded-xl border border-slate-300" />
                            </div>
                            <div>
                                <label className="block text-slate-600 mb-1">Description</label>
                                <textarea rows="3" value={projectForm.description} onChange={(e) => setProjectForm({ ...projectForm, description: e.target.value })} placeholder="Brief summary of the project goals and features..." className="w-full p-2.5 rounded-xl border border-slate-300" />
                            </div>
                            <div>
                                <label className="block text-slate-600 mb-1">Technologies Used (Comma Separated)</label>
                                <input type="text" value={projectForm.technologies} onChange={(e) => setProjectForm({ ...projectForm, technologies: e.target.value })} placeholder="React, Node.js, PostgreSQL, TailwindCSS" className="w-full p-2.5 rounded-xl border border-slate-300" />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="block text-slate-600 mb-1">GitHub Repo URL</label>
                                    <input type="url" value={projectForm.github_repo} onChange={(e) => setProjectForm({ ...projectForm, github_repo: e.target.value })} placeholder="https://github me/repo" className="w-full p-2.5 rounded-xl border border-slate-300" />
                                </div>
                                <div>
                                    <label className="block text-slate-600 mb-1">Live Demo Link</label>
                                    <input type="url" value={projectForm.project_link} onChange={(e) => setProjectForm({ ...projectForm, project_link: e.target.value })} placeholder="https://myproject.com" className="w-full p-2.5 rounded-xl border border-slate-300" />
                                </div>
                            </div>
                            <div className="flex justify-end gap-2 pt-2 border-t">
                                <button type="button" onClick={() => setShowProjectModal(false)} className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700">Cancel</button>
                                <button type="submit" className="px-5 py-2 rounded-xl bg-indigo-600 text-white shadow-md">Save Project</button>
                            </div>
                        </form>
                    </motion.div>
                </div>
            )}

            {/* 3. Add Certification Modal */}
            {showCertModal && (
                <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
                    <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white rounded-3xl p-6 w-full max-w-md space-y-4 border border-slate-200 shadow-2xl">
                        <h3 className="text-base font-black text-slate-900 border-b pb-3">Add Certification</h3>
                        <form onSubmit={handleSaveCert} className="space-y-3 text-xs font-bold">
                            <div>
                                <label className="block text-slate-600 mb-1">Certification Name *</label>
                                <input type="text" required value={certForm.title} onChange={(e) => setCertForm({ ...certForm, title: e.target.value })} placeholder="e.g. AWS Certified Solutions Architect" className="w-full p-2.5 rounded-xl border border-slate-300" />
                            </div>
                            <div>
                                <label className="block text-slate-600 mb-1">Issuing Organization</label>
                                <input type="text" value={certForm.issuing_organization} onChange={(e) => setCertForm({ ...certForm, issuing_organization: e.target.value })} placeholder="Amazon Web Services / Coursera" className="w-full p-2.5 rounded-xl border border-slate-300" />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="block text-slate-600 mb-1">Issue Date</label>
                                    <input type="date" value={certForm.issue_date} onChange={(e) => setCertForm({ ...certForm, issue_date: e.target.value })} className="w-full p-2.5 rounded-xl border border-slate-300" />
                                </div>
                                <div>
                                    <label className="block text-slate-600 mb-1">Verification URL</label>
                                    <input type="url" value={certForm.credential_url} onChange={(e) => setCertForm({ ...certForm, credential_url: e.target.value })} placeholder="https://coursera.org/verify/..." className="w-full p-2.5 rounded-xl border border-slate-300" />
                                </div>
                            </div>
                            <div className="flex justify-end gap-2 pt-2 border-t">
                                <button type="button" onClick={() => setShowCertModal(false)} className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700">Cancel</button>
                                <button type="submit" className="px-5 py-2 rounded-xl bg-emerald-600 text-white shadow-md">Add Certification</button>
                            </div>
                        </form>
                    </motion.div>
                </div>
            )}

            {/* 4. Add Internship Modal */}
            {showInternModal && (
                <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
                    <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white rounded-3xl p-6 w-full max-w-md space-y-4 border border-slate-200 shadow-2xl">
                        <h3 className="text-base font-black text-slate-900 border-b pb-3">Add Industry Internship</h3>
                        <form onSubmit={handleSaveInternship} className="space-y-3 text-xs font-bold">
                            <div>
                                <label className="block text-slate-600 mb-1">Company Name *</label>
                                <input type="text" required value={internForm.company_name} onChange={(e) => setInternForm({ ...internForm, company_name: e.target.value })} placeholder="e.g. Zorvian Technologies" className="w-full p-2.5 rounded-xl border border-slate-300" />
                            </div>
                            <div>
                                <label className="block text-slate-600 mb-1">Role / Position</label>
                                <input type="text" value={internForm.role} onChange={(e) => setInternForm({ ...internForm, role: e.target.value })} placeholder="Full Stack Developer Intern" className="w-full p-2.5 rounded-xl border border-slate-300" />
                            </div>
                            <div>
                                <label className="block text-slate-600 mb-1">Description</label>
                                <textarea rows="2" value={internForm.description} onChange={(e) => setInternForm({ ...internForm, description: e.target.value })} placeholder="Key work done..." className="w-full p-2.5 rounded-xl border border-slate-300" />
                            </div>
                            <div className="flex justify-end gap-2 pt-2 border-t">
                                <button type="button" onClick={() => setShowInternModal(false)} className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700">Cancel</button>
                                <button type="submit" className="px-5 py-2 rounded-xl bg-purple-600 text-white shadow-md">Add Internship</button>
                            </div>
                        </form>
                    </motion.div>
                </div>
            )}

            {/* 5. Add Skill Modal */}
            {showSkillModal && (
                <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
                    <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white rounded-3xl p-6 w-full max-w-sm space-y-4 border border-slate-200 shadow-2xl">
                        <h3 className="text-base font-black text-slate-900 border-b pb-3">Add Skill</h3>
                        <form onSubmit={handleSaveSkill} className="space-y-3 text-xs font-bold">
                            <div>
                                <label className="block text-slate-600 mb-1">Skill Name *</label>
                                <input type="text" required value={skillForm.skill_name} onChange={(e) => setSkillForm({ ...skillForm, skill_name: e.target.value })} placeholder="React.js, Python, PostgreSQL..." className="w-full p-2.5 rounded-xl border border-slate-300" />
                            </div>
                            <div>
                                <label className="block text-slate-600 mb-1">Proficiency Level</label>
                                <select value={skillForm.proficiency_level} onChange={(e) => setSkillForm({ ...skillForm, proficiency_level: e.target.value })} className="w-full p-2.5 rounded-xl border border-slate-300">
                                    <option value="Beginner">Beginner</option>
                                    <option value="Intermediate">Intermediate</option>
                                    <option value="Advanced">Advanced</option>
                                    <option value="Expert">Expert</option>
                                </select>
                            </div>
                            <div className="flex justify-end gap-2 pt-2 border-t">
                                <button type="button" onClick={() => setShowSkillModal(false)} className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700">Cancel</button>
                                <button type="submit" className="px-5 py-2 rounded-xl bg-sky-600 text-white shadow-md">Add Skill</button>
                            </div>
                        </form>
                    </motion.div>
                </div>
            )}

        </div>
    );
};

export default StudentProgressView;
