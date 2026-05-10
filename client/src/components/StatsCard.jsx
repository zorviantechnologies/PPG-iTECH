import { motion } from 'framer-motion';

const StatsCard = ({ title, value, icon, variant = 'blue', onClick }) => {
    const variants = {
        blue: {
            bg: 'bg-sky-50/50',
            text: 'text-[#4A90E2]',
            light: 'bg-[#4A90E2]/10',
            gradient: 'from-[#4A90E2] to-[#00C6FF]'
        },
        cyan: {
            bg: 'bg-cyan-50/50',
            text: 'text-[#00B8D4]',
            light: 'bg-[#00E5FF]/10',
            gradient: 'from-[#00E5FF] to-[#00B8D4]'
        },
        green: {
            bg: 'bg-emerald-50/50',
            text: 'text-[#22C55E]',
            light: 'bg-[#22C55E]/10',
            gradient: 'from-[#22C55E] to-[#10B981]'
        },
        amber: {
            bg: 'bg-amber-50/50',
            text: 'text-[#FACC15]',
            light: 'bg-[#FACC15]/10',
            gradient: 'from-[#FACC15] to-[#D97706]'
        },
        rose: {
            bg: 'bg-rose-50/50',
            text: 'text-[#EF4444]',
            light: 'bg-[#EF4444]/10',
            gradient: 'from-[#EF4444] to-[#DC2626]'
        },
        purple: {
            bg: 'bg-purple-50/50',
            text: 'text-[#8E9EFF]',
            light: 'bg-[#8E9EFF]/10',
            gradient: 'from-[#8E9EFF] to-[#6366F1]'
        }
    };

    const style = variants[variant] || variants.blue;

    return (
        <motion.div
            whileHover={{ y: -8, scale: 1.02 }}
            className={`modern-card p-8 cursor-pointer group relative bg-white/70 backdrop-blur-xl border border-white/50`}
            onClick={onClick}
        >
            <div className={`absolute top-0 right-0 w-32 h-32 ${style.light} rounded-full -mr-16 -mt-16 transition-transform group-hover:scale-150 duration-700 opacity-20 blur-2xl`}></div>

            <div className="flex items-center justify-between relative z-10">
                <div>
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-3">{title}</p>
                    <div className="flex items-baseline gap-1">
                        <p className="text-4xl font-black text-gray-800 tracking-tighter">{value}</p>
                        <span className={`h-1.5 w-1.5 rounded-full ${style.bg.replace('50/50', '500')}`}></span>
                    </div>
                </div>
                <div className={`p-5 rounded-3xl ${style.light} ${style.text} transition-all duration-500 group-hover:scale-110 shadow-sm border border-white/40`}>
                    <span className="text-2xl">{icon}</span>
                </div>
            </div>

            <div className="mt-6 flex items-center justify-between relative z-10">
                <div className="flex items-center gap-2">
                    <div className={`h-1 w-8 rounded-full bg-gradient-to-r ${style.gradient} opacity-50`}></div>
                    <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest group-hover:text-gray-600 transition-colors">Live Update</span>
                </div>
                <div className="text-[9px] font-black text-[#4A90E2] uppercase tracking-[0.2em] opacity-0 group-hover:opacity-100 transition-all duration-300 transform translate-x-2 group-hover:translate-x-0">
                    View Details →
                </div>
            </div>
        </motion.div>
    );
};

export default StatsCard;

