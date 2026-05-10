-- Migration: Add request_type column to leave_requests for comp off credit flow
-- Run this migration before starting the server

ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS request_type VARCHAR(20) DEFAULT 'leave';

-- Index for quick lookup of comp_credit requests
CREATE INDEX IF NOT EXISTS idx_leave_requests_request_type ON leave_requests(request_type);
CREATE INDEX IF NOT EXISTS idx_leave_requests_comp_credit ON leave_requests(emp_id, request_type, status, from_date);
