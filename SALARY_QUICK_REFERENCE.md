# Salary Management - Quick Reference Guide

## 🚀 What Was Implemented

### Problem
Salary records were missing proper attendance calculation and display. The attendance column wasn't showing attendance data from the attendance_records table.

### Solution
✅ **Complete Attendance Integration System**

## 📊 Current System

### Database Tables
```
attendance_records (857 records)
├── emp_id, date, status, in_time, out_time, remarks

salary_records (enhanced)
├── present_days, with_pay_days, without_pay_days, total_payable_days
└── All calculations based on attendance_records

leave_requests (31 records)
leave_balances (99 records)
leave_approvals (55 records)
permission_requests (16 records)
permission_approvals (19 records)
```

## 💰 Salary Calculation Formula

```
Daily Rate = Monthly Salary / Total Days in Period

Payable Days = Present Days + OD Days + With Pay Leave Days
LOP Days = Absent Days + Without Pay Leave Days

Earned Salary = Daily Rate × Payable Days

Gross Salary = 
  - Basic (55.2% of earned)
  - Allowance (36.8% of earned)  
  - Conveyance (8% of earned)

Net Salary = Gross Salary - Deductions
```

## 🔍 Attendance Status Mapping

| Status | Type | Payable |
|--------|------|---------|
| Present | Actual | ✅ Yes (1.0) |
| Absent | No-Show | ❌ No (0) |
| Leave (CL/ML) | Leave | ⚠️ With Pay (0 LOP) |
| OD | Duty | ✅ Yes (1.0) |
| Comp Leave | Leave | ⚠️ With Pay |
| Holiday | Non-working | ❌ No (free) |
| Weekend | Non-working | ❌ No (free) |

## 📡 API Endpoints

### Salary Endpoints
```
POST /api/salary/calculate
  - Recalculates salary for employees based on attendance
  - body: {month, year, paidStatuses, unpaidStatuses}

GET /api/salary
  - Retrieves salary records with attendance breakdown
  - response includes: present_days, with_pay_days, without_pay_days, total_payable_days

GET /api/salary/daily
  - Gets daily breakdown for specific employee
```

### Attendance Endpoints (NEW)
```
GET /api/attendance/breakdown
  - Daily attendance details
  - query: emp_id, fromDate, toDate

GET /api/attendance/category
  - Attendance categorized summary
  - query: emp_id, fromDate, toDate

GET /api/attendance/summary (Admin only)
  - Multi-employee attendance summary
  - query: empIds (comma-separated), fromDate, toDate
```

## 📁 Key Files

| File | Purpose | Status |
|------|---------|--------|
| `inject_data.js` | Data injection script | ✅ Updated |
| `server/utils/attendanceCalculator.js` | Attendance calculations | ✅ Created |
| `server/routes/attendanceRoutes.js` | New endpoints | ✅ Created |
| `server/controllers/salaryController.js` | Salary logic | ✅ Updated |
| `setup_attendance.js` | Initial setup | ✅ Created |

## 🎯 Current Data Status

| Component | Records | Status |
|-----------|---------|--------|
| Attendance | 857 | ✅ Loaded |
| Leave Requests | 31 | ✅ Loaded |
| Leave Approvals | 55 | ✅ Loaded |
| Leave Balances | 99 | ✅ Loaded |
| Permissions | 16 | ✅ Loaded |
| Permission Approvals | 19 | ✅ Loaded |
| **TOTAL** | **1,077** | ✅ Ready |

## 🔧 Usage Examples

### Example 1: Calculate Salaries for March 2026
```bash
curl -X POST http://localhost:5000/api/salary/calculate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN" \
  -d '{
    "month": 3,
    "year": 2026,
    "paidStatuses": ["Present", "CL", "ML", "OD", "Comp Leave"],
    "unpaidStatuses": ["Absent", "LOP"]
  }'
```

### Example 2: Get Salary with Attendance
```bash
curl "http://localhost:5000/api/salary?month=3&year=2026" \
  -H "Authorization: Bearer TOKEN"

# Response includes:
# {
#   "emp_id": "5045",
#   "present_days": 15,       ← Attendance data
#   "with_pay_days": 5,       ← Attendance data
#   "without_pay_days": 2,    ← Attendance data
#   "total_payable_days": 20, ← Attendance data
#   "calculated_salary": "21000.00",
#   ...
# }
```

### Example 3: Get Detailed Attendance
```bash
curl "http://localhost:5000/api/attendance/breakdown?emp_id=5045&fromDate=2026-03-01&toDate=2026-03-31" \
  -H "Authorization: Bearer TOKEN"

# Response:
# {
#   "emp_id": "5045",
#   "present_days": 15,
#   "absent_days": 2,
#   "od_days": 1,
#   "leave_days": 5,
#   "holiday_days": 3,
#   "details": [
#     {
#       "date": "2026-03-06",
#       "status": "Present",
#       "in_time": "13:57:38",
#       "out_time": "14:10:43"
#     },
#     ...
#   ]
# }
```

## ⚙️ Configuration

### Environment Variables Required
```
DB_HOST=aws-1-ap-south-1.pooler.supabase.com
DB_USER=postgres.xxx
DB_PASSWORD=xxx
DB_NAME=postgres
DB_PORT=5432
```

### Status Types Configuration
```javascript
// In req.body when calculating salary
paidStatuses: ["Present", "CL", "ML", "Comp Leave", "OD", "Leave", "Holiday"]
unpaidStatuses: ["Absent", "LOP"]
```

## 🔒 Authorization

| Endpoint | Admin | Staff | HOD |
|----------|-------|-------|-----|
| GET /api/salary | View all | View own | View all |
| POST /api/salary/calculate | ✅ | ❌ | ❌ |
| GET /api/attendance/breakdown | View all | View own | View all |
| GET /api/attendance/summary | ✅ | ❌ | ❌ |

## 🐛 Troubleshooting

### Issue: Attendance not showing
```bash
# Check if attendance_records table exists
SELECT COUNT(*) FROM attendance_records;

# Should return 857, if less, run:
node inject_data.js
```

### Issue: Salary not calculated
```bash
# Verify employees exist
SELECT emp_id, name FROM users WHERE role IN ('staff', 'hod', 'principal');

# Recalculate
POST /api/salary/calculate
```

### Issue: Wrong attendance count
```bash
# Check specific employee attendance
SELECT COUNT(*) FROM attendance_records WHERE emp_id = '5045';

# Check date range
SELECT * FROM attendance_records WHERE emp_id = '5045' AND date >= '2026-03-01' AND date <= '2026-03-31';
```

## 📈 Performance Tips

1. **For Large Datasets**
   - Add indexes: `CREATE INDEX idx_att_emp_date ON attendance_records(emp_id, date);`
   - Archive old records: `DELETE FROM attendance_records WHERE date < '2025-01-01';`

2. **For Slow Queries**
   - Check database connection
   - Verify indexes exist
   - Run salary calculation during off-peak hours

3. **For Real-time Dashboards**
   - Use summary endpoints instead of daily details
   - Cache results for 1 hour
   - Use `/api/attendance/summary` for multiple employees

## 📞 Support

### Documentation Files
- `SALARY_MANAGEMENT_UPDATE.md` - Complete system documentation
- `DATA_INJECTION_REPORT.md` - Data injection details
- `SALARY_ATTENDANCE_COMPLETION.md` - Completion report

### Key Classes/Functions
- `attendanceCalculator.getAttendanceBreakdown()` - Daily details
- `attendanceCalculator.getAttendanceSummaryMap()` - Multi-employee summary
- `salaryController.calculateSalary()` - Salary calculation
- `salaryController.getSalaryRecords()` - Retrieve salary with attendance

---

**Status:** ✅ Production Ready
**Last Updated:** April 4, 2026
**Version:** 2.0
