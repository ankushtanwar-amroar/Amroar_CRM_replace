import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import {
  Bot, Power, MessageSquareText, BookOpen, Plus, Trash2, Save,
  Loader2, CheckCircle2, AlertCircle, Link2, Shield, Wrench,
  ScrollText, Eye, FileText, Package, PenTool, Search,
  ToggleLeft, ToggleRight, Info, Clock, Database,
} from 'lucide-react';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Switch } from '../../components/ui/switch';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../components/ui/tabs';
import toast from 'react-hot-toast';

const API = process.env.REACT_APP_BACKEND_URL;

/* ─── Tab definitions ─── */
const TAB_ITEMS = [
  { id: 'general', label: 'General', icon: Power },
  { id: 'connections', label: 'Connections', icon: Link2 },
  { id: 'permissions', label: 'Permissions & Safety', icon: Shield },
  { id: 'knowledge', label: 'Company Knowledge', icon: BookOpen },
  { id: 'tools', label: 'Tools & External Access', icon: Wrench },
  { id: 'logs', label: 'Logs, Memory & Evals', icon: ScrollText },
];

/* ─── Shared card wrapper ─── */
const SectionCard = ({ icon: Icon, iconColor, title, subtitle, actions, children, testId }) => (
  <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden" data-testid={testId}>
    <div className="px-6 pt-5 pb-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br ${iconColor} shadow-sm`}>
            <Icon className="h-5 w-5 text-white" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-slate-800">{title}</h3>
            {subtitle && <p className="text-xs text-slate-400">{subtitle}</p>}
          </div>
        </div>
        {actions}
      </div>
    </div>
    <div className="px-6 py-5">{children}</div>
  </div>
);

/* ─── Entity permission row ─── */
const EntityPermRow = ({ label, icon: Icon, perms, onChange, testIdPrefix }) => {
  const actions = Object.keys(perms);
  return (
    <div className="flex items-center justify-between py-3 border-b border-slate-100 last:border-0">
      <div className="flex items-center gap-2.5">
        <Icon className="h-4 w-4 text-slate-400" />
        <span className="text-sm font-medium text-slate-700">{label}</span>
      </div>
      <div className="flex items-center gap-4">
        {actions.map((a) => (
          <label key={a} className="flex items-center gap-1.5 cursor-pointer" data-testid={`${testIdPrefix}-${a}`}>
            <Switch
              checked={perms[a]}
              onCheckedChange={(v) => onChange(a, v)}
              className="scale-75"
            />
            <span className="text-xs text-slate-500 capitalize">{a}</span>
          </label>
        ))}
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════
   Main Component
   ═══════════════════════════════════════════════════════════════ */
const ClueBotConfigPage = () => {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [activeTab, setActiveTab] = useState('general');

  // Connections from integration API
  const [availableConnections, setAvailableConnections] = useState([]);
  const [connLoading, setConnLoading] = useState(false);

  /* ─── Fetch config ─── */
  const fetchConfig = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const { data } = await axios.get(`${API}/api/runtime/cluebot-config`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setConfig(data);
    } catch {
      toast.error('Failed to load CluBot configuration');
    } finally {
      setLoading(false);
    }
  }, []);

  /* ─── Fetch available connections ─── */
  const fetchConnections = useCallback(async () => {
    setConnLoading(true);
    try {
      const token = localStorage.getItem('token');
      const { data } = await axios.get(`${API}/api/connections/`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setAvailableConnections(data || []);
    } catch {
      setAvailableConnections([]);
    } finally {
      setConnLoading(false);
    }
  }, []);

  useEffect(() => { fetchConfig(); fetchConnections(); }, [fetchConfig, fetchConnections]);

  /* ─── Save config ─── */
  const handleSave = async () => {
    setSaving(true);
    try {
      const token = localStorage.getItem('token');
      const { data } = await axios.put(`${API}/api/runtime/cluebot-config`, config, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setConfig(data);
      setDirty(false);
      toast.success('Configuration saved');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  /* ─── Deep update helper ─── */
  const updateSection = (section, field, value) => {
    setConfig((prev) => ({
      ...prev,
      [section]: { ...prev[section], [field]: value },
    }));
    setDirty(true);
  };

  const updateNested = (section, sub, field, value) => {
    setConfig((prev) => ({
      ...prev,
      [section]: {
        ...prev[section],
        [sub]: { ...prev[section][sub], [field]: value },
      },
    }));
    setDirty(true);
  };

  /* ─── Knowledge helpers ─── */
  const addKBEntry = () => {
    setConfig((prev) => ({
      ...prev,
      knowledge: {
        ...prev.knowledge,
        entries: [...(prev.knowledge.entries || []), { title: '', content: '' }],
      },
    }));
    setDirty(true);
  };

  const updateKBEntry = (idx, field, value) => {
    setConfig((prev) => {
      const entries = [...prev.knowledge.entries];
      entries[idx] = { ...entries[idx], [field]: value };
      return { ...prev, knowledge: { ...prev.knowledge, entries } };
    });
    setDirty(true);
  };

  const removeKBEntry = (idx) => {
    setConfig((prev) => ({
      ...prev,
      knowledge: {
        ...prev.knowledge,
        entries: prev.knowledge.entries.filter((_, i) => i !== idx),
      },
    }));
    setDirty(true);
  };

  /* ─── Connection toggle ─── */
  const toggleConnection = (connId) => {
    setConfig((prev) => {
      const current = prev.connections.allowed_connection_ids || [];
      const next = current.includes(connId)
        ? current.filter((id) => id !== connId)
        : [...current, connId];
      return {
        ...prev,
        connections: { ...prev.connections, allowed_connection_ids: next },
      };
    });
    setDirty(true);
  };

  /* ─── Loading state ─── */
  if (loading || !config) {
    return (
      <div className="flex items-center justify-center h-64" data-testid="cluebot-config-loading">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-indigo-200 border-t-indigo-600" />
          <p className="text-sm text-slate-400">Loading CluBot Control Center...</p>
        </div>
      </div>
    );
  }

  const isEnabled = config.general?.enabled;

  /* ═══════════════════════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════════════════════ */
  return (
    <div className="max-w-5xl" data-testid="cluebot-config-page">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 shadow-md shadow-violet-200">
            <Bot className="h-5 w-5 text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-800 tracking-tight" data-testid="cluebot-config-title">
              CluBot Control Center
            </h2>
            <p className="text-sm text-slate-500">DocFlow AI Assistant Configuration</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Badge
            variant="outline"
            className={isEnabled ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-50 text-slate-500 border-slate-200'}
            data-testid="cluebot-status-badge"
          >
            {isEnabled ? 'Active' : 'Disabled'}
          </Badge>
          <Button
            onClick={handleSave}
            disabled={!dirty || saving}
            className="bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50"
            data-testid="cluebot-save-btn"
          >
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} data-testid="cluebot-tabs">
        <TabsList className="w-full justify-start bg-white border border-slate-200 rounded-xl p-1 mb-6 flex-wrap h-auto gap-0.5">
          {TAB_ITEMS.map(({ id, label, icon: TabIcon }) => (
            <TabsTrigger
              key={id}
              value={id}
              className="flex items-center gap-1.5 text-xs sm:text-sm data-[state=active]:bg-indigo-50 data-[state=active]:text-indigo-700 data-[state=active]:shadow-none rounded-lg px-3 py-1.5"
              data-testid={`cluebot-tab-${id}`}
            >
              <TabIcon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{label}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        {/* ──────────────── TAB 1: GENERAL ──────────────── */}
        <TabsContent value="general" data-testid="cluebot-tab-content-general">
          <div className="space-y-6">
            {/* Enable / Disable */}
            <SectionCard
              icon={Power}
              iconColor="from-emerald-400 to-green-500"
              title="CluBot Status"
              subtitle="Enable or disable the DocFlow AI assistant"
              testId="cluebot-general-status"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {isEnabled ? <CheckCircle2 className="h-5 w-5 text-emerald-500" /> : <AlertCircle className="h-5 w-5 text-slate-300" />}
                  <div>
                    <p className="text-sm font-semibold text-slate-800">
                      {isEnabled ? 'CluBot is Active' : 'CluBot is Disabled'}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {isEnabled ? 'AI assistant is available for DocFlow users' : 'AI assistant is hidden from all users'}
                    </p>
                  </div>
                </div>
                <Switch
                  checked={isEnabled}
                  onCheckedChange={(v) => updateSection('general', 'enabled', v)}
                  data-testid="cluebot-toggle"
                />
              </div>
            </SectionCard>

            {/* Intent / Personality */}
            <SectionCard
              icon={MessageSquareText}
              iconColor="from-sky-400 to-blue-500"
              title="Intent & Personality"
              subtitle="Define CluBot's behavior and context for DocFlow operations"
              testId="cluebot-general-intent"
            >
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">
                    CluBot Intent / Context
                  </label>
                  <textarea
                    value={config.general?.intent || ''}
                    onChange={(e) => updateSection('general', 'intent', e.target.value)}
                    placeholder="e.g. Assist users with document signing, template creation, package management, and workflow guidance within DocFlow."
                    rows={3}
                    className="w-full rounded-lg border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none transition-colors"
                    data-testid="cluebot-intent-input"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">
                    Personality / Tone
                  </label>
                  <textarea
                    value={config.general?.personality || ''}
                    onChange={(e) => updateSection('general', 'personality', e.target.value)}
                    placeholder="e.g. Professional and concise. Guide users step-by-step. Always confirm before making changes."
                    rows={2}
                    className="w-full rounded-lg border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none transition-colors"
                    data-testid="cluebot-personality-input"
                  />
                </div>
              </div>
            </SectionCard>
          </div>
        </TabsContent>

        {/* ──────────────── TAB 2: CONNECTIONS ──────────────── */}
        <TabsContent value="connections" data-testid="cluebot-tab-content-connections">
          <div className="space-y-6">
            <SectionCard
              icon={Link2}
              iconColor="from-cyan-400 to-teal-500"
              title="Connection Access"
              subtitle="Select which existing connections CluBot can reference (read-only)"
              testId="cluebot-connections-card"
            >
              {/* Retrieval-only toggle */}
              <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-100">
                <div>
                  <p className="text-sm font-medium text-slate-700">Retrieval-Only Mode</p>
                  <p className="text-xs text-slate-400">CluBot can only read from connections, never write</p>
                </div>
                <Switch
                  checked={config.connections?.retrieval_only ?? true}
                  onCheckedChange={(v) => updateSection('connections', 'retrieval_only', v)}
                  data-testid="cluebot-conn-retrieval-only"
                />
              </div>

              {/* Connection list */}
              {connLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                  <span className="ml-2 text-sm text-slate-400">Loading connections...</span>
                </div>
              ) : availableConnections.length === 0 ? (
                <div className="text-center py-8" data-testid="cluebot-no-connections">
                  <Link2 className="h-10 w-10 text-slate-200 mx-auto mb-3" />
                  <p className="text-sm font-medium text-slate-500">No connections configured</p>
                  <p className="text-xs text-slate-400 mt-1">Set up connections in Setup &rarr; Connections first</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {availableConnections.map((conn) => {
                    const isSelected = (config.connections?.allowed_connection_ids || []).includes(conn.id);
                    return (
                      <div
                        key={conn.id}
                        className={`flex items-center justify-between p-3 rounded-xl border transition-colors cursor-pointer ${
                          isSelected ? 'border-indigo-200 bg-indigo-50/50' : 'border-slate-200 bg-slate-50/30 hover:bg-slate-50'
                        }`}
                        onClick={() => toggleConnection(conn.id)}
                        data-testid={`cluebot-conn-${conn.id}`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-xs font-bold text-slate-500">
                            {(conn.provider_name || conn.name || '?')[0].toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-slate-700">{conn.name}</p>
                            <p className="text-xs text-slate-400">
                              {conn.provider_name || 'Unknown provider'} &middot;{' '}
                              <span className={conn.status === 'active' || conn.status === 'validated' ? 'text-emerald-500' : 'text-amber-500'}>
                                {conn.status}
                              </span>
                            </p>
                          </div>
                        </div>
                        <Switch checked={isSelected} onCheckedChange={() => toggleConnection(conn.id)} />
                      </div>
                    );
                  })}
                </div>
              )}
            </SectionCard>

            <div className="rounded-xl bg-blue-50 border border-blue-200 p-4">
              <div className="flex gap-3">
                <Info className="h-4 w-4 text-blue-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-blue-700">
                  CluBot references existing connections configured under Setup &rarr; Connections.
                  No API keys or credentials are stored here. Toggle connections on/off to control CluBot's access scope.
                </p>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* ──────────────── TAB 3: PERMISSIONS & SAFETY ──────────────── */}
        <TabsContent value="permissions" data-testid="cluebot-tab-content-permissions">
          <div className="space-y-6">
            {/* Entity Permissions */}
            <SectionCard
              icon={Shield}
              iconColor="from-rose-400 to-red-500"
              title="DocFlow Entity Permissions"
              subtitle="Control what CluBot can do with each entity type"
              testId="cluebot-permissions-entities"
            >
              <EntityPermRow
                label="Documents"
                icon={FileText}
                perms={config.permissions?.entities?.documents || { read: true, create: false, update: false }}
                onChange={(action, val) => updateNested('permissions', 'entities', 'documents', {
                  ...config.permissions.entities.documents,
                  [action]: val,
                })}
                testIdPrefix="cluebot-perm-documents"
              />
              <EntityPermRow
                label="Templates"
                icon={FileText}
                perms={config.permissions?.entities?.templates || { read: true, create: false, update: false }}
                onChange={(action, val) => updateNested('permissions', 'entities', 'templates', {
                  ...config.permissions.entities.templates,
                  [action]: val,
                })}
                testIdPrefix="cluebot-perm-templates"
              />
              <EntityPermRow
                label="Packages"
                icon={Package}
                perms={config.permissions?.entities?.packages || { read: true, create: false, update: false }}
                onChange={(action, val) => updateNested('permissions', 'entities', 'packages', {
                  ...config.permissions.entities.packages,
                  [action]: val,
                })}
                testIdPrefix="cluebot-perm-packages"
              />
              <EntityPermRow
                label="Signing Actions"
                icon={PenTool}
                perms={config.permissions?.entities?.signing_actions || { read: true, execute: false }}
                onChange={(action, val) => updateNested('permissions', 'entities', 'signing_actions', {
                  ...config.permissions.entities.signing_actions,
                  [action]: val,
                })}
                testIdPrefix="cluebot-perm-signing"
              />
            </SectionCard>

            {/* Safety Controls */}
            <SectionCard
              icon={Eye}
              iconColor="from-amber-400 to-orange-500"
              title="Safety Controls"
              subtitle="Guard rails for CluBot write actions"
              testId="cluebot-safety-controls"
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-700">Require Confirmation</p>
                    <p className="text-xs text-slate-400">CluBot must ask for confirmation before any write action</p>
                  </div>
                  <Switch
                    checked={config.permissions?.require_confirmation ?? true}
                    onCheckedChange={(v) => updateSection('permissions', 'require_confirmation', v)}
                    data-testid="cluebot-require-confirmation"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-700">Preview Before Execution</p>
                    <p className="text-xs text-slate-400">Show a preview of changes before applying them</p>
                  </div>
                  <Switch
                    checked={config.permissions?.preview_before_execution ?? true}
                    onCheckedChange={(v) => updateSection('permissions', 'preview_before_execution', v)}
                    data-testid="cluebot-preview-execution"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-700">Block Direct DB Mutations</p>
                    <p className="text-xs text-slate-400">Prevent CluBot from directly modifying database records</p>
                  </div>
                  <Switch
                    checked={config.permissions?.block_direct_db_mutations ?? true}
                    onCheckedChange={(v) => updateSection('permissions', 'block_direct_db_mutations', v)}
                    data-testid="cluebot-block-mutations"
                  />
                </div>
              </div>
            </SectionCard>
          </div>
        </TabsContent>

        {/* ──────────────── TAB 4: COMPANY KNOWLEDGE ──────────────── */}
        <TabsContent value="knowledge" data-testid="cluebot-tab-content-knowledge">
          <div className="space-y-6">
            <SectionCard
              icon={BookOpen}
              iconColor="from-amber-400 to-orange-500"
              title="Knowledge Base"
              subtitle="Provide instructions, FAQs, and guidance for CluBot"
              actions={
                <Button
                  variant="outline"
                  size="sm"
                  onClick={addKBEntry}
                  className="border-indigo-200 text-indigo-600 hover:bg-indigo-50"
                  data-testid="cluebot-kb-add-btn"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add Entry
                </Button>
              }
              testId="cluebot-kb-card"
            >
              {(!config.knowledge?.entries || config.knowledge.entries.length === 0) ? (
                <div className="flex flex-col items-center justify-center py-10 text-center" data-testid="cluebot-kb-empty">
                  <BookOpen className="h-10 w-10 text-slate-200 mb-3" />
                  <p className="text-sm font-medium text-slate-500">No knowledge base entries yet</p>
                  <p className="text-xs text-slate-400 mt-1 max-w-xs">
                    Add entries to teach CluBot about your DocFlow workflows, policies, and common questions.
                  </p>
                  <Button variant="outline" size="sm" onClick={addKBEntry} className="mt-4 border-indigo-200 text-indigo-600 hover:bg-indigo-50">
                    <Plus className="h-4 w-4 mr-1" /> Add First Entry
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {config.knowledge.entries.map((entry, idx) => (
                    <div key={idx} className="rounded-xl border border-slate-200 bg-slate-50/30 p-4 relative group" data-testid={`cluebot-kb-entry-${idx}`}>
                      <div className="flex items-start gap-3">
                        <div className="flex-1 space-y-3">
                          <Input
                            value={entry.title}
                            onChange={(e) => updateKBEntry(idx, 'title', e.target.value)}
                            placeholder="Entry title (e.g. Signing Guide)"
                            className="h-9 text-sm font-medium bg-white"
                            data-testid={`cluebot-kb-title-${idx}`}
                          />
                          <textarea
                            value={entry.content}
                            onChange={(e) => updateKBEntry(idx, 'content', e.target.value)}
                            placeholder="Content, instructions, or FAQ answer..."
                            rows={3}
                            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
                            data-testid={`cluebot-kb-content-${idx}`}
                          />
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeKBEntry(idx)}
                          className="h-8 w-8 p-0 text-slate-400 hover:text-red-500 hover:bg-red-50 flex-shrink-0"
                          data-testid={`cluebot-kb-remove-${idx}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>

            {/* File upload - Coming Soon */}
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/50 p-6 text-center" data-testid="cluebot-kb-file-upload">
              <Database className="h-8 w-8 text-slate-300 mx-auto mb-2" />
              <p className="text-sm font-medium text-slate-400">File Upload</p>
              <p className="text-xs text-slate-400 mt-1">Upload documents for CluBot to reference</p>
              <Badge variant="outline" className="mt-3 text-slate-400 border-slate-300">Coming Soon</Badge>
            </div>
          </div>
        </TabsContent>

        {/* ──────────────── TAB 5: TOOLS & EXTERNAL ACCESS ──────────────── */}
        <TabsContent value="tools" data-testid="cluebot-tab-content-tools">
          <div className="space-y-6">
            <SectionCard
              icon={Search}
              iconColor="from-indigo-400 to-violet-500"
              title="Internal DocFlow Tools"
              subtitle="Control which internal tools CluBot can use"
              testId="cluebot-tools-internal"
            >
              {Object.entries(config.tools?.internal_tools || {}).map(([key, val]) => {
                const toolLabels = {
                  search_templates: { label: 'Search Templates', desc: 'Query and find templates' },
                  search_documents: { label: 'Search Documents', desc: 'Query and find documents' },
                  search_packages: { label: 'Search Packages', desc: 'Query and find packages' },
                  generate_summary: { label: 'Generate Summary', desc: 'AI-powered document summaries' },
                  draft_email: { label: 'Draft Email', desc: 'Draft notification emails' },
                };
                const info = toolLabels[key] || { label: key, desc: '' };
                return (
                  <div key={key} className="flex items-center justify-between py-3 border-b border-slate-100 last:border-0">
                    <div>
                      <p className="text-sm font-medium text-slate-700">{info.label}</p>
                      <p className="text-xs text-slate-400">{info.desc}</p>
                    </div>
                    <Switch
                      checked={val}
                      onCheckedChange={(v) => updateNested('tools', 'internal_tools', key, v)}
                      data-testid={`cluebot-tool-${key}`}
                    />
                  </div>
                );
              })}
            </SectionCard>

            <SectionCard
              icon={Wrench}
              iconColor="from-slate-400 to-slate-600"
              title="External Access"
              subtitle="Allow CluBot to call external services"
              testId="cluebot-tools-external"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-700">Enable External API Access</p>
                  <p className="text-xs text-slate-400">Allow CluBot to make outbound API calls through connections</p>
                </div>
                <Switch
                  checked={config.tools?.external_access || false}
                  onCheckedChange={(v) => updateSection('tools', 'external_access', v)}
                  data-testid="cluebot-external-access"
                />
              </div>
              {!config.tools?.external_access && (
                <div className="mt-3 rounded-lg bg-amber-50 border border-amber-200 p-3">
                  <p className="text-xs text-amber-700 flex items-center gap-2">
                    <Shield className="h-3.5 w-3.5" />
                    External access is disabled. CluBot can only use internal DocFlow tools.
                  </p>
                </div>
              )}
            </SectionCard>
          </div>
        </TabsContent>

        {/* ──────────────── TAB 6: LOGS, MEMORY & EVALS ──────────────── */}
        <TabsContent value="logs" data-testid="cluebot-tab-content-logs">
          <div className="space-y-6">
            {/* Logging Config */}
            <SectionCard
              icon={ScrollText}
              iconColor="from-teal-400 to-emerald-500"
              title="Action Logging"
              subtitle="Track CluBot actions for audit and review"
              testId="cluebot-logs-config"
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-700">Enable Logging</p>
                    <p className="text-xs text-slate-400">Log all CluBot write actions for audit trails</p>
                  </div>
                  <Switch
                    checked={config.logs?.logging_enabled ?? true}
                    onCheckedChange={(v) => updateSection('logs', 'logging_enabled', v)}
                    data-testid="cluebot-logging-toggle"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-700">Log Retention (days)</p>
                    <p className="text-xs text-slate-400">How long to keep log entries</p>
                  </div>
                  <Input
                    type="number"
                    min={1}
                    max={365}
                    value={config.logs?.log_retention_days ?? 30}
                    onChange={(e) => updateSection('logs', 'log_retention_days', parseInt(e.target.value) || 30)}
                    className="w-24 h-9 text-sm text-right"
                    data-testid="cluebot-retention-days"
                  />
                </div>
              </div>
            </SectionCard>

            {/* Memory */}
            <SectionCard
              icon={Database}
              iconColor="from-purple-400 to-violet-500"
              title="Memory & Context"
              subtitle="Manage CluBot's memory and session context"
              testId="cluebot-memory-config"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-700">Enable Session Memory</p>
                  <p className="text-xs text-slate-400">CluBot remembers context within a user session</p>
                </div>
                <Switch
                  checked={config.logs?.memory_enabled || false}
                  onCheckedChange={(v) => updateSection('logs', 'memory_enabled', v)}
                  data-testid="cluebot-memory-toggle"
                />
              </div>
            </SectionCard>

            {/* Recent Logs Viewer */}
            <SectionCard
              icon={Clock}
              iconColor="from-slate-400 to-slate-600"
              title="Recent Action Logs"
              subtitle="Latest CluBot actions and events"
              testId="cluebot-logs-viewer"
            >
              {(!config.logs?.recent_logs || config.logs.recent_logs.length === 0) ? (
                <div className="text-center py-8" data-testid="cluebot-no-logs">
                  <ScrollText className="h-10 w-10 text-slate-200 mx-auto mb-3" />
                  <p className="text-sm font-medium text-slate-500">No action logs yet</p>
                  <p className="text-xs text-slate-400 mt-1">Logs will appear here when CluBot performs actions</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {[...(config.logs.recent_logs || [])].reverse().map((log, idx) => (
                    <div key={idx} className="flex items-start gap-3 p-3 rounded-lg bg-slate-50 border border-slate-100" data-testid={`cluebot-log-entry-${idx}`}>
                      <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${log.status === 'completed' ? 'bg-emerald-400' : log.status === 'failed' ? 'bg-red-400' : 'bg-amber-400'}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-slate-700">{log.action}</span>
                          {log.entity && <Badge variant="outline" className="text-[10px] px-1.5 py-0">{log.entity}</Badge>}
                        </div>
                        {log.details && <p className="text-xs text-slate-400 mt-0.5 truncate">{log.details}</p>}
                        <p className="text-[10px] text-slate-300 mt-1">{log.timestamp}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ClueBotConfigPage;
