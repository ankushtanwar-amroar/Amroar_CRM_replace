/**
 * DocFlowSetupDashboard - DocFlow-Only Tenant Dashboard
 * 
 * Replaces the CRM Control Center when tenant has CRM disabled.
 * Shows DocFlow-centric quick actions, recent templates/documents, and status.
 */
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  FileText,
  Upload,
  Plus,
  ArrowRight,
  Clock,
  CheckCircle2,
  Activity,
  BarChart3,
  Layers,
  Settings2,
  CircleDot,
  FolderOpen,
  Send,
  Eye,
  FilePlus2,
  FileCheck,
  PenTool,
  Key,
} from 'lucide-react';
import { Badge } from '../../../components/ui/badge';
import { useModuleEntitlementsContext, MODULE_STATES } from '../../../context/ModuleContext';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const QuickActionCard = ({ icon: Icon, title, description, stat, statLabel, onClick, gradient }) => (
  <button
    onClick={onClick}
    data-testid={`docflow-quick-action-${title.toLowerCase().replace(/\s+/g, '-')}`}
    className={`group relative overflow-hidden rounded-2xl p-6 text-left transition-all duration-300 hover:scale-[1.02] hover:shadow-xl ${gradient}`}
  >
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

const CategoryCard = ({ icon: Icon, title, description, onClick, badge, testId }) => (
  <button
    onClick={onClick}
    data-testid={testId}
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

const RecentItem = ({ icon: Icon, title, subtitle, status, time, color = 'slate' }) => {
  const iconColors = {
    slate: 'bg-slate-100 text-slate-600',
    indigo: 'bg-indigo-100 text-indigo-600',
    emerald: 'bg-emerald-100 text-emerald-600',
    amber: 'bg-amber-100 text-amber-600',
  };
  const statusColors = {
    Active: 'bg-emerald-100 text-emerald-700',
    Draft: 'bg-amber-100 text-amber-700',
    Signed: 'bg-indigo-100 text-indigo-700',
    Sent: 'bg-sky-100 text-sky-700',
    Generated: 'bg-slate-100 text-slate-700',
  };
  return (
    <div className="flex items-start gap-3 py-3">
      <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${iconColors[color]}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-slate-800 truncate">{title}</p>
        <p className="text-xs text-slate-500">{subtitle}</p>
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        {status && (
          <Badge className={`text-[10px] ${statusColors[status] || 'bg-slate-100 text-slate-600'}`}>
            {status}
          </Badge>
        )}
        <span className="text-xs text-slate-400">{time}</span>
      </div>
    </div>
  );
};

const DocFlowSetupDashboard = ({ user }) => {
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    totalTemplates: 0,
    activeTemplates: 0,
    totalDocuments: 0,
    pendingSignatures: 0,
  });
  const [recentTemplates, setRecentTemplates] = useState([]);
  const [recentDocuments, setRecentDocuments] = useState([]);
  const [loading, setLoading] = useState(true);

  // Check module states for conditional rendering
  const { getModuleState } = useModuleEntitlementsContext();
  const fileManagerState = getModuleState('file_manager');
  const appManagerState = getModuleState('app_manager');
  const isFileManagerActive = fileManagerState?.state === MODULE_STATES.ACTIVE;
  const isAppManagerActive = appManagerState?.state === MODULE_STATES.ACTIVE;

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const token = localStorage.getItem('token');
        const headers = token ? { Authorization: `Bearer ${token}` } : {};

        const [templatesRes, documentsRes] = await Promise.allSettled([
          axios.get(`${API}/docflow/templates`, { headers }),
          axios.get(`${API}/docflow/documents`, { headers }),
        ]);

        let templates = [];
        if (templatesRes.status === 'fulfilled') {
          const data = templatesRes.value.data;
          templates = Array.isArray(data) ? data : (data?.templates || []);
        }

        let documents = [];
        if (documentsRes.status === 'fulfilled') {
          documents = Array.isArray(documentsRes.value.data)
            ? documentsRes.value.data
            : documentsRes.value.data?.documents || [];
        }

        setStats({
          totalTemplates: templates.length,
          activeTemplates: templates.filter(t => t.status === 'Active').length,
          totalDocuments: documents.length,
          pendingSignatures: documents.filter(d => d.status === 'pending_signature' || d.status === 'sent').length,
        });

        // Recent templates (last 5)
        const sortedTemplates = [...templates]
          .sort((a, b) => new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0))
          .slice(0, 5);
        setRecentTemplates(sortedTemplates);

        // Recent documents (last 5)
        const sortedDocs = [...documents]
          .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
          .slice(0, 5);
        setRecentDocuments(sortedDocs);
      } catch (error) {
        console.error('Error fetching DocFlow stats:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const userName = user?.first_name || user?.name || 'Admin';
  const userRole = user?.role || 'Administrator';

  const formatTime = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="min-h-full" data-testid="docflow-setup-dashboard">
      {/* Header */}
      <div className="mb-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-600 shadow-lg shadow-indigo-500/30">
                <FileText className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-900" data-testid="docflow-dashboard-title">
                  DocFlow Workspace
                </h1>
                <p className="text-sm text-slate-500">
                  Create templates, generate documents, and manage signatures.
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

          <div className="flex flex-wrap gap-2">
            <StatBadge icon={FileText} label="Templates" value={stats.totalTemplates} color="indigo" />
            <StatBadge icon={FileCheck} label="Active" value={stats.activeTemplates} color="emerald" />
            <StatBadge icon={Layers} label="Documents" value={stats.totalDocuments} color="sky" />
            <StatBadge icon={PenTool} label="Pending" value={stats.pendingSignatures} color="amber" />
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="mb-8">
        <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-500">
          <Plus className="h-4 w-4" />
          Quick Actions
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <QuickActionCard
            icon={FilePlus2}
            title="Create Template"
            description="Start a new document template from scratch"
            stat={stats.totalTemplates}
            statLabel="Templates"
            onClick={() => navigate('/setup/docflow')}
            gradient="bg-gradient-to-br from-indigo-500 to-indigo-600"
          />
          <QuickActionCard
            icon={Upload}
            title="Upload Document"
            description="Upload a DOCX or PDF to create a template"
            stat={stats.activeTemplates}
            statLabel="Active"
            onClick={() => navigate('/setup/docflow')}
            gradient="bg-gradient-to-br from-emerald-500 to-emerald-600"
          />
          <QuickActionCard
            icon={Send}
            title="Generate & Send"
            description="Generate a document and send for signing"
            stat={stats.totalDocuments}
            statLabel="Generated"
            onClick={() => navigate('/setup/docflow')}
            gradient="bg-gradient-to-br from-amber-500 to-orange-500"
          />
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid gap-8 lg:grid-cols-3">
        {/* Left Column */}
        <div className="lg:col-span-2 space-y-8">
          {/* DocFlow Modules */}
          <div>
            <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-500">
              <FileText className="h-4 w-4" />
              DocFlow
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <CategoryCard
                icon={FileText}
                title="Templates"
                description="Manage document templates and versions"
                onClick={() => navigate('/setup/docflow')}
                badge={stats.totalTemplates > 0 ? `${stats.totalTemplates} Total` : null}
                testId="docflow-cat-templates"
              />
              {isFileManagerActive && (
              <CategoryCard
                icon={FolderOpen}
                title="File Manager"
                description="Browse and manage uploaded files"
                onClick={() => navigate('/setup/file-manager')}
                testId="docflow-cat-file-manager"
              />
              )}
              <CategoryCard
                icon={Key}
                title="Connections"
                description="Manage external service integrations"
                onClick={() => navigate('/setup/connections')}
                testId="docflow-cat-connections"
              />
              {isAppManagerActive && (
              <CategoryCard
                icon={Layers}
                title="App Manager"
                description="Configure app settings and homepage"
                onClick={() => navigate('/setup/app-manager')}
                testId="docflow-cat-app-manager"
              />
              )}
            </div>
          </div>
        </div>

        {/* Right Column */}
        <div className="space-y-6">
          {/* Recent Templates */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            <h3 className="mb-4 flex items-center gap-2 font-semibold text-slate-800">
              <Clock className="h-4 w-4 text-indigo-500" />
              Recent Templates
            </h3>
            <div className="divide-y divide-slate-100">
              {loading ? (
                <div className="py-8 text-center text-sm text-slate-500">Loading...</div>
              ) : recentTemplates.length > 0 ? (
                recentTemplates.map((t, i) => (
                  <RecentItem
                    key={t.id || i}
                    icon={FileText}
                    title={t.name || 'Untitled Template'}
                    subtitle={`v${t.version || 1} - ${t.output_format || 'PDF'}`}
                    status={t.status || 'Draft'}
                    time={formatTime(t.updated_at || t.created_at)}
                    color={t.status === 'Active' ? 'emerald' : 'amber'}
                  />
                ))
              ) : (
                <div className="py-8 text-center text-sm text-slate-500">
                  No templates yet. Create your first template!
                </div>
              )}
            </div>
          </div>

          {/* Recent Documents */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            <h3 className="mb-4 flex items-center gap-2 font-semibold text-slate-800">
              <Eye className="h-4 w-4 text-indigo-500" />
              Recent Documents
            </h3>
            <div className="divide-y divide-slate-100">
              {loading ? (
                <div className="py-8 text-center text-sm text-slate-500">Loading...</div>
              ) : recentDocuments.length > 0 ? (
                recentDocuments.map((d, i) => (
                  <RecentItem
                    key={d.id || i}
                    icon={FileCheck}
                    title={d.document_name || d.template_name || 'Document'}
                    subtitle={d.recipient_email || 'No recipient'}
                    status={d.status === 'pending_signature' ? 'Sent' : d.status === 'signed' ? 'Signed' : 'Generated'}
                    time={formatTime(d.created_at)}
                    color={d.status === 'signed' ? 'emerald' : 'indigo'}
                  />
                ))
              ) : (
                <div className="py-8 text-center text-sm text-slate-500">
                  No documents generated yet.
                </div>
              )}
            </div>
          </div>

          {/* System Status */}
          <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-indigo-50 to-white p-6">
            <h3 className="mb-4 flex items-center gap-2 font-semibold text-slate-800">
              <BarChart3 className="h-4 w-4 text-indigo-500" />
              Overview
            </h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-lg bg-white p-3 shadow-sm">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-indigo-500" />
                  <span className="text-sm text-slate-600">Total Templates</span>
                </div>
                <span className="font-semibold text-slate-800">{stats.totalTemplates}</span>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-white p-3 shadow-sm">
                <div className="flex items-center gap-2">
                  <Layers className="h-4 w-4 text-sky-500" />
                  <span className="text-sm text-slate-600">Documents Generated</span>
                </div>
                <span className="font-semibold text-slate-800">{stats.totalDocuments}</span>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-white p-3 shadow-sm">
                <div className="flex items-center gap-2">
                  <PenTool className="h-4 w-4 text-amber-500" />
                  <span className="text-sm text-slate-600">Pending Signatures</span>
                </div>
                <span className="font-semibold text-slate-800">{stats.pendingSignatures}</span>
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

export default DocFlowSetupDashboard;
