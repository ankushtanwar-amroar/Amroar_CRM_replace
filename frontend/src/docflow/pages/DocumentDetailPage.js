import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Send, Link as LinkIcon, Users, CheckCircle, Clock, Eye, Ban,
  Download, FileText, RefreshCw, Copy, ExternalLink, Mail, Shield, RotateCcw,
  AlertTriangle,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { docflowService } from '../services/docflowService';

const STATUS_PILL = {
  completed: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  in_progress: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  pending: 'bg-amber-100 text-amber-700 border-amber-200',
  voided: 'bg-rose-100 text-rose-700 border-rose-200',
  declined: 'bg-rose-100 text-rose-700 border-rose-200',
  closed: 'bg-slate-100 text-slate-700 border-slate-200',
  active: 'bg-blue-100 text-blue-700 border-blue-200',
  active_with_submissions: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  sent: 'bg-blue-100 text-blue-700 border-blue-200',
  viewed: 'bg-amber-100 text-amber-700 border-amber-200',
  signed: 'bg-emerald-100 text-emerald-700 border-emerald-200',
};

const STATUS_LABEL = {
  completed: 'Completed',
  in_progress: 'In Progress',
  pending: 'Pending',
  voided: 'Voided',
  declined: 'Declined',
  closed: 'Closed',
  active: 'Active',
  active_with_submissions: 'Active',
  sent: 'Sent',
  viewed: 'Viewed',
  signed: 'Signed',
};

const formatDateTime = (iso) => {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
};

export default function DocumentDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [resendingId, setResendingId] = useState(null);
  const [voidingId, setVoidingId] = useState(null);
  // { kind: 'void' | 'unvoid', recipient: {...} } | null
  const [confirm, setConfirm] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await docflowService.getDocumentDetail(id);
      setDetail(data);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to load document');
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const handleResend = async (recipientId) => {
    setResendingId(recipientId);
    try {
      await docflowService.resendRecipientEmail(id, recipientId);
      toast.success('Email resent successfully');
      load();
    } catch (e) {
      toast.error('Unable to resend email. Please try again.');
    } finally {
      setResendingId(null);
    }
  };

  // Phase 80: void/unvoid recipient.
  const handleVoid = async (recipientId) => {
    setVoidingId(recipientId);
    try {
      const resp = await docflowService.voidRecipient(id, recipientId);
      if (resp?.advanced_to?.email) {
        toast.success(`Recipient voided. Signing request sent to ${resp.advanced_to.email}`);
      } else {
        toast.success('Recipient voided');
      }
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to void recipient');
    } finally {
      setVoidingId(null);
      setConfirm(null);
    }
  };
  const handleUnvoid = async (recipientId) => {
    setVoidingId(recipientId);
    try {
      await docflowService.unvoidRecipient(id, recipientId);
      toast.success('Recipient restored — signing email sent');
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to unvoid recipient');
    } finally {
      setVoidingId(null);
      setConfirm(null);
    }
  };

  const handleDownloadOriginal = async () => {
    try { await docflowService.downloadDocument(id, 'unsigned'); }
    catch (e) { toast.error('Download failed'); }
  };
  const handleDownloadSigned = async () => {
    try { await docflowService.downloadDocument(id, 'signed'); }
    catch (e) { toast.error('Download failed'); }
  };

  const copyLink = (token) => {
    const url = `${window.location.origin}/docflow/view/${token}`;
    navigator.clipboard?.writeText(url);
    toast.success('Link copied');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-indigo-500 border-t-transparent rounded-full" />
      </div>
    );
  }
  if (!detail) {
    return (
      <div className="max-w-4xl mx-auto p-8 text-center">
        <p className="text-gray-500">Document not found.</p>
        <button onClick={() => navigate('/setup/docflow?tab=documents')} className="mt-4 text-indigo-600 text-sm font-semibold">Back to Documents</button>
      </div>
    );
  }

  const c = detail.counters || {};
  const isPublic = detail.send_type === 'public_link';
  const agg = detail.aggregate_status || detail.status || 'pending';
  const statusClass = STATUS_PILL[agg] || 'bg-gray-100 text-gray-700 border-gray-200';
  const statusLabel = STATUS_LABEL[agg] || agg;
  const completed = agg === 'completed';

  return (
    <div className="min-h-screen bg-gray-50 pb-12" data-testid="document-detail-page">
      {/* Header bar */}
      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-4 sm:px-8 py-6">
        <div className="max-w-6xl mx-auto">
          <button
            onClick={() => navigate('/setup/docflow?tab=documents')}
            className="inline-flex items-center gap-1.5 text-indigo-100 hover:text-white text-sm font-medium mb-3"
            data-testid="back-to-documents-btn"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Documents
          </button>
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-3 mb-2">
                <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${isPublic ? 'bg-teal-500/30' : 'bg-white/20'}`}>
                  {isPublic ? <LinkIcon className="h-5 w-5" /> : <Send className="h-5 w-5" />}
                </div>
                <h1 className="text-xl sm:text-2xl font-bold truncate" data-testid="detail-title">
                  {detail.template_name || 'Document'}
                </h1>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs sm:text-sm text-indigo-100">
                <span className="font-mono" title={detail.send_id}>Send ID: {detail.send_id?.slice(0, 13)}…</span>
                <span>Created: {formatDateTime(detail.created_at)}</span>
                <span>Updated: {formatDateTime(detail.updated_at)}</span>
                <span className="inline-flex items-center gap-1 capitalize">
                  <Shield className="h-3.5 w-3.5" />
                  {detail.routing_mode || 'parallel'}
                </span>
              </div>
            </div>
            <div className="flex flex-col items-start sm:items-end gap-2">
              <span className={`inline-flex px-3 py-1 text-xs font-semibold rounded-full border ${statusClass}`} data-testid="detail-status">
                {statusLabel}
              </span>
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold ${isPublic ? 'bg-teal-500/30 text-teal-50' : 'bg-white/20 text-white'}`}>
                {isPublic ? 'Public Link' : 'Email'}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-8 -mt-5">
        {/* Status Cards */}
        {!isPublic ? (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 sm:gap-4 mb-6">
            <StatCard icon={Users} label="Total" value={c.total ?? 0} color="indigo" testId="stat-total" />
            <StatCard icon={CheckCircle} label="Completed" value={c.signed ?? 0} color="emerald" testId="stat-completed" />
            <StatCard icon={Clock} label="Pending" value={c.pending ?? 0} color="amber" testId="stat-pending" />
            <StatCard icon={Eye} label="Viewed" value={c.viewed ?? 0} color="blue" testId="stat-viewed" />
            <StatCard icon={Ban} label="Voided" value={c.voided ?? 0} color="rose" testId="stat-voided" />
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-6">
            <StatCard icon={Users} label="Submissions" value={c.total ?? 0} color="indigo" testId="stat-submissions" />
            <StatCard icon={CheckCircle} label="Completed" value={c.signed ?? 0} color="emerald" testId="stat-completed" />
            <StatCard icon={Clock} label="Pending" value={c.pending ?? 0} color="amber" testId="stat-pending" />
            <StatCard icon={Mail} label="Last Submitted" value={formatDateTime(detail.completed_at || detail.updated_at) === '—' ? '—' : formatDateTime(detail.completed_at || detail.updated_at)} color="teal" testId="stat-last-submission" small />
          </div>
        )}

        {/* Downloads */}
        <div className="flex flex-wrap gap-2 mb-6">
          <button
            onClick={handleDownloadOriginal}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs sm:text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 shadow-sm"
            data-testid="download-original-btn"
          >
            <Download className="h-4 w-4" /> Download Original
          </button>
          {completed && (
            <button
              onClick={handleDownloadSigned}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs sm:text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm"
              data-testid="download-signed-btn"
            >
              <CheckCircle className="h-4 w-4" /> Download Final Signed PDF
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
          <div className="border-b border-gray-200 px-2 sm:px-4 flex gap-1 overflow-x-auto">
            {[
              { key: 'overview', label: 'Overview' },
              { key: 'recipients', label: isPublic ? 'Submissions' : 'Recipients' },
              { key: 'audit', label: 'Audit Trail' },
              { key: 'downloads', label: 'Downloads' },
            ].map(t => (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={`px-3 sm:px-4 py-2.5 text-xs sm:text-sm font-semibold whitespace-nowrap border-b-2 -mb-px transition-colors ${
                  activeTab === t.key
                    ? 'border-indigo-600 text-indigo-700'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
                data-testid={`tab-${t.key}`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="p-4 sm:p-6">
            {activeTab === 'overview' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <InfoRow label="Template" value={detail.template_name} />
                <InfoRow label="Send Type" value={isPublic ? 'Public Link' : 'Email'} />
                <InfoRow label="Routing" value={(detail.routing_mode || 'parallel').toString().replace(/^./, c2 => c2.toUpperCase())} />
                <InfoRow label="Status" value={statusLabel} />
                <InfoRow label="Created At" value={formatDateTime(detail.created_at)} />
                <InfoRow label="Last Updated" value={formatDateTime(detail.updated_at)} />
                {detail.completed_at && <InfoRow label="Completed At" value={formatDateTime(detail.completed_at)} />}
                {detail.expires_at && <InfoRow label="Expires At" value={formatDateTime(detail.expires_at)} />}
                {detail.sender && <InfoRow label="Sender" value={`${detail.sender.name || ''}${detail.sender.email ? ` <${detail.sender.email}>` : ''}`} />}
                {isPublic && detail.public_token && (
                  <div className="sm:col-span-2 flex items-center gap-2 bg-teal-50 border border-teal-200 rounded-lg p-3">
                    <LinkIcon className="h-4 w-4 text-teal-600 shrink-0" />
                    <code className="text-xs text-teal-800 truncate flex-1">
                      {`${window.location.origin}/docflow/view/${detail.public_token}`}
                    </code>
                    <button
                      onClick={() => copyLink(detail.public_token)}
                      className="p-1.5 text-teal-600 hover:bg-teal-100 rounded"
                      title="Copy link"
                      data-testid="copy-public-link-btn"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'recipients' && (
              <RecipientsTable
                recipients={detail.recipients || []}
                isPublic={isPublic}
                onResend={handleResend}
                resendingId={resendingId}
                onCopy={copyLink}
                onRequestVoid={(r) => setConfirm({ kind: 'void', recipient: r })}
                onRequestUnvoid={(r) => setConfirm({ kind: 'unvoid', recipient: r })}
                voidingId={voidingId}
              />
            )}

            {activeTab === 'audit' && (
              <AuditTrail entries={detail.audit_trail || []} />
            )}

            {activeTab === 'downloads' && (
              <div className="space-y-3">
                <DownloadRow
                  label="Original Document"
                  description="Unsigned version generated at send time"
                  onClick={handleDownloadOriginal}
                  disabled={!detail.downloads?.original}
                  testId="dl-original"
                />
                <DownloadRow
                  label="Final Signed PDF"
                  description={completed ? 'Fully signed document with all signatures' : 'Available when all recipients have signed'}
                  onClick={handleDownloadSigned}
                  disabled={!completed}
                  testId="dl-signed"
                  primary
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Phase 80: Void / Unvoid confirmation modal */}
      <ConfirmVoidModal
        confirm={confirm}
        onCancel={() => setConfirm(null)}
        onVoid={handleVoid}
        onUnvoid={handleUnvoid}
        busy={!!voidingId}
      />
    </div>
  );
}

const StatCard = ({ icon: Icon, label, value, color, testId, small }) => {
  const map = {
    indigo: 'bg-indigo-50 text-indigo-600 border-indigo-100',
    emerald: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    amber: 'bg-amber-50 text-amber-600 border-amber-100',
    blue: 'bg-blue-50 text-blue-600 border-blue-100',
    rose: 'bg-rose-50 text-rose-600 border-rose-100',
    teal: 'bg-teal-50 text-teal-600 border-teal-100',
  };
  return (
    <div className={`bg-white rounded-lg border ${map[color].split(' ')[2]} shadow-sm p-3 sm:p-4`} data-testid={testId}>
      <div className="flex items-center gap-2 mb-1">
        <div className={`h-7 w-7 rounded-md flex items-center justify-center ${map[color].split(' ').slice(0,2).join(' ')}`}>
          <Icon className="h-3.5 w-3.5" />
        </div>
        <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">{label}</span>
      </div>
      <div className={`font-bold text-gray-900 ${small ? 'text-xs sm:text-sm' : 'text-xl sm:text-2xl'}`}>{value}</div>
    </div>
  );
};

const InfoRow = ({ label, value }) => (
  <div className="bg-gray-50 rounded-lg border border-gray-100 p-3">
    <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-0.5">{label}</div>
    <div className="text-sm text-gray-800 font-medium break-words">{value || '—'}</div>
  </div>
);

const RecipientsTable = ({ recipients, isPublic, onResend, resendingId, onCopy, onRequestVoid, onRequestUnvoid, voidingId }) => {
  if (!recipients.length) {
    return <div className="text-center text-gray-500 text-sm py-8">No {isPublic ? 'submissions' : 'recipients'} yet.</div>;
  }
  return (
    <div className="overflow-x-auto -mx-4 sm:mx-0">
      <table className="w-full min-w-[720px] text-sm" data-testid="recipients-table">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            <th className="px-3 py-2 text-left text-[11px] font-semibold text-gray-600 uppercase">Name</th>
            <th className="px-3 py-2 text-left text-[11px] font-semibold text-gray-600 uppercase">Email</th>
            {!isPublic && <th className="px-3 py-2 text-left text-[11px] font-semibold text-gray-600 uppercase">Role</th>}
            {!isPublic && <th className="px-3 py-2 text-left text-[11px] font-semibold text-gray-600 uppercase">Order</th>}
            <th className="px-3 py-2 text-left text-[11px] font-semibold text-gray-600 uppercase">Status</th>
            <th className="px-3 py-2 text-left text-[11px] font-semibold text-gray-600 uppercase">{isPublic ? 'Submitted' : 'Last Event'}</th>
            <th className="px-3 py-2 text-right text-[11px] font-semibold text-gray-600 uppercase">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {recipients.map((r) => {
            const rStatus = (r.status || 'pending').toLowerCase();
            const isVoided = !!r.voided || rStatus === 'voided';
            const pillClass = isVoided
              ? STATUS_PILL.voided
              : (STATUS_PILL[rStatus] || 'bg-gray-100 text-gray-700 border-gray-200');
            const pillLabel = isVoided ? 'Voided' : (STATUS_LABEL[rStatus] || rStatus);
            const lastEvent = r.signed_at || r.viewed_at || r.sent_at || r.resent_at || r.voided_at;
            const isSigned = rStatus === 'signed' || rStatus === 'completed' || !!r.signed_at;
            const rowOpacity = isVoided ? 'opacity-70' : '';
            return (
              <tr key={r.id || r.email} className={rowOpacity} data-testid={`recipient-row-${r.id || r.email}`}>
                <td className="px-3 py-2.5 font-medium text-gray-800">{r.name || '—'}</td>
                <td className="px-3 py-2.5 text-gray-600 truncate">{r.email || '—'}</td>
                {!isPublic && <td className="px-3 py-2.5 text-gray-600 capitalize">{r.role || 'sign'}</td>}
                {!isPublic && <td className="px-3 py-2.5 text-gray-600">{r.routing_order ?? '—'}</td>}
                <td className="px-3 py-2.5">
                  <span className={`inline-flex px-2 py-0.5 text-[11px] font-medium rounded-full border ${pillClass}`}>
                    {pillLabel}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-gray-500 text-xs">{formatDateTime(lastEvent)}</td>
                <td className="px-3 py-2.5 text-right">
                  <div className="flex items-center justify-end gap-1">
                    {!isPublic && !isSigned && !isVoided && r.email && (
                      <button
                        onClick={() => onResend(r.id)}
                        disabled={resendingId === r.id}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded disabled:opacity-50"
                        title="Resend signing email"
                        data-testid={`resend-${r.id}`}
                      >
                        <RefreshCw className={`h-3 w-3 ${resendingId === r.id ? 'animate-spin' : ''}`} />
                        Resend
                      </button>
                    )}
                    {/* Phase 80: Void / Unvoid controls — Email flow only, never for signed recipients */}
                    {!isPublic && !isSigned && !isVoided && (
                      <button
                        onClick={() => onRequestVoid(r)}
                        disabled={voidingId === r.id}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 rounded disabled:opacity-50"
                        title="Void this recipient's access"
                        data-testid={`void-${r.id}`}
                      >
                        <Ban className="h-3 w-3" />
                        Void
                      </button>
                    )}
                    {!isPublic && isVoided && (
                      <button
                        onClick={() => onRequestUnvoid(r)}
                        disabled={voidingId === r.id}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 rounded disabled:opacity-50"
                        title="Restore recipient access"
                        data-testid={`unvoid-${r.id}`}
                      >
                        <RotateCcw className="h-3 w-3" />
                        Unvoid
                      </button>
                    )}
                    {r.public_token && !isVoided && (
                      <>
                        <button
                          onClick={() => onCopy(r.public_token)}
                          className="p-1.5 text-gray-400 hover:text-indigo-600 rounded"
                          title="Copy signing link"
                          data-testid={`copy-link-${r.id}`}
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                        <a
                          href={`/docflow/view/${r.public_token}`}
                          target="_blank"
                          rel="noreferrer"
                          className="p-1.5 text-gray-400 hover:text-indigo-600 rounded"
                          title="Open signing page"
                          data-testid={`open-link-${r.id}`}
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

// Phase 80: DocuSign-style void/unvoid confirmation modal.
const ConfirmVoidModal = ({ confirm, onCancel, onVoid, onUnvoid, busy }) => {
  if (!confirm) return null;
  const isVoid = confirm.kind === 'void';
  const r = confirm.recipient;
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" data-testid="void-confirm-modal">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden">
        <div className={`px-5 py-4 flex items-center gap-3 ${isVoid ? 'bg-rose-50' : 'bg-emerald-50'}`}>
          <div className={`h-10 w-10 rounded-full flex items-center justify-center ${isVoid ? 'bg-rose-100 text-rose-600' : 'bg-emerald-100 text-emerald-600'}`}>
            {isVoid ? <AlertTriangle className="h-5 w-5" /> : <RotateCcw className="h-5 w-5" />}
          </div>
          <h3 className="text-base font-bold text-gray-900">
            {isVoid ? 'Void this recipient?' : 'Restore this recipient?'}
          </h3>
        </div>
        <div className="px-5 py-4 text-sm text-gray-700 space-y-2">
          {isVoid ? (
            <>
              <p>
                <strong>{r?.name || r?.email}</strong> will immediately lose access to the signing link.
              </p>
              <p className="text-xs text-gray-500">
                A cancellation email will be sent. If routing is <strong>Sequential</strong> and this is the active recipient, the next recipient in order will be notified automatically.
              </p>
            </>
          ) : (
            <>
              <p>
                <strong>{r?.name || r?.email}</strong> will regain access to sign the document.
              </p>
              <p className="text-xs text-gray-500">
                A fresh signing request email will be sent so they have a working link.
              </p>
            </>
          )}
        </div>
        <div className="px-5 py-3 border-t border-gray-100 bg-gray-50 flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg"
            data-testid="void-confirm-cancel"
          >
            Cancel
          </button>
          <button
            onClick={() => (isVoid ? onVoid(r.id) : onUnvoid(r.id))}
            disabled={busy}
            className={`px-4 py-2 text-sm font-semibold text-white rounded-lg disabled:opacity-50 ${isVoid ? 'bg-rose-600 hover:bg-rose-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}
            data-testid="void-confirm-action"
          >
            {busy ? 'Working…' : (isVoid ? 'Confirm Void' : 'Confirm Unvoid')}
          </button>
        </div>
      </div>
    </div>
  );
};

const AuditTrail = ({ entries }) => {
  if (!entries?.length) {
    return <div className="text-center text-gray-500 text-sm py-8">No audit events yet.</div>;
  }
  return (
    <ol className="relative border-l-2 border-indigo-100 ml-3" data-testid="audit-trail">
      {entries.map((e, i) => (
        <li key={i} className="mb-4 ml-4">
          <span className="absolute -left-[7px] h-3 w-3 rounded-full bg-indigo-500" />
          <div className="text-xs text-gray-500">{formatDateTime(e.at || e.timestamp)}</div>
          <div className="text-sm text-gray-800 font-medium">{e.event || e.type || 'Event'}</div>
          {e.actor && <div className="text-xs text-gray-500">by {e.actor}</div>}
          {e.recipient_email && <div className="text-xs text-gray-500">recipient: {e.recipient_email}</div>}
        </li>
      ))}
    </ol>
  );
};

const DownloadRow = ({ label, description, onClick, disabled, testId, primary }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={`w-full text-left flex items-center gap-3 p-4 rounded-lg border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
      primary
        ? 'bg-emerald-50 border-emerald-200 hover:bg-emerald-100'
        : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
    }`}
    data-testid={testId}
  >
    <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${primary ? 'bg-emerald-600 text-white' : 'bg-gray-300 text-gray-700'}`}>
      {primary ? <CheckCircle className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
    </div>
    <div className="flex-1 min-w-0">
      <div className="text-sm font-semibold text-gray-900">{label}</div>
      <div className="text-xs text-gray-500">{description}</div>
    </div>
    <Download className="h-4 w-4 text-gray-400" />
  </button>
);
