-- Adds period-aware and immutable-payment fields for salary records
-- Safe to run multiple times.

ALTER TABLE salary_records
ADD COLUMN IF NOT EXISTS with_pay_count NUMERIC(10, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS without_pay_count NUMERIC(10, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS deductions_applied NUMERIC(12, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS gross_salary NUMERIC(12, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_days_in_period INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS from_date DATE,
ADD COLUMN IF NOT EXISTS to_date DATE,
ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP;

-- Backfill period dates from month/year if records are legacy and dates are missing.
UPDATE salary_records
SET from_date = COALESCE(from_date, make_date(year, month, 1)),
    to_date = COALESCE(to_date, (make_date(year, month, 1) + INTERVAL '1 month - 1 day')::date)
WHERE (from_date IS NULL OR to_date IS NULL)
  AND month IS NOT NULL
  AND year IS NOT NULL;

-- Speeds up exact period queries and lock checks.
CREATE INDEX IF NOT EXISTS idx_salary_records_emp_period
ON salary_records (emp_id, from_date, to_date);

CREATE INDEX IF NOT EXISTS idx_salary_records_period_status
ON salary_records (from_date, to_date, status);
