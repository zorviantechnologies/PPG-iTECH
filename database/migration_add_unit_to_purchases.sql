-- Migration: Add unit column to purchases table
-- Description: Add unit field to store measurement units (litre, kg, piece)

DO $$ BEGIN
    CREATE TYPE purchase_unit AS ENUM ('piece', 'kg', 'litre');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

ALTER TABLE purchases 
ADD COLUMN IF NOT EXISTS unit purchase_unit DEFAULT 'piece';

-- Verify the change
-- SELECT * FROM purchases LIMIT 1;
