const { pool } = require('./server/config/db');

(async () => {
  try {
    // Get current date info
    const today = new Date();
    const currentMonth = today.getMonth() + 1;
    const currentYear = today.getFullYear();
    
    // Period: 26th previous month to 25th current month
    const toDate = new Date(currentYear, currentMonth - 1, 25);
    const fromDate = new Date(currentYear, currentMonth - 2, 26);
    
    const from = fromDate.toISOString().split('T')[0];
    const to = toDate.toISOString().split('T')[0];
    
    console.log('Checking employee 186 for period:', from, 'to', to);
    console.log('');
    
    // Check attendance records
    const attRes = await pool.query(
      'SELECT date, status, remarks FROM attendance_records WHERE TRIM(emp_id) = $1 AND date >= $2 AND date <= $3 ORDER BY date',
      ['186', from, to]
    );
    console.log('Attendance Records (' + attRes.rows.length + '):');
    if (attRes.rows.length === 0) console.log('  NONE - Employee marked absent all days');
    else attRes.rows.forEach(r => console.log('  ' + r.date + ' ' + r.status + ' ' + (r.remarks || '')));
    console.log('');
    
    // Check leave requests
    const leaveRes = await pool.query(
      'SELECT id, from_date, to_date, leave_type, status FROM leave_requests WHERE TRIM(emp_id) = $1 AND from_date >= $2 AND to_date <= $3',
      ['186', from, to]
    );
    console.log('Leave Requests (' + leaveRes.rows.length + '):');
    leaveRes.rows.forEach(r => console.log('  ' + r.from_date + ' to ' + r.to_date + ' (' + r.leave_type + ' - ' + r.status + ')'));
    console.log('');
    
    // Check current salary record
    const salRes = await pool.query(
      'SELECT present_days, with_pay_days, without_pay_days, total_payable_days, status FROM salary_records WHERE TRIM(emp_id) = $1 AND month = $2 AND year = $3',
      ['186', currentMonth, currentYear]
    );
    console.log('Current Salary Record:');
    if (salRes.rows.length === 0) console.log('  NONE');
    else salRes.rows.forEach(r => console.log('  present_days=' + r.present_days + ', with_pay_days=' + r.with_pay_days + ', without_pay_days=' + r.without_pay_days + ', payable_days=' + r.total_payable_days + ', status=' + r.status));
    
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
