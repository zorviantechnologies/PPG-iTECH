-- PostgreSQL Schema for PPG EMP HUB

-- Departments Table
CREATE TABLE IF NOT EXISTS departments (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE
);

-- ENUM Types
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('admin', 'principal', 'hod', 'staff');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE gender_type AS ENUM ('Male', 'Female', 'Other');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE attendance_status AS ENUM ('Present', 'Absent', 'Leave', 'OD', 'Holiday', 'Weekend');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE leave_type_enum AS ENUM ('CL', 'ML', 'OD', 'Comp Leave', 'LOP');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE approval_status AS ENUM ('Pending', 'Approved', 'Rejected');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE approver_role_type AS ENUM ('hod', 'principal', 'admin');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE priority_type AS ENUM ('Low', 'Medium', 'High');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE purchase_status AS ENUM ('Pending', 'Approved_HOD', 'Approved_Principal', 'Approved_Admin', 'Rejected', 'Purchased');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE target_role_type AS ENUM ('all', 'principal', 'hod', 'staff');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE day_of_week_type AS ENUM ('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE salary_status AS ENUM ('Pending', 'Paid');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE approver_type_enum AS ENUM ('replacement', 'hod', 'principal', 'admin');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE notification_type_enum AS ENUM ('leave', 'purchase', 'birthday', 'system', 'conversation', 'permission');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE biometric_log_type AS ENUM ('IN', 'OUT');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Users Table (Employees)
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    emp_id VARCHAR(20) NOT NULL UNIQUE,
    emp_code VARCHAR(50),
    password VARCHAR(255) NOT NULL,
    pin VARCHAR(10),
    role user_role NOT NULL,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE,
    mobile VARCHAR(15),
    department_id INT,
    designation VARCHAR(50),
    profile_pic TEXT,
    
    -- Personal Details
    dob DATE,
    doj DATE,
    gender gender_type,
    blood_group VARCHAR(5),
    religion VARCHAR(50),
    nationality VARCHAR(50),
    caste VARCHAR(50),
    community VARCHAR(50),
    whatsapp VARCHAR(15),
    aadhar VARCHAR(20),
    pan VARCHAR(20),
    
    -- Bank Details
    account_no VARCHAR(30),
    bank_name VARCHAR(100),
    branch VARCHAR(100),
    ifsc VARCHAR(20),
    pin_code VARCHAR(10),
    pf_number VARCHAR(30),
    uan_number VARCHAR(30),
    
    -- Address
    permanent_address TEXT,
    communication_address TEXT,
    
    -- Family
    father_name VARCHAR(100),
    mother_name VARCHAR(100),
    marital_status VARCHAR(20),
    
    -- Job
    monthly_salary DECIMAL(10, 2),
    experience VARCHAR(50),
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL
);

-- Attendance Table
CREATE TABLE IF NOT EXISTS attendance (
    id SERIAL PRIMARY KEY,
    emp_id VARCHAR(20) NOT NULL,
    date DATE NOT NULL,
    in_time TIME,
    out_time TIME,
    status attendance_status DEFAULT 'Absent',
    FOREIGN KEY (emp_id) REFERENCES users(emp_id) ON DELETE CASCADE,
    UNIQUE (emp_id, date)
);

-- Leave Requests Table
CREATE TABLE IF NOT EXISTS leave_requests (
    id SERIAL PRIMARY KEY,
    emp_id VARCHAR(20) NOT NULL,
    leave_type leave_type_enum NOT NULL,
    from_date DATE NOT NULL,
    to_date DATE NOT NULL,
    days_count INT DEFAULT 1,
    reason TEXT,
    alternative_staff_id VARCHAR(20),
    status approval_status DEFAULT 'Pending',
    approver_role approver_role_type,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (emp_id) REFERENCES users(emp_id) ON DELETE CASCADE
);

-- Leave Limits / Balances
CREATE TABLE IF NOT EXISTS leave_balances (
    id SERIAL PRIMARY KEY,
    emp_id VARCHAR(20) NOT NULL,
    year INT NOT NULL,
    cl_taken INT DEFAULT 0,
    ml_taken INT DEFAULT 0,
    od_taken INT DEFAULT 0,
    comp_taken INT DEFAULT 0,
    lop_taken INT DEFAULT 0,
    FOREIGN KEY (emp_id) REFERENCES users(emp_id) ON DELETE CASCADE,
    UNIQUE (emp_id, year)
);

-- Purchases Table
CREATE TABLE IF NOT EXISTS purchases (
    id SERIAL PRIMARY KEY,
    emp_id VARCHAR(20) NOT NULL,
    item_name VARCHAR(100) NOT NULL,
    quantity INT NOT NULL,
    priority priority_type DEFAULT 'Medium',
    status purchase_status DEFAULT 'Pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (emp_id) REFERENCES users(emp_id) ON DELETE CASCADE
);

-- Conversations (Threads)
CREATE TABLE IF NOT EXISTS conversations (
    id SERIAL PRIMARY KEY,
    title VARCHAR(100) NOT NULL,
    creator_id VARCHAR(20) NOT NULL,
    target_role target_role_type DEFAULT 'all',
    target_dept_id INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (creator_id) REFERENCES users(emp_id)
);

-- Conversation Messages
CREATE TABLE IF NOT EXISTS messages (
    id SERIAL PRIMARY KEY,
    conversation_id INT NOT NULL,
    sender_id VARCHAR(20) NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
    FOREIGN KEY (sender_id) REFERENCES users(emp_id)
);

-- Timetable
CREATE TABLE IF NOT EXISTS timetable (
    id SERIAL PRIMARY KEY,
    emp_id VARCHAR(20) NOT NULL,
    day_of_week day_of_week_type NOT NULL,
    period_number INT NOT NULL,
    start_time TIME,
    end_time TIME,
    subject VARCHAR(100),
    subject_code VARCHAR(20),
    room_number VARCHAR(20),
    FOREIGN KEY (emp_id) REFERENCES users(emp_id) ON DELETE CASCADE
);

-- Salary Records
CREATE TABLE IF NOT EXISTS salary_records (
    id SERIAL PRIMARY KEY,
    emp_id VARCHAR(20) NOT NULL,
    month INT NOT NULL,
    year INT NOT NULL,
    total_present INT DEFAULT 0,
    total_leave INT DEFAULT 0,
    total_lop INT DEFAULT 0,
    calculated_salary DECIMAL(10, 2),
    status salary_status DEFAULT 'Pending',
    generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (emp_id) REFERENCES users(emp_id) ON DELETE CASCADE
);

-- Leave Settings
CREATE TABLE IF NOT EXISTS leave_settings (
    id SERIAL PRIMARY KEY,
    leave_type leave_type_enum NOT NULL UNIQUE,
    max_days INT NOT NULL,
    restriction_window_start TIME,
    restriction_window_end TIME
);

-- Detailed Leave Approvals
CREATE TABLE IF NOT EXISTS leave_approvals (
    id SERIAL PRIMARY KEY,
    leave_request_id INT NOT NULL,
    approver_id VARCHAR(20) NOT NULL,
    approver_type approver_type_enum NOT NULL,
    status approval_status DEFAULT 'Pending',
    comments TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (leave_request_id) REFERENCES leave_requests(id) ON DELETE CASCADE,
    FOREIGN KEY (approver_id) REFERENCES users(emp_id)
);

-- Create a trigger function for updated_at in leave_approvals
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_leave_approvals_updated_at
BEFORE UPDATE ON leave_approvals
FOR EACH ROW
EXECUTE PROCEDURE update_updated_at_column();

-- Birthday Log
CREATE TABLE IF NOT EXISTS birthday_log (
    id SERIAL PRIMARY KEY,
    emp_id VARCHAR(20) NOT NULL,
    wish_year INT NOT NULL,
    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (emp_id) REFERENCES users(emp_id) ON DELETE CASCADE,
    UNIQUE (emp_id, wish_year)
);

-- Notifications
CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(20) NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    type notification_type_enum DEFAULT 'system',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(emp_id) ON DELETE CASCADE
);

-- Biometric Raw Logs
CREATE TABLE IF NOT EXISTS biometric_logs (
    id SERIAL PRIMARY KEY,
    device_id VARCHAR(50),
    emp_id VARCHAR(20) NOT NULL,
    log_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    type biometric_log_type
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_biometric_logs_emp_time
ON biometric_logs (emp_id, log_time);

-- Initial Data: Admin
-- Note: ON CONFLICT DO NOTHING is the PG equivalent of INSERT IGNORE
INSERT INTO users (emp_id, password, pin, role, name) 
VALUES ('@PPG ZORVIAN', '$2b$10$YourHashedPasswordHere', '638581', 'admin', 'Super Admin')
ON CONFLICT (emp_id) DO NOTHING;
