const { pool } = require('../config/db');
const { calculateSalary } = require('../controllers/salaryController');

// This script is for manual verification of the salary calculation endpoint
// To run: node tests/test_salary_logic.js

async function verifySalary() {
    console.log("Starting Salary Calculation Verification...");

    try {
        // 1. Ensure a user exists with a salary
        const [users] = await pool.query('SELECT * FROM users LIMIT 1');
        if (users.length === 0) {
            console.error("No users found to test.");
            return;
        }
        const user = users[0];
        console.log(`Testing with User: ${user.name} (ID: ${user.emp_id}), Monthly Salary: ${user.monthly_salary}`);

        // 2. Insert some dummy attendance records for the month (e.g., Feb 2026)
        const month = 2;
        const year = 2026;

        console.log("Inserting dummy attendance data...");
        // 20 days present, 2 days CL (paid), 1 day LOP (unpaid)
        const records = [
            ...Array(20).fill('Present'),
            'CL', 'CL',
            'LOP'
        ];

        for (let i = 1; i <= records.length; i++) {
            const date = `2026-02-${String(i).padStart(2, '0')}`;
            await pool.query('INSERT IGNORE INTO attendance (emp_id, date, status) VALUES (?, ?, ?)', [user.emp_id, date, records[i - 1]]);
        }

        // 3. Trigger Calculation Logic Simulation
        // We mock the req/res for the controller
        const req = {
            body: { month, year, emp_id: user.emp_id }
        };
        const res = {
            json: (data) => {
                console.log("Calculation Result:", data);
                const calc = data.results[0].calculated_salary;
                const expectedPerDay = user.monthly_salary / 30;
                const expectedTotal = (expectedPerDay * (20 + 2)).toFixed(2);

                if (calc === expectedTotal) {
                    console.log(`✅ VERIFIED: Calculated Salary (${calc}) matches Expected (${expectedTotal})`);
                } else {
                    console.log(`❌ FAILED: Calculated Salary (${calc}) vs Expected (${expectedTotal})`);
                }
            },
            status: (code) => ({ json: (data) => console.log(`Error ${code}:`, data) })
        };

        await calculateSalary(req, res);

    } catch (err) {
        console.error("Verification failed:", err);
    } finally {
        process.exit();
    }
}

// Note: Running this requires the DB connection config to be correct.
// verifySalary();
