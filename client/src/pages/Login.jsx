import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import Swal from 'sweetalert2';
import { Cpu, Database, Shield, Globe, Activity, Cloud, Mail, Lock, LogIn, ArrowRight } from 'lucide-react';
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
    const [loading, setLoading] = useState(false);
    const [email, setEmail] = useState('');
    const [pin, setPin] = useState('');
    const { login, googleLogin } = useAuth();
    const navigate = useNavigate();

    const handleRedirect = (role) => {
        const routes = {
            'admin': '/admin',
            'principal': '/principal',
            'hod': '/hod',
            'staff': '/staff',
            'accounts': '/accounts',
            'management': '/management'
        };
        const route = routes[role] || '/';
        navigate(route, { replace: true });
    };

    const handleEmailSignIn = async (e) => {
        e.preventDefault();
        const trimmedEmail = email.trim();
        if (!trimmedEmail) {
            Swal.fire({
                icon: 'warning',
                title: 'Email Required',
                text: 'Please enter your registered employee email address.',
                confirmButtonColor: '#2563eb'
            });
            return;
        }

        setLoading(true);
        try {
            // First attempt login via credentials endpoint (email + optional PIN)
            const data = await login(trimmedEmail, pin.trim());
            
            Swal.fire({
                icon: 'success',
                title: 'Welcome Back!',
                text: `Logged in as ${data.name} (${data.role.toUpperCase()})`,
                timer: 1500,
                showConfirmButton: false,
                background: '#fff',
                color: '#1e3a8a'
            });

            setTimeout(() => {
                handleRedirect(data.role);
                setLoading(false);
            }, 600);
        } catch (error) {
            console.error('Email login error:', error);
            setLoading(false);
            const errorMessage = error.response?.data?.message || 'Access Denied: Email address is not registered in database.';
            Swal.fire({
                icon: 'error',
                title: 'Authentication Failed',
                text: errorMessage,
                confirmButtonColor: '#2563eb'
            });
        }
    };

    const processGoogleAuthPayload = async (payload) => {
        setLoading(true);
        try {
            const data = await googleLogin(payload);
            
            Swal.fire({
                icon: 'success',
                title: 'Welcome Back!',
                text: `Logged in as ${data.name} (${data.role.toUpperCase()})`,
                timer: 1500,
                showConfirmButton: false,
                background: '#fff',
                color: '#1e3a8a'
            });

            setTimeout(() => {
                handleRedirect(data.role);
                setLoading(false);
            }, 600);
        } catch (error) {
            console.error('Google login error:', error);
            setLoading(false);
            const errorMessage = error.response?.data?.message || 'This email is not registered. Please contact the administrator.';
            Swal.fire({
                icon: 'error',
                title: 'Access Denied',
                text: errorMessage,
                confirmButtonColor: '#2563eb'
            });
        }
    };

    const handleGoogleSignIn = async () => {
        // 1. Try Google Identity Services GIS if loaded
        if (window.google?.accounts?.id) {
            try {
                window.google.accounts.id.initialize({
                    client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID || '1088593849123-placeholder.apps.googleusercontent.com',
                    callback: (response) => {
                        if (response.credential) {
                            processGoogleAuthPayload({ credential: response.credential });
                        }
                    }
                });
                window.google.accounts.id.prompt();
            } catch (err) {
                console.warn('GIS Prompt initialized fallback:', err);
            }
        }

        // 2. If email is already typed in the input field, use it directly
        let targetEmail = email.trim();

        if (!targetEmail) {
            const { value: selectedEmail } = await Swal.fire({
                title: `
                    <div class="flex flex-col items-center gap-2">
                        <svg class="w-8 h-8" viewBox="0 0 24 24">
                            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                        </svg>
                        <span class="text-xl font-bold text-gray-800">Select Google Account</span>
                    </div>
                `,
                html: `
                    <p class="text-xs text-gray-500 mb-3">Select a registered Google email address to proceed:</p>
                    <div class="flex flex-col gap-2 mb-3 text-left">
                        <button type="button" id="btn-quick-admin" class="w-full text-left p-3 rounded-xl border border-gray-200 hover:bg-blue-50 transition flex items-center justify-between cursor-pointer group">
                            <div>
                                <div class="text-xs font-bold text-gray-800 group-hover:text-blue-600">zorviantechnologies@gmail.com</div>
                                <div class="text-[10px] text-blue-600 font-semibold uppercase">Super Admin Account</div>
                            </div>
                            <span class="text-xs text-blue-600 font-bold">Select →</span>
                        </button>
                    </div>
                `,
                input: 'email',
                inputValue: '',
                inputPlaceholder: 'official.email@ppg.edu.in',
                showCancelButton: true,
                confirmButtonText: 'Continue with Google',
                confirmButtonColor: '#2563eb',
                cancelButtonColor: '#64748b',
                customClass: {
                    popup: 'rounded-2xl shadow-2xl border border-gray-100',
                    confirmButton: 'font-semibold px-6 py-2.5 rounded-xl',
                    cancelButton: 'font-semibold px-6 py-2.5 rounded-xl'
                },
                didOpen: () => {
                    const btnAdmin = document.getElementById('btn-quick-admin');
                    if (btnAdmin) {
                        btnAdmin.addEventListener('click', () => {
                            const input = Swal.getInput();
                            if (input) input.value = 'zorviantechnologies@gmail.com';
                            Swal.clickConfirm();
                        });
                    }
                },
                inputValidator: (value) => {
                    if (!value || !value.includes('@')) {
                        return 'Please enter a valid Google / employee email address!';
                    }
                }
            });

            if (!selectedEmail) return;
            targetEmail = selectedEmail.trim();
        }

        processGoogleAuthPayload({ email: targetEmail });
    };

    return (
        <div className="min-h-screen w-full flex items-center justify-center p-4 relative overflow-hidden">
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

            {/* Login container */}
            <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
                className="relative z-10 w-full max-w-md px-8 py-10 rounded-3xl"
                style={{ background: 'rgba(255,255,255,0.12)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.18)' }}
            >
                {/* Logo + Branding */}
                <div className="text-center mb-8">
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

                {/* Main Employee Email Login Form */}
                <form onSubmit={handleEmailSignIn} className="space-y-4">
                    <div>
                        <label htmlFor="email" className="block text-[11px] font-bold text-sky-100 uppercase tracking-wider mb-1 px-1">
                            Employee Email Address
                        </label>
                        <div className="relative flex items-center">
                            <Mail className="absolute left-3.5 text-sky-300 pointer-events-none" size={18} />
                            <input
                                id="email"
                                name="email"
                                type="email"
                                required
                                autoComplete="email"
                                inputMode="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="official.email@ppg.edu.in"
                                className="w-full py-3.5 pl-10 pr-4 rounded-xl bg-white/10 text-white placeholder-white/40 border border-white/20 focus:outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-400/30 text-sm font-medium transition-all"
                            />
                        </div>
                    </div>

                    <motion.button
                        type="submit"
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        disabled={loading}
                        className="w-full py-3.5 px-6 mt-2 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 text-white font-bold text-sm shadow-xl flex items-center justify-center gap-2 hover:from-sky-400 hover:to-blue-500 transition-all duration-200 cursor-pointer border border-sky-400/30"
                    >
                        {loading ? (
                            <span className="h-5 w-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                            <>
                                <LogIn size={18} />
                                <span>Sign In to Dashboard</span>
                                <ArrowRight size={16} className="ml-auto" />
                            </>
                        )}
                    </motion.button>
                </form>

                {/* Divider */}
                <div className="flex items-center gap-3 my-6">
                    <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/30 to-transparent" />
                    <span className="text-[9px] font-black text-sky-300 uppercase tracking-widest">
                        Or Single Sign-On
                    </span>
                    <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/30 to-transparent" />
                </div>

                {/* Google SSO Button */}
                <div className="space-y-4">
                    <motion.button
                        type="button"
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        disabled={loading}
                        onClick={handleGoogleSignIn}
                        className="w-full py-3 px-6 rounded-xl bg-white/90 text-gray-800 font-bold text-xs shadow-lg flex items-center justify-center gap-3 hover:bg-white transition-all duration-200 cursor-pointer border border-white/50"
                    >
                        <svg className="w-4 h-4" viewBox="0 0 24 24">
                            <path
                                fill="#4285F4"
                                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                            />
                            <path
                                fill="#34A853"
                                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                            />
                            <path
                                fill="#FBBC05"
                                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                            />
                            <path
                                fill="#EA4335"
                                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                            />
                        </svg>
                        <span className="tracking-wide">Continue with Google Account</span>
                    </motion.button>

                    <p className="text-[10px] text-sky-200/80 text-center font-medium leading-relaxed px-2">
                        🔒 Authenticates against employee email registered in database.
                    </p>
                </div>

                {/* Footer */}
                <div className="mt-8 text-center">
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
