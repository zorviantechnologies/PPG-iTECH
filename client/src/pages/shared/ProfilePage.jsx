import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Layout from '../../components/Layout';
import api from '../../utils/api';
import ProfileViewer from '../../components/ProfileViewer';
import { useAuth } from '../../context/AuthContext';
import { FaArrowLeft } from 'react-icons/fa';

const ProfilePage = () => {
    const { id } = useParams();
    const { user: authUser } = useAuth();
    const [targetUser, setTargetUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    useEffect(() => {
        const fetchUser = async () => {
            setLoading(true);
            try {
                if (id) {
                    // Viewing another employee's profile by emp_id (management visiting dept staff profile)
                    const { data } = await api.get(`/employees/${id}`);
                    setTargetUser(data);
                } else {
                    // Viewing own profile (any role)
                    if (!authUser?.emp_id) return;
                    const { data } = await api.get(`/employees/${authUser.emp_id}?lookup=emp_id`);
                    setTargetUser(data);
                }
            } catch (error) {
                console.error("Error fetching profile", error);
            } finally {
                setLoading(false);
            }
        };
        fetchUser();
    }, [id, authUser?.emp_id, authUser?.role]);

    if (loading) return (
        <Layout>
            <div className="flex h-screen items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-sky-600"></div>
            </div>
        </Layout>
    );

    return (
        <Layout>
            <div className="mb-6 flex items-center gap-4">
                <button
                    onClick={() => navigate(-1)}
                    className="h-10 w-10 rounded-xl bg-white border border-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-50 transition-all shadow-sm"
                >
                    <FaArrowLeft size={14} />
                </button>
                <h1 className="text-xl font-black text-gray-800 tracking-tight uppercase tracking-widest">Personnel Profile</h1>
            </div>

            <div className="relative">
                <ProfileViewer user={targetUser} onClose={() => navigate(-1)} />
            </div>
        </Layout>
    );
};

export default ProfilePage;
