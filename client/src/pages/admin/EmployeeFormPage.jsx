import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FaArrowLeft, FaSave, FaUser, FaUniversity, FaMapMarkerAlt, FaUsers, FaLock, FaCertificate, FaPlus, FaTrash, FaMinusCircle } from 'react-icons/fa';
import Layout from '../../components/Layout';
import api from '../../utils/api';
import Swal from 'sweetalert2';
import { motion } from 'framer-motion';
import { useAuth } from '../../context/AuthContext';

const inputClass = "w-full p-4 bg-gray-50 border border-gray-100 rounded-2xl outline-none focus:ring-4 focus:ring-sky-100 focus:border-sky-500 transition-all font-bold text-gray-700 text-sm disabled:opacity-70 disabled:bg-gray-100/60 disabled:cursor-not-allowed disabled:text-gray-500 disabled:border-gray-50";
const labelClass = "block text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-3 ml-1";

const normalizeEmployeeCategory = (value) => {
    const v = String(value || '').trim().toLowerCase();
    if (v === 'teaching') return 'Teaching';
    if (v === 'non-teaching' || v === 'non teaching' || v === 'nonteaching') return 'Non-Teaching';
    if (v === 'workers' || v === 'worker') return 'Workers';
    return '';
};

const FormSection = ({ title, icon, children }) => (
    <div className="mb-12 border-b border-gray-50 pb-12 last:border-0 last:pb-0">
        <div className="flex items-center gap-4 mb-8">
            <div className="h-10 w-10 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center">
                {icon}
            </div>
            <h3 className="text-xl font-black text-gray-800 tracking-tight uppercase">{title}</h3>
        </div>
        {children}
    </div>
);

const EmployeeFormPage = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();
    const isAdmin = user?.role === 'admin' || user?.role === 'management';

    const [departments, setDepartments] = useState([]);
    const [loading, setLoading] = useState(true);

    const defaultData = {
        emp_id: '', emp_code: '', name: '', role: 'staff', department_id: '', designation: '',
        email: '', mobile: '', profile_pic: '', dob: '', doj: '', gender: 'Male',
        blood_group: '', religion: '', nationality: 'Indian', caste: '', community: '', whatsapp: '',
        aadhar: '', pan: '',
        account_no: '', bank_name: '', branch: '', ifsc: '', pin_code: '', pf_number: '', uan_number: '',
        permanent_address: '', communication_address: '',
        father_name: '', mother_name: '', marital_status: 'Single',
        monthly_salary: '', experience: '',
        pin: '', confirm_pin: ''
    };

    const [formData, setFormData] = useState(defaultData);
    const [certificates, setCertificates] = useState([]);
    const [existingCerts, setExistingCerts] = useState([]);
    const [deductionForm, setDeductionForm] = useState({
        employ_pf: '',
        pf_interest_percentage: '12',
        employee_esi_enabled: true,
        salary_advance: '',
        salary_advance_duration_type: 'single',
        salary_advance_month: '',
        salary_advance_from_month: '',
        salary_advance_to_month: '',
        hostel_and_food_fees: '',
        bus_fees: '',
        lwf: '',
        tds: '',
        other_enabled: false,
        other_name: '',
        other_amount: ''
    });
    const selectedCategory = normalizeEmployeeCategory(formData.community);
    const isTeachingCategory = selectedCategory === 'Teaching';
    const isWorkersCategory = selectedCategory === 'Workers';
    const roleOptions = isTeachingCategory
        ? [
            { value: 'staff', label: 'Staff' },
            { value: 'hod', label: 'HOD' },
            { value: 'principal', label: 'Principal' }
        ]
        : [{ value: 'staff', label: 'Staff' }];

    useEffect(() => {
        fetchDepartments();
        if (id) {
            fetchEmployee();
            fetchCertificates();
        } else {
            setLoading(false);
        }
    }, [id]);

    const fetchDepartments = async () => {
        try {
            const { data } = await api.get('/departments');
            setDepartments(data);
        } catch (error) { console.error(error); }
    };

    const fetchCertificates = async () => {
        try {
            const { data } = await api.get(`/certificates/${id}`);
            setExistingCerts(data);
        } catch (error) { console.error(error); }
    };

    const fetchEmployee = async () => {
        try {
            const { data } = await api.get(`/employees/${id}?lookup=id`);
            setFormData({
                ...data,
                community: normalizeEmployeeCategory(data.community),
                confirm_pin: data.pin
            });
            // Load existing deductions if stored
            if (data.deductions) {
                const loadedDeductions = typeof data.deductions === 'string' 
                    ? JSON.parse(data.deductions) 
                    : data.deductions;
                if (Array.isArray(loadedDeductions)) {
                    const normalized = {
                        employ_pf: '',
                        pf_interest_percentage: '12',
                        employee_esi_enabled: true,
                        salary_advance: '',
                        salary_advance_duration_type: 'single',
                        salary_advance_month: '',
                        salary_advance_from_month: '',
                        salary_advance_to_month: '',
                        hostel_and_food_fees: '',
                        bus_fees: '',
                        lwf: '',
                        tds: '',
                        other_enabled: false,
                        other_name: '',
                        other_amount: ''
                    };

                    loadedDeductions.forEach((d) => {
                        const type = String(d?.type || d?.name || d?.label || '').trim();
                        const amount = Number(d?.amount || 0) || 0;
                        const lowerType = type.toLowerCase();

                        // Auto deduction toggle (no fixed amount)
                        if (String(d?.code || '').toUpperCase() === 'EMPLOYEE_ESI' || lowerType.includes('employee esi')) {
                            normalized.employee_esi_enabled = true;
                            return;
                        }

                        if (!amount) return;

                        if (lowerType.includes('pf')) {
                            normalized.employ_pf = String((Number(normalized.employ_pf) || 0) + amount);
                            const interestMatch = type.match(/(\d+(?:\.\d+)?)\s*%/);
                            if (interestMatch && !normalized.pf_interest_percentage) {
                                normalized.pf_interest_percentage = interestMatch[1];
                            }
                            return;
                        }
                        if (lowerType.includes('salary advance') || lowerType.includes('advance')) {
                            normalized.salary_advance = String((Number(normalized.salary_advance) || 0) + amount);
                            const singleMonthMatch = type.match(/single month\s*:\s*(\d{4}-\d{2})/i);
                            const rangeMatch = type.match(/from\s*:\s*(\d{4}-\d{2})\s*to\s*:\s*(\d{4}-\d{2})/i);
                            if (singleMonthMatch) {
                                normalized.salary_advance_duration_type = 'single';
                                normalized.salary_advance_month = singleMonthMatch[1];
                            }
                            if (rangeMatch) {
                                normalized.salary_advance_duration_type = 'range';
                                normalized.salary_advance_from_month = rangeMatch[1];
                                normalized.salary_advance_to_month = rangeMatch[2];
                            }
                            return;
                        }
                        if (lowerType.includes('hostel') || lowerType.includes('food')) {
                            normalized.hostel_and_food_fees = String((Number(normalized.hostel_and_food_fees) || 0) + amount);
                            return;
                        }
                        if (lowerType.includes('bus')) {
                            normalized.bus_fees = String((Number(normalized.bus_fees) || 0) + amount);
                            return;
                        }
                        if (lowerType.includes('lwf')) {
                            normalized.lwf = String((Number(normalized.lwf) || 0) + amount);
                            return;
                        }
                        if (lowerType.includes('tds') || lowerType.includes('income tax')) {
                            normalized.tds = String((Number(normalized.tds) || 0) + amount);
                            return;
                        }

                        normalized.other_enabled = true;
                        normalized.other_name = normalized.other_name || type || 'Other';
                        normalized.other_amount = String((Number(normalized.other_amount) || 0) + amount);
                    });

                    setDeductionForm(normalized);
                }
            }
            setLoading(false);
        } catch (error) {
            console.error(error);
            Swal.fire('Error', 'Failed to fetch employee details', 'error');
            navigate('/admin/employees');
        }
    };

    const handleChange = (e) => {
        const { name, value } = e.target;

        if (name === 'community') {
            const category = normalizeEmployeeCategory(value);
            setFormData(prev => ({
                ...prev,
                community: category,
                role: category === 'Teaching' ? prev.role : 'staff'
            }));
            return;
        }

        setFormData({ ...formData, [name]: value });
    };

    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            if (file.size > 5 * 1024 * 1024) {
                return Swal.fire({
                    title: 'File Too Large',
                    text: 'Please select an image smaller than 5MB.',
                    icon: 'warning',
                    confirmButtonColor: '#2563eb'
                });
            }
            const reader = new FileReader();
            reader.onloadend = () => {
                setFormData({ ...formData, profile_pic: reader.result });
            };
            reader.readAsDataURL(file);
        }
    };

    const addCertRow = () => {
        setCertificates([...certificates, { certificate_name: '', file_name: '', file_type: '', file_data: '' }]);
    };

    const removeCertRow = (index) => {
        setCertificates(certificates.filter((_, i) => i !== index));
    };

    const handleCertNameChange = (index, value) => {
        const updated = [...certificates];
        updated[index].certificate_name = value;
        setCertificates(updated);
    };

    const handleCertFileChange = (index, e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (file.size > 10 * 1024 * 1024) {
            return Swal.fire({ title: 'File Too Large', text: 'Please select a file smaller than 10MB.', icon: 'warning', confirmButtonColor: '#2563eb' });
        }
        const reader = new FileReader();
        reader.onloadend = () => {
            const updated = [...certificates];
            updated[index].file_data = reader.result;
            updated[index].file_name = file.name;
            updated[index].file_type = file.type;
            setCertificates(updated);
        };
        reader.readAsDataURL(file);
    };

    const deleteExistingCert = async (certId) => {
        const confirm = await Swal.fire({ title: 'Delete Certificate?', text: 'This action cannot be undone.', icon: 'warning', showCancelButton: true, confirmButtonColor: '#ef4444', confirmButtonText: 'Delete' });
        if (!confirm.isConfirmed) return;
        try {
            await api.delete(`/certificates/${certId}`);
            setExistingCerts(existingCerts.filter(c => c.id !== certId));
            Swal.fire({ title: 'Deleted', icon: 'success', timer: 1200, showConfirmButton: false });
        } catch (error) {
            Swal.fire('Error', 'Failed to delete certificate', 'error');
        }
    };

    // ─── Deduction Handlers ─────────────────────────────────────────────
    const setDeductionValue = (field, value) => {
        setDeductionForm(prev => ({ ...prev, [field]: value }));
    };

    const getMonthlyPfDeduction = () => {
        const basicAmount = Number(deductionForm.employ_pf || 0) || 0;
        const deductionRatePerMonth = Number(deductionForm.pf_interest_percentage || 0) || 0;

        if (basicAmount <= 0) return 0;
        if (deductionRatePerMonth <= 0) return 0;

        // Concept: monthly PF deduction is a percentage of PF Basic each month.
        return (basicAmount * deductionRatePerMonth) / 100;
    };

    const serializeDeductions = () => {
        const pfAmount = Number(getMonthlyPfDeduction() || 0);
        const pfInterest = String(deductionForm.pf_interest_percentage || '').trim();
        const salaryAdvanceAmount = Number(deductionForm.salary_advance || 0) || 0;
        const salaryAdvanceDurationType = String(deductionForm.salary_advance_duration_type || 'single');
        const salaryAdvanceSingleMonth = String(deductionForm.salary_advance_month || '').trim();
        const salaryAdvanceFromMonth = String(deductionForm.salary_advance_from_month || '').trim();
        const salaryAdvanceToMonth = String(deductionForm.salary_advance_to_month || '').trim();
        const pfTypeLabel = pfInterest
            ? `Employ PF Monthly (PF Basic: ${deductionForm.employ_pf || '0'}, PF Deduction % Per Month: ${pfInterest || '0'}%)`
            : 'PF Basic';
        const salaryAdvanceTypeLabel = salaryAdvanceDurationType === 'range'
            ? `Salary Advance (From: ${salaryAdvanceFromMonth || '-'} To: ${salaryAdvanceToMonth || '-'})`
            : `Salary Advance (Single Month: ${salaryAdvanceSingleMonth || '-'})`;

        const rows = [
            { type: pfTypeLabel, amount: pfAmount },
            ...(deductionForm.employee_esi_enabled ? [{ type: 'Employee ESI (Auto)', code: 'EMPLOYEE_ESI', mode: 'auto', amount: 0 }] : []),
            { type: salaryAdvanceTypeLabel, amount: salaryAdvanceAmount },
            { type: 'Hostel and Food Fees', amount: Number(deductionForm.hostel_and_food_fees || 0) || 0 },
            { type: 'Bus Fees', amount: Number(deductionForm.bus_fees || 0) || 0 },
            { type: 'LWF', amount: Number(deductionForm.lwf || 0) || 0 },
            { type: 'TDS', amount: Number(deductionForm.tds || 0) || 0 }
        ].filter(row => (Number(row.amount || 0) > 0) || String(row.mode || '').toLowerCase() === 'auto');

        if (deductionForm.other_enabled) {
            const otherName = String(deductionForm.other_name || '').trim();
            const otherAmount = Number(deductionForm.other_amount || 0) || 0;
            if (otherName && otherAmount > 0) {
                rows.push({ type: otherName, amount: otherAmount });
            }
        }

        return JSON.stringify(rows);
    };

    const handleSubmit = async (e) => {
        if (e) e.preventDefault();

        if (normalizeEmployeeCategory(formData.community) === 'Teaching' && !String(formData.department_id || '').trim()) {
            return Swal.fire({
                title: 'Department Required',
                text: 'Department is mandatory for Teaching category.',
                icon: 'warning',
                confirmButtonColor: '#2563eb'
            });
        }

        const salaryAdvanceAmount = Number(deductionForm.salary_advance || 0) || 0;
        if (salaryAdvanceAmount > 0) {
            const durationType = String(deductionForm.salary_advance_duration_type || 'single');
            const singleMonth = String(deductionForm.salary_advance_month || '').trim();
            const fromMonth = String(deductionForm.salary_advance_from_month || '').trim();
            const toMonth = String(deductionForm.salary_advance_to_month || '').trim();

            if (durationType === 'single' && !singleMonth) {
                return Swal.fire({
                    title: 'Salary Advance Month Required',
                    text: 'Please select Single Month for Salary Advance.',
                    icon: 'warning',
                    confirmButtonColor: '#2563eb'
                });
            }

            if (durationType === 'range') {
                if (!fromMonth || !toMonth) {
                    return Swal.fire({
                        title: 'Salary Advance Range Required',
                        text: 'Please select both From Month and To Month for Salary Advance.',
                        icon: 'warning',
                        confirmButtonColor: '#2563eb'
                    });
                }
                if (fromMonth > toMonth) {
                    return Swal.fire({
                        title: 'Invalid Salary Advance Range',
                        text: 'From Month should be before or equal to To Month.',
                        icon: 'warning',
                        confirmButtonColor: '#2563eb'
                    });
                }
            }
        }

        if (!id && formData.pin !== formData.confirm_pin) {
            return Swal.fire({
                title: 'PIN Mismatch',
                text: 'Security identifiers do not synchronize. Please verify.',
                icon: 'error',
                confirmButtonColor: '#2563eb'
            });
        }

        try {
            let userId = formData.id;
            const payload = {
                ...formData,
                community: normalizeEmployeeCategory(formData.community),
                department_id: formData.department_id || '',
                deductions: serializeDeductions()
            };

            if (id) {
                await api.put(`/employees/${formData.id}`, payload);

                // Automatically notify the employee about the update
                try {
                    const { data: conv } = await api.post('/conversations', {
                        title: `Profile Update Notification`,
                        target_role: 'individual',
                        target_user_ids: [formData.emp_id]
                    });

                    await api.post(`/conversations/${conv.id}/messages`, {
                        content: `Hello ${formData.name}, your employee record has been updated by the Administrator. Please check your profile for changes.`
                    });
                } catch (msgErr) {
                    console.error("Auto-notification failed:", msgErr);
                }

                Swal.fire({
                    title: 'Saved',
                    text: 'Employee record has been updated and notification sent.',
                    icon: 'success',
                    timer: 1500,
                    showConfirmButton: false
                });
            } else {
                await api.post('/employees', payload);
                // Fetch newly created employee to get userId for certificate uploads
                try {
                    const { data: newEmp } = await api.get(`/employees/${formData.emp_id}?lookup=emp_id`);
                    userId = newEmp.id;
                } catch (_) {}
                Swal.fire({
                    title: 'Added',
                    text: 'New employee has been added successfully.',
                    icon: 'success',
                    timer: 1500,
                    showConfirmButton: false
                });
            }


            // Upload new certificates
            if (userId && isWorkersCategory && certificates.length > 0) {
                const validCerts = certificates.filter(c => c.certificate_name && c.file_data);
                for (const cert of validCerts) {
                    try {
                        await api.post(`/certificates/${userId}`, cert);
                    } catch (certErr) {
                        console.error('Certificate upload failed:', certErr);
                    }
                }
            }

            navigate('/admin/employees');
        } catch (error) {
            Swal.fire({
                title: 'Operational Failure',
                text: error.response?.data?.message || 'Action failed',
                icon: 'error',
                confirmButtonColor: '#2563eb'
            });
        }
    };

    if (loading) return (
        <Layout>
            <div className="flex h-screen items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-sky-600"></div>
            </div>
        </Layout>
    );

    return (
        <Layout>
            <div className="max-w-5xl mx-auto pb-20">
                {/* Header */}
                <div className="mb-10 flex items-center justify-between">
                    <div className="flex items-center gap-6">
                        <button
                            onClick={() => navigate('/admin/employees')}
                            className="h-14 w-14 rounded-2xl bg-white border border-gray-100 flex items-center justify-center text-gray-400 hover:bg-rose-50 hover:text-rose-500 transition-all shadow-sm active:scale-90"
                        >
                            <FaArrowLeft size={20} />
                        </button>
                        <div>
                            <h2 className="text-4xl font-black text-gray-800 tracking-tight">
                                {id ? 'Edit Employee Record' : 'Create New Employee'}
                            </h2>
                            <p className="text-[10px] font-black text-sky-500 uppercase tracking-[0.2em] mt-1 italic">
                                Institutional Matrix Integration
                            </p>
                        </div>
                    </div>
                </div>

                <div className="bg-white rounded-[40px] shadow-2xl border border-black/50 overflow-hidden transition-all duration-300 hover:scale-[1.01]">
                    <form onSubmit={handleSubmit} className="p-12">
                        <FormSection title="Personal Information" icon={<FaUser />}>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="md:col-span-2 flex items-center gap-10 bg-sky-50/30 p-8 rounded-[32px] border border-sky-50 shadow-inner mb-4">
                                    <div className="relative group">
                                        <div className="w-32 h-32 rounded-[40px] border-4 border-white overflow-hidden bg-white shadow-2xl ring-4 ring-sky-50/50 group-hover:scale-105 transition-transform duration-500">
                                            <img src={formData.profile_pic || `https://ui-avatars.com/api/?name=${formData.name || 'User'}&background=3b82f6&color=fff&bold=true`} alt="Profile" className="w-full h-full object-cover" />
                                        </div>
                                        <div className="absolute -bottom-2 -right-2 h-10 w-10 bg-sky-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-sky-200">
                                            <FaUser size={16} />
                                        </div>
                                    </div>
                                    <div className="flex-1">
                                        <label className={labelClass}>Upload Profile Picture</label>
                                        <div className="relative group/input">
                                            <input
                                                type="file"
                                                accept="image/*"
                                                onChange={handleFileChange}
                                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10 disabled:cursor-not-allowed"
                                                disabled={!isAdmin}
                                            />
                                            <div className={inputClass + " flex items-center justify-between group-hover/input:border-sky-400 group-hover/input:ring-4 group-hover/input:ring-sky-50 transition-all"}>
                                                <span className="text-gray-400 font-medium truncate">
                                                    {formData.profile_pic ? 'Image selected (Click to change)' : 'Click to browse system photos...'}
                                                </span>
                                                <div className="h-6 w-6 rounded-lg bg-sky-100 text-sky-600 flex items-center justify-center text-[10px] font-black uppercase">
                                                    Pick
                                                </div>
                                            </div>
                                        </div>
                                        <p className="mt-2 text-[9px] font-bold text-gray-400 uppercase tracking-widest ml-1">Supports JPEG, PNG • Max 5MB</p>
                                    </div>
                                </div>
                                <div>
                                    <label className={labelClass}>Employee Name</label>
                                    <input name="name" value={formData.name || ''} onChange={handleChange} className={inputClass} required disabled={!isAdmin} />
                                </div>
                                <div>
                                    <label className={labelClass}>Employee ID (Unique)</label>
                                    <input name="emp_id" value={formData.emp_id || ''} onChange={handleChange} className={inputClass} required disabled={!!id || !isAdmin} />
                                </div>

                                <div>
                                    <label className={labelClass}>Employee Category</label>
                                    <select
                                        name="community"
                                        value={formData.community || ''}
                                        onChange={handleChange}
                                        className={inputClass}
                                        disabled={!isAdmin}
                                    >
                                        <option value="">Select Category</option>
                                        <option value="Teaching">Teaching</option>
                                        <option value="Non-Teaching">Non-Teaching</option>
                                        <option value="Workers">Workers</option>
                                    </select>
                                </div>
                                <div>
                                    <label className={labelClass}>User Role</label>
                                    <select
                                        name="role"
                                        value={isTeachingCategory ? (formData.role || 'staff') : 'staff'}
                                        onChange={handleChange}
                                        className={inputClass}
                                        disabled={!isAdmin || !isTeachingCategory}
                                    >
                                        {roleOptions.map((opt) => (
                                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className={labelClass}>
                                        Department {isTeachingCategory ? '(Required for Teaching)' : '(Optional)'}
                                    </label>
                                    <select name="department_id" value={formData.department_id || ''} onChange={handleChange} className={inputClass} disabled={!isAdmin}>
                                        <option value="">Select Department</option>
                                        {departments.map(d => (
                                            <option key={d.id} value={d.id}>
                                                {d.name} {d.code ? `(${d.code})` : ''}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className={labelClass}>Designation</label>
                                    <input name="designation" value={formData.designation || ''} onChange={handleChange} className={inputClass} disabled={!isAdmin} />
                                </div>
                                <div>
                                    <label className={labelClass}>Email Address</label>
                                    <input name="email" type="email" value={formData.email || ''} onChange={handleChange} className={inputClass} disabled={!isAdmin} />
                                </div>
                                <div>
                                    <label className={labelClass}>Mobile Number</label>
                                    <input name="mobile" value={formData.mobile || ''} onChange={handleChange} className={inputClass} disabled={!isAdmin} />
                                </div>
                                <div>
                                    <label className={labelClass}>WhatsApp Number</label>
                                    <input name="whatsapp" value={formData.whatsapp || ''} onChange={handleChange} className={inputClass} disabled={!isAdmin} />
                                </div>
                                <div>
                                    <label className={labelClass}>Date of Birth</label>
                                    <input name="dob" type="date" value={formData.dob || ''} onChange={handleChange} className={inputClass} disabled={!isAdmin} />
                                </div>
                                <div>
                                    <label className={labelClass}>Gender</label>
                                    <select name="gender" value={formData.gender || 'Male'} onChange={handleChange} className={inputClass} disabled={!isAdmin}>
                                        <option value="Male">Male</option>
                                        <option value="Female">Female</option>
                                        <option value="Other">Other</option>
                                    </select>
                                </div>
                                <div>
                                    <label className={labelClass}>Blood Group</label>
                                    <input name="blood_group" value={formData.blood_group || ''} onChange={handleChange} className={inputClass} disabled={!isAdmin} />
                                </div>
                                <div>
                                    <label className={labelClass}>Religion</label>
                                    <input name="religion" value={formData.religion || ''} onChange={handleChange} className={inputClass} disabled={!isAdmin} />
                                </div>
                                <div>
                                    <label className={labelClass}>Caste</label>
                                    <input
                                        name="caste"
                                        value={formData.caste || ''}
                                        onChange={handleChange}
                                        className={inputClass}
                                        disabled={!isAdmin}
                                    />
                                </div>
                            </div>
                        </FormSection>

                        <FormSection title="Government Identifiers" icon={<FaMapMarkerAlt />}>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div>
                                    <label className={labelClass}>Aadhar Card Number</label>
                                    <input name="aadhar" value={formData.aadhar || ''} onChange={handleChange} className={inputClass} disabled={!isAdmin} />
                                </div>
                                <div>
                                    <label className={labelClass}>PAN Card Number</label>
                                    <input name="pan" value={formData.pan || ''} onChange={handleChange} className={inputClass} disabled={!isAdmin} />
                                </div>
                                <div className="md:col-span-2">
                                    <label className={labelClass}>Permanent Address</label>
                                    <textarea name="permanent_address" value={formData.permanent_address || ''} onChange={handleChange} className={inputClass + " h-32 pt-4 resize-none"} disabled={!isAdmin} />
                                </div>
                                <div className="md:col-span-2">
                                    <label className={labelClass}>Communication Address</label>
                                    <textarea name="communication_address" value={formData.communication_address || ''} onChange={handleChange} className={inputClass + " h-32 pt-4 resize-none"} disabled={!isAdmin} />
                                </div>
                                <div>
                                    <label className={labelClass}>PIN Code</label>
                                    <input name="pin_code" value={formData.pin_code || ''} onChange={handleChange} className={inputClass} disabled={!isAdmin} />
                                </div>
                                <div>
                                    <label className={labelClass}>Nationality</label>
                                    <input name="nationality" value={formData.nationality || 'Indian'} onChange={handleChange} className={inputClass} disabled={!isAdmin} />
                                </div>
                            </div>
                        </FormSection>

                        <FormSection title="Bank & Salary Details" icon={<FaUniversity />}>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div>
                                    <label className={labelClass}>Bank Name</label>
                                    <input name="bank_name" value={formData.bank_name || ''} onChange={handleChange} className={inputClass} disabled={!isAdmin} />
                                </div>
                                <div>
                                    <label className={labelClass}>Account Number</label>
                                    <input name="account_no" value={formData.account_no || ''} onChange={handleChange} className={inputClass} disabled={!isAdmin} />
                                </div>
                                <div>
                                    <label className={labelClass}>Branch Name</label>
                                    <input name="branch" value={formData.branch || ''} onChange={handleChange} className={inputClass} disabled={!isAdmin} />
                                </div>
                                <div>
                                    <label className={labelClass}>IFSC Code</label>
                                    <input name="ifsc" value={formData.ifsc || ''} onChange={handleChange} className={inputClass} disabled={!isAdmin} />
                                </div>
                                <div>
                                    <label className={labelClass}>PF Number</label>
                                    <input name="pf_number" value={formData.pf_number || ''} onChange={handleChange} className={inputClass} disabled={!isAdmin} />
                                </div>
                                <div>
                                    <label className={labelClass}>UAN Number</label>
                                    <input name="uan_number" value={formData.uan_number || ''} onChange={handleChange} className={inputClass} disabled={!isAdmin} />
                                </div>
                                <div className="md:col-span-2 h-px bg-gray-100 my-4"></div>
                                <div>
                                    <label className={labelClass}>Date of Joining</label>
                                    <input name="doj" type="date" value={formData.doj || ''} onChange={handleChange} className={inputClass} disabled={!isAdmin} />
                                </div>
                                <div>
                                    <label className={labelClass}>Monthly Salary</label>
                                    <input name="monthly_salary" type="number" value={formData.monthly_salary || ''} onChange={handleChange} className={inputClass} disabled={!isAdmin} />
                                </div>
                                <div className="md:col-span-2">
                                    <label className={labelClass}>Experience Description</label>
                                    <input name="experience" value={formData.experience || ''} onChange={handleChange} className={inputClass} disabled={!isAdmin} />
                                </div>
                            </div>
                        </FormSection>

                        {/* ─── Deductions Section ─── */}
                        <FormSection title="Salary Deductions" icon={<FaMinusCircle />}>
                            <div className="mb-4 bg-amber-50 border border-amber-100 rounded-2xl p-4">
                                <p className="text-xs text-amber-700 font-bold leading-relaxed">
                                    Fixed monthly deductions are automatically subtracted during payroll.
                                </p>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                    <label className={labelClass}>PF Basic (Rs / month)</label>
                                    <input type="number" min="0" value={deductionForm.employ_pf} onChange={(e) => setDeductionValue('employ_pf', e.target.value)} className={inputClass} disabled={!isAdmin} />
                                </div>
                                {(Number(deductionForm.employ_pf || 0) > 0) && (
                                    <>
                                        <div>
                                            <label className={labelClass}>PF Deduction % Per Month</label>
                                            <input
                                                type="number"
                                                min="0"
                                                step="0.01"
                                                value={deductionForm.pf_interest_percentage}
                                                onChange={(e) => setDeductionValue('pf_interest_percentage', e.target.value)}
                                                className={inputClass}
                                                placeholder="e.g. 12"
                                                disabled={!isAdmin}
                                            />
                                        </div>
                                        <div className="md:col-span-2 bg-gray-50 border border-gray-100 rounded-2xl p-4">
                                            <p className="text-[10px] font-black text-gray-600 uppercase tracking-widest">Auto Monthly PF Deduction</p>
                                            <p className="text-lg font-black text-gray-800 mt-1">₹{Number(getMonthlyPfDeduction() || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</p>
                                        </div>
                                    </>
                                )}
                                <div>
                                    <label className={labelClass}>Salary Advance (Rs / month)</label>
                                    <input type="number" min="0" value={deductionForm.salary_advance} onChange={(e) => setDeductionValue('salary_advance', e.target.value)} className={inputClass} disabled={!isAdmin} />
                                </div>

                                <div className="md:col-span-2 bg-sky-50 border border-sky-100 rounded-2xl p-4">
                                    <label className="flex items-center gap-3 text-sm font-bold text-sky-800 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={!!deductionForm.employee_esi_enabled}
                                            onChange={(e) => setDeductionValue('employee_esi_enabled', e.target.checked)}
                                            disabled={!isAdmin}
                                        />
                                        Employee ESI
                                    </label>
                                </div>
                                {(Number(deductionForm.salary_advance || 0) > 0) && (
                                    <>
                                        <div>
                                            <label className={labelClass}>Salary Advance Duration Type</label>
                                            <select
                                                value={deductionForm.salary_advance_duration_type}
                                                onChange={(e) => setDeductionValue('salary_advance_duration_type', e.target.value)}
                                                className={inputClass}
                                                disabled={!isAdmin}
                                            >
                                                <option value="single">Single Month</option>
                                                <option value="range">From - To Month</option>
                                            </select>
                                        </div>
                                        {deductionForm.salary_advance_duration_type === 'single' ? (
                                            <div>
                                                <label className={labelClass}>Salary Advance Month</label>
                                                <input
                                                    type="month"
                                                    value={deductionForm.salary_advance_month}
                                                    onChange={(e) => setDeductionValue('salary_advance_month', e.target.value)}
                                                    className={inputClass}
                                                    disabled={!isAdmin}
                                                />
                                            </div>
                                        ) : (
                                            <>
                                                <div>
                                                    <label className={labelClass}>Salary Advance From Month</label>
                                                    <input
                                                        type="month"
                                                        value={deductionForm.salary_advance_from_month}
                                                        onChange={(e) => setDeductionValue('salary_advance_from_month', e.target.value)}
                                                        className={inputClass}
                                                        disabled={!isAdmin}
                                                    />
                                                </div>
                                                <div>
                                                    <label className={labelClass}>Salary Advance To Month</label>
                                                    <input
                                                        type="month"
                                                        value={deductionForm.salary_advance_to_month}
                                                        onChange={(e) => setDeductionValue('salary_advance_to_month', e.target.value)}
                                                        className={inputClass}
                                                        disabled={!isAdmin}
                                                    />
                                                </div>
                                            </>
                                        )}
                                    </>
                                )}
                                <div>
                                    <label className={labelClass}>Hostel and Food Fees (Rs / month)</label>
                                    <input type="number" min="0" value={deductionForm.hostel_and_food_fees} onChange={(e) => setDeductionValue('hostel_and_food_fees', e.target.value)} className={inputClass} disabled={!isAdmin} />
                                </div>
                                <div>
                                    <label className={labelClass}>Bus Fees (Rs / month)</label>
                                    <input type="number" min="0" value={deductionForm.bus_fees} onChange={(e) => setDeductionValue('bus_fees', e.target.value)} className={inputClass} disabled={!isAdmin} />
                                </div>
                                <div>
                                    <label className={labelClass}>LWF (Rs / month)</label>
                                    <input type="number" min="0" value={deductionForm.lwf} onChange={(e) => setDeductionValue('lwf', e.target.value)} className={inputClass} disabled={!isAdmin} />
                                </div>
                                <div>
                                    <label className={labelClass}>TDS (Rs / month)</label>
                                    <input type="number" min="0" value={deductionForm.tds} onChange={(e) => setDeductionValue('tds', e.target.value)} className={inputClass} disabled={!isAdmin} />
                                </div>
                            </div>

                            <div className="mt-6 p-5 rounded-2xl border border-gray-100 bg-gray-50">
                                <label className="flex items-center gap-3 text-sm font-bold text-gray-700 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={deductionForm.other_enabled}
                                        onChange={(e) => {
                                            const checked = e.target.checked;
                                            setDeductionForm(prev => ({
                                                ...prev,
                                                other_enabled: checked,
                                                other_name: checked ? prev.other_name : '',
                                                other_amount: checked ? prev.other_amount : ''
                                            }));
                                        }}
                                        disabled={!isAdmin}
                                    />
                                    Other deduction
                                </label>

                                {deductionForm.other_enabled && (
                                    <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div>
                                            <label className={labelClass}>Other Deduction Name</label>
                                            <input
                                                value={deductionForm.other_name}
                                                onChange={(e) => setDeductionValue('other_name', e.target.value)}
                                                className={inputClass}
                                                placeholder="Type deduction name"
                                                disabled={!isAdmin}
                                            />
                                        </div>
                                        <div>
                                            <label className={labelClass}>Other Amount (Rs / month)</label>
                                            <input
                                                type="number"
                                                min="0"
                                                value={deductionForm.other_amount}
                                                onChange={(e) => setDeductionValue('other_amount', e.target.value)}
                                                className={inputClass}
                                                disabled={!isAdmin}
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="mt-6 bg-sky-50 border border-sky-100 rounded-2xl p-4 flex items-center justify-between">
                                <span className="text-[10px] font-black text-sky-600 uppercase tracking-widest">Total Monthly Deductions</span>
                                <span className="text-lg font-black text-sky-700">
                                    ₹{(
                                        (Number(getMonthlyPfDeduction()) || 0) +
                                        (Number(deductionForm.salary_advance) || 0) +
                                        (Number(deductionForm.hostel_and_food_fees) || 0) +
                                        (Number(deductionForm.bus_fees) || 0) +
                                        (Number(deductionForm.lwf) || 0) +
                                        (Number(deductionForm.tds) || 0) +
                                        (deductionForm.other_enabled ? (Number(deductionForm.other_amount) || 0) : 0)
                                    ).toLocaleString()}
                                </span>
                            </div>
                        </FormSection>

                        <FormSection title="Family Relations" icon={<FaUsers />}>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div>
                                    <label className={labelClass}>Father's Name</label>
                                    <input name="father_name" value={formData.father_name || ''} onChange={handleChange} className={inputClass} disabled={!isAdmin} />
                                </div>
                                <div>
                                    <label className={labelClass}>Mother's Name</label>
                                    <input name="mother_name" value={formData.mother_name || ''} onChange={handleChange} className={inputClass} disabled={!isAdmin} />
                                </div>
                                <div>
                                    <label className={labelClass}>Marital Status</label>
                                    <select name="marital_status" value={formData.marital_status || 'Single'} onChange={handleChange} className={inputClass} disabled={!isAdmin}>
                                        <option value="Single">Single</option>
                                        <option value="Married">Married</option>
                                        <option value="Divorced">Divorced</option>
                                    </select>
                                </div>
                            </div>
                        </FormSection>

                        {(isWorkersCategory || existingCerts.length > 0) && (
                        <FormSection title="Certificates" icon={<FaCertificate />}>
                            {isWorkersCategory && (
                                <div className="mb-6 bg-sky-50 border border-sky-100 rounded-2xl p-4">
                                    <p className="text-xs font-bold text-sky-700">Certificate section is enabled for Workers category.</p>
                                </div>
                            )}
                            {/* Existing Certificates (edit mode) */}
                            {existingCerts.length > 0 && (
                                <div className="mb-8">
                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-4 ml-1">Uploaded Certificates</p>
                                    <div className="space-y-3">
                                        {existingCerts.map((cert) => (
                                            <div key={cert.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl border border-gray-100">
                                                <div className="flex items-center gap-3">
                                                    <div className="h-10 w-10 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center">
                                                        <FaCertificate />
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-black text-gray-800">{cert.certificate_name}</p>
                                                        <p className="text-[10px] font-bold text-gray-400">{cert.file_name}</p>
                                                    </div>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => deleteExistingCert(cert.id)}
                                                    className="h-9 w-9 rounded-xl bg-red-50 text-red-500 flex items-center justify-center hover:bg-red-100 transition-colors"
                                                >
                                                    <FaTrash size={12} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* New Certificate Rows */}
                            <div className="space-y-6">
                                {certificates.map((cert, index) => (
                                    <div key={index} className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6 bg-gray-50/50 rounded-2xl border border-gray-100 relative">
                                        <button
                                            type="button"
                                            onClick={() => removeCertRow(index)}
                                            className="absolute top-4 right-4 h-8 w-8 rounded-lg bg-red-50 text-red-500 flex items-center justify-center hover:bg-red-100 transition-colors"
                                        >
                                            <FaTrash size={10} />
                                        </button>
                                        <div>
                                            <label className={labelClass}>Certificate Name</label>
                                            <input
                                                value={cert.certificate_name}
                                                onChange={(e) => handleCertNameChange(index, e.target.value)}
                                                className={inputClass}
                                                placeholder="e.g. B.Ed Certificate, SSLC Marksheet"
                                            />
                                        </div>
                                        <div>
                                            <label className={labelClass}>Upload File</label>
                                            <input
                                                type="file"
                                                accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                                                onChange={(e) => handleCertFileChange(index, e)}
                                                className={inputClass + " file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-[10px] file:font-black file:bg-sky-50 file:text-sky-600 file:uppercase file:tracking-widest hover:file:bg-sky-100"}
                                            />
                                            {cert.file_name && (
                                                <p className="mt-2 text-[10px] font-bold text-green-600">✓ {cert.file_name}</p>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {isWorkersCategory && (
                                <button
                                    type="button"
                                    onClick={addCertRow}
                                    className="mt-6 px-6 py-3 bg-sky-50 text-sky-600 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-sky-100 transition-colors flex items-center gap-2"
                                >
                                    <FaPlus size={10} /> Add Certificate
                                </button>
                            )}
                        </FormSection>
                        )}

                        <FormSection title="Account Security" icon={<FaLock />}>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="md:col-span-2 bg-amber-50 p-8 rounded-[32px] border border-amber-100 mb-4">
                                    <p className="text-xs text-amber-800 font-bold leading-relaxed flex items-center gap-4">
                                        <div className="h-10 w-10 bg-amber-100 rounded-xl flex items-center justify-center shrink-0">
                                            <FaLock className="text-amber-600" />
                                        </div>
                                        Security PIN is required for account integrity.
                                    </p>
                                </div>
                                <div>
                                    <label className={labelClass}>{id ? 'Reset Security PIN' : 'Set Security PIN'}</label>
                                    <input name="pin" type="password" value={formData.pin || ''} onChange={handleChange} className={inputClass + " tracking-[0.5em] text-center font-black"} placeholder="••••••" />
                                </div>
                                <div>
                                    <label className={labelClass}>Confirm Security PIN</label>
                                    <input name="confirm_pin" type="password" value={formData.confirm_pin || ''} onChange={handleChange} className={inputClass + " tracking-[0.5em] text-center font-black"} placeholder="••••••" />
                                </div>
                            </div>
                        </FormSection>

                        <div className="mt-12 pt-8 border-t border-gray-50 flex justify-end gap-6">
                            <button
                                type="button"
                                onClick={() => navigate('/admin/employees')}
                                className="px-10 py-5 bg-white border border-gray-200 text-gray-500 rounded-2xl hover:bg-gray-50 transition-all font-black uppercase tracking-widest text-[10px] active:scale-95"
                            >
                                Discard
                            </button>
                            <button
                                type="submit"
                                className="px-12 py-5 bg-sky-600 text-white rounded-2xl shadow-2xl shadow-sky-100 hover:bg-sky-800 transition-all flex items-center gap-3 font-black uppercase tracking-widest text-[10px] active:scale-95 group"
                            >
                                <FaSave className="group-hover:scale-110 transition-transform" /> {id ? 'Synchronize Record' : 'Commit to Database'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </Layout>
    );
};

export default EmployeeFormPage;
