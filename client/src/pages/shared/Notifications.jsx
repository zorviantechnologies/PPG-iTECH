
import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    Bell, 
    Calendar, 
    MessageSquare, 
    ShoppingBag, 
    Info, 
    CheckCircle2, 
    Filter, 
    Trash2,
    CalendarCheck,
    FileText,
    Cake,
    ChevronRight,
    Search
} from 'lucide-react';
import api from '../../utils/api';
import Layout from '../../components/Layout';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import { useNavigate } from 'react-router-dom';
import Swal from 'sweetalert2';
import { formatTo12Hr } from '../../utils/timeFormatter';

const Notifications = () => {
    const { user } = useAuth();
    const { socket } = useSocket();
    const navigate = useNavigate();
    const [notifications, setNotifications] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('ALL');
    const [searchQuery, setSearchQuery] = useState('');




    const fetchNotifications = useCallback(async () => {
        try {
            const { data } = await api.get('/notifications');
            setNotifications(data);
        } catch (error) {
            console.error('Failed to fetch notifications:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchNotifications();
        // Auto-refresh every 15 seconds like dashboard
        const interval = setInterval(fetchNotifications, 60000);
        return () => clearInterval(interval);
    }, [fetchNotifications]);

    useEffect(() => {
        if (!socket) return;

        // Listen for all notification types - instant updates
        socket.on('notification_received', (newNotif) => {
            console.log('Real-time notification received:', newNotif);
            setNotifications(prev => {
                // Check if notification already exists to avoid duplicates
                const exists = prev.some(n => n.id === newNotif.id);
                return exists ? prev : [newNotif, ...prev];
            });
            setLoading(false);
        });

        // Listen for biometric punch specifically
        socket.on('biometric_punch', (data) => {
            console.log('Real-time punch received:', data);
            const now = new Date();
            const localTimestamp = now.toISOString().replace('Z', '');
            const liveMessage = data?.message || `${data?.name || data?.emp_id || 'Employee'} punched ${data?.type || 'IN/OUT'} at ${formatTo12Hr(data?.time || '')}`;
            const newNotif = {
                id: Date.now(),
                message: liveMessage,
                type: 'system',
                created_at: localTimestamp,
                is_read: false,
                metadata: data?.remarks ? { remarks: data.remarks } : null
            };
            setNotifications(prev => [newNotif, ...prev]);
            setLoading(false);
        });

        return () => {
            socket.off('notification_received');
            socket.off('biometric_punch');
        };
    }, [socket]);

    const markAsRead = async (id) => {
        try {
            await api.put(`/notifications/${id}/read`);
            setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
        } catch (error) {
            console.error('Failed to mark as read:', error);
        }
    };

    const markAllRead = async () => {
        try {
            await api.put('/notifications/read-all');
            setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
            Swal.fire({
                icon: 'success',
                title: 'All caught up!',
                toast: true,
                position: 'top-end',
                showConfirmButton: false,
                timer: 3000
            });
        } catch (error) {
            console.error('Failed to mark all as read:', error);
        }
    };



    const getIcon = (type) => {
        switch (type) {
            case 'leave': return <CalendarCheck className="text-sky-500" size={20} />;
            case 'permission': return <FileText className="text-teal-500" size={20} />;
            case 'purchase': return <ShoppingBag className="text-purple-500" size={20} />;
            case 'birthday': return <Cake className="text-pink-500" size={20} />;
            case 'conversation': return <MessageSquare className="text-blue-500" size={20} />;
            case 'system': return <Info className="text-amber-500" size={20} />;
            default: return <Bell className="text-gray-500" size={20} />;
        }
    };

    const getTitle = (type) => {
        switch (type) {
            case 'leave': return 'Leave Update';
            case 'permission': return 'Permission Update';
            case 'purchase': return 'Purchase Request';
            case 'birthday': return 'Birthday Celebration';
            case 'message': return 'New Message';
            case 'conversation': return 'New Message';
            case 'system': return 'System Update';
            default: return 'Notification';
        }
    };

    const parseMetadata = (notification) => {
        try {
            return typeof notification?.metadata === 'string'
                ? JSON.parse(notification.metadata)
                : (notification?.metadata || {});
        } catch (error) {
            console.error('Invalid notification metadata:', error);
            return {};
        }
    };

    const getConversationTarget = (notification, role) => {
        const metadata = parseMetadata(notification);
        const conversationId = Number(
            metadata.conversationId ||
            metadata.conversation_id ||
            metadata.threadId ||
            metadata.thread_id ||
            0
        );
        const messageId = Number(
            metadata.messageId ||
            metadata.message_id ||
            0
        );

        if (!conversationId || role === 'admin') return null;

        const params = new URLSearchParams({ conversationId: String(conversationId) });
        if (messageId) params.set('messageId', String(messageId));

        return {
            path: `/${role}/conversation?${params.toString()}`,
            state: { conversationId, messageId: messageId || null }
        };
    };

    const handleAction = (notification) => {
        markAsRead(notification.id);
        const metadata = parseMetadata(notification);
        const role = user.role;

        switch (notification.type) {
            case 'leave':
                if (metadata.isStatusUpdate) {
                    navigate(role === 'principal' ? '/principal/leave-history' : `/${role}/leaves#history`);
                } else {
                    navigate(`/${role}/leaves${role === 'principal' ? '' : '#approvals'}`);
                }
                break;
            case 'permission':
                navigate(`/${role}/leaves#permission`);
                break;
            case 'purchase':
                navigate(`/${role}/purchase`);
                break;
            case 'conversation':
            case 'message': {
                const target = getConversationTarget(notification, role);
                if (target) {
                    navigate(target.path, { state: target.state });
                } else {
                    navigate(`/${role}/conversation`);
                }
                break;
            }
            case 'birthday':
                if (metadata.emp_id) navigate(`/${role}/profile/${metadata.emp_id}`);
                break;
            default:
                break;
        }
    };

    const filteredNotifications = notifications.filter(n => {
        const matchesFilter = filter === 'ALL' || n.type.toUpperCase() === filter;
        const matchesSearch = n.message.toLowerCase().includes(searchQuery.toLowerCase());
        return matchesFilter && matchesSearch;
    });

    const unreadCount = notifications.filter(n => !n.is_read).length;

    return (
        <Layout>
            <div className="max-w-4xl mx-auto space-y-8">
                {/* Header Section */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div>
                        <div className="flex items-center gap-3 mb-2">
                            <div className="w-12 h-12 bg-sky-600 rounded-2xl flex items-center justify-center shadow-lg shadow-sky-200">
                                <Bell className="text-white" size={24} />
                            </div>
                            <h1 className="text-3xl font-black text-gray-800 tracking-tight">Activity Center</h1>
                        </div>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] ml-15">
                            You have {unreadCount} unread updates
                        </p>
                    </div>

                    <div className="flex items-center gap-3">
                        <button 
                            onClick={markAllRead}
                            className="px-6 py-3 bg-white border border-gray-200 rounded-2xl text-[10px] font-black uppercase tracking-widest text-gray-600 hover:bg-sky-50 hover:text-sky-600 hover:border-sky-200 transition-all shadow-sm"
                        >
                            Mark all as read
                        </button>
                    </div>
                </div>

                {/* Filters & Search */}
                <div className="flex flex-col md:flex-row gap-4">
                    <div className="relative flex-1 group">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-sky-500 transition-colors" size={18} />
                        <input 
                            type="text"
                            placeholder="Search in notifications..."
                            className="w-full pl-12 pr-4 py-4 bg-white border border-gray-100 rounded-[24px] outline-none focus:ring-4 focus:ring-sky-50 focus:border-sky-200 transition-all font-bold text-gray-700 text-sm shadow-sm"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                    
                    <div className="flex bg-white p-1.5 rounded-[24px] border border-gray-100 shadow-sm">
                        {['ALL', 'LEAVE', 'PURCHASE', 'SYSTEM'].map(t => (
                            <button
                                key={t}
                                onClick={() => setFilter(t)}
                                className={`px-6 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${filter === t 
                                    ? 'bg-sky-600 text-white shadow-lg' 
                                    : 'text-gray-400 hover:text-gray-600'}`}
                            >
                                {t}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Notifications List */}
                <div className="bg-white/50 backdrop-blur-xl border border-white/50 rounded-[40px] shadow-sm overflow-hidden min-h-[400px]">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-20 gap-4">
                            <div className="w-12 h-12 border-4 border-sky-100 border-t-sky-600 rounded-full animate-spin" />
                            <p className="text-[10px] font-black text-sky-400 uppercase tracking-widest">Scanning updates...</p>
                        </div>
                    ) : filteredNotifications.length > 0 ? (
                        <div className="divide-y divide-gray-50">
                            <AnimatePresence mode='popLayout'>
                                {filteredNotifications.map((n, idx) => (
                                    <motion.div
                                        key={n.id}
                                        initial={{ opacity: 0, x: -20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, scale: 0.95 }}
                                        transition={{ delay: idx * 0.05 }}
                                        onClick={() => handleAction(n)}
                                        className={`group relative p-6 cursor-pointer transition-all hover:bg-sky-50/50 ${!n.is_read ? 'bg-sky-50/20' : ''}`}
                                    >
                                        <div className="flex items-start gap-6">
                                            {/* Status Indicator */}
                                            {!n.is_read && (
                                                <div className="absolute left-0 top-0 bottom-0 w-1 bg-sky-500 shadow-[0_0_10px_rgba(14,165,233,0.5)]" />
                                            )}

                                            {/* Icon */}
                                            <div className={`shrink-0 w-14 h-14 rounded-2xl flex items-center justify-center shadow-sm border transition-transform group-hover:scale-110 group-hover:rotate-3 ${
                                                !n.is_read ? 'bg-white border-sky-100 text-sky-600' : 'bg-gray-50 border-gray-100 text-gray-400'
                                            }`}>
                                                {getIcon(n.type)}
                                            </div>

                                            {/* Content */}
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center justify-between gap-4 mb-1">
                                                     {/* Removed title as per request */}

                                                     {/* Removed date and time as per request */}

                                                </div>
                                                <p className={`text-sm leading-relaxed mb-3 ${!n.is_read ? 'text-gray-600' : 'text-gray-400'}`}>
                                                    {n.message}
                                                </p>
                                                
                                                <div className="flex items-center gap-4">
                                                    <button className="text-[9px] font-black text-sky-600 uppercase tracking-widest hover:text-sky-800 flex items-center gap-1 group/btn">
                                                        View Details <ChevronRight size={10} className="group-hover/btn:translate-x-1 transition-transform" />
                                                    </button>
                                                    {!n.is_read && (
                                                        <button 
                                                            onClick={(e) => { e.stopPropagation(); markAsRead(n.id); }}
                                                            className="text-[9px] font-black text-gray-400 uppercase tracking-widest hover:text-sky-500"
                                                        >
                                                            Mark as read
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </motion.div>
                                ))}
                            </AnimatePresence>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-32 text-center px-6">
                            <div className="w-20 h-20 bg-gray-50 rounded-[32px] flex items-center justify-center text-gray-200 mb-6 shadow-inner">
                                <CheckCircle2 size={40} />
                            </div>
                            <h3 className="text-lg font-black text-gray-800 uppercase tracking-widest mb-2">System Neutral</h3>
                            <p className="text-gray-400 text-sm max-w-xs font-bold uppercase tracking-wide">
                                All updates have been processed. You're completely up to date!
                            </p>
                            <button 
                                onClick={fetchNotifications}
                                className="mt-8 text-sky-600 font-black uppercase text-[10px] tracking-widest hover:underline"
                            >
                                Re-scan for updates
                            </button>
                        </div>
                    )}
                </div>

                {/* Footer Stats */}
                <div className="flex items-center justify-between px-8 py-4 bg-white/50 rounded-[24px] border border-white/50 text-[9px] font-black text-gray-400 uppercase tracking-[0.25em]">
                    <p>Encrypted Feed Stream</p>
                    <p>Displaying {filteredNotifications.length} items</p>
                </div>
            </div>
        </Layout>
    );
};

export default Notifications;

