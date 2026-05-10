import { Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import { motion } from 'framer-motion';
import { FaCalendarAlt, FaCalendarDay, FaStar } from 'react-icons/fa';

ChartJS.register(ArcElement, Tooltip, Legend);

const PersonalAttendanceChart = ({ stats, onStatClick, activeFilter, monthStats, onMonthStatsClick, currentDayStatus }) => {
    const formatDecimal = (value) => Number(value || 0).toFixed(1);
    const data = {
        labels: [
            'Present',
            'Absent',
            'Loss Of Pay',
            'On Duty',
            'Casual Leave',
            'Medical Leave',
            'Comp Leave',
            'Late Entry'
        ],
        datasets: [{
            data: [
                stats.present || 0,
                stats.absent || 0,
                stats.lop || 0,
                stats.od || 0,
                stats.cl || 0,
                stats.ml || 0,
                stats.comp_leave || 0,
                stats.late_entry || 0
            ],
            backgroundColor: [
                '#0ea5e9', // Present - Sky
                '#f43f5e', // Absent - Rose
                '#9f1239', // LOP - Rose-800
                '#10b981', // OD - Emerald
                '#f59e0b', // CL - Amber
                '#9333ea', // ML - Purple
                '#6366f1', // Comp Leave - Indigo
                '#f97316'  // Late Entry - Orange
            ],
            borderColor: '#ffffff',
            borderWidth: 4,
            hoverOffset: 15,
            cutout: '75%'
        }]
    };

    const options = {
        plugins: {
            legend: {
                display: false
            },
            tooltip: {
                enabled: true,
                padding: 12,
                backgroundColor: 'rgba(255, 255, 255, 0.9)',
                titleColor: '#1f2937',
                bodyColor: '#4b5563',
                borderColor: '#e5e7eb',
                borderWidth: 1,
                cornerRadius: 12,
                titleFont: {
                    weight: 'bold',
                    size: 14
                },
                bodyFont: {
                    weight: 'bold'
                },
                displayColors: true,
                boxWidth: 8,
                boxHeight: 8,
                usePointStyle: true,
                callbacks: {
                    label: (context) => {
                        return ` ${context.label}: ${context.raw}`;
                    }
                }
            }
        },
        maintainAspectRatio: false,
        responsive: true,
        onClick: (event, elements) => {
            if (elements.length > 0) {
                const index = elements[0].index;
                const labelMap = [
                    'Present', 'Absent', 'LOP', 'OD', 'CL', 'ML', 'Comp Leave', 'Late Entry'
                ];
                onStatClick(labelMap[index]);
            }
        }
    };

    const statList = [
        { label: 'Present', value: stats.present, color: '#0ea5e9', filterKey: 'Present' },
        { label: 'Absent', value: stats.absent, color: '#f43f5e', filterKey: 'Absent' },
        { label: 'Loss Of Pay', value: stats.lop, color: '#9f1239', filterKey: 'LOP' },
        { label: 'On Duty', value: stats.od, color: '#10b981', filterKey: 'OD' },
        { label: 'Casual Leave', value: stats.cl, color: '#f59e0b', filterKey: 'CL' },
        { label: 'Medical Leave', value: stats.ml, color: '#9333ea', filterKey: 'ML' },
        { label: 'Comp Leave', value: stats.comp_leave, color: '#6366f1', filterKey: 'Comp Leave' },
        { label: 'Late Entry', value: stats.late_entry, color: '#f97316', filterKey: 'Late Entry' }
    ];

    const totalSessions = Object.values(stats).reduce((a, b) => a + b, 0);

    return (
        <div className="bg-white rounded-[40px] shadow-2xl shadow-sky-100/50 border border-sky-50 p-6 md:p-8 lg:p-10">
            <div className="flex flex-col lg:flex-row items-center gap-12">
                {/* Center Section: Chart & Stats List */}
                <div className="flex-1 flex flex-col sm:flex-row items-center justify-center gap-8 lg:gap-16">
                    {/* Chart */}
                    <div className="relative w-52 h-52 lg:w-60 lg:h-60 shrink-0">
                        <Doughnut data={data} options={options} />
                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Total</span>
                            <span className="text-4xl font-black text-gray-800 tracking-tighter leading-none">{formatDecimal(totalSessions)}</span>
                            <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mt-1">Records</span>
                        </div>
                    </div>

                    {/* Stats List */}
                    <div className="w-full max-w-[280px]">
                        <div className="flex flex-col gap-1">
                            {statList.map((item, idx) => {
                                const isActive = activeFilter === item.filterKey;
                                return (
                                    <motion.div
                                        key={item.label}
                                        initial={{ opacity: 0, x: 10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: idx * 0.03 }}
                                        onClick={() => onStatClick(item.filterKey)}
                                        className={`flex items-center justify-between p-2 rounded-xl cursor-pointer transition-all ${
                                            isActive 
                                                ? 'bg-sky-50/80 shadow-sm ring-1 ring-sky-100/50' 
                                                : 'hover:bg-gray-50/50'
                                        }`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div 
                                                className="w-2 h-2 rounded-full shrink-0"
                                                style={{ backgroundColor: item.color }}
                                            />
                                            <span 
                                                className="text-[9px] font-black uppercase tracking-wider transition-opacity"
                                                style={{ color: item.color, opacity: isActive ? 1 : 0.85 }}
                                            >
                                                {item.label}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <div className="flex items-center gap-2">
                                                <span 
                                                    className="text-sm font-black tracking-tight leading-none"
                                                    style={{ color: item.color }}
                                                >
                                                    {formatDecimal(item.value)}
                                                </span>
                                                <span className="text-[8px] font-bold text-gray-300 tracking-tight">
                                                    {totalSessions > 0 ? Math.round(((item.value || 0) / totalSessions) * 100) : 0}%
                                                </span>
                                            </div>
                                            {isActive && (
                                                <div className="h-1.5 w-1.5 rounded-full bg-sky-500 animate-pulse" />
                                            )}
                                        </div>
                                    </motion.div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Right side: Desktop Summary Buttons */}
                {monthStats && (
                    <div className="hidden lg:flex flex-col gap-3 w-44 border-l border-gray-100 pl-8">
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-2">Month Summary</span>
                        
                        <div 
                            onClick={onMonthStatsClick}
                            className={`p-4 bg-emerald-50 rounded-[24px] border flex flex-col gap-1 cursor-pointer hover:shadow-md transition-all group ${currentDayStatus?.type === 'workingDays' ? 'border-blue-500 ring-2 ring-blue-100' : 'border-emerald-100'}`}
                        >
                            <div className="flex items-center gap-2 text-emerald-600">
                                <FaCalendarAlt size={12} />
                                <span className="text-[9px] font-black uppercase tracking-widest">Working Days</span>
                            </div>
                            <span className="text-2xl font-black text-emerald-700 tracking-tighter">{formatDecimal(monthStats.workingDays)}</span>
                        </div>

                        <div 
                            onClick={onMonthStatsClick}
                            className={`p-4 bg-rose-50 rounded-[24px] border flex flex-col gap-1 cursor-pointer hover:shadow-md transition-all ${currentDayStatus?.type === 'holidays' ? 'border-blue-500 ring-2 ring-blue-100' : 'border-rose-100'}`}
                        >
                            <div className="flex items-center gap-2 text-rose-600">
                                <FaCalendarDay size={12} />
                                <span className="text-[9px] font-black uppercase tracking-widest">Holidays</span>
                            </div>
                            <span className="text-2xl font-black text-rose-700 tracking-tighter">{formatDecimal(monthStats.holidays)}</span>
                        </div>

                        <div 
                            onClick={onMonthStatsClick}
                            className={`p-4 bg-amber-50 rounded-[24px] border flex flex-col gap-1 cursor-pointer hover:shadow-md transition-all ${currentDayStatus?.type === 'specialEvents' ? 'border-blue-500 ring-2 ring-blue-100' : 'border-amber-100'}`}
                        >
                            <div className="flex items-center gap-2 text-amber-600">
                                <FaStar size={12} />
                                <span className="text-[9px] font-black uppercase tracking-widest">Special Events</span>
                            </div>
                            <span className="text-2xl font-black text-amber-700 tracking-tighter">{formatDecimal(monthStats.specialEvents)}</span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default PersonalAttendanceChart;
