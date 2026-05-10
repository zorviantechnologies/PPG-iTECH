# Data Injection Summary

## Overview
A comprehensive data injection script has been created to load CSV data from the `datas` folder into the PostgreSQL database for the PPG iTECH employee management system.

## Successfully Injected Data

The following data was successfully injected from CSV files into the database tables:

### 1. Leave Requests
- **File**: `datas/leave_requests_rows.csv`
- **Table**: `leave_requests`
- **Records Injected**: 31 inserted, 2 skipped
- **Columns**: id, emp_id, leave_type, from_date, to_date, days_count, reason, alternative_staff_id, status, approver_role, created_at

### 2. Leave Balances
- **File**: `datas/leave_balances_rows.csv`
- **Table**: `leave_balances`
- **Records Injected**: 99 inserted, 1 skipped
- **Columns**: emp_id, year, cl_taken, ml_taken, od_taken, comp_taken, lop_taken, permission_taken, last_permission_reset_month
- **Note**: Uses UPSERT operation - updates records if emp_id and year combination already exists

### 3. Leave Approvals
- **File**: `datas/leave_approvals_rows.csv`
- **Table**: `leave_approvals`
- **Records Injected**: 55 inserted, 2 skipped
- **Columns**: id, leave_request_id, approver_id, approver_type, status, comments, updated_at
- **Note**: 2 records skipped due to missing parent leave_requests (foreign key constraints)

### 4. Permission Requests
- **File**: `datas/permission_requests_rows.csv`
- **Table**: `permission_requests`
- **Records Injected**: 16 inserted, 1 skipped
- **Columns**: id, emp_id, date, from_time, to_time, subject, reason, status, created_at

### 5. Permission Approvals
- **File**: `datas/permission_approvals_rows.csv`
- **Table**: `permission_approvals`
- **Records Injected**: 19 inserted, 0 skipped
- **Columns**: id, permission_id, approver_id, approver_type, status, comments, updated_at

## Total Records Injected
- **Grand Total**: 220 records successfully inserted into database

## Technical Details

### Database Configuration
- **Database**: PostgreSQL (Supabase)
- **Host**: aws-1-ap-south-1.pooler.supabase.com
- **Port**: 5432
- **Configuration File**: `server/.env`

### CSV Parser Features
- Handles quoted fields containing commas
- Properly parses JSON data in complex columns (dates_detail)
- Supports escaped quotes in CSV data
- Handles multi-line values

### Data Type Conversions
- Integer fields: Properly parsed from string values
- Decimal/Float fields: Converted with fallback to 0 for missing values
- Date fields: Converted to JavaScript Date objects using YYYY-MM-DD format
- Boolean fields: Recognized 'true'/'false' string values
- Null values: Empty strings and 'null' strings converted to SQL NULL

### Error Handling
- Records with parsing errors are skipped with detailed logging
- Foreign key constraint violations are handled gracefully
- ON CONFLICT clauses prevent duplicate insertions
- Each insert operation is individually wrapped in try-catch

## Files Created

1. **inject_data.js** - Main data injection script
   - Reads CSV files from `datas` folder
   - Parses CSV with robust quote handling
   - Converts data types appropriately
   - Handles database constraints

2. **verify_data.js** - Data verification script
   - Counts records in each table
   - Shows sample data from each table
   - Confirms successful data storage

## How to Run

### First Time Setup
```bash
npm install pg dotenv
```

### Inject Data
```bash
node inject_data.js
```

### Verify Data
```bash
node verify_data.js
```

## Skipped Records

### Leave Requests (2 skipped)
- These likely had parsing issues with complex JSON in the dates_detail column

### Leave Balances (1 skipped)
- Possibly due to invalid numeric values or format issues

### Leave Approvals (2 skipped)
- Foreign key constraint violations - referenced leave_request records don't exist in database

### Permission Requests (1 skipped)
- Data parsing or format issue

## Next Steps

1. **Verify Data**: Run `verify_data.js` to confirm all records are in the database
2. **Investigate Skipped Records**: Use the detailed error logs to identify which specific records had issues
3. **Manual Import**: For the 6 skipped records, manually review the source CSV files and insert corrected data if needed
4. **Schedule Automated Imports**: Consider scheduling this script to run during off-peak hours if data refresh is needed

## Notes

- The database uses ON CONFLICT clauses to prevent duplicate insertions of data
- For leave_balances, duplicate entries are updated rather than skipped
- All timestamps are converted to ISO format and stored in the database with timezone awareness
- The script maintains referential integrity by checking foreign key constraints

## Support

If you need to re-run the injection:
1. The scripts are idempotent when using ON CONFLICT clauses
2. Existing records with the same primary key will not be duplicated
3. For leave_balances, existing records will be updated with new values
