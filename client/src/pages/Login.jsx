import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import Swal from 'sweetalert2';
import api from '../utils/api';
import { LogIn, User, Lock, Cpu, Database, Shield, Globe, Activity, Cloud } from 'lucide-react';
import { motion } from 'framer-motion';

const FloatingIcon = ({ icon: Icon, delay, x, y, size = 32 }) => (
    <motion.div
        initial={{ opacity: 0, scale: 0 }}
        animate={{
            opacity: [0.1, 0.4, 0.1],
            translateX: [0, 20, -20, 0],
            translateY: [0, -40, 20, 0],
            rotate: [0, 15, -15, 0],
            scale: [1, 1.1, 1]
        }}
        transition={{
            duration: 8,
            repeat: Infinity,
            delay: delay,
            ease: "easeInOut"
        }}
        className="absolute pointer-events-none z-0"
        style={{ left: `${x}%`, top: `${y}%`, color: 'rgba(14, 165, 233, 0.25)' }}
    >
        <Icon size={size} strokeWidth={1.5} />
    </motion.div>
);

const Login = () => {
    const [empId, setEmpId] = useState('');
    const [pin, setPin] = useState('');
    const [loading, setLoading] = useState(false);
    const [step, setStep] = useState('id'); // 'id' or 'pin'
    const [userName, setUserName] = useState('');
    const { login } = useAuth();
    const navigate = useNavigate();
    const [userRole, setUserRole] = useState('');
    const [expectedPinLength, setExpectedPinLength] = useState(4); // Default to 4

    const [pinAttempts, setPinAttempts] = useState(() => Number(localStorage.getItem('pin_attempts')) || 0);
    const [mgmtAttempts, setMgmtAttempts] = useState(() => Number(localStorage.getItem('mgmt_attempts')) || 0);

    const [lockoutText, setLockoutText] = useState('');
    const [isPinLocked, setIsPinLocked] = useState(false);
    const [isMgmtLocked, setIsMgmtLocked] = useState(false);

    useEffect(() => {
        const timer = setInterval(() => {
            const types = ['pin', 'mgmt'];
            let activeLockout = false;
            
            for (const type of types) {
                const lockUntil = Number(localStorage.getItem(`${type}_lock_until`));
                if (lockUntil && lockUntil > Date.now()) {
                    const timeLeft = lockUntil - Date.now();
                    const totalSeconds = Math.ceil(timeLeft / 1000);
                    const minutes = Math.floor(totalSeconds / 60);
                    const seconds = totalSeconds % 60;
                    const hours = Math.floor(minutes / 60);

                    let msg = `${seconds}s`;
                    if (minutes > 0) msg = `${minutes}m ${seconds}s`;
                    if (hours > 0) msg = `${hours}h ${minutes % 60}m ${seconds}s`;
                    
                    setLockoutText(msg);
                    if (type === 'pin') setIsPinLocked(true);
                    if (type === 'mgmt') setIsMgmtLocked(true);
                    activeLockout = true;
                    break;
                } else if (lockUntil) {
                    localStorage.removeItem(`${type}_lock_until`);
                    localStorage.setItem(`${type}_attempts`, '0');
                    if (type === 'pin') { setPinAttempts(0); setIsPinLocked(false); }
                    if (type === 'mgmt') { setMgmtAttempts(0); setIsMgmtLocked(false); }
                }
            }
            if (!activeLockout) {
                setLockoutText('');
                setIsPinLocked(false);
                setIsMgmtLocked(false);
            }
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    const checkLockout = (type) => {
        const lockUntil = Number(localStorage.getItem(`${type}_lock_until`));
        if (lockUntil && lockUntil > Date.now()) {
            Swal.fire({
                icon: 'warning',
                title: 'Security Lockout',
                text: `Access is temporarily restricted. Please wait for the countdown on the screen.`,
                confirmButtonColor: '#2563eb'
            });
            return true;
        }
        return false;
    };

    const handleCheckId = async (e) => {
        if (e) e.preventDefault();
        if (!empId.trim()) return;

        setLoading(true);
        try {
            const { data } = await api.post('/auth/check-id', { emp_id: empId.trim() });
            if (data.exists) {
                setUserName(data.name);
                setUserRole(data.role || '');
                setStep('pin');
                setExpectedPinLength(data.pin_length || 4);
            }
        } catch (error) {
            console.error('❌ Check ID error:', error);
            Swal.fire({
                icon: 'error',
                title: 'Invalid ID',
                text: 'Employee ID not found.',
                confirmButtonColor: '#2563eb'
            });
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e, manualPin = null) => {
        if (e) e.preventDefault();
        const finalPin = manualPin !== null ? manualPin : pin;
        if (!finalPin.trim()) return;
        
        const lockoutType = userRole === 'management' ? 'mgmt' : 'pin';
        if (checkLockout(lockoutType)) return;

        // Validation for length
        if (expectedPinLength === '4or6') {
            if (finalPin.length !== 4 && finalPin.length !== 6) return;
        } else if (finalPin.length < Number(expectedPinLength)) {
            return;
        }

        setLoading(true);
        try {
            console.log(`🔐 Attempting ${userRole} login with:`, { emp_id: empId, pin: '***' });
            const data = await login(empId.trim(), finalPin.trim(), userRole);
            console.log('✅ Login successful:', data);
            
            // Clear attempts on success
            localStorage.setItem(`${lockoutType}_attempts`, '0');
            if (lockoutType === 'mgmt') setMgmtAttempts(0);
            else setPinAttempts(0);

            // Show success message
            Swal.fire({
                icon: 'success',
                title: 'Welcome!',
                text: `Logged in as ${data.role}`,
                timer: 1000,
                showConfirmButton: false,
                background: '#fff',
                color: '#1e3a8a',
                allowOutsideClick: false,
                allowEscapeKey: false
            });
            
            // Navigate after a brief delay
            setTimeout(() => {
                const routes = {
                    'admin': '/admin',
                    'principal': '/principal',
                    'hod': '/hod',
                    'staff': '/staff',
                    'management': '/management'
                };
                const route = routes[data.role] || '/';
                navigate(route, { replace: true });
                setLoading(false);
                setEmpId('');
                setPin('');
            }, 600);
            
        } catch (error) {
            console.error('❌ Login error:', error);
            setLoading(false);
            
            const curAttempts = Number(localStorage.getItem(`${lockoutType}_attempts`)) || 0;
            const newAttempts = curAttempts + 1;
            
            if (lockoutType === 'mgmt') {
                setMgmtAttempts(newAttempts);
                localStorage.setItem('mgmt_attempts', String(newAttempts));
            } else {
                setPinAttempts(newAttempts);
                localStorage.setItem('pin_attempts', String(newAttempts));
            }

            let errorMessage = `Invalid Security PIN. ${3 - newAttempts} attempts remaining.`;
            
            if (newAttempts >= 3) {
                // Determine lock duration (Standardizing to 1 hour for all roles to be consistent with security policy)
                const duration = 60 * 60 * 1000; 
                const lockUntil = Date.now() + duration;
                localStorage.setItem(`${lockoutType}_lock_until`, String(lockUntil));
                errorMessage = `Too many failed attempts. Access locked for 1 hour.`;
            } else if (error.response?.data?.message) {
                // Use server message unless it's the specific management PIN error, then keep it consistent
                errorMessage = error.response.data.message.includes('management') 
                    ? `Invalid Security PIN. ${3 - newAttempts} attempts remaining.`
                    : `${error.response.data.message}. ${3 - newAttempts} attempts remaining.`;
            }
            
            Swal.fire({
                icon: 'error',
                title: 'Login Failed',
                text: errorMessage,
                confirmButtonColor: '#2563eb'
            });
            setPin('');
        }
    };

    // Auto-submit pin when it reaches the expected length
    const handlePinChange = (e) => {
        const val = e.target.value;
        const onlyNums = val.replace(/[^0-9]/g, '');
        setPin(onlyNums);
        
        if (expectedPinLength === '4or6') {
            if (onlyNums.length === 4) {
                 handleSubmit(null, onlyNums); // Try 4 first
            } else if (onlyNums.length === 6) {
                 handleSubmit(null, onlyNums); // Try 6
            }
        } else if (onlyNums.length === Number(expectedPinLength)) {
            handleSubmit(null, onlyNums);
        }
    };



    return (
        <div
            className="min-h-screen w-full flex items-center justify-center p-4 relative overflow-hidden"
        >
            {/* Full-screen background image */}
            <div
                className="absolute inset-0 w-full h-full"
                style={{
                    backgroundImage: 'url(/ppg-bg.jpg)',
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    backgroundRepeat: 'no-repeat',
                }}
            />
            {/* Dark overlay for readability */}
            <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" />

            {/* Technology Floating Icons Background */}
            <FloatingIcon icon={Cpu} delay={0} x={10} y={15} size={40} />
            <FloatingIcon icon={Database} delay={2} x={85} y={10} size={36} />
            <FloatingIcon icon={Shield} delay={4} x={12} y={80} size={32} />
            <FloatingIcon icon={Globe} delay={1} x={78} y={85} size={44} />
            <FloatingIcon icon={Activity} delay={3} x={50} y={5} size={32} />
            <FloatingIcon icon={Cloud} delay={5} x={42} y={90} size={44} />
            <FloatingIcon icon={Cpu} delay={1.5} x={90} y={55} size={28} />
            <FloatingIcon icon={Database} delay={3.5} x={5} y={50} size={36} />
            <FloatingIcon icon={Shield} delay={2.5} x={70} y={40} size={30} />
            <FloatingIcon icon={Cloud} delay={4.5} x={25} y={35} size={38} />

            {/* Login form */}
            <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
                className="relative z-10 w-full max-w-md px-8 py-10 rounded-3xl"
                style={{ background: 'rgba(255,255,255,0.12)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.18)' }}
            >
                {/* Logo + Branding */}
                <div className="text-center mb-10">
                    <motion.div
                        whileHover={{ rotate: 5, scale: 1.05 }}
                        transition={{ type: 'spring', stiffness: 300 }}
                        className="w-[88px] h-[88px] mx-auto mb-6 flex items-center justify-center drop-shadow-xl"
                        style={{ isolation: 'isolate' }}
                    >
                        <img src="/ppg-logo.png" alt="PPG Institute of Technology" className="w-full h-full object-contain" style={{ imageRendering: 'high-quality', display: 'block' }} />
                    </motion.div>

                    <h1 className="text-3xl max-sm:text-4xl font-black text-white tracking-tight leading-tight max-sm:leading-[1.05]">
                        PPG <span className="text-transparent bg-clip-text" style={{ backgroundImage: 'linear-gradient(135deg, #60a5fa, #22d3ee)' }}>iTech - HUB</span>
                    </h1>
                    <p className="text-[7.5px] max-sm:text-[6px] font-black text-sky-200 uppercase tracking-[0.35em] max-sm:tracking-[0.2em] mt-2 whitespace-nowrap max-sm:whitespace-normal text-center mx-auto max-sm:px-2">
                        Enterprise & Attendance Management System
                    </p>
                </div>

                {/* Divider */}
                <div className="flex items-center gap-3 mb-8">
                    <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/30 to-transparent" />
                    <span className="text-[9px] font-black text-sky-300 uppercase tracking-widest">
                        {step === 'id' ? 'Employee Verification' : 'Security Access'}
                    </span>
                    <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/30 to-transparent" />
                </div>

                {/* Form */}
                <form onSubmit={step === 'id' ? handleCheckId : handleSubmit} className="space-y-5">
                    
                    {step === 'id' ? (
                        <motion.div 
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="space-y-1.5"
                        >
                            <label className="text-[10px] font-black text-sky-200 uppercase tracking-widest block">
                                Employee ID
                            </label>
                            <div className="relative group">
                                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                    <User
                                        size={16}
                                        className="text-gray-300 group-focus-within:text-blue-500 transition-colors duration-200"
                                    />
                                </div>
                                <input
                                    type="text"
                                    value={empId}
                                    onChange={(e) => setEmpId(e.target.value)}
                                    placeholder="Enter your Employee ID"
                                    required
                                    autoFocus
                                    className="w-full pl-11 pr-5 py-[14px] rounded-xl text-sm font-semibold text-gray-700 outline-none transition-all duration-200 placeholder:text-gray-300 placeholder:font-normal bg-white/70"
                                    style={{ border: '1.5px solid #e2e8f0' }}
                                />
                            </div>
                            <p className="text-[9px] text-sky-300/70 italic text-center mt-2">Press Enter to continue</p>
                        </motion.div>
                    ) : (
                        <motion.div 
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="space-y-4"
                        >
                            <div className="text-center">
                                <p className="text-white/60 text-[10px] uppercase tracking-widest font-bold mb-1">Welcome back,</p>
                                <p className="text-white text-lg font-black">{userName}</p>
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-sky-200 uppercase tracking-widest block">
                                    Security PIN
                                </label>
                                <div className="relative group">
                                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                        <Lock
                                            size={16}
                                            className="text-gray-300 group-focus-within:text-blue-500 transition-colors duration-200"
                                        />
                                    </div>
                                    <input
                                        type="password"
                                        value={pin}
                                        onChange={handlePinChange}
                                        placeholder={isPinLocked || isMgmtLocked ? "Disabled" : "Enter PIN"}
                                        disabled={isPinLocked || isMgmtLocked}
                                        required
                                        autoFocus
                                        maxLength={6}
                                        className={`w-full pl-11 pr-5 py-[14px] rounded-xl text-sm font-semibold text-gray-700 outline-none transition-all duration-200 placeholder:text-gray-300 placeholder:font-normal text-center tracking-[1em] ${isPinLocked || isMgmtLocked ? 'opacity-50 cursor-not-allowed bg-gray-100' : 'bg-white/70'}`}
                                        style={{ border: '1.5px solid #e2e8f0' }}
                                    />
                                </div>
                                {(isPinLocked || isMgmtLocked) && (
                                     <motion.p 
                                        animate={{ scale: [1, 1.05, 1] }} 
                                        transition={{ repeat: Infinity, duration: 2 }}
                                        className="text-[11px] font-black text-red-400 uppercase text-center mt-3 tracking-widest shadow-sm"
                                    >
                                        PIN Lock: {lockoutText}
                                    </motion.p>
                                )}
                            </div>

                            <button 
                                type="button" 
                                disabled={isPinLocked || isMgmtLocked}
                                onClick={() => { setStep('id'); setPin(''); }}
                                className={`w-full text-[9px] font-black uppercase tracking-widest ${isPinLocked || isMgmtLocked ? 'text-gray-500/50' : 'text-sky-400 hover:text-sky-300'}`}
                            >
                                Not you? Use another ID
                            </button>
                        </motion.div>
                    )}

                    {loading && !lockoutText && (
                        <div className="flex justify-center pt-2">
                            <span className="h-5 w-5 border-2 border-sky-400/30 border-t-sky-400 rounded-full animate-spin" />
                        </div>
                    )}
                </form>

                {/* Management Access */}
                <div className="mt-8 text-center">
                    <div className="h-px w-12 bg-white/20 mx-auto mb-4" />
                    <motion.button
                        type="button"
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        disabled={isMgmtLocked}
                        onClick={async () => {
                            if (checkLockout('mgmt')) return;
                            setLoading(true);
                            try {
                                const { data } = await api.post('/auth/check-id', { emp_id: 'Management' });
                                if (data.exists) {
                                    setEmpId('Management');
                                    setUserName(data.name);
                                    setUserRole('management');
                                    setStep('pin');
                                    setExpectedPinLength(data.pin_length || 4);
                                } else {
                                    // Fallback if record not found
                                    setEmpId('Management');
                                    setUserName('Management');
                                    setUserRole('management');
                                    setStep('pin');
                                    setExpectedPinLength(4);
                                }
                            } catch (err) {
                                // Regular fallback
                                setEmpId('Management');
                                setUserName('Management');
                                setUserRole('management');
                                setStep('pin');
                                setExpectedPinLength(4);
                            } finally {
                                setLoading(false);
                            }
                        }}
                        className={`text-[10px] font-black uppercase tracking-[0.3em] transition-colors ${isMgmtLocked ? 'text-red-400 animate-pulse' : 'text-orange-400/60 hover:text-orange-400 cursor-pointer'}`}
                    >
                        {isMgmtLocked ? `MANAGEMENT LOCKED (${lockoutText})` : 'MANAGEMENT'}
                    </motion.button>
                </div>

                {/* Footer */}
                <div className="mt-6 text-center">
                    <a
                        href="https://zorvian-technologies.vercel.app"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[9px] font-black text-white/30 hover:text-sky-300/50 transition-colors uppercase tracking-widest whitespace-nowrap"
                    >
                        Developed By ZORVIAN TECHNOLOGIES
                    </a>
                </div>
            </motion.div>
        </div>
    );
};

export default Login;
