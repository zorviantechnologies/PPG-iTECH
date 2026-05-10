const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

// Load environment variables immediately
dotenv.config();

const fs = require('fs');
const { createServer: createHttpServer } = require('http');
const { createServer: createHttpsServer } = require('https');
const socketUtil = require('./utils/socket');
// Inside server creation logic or after...
// Move these below where 'server' is defined
const path = require('path');
const { pool, connectDB, queryWithRetry } = require('./config/db');

// Connect to Database
connectDB();

// Initialize Database Records (Seeding)
const initDB = async () => {
    try {
        const { rows } = await queryWithRetry("SELECT id FROM users WHERE role = 'management' LIMIT 1");
        if (rows.length === 0) {
            console.log('--- Initializing Management User ---');
            const bcrypt = require('bcryptjs');
            const defaultPin = '1234';
            const hashedPin = await bcrypt.hash(defaultPin, 10);
            
            await queryWithRetry(
                "INSERT INTO users (emp_id, name, role, pin, password) VALUES ($1, $2, $3, $4, $5)",
                ['Management', 'Management', 'management', defaultPin, hashedPin]
            );
            console.log('--- Management User Created (ID: Management, PIN: 1234) ---');
        }

        // Initialize birthday wishes and other automated checks
        const { checkAllBirthdaysAndNotify } = require('./controllers/employeeController');
        checkAllBirthdaysAndNotify(); // Check on server start
        
        // Check every 24 hours
        setInterval(() => {
            console.log('--- Checking for Daily Birthdays ---');
            checkAllBirthdaysAndNotify();
        }, 24 * 60 * 60 * 1000); // 86,400,000 ms

        // Ensure salary_records unique constraint for ON CONFLICT
        console.log('--- Checking salary_records constraint ---');
        try {
            await queryWithRetry('ALTER TABLE salary_records ADD CONSTRAINT unique_salary_record UNIQUE (emp_id, month, year)');
            console.log('--- Added unique constraint to salary_records ---');
        } catch (e) {
            // Log only if it's not a "already exists" error
            if (!e.message.includes('already exists')) {
                console.error('--- Salary constraint check error:', e.message);
            }
        }
        // Ensure push_subscriptions table exists
        await queryWithRetry(`
                CREATE TABLE IF NOT EXISTS push_subscriptions (
                    id SERIAL PRIMARY KEY,
                    user_id VARCHAR(50) NOT NULL,
                    subscription JSONB NOT NULL UNIQUE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);
        console.log('--- Push Subscriptions Table Verified ---');
        
        // Ensure users table has deductions column
        await queryWithRetry('ALTER TABLE users ADD COLUMN IF NOT EXISTS deductions JSONB DEFAULT \'[]\'');
        console.log('--- Users Table Deductions Column Verified ---');

        // Ensure feedback messages table exists
        await queryWithRetry(`
                CREATE TABLE IF NOT EXISTS feedback_messages (
                    id SERIAL PRIMARY KEY,
                    from_emp_id VARCHAR(50) NOT NULL,
                    to_emp_id VARCHAR(50) NOT NULL DEFAULT '5001',
                    rating VARCHAR(20) NOT NULL DEFAULT 'General',
                    message TEXT NOT NULL,
                    submitted_by_role VARCHAR(30),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);
        console.log('--- Feedback Messages Table Verified ---');
    } catch (err) {
        console.error('Database Initialization Error:', err);
    }
};
initDB();

// Routes
const authRoutes = require('./routes/authRoutes');
const employeeRoutes = require('./routes/employeeRoutes');
const departmentRoutes = require('./routes/departmentRoutes');
const attendanceRoutes = require('./routes/attendanceRoutes');
const leaveRoutes = require('./routes/leaveRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const timetableRoutes = require('./routes/timetableRoutes');
const salaryRoutes = require('./routes/salaryRoutes');
const purchaseRoutes = require('./routes/purchaseRoutes');
const conversationRoutes = require('./routes/conversationRoutes');
const holidayRoutes = require('./routes/holidayRoutes');
const leaveLimitRoutes = require('./routes/leaveLimitRoutes');
const leaveTypeRoutes = require('./routes/leaveTypeRoutes');
const biometricRoutes = require('./routes/biometricRoutes');
const certificateRoutes = require('./routes/certificateRoutes');
const permissionRoutes = require('./routes/permissionRoutes');
const settingsRoutes = require('./routes/settingsRoutes');
const activityLogRoutes = require('./routes/activityLogRoutes');
const statusRoutes = require('./routes/statusRoutes');
const feedbackRoutes = require('./routes/feedbackRoutes');
const { getDbHealth } = require('./controllers/statusController');

const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const app = express();

// Security: Set secure HTTP headers
app.use(helmet());

// Logging: Detailed API access logs
const accessLogStream = fs.createWriteStream(path.join(__dirname, 'api_calls.log'), { flags: 'a' });
app.use(morgan(':remote-addr - :remote-user [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent"', { stream: accessLogStream }));
app.use(morgan('dev')); // Console log for development

// Rate Limiting: Prevent brute force and DoS
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // Limit each IP to 1000 requests per windowMs
    message: 'Too many requests from this IP, please try again after 15 minutes',
    standardHeaders: true,
    legacyHeaders: false,
});
app.use('/api/', limiter);

// Decryption middleware for encrypted requests (must be after body parsing)
const decryptRequest = require('./middleware/decryptRequest');

// Create HTTP or HTTPS server depending on environment configuration
let server;
let useHttps = false;
try {
    const httpsOptions = {};
    if (process.env.HTTPS_KEY_PATH && process.env.HTTPS_CERT_PATH) {
        httpsOptions.key = fs.readFileSync(process.env.HTTPS_KEY_PATH);
        httpsOptions.cert = fs.readFileSync(process.env.HTTPS_CERT_PATH);
        useHttps = true;
    } else if (process.env.HTTPS_KEY && process.env.HTTPS_CERT) {
        httpsOptions.key = process.env.HTTPS_KEY;
        httpsOptions.cert = process.env.HTTPS_CERT;
        useHttps = true;
    }

    if (useHttps) {
        server = createHttpsServer(httpsOptions, app);
        console.log('Starting HTTPS server');
    } else {
        server = createHttpServer(app);
        console.log('Starting HTTP server');
    }
} catch (err) {
    console.error('Failed to create HTTPS server, falling back to HTTP', err);
    server = createHttpServer(app);
}

// Redirect HTTP to HTTPS in production if HTTPS is enabled
if (process.env.NODE_ENV === 'production' && useHttps) {
    app.use((req, res, next) => {
        if (!req.secure) {
            return res.redirect('https://' + req.headers.host + req.url);
        }
        next();
    });
}

const io = socketUtil.init(server);

// Pass io to express app
app.set('io', io);

// Configure CORS
const allowedOrigins = [
  "http://localhost:5173",
  process.env.FRONTEND_URL
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("CORS not allowed"));
    }
  },
  methods: ['GET','POST','PUT','DELETE','PATCH','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization','X-Encrypted'],
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.text({ type: '*/*', limit: '50mb' }));

// Register decryption middleware after body parsing so req.body is populated
app.use(decryptRequest);

// Cloudflare / Proxy support
app.set('trust proxy', 1);

// Socket handlers are now in utils/socket.js

// Root Route for basic server status
app.get('/', (req, res) => {
    res.send('Server is running 🚀');
});

// Dedicated DB health endpoint
app.get('/api/db-health', getDbHealth);

// Routes Registration
// ✅ ADMS Biometric Handlers are registered via biometricRoutes mounted at /iclock and /api/biometric

app.use('/api/auth', authRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/departments', departmentRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/leaves', leaveRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/timetable', timetableRoutes);
app.use('/api/salary', salaryRoutes);
app.use('/api/purchases', purchaseRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/holidays', holidayRoutes);
app.use('/api/leave-limits', leaveLimitRoutes);
app.use('/api/leave-types', leaveTypeRoutes);
app.use('/api/biometric', biometricRoutes);
app.use('/iclock', biometricRoutes);
app.use('/', biometricRoutes); // Catch-all for ADMS devices hitting root endpoints like /getrequest and /cdata
app.use('/api/certificates', certificateRoutes);
app.use('/api/permissions', permissionRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/activity-logs', activityLogRoutes);
app.use('/api/status', statusRoutes);
app.use('/api/feedback', feedbackRoutes);



const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

module.exports = { app, io, server };
