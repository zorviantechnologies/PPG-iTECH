/**
 * Attendance Calculation Utilities
 * Provides functions to calculate attendance metrics from attendance_records table
 */

const { queryWithRetry } = require('../config/db');

/**
 * Get detailed attendance breakdown for an employee within a date range
 * @param {string} empId - Employee ID
 * @param {string} fromDate - Start date (YYYY-MM-DD)
 * @param {string} toDate - End date (YYYY-MM-DD)
 * @returns {Promise<Object>} Attendance breakdown with daily and aggregated data
 */
async function getAttendanceBreakdown(empId, fromDate, toDate) {
    try {
        const query = `
            WITH RECURSIVE date_range AS (
                SELECT $1::date as d
                UNION ALL
                SELECT (d + 1)::date FROM date_range 
                WHERE d < $2::date
            ),
            calendar_with_holidays AS (
                SELECT 
                    dr.d,
                    COALESCE(h.type, 
                        CASE WHEN EXTRACT(DOW FROM dr.d) IN (0, 6) THEN 'Holiday' 
                             ELSE 'Working Day' 
                        END
                    ) AS day_type
                FROM date_range dr
                LEFT JOIN holidays h ON h.h_date = dr.d
            ),
            attendance_data AS (
                SELECT
                    cwh.d as date,
                    cwh.day_type,
                    COALESCE(ar.status, CASE WHEN cwh.day_type = 'Holiday' THEN 'Holiday' ELSE 'Absent' END) as status,
                    COALESCE(ar.remarks, '') as remarks,
                    ar.in_time,
                    ar.out_time
                FROM calendar_with_holidays cwh
                LEFT JOIN attendance_records ar 
                    ON ar.emp_id = $3 AND ar.date = cwh.d
            )
            SELECT
                date,
                status,
                remarks,
                in_time,
                out_time,
                day_type,
                CASE 
                    WHEN status = 'Present' THEN 1
                    WHEN status = 'OD' THEN 1
                    WHEN status IN ('Holiday', 'Leave', 'CL', 'ML', 'Comp Leave') THEN 0
                    ELSE 0
                END as is_payable,
                CASE 
                    WHEN status = 'Present' THEN 'Present'
                    WHEN status = 'Absent' THEN 'Absent'
                    WHEN status IN ('CL', 'ML') THEN 'With Pay Leave'
                    WHEN status = 'OD' THEN 'Official Duty'
                    WHEN status = 'Comp Leave' THEN 'Compensatory Leave'
                    WHEN status = 'Holiday' THEN 'Holiday'
                    ELSE 'Other'
                END as category
            FROM attendance_data
            ORDER BY date
        `;

        const { rows } = await queryWithRetry(query, [fromDate, toDate, empId]);

        // Calculate aggregates
        const summary = {
            emp_id: empId,
            from_date: fromDate,
            to_date: toDate,
            total_days: 0,
            working_days: 0,
            present_days: 0,
            absent_days: 0,
            od_days: 0,
            leave_days: 0,
            holiday_days: 0,
            details: []
        };

        rows.forEach(record => {
            summary.total_days++;
            summary.details.push({
                date: record.date,
                status: record.status,
                category: record.category,
                remarks: record.remarks,
                in_time: record.in_time,
                out_time: record.out_time
            });

            if (record.day_type !== 'Holiday') {
                summary.working_days++;
            }

            if (record.status === 'Present') {
                summary.present_days++;
            } else if (record.status === 'Absent') {
                summary.absent_days++;
            } else if (record.status === 'OD') {
                summary.od_days++;
            } else if (record.status === 'Holiday') {
                summary.holiday_days++;
            } else if (record.status && ['CL', 'ML', 'Comp Leave', 'Leave'].includes(record.status)) {
                summary.leave_days++;
            }
        });

        return summary;
    } catch (error) {
        console.error('getAttendanceBreakdown ERROR:', error);
        return {
            emp_id: empId,
            from_date: fromDate,
            to_date: toDate,
            error: error.message,
            total_days: 0,
            working_days: 0,
            present_days: 0,
            absent_days: 0,
            od_days: 0,
            leave_days: 0,
            holiday_days: 0,
            details: []
        };
    }
}

/**
 * Get monthly attendance summary for multiple employees
 * @param {string[]} empIds - Array of employee IDs
 * @param {string} fromDate - Start date (YYYY-MM-DD)
 * @param {string} toDate - End date (YYYY-MM-DD)
 * @returns {Promise<Object>} Map of emp_id to attendance summary
 */
async function getAttendanceSummaryMap(empIds, fromDate, toDate) {
    try {
        const placeholders = empIds.map((_, i) => `$${i + 3}`).join(',');
        const query = `
            WITH RECURSIVE date_range AS (
                SELECT $1::date as d
                UNION ALL
                SELECT (d + 1)::date FROM date_range 
                WHERE d < $2::date
            ),
            calendar_with_holidays AS (
                SELECT 
                    dr.d,
                    COALESCE(h.type, 
                        CASE WHEN EXTRACT(DOW FROM dr.d) IN (0, 6) THEN 'Holiday' 
                             ELSE 'Working Day' 
                        END
                    ) AS day_type
                FROM date_range dr
                LEFT JOIN holidays h ON h.h_date = dr.d
            ),
            attendance_data AS (
                SELECT
                    TRIM(ar.emp_id) as emp_id,
                    cwh.d as date,
                    cwh.day_type,
                    COALESCE(ar.status, CASE WHEN cwh.day_type = 'Holiday' THEN 'Holiday' ELSE 'Absent' END) as status
                FROM calendar_with_holidays cwh
                CROSS JOIN (SELECT DISTINCT TRIM(emp_id) as emp_id FROM attendance_records WHERE emp_id = ANY($3::text[])) as emp_list
                LEFT JOIN attendance_records ar 
                    ON ar.emp_id = emp_list.emp_id AND ar.date = cwh.d
            )
            SELECT
                emp_id,
                COUNT(*) as total_days,
                SUM(CASE WHEN status = 'Present' THEN 1 ELSE 0 END) as present_days,
                SUM(CASE WHEN status = 'Absent' THEN 1 ELSE 0 END) as absent_days,
                SUM(CASE WHEN status = 'OD' THEN 1 ELSE 0 END) as od_days,
                SUM(CASE WHEN status IN ('CL', 'ML', 'Comp Leave', 'Leave') THEN 1 ELSE 0 END) as leave_days,
                SUM(CASE WHEN status = 'Holiday' THEN 1 ELSE 0 END) as holiday_days,
                SUM(CASE WHEN day_type != 'Holiday' THEN 1 ELSE 0 END) as working_days
            FROM attendance_data
            GROUP BY emp_id
        `;

        const { rows } = await queryWithRetry(query, [fromDate, toDate, empIds]);

        const map = {};
        rows.forEach(row => {
            map[row.emp_id] = {
                emp_id: row.emp_id,
                from_date: fromDate,
                to_date: toDate,
                total_days: parseInt(row.total_days) || 0,
                working_days: parseInt(row.working_days) || 0,
                present_days: parseInt(row.present_days) || 0,
                absent_days: parseInt(row.absent_days) || 0,
                od_days: parseInt(row.od_days) || 0,
                leave_days: parseInt(row.leave_days) || 0,
                holiday_days: parseInt(row.holiday_days) || 0
            };
        });

        return map;
    } catch (error) {
        console.error('getAttendanceSummaryMap ERROR:', error);
        return {};
    }
}

/**
 * Get attendance by category for reporting
 * @param {string} empId - Employee ID
 * @param {string} fromDate - Start date (YYYY-MM-DD)
 * @param {string} toDate - End date (YYYY-MM-DD)
 * @returns {Promise<Object>} Attendance categorized breakdown
 */
async function getAttendanceByCategory(empId, fromDate, toDate) {
    try {
        const query = `
            WITH RECURSIVE date_range AS (
                SELECT $1::date as d
                UNION ALL
                SELECT (d + 1)::date FROM date_range 
                WHERE d < $2::date
            ),
            calendar_with_holidays AS (
                SELECT 
                    dr.d,
                    COALESCE(h.type, 
                        CASE WHEN EXTRACT(DOW FROM dr.d) IN (0, 6) THEN 'Holiday' 
                             ELSE 'Working Day' 
                        END
                    ) AS day_type
                FROM date_range dr
                LEFT JOIN holidays h ON h.h_date = dr.d
            ),
            attendance_data AS (
                SELECT
                    cwh.d as date,
                    cwh.day_type,
                    COALESCE(ar.status, CASE WHEN cwh.day_type = 'Holiday' THEN 'Holiday' ELSE 'Absent' END) as status,
                    CASE 
                        WHEN COALESCE(ar.status, CASE WHEN cwh.day_type = 'Holiday' THEN 'Holiday' ELSE 'Absent' END) = 'Present' THEN 'Present'
                        WHEN COALESCE(ar.status, CASE WHEN cwh.day_type = 'Holiday' THEN 'Holiday' ELSE 'Absent' END) = 'Absent' THEN 'Absent'
                        WHEN COALESCE(ar.status, CASE WHEN cwh.day_type = 'Holiday' THEN 'Holiday' ELSE 'Absent' END) IN ('CL', 'ML') THEN 'Casual/Medical Leave'
                        WHEN COALESCE(ar.status, CASE WHEN cwh.day_type = 'Holiday' THEN 'Holiday' ELSE 'Absent' END) = 'OD' THEN 'Official Duty'
                        WHEN COALESCE(ar.status, CASE WHEN cwh.day_type = 'Holiday' THEN 'Holiday' ELSE 'Absent' END) = 'Comp Leave' THEN 'Compensatory Leave'
                        WHEN COALESCE(ar.status, CASE WHEN cwh.day_type = 'Holiday' THEN 'Holiday' ELSE 'Absent' END) = 'Holiday' THEN 'Holiday/Weekend'
                        ELSE 'Other'
                    END as category
                FROM calendar_with_holidays cwh
                LEFT JOIN attendance_records ar ON ar.emp_id = $3 AND ar.date = cwh.d
            )
            SELECT
                category,
                COUNT(*) as count
            FROM attendance_data
            GROUP BY category
            ORDER BY count DESC
        `;

        const { rows } = await queryWithRetry(query, [fromDate, toDate, empId]);

        const categories = {};
        rows.forEach(row => {
            categories[row.category] = parseInt(row.count) || 0;
        });

        return {
            emp_id: empId,
            from_date: fromDate,
            to_date: toDate,
            breakdown: categories
        };
    } catch (error) {
        console.error('getAttendanceByCategory ERROR:', error);
        return {
            emp_id: empId,
            from_date: fromDate,
            to_date: toDate,
            error: error.message,
            breakdown: {}
        };
    }
}

module.exports = {
    getAttendanceBreakdown,
    getAttendanceSummaryMap,
    getAttendanceByCategory
};
