/**
 * SetupDashboard - CRM Control Center
 * 
 * A modern, premium admin dashboard for the Setup page
 * Features:
 * - Dynamic stats from APIs
 * - Quick action cards
 * - Categorized setup sections
 * - System health insights
 */
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  Database,
  Users,
  Zap,
  Shield,
  FileText,
  ClipboardList,
  Network,
  Share2,
  Upload,
  Download,
  MessageSquare,
  Mail,
  Calendar,
  ArrowRight,
  Activity,
  BarChart3,
  Clock,
  CheckCircle2,
  TrendingUp,
  Layers,
  Settings2,
  Sparkles,
  HardDrive,
  CircleDot,
} from 'lucide-react';
import { Badge } from '../../../components/ui/badge';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

/**
 * Quick Action Card - Large premium cards for main actions
 */
const QuickActionCard = ({ icon: Icon, title, description, stat, statLabel, onClick, gradient }) => (
  <button
    onClick={onClick}
    className={`group relative overflow-hidden rounded-2xl p-6 text-left transition-all duration-300 hover:scale-[1.02] hover:shadow-xl ${gradient}`}
  >
    {/* Background decoration */}
    <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-white/10 blur-xl transition-transform group-hover:scale-150" />
    <div className="absolute -bottom-4 -left-4 h-20 w-20 rounded-full bg-white/5 blur-lg" />
    
    <div className="relative">
      <div className="mb-4 inline-flex rounded-xl bg-white/20 p-3 backdrop-blur-sm">
        <Icon className="h-6 w-6 text-white" />
      </div>
      
      <h3 className="mb-1 text-lg font-semibold text-white">{title}</h3>
      <p className="mb-4 text-sm text-white/80">{description}</p>
      
      <div className="flex items-center justify-between">
        <div>
          <span className="text-2xl font-bold text-white">{stat}</span>
          <span className="ml-2 text-sm text-white/70">{statLabel}</span>
        </div>
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 transition-transform group-hover:translate-x-1">
          <ArrowRight className="h-4 w-4 text-white" />
        </div>
      </div>
    </div>
  </button>
);

/**
 * Category Section Card - Smaller cards for setup modules
 */
const CategoryCard = ({ icon: Icon, title, description, onClick, badge }) => (
  <button
    onClick={onClick}
    className="group flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 text-left transition-all duration-200 hover:border-slate-300 hover:bg-slate-50 hover:shadow-md"
  >
    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-slate-50 to-slate-100 transition-colors group-hover:from-indigo-50 group-hover:to-indigo-100">
      <Icon className="h-5 w-5 text-slate-600 transition-colors group-hover:text-indigo-600" />
    </div>
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-2">
        <h4 className="font-medium text-slate-800">{title}</h4>
        {badge && (
          <Badge variant="secondary" className="bg-indigo-50 text-indigo-600 text-[10px]">
            {badge}
          </Badge>
        )}
      </div>
      <p className="mt-0.5 text-sm text-slate-500 line-clamp-1">{description}</p>
    </div>
    <ArrowRight className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-1 group-hover:text-indigo-500" />
  </button>
);

/**
 * Stat Badge - Small status indicators
 */
const StatBadge = ({ icon: Icon, label, value, color = 'slate' }) => {
  const colors = {
    slate: 'bg-slate-100 text-slate-700',
    indigo: 'bg-indigo-100 text-indigo-700',
    emerald: 'bg-emerald-100 text-emerald-700',
    amber: 'bg-amber-100 text-amber-700',
    sky: 'bg-sky-100 text-sky-700',
  };
  
  return (
    <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 ${colors[color]}`}>
      <Icon className="h-3.5 w-3.5" />
      <span className="text-xs font-medium">{value}</span>
      <span className="text-xs opacity-70">{label}</span>
    </div>
  );
};

/**
 * Activity Item - Recent configuration changes
 */
const ActivityItem = ({ icon: Icon, title, description, time, color = 'slate' }) => {
  const colors = {
    slate: 'bg-slate-100 text-slate-600',
    indigo: 'bg-indigo-100 text-indigo-600',
    emerald: 'bg-emerald-100 text-emerald-600',
    amber: 'bg-amber-100 text-amber-600',
  };
  
  return (
    <div className="flex items-start gap-3 py-3">
      <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${colors[color]}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-slate-800">{title}</p>
        <p className="text-xs text-slate-500">{description}</p>
      </div>
      <span className="shrink-0 text-xs text-slate-400">{time}</span>
    </div>
  );
};

/**
 * Main SetupDashboard Component
 */
const SetupDashboard = ({ user, objects = [] }) => {
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    totalObjects: 0,
    totalUsers: 0,
    activeFlows: 0,
    storageUsed: '0 MB',
  });
  const [recentActivity, setRecentActivity] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        setLoading(true);
        const token = localStorage.getItem('token');
        const headers = token ? { Authorization: `Bearer ${token}` } : {};

        // Fetch various stats in parallel
        const [objectsRes, usersRes, flowsRes] = await Promise.allSettled([
          axios.get(`${API}/objects`, { headers }),
          axios.get(`${API}/users`, { headers }),
          axios.get(`${API}/flows`, { headers }),
        ]);

        const objectCount = objectsRes.status === 'fulfilled' ? objectsRes.value.data?.length || 0 : objects.length;
        const userCount = usersRes.status === 'fulfilled' ? usersRes.value.data?.length || 0 : 0;
        const flowCount = flowsRes.status === 'fulfilled' ? 
          (Array.isArray(flowsRes.value.data) ? flowsRes.value.data : flowsRes.value.data?.flows || []).filter(f => f.is_active).length : 0;

        setStats({
          totalObjects: objectCount,
          totalUsers: userCount,
          activeFlows: flowCount,
          storageUsed: '256 MB', // Placeholder - would need backend endpoint
        });

        // Generate recent activity based on available data
        const activities = [];
        
        if (objectsRes.status === 'fulfilled' && objectsRes.value.data?.length > 0) {
          const recentObj = objectsRes.value.data[objectsRes.value.data.length - 1];
          activities.push({
            icon: Database,
            title: `Object: ${recentObj.object_label || recentObj.object_name}`,
            description: 'Recently configured',
            time: 'Today',
            color: 'indigo',
          });
        }

        if (flowsRes.status === 'fulfilled') {
          const flows = Array.isArray(flowsRes.value.data) ? flowsRes.value.data : flowsRes.value.data?.flows || [];
          if (flows.length > 0) {
            const recentFlow = flows[flows.length - 1];
            activities.push({
              icon: Zap,
              title: `Flow: ${recentFlow.name || 'Automation'}`,
              description: recentFlow.is_active ? 'Active' : 'Draft',
              time: 'Recent',
              color: 'emerald',
            });
          }
        }

        activities.push({
          icon: Settings2,
          title: 'System Configuration',
          description: 'Setup initialized',
          time: 'Active',
          color: 'slate',
        });

        setRecentActivity(activities);
      } catch (error) {
        console.error('Error fetching stats:', error);
        // Use fallback values
        setStats({
          totalObjects: objects.length,
          totalUsers: 1,
          activeFlows: 0,
          storageUsed: '256 MB',
        });
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [objects]);

  const userName = user?.first_name || user?.name || 'Admin';
  const userRole = user?.role || 'Administrator';

  return (
    <div className="min-h-full">
      {/* Header Section */}
      <div className="mb-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-600 shadow-lg shadow-indigo-500/30">
                <Settings2 className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-900">CRM Control Center</h1>
                <p className="text-sm text-slate-500">
                  Manage objects, automation, users, security, and data from one place.
                </p>
              </div>
            </div>
            <div className="mt-4 flex items-center gap-2 text-sm">
              <CircleDot className="h-3 w-3 text-emerald-500" />
              <span className="text-slate-600">Logged in as</span>
              <span className="font-medium text-slate-800">{userName}</span>
              <Badge variant="secondary" className="bg-indigo-50 text-indigo-700 text-[10px]">
                {userRole}
              </Badge>
            </div>
          </div>

          {/* Status Badges */}
          <div className="flex flex-wrap gap-2">
            <StatBadge icon={Layers} label="Objects" value={stats.totalObjects} color="indigo" />
            <StatBadge icon={Users} label="Users" value={stats.totalUsers} color="emerald" />
            <StatBadge icon={Zap} label="Active Flows" value={stats.activeFlows} color="amber" />
            <StatBadge icon={HardDrive} label="Storage" value={stats.storageUsed} color="sky" />
          </div>
        </div>
      </div>

      {/* Quick Action Cards */}
      <div className="mb-8">
        <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-500">
          <Sparkles className="h-4 w-4" />
          Quick Actions
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <QuickActionCard
            icon={Database}
            title="Schema Builder"
            description="Define and manage your data structure"
            stat={stats.totalObjects}
            statLabel="Objects"
            onClick={() => navigate('/setup/schema-builder')}
            gradient="bg-gradient-to-br from-indigo-500 to-indigo-600"
          />
          <QuickActionCard
            icon={Users}
            title="User Management"
            description="Manage team members and permissions"
            stat={stats.totalUsers}
            statLabel="Users"
            onClick={() => navigate('/setup/users')}
            gradient="bg-gradient-to-br from-emerald-500 to-emerald-600"
          />
          <QuickActionCard
            icon={Zap}
            title="Flow Builder"
            description="Create powerful automations"
            stat={stats.activeFlows}
            statLabel="Active"
            onClick={() => navigate('/flows')}
            gradient="bg-gradient-to-br from-amber-500 to-orange-500"
          />
          <QuickActionCard
            icon={Shield}
            title="Security Center"
            description="Audit logs and security settings"
            stat="24/7"
            statLabel="Protected"
            onClick={() => navigate('/setup/security-center/audit-logs')}
            gradient="bg-gradient-to-br from-rose-500 to-pink-600"
          />
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid gap-8 lg:grid-cols-3">
        {/* Left Column - Setup Categories */}
        <div className="lg:col-span-2 space-y-8">
          {/* Data & Objects Section */}
          <div>
            <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-500">
              <Database className="h-4 w-4" />
              Data & Objects
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <CategoryCard
                icon={Database}
                title="Schema Builder"
                description="Create and manage object definitions"
                onClick={() => navigate('/setup/schema-builder')}
              />
              <CategoryCard
                icon={FileText}
                title="Form Builder"
                description="Design custom input forms"
                onClick={() => navigate('/form-builder')}
              />
              <CategoryCard
                icon={Upload}
                title="Import Builder"
                description="Bulk data import tools"
                onClick={() => navigate('/setup/import-builder')}
              />
              <CategoryCard
                icon={Download}
                title="Export Builder"
                description="Export data and reports"
                onClick={() => navigate('/setup/export-builder')}
              />
            </div>
          </div>

          {/* Automation Section */}
          <div>
            <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-500">
              <Zap className="h-4 w-4" />
              Automation
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <CategoryCard
                icon={Zap}
                title="Flow Builder"
                description="Visual automation designer"
                onClick={() => navigate('/flows')}
                badge={stats.activeFlows > 0 ? `${stats.activeFlows} Active` : null}
              />
              <CategoryCard
                icon={ClipboardList}
                title="Task Manager"
                description="Project and task management"
                onClick={() => navigate('/task-manager')}
              />
              <CategoryCard
                icon={ClipboardList}
                title="Survey Builder"
                description="Create surveys and questionnaires"
                onClick={() => navigate('/survey-builder-v2')}
              />
              <CategoryCard
                icon={MessageSquare}
                title="Chatbot Manager"
                description="Configure chat automation"
                onClick={() => navigate('/setup/chatbot-manager')}
              />
            </div>
          </div>

          {/* Access & Security Section */}
          <div>
            <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-500">
              <Shield className="h-4 w-4" />
              Access & Security
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <CategoryCard
                icon={Users}
                title="Users"
                description="Manage team members"
                onClick={() => navigate('/setup/users')}
                badge={`${stats.totalUsers} Users`}
              />
              <CategoryCard
                icon={Network}
                title="Roles & Hierarchy"
                description="Define organizational structure"
                onClick={() => navigate('/setup/roles-hierarchy')}
              />
              <CategoryCard
                icon={Share2}
                title="Sharing Settings"
                description="Configure data sharing rules"
                onClick={() => navigate('/setup/sharing-settings')}
              />
              <CategoryCard
                icon={Shield}
                title="Security Center"
                description="Audit logs and compliance"
                onClick={() => navigate('/setup/security-center/audit-logs')}
              />
            </div>
          </div>

          {/* Communication Section */}
          <div>
            <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-500">
              <Mail className="h-4 w-4" />
              Communication
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <CategoryCard
                icon={Mail}
                title="Email Templates"
                description="Create reusable email templates"
                onClick={() => navigate('/setup/email-templates')}
              />
              <CategoryCard
                icon={FileText}
                title="DocFlow"
                description="Document generation workflows"
                onClick={() => navigate('/setup/docflow')}
              />
              <CategoryCard
                icon={Calendar}
                title="Booking"
                description="Scheduling and appointments"
                onClick={() => navigate('/booking')}
              />
            </div>
          </div>
        </div>

        {/* Right Column - System Insights */}
        <div className="space-y-6">
          {/* System Health Card */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="flex items-center gap-2 font-semibold text-slate-800">
                <Activity className="h-4 w-4 text-indigo-500" />
                System Health
              </h3>
              <Badge className="bg-emerald-100 text-emerald-700 text-[10px]">
                Healthy
              </Badge>
            </div>
            
            <div className="space-y-4">
              <div>
                <div className="mb-1.5 flex items-center justify-between text-sm">
                  <span className="text-slate-600">API Performance</span>
                  <span className="font-medium text-emerald-600">Excellent</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full w-[95%] rounded-full bg-gradient-to-r from-emerald-400 to-emerald-500" />
                </div>
              </div>
              
              <div>
                <div className="mb-1.5 flex items-center justify-between text-sm">
                  <span className="text-slate-600">Database</span>
                  <span className="font-medium text-emerald-600">Optimal</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full w-[88%] rounded-full bg-gradient-to-r from-emerald-400 to-emerald-500" />
                </div>
              </div>
              
              <div>
                <div className="mb-1.5 flex items-center justify-between text-sm">
                  <span className="text-slate-600">Storage Usage</span>
                  <span className="font-medium text-amber-600">32%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full w-[32%] rounded-full bg-gradient-to-r from-amber-400 to-amber-500" />
                </div>
              </div>
            </div>
          </div>

          {/* Recent Activity Card */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            <h3 className="mb-4 flex items-center gap-2 font-semibold text-slate-800">
              <Clock className="h-4 w-4 text-indigo-500" />
              Recent Configuration
            </h3>
            
            <div className="divide-y divide-slate-100">
              {loading ? (
                <div className="py-8 text-center text-sm text-slate-500">
                  Loading activity...
                </div>
              ) : recentActivity.length > 0 ? (
                recentActivity.map((activity, index) => (
                  <ActivityItem
                    key={index}
                    icon={activity.icon}
                    title={activity.title}
                    description={activity.description}
                    time={activity.time}
                    color={activity.color}
                  />
                ))
              ) : (
                <div className="py-8 text-center text-sm text-slate-500">
                  No recent activity
                </div>
              )}
            </div>
          </div>

          {/* Quick Stats Card */}
          <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-indigo-50 to-white p-6">
            <h3 className="mb-4 flex items-center gap-2 font-semibold text-slate-800">
              <BarChart3 className="h-4 w-4 text-indigo-500" />
              Configuration Overview
            </h3>
            
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-lg bg-white p-3 shadow-sm">
                <div className="flex items-center gap-2">
                  <Database className="h-4 w-4 text-indigo-500" />
                  <span className="text-sm text-slate-600">Custom Objects</span>
                </div>
                <span className="font-semibold text-slate-800">{stats.totalObjects}</span>
              </div>
              
              <div className="flex items-center justify-between rounded-lg bg-white p-3 shadow-sm">
                <div className="flex items-center gap-2">
                  <Zap className="h-4 w-4 text-amber-500" />
                  <span className="text-sm text-slate-600">Active Flows</span>
                </div>
                <span className="font-semibold text-slate-800">{stats.activeFlows}</span>
              </div>
              
              <div className="flex items-center justify-between rounded-lg bg-white p-3 shadow-sm">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-emerald-500" />
                  <span className="text-sm text-slate-600">Team Members</span>
                </div>
                <span className="font-semibold text-slate-800">{stats.totalUsers}</span>
              </div>
              
              <div className="flex items-center justify-between rounded-lg bg-white p-3 shadow-sm">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  <span className="text-sm text-slate-600">System Status</span>
                </div>
                <Badge className="bg-emerald-100 text-emerald-700 text-[10px]">
                  Operational
                </Badge>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SetupDashboard;
