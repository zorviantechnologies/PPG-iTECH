import { createContext, useState, useEffect, useContext } from 'react';
import api from '../utils/api';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const checkUser = async () => {
            const token = localStorage.getItem('token');
            const isManagement = localStorage.getItem('managementAccess') === 'true';
            if (token) {
                try {
                    if (isManagement) {
                        // For management, set a minimal user object from localStorage
                        setUser({ role: 'management', name: 'Management', token });
                    } else {
                        const { data } = await api.get('/auth/profile');
                        setUser(data);
                        // Store role for fast redirect on next open
                        localStorage.setItem('lastRole', data.role);
                    }
                } catch (error) {
                    localStorage.removeItem('token');
                    localStorage.removeItem('lastRole');
                    localStorage.removeItem('managementAccess');
                    setUser(null);
                }
            }
            setLoading(false);
        };
        checkUser();
    }, []);

    const login = async (emp_id, pin, role = '') => {
        let response;
        if (role === 'management') {
            response = await api.post('/auth/management-login', { emp_id, pin });
            localStorage.setItem('managementAccess', 'true');
        } else {
            response = await api.post('/auth/login', { emp_id, pin });
            localStorage.removeItem('managementAccess');
        }
        
        const { data } = response;
        localStorage.setItem('token', data.token);
        localStorage.setItem('lastRole', data.role);
        setUser(data);
        return data;
    };

    const logout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('lastRole');
        localStorage.removeItem('managementAccess');
        sessionStorage.removeItem('managementAccess');
        sessionStorage.removeItem('splashShown'); // allow splash to show on next login
        setUser(null);
    };

    return (
        <AuthContext.Provider value={{ user, login, logout, loading }}>
            {children}
        </AuthContext.Provider>
    );
};
