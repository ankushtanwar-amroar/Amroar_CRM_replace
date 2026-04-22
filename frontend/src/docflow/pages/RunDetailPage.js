import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Send, Clock, CheckCircle2, XCircle, AlertTriangle,
  Mail, Link2, Users, Download, Activity, Loader2, FileText,
  Copy, ExternalLink, ChevronDown, Layers, ArrowDownUp, Ban, Eye
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { docflowService } from '../services/docflowService';
import { Badge } from '../../components/ui/badge';

const STATUS_CFG = {
  draft: { bg: 'bg-slate-100', text: 'text-slate-700', dot: 'bg-slate-400', label: 'Draft' },
  in_progress: { bg: 'bg-blue-100', text: 'text-blue-700', dot: 'bg-blue-500', label: 'In Progress' },
  completed: { bg: 'bg-emerald-100', text: 'text-emerald-700', dot: 'bg-emerald-500', label: 'Completed' },
  voided: { bg: 'bg-red-100', text: 'text-red-700', dot: 'bg-red-500', label: 'Voided' },
  expired: { bg: 'bg-amber-100', text: 'text-amber-700', dot: 'bg-amber-500', label: 'Expired' },
  declined: { bg: 'bg-red-100', text: 'text-red-700', dot: 'bg-red-500', label: 'Declined' },
  pending: { bg: 'bg-amber-100', text: 'text-amber-700', dot: 'bg-amber-400', label: 'Pending' },
  signed: { bg: 'bg-emerald-100', text: 'text-emerald-700', dot: 'bg-emerald-500', label: 'Signed' },
  partially_signed: { bg: 'bg-yellow-100', text: 'text-yellow-700', dot: 'bg-yellow-500', label: 'Partially Signed' },
  notified: { bg: 'bg-blue-100', text: 'text-blue-700', dot: 'bg-blue-400', label: 'Notified' },
  viewed: { bg: 'bg-indigo-100', text: 'text-indigo-700', dot: 'bg-indigo-400', label: 'Viewed' },
  failed: { bg: 'bg-red-100', text: 'text-red-700', dot: 'bg-red-500', label: 'Failed' },
};

const fmt = (d) => d ? new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
const fmtShort = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

const StatusBadge = ({ status }) => {
  const c = STATUS_CFG[status] || STATUS_CFG.pending;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-[11px] font-semibold rounded-full ${c.bg} ${c.text}`} data-testid={`status-badge-${status}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />{c.label}
    </span>
  );
};

const StatCard = ({ value, label, color }) => (
  <div className={`p-4 rounded-xl ${color}`}>
    <div className="text-2xl font-bold">{value}</div>
    <div className="text-xs text-gray-500 mt-0.5">{label}</div>
  </div>
);

const groupByWave = (recipients) => {
  const groups = {};
  recipients.forEach(r => {
    const key = r.routing_order;
    if (!groups[key]) groups[key] = [];
    groups[key].push(r);
  });
  return Object.entries(groups).sort(([a], [b]) => Number(a) - Number(b)).map(([order, members]) => ({ order: Number(order), members }));
};

const RunDetailPage = () => {
  const { packageId, runId } = useParams();
  const navigate = useNavigate();
  const [run, setRun] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [refreshing, setRefreshing] = useState(false);
  const [downloadingCombined, setDownloadingCombined] = useState(false);
  const [downloadingDoc, setDownloadingDoc] = useState(null);
  const [templateNames, setTemplateNames] = useState({});

  useEffect(() => { loadRun(); }, [packageId, runId]);

  const loadRun = async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      const res = await docflowService.getPackageRun(packageId, runId);
      setRun(res.data || res);
    } catch (e) {
      toast.error('Failed to load run details');
      navigate(`/setup/docflow/packages/${packageId}`);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (run && run.generated_documents) {
      const missing = run.generated_documents.filter(d => !d.template_name && !d.document_name && d.template_id && !templateNames[d.template_id]);
      if (missing.length > 0) {
        missing.forEach(async (doc) => {
          try {
            const res = await docflowService.getTemplate(doc.template_id);
            const tmpl = res.data || res;
            if (tmpl && tmpl.name) {
              setTemplateNames(prev => ({ ...prev, [doc.template_id]: tmpl.name }));
            }
          } catch (e) {
            console.error('Failed to fetch template name', e);
          }
        });
      }
    }
  }, [run]);

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied!');
  };

  const handleDownloadCombined = async () => {
    try {
      setDownloadingCombined(true);
      const resp = await docflowService.downloadCombinedPdf(run.id);
      const blob = new Blob([resp], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${run.name || 'package'}_combined_signed.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Combined document downloaded');
    } catch (e) {
      toast.error('Failed to download combined document');
    } finally {
      setDownloadingCombined(false);
    }
  };

  const handleDownloadDoc = async (docId, version, docName) => {
    try {
      setDownloadingDoc(docId);
      const resp = await docflowService.downloadDocument(docId, version);
      const blob = new Blob([resp], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${docName}_${version}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(`Failed to download ${version} document`);
    } finally {
      setDownloadingDoc(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]" data-testid="run-loading">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
        <span className="ml-3 text-sm text-gray-500">Loading run details...</span>
      </div>
    );
  }

  if (!run) return null;

  const dm = run.delivery_mode || 'email';
  const isPublicLink = dm === 'public_link' || dm === 'both';
  const isEmail = dm === 'email' || dm === 'both';
  const isPublicRecipients = dm === 'public_recipients';
  const sCfg = STATUS_CFG[run.status] || STATUS_CFG.draft;
  const recipients = (run.recipients || []).filter(r => r.role_type !== 'RECEIVE_COPY');
  const submissions = run.submissions || [];
  const auditEvents = run.audit_events || [];
  const waves = groupByWave(recipients);
  const generatedDocs = run.generated_documents || [];

  // Helper: get first signed doc URL from generated_documents
  const getSignedDocUrl = () => {
    const signedDoc = generatedDocs.find(d => d.signed_file_url);
    return signedDoc?.signed_file_url || null;
  };

  const TABS = [
    { id: 'overview', label: 'Overview', icon: Eye },
    ...(isPublicLink ? [{ id: 'submissions', label: 'Submissions', icon: Users, count: run.submissions_total }] : []),
    ...((isEmail || isPublicRecipients) ? [{ id: 'recipients', label: 'Recipients', icon: Users, count: run.recipients_total }] : []),
    { id: 'documents', label: 'Documents', icon: FileText, count: generatedDocs.length },
    { id: 'audit', label: 'Audit Trail', icon: Activity, count: auditEvents.length },
  ];

  return (
    <div className="min-h-full bg-gray-50" data-testid="run-detail-page">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-6xl mx-auto">
          <button onClick={() => navigate(`/setup/docflow/packages/${packageId}`)} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-3" data-testid="back-to-package">
            <ArrowLeft className="h-4 w-4" /> Back to Package Detail
          </button>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${isPublicLink ? 'bg-orange-100' : isPublicRecipients ? 'bg-violet-100' : 'bg-blue-100'}`}>
                {isPublicLink ? <Link2 className="h-5 w-5 text-orange-600" /> : isPublicRecipients ? <Users className="h-5 w-5 text-violet-600" /> : <Mail className="h-5 w-5 text-blue-600" />}
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900" data-testid="run-title">{run.name || 'Run Detail'}</h1>
                <div className="flex items-center gap-3 mt-1 text-sm text-gray-500 flex-wrap">
                  <StatusBadge status={run.status} />
                  <span className="flex items-center gap-1">{isPublicLink ? <Link2 className="h-3 w-3" /> : isPublicRecipients ? <Users className="h-3 w-3" /> : <Mail className="h-3 w-3" />}{isPublicRecipients ? 'Public Recipients' : isPublicLink ? 'Public Link' : 'Email'}</span>
                  <span>Sent {fmt(run.created_at)}</span>
                  <span className="text-[10px] font-mono text-gray-400">{run.id?.slice(0, 12)}...</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {run.status === 'completed' && isEmail && !isPublicRecipients && (
                <button onClick={handleDownloadCombined} disabled={downloadingCombined}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50" data-testid="download-combined-btn">
                  {downloadingCombined ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Download Combined Signed Document
                </button>
              )}
              <button onClick={() => loadRun(true)} disabled={refreshing}
                className="flex items-center gap-1.5 px-3 py-2 text-sm text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-50 disabled:opacity-50" data-testid="refresh-run-btn">
                {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Activity className="h-4 w-4" />} Refresh
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-6">
          <nav className="flex gap-1 py-2">
            {TABS.map(t => (
              <button key={t.id} onClick={() => setActiveTab(t.id)}
                className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${activeTab === t.id ? 'bg-indigo-50 text-indigo-700' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                  }`} data-testid={`run-tab-${t.id}`}>
                <t.icon className="h-4 w-4" />{t.label}
                {t.count > 0 && <span className="text-[10px] font-bold bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full">{t.count}</span>}
              </button>
            ))}
          </nav>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-6">
        {/* ═══ Overview ═══ */}
        {activeTab === 'overview' && (
          <div className="grid gap-6 lg:grid-cols-3" data-testid="run-overview">
            <div className="lg:col-span-2 space-y-6">
              {/* Stats */}
              <div className="bg-white rounded-xl border border-gray-200 p-6" data-testid="run-stats">
                <h3 className="font-semibold text-gray-800 mb-4">
                  {isPublicLink ? 'Submission Stats' : 'Recipient Stats'}
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {isPublicLink && !isPublicRecipients ? (
                    <>
                      <StatCard value={run.submissions_total || 0} label="Total Submissions" color="bg-indigo-50" />
                      <StatCard value={run.submissions_completed || 0} label="Completed" color="bg-emerald-50" />
                      <StatCard value={run.submissions_pending || 0} label="Pending" color="bg-amber-50" />
                      <StatCard value={0} label="Failed" color="bg-red-50" />
                    </>
                  ) : (
                    <>
                      <StatCard value={run.recipients_total || 0} label="Total Recipients" color="bg-indigo-50" />
                      <StatCard value={run.recipients_completed || 0} label="Signed" color="bg-emerald-50" />
                      <StatCard value={run.recipients_pending || 0} label="Pending" color="bg-amber-50" />
                      <StatCard value={0} label="Failed" color="bg-red-50" />
                    </>
                  )}
                </div>
              </div>

              {/* Public Link Card */}
              {isPublicLink && run.public_link_url && (
                <div className="bg-white rounded-xl border border-gray-200 p-5" data-testid="public-link-card">
                  <h4 className="text-sm font-semibold text-gray-800 mb-2 flex items-center gap-2">
                    <Link2 className="h-4 w-4 text-orange-500" /> Public Signing Link
                  </h4>
                  <p className="text-xs text-gray-500 mb-3">Share this link with signers. Each user submits independently.</p>
                  <div className="flex items-center gap-2">
                    <input type="text" readOnly value={run.public_link_url}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm bg-gray-50 font-mono text-gray-700 truncate" data-testid="public-link-url" />
                    <button onClick={() => copyToClipboard(run.public_link_url)}
                      className="flex items-center gap-1 px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700" data-testid="copy-link-btn">
                      <Copy className="h-4 w-4" /> Copy
                    </button>
                  </div>
                  <p className="text-[10px] text-gray-400 mt-2">{run.submissions_total || 0} submission{(run.submissions_total || 0) !== 1 ? 's' : ''} so far</p>
                </div>
              )}

              {/* Wave Progress (Email mode — not for public_recipients) */}
              {isEmail && !isPublicRecipients && waves.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 p-5" data-testid="wave-progress">
                  <h4 className="text-sm font-semibold text-gray-800 mb-3">Routing Progress</h4>
                  <div className="space-y-3">
                    {waves.map((wave, wIdx) => {
                      const done = wave.members.filter(r => ['completed', 'signed', 'approved', 'reviewed'].includes(r.status)).length;
                      const total = wave.members.length;
                      const pct = total > 0 ? Math.round((done / total) * 100) : 0;
                      return (
                        <div key={wave.order} data-testid={`wave-${wIdx}`}>
                          <div className="flex items-center justify-between mb-1">
                            <span className={`flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${total > 1 ? 'bg-violet-100 text-violet-700' : 'bg-slate-100 text-slate-600'
                              }`}>
                              {total > 1 ? <Layers className="h-3 w-3" /> : <ArrowDownUp className="h-3 w-3" />}
                              Wave {wIdx + 1}{total > 1 && ` (${total} parallel)`}
                            </span>
                            <span className="text-xs text-gray-500">{done}/{total}</span>
                          </div>
                          <div className="w-full bg-gray-100 rounded-full h-1.5">
                            <div className={`h-1.5 rounded-full ${pct === 100 ? 'bg-emerald-500' : 'bg-indigo-500'}`} style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Side Info */}
            <div className="space-y-6">
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h3 className="font-semibold text-gray-800 mb-4">Run Details</h3>
                <dl className="space-y-3 text-sm">
                  <div className="flex justify-between"><dt className="text-gray-500">Status</dt><dd><StatusBadge status={run.status} /></dd></div>
                  <div className="flex justify-between"><dt className="text-gray-500">Delivery</dt><dd className="font-medium">{isPublicRecipients ? 'Public Recipients' : isPublicLink ? 'Public Link' : 'Email'}</dd></div>
                  <div className="flex justify-between"><dt className="text-gray-500">Routing</dt><dd className="font-medium capitalize">{run.routing_config?.mode || 'sequential'}</dd></div>
                  <div className="flex justify-between"><dt className="text-gray-500">OTP</dt><dd className="font-medium">{run.security_settings?.require_auth ? 'Enabled' : 'Disabled'}</dd></div>
                  <div className="flex justify-between"><dt className="text-gray-500">Documents</dt><dd className="font-medium">{(run.documents || []).length}</dd></div>
                  <div className="flex justify-between"><dt className="text-gray-500">Sent</dt><dd className="text-gray-700">{fmtShort(run.created_at)}</dd></div>
                  {run.completed_at && <div className="flex justify-between"><dt className="text-gray-500">Completed</dt><dd className="text-gray-700">{fmtShort(run.completed_at)}</dd></div>}
                </dl>
              </div>
            </div>
          </div>
        )}

        {/* ═══ Submissions Tab (Public Link) ═══ */}
        {activeTab === 'submissions' && (
          <div data-testid="run-submissions">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-gray-800">Submissions</h2>
                <p className="text-xs text-gray-500">{submissions.length} total submission{submissions.length !== 1 ? 's' : ''}</p>
              </div>
            </div>

            {submissions.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
                <Users className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                <p className="text-sm font-medium text-gray-600">No submissions yet</p>
                <p className="text-xs text-gray-400 mt-1">Share the public link to collect signatures.</p>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden" data-testid="submissions-table">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/80">
                      <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Name</th>
                      <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Email</th>
                      <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Submitted</th>
                      <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Status</th>
                      <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Document</th>
                    </tr>
                  </thead>
                  <tbody>
                    {submissions.map((sub, i) => {
                      const hasSignedDocs = sub.signed_documents?.length > 0;
                      const signedUrl = hasSignedDocs ? sub.signed_documents[0]?.signed_file_url : null;
                      const subStatus = sub.status === 'completed' ? 'completed' : (sub.submitted_at ? 'completed' : 'pending');
                      return (
                        <tr key={sub.id || sub.session_id || i} className="border-b border-gray-50 hover:bg-gray-50/50" data-testid={`submission-row-${i}`}>
                          <td className="px-5 py-3.5 text-sm font-medium text-gray-800">{sub.name || sub.user_name || '—'}</td>
                          <td className="px-5 py-3.5 text-sm text-gray-600">{sub.email || sub.user_email || '—'}</td>
                          <td className="px-5 py-3.5 text-xs text-gray-500">{fmt(sub.submitted_at || sub.signed_at)}</td>
                          <td className="px-5 py-3.5"><StatusBadge status={subStatus} /></td>
                          <td className="px-5 py-3.5 text-right">
                            {signedUrl ? (
                              <a href={signedUrl} target="_blank" rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-xs text-indigo-600 font-medium hover:text-indigo-700" data-testid={`download-signed-${i}`}>
                                <Download className="h-3 w-3" /> Download
                              </a>
                            ) : (
                              <span className="text-xs text-gray-400">—</span>
                            )}
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

        {/* ═══ Recipients Tab (Email & Public Recipients) ═══ */}
        {activeTab === 'recipients' && (
          <div data-testid="run-recipients">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-gray-800">Recipients</h2>
                <p className="text-xs text-gray-500">{recipients.length} recipient{recipients.length !== 1 ? 's' : ''}{isPublicRecipients ? ' (independent signing)' : ` across ${waves.length} wave${waves.length !== 1 ? 's' : ''}`}</p>
              </div>
            </div>

            {recipients.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
                <Users className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                <p className="text-sm font-medium text-gray-600">No recipients</p>
              </div>
            ) : (
              <div className="space-y-4">
                {waves.map((wave, wIdx) => (
                  <div key={wave.order} data-testid={`recipient-wave-${wIdx}`}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${wave.members.length > 1 ? 'bg-violet-100 text-violet-700' : 'bg-slate-100 text-slate-600'
                        }`}>
                        {wave.members.length > 1 ? <Layers className="h-3 w-3" /> : <ArrowDownUp className="h-3 w-3" />}
                        Wave {wIdx + 1}
                        {wave.members.length > 1 && <span className="ml-1 opacity-70">({wave.members.length} parallel)</span>}
                      </span>
                    </div>
                    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-gray-100 bg-gray-50/80">
                            <th className="text-left px-5 py-2.5 text-xs font-semibold text-gray-500 uppercase">Name</th>
                            <th className="text-left px-5 py-2.5 text-xs font-semibold text-gray-500 uppercase">Email</th>
                            <th className="text-left px-5 py-2.5 text-xs font-semibold text-gray-500 uppercase">Role</th>
                            <th className="text-left px-5 py-2.5 text-xs font-semibold text-gray-500 uppercase">Status</th>
                            <th className="text-right px-5 py-2.5 text-xs font-semibold text-gray-500 uppercase">Document</th>
                          </tr>
                        </thead>
                        <tbody>
                          {wave.members.map((r, rIdx) => {
                            const roleCfg = {
                              'SIGN': { label: 'Signer', color: 'bg-blue-50 text-blue-700' },
                              'APPROVE_REJECT': { label: 'Approver', color: 'bg-purple-50 text-purple-700' },
                              'VIEW_ONLY': { label: 'Reviewer', color: 'bg-slate-50 text-slate-700' },
                              'RECEIVE_COPY': { label: 'CC', color: 'bg-gray-50 text-gray-600' },
                            };
                            const rc = roleCfg[r.role_type] || roleCfg['SIGN'];
                            return (
                              <tr key={r.id || rIdx} className="border-b border-gray-50 hover:bg-gray-50/50" data-testid={`recipient-row-${wIdx}-${rIdx}`}>
                                <td className="px-5 py-3 text-sm font-medium text-gray-800">{r.name}</td>
                                <td className="px-5 py-3 text-sm text-gray-600">{r.email}</td>
                                <td className="px-5 py-3"><span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${rc.color}`}>{rc.label}</span></td>
                                <td className="px-5 py-3"><StatusBadge status={r.status || 'pending'} /></td>
                                <td className="px-5 py-3 text-right">
                                  {r.status === 'completed' && getSignedDocUrl() ? (
                                    <a href={getSignedDocUrl()} target="_blank" rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 text-xs text-indigo-600 font-medium hover:text-indigo-700" data-testid={`recipient-download-${wIdx}-${rIdx}`}>
                                      <Download className="h-3 w-3" /> Download
                                    </a>
                                  ) : (
                                    <span className="text-xs text-gray-400">—</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {wIdx < waves.length - 1 && (
                      <div className="flex justify-center my-3"><ChevronDown className="h-4 w-4 text-gray-300" /></div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ═══ Documents Tab ═══ */}
        {activeTab === 'documents' && (
          <div data-testid="run-documents">
            <div className="mb-4">
              <h2 className="text-lg font-bold text-gray-800">Package Documents</h2>
              <p className="text-xs text-gray-500">{generatedDocs.length} total document{generatedDocs.length !== 1 ? 's' : ''}</p>
            </div>

            {generatedDocs.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
                <FileText className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                <p className="text-sm font-medium text-gray-600">No documents found</p>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden" data-testid="documents-table">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/80">
                      <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Order</th>
                      <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Document Name</th>
                      <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Status</th>
                      <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {generatedDocs.map((doc, i) => {
                      const isRunCompleted = run.status === 'completed';
                      const docStatus = isRunCompleted || doc.status === 'completed' ? 'completed' : (doc.status || run.status || 'pending');
                      const blueprintDoc = (run.documents || []).find(d => d.document_id === doc.id || d.template_id === doc.template_id);
                      const docName = doc.template_name || doc.document_name || templateNames[doc.template_id] || blueprintDoc?.document_name || 'Untitled Document';
                      const isDownloading = downloadingDoc === doc.id;

                      return (
                        <tr key={doc.id || i} className="border-b border-gray-50 hover:bg-gray-50/50" data-testid={`document-row-${i}`}>
                          <td className="px-5 py-3.5 text-sm font-medium text-gray-800">#{doc.package_order || i + 1}</td>
                          <td className="px-5 py-3.5">
                            <span className="text-sm font-medium text-gray-800">{docName}</span>
                            <p className="text-[10px] text-gray-400 font-mono mt-0.5">{doc.id}</p>
                          </td>
                          <td className="px-5 py-3.5"><StatusBadge status={docStatus} /></td>
                          <td className="px-5 py-3.5 text-right">
                            <div className="flex items-center justify-end gap-2">
                              {doc.unsigned_pdf_url && (
                                <a href={doc.unsigned_pdf_url} target="_blank" rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-700 bg-gray-100 font-medium rounded-lg hover:bg-gray-200 transition-colors" data-testid={`download-original-${i}`}>
                                  <Download className="h-3 w-3" /> Original
                                </a>
                              )}
                              {docStatus === 'completed' && (
                                <button onClick={() => handleDownloadDoc(doc.id, 'signed', docName)} disabled={isDownloading}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 font-medium rounded-lg hover:bg-emerald-100 transition-colors disabled:opacity-50" data-testid={`download-signed-${i}`}>
                                  {isDownloading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />} Signed
                                </button>
                              )}
                            </div>
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

        {/* ═══ Audit Trail ═══ */}
        {activeTab === 'audit' && (
          <div data-testid="run-audit">
            <div className="mb-4">
              <h2 className="text-lg font-bold text-gray-800">Audit Trail</h2>
              <p className="text-xs text-gray-500">Chronological event log</p>
            </div>

            {auditEvents.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
                <Activity className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                <p className="text-sm font-medium text-gray-600">No events recorded yet</p>
              </div>
            ) : (() => {
              // Sort events chronologically (oldest → newest) and deduplicate
              const sorted = [...auditEvents].sort((a, b) => {
                const ta = new Date(a.timestamp).getTime();
                const tb = new Date(b.timestamp).getTime();
                return ta - tb;
              });
              // Deduplicate: remove events with same type within 2s window
              const deduped = [];
              for (const evt of sorted) {
                const ts = new Date(evt.timestamp).getTime();
                const dup = deduped.find(e =>
                  e.event_type === evt.event_type &&
                  e.recipient_id === evt.recipient_id &&
                  e.document_id === evt.document_id &&
                  Math.abs(new Date(e.timestamp).getTime() - ts) < 2000
                );
                if (!dup) deduped.push(evt);
              }
              // Label mapping for better readability
              const labelMap = {
                'package_sent': 'Package Sent',
                'routing_initialized': 'Routing Started',
                'routing_wave_started': 'Wave Started',
                'routing_wave_completed': 'Wave Completed',
                'recipient_notified': 'Recipient Notified',
                'recipient_signed': 'Recipient Signed',
                'recipient_approved': 'Recipient Approved',
                'recipient_rejected': 'Recipient Rejected',
                'document_signed': 'Document Signed',
                'document_generated': 'Document Generated',
                'package_completed': 'Package Completed',
                'package_voided': 'Package Voided',
                'recipient_viewed': 'Recipient Viewed',
              };
              return (
                <div className="bg-white rounded-xl border border-gray-200 p-6">
                  <div className="relative">
                    <div className="absolute left-[15px] top-3 bottom-3 w-px bg-gray-200" />
                    <div className="space-y-0">
                      {deduped.map((evt, i) => {
                        const isGood = evt.event_type?.includes('completed') || evt.event_type?.includes('signed') || evt.event_type?.includes('approved');
                        const isBad = evt.event_type?.includes('void') || evt.event_type?.includes('reject') || evt.event_type?.includes('fail');
                        const isSend = evt.event_type?.includes('sent') || evt.event_type?.includes('notif');
                        const isLast = i === deduped.length - 1;
                        const label = labelMap[evt.event_type] || evt.event_type?.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                        const meta = evt.metadata || {};
                        const actorStr = meta.signer_name || meta.name || meta.reviewer_name || evt.actor;
                        const actorEmail = meta.signer_email || meta.email || meta.reviewer_email;
                        return (
                          <div key={evt.id || i} className="relative flex gap-4 py-3" data-testid={`audit-evt-${i}`}>
                            <div className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${isGood ? 'bg-emerald-500' : isBad ? 'bg-red-500' : isSend ? 'bg-indigo-500' : 'bg-gray-300'
                              } ${isLast ? 'ring-2 ring-offset-2 ring-indigo-200' : ''}`}>
                              <Activity className="h-3.5 w-3.5 text-white" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <span className="text-sm font-semibold text-gray-800">{label}</span>
                                  {(actorStr || meta.wave_order || meta.document_count || meta.recipient_count) && (
                                    <p className="text-xs text-gray-500 mt-0.5">
                                      {actorStr && `by ${actorStr}`}
                                      {actorEmail && actorStr !== actorEmail && ` (${actorEmail})`}
                                      {meta.role_type && ` \u2014 ${meta.role_type.replace(/_/g, ' ')}`}
                                      {meta.wave_order && ` \u2014 Wave ${meta.wave_order}`}
                                      {meta.document_count && ` \u2014 ${meta.document_count} documents`}
                                      {meta.recipient_count && ` \u2014 ${meta.recipient_count} recipients`}
                                      {meta.reject_reason && ` \u2014 "${meta.reject_reason}"`}
                                    </p>
                                  )}
                                </div>
                                <span className="shrink-0 text-[11px] text-gray-400 font-medium whitespace-nowrap">{fmt(evt.timestamp)}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
};

export default RunDetailPage;
