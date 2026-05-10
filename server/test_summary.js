const { pool } = require('./config/db');

async function test() {
    try {
        const today = new Date().toISOString().split('T')[0];
        const month = today.slice(0, 7);

        // Date Branch
        let dateQuery = `
            SELECT 
                u.role,
                COUNT(u.emp_id) as total_users,
                SUM(CASE WHEN a.status = 'Present' THEN 1 ELSE 0 END) as present,
                SUM(CASE WHEN a.status IN ('Comp Leave', 'CL', 'ML') THEN 1 ELSE 0 END) as "leave",
                SUM(CASE WHEN a.status = 'OD' THEN 1 ELSE 0 END) as od,
                SUM(CASE WHEN a.status IN ('Absent', 'LOP') THEN 1 ELSE 0 END) as lop
            FROM public.users u
            LEFT JOIN attendance a ON u.emp_id = a.emp_id AND a.date = $1
            WHERE u.role IN ('principal', 'hod', 'staff')
            GROUP BY u.role
        `;
        const { rows: dateRows } = await pool.query(dateQuery, [today]);
        console.log('Date Branch Rows:', dateRows);

        // Month Branch
        let monthQuery = `
            SELECT 
                u.emp_id, u.name, u.role,
                COALESCE(SUM(CASE WHEN a.status = 'Present' THEN 1 ELSE 0 END), 0) as total_present,
                COALESCE(SUM(CASE WHEN a.status IN ('Comp Leave', 'CL', 'ML') THEN 1 ELSE 0 END), 0) as total_leave,
                COALESCE(SUM(CASE WHEN a.status = 'OD' THEN 1 ELSE 0 END), 0) as total_od,
                COALESCE(SUM(CASE WHEN a.status IN ('Absent', 'LOP') THEN 1 ELSE 0 END), 0) as total_lop
            FROM public.users u
            LEFT JOIN attendance a ON u.emp_id = a.emp_id AND TO_CHAR(a.date, 'YYYY-MM') = $1
            WHERE u.role IN ('principal', 'hod', 'staff')
            GROUP BY u.emp_id, u.name, u.role
            ORDER BY u.name ASC
        `;
        const { rows: monthRows } = await pool.query(monthQuery, [month]);
        console.log('Month Branch Rows (first 2):', monthRows.slice(0, 2));

    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}

test();
