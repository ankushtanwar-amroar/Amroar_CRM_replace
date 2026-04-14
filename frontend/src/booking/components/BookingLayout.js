import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Calendar, Users, Briefcase, LayoutDashboard, Code, ArrowLeft, LogOut } from 'lucide-react';

const BookingLayout = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();

  const [tenantId, setTenantId] = React.useState('');

  React.useEffect(() => {
    const user = JSON.parse(localStorage.getItem('tenant') || '{}');
    if (user.id) {
      setTenantId(user.id);
    }
  }, []);

  const menuItems = [
    { path: '/booking', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/booking/bookings', label: 'Bookings', icon: Calendar },
    { path: '/booking/services', label: 'Services', icon: Briefcase },
    { path: '/booking/staff', label: 'Staff', icon: Users },
    { path: '/booking/calendar', label: 'Calendar View', icon: Calendar },
    { path: '/booking/widget', label: 'Widget', icon: Code },
  ];

  const isActive = (path) => {
    if (path === '/booking') {
      return location.pathname === '/booking';
    }
    return location.pathname.startsWith(path);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('tenant');
    navigate('/auth');
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-lg flex items-center justify-center">
              <Calendar className="text-white" size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Booking System</h2>
              <p className="text-xs text-gray-500">Manage appointments</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4">
          <div className="space-y-1">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.path);
              
              return (
                <button
                  key={item.path}
                  onClick={() => navigate(item.path)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
                    active
                      ? 'bg-blue-50 text-blue-700 font-medium'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <Icon size={20} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        </nav>

        {/* Tenant ID Display */}
        {tenantId && (
          <div className="p-4 border-t border-gray-200">
            <div className="bg-blue-50 rounded-lg p-3">
              <div className="text-xs font-medium text-blue-900 mb-1">Your Tenant ID</div>
              <div className="flex items-center justify-between">
                <code className="text-xs text-blue-700 font-mono">{tenantId}</code>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(tenantId);
                    alert('Tenant ID copied!');
                  }}
                  className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                >
                  Copy
                </button>
              </div>
              <div className="text-xs text-blue-600 mt-2">
                Public URL: /booking/{tenantId}
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 space-y-2">
          <button
            onClick={() => navigate('/')}
            className="w-full flex items-center gap-3 px-4 py-3 text-gray-700 hover:bg-gray-50 rounded-lg transition-all"
          >
            <ArrowLeft size={20} />
            <span>Back to CRM</span>
          </button>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 text-gray-700 hover:bg-gray-50 rounded-lg transition-all"
          >
            <LogOut size={20} />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
};

export default BookingLayout;
