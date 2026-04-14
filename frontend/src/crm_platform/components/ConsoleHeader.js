import React, { useState, useEffect } from 'react';
import AppLauncher from './AppLauncher';
import { HelpCircle, Settings, User, LogOut, ChevronDown } from 'lucide-react';
import { NotificationCenter } from '../../modules/notifications';

const ConsoleHeader = ({ apps, onSelectApp, tenantId }) => {
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [user, setUser] = useState(null);

  useEffect(() => {
    // Get user from localStorage
    const userData = localStorage.getItem('user');
    if (userData) {
      try {
        setUser(JSON.parse(userData));
      } catch (e) {
        console.error('Failed to parse user data');
      }
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('tenant_id');
    window.location.href = '/auth';
  };

  return (
    <header className="bg-gray-800 text-white h-12 flex items-center justify-between px-4 shadow-md">
      <div className="flex items-center space-x-4">
        <AppLauncher apps={apps} onSelectApp={onSelectApp} />
        <div className="text-sm font-semibold">CRM Platform</div>
        {tenantId && (
          <div className="text-xs text-gray-400">Tenant: {tenantId.substring(0, 8)}</div>
        )}
      </div>

      <div className="flex items-center space-x-2">
        <button 
          className="p-2 hover:bg-gray-700 rounded transition-colors" 
          title="Help"
          onClick={() => alert('Help documentation coming soon!')}
        >
          <HelpCircle className="w-5 h-5" />
        </button>
        
        {/* Notification Center (Bell Icon) */}
        <div className="[&_button]:text-white [&_button:hover]:bg-gray-700 [&_svg]:text-white">
          <NotificationCenter />
        </div>
        
        <button 
          className="p-2 hover:bg-gray-700 rounded transition-colors" 
          title="Settings"
          onClick={() => window.open('/setup', '_blank')}
        >
          <Settings className="w-5 h-5" />
        </button>
        
        {/* Profile Dropdown */}
        <div className="relative">
          <button 
            className="flex items-center space-x-2 p-2 hover:bg-gray-700 rounded transition-colors" 
            title="Profile"
            onClick={() => setShowProfileMenu(!showProfileMenu)}
          >
            <User className="w-5 h-5" />
            <ChevronDown className="w-3 h-3" />
          </button>
          
          {showProfileMenu && (
            <>
              <div 
                className="fixed inset-0 z-10" 
                onClick={() => setShowProfileMenu(false)}
              />
              <div className="absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-xl z-20 text-gray-900">
                <div className="p-4 border-b">
                  <div className="flex items-center space-x-3">
                    <div className="w-12 h-12 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold text-lg">
                      {user?.first_name?.[0]}{user?.last_name?.[0]}
                    </div>
                    <div>
                      <p className="font-semibold">{user?.first_name} {user?.last_name}</p>
                      <p className="text-sm text-gray-500">{user?.email}</p>
                    </div>
                  </div>
                </div>
                <div className="p-2">
                  <button 
                    className="w-full text-left px-4 py-2 hover:bg-gray-100 rounded flex items-center space-x-2"
                    onClick={() => window.open('/setup', '_blank')}
                  >
                    <Settings className="w-4 h-4" />
                    <span>Setup</span>
                  </button>
                  <button 
                    className="w-full text-left px-4 py-2 hover:bg-gray-100 rounded flex items-center space-x-2 text-red-600"
                    onClick={handleLogout}
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Logout</span>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
};

export default ConsoleHeader;
