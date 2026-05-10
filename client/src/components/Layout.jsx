import { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import AiAssistant from './AiAssistant';
import { useAuth } from '../context/AuthContext';
import { AnimatePresence, motion } from 'framer-motion';
import Swal from 'sweetalert2';
import api from '../utils/api';

const Layout = ({ children }) => {
    const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth < 1024);
    const [isAiOpen, setIsAiOpen] = useState(() => localStorage.getItem('isAiOpen') === 'true');
    const [isAiMinimized, setIsAiMinimized] = useState(false);
    const { user, loading } = useAuth();
    const location = useLocation();

    const isManagement = location.pathname.startsWith('/management');
    const effectiveRole = isManagement ? 'management' : (user?.role || 'staff');

    useEffect(() => {
        const handleCloseSidebar = () => {
            if (window.innerWidth >= 1024) {
                setSidebarOpen(false);
            }
            setIsAiOpen(false);
            window.dispatchEvent(new CustomEvent('AI_STATUS', { detail: { open: false } }));
        };
        const handleToggleAi = () => {
            setIsAiOpen(prev => {
                const newState = !prev;
                window.dispatchEvent(new CustomEvent('AI_STATUS', { detail: { open: newState } }));
                return newState;
            });
            setIsAiMinimized(false);
        };
        const handleMinimizeAi = (e) => {
            if (window.innerWidth < 1024) setIsAiMinimized(e.detail !== undefined ? e.detail : true);
        };
        
        window.addEventListener('closeSidebar', handleCloseSidebar);
        window.addEventListener('TOGGLE_AI_ASSISTANT', handleToggleAi);
        window.addEventListener('AI_MINIMIZE', handleMinimizeAi);
        
        // Initial sync of state
        window.dispatchEvent(new CustomEvent('AI_STATUS', { detail: { open: localStorage.getItem('isAiOpen') === 'true' } }));

        return () => {
            window.removeEventListener('closeSidebar', handleCloseSidebar);
            window.removeEventListener('TOGGLE_AI_ASSISTANT', handleToggleAi);
            window.removeEventListener('AI_MINIMIZE', handleMinimizeAi);
        };
    }, []);

    useEffect(() => {
        const syncSidebarByViewport = () => {
            if (window.innerWidth < 1024) {
                setSidebarOpen(true);
            }
        };

        syncSidebarByViewport();
        window.addEventListener('resize', syncSidebarByViewport);

        return () => window.removeEventListener('resize', syncSidebarByViewport);
    }, []);

    // Persist AI state and notify app
    useEffect(() => {
        localStorage.setItem('isAiOpen', isAiOpen.toString());
        window.dispatchEvent(new CustomEvent('AI_STATUS', { detail: { open: isAiOpen } }));
    }, [isAiOpen]);

    // Scroll to top and handle autoPrint
    useEffect(() => {
        const mainElement = document.querySelector('main');
        if (mainElement) {
            if (location.hash) {
                const targetId = location.hash.substring(1);
                setTimeout(() => {
                    const targetElement = document.getElementById(targetId);
                    if (targetElement) {
                        mainElement.scrollTo({ top: targetElement.offsetTop - 20, behavior: 'smooth' });
                    }
                }, 400);
            } else {
                mainElement.scrollTo({ top: 0, behavior: 'smooth' });
            }
        }

        // Perfect setup: Handle direct print request from AI Assistant by obtaining a trusted click gesture
        if (location.state?.autoPrint) {
            console.log('Auto-printing triggered via AI Assistant...');
            const timer = setTimeout(() => {
                // Try to find the page's native custom Print button
                const printBtn = Array.from(document.querySelectorAll('button')).find(btn => {
                    const titleText = String(btn.title || '').toLowerCase();
                    const bodyText = String(btn.textContent || '').toLowerCase();
                    return titleText.includes('print') || titleText.includes('report') || bodyText.includes('print') || bodyText.includes('report');
                });
                
                if (printBtn) {
                    printBtn.click();
                } else {
                    console.log('No custom report button found, falling back to window.print()...');
                    window.print();
                }

                // Clear state to prevent re-printing on manual refresh
                window.history.replaceState({}, document.title);
            }, 1200); // 1.2s delay to allow content to finish rendering
            return () => clearTimeout(timer);
        }
    }, [location.pathname, location.state]);

    const [now, setNow] = useState(new Date());

    useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), 60000);
        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        if (!user?.emp_id) return;
        const empId = String(user.emp_id).trim();
        if (empId === '5001' || empId === '5045') return;

        const sessionKey = `feedback_prompt_shown_${empId}`;
        if (sessionStorage.getItem(sessionKey) === '1') return;

        const timer = setTimeout(async () => {
            const { value } = await Swal.fire({
                title: 'Share Your App Feedback',
                html: `
                    <div style="text-align:left; margin-top: 4px;">
                        <textarea id="feedback_message" class="swal2-textarea" placeholder="Type your feedback here..." style="margin:0;"></textarea>
                    </div>
                `,
                confirmButtonText: 'Submit Feedback',
                showCancelButton: true,
                cancelButtonText: 'Later',
                confirmButtonColor: '#0284c7',
                preConfirm: () => {
                    const message = document.getElementById('feedback_message')?.value?.trim();
                    if (!message) {
                        Swal.showValidationMessage('Please enter feedback message.');
                        return null;
                    }
                    return { message };
                }
            });

            if (value?.message) {
                try {
                    await api.post('/feedback', value);
                    Swal.fire({ icon: 'success', title: 'Thank you!', text: 'Your feedback was submitted.', timer: 1400, showConfirmButton: false });
                } catch (error) {
                    Swal.fire('Error', error?.response?.data?.message || 'Failed to submit feedback.', 'error');
                }
            }

            sessionStorage.setItem(sessionKey, '1');
        }, 2200);

        return () => clearTimeout(timer);
    }, [user?.emp_id]);

    if (loading && !isManagement) return <div className="h-screen w-screen flex items-center justify-center bg-sky-50">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-sky-600"></div>
    </div>;

    return (
        <div className="flex flex-col h-screen bg-transparent overflow-hidden font-sans">
            {/* Full-width Top Header */}
            <Header />

            <div className="flex flex-1 overflow-hidden relative">
                {/* Sidebar */}
                <Sidebar
                    userRole={effectiveRole}
                    isOpen={sidebarOpen}
                    onToggle={() => setSidebarOpen(!sidebarOpen)}
                    onClose={() => {
                        if (window.innerWidth >= 1024) {
                            setSidebarOpen(false);
                        }
                    }}
                />

                {/* Backdrop for mobile */}
                {sidebarOpen && window.innerWidth >= 1024 && (
                    <div
                        className="fixed inset-0 bg-sky-900/20 backdrop-blur-sm lg:hidden z-30 transition-all duration-500"
                        onClick={() => setSidebarOpen(false)}
                        style={{ top: '72px' }}
                    />
                )}

                {/* Split Logic: 75% Content / 25% AI Assistant */}
                <div className="flex flex-1 overflow-hidden transition-all duration-500 ease-in-out ml-0 lg:ml-20">
                    <main 
                        className={`overflow-x-hidden ${sidebarOpen && window.innerWidth >= 1024 ? 'overflow-y-hidden lg:overflow-y-auto' : 'overflow-y-auto'} px-3 pt-[84px] pb-24 sm:px-4 sm:pt-[88px] sm:pb-24 lg:p-8 no-scrollbar scroll-smooth transition-all duration-500 ease-in-out ${
                            isAiOpen && window.innerWidth >= 1024 ? 'lg:w-3/4' : 'w-full'
                        }`}
                    >
                        <div className="max-w-7xl mx-auto space-y-6 animate-fade-in relative z-10">
                            {/* Dashboard Clock */}
                            {['/admin', '/principal', '/hod', '/staff', '/management'].includes(location.pathname) && (
                                <div className="no-print hidden md:flex absolute top-0 right-0 items-center gap-4 py-2 px-4 bg-white/50 backdrop-blur-sm rounded-2xl border border-white/50 shadow-sm transition-all hover:bg-white/80">
                                    <div className="text-right">
                                        <p className="text-[9px] font-black text-sky-600 uppercase tracking-widest leading-none mb-1">
                                            {now.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}
                                        </p>
                                        <p className="text-sm font-black text-gray-800 tracking-tight leading-none">
                                            {now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}
                                        </p>
                                    </div>
                                    <div className="h-8 w-8 bg-sky-50 rounded-xl flex items-center justify-center text-sky-500 shadow-inner">
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                    </div>
                                </div>
                            )}

                            {/* Print Branding */}
                            <div className="print-branding-header hidden print:block mb-8 border-b-4 border-black pb-4 text-black">
                                <div className="flex justify-between items-end">
                                    <div>
                                        <p className="text-[10px] font-black uppercase tracking-[0.3em]">Staff Management System</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-sm font-black text-blue-900" style={{ letterSpacing: '0.5px' }}>PPG EMP HUB</p>
                                        <p className="text-[9px] font-bold text-gray-500">{new Date().toLocaleString('en-GB')}</p>
                                    </div>
                                </div>
                                <div className="mt-4 pt-4 border-t border-gray-100 flex justify-between items-center text-[9px] font-bold uppercase tracking-widest">
                                    <span>Generated by: {isManagement ? 'Management' : user?.name}</span>
                                    <span>Role Authority: {effectiveRole}</span>
                                </div>
                            </div>

                            {children}
                        </div>
                    </main>

                    {/* Right-side AI Assistant (Desktop 25% / Mobile Overlay) */}
                    <AnimatePresence>
                        {isAiOpen && (
                            <motion.div
                                initial={window.innerWidth >= 1024 ? { x: '100%' } : { opacity: 0, y: 50 }}
                                animate={window.innerWidth >= 1024 ? { x: 0 } : { opacity: 1, y: 0 }}
                                exit={window.innerWidth >= 1024 ? { x: '100%' } : { opacity: 0, y: 50 }}
                                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                                className={`z-40 border border-gray-100 bg-white shadow-2xl overflow-hidden transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${
                                    window.innerWidth >= 1024 
                                    ? 'static w-1/4 h-full border-l' 
                                    : `fixed right-4 rounded-[32px] w-[calc(100vw-32px)] ${isAiMinimized ? 'bottom-4 h-[25vh] cursor-pointer hover:shadow-sky-300 border-sky-300 ring-4 ring-sky-50' : 'bottom-4 h-[600px] border-t'}`
                                }`}
                                onClick={() => isAiMinimized && setIsAiMinimized(false)}
                            >
                                <div className={`relative h-full w-full transition-all duration-300 ${isAiMinimized ? 'scale-95 opacity-50 pointer-events-none' : 'scale-100 opacity-100 blur-0'}`}>
                                    <AiAssistant isSidebar={true} userRole={effectiveRole} isAiMinimized={isAiMinimized} onClose={() => {
                                        setIsAiOpen(false);
                                        window.dispatchEvent(new CustomEvent('AI_STATUS', { detail: { open: false } }));
                                    }} />
                                    {isAiMinimized && (
                                        <div className="absolute inset-0 z-50 flex items-center justify-center p-4">
                                            <div className="bg-gradient-to-r from-sky-500 to-sky-600 text-white px-8 py-3 rounded-full shadow-2xl font-black text-[10px] uppercase tracking-[0.2em] shadow-sky-500/50 flex items-center gap-2 animate-bounce">
                                                <svg className="w-4 h-4 animate-bounce" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 10l7-7m0 0l7 7m-7-7v18" /></svg>
                                                Tap to Expand AI
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </div>
    );
};

export default Layout;

