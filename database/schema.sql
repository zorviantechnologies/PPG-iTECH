-- Create Database
CREATE DATABASE IF NOT EXISTS ppg_emp_hub_db;
USE ppg_emp_hub_db;

-- Departments Table
CREATE TABLE IF NOT EXISTS departments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE
);

-- Users Table (Employees)
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    emp_id VARCHAR(20) NOT NULL UNIQUE,
    emp_code VARCHAR(50),
    password VARCHAR(255) NOT NULL,
    pin VARCHAR(10),
    role ENUM('admin', 'principal', 'hod', 'staff') NOT NULL,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE,
    mobile VARCHAR(15),
    department_id INT,
    designation VARCHAR(50),
    profile_pic VARCHAR(255),
    
    -- Personal Details
    dob DATE,
    doj DATE,
    gender ENUM('Male', 'Female', 'Other'),
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
    id INT AUTO_INCREMENT PRIMARY KEY,
    emp_id VARCHAR(20) NOT NULL,
    date DATE NOT NULL,
    in_time TIME,
    out_time TIME,
    status ENUM('Present', 'Absent', 'Leave', 'OD', 'Holiday', 'Weekend') DEFAULT 'Absent',
    FOREIGN KEY (emp_id) REFERENCES users(emp_id) ON DELETE CASCADE,
    UNIQUE KEY unique_attendance (emp_id, date)
);

-- Leave Requests Table
CREATE TABLE IF NOT EXISTS leave_requests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    emp_id VARCHAR(20) NOT NULL,
    leave_type ENUM('CL', 'ML', 'OD', 'Comp Leave', 'LOP') NOT NULL,
    from_date DATE NOT NULL,
    to_date DATE NOT NULL,
    days_count INT DEFAULT 1,
    reason TEXT,
    alternative_staff_id VARCHAR(20),
    status ENUM('Pending', 'Approved', 'Rejected') DEFAULT 'Pending',
    approver_role ENUM('hod', 'principal', 'admin'),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (emp_id) REFERENCES users(emp_id) ON DELETE CASCADE
);

-- Leave Limits / Balances (Optional, or calculated)
CREATE TABLE IF NOT EXISTS leave_balances (
    id INT AUTO_INCREMENT PRIMARY KEY,
    emp_id VARCHAR(20) NOT NULL,
    year INT NOT NULL,
    cl_taken INT DEFAULT 0,
    ml_taken INT DEFAULT 0,
    od_taken INT DEFAULT 0,
    comp_taken INT DEFAULT 0,
    lop_taken INT DEFAULT 0,
    FOREIGN KEY (emp_id) REFERENCES users(emp_id) ON DELETE CASCADE,
    UNIQUE KEY unique_balance (emp_id, year)
);

-- Purchases Table
CREATE TABLE IF NOT EXISTS purchases (
    id INT AUTO_INCREMENT PRIMARY KEY,
    emp_id VARCHAR(20) NOT NULL,
    item_name VARCHAR(100) NOT NULL,
    quantity INT NOT NULL,
    priority ENUM('Low', 'Medium', 'High') DEFAULT 'Medium',
    status ENUM('Pending', 'Approved_HOD', 'Approved_Principal', 'Approved_Admin', 'Rejected', 'Purchased') DEFAULT 'Pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (emp_id) REFERENCES users(emp_id) ON DELETE CASCADE
);

-- Conversations (Threads)
CREATE TABLE IF NOT EXISTS conversations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(100) NOT NULL,
    creator_id VARCHAR(20) NOT NULL,
    target_role ENUM('all', 'principal', 'hod', 'staff') DEFAULT 'all',
    target_dept_id INT, -- NULL for all
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (creator_id) REFERENCES users(emp_id)
);

-- Conversation Messages
CREATE TABLE IF NOT EXISTS messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    conversation_id INT NOT NULL,
    sender_id VARCHAR(20) NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
    FOREIGN KEY (sender_id) REFERENCES users(emp_id)
);

-- Timetable
CREATE TABLE IF NOT EXISTS timetable (
    id INT AUTO_INCREMENT PRIMARY KEY,
    emp_id VARCHAR(20) NOT NULL,
    day_of_week ENUM('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday') NOT NULL,
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
    id INT AUTO_INCREMENT PRIMARY KEY,
    emp_id VARCHAR(20) NOT NULL,
    month INT NOT NULL,
    year INT NOT NULL,
    total_present INT DEFAULT 0,
    total_leave INT DEFAULT 0,
    total_lop INT DEFAULT 0,
    calculated_salary DECIMAL(10, 2),
    status ENUM('Pending', 'Paid') DEFAULT 'Pending',
    generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (emp_id) REFERENCES users(emp_id) ON DELETE CASCADE
);

-- Leave Settings (Admin Controlled)
CREATE TABLE IF NOT EXISTS leave_settings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    leave_type ENUM('CL', 'ML', 'OD', 'Comp Leave', 'LOP') NOT NULL UNIQUE,
    max_days INT NOT NULL,
    restriction_window_start TIME, -- Optional: Set time window to apply
    restriction_window_end TIME
);

-- Detailed Leave Approvals (Multi-level tracking)
CREATE TABLE IF NOT EXISTS leave_approvals (
    id INT AUTO_INCREMENT PRIMARY KEY,
    leave_request_id INT NOT NULL,
    approver_id VARCHAR(20) NOT NULL,
    approver_type ENUM('replacement', 'hod', 'principal', 'admin') NOT NULL,
    status ENUM('Pending', 'Approved', 'Rejected') DEFAULT 'Pending',
    comments TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (leave_request_id) REFERENCES leave_requests(id) ON DELETE CASCADE,
    FOREIGN KEY (approver_id) REFERENCES users(emp_id)
);

-- Birthday Log
CREATE TABLE IF NOT EXISTS birthday_log (
    id INT AUTO_INCREMENT PRIMARY KEY,
    emp_id VARCHAR(20) NOT NULL,
    wish_year INT NOT NULL,
    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (emp_id) REFERENCES users(emp_id) ON DELETE CASCADE,
    UNIQUE KEY unique_wish (emp_id, wish_year)
);

-- Notifications (Already exists, but ensuring it matches)
CREATE TABLE IF NOT EXISTS notifications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(20) NOT NULL, -- Target user
    message TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    type ENUM('leave', 'purchase', 'birthday', 'system', 'conversation') DEFAULT 'system',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(emp_id) ON DELETE CASCADE
);

-- Biometric Raw Logs (for integration)
CREATE TABLE IF NOT EXISTS biometric_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    device_id VARCHAR(50),
    emp_id VARCHAR(20) NOT NULL,
    log_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    type ENUM('IN', 'OUT') -- If device distinguishes
);
CREATE UNIQUE INDEX ux_biometric_logs_emp_time ON biometric_logs (emp_id, log_time);

-- Initial Data: Admin
INSERT IGNORE INTO users (emp_id, password, pin, role, name) VALUES 
('@PPG ZORVIAN', '$2b$10$YourHashedPasswordHere', '638581', 'admin', 'Super Admin');
-- Password needs to be hashed. 'admin123' hashed with bcrypt for example.
