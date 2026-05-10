import React, { useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Layout from '../../components/Layout';
import AttendanceHistory from '../../components/AttendanceHistory';
import { finalizePrintWindow } from '../../utils/printUtils';
import { FaArrowLeft, FaIdBadge, FaCalendarAlt, FaPrint } from 'react-icons/fa';
import { motion } from 'framer-motion';

const DetailedAttendancePage = () => {
    const { empId, month, startDate: paramStart, endDate: paramEnd } = useParams();
    const navigate = useNavigate();
    const printRef = useRef(null);
    const [summary, setSummary] = React.useState({ workingDays: 0, holidays: 0, absent: 0, lop: 0, lateEntry: 0 });

    // Support both month-based and range-based navigation
    const start = paramStart || (month ? `${month}-01` : null);
    const end = paramEnd || (month ? new Date(new Date(month).getFullYear(), new Date(month).getMonth() + 1, 0).toISOString().split('T')[0] : null);
    const fmt = (value) => Number(value || 0).toFixed(1);

    const handlePrint = async () => {
        const container = printRef.current;
        if (!container) return;

        const table = container.querySelector('table');
        if (!table) return;

        const rows = table.querySelectorAll('tbody tr');
        const rowsHtml = Array.from(rows).map(tr => {
            const cells = tr.querySelectorAll('td');
            if (cells.length === 0) return '';
            const date = cells[0]?.textContent?.trim() || '';
            const status = cells[1]?.textContent?.trim() || '';
            const inTime = cells[2]?.textContent?.trim() || '—';
            const outTime = cells[3]?.textContent?.trim() || '—';
            const hours = cells[4]?.textContent?.trim() || '—';
            const rmk = cells[5]?.textContent?.trim() || '—';
            return `<tr>
                <td>${date}</td>
                <td>${status}</td>
                <td>${inTime}</td>
                <td>${outTime}</td>
                <td>${hours}</td>
                <td>${rmk}</td>
            </tr>`;
        }).join('');

        const periodLabel = start && end
            ? `${new Date(start).toLocaleDateString('en-GB')} – ${new Date(end).toLocaleDateString('en-GB')}`
            : 'All Records';

        const printWindow = window.open('', '_blank', 'width=900,height=700');
        if (!printWindow) return;

        printWindow.document.write(`<!doctype html><html><head><meta charset="UTF-8"><title>Attendance - ${empId}</title>
            <style>
                @page { size: portrait; margin: 1cm; }
                * { box-sizing: border-box; }
                body { font-family: Arial, Helvetica, sans-serif; padding: 16px; color: #111827; margin: 0; font-size: 10pt; position: relative; }
                .print-brand { position: absolute; top: 12px; right: 12px; text-align: right; }
                .print-brand .app-name { font-size: 11pt; font-weight: 800; color: #1e3a8a; margin: 0; letter-spacing: 0.5px; }
                .print-brand .print-time { font-size: 8pt; color: #6b7280; margin: 2px 0 0; }
                h1 { margin: 0 0 4px; font-size: 15pt; font-weight: bold; color: #1e3a8a; }
                .meta { margin-bottom: 14px; color: #6b7280; font-size: 9pt; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px; }
                table { width: 100%; border-collapse: collapse; }
                th, td { border: 1px solid #9ca3af; padding: 6px 10px; font-size: 9pt; text-align: left; }
                th { background: #e5e7eb; font-weight: 700; text-transform: uppercase; font-size: 8pt; letter-spacing: 0.3px; color: #374151; }
                tr:nth-child(even) { background: #f9fafb; }
                tr { page-break-inside: avoid; }
                thead { display: table-header-group; }
            </style></head><body>
            <div class="print-brand">
                <p class="app-name">PPG EMP HUB</p>
                <p class="print-time">${new Date().toLocaleString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true })}</p>
            </div>
            <h1>Detailed Attendance Report</h1>
            <div class="meta">
                Employee: <b>${empId}</b> &nbsp;|&nbsp; 
                Period: ${periodLabel} &nbsp;|&nbsp; 
                Working Days: <b>${fmt(summary.workingDays)}</b> &nbsp;|&nbsp; 
                Holidays: <b>${fmt(summary.holidays)}</b> &nbsp;|&nbsp;
                Absent: <b>${fmt(summary.absent)}</b> &nbsp;|&nbsp;
                LOP: <b>${fmt(summary.lop)}</b> &nbsp;|&nbsp;
                Late Entry: <b>${fmt(summary.lateEntry)}</b>
            </div>
            <table>
                <thead><tr><th>Date</th><th>Status</th><th>In Time</th><th>Out Time</th><th>Work Hours</th><th>Remarks</th></tr></thead>
                <tbody>${rowsHtml}</tbody>
            </table>
        </body></html>`);
        printWindow.document.close();
        await finalizePrintWindow({
            printWindow,
            title: `Attendance - ${empId}`,
            delay: 250,
            modeLabel: 'the detailed attendance report'
        });
    };

    return (
        <Layout>
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-6">
                <div className="flex items-center gap-6">
                    <button
                        onClick={() => navigate(-1)}
                        className="h-14 w-14 rounded-2xl bg-white border border-gray-100 flex items-center justify-center text-gray-400 hover:text-sky-600 transition-all shadow-xl shadow-sky-500/5 hover:-translate-x-1 active:scale-90"
                    >
                        <FaArrowLeft size={18} />
                    </button>
                    <div>
                        <h1 className="text-3xl font-black text-gray-800 tracking-tight">
                            Detailed <span className="text-sky-600 uppercase">Attendance</span>
                        </h1>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.4em] mt-2 flex items-center gap-3">
                            <span className="flex items-center gap-1"><FaIdBadge className="text-sky-500" /> {empId}</span>
                            <span className="h-1 w-1 bg-gray-300 rounded-full"></span>
                            <span className="flex items-center gap-1">
                                <FaCalendarAlt className="text-sky-500" />
                                {start && end ? `${new Date(start).toLocaleDateString()} - ${new Date(end).toLocaleDateString()}` : 'Date Range'}
                            </span>
                            <span className="h-1 w-1 bg-gray-300 rounded-full"></span>
                            <span className="flex items-center gap-1">W.Days: <b className="text-emerald-600 ml-1">{fmt(summary.workingDays)}</b></span>
                            <span className="h-1 w-1 bg-gray-300 rounded-full"></span>
                            <span className="flex items-center gap-1">Holidays: <b className="text-rose-500 ml-1">{fmt(summary.holidays)}</b></span>
                            <span className="h-1 w-1 bg-gray-300 rounded-full"></span>
                            <span className="flex items-center gap-1">Absent: <b className="text-rose-600 ml-1">{fmt(summary.absent)}</b></span>
                            <span className="h-1 w-1 bg-gray-300 rounded-full"></span>
                            <span className="flex items-center gap-1">LOP: <b className="text-rose-900 ml-1">{fmt(summary.lop)}</b></span>
                            <span className="h-1 w-1 bg-gray-300 rounded-full"></span>
                            <span className="flex items-center gap-1">Late: <b className="text-orange-600 ml-1">{fmt(summary.lateEntry)}</b></span>
                        </p>
                    </div>
                </div>
                <button
                    onClick={handlePrint}
                    className="bg-white text-gray-500 px-6 py-4 rounded-2xl shadow-xl shadow-sky-50/50 hover:bg-sky-50 hover:text-sky-600 transition-all font-black uppercase tracking-[0.2em] text-[10px] flex items-center border border-sky-50 active:scale-95"
                >
                    <FaPrint className="mr-3 text-sky-400" /> Report
                </button>
            </div>

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-[40px] shadow-2xl shadow-sky-500/5 border border-white"
            >
                <div ref={printRef} className="p-2 overflow-hidden">
                    <AttendanceHistory 
                        empId={empId} 
                        startDate={start} 
                        endDate={end} 
                        recentOnly={false} 
                        onLoadSummary={(s) => setSummary(s)} 
                    />
                </div>
            </motion.div>
        </Layout>
    );
};

export default DetailedAttendancePage;
