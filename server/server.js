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

        // Ensure users table has emergency_contact column
        await queryWithRetry('ALTER TABLE users ADD COLUMN IF NOT EXISTS emergency_contact VARCHAR(20)');
        console.log('--- Users Table Emergency Contact Column Verified ---');

        // Ensure users table has personal_email column
        await queryWithRetry('ALTER TABLE users ADD COLUMN IF NOT EXISTS personal_email VARCHAR(100)');
        console.log('--- Users Table Personal Email Column Verified ---');

        // Ensure users table has bank_account_name column
        await queryWithRetry('ALTER TABLE users ADD COLUMN IF NOT EXISTS bank_account_name VARCHAR(100)');
        console.log('--- Users Table Bank Account Name Column Verified ---');

        // Ensure users table has other_experience column
        await queryWithRetry('ALTER TABLE users ADD COLUMN IF NOT EXISTS other_experience TEXT');
        console.log('--- Users Table Other Experience Column Verified ---');

        // Ensure users table has spouse_name column
        await queryWithRetry('ALTER TABLE users ADD COLUMN IF NOT EXISTS spouse_name VARCHAR(100)');
        console.log('--- Users Table Spouse Name Column Verified ---');

        // Ensure users table has children column
        await queryWithRetry('ALTER TABLE users ADD COLUMN IF NOT EXISTS children JSONB DEFAULT \'[]\'::jsonb');
        console.log('--- Users Table Children Column Verified ---');

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

        // Ensure certificates table exists and has correct schema
        await queryWithRetry(`
            CREATE TABLE IF NOT EXISTS certificates (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                certificate_name VARCHAR(255) NOT NULL,
                file_name VARCHAR(255),
                file_type VARCHAR(100),
                file_data TEXT,
                handled_by VARCHAR(20) DEFAULT 'employee',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Migration: Ensure existing tables allow NULL for file columns (for text-only logs)
        try {
            await queryWithRetry(`ALTER TABLE certificates ALTER COLUMN file_name DROP NOT NULL`);
            await queryWithRetry(`ALTER TABLE certificates ALTER COLUMN file_type DROP NOT NULL`);
            await queryWithRetry(`ALTER TABLE certificates ALTER COLUMN file_data DROP NOT NULL`);
            // Ensure handled_by exists if the table was created by an older script
            await queryWithRetry(`ALTER TABLE certificates ADD COLUMN IF NOT EXISTS handled_by VARCHAR(20) DEFAULT 'employee'`);
        } catch (migErr) {
            console.log('Certificates migration info:', migErr.message);
        }
        console.log('--- Certificates Table Verified ---');

        // Ensure user_login table exists and populate with existing users having user_id and email
        await queryWithRetry(`
            CREATE TABLE IF NOT EXISTS user_login (
                user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                email VARCHAR(255) NOT NULL UNIQUE,
                PRIMARY KEY (user_id, email)
            )
        `);
        console.log('--- user_login Table Verified ---');

        // Sync user_login with users table where user id and email exist
        await queryWithRetry(`
            INSERT INTO user_login (user_id, email)
            SELECT id, LOWER(TRIM(email))
            FROM users
            WHERE id IS NOT NULL AND email IS NOT NULL AND TRIM(email) != ''
            ON CONFLICT (email) DO UPDATE SET user_id = EXCLUDED.user_id
        `);
        await queryWithRetry(`
            INSERT INTO user_login (user_id, email)
            SELECT id, LOWER(TRIM(personal_email))
            FROM users
            WHERE id IS NOT NULL AND personal_email IS NOT NULL AND TRIM(personal_email) != ''
            ON CONFLICT (email) DO UPDATE SET user_id = EXCLUDED.user_id
        `);
        console.log('--- user_login Table Populated Successfully ---');

        // Ensure student role value exists in user_role ENUM type
        try {
            await queryWithRetry("ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'student'");
            console.log('--- Added student to user_role ENUM ---');
        } catch (enumErr) {
            // Ignore if enum value already exists or using varchar
        }

        // Ensure students table exists
        await queryWithRetry(`
            CREATE TABLE IF NOT EXISTS students (
                id SERIAL PRIMARY KEY,
                user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                reg_no VARCHAR(50) NOT NULL UNIQUE,
                roll_no VARCHAR(50),
                academic_year INT NOT NULL DEFAULT 1,
                semester INT NOT NULL DEFAULT 1,
                section VARCHAR(10) DEFAULT 'A',
                batch VARCHAR(30),
                parent_name VARCHAR(100),
                parent_phone VARCHAR(20),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('--- Students Table Verified ---');

        // Ensure exam_results table exists
        await queryWithRetry(`
            CREATE TABLE IF NOT EXISTS exam_results (
                id SERIAL PRIMARY KEY,
                student_id INT REFERENCES users(id) ON DELETE CASCADE,
                student_reg_no VARCHAR(50) NOT NULL,
                student_name VARCHAR(100) NOT NULL,
                department_id INT REFERENCES departments(id) ON DELETE SET NULL,
                academic_year INT NOT NULL DEFAULT 1,
                semester INT NOT NULL DEFAULT 1,
                exam_name VARCHAR(100) NOT NULL,
                subject_code VARCHAR(20) NOT NULL,
                subject_name VARCHAR(100) NOT NULL,
                internal_marks DECIMAL(5, 2) DEFAULT 0,
                external_marks DECIMAL(5, 2) DEFAULT 0,
                total_marks DECIMAL(5, 2) NOT NULL DEFAULT 0,
                max_marks DECIMAL(5, 2) DEFAULT 100,
                grade VARCHAR(5) DEFAULT 'F',
                status VARCHAR(20) DEFAULT 'PASS',
                published BOOLEAN DEFAULT FALSE,
                uploaded_by VARCHAR(50),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        // Ensure timetable table exists and has class timetable columns
        await queryWithRetry(`
            CREATE TABLE IF NOT EXISTS timetable (
                id SERIAL PRIMARY KEY,
                emp_id VARCHAR(20),
                day_of_week day_of_week_type NOT NULL,
                period_number INT NOT NULL,
                start_time TIME,
                end_time TIME,
                subject VARCHAR(100),
                subject_code VARCHAR(20),
                room_number VARCHAR(20)
            )
        `);
        try {
            await queryWithRetry(`ALTER TABLE timetable ALTER COLUMN emp_id DROP NOT NULL;`);
        } catch (e) { /* ignore */ }
        await queryWithRetry(`ALTER TABLE timetable ADD COLUMN IF NOT EXISTS department_id INT REFERENCES departments(id) ON DELETE CASCADE;`);
        await queryWithRetry(`ALTER TABLE timetable ADD COLUMN IF NOT EXISTS academic_year INT DEFAULT 1;`);
        await queryWithRetry(`ALTER TABLE timetable ADD COLUMN IF NOT EXISTS semester INT DEFAULT 1;`);
        await queryWithRetry(`ALTER TABLE timetable ADD COLUMN IF NOT EXISTS section VARCHAR(10) DEFAULT 'A';`);
        console.log('--- Timetable Table Verified ---');
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
const studentRoutes = require('./routes/studentRoutes');
const resultRoutes = require('./routes/resultRoutes');
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
  "https://ppg-i-tech.vercel.app",
  process.env.FRONTEND_URL
].filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin) || origin.endsWith('.vercel.app')) {
      callback(null, true);
    } else {
      callback(new Error("CORS not allowed"));
    }
  },
  methods: ['GET','POST','PUT','DELETE','PATCH','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization','X-Encrypted','X-Disable-Encrypt'],
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
app.use('/api/students', studentRoutes);
app.use('/api/results', resultRoutes);



const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

module.exports = { app, io, server };
