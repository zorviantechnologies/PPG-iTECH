-- Migration: Add per-employee leave limits table
-- Run this in your Supabase SQL editor or PostgreSQL console

CREATE TABLE IF NOT EXISTS leave_limits (
    id SERIAL PRIMARY KEY,
    emp_id VARCHAR(20) NOT NULL,
    year INT NOT NULL,
    cl_limit INT DEFAULT 12,
    ml_limit INT DEFAULT 12,
    od_limit INT DEFAULT 10,
    comp_limit INT DEFAULT 6,
    lop_limit INT DEFAULT 30,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (emp_id) REFERENCES users(emp_id) ON DELETE CASCADE,
    UNIQUE (emp_id, year)
);

-- Seed default limits for existing employees for the current year
INSERT INTO leave_limits (emp_id, year, cl_limit, ml_limit, od_limit, comp_limit, lop_limit)
SELECT emp_id, EXTRACT(YEAR FROM NOW())::INT, 12, 12, 10, 6, 30
FROM users
ON CONFLICT (emp_id, year) DO NOTHING;
