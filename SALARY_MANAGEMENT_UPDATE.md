# Salary Management - Attendance Integration & System Update

## Overview
This document outlines the improvements made to the salary management system to properly integrate attendance records calculation and display in the salary records module.

## Problem Statement
Previously, the salary records system was:
1. ❌ Not properly calculating attendance from attendance_records table
2. ❌ Missing attendance breakdown details in salary records
3. ❌ Using incorrect table names in queries
4. ❌ Not displaying attendance column with proper attendance records data

## Solution Implemented

### 1. **Attendance Records Table Setup**
Created and ensured `attendance_records` table exists with proper structure:

```sql
CREATE TABLE attendance_records (
    id SERIAL PRIMARY KEY,
    emp_id VARCHAR(20) NOT NULL,
    date DATE NOT NULL,
    in_time TIME,
    out_time TIME,
    status VARCHAR(50) DEFAULT 'Absent',
    remarks TEXT,
    FOREIGN KEY (emp_id) REFERENCES users(emp_id) ON DELETE CASCADE,
    UNIQUE (emp_id, date)
)
```

**Columns:**
- `id`: Unique identifier
- `emp_id`: Employee ID (links to users table)
- `date`: Attendance date
- `in_time`: Time of entry
- `out_time`: Time of exit
- `status`: Attendance status (Present, Absent, Leave, OD, CL, ML, Holiday, etc.)
- `remarks`: Additional notes

### 2. **Attendance Data Injection**
Attendance records are now properly injected from `datas/attendance_records_rows.csv` into the database using the updated `inject_data.js` script.

**Data Points:**
- 200+ attendance records loaded
- Covers employee attendance from 2026-03-06 onwards
- Includes all required columns: in_time, out_time, status, remarks

### 3. **Attendance Calculator Utility** 
Created new `server/utils/attendanceCalculator.js` with three main functions:

#### **getAttendanceBreakdown(empId, fromDate, toDate)**
Returns detailed daily attendance breakdown for an employee:
```javascript
{
  emp_id: "5045",
  from_date: "2026-03-01",
  to_date: "2026-03-31",
  total_days: 31,
  working_days: 25,
  present_days: 15,
  absent_days: 2,
  od_days: 1,
  leave_days: 5,
  holiday_days: 3,
  details: [
    {
      date: "2026-03-06",
      status: "Present",
      category: "Present",
      in_time: "13:57:38",
      out_time: "14:10:43"
    }
    // ... more daily records
  ]
}
```

#### **getAttendanceSummaryMap(empIds, fromDate, toDate)**
Returns aggregated attendance data for multiple employees:
```javascript
{
  "5045": {
    emp_id: "5045",
    total_days: 31,
    working_days: 25,
    present_days: 15,
    absent_days: 2,
    od_days: 1,
    leave_days: 5,
    holiday_days: 3
  },
  "101": { ... },
  "802": { ... }
}
```

#### **getAttendanceByCategory(empId, fromDate, toDate)**
Returns attendance categorized for reporting:
```javascript
{
  emp_id: "5045",
  breakdown: {
    "Present": 15,
    "Absent": 2,
    "Casual/Medical Leave": 5,
    "Official Duty": 1,
    "Holiday/Weekend": 3
  }
}
```

### 4. **Salary Records Enhancement**
Updated salary calculation to properly use attendance data:

**Salary Records Table - New Columns:**
```sql
-- Attendance breakdown columns (added)
- present_days: NUMERIC(10,2)          -- Days marked as Present
- with_pay_days: NUMERIC(10,2)         -- Leave with pay (CL, ML, Comp Leave)
- without_pay_days: NUMERIC(10,2)      -- Days without pay (Absent, LOP)
- total_payable_days: NUMERIC(10,2)    -- Present + With Pay

-- Existing columns (maintained)
- total_present: INT                   -- Count of present days
- total_leave: INT                     -- Count of leave days
- total_lop: INT                       -- Count of LOP days
- calculated_salary: DECIMAL           -- Final net salary
```

### 5. **Attendance Calculation Accuracy**
The system now correctly calculates:

```
Attendance Status Categories:
├── Present          → 1 full day (payable)
├── Absent           → 0 days (not payable)
├── Leave Types
│   ├── CL (Casual Leave)           → 0 days (with pay)
│   ├── ML (Medical Leave)          → 0 days (with pay)
│   ├── Comp Leave (Compensatory)   → 0 days (with pay)
│   └── Leave                       → 0 days (with pay)
├── OD (Official Duty)  → 1 full day (payable)
├── Holiday              → 0 days (non-working)
└── Weekends             → 0 days (non-working)

Payable Days Calculation:
Total Payable = Present Days + OD Days + With Pay Leave Days
```

### 6. **Salary Calculation Formula**
The system uses this formula for salary calculation:

```
1. Daily Rate = Monthly Salary / Total Days in Period
2. Earned Salary = Daily Rate × Payable Days
3. Gross Salary Components:
   - Basic (55.2% of earned)
   - Allowances (36.8% of earned)
   - Conveyance (8% of earned)
   - Total Gross = Basic + Allowances + Conveyance
4. Deductions Applied (ESI, professional tax, etc.)
5. Net Salary = Gross Salary - Deductions
```

### 7. **Salary Records Response Format**
When retrieving salary records, the response now includes detailed attendance:

```javascript
{
  id: 1,
  emp_id: "5045",
  name: "Employee Name",
  month: 3,
  year: 2026,
  from_date: "2026-03-01",
  to_date: "2026-03-31",
  
  // **Attendance Details**
  present_days: 15,
  with_pay_days: 5,
  without_pay_days: 2,
  total_payable_days: 20,
  
  // salary details
  monthly_salary: 25000,
  gross_salary: "21000.00",
  calculated_salary: "19500.00",
  total_days_in_period: 31,
  
  // Deductions
  deductions_applied: "1500.00",
  esi_gross: "0.00",
  employee_esi: "0.00",
  
  status: "Pending",
  
  // Legacy fields (maintained for compatibility)
  total_present: 15,
  total_leave: 5,
  total_lop: 2
}
```

## New Endpoints

### Attendance Routes `/api/attendance/*`

#### 1. **GET /api/attendance/breakdown**
Get detailed daily attendance breakdown.

**Query Parameters:**
- `emp_id` (required): Employee ID
- `fromDate` (required): Start date (YYYY-MM-DD)
- `toDate` (required): End date (YYYY-MM-DD)

**Response:** Array of daily attendance records with status and category

#### 2. **GET /api/attendance/category**
Get attendance categorized summary.

**Query Parameters:**
- `emp_id` (required): Employee ID
- `fromDate` (required): Start date (YYYY-MM-DD)
- `toDate` (required): End date (YYYY-MM-DD)

**Response:** Count by attendance category

#### 3. **GET /api/attendance/summary** (Admin only)
Get attendance summary for multiple employees.

**Query Parameters:**
- `empIds` (required): Comma-separated employee IDs
- `fromDate` (required): Start date (YYYY-MM-DD)
- `toDate` (required): End date (YYYY-MM-DD)

**Response:** Map of employee IDs to attendance summaries

## Setup Instructions

### 1. **Inject Data**
```bash
node inject_data.js
```

This will:
- Create `attendance_records` table if it doesn't exist
- Inject attendance data from CSV
- Inject all leave and permission data
- Create required views and functions

### 2. **Recalculate Salaries** (After attendance data is loaded)
```bash
curl -X POST http://localhost:5000/api/salary/calculate \
  -H "Content-Type: application/json" \
  -d '{
    "month": 3,
    "year": 2026,
    "paidStatuses": ["Present", "CL", "ML", "OD", "Comp Leave", "Leave", "Holiday"],
    "unpaidStatuses": ["Absent", "LOP"]
  }'
```

### 3. **Verify Data**
```bash
# Check salary records with attendance breakdown
curl http://localhost:5000/api/salary \
  -H "Authorization: Bearer YOUR_TOKEN"

# Check specific attendance
curl "http://localhost:5000/api/attendance/breakdown?emp_id=5045&fromDate=2026-03-01&toDate=2026-03-31" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Key Improvements

✅ **Accurate Attendance Calculation**
- Attendance data now properly sourced from attendance_records table
- Daily attendance properly categorized  
- Half-day and mixed-day statuses supported

✅ **Complete Attendance Display**
- Salary records now show detailed attendance breakdown
- Present, Leave, OD, and LOP days properly calculated
- Total payable days clearly displayed

✅ **Flexible Attendance Status Support**
Recognized statuses:
- Present
- Absent / LOP
- Leave Types: CL, ML, Comp Leave, Leave
- OD (Official Duty)
- Holiday / Weekend
- Remarks for half-day and special notes

✅ **Historical Tracking**
- All salary records maintain attendance breakdown
- History preserved in salary_history table
- Easy audit trail for payroll verification

✅ **Real-time Recalculation**
- Salary calculations automatically use latest attendance
- Can recalculate on demand
- Published salary records not modified (locked)

## Database Views & Functions

### Views
- `attendance_summary`: Pre-calculated attendance categorization

### Functions
- `get_employee_attendance(emp_id, from_date, to_date)`: Get attendance metrics
- Supports recursive date generation for complete month coverage

## Troubleshooting

### Attendance Records Not Showing
1. Verify `attendance_records` table exists:
   ```sql
   SELECT COUNT(*) FROM attendance_records;
   ```

2. Check if data was injected:
   ```sql
   SELECT emp_id, date, status FROM attendance_records LIMIT 10;
   ```

3. Ensure users exist in database:
   ```sql
   SELECT emp_id FROM users WHERE LOWER(role) IN ('staff', 'hod', 'principal');
   ```

### Salary Not Recalculating
1. Clear pending salary records:
   ```sql
   DELETE FROM salary_records WHERE status = 'Pending' AND month = 3 AND year = 2026;
   ```

2. Re-calculate:
   ```bash
   node inject_data.js  # Re-inject attendance if needed
   curl -X POST http://localhost:5000/api/salary/calculate ...
   ```

### Attendance Categories Missing
1. Ensure holidays are defined:
   ```sql
   SELECT * FROM holidays WHERE h_date >= '2026-03-01' AND h_date <= '2026-03-31';
   ```

2. Check if status values match expected values in queries

## Files Modified/Created

### Created Files
- ✅ `server/utils/attendanceCalculator.js` - Attendance calculation utilities
- ✅ `setup_attendance.js` - Initial attendance table setup script
- ✅ `server/routes/attendanceRoutes.js` - New attendance endpoints

### Modified Files
- ✅ `inject_data.js` - Added attendance records injection
- ✅ `server/controllers/salaryController.js` - Updated queries to use attendance_records

### Database Changes
- ✅ Created `attendance_records` table
- ✅ Added columns to `salary_records`:
  - `present_days`
  - `with_pay_days`
  - `without_pay_days`
  - `total_payable_days`

## Performance Considerations

**Attendance Query Optimization:**
- Uses recursive CTE for date range generation
- Indexed on (emp_id, date) for fast lookups
- Holiday lookup with left join
- Minimal N+1 queries

**Recommendations:**
1. Create indexes for better performance:
   ```sql
   CREATE INDEX idx_attendance_emp_date ON attendance_records(emp_id, date);
   CREATE INDEX idx_salary_emp_period ON salary_records(emp_id, from_date, to_date);
   ```

2. Archive old records regularly to maintain query performance

## API Integration Example

```javascript
// Get employee salary with attendance
async function getSalaryWithAttendance(empId, month, year) {
  const salary = await fetch(`/api/salary?emp_id=${empId}&month=${month}&year=${year}`);
  const attendance = await fetch(`/api/attendance/breakdown?emp_id=${empId}&fromDate=2026-03-01&toDate=2026-03-31`);
  
  return {
    salary: await salary.json(),
    attendance: await attendance.json()
  };
}
```

## Maintenance Tasks

**Weekly:**
- Monitor attendance_records table for data consistency
- Verify salary calculation accuracy

**Monthly (End of Period):**
- Run salary calculation for all employees
- Review attendance discrepancies
- Archive old salary records

**Quarterly:**
- Review holiday calendar
- Update leave policies if needed
- Audit deduction calculations

---

**Last Updated:** April 2026
**Version:** 2.0 (With Attendance Integration)
**Status:** ✅ Production Ready
