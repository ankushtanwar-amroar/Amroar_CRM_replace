/**
 * DocFlowSetupDashboard - DocFlow-Only Tenant Dashboard
 * 
 * Layout:
 * - Quick Actions pill buttons + 3 gradient hero cards
 * - MODULES 2x2 grid with count badges (Connections shows real data)
 * - ORGANIZATION section (Company Info + Access & Security)
 * - Right sidebar: Recent Templates + Overview stats
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
  CircleDot,
  Send,
  FilePlus2,
  FileCheck,
  PenTool,
  Key,
  Users,
  Building2,
  Bot,
  Shield,
  Package,
  Link2,
  UserPlus,
  Layers,
  Settings,
  BarChart3,
  CheckCircle2,
  Cloud,
  Plug,
  AlertCircle,
} from 'lucide-react';
import { Badge } from '../../../components/ui/badge';
import { useModuleEntitlementsContext, MODULE_STATES } from '../../../context/ModuleContext';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

/* ─── Quick Action Pill ─── */
const QuickActionPill = ({ icon: Icon, label, onClick, testId }) => (
  <button
    onClick={onClick}
    data-testid={testId}
    className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-all hover:border-slate-300 hover:bg-slate-50 hover:shadow-sm"
  >
    <Icon className="h-3.5 w-3.5 text-slate-500" />
    {label}
  </button>
);

/* ─── Hero Gradient Card ─── */
const HeroCard = ({ icon: Icon, title, description, stat, statLabel, onClick, gradient, testId }) => (
  <button
    onClick={onClick}
    data-testid={testId}
    className={`group relative overflow-hidden rounded-2xl p-6 text-left transition-all duration-300 hover:scale-[1.02] hover:shadow-xl ${gradient}`}
  >
    <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-white/10 blur-xl transition-transform group-hover:scale-150" />
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

/* ─── Module Card ─── */
const ModuleCard = ({ icon: Icon, iconBg, title, description, badges, onClick, testId, children }) => (
  <button
    onClick={onClick}
    data-testid={testId}
    className="group flex flex-col rounded-xl border border-slate-200 bg-white p-5 text-left transition-all duration-200 hover:border-slate-300 hover:shadow-md"
  >
    <div className="flex items-start justify-between mb-3">
      <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${iconBg}`}>
        <Icon className="h-5 w-5 text-white" />
      </div>
      <ArrowRight className="h-4 w-4 text-slate-300 transition-transform group-hover:translate-x-1 group-hover:text-slate-500" />
    </div>
    <h4 className="font-semibold text-slate-800 mb-1">{title}</h4>
    <p className="text-sm text-slate-500 mb-3 line-clamp-2">{description}</p>
    {children}
    {!children && badges && badges.length > 0 && (
      <div className="mt-auto flex flex-wrap gap-1.5">
        {badges.map((b, i) => (
          <span key={i} className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ${b.color}`}>
            {b.label}
          </span>
        ))}
      </div>
    )}
  </button>
);

/* ─── Organization Card ─── */
const OrgCard = ({ icon: Icon, iconBg, title, description, links, onClick, testId }) => (
  <button
    onClick={onClick}
    data-testid={testId}
    className="group flex flex-col rounded-xl border border-slate-200 bg-white p-5 text-left transition-all duration-200 hover:border-slate-300 hover:shadow-md"
  >
    <div className="flex items-start justify-between mb-3">
      <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${iconBg}`}>
        <Icon className="h-5 w-5 text-white" />
      </div>
      <ArrowRight className="h-4 w-4 text-slate-300 transition-transform group-hover:translate-x-1 group-hover:text-slate-500" />
    </div>
    <h4 className="font-semibold text-slate-800 mb-1">{title}</h4>
    <p className="text-sm text-slate-500 mb-3">{description}</p>
    {links && links.length > 0 && (
      <div className="mt-auto flex flex-wrap gap-2">
        {links.map((l, i) => (
          <span key={i} className="text-xs text-indigo-600 font-medium">{l}</span>
        ))}
      </div>
    )}
  </button>
);

/* ─── Stat Pill (header) ─── */
const StatPill = ({ icon: Icon, label, value, color }) => (
  <div className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 ${color}`}>
    <Icon className="h-3.5 w-3.5" />
    <span className="text-xs font-semibold">{value}</span>
    <span className="text-xs opacity-75">{label}</span>
  </div>
);

/* ─── Section Heading ─── */
const SectionHeading = ({ icon: Icon, title }) => (
  <h2 className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-slate-400">
    <Icon className="h-3.5 w-3.5" />
    {title}
  </h2>
);

/* ─── Recent Template Item ─── */
const RecentItem = ({ title, subtitle, status, time, color }) => {
  const statusColors = {
    Active: 'bg-emerald-100 text-emerald-700',
    Draft: 'bg-amber-100 text-amber-700',
    Signed: 'bg-indigo-100 text-indigo-700',
    Sent: 'bg-sky-100 text-sky-700',
    Generated: 'bg-slate-100 text-slate-700',
  };
  const dotColors = { emerald: 'bg-emerald-500', amber: 'bg-amber-500', indigo: 'bg-indigo-500', slate: 'bg-slate-400' };
  return (
    <div className="flex items-center gap-3 py-2.5">
      <div className={`h-2 w-2 rounded-full shrink-0 ${dotColors[color] || 'bg-slate-400'}`} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-slate-700 truncate">{title}</p>
        <p className="text-xs text-slate-400">{subtitle}</p>
      </div>
      <div className="flex flex-col items-end gap-0.5 shrink-0">
        {status && (
          <Badge className={`text-[10px] font-medium ${statusColors[status] || 'bg-slate-100 text-slate-600'}`}>
            {status}
          </Badge>
        )}
        {time && <span className="text-[10px] text-slate-400">{time}</span>}
      </div>
    </div>
  );
};

/* ─── Overview Stat Card ─── */
const OverviewStat = ({ icon: Icon, label, value, iconColor }) => (
  <div className="flex items-center gap-3 rounded-lg bg-white border border-slate-100 p-3 shadow-sm" data-testid={`overview-stat-${label.toLowerCase().replace(/\s+/g, '-')}`}>
    <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${iconColor}`}>
      <Icon className="h-4 w-4 text-white" />
    </div>
    <div className="min-w-0 flex-1">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-lg font-bold text-slate-800">{value}</p>
    </div>
  </div>
);

/* ─── Connection Status Row ─── */
const ConnectionRow = ({ name, provider, status, lastTested }) => {
  const isConnected = status === 'active' || status === 'connected';
  return (
    <div className="flex items-center gap-2.5 py-2">
      <Cloud className="h-4 w-4 text-slate-400 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-slate-700 truncate">{name}</p>
        <p className="text-xs text-slate-400">{provider}</p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {isConnected ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 rounded-full px-2 py-0.5">
            <CheckCircle2 className="h-3 w-3" />
            Connected
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 bg-slate-100 rounded-full px-2 py-0.5">
            <AlertCircle className="h-3 w-3" />
            Not Connected
          </span>
        )}
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════
   Main Dashboard
   ═══════════════════════════════════════════════ */
const DocFlowSetupDashboard = ({ user }) => {
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    totalTemplates: 0, activeTemplates: 0, draftTemplates: 0,
    totalDocuments: 0, completedDocuments: 0,
    totalPackages: 0, activePackages: 0, pendingPackages: 0,
    pendingSignatures: 0, totalUsers: 0,
    totalConnections: 0, connectedCount: 0,
  });
  const [recentTemplates, setRecentTemplates] = useState([]);
  const [connectionsList, setConnectionsList] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const token = localStorage.getItem('token');
        const headers = token ? { Authorization: `Bearer ${token}` } : {};

        const [templatesRes, documentsRes, usersRes, packagesRes, connectionsRes] = await Promise.allSettled([
          axios.get(`${API}/docflow/templates`, { headers }),
          axios.get(`${API}/docflow/documents`, { headers }),
          axios.get(`${API}/users`, { headers }),
          axios.get(`${API}/docflow/packages`, { headers }),
          axios.get(`${API}/connections/`, { headers }),
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

        let packages = [];
        if (packagesRes.status === 'fulfilled') {
          const pData = packagesRes.value.data;
          packages = Array.isArray(pData) ? pData : (pData?.packages || []);
        }

        let connections = [];
        if (connectionsRes.status === 'fulfilled') {
          const cData = connectionsRes.value.data;
          connections = Array.isArray(cData) ? cData : (cData?.connections || []);
        }

        const userCount = usersRes.status === 'fulfilled' ? (usersRes.value.data?.length || 0) : 0;

        setStats({
          totalTemplates: templates.length,
          activeTemplates: templates.filter(t => t.status === 'Active').length,
          draftTemplates: templates.filter(t => t.status !== 'Active').length,
          totalDocuments: documents.length,
          completedDocuments: documents.filter(d => d.status === 'signed' || d.status === 'completed').length,
          totalPackages: packages.length,
          activePackages: packages.filter(p => p.status === 'active' || p.status === 'sent').length,
          pendingPackages: packages.filter(p => p.status === 'pending' || p.status === 'pending_signature').length,
          pendingSignatures: documents.filter(d => d.status === 'pending_signature' || d.status === 'sent').length,
          totalUsers: userCount,
          totalConnections: connections.length,
          connectedCount: connections.filter(c => c.status === 'active' || c.is_active).length,
        });

        setConnectionsList(connections.slice(0, 4));

        setRecentTemplates(
          [...templates]
            .sort((a, b) => new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0))
            .slice(0, 5)
        );
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

      {/* ── Header ────────────────────────────── */}
      <div className="mb-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-600 shadow-lg shadow-indigo-500/25">
                <FileText className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900" data-testid="docflow-dashboard-title">
                  DocFlow Workspace
                </h1>
                <p className="text-sm text-slate-500">
                  Create templates, generate documents, and manage signatures.
                </p>
              </div>
            </div>
            <div className="mt-2 flex items-center gap-2 text-sm">
              <CircleDot className="h-3 w-3 text-emerald-500" />
              <span className="text-slate-600">Logged in as</span>
              <span className="font-medium text-slate-800">{userName}</span>
              <Badge variant="secondary" className="bg-indigo-50 text-indigo-700 text-[10px]">
                {userRole}
              </Badge>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatPill icon={FileText} label="Templates" value={stats.totalTemplates} color="bg-indigo-50 text-indigo-700" />
            <StatPill icon={Package} label="Packages" value={stats.totalPackages} color="bg-emerald-50 text-emerald-700" />
            <StatPill icon={Layers} label="Documents" value={stats.totalDocuments} color="bg-sky-50 text-sky-700" />
            <StatPill icon={PenTool} label="Pending" value={stats.pendingSignatures} color="bg-amber-50 text-amber-700" />
          </div>
        </div>
      </div>

      {/* ── Quick Actions ─────────────────────── */}
      <section className="mb-6">
        <SectionHeading icon={Plus} title="Quick Actions" />
        <div className="flex flex-wrap gap-2 mb-5">
          <QuickActionPill icon={FilePlus2} label="Create Template" onClick={() => navigate('/setup/docflow')} testId="qa-pill-create-template" />
          <QuickActionPill icon={Upload} label="Upload Document" onClick={() => navigate('/setup/docflow')} testId="qa-pill-upload-document" />
          <QuickActionPill icon={Send} label="Generate & Send" onClick={() => navigate('/setup/docflow')} testId="qa-pill-generate-send" />
          <QuickActionPill icon={Package} label="Create Package" onClick={() => navigate('/setup/docflow')} testId="qa-pill-create-package" />
          <QuickActionPill icon={Link2} label="Add Connection" onClick={() => navigate('/setup/connections')} testId="qa-pill-add-connection" />
          <QuickActionPill icon={UserPlus} label="Invite User" onClick={() => navigate('/setup/users')} testId="qa-pill-invite-user" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <HeroCard icon={FilePlus2} title="Create Template" description="Start a new document template" stat={stats.totalTemplates} statLabel="Templates" onClick={() => navigate('/setup/docflow')} gradient="bg-gradient-to-br from-indigo-500 to-indigo-600" testId="docflow-hero-create-template" />
          <HeroCard icon={Upload} title="Upload Document" description="Upload a DOCX or PDF" stat={stats.activeTemplates} statLabel="Active" onClick={() => navigate('/setup/docflow')} gradient="bg-gradient-to-br from-emerald-500 to-teal-600" testId="docflow-hero-upload-document" />
          <HeroCard icon={Send} title="Generate & Send" description="Generate and send for signing" stat={stats.totalDocuments} statLabel="Generated" onClick={() => navigate('/setup/docflow')} gradient="bg-gradient-to-br from-amber-500 to-orange-500" testId="docflow-hero-generate-send" />
        </div>
      </section>

      {/* ── Two-Column Layout ────────────────── */}
      <div className="grid gap-6 lg:grid-cols-3">

        {/* Left Column */}
        <div className="lg:col-span-2 space-y-6">

          {/* MODULES */}
          <section>
            <SectionHeading icon={Settings} title="Modules" />
            <div className="grid gap-4 sm:grid-cols-2">
              <ModuleCard
                icon={FileText} iconBg="bg-indigo-500" title="Templates"
                description="Manage document templates, versions, and field mappings"
                badges={[
                  { label: `${stats.totalTemplates} Total`, color: 'bg-indigo-50 text-indigo-700' },
                  { label: `${stats.activeTemplates} Active`, color: 'bg-emerald-50 text-emerald-700' },
                  { label: `${stats.draftTemplates} Draft`, color: 'bg-amber-50 text-amber-700' },
                ]}
                onClick={() => navigate('/setup/docflow')} testId="module-templates"
              />
              <ModuleCard
                icon={Package} iconBg="bg-emerald-500" title="Packages"
                description="Manage document packages and signing workflows"
                badges={[
                  { label: `${stats.totalPackages} Total`, color: 'bg-indigo-50 text-indigo-700' },
                  { label: `${stats.activePackages} Active`, color: 'bg-emerald-50 text-emerald-700' },
                  { label: `${stats.pendingPackages} Pending`, color: 'bg-amber-50 text-amber-700' },
                ]}
                onClick={() => navigate('/setup/docflow')} testId="module-packages"
              />

              {/* Connections — show real connection data */}
              <ModuleCard
                icon={Link2} iconBg="bg-sky-500" title="Connections"
                description="Configure Salesforce and external integrations"
                onClick={() => navigate('/setup/connections')} testId="module-connections"
              >
                {connectionsList.length > 0 ? (
                  <div className="mt-auto space-y-0 divide-y divide-slate-100">
                    {connectionsList.map((conn) => (
                      <ConnectionRow
                        key={conn.id}
                        name={conn.name}
                        provider={conn.provider_name || conn.category_name || ''}
                        status={conn.is_active ? 'active' : conn.status}
                        lastTested={conn.last_tested_at}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="mt-auto flex flex-wrap gap-1.5">
                    <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium bg-indigo-50 text-indigo-700">
                      {stats.totalConnections} Total
                    </span>
                    <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium bg-emerald-50 text-emerald-700">
                      {stats.connectedCount} Connected
                    </span>
                  </div>
                )}
              </ModuleCard>

              <ModuleCard
                icon={Bot} iconBg="bg-amber-500" title="AI & Automation"
                description="Configure CluBot assistant and automation rules"
                badges={[]}
                onClick={() => navigate('/setup/cluebot-configuration')} testId="module-ai-automation"
              />
            </div>
          </section>

          {/* ORGANIZATION */}
          <section>
            <SectionHeading icon={Building2} title="Organization" />
            <div className="grid gap-4 sm:grid-cols-2">
              <OrgCard icon={Building2} iconBg="bg-slate-700" title="Company Information" description="Organization details and plan info" links={['Profile', 'Plan', 'Billing']} onClick={() => navigate('/setup/company-information')} testId="org-company-info" />
              <OrgCard icon={Shield} iconBg="bg-rose-500" title="Access & Security" description="Users, roles, and permissions" links={[`${stats.totalUsers} Users`, 'Roles', 'Permissions']} onClick={() => navigate('/setup/users')} testId="org-access-security" />
            </div>
          </section>
        </div>

        {/* Right Column */}
        <div className="space-y-5">

          {/* Recent Templates */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <h3 className="mb-3 flex items-center gap-2 font-semibold text-slate-800 text-sm">
              <Clock className="h-4 w-4 text-indigo-500" />
              Recent Templates
            </h3>
            <div className="divide-y divide-slate-100">
              {loading ? (
                <div className="py-6 text-center text-sm text-slate-400">Loading...</div>
              ) : recentTemplates.length > 0 ? (
                recentTemplates.map((t, i) => (
                  <RecentItem
                    key={t.id || i}
                    title={t.name || 'Untitled Template'}
                    subtitle={`v${t.version || 1} - ${t.output_format || 'PDF'}`}
                    status={t.status || 'Draft'}
                    time={formatTime(t.updated_at || t.created_at)}
                    color={t.status === 'Active' ? 'emerald' : 'amber'}
                  />
                ))
              ) : (
                <div className="py-6 text-center text-sm text-slate-400">
                  No templates yet. Create your first template!
                </div>
              )}
            </div>
          </div>

          {/* Overview */}
          <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-5" data-testid="overview-section">
            <h3 className="mb-4 flex items-center gap-2 font-semibold text-slate-800 text-sm">
              <BarChart3 className="h-4 w-4 text-indigo-500" />
              Overview
            </h3>
            <div className="space-y-2.5">
              <OverviewStat icon={FileText} label="Total Templates" value={stats.totalTemplates} iconColor="bg-indigo-500" />
              <OverviewStat icon={Layers} label="Active Documents" value={stats.totalDocuments - stats.completedDocuments} iconColor="bg-sky-500" />
              <OverviewStat icon={PenTool} label="Pending Signatures" value={stats.pendingSignatures} iconColor="bg-amber-500" />
              <OverviewStat icon={CheckCircle2} label="Completed Documents" value={stats.completedDocuments} iconColor="bg-emerald-500" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DocFlowSetupDashboard;
