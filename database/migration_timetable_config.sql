-- Migration: Timetable Configuration Table (V2 - Flexible Periods)
-- Run this in your Supabase SQL editor or PostgreSQL console

-- Drop existing if needed to recreate with new logic
DROP TABLE IF EXISTS timetable_config;

CREATE TABLE timetable_config (
    id SERIAL PRIMARY KEY,
    sort_order INT NOT NULL,           -- The absolute position in the day (1, 2, 3...)
    period_number INT,                 -- The teaching period number (1, 2, 3...). NULL if is_break.
    label VARCHAR(50) DEFAULT '',      -- Visual name (e.g. "Theory", "Lunch", "Lab")
    start_time TIME,
    end_time TIME,
    is_break BOOLEAN DEFAULT FALSE,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Seed defaults
INSERT INTO timetable_config (sort_order, period_number, label, start_time, end_time, is_break) VALUES
    (1, 1,    'Period 1',  '08:00', '08:50', FALSE),
    (2, 2,    'Period 2',  '08:50', '09:40', FALSE),
    (3, 3,    'Period 3',  '09:40', '10:30', FALSE),
    (4, NULL, 'Short Break','10:30', '10:50', TRUE),
    (5, 4,    'Period 4',  '10:50', '11:40', FALSE),
    (6, 5,    'Period 5',  '11:40', '12:30', FALSE),
    (7, NULL, 'Lunch',     '12:30', '13:10', TRUE),
    (8, 6,    'Period 6',  '13:10', '14:00', FALSE),
    (9, 7,    'Period 7',  '14:00', '14:50', FALSE),
    (10,8,    'Period 8',  '14:50', '15:40', FALSE);
