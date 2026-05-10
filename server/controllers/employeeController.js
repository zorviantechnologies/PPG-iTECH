const { pool } = require('../config/db');
const bcrypt = require('bcryptjs');
const XLSX = require('xlsx');
const sendEmail = require('../utils/sendEmail');
const logActivity = require('../utils/activityLogger');
const { createNotification } = require('./notificationController');

const apiCache = new Map();
const CACHE_TTL = 30000; // 30 seconds for lists, 10s for individual lookups

const getCachedResult = (cacheKey) => {
    const cached = apiCache.get(cacheKey);
    if (cached && Date.now() - cached.time < (cached.ttl || CACHE_TTL)) return cached.data;
    if (cached) apiCache.delete(cacheKey);
    return null;
};

const setCachedResult = (cacheKey, data, ttl) => {
    apiCache.set(cacheKey, { data, time: Date.now(), ttl });
};

const IMPORT_REQUIRED_COLUMNS = [
    'emp_id',
    'employee_name',
    'email',
    'phone',
    'department',
    'designation',
    'salary',
    'joining_date',
    'status'
];

const normalizeHeader = (value) => String(value || '').trim().toLowerCase().replace(/\s+/g, '_');
const normalizeEmpId = (value) => String(value || '').trim();
const normalizeText = (value) => {
    const v = String(value || '').trim();
    return v || null;
};
const normalizeEmail = (value) => {
    const v = String(value || '').trim().toLowerCase();
    if (!v) return null;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? v : null;
};
const normalizePhone = (value) => {
    const v = String(value || '').replace(/[^0-9+]/g, '').trim();
    if (!v) return null;
    return v.length < 8 || v.length > 16 ? null : v;
};
const normalizeSalary = (value) => {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number.parseFloat(String(value).replace(/,/g, '').trim());
    if (!Number.isFinite(parsed) || parsed < 0) return null;
    return parsed;
};
const normalizeEmploymentStatus = (value) => {
    const v = String(value || '').trim().toLowerCase();
    if (!v) return null;
    if (['active', 'enabled', 'working', 'onboarded'].includes(v)) return 'active';
    if (['inactive', 'disabled', 'left', 'resigned', 'terminated'].includes(v)) return 'inactive';
    return null;
};
const parseExcelDate = (value) => {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'number') {
        const parsed = XLSX.SSF.parse_date_code(value);
        if (!parsed || !parsed.y || !parsed.m || !parsed.d) return null;
        const mm = String(parsed.m).padStart(2, '0');
        const dd = String(parsed.d).padStart(2, '0');
        return `${parsed.y}-${mm}-${dd}`;
    }
    const raw = String(value).trim();
    if (!raw) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
};
const makeDefaultPin = (empId) => {
    const digits = String(empId || '').replace(/\D/g, '');
    if (digits.length >= 4) return digits.slice(-4);
    return `9${Math.floor(100 + Math.random() * 900)}`;
};

const ensureEmployeeImportSchema = async (db) => {
    await db.query(`
        ALTER TABLE users
        ADD COLUMN IF NOT EXISTS employment_status VARCHAR(20) DEFAULT 'active'
    `);

    await db.query(`
        CREATE TABLE IF NOT EXISTS employee_import_history (
            id SERIAL PRIMARY KEY,
            file_name VARCHAR(255) NOT NULL,
            total_rows INT NOT NULL DEFAULT 0,
            created_count INT NOT NULL DEFAULT 0,
            updated_count INT NOT NULL DEFAULT 0,
            failed_count INT NOT NULL DEFAULT 0,
            status VARCHAR(20) NOT NULL DEFAULT 'success',
            errors JSONB DEFAULT '[]'::jsonb,
            rollback_data JSONB DEFAULT '{}'::jsonb,
            rolled_back BOOLEAN NOT NULL DEFAULT false,
            rollback_message TEXT,
            imported_by INT REFERENCES users(id) ON DELETE SET NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            rolled_back_at TIMESTAMP
        )
    `);
};

// @desc    Check all birthdays and send notifications (Internal use)
exports.checkAllBirthdaysAndNotify = async () => {
    try {
        const { rows: birthdayPeople } = await pool.query(`
            SELECT id, name, emp_id, dob, email
            FROM users
            WHERE dob IS NOT NULL
              AND EXTRACT(MONTH FROM dob) = EXTRACT(MONTH FROM CURRENT_DATE) 
              AND EXTRACT(DAY FROM dob) = EXTRACT(DAY FROM CURRENT_DATE)
        `);

        for (const person of birthdayPeople) {
            const message = `🎉 Happy Birthday, ${person.name}! Have a wonderful day! 🎂`;
            // This will send both in-app and email
            await createNotification(person.emp_id, message, 'birthday', { emp_id: person.emp_id });
            console.log(`Birthday wish sent to ${person.name} (${person.emp_id})`);
        }
    } catch (error) {
        console.error('Birthday Job Error:', error);
    }
};

// @desc    Get employees with birthday today
// @route   GET /api/employees/birthdays/today
// @access  Private
exports.getTodayBirthdays = async (req, res) => {
    try {
        const { rows } = await pool.query(`
            SELECT id, name, emp_id, profile_pic, role, department_id, dob
            FROM users
            WHERE EXTRACT(MONTH FROM dob) = EXTRACT(MONTH FROM CURRENT_DATE) 
              AND EXTRACT(DAY FROM dob) = EXTRACT(DAY FROM CURRENT_DATE)
        `);
        res.json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Create a new employee
// @route   POST /api/employees
// @access  Private (Admin)
exports.createEmployee = async (req, res) => {
    const {
        emp_id, emp_code, pin, role, name, email, department_id, designation,
        dob, doj, gender, mobile, profile_pic,
        blood_group, religion, nationality, caste, community, whatsapp,
        aadhar, pan, account_no, bank_name, branch, ifsc, pin_code,
        pf_number, uan_number, permanent_address, communication_address,
        father_name, mother_name, marital_status, monthly_salary, experience,
        deductions
    } = req.body;

    // Trim critical fields
    const trimmedEmpId = emp_id?.trim();
    const trimmedPin = pin?.trim();

    // Validation
    if (!trimmedEmpId || !role || !name) {
        return res.status(400).json({ message: 'Please provide required fields (Emp ID, Role, Name)' });
    }

    try {
        const { rows: existing } = await pool.query('SELECT emp_id FROM users WHERE emp_id = $1', [trimmedEmpId]);
        if (existing.length > 0) {
            return res.status(400).json({ message: 'Employee with this ID already exists' });
        }

        const hashedPassword = await bcrypt.hash(trimmedPin || '1234', 10);

        const query = `
            INSERT INTO users (
                emp_id, emp_code, pin, role, name, email, department_id, designation,
                dob, doj, gender, mobile, profile_pic,
                blood_group, religion, nationality, caste, community, whatsapp,
                aadhar, pan, account_no, bank_name, branch, ifsc, pin_code,
                pf_number, uan_number, permanent_address, communication_address,
                father_name, mother_name, marital_status, monthly_salary, experience, password, deductions
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, 
                $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37
            )
        `;

        await pool.query(query, [
            trimmedEmpId, emp_code || null, trimmedPin, role, name, email || null, department_id || null, designation || null,
            dob || null, doj || null, gender || 'Male', mobile || null, profile_pic || null,
            blood_group || null, religion || null, nationality || 'Indian', caste || null, community || null, whatsapp || null,
            aadhar || null, pan || null, account_no || null, bank_name || null, branch || null, ifsc || null, pin_code || null,
            pf_number || null, uan_number || null, permanent_address || null, communication_address || null,
            father_name || null, mother_name || null, marital_status || 'Single', monthly_salary || 0, experience || null, hashedPassword,
            deductions || null
        ]);

        // Broadcast real-time employee update to all connected clients
        const io = req.app.get('io');
        if (io) io.emit('employee_updated', { action: 'created', role, name });

        res.status(201).json({ message: 'Employee created successfully' });
        await logActivity(req.user.id, 'CREATE_EMPLOYEE', { 
            emp_id: trimmedEmpId, 
            name, 
            role, 
            department_id, 
            designation 
        }, req.ip);

        // Send Email Notification
        if (email) {
            try {
                const message = `
Welcome to PPG EMP HUB!

Your employee account has been successfully created.
--------------------------------------------------
Employee ID: ${emp_id}
Login PIN/Password: ${pin || '1234'}
--------------------------------------------------
Please log in to the portal using these credentials.
`;
                const html = `
                    <div style="font-family: sans-serif; padding: 20px; border: 1px solid #e2e8f0; border-radius: 10px;">
                        <h2 style="color: #2563eb;">Welcome to PPG EMP HUB!</h2>
                        <p>Your employee account has been successfully created.</p>
                        <div style="background-color: #f8fafc; padding: 15px; border-radius: 8px; margin: 20px 0;">
                            <p><strong>Employee ID:</strong> ${emp_id}</p>
                            <p><strong>Login PIN/Password:</strong> ${pin || '1234'}</p>
                        </div>
                        <p style="color: #64748b; font-size: 14px;">Please log in to the portal using these credentials.</p>
                    </div>
                `;

                await sendEmail({
                    email: email,
                    subject: 'Welcome to PPG EMP HUB - Your Account Credentials',
                    message: message,
                    html: html
                });
            } catch (mailError) {
                console.error('FAILED TO SEND WELCOME EMAIL:', mailError);
                // We don't fail the request if email fails, but we log it
            }
        }
    } catch (error) {
        console.error('CREATE EMPLOYEE ERROR:', error);
        res.status(500).json({ message: 'Server Error: ' + error.message });
    }
};

// @desc    Get all employees
// @route   GET /api/employees
// @access  Private (Admin, Principal, HOD)
exports.getEmployees = async (req, res) => {
    try {
        await ensureEmployeeImportSchema(pool);

        const { all, page, limit, fields } = req.query;

        // Caching
        const cacheKey = `emps_${JSON.stringify({ 
            role: req.user.role, 
            dept: req.user.department_id, 
            query: req.query 
        })}`;
        const cached = getCachedResult(cacheKey);
        if (cached) return res.json(cached);

        // Column selection to reduce egress
        let selectCols = `u.id, u.emp_id, u.emp_code, u.name, u.role, u.email, u.mobile,
                   u.department_id, u.designation, u.profile_pic,
                   u.monthly_salary, COALESCE(u.employment_status, 'active') AS employment_status,
                   TO_CHAR(u.dob, 'YYYY-MM-DD') as dob,
                   TO_CHAR(u.doj, 'YYYY-MM-DD') as doj,
                   d.name as department_name`;

        if (fields) {
            const allowed = ['id', 'emp_id', 'emp_code', 'name', 'role', 'email', 'mobile', 'department_id', 'designation', 'profile_pic', 'monthly_salary', 'employment_status', 'dob', 'doj', 'department_name'];
            const requested = fields.split(',').map(f => f.trim()).filter(f => allowed.includes(f));
            if (requested.length > 0) {
                selectCols = requested.map(f => {
                    if (f === 'department_name') return 'd.name as department_name';
                    if (f === 'employment_status') return "COALESCE(u.employment_status, 'active') AS employment_status";
                    if (f === 'dob') return "TO_CHAR(u.dob, 'YYYY-MM-DD') as dob";
                    if (f === 'doj') return "TO_CHAR(u.doj, 'YYYY-MM-DD') as doj";
                    return `u.${f}`;
                }).join(', ');
            }
        }

        let query = `
            SELECT ${selectCols}
            FROM users u
            LEFT JOIN departments d ON u.department_id = d.id
        `;
        const params = [];

        // Role-based filtering
        if (req.user.role === 'hod' || req.user.role === 'staff') {
            if (all === 'true') {
                query += ` WHERE u.role NOT IN ('admin')`;
            } else if (req.user.role === 'hod') {
                query += ` WHERE u.department_id = $1 AND u.role NOT IN ('admin', 'principal')`;
                params.push(req.user.department_id);
            } else if (req.user.department_id) {
                query += ` WHERE u.department_id = $1 AND u.role NOT IN ('admin', 'principal')`;
                params.push(req.user.department_id);
            } else {
                return res.status(200).json([]);
            }
        }

        query += ` ORDER BY u.name ASC`;

        // Pagination
        if (page && limit) {
            const p = Math.max(1, parseInt(page));
            const l = Math.min(100, Math.max(1, parseInt(limit)));
            query += ` LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
            params.push(l, (p - 1) * l);
        }

        const { rows } = await pool.query(query, params);
        setCachedResult(cacheKey, rows, 30000);
        res.json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Get employee by ID or Emp ID
// @route   GET /api/employees/:id
// @access  Private
exports.getEmployeeById = async (req, res) => {
    try {
        const paramId = req.params.id;
        const lookupMode = String(req.query.lookup || '').trim().toLowerCase();

        const cacheKey = `emp_id_${paramId}_${lookupMode}`;
        const cached = getCachedResult(cacheKey);
        if (cached) return res.json(cached);

        const isNumeric = /^\d+$/.test(paramId);

        // Explicit columns instead of * to reduce egress
        const fullUserCols = `
            u.id, u.emp_id, u.emp_code, u.name, u.role, u.email, u.mobile, u.department_id, u.designation,
            u.dob, u.doj, u.gender, u.profile_pic, u.blood_group, u.religion, u.nationality, u.caste,
            u.community, u.whatsapp, u.aadhar, u.pan, u.account_no, u.bank_name, u.branch, u.ifsc,
            u.pin_code, u.pf_number, u.uan_number, u.permanent_address, u.communication_address,
            u.father_name, u.mother_name, u.marital_status, u.monthly_salary, u.experience, u.deductions,
            COALESCE(u.employment_status, 'active') as employment_status,
            TO_CHAR(u.dob, 'YYYY-MM-DD') as dob_formatted,
            TO_CHAR(u.doj, 'YYYY-MM-DD') as doj_formatted,
            d.name as department_name
        `;

        let query, values;
        if (lookupMode === 'id') {
            if (!isNumeric) return res.status(400).json({ message: 'Invalid numeric id for lookup=id' });
            query = `SELECT ${fullUserCols} FROM users u LEFT JOIN departments d ON u.department_id = d.id WHERE u.id = $1 LIMIT 1`;
            values = [parseInt(paramId, 10)];
        } else if (lookupMode === 'emp_id') {
            query = `SELECT ${fullUserCols} FROM users u LEFT JOIN departments d ON u.department_id = d.id WHERE TRIM(u.emp_id) = $1 LIMIT 1`;
            values = [paramId.trim()];
        } else if (isNumeric) {
            query = `SELECT ${fullUserCols} FROM users u LEFT JOIN departments d ON u.department_id = d.id WHERE TRIM(u.emp_id) = $1 OR u.id = $2 ORDER BY CASE WHEN TRIM(u.emp_id) = $1 THEN 0 ELSE 1 END ASC LIMIT 1`;
            values = [paramId.trim(), parseInt(paramId)];
        } else {
            query = `SELECT ${fullUserCols} FROM users u LEFT JOIN departments d ON u.department_id = d.id WHERE TRIM(u.emp_id) = $1 LIMIT 1`;
            values = [paramId.trim()];
        }

        const { rows } = await pool.query(query, values);
        if (rows.length === 0) return res.status(404).json({ message: 'Employee not found' });

        const targetUser = rows[0];
        if (req.user.role === 'staff' && req.user.id !== targetUser.id) {
            return res.status(403).json({ message: 'Not authorized to view this profile' });
        }

        // Rename back formatted dates if needed
        targetUser.dob = targetUser.dob_formatted || targetUser.dob;
        targetUser.doj = targetUser.doj_formatted || targetUser.doj;

        setCachedResult(cacheKey, targetUser, 10000);
        res.json(targetUser);
    } catch (error) {
        console.error('getEmployeeById ERROR:', error);
        res.status(500).json({ message: 'Internal Server Error', error: error.message });
    }
};

// @desc    Update employee
// @route   PUT /api/employees/:id
// @access  Private (Admin)
exports.updateEmployee = async (req, res) => {
    const {
        name, emp_code, role, department_id, designation,
        mobile, email, dob, doj, gender, profile_pic,
        blood_group, religion, nationality, caste, community, whatsapp,
        aadhar, pan, account_no, bank_name, branch, ifsc, pin_code,
        pf_number, uan_number, permanent_address, communication_address,
        father_name, mother_name, marital_status, monthly_salary, experience, pin, deductions
    } = req.body;

    try {
        let hashedPassword;
        if (pin) {
            hashedPassword = await bcrypt.hash(pin, 10);
        }

        // Fetch the emp_id for audit logging before update
        const { rows: targetUser } = await pool.query('SELECT emp_id FROM users WHERE id = $1', [req.params.id]);
        const target_emp_id = targetUser[0]?.emp_id || 'Unknown';

        const query = `
            UPDATE users SET 
                name = $1, emp_code = $2, role = $3, department_id = $4, designation = $5, 
                mobile = $6, email = $7, dob = $8, doj = $9, gender = $10, profile_pic = $11,
                blood_group = $12, religion = $13, nationality = $14, caste = $15, community = $16, whatsapp = $17,
                aadhar = $18, pan = $19, account_no = $20, bank_name = $21, branch = $22, ifsc = $23, pin_code = $24,
                pf_number = $25, uan_number = $26, permanent_address = $27, communication_address = $28,
                father_name = $29, mother_name = $30, marital_status = $31, monthly_salary = $32, experience = $33, 
                pin = $34, password = COALESCE($35, password), deductions = $36
            WHERE id = $37
        `;

        await pool.query(query, [
            name, emp_code || null, role, department_id || null, designation || null,
            mobile || null, email || null, dob || null, doj || null, gender || 'Male', profile_pic || null,
            blood_group || null, religion || null, nationality || 'Indian', caste || null, community || null, whatsapp || null,
            aadhar || null, pan || null, account_no || null, bank_name || null, branch || null, ifsc || null, pin_code || null,
            pf_number || null, uan_number || null, permanent_address || null, communication_address || null,
            father_name || null, mother_name || null, marital_status || 'Single', monthly_salary || 0, experience || null,
            pin || null, hashedPassword || null, deductions || null,
            req.params.id
        ]);

        const io = req.app.get('io');
        if (io) io.emit('employee_updated', { action: 'updated' });

        res.json({ message: 'Employee updated successfully' });
        await logActivity(req.user.id, 'UPDATE_EMPLOYEE', { 
            target_id: req.params.id, 
            emp_id: target_emp_id,
            name, 
            role, 
            department_id, 
            designation 
        }, req.ip);
    } catch (error) {
        console.error('UPDATE ERROR:', error);
        res.status(500).json({ message: 'Server Error: ' + error.message });
    }
};

// @desc    Download employee import sample CSV
// @route   GET /api/employees/import/sample
// @access  Private (Admin)
exports.downloadEmployeeImportSample = async (req, res) => {
    const csv = [
        IMPORT_REQUIRED_COLUMNS.join(','),
        'EMP1001,Arun Kumar,arun.kumar@example.com,9876543210,Computer Science,Assistant Professor,35000,2024-06-10,active',
        'EMP1002,Meena Devi,meena.devi@example.com,9123456780,Mathematics,Lecturer,32000,2023-11-01,inactive'
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="employee_import_sample.csv"');
    res.status(200).send(csv);
};

// @desc    Import employees from XLSX/CSV
// @route   POST /api/employees/import
// @access  Private (Admin)
exports.importEmployeesFromFile = async (req, res) => {
    const client = await pool.connect();
    try {
        await ensureEmployeeImportSchema(client);

        if (!req.file || !req.file.buffer) {
            return res.status(400).json({ message: 'Please upload a valid .xlsx or .csv file.' });
        }

        const workbook = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: false });
        const firstSheetName = workbook.SheetNames?.[0];
        if (!firstSheetName) {
            return res.status(400).json({ message: 'Uploaded file is empty.' });
        }

        const worksheet = workbook.Sheets[firstSheetName];
        const grid = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
        if (!Array.isArray(grid) || grid.length < 2) {
            return res.status(400).json({ message: 'File must include header row and at least one data row.' });
        }

        const rawHeaders = (grid[0] || []).map((h) => normalizeHeader(h));
        const headerIndex = new Map();
        rawHeaders.forEach((h, i) => {
            if (h && !headerIndex.has(h)) headerIndex.set(h, i);
        });

        const missingHeaders = IMPORT_REQUIRED_COLUMNS.filter((h) => !headerIndex.has(h));
        if (missingHeaders.length > 0) {
            return res.status(400).json({
                message: `Missing required columns: ${missingHeaders.join(', ')}`
            });
        }

        const rows = [];
        for (let i = 1; i < grid.length; i += 1) {
            const row = grid[i] || [];
            const obj = {};
            for (const col of IMPORT_REQUIRED_COLUMNS) {
                obj[col] = row[headerIndex.get(col)] ?? '';
            }

            const hasAnyValue = Object.values(obj).some((v) => String(v || '').trim() !== '');
            if (hasAnyValue) {
                rows.push({ ...obj, _rowNo: i + 1 });
            }
        }

        if (rows.length === 0) {
            return res.status(400).json({ message: 'No valid data rows found in file.' });
        }

        const duplicateEmpIds = [];
        const seenEmpIds = new Set();
        rows.forEach((r) => {
            const empId = normalizeEmpId(r.emp_id).toLowerCase();
            if (!empId) return;
            if (seenEmpIds.has(empId)) duplicateEmpIds.push(normalizeEmpId(r.emp_id));
            seenEmpIds.add(empId);
        });

        if (duplicateEmpIds.length > 0) {
            return res.status(400).json({
                message: `Duplicate emp_id values inside file: ${[...new Set(duplicateEmpIds)].join(', ')}`
            });
        }

        const { rows: departmentRows } = await client.query('SELECT id, name, code FROM departments');
        const deptMap = new Map();
        departmentRows.forEach((d) => {
            if (d.name) deptMap.set(String(d.name).trim().toLowerCase(), d.id);
            if (d.code) deptMap.set(String(d.code).trim().toLowerCase(), d.id);
        });

        const targetEmpIds = rows.map((r) => normalizeEmpId(r.emp_id)).filter(Boolean);
        const { rows: existingUsers } = await client.query(
            `SELECT id, emp_id, name, email, mobile, department_id, designation, monthly_salary, doj,
                    COALESCE(employment_status, 'active') AS employment_status, role, pin, password
             FROM users
             WHERE TRIM(emp_id) = ANY($1::text[])`,
            [targetEmpIds]
        );
        const existingMap = new Map(existingUsers.map((u) => [String(u.emp_id).trim().toLowerCase(), u]));

        const failures = [];
        const createdEmpIds = [];
        const updatedSnapshots = [];
        let createdCount = 0;
        let updatedCount = 0;

        await client.query('BEGIN');

        for (const row of rows) {
            const empId = normalizeEmpId(row.emp_id);
            const employeeName = normalizeText(row.employee_name);
            const email = normalizeEmail(row.email);
            const phone = normalizePhone(row.phone);
            const departmentRaw = normalizeText(row.department);
            const designation = normalizeText(row.designation);
            const salary = normalizeSalary(row.salary);
            const joiningDate = parseExcelDate(row.joining_date);
            const status = normalizeEmploymentStatus(row.status);

            const missing = [];
            if (!empId) missing.push('emp_id');
            if (!employeeName) missing.push('employee_name');
            if (!departmentRaw) missing.push('department');
            if (!designation) missing.push('designation');
            if (!joiningDate) missing.push('joining_date');
            if (!status) missing.push('status');
            if (String(row.email || '').trim() && !email) missing.push('email(invalid)');
            if (String(row.phone || '').trim() && !phone) missing.push('phone(invalid)');
            if (String(row.salary || '').trim() && salary === null) missing.push('salary(invalid)');

            const departmentId = departmentRaw ? deptMap.get(departmentRaw.toLowerCase()) : null;
            if (departmentRaw && !departmentId) {
                missing.push(`department(not found: ${departmentRaw})`);
            }

            if (missing.length > 0) {
                failures.push({ row: row._rowNo, emp_id: empId || null, reason: `Mandatory/invalid fields: ${missing.join(', ')}` });
                continue;
            }

            const existing = existingMap.get(empId.toLowerCase());

            if (existing) {
                updatedSnapshots.push({
                    id: existing.id,
                    emp_id: existing.emp_id,
                    name: existing.name,
                    email: existing.email,
                    mobile: existing.mobile,
                    department_id: existing.department_id,
                    designation: existing.designation,
                    monthly_salary: existing.monthly_salary,
                    doj: existing.doj,
                    employment_status: existing.employment_status,
                    role: existing.role,
                    pin: existing.pin,
                    password: existing.password
                });

                await client.query(
                    `UPDATE users
                     SET name = $1,
                         email = $2,
                         mobile = $3,
                         department_id = $4,
                         designation = $5,
                         monthly_salary = $6,
                         doj = $7,
                         employment_status = $8
                     WHERE id = $9`,
                    [
                        employeeName,
                        email,
                        phone,
                        departmentId,
                        designation,
                        salary ?? 0,
                        joiningDate,
                        status,
                        existing.id
                    ]
                );

                updatedCount += 1;
                continue;
            }

            const defaultPin = makeDefaultPin(empId);
            const hashedPassword = await bcrypt.hash(defaultPin, 10);

            await client.query(
                `INSERT INTO users (
                    emp_id, pin, password, role, name, email, mobile,
                    department_id, designation, monthly_salary, doj, employment_status
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7,
                    $8, $9, $10, $11, $12
                )`,
                [
                    empId,
                    defaultPin,
                    hashedPassword,
                    'staff',
                    employeeName,
                    email,
                    phone,
                    departmentId,
                    designation,
                    salary ?? 0,
                    joiningDate,
                    status
                ]
            );

            createdEmpIds.push(empId);
            createdCount += 1;
        }

        const totalRows = rows.length;
        const failedCount = failures.length;
        const importStatus = failedCount > 0
            ? (createdCount + updatedCount > 0 ? 'partial' : 'failed')
            : 'success';

        const rollbackData = {
            createdEmpIds,
            updatedSnapshots
        };

        const { rows: historyRows } = await client.query(
            `INSERT INTO employee_import_history (
                file_name, total_rows, created_count, updated_count, failed_count,
                status, errors, rollback_data, imported_by
            ) VALUES (
                $1, $2, $3, $4, $5,
                $6, $7::jsonb, $8::jsonb, $9
            ) RETURNING id`,
            [
                req.file.originalname || 'employee_import',
                totalRows,
                createdCount,
                updatedCount,
                failedCount,
                importStatus,
                JSON.stringify(failures),
                JSON.stringify(rollbackData),
                req.user?.id || null
            ]
        );

        await client.query('COMMIT');

        const io = req.app.get('io');
        if (io && (createdCount > 0 || updatedCount > 0)) {
            io.emit('employee_updated', { action: 'imported', createdCount, updatedCount, failedCount });
        }

        await logActivity(req.user.id, 'IMPORT_EMPLOYEES', {
            file_name: req.file.originalname,
            totalRows,
            createdCount,
            updatedCount,
            failedCount,
            importId: historyRows[0].id
        }, req.ip);

        return res.status(200).json({
            message: 'Employee data imported successfully',
            importId: historyRows[0].id,
            totalRows,
            createdCount,
            updatedCount,
            failedCount,
            failedRecords: failures.slice(0, 200)
        });
    } catch (error) {
        try {
            await client.query('ROLLBACK');
        } catch {
            // no-op
        }
        console.error('IMPORT EMPLOYEES ERROR:', error);
        return res.status(500).json({ message: 'Server Error', error: error.message });
    } finally {
        client.release();
    }
};

// @desc    Get import history
// @route   GET /api/employees/import/history
// @access  Private (Admin)
exports.getEmployeeImportHistory = async (req, res) => {
    try {
        await ensureEmployeeImportSchema(pool);

        const { rows } = await pool.query(
            `SELECT h.id, h.file_name, h.total_rows, h.created_count, h.updated_count, h.failed_count,
                    h.status, h.rolled_back, h.rollback_message, h.created_at, h.rolled_back_at,
                    u.name AS imported_by_name
             FROM employee_import_history h
             LEFT JOIN users u ON u.id = h.imported_by
             ORDER BY h.created_at DESC
             LIMIT 50`
        );

        res.json(rows);
    } catch (error) {
        console.error('GET IMPORT HISTORY ERROR:', error);
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

// @desc    Rollback one employee import batch
// @route   POST /api/employees/import/:importId/rollback
// @access  Private (Admin)
exports.rollbackEmployeeImport = async (req, res) => {
    const client = await pool.connect();
    try {
        await ensureEmployeeImportSchema(client);
        await client.query('BEGIN');

        const importId = Number.parseInt(req.params.importId, 10);
        if (!Number.isInteger(importId) || importId <= 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ message: 'Invalid import id' });
        }

        const { rows: historyRows } = await client.query(
            'SELECT * FROM employee_import_history WHERE id = $1 FOR UPDATE',
            [importId]
        );

        if (historyRows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: 'Import history not found' });
        }

        const history = historyRows[0];
        if (history.rolled_back) {
            await client.query('ROLLBACK');
            return res.status(400).json({ message: 'This import has already been rolled back.' });
        }

        const rollbackData = history.rollback_data || {};
        const createdEmpIds = Array.isArray(rollbackData.createdEmpIds) ? rollbackData.createdEmpIds : [];
        const updatedSnapshots = Array.isArray(rollbackData.updatedSnapshots) ? rollbackData.updatedSnapshots : [];

        if (createdEmpIds.length > 0) {
            await client.query('DELETE FROM users WHERE emp_id = ANY($1::text[])', [createdEmpIds]);
        }

        for (const prev of updatedSnapshots) {
            await client.query(
                `UPDATE users
                 SET name = $1,
                     email = $2,
                     mobile = $3,
                     department_id = $4,
                     designation = $5,
                     monthly_salary = $6,
                     doj = $7,
                     employment_status = $8,
                     role = $9,
                     pin = $10,
                     password = $11
                 WHERE id = $12`,
                [
                    prev.name || null,
                    prev.email || null,
                    prev.mobile || null,
                    prev.department_id || null,
                    prev.designation || null,
                    prev.monthly_salary ?? 0,
                    prev.doj || null,
                    prev.employment_status || 'active',
                    prev.role || 'staff',
                    prev.pin || null,
                    prev.password || null,
                    prev.id
                ]
            );
        }

        await client.query(
            `UPDATE employee_import_history
             SET rolled_back = true,
                 rolled_back_at = CURRENT_TIMESTAMP,
                 rollback_message = $2
             WHERE id = $1`,
            [importId, `Rolled back by admin ${req.user?.name || req.user?.emp_id || ''}`.trim()]
        );

        await client.query('COMMIT');

        const io = req.app.get('io');
        if (io) io.emit('employee_updated', { action: 'import_rollback', importId });

        await logActivity(req.user.id, 'ROLLBACK_EMPLOYEE_IMPORT', { importId }, req.ip);

        return res.json({
            message: 'Import rollback completed successfully.',
            removedCreatedEmployees: createdEmpIds.length,
            restoredUpdatedEmployees: updatedSnapshots.length
        });
    } catch (error) {
        try {
            await client.query('ROLLBACK');
        } catch {
            // no-op
        }
        console.error('ROLLBACK IMPORT ERROR:', error);
        return res.status(500).json({ message: 'Server Error', error: error.message });
    } finally {
        client.release();
    }
};

// @desc    Delete employee
// @route   DELETE /api/employees/:id
// @access  Private (Admin)
exports.deleteEmployee = async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const { rows: userRows } = await client.query(
            'SELECT emp_id, name, role FROM users WHERE id = $1',
            [req.params.id]
        );

        if (userRows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: 'Employee not found' });
        }
        const { emp_id, name, role } = userRows[0];

        // Protection for @ppg zorvian
        if (emp_id.toLowerCase() === '@ppg zorvian') {
            const { rows: otherAdmins } = await client.query(
                "SELECT id FROM users WHERE role = 'admin' AND emp_id != $1",
                [emp_id]
            );
            if (otherAdmins.length === 0) {
                await client.query('ROLLBACK');
                return res.status(403).json({ 
                    message: 'Cannot delete the primary admin account (@ppg zorvian) unless another admin account exists.' 
                });
            }
        }

        // For HOD and Staff: auto-reject any pending leave requests before deletion
        if (role === 'hod' || role === 'staff') {
            // Get all pending leave requests by this user
            const { rows: pendingLeaves } = await client.query(
                "SELECT id FROM leave_requests WHERE emp_id = $1 AND status = 'Pending'",
                [emp_id]
            );

            for (const leave of pendingLeaves) {
                // Mark the leave request as Rejected
                await client.query(
                    "UPDATE leave_requests SET status = 'Rejected' WHERE id = $1",
                    [leave.id]
                );

                // Mark any pending approval steps as Rejected too
                await client.query(
                    "UPDATE leave_approvals SET status = 'Rejected', comments = 'Employee account deleted by admin' WHERE leave_request_id = $1 AND status = 'Pending'",
                    [leave.id]
                );
            }

            // Also reject pending requests where this user is an approver
            const { rows: pendingAsApprover } = await client.query(
                "SELECT leave_request_id FROM leave_approvals WHERE approver_id = $1 AND status = 'Pending'",
                [emp_id]
            );

            for (const item of pendingAsApprover) {
                await client.query(
                    "UPDATE leave_approvals SET status = 'Rejected', comments = 'Approver account deleted by admin' WHERE leave_request_id = $1 AND approver_id = $2 AND status = 'Pending'",
                    [item.leave_request_id, emp_id]
                );
                // Also mark parent leave request as Rejected so it doesn't stay stuck
                await client.query(
                    "UPDATE leave_requests SET status = 'Rejected' WHERE id = $1 AND status = 'Pending'",
                    [item.leave_request_id]
                );
            }
        }

        // Now delete the user (CASCADE will clean up related records)
        await client.query('DELETE FROM users WHERE id = $1', [req.params.id]);

        await client.query('COMMIT');
        
        // Immediately clear auth cache for this deleted user
        const { clearUserCache } = require('../middleware/authMiddleware');
        clearUserCache(req.params.id);

        const io = req.app.get('io');
        if (io) io.emit('employee_updated', { action: 'deleted' });

        res.json({ message: `Employee ${name} deleted successfully. Any pending leave requests have been cancelled.` });
        await logActivity(req.user.id, 'DELETE_EMPLOYEE', { emp_id, name }, req.ip);
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('DELETE EMPLOYEE ERROR:', error);
        res.status(500).json({ message: 'Server Error: ' + error.message });
    } finally {
        client.release();
    }
};
