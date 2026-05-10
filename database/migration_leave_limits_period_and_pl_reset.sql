-- Migration: Add period dates and monthly PL reset support for leave limits
-- Safe to run multiple times

ALTER TABLE leave_limits
    ADD COLUMN IF NOT EXISTS permission_limit INT DEFAULT 2,
    ADD COLUMN IF NOT EXISTS from_month VARCHAR(10),
    ADD COLUMN IF NOT EXISTS to_month VARCHAR(10),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE leave_balances
    ADD COLUMN IF NOT EXISTS permission_taken INT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS last_permission_reset_month VARCHAR(7);

-- Backfill rows where permission_limit is null
UPDATE leave_limits
SET permission_limit = 2
WHERE permission_limit IS NULL;

-- Initialize last reset month for existing records so next month rollover resets correctly
UPDATE leave_balances
SET last_permission_reset_month = TO_CHAR(CURRENT_DATE, 'YYYY-MM')
WHERE last_permission_reset_month IS NULL;
