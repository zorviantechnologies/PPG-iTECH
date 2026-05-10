import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const Splash = ({ onFinish, isFast = false }) => {
    const [phase, setPhase] = useState(0);
    const [exiting, setExiting] = useState(false);

    useEffect(() => {
        const speed = isFast ? 0.4 : 1; // 2.5x faster if logged in (approx 2s total)
        const t1 = setTimeout(() => setPhase(1), 300 * speed);
        const t2 = setTimeout(() => setPhase(2), 1200 * speed);
        const t3 = setTimeout(() => setPhase(3), 2200 * speed);
        const t4 = setTimeout(() => setExiting(true), 4200 * speed);
        const t5 = setTimeout(() => onFinish(), 5000 * speed);
        return () => [t1, t2, t3, t4, t5].forEach(clearTimeout);
    }, [onFinish, isFast]);

    return (
        <AnimatePresence>
            {!exiting ? (
                <motion.div
                    key="splash"
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.8 }}
                    className="fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden"
                    style={{ background: 'linear-gradient(135deg, #0c1929 0%, #0f2744 30%, #0a1628 70%, #060d18 100%)' }}
                >
                    {/* Animated background particles */}
                    {[...Array(6)].map((_, i) => (
                        <motion.div
                            key={i}
                            initial={{ opacity: 0, scale: 0 }}
                            animate={{
                                opacity: [0, 0.08, 0.03, 0.08, 0],
                                scale: [0.5, 1.2, 0.8, 1.1, 0.5],
                                x: [0, (i % 2 ? 30 : -30), (i % 3 ? -20 : 20), 0],
                                y: [0, (i % 2 ? -25 : 25), (i % 3 ? 15 : -15), 0],
                            }}
                            transition={{ duration: 5, ease: 'easeInOut', delay: i * 0.3 }}
                            className="absolute rounded-full"
                            style={{
                                width: `${200 + i * 80}px`,
                                height: `${200 + i * 80}px`,
                                left: `${10 + i * 15}%`,
                                top: `${15 + (i % 3) * 25}%`,
                                background: `radial-gradient(circle, ${i % 2 ? 'rgba(56,189,248,0.15)' : 'rgba(99,102,241,0.12)'} 0%, transparent 70%)`,
                            }}
                        />
                    ))}

                    {/* Subtle grid overlay */}
                    <div
                        className="absolute inset-0 opacity-[0.03]"
                        style={{
                            backgroundImage: 'linear-gradient(rgba(56,189,248,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(56,189,248,0.3) 1px, transparent 1px)',
                            backgroundSize: '60px 60px',
                        }}
                    />

                    {/* Main content */}
                    <div className="relative z-10 flex flex-col items-center">

                        {/* Logo */}
                        <motion.div
                            initial={{ opacity: 0, scale: 0.3, rotateY: -90 }}
                            animate={phase >= 1 ? { opacity: 1, scale: 1, rotateY: 0 } : {}}
                            transition={{ duration: 0.8, type: 'spring', stiffness: 100, damping: 12 }}
                            className="relative mb-8"
                        >
                            {/* Glow ring */}
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={phase >= 1 ? { opacity: [0, 0.6, 0.3], scale: [0.8, 1.15, 1.05] } : {}}
                                transition={{ duration: 1.5, ease: 'easeOut' }}
                                className="absolute -inset-3 rounded-[32px]"
                                style={{ background: 'linear-gradient(135deg, rgba(56,189,248,0.3), rgba(99,102,241,0.2))', filter: 'blur(12px)' }}
                            />
                            <div className="relative w-36 h-36 flex items-center justify-center drop-shadow-2xl" style={{ isolation: 'isolate' }}>
                                <img src="/ppg-logo.png" alt="PPG EMP HUB" className="w-full h-full object-contain" style={{ imageRendering: 'high-quality', display: 'block' }} />
                            </div>
                        </motion.div>

                        {/* Title */}
                        <motion.div
                            initial={{ opacity: 0, y: 25 }}
                            animate={phase >= 2 ? { opacity: 1, y: 0 } : {}}
                            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                            className="text-center mb-4"
                        >
                            <h1 className="text-4xl max-sm:text-5xl font-black text-white tracking-tight">
                                PPG{' '}
                                <span
                                    className="text-transparent bg-clip-text"
                                    style={{ backgroundImage: 'linear-gradient(135deg, #38bdf8 0%, #818cf8 50%, #38bdf8 100%)' }}
                                >
                                    EMP HUB
                                </span>
                            </h1>
                            <motion.div
                                initial={{ scaleX: 0 }}
                                animate={phase >= 2 ? { scaleX: 1 } : {}}
                                transition={{ duration: 0.6, delay: 0.3, ease: 'easeOut' }}
                                className="h-0.5 w-32 mx-auto mt-3 rounded-full origin-center"
                                style={{ background: 'linear-gradient(90deg, transparent, #38bdf8, #818cf8, transparent)' }}
                            />
                        </motion.div>

                        <motion.p
                            initial={{ opacity: 0, y: 15 }}
                            animate={phase >= 2 ? { opacity: 1, y: 0 } : {}}
                            transition={{ duration: 0.6, delay: 0.4, ease: 'easeOut' }}
                            className="text-[10px] max-sm:text-[8px] font-bold text-sky-300/70 uppercase tracking-[0.4em] mb-10 text-center max-w-[280px] sm:max-w-none px-4 mx-auto whitespace-normal sm:whitespace-nowrap"
                        >
                            Enterprise & Attendance Management System
                        </motion.p>

                        {/* Loading indicator */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={phase >= 3 ? { opacity: 1 } : {}}
                            transition={{ duration: 0.4 }}
                            className="flex items-center gap-1.5"
                        >
                            {[0, 1, 2].map(i => (
                                <motion.div
                                    key={i}
                                    animate={phase >= 3 ? {
                                        scale: [1, 1.5, 1],
                                        opacity: [0.3, 1, 0.3],
                                    } : {}}
                                    transition={{
                                        duration: 0.8,
                                        repeat: Infinity,
                                        delay: i * 0.15,
                                        ease: 'easeInOut',
                                    }}
                                    className="w-1.5 h-1.5 rounded-full bg-sky-400"
                                />
                            ))}
                        </motion.div>

                        {/* Footer */}
                        <motion.p
                            initial={{ opacity: 0 }}
                            animate={phase >= 3 ? { opacity: 0.4 } : {}}
                            transition={{ duration: 0.5, delay: 0.3 }}
                            className="text-[8px] max-sm:text-[7px] font-bold text-sky-200 uppercase tracking-[0.3em] mt-10"
                        >
                            Powered by Zorvian Technologies
                        </motion.p>
                    </div>
                </motion.div>
            ) : null}
        </AnimatePresence>
    );
};

export default Splash;
