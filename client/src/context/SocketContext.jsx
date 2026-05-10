import { createContext, useContext, useEffect, useState } from 'react';
import io from 'socket.io-client';
import { useAuth } from './AuthContext';

const SocketContext = createContext();

export const useSocket = () => useContext(SocketContext);

export const SocketProvider = ({ children }) => {
    const [socket, setSocket] = useState(null);
    const { user } = useAuth();

    useEffect(() => {
        if (user) {
            const newSocket = io('https://ppg-itech.onrender.com'); // Ensure this matches server URL

            newSocket.on('connect', () => {
                console.log('Connected to socket server');
                newSocket.emit('join', user.id);
            });

            newSocket.on('connect_error', (err) => {
                console.error('Socket Connection Error:', err.message);
                if (err.message === 'xhr poll error') {
                    console.warn('Backend server might be down or unreachable.');
                }
            });

            setSocket(newSocket);

            return () => newSocket.close();
        } else {
            if (socket) {
                socket.close();
                setSocket(null);
            }
        }
    }, [user]);

    return (
        <SocketContext.Provider value={socket}>
            {children}
        </SocketContext.Provider>
    );
};
