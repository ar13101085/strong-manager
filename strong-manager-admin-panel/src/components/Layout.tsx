import React, { useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { RiServerLine, RiSettings3Line, RiDashboardLine, RiLineChartLine, RiNotification3Line, RiDatabase2Line, RiShieldLine } from 'react-icons/ri';
import { BsGear, BsChevronDown, BsChevronUp } from 'react-icons/bs';
import { FiUsers } from 'react-icons/fi';

interface LayoutProps {
  children?: React.ReactNode;
}

interface NavItemProps {
  to: string;
  icon: React.ReactNode;
  label: string;
  active: boolean;
  hasChildren?: boolean;
  isOpen?: boolean;
  toggleOpen?: () => void;
}

const NavItem: React.FC<NavItemProps> = ({ to, icon, label, active, hasChildren, isOpen, toggleOpen }) => {
  return (
    <li>
      {hasChildren ? (
        <div
          className={`flex items-center px-4 py-3 text-sm cursor-pointer ${
            active ? 'text-blue-600 bg-blue-50' : 'text-gray-600 hover:bg-gray-100'
          }`}
          onClick={toggleOpen}
        >
          <span className="mr-3">{icon}</span>
          <span className="flex-1">{label}</span>
          <span className="ml-2">
            {isOpen ? <BsChevronUp size={14} /> : <BsChevronDown size={14} />}
          </span>
        </div>
      ) : (
        <Link
          to={to}
          className={`flex items-center px-4 py-3 text-sm ${
            active ? 'text-blue-600 bg-blue-50' : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          <span className="mr-3">{icon}</span>
          <span className="flex-1">{label}</span>
        </Link>
      )}
    </li>
  );
};

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>({
    config: true,
  });

  const toggleMenu = (menu: string) => {
    setOpenMenus(prev => ({
      ...prev,
      [menu]: !prev[menu]
    }));
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    navigate('/login');
  };

  const isActive = (path: string) => {
    if (path === '/' && location.pathname === '/') {
      return true;
    }
    // For paths other than root, check if the current path starts with the given path
    return path !== '/' && location.pathname.startsWith(path);
  };

  const isConfigActive = () => isActive('/config');

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <div className="w-64 bg-white border-r border-gray-200 flex flex-col">
        {/* Logo */}
        <div className="h-16 flex items-center px-6 border-b border-gray-200">
          <h1 className="text-xl font-bold text-blue-600">STRONG PROXY</h1>
        </div>

        {/* Navigation */}
        <div className="flex-1 overflow-y-auto py-4">
          <div className="px-4 mb-4">
            <span className="text-xs font-semibold uppercase text-gray-500">Main</span>
          </div>
          <ul className="space-y-1">
            <NavItem 
              to="/" 
              icon={<RiDashboardLine size={20} />} 
              label="Dashboard" 
              active={isActive('/')} 
            />
            
            <NavItem 
              to="#" 
              icon={<RiServerLine size={20} />} 
              label="Configuration" 
              active={isConfigActive()} 
              hasChildren 
              isOpen={openMenus.config} 
              toggleOpen={() => toggleMenu('config')} 
            />
            
            {openMenus.config && (
              <ul className="ml-7 space-y-1 border-l border-gray-200 pl-3">
                <li>
                  <Link 
                    to="/config" 
                    className={`flex items-center px-4 py-2 text-sm ${
                      isActive('/config') ? 'text-blue-600' : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    DNS Rules
                  </Link>
                </li>
              </ul>
            )}
            
            <NavItem 
              to="/request-rules" 
              icon={<RiShieldLine size={20} />} 
              label="Request Rules" 
              active={isActive('/request-rules')} 
            />
            
            <NavItem 
              to="/stats" 
              icon={<RiLineChartLine size={20} />} 
              label="Statistics" 
              active={isActive('/stats')} 
            />
            
            <NavItem 
              to="/users" 
              icon={<FiUsers size={20} />} 
              label="Users" 
              active={isActive('/users')} 
            />
            
            <NavItem 
              to="/database" 
              icon={<RiDatabase2Line size={20} />} 
              label="Database" 
              active={isActive('/database')} 
            />
          </ul>
        </div>

        {/* User Menu */}
        <div className="border-t border-gray-200 p-4">
          <button
            onClick={handleLogout}
            className="w-full flex items-center px-4 py-2 text-sm text-red-600 hover:bg-red-50 rounded"
          >
            <RiSettings3Line className="mr-2" size={16} />
            Logout
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6">
          <div className="text-lg font-medium">Strong Reverse Proxy Admin</div>
          <div className="flex items-center space-x-4">
            <button className="p-2 rounded hover:bg-gray-100">
              <BsGear size={18} />
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6 bg-gray-50">
          {children || <Outlet />}
        </main>
      </div>
    </div>
  );
};

export default Layout; 