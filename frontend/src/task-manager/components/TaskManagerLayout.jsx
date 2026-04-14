/**
 * Task Manager Layout
 * Main layout with left sidebar navigation
 */
import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, FolderKanban, CalendarDays, 
  Inbox, Settings, ChevronLeft, Zap, Users, 
  BarChart3, FileText, ClipboardList, ShieldCheck, GitBranch, Mail, PieChart, Repeat
} from 'lucide-react';
import NotificationsDropdown from './NotificationsDropdown';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const TaskManagerLayout = ({ children }) => {
  const location = useLocation();
  const [inboxUnreadCount, setInboxUnreadCount] = useState(0);
  
  // Fetch unread count for inbox badge
  useEffect(() => {
    const fetchUnreadCount = async () => {
      try {
        const token = localStorage.getItem('token');
        if (!token) return;
        
        const response = await fetch(`${API_URL}/api/task-manager/notifications?limit=1`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.ok) {
          const data = await response.json();
          setInboxUnreadCount(data.unread_count || 0);
        }
      } catch (err) {
        console.error('Error fetching inbox count:', err);
      }
    };
    
    fetchUnreadCount();
    // Poll every 30 seconds
    const interval = setInterval(fetchUnreadCount, 30000);
    return () => clearInterval(interval);
  }, []);
  
  const navItems = [
    { icon: LayoutDashboard, label: 'My Work', path: '/task-manager' },
    { icon: Inbox, label: 'Inbox', path: '/task-manager/inbox', badge: inboxUnreadCount },
    { icon: FolderKanban, label: 'Projects', path: '/task-manager/projects' },
    { icon: CalendarDays, label: 'Calendar', path: '/task-manager/calendar' },
    { icon: PieChart, label: 'Reports', path: '/task-manager/reports' },
    { icon: BarChart3, label: 'Dashboards', path: '/task-manager/dashboards' },
    { icon: FileText, label: 'Templates', path: '/task-manager/templates' },
    { icon: Repeat, label: 'Recurring', path: '/task-manager/recurring-tasks' },
    { icon: Zap, label: 'Automation', path: '/task-manager/automation' },
    { icon: Users, label: 'Integrations', path: '/task-manager/integrations' },
  ];

  const isActive = (path) => {
    if (path === '/task-manager') {
      return location.pathname === '/task-manager';
    }
    return location.pathname.startsWith(path);
  };

  return (
    <div className="flex h-[calc(100vh-64px)] bg-slate-50">
      {/* Left Sidebar */}
      <aside className="w-56 bg-white border-r border-slate-200 flex flex-col">
        {/* Header with Notifications */}
        <div className="p-3 border-b border-slate-100 flex items-center justify-between">
          <Link 
            to="/crm-platform"
            className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900"
          >
            <ChevronLeft className="w-4 h-4" />
            Back to CRM
          </Link>
          <NotificationsDropdown />
        </div>

        {/* Nav Items */}
        <nav className="flex-1 py-2 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.path);
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-4 py-2 mx-2 rounded-lg text-sm font-medium transition-colors ${
                  active 
                    ? 'bg-blue-50 text-blue-700' 
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
                data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
              >
                <Icon className={`w-4 h-4 ${active ? 'text-blue-600' : 'text-slate-400'}`} />
                <span className="flex-1">{item.label}</span>
                {item.badge > 0 && (
                  <span className="min-w-[20px] h-5 px-1.5 bg-red-500 text-white text-xs font-semibold rounded-full flex items-center justify-center">
                    {item.badge > 99 ? '99+' : item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Admin Link */}
        <div className="p-3 border-t border-slate-100 space-y-1">
          <Link 
            to="/task-manager/custom-fields" 
            className={`flex items-center gap-2 text-sm px-2 py-1.5 rounded transition-colors ${
              location.pathname.includes('/custom-fields')
                ? 'text-blue-600 bg-blue-50'
                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
            }`}
          >
            <ClipboardList className="w-4 h-4" />
            Custom Fields
          </Link>
          <Link 
            to="/task-manager/validation-rules" 
            className={`flex items-center gap-2 text-sm px-2 py-1.5 rounded transition-colors ${
              location.pathname.includes('/validation-rules')
                ? 'text-blue-600 bg-blue-50'
                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            Validation Rules
          </Link>
          <Link 
            to="/task-manager/approval-workflows" 
            className={`flex items-center gap-2 text-sm px-2 py-1.5 rounded transition-colors ${
              location.pathname.includes('/approval-workflows')
                ? 'text-blue-600 bg-blue-50'
                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
            }`}
          >
            <GitBranch className="w-4 h-4" />
            Approval Workflows
          </Link>
          <Link 
            to="/task-manager/email-templates" 
            className={`flex items-center gap-2 text-sm px-2 py-1.5 rounded transition-colors ${
              location.pathname.includes('/email-templates')
                ? 'text-blue-600 bg-blue-50'
                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
            }`}
          >
            <Mail className="w-4 h-4" />
            Email Templates
          </Link>
          <Link 
            to="/task-manager/approval-analytics" 
            className={`flex items-center gap-2 text-sm px-2 py-1.5 rounded transition-colors ${
              location.pathname.includes('/approval-analytics')
                ? 'text-blue-600 bg-blue-50'
                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
            }`}
            data-testid="approval-analytics-nav"
          >
            <PieChart className="w-4 h-4" />
            Approval Analytics
          </Link>
          <Link 
            to="/setup" 
            className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 px-2 py-1.5 rounded hover:bg-slate-50 transition-colors"
          >
            <Settings className="w-4 h-4" />
            Setup
          </Link>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
};

export default TaskManagerLayout;
