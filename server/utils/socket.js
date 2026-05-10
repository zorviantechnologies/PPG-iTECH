let io;

module.exports = {
    init: (server) => {
        const { Server } = require('socket.io');
        io = new Server(server, {
            cors: {
                origin: process.env.CLIENT_URL || "http://localhost:3000",
                methods: ["GET", "POST"]
            }
        });

        io.on('connection', (socket) => {
            console.log('New client connected:', socket.id);

            socket.on('join', (userId) => {
                socket.join(userId);
                console.log(`User ${userId} joined their room`);
            });

            socket.on('disconnect', () => {
                console.log('Client disconnected:', socket.id);
            });
        });

        return io;
    },
    getIO: () => {
        return io;
    }
};
