/**
 * ConnectionsPage - Setup > Connections
 * Enterprise-grade connection management with 3 sub-tabs:
 *   Connections (main) | Categories (read-only) | Providers (read-only)
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, CardContent } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Badge } from '../../../components/ui/badge';
import { Switch } from '../../../components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../../components/ui/tabs';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '../../../components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../../../components/ui/select';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '../../../components/ui/dropdown-menu';
import {
  Plug, Plus, Edit2, Trash2, Loader2, Mail, Brain, MessageCircle, Calendar,
  RefreshCw, Globe, CheckCircle, XCircle, AlertCircle, MoreVertical, Play,
  Pause, Star, TestTube, ArrowLeft, ExternalLink, Server, Send, Cloud,
  Sparkles, Bot, Wand2, Phone, Eye, EyeOff, Copy, Search, List, Grid3X3,
  Shield, Clock, Activity, ChevronRight, X, Info,
} from 'lucide-react';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const CATEGORY_ICONS = { mail: Mail, brain: Brain, 'message-circle': MessageCircle, calendar: Calendar, 'refresh-cw': RefreshCw, globe: Globe, plug: Plug };
const PROVIDER_ICONS = { send: Send, mail: Mail, cloud: Cloud, server: Server, sparkles: Sparkles, 'wand-2': Wand2, bot: Bot, phone: Phone, globe: Globe, plug: Plug };

const getIcon = (map, name) => map[name] || Plug;

/* ═══════════════════════════════════════════════════
   Main Component
   ═══════════════════════════════════════════════════ */
const ConnectionsPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [categories, setCategories] = useState([]);
  const [providers, setProviders] = useState([]);
  const [connections, setConnections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [subTab, setSubTab] = useState('connections');
  const [searchTerm, setSearchTerm] = useState('');

  // Wizard & detail states
  const [wizardOpen, setWizardOpen] = useState(false);
  const [editingConnection, setEditingConnection] = useState(null);
  const [detailConnection, setDetailConnection] = useState(null);
  const [testingConnectionId, setTestingConnectionId] = useState(null);

  const token = localStorage.getItem('token');

  // OAuth return
  useEffect(() => {
    const oauthStatus = searchParams.get('oauth');
    if (oauthStatus === 'success') { toast.success('Connection authorized!'); setSearchParams({}); }
    else if (oauthStatus === 'error') { toast.error((searchParams.get('message') || 'OAuth failed').replace(/\+/g, ' ')); setSearchParams({}); }
  }, [searchParams, setSearchParams]);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const h = { Authorization: `Bearer ${token}` };
      const [catRes, provRes, connRes] = await Promise.all([
        fetch(`${API_URL}/api/connections/categories`, { headers: h }),
        fetch(`${API_URL}/api/connections/providers`, { headers: h }),
        fetch(`${API_URL}/api/connections/`, { headers: h }),
      ]);
      if (catRes.ok) setCategories(await catRes.json());
      if (provRes.ok) setProviders(await provRes.json());
      if (connRes.ok) setConnections(await connRes.json());
    } catch { toast.error('Failed to load connections data'); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { if (token) fetchData(); }, [token, fetchData]);

  /* ─── Actions ─── */
  const apiAction = async (url, method = 'POST') => {
    const res = await fetch(url, { method, headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.detail || 'Action failed'); }
    return res.json();
  };

  const handleTest = async (id) => {
    setTestingConnectionId(id);
    try { const r = await apiAction(`${API_URL}/api/connections/${id}/test`); r.status === 'success' ? toast.success('Connection verified!') : toast.error(r.message || 'Test failed'); fetchData(); }
    catch (e) { toast.error(e.message); }
    finally { setTestingConnectionId(null); }
  };

  const handleActivate = async (id) => { try { await apiAction(`${API_URL}/api/connections/${id}/activate`); toast.success('Activated'); fetchData(); } catch (e) { toast.error(e.message); } };
  const handleDeactivate = async (id) => { try { await apiAction(`${API_URL}/api/connections/${id}/deactivate`); toast.success('Deactivated'); fetchData(); } catch (e) { toast.error(e.message); } };
  const handleSetDefault = async (id) => { try { await apiAction(`${API_URL}/api/connections/${id}/set-default`); toast.success('Default updated'); fetchData(); } catch (e) { toast.error(e.message); } };
  const handleDuplicate = async (id) => { try { await apiAction(`${API_URL}/api/connections/${id}/duplicate`); toast.success('Connection duplicated'); fetchData(); } catch (e) { toast.error(e.message); } };
  const handleDelete = async (id) => { if (!window.confirm('Delete this connection?')) return; try { await apiAction(`${API_URL}/api/connections/${id}`, 'DELETE'); toast.success('Connection deleted'); fetchData(); } catch (e) { toast.error(e.message); } };

  /* ─── Filtering ─── */
  const filtered = connections.filter(c => {
    if (selectedCategory !== 'all' && c.category_id !== selectedCategory) return false;
    if (searchTerm && !c.name.toLowerCase().includes(searchTerm.toLowerCase()) && !(c.provider_name || '').toLowerCase().includes(searchTerm.toLowerCase())) return false;
    return true;
  });

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-indigo-500" /></div>;

  return (
    <div className="max-w-6xl" data-testid="connections-page">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-teal-600 shadow-md shadow-teal-200">
            <Plug className="h-5 w-5 text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-800 tracking-tight" data-testid="connections-title">Connections</h2>
            <p className="text-sm text-slate-500">Manage your external service connections for email, AI, messaging, and more</p>
          </div>
        </div>
        <Button onClick={() => { setEditingConnection(null); setWizardOpen(true); }} className="bg-indigo-600 hover:bg-indigo-700 text-white" data-testid="add-connection-btn">
          <Plus className="h-4 w-4 mr-2" />Add Connection
        </Button>
      </div>

      {/* Sub-Navigation */}
      <Tabs value={subTab} onValueChange={setSubTab} data-testid="connections-sub-tabs">
        <TabsList className="bg-white border border-slate-200 rounded-xl p-1 mb-6">
          <TabsTrigger value="connections" className="flex items-center gap-1.5 data-[state=active]:bg-indigo-50 data-[state=active]:text-indigo-700 rounded-lg px-4 py-1.5 text-sm" data-testid="sub-tab-connections">
            <Plug className="h-3.5 w-3.5" />Connections
            <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0">{connections.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="categories" className="flex items-center gap-1.5 data-[state=active]:bg-indigo-50 data-[state=active]:text-indigo-700 rounded-lg px-4 py-1.5 text-sm" data-testid="sub-tab-categories">
            <Grid3X3 className="h-3.5 w-3.5" />Categories
          </TabsTrigger>
          <TabsTrigger value="providers" className="flex items-center gap-1.5 data-[state=active]:bg-indigo-50 data-[state=active]:text-indigo-700 rounded-lg px-4 py-1.5 text-sm" data-testid="sub-tab-providers">
            <List className="h-3.5 w-3.5" />Providers
          </TabsTrigger>
        </TabsList>

        {/* ─── TAB: Connections ─── */}
        <TabsContent value="connections" data-testid="connections-tab-content">
          {/* Search + Category Filter */}
          <div className="flex items-center gap-3 mb-5">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Search connections..." className="pl-9 h-9" data-testid="connections-search" />
            </div>
            <div className="flex items-center gap-1.5 overflow-x-auto">
              <Button variant={selectedCategory === 'all' ? 'default' : 'outline'} size="sm" onClick={() => setSelectedCategory('all')} className="text-xs h-8">All</Button>
              {categories.map(cat => {
                const CIcon = getIcon(CATEGORY_ICONS, cat.icon);
                return (
                  <Button key={cat.id} variant={selectedCategory === cat.id ? 'default' : 'outline'} size="sm" onClick={() => setSelectedCategory(cat.id)} className="text-xs h-8 flex items-center gap-1">
                    <CIcon className="h-3 w-3" />{cat.name}
                    <Badge variant="secondary" className="ml-0.5 text-[10px] px-1 py-0">{connections.filter(c => c.category_id === cat.id).length}</Badge>
                  </Button>
                );
              })}
            </div>
          </div>

          {/* Connection Cards */}
          {filtered.length === 0 ? (
            <EmptyState onAdd={() => { setEditingConnection(null); setWizardOpen(true); }} hasConnections={connections.length > 0} />
          ) : (
            <div className="space-y-3">
              {filtered.map(conn => (
                <ConnectionCard
                  key={conn.id}
                  conn={conn}
                  categories={categories}
                  testing={testingConnectionId === conn.id}
                  onTest={() => handleTest(conn.id)}
                  onEdit={() => { setEditingConnection(conn); setWizardOpen(true); }}
                  onDetail={() => setDetailConnection(conn)}
                  onActivate={() => handleActivate(conn.id)}
                  onDeactivate={() => handleDeactivate(conn.id)}
                  onSetDefault={() => handleSetDefault(conn.id)}
                  onDuplicate={() => handleDuplicate(conn.id)}
                  onDelete={() => handleDelete(conn.id)}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* ─── TAB: Categories (read-only) ─── */}
        <TabsContent value="categories" data-testid="categories-tab-content">
          <div className="mb-4 rounded-xl bg-blue-50 border border-blue-200 p-3 flex items-start gap-2">
            <Info className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-blue-700">Categories are system-managed and define the types of integrations available.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {categories.map(cat => {
              const CIcon = getIcon(CATEGORY_ICONS, cat.icon);
              const provCount = providers.filter(p => p.category_id === cat.id).length;
              const connCount = connections.filter(c => c.category_id === cat.id).length;
              return (
                <Card key={cat.id} className="hover:shadow-md transition-shadow" data-testid={`category-card-${cat.slug}`}>
                  <CardContent className="p-5">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center flex-shrink-0">
                        <CIcon className="h-5 w-5 text-slate-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-semibold text-slate-800">{cat.name}</h3>
                        <p className="text-xs text-slate-500 mt-0.5">{cat.description}</p>
                        <div className="flex items-center gap-3 mt-3">
                          <span className="text-xs text-slate-400"><strong className="text-slate-600">{provCount}</strong> providers</span>
                          <span className="text-xs text-slate-400"><strong className="text-slate-600">{connCount}</strong> connections</span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* ─── TAB: Providers (read-only) ─── */}
        <TabsContent value="providers" data-testid="providers-tab-content">
          <div className="mb-4 rounded-xl bg-blue-50 border border-blue-200 p-3 flex items-start gap-2">
            <Info className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-blue-700">Providers are system-defined. Select a provider when adding a new connection.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {providers.map(prov => {
              const PIcon = getIcon(PROVIDER_ICONS, prov.logo_icon);
              const cat = categories.find(c => c.id === prov.category_id);
              return (
                <Card key={prov.id} className="hover:shadow-md transition-shadow" data-testid={`provider-card-${prov.slug}`}>
                  <CardContent className="p-5">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center flex-shrink-0">
                        <PIcon className="h-5 w-5 text-slate-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-semibold text-slate-800">{prov.name}</h3>
                          {cat && <Badge variant="outline" className="text-[10px] px-1.5 py-0">{cat.name}</Badge>}
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">{prov.description}</p>
                        <div className="flex items-center gap-2 mt-3">
                          <Badge variant="secondary" className="text-[10px]">{(prov.auth_schema || []).length} fields</Badge>
                          {prov.test_endpoint && <Badge variant="secondary" className="text-[10px] text-emerald-600">Testable</Badge>}
                          {prov.docs_url && (
                            <button onClick={() => window.open(prov.docs_url, '_blank')} className="text-[10px] text-indigo-500 hover:underline flex items-center gap-0.5">
                              <ExternalLink className="h-3 w-3" />Docs
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>

      {/* Connection Wizard */}
      <ConnectionWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        connection={editingConnection}
        providers={providers}
        categories={categories}
        token={token}
        onSaved={fetchData}
      />

      {/* Connection Detail Side Panel */}
      {detailConnection && (
        <ConnectionDetailPanel
          connection={detailConnection}
          categories={categories}
          providers={providers}
          token={token}
          onClose={() => setDetailConnection(null)}
          onRefresh={fetchData}
        />
      )}
    </div>
  );
};

/* ═══════════════════════════════════════════════════
   Connection Card
   ═══════════════════════════════════════════════════ */
const ConnectionCard = ({ conn, categories, testing, onTest, onEdit, onDetail, onActivate, onDeactivate, onSetDefault, onDuplicate, onDelete }) => {
  const PIcon = getIcon(PROVIDER_ICONS, conn.provider_icon);
  const cat = categories.find(c => c.id === conn.category_id);

  const statusConfig = {
    active: { color: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: CheckCircle, label: 'Active' },
    validated: { color: 'bg-blue-50 text-blue-700 border-blue-200', icon: CheckCircle, label: 'Validated' },
    draft: { color: 'bg-slate-100 text-slate-600 border-slate-200', icon: AlertCircle, label: 'Draft' },
    invalid: { color: 'bg-red-50 text-red-700 border-red-200', icon: XCircle, label: 'Invalid' },
    disabled: { color: 'bg-slate-100 text-slate-500 border-slate-200', icon: Pause, label: 'Disabled' },
  };
  const st = statusConfig[conn.status] || statusConfig.draft;
  const StIcon = st.icon;

  const testStatusConfig = {
    success: { color: 'text-emerald-600', label: 'Verified' },
    failed: { color: 'text-red-500', label: 'Failed' },
    error: { color: 'text-red-500', label: 'Error' },
  };
  const ts = conn.last_test_status ? testStatusConfig[conn.last_test_status] : null;

  return (
    <Card className="group hover:shadow-md transition-all border-slate-200/80" data-testid={`connection-card-${conn.id}`}>
      <CardContent className="p-0">
        <div className="flex items-center gap-4 p-4">
          {/* Provider Icon */}
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-slate-50 to-slate-100 border border-slate-200 flex items-center justify-center flex-shrink-0 cursor-pointer" onClick={onDetail}>
            <PIcon className="h-5 w-5 text-slate-600" />
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0 cursor-pointer" onClick={onDetail}>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-semibold text-slate-800 truncate">{conn.name}</h3>
              {conn.is_default && (
                <Badge variant="outline" className="border-amber-300 text-amber-600 text-[10px] px-1.5 py-0">
                  <Star className="h-3 w-3 mr-0.5 fill-current" />Default
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <span className="text-xs text-slate-500">{conn.provider_name}</span>
              {cat && <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-slate-200">{cat.name}</Badge>}
            </div>
          </div>

          {/* Status + Test Status */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Test status */}
            {ts ? (
              <span className={`text-[11px] font-medium ${ts.color}`} data-testid={`test-status-${conn.id}`}>
                {ts.label}
              </span>
            ) : (
              <span className="text-[11px] text-slate-300">Not tested</span>
            )}

            {/* Connection status */}
            <Badge variant="outline" className={`${st.color} text-[10px] px-1.5 py-0`} data-testid={`status-badge-${conn.id}`}>
              <StIcon className="h-3 w-3 mr-0.5" />{st.label}
            </Badge>

            {/* Test Button */}
            <Button variant="outline" size="sm" className="h-8 px-2.5 text-xs" onClick={onTest} disabled={testing} data-testid={`test-btn-${conn.id}`}>
              {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <TestTube className="h-3.5 w-3.5" />}
              <span className="ml-1.5 hidden sm:inline">Test</span>
            </Button>

            {/* 3-dot Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" data-testid={`menu-btn-${conn.id}`}>
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem onClick={onEdit} data-testid={`edit-${conn.id}`}><Edit2 className="h-4 w-4 mr-2" />Edit</DropdownMenuItem>
                <DropdownMenuItem onClick={onDuplicate} data-testid={`duplicate-${conn.id}`}><Copy className="h-4 w-4 mr-2" />Duplicate</DropdownMenuItem>
                <DropdownMenuItem onClick={onTest}><TestTube className="h-4 w-4 mr-2" />Test Now</DropdownMenuItem>
                <DropdownMenuSeparator />
                {!conn.is_default && <DropdownMenuItem onClick={onSetDefault}><Star className="h-4 w-4 mr-2" />Set as Default</DropdownMenuItem>}
                {conn.status === 'active' ? (
                  <DropdownMenuItem onClick={onDeactivate}><Pause className="h-4 w-4 mr-2" />Deactivate</DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onClick={onActivate}><Play className="h-4 w-4 mr-2" />Activate</DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onDelete} className="text-red-600" data-testid={`delete-${conn.id}`}><Trash2 className="h-4 w-4 mr-2" />Delete</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Footer — last tested */}
        {conn.last_tested_at && (
          <div className="px-4 pb-3 flex items-center gap-1.5 text-[11px] text-slate-400">
            <Clock className="h-3 w-3" />
            Last tested: {new Date(conn.last_tested_at).toLocaleString()}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

/* ═══════════════════════════════════════════════════
   Empty State
   ═══════════════════════════════════════════════════ */
const EmptyState = ({ onAdd, hasConnections }) => (
  <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/50 p-12 text-center" data-testid="connections-empty">
    <Plug className="h-12 w-12 text-slate-300 mx-auto mb-4" />
    <h3 className="text-lg font-semibold text-slate-600 mb-1">{hasConnections ? 'No matching connections' : 'No Connections Yet'}</h3>
    <p className="text-sm text-slate-400 max-w-md mx-auto mb-5">
      {hasConnections ? 'Try a different search or category filter.' : 'Connect your external services to enable email sending, AI features, SMS, and more across your workflows.'}
    </p>
    {!hasConnections && (
      <Button onClick={onAdd} className="bg-indigo-600 hover:bg-indigo-700 text-white">
        <Plus className="h-4 w-4 mr-2" />Add Your First Connection
      </Button>
    )}
  </div>
);

/* ═══════════════════════════════════════════════════
   Connection Detail Side Panel
   ═══════════════════════════════════════════════════ */
const ConnectionDetailPanel = ({ connection, categories, providers, token, onClose, onRefresh }) => {
  const [detail, setDetail] = useState(null);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!connection) return;
    const load = async () => {
      setLoading(true);
      const h = { Authorization: `Bearer ${token}` };
      try {
        const [dRes, lRes] = await Promise.all([
          fetch(`${API_URL}/api/connections/${connection.id}`, { headers: h }),
          fetch(`${API_URL}/api/connections/${connection.id}/logs`, { headers: h }),
        ]);
        if (dRes.ok) setDetail(await dRes.json());
        if (lRes.ok) setLogs(await lRes.json());
      } catch { /* ignore */ }
      finally { setLoading(false); }
    };
    load();
  }, [connection, token]);

  const provider = providers.find(p => p.id === connection.provider_id);
  const cat = categories.find(c => c.id === connection.category_id);
  const PIcon = getIcon(PROVIDER_ICONS, connection.provider_icon);

  return (
    <div className="fixed inset-0 z-50 flex justify-end" data-testid="connection-detail-panel">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center">
              <PIcon className="h-5 w-5 text-slate-600" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-800">{connection.name}</h3>
              <p className="text-xs text-slate-500">{connection.provider_name} &middot; {cat?.name}</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8" data-testid="detail-close-btn"><X className="h-4 w-4" /></Button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {loading ? (
            <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-indigo-400" /></div>
          ) : (
            <>
              {/* Summary */}
              <Section icon={Info} title="Summary" color="from-blue-400 to-indigo-500">
                <div className="grid grid-cols-2 gap-3">
                  <InfoField label="Status" value={<Badge variant="outline" className="text-[10px]">{connection.status}</Badge>} />
                  <InfoField label="Default" value={connection.is_default ? 'Yes' : 'No'} />
                  <InfoField label="Last Tested" value={connection.last_tested_at ? new Date(connection.last_tested_at).toLocaleString() : 'Never'} />
                  <InfoField label="Test Result" value={connection.last_test_status || 'N/A'} />
                  <InfoField label="Created" value={connection.created_at ? new Date(connection.created_at).toLocaleString() : 'N/A'} />
                  <InfoField label="Updated" value={connection.updated_at ? new Date(connection.updated_at).toLocaleString() : 'N/A'} />
                </div>
              </Section>

              {/* Authentication */}
              <Section icon={Shield} title="Authentication" color="from-amber-400 to-orange-500">
                {detail?.credentials_masked && Object.keys(detail.credentials_masked).length > 0 ? (
                  <div className="space-y-2">
                    {Object.entries(detail.credentials_masked).map(([key, val]) => (
                      <div key={key} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                        <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">{key.replace(/_/g, ' ')}</span>
                        <code className="text-xs text-slate-700 font-mono bg-slate-100 px-2 py-0.5 rounded">{val}</code>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400">No credential details available (masked for security)</p>
                )}
              </Section>

              {/* Provider Settings */}
              {provider && (
                <Section icon={Plug} title="Provider" color="from-cyan-400 to-teal-500">
                  <div className="space-y-2">
                    <InfoField label="Name" value={provider.name} />
                    <InfoField label="Category" value={cat?.name || 'Unknown'} />
                    {provider.docs_url && (
                      <div className="flex items-center justify-between py-1">
                        <span className="text-xs font-medium text-slate-500">Documentation</span>
                        <a href={provider.docs_url} target="_blank" rel="noreferrer" className="text-xs text-indigo-500 hover:underline flex items-center gap-1">
                          <ExternalLink className="h-3 w-3" />View Docs
                        </a>
                      </div>
                    )}
                  </div>
                </Section>
              )}

              {/* Validation Logs */}
              <Section icon={Activity} title="Test History" color="from-emerald-400 to-green-500">
                {logs.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-4">No test history yet</p>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {logs.map((log, idx) => (
                      <div key={idx} className="flex items-start gap-2 p-2 rounded-lg bg-slate-50 border border-slate-100">
                        <div className={`w-2 h-2 rounded-full mt-1 flex-shrink-0 ${log.status === 'success' ? 'bg-emerald-400' : 'bg-red-400'}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-slate-700">{log.message}</p>
                          <p className="text-[10px] text-slate-400 mt-0.5">{new Date(log.tested_at).toLocaleString()}</p>
                        </div>
                        {log.http_status && <Badge variant="outline" className="text-[10px] px-1 py-0">{log.http_status}</Badge>}
                      </div>
                    ))}
                  </div>
                )}
              </Section>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

/* ─── Detail helpers ─── */
const Section = ({ icon: Icon, title, color, children }) => (
  <div className="rounded-xl border border-slate-200/80 overflow-hidden">
    <div className="px-4 py-3 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white flex items-center gap-2">
      <div className={`w-6 h-6 rounded-md bg-gradient-to-br ${color} flex items-center justify-center`}>
        <Icon className="h-3 w-3 text-white" />
      </div>
      <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wide">{title}</h4>
    </div>
    <div className="px-4 py-3">{children}</div>
  </div>
);

const InfoField = ({ label, value }) => (
  <div>
    <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">{label}</p>
    <p className="text-xs text-slate-700 mt-0.5">{typeof value === 'string' ? value : value}</p>
  </div>
);

/* ═══════════════════════════════════════════════════
   Connection Wizard (2-step: Provider → Form)
   ═══════════════════════════════════════════════════ */
const ConnectionWizard = ({ open, onOpenChange, connection, providers, categories, token, onSaved }) => {
  const [step, setStep] = useState(1);
  const [selectedProvider, setSelectedProvider] = useState(null);
  const [formData, setFormData] = useState({ name: '', credentials: {}, is_default: false });
  const [showPasswords, setShowPasswords] = useState({});
  const [saving, setSaving] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);
  const [catFilter, setCatFilter] = useState('all');
  const [provSearch, setProvSearch] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const isOAuth = selectedProvider?.oauth_config?.type === 'salesforce';

  useEffect(() => {
    if (open) {
      if (connection) {
        const prov = providers.find(p => p.id === connection.provider_id);
        setSelectedProvider(prov);
        setFormData({ name: connection.name || '', credentials: connection.credentials_masked || {}, is_default: connection.is_default || false });
        setStep(2);
      } else {
        setSelectedProvider(null);
        setFormData({ name: '', credentials: {}, is_default: false });
        setStep(1);
        setCatFilter('all');
        setProvSearch('');
      }
      setTestResult(null);
      setOauthLoading(false);
    }
  }, [open, connection, providers]);

  const handleProviderSelect = (prov) => {
    setSelectedProvider(prov);
    setFormData({ name: prov.name, credentials: {}, is_default: false });
    setStep(2);
    setTestResult(null);
  };

  const handleCredentialChange = (key, value) => {
    setFormData(prev => ({ ...prev, credentials: { ...prev.credentials, [key]: value } }));
    setTestResult(null);
  };

  const handleTestBeforeSave = async () => {
    if (!connection) return;
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`${API_URL}/api/connections/${connection.id}/test`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` },
      });
      const r = await res.json();
      setTestResult(r);
    } catch { setTestResult({ status: 'error', message: 'Failed to test' }); }
    finally { setTesting(false); }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (isOAuth) {
      setOauthLoading(true);
      try {
        const res = await fetch(`${API_URL}/api/connections/salesforce/initiate-oauth`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ connection_id: connection?.id || null, name: formData.name, consumer_key: formData.credentials.consumer_key || '', consumer_secret: formData.credentials.consumer_secret || '', environment: formData.credentials.environment || 'production', custom_domain: formData.credentials.custom_domain || '' }),
        });
        if (!res.ok) throw new Error((await res.json()).detail || 'Failed');
        window.location.href = (await res.json()).authorization_url;
      } catch (err) { toast.error(err.message); setOauthLoading(false); }
      return;
    }

    setSaving(true);
    try {
      const url = connection ? `${API_URL}/api/connections/${connection.id}` : `${API_URL}/api/connections/`;
      const payload = { name: formData.name, credentials: formData.credentials, is_default: formData.is_default };
      if (!connection) payload.provider_id = selectedProvider.id;
      const res = await fetch(url, { method: connection ? 'PUT' : 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (res.ok) { toast.success(connection ? 'Connection updated' : 'Connection created'); onOpenChange(false); onSaved(); }
      else { const err = await res.json(); toast.error(err.detail || 'Failed'); }
    } catch { toast.error('Failed to save'); }
    finally { setSaving(false); }
  };

  const filteredProviders = providers.filter(p => {
    if (catFilter !== 'all' && p.category_id !== catFilter) return false;
    if (provSearch && !p.name.toLowerCase().includes(provSearch.toLowerCase())) return false;
    return true;
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="connection-wizard">
        <DialogHeader>
          <DialogTitle>{connection ? 'Edit Connection' : step === 1 ? 'New Connection' : 'Configure Connection'}</DialogTitle>
          <DialogDescription>{step === 1 ? 'Choose a category and provider' : `Enter credentials for ${selectedProvider?.name}`}</DialogDescription>
        </DialogHeader>

        {/* Step 1: Category → Provider */}
        {step === 1 && (
          <div className="space-y-4">
            {/* Category pills */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <Button variant={catFilter === 'all' ? 'default' : 'outline'} size="sm" onClick={() => setCatFilter('all')} className="text-xs h-7">All</Button>
              {categories.map(cat => {
                const CIcon = getIcon(CATEGORY_ICONS, cat.icon);
                return <Button key={cat.id} variant={catFilter === cat.id ? 'default' : 'outline'} size="sm" onClick={() => setCatFilter(cat.id)} className="text-xs h-7 flex items-center gap-1"><CIcon className="h-3 w-3" />{cat.name}</Button>;
              })}
            </div>

            {/* Search providers */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input value={provSearch} onChange={e => setProvSearch(e.target.value)} placeholder="Search providers..." className="pl-9 h-9" data-testid="provider-search" />
            </div>

            {/* Provider grid */}
            <div className="grid grid-cols-2 gap-3 max-h-[50vh] overflow-y-auto">
              {filteredProviders.map(prov => {
                const PIcon = getIcon(PROVIDER_ICONS, prov.logo_icon);
                const cat = categories.find(c => c.id === prov.category_id);
                return (
                  <button key={prov.id} onClick={() => handleProviderSelect(prov)} className="p-4 border border-slate-200 rounded-xl hover:border-indigo-400 hover:bg-indigo-50/50 transition-all text-left flex items-start gap-3 group" data-testid={`provider-${prov.slug}`}>
                    <div className="w-10 h-10 bg-white border border-slate-200 rounded-lg flex items-center justify-center flex-shrink-0 group-hover:border-indigo-300">
                      <PIcon className="h-5 w-5 text-slate-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800">{prov.name}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">{prov.description}</p>
                      <div className="flex items-center gap-2 mt-2">
                        {cat && <Badge variant="outline" className="text-[10px] px-1 py-0">{cat.name}</Badge>}
                        {prov.docs_url && <span className="text-[10px] text-indigo-500">Docs</span>}
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-indigo-400 flex-shrink-0 mt-1" />
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Step 2: Credential Form */}
        {step === 2 && selectedProvider && (
          <form onSubmit={handleSubmit} className="space-y-4">
            {!connection && (
              <Button type="button" variant="ghost" size="sm" onClick={() => setStep(1)} className="mb-1"><ArrowLeft className="h-4 w-4 mr-1" />Back</Button>
            )}

            {/* Provider Info */}
            <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
              <div className="w-10 h-10 bg-white border border-slate-200 rounded-lg flex items-center justify-center">
                {React.createElement(getIcon(PROVIDER_ICONS, selectedProvider.logo_icon), { className: 'h-5 w-5 text-slate-600' })}
              </div>
              <div className="flex-1"><p className="text-sm font-medium text-slate-800">{selectedProvider.name}</p><p className="text-xs text-slate-500">{selectedProvider.description}</p></div>
              {selectedProvider.docs_url && <Button type="button" variant="ghost" size="sm" onClick={() => window.open(selectedProvider.docs_url, '_blank')}><ExternalLink className="h-4 w-4" /></Button>}
            </div>

            {/* Connection Name */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-600">Connection Name <span className="text-red-500">*</span></Label>
              <Input value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="My Connection" required data-testid="connection-name-input" />
            </div>

            {/* Dynamic Credential Fields */}
            {selectedProvider.auth_schema?.map(field => {
              if (field.depends_on) { if (formData.credentials[field.depends_on.key] !== field.depends_on.value) return null; }
              return (
                <div key={field.key} className="space-y-1.5">
                  <Label className="text-xs font-medium text-slate-600">{field.label}{field.required && <span className="text-red-500 ml-0.5">*</span>}</Label>

                  {field.type === 'select' ? (
                    <Select value={formData.credentials[field.key] || field.default_value || ''} onValueChange={v => handleCredentialChange(field.key, v)}>
                      <SelectTrigger><SelectValue placeholder={`Select ${field.label}`} /></SelectTrigger>
                      <SelectContent>{field.options?.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                    </Select>
                  ) : field.type === 'toggle' ? (
                    <div className="flex items-center gap-2">
                      <Switch checked={formData.credentials[field.key] ?? field.default_value ?? false} onCheckedChange={v => handleCredentialChange(field.key, v)} />
                      <span className="text-xs text-slate-500">{formData.credentials[field.key] ? 'Enabled' : 'Disabled'}</span>
                    </div>
                  ) : field.type === 'textarea' ? (
                    <textarea className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none resize-none" rows={3} value={formData.credentials[field.key] || ''} onChange={e => handleCredentialChange(field.key, e.target.value)} placeholder={field.placeholder} />
                  ) : (
                    <div className="relative">
                      <Input type={field.type === 'password' && !showPasswords[field.key] ? 'password' : 'text'} value={formData.credentials[field.key] || ''} onChange={e => handleCredentialChange(field.key, e.target.value)} placeholder={field.placeholder} required={field.required} data-testid={`cred-field-${field.key}`} />
                      {field.type === 'password' && (
                        <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8" onClick={() => setShowPasswords(p => ({ ...p, [field.key]: !p[field.key] }))}>
                          {showPasswords[field.key] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                      )}
                    </div>
                  )}
                  {field.help_text && <p className="text-[11px] text-slate-400">{field.help_text}</p>}
                </div>
              );
            })}

            {/* Default Toggle */}
            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200">
              <div><Label className="text-xs font-medium text-slate-600">Set as Default</Label><p className="text-[11px] text-slate-400">Use this for {categories.find(c => c.id === selectedProvider?.category_id)?.name || 'this category'} actions</p></div>
              <Switch checked={formData.is_default} onCheckedChange={v => setFormData({ ...formData, is_default: v })} data-testid="default-toggle" />
            </div>

            {/* Test Connection (edit mode) */}
            {connection && (
              <div className="rounded-xl border border-slate-200 p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <TestTube className="h-4 w-4 text-slate-400" />
                    <span className="text-xs font-medium text-slate-600">Test Connection</span>
                  </div>
                  <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={handleTestBeforeSave} disabled={testing} data-testid="test-in-wizard-btn">
                    {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                    {testing ? 'Testing...' : 'Test Now'}
                  </Button>
                </div>
                {testResult && (
                  <div className={`mt-2 p-2 rounded-lg text-xs ${testResult.status === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`} data-testid="test-result">
                    {testResult.status === 'success' ? <CheckCircle className="h-3 w-3 inline mr-1" /> : <XCircle className="h-3 w-3 inline mr-1" />}
                    {testResult.message}
                  </div>
                )}
              </div>
            )}

            {/* OAuth info */}
            {isOAuth && (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-700">
                <p className="font-medium mb-1">Salesforce Connected App Setup</p>
                <p>Callback URL: <code className="bg-blue-100 px-1 py-0.5 rounded text-[11px] font-mono">{API_URL}/api/connections/salesforce/callback</code></p>
              </div>
            )}

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              {isOAuth ? (
                <Button type="submit" disabled={oauthLoading} className="bg-blue-600 hover:bg-blue-700" data-testid="connect-oauth-btn">
                  {oauthLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <ExternalLink className="h-4 w-4 mr-1" />}
                  {selectedProvider?.oauth_config?.button_text || 'Connect'}
                </Button>
              ) : (
                <Button type="submit" disabled={saving} className="bg-indigo-600 hover:bg-indigo-700" data-testid="save-connection-btn">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                  {connection ? 'Update' : 'Create'} Connection
                </Button>
              )}
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ConnectionsPage;
