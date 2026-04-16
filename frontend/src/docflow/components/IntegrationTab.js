import React, { useState, useEffect } from 'react';
import { Webhook, Download, CheckCircle2, Bell, Settings, ChevronDown } from 'lucide-react';
import { toast } from 'react-hot-toast';

const WEBHOOK_EVENTS = [
  { id: 'signed', label: 'Signed', description: 'When document is signed by recipient' },
  { id: 'opened', label: 'Opened', description: 'When document is opened via link' },
  { id: 'sent', label: 'Sent', description: 'When document is sent to recipient' },
  { id: 'approve', label: 'Approved', description: 'When approver approves the document' },
  { id: 'reject', label: 'Rejected', description: 'When approver rejects the document' },
  { id: 'review', label: 'Reviewed', description: 'When reviewer completes review' },
  { id: 'signed_copy', label: 'Signed Copy', description: 'When signed copy is generated' }
];

const SAMPLE_PAYLOADS = {
  signed: {
    event: 'signed',
    document_id: 'doc_abc123',
    document_status: 'signed',
    template_name: 'NDA Agreement',
    recipient_email: 'signer@example.com',
    recipient_name: 'John Doe',
    signed_at: '2026-03-30T14:30:00Z',
    status: 'completed',
    signed_documents: [{
      document_id: 'doc_abc123',
      template_name: 'NDA Agreement',
      signed_document_url: 'https://storage.example.com/signed/doc_abc123.pdf',
      signed_at: '2026-03-30T14:30:00Z'
    }],
    recipient_details: { name: 'John Doe', email: 'signer@example.com' },
    metadata: { ip_address: '203.0.113.42', user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', performed_by: 'John Doe', performed_by_email: 'signer@example.com' }
  },
  opened: { event: 'opened', document_id: 'doc_abc123', recipient_email: 'user@example.com', recipient_name: 'John Doe', opened_at: '2026-03-30T13:45:00Z', metadata: { ip_address: '203.0.113.42', user_agent: 'Mozilla/5.0' } },
  sent: { event: 'sent', document_id: 'doc_abc123', recipient_email: 'user@example.com', recipient_name: 'John Doe', sent_at: '2026-03-30T12:00:00Z', delivery_method: 'email' },
  approve: { event: 'approve', document_id: 'doc_abc123', action: 'approved', recipient_email: 'approver@example.com', recipient_name: 'Jane Smith', role_type: 'APPROVE_REJECT', metadata: { ip_address: '198.51.100.23', user_agent: 'Mozilla/5.0 (Macintosh)', performed_by: 'Jane Smith', performed_by_email: 'approver@example.com' } },
  reject: { event: 'reject', document_id: 'doc_abc123', action: 'rejected', recipient_email: 'approver@example.com', recipient_name: 'Jane Smith', role_type: 'APPROVE_REJECT', reason: 'Terms not acceptable', metadata: { ip_address: '198.51.100.23', user_agent: 'Mozilla/5.0 (Macintosh)', performed_by: 'Jane Smith', performed_by_email: 'approver@example.com' } },
  review: { event: 'review', document_id: 'doc_abc123', action: 'reviewed', recipient_email: 'reviewer@example.com', recipient_name: 'Bob Wilson', role_type: 'VIEW_ONLY', metadata: { ip_address: '192.0.2.55', user_agent: 'Mozilla/5.0 (iPhone)', performed_by: 'Bob Wilson', performed_by_email: 'reviewer@example.com' } },
  signed_copy: {
    event: 'signed_copy',
    document_id: 'doc_abc123',
    template_name: 'NDA Agreement',
    signed_documents: [{
      document_id: 'doc_abc123',
      template_name: 'NDA Agreement',
      signed_document_url: 'https://storage.example.com/signed/doc_abc123.pdf',
      signed_at: '2026-03-30T15:05:00Z'
    }],
    generated_at: '2026-03-30T15:05:00Z'
  }
};

const IntegrationTab = ({ templateData, onUpdate }) => {
  const [webhookUrl, setWebhookUrl] = useState(templateData?.webhook_config?.url || '');
  const [webhookEvents, setWebhookEvents] = useState(templateData?.webhook_config?.events || ['signed', 'viewed', 'opened']);
  const [webhookHeaders, setWebhookHeaders] = useState(templateData?.webhook_config?.headers || {});
  const [webhookSecret, setWebhookSecret] = useState(templateData?.webhook_config?.secret || '');
  const [retryEnabled, setRetryEnabled] = useState(templateData?.webhook_config?.retry_enabled !== false);
  const [maxRetries, setMaxRetries] = useState(templateData?.webhook_config?.max_retries || 3);
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    if (onUpdate) {
      onUpdate({
        webhook_config: {
          url: webhookUrl,
          events: webhookEvents,
          headers: webhookHeaders,
          secret: webhookSecret,
          retry_enabled: retryEnabled,
          max_retries: maxRetries
        }
      });
    }
  }, [webhookUrl, webhookEvents, webhookHeaders, webhookSecret, retryEnabled, maxRetries]);

  const toggleEvent = (eventId) => {
    setWebhookEvents(prev =>
      prev.includes(eventId)
        ? prev.filter(e => e !== eventId)
        : [...prev, eventId]
    );
  };

  const generateWebhookUrl = () => {
    const baseUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';
    const templateId = templateData?.id || 'template-id';
    setWebhookUrl(`${baseUrl}/api/docflow/webhook/${templateId}/events`);
  };

  const handleDownloadConfig = () => {
    const config = {
      webhook_url: webhookUrl,
      events: webhookEvents.map(eventId => {
        const event = WEBHOOK_EVENTS.find(e => e.id === eventId);
        return {
          id: eventId,
          label: event?.label || eventId,
          description: event?.description || '',
          sample_payload: SAMPLE_PAYLOADS[eventId] || { event: eventId }
        };
      }),
      settings: {
        secret: webhookSecret ? '***' : null,
        retry_enabled: retryEnabled,
        max_retries: maxRetries,
        headers: webhookHeaders
      },
      template_id: templateData?.id,
      template_name: templateData?.name,
      generated_at: new Date().toISOString()
    };

    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `webhook-config-${templateData?.name || 'template'}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success('Webhook config downloaded');
  };

  return (
    <div className="space-y-5" data-testid="integration-tab">
      {/* Webhook URL */}
      <div className="bg-white rounded-lg border border-gray-200 p-5">
        <h3 className="text-base font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <Webhook className="h-5 w-5 text-indigo-600" />
          Webhook URL
        </h3>
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <input
              type="text"
              data-testid="webhook-url-input"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              placeholder="https://api.example.com/docflow/webhook/..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm pr-10"
            />
            {webhookUrl && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-green-500" title="Active" />
            )}
          </div>
          <button
            data-testid="download-webhook-config-btn"
            onClick={handleDownloadConfig}
            // disabled={!webhookUrl || webhookEvents.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-indigo-300 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
            title="Download webhook config with sample payloads"
          >
            <Download className="h-4 w-4" />
            Download
          </button>
        </div>
        
      </div>

      {/* Event Notifications */}
      <div className="bg-white rounded-lg border border-gray-200 p-5">
        <h3 className="text-base font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <Bell className="h-5 w-5 text-indigo-600" />
          Send Event Notifications
        </h3>
        <div className="space-y-2">
          {WEBHOOK_EVENTS.map(event => (
            <label
              key={event.id}
              data-testid={`webhook-event-${event.id}`}
              className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                webhookEvents.includes(event.id)
                  ? 'border-indigo-300 bg-indigo-50/50'
                  : 'border-gray-200 hover:bg-gray-50'
              }`}
            >
              <input
                type="checkbox"
                checked={webhookEvents.includes(event.id)}
                onChange={() => toggleEvent(event.id)}
                className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
              />
              <div className="flex-1">
                <span className="font-medium text-sm text-gray-900">{event.label}</span>
                <p className="text-xs text-gray-500 mt-0.5">{event.description}</p>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Advanced Settings */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="w-full px-5 py-3 flex items-center justify-between text-left hover:bg-gray-50 transition-colors"
        >
          <span className="flex items-center gap-2 font-semibold text-sm text-gray-900">
            <Settings className="h-4 w-4 text-gray-500" />
            Advanced Settings
          </span>
          <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
        </button>

        {showAdvanced && (
          <div className="px-5 pb-5 space-y-4 border-t border-gray-100 pt-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Webhook Secret</label>
              <input
                type="text"
                value={webhookSecret}
                onChange={(e) => setWebhookSecret(e.target.value)}
                placeholder="Optional security secret"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 text-sm"
              />
              <p className="text-[10px] text-gray-500 mt-1">Used to verify webhook payloads (HMAC signature)</p>
            </div>

            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="retry-enabled"
                checked={retryEnabled}
                onChange={(e) => setRetryEnabled(e.target.checked)}
                className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
              />
              <label htmlFor="retry-enabled" className="text-sm font-medium text-gray-700">
                Enable retry on failure
              </label>
            </div>

            {retryEnabled && (
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Max Retries</label>
                <select
                  value={maxRetries}
                  onChange={(e) => setMaxRetries(parseInt(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 text-sm"
                >
                  <option value="1">1 retry</option>
                  <option value="3">3 retries</option>
                  <option value="5">5 retries</option>
                  <option value="10">10 retries</option>
                </select>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Custom Headers (JSON)</label>
              <textarea
                value={JSON.stringify(webhookHeaders, null, 2)}
                onChange={(e) => {
                  try {
                    setWebhookHeaders(JSON.parse(e.target.value));
                  } catch (err) { /* ignore parse errors while typing */ }
                }}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 text-sm font-mono"
                placeholder='{"Authorization": "Bearer ..."}'
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default IntegrationTab;
