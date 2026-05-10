DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'unique_salary_record') THEN
        ALTER TABLE salary_records ADD CONSTRAINT unique_salary_record UNIQUE (emp_id, month, year);
    END IF;
END $$;
