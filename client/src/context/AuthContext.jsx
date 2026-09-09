import { createContext, useState, useEffect, useContext } from 'react';
import api from '../utils/api';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [activeModule, setActiveModuleState] = useState(() => localStorage.getItem('activeModule') || null);
    const [showModuleModal, setShowModuleModal] = useState(false);

    useEffect(() => {
        const checkUser = async () => {
            const token = localStorage.getItem('token');
            const isManagement = localStorage.getItem('managementAccess') === 'true';
            if (token) {
                try {
                    if (isManagement) {
                        setUser({ role: 'management', name: 'Management', token });
                    } else {
                        const { data } = await api.get('/auth/profile');
                        setUser(data);
                        localStorage.setItem('lastRole', data.role);
                        // If user is student, default activeModule to 'students'
                        if (data.role === 'student') {
                            localStorage.setItem('activeModule', 'students');
                            setActiveModuleState('students');
                        }
                    }
                } catch (error) {
                    localStorage.removeItem('token');
                    localStorage.removeItem('lastRole');
                    localStorage.removeItem('managementAccess');
                    localStorage.removeItem('activeModule');
                    setUser(null);
                }
            }
            setLoading(false);
        };
        checkUser();
    }, []);

    const selectModule = (moduleName) => {
        localStorage.setItem('activeModule', moduleName);
        setActiveModuleState(moduleName);
        setShowModuleModal(false);
    };

    const openModuleChooser = () => {
        setShowModuleModal(true);
    };

    const login = async (emailOrId, pin, role = '') => {
        let response;
        if (role === 'management') {
            response = await api.post('/auth/management-login', { email: emailOrId, emp_id: emailOrId, pin });
            localStorage.setItem('managementAccess', 'true');
        } else {
            response = await api.post('/auth/login', { email: emailOrId, emp_id: emailOrId, pin });
            localStorage.removeItem('managementAccess');
        }
        
        const { data } = response;
        localStorage.setItem('token', data.token);
        localStorage.setItem('lastRole', data.role);
        
        // Default module handling or prompt
        if (data.role === 'student') {
            localStorage.setItem('activeModule', 'students');
            setActiveModuleState('students');
        } else {
            // Prompt module selection on login for admin/staff
            localStorage.removeItem('activeModule');
            setActiveModuleState(null);
            setShowModuleModal(true);
        }

        setUser(data);
        return data;
    };

    const googleLogin = async (payload) => {
        const body = typeof payload === 'string' ? { email: payload } : payload;
        let response;
        try {
            response = await api.post('/auth/google', body);
        } catch (err) {
            if (err.response && (err.response.status === 404 || err.response.status === 405)) {
                response = await api.post('/auth/login', body);
            } else {
                throw err;
            }
        }
        const { data } = response;
        localStorage.setItem('token', data.token);
        localStorage.setItem('lastRole', data.role);
        if (data.role === 'management') {
            localStorage.setItem('managementAccess', 'true');
        } else {
            localStorage.removeItem('managementAccess');
        }

        if (data.role === 'student') {
            localStorage.setItem('activeModule', 'students');
            setActiveModuleState('students');
        } else {
            localStorage.removeItem('activeModule');
            setActiveModuleState(null);
            setShowModuleModal(true);
        }

        setUser(data);
        return data;
    };

    const logout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('lastRole');
        localStorage.removeItem('managementAccess');
        localStorage.removeItem('activeModule');
        sessionStorage.removeItem('managementAccess');
        sessionStorage.removeItem('splashShown');
        setActiveModuleState(null);
        setShowModuleModal(false);
        setUser(null);
    };

    return (
        <AuthContext.Provider value={{ 
            user, login, googleLogin, logout, loading, 
            activeModule, selectModule, openModuleChooser, 
            showModuleModal, setShowModuleModal 
        }}>
            {children}
        </AuthContext.Provider>
    );
};
