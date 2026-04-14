import React, { useState, useEffect } from 'react';
import { Copy, Eye, EyeOff, CheckCircle, XCircle, Clock, AlertTriangle, Plus, Trash2, Save } from 'lucide-react';
import axios from 'axios';
import { toast } from 'sonner';

const WebhookTriggerConfigPanel = ({ flowId, triggers, onUpdateTriggers, onClose }) => {
  const [webhookConfig, setWebhookConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showSecret, setShowSecret] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [lastExecution, setLastExecution] = useState(null);
  const [bodyFields, setBodyFields] = useState([]);
  const [showFieldConfig, setShowFieldConfig] = useState(false);
  
  const API = process.env.REACT_APP_BACKEND_URL;

  useEffect(() => {
    // Don't fetch for unsaved flows
    if (flowId === 'new') {
      setLoading(false);
      return;
    }
    
    fetchWebhookConfig();
    fetchLastExecution();
  }, [flowId]);

  useEffect(() => {
    // Load body fields when triggers change
    loadBodyFieldsConfig();
  }, [triggers]);

  const loadBodyFieldsConfig = () => {
    // Load body fields from triggers config
    if (triggers && triggers.length > 0) {
      const webhookTrigger = triggers.find(t => 
        t.type === 'incoming_webhook_trigger' || 
        t.type === 'webhook_trigger' || 
        t.type === 'incoming_webhook'
      );
      if (webhookTrigger && webhookTrigger.config && webhookTrigger.config.body_fields) {
        setBodyFields(webhookTrigger.config.body_fields);
      } else {
        // Clear body fields if none are configured
        setBodyFields([]);
      }
    }
  };

  const fetchWebhookConfig = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API}/api/flow-builder/flows/${flowId}/webhook-config`);
      setWebhookConfig(response.data);
    } catch (error) {
      console.error('Error fetching webhook config:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchLastExecution = async () => {
    try {
      const response = await axios.get(`${API}/api/flow-builder/webhook-logs?flow_id=${flowId}&limit=1`);
      if (response.data && response.data.length > 0) {
        setLastExecution(response.data[0]);
      }
    } catch (error) {
      console.error('Error fetching last execution:', error);
    }
  };

  const copyToClipboard = async (text, type) => {
    try {
      await navigator.clipboard.writeText(text);
      if (type === 'url') {
        setCopiedUrl(true);
        setTimeout(() => setCopiedUrl(false), 2000);
      } else if (type === 'secret') {
        setCopiedSecret(true);
        setTimeout(() => setCopiedSecret(false), 2000);
      }
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const maskSecret = (secret) => {
    if (!secret) return '';
    const visibleChars = 8;
    return secret.substring(0, visibleChars) + '•'.repeat(secret.length - visibleChars);
  };

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return 'Never';
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  const addBodyField = () => {
    const newField = {
      id: `field_${Date.now()}`,
      name: '',
      type: 'text',
      required: false
    };
    setBodyFields([...bodyFields, newField]);
  };

  const updateBodyField = (fieldId, updates) => {
    setBodyFields(bodyFields.map(field => 
      field.id === fieldId ? { ...field, ...updates } : field
    ));
  };

  const removeBodyField = (fieldId) => {
    setBodyFields(bodyFields.filter(field => field.id !== fieldId));
  };

  const saveBodyFieldsConfig = () => {
    // Update triggers with body fields configuration
    const updatedTriggers = [...(triggers || [])];
    const webhookTriggerIndex = updatedTriggers.findIndex(
      t => t.type === 'incoming_webhook_trigger' || t.type === 'webhook_trigger'
    );
    
    if (webhookTriggerIndex >= 0) {
      if (!updatedTriggers[webhookTriggerIndex].config) {
        updatedTriggers[webhookTriggerIndex].config = {};
      }
      updatedTriggers[webhookTriggerIndex].config.body_fields = bodyFields;
      
      if (onUpdateTriggers) {
        onUpdateTriggers(updatedTriggers);
        toast.success('Webhook body fields saved! Remember to save the flow.');
        setShowFieldConfig(false);
      }
    } else {
      toast.error('Webhook trigger not found');
    }
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading webhook configuration...</p>
        </div>
      </div>
    );
  }

  // Handle unsaved flows
  if (flowId === 'new') {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center max-w-md p-6">
          <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-8 h-8 text-purple-600" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            Save Flow First
          </h3>
          <p className="text-gray-600 text-sm mb-4">
            Please save your flow to generate the webhook URL and secret. Once saved, you'll be able to configure and use the webhook trigger.
          </p>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-left">
            <p className="text-xs text-blue-800 font-semibold mb-2">What happens when you save:</p>
            <ul className="text-xs text-blue-700 space-y-1">
              <li>✓ Unique webhook URL will be generated</li>
              <li>✓ Secret token will be auto-created</li>
              <li>✓ You can start receiving webhook triggers</li>
            </ul>
          </div>
        </div>
      </div>
    );
  }

  if (!webhookConfig || !webhookConfig.has_webhook) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center max-w-md p-6">
          <AlertTriangle className="w-16 h-16 text-yellow-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            Webhook Trigger Not Configured
          </h3>
          <p className="text-gray-600 text-sm mb-4">
            This flow doesn't have a webhook trigger configured. This might happen if:
          </p>
          <ul className="text-sm text-gray-600 text-left space-y-2 mb-4">
            <li>• The flow was not created with webhook trigger type</li>
            <li>• The flow configuration is incomplete</li>
            <li>• The webhook trigger was removed</li>
          </ul>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
          >
            Close Panel
          </button>
        </div>
      </div>
    );
  }

  const sampleCurl = `curl -X POST \\
  ${webhookConfig.webhook_url} \\
  -H 'X-Webhook-Secret: ${webhookConfig.secret}' \\
  -H 'Content-Type: application/json' \\
  -d '{
    "email": "user@example.com",
    "status": "active",
    "amount": 100
  }'`;

  const samplePayload = `{
  "email": "user@example.com",
  "name": "John Doe",
  "status": "active",
  "amount": 100,
  "created_at": "2026-01-06T10:00:00Z"
}`;

  return (
    <div className="h-full overflow-y-auto p-6 bg-gray-50">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Webhook Trigger Configuration</h2>
        <p className="text-sm text-gray-600 mt-1">
          Configure your webhook endpoint to receive external triggers
        </p>
      </div>

      {/* Webhook Details Card */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Webhook Endpoint</h3>
        
        {/* Webhook URL */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Webhook URL
          </label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={webhookConfig.webhook_url}
              readOnly
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-sm font-mono"
            />
            <button
              onClick={() => copyToClipboard(webhookConfig.webhook_url, 'url')}
              className="px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center gap-2"
            >
              {copiedUrl ? (
                <>
                  <CheckCircle className="w-4 h-4" />
                  <span className="text-sm">Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  <span className="text-sm">Copy</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* HTTP Method */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            HTTP Method
          </label>
          <input
            type="text"
            value="POST"
            readOnly
            className="w-32 px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-sm font-semibold"
          />
        </div>

        {/* Webhook Secret */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Webhook Secret
          </label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={showSecret ? webhookConfig.secret : maskSecret(webhookConfig.secret)}
              readOnly
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-sm font-mono"
            />
            <button
              onClick={() => setShowSecret(!showSecret)}
              className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              title={showSecret ? 'Hide secret' : 'Show secret'}
            >
              {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
            <button
              onClick={() => copyToClipboard(webhookConfig.secret, 'secret')}
              className="px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center gap-2"
            >
              {copiedSecret ? (
                <>
                  <CheckCircle className="w-4 h-4" />
                  <span className="text-sm">Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  <span className="text-sm">Copy</span>
                </>
              )}
            </button>
          </div>
          <p className="text-xs text-yellow-600 mt-2 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            Keep this secret secure! Anyone with this secret can trigger your flow.
          </p>
        </div>

        {/* Rate Limit */}
        <div className="mb-0">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Rate Limit
          </label>
          <p className="text-sm text-gray-600">
            {webhookConfig.rate_limit} requests per minute
          </p>
        </div>
      </div>

      {/* Instructions Card */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
        <h3 className="text-lg font-semibold text-blue-900 mb-2">📘 How to Use</h3>
        <p className="text-sm text-blue-800 mb-4">
          Send a POST request to the webhook URL with a JSON payload to trigger this flow. Include the X-Webhook-Secret header for authentication.
        </p>
        <div className="space-y-2 text-sm text-blue-800">
          <p>• The payload will be available as <code className="bg-blue-100 px-1 rounded">webhook.*</code> variables in your flow</p>
          <p>• Example: Access payload.email as <code className="bg-blue-100 px-1 rounded">{"{{webhook.email}}"}</code></p>
          <p>• You can use these variables in Decision nodes, Create/Update actions, and more</p>
        </div>
      </div>

      {/* Webhook Body Fields Configuration */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Expected Body Fields</h3>
            <p className="text-xs text-gray-600 mt-1">
              Define the fields you expect in the webhook payload. These will be available in your flow as <code className="bg-gray-100 px-1 rounded">{"{{WebhookBody.fieldname}}"}</code>
            </p>
          </div>
          <button
            onClick={() => setShowFieldConfig(!showFieldConfig)}
            className="px-3 py-1.5 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 transition-colors"
          >
            {showFieldConfig ? 'Hide' : 'Configure Fields'}
          </button>
        </div>

        {showFieldConfig && (
          <div className="space-y-4 border-t border-gray-200 pt-4">
            {/* Field List */}
            {bodyFields.length === 0 ? (
              <div className="text-center py-6 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
                <p className="text-sm text-gray-600 mb-3">No body fields defined yet</p>
                <p className="text-xs text-gray-500">Add fields to define your webhook payload structure</p>
              </div>
            ) : (
              <div className="space-y-3">
                {bodyFields.map((field) => (
                  <div key={field.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                    <input
                      type="text"
                      placeholder="Field name (e.g., email)"
                      value={field.name}
                      onChange={(e) => updateBodyField(field.id, { name: e.target.value })}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                    <select
                      value={field.type}
                      onChange={(e) => updateBodyField(field.id, { type: e.target.value })}
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    >
                      <option value="text">Text</option>
                      <option value="number">Number</option>
                      <option value="boolean">Boolean</option>
                      <option value="email">Email</option>
                      <option value="date">Date</option>
                    </select>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={field.required}
                        onChange={(e) => updateBodyField(field.id, { required: e.target.checked })}
                        className="rounded"
                      />
                      Required
                    </label>
                    <button
                      onClick={() => removeBodyField(field.id)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-3 pt-3 border-t border-gray-200">
              <button
                onClick={addBodyField}
                className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm"
              >
                <Plus className="w-4 h-4" />
                Add Field
              </button>
              <button
                onClick={saveBodyFieldsConfig}
                className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm"
              >
                <Save className="w-4 h-4" />
                Save Configuration
              </button>
            </div>

            {/* Preview */}
            {bodyFields.length > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-xs font-semibold text-blue-900 mb-2">Available Variables:</p>
                <div className="flex flex-wrap gap-2">
                  {bodyFields.map((field) => (
                    <code key={field.id} className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                      {"{{"}WebhookBody.{field.name || 'fieldname'}{"}}"}
                    </code>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        
        {/* Show current configuration when collapsed */}
        {!showFieldConfig && bodyFields.length > 0 && (
          <div className="border-t border-gray-200 pt-4">
            <p className="text-xs text-gray-600 mb-2">Configured Fields ({bodyFields.length}):</p>
            <div className="flex flex-wrap gap-2">
              {bodyFields.map((field) => (
                <span key={field.id} className="inline-flex items-center gap-1 px-2 py-1 bg-purple-100 text-purple-800 text-xs rounded">
                  {field.name} <span className="text-purple-600">({field.type})</span>
                  {field.required && <span className="text-purple-900">*</span>}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Sample cURL Request */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900 mb-3">Sample cURL Request</h3>
        <div className="relative">
          <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg text-xs overflow-x-auto">
            {sampleCurl}
          </pre>
          <button
            onClick={() => copyToClipboard(sampleCurl, 'curl')}
            className="absolute top-2 right-2 px-2 py-1 bg-gray-700 text-white text-xs rounded hover:bg-gray-600 transition-colors"
          >
            Copy
          </button>
        </div>
      </div>

      {/* Example Payload */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900 mb-3">Example JSON Payload</h3>
        <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg text-xs overflow-x-auto">
          {samplePayload}
        </pre>
        <p className="text-xs text-gray-600 mt-3">
          Replace with your actual data structure. All fields will be accessible as webhook.fieldname variables.
        </p>
      </div>

      {/* Last Execution Status */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900 mb-3">Last Execution</h3>
        {lastExecution ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Status:</span>
              <span className={`flex items-center gap-2 text-sm font-semibold ${
                lastExecution.status === 'success' ? 'text-green-600' : 'text-red-600'
              }`}>
                {lastExecution.status === 'success' ? (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    Success
                  </>
                ) : (
                  <>
                    <XCircle className="w-4 h-4" />
                    Failed
                  </>
                )}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Timestamp:</span>
              <span className="text-sm text-gray-900 flex items-center gap-2">
                <Clock className="w-4 h-4" />
                {formatTimestamp(lastExecution.timestamp)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">HTTP Status:</span>
              <span className="text-sm text-gray-900 font-mono">{lastExecution.http_status}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Execution Time:</span>
              <span className="text-sm text-gray-900">{lastExecution.execution_time_ms}ms</span>
            </div>
            {lastExecution.error_message && (
              <div className="pt-3 border-t border-gray-200">
                <span className="text-sm text-gray-600 block mb-1">Error Message:</span>
                <p className="text-sm text-red-600 bg-red-50 p-2 rounded">{lastExecution.error_message}</p>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-gray-500 italic">No executions yet</p>
        )}
      </div>
    </div>
  );
};

export default WebhookTriggerConfigPanel;
