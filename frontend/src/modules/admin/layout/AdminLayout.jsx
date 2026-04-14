/**
 * Admin Layout Component
 * Provides consistent layout for all admin pages
 * Completely isolated from CRM layout
 */
import React, { useState } from 'react';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import { useAdminAuth } from '../auth/AdminAuthContext';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { 
  Shield, 
  LogOut, 
  Building2, 
  CreditCard, 
  Boxes, 
  Gauge,
  Users,
  FileText,
  Search,
  ChevronDown,
  ArrowLeft,
  LayoutDashboard,
  Settings,
  Bell,
  Menu,
  X,
  Key,
  Rocket,
  Plug
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from '../../../components/ui/dropdown-menu';

const AdminLayout = () => {
  const { adminUser, adminLogout } = useAdminAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const handleLogout = () => {
    adminLogout();
    navigate('/admin/login');
  };

  const navigationItems = [
    {
      section: 'Overview',
      items: [
        { 
          name: 'Dashboard', 
          path: '/admin', 
          icon: LayoutDashboard,
          description: 'Platform overview'
        }
      ]
    },
    {
      section: 'Tenant Management',
      items: [
        { 
          name: 'Tenants', 
          path: '/admin/tenants', 
          icon: Building2,
          description: 'Manage organizations'
        },
        { 
          name: 'Users', 
          path: '/admin/users', 
          icon: Users,
          description: 'Monitor all users'
        }
      ]
    },
    {
      section: 'Platform Configuration',
      items: [
        { 
          name: 'License Catalog', 
          path: '/admin/license-catalog', 
          icon: Key,
          description: 'License definitions'
        },
        { 
          name: 'Releases', 
          path: '/admin/releases', 
          icon: Rocket,
          description: 'Platform versions'
        },
        { 
          name: 'Plans & Billing', 
          path: '/admin/subscriptions', 
          icon: CreditCard,
          description: 'Subscription plans'
        },
        { 
          name: 'Modules', 
          path: '/admin/modules', 
          icon: Boxes,
          description: 'Feature entitlements'
        },
        { 
          name: 'Integrations', 
          path: '/admin/integrations', 
          icon: Plug,
          description: 'Provider connections'
        },
        { 
          name: 'Limits & Quotas', 
          path: '/admin/quotas', 
          icon: Gauge,
          description: 'Usage limits'
        }
      ]
    },
    {
      section: 'Operations',
      items: [
        { 
          name: 'Audit Logs', 
          path: '/admin/audit-logs', 
          icon: FileText,
          description: 'System activity'
        }
      ]
    }
  ];

  const isActivePath = (path) => {
    if (path === '/admin') {
      return location.pathname === '/admin';
    }
    return location.pathname.startsWith(path);
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 h-14 bg-white border-b border-slate-200 z-50">
        <div className="h-full px-4 flex items-center justify-between">
          {/* Left side */}
          <div className="flex items-center space-x-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="lg:hidden"
            >
              {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
            
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-lg flex items-center justify-center">
                <Shield className="h-4 w-4 text-white" />
              </div>
              <div className="hidden sm:block">
                <h1 className="text-sm font-semibold text-slate-900">Admin Portal</h1>
                <p className="text-xs text-slate-500">System Administration</p>
              </div>
            </div>
          </div>

          {/* Right side */}
          <div className="flex items-center space-x-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/crm-platform')}
              className="text-slate-600 hover:text-slate-900"
              data-testid="back-to-crm-link"
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              <span className="hidden sm:inline">Back to CRM</span>
            </Button>
            
            <Button variant="ghost" size="icon" className="text-slate-600">
              <Bell className="h-5 w-5" />
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="flex items-center space-x-2">
                  <div className="w-8 h-8 bg-gradient-to-br from-indigo-100 to-purple-100 rounded-full flex items-center justify-center">
                    <span className="text-sm font-medium text-indigo-700">
                      {adminUser?.first_name?.[0] || 'A'}
                    </span>
                  </div>
                  <span className="hidden sm:inline text-slate-700">
                    {adminUser?.first_name || 'Admin'}
                  </span>
                  <ChevronDown className="h-4 w-4 text-slate-400" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <div className="px-3 py-2">
                  <p className="text-sm font-medium text-slate-900">
                    {adminUser?.first_name} {adminUser?.last_name}
                  </p>
                  <p className="text-xs text-slate-500">{adminUser?.email}</p>
                  <p className="text-xs text-indigo-600 font-medium mt-1">Platform Admin</p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem>
                  <Settings className="h-4 w-4 mr-2" />
                  Settings
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="text-red-600">
                  <LogOut className="h-4 w-4 mr-2" />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* Sidebar */}
      <aside 
        className={`fixed top-14 left-0 bottom-0 w-64 bg-white border-r border-slate-200 z-40 transform transition-transform duration-200 ease-in-out ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } lg:translate-x-0`}
      >
        <div className="flex flex-col h-full">
          {/* Search */}
          <div className="p-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 bg-slate-50 border-slate-200 focus:bg-white"
                data-testid="admin-search-input"
              />
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto px-3 pb-4">
            {navigationItems.map((section) => (
              <div key={section.section} className="mb-6">
                <h3 className="px-3 mb-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  {section.section}
                </h3>
                <div className="space-y-1">
                  {section.items.map((item) => {
                    const Icon = item.icon;
                    const isActive = isActivePath(item.path);
                    
                    return (
                      <button
                        key={item.path}
                        onClick={() => navigate(item.path)}
                        className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg text-left transition-all ${
                          isActive 
                            ? 'bg-indigo-50 text-indigo-700 font-medium' 
                            : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                        }`}
                        data-testid={`admin-nav-${item.name.toLowerCase().replace(' ', '-')}`}
                      >
                        <Icon className={`h-5 w-5 ${isActive ? 'text-indigo-600' : 'text-slate-400'}`} />
                        <div className="flex-1 min-w-0">
                          <span className="block text-sm truncate">{item.name}</span>
                          {item.description && (
                            <span className="block text-xs text-slate-400 truncate">
                              {item.description}
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>

          {/* Footer */}
          <div className="p-4 border-t border-slate-200">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Admin Portal v1.0</span>
              <span>Secure Mode</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className={`pt-14 transition-all duration-200 ${sidebarOpen ? 'lg:pl-64' : ''}`}>
        <div className="min-h-[calc(100vh-56px)] bg-slate-50">
          <Outlet />
        </div>
      </main>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/20 z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </div>
  );
};

export default AdminLayout;
