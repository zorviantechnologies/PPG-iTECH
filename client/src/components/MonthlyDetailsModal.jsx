import { motion, AnimatePresence } from 'framer-motion';
import { FaTimes } from 'react-icons/fa';

const MonthlyDetailsModal = ({ isOpen, onClose, title, items = [] }) => {
    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={onClose}
                    className="absolute inset-0 bg-sky-900/60 backdrop-blur"
                />

                <motion.div
                    initial={{ opacity: 0, scale: 0.98, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.98, y: 20 }}
                    className="relative bg-white w-full max-w-2xl max-h-[80vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col"
                >
                    <div className="p-6 border-b border-sky-50 flex items-center justify-between">
                        <div>
                            <h3 className="text-xl font-black text-gray-800 tracking-tight">{title}</h3>
                            <p className="text-[12px] text-gray-500">Details for selected month</p>
                        </div>
                        <button onClick={onClose} className="h-10 w-10 rounded-xl bg-gray-50 flex items-center justify-center text-gray-500 hover:bg-rose-50 hover:text-rose-500">
                            <FaTimes />
                        </button>
                    </div>

                    <div className="p-6 overflow-y-auto">
                        {items.length === 0 ? (
                            <p className="text-gray-500">No items to show.</p>
                        ) : (
                            <ul className="space-y-3">
                                {items.map((it, idx) => (
                                    <li key={idx} className="p-3 rounded-xl border border-gray-100 bg-gray-50 flex items-start justify-between">
                                        <div>
                                            <div className="text-sm font-black text-gray-800">{it.title || it.date}</div>
                                            {it.desc && <div className="text-[12px] text-gray-500 mt-1">{it.desc}</div>}
                                        </div>
                                        <div className="text-[12px] text-gray-400">{it.date}</div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
};

export default MonthlyDetailsModal;
