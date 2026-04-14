import React, { useState, useEffect, useCallback } from 'react';
import {
  Mail, CheckCircle, XCircle, Clock, RefreshCw, Eye, FileSignature,
  AlertTriangle, Send, Inbox, Ban, TimerOff, ChevronLeft, ChevronRight, User
} from 'lucide-react';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const STATUS_CONFIG = {
  sent:      { label: 'Sent',      color: 'bg-yellow-100 text-yellow-800 border-yellow-200', icon: Send,           dot: 'bg-yellow-500' },
  delivered: { label: 'Delivered', color: 'bg-blue-50 text-blue-700 border-blue-200',        icon: Inbox,          dot: 'bg-blue-400' },
  opened:    { label: 'Opened',    color: 'bg-blue-100 text-blue-800 border-blue-200',       icon: Mail,           dot: 'bg-blue-500' },
  viewed:    { label: 'Viewed',    color: 'bg-indigo-100 text-indigo-800 border-indigo-200', icon: Eye,            dot: 'bg-indigo-500' },
  signed:    { label: 'Signed',    color: 'bg-green-100 text-green-800 border-green-200',    icon: FileSignature,  dot: 'bg-green-500' },
  completed: { label: 'Completed', color: 'bg-emerald-100 text-emerald-800 border-emerald-200', icon: CheckCircle, dot: 'bg-emerald-500' },
  failed:    { label: 'Failed',    color: 'bg-red-100 text-red-800 border-red-200',          icon: XCircle,        dot: 'bg-red-500' },
  bounced:   { label: 'Bounced',   color: 'bg-red-50 text-red-700 border-red-200',           icon: Ban,            dot: 'bg-red-400' },
  expired:   { label: 'Expired',   color: 'bg-gray-100 text-gray-600 border-gray-200',       icon: TimerOff,       dot: 'bg-gray-400' },
  pending:   { label: 'Pending',   color: 'bg-gray-50 text-gray-500 border-gray-200',        icon: Clock,          dot: 'bg-gray-300' },
};

const FILTER_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'sent', label: 'Sent' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'opened', label: 'Opened' },
  { value: 'viewed', label: 'Viewed' },
  { value: 'signed', label: 'Signed' },
  { value: 'completed', label: 'Completed' },
  { value: 'failed', label: 'Failed' },
  { value: 'bounced', label: 'Bounced' },
  { value: 'expired', label: 'Expired' },
];

const EmailHistoryTable = ({ templateId = null }) => {
  const [emails, setEmails] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [statusCounts, setStatusCounts] = useState({});
  const limit = 15;

  const loadEmailHistory = useCallback(async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');

      let url = `${API_URL}/api/docflow/email-history?page=${page}&limit=${limit}`;
      if (templateId) url += `&template_id=${templateId}`;
      if (filter !== 'all') url += `&status=${filter}`;

      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!response.ok) throw new Error('Failed to load email history');

      const data = await response.json();

      if (data.history) {
        setEmails(data.history);
        setTotal(data.total || 0);
        setTotalPages(data.pages || 1);
        setStatusCounts(data.status_counts || {});
      } else if (Array.isArray(data)) {
        setEmails(data);
        setTotal(data.length);
        setTotalPages(1);
      }
    } catch (error) {
      console.error('Error loading email history:', error);
      toast.error('Failed to load email history');
    } finally {
      setLoading(false);
    }
  }, [templateId, page, filter]);

  useEffect(() => {
    loadEmailHistory();
  }, [loadEmailHistory]);

  useEffect(() => {
    setPage(1);
  }, [filter]);

  const StatusBadge = ({ status }) => {
    const config = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
    const Icon = config.icon;
    return (
      <span
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full border ${config.color}`}
        data-testid={`status-badge-${status}`}
      >
        <Icon className="h-3 w-3" />
        {config.label}
      </span>
    );
  };

  const TimelineInfo = ({ email }) => {
    const events = [];
    if (email.sent_at) events.push({ label: 'Sent', time: email.sent_at });
    if (email.delivered_at) events.push({ label: 'Delivered', time: email.delivered_at });
    if (email.opened_at) events.push({ label: 'Opened', time: email.opened_at });
    if (email.viewed_at) events.push({ label: 'Viewed', time: email.viewed_at });
    if (email.signed_at) events.push({ label: 'Signed', time: email.signed_at });
    if (email.failed_at) events.push({ label: 'Failed', time: email.failed_at });
    if (events.length <= 1) return null;

    return (
      <div className="flex gap-1 mt-1">
        {events.map((ev, i) => {
          const dotColor = STATUS_CONFIG[ev.label.toLowerCase()]?.dot || 'bg-gray-300';
          return (
            <span key={i} className="group relative">
              <span className={`inline-block w-1.5 h-1.5 rounded-full ${dotColor}`} />
              <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block bg-gray-900 text-white text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap z-10">
                {ev.label}: {new Date(ev.time).toLocaleString()}
              </span>
            </span>
          );
        })}
      </div>
    );
  };

  const totalAll = Object.values(statusCounts).reduce((a, b) => a + b, 0);

  if (loading && emails.length === 0) {
    return (
      <div className="flex items-center justify-center py-12" data-testid="email-history-loading">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="email-history-table">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
            <Mail className="h-4 w-4 text-indigo-600" />
            Email History
          </h3>
          <span className="text-sm text-gray-500">
            {total} {total === 1 ? 'email' : 'emails'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Status filter pills */}
          <div className="flex items-center gap-1 flex-wrap">
            {FILTER_OPTIONS.filter(opt =>
              opt.value === 'all' || (statusCounts[opt.value] && statusCounts[opt.value] > 0)
            ).map(opt => {
              const isActive = filter === opt.value;
              const count = opt.value === 'all' ? totalAll : (statusCounts[opt.value] || 0);
              return (
                <button
                  key={opt.value}
                  onClick={() => setFilter(opt.value)}
                  className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                    isActive
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                  }`}
                  data-testid={`filter-${opt.value}`}
                >
                  {opt.label} {count > 0 && <span className="ml-0.5 opacity-75">({count})</span>}
                </button>
              );
            })}
          </div>

          <button
            onClick={loadEmailHistory}
            className="p-1.5 text-gray-500 hover:text-indigo-600 hover:bg-gray-100 rounded-md transition"
            title="Refresh"
            data-testid="email-refresh-btn"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Table */}
      {emails.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg border border-gray-200" data-testid="email-history-empty">
          <Mail className="h-10 w-10 text-gray-400 mx-auto mb-2" />
          <p className="text-gray-600 text-sm">No emails found{filter !== 'all' ? ` with status "${filter}"` : ''}</p>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200" data-testid="email-table">
              <thead className="bg-gray-50/80">
                <tr>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[120px]">
                    Status
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Template
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Recipient
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider max-w-[200px]">
                    Details
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[150px]">
                    Sent At
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {emails.map((email) => (
                  <tr key={email.id} className="hover:bg-gray-50/50 transition-colors" data-testid={`email-row-${email.id}`}>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <StatusBadge status={email.status} />
                      <TimelineInfo email={email} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium text-gray-900 truncate max-w-[180px]" title={email.template_name}>
                        {email.template_name}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-start gap-2">
                        <div className="w-7 h-7 rounded-full bg-indigo-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <User className="h-3.5 w-3.5 text-indigo-600" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-gray-900 truncate" data-testid={`recipient-name-${email.id}`}>
                            {email.recipient_name || 'Unknown'}
                          </div>
                          <div className="text-xs text-gray-500 truncate" data-testid={`recipient-email-${email.id}`}>
                            {email.recipient_email}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 max-w-[200px]">
                      {email.error_message ? (
                        <div className="flex items-start gap-1">
                          <AlertTriangle className="h-3.5 w-3.5 text-red-500 mt-0.5 flex-shrink-0" />
                          <span className="text-xs text-red-600 truncate">{email.error_message}</span>
                        </div>
                      ) : (
                        <div className="text-xs text-gray-500">
                          {email.viewed_at && (
                            <span className="block">Viewed: {new Date(email.viewed_at).toLocaleString()}</span>
                          )}
                          {email.signed_at && (
                            <span className="block text-green-600">Signed: {new Date(email.signed_at).toLocaleString()}</span>
                          )}
                          {!email.viewed_at && !email.signed_at && !email.error_message && (
                            <span className="text-gray-400">Awaiting action</span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-500">
                      {email.sent_at ? new Date(email.sent_at).toLocaleString() : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2" data-testid="email-pagination">
              <p className="text-xs text-gray-500">
                Page {page} of {totalPages} ({total} total)
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="p-1.5 rounded border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  data-testid="email-prev-page"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="p-1.5 rounded border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  data-testid="email-next-page"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default EmailHistoryTable;
