const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { pool } = require('../config/db');

async function generateAttendance() {
    const year = 2026;
    const month = 1; // February (0-indexed)
    const daysInMonth = 28;

    // Real Enum: Present, Absent, CL, ML, OD, "Comp Leave", LOP, Holiday, Weekend
    console.log(`Generating attendance for all employees in February ${year}...`);

    try {
        // Fetch all employees
        const { rows: employees } = await pool.query(
            "SELECT emp_id, name, role FROM users WHERE role IN ('principal', 'hod', 'staff')"
        );

        if (employees.length === 0) {
            console.log('No employees found to generate attendance for.');
            return;
        }

        console.log(`Found ${employees.length} employees.`);

        for (const emp of employees) {
            console.log(`Processing ${emp.name} (${emp.emp_id})...`);

            for (let day = 1; day <= daysInMonth; day++) {
                const dateString = `${year}-${(month + 1).toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
                const date = new Date(year, month, day);
                const dayOfWeek = date.getDay(); // 0 is Sunday, 6 is Saturday

                let status = 'Present';
                let inTime = null;
                let outTime = null;

                if (dayOfWeek === 0 || dayOfWeek === 6) {
                    status = 'Weekend';
                } else {
                    // Randomize status for work days
                    const rand = Math.random();
                    if (rand < 0.10) {
                        status = 'Absent';
                    } else if (rand < 0.15) {
                        status = 'OD';
                    } else if (rand < 0.20) {
                        status = 'CL'; // Using CL for Leave as per enum
                    } else {
                        status = 'Present';
                    }

                    if (status === 'Present' || status === 'OD') {
                        const inHour = 8;
                        const inMin = Math.floor(Math.random() * 30) + 45; // 8:45 - 9:15
                        const finalInMin = inMin >= 60 ? inMin - 60 : inMin;
                        const finalInHour = inMin >= 60 ? inHour + 1 : inHour;
                        inTime = `${finalInHour.toString().padStart(2, '0')}:${finalInMin.toString().padStart(2, '0')}:00`;

                        const outHour = 16;
                        const outMin = Math.floor(Math.random() * 30) + 45; // 16:45 - 17:15
                        const finalOutMin = outMin >= 60 ? outMin - 60 : outMin;
                        const finalOutHour = outMin >= 60 ? outHour + 1 : outHour;
                        outTime = `${finalOutHour.toString().padStart(2, '0')}:${finalOutMin.toString().padStart(2, '0')}:00`;
                    }
                }

                try {
                    await pool.query(
                        `INSERT INTO attendance (emp_id, date, in_time, out_time, status)
                         VALUES ($1, $2, $3, $4, $5)
                         ON CONFLICT (emp_id, date) DO UPDATE 
                         SET in_time = EXCLUDED.in_time, 
                             out_time = EXCLUDED.out_time, 
                             status = EXCLUDED.status`,
                        [emp.emp_id, dateString, inTime, outTime, status]
                    );
                } catch (e) {
                    console.error(`Error inserting ${emp.emp_id} on ${dateString}: ${e.message}`);
                    throw e; // Re-throw to stop
                }
            }
        }
        console.log('Attendance generation completed successfully.');
    } catch (error) {
        console.error('Final Error generating attendance:', error.message);
    } finally {
        await pool.end();
    }
}

generateAttendance();
