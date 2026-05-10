import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import Splash from './pages/Splash';
import Login from './pages/Login';
import InstallApp from './components/InstallApp.jsx';
import ReloadPrompt from './components/ReloadPrompt.jsx';
import Swal from 'sweetalert2';
import AiAssistant from './components/AiAssistant.jsx';

// Principal Pages
import PrincipalDashboard from './pages/principal/Dashboard';
import PrincipalLeaves from './pages/principal/LeaveRequests';
import PrincipalLeaveHistory from './pages/principal/LeaveHistory';
import PrincipalDepartment from './pages/principal/Department';
import PrincipalCalendar from './pages/principal/Calendar';
import PrincipalAttendance from './pages/principal/AttendanceRecord';
import PrincipalConversation from './pages/principal/Conversation';
import PrincipalPurchase from './pages/principal/Purchase';
import InstitutionalCalendar from './pages/shared/InstitutionalCalendar';

// HOD Pages
import HODDepartment from './pages/hod/Department';
import HODTimetable from './pages/hod/Timetable';
import HODDashboard from './pages/hod/HODDashboard';

// Staff Pages
import StaffLeaveApply from './pages/staff/LeaveApply';
import StaffDashboard from './pages/staff/StaffDashboard';
import StaffTimetable from './pages/staff/StaffTimetable';

// Admin Pages
import EmployeeManagement from './pages/admin/EmployeeManagement';
import DepartmentManagement from './pages/admin/DepartmentManagement';
import SalaryManagement from './pages/admin/SalaryManagement';
import SalaryReports from './pages/admin/SalaryReports';
import EmployeeSalaryView from './pages/admin/EmployeeSalaryView';
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminPurchase from './pages/admin/AdminPurchase';
import AdminCalendar from './pages/admin/AdminCalendar';
import LeaveLimitation from './pages/admin/LeaveLimitation';
import TimetableSetup from './pages/admin/TimetableSetup';
import BiometricHistory from './pages/admin/BiometricHistory';

// Shared Pages
import ProfilePage from './pages/shared/ProfilePage';
import PersonnelListPage from './pages/shared/PersonnelListPage';
import DepartmentStaffPage from './pages/shared/DepartmentStaffPage';
import DetailedAttendancePage from './pages/shared/DetailedAttendancePage';
import AttendanceMonthlySummaryPage from './pages/shared/AttendanceMonthlySummaryPage';
import EmployeeFormPage from './pages/admin/EmployeeFormPage';
import DepartmentFormPage from './pages/admin/DepartmentFormPage';
import PurchaseRequestPage from './pages/shared/PurchaseRequestPage';
import ActivityLogs from './pages/admin/ActivityLogs';
import Notifications from './pages/shared/Notifications';
import FeedbackInboxPage from './pages/shared/FeedbackInboxPage';

// Management Pages
import ManagementDashboard from './pages/management/ManagementDashboard';
import ManagementDepartment from './pages/management/ManagementDepartment';

// Placeholder Dashboards
// const AdminDashboard = () => <div className="p-10">Admin Dashboard (Coming Soon)</div>;
// const StaffDashboard = () => <div className="p-10">Staff Dashboard (Coming Soon)</div>;

// Protected Route Wrapper
const ProtectedRoute = ({ children, allowedRoles }) => {
  const { user, loading } = useAuth();

  if (loading) return null;

  if (!user) return <Navigate to="/login" />;

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/login" />; // Or unauthorized page
  }

  return children;
};

// Management Route Wrapper (PIN-based access via localStorage for persistence)
const ManagementRoute = ({ children }) => {
  const hasAccess =
    localStorage.getItem('managementAccess') === 'true' ||
    sessionStorage.getItem('managementAccess') === 'true';
  if (!hasAccess) return <Navigate to="/login" />;
  return children;
};

// A wrapper for /login that redirects to dashboard if already authenticated
const LoginRoute = () => {
  const { user, loading } = useAuth();

  if (loading) return null;
  const isManagement =
    localStorage.getItem('managementAccess') === 'true' ||
    sessionStorage.getItem('managementAccess') === 'true';

  if (isManagement) return <Navigate to="/management" replace />;
  if (user) {
    const roleMap = { admin: '/admin', principal: '/principal', hod: '/hod', staff: '/staff' };
    return <Navigate to={roleMap[user.role] || '/login'} replace />;
  }
  return <Login />;
};

const AppContent = () => {
  const { user, loading } = useAuth();
  const [showSplash, setShowSplash] = useState(true);

  const handleSplashFinish = () => {
    setShowSplash(false);
  };

  useEffect(() => {
    const bootSplash = document.getElementById('boot-splash');
    if (bootSplash) bootSplash.remove();
  }, []);

  const isAlreadyLogged = !!localStorage.getItem('token') || !!localStorage.getItem('managementAccess');
  const forceFullSplash = localStorage.getItem('force_full_splash') === 'true';

  useEffect(() => {
    // Helper to convert VAPID public key
    function urlBase64ToUint8Array(base64String) {
      const padding = '='.repeat((4 - base64String.length % 4) % 4);
      const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
      const rawData = window.atob(base64);
      const outputArray = new Uint8Array(rawData.length);
      for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
      }
      return outputArray;
    }

    const subscribeToPush = async (registration) => {
      try {
        // VAPID Public Key from environment (hardcoded here for the client build)
        const publicVapidKey = 'BFm4oktKjD5KB68I5w0oaZO-m84CoCFNXGsXNpXIY4p7EvOYIrwwgid181cNRtOKD_9Ffw_5EdvKflS11X4JoO0';
        const rawApiBase = String(import.meta.env.VITE_API_URL || '').trim().replace(/\/+$/, '');
        const normalizedApiBase = rawApiBase
          ? (rawApiBase.endsWith('/api') ? rawApiBase : `${rawApiBase}/api`)
          : '/api';
        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicVapidKey)
        });

        // Send to server
        await fetch(`${normalizedApiBase}/notifications/subscribe`, {
          method: 'POST',
          body: JSON.stringify({ subscription }),
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        });
        console.log('--- Successfully subscribed to background push ---');
      } catch (err) {
        console.error('Push Subscription Failed:', err);
      }
    };

    const checkNotificationPermission = async () => {
      if (!showSplash && 'Notification' in window) {
        let permission = Notification.permission;
        
        if (permission === 'default') {
          permission = await Notification.requestPermission();
        }
        
        if (permission === 'granted') {
          // If granted, ensure we are subscribed to push for background notifications
          if ('serviceWorker' in navigator) {
            const registration = await navigator.serviceWorker.ready;
            await subscribeToPush(registration);
          }
        } else {
          Swal.fire({
            title: 'Mandatory Notification Sync',
            text: permission === 'denied'
              ? 'Your notifications are currently BLOCKED. To receive mandatory updates for punches, leaves, and system alerts (even when the app is closed), you MUST manually enable them in your browser/app settings.'
              : 'To ensure your biometric punches and system updates are synchronized in real-time, please click ALLOW when prompted for notifications.',
            icon: 'warning',
            confirmButtonText: 'I Understand',
            confirmButtonColor: '#0ea5e9',
            allowOutsideClick: false,
            allowEscapeKey: false,
            footer: '<p style="font-size: 10px; color: #64748b; font-weight: bold; text-transform: uppercase;">Required for System Synchronization</p>'
          });
        }
      }
    };

    checkNotificationPermission();
  }, [showSplash]);

  if (showSplash) {
    if (forceFullSplash) {
      localStorage.removeItem('force_full_splash');
    }
    return <Splash onFinish={handleSplashFinish} isFast={isAlreadyLogged && !forceFullSplash} />;
  }

  if (loading) {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#0f2744]">
        <div className="h-9 w-9 border-4 border-sky-200/30 border-t-sky-300 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={<LoginRoute />} />

      <Route path="/admin/*" element={
        <ProtectedRoute allowedRoles={['admin']}>
          <Routes>
            <Route path="/" element={<AdminDashboard />} />
            <Route path="employees" element={<EmployeeManagement />} />
            <Route path="employees/new" element={<EmployeeFormPage />} />
            <Route path="employees/edit/:id" element={<EmployeeFormPage />} />
            <Route path="departments" element={<DepartmentManagement />} />
            <Route path="departments/new" element={<DepartmentFormPage />} />
            <Route path="departments/edit/:id" element={<DepartmentFormPage />} />
            <Route path="departments/:id/staff" element={<DepartmentStaffPage />} />
            <Route path="payroll" element={<SalaryManagement />} />
            <Route path="payroll/history" element={<SalaryManagement />} />
            <Route path="payroll/reports" element={<SalaryReports />} />
            <Route path="payroll/employee/:empId" element={<EmployeeSalaryView />} />
            <Route path="purchase" element={<AdminPurchase />} />
            <Route path="purchase/new" element={<PurchaseRequestPage />} />
            <Route path="attendance" element={<PrincipalAttendance />} />
            <Route path="attendance/monthly-summary" element={<AttendanceMonthlySummaryPage />} />
            <Route path="attendance/:empId/:month" element={<DetailedAttendancePage />} />
            <Route path="attendance/:empId/:startDate/:endDate" element={<DetailedAttendancePage />} />
            <Route path="calendar" element={<AdminCalendar />} />
            <Route path="timetable" element={<HODTimetable />} />
            <Route path="timetable/:empId" element={<HODTimetable />} />
            <Route path="leave-limits" element={<LeaveLimitation />} />
            <Route path="timetable-setup" element={<TimetableSetup />} />
            <Route path="profile/:id" element={<ProfilePage />} />
            <Route path="personnel/:role" element={<PersonnelListPage />} />
            <Route path="notifications" element={<Notifications />} />
            <Route path="feedback" element={<FeedbackInboxPage />} />
            <Route path="biometric-history" element={<BiometricHistory />} />
          </Routes>
        </ProtectedRoute>
      } />

      <Route path="/principal/*" element={
        <ProtectedRoute allowedRoles={['principal']}>
          <Routes>
            <Route path="/" element={<PrincipalDashboard />} />
            <Route path="leaves" element={<PrincipalLeaves />} />
            <Route path="leave-history" element={<PrincipalLeaveHistory />} />
            <Route path="payroll" element={<SalaryManagement />} />
            <Route path="payroll/history" element={<SalaryManagement />} />
            <Route path="department" element={<PrincipalDepartment />} />
            <Route path="departments/:id/staff" element={<DepartmentStaffPage rolePrefix="principal" />} />
            <Route path="calendar" element={<InstitutionalCalendar />} />
            <Route path="attendance" element={<PrincipalAttendance />} />
            <Route path="attendance/monthly-summary" element={<AttendanceMonthlySummaryPage />} />
            <Route path="attendance/:empId/:month" element={<DetailedAttendancePage />} />
            <Route path="attendance/:empId/:startDate/:endDate" element={<DetailedAttendancePage />} />
            <Route path="conversation" element={<PrincipalConversation />} />
            <Route path="purchase" element={<PrincipalPurchase />} />
            <Route path="purchase/new" element={<PurchaseRequestPage />} />
            <Route path="timetable" element={<HODTimetable />} />
            <Route path="timetable/:empId" element={<HODTimetable />} />
            <Route path="profile/:id" element={<ProfilePage />} />
            <Route path="personnel/:role" element={<PersonnelListPage />} />
            <Route path="notifications" element={<Notifications />} />
            <Route path="feedback" element={<FeedbackInboxPage />} />
            <Route path="biometric-history" element={<BiometricHistory />} />
          </Routes>
        </ProtectedRoute>
      } />

      <Route path="/hod/*" element={
        <ProtectedRoute allowedRoles={['hod']}>
          <Routes>
            <Route path="/" element={<HODDashboard />} />
            <Route path="leaves" element={<StaffLeaveApply />} />
            <Route path="payroll" element={<SalaryManagement />} />
            <Route path="payroll/history" element={<SalaryManagement />} />
            <Route path="department" element={<HODDepartment />} />
            <Route path="timetable" element={<HODTimetable />} />
            <Route path="timetable/:empId" element={<HODTimetable />} />
            <Route path="attendance" element={<PrincipalAttendance />} />
            <Route path="attendance/monthly-summary" element={<AttendanceMonthlySummaryPage />} />
            <Route path="attendance/:empId/:month" element={<DetailedAttendancePage />} />
            <Route path="attendance/:empId/:startDate/:endDate" element={<DetailedAttendancePage />} />
            <Route path="conversation" element={<PrincipalConversation />} />
            <Route path="purchase" element={<PrincipalPurchase />} />
            <Route path="purchase/new" element={<PurchaseRequestPage />} />
            <Route path="calendar" element={<InstitutionalCalendar />} />
            <Route path="profile/:id" element={<ProfilePage />} />
            <Route path="personnel/:role" element={<PersonnelListPage />} />
            <Route path="notifications" element={<Notifications />} />
            <Route path="feedback" element={<FeedbackInboxPage />} />
            <Route path="biometric-history" element={<BiometricHistory />} />
          </Routes>
        </ProtectedRoute>
      } />

      <Route path="/staff/*" element={
        <ProtectedRoute allowedRoles={['staff']}>
          <Routes>
            <Route path="/" element={<StaffDashboard />} />
            <Route path="leaves" element={<StaffLeaveApply />} />
            <Route path="payroll" element={<SalaryManagement />} />
            <Route path="payroll/history" element={<SalaryManagement />} />
            <Route path="items" element={<PrincipalPurchase />} />
            <Route path="purchase/new" element={<PurchaseRequestPage />} />
            <Route path="conversation" element={<PrincipalConversation />} />
            <Route path="timetables" element={<StaffTimetable />} />
            <Route path="timetables/:empId" element={<StaffTimetable />} />
            <Route path="calendar" element={<InstitutionalCalendar />} />
            <Route path="profile/:id" element={<ProfilePage />} />
            <Route path="notifications" element={<Notifications />} />
            <Route path="feedback" element={<FeedbackInboxPage />} />
          </Routes>
        </ProtectedRoute>
      } />

      <Route path="/management/*" element={
        <ManagementRoute>
          <Routes>
            <Route path="/" element={<ManagementDashboard />} />
            <Route path="departments" element={<ManagementDepartment />} />
            <Route path="departments/:id/staff" element={<DepartmentStaffPage rolePrefix="management" />} />
            <Route path="payroll" element={<SalaryManagement />} />
            <Route path="payroll/history" element={<SalaryManagement />} />
            <Route path="payroll/employee/:empId" element={<EmployeeSalaryView />} />
            <Route path="attendance" element={<PrincipalAttendance />} />
            <Route path="attendance/monthly-summary" element={<AttendanceMonthlySummaryPage />} />
            <Route path="attendance/:empId/:month" element={<DetailedAttendancePage />} />
            <Route path="attendance/:empId/:startDate/:endDate" element={<DetailedAttendancePage />} />
            <Route path="profile" element={<ProfilePage />} />
            <Route path="profile/:id" element={<ProfilePage />} />
            <Route path="notifications" element={<Notifications />} />
            <Route path="feedback" element={<FeedbackInboxPage />} />
            <Route path="biometric-history" element={<BiometricHistory />} />
            <Route path="calendar" element={<InstitutionalCalendar />} />
          </Routes>
        </ManagementRoute>
      } />

      <Route path="/" element={<Navigate to="/login" />} />
    </Routes>
  );
};

function App() {
  return (
    <Router>

      <InstallApp />
      <ReloadPrompt />

      <AuthProvider>
        <SocketProvider>
          <AppContent />
        </SocketProvider>
      </AuthProvider>

    </Router>
  );
}

export default App;
