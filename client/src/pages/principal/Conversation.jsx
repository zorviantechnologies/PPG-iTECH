import { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import Layout from '../../components/Layout';
import api from '../../utils/api';
import Swal from 'sweetalert2';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import {
    FaPlus,
    FaPaperPlane,
    FaComments,
    FaUserCircle,
    FaChevronRight,
    FaBullhorn,
    FaRegCommentDots,
    FaTrash,
    FaEdit,
    FaArrowLeft
} from "react-icons/fa";
import { motion, AnimatePresence } from 'framer-motion';

const Conversation = () => {
    const { user } = useAuth();
    const { socket } = useSocket();
    const location = useLocation();
    const [threads, setThreads] = useState([]);
    const [selectedThread, setSelectedThread] = useState(null);
    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState('');
    const [loading, setLoading] = useState(true);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [allStaff, setAllStaff] = useState([]);
    const [departments, setDepartments] = useState([]);
    const [topicForm, setTopicForm] = useState({
        title: '',
        target_role: 'all',
        target_dept_id: 'all',
        target_type: 'all', // 'all' or 'particular'
        selected_users: [] // array of emp_ids
    });
    const [searchStaff, setSearchStaff] = useState('');
    const [isParticipantModalOpen, setIsParticipantModalOpen] = useState(false);
    const [mobileShowChat, setMobileShowChat] = useState(false);
    const [messageTarget, setMessageTarget] = useState({ conversationId: null, messageId: null });
    const [highlightedMessageId, setHighlightedMessageId] = useState(null);
    const messagesEndRef = useRef(null);

    const parseNumericId = (value) => {
        const parsed = Number(value);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    };

    const getLocationTarget = () => {
        const params = new URLSearchParams(location.search);
        const stateConversationId = parseNumericId(location.state?.conversationId);
        const stateMessageId = parseNumericId(location.state?.messageId);
        const queryConversationId = parseNumericId(params.get('conversationId'));
        const queryMessageId = parseNumericId(params.get('messageId'));

        return {
            conversationId: stateConversationId || queryConversationId,
            messageId: stateMessageId || queryMessageId
        };
    };

    useEffect(() => {
        fetchThreads();
        fetchAllStaff();
        fetchDepartments();
    }, []);

    useEffect(() => {
        const target = getLocationTarget();
        if (target.conversationId || target.messageId) {
            setMessageTarget(target);
        }
    }, [location.key]);

    const fetchDepartments = async () => {
        try {
            const { data } = await api.get('/departments');
            setDepartments(data);
        } catch (error) { console.error("Error fetching departments", error); }
    };

    const fetchAllStaff = async () => {
        try {
            const { data } = await api.get('/employees?all=true');
            setAllStaff(data);
        } catch (error) { console.error("Error fetching staff", error); }
    };

    useEffect(() => {
        if (selectedThread) {
            fetchMessages(selectedThread.id);
            if (socket) {
                socket.emit('join', `conv_${selectedThread.id}`);
            }
        }
    }, [selectedThread, socket]);

    useEffect(() => {
        if (socket) {
            const handleMsg = (msg) => {
                // Update last_message_time on the thread
                setThreads(prev => prev.map(t =>
                    t.id === msg.conversation_id
                        ? { ...t, last_message_time: msg.created_at, message_count: Number(t.message_count || 0) + 1 }
                        : t
                ));
                if (selectedThread && msg.conversation_id === selectedThread.id) {
                    setMessages(prev => {
                        if (prev.some(m => m.id === msg.id)) return prev;
                        return [...prev, msg];
                    });
                }
            };
            socket.on('new_message', handleMsg);

            socket.on('update_message', (data) => {
                if (selectedThread && data.conversation_id === selectedThread.id) {
                    setMessages(prev => prev.map(m => m.id === data.id ? { ...m, content: data.content } : m));
                }
            });

            socket.on('delete_message', (data) => {
                if (selectedThread && data.conversation_id === selectedThread.id) {
                    setMessages(prev => prev.filter(m => m.id !== data.id));
                }
            });

            socket.on('update_topic', (data) => {
                setThreads(prev => prev.map(t => t.id === data.id ? { ...t, title: data.title } : t));
                if (selectedThread?.id === data.id) {
                    setSelectedThread(prev => ({ ...prev, title: data.title }));
                }
            });

            socket.on('delete_topic', (id) => {
                setThreads(prev => prev.filter(t => t.id !== id));
                if (selectedThread?.id === id) setSelectedThread(null);
            });

            return () => {
                socket.off('new_message');
                socket.off('update_message');
                socket.off('delete_message');
                socket.off('update_topic');
                socket.off('delete_topic');
            };
        }
    }, [socket, selectedThread]);

    // Force re-render for time ago
    const [timeTick, setTimeTick] = useState(0);
    useEffect(() => {
        const interval = setInterval(() => setTimeTick(t => t + 1), 60000);
        return () => clearInterval(interval);
    }, []);

    const formatTime = (dateStr) => {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        const now = new Date();
        const isToday = date.toDateString() === now.toDateString();
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        const isYesterday = date.toDateString() === yesterday.toDateString();
        const time = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

        if (isToday) return time;
        if (isYesterday) return `Yesterday ${time}`;
        return `${date.toLocaleDateString('en-GB')} ${time}`;
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    const fetchThreads = async () => {
        try {
            const { data } = await api.get('/conversations');
            setThreads(data);
            if (data.length > 0) {
                const target = getLocationTarget();
                const preferred = target.conversationId
                    ? data.find(t => Number(t.id) === Number(target.conversationId))
                    : null;
                setSelectedThread(preferred || data[0]);
            }
            setLoading(false);
        } catch (error) { console.error(error); setLoading(false); }
    };

    useEffect(() => {
        if (!threads.length || !messageTarget.conversationId) return;

        const targetThread = threads.find(t => Number(t.id) === Number(messageTarget.conversationId));
        if (targetThread && Number(selectedThread?.id) !== Number(targetThread.id)) {
            setSelectedThread(targetThread);
            setMobileShowChat(true);
        }
    }, [threads, selectedThread, messageTarget]);

    const fetchMessages = async (id) => {
        try {
            const { data } = await api.get(`/conversations/${id}/messages`);
            setMessages(data);
        } catch (error) { console.error(error); }
    };

    useEffect(() => {
        if (!messageTarget.messageId || !selectedThread) return;
        if (messageTarget.conversationId && Number(selectedThread.id) !== Number(messageTarget.conversationId)) return;

        const targetMessage = messages.find(m => Number(m.id) === Number(messageTarget.messageId));
        if (!targetMessage) return;

        const timer = setTimeout(() => {
            const targetElement = document.getElementById(`message-${targetMessage.id}`);
            if (targetElement) {
                targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                setHighlightedMessageId(targetMessage.id);
                setTimeout(() => setHighlightedMessageId(null), 3500);
            }
        }, 100);

        setMessageTarget(prev => ({ ...prev, messageId: null }));
        return () => clearTimeout(timer);
    }, [messages, selectedThread, messageTarget]);

    const eligibleEmployees = allStaff.filter(s => ['principal', 'hod', 'staff'].includes((s.role || '').toLowerCase()));

    const filteredTopicEmployees = eligibleEmployees
        .filter(s => topicForm.target_role === 'all' || (s.role || '').toLowerCase() === topicForm.target_role)
        .filter(s => topicForm.target_dept_id === 'all' || Number(s.department_id) === Number(topicForm.target_dept_id))
        .filter(s =>
            s.name.toLowerCase().includes(searchStaff.toLowerCase()) ||
            (s.department_name || '').toLowerCase().includes(searchStaff.toLowerCase()) ||
            (s.emp_id || '').toLowerCase().includes(searchStaff.toLowerCase())
        );

    const getParticipants = () => {
        if (!selectedThread) return [];
        if (selectedThread.target_user_ids && selectedThread.target_user_ids.length > 0) {
            return eligibleEmployees.filter(s => selectedThread.target_user_ids.includes(s.emp_id));
        }
        let filtered = eligibleEmployees;
        if (selectedThread.target_role && selectedThread.target_role !== 'all') {
            filtered = filtered.filter(s => (s.role || '').toLowerCase() === selectedThread.target_role);
        }
        if (selectedThread.target_dept_id) {
            filtered = filtered.filter(s => Number(s.department_id) === Number(selectedThread.target_dept_id));
        }
        return filtered;
    };

    const handleSendMessage = async (e) => {
        e.preventDefault();
        if (!newMessage.trim() || !selectedThread) return;

        try {
            // Capture client's current LOCAL time to match dashboard clock
            const now = new Date();
            const year = now.getFullYear();
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const day = String(now.getDate()).padStart(2, '0');
            const hours = String(now.getHours()).padStart(2, '0');
            const minutes = String(now.getMinutes()).padStart(2, '0');
            const seconds = String(now.getSeconds()).padStart(2, '0');
            const clientTimestamp = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
            
            const { data } = await api.post(`/conversations/${selectedThread.id}/messages`, { 
                content: newMessage,
                client_timestamp: clientTimestamp
            });
            setNewMessage('');
            // Add message from response as fallback (socket handler deduplicates)
            setMessages(prev => {
                if (prev.some(m => m.id === data.id)) return prev;
                return [...prev, data];
            });
        } catch (error) { console.error(error); }
    };

    const handleEditMessage = async (msg) => {
        const { value: content } = await Swal.fire({
            title: 'Edit Message',
            input: 'textarea',
            inputValue: msg.content,
            showCancelButton: true,
            confirmButtonColor: '#2563eb',
        });

        if (content) {
            try {
                await api.put(`/conversations/messages/${msg.id}`, {
                    content,
                    conversation_id: selectedThread.id
                });
                // Update locally as fallback
                setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, content } : m));
            } catch (error) { console.error(error); }
        }
    };

    const handleDeleteMessage = async (msgId) => {
        const result = await Swal.fire({
            title: 'Delete Message?',
            text: "You won't be able to revert this!",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#ef4444',
            cancelButtonColor: '#6b7280',
            confirmButtonText: 'Yes, delete it!'
        });

        if (result.isConfirmed) {
            try {
                await api.delete(`/conversations/messages/${msgId}?conversation_id=${selectedThread.id}`);
                // Remove locally as fallback
                setMessages(prev => prev.filter(m => m.id !== msgId));
            } catch (error) { console.error(error); }
        }
    };

    const handleEditTopic = async () => {
        const { value: title } = await Swal.fire({
            title: 'Edit Topic Title',
            input: 'text',
            inputValue: selectedThread.title,
            showCancelButton: true,
            confirmButtonColor: '#2563eb',
        });

        if (title) {
            try {
                await api.put(`/conversations/${selectedThread.id}`, { title });
                // Update locally as fallback
                setThreads(prev => prev.map(t => t.id === selectedThread.id ? { ...t, title } : t));
                setSelectedThread(prev => ({ ...prev, title }));
            } catch (error) { console.error(error); }
        }
    };

    const handleDeleteTopic = async () => {
        const result = await Swal.fire({
            title: 'Delete Entire Topic?',
            text: "All messages will be lost forever!",
            icon: 'error',
            showCancelButton: true,
            confirmButtonColor: '#ef4444',
            cancelButtonColor: '#6b7280',
            confirmButtonText: 'Yes, delete topic!'
        });

        if (result.isConfirmed) {
            try {
                await api.delete(`/conversations/${selectedThread.id}`);
                // Remove locally as fallback
                setThreads(prev => prev.filter(t => t.id !== selectedThread.id));
                setSelectedThread(null);
            } catch (error) { console.error(error); }
        }
    };

    return (
        <Layout>
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="h-[calc(100vh-140px)] flex flex-col"
            >
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 md:mb-10 gap-4 shrink-0">
                    <div>
                        <h1 className="text-2xl md:text-3xl font-black text-gray-800 tracking-tight">Conversation</h1>
                    </div>
                    <button
                        onClick={() => setIsCreateModalOpen(true)}
                        className="bg-sky-600 text-white px-5 md:px-8 py-3 md:py-4 rounded-2xl shadow-xl shadow-sky-100 hover:bg-sky-700 transition-all flex items-center font-black uppercase tracking-widest text-[10px] md:text-xs active:scale-95 group"
                    >
                        <FaPlus className="mr-3 group-hover:rotate-90 transition-transform" /> Create Topic
                    </button>
                </div>

                <div className="flex-1 flex gap-4 md:gap-8 overflow-hidden min-h-0">
                    {/* Threads Sidebar */}
                    <div className={`${mobileShowChat ? 'hidden md:flex' : 'flex'} w-full md:w-96 flex-col shrink-0`}>
                        <div className="modern-card !p-0 flex flex-col h-full bg-white/70 backdrop-blur-xl border-sky-50">
                            <div className="p-4 md:p-6 border-b border-sky-50 flex items-center justify-between">
                                <h2 className="text-[10px] font-black text-sky-500 uppercase tracking-[0.2em] flex items-center">
                                    <FaComments className="mr-3" /> Active Topics
                                </h2>
                                <span className="bg-sky-50 text-sky-600 px-2.5 py-1 rounded-lg text-[10px] font-black">{threads.length}</span>
                            </div>
                            <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2">
                                {threads.map(thread => (
                                    <button
                                        key={thread.id}
                                        onClick={() => { setSelectedThread(thread); setMobileShowChat(true); }}
                                        className={`w-full text-left p-4 md:p-5 rounded-2xl transition-all border relative group ${selectedThread?.id === thread.id
                                            ? 'bg-sky-600 text-white border-sky-600 shadow-xl shadow-sky-100'
                                            : 'bg-transparent text-gray-800 border-transparent hover:bg-sky-50/50 hover:border-sky-100'
                                            }`}
                                    >
                                        <div className="flex justify-between items-start mb-2">
                                            <p className={`text-sm font-black tracking-tight line-clamp-1 pr-4 ${selectedThread?.id === thread.id ? 'text-white' : 'text-gray-800'}`}>
                                                {thread.title}
                                            </p>
                                            {thread.target_role === 'all' && (
                                                <FaBullhorn className={`text-[10px] ${selectedThread?.id === thread.id ? 'text-sky-200' : 'text-sky-500'} animate-pulse`} />
                                            )}
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <p className={`text-[10px] font-bold uppercase tracking-widest opacity-60 ${selectedThread?.id === thread.id ? 'text-sky-100' : 'text-gray-400'}`}>
                                                By {thread.creator_name}
                                            </p>
                                            <div className="flex items-center gap-1.5 grayscale opacity-50 group-hover:grayscale-0 group-hover:opacity-100 transition-all">
                                                <FaRegCommentDots size={10} className={selectedThread?.id === thread.id ? 'text-sky-200' : 'text-sky-500'} />
                                                <span className={`text-[10px] font-black ${selectedThread?.id === thread.id ? 'text-sky-100' : 'text-gray-400'}`}>{thread.message_count}</span>
                                            </div>
                                        </div>
                                        {thread.last_message_time && (
                                            <p className={`text-[9px] font-bold mt-1.5 ${selectedThread?.id === thread.id ? 'text-sky-200' : 'text-gray-400 opacity-60'}`}>
                                                {formatTime(thread.last_message_time)}
                                            </p>
                                        )}
                                        {selectedThread?.id === thread.id && (
                                            <motion.div layoutId="activePtr" className="absolute right-2 top-1/2 -translate-y-1/2 text-white">
                                                <FaChevronRight size={12} />
                                            </motion.div>
                                        )}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Chat Area */}
                    <div className={`${mobileShowChat ? 'flex' : 'hidden md:flex'} flex-1 flex-col min-w-0`}>
                        <div className="modern-card !p-0 flex flex-col h-full bg-white border-sky-50">
                            {selectedThread ? (
                                <>
                                    <div className="p-4 md:p-6 border-b border-sky-50 flex items-center justify-between shrink-0 bg-white/50 backdrop-blur-md">
                                        <div className="flex items-center min-w-0">
                                            <button
                                                onClick={() => setMobileShowChat(false)}
                                                className="md:hidden h-10 w-10 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center text-gray-400 hover:bg-sky-50 hover:text-sky-600 transition-all mr-3 shrink-0"
                                            >
                                                <FaArrowLeft size={14} />
                                            </button>
                                            <div className="h-10 w-10 md:h-12 md:w-12 rounded-2xl bg-gradient-to-br from-sky-500 to-sky-700 flex items-center justify-center text-white font-black text-lg md:text-xl shadow-lg mr-3 md:mr-4 shrink-0">
                                                {selectedThread.title?.charAt(0) || '?'}
                                            </div>
                                            <div className="min-w-0">
                                                <h3 className="text-base md:text-lg font-black text-gray-800 tracking-tight truncate">{selectedThread.title}</h3>
                                                <div className="flex items-center gap-2 mt-0.5">
                                                    <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse shadow-sm shadow-emerald-200"></span>
                                                    <span className="text-[10px] text-emerald-600 font-black uppercase tracking-widest">Active Chat</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 md:gap-3 shrink-0 ml-2">
                                            <button
                                                onClick={() => setIsParticipantModalOpen(true)}
                                                className="flex items-center gap-2 text-[9px] font-black text-sky-500 bg-sky-50 px-2 md:px-3 py-2 rounded-xl border border-sky-100 uppercase tracking-widest hover:bg-sky-600 hover:text-white transition-all cursor-pointer"
                                            >
                                                <FaBullhorn size={10} /> Scope: {selectedThread.target_role} {selectedThread.target_dept_id ? `| ${departments.find(d => Number(d.id) === Number(selectedThread.target_dept_id))?.name || 'Dept'}` : '| All Depts'}
                                            </button>
                                            {selectedThread.creator_id === user.emp_id && (
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={handleEditTopic}
                                                        className="p-2 bg-gray-50 text-gray-400 hover:text-sky-600 hover:bg-sky-50 rounded-lg transition-all"
                                                    >
                                                        <FaEdit size={14} />
                                                    </button>
                                                    <button
                                                        onClick={handleDeleteTopic}
                                                        className="p-2 bg-gray-50 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                                                    >
                                                        <FaTrash size={14} />
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-4 md:space-y-6 custom-scrollbar bg-gray-50/30">
                                        <AnimatePresence>
                                            {messages.map((msg, idx) => (
                                                <motion.div
                                                    key={msg.id}
                                                    id={`message-${msg.id}`}
                                                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                                    transition={{ delay: idx * 0.05 }}
                                                    className={`flex ${msg.sender_id === user.emp_id ? 'justify-end' : 'justify-start'}`}
                                                >
                                                    <div className={`max-w-[85%] md:max-w-[75%] flex gap-2 md:gap-4 ${msg.sender_id === user.emp_id ? 'flex-row-reverse text-right' : 'flex-row'}`}>
                                                        <div className="shrink-0 mt-auto mb-1">
                                                            <div className="h-9 w-9 rounded-xl border-2 border-white shadow-md overflow-hidden bg-gray-100 ring-2 ring-sky-50">
                                                                <img
                                                                    src={msg.profile_pic || `https://ui-avatars.com/api/?name=${msg.sender_name}&background=3b82f6&color=fff&bold=true`}
                                                                    className="h-full w-full object-cover"
                                                                    alt=""
                                                                />
                                                            </div>
                                                        </div>
                                                        <div>
                                                            <div className={`p-5 rounded-3xl shadow-sm border transition-all ${highlightedMessageId === msg.id ? 'ring-2 ring-amber-300 ring-offset-2' : ''} ${msg.sender_id === user.emp_id
                                                                ? 'bg-sky-600 text-white border-sky-700 rounded-br-none shadow-sky-100'
                                                                : 'bg-white text-gray-800 border-gray-100 rounded-bl-none'
                                                                }`}>
                                                                {msg.sender_id !== user.emp_id && (
                                                                    <p className="text-[8px] font-black uppercase mb-1.5 text-sky-500 tracking-[0.1em]">
                                                                        {msg.sender_name} • {msg.sender_role}
                                                                    </p>
                                                                )}
                                                                <p className="text-[13px] font-medium leading-[1.6]">
                                                                    {msg.content}
                                                                </p>
                                                                {msg.sender_id === user.emp_id && (
                                                                    <div className="flex gap-3 mt-3 pt-3 border-t border-sky-400/30 opacity-60 hover:opacity-100 transition-opacity">
                                                                        <button
                                                                            onClick={() => handleEditMessage(msg)}
                                                                            className="text-[9px] font-black uppercase tracking-tight hover:text-white/80"
                                                                        >
                                                                            Edit
                                                                        </button>
                                                                        <button
                                                                            onClick={() => handleDeleteMessage(msg.id)}
                                                                            className="text-[9px] font-black uppercase tracking-tight hover:text-rose-200"
                                                                        >
                                                                            Delete
                                                                        </button>
                                                                    </div>
                                                                )}
                                                            </div>
                                                            <p className={`text-[8px] mt-2 font-black uppercase tracking-widest text-gray-400 opacity-60`}>
                                                                {formatTime(msg.created_at)}
                                                            </p>
                                                        </div>
                                                    </div>
                                                </motion.div>
                                            ))}
                                        </AnimatePresence>
                                        <div ref={messagesEndRef} />
                                    </div>

                                    <form onSubmit={handleSendMessage} className="p-3 md:p-6 border-t border-sky-50 bg-white shrink-0">
                                        <div className="flex gap-4 items-center bg-gray-50 border border-gray-100 rounded-2xl p-2 focus-within:ring-4 focus-within:ring-sky-50 transition-all">
                                            <input
                                                type="text"
                                                value={newMessage}
                                                onChange={(e) => setNewMessage(e.target.value)}
                                                placeholder="Type your message..."
                                                className="flex-1 bg-transparent border-none px-4 py-3 outline-none font-bold text-gray-700 text-sm placeholder:text-gray-400 placeholder:font-black placeholder:uppercase placeholder:tracking-widest"
                                            />
                                            <button
                                                type="submit"
                                                className="bg-sky-600 text-white h-12 w-12 rounded-xl shadow-lg shadow-sky-100 hover:bg-sky-800 transition-all flex items-center justify-center active:scale-90"
                                            >
                                                <FaPaperPlane size={16} />
                                            </button>
                                        </div>
                                    </form>
                                </>
                            ) : (
                                <div className="flex-1 flex flex-col items-center justify-center p-10 md:p-20 text-center gap-4 md:gap-6">
                                    <div className="h-20 w-20 md:h-32 md:w-32 rounded-[40px] bg-sky-50 flex items-center justify-center text-sky-200 shadow-inner">
                                        <FaComments size={40} className="opacity-40 md:hidden" />
                                        <FaComments size={64} className="opacity-40 hidden md:block" />
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-black text-gray-400 uppercase tracking-widest">Conversation Inactive</h3>
                                        <p className="text-gray-300 font-bold mt-2 max-w-xs mx-auto">Select a topic from the list to start or view messages.</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </motion.div>
            {/* Create Topic Modal */}
            <AnimatePresence>
                {isCreateModalOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
                    >
                        <motion.div
                            initial={{ scale: 0.9, y: 20 }}
                            animate={{ scale: 1, y: 0 }}
                            exit={{ scale: 0.9, y: 20 }}
                            className="bg-white w-full max-w-2xl rounded-3xl md:rounded-[40px] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
                        >
                            {/* Modal Header */}
                            <div className="p-5 md:p-8 border-b border-sky-50 flex items-center justify-between shrink-0 bg-white shadow-sm">
                                <div>
                                    <h2 className="text-2xl font-black text-gray-800 tracking-tight">Create Topic</h2>
                                    <p className="text-[10px] font-black text-sky-500 uppercase tracking-widest mt-1">Start a new discussion thread</p>
                                </div>
                                <button
                                    onClick={() => setIsCreateModalOpen(false)}
                                    className="h-10 w-10 rounded-xl bg-rose-50 text-rose-500 flex items-center justify-center hover:bg-rose-500 hover:text-white transition-all active:scale-90"
                                >
                                    <FaPlus className="rotate-45" size={18} />
                                </button>
                            </div>

                            {/* Modal Content */}
                            <div className="flex-1 overflow-y-auto p-5 md:p-8 space-y-6 md:space-y-8 custom-scrollbar">
                                {/* Title Input */}
                                <div>
                                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1 mb-2">Thread Subject</label>
                                    <input
                                        placeholder="e.g. Planning for Academic Fest"
                                        className="w-full bg-gray-50 border border-gray-100 rounded-2xl p-4 font-black text-gray-700 text-sm outline-none focus:ring-4 focus:ring-sky-50 transition-all"
                                        value={topicForm.title}
                                        onChange={e => setTopicForm({ ...topicForm, title: e.target.value })}
                                    />
                                </div>

                                 {/* Targeting Options */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
                                    <div>
                                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1 mb-2">Target Role</label>
                                        <select
                                            className="w-full bg-gray-50 border border-gray-100 rounded-2xl p-4 font-black text-gray-700 text-sm outline-none focus:ring-4 focus:ring-sky-50 transition-all cursor-pointer"
                                            value={topicForm.target_role}
                                            onChange={e => setTopicForm({ ...topicForm, target_role: e.target.value, target_type: 'all', selected_users: [] })}
                                        >
                                            <option value="all">Everyone</option>
                                            <option value="principal">Principal</option>
                                            <option value="hod">HODs</option>
                                            <option value="staff">Staffs</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1 mb-2">Target Department</label>
                                        <select
                                            className="w-full bg-gray-50 border border-gray-100 rounded-2xl p-4 font-black text-gray-700 text-sm outline-none focus:ring-4 focus:ring-sky-50 transition-all cursor-pointer"
                                            value={topicForm.target_dept_id}
                                            onChange={e => setTopicForm({ ...topicForm, target_dept_id: e.target.value, target_type: 'all', selected_users: [] })}
                                        >
                                            <option value="all">All Departments</option>
                                            {departments.map(dept => (
                                                <option key={dept.id} value={dept.id}>{dept.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1 mb-2">Selection Scope</label>
                                    <div className="flex bg-gray-50 rounded-2xl p-1.5 border border-gray-100 h-[58px]">
                                        {[
                                            { id: 'all', label: 'Broadcast to all in scope' },
                                            { id: 'particular', label: 'Select Specific Individuals' }
                                        ].map(opt => (
                                            <button
                                                key={opt.id}
                                                type="button"
                                                onClick={() => setTopicForm({ ...topicForm, target_type: opt.id })}
                                                className={`flex-1 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${topicForm.target_type === opt.id
                                                    ? 'bg-white text-sky-600 shadow-sm'
                                                    : 'text-gray-400 hover:text-gray-600'
                                                    }`}
                                            >
                                                {opt.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Employee Selection (Visible if 'particular' is selected) */}
                                {topicForm.target_type === 'particular' && (
                                    <motion.div
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className="space-y-4"
                                    >
                                        <div className="flex items-center justify-between">
                                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Select Participants</label>
                                            <span className="text-[10px] font-black text-sky-500 uppercase tracking-widest">{topicForm.selected_users.length} selected</span>
                                        </div>

                                        <div className="relative">
                                            <input
                                                placeholder="Search by name or department..."
                                                className="w-full bg-sky-50/30 border border-sky-50 rounded-2xl p-4 pl-12 font-black text-gray-700 text-sm outline-none focus:ring-4 focus:ring-sky-50 transition-all"
                                                value={searchStaff}
                                                onChange={e => setSearchStaff(e.target.value)}
                                            />
                                            <FaPlus className="absolute left-4 top-1/2 -translate-y-1/2 text-sky-300 rotate-45" />
                                        </div>

                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[250px] overflow-y-auto p-2 custom-scrollbar bg-gray-50/50 rounded-3xl border border-gray-100">
                                            {filteredTopicEmployees.length === 0 && (
                                                <div className="col-span-full p-6 text-center text-[10px] font-black uppercase tracking-widest text-gray-400">
                                                    No employees found for selected role
                                                </div>
                                            )}

                                            {filteredTopicEmployees.map(s => {
                                                    const isSelected = topicForm.selected_users.includes(s.emp_id);
                                                    return (
                                                        <button
                                                            key={s.emp_id}
                                                            type="button"
                                                            onClick={() => {
                                                                const current = topicForm.selected_users;
                                                                const next = isSelected
                                                                    ? current.filter(id => id !== s.emp_id)
                                                                    : [...current, s.emp_id];
                                                                setTopicForm({ ...topicForm, selected_users: next });
                                                            }}
                                                            className={`flex items-center gap-3 p-3 rounded-2xl border transition-all ${isSelected
                                                                ? 'bg-sky-600 text-white border-sky-600 shadow-md scale-[1.02]'
                                                                : 'bg-white text-gray-700 border-gray-100 hover:border-sky-200'
                                                                }`}
                                                        >
                                                            <div className="h-8 w-8 rounded-lg overflow-hidden shrink-0">
                                                                <img
                                                                    src={s.profile_pic || `https://ui-avatars.com/api/?name=${s.name}&background=3b82f6&color=fff&bold=true`}
                                                                    className="h-full w-full object-cover"
                                                                    alt=""
                                                                />
                                                            </div>
                                                            <div className="text-left overflow-hidden">
                                                                <p className={`text-xs font-black tracking-tight truncate ${isSelected ? 'text-white' : 'text-gray-800'}`}>{s.name}</p>
                                                                <p className={`text-[8px] font-black uppercase tracking-widest truncate ${isSelected ? 'text-sky-100' : 'text-gray-400'}`}>{s.department_name || s.role}</p>
                                                            </div>
                                                        </button>
                                                    );
                                                })}
                                        </div>
                                    </motion.div>
                                )}
                            </div>

                            {/* Modal Footer */}
                            <div className="p-5 md:p-8 border-t border-sky-50 bg-gray-50/50 flex gap-3 md:gap-4 shrink-0">
                                <button
                                    onClick={() => setIsCreateModalOpen(false)}
                                    className="flex-1 px-8 py-4 bg-white border border-gray-200 text-gray-500 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-gray-100 transition-all active:scale-95"
                                >
                                    Cancel
                                </button>
                                <button
                                    disabled={!topicForm.title || (topicForm.target_type === 'particular' && topicForm.selected_users.length === 0)}
                                    onClick={async () => {
                                        try {
                                            await api.post('/conversations', {
                                                title: topicForm.title,
                                                target_role: topicForm.target_role,
                                                target_dept_id: topicForm.target_dept_id === 'all' ? null : topicForm.target_dept_id,
                                                target_user_ids: topicForm.target_type === 'particular' ? topicForm.selected_users : null
                                            });
                                            setIsCreateModalOpen(false);
                                            setTopicForm({ title: '', target_role: 'all', target_dept_id: 'all', target_type: 'all', selected_users: [] });
                                            fetchThreads();
                                            Swal.fire({
                                                title: 'Topic Created',
                                                text: 'Success',
                                                icon: 'success',
                                                timer: 1500,
                                                showConfirmButton: false
                                            });
                                        } catch (error) { console.error(error); }
                                    }}
                                    className="flex-[2] px-8 py-4 bg-sky-600 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl shadow-sky-100 hover:bg-sky-700 transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                    Create Topic
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
            {/* Participants Modal */}
            <AnimatePresence>
                {isParticipantModalOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
                    >
                        <motion.div
                            initial={{ scale: 0.9, y: 20 }}
                            animate={{ scale: 1, y: 0 }}
                            exit={{ scale: 0.9, y: 20 }}
                            className="bg-white w-full max-w-md rounded-[40px] shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
                        >
                            <div className="p-8 border-b border-sky-50 flex items-center justify-between shrink-0 bg-white">
                                <div>
                                    <h2 className="text-xl font-black text-gray-800 tracking-tight">Scope Participants</h2>
                                    <p className="text-[10px] font-black text-sky-500 uppercase tracking-widest mt-1">Who can view this topic</p>
                                </div>
                                <button
                                    onClick={() => setIsParticipantModalOpen(false)}
                                    className="h-10 w-10 rounded-xl bg-rose-50 text-rose-500 flex items-center justify-center hover:bg-rose-500 hover:text-white transition-all active:scale-90"
                                >
                                    <FaPlus className="rotate-45" size={18} />
                                </button>
                            </div>

                            <div className="flex-1 overflow-y-auto p-6 space-y-3 custom-scrollbar">
                                {getParticipants().length > 0 ? (
                                    getParticipants().map(s => (
                                        <div key={s.emp_id} className="flex items-center gap-3 p-3 rounded-2xl bg-gray-50 border border-gray-100">
                                            <div className="h-10 w-10 rounded-xl overflow-hidden shrink-0 border-2 border-white shadow-sm">
                                                <img
                                                    src={s.profile_pic || `https://ui-avatars.com/api/?name=${s.name}&background=3b82f6&color=fff&bold=true`}
                                                    className="h-full w-full object-cover"
                                                    alt=""
                                                />
                                            </div>
                                            <div className="overflow-hidden">
                                                <p className="text-sm font-black text-gray-800 tracking-tight truncate">{s.name}</p>
                                                <p className="text-[10px] font-black text-sky-500 uppercase tracking-widest truncate">{s.department_name || s.role}</p>
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <div className="p-10 text-center text-gray-400 font-black uppercase text-[10px] tracking-widest">
                                        No participants found
                                    </div>
                                )}
                            </div>

                            <div className="p-6 bg-gray-50/50 border-t border-sky-50 text-center">
                                <p className="text-[9px] font-black text-gray-400 uppercase tracking-[0.2em]">
                                    Total Participants: {getParticipants().length}
                                </p>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </Layout>
    );
};

export default Conversation;

