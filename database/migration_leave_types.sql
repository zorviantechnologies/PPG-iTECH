-- Migration: Create leave_types table for dynamic leave type management
-- Run this migration to enable admin leave type CRUD

CREATE TABLE IF NOT EXISTS leave_types (
    id SERIAL PRIMARY KEY,
    key VARCHAR(50) NOT NULL UNIQUE,
    label VARCHAR(20) NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    color VARCHAR(20) NOT NULL DEFAULT 'blue',
    default_days INT NOT NULL DEFAULT 12,
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Seed default leave types
INSERT INTO leave_types (key, label, full_name, color, default_days, is_default) VALUES
    ('cl', 'CL', 'Casual Leave', 'blue', 12, TRUE),
    ('ml', 'ML', 'Medical Leave', 'rose', 12, TRUE),
    ('od', 'OD', 'On Duty', 'amber', 10, TRUE),
    ('comp', 'Comp Leave', 'Compensatory Leave', 'purple', 6, TRUE),
    ('lop', 'LOP', 'Loss of Pay', 'gray', 30, TRUE)
ON CONFLICT (key) DO NOTHING;
