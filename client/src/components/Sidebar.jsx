import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  FaTachometerAlt,
  FaUsers,
  FaMoneyBillWave,
  FaBuilding,
  FaCalendarCheck,
  FaClipboardList,
  FaUserGraduate,
  FaSignOutAlt,
  FaComments,
  FaShoppingBag,
  FaCalendarDay,
  FaChevronLeft,
  FaClipboardCheck,
  FaCalendarAlt,
  FaShieldAlt,
  FaBell,
  FaFingerprint,
} from 'react-icons/fa';
import { useAuth } from '../context/AuthContext';
import LiveStatus from './LiveStatus';

const Sidebar = ({ userRole = 'staff', isOpen, onClose }) => {
  const { logout, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const handleLogout = () => {
    // Clear ALL auth storage regardless of role
    sessionStorage.removeItem('managementAccess');
    localStorage.removeItem('managementAccess');
    localStorage.removeItem('token');
    localStorage.removeItem('lastRole');
    localStorage.removeItem('ai_chat_history');
    logout(); // also clears AuthContext user state
    navigate('/login');
  };

  const menuItems = {
    admin: [
      { label: 'Dashboard', path: '/admin', icon: <FaTachometerAlt /> },
      { label: 'Employee Management', path: '/admin/employees', icon: <FaUsers /> },
      { label: 'Department Management', path: '/admin/departments', icon: <FaBuilding /> },
      { label: 'Salary Management', path: '/admin/payroll', icon: <FaMoneyBillWave /> },
      { label: 'Attendance Records', path: '/admin/attendance', icon: <FaCalendarCheck /> },
      { label: 'Leave Balances', path: '/admin/leave-limits', icon: <FaClipboardCheck /> },
      { label: 'Timetable Setup', path: '/admin/timetable-setup', icon: <FaCalendarAlt /> },
      { label: 'Calendar', path: '/admin/calendar', icon: <FaCalendarDay /> },
      { label: 'Purchase Requests', path: '/admin/purchase', icon: <FaShoppingBag /> },
    ],
    principal: [
      { label: 'Dashboard', path: '/principal', icon: <FaTachometerAlt /> },
      { label: 'Attendance Records', path: '/principal/attendance', icon: <FaCalendarCheck /> },
      { label: 'Departments', path: '/principal/department', icon: <FaBuilding /> },
      { label: 'Incoming Requests', path: '/principal/leaves', icon: <FaClipboardList /> },
      { label: 'Salary Overview', path: '/principal/payroll', icon: <FaMoneyBillWave /> },
      { label: 'Conversation', path: '/principal/conversation', icon: <FaComments /> },
      { label: 'Purchase Requests', path: '/principal/purchase', icon: <FaShoppingBag /> },
      { label: 'Academic Calendar', path: '/principal/calendar', icon: <FaCalendarDay /> },
    ],
    hod: [
      { label: 'Dashboard', path: '/hod', icon: <FaTachometerAlt /> },
      { label: 'Leave Management', path: '/hod/leaves', icon: <FaClipboardList /> },
      { label: 'Salary Details', path: '/hod/payroll', icon: <FaMoneyBillWave /> },
      { label: 'Department Staff', path: '/hod/department', icon: <FaBuilding /> },
      { label: 'Timetable', path: '/hod/timetable', icon: <FaCalendarDay /> },
      { label: 'Attendance Record', path: '/hod/attendance', icon: <FaUserGraduate /> },
      { label: 'Conversation', path: '/hod/conversation', icon: <FaComments /> },
      { label: 'Purchase Requests', path: '/hod/purchase', icon: <FaShoppingBag /> },
      { label: 'Academic Calendar', path: '/hod/calendar', icon: <FaCalendarDay /> },
    ],
    staff: [
      { label: 'Dashboard', path: '/staff', icon: <FaTachometerAlt /> },
      { label: 'Leave Management', path: '/staff/leaves', icon: <FaClipboardList /> },
      { label: 'Salary Details', path: '/staff/payroll', icon: <FaMoneyBillWave /> },
      { label: 'Timetable', path: '/staff/timetables', icon: <FaCalendarCheck /> },
      { label: 'Conversation', path: '/staff/conversation', icon: <FaComments /> },
      { label: 'Purchase Requests', path: '/staff/items', icon: <FaShoppingBag /> },
      { label: 'Academic Calendar', path: '/staff/calendar', icon: <FaCalendarDay /> },
    ],
    management: [
      { label: 'Dashboard', path: '/management', icon: <FaTachometerAlt /> },
      { label: 'Departments', path: '/management/departments', icon: <FaBuilding /> },
      { label: 'Salary Overview', path: '/management/payroll', icon: <FaMoneyBillWave /> },
      { label: 'Attendance Records', path: '/management/attendance', icon: <FaCalendarCheck /> },
    ],
  };

  const currentMenuItems = menuItems[userRole] || menuItems.staff;
  const menuWithFeedback = (() => {
    const items = [...currentMenuItems];
    if (['5001', '5045'].includes(String(user?.emp_id || '').trim())) {
      const roleBase = userRole === 'management' ? '/management' : `/${userRole}`;
      const exists = items.some((i) => i.path === `${roleBase}/feedback`);
      if (!exists) {
        items.push({ label: 'Feedback', path: `${roleBase}/feedback`, icon: <FaClipboardList /> });
      }
    }
    return items;
  })();

  const isItemActive = (itemPath) => {
    const itemSegments = itemPath.split('/').filter(Boolean).length;
    const useExactMatch = itemSegments <= 2;
    if (useExactMatch) {
      return location.pathname === itemPath;
    }
    return location.pathname.startsWith(itemPath);
  };

  const activeClass = "bg-white/70 text-sky-600 shadow-sm backdrop-blur-md transform scale-[1.02] transition-all duration-300 border border-white/50";
  const inactiveClass = "text-gray-500 hover:bg-white/40 hover:text-sky-600 transition-all duration-300";

  const roleName = userRole === 'hod' ? 'Head of Department' : userRole === 'admin' ? 'Administrator' : userRole === 'principal' ? 'Principal' : userRole === 'management' ? 'Management' : 'Staff Member';

  return (
    <div
      className={`fixed bottom-0 left-0 right-0 top-auto h-[78px] w-full bg-white/80 backdrop-blur-xl shadow-[0_-10px_20px_rgba(0,0,0,0.35)] z-40 flex flex-col overflow-hidden transition-all duration-300 ease-in-out lg:left-0 lg:top-[72px] lg:bottom-auto lg:right-auto lg:h-[calc(100vh-72px)] lg:w-20 lg:bg-white/70 lg:shadow-2xl lg:translate-x-0 ${isOpen ? 'translate-y-0 lg:translate-x-0' : 'translate-y-full lg:translate-y-0 lg:-translate-x-full'
        }`}
    >
      {/* Header - No top border, below Header line */}
      <div className="hidden lg:block p-4 max-[320px]:p-3 lg:p-3 bg-transparent shrink-0">
        {/* User Role Portal removed */}
        
        {/* Close button with real-time clock */}
        <div className="flex flex-col items-center gap-2">
            {/* Back button removed per request */}
            <div className="scale-[0.8] origin-center -ml-0.5">
              <LiveStatus />
            </div>
        </div>
      </div>

      {/* Nav Items */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden no-scrollbar py-2 px-2 max-[320px]:px-1 lg:overflow-y-auto lg:overflow-x-hidden lg:py-2 lg:max-[320px]:py-1.5 lg:px-1 lg:max-[320px]:px-0.5">
        <nav>
          <ul className="flex items-center gap-1.5 min-w-max max-[320px]:gap-1 lg:block lg:min-w-0 lg:space-y-3 lg:max-[320px]:space-y-2">
            {menuWithFeedback.map((item) => (
              <li key={item.label} className="shrink-0 lg:shrink">
                <NavLink
                  to={item.path}
                  end={item.path.split('/').length <= 2}
                  className={({ isActive }) =>
                    `flex flex-col items-center justify-center min-w-[64px] h-[60px] px-1 rounded-xl transition-all duration-300 lg:min-w-0 lg:h-auto lg:py-2 ${isActive ? activeClass : inactiveClass}`
                  }
                  onClick={() => onClose()}
                >
                  {({ isActive }) => (
                    <>
                      <span className={`text-base max-[320px]:text-sm mb-1 max-[320px]:mb-0.5 transition-colors lg:text-xl lg:max-[320px]:text-lg ${isActive ? 'text-sky-600' : 'text-gray-400'}`}>{item.icon}</span>
                      <span className="text-[6px] max-[320px]:text-[5px] font-bold uppercase tracking-tight max-[320px]:tracking-normal text-center leading-[1.1] px-0.5 line-clamp-2 lg:text-[7px] lg:max-[320px]:text-[6px] lg:tracking-tighter lg:px-1 lg:max-[320px]:px-0.5">
                        {item.label}
                      </span>
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      {/* Logout button removed per request */}
    </div>
  );
};

export default Sidebar;

