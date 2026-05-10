import { motion, AnimatePresence } from 'framer-motion';
import { FaTimes } from 'react-icons/fa';

const Section = ({ title, children }) => (
    <div className="mb-10">
        <h3 className="text-[10px] font-black text-sky-500 uppercase tracking-widest mb-6 px-4 py-2 bg-sky-50/50 rounded-lg inline-block">{title}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {children}
        </div>
    </div>
);

const Detail = ({ label, value }) => (
    <div className="p-5 rounded-2xl bg-gray-50/50 border border-transparent hover:border-sky-50 hover:bg-white transition-all">
        <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1.5">{label}</p>
        <p className="text-sm font-black text-gray-800 tracking-tight">{value || 'N/A'}</p>
    </div>
);

const EmployeeDetailsModal = ({ isOpen, onClose, employee, departments = [] }) => {
    if (!isOpen || !employee) return null;

    const departmentName = departments.find(d => String(d.id) === String(employee.department_id))?.name || employee.department_name;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={onClose}
                    className="absolute inset-0 bg-sky-900/60 backdrop-blur-2xl"
                ></motion.div>

                <motion.div
                    initial={{ opacity: 0, scale: 0.9, y: 30 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9, y: 30 }}
                    className="relative bg-white w-full max-w-5xl max-h-[90vh] rounded-[40px] shadow-2xl overflow-hidden flex flex-col"
                >
                    {/* Header */}
                    <div className="p-10 border-b border-sky-50 flex justify-between items-center bg-gradient-to-r from-white to-sky-50/30">
                        <div className="flex items-center gap-8">
                            <div className="relative">
                                <img
                                    className="h-24 w-24 rounded-[32px] border-4 border-white shadow-2xl object-cover ring-4 ring-sky-50"
                                    src={employee.profile_pic || `https://ui-avatars.com/api/?name=${employee.name}&background=3b82f6&color=fff&bold=true&size=128`}
                                    alt=""
                                />
                                <div className="absolute -bottom-2 -right-2 h-8 w-8 bg-emerald-500 rounded-xl border-4 border-white shadow-lg"></div>
                            </div>
                            <div>
                                <h2 className="text-3xl font-black text-gray-800 tracking-tight">{employee.name}</h2>
                                <div className="flex items-center gap-3 mt-2">
                                    <span className="text-[10px] font-black text-sky-600 bg-sky-100/50 px-3 py-1 rounded-lg uppercase tracking-widest">{employee.emp_id}</span>
                                    {employee.emp_code && (
                                        <>
                                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">•</span>
                                            <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-3 py-1 rounded-lg uppercase tracking-widest">{employee.emp_code}</span>
                                        </>
                                    )}
                                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">•</span>
                                    <span className="text-[10px] font-black text-gray-800 uppercase tracking-widest">{employee.designation || 'Staff Member'}</span>
                                </div>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="h-14 w-14 rounded-2xl bg-white border border-gray-100 text-gray-400 flex items-center justify-center hover:bg-rose-50 hover:text-rose-500 transition-all shadow-sm active:scale-95"
                        >
                            <FaTimes size={24} />
                        </button>
                    </div>

                    {/* Details Content */}
                    <div className="flex-1 overflow-y-auto p-12 custom-scrollbar">
                        <Section title="Institutional Identification">
                            <Detail label="Employee ID" value={employee.emp_id} />
                            <Detail label="Employee Code" value={employee.emp_code} />
                            <Detail label="Current Role" value={String(employee.role || '').toUpperCase()} />
                            <Detail label="Department" value={departmentName} />
                            <Detail label="Designation" value={employee.designation} />
                            <Detail label="Joining Date" value={employee.doj ? new Date(employee.doj).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : 'N/A'} />
                            <Detail label="Experience" value={employee.experience} />
                            <Detail label="Monthly Base Salary" value={employee.monthly_salary ? `₹${employee.monthly_salary}` : 'Confidential'} />
                        </Section>

                        <Section title="Communication Profile">
                            <Detail label="Official Email" value={employee.email} />
                            <Detail label="Mobile (Primary)" value={employee.mobile} />
                            <Detail label="WhatsApp Connect" value={employee.whatsapp} />
                            <Detail label="Permanent Address" value={employee.permanent_address} />
                            <Detail label="Communication Address" value={employee.communication_address} />
                            <Detail label="Regional PIN Code" value={employee.pin_code} />
                        </Section>

                        <Section title="Personal Demographics">
                            <Detail label="Date of Birth" value={employee.dob ? new Date(employee.dob).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : 'N/A'} />
                            <Detail label="Gender Selection" value={employee.gender} />
                            <Detail label="Blood Group Matrix" value={employee.blood_group} />
                            <Detail label="Religion/Faith" value={employee.religion} />
                            <Detail label="Nationality" value={employee.nationality} />
                            <Detail label="Caste/Category" value={employee.caste || 'N/A'} />
                        </Section>

                        <Section title="Government & Legal IDs">
                            <Detail label="Aadhar ID Number" value={employee.aadhar ? `•••• •••• ${String(employee.aadhar).slice(-4)}` : 'N/A'} />
                            <Detail label="PAN Card Reference" value={employee.pan ? `••••• ${String(employee.pan).slice(-4)}` : 'N/A'} />
                            <Detail label="PF Registry Number" value={employee.pf_number} />
                            <Detail label="UAN Multi-Registry" value={employee.uan_number} />
                        </Section>

                        <Section title="Bank Settlement Details">
                            <Detail label="Bank Institution" value={employee.bank_name} />
                            <Detail label="Branch Identifier" value={employee.branch} />
                            <Detail label="IFSC Protocol" value={employee.ifsc} />
                            <Detail label="Financial Account" value={employee.account_no ? `••••••••${String(employee.account_no).slice(-4)}` : 'N/A'} />
                        </Section>

                        <Section title="Family Relations">
                            <Detail label="Father's Legal Name" value={employee.father_name} />
                            <Detail label="Mother's Legal Name" value={employee.mother_name} />
                            <Detail label="Current Marital Status" value={employee.marital_status} />
                        </Section>
                    </div>

                    <div className="p-10 border-t border-sky-50 bg-gray-50/50 flex justify-center">
                        <button
                            onClick={onClose}
                            className="px-12 py-4 bg-white border border-gray-200 text-gray-500 rounded-2xl hover:bg-gray-100 transition-all font-black uppercase tracking-widest text-[11px] active:scale-95 shadow-sm"
                        >
                            Return to Registry
                        </button>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
};

export default EmployeeDetailsModal;
