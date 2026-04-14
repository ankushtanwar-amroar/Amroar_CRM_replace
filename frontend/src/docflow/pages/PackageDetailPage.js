import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Package, FileText, Clock, CheckCircle2,
  XCircle, AlertTriangle, ChevronRight,
  Eye, Send, Ban, Loader2, AlertCircle,
  Download, Webhook, Play,
  Link2, Mail, BarChart3, ScrollText,
  Plus, Trash2, GripVertical, Search, X
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { docflowService } from '../services/docflowService';
import { Badge } from '../../components/ui/badge';
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core';
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const STATUS_CONFIG = {
  draft:       { color: 'bg-slate-100 text-slate-700', icon: Clock, label: 'Draft' },
  active:      { color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle2, label: 'Active' },
  in_progress: { color: 'bg-blue-100 text-blue-700', icon: Send, label: 'In Progress' },
  completed:   { color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle2, label: 'Completed' },
  voided:      { color: 'bg-red-100 text-red-700', icon: XCircle, label: 'Voided' },
  expired:     { color: 'bg-amber-100 text-amber-700', icon: AlertTriangle, label: 'Expired' },
  declined:    { color: 'bg-red-100 text-red-700', icon: Ban, label: 'Declined' },
};

const RUN_STATUS_MAP = {
  draft:       { bg: 'bg-slate-100',   text: 'text-slate-700',   dot: 'bg-slate-400',   label: 'Draft' },
  in_progress: { bg: 'bg-blue-100',    text: 'text-blue-700',    dot: 'bg-blue-500',    label: 'In Progress' },
  completed:   { bg: 'bg-emerald-100', text: 'text-emerald-700', dot: 'bg-emerald-500', label: 'Completed' },
  voided:      { bg: 'bg-red-100',     text: 'text-red-700',     dot: 'bg-red-500',     label: 'Voided' },
};

const formatDate = (d) => d ? new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
const formatShortDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

const WEBHOOK_EVENTS = [
  { id: 'package_created', label: 'Package Created' },
  { id: 'package_sent', label: 'Package Sent' },
  { id: 'recipient_notified', label: 'Recipient Notified' },
  { id: 'document_generated', label: 'Document Generated' },
  { id: 'wave_started', label: 'Wave Started' },
  { id: 'document_signed', label: 'Document Signed' },
  { id: 'package_completed', label: 'Package Completed' },
];

const SortableDocRow = ({ doc, idx, onRemove, canEdit }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: doc.template_id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  return (
    <div ref={setNodeRef} style={style} className={`flex items-center gap-3 p-3 bg-white rounded-lg border ${isDragging ? 'border-indigo-300 shadow-lg' : 'border-gray-200'}`} data-testid={`doc-row-${idx}`}>
      {canEdit && <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing p-1 text-gray-400 hover:text-gray-600"><GripVertical className="h-4 w-4" /></button>}
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 font-bold text-sm shrink-0">{idx + 1}</div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800 truncate">{doc.document_name || 'Untitled'}</p>
        <p className="text-[10px] text-gray-400 font-mono">{doc.template_id?.slice(0, 12)}...</p>
      </div>
      {canEdit && (
        <button onClick={() => onRemove(idx)} className="p-1 text-gray-400 hover:text-red-500" data-testid={`remove-doc-${idx}`}>
          <Trash2 className="h-4 w-4" />
        </button>
      )}
    </div>
  );
};

const PackageDetailPage = () => {
  const { packageId } = useParams();
  const navigate = useNavigate();
  const [pkg, setPkg] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [activeSection, setActiveSection] = useState('overview');

  // Runs
  const [runs, setRuns] = useState([]);
  const [loadingRuns, setLoadingRuns] = useState(false);
  const [runsTotal, setRunsTotal] = useState(0);

  // Logs
  const [logs, setLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  // Webhook
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookEvents, setWebhookEvents] = useState([]);
  const [webhookSecret, setWebhookSecret] = useState('');
  const [savingWebhook, setSavingWebhook] = useState(false);

  // Void modal
  const [showVoidModal, setShowVoidModal] = useState(false);
  const [voidReason, setVoidReason] = useState('');
  const [voiding, setVoiding] = useState(false);

  // Document management
  const [editingDocs, setEditingDocs] = useState(false);
  const [docsList, setDocsList] = useState([]);
  const [savingDocs, setSavingDocs] = useState(false);
  const [showAddTemplate, setShowAddTemplate] = useState(false);
  const [availableTemplates, setAvailableTemplates] = useState([]);
  const [templateSearch, setTemplateSearch] = useState('');
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const searchTimerRef = useRef(null);

  useEffect(() => { loadPackage(); }, [packageId]);

  const loadPackage = async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const pkgRes = await docflowService.getPackage(packageId, true);
      const pkgData = pkgRes.data || pkgRes;
      setPkg(pkgData);
      setDocsList((pkgData.documents || []).map(d => ({ ...d })));
      const wc = pkgData?.webhook_config || {};
      setWebhookUrl(wc.url || '');
      setWebhookEvents(wc.events || []);
      setWebhookSecret(wc.secret || '');
    } catch (e) {
      setLoadError(e?.message || 'Failed to load package');
    } finally {
      setLoading(false);
    }
  };

  const loadRuns = async () => {
    try {
      setLoadingRuns(true);
      const res = await docflowService.getPackageRuns(packageId);
      const data = res.data || res;
      setRuns(data?.runs || []);
      setRunsTotal(data?.total || 0);
    } catch (e) {
      console.error('Failed to load runs:', e);
    } finally {
      setLoadingRuns(false);
    }
  };

  const loadLogs = async () => {
    try {
      setLoadingLogs(true);
      const res = await docflowService.getPackageLogs(packageId);
      const data = res.data || res;
      setLogs(data?.logs || []);
    } catch (e) {
      console.error('Failed to load logs:', e);
    } finally {
      setLoadingLogs(false);
    }
  };

  useEffect(() => {
    if (activeSection === 'runs') loadRuns();
    if (activeSection === 'logs') loadLogs();
  }, [activeSection]);

  // Webhook
  const handleSaveWebhook = async () => {
    try {
      setSavingWebhook(true);
      await docflowService.updatePackageWebhook(packageId, { url: webhookUrl.trim(), events: webhookEvents, secret: webhookSecret.trim() });
      toast.success('Webhook saved');
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to save webhook');
    } finally {
      setSavingWebhook(false);
    }
  };

  const toggleWebhookEvent = (eventId) => setWebhookEvents(prev => prev.includes(eventId) ? prev.filter(e => e !== eventId) : [...prev, eventId]);

  const downloadSamplePayload = () => {
    const sample = { event: "document_signed", timestamp: new Date().toISOString(), package: { id: "pkg_abc123", name: "Bundle", status: "IN_PROGRESS" }, document: { id: "doc_xyz789", status: "SIGNED" }, recipient: { name: "Jane Doe", role_type: "SIGN" } };
    const blob = new Blob([JSON.stringify(sample, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'docflow_webhook_sample.json'; a.click();
    URL.revokeObjectURL(url);
  };

  // Void package
  const handleVoidPackage = async () => {
    if (!voidReason.trim()) { toast.error('Please enter a reason'); return; }
    try {
      setVoiding(true);
      const res = await docflowService.voidBlueprintPackage(packageId, voidReason.trim());
      const data = res.data || res;
      if (data.success) {
        toast.success('Package voided');
        setShowVoidModal(false);
        loadPackage();
      }
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to void package');
    } finally {
      setVoiding(false);
    }
  };

  // Document management
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDocDragEnd = (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setDocsList(prev => {
      const oldIdx = prev.findIndex(d => d.template_id === active.id);
      const newIdx = prev.findIndex(d => d.template_id === over.id);
      const reordered = arrayMove(prev, oldIdx, newIdx);
      reordered.forEach((d, i) => { d.order = i + 1; });
      return reordered;
    });
  };

  const removeDoc = (idx) => {
    if (docsList.length <= 1) { toast.error('At least one document required'); return; }
    setDocsList(prev => {
      const next = prev.filter((_, i) => i !== idx);
      next.forEach((d, i) => { d.order = i + 1; });
      return next;
    });
  };

  const saveDocs = async () => {
    try {
      setSavingDocs(true);
      const res = await docflowService.updatePackageDocuments(packageId, docsList.map(d => ({ template_id: d.template_id, document_name: d.document_name, order: d.order })));
      const data = res.data || res;
      if (data.success) {
        toast.success('Documents updated');
        setEditingDocs(false);
        loadPackage();
      }
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to update documents');
    } finally {
      setSavingDocs(false);
    }
  };

  const searchTemplates = async (q) => {
    try {
      setLoadingTemplates(true);
      const data = await docflowService.getLatestActiveTemplates(q, 1, 20);
      const list = Array.isArray(data) ? data : data?.templates || [];
      setAvailableTemplates(list.filter(t => !docsList.some(d => d.template_id === t.id)));
    } catch (e) {
      setAvailableTemplates([]);
    } finally {
      setLoadingTemplates(false);
    }
  };

  useEffect(() => {
    if (!showAddTemplate) return;
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => searchTemplates(templateSearch), 300);
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
  }, [templateSearch, showAddTemplate]);

  const addTemplate = (tmpl) => {
    setDocsList(prev => [...prev, { template_id: tmpl.id, document_name: tmpl.name || 'Untitled', order: prev.length + 1 }]);
    setAvailableTemplates(prev => prev.filter(t => t.id !== tmpl.id));
    toast.success(`Added "${tmpl.name}"`);
  };

  // Loading states
  if (loading) return <div className="flex flex-col items-center justify-center min-h-[400px] gap-3" data-testid="package-detail-loading"><Loader2 className="h-8 w-8 animate-spin text-indigo-500" /><p className="text-sm text-gray-500">Loading...</p></div>;
  if (loadError && !pkg) return <div className="flex flex-col items-center justify-center min-h-[400px] gap-4" data-testid="package-load-error"><AlertCircle className="h-7 w-7 text-red-500" /><p className="text-sm text-gray-500 mb-4">{loadError}</p><div className="flex gap-3"><button onClick={() => navigate('/setup/docflow?tab=packages')} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">Back</button><button onClick={loadPackage} className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700">Retry</button></div></div>;
  if (!pkg) return <div className="flex flex-col items-center justify-center min-h-[400px] gap-3" data-testid="package-not-found"><Package className="h-7 w-7 text-gray-400" /><h3 className="text-lg font-semibold text-gray-800">Package not found</h3><button onClick={() => navigate('/setup/docflow?tab=packages')} className="mt-2 px-4 py-2 text-sm font-medium text-indigo-600 hover:underline">Back to Packages</button></div>;

  const statusCfg = STATUS_CONFIG[pkg.status] || STATUS_CONFIG.active;
  const StatusIcon = statusCfg.icon;
  const documents = pkg.documents || [];
  const runsCount = pkg.runs_count || 0;
  const completedRuns = pkg.completed_runs || 0;
  const lastRunAt = pkg.last_run_at;
  const isBlueprint = pkg.status === 'active' || pkg.status === 'draft';
  const isVoided = pkg.status === 'voided';

  // Aggregated stats from backend
  const totalRecipients = pkg.total_recipients || 0;
  const signedRecipients = pkg.signed_recipients || 0;
  const pendingRecipients = pkg.pending_recipients || 0;
  const totalSubmissions = pkg.total_submissions || 0;
  const completedSubmissions = pkg.completed_submissions || 0;
  const totalCount = totalRecipients + totalSubmissions;
  const completedCount = signedRecipients + completedSubmissions;
  const pendingCount = pendingRecipients + (totalSubmissions - completedSubmissions);
  const completionRate = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : (runsCount > 0 ? Math.round((completedRuns / runsCount) * 100) : 0);

  return (
    <div className="min-h-full bg-gray-50" data-testid="package-detail-page">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-6xl mx-auto">
          <button onClick={() => navigate('/setup/docflow?tab=packages')} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-3" data-testid="back-to-packages"><ArrowLeft className="h-4 w-4" /> Back to Packages</button>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${isVoided ? 'bg-red-100' : 'bg-indigo-100'}`}>
                {isVoided ? <XCircle className="h-5 w-5 text-red-600" /> : <Package className="h-5 w-5 text-indigo-600" />}
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900" data-testid="package-name">{pkg.name}</h1>
                <div className="flex items-center gap-3 mt-1 text-sm text-gray-500 flex-wrap">
                  <Badge className={statusCfg.color} data-testid="package-status"><StatusIcon className="h-3 w-3 mr-1" />{statusCfg.label}</Badge>
                  <span>{documents.length} document{documents.length !== 1 ? 's' : ''}</span>
                  <span>{runsCount} send{runsCount !== 1 ? 's' : ''}</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isBlueprint && (
                <>
                  <button onClick={() => setShowVoidModal(true)} className="flex items-center gap-1.5 px-3 py-2 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors" data-testid="void-package-btn">
                    <Ban className="h-4 w-4" /> Void
                  </button>
                  <button onClick={() => navigate(`/setup/docflow/packages/${packageId}/send`)} className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors shadow-sm" data-testid="send-package-btn">
                    <Send className="h-4 w-4" /> Send Package
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-6">
          <nav className="flex gap-1 py-2">
            {[
              { id: 'overview', label: 'Overview', icon: Eye },
              { id: 'runs', label: 'Activity / Runs', icon: Play },
              { id: 'documents', label: 'Documents', icon: FileText },
              { id: 'webhooks', label: 'Webhooks', icon: Webhook },
              { id: 'logs', label: 'Logs', icon: ScrollText },
            ].map(t => (
              <button key={t.id} onClick={() => setActiveSection(t.id)} className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${activeSection === t.id ? 'bg-indigo-50 text-indigo-700' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`} data-testid={`tab-${t.id}`}>
                <t.icon className="h-4 w-4" />{t.label}
                {t.id === 'runs' && runsCount > 0 && <span className="ml-1 text-[10px] font-bold bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full">{runsCount}</span>}
              </button>
            ))}
          </nav>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-6">
        {/* ═══ Overview ═══ */}
        {activeSection === 'overview' && (
          <div className="grid gap-6 lg:grid-cols-3" data-testid="section-overview">
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-white rounded-xl border border-gray-200 p-6" data-testid="usage-stats">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-gray-800 flex items-center gap-2"><BarChart3 className="h-4 w-4 text-indigo-500" /> Usage Overview</h3>
                  {lastRunAt && <span className="text-xs text-gray-400">Last activity {formatShortDate(lastRunAt)}</span>}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                  <div className="p-4 bg-indigo-50 rounded-xl" data-testid="stat-total-sends">
                    <div className="text-3xl font-bold text-indigo-600">{runsCount}</div>
                    <div className="text-xs text-gray-500 mt-1">Total Runs</div>
                  </div>
                  <div className="p-4 bg-emerald-50 rounded-xl" data-testid="stat-signed">
                    <div className="text-3xl font-bold text-emerald-600">{completedCount}</div>
                    <div className="text-xs text-gray-500 mt-1">Signed / Completed</div>
                  </div>
                  <div className="p-4 bg-amber-50 rounded-xl" data-testid="stat-pending">
                    <div className="text-3xl font-bold text-amber-600">{pendingCount}</div>
                    <div className="text-xs text-gray-500 mt-1">Pending</div>
                  </div>
                  <div className="p-4 bg-cyan-50 rounded-xl" data-testid="stat-completion-rate">
                    <div className="text-3xl font-bold text-cyan-600">{completionRate}%</div>
                    <div className="text-xs text-gray-500 mt-1">Completion Rate</div>
                  </div>
                </div>
                {totalCount > 0 && (
                  <div className="mt-4">
                    <div className="flex items-center justify-between mb-1.5"><span className="text-xs text-gray-500">Overall Progress</span><span className="text-xs font-medium text-gray-600">{completedCount}/{totalCount}</span></div>
                    <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden"><div className="bg-emerald-500 h-2 rounded-full transition-all duration-500" style={{ width: `${completionRate}%` }} /></div>
                  </div>
                )}
                {/* Breakdown */}
                {runsCount > 0 && (
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    {totalRecipients > 0 && (
                      <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 rounded-lg text-xs" data-testid="stat-recipients-breakdown">
                        <Mail className="h-3.5 w-3.5 text-blue-600" />
                        <span className="text-gray-700"><strong className="text-blue-700">{signedRecipients}/{totalRecipients}</strong> Recipients Signed</span>
                      </div>
                    )}
                    {totalSubmissions > 0 && (
                      <div className="flex items-center gap-2 px-3 py-2 bg-orange-50 rounded-lg text-xs" data-testid="stat-submissions-breakdown">
                        <Link2 className="h-3.5 w-3.5 text-orange-600" />
                        <span className="text-gray-700"><strong className="text-orange-700">{completedSubmissions}/{totalSubmissions}</strong> Submissions Done</span>
                      </div>
                    )}
                  </div>
                )}
                {runsCount === 0 && (
                  <div className="mt-4 text-center py-4">
                    <p className="text-sm text-gray-500">No sends yet.</p>
                    {isBlueprint && <button onClick={() => navigate(`/setup/docflow/packages/${packageId}/send`)} className="mt-2 text-sm text-indigo-600 font-medium hover:underline" data-testid="overview-send-link">Send this package for the first time</button>}
                  </div>
                )}
              </div>

              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h3 className="font-semibold text-gray-800 mb-3">Documents ({documents.length})</h3>
                <div className="divide-y divide-gray-100">
                  {documents.map((doc, i) => (
                    <div key={doc.template_id || i} className="flex items-center gap-3 py-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 font-bold text-sm">{doc.order || i + 1}</div>
                      <p className="text-sm font-medium text-gray-800">{doc.document_name || 'Document'}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h3 className="font-semibold text-gray-800 mb-4">Package Info</h3>
                <dl className="space-y-3 text-sm">
                  <div className="flex justify-between"><dt className="text-gray-500">Type</dt><dd className="font-medium">Reusable Blueprint</dd></div>
                  <div className="flex justify-between"><dt className="text-gray-500">Status</dt><dd><Badge className={statusCfg.color}>{statusCfg.label}</Badge></dd></div>
                  <div className="flex justify-between"><dt className="text-gray-500">Documents</dt><dd className="font-medium">{documents.length}</dd></div>
                  <div className="flex justify-between"><dt className="text-gray-500">Total Runs</dt><dd className="font-medium">{runsCount}</dd></div>
                  <div className="flex justify-between"><dt className="text-gray-500">Webhook</dt><dd className="font-medium">{webhookUrl ? 'Configured' : 'Not set'}</dd></div>
                  <div className="flex justify-between"><dt className="text-gray-500">Created</dt><dd className="text-gray-700">{formatShortDate(pkg.created_at)}</dd></div>
                </dl>
              </div>
              {isBlueprint && (
                <button onClick={() => navigate(`/setup/docflow/packages/${packageId}/send`)} className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-colors font-medium text-sm shadow-sm" data-testid="sidebar-send-btn"><Send className="h-4 w-4" /> Send This Package</button>
              )}
            </div>
          </div>
        )}

        {/* ═══ Activity / Runs ═══ */}
        {activeSection === 'runs' && (
          <div className="space-y-4" data-testid="section-runs">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-gray-800">Activity / Runs</h2>
                <p className="text-xs text-gray-500">Each send creates an independent run.</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs font-medium text-gray-500">{runsTotal} run{runsTotal !== 1 ? 's' : ''}</span>
                <button onClick={loadRuns} disabled={loadingRuns} className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 disabled:opacity-50" data-testid="refresh-runs-btn">
                  {loadingRuns && <Loader2 className="h-3 w-3 animate-spin" />} Refresh
                </button>
              </div>
            </div>

            {loadingRuns && runs.length === 0 && <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-indigo-500" /><span className="ml-2 text-sm text-gray-500">Loading...</span></div>}
            {!loadingRuns && runs.length === 0 && (
              <div className="text-center py-16 bg-white rounded-xl border border-gray-100">
                <Send className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                <p className="text-sm font-medium text-gray-600">No sends yet</p>
                {isBlueprint && <button onClick={() => navigate(`/setup/docflow/packages/${packageId}/send`)} className="mt-3 inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700" data-testid="runs-empty-send-btn"><Send className="h-4 w-4" /> Send Now</button>}
              </div>
            )}

            {runs.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden" data-testid="runs-table">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/80">
                      <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Run</th>
                      <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Delivery</th>
                      <th className="text-center px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Count</th>
                      <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Sent</th>
                      <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {runs.map((run, idx) => {
                      const dm = run.delivery_mode || 'email';
                      const isPublicLink = dm === 'public_link' || dm === 'both';
                      const countLabel = isPublicLink ? `${run.submissions_count || 0} submission${(run.submissions_count || 0) !== 1 ? 's' : ''}` : `${run.recipients_completed || 0}/${run.recipients_total || 0} recipient${(run.recipients_total || 0) !== 1 ? 's' : ''}`;
                      return (
                        <tr key={run.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors" data-testid={`run-row-${idx}`}>
                          <td className="px-5 py-3.5">
                            <span className="text-sm font-medium text-gray-800">Run #{runs.length - idx}</span>
                            <p className="text-[10px] text-gray-400 font-mono mt-0.5">{run.id?.slice(0, 8)}...</p>
                          </td>
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-1.5 text-xs text-gray-600">
                              {dm === 'email' && <><Mail className="h-3 w-3 text-indigo-500" />Email</>}
                              {dm === 'public_link' && <><Link2 className="h-3 w-3 text-orange-500" />Public Link</>}
                              {dm === 'both' && <><Mail className="h-3 w-3 text-indigo-500" />Both</>}
                            </div>
                          </td>
                          <td className="px-5 py-3.5 text-center text-sm text-gray-600">{countLabel}</td>
                          <td className="px-5 py-3.5"><span className="text-xs text-gray-400">{formatShortDate(run.created_at)}</span></td>
                          <td className="px-5 py-3.5 text-right">
                            <button onClick={() => navigate(`/setup/docflow/packages/${packageId}/runs/${run.id}`)} className="inline-flex items-center gap-1 text-xs text-indigo-600 font-medium hover:text-indigo-700" data-testid={`view-run-btn-${idx}`}>View Details <ChevronRight className="h-3 w-3" /></button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ═══ Documents (with management) ═══ */}
        {activeSection === 'documents' && (
          <div data-testid="section-documents">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-gray-800">Document Templates</h2>
                <p className="text-xs text-gray-500">These templates are used each time the package is sent. Changes apply to future runs only.</p>
              </div>
              {isBlueprint && !editingDocs && (
                <button onClick={() => { setEditingDocs(true); setDocsList(documents.map(d => ({ ...d }))); }} className="flex items-center gap-1.5 px-3 py-2 text-sm text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-50" data-testid="edit-docs-btn"><FileText className="h-4 w-4" /> Edit Documents</button>
              )}
            </div>

            {!editingDocs ? (
              <div className="space-y-3">
                {documents.length === 0 ? (
                  <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-sm text-gray-400"><FileText className="h-10 w-10 mx-auto mb-3 text-gray-300" /><p className="font-medium text-gray-600 mb-1">No documents</p></div>
                ) : documents.map((doc, i) => (
                  <div key={doc.template_id || i} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-4" data-testid={`doc-item-${i}`}>
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 font-bold text-sm shrink-0">{doc.order || i + 1}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800">{doc.document_name || 'Untitled'}</p>
                      <p className="text-xs text-gray-400 font-mono mt-0.5">{doc.template_id}</p>
                    </div>
                    <Badge className="bg-indigo-50 text-indigo-700 text-xs">Order #{doc.order || i + 1}</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDocDragEnd}>
                  <SortableContext items={docsList.map(d => d.template_id)} strategy={verticalListSortingStrategy}>
                    <div className="space-y-2" data-testid="docs-sortable-list">
                      {docsList.map((doc, idx) => <SortableDocRow key={doc.template_id} doc={doc} idx={idx} onRemove={removeDoc} canEdit={true} />)}
                    </div>
                  </SortableContext>
                </DndContext>

                <button onClick={() => { setShowAddTemplate(true); setTemplateSearch(''); }} className="flex items-center gap-2 px-4 py-2.5 text-sm text-indigo-600 border border-dashed border-indigo-300 rounded-lg hover:bg-indigo-50 w-full justify-center" data-testid="add-template-btn"><Plus className="h-4 w-4" /> Add Template</button>

                {showAddTemplate && (
                  <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm" data-testid="add-template-panel">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-sm font-semibold text-gray-800">Add Template</h4>
                      <button onClick={() => setShowAddTemplate(false)} className="text-gray-400 hover:text-gray-600"><X className="h-4 w-4" /></button>
                    </div>
                    <div className="relative mb-3">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <input type="text" value={templateSearch} onChange={(e) => setTemplateSearch(e.target.value)} placeholder="Search templates..." className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" data-testid="template-search" />
                    </div>
                    {loadingTemplates && <div className="flex items-center justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-indigo-500" /></div>}
                    <div className="max-h-48 overflow-y-auto space-y-1">
                      {availableTemplates.map(tmpl => (
                        <button key={tmpl.id} onClick={() => addTemplate(tmpl)} className="w-full flex items-center gap-3 px-3 py-2 text-left text-sm rounded-lg hover:bg-indigo-50 transition-colors" data-testid={`add-tmpl-${tmpl.id}`}>
                          <FileText className="h-4 w-4 text-gray-400" /><span className="text-gray-800">{tmpl.name}</span><Plus className="h-3 w-3 ml-auto text-indigo-500" />
                        </button>
                      ))}
                      {!loadingTemplates && availableTemplates.length === 0 && <p className="text-xs text-gray-400 text-center py-3">No templates found</p>}
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-3 pt-2">
                  <button onClick={() => { setEditingDocs(false); setShowAddTemplate(false); }} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50" data-testid="cancel-edit-docs">Cancel</button>
                  <button onClick={saveDocs} disabled={savingDocs || docsList.length === 0} className="flex items-center gap-2 px-5 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium disabled:opacity-50" data-testid="save-docs-btn">
                    {savingDocs ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}{savingDocs ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ═══ Webhooks ═══ */}
        {activeSection === 'webhooks' && (
          <div className="space-y-6" data-testid="webhooks-section">
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2"><Webhook className="h-4 w-4 text-indigo-600" /> Webhook Configuration</h3>
                  <p className="text-xs text-gray-500 mt-1">Configured once per package. Applies to ALL future sends.</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-medium ${webhookUrl ? 'text-emerald-600' : 'text-gray-400'}`}>{webhookUrl ? 'Active' : 'Inactive'}</span>
                  <div className={`h-2.5 w-2.5 rounded-full ${webhookUrl ? 'bg-emerald-500' : 'bg-gray-300'}`} data-testid="webhook-status-dot" />
                </div>
              </div>
              <div className="space-y-4">
                <div><label className="block text-xs font-medium text-gray-600 mb-1">Webhook URL</label><input type="url" value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} placeholder="https://your-server.com/webhook" className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" data-testid="webhook-url-input" /></div>
                <div><label className="block text-xs font-medium text-gray-600 mb-2">Events</label><div className="grid gap-2 sm:grid-cols-2">{WEBHOOK_EVENTS.map(evt => (<button key={evt.id} onClick={() => toggleWebhookEvent(evt.id)} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-left transition-colors border ${webhookEvents.includes(evt.id) ? 'bg-indigo-50 text-indigo-700 border-indigo-300' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`} data-testid={`webhook-event-${evt.id}`}><div className={`h-4 w-4 rounded border flex items-center justify-center ${webhookEvents.includes(evt.id) ? 'bg-indigo-600 border-indigo-600' : 'border-gray-300'}`}>{webhookEvents.includes(evt.id) && <CheckCircle2 className="h-3 w-3 text-white" />}</div>{evt.label}</button>))}</div></div>
                <div><label className="block text-xs font-medium text-gray-600 mb-1">Signing Secret</label><input type="text" value={webhookSecret} onChange={(e) => setWebhookSecret(e.target.value)} placeholder="Optional" className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500" data-testid="webhook-secret-input" /></div>
                <button onClick={handleSaveWebhook} disabled={savingWebhook} className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 text-sm font-medium" data-testid="save-webhook-btn">{savingWebhook ? <Loader2 className="h-4 w-4 animate-spin" /> : <Webhook className="h-4 w-4" />}{savingWebhook ? 'Saving...' : 'Save Webhook'}</button>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-6" data-testid="webhook-sample-section">
              <div className="flex items-center justify-between mb-3">
                <div><h4 className="text-sm font-semibold text-gray-800">Sample Payload</h4><p className="text-xs text-gray-500 mt-0.5">Download JSON to test your endpoint</p></div>
                <button onClick={downloadSamplePayload} className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-100" data-testid="download-sample-btn"><Download className="h-3.5 w-3.5" /> Download</button>
              </div>
              <pre className="mt-2 p-3 bg-gray-900 text-gray-100 rounded-lg text-[11px] font-mono overflow-x-auto max-h-40 leading-relaxed">{`{
  "event": "document_signed",
  "package": { "id": "pkg_abc", "name": "..." },
  "document": { "id": "doc_xyz", "status": "SIGNED" },
  "recipient": { "name": "Jane", "role_type": "SIGN" }
}`}</pre>
            </div>
          </div>
        )}

        {/* ═══ Logs ═══ */}
        {activeSection === 'logs' && (
          <div data-testid="section-logs">
            <div className="flex items-center justify-between mb-4">
              <div><h2 className="text-lg font-bold text-gray-800">Logs</h2><p className="text-xs text-gray-500">Structured logs across all runs.</p></div>
              <button onClick={loadLogs} disabled={loadingLogs} className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 disabled:opacity-50" data-testid="refresh-logs-btn">{loadingLogs && <Loader2 className="h-3 w-3 animate-spin" />} Refresh</button>
            </div>
            {loadingLogs && logs.length === 0 && <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-indigo-500" /></div>}
            {!loadingLogs && logs.length === 0 && <div className="bg-white rounded-xl border border-gray-200 p-12 text-center"><ScrollText className="h-10 w-10 text-gray-300 mx-auto mb-3" /><p className="text-sm font-medium text-gray-600">No logs yet</p></div>}
            {logs.length > 0 && (() => {
              const CAT = { send: { bg: 'bg-blue-500', l: 'Send' }, delivery: { bg: 'bg-indigo-500', l: 'Delivery' }, view: { bg: 'bg-cyan-500', l: 'View' }, signing: { bg: 'bg-emerald-500', l: 'Signing' }, completion: { bg: 'bg-green-600', l: 'Completion' }, failure: { bg: 'bg-red-500', l: 'Failure' }, webhook: { bg: 'bg-orange-500', l: 'Webhook' }, other: { bg: 'bg-gray-400', l: 'Other' } };
              return (
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden" data-testid="logs-table">
                  <table className="w-full"><thead><tr className="border-b border-gray-100 bg-gray-50/80"><th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Time</th><th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Category</th><th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Event</th><th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Actor</th><th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Details</th></tr></thead>
                  <tbody>{logs.map((log, i) => {
                    const cat = CAT[log.category] || CAT.other;
                    const m = log.metadata || {};
                    const parts = [m.name, m.email, m.reason, m.document_count && `${m.document_count} docs`].filter(Boolean);
                    return (<tr key={log.id || i} className="border-b border-gray-50 hover:bg-gray-50/50" data-testid={`log-row-${i}`}><td className="px-5 py-3 text-xs text-gray-500 whitespace-nowrap">{formatDate(log.timestamp)}</td><td className="px-5 py-3"><span className={`inline-flex px-2 py-0.5 text-[10px] font-bold rounded-full text-white ${cat.bg}`}>{cat.l}</span></td><td className="px-5 py-3 text-sm text-gray-800">{log.event_type?.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</td><td className="px-5 py-3 text-xs text-gray-500 font-mono">{(log.actor || 'system').slice(0, 12)}</td><td className="px-5 py-3 text-xs text-gray-500 truncate max-w-[200px]">{parts.join(' — ') || '—'}</td></tr>);
                  })}</tbody></table>
                </div>
              );
            })()}
          </div>
        )}
      </div>

      {/* Void Modal */}
      {showVoidModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" data-testid="void-modal">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-50"><Ban className="h-5 w-5 text-red-500" /></div>
              <div><h3 className="text-lg font-semibold text-gray-900">Void Package</h3><p className="text-xs text-gray-500">This will permanently disable this package.</p></div>
            </div>
            <div className="bg-red-50 border border-red-100 rounded-lg px-4 py-3 text-xs text-red-700 mb-4">
              <strong>Warning:</strong> Voiding will prevent all future sends, disable public links, and block recipient access.
            </div>
            <div className="mb-5">
              <label className="block text-xs font-medium text-gray-700 mb-1">Reason *</label>
              <textarea value={voidReason} onChange={(e) => setVoidReason(e.target.value)} placeholder="Why is this package being voided?" rows={3} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500" data-testid="void-reason-input" />
            </div>
            <div className="flex gap-3">
              <button onClick={() => { setShowVoidModal(false); setVoidReason(''); }} className="flex-1 py-2.5 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50" data-testid="void-cancel-btn">Cancel</button>
              <button onClick={handleVoidPackage} disabled={voiding || !voidReason.trim()} className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50" data-testid="void-confirm-btn">
                {voiding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}{voiding ? 'Voiding...' : 'Void Package'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PackageDetailPage;
