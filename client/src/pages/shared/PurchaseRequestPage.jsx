import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaArrowLeft, FaSave, FaPlus, FaTrash, FaBoxOpen, FaLayerGroup, FaExclamationTriangle } from 'react-icons/fa';
import Layout from '../../components/Layout';
import api from '../../utils/api';
import Swal from 'sweetalert2';
import { motion, AnimatePresence } from 'framer-motion';

const inputClass = "w-full p-5 md:p-4 bg-gray-50 border border-gray-100 rounded-2xl outline-none focus:ring-4 focus:ring-sky-100 focus:border-sky-500 transition-all font-bold text-gray-700 text-sm";
const labelClass = "block text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-4 ml-1";

const PurchaseRequestPage = () => {
    const navigate = useNavigate();
    const [newItems, setNewItems] = useState([{ name: '', quantity: '', unit: 'piece' }]);

    const addRow = () => setNewItems([...newItems, { name: '', quantity: '', unit: 'piece' }]);
    const removeRow = (index) => {
        if (newItems.length > 1) {
            setNewItems(newItems.filter((_, i) => i !== index));
        }
    };
    const updateItem = (index, field, value) => {
        const updated = [...newItems];
        updated[index][field] = value;
        setNewItems(updated);
    };

    const submitRequest = async () => {
        try {
            const validItems = newItems.filter(item => item.name.trim() !== '' && item.quantity.trim() !== '' && item.unit);
            if (validItems.length === 0) {
                return Swal.fire('Data Integrity Violation', 'Please add at least one complete item (name, quantity, and unit) to the procurement sequence.', 'warning');
            }

            // Confirm before submission
            const { isConfirmed } = await Swal.fire({
                title: 'Confirm Purchase Request',
                text: `You are about to submit ${validItems.length} item(s) for procurement.`,
                icon: 'question',
                showCancelButton: true,
                confirmButtonText: 'Submit Request',
                confirmButtonColor: '#2563eb',
                cancelButtonText: 'Review & Edit'
            });

            if (!isConfirmed) return;

            const promises = validItems.map((item) => api.post('/purchases', {
                item_name: item.name,
                quantity: parseInt(item.quantity),
                unit: item.unit
            }));

            await Promise.all(promises);

            Swal.fire({
                title: 'Request Submitted',
                text: `Successfully initiated ${promises.length} purchase record(s).`,
                icon: 'success',
                confirmButtonColor: '#2563eb',
            });
            navigate(-1);
            window.dispatchEvent(new CustomEvent('closeSidebar'));
        } catch (error) {
            console.error(error);
            Swal.fire('Error', 'Failed to save requests. Please try again.', 'error');
        }
    };

    return (
        <Layout>
            <div className="max-w-7xl mx-auto py-6 md:py-10 px-4 md:px-0 overflow-y-auto min-h-screen">
                <div className="mb-10 flex items-center gap-6">
                    <button
                        onClick={() => navigate(-1)}
                        className="h-14 w-14 rounded-2xl bg-white border border-gray-100 flex items-center justify-center text-gray-400 hover:bg-rose-50 hover:text-rose-500 transition-all shadow-sm active:scale-90"
                    >
                        <FaArrowLeft size={20} />
                    </button>
                    <div>
                        <h1 className="text-3xl md:text-4xl font-black text-gray-800 tracking-tight text-nowrap">New Purchase</h1>
                        <p className="text-[10px] font-black text-sky-500 uppercase tracking-[0.2em] mt-1">Resource Allocation Matrix</p>
                    </div>
                </div>

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white rounded-[40px] shadow-2xl border border-sky-50 overflow-hidden"
                >
                    <div className="bg-sky-600 p-10 text-white flex justify-between items-center relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mr-32 -mt-32 blur-3xl opacity-20" />
                        <div>
                            <h2 className="text-2xl font-black uppercase tracking-tight">New Purchase Request</h2>
                            <p className="text-sky-100 text-xs font-bold uppercase tracking-widest mt-1">Batch Procurement System</p>
                        </div>
                        <div className="h-16 w-16 bg-white/10 rounded-3xl flex items-center justify-center shadow-inner relative z-10">
                            <FaLayerGroup size={24} />
                        </div>
                    </div>

                    <div className="p-4 md:p-12">
                        <div className="overflow-x-auto mb-10 pb-4 scrollbar-thin scrollbar-thumb-sky-100 scrollbar-track-transparent">
                            <table className="w-full text-left min-w-[500px]">
                                <thead className="border-b border-gray-100">
                                    <tr>
                                        <th className="pb-6 text-[10px] font-black text-gray-400 uppercase tracking-widest">Item Name</th>
                                        <th className="pb-6 text-[10px] font-black text-gray-400 uppercase tracking-widest w-32 text-center px-4">Quantity</th>
                                        <th className="pb-6 text-[10px] font-black text-gray-400 uppercase tracking-widest w-28 text-center px-4">Unit</th>
                                        <th className="pb-6 text-[10px] font-black text-gray-400 uppercase tracking-widest w-24 text-center px-4">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50/50">
                                    <AnimatePresence mode="popLayout">
                                        {newItems.map((item, idx) => (
                                            <motion.tr
                                                key={idx}
                                                initial={{ opacity: 0, x: -20 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                exit={{ opacity: 0, x: 20 }}
                                                transition={{ delay: idx * 0.05 }}
                                            >
                                                <td className="py-6 pr-4">
                                                    <div className="relative group">
                                                        <FaBoxOpen className="absolute left-4 top-1/2 -translate-y-1/2 text-sky-300 group-focus-within:text-sky-600 transition-colors" />
                                                        <input
                                                            type="text"
                                                            value={item.name}
                                                            onChange={(e) => updateItem(idx, 'name', e.target.value)}
                                                            placeholder="e.g. Optical Laser Sensor"
                                                            className={inputClass + " pl-12"}
                                                        />
                                                    </div>
                                                </td>
                                                <td className="py-6 px-4 text-center">
                                                    <input
                                                        type="number"
                                                        min="1"
                                                        value={item.quantity}
                                                        onChange={(e) => updateItem(idx, 'quantity', e.target.value)}
                                                        placeholder="Enter qty"
                                                        className={inputClass + " text-center"}
                                                    />
                                                </td>
                                                <td className="py-6 px-4 text-center">
                                                    <select
                                                        value={item.unit}
                                                        onChange={(e) => updateItem(idx, 'unit', e.target.value)}
                                                        className={inputClass + " text-center"}
                                                    >
                                                        <option value="piece">Piece</option>
                                                        <option value="kg">Kg</option>
                                                        <option value="litre">Litre</option>
                                                    </select>
                                                </td>
                                                <td className="py-6 text-center px-4">
                                                    <button
                                                        onClick={() => removeRow(idx)}
                                                        className="h-12 w-12 mx-auto flex items-center justify-center rounded-2xl text-rose-500 bg-rose-50/50 hover:bg-rose-500 hover:text-white transition-all active:scale-90"
                                                        title="Remove Row"
                                                    >
                                                        <FaTrash size={14} />
                                                    </button>
                                                </td>
                                            </motion.tr>
                                        ))}
                                    </AnimatePresence>
                                </tbody>
                            </table>
                        </div>

                        <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center pt-8 border-t border-gray-100 gap-6">
                            <button
                                onClick={addRow}
                                className="w-full md:w-auto px-8 py-5 bg-gray-50 border border-gray-100 text-[10px] font-black uppercase tracking-widest text-sky-600 flex items-center justify-center gap-3 hover:bg-white hover:border-sky-100 hover:shadow-xl hover:shadow-sky-50 transition-all rounded-2xl active:scale-95 group"
                            >
                                <div className="h-8 w-8 rounded-xl bg-sky-600 text-white flex items-center justify-center group-hover:rotate-90 transition-transform">
                                    <FaPlus size={10} />
                                </div>
                                add item
                            </button>
                            <div className="flex flex-col md:flex-row gap-4">
                                <button
                                    onClick={() => navigate(-1)}
                                    className="w-full md:w-auto px-10 py-5 rounded-2xl text-[10px] font-black uppercase tracking-widest text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-all active:scale-95 bg-white border border-gray-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={submitRequest}
                                    className="w-full md:w-auto bg-sky-600 text-white px-12 py-5 rounded-2xl shadow-2xl shadow-sky-200/50 hover:bg-sky-800 transition-all font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-4 active:scale-95 group"
                                >
                                    <FaSave className="group-hover:scale-125 transition-transform" />
                                    Submit Request
                                </button>
                            </div>
                        </div>
                    </div>
                </motion.div>
            </div>
        </Layout>
    );
};

export default PurchaseRequestPage;
