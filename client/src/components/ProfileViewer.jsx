import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaTimes, FaCheckCircle, FaIdBadge, FaBuilding, FaPhone, FaEnvelope, FaUser, FaCalendarAlt, FaVenusMars, FaTint, FaGlobe, FaHandsHelping, FaWhatsapp, FaMapMarkerAlt, FaUsers, FaHeart, FaBriefcase, FaMoneyBillWave, FaUniversity, FaCreditCard, FaLock, FaUserCircle, FaSuitcase, FaCamera, FaSave, FaCertificate, FaDownload, FaEye, FaPlus, FaTrash, FaKey, FaPrint, FaMinusCircle } from 'react-icons/fa';
import api from '../utils/api';
import Swal from 'sweetalert2';
import { useAuth } from '../context/AuthContext';
import { runPrintWindow } from '../utils/printUtils';

const inputClass = "w-full p-3 bg-gray-50 border border-gray-200 rounded-2xl outline-none focus:ring-4 focus:ring-sky-100 focus:border-sky-500 transition-all font-bold text-gray-700 text-sm";

const InfoRow = ({ icon, label, value, editing, name, onChange, type = 'text' }) => (
    <div className="flex items-center gap-4 p-4 rounded-3xl bg-gray-50/50 hover:bg-white transition-all border border-transparent hover:border-gray-100 group">
        <div className="h-10 w-10 rounded-2xl bg-white shadow-sm flex items-center justify-center text-sky-600 group-hover:rotate-12 transition-transform shrink-0">
            {icon}
        </div>
        <div className="flex-1 min-w-0">
            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">{label}</p>
            {editing && name ? (
                <input
                    type={type}
                    name={name}
                    value={value || ''}
                    onChange={onChange}
                    className={inputClass}
                />
            ) : (
                <p className="text-sm font-black text-gray-800 tracking-tight truncate">{value || 'Not Specified'}</p>
            )}
        </div>
    </div>
);

const SectionHeader = ({ title }) => (
    <h4 className="text-[10px] font-black text-sky-600 uppercase tracking-[0.3em] mb-4 mt-8 first:mt-0 flex items-center gap-3">
        {title} <div className="h-[1px] flex-1 bg-sky-100" />
    </h4>
);

const ProfileViewer = ({ user, onClose }) => {
    const { user: authUser } = useAuth();
    const [isEditingPic, setIsEditingPic] = useState(false);
    const [isEditingProfile, setIsEditingProfile] = useState(false);
    const [picUrl, setPicUrl] = useState(user?.profile_pic || '');
    const [loading, setLoading] = useState(false);
    const [certificates, setCertificates] = useState([]);
    const [formData, setFormData] = useState({});
    const [pinData, setPinData] = useState({ currentPin: '', newPin: '', confirmPin: '' });
    const [isChangingPin, setIsChangingPin] = useState(false);
    const [certName, setCertName] = useState('');
    const [certFile, setCertFile] = useState(null);
    const [uploadingCert, setUploadingCert] = useState(false);
    const [showCertForm, setShowCertForm] = useState(false);
    const [isEditingName, setIsEditingName] = useState(false);
    const [editableName, setEditableName] = useState('');
    const [updatingName, setUpdatingName] = useState(false);
    const certFileRef = useRef(null);

    const isOwnProfile = authUser && user && (
        (authUser.role === 'management' && user.role === 'management') || 
        String(authUser.id) === String(user.id) || 
        authUser.emp_id === user.emp_id
    );

    const viewerRole = String(user?.role || '').trim().toLowerCase();
    const isEmployeeProfile = viewerRole !== 'management' && viewerRole !== 'admin';

    // HOD & Principal are restricted when viewing OTHERS' profiles
    // Principal & HOD can view sensitive info for others they are authorized to view
    const canViewSensitiveInfo = isOwnProfile || ['admin', 'management'].includes(authUser.role);
    const canViewDeductions = false;
    const isPrivilegedViewer = ['admin', 'management'].includes(authUser.role);
    const isPrivilegedTarget = ['admin', 'management'].includes(viewerRole);
    const canViewPin = (isOwnProfile && isPrivilegedTarget) || (!isOwnProfile && isPrivilegedViewer && isPrivilegedTarget);

    const parsedDeductions = (() => {
        try {
            if (!user?.deductions) return [];
            // Handle both string and pre-parsed object from DB
            return typeof user.deductions === 'string' ? JSON.parse(user.deductions) : user.deductions;
        } catch (e) {
            console.error('Error parsing deductions:', e);
            return [];
        }
    })();

    const formatDeductionLabel = (label) => {
        const safeLabel = String(label || '').trim();
        if (!safeLabel) return 'Deduction';
        // Keep the original label so PF formulas/details (PF Basic, % per month, etc.) remain visible.
        return safeLabel;
    };

    const displayDeductions = parsedDeductions.map((d) => ({
        ...d,
        label: formatDeductionLabel(d?.type || d?.label)
    }));

    useEffect(() => {
        setPicUrl(user?.profile_pic || '');
        setEditableName(user?.name || '');
        if (user) {
            setFormData({
                mobile: user.mobile || '',
                whatsapp: user.whatsapp || '',
                email: user.email || '',
                blood_group: user.blood_group || '',
                religion: user.religion || '',
                nationality: user.nationality || '',
                caste: user.caste || '',
                community: user.community || '',
                aadhar: user.aadhar || '',
                pan: user.pan || '',
                account_no: user.account_no || '',
                bank_name: user.bank_name || '',
                branch: user.branch || '',
                ifsc: user.ifsc || '',
                pin_code: user.pin_code || '',
                pf_number: user.pf_number || '',
                uan_number: user.uan_number || '',
                permanent_address: user.permanent_address || '',
                communication_address: user.communication_address || '',
                father_name: user.father_name || '',
                mother_name: user.mother_name || '',
                marital_status: user.marital_status || '',
            });
        }
    }, [user]);

    useEffect(() => {
        if (user?.id) {
            api.get(`/certificates/${user.id}`).then(({ data }) => setCertificates(data)).catch(() => {});
        }
    }, [user?.id]);

    if (!user) return null;

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handlePicFileChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            if (file.size > 5 * 1024 * 1024) {
                return Swal.fire({ title: 'File Too Large', text: 'Please select an image smaller than 5MB.', icon: 'warning', confirmButtonColor: '#2563eb' });
            }
            const reader = new FileReader();
            reader.onloadend = () => setPicUrl(reader.result);
            reader.readAsDataURL(file);
        }
    };

    const handlePicUpdate = async () => {
        if (!picUrl) return;
        setLoading(true);
        try {
            const { data } = await api.put('/auth/profile-pic', { profile_pic: picUrl });
            Swal.fire({ icon: 'success', title: 'Updated!', text: 'Profile picture has been updated.', timer: 1500, showConfirmButton: false });
            setIsEditingPic(false);
            window.location.reload();
        } catch (error) {
            console.error(error);
            Swal.fire({ icon: 'error', title: 'Error', text: 'Failed to update profile picture.' });
        } finally {
            setLoading(false);
        }
    };

    const handleProfileUpdate = async () => {
        setLoading(true);
        try {
            if (user.role === 'management') {
                await api.put('/auth/management-profile', formData);
            } else {
                await api.put('/auth/profile', formData);
            }
            Swal.fire({ icon: 'success', title: 'Updated!', text: 'Profile has been updated successfully.', timer: 1500, showConfirmButton: false });
            setIsEditingProfile(false);
            window.location.reload();
        } catch (error) {
            console.error(error);
            Swal.fire({ icon: 'error', title: 'Error', text: error.response?.data?.message || 'Failed to update profile.' });
        } finally {
            setLoading(false);
        }
    };

    const viewCertificate = async (certId) => {
        try {
            const { data } = await api.get(`/certificates/file/${certId}`);
            const win = window.open('', '_blank');
            if (data.file_type?.startsWith('image/') || data.file_type === 'application/pdf') {
                win.document.write(`<iframe src="${data.file_data}" style="width:100%;height:100%;border:none;" frameborder="0"></iframe>`);
            } else {
                win.document.write(`<p>Preview not available. <a href="${data.file_data}" download="${data.file_name}">Download file</a></p>`);
            }
        } catch {
            Swal.fire('Error', 'Failed to load certificate', 'error');
        }
    };

    const downloadCertificate = async (certId, fileName) => {
        try {
            const { data } = await api.get(`/certificates/file/${certId}`);
            const link = document.createElement('a');
            link.href = data.file_data;
            link.download = fileName || 'certificate';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch {
            Swal.fire('Error', 'Failed to download certificate', 'error');
        }
    };

    const handleCertUpload = async () => {
        if (!certName.trim() || !certFile) {
            return Swal.fire('Missing Info', 'Please enter certificate name and select a file.', 'warning');
        }
        setUploadingCert(true);
        try {
            const fd = new FormData();
            fd.append('certificate_name', certName.trim());
            fd.append('certificate', certFile);
            await api.post(`/certificates/${user.id}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
            Swal.fire({ icon: 'success', title: 'Uploaded!', text: 'Certificate added successfully.', timer: 1500, showConfirmButton: false });
            setCertName('');
            setCertFile(null);
            setShowCertForm(false);
            if (certFileRef.current) certFileRef.current.value = '';
            const { data } = await api.get(`/certificates/${user.id}`);
            setCertificates(data);
        } catch {
            Swal.fire('Error', 'Failed to upload certificate.', 'error');
        } finally {
            setUploadingCert(false);
        }
    };

    const handleCertDelete = async (certId) => {
        const result = await Swal.fire({ title: 'Delete Certificate?', text: 'This action cannot be undone.', icon: 'warning', showCancelButton: true, confirmButtonColor: '#ef4444', confirmButtonText: 'Delete' });
        if (!result.isConfirmed) return;
        try {
            await api.delete(`/certificates/${certId}`);
            Swal.fire({ icon: 'success', title: 'Deleted!', timer: 1200, showConfirmButton: false });
            const { data } = await api.get(`/certificates/${user.id}`);
            setCertificates(data);
        } catch {
            Swal.fire('Error', 'Failed to delete certificate.', 'error');
        }
    };

    const handlePinChange = async () => {
        if (!pinData.newPin || !pinData.confirmPin) {
            return Swal.fire('Missing Info', 'Please fill in all PIN fields.', 'warning');
        }
        if (pinData.newPin.length < 4) {
            return Swal.fire('Invalid PIN', 'PIN must be at least 4 characters.', 'warning');
        }
        if (pinData.newPin !== pinData.confirmPin) {
            return Swal.fire('Mismatch', 'New PIN and Confirm PIN do not match.', 'warning');
        }
        setLoading(true);
        try {
            if (authUser.role === 'management') {
                await api.put('/auth/management-profile', { pin: pinData.newPin });
            } else {
                await api.put('/auth/profile', { pin: pinData.newPin });
            }
            Swal.fire({ icon: 'success', title: 'PIN Updated!', text: 'Your PIN has been changed successfully.', timer: 1500, showConfirmButton: false });
            setPinData({ currentPin: '', newPin: '', confirmPin: '' });
            setIsChangingPin(false);
        } catch (error) {
            Swal.fire('Error', error.response?.data?.message || 'Failed to update PIN.', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handlePrintProfile = async () => {
        const title = `Profile - ${user.name}`;

        let fullCertificates = certificates;
        try {
            if (certificates.length > 0) {
                Swal.fire({
                    title: 'Preparing report...',
                    text: 'Please wait while we load certificates.',
                    allowOutsideClick: false,
                    didOpen: () => Swal.showLoading()
                });

                const certDataPromises = certificates.map(async (cert) => {
                    try {
                        const { data } = await api.get(`/certificates/file/${cert.id}`);
                        return { ...cert, ...data };
                    } catch {
                        return cert;
                    }
                });

                fullCertificates = await Promise.all(certDataPromises);
                Swal.close();
            }

            const certsHtml = fullCertificates.map(cert => {
                if (cert.file_data && (cert.file_type?.startsWith('image/') || cert.file_data?.startsWith('data:image/'))) {
                    return `
                        <div style="margin-top: 30px; page-break-before: always; text-align: center;">
                            <h2 style="font-size: 14pt; color: #0369a1; border-bottom: 2px solid #bae6fd; padding-bottom: 10px; margin-bottom: 20px;">${cert.certificate_name}</h2>
                            <img src="${cert.file_data}" style="max-width: 100%; max-height: 800px; border: 1px solid #e2e8f0; padding: 10px; border-radius: 8px;" />
                        </div>
                    `;
                } else {
                    return `
                        <div style="margin-top: 20px; border: 1px dashed #e2e8f0; padding: 15px; text-align: center; border-radius: 12px; background: #f8fafc;">
                            <p style="font-size: 10pt; color: #64748b; margin: 0;">Certificate: <strong>${cert.certificate_name}</strong> (${cert.file_name})</p>
                            <p style="font-size: 8pt; color: #94a3b8; margin: 4px 0 0;">[Attachment Type: ${cert.file_type || 'Unknown'}]</p>
                        </div>
                    `;
                }
            }).join('');

            const profilePic = picUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&size=200&background=2563eb&color=fff&bold=true`;

            const htmlContent = `
            <html>
                <head>
                    <title>${title}</title>
                    <style>
                        @page { size: A4 portrait; margin: 12mm; }
                        html, body { height: auto; overflow: visible; }
                        body { font-family: 'Segoe UI', Arial, sans-serif; padding: 40px; color: #1e293b; background: #fff; line-height: 1.5; }
                        .container { max-width: 800px; margin: 0 auto; }
                        .header { display: flex; align-items: center; gap: 30px; margin-bottom: 40px; border-bottom: 2px solid #f1f5f9; padding-bottom: 30px; }
                        .photo { width: 140px; height: 140px; border-radius: 24px; object-fit: cover; border: 4px solid #fff; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1); background: #f8fafc; }
                        .header-info h1 { margin: 0; font-size: 26pt; font-weight: 900; color: #0f172a; letter-spacing: -0.04em; line-height: 1; }
                        .header-info p { margin: 8px 0 0; font-size: 11pt; color: #64748b; font-weight: 700; text-transform: uppercase; letter-spacing: 0.15em; }
                        .emp-id { display: inline-block; background: #f0f9ff; color: #0369a1; padding: 6px 14px; border-radius: 10px; font-weight: 800; font-size: 9pt; margin-top: 12px; border: 1px solid #bae6fd; text-transform: uppercase; letter-spacing: 0.05em; }
                        .section { margin-bottom: 35px; }
                        .section-title { font-size: 9pt; font-weight: 900; color: #0284c7; text-transform: uppercase; letter-spacing: 0.25em; border-bottom: 1px solid #f1f5f9; padding-bottom: 10px; margin-bottom: 18px; }
                        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px 40px; }
                        .info-item { display: flex; flex-direction: column; }
                        .info-label { font-size: 7.5pt; font-weight: 800; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 3px; }
                        .info-value { font-size: 10.5pt; font-weight: 700; color: #334155; border-bottom: 1px solid #f8fafc; padding-bottom: 2px; }
                        .address-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
                        .address-box { background: #f8fafc; padding: 15px; border-radius: 16px; border: 1px solid #f1f5f9; }
                        .address-box .info-value { border: none; font-size: 9.5pt; line-height: 1.4; color: #475569; }
                        @media print {
                            body { padding: 0; }
                            .no-print { display: none; }
                            .section { break-inside: avoid; page-break-inside: avoid; }
                            img, .address-box, .header { break-inside: avoid; page-break-inside: avoid; }
                        }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="header">
                            <img src="${profilePic}" class="photo" />
                            <div class="header-info">
                                <h1>${user.name}</h1>
                                <p>${user.designation || user.role}</p>
                                <div class="emp-id">EMP ID: ${user.emp_id}</div>
                            </div>
                        </div>
                        <div class="section">
                            <div class="section-title">Official Overview</div>
                            <div class="grid">
                                <div class="info-item"><span class="info-label">Current Department</span><span class="info-value">${user.department_name || '-'}</span></div>
                                <div class="info-item"><span class="info-label">Official Email</span><span class="info-value" style="text-transform: lowercase;">${user.email || '-'}</span></div>
                                <div class="info-item"><span class="info-label">Date of Joining</span><span class="info-value">${user.doj || '-'}</span></div>
                                <div class="info-item"><span class="info-label">Total Experience</span><span class="info-value">${user.experience || '-'}</span></div>
                            </div>
                        </div>
                        <div class="section">
                            <div class="section-title">Personal Information</div>
                            <div class="grid">
                                <div class="info-item"><span class="info-label">Date of Birth</span><span class="info-value">${user.dob || '-'}</span></div>
                                <div class="info-item"><span class="info-label">Gender / Blood Group</span><span class="info-value">${user.gender || '-'} / ${user.blood_group || '-'}</span></div>
                                <div class="info-item"><span class="info-label">Mobile Contact</span><span class="info-value">${user.mobile || '-'}</span></div>
                                <div class="info-item"><span class="info-label">WhatsApp Contact</span><span class="info-value">${user.whatsapp || '-'}</span></div>
                                <div class="info-item"><span class="info-label">Nationality / Religion</span><span class="info-value">${user.nationality || '-'} / ${user.religion || '-'}</span></div>
                                <div class="info-item"><span class="info-label">Community &amp; Caste</span><span class="info-value">${user.community || '-'} ${user.caste ? `(${user.caste})` : ''}</span></div>
                            </div>
                        </div>
                        <div class="section">
                            <div class="section-title">Residency Details</div>
                            <div class="address-grid">
                                <div class="address-box"><span class="info-label" style="color:#0284c7;">Communication Address</span><div class="info-value" style="margin-top:8px;text-transform:uppercase;">${user.communication_address || 'NOT PROVIDED'}</div></div>
                                <div class="address-box"><span class="info-label" style="color:#6366f1;">Permanent Address</span><div class="info-value" style="margin-top:8px;text-transform:uppercase;">${user.permanent_address || 'NOT PROVIDED'}</div></div>
                            </div>
                        </div>
                        <div class="section">
                            <div class="section-title">Identification &amp; Family</div>
                            <div class="grid">
                                <div class="info-item"><span class="info-label">Aadhar Number</span><span class="info-value">${user.aadhar || '-'}</span></div>
                                <div class="info-item"><span class="info-label">PAN Number</span><span class="info-value">${user.pan || '-'}</span></div>
                                <div class="info-item"><span class="info-label">Father's Name</span><span class="info-value">${user.father_name || '-'}</span></div>
                                <div class="info-item"><span class="info-label">Mother's Name</span><span class="info-value">${user.mother_name || '-'}</span></div>
                                <div class="info-item"><span class="info-label">Marital Status</span><span class="info-value">${user.marital_status || '-'}</span></div>
                            </div>
                        </div>
                        <div class="section">
                            <div class="section-title">Financial &amp; Statutory Info</div>
                            <div class="grid">
                                <div class="info-item"><span class="info-label">Primary Bank</span><span class="info-value">${user.bank_name || '-'}</span></div>
                                <div class="info-item"><span class="info-label">Account Details</span><span class="info-value">${user.account_no || '-'}</span></div>
                                <div class="info-item"><span class="info-label">IFSC Code</span><span class="info-value">${user.ifsc || '-'}</span></div>
                                <div class="info-item"><span class="info-label">PF &amp; UAN Details</span><span class="info-value">${user.pf_number || '-'} / ${user.uan_number || '-'}</span></div>
                            </div>
                        </div>
                        ${certsHtml}
                        <div style="margin-top: 60px; border-top: 2px solid #f1f5f9; padding-top: 25px; display: flex; justify-content: space-between; align-items: flex-end;">
                            <div style="font-size: 7.5pt; color: #94a3b8; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em;">
                                System Generated Document<br/>PPG EMP HUB &bull; ${new Date().toLocaleDateString('en-GB')}
                            </div>
                            <div style="text-align: center;">
                                <div style="margin-bottom: 40px; font-size: 8pt; color: #cbd5e1; font-style: italic;">Seal &amp; Signature</div>
                                <div style="border-top: 1.5px solid #334155; width: 180px; padding-top: 6px; font-size: 8.5pt; font-weight: 900; color: #1e293b; text-transform: uppercase; letter-spacing: 0.05em;">Authorized Authority</div>
                            </div>
                        </div>
                    </div>
                </body>
            </html>
        `;

            const didRun = await runPrintWindow({
                title,
                html: htmlContent,
                modeLabel: 'the profile report',
                closeAfterPrint: true,
                delay: 450,
                windowFeatures: 'width=1100,height=850'
            });

            if (!didRun) {
                // User cancelled the mode selection or the browser blocked print; keep quiet.
                return;
            }
        } catch (error) {
            try { Swal.close(); } catch { /* ignore */ }
            Swal.fire('Error', error?.response?.data?.message || error?.message || 'Failed to generate report.', 'error');
        }
    };

    const handleSaveName = async () => {
        const nextName = String(editableName || '').trim();
        if (!nextName) {
            return Swal.fire('Invalid Name', 'Name cannot be empty.', 'warning');
        }

        setUpdatingName(true);
        try {
            await api.put('/auth/profile-name', { name: nextName });
            Swal.fire({ icon: 'success', title: 'Updated!', text: 'Name has been changed.', timer: 1400, showConfirmButton: false });
            setIsEditingName(false);
            window.location.reload();
        } catch (error) {
            Swal.fire('Error', error.response?.data?.message || 'Failed to update name.', 'error');
        } finally {
            setUpdatingName(false);
        }
    };

    return (
        <div className="w-full max-w-7xl mx-auto">
            <motion.div
                initial={{ opacity: 0, scale: 0.98, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                className="bg-white rounded-[40px] shadow-2xl overflow-hidden flex flex-col md:flex-row min-h-[70vh] border border-sky-50"
            >
                {/* Left Sidebar - Photo & Key Info */}
                <div className="md:w-1/3 bg-white border-r border-gray-100 flex flex-col items-center p-10 text-center relative shrink-0">
                    <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-br from-sky-600 to-indigo-700 opacity-5" />
                    <div className="relative mb-8 pt-4">
                        <div className="h-40 w-40 rounded-[50px] bg-white p-2 shadow-2xl ring-1 ring-sky-100 group hover:rotate-2 transition-transform duration-700 relative overflow-hidden text-center">
                            <img
                                src={picUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&size=200&background=2563eb&color=fff&bold=true`}
                                alt=""
                                className="h-full w-full rounded-[38px] object-cover bg-gray-50 mx-auto"
                            />
                            {isOwnProfile && (
                                <button
                                    onClick={() => setIsEditingPic(!isEditingPic)}
                                    className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white"
                                >
                                    <FaCamera size={24} />
                                </button>
                            )}
                        </div>
                        <div className="absolute -bottom-3 -right-3 h-12 w-12 bg-white rounded-2xl shadow-xl flex items-center justify-center text-sky-600 border border-sky-50">
                            <FaCheckCircle size={20} />
                        </div>
                    </div>

                    {isEditingPic && (
                        <motion.div
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="w-full px-4 mb-4"
                        >
                            <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Upload Image or Paste URL</label>
                            <input
                                type="file"
                                accept="image/*"
                                onChange={handlePicFileChange}
                                className="w-full mb-2 text-[10px] font-bold file:mr-2 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-sky-50 file:text-sky-600 file:font-bold file:text-[10px] file:cursor-pointer"
                            />
                            <input
                                type="text"
                                value={picUrl}
                                onChange={(e) => setPicUrl(e.target.value)}
                                placeholder="Or paste Image URL here..."
                                className="w-full p-3 rounded-xl bg-gray-50 border border-gray-100 text-[10px] font-bold outline-none focus:ring-2 focus:ring-sky-100"
                            />
                            <div className="flex gap-2 mt-2">
                                <button
                                    onClick={handlePicUpdate}
                                    disabled={loading}
                                    className="flex-1 py-2 bg-sky-600 text-white rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-sky-700 disabled:opacity-50"
                                >
                                    {loading ? 'Saving...' : 'Save'}
                                </button>
                                <button
                                    onClick={() => { setIsEditingPic(false); setPicUrl(user.profile_pic); }}
                                    className="flex-1 py-2 bg-gray-100 text-gray-500 rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-gray-200"
                                >
                                    Cancel
                                </button>
                            </div>
                        </motion.div>
                    )}

                    {!isEditingName ? (
                        <button
                            type="button"
                            onClick={() => {
                                if (!isOwnProfile) return;
                                setEditableName(user.name || '');
                                setIsEditingName(true);
                            }}
                            className={`text-3xl font-black text-gray-800 tracking-tighter leading-tight break-words px-4 text-center ${isOwnProfile ? 'hover:text-sky-600 transition-colors cursor-pointer' : 'cursor-default'}`}
                            title={isOwnProfile ? 'Click to edit name' : ''}
                        >
                            {user.name}
                        </button>
                    ) : (
                        <div className="w-full px-4 mt-1">
                            <input
                                type="text"
                                value={editableName}
                                onChange={(e) => setEditableName(e.target.value)}
                                className="w-full p-3 bg-gray-50 border border-gray-200 rounded-2xl outline-none focus:ring-4 focus:ring-sky-100 focus:border-sky-500 transition-all font-bold text-gray-700 text-sm text-center"
                                placeholder="Enter your name"
                            />
                            <div className="flex gap-2 mt-2">
                                <button
                                    type="button"
                                    onClick={handleSaveName}
                                    disabled={updatingName}
                                    className="flex-1 py-2 bg-sky-600 text-white rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-sky-700 disabled:opacity-50"
                                >
                                    {updatingName ? 'Saving...' : 'Save'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setIsEditingName(false);
                                        setEditableName(user.name || '');
                                    }}
                                    className="flex-1 py-2 bg-gray-100 text-gray-500 rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-gray-200"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    )}
                    <div className="mt-4 px-6 py-2 rounded-full bg-sky-50 border border-sky-100 text-sky-600 text-[10px] font-black uppercase tracking-widest inline-flex items-center gap-2">
                        <FaIdBadge /> {user.emp_id}
                    </div>
                    <p className="mt-4 text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em]">{user.designation || user.role}</p>

                    <div className="w-full mt-10 pt-10 border-t border-gray-50 space-y-4">
                        <div className="flex items-center justify-between text-[10px] font-black text-gray-400 uppercase tracking-widest">
                            <span>Verified Profile</span>
                            <span className="text-sky-500 italic">2026 Season</span>
                        </div>
                        <div className="h-1.5 w-full bg-gray-50 rounded-full overflow-hidden">
                            <div className="h-full bg-sky-600 w-full" />
                        </div>
                    </div>
                </div>

                {/* Right Content - Full Stats */}
                <div className="flex-1 flex flex-col bg-gray-50/20">
                    <div className="p-8 border-b border-gray-100 bg-white flex justify-between items-center">
                        <div>
                            <h3 className="text-xl font-black text-gray-800 tracking-tight">Employee Profile</h3>
                            <p className="text-[10px] font-black text-sky-500 uppercase tracking-[0.3em] mt-1">Official Personnel Data</p>
                        </div>
                        <div className="flex items-center gap-2">
                            {isEmployeeProfile && (
                                <button
                                    onClick={handlePrintProfile}
                                    className="flex items-center gap-2 px-5 py-2.5 bg-white border border-gray-200 text-gray-600 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-gray-50 transition-all shadow-sm group"
                                    title="Profile & Certificates Report"
                                >
                                    <FaPrint size={12} className="group-hover:scale-110 transition-transform" /> Report
                                </button>
                            )}
                        </div>
                        {isEditingProfile && (
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={handleProfileUpdate}
                                    disabled={loading}
                                    className="flex items-center gap-2 px-5 py-2.5 bg-green-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-green-700 transition-all shadow-lg shadow-green-200 disabled:opacity-50"
                                >
                                    <FaSave size={12} /> {loading ? 'Saving...' : 'Save Changes'}
                                </button>
                                <button
                                    onClick={() => {
                                        setIsEditingProfile(false);
                                        setFormData({
                                            mobile: user.mobile || '', whatsapp: user.whatsapp || '', email: user.email || '',
                                            blood_group: user.blood_group || '', religion: user.religion || '', nationality: user.nationality || '',
                                            caste: user.caste || '', community: user.community || '',
                                            aadhar: user.aadhar || '', pan: user.pan || '',
                                            account_no: user.account_no || '', bank_name: user.bank_name || '', branch: user.branch || '',
                                            ifsc: user.ifsc || '', pin_code: user.pin_code || '',
                                            pf_number: user.pf_number || '', uan_number: user.uan_number || '',
                                            permanent_address: user.permanent_address || '', communication_address: user.communication_address || '',
                                            father_name: user.father_name || '', mother_name: user.mother_name || '', marital_status: user.marital_status || '',
                                        });
                                    }}
                                    className="flex items-center gap-2 px-5 py-2.5 bg-gray-100 text-gray-500 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-gray-200 transition-all"
                                >
                                    <FaTimes size={12} /> Cancel
                                </button>
                            </div>
                        )}
                    </div>

                    <div className="flex-1 overflow-y-auto p-8 md:p-10 custom-scrollbar">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2">
                            {/* Core Data - Not editable by user */}
                            <div className="col-span-full">
                                <SectionHeader title="Employee Information" />
                            </div>
                             <InfoRow 
                                icon={<FaIdBadge />} 
                                label="Employee ID" 
                                value={isEditingProfile ? (formData.emp_id || user.emp_id) : user.emp_id} 
                                editing={isEditingProfile && (authUser.role === 'admin' || authUser.role === 'management')}
                                name="emp_id"
                                onChange={handleChange}
                            />
                             <InfoRow icon={<FaUser />} label="Full Name" value={user.name} />
                            {canViewPin && (
                                <InfoRow 
                                    icon={<FaIdBadge />} 
                                    label="PIN" 
                                    value={isEditingProfile ? (formData.pin || user.pin) : (user.pin || '****')} 
                                    editing={isEditingProfile && (authUser.role === 'admin' || (authUser.role === 'management' && user.role === 'management'))}
                                    name="pin"
                                    onChange={handleChange}
                                    type="text"
                                />
                            )}
                            <InfoRow icon={<FaEnvelope />} label="Email Address" value={isEditingProfile ? formData.email : user.email} editing={isEditingProfile} name="email" onChange={handleChange} />
                            <InfoRow icon={<FaBuilding />} label="Department" value={user.department_name} />
                            <InfoRow icon={<FaBriefcase />} label="Designation" value={user.designation || user.role} />

                            {/* Personal, Family, Career & Location Sections (only for employees) */}
                            {isEmployeeProfile && (
                                <>
                                    {/* Personal Data */}
                                    <div className="col-span-full">
                                        <SectionHeader title="Personal Information" />
                                    </div>
                                    <InfoRow icon={<FaCalendarAlt />} label="Date of Birth" value={user.dob} />
                                    <InfoRow icon={<FaVenusMars />} label="Gender" value={user.gender} />
                                     <InfoRow icon={<FaPhone />} label="Mobile Number" value={isEditingProfile ? formData.mobile : user.mobile} editing={isEditingProfile} name="mobile" onChange={handleChange} />
                                    <InfoRow icon={<FaWhatsapp />} label="WhatsApp" value={isEditingProfile ? formData.whatsapp : user.whatsapp} editing={isEditingProfile} name="whatsapp" onChange={handleChange} />
                                    <InfoRow icon={<FaTint />} label="Blood Group" value={isEditingProfile ? formData.blood_group : user.blood_group} editing={isEditingProfile} name="blood_group" onChange={handleChange} />
                                    <InfoRow icon={<FaGlobe />} label="Nationality" value={isEditingProfile ? formData.nationality : user.nationality} editing={isEditingProfile} name="nationality" onChange={handleChange} />
                                    {(isOwnProfile || authUser.role === 'admin' || authUser.role === 'management') && (
                                        <InfoRow icon={<FaHandsHelping />} label="Religion" value={isEditingProfile ? formData.religion : user.religion} editing={isEditingProfile} name="religion" onChange={handleChange} />
                                    )}
                                    {isEditingProfile ? (
                                        <>
                                            <InfoRow icon={<FaUsers />} label="Community" value={formData.community} editing={true} name="community" onChange={handleChange} />
                                            <InfoRow icon={<FaUsers />} label="Caste" value={formData.caste} editing={true} name="caste" onChange={handleChange} />
                                        </>
                                    ) : (
                                        (isOwnProfile || authUser.role === 'admin' || authUser.role === 'management') && (
                                            <InfoRow icon={<FaUsers />} label="Community / Caste" value={`${user.community || ''} ${user.caste ? `(${user.caste})` : ''}`} />
                                        )
                                    )}

                                    {/* Family & Marital */}
                                    {canViewSensitiveInfo && (
                                        <>
                                            <div className="col-span-full">
                                                <SectionHeader title="Family & Social" />
                                            </div>
                                            <InfoRow icon={<FaUser />} label="Father's Name" value={isEditingProfile ? formData.father_name : user.father_name} editing={isEditingProfile} name="father_name" onChange={handleChange} />
                                            <InfoRow icon={<FaUser />} label="Mother's Name" value={isEditingProfile ? formData.mother_name : user.mother_name} editing={isEditingProfile} name="mother_name" onChange={handleChange} />
                                            <InfoRow icon={<FaHeart />} label="Marital Status" value={isEditingProfile ? formData.marital_status : user.marital_status} editing={isEditingProfile} name="marital_status" onChange={handleChange} />

                                            {/* Career & Financial */}
                                            <div className="col-span-full">
                                                <SectionHeader title="Career & Financials" />
                                            </div>
                                            <InfoRow icon={<FaCalendarAlt />} label="Date of Joining" value={user.doj} />
                                            <InfoRow icon={<FaSuitcase />} label="Experience" value={user.experience} />
                                            <InfoRow icon={<FaMoneyBillWave />} label="Monthly Salary" value={user.monthly_salary ? `₹${parseFloat(user.monthly_salary).toLocaleString()}` : 'N/A'} />
                                            <InfoRow icon={<FaUniversity />} label="Bank Name" value={isEditingProfile ? formData.bank_name : user.bank_name} editing={isEditingProfile} name="bank_name" onChange={handleChange} />
                                            <InfoRow icon={<FaCreditCard />} label="Account Number" value={isEditingProfile ? formData.account_no : user.account_no} editing={isEditingProfile} name="account_no" onChange={handleChange} />
                                            {isEditingProfile ? (
                                                <>
                                                    <InfoRow icon={<FaUniversity />} label="Branch" value={formData.branch} editing={true} name="branch" onChange={handleChange} />
                                                    <InfoRow icon={<FaUniversity />} label="IFSC Code" value={formData.ifsc} editing={true} name="ifsc" onChange={handleChange} />
                                                </>
                                            ) : (
                                                <InfoRow icon={<FaUniversity />} label="Branch / IFSC" value={`${user.branch || ''} ${user.ifsc ? `(${user.ifsc})` : ''}`} />
                                            )}
                                            <InfoRow icon={<FaIdBadge />} label="Aadhar Card" value={isEditingProfile ? formData.aadhar : user.aadhar} editing={isEditingProfile} name="aadhar" onChange={handleChange} />
                                            <InfoRow icon={<FaIdBadge />} label="PAN Number" value={isEditingProfile ? formData.pan : user.pan} editing={isEditingProfile} name="pan" onChange={handleChange} />
                                            {isEditingProfile ? (
                                                <>
                                                    <InfoRow icon={<FaUserCircle />} label="PF Number" value={formData.pf_number} editing={true} name="pf_number" onChange={handleChange} />
                                                    <InfoRow icon={<FaUserCircle />} label="UAN Number" value={formData.uan_number} editing={true} name="uan_number" onChange={handleChange} />
                                                </>
                                            ) : (
                                                <InfoRow icon={<FaUserCircle />} label="PF / UAN" value={`${user.pf_number || ''} ${user.uan_number ? `/ ${user.uan_number}` : ''}`} />
                                            )}

                                            {canViewDeductions && displayDeductions.length > 0 && (
                                                <div className="col-span-full mt-4">
                                                    <div className="p-5 rounded-3xl bg-rose-50/50 border border-transparent">
                                                        <p className="text-[9px] font-black text-rose-500 uppercase tracking-widest leading-none mb-3 flex items-center gap-2">
                                                            <FaMinusCircle size={10} /> Monthly Deductions
                                                        </p>
                                                        <div className="space-y-2 max-w-sm">
                                                            {displayDeductions.map((d, i) => (
                                                                <div key={i} className="flex justify-between items-center bg-white p-3 rounded-2xl shadow-sm border border-rose-100/50">
                                                                    <span className="text-xs font-black text-gray-600 uppercase tracking-widest">{d.label}</span>
                                                                    <span className="text-sm font-bold text-rose-600 tracking-tight">₹{Number(d.amount).toLocaleString()}</span>
                                                                </div>
                                                            ))}
                                                            <div className="flex justify-between items-center bg-rose-100 p-3 rounded-2xl !mt-3">
                                                                <span className="text-[10px] font-black text-rose-700 uppercase tracking-widest">Total Deductions</span>
                                                                <span className="text-sm font-black text-rose-700 tracking-tight">₹{displayDeductions.reduce((a, b) => a + Number(b.amount || 0), 0).toLocaleString()}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </>
                                    )}

                                    {/* Address */}
                                    <div className="col-span-full">
                                        <SectionHeader title="Location Details" />
                                    </div>
                                    <div className="col-span-full space-y-4">
                                        <div className="p-4 rounded-3xl bg-gray-50/50 border border-transparent">
                                            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest leading-none mb-3 flex items-center gap-2">
                                                <FaMapMarkerAlt size={10} className="text-sky-500" /> Communication Address
                                            </p>
                                            {isEditingProfile ? (
                                                <textarea name="communication_address" value={formData.communication_address} onChange={handleChange} rows={3} className={inputClass} />
                                            ) : (
                                                <p className="text-xs font-bold text-gray-700 leading-relaxed uppercase">{user.communication_address || 'Not Provided'}</p>
                                            )}
                                        </div>
                                        <div className="p-4 rounded-3xl bg-gray-50/50 border border-transparent">
                                            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest leading-none mb-3 flex items-center gap-2">
                                                <FaMapMarkerAlt size={10} className="text-indigo-500" /> Permanent Address
                                            </p>
                                            {isEditingProfile ? (
                                                <textarea name="permanent_address" value={formData.permanent_address} onChange={handleChange} rows={3} className={inputClass} />
                                            ) : (
                                                <p className="text-xs font-bold text-gray-700 leading-relaxed uppercase">{user.permanent_address || 'Not Provided'}</p>
                                            )}
                                        </div>
                                        <div className="flex justify-start">
                                            {isEditingProfile ? (
                                                <InfoRow icon={<FaMapMarkerAlt />} label="Pin Code" value={formData.pin_code} editing={true} name="pin_code" onChange={handleChange} />
                                            ) : (
                                                <div className="px-4 py-2 bg-gray-100 rounded-xl text-[9px] font-black text-gray-400 tracking-widest uppercase">
                                                    Pin Code: {user.pin_code || 'N/A'}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </>
                            )}

                            {/* Certificates Section (only for employees) */}
                            {isEmployeeProfile && canViewSensitiveInfo && (
                                <>
                                    <div className="col-span-full">
                                        <SectionHeader title="Certificates" />
                                    </div>
                                    <div className="col-span-full space-y-3">
                                        {certificates.map((cert) => (
                                            <div key={cert.id} className="flex items-center justify-between p-4 rounded-3xl bg-gray-50/50 hover:bg-white transition-all border border-transparent hover:border-gray-100 group">
                                                <div className="flex items-center gap-4">
                                                    <div className="h-10 w-10 rounded-2xl bg-white shadow-sm flex items-center justify-center text-sky-600 group-hover:rotate-12 transition-transform">
                                                        <FaCertificate />
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-black text-gray-800 tracking-tight">{cert.certificate_name}</p>
                                                        <p className="text-[9px] font-bold text-gray-400">{cert.file_name}</p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        onClick={() => viewCertificate(cert.id)}
                                                        className="h-9 w-9 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center hover:bg-sky-100 transition-colors"
                                                        title="View"
                                                    >
                                                        <FaEye size={12} />
                                                    </button>
                                                    <button
                                                        onClick={() => downloadCertificate(cert.id, cert.file_name)}
                                                        className="h-9 w-9 rounded-xl bg-green-50 text-green-600 flex items-center justify-center hover:bg-green-100 transition-colors"
                                                        title="Download"
                                                    >
                                                        <FaDownload size={12} />
                                                    </button>
                                                    {isOwnProfile && (
                                                        <button
                                                            onClick={() => handleCertDelete(cert.id)}
                                                            className="h-9 w-9 rounded-xl bg-red-50 text-red-500 flex items-center justify-center hover:bg-red-100 transition-colors"
                                                            title="Delete"
                                                        >
                                                            <FaTrash size={12} />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                        {certificates.length === 0 && (
                                            <p className="text-xs font-bold text-gray-400 text-center py-4">No certificates uploaded yet.</p>
                                        )}
                                        {isOwnProfile && !showCertForm && (
                                            <button
                                                onClick={() => setShowCertForm(true)}
                                                className="w-full flex items-center justify-center gap-2 p-3 rounded-2xl border-2 border-dashed border-sky-200 text-sky-600 text-[10px] font-black uppercase tracking-widest hover:bg-sky-50 transition-colors"
                                            >
                                                <FaPlus size={10} /> Add Certificate
                                            </button>
                                        )}
                                        {isOwnProfile && showCertForm && (
                                            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="p-5 rounded-3xl bg-white border border-sky-100 shadow-lg space-y-3">
                                                <p className="text-[9px] font-black text-sky-600 uppercase tracking-widest">Upload New Certificate</p>
                                                <input
                                                    type="text"
                                                    value={certName}
                                                    onChange={(e) => setCertName(e.target.value)}
                                                    placeholder="Certificate Name (e.g. Degree, SSLC)"
                                                    className={inputClass}
                                                />
                                                <input
                                                    type="file"
                                                    ref={certFileRef}
                                                    accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                                                    onChange={(e) => setCertFile(e.target.files[0])}
                                                    className="w-full text-[10px] font-bold file:mr-2 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-sky-50 file:text-sky-600 file:font-bold file:text-[10px] file:cursor-pointer"
                                                />
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={handleCertUpload}
                                                        disabled={uploadingCert}
                                                        className="flex-1 py-2.5 bg-sky-600 text-white rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-sky-700 disabled:opacity-50 flex items-center justify-center gap-2"
                                                    >
                                                        <FaPlus size={10} /> {uploadingCert ? 'Uploading...' : 'Upload'}
                                                    </button>
                                                    <button
                                                        onClick={() => { setShowCertForm(false); setCertName(''); setCertFile(null); }}
                                                        className="flex-1 py-2.5 bg-gray-100 text-gray-500 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-gray-200"
                                                    >
                                                        Cancel
                                                    </button>
                                                </div>
                                            </motion.div>
                                        )}
                                    </div>
                                </>
                            )}

                            {/* PIN Change Section */}
                            {isOwnProfile && (
                                <>
                                    <div className="col-span-full">
                                        <SectionHeader title="Security" />
                                    </div>
                                    <div className="col-span-full">
                                        {!isChangingPin ? (
                                            <button
                                                onClick={() => setIsChangingPin(true)}
                                                className="flex items-center gap-3 p-4 rounded-3xl bg-gray-50/50 hover:bg-white transition-all border border-transparent hover:border-gray-100 group w-full"
                                            >
                                                <div className="h-10 w-10 rounded-2xl bg-white shadow-sm flex items-center justify-center text-sky-600 group-hover:rotate-12 transition-transform">
                                                    <FaKey />
                                                </div>
                                                <div className="text-left">
                                                    <p className="text-sm font-black text-gray-800 tracking-tight">Change PIN</p>
                                                    <p className="text-[9px] font-bold text-gray-400">Update your login PIN</p>
                                                </div>
                                            </button>
                                        ) : (
                                            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="p-5 rounded-3xl bg-white border border-sky-100 shadow-lg space-y-3">
                                                <p className="text-[9px] font-black text-sky-600 uppercase tracking-widest">Change Your PIN</p>
                                                <input
                                                    type="password"
                                                    value={pinData.newPin}
                                                    onChange={(e) => setPinData({ ...pinData, newPin: e.target.value })}
                                                    placeholder="New PIN"
                                                    className={inputClass}
                                                />
                                                <input
                                                    type="password"
                                                    value={pinData.confirmPin}
                                                    onChange={(e) => setPinData({ ...pinData, confirmPin: e.target.value })}
                                                    placeholder="Confirm New PIN"
                                                    className={inputClass}
                                                />
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={handlePinChange}
                                                        disabled={loading}
                                                        className="flex-1 py-2.5 bg-sky-600 text-white rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-sky-700 disabled:opacity-50"
                                                    >
                                                        {loading ? 'Updating...' : 'Update PIN'}
                                                    </button>
                                                    <button
                                                        onClick={() => { setIsChangingPin(false); setPinData({ currentPin: '', newPin: '', confirmPin: '' }); }}
                                                        className="flex-1 py-2.5 bg-gray-100 text-gray-500 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-gray-200"
                                                    >
                                                        Cancel
                                                    </button>
                                                </div>
                                            </motion.div>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </motion.div>
        </div>
    );
};

export default ProfileViewer;
