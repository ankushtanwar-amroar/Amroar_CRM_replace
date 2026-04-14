import React, { useState, useEffect } from 'react';
import { Clock, Send, Eye, FileCheck, Webhook, AlertCircle, Loader2, RefreshCw, Filter, Link2, FileText, Database, Calendar, ChevronDown } from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const EVENT_ICONS = {
  document_created: { icon: FileText, color: 'text-indigo-600', bg: 'bg-indigo-50', label: 'Created' },
  sent: { icon: Send, color: 'text-blue-600', bg: 'bg-blue-50', label: 'Sent' },
  viewed: { icon: Eye, color: 'text-yellow-600', bg: 'bg-yellow-50', label: 'Viewed' },
  signed: { icon: FileCheck, color: 'text-green-600', bg: 'bg-green-50', label: 'Signed' },
  public_link_generated: { icon: Link2, color: 'text-cyan-600', bg: 'bg-cyan-50', label: 'Public Link' },
  webhook_success: { icon: Webhook, color: 'text-emerald-600', bg: 'bg-emerald-50', label: 'Webhook OK' },
  webhook_failed: { icon: AlertCircle, color: 'text-red-600', bg: 'bg-red-50', label: 'Webhook Fail' },
  webhook_triggered: { icon: Webhook, color: 'text-violet-600', bg: 'bg-violet-50', label: 'Webhook' },
  opened: { icon: Eye, color: 'text-purple-600', bg: 'bg-purple-50', label: 'Opened' },
  expired: { icon: Clock, color: 'text-gray-600', bg: 'bg-gray-50', label: 'Expired' },
  declined: { icon: AlertCircle, color: 'text-orange-600', bg: 'bg-orange-50', label: 'Declined' },
  connection_created: { icon: Database, color: 'text-teal-600', bg: 'bg-teal-50', label: 'Connected' },
  connection_updated: { icon: Database, color: 'text-teal-600', bg: 'bg-teal-50', label: 'Updated' },
  connection_tested: { icon: Database, color: 'text-teal-600', bg: 'bg-teal-50', label: 'Tested' },
  connection_failed: { icon: AlertCircle, color: 'text-red-600', bg: 'bg-red-50', label: 'Conn Failed' },
  error: { icon: AlertCircle, color: 'text-red-600', bg: 'bg-red-50', label: 'Error' }
};

const DATE_RANGES = [
  { id: '7d', label: 'Last 7 days', days: 7 },
  { id: '30d', label: 'Last 30 days', days: 30 },
  { id: '90d', label: 'Last 90 days', days: 90 },
  { id: 'all', label: 'All time', days: null }
];

const FILTER_OPTIONS = [
  { id: 'all', label: 'All Events' },
  { id: 'document_created', label: 'Created' },
  { id: 'sent', label: 'Sent' },
  { id: 'viewed', label: 'Viewed' },
  { id: 'signed', label: 'Signed' },
  { id: 'public_link_generated', label: 'Public Link' },
  { id: 'webhook_success', label: 'Webhook OK' },
  { id: 'webhook_failed', label: 'Webhook Fail' },
  { id: 'connection', label: 'Connections' }
];

const TemplateLogsTab = ({ templateId }) => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [dateRange, setDateRange] = useState('7d');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (templateId) {
      fetchLogs();
    }
  }, [templateId, filter, dateRange]);

  const fetchLogs = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('token');
      const params = new URLSearchParams();
      if (filter !== 'all') params.append('event_type', filter);
      const rangeDays = DATE_RANGES.find(r => r.id === dateRange)?.days;
      if (rangeDays) params.append('days', rangeDays);

      const response = await fetch(`${API_URL}/api/docflow/templates/${templateId}/logs?${params}`, {
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
      });

      if (response.ok) {
        const data = await response.json();
        setLogs(data.logs || []);
      } else {
        // Fallback: try email history
        const emailResponse = await fetch(`${API_URL}/api/docflow/email-history`, {
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
        });
        if (emailResponse.ok) {
          const emailData = await emailResponse.json();
          const filteredLogs = (emailData.history || [])
            .filter(h => h.template_id === templateId)
            .map(h => ({
              id: h.id || Date.now(),
              event_type: h.status || 'sent',
              message: `Document ${h.status || 'sent'} to ${h.recipient_email}`,
              recipient: h.recipient_email,
              timestamp: h.sent_at || h.created_at,
              details: h
            }));
          setLogs(filteredLogs);
        }
      }
    } catch (err) {
      setError('Failed to load activity logs');
    } finally {
      setLoading(false);
    }
  };

  const getEventConfig = (eventType) => {
    if (eventType?.startsWith('connection_')) {
      return EVENT_ICONS[eventType] || EVENT_ICONS.connection_created;
    }
    return EVENT_ICONS[eventType] || { icon: Clock, color: 'text-gray-500', bg: 'bg-gray-50', label: eventType || 'Event' };
  };

  const formatTimestamp = (ts) => {
    if (!ts) return 'Unknown';
    const date = new Date(ts);
    const now = new Date();
    const diff = now - date;
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  // Stats
  const statGroups = [
    { label: 'Created', count: logs.filter(l => l.event_type === 'document_created').length, color: 'text-indigo-600', bg: 'bg-indigo-50' },
    { label: 'Sent', count: logs.filter(l => l.event_type === 'sent').length, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Viewed', count: logs.filter(l => l.event_type === 'viewed').length, color: 'text-yellow-600', bg: 'bg-yellow-50' },
    { label: 'Signed', count: logs.filter(l => l.event_type === 'signed').length, color: 'text-green-600', bg: 'bg-green-50' },
    { label: 'Links', count: logs.filter(l => l.event_type === 'public_link_generated').length, color: 'text-cyan-600', bg: 'bg-cyan-50' },
    { label: 'Webhooks', count: logs.filter(l => l.event_type?.startsWith('webhook')).length, color: 'text-emerald-600', bg: 'bg-emerald-50' }
  ];

  return (
    <div className="space-y-5" data-testid="template-logs-tab">
      {/* Header */}
      <div className="bg-white rounded-lg border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
            <Clock className="h-5 w-5 text-indigo-600" />
            Activity Logs
          </h3>
          <div className="flex items-center gap-2">
            {/* Date Range Picker */}
            <div className="relative">
              <button
                data-testid="date-range-btn"
                onClick={() => setShowDatePicker(!showDatePicker)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-900 border border-gray-200 hover:bg-gray-50 rounded-md transition-colors"
              >
                <Calendar className="h-3.5 w-3.5" />
                {DATE_RANGES.find(r => r.id === dateRange)?.label}
                <ChevronDown className="h-3 w-3" />
              </button>
              {showDatePicker && (
                <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 py-1 w-36">
                  {DATE_RANGES.map(range => (
                    <button
                      key={range.id}
                      onClick={() => { setDateRange(range.id); setShowDatePicker(false); }}
                      className={`w-full px-3 py-1.5 text-xs text-left hover:bg-gray-50 ${dateRange === range.id ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-700'}`}
                    >
                      {range.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              data-testid="refresh-logs-btn"
              onClick={fetchLogs}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-6 gap-2 mb-4">
          {statGroups.map(stat => (
            <div key={stat.label} className={`${stat.bg} rounded-lg p-2.5 text-center`}>
              <div className={`text-lg font-bold ${stat.color}`}>{stat.count}</div>
              <div className="text-[10px] text-gray-600 font-medium">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Filter */}
        <div className="flex items-center gap-2">
          <Filter className="h-3.5 w-3.5 text-gray-400" />
          <div className="flex gap-1 flex-wrap">
            {FILTER_OPTIONS.map(opt => (
              <button
                key={opt.id}
                data-testid={`filter-${opt.id}`}
                onClick={() => setFilter(opt.id)}
                className={`px-2.5 py-1 text-[10px] font-semibold rounded-full transition-colors ${
                  filter === opt.id
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Logs List */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12 text-gray-500">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            <span className="text-sm">Loading logs...</span>
          </div>
        ) : error ? (
          <div className="py-12 text-center">
            <AlertCircle className="h-8 w-8 text-red-400 mx-auto mb-2" />
            <p className="text-sm text-red-600">{error}</p>
          </div>
        ) : logs.length === 0 ? (
          <div className="py-12 text-center">
            <Clock className="h-8 w-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-500">No activity logs yet</p>
            <p className="text-xs text-gray-400 mt-1">Logs appear when documents are created, sent, viewed, or signed</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {logs.map((log, idx) => {
              const config = getEventConfig(log.event_type);
              const Icon = config.icon;
              return (
                <div key={log.id || idx} data-testid={`log-entry-${idx}`} className="px-4 py-3 flex items-center gap-3 hover:bg-gray-50/50 transition-colors">
                  <div className={`p-1.5 rounded-lg ${config.bg} flex-shrink-0`}>
                    <Icon className={`h-3.5 w-3.5 ${config.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-xs text-gray-900 font-medium truncate">{log.message}</p>
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider flex-shrink-0 ${config.bg} ${config.color}`}>
                        {config.label}
                      </span>
                    </div>
                    {log.recipient && (
                      <p className="text-[10px] text-gray-500 mt-0.5">{log.recipient}</p>
                    )}
                  </div>
                  <span className="text-[10px] text-gray-400 flex-shrink-0 whitespace-nowrap">
                    {formatTimestamp(log.timestamp)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default TemplateLogsTab;
