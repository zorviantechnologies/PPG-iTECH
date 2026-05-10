import React, { useState, useEffect } from 'react';
import api from '../utils/api';

const LiveStatus = ({ className = "" }) => {
    const [status, setStatus] = useState({ server: true, database: true, biometric: true });
    
    useEffect(() => {
        const checkStatus = async () => {
            try {
                const { data } = await api.get('/status');
                setStatus(data);
            } catch (err) {
                setStatus({ server: false, database: false, biometric: false });
            }
        };
        checkStatus();
        const interval = setInterval(checkStatus, 60000); // Check every 30s
        return () => clearInterval(interval);
    }, []);

    const isLive = status.server && status.database && status.biometric;
    const colorClass = isLive ? "text-emerald-500" : "text-rose-500";
    const dotClass = isLive ? "bg-emerald-500" : "bg-rose-500";

    return (
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/50 backdrop-blur-sm border border-white/50 shadow-sm ${className}`}>
            <div className={`relative flex h-2 w-2`}>
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${dotClass} opacity-75`}></span>
                <span className={`relative inline-flex rounded-full h-2 w-2 ${dotClass}`}></span>
            </div>
            <span className={`text-[9px] font-black uppercase tracking-[0.2em] ${colorClass} animate-pulse-live`}>
                Live
            </span>
        </div>
    );
};

export default LiveStatus;
