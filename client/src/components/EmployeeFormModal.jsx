import { useState, useEffect } from 'react';
import { FaTimes, FaSave, FaUser, FaUniversity, FaMapMarkerAlt, FaUsers, FaLock } from 'react-icons/fa';
import api from '../utils/api';
import Swal from 'sweetalert2';
import { motion, AnimatePresence } from 'framer-motion';

const inputClass = "w-full p-4 bg-gray-50 border border-gray-100 rounded-2xl outline-none focus:ring-4 focus:ring-sky-100 focus:border-sky-500 transition-all font-bold text-gray-700 text-sm";
const labelClass = "block text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-3 ml-1";

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

const EmployeeFormModal = ({ isOpen, onClose, employee, onSave, departments }) => {
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

    useEffect(() => {
        if (employee) {
            setFormData({ ...employee, confirm_pin: employee.pin });
        } else {
            setFormData(defaultData);
        }
    }, [employee, isOpen]);

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
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

    const handleSubmit = async (e) => {
        if (e) e.preventDefault();

        if (!employee && formData.pin !== formData.confirm_pin) {
            return Swal.fire({
                title: 'PIN Mismatch',
                text: 'Security identifiers do not synchronize. Please verify.',
                icon: 'error',
                confirmButtonColor: '#2563eb'
            });
        }

        try {
            if (employee) {
                await api.put(`/employees/${employee.id}`, formData);
                Swal.fire({
                    title: 'Saved',
                    text: 'Employee record has been updated.',
                    icon: 'success',
                    confirmButtonColor: '#2563eb'
                });
            } else {
                await api.post('/employees', formData);
                Swal.fire({
                    title: 'Added',
                    text: 'New employee has been added successfully.',
                    icon: 'success',
                    confirmButtonColor: '#2563eb'
                });
            }
            onSave();
            onClose();
        } catch (error) {
            Swal.fire({
                title: 'Operational Failure',
                text: error.response?.data?.message || 'Action failed',
                icon: 'error',
                confirmButtonColor: '#2563eb'
            });
        }
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={onClose}
                    className="absolute inset-0 bg-sky-900/40 backdrop-blur-xl"
                ></motion.div>

                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 20 }}
                    className="relative bg-white w-full max-w-5xl rounded-[40px] shadow-2xl overflow-hidden flex flex-col h-[90vh]"
                >
                    {/* Header */}
                    <div className="p-8 border-b border-sky-50 flex justify-between items-center shrink-0 bg-white z-10">
                        <div>
                            <h2 className="text-3xl font-black text-gray-800 tracking-tight">
                                {employee ? 'Edit Employee Record' : 'Create New Employee'}
                            </h2>
                            <p className="text-[10px] font-black text-sky-500 uppercase tracking-[0.2em] mt-1 italic">
                                Complete all informational matrices below
                            </p>
                        </div>
                        <button
                            onClick={onClose}
                            className="h-12 w-12 rounded-2xl bg-gray-50 text-gray-400 flex items-center justify-center hover:bg-rose-50 hover:text-rose-500 transition-all active:scale-90"
                        >
                            <FaTimes size={20} />
                        </button>
                    </div>

                    {/* Single Page Form Area */}
                    <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-12 custom-scrollbar">
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
                                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
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
                                    <input name="name" value={formData.name || ''} onChange={handleChange} className={inputClass} required />
                                </div>
                                <div>
                                    <label className={labelClass}>Employee ID (Unique)</label>
                                    <input name="emp_id" value={formData.emp_id || ''} onChange={handleChange} className={inputClass} required disabled={!!employee} />
                                </div>
                                <div>
                                    <label className={labelClass}>Employee Code</label>
                                    <input name="emp_code" value={formData.emp_code || ''} onChange={handleChange} className={inputClass} placeholder="e.g. PPG-001" />
                                </div>
                                <div>
                                    <label className={labelClass}>User Role</label>
                                    <select name="role" value={formData.role || 'staff'} onChange={handleChange} className={inputClass}>
                                        <option value="staff">Staff</option>
                                        <option value="hod">HOD</option>
                                        <option value="principal">Principal</option>
                                        <option value="admin">Admin</option>
                                    </select>
                                </div>
                                <div>
                                    <label className={labelClass}>Department</label>
                                    <select name="department_id" value={formData.department_id || ''} onChange={handleChange} className={inputClass}>
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
                                    <input name="designation" value={formData.designation || ''} onChange={handleChange} className={inputClass} />
                                </div>
                                <div>
                                    <label className={labelClass}>Email Address</label>
                                    <input name="email" type="email" value={formData.email || ''} onChange={handleChange} className={inputClass} />
                                </div>
                                <div>
                                    <label className={labelClass}>Mobile Number</label>
                                    <input name="mobile" value={formData.mobile || ''} onChange={handleChange} className={inputClass} />
                                </div>
                                <div>
                                    <label className={labelClass}>WhatsApp Number</label>
                                    <input name="whatsapp" value={formData.whatsapp || ''} onChange={handleChange} className={inputClass} />
                                </div>
                                <div>
                                    <label className={labelClass}>Date of Birth</label>
                                    <input name="dob" type="date" value={formData.dob || ''} onChange={handleChange} className={inputClass} />
                                </div>
                                <div>
                                    <label className={labelClass}>Gender</label>
                                    <select name="gender" value={formData.gender || 'Male'} onChange={handleChange} className={inputClass}>
                                        <option value="Male">Male</option>
                                        <option value="Female">Female</option>
                                        <option value="Other">Other</option>
                                    </select>
                                </div>
                                <div>
                                    <label className={labelClass}>Blood Group</label>
                                    <input name="blood_group" value={formData.blood_group || ''} onChange={handleChange} className={inputClass} />
                                </div>
                                <div>
                                    <label className={labelClass}>Religion</label>
                                    <input name="religion" value={formData.religion || ''} onChange={handleChange} className={inputClass} />
                                </div>
                                <div>
                                    <label className={labelClass}>Caste</label>
                                    <input name="caste" value={formData.caste || ''} onChange={handleChange} className={inputClass} />
                                </div>
                                <div>
                                    <label className={labelClass}>Community</label>
                                    <input name="community" value={formData.community || ''} onChange={handleChange} className={inputClass} />
                                </div>
                            </div>
                        </FormSection>

                        <FormSection title="Government Identifiers" icon={<FaMapMarkerAlt />}>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div>
                                    <label className={labelClass}>Aadhar Card Number</label>
                                    <input name="aadhar" value={formData.aadhar || ''} onChange={handleChange} className={inputClass} />
                                </div>
                                <div>
                                    <label className={labelClass}>PAN Card Number</label>
                                    <input name="pan" value={formData.pan || ''} onChange={handleChange} className={inputClass} />
                                </div>
                                <div className="md:col-span-2">
                                    <label className={labelClass}>Permanent Address</label>
                                    <textarea name="permanent_address" value={formData.permanent_address || ''} onChange={handleChange} className={inputClass + " h-32 pt-4 resize-none"} />
                                </div>
                                <div className="md:col-span-2">
                                    <label className={labelClass}>Communication Address</label>
                                    <textarea name="communication_address" value={formData.communication_address || ''} onChange={handleChange} className={inputClass + " h-32 pt-4 resize-none"} />
                                </div>
                                <div>
                                    <label className={labelClass}>PIN Code</label>
                                    <input name="pin_code" value={formData.pin_code || ''} onChange={handleChange} className={inputClass} />
                                </div>
                                <div>
                                    <label className={labelClass}>Nationality</label>
                                    <input name="nationality" value={formData.nationality || 'Indian'} onChange={handleChange} className={inputClass} />
                                </div>
                            </div>
                        </FormSection>

                        <FormSection title="Bank & Salary Details" icon={<FaUniversity />}>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div>
                                    <label className={labelClass}>Bank Name</label>
                                    <input name="bank_name" value={formData.bank_name || ''} onChange={handleChange} className={inputClass} />
                                </div>
                                <div>
                                    <label className={labelClass}>Account Number</label>
                                    <input name="account_no" value={formData.account_no || ''} onChange={handleChange} className={inputClass} />
                                </div>
                                <div>
                                    <label className={labelClass}>Branch Name</label>
                                    <input name="branch" value={formData.branch || ''} onChange={handleChange} className={inputClass} />
                                </div>
                                <div>
                                    <label className={labelClass}>IFSC Code</label>
                                    <input name="ifsc" value={formData.ifsc || ''} onChange={handleChange} className={inputClass} />
                                </div>
                                <div>
                                    <label className={labelClass}>PF Number</label>
                                    <input name="pf_number" value={formData.pf_number || ''} onChange={handleChange} className={inputClass} />
                                </div>
                                <div>
                                    <label className={labelClass}>UAN Number</label>
                                    <input name="uan_number" value={formData.uan_number || ''} onChange={handleChange} className={inputClass} />
                                </div>
                                <div className="md:col-span-2 h-px bg-gray-100 my-4"></div>
                                <div>
                                    <label className={labelClass}>Date of Joining</label>
                                    <input name="doj" type="date" value={formData.doj || ''} onChange={handleChange} className={inputClass} />
                                </div>
                                <div>
                                    <label className={labelClass}>Monthly Salary</label>
                                    <input name="monthly_salary" type="number" value={formData.monthly_salary || ''} onChange={handleChange} className={inputClass} />
                                </div>
                                <div className="md:col-span-2">
                                    <label className={labelClass}>Experience Description</label>
                                    <input name="experience" value={formData.experience || ''} onChange={handleChange} className={inputClass} />
                                </div>
                            </div>
                        </FormSection>

                        <FormSection title="Family Relations" icon={<FaUsers />}>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div>
                                    <label className={labelClass}>Father's Name</label>
                                    <input name="father_name" value={formData.father_name || ''} onChange={handleChange} className={inputClass} />
                                </div>
                                <div>
                                    <label className={labelClass}>Mother's Name</label>
                                    <input name="mother_name" value={formData.mother_name || ''} onChange={handleChange} className={inputClass} />
                                </div>
                                <div>
                                    <label className={labelClass}>Marital Status</label>
                                    <select name="marital_status" value={formData.marital_status || 'Single'} onChange={handleChange} className={inputClass}>
                                        <option value="Single">Single</option>
                                        <option value="Married">Married</option>
                                        <option value="Divorced">Divorced</option>
                                    </select>
                                </div>
                            </div>
                        </FormSection>

                        <FormSection title="Account Security" icon={<FaLock />}>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="md:col-span-2 bg-amber-50 p-8 rounded-[32px] border border-amber-100 mb-4">
                                    <p className="text-xs text-amber-800 font-bold leading-relaxed flex items-center gap-4">
                                        <div className="h-10 w-10 bg-amber-100 rounded-xl flex items-center justify-center shrink-0">
                                            <FaLock className="text-amber-600" />
                                        </div>
                                        Security PIN is required for the employee to login. Please make sure it is noted down securely.
                                    </p>
                                </div>
                                <div>
                                    <label className={labelClass}>{employee ? 'Reset Security PIN' : 'Set Security PIN'}</label>
                                    <input name="pin" type="password" value={formData.pin || ''} onChange={handleChange} className={inputClass + " tracking-[0.5em] text-center font-black"} placeholder="••••••" />
                                </div>
                                <div>
                                    <label className={labelClass}>Confirm Security PIN</label>
                                    <input name="confirm_pin" type="password" value={formData.confirm_pin || ''} onChange={handleChange} className={inputClass + " tracking-[0.5em] text-center font-black"} placeholder="••••••" />
                                </div>
                            </div>
                        </FormSection>
                    </form>

                    {/* Footer */}
                    <div className="p-8 bg-gray-50/50 border-t border-sky-50 flex justify-between items-center shrink-0">
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest hidden md:block">
                            Personnel: {formData.name || 'New Identifier'}
                        </span>
                        <div className="flex gap-4">
                            <button
                                type="button"
                                onClick={onClose}
                                className="px-8 py-4 bg-white border border-gray-200 text-gray-500 rounded-2xl hover:bg-gray-100 transition-all font-black uppercase tracking-widest text-[10px] active:scale-95"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleSubmit}
                                className="px-10 py-4 bg-sky-600 text-white rounded-2xl shadow-xl shadow-sky-200 hover:bg-sky-800 transition-all flex items-center gap-3 font-black uppercase tracking-widest text-[10px] active:scale-95 group"
                            >
                                <FaSave className="group-hover:scale-110 transition-transform" /> {employee ? 'Update Record' : 'Create Record'}
                            </button>
                        </div>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
};

export default EmployeeFormModal;
