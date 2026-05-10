-- Create Biometric Attendance Table as requested
CREATE TABLE IF NOT EXISTS biometric_attendance (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(20) NOT NULL,
    date DATE NOT NULL,
    intime TIME,
    outtime TIME,
    FOREIGN KEY (user_id) REFERENCES users(emp_id) ON DELETE CASCADE,
    UNIQUE (user_id, date)
);

-- Add device_ip to biometric_logs if needed for multi-device setup
ALTER TABLE biometric_logs ADD COLUMN IF NOT EXISTS device_ip VARCHAR(50);

-- Prevent exact duplicate punch rows for the same employee and timestamp
CREATE UNIQUE INDEX IF NOT EXISTS ux_biometric_logs_emp_time
ON biometric_logs (emp_id, log_time);
