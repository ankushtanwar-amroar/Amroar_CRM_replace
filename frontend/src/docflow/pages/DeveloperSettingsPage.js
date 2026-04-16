import React, { useState, useEffect, useCallback } from 'react';
import { Key, Plus, Copy, Trash2, Shield, Eye, EyeOff, Loader2, CheckCircle, AlertCircle, Code, ChevronDown, ChevronRight, Clock, BookOpen } from 'lucide-react';
import { toast } from 'react-hot-toast';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

const DeveloperSettingsPage = () => {
  const [apiKeys, setApiKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [showGenerateForm, setShowGenerateForm] = useState(false);
  const [generatedKey, setGeneratedKey] = useState(null);
  const [revokingId, setRevokingId] = useState(null);
  const [activeSection, setActiveSection] = useState('keys');

  const getToken = () => localStorage.getItem('access_token') || localStorage.getItem('token') || '';

  const loadKeys = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_URL}/api/public/packages/api-keys`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error('Failed to load API keys');
      const data = await res.json();
      setApiKeys(data.api_keys || []);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadKeys(); }, [loadKeys]);

  const handleGenerate = async () => {
    if (!newKeyName.trim()) { toast.error('Enter a key name'); return; }
    try {
      setGenerating(true);
      const res = await fetch(`${API_URL}/api/public/packages/api-keys/generate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newKeyName.trim() }),
      });
      if (!res.ok) throw new Error('Failed to generate key');
      const data = await res.json();
      setGeneratedKey(data.api_key);
      setNewKeyName('');
      setShowGenerateForm(false);
      toast.success('API key generated');
      loadKeys();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setGenerating(false);
    }
  };

  const handleRevoke = async (keyId) => {
    if (!window.confirm('Revoke this API key? This action cannot be undone.')) return;
    try {
      setRevokingId(keyId);
      const res = await fetch(`${API_URL}/api/public/packages/api-keys/${keyId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error('Failed to revoke key');
      toast.success('API key revoked');
      loadKeys();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setRevokingId(null);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  return (
    <div className="max-w-5xl mx-auto">
      {/* Section Tabs */}
      <div className="flex gap-2 mb-6">
        {[
          { id: 'keys', label: 'API Keys', icon: Key },
          { id: 'docs', label: 'API Documentation', icon: BookOpen },
        ].map(s => (
          <button key={s.id} onClick={() => setActiveSection(s.id)} data-testid={`dev-tab-${s.id}`}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${activeSection === s.id ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50 border border-transparent'}`}>
            <s.icon className="h-4 w-4" /> {s.label}
          </button>
        ))}
      </div>

      {/* ═══ API Keys Section ═══ */}
      {activeSection === 'keys' && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-gray-900" data-testid="api-keys-heading">API Keys</h2>
              <p className="text-sm text-gray-500 mt-0.5">Manage API keys for external integrations</p>
            </div>
            <button onClick={() => setShowGenerateForm(!showGenerateForm)} data-testid="generate-key-btn"
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 transition-colors">
              <Plus className="h-4 w-4" /> Generate Key
            </button>
          </div>

          {/* Generate Form */}
          {showGenerateForm && (
            <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4" data-testid="generate-key-form">
              <h3 className="text-sm font-semibold text-indigo-900 mb-3">New API Key</h3>
              <div className="flex gap-3">
                <input value={newKeyName} onChange={e => setNewKeyName(e.target.value)} placeholder="Key name (e.g., Production, Salesforce Integration)"
                  className="flex-1 px-3 py-2 text-sm border border-indigo-200 rounded-lg focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 bg-white"
                  data-testid="key-name-input" onKeyDown={e => e.key === 'Enter' && handleGenerate()} />
                <button onClick={handleGenerate} disabled={generating} data-testid="confirm-generate-btn"
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                  {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Key className="h-4 w-4" />}
                  {generating ? 'Generating...' : 'Generate'}
                </button>
                <button onClick={() => setShowGenerateForm(false)} className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700">Cancel</button>
              </div>
            </div>
          )}

          {/* One-time key display */}
          {generatedKey && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4" data-testid="generated-key-display">
              <div className="flex items-start gap-3">
                <CheckCircle className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-emerald-900 mb-1">API Key Generated</h3>
                  <p className="text-xs text-emerald-700 mb-3">Copy this key now. It will not be shown again.</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-xs font-mono bg-white px-3 py-2 rounded-lg border border-emerald-200 text-emerald-800 break-all" data-testid="generated-key-value">
                      {generatedKey}
                    </code>
                    <button onClick={() => copyToClipboard(generatedKey)} data-testid="copy-key-btn"
                      className="shrink-0 flex items-center gap-1.5 px-3 py-2 bg-emerald-600 text-white text-xs font-medium rounded-lg hover:bg-emerald-700">
                      <Copy className="h-3.5 w-3.5" /> Copy
                    </button>
                  </div>
                </div>
                <button onClick={() => setGeneratedKey(null)} className="text-emerald-400 hover:text-emerald-600 text-lg leading-none">&times;</button>
              </div>
            </div>
          )}

          {/* Security note */}
          <div className="flex items-start gap-2.5 text-xs text-gray-500 bg-gray-50 px-4 py-3 rounded-lg border border-gray-100">
            <Shield className="h-4 w-4 text-gray-400 shrink-0 mt-0.5" />
            <span>API keys provide full access to your tenant's DocFlow data via the Public API. Keep them secure and rotate regularly. Revoked keys are immediately invalidated.</span>
          </div>

          {/* Keys List */}
          {loading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 text-indigo-400 animate-spin" /></div>
          ) : apiKeys.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
              <Key className="h-10 w-10 text-gray-300 mx-auto mb-3" />
              <p className="text-sm font-medium text-gray-600">No API keys yet</p>
              <p className="text-xs text-gray-400 mt-1">Generate your first key to start using the Public API</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full" data-testid="api-keys-table">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/50">
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Name</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Key</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Created</th>
                    <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {apiKeys.map((k, i) => (
                    <tr key={k.id} className="border-b border-gray-50 hover:bg-gray-50/50" data-testid={`api-key-row-${i}`}>
                      <td className="px-5 py-3.5 text-sm font-medium text-gray-800">{k.name}</td>
                      <td className="px-5 py-3.5">
                        <code className="text-xs font-mono text-gray-500 bg-gray-100 px-2 py-1 rounded">{k.key_prefix}{'•'.repeat(20)}</code>
                      </td>
                      <td className="px-5 py-3.5">
                        {k.is_active ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-emerald-50 text-emerald-700 rounded-full border border-emerald-100">
                            <CheckCircle className="h-3 w-3" /> Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-red-50 text-red-600 rounded-full border border-red-100">
                            <AlertCircle className="h-3 w-3" /> Revoked
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-xs text-gray-500">
                        {k.created_at ? new Date(k.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        {k.is_active && (
                          <button onClick={() => handleRevoke(k.id)} disabled={revokingId === k.id} data-testid={`revoke-key-${i}`}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-50">
                            {revokingId === k.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                            Revoke
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ═══ API Documentation Section ═══ */}
      {activeSection === 'docs' && <ApiDocumentation />}
    </div>
  );
};


/* ═══ API Documentation Component ═══ */
const ApiDocumentation = () => {
  const [expandedApi, setExpandedApi] = useState(null);

  const toggle = (id) => setExpandedApi(expandedApi === id ? null : id);

  const copyJson = (obj) => {
    navigator.clipboard.writeText(JSON.stringify(obj, null, 2));
    toast.success('Copied JSON');
  };

  const apis = [
    {
      id: 'list-packages',
      method: 'GET',
      path: '/api/public/packages',
      title: 'List Packages',
      description: 'Fetch all packages for your tenant with templates and field placement data.',
      auth: 'API Key (X-API-Key or Authorization: Bearer)',
      queryParams: [
        { name: 'status', type: 'string', required: false, desc: 'Filter by status: active, draft, voided, archived' },
        { name: 'skip', type: 'integer', required: false, desc: 'Pagination offset (default: 0)' },
        { name: 'limit', type: 'integer', required: false, desc: 'Max results (default: 50)' },
      ],
      requestBody: null,
      response: {
        packages: [
          {
            package_id: "uuid",
            package_name: "Onboarding Package",
            status: "active",
            created_at: "2026-01-15T10:30:00Z",
            templates: [
              {
                template_id: "uuid",
                document_name: "NDA Agreement",
                order: 1,
                template_name: "NDA Template",
                template_version: 1,
                is_latest_version: true,
                fields: [
                  {
                    field_id: "uuid",
                    field_name: "Full Name",
                    field_type: "text",
                    page: 1,
                    position: { x: 100, y: 200, width: 150, height: 40 },
                    required: true,
                    assigned_role: "signer_1"
                  }
                ]
              }
            ]
          }
        ],
        total: 5,
        skip: 0,
        limit: 50,
      },
      validationRules: ['API key must be valid and active', 'Only returns packages for the authenticated tenant', 'Excludes run instances (returns blueprints only)'],
    },
    {
      id: 'get-package',
      method: 'GET',
      path: '/api/public/packages/{package_id}',
      title: 'Get Package Detail',
      description: 'Fetch a single package with full template structure, field placements, and run statistics.',
      auth: 'API Key (X-API-Key or Authorization: Bearer)',
      queryParams: [],
      requestBody: null,
      response: {
        package_id: "uuid",
        package_name: "Onboarding Package",
        status: "active",
        created_at: "2026-01-15T10:30:00Z",
        total_templates: 2,
        runs_count: 5,
        completed_runs: 3,
        templates: [
          {
            template_id: "uuid",
            document_name: "NDA Agreement",
            order: 1,
            template_name: "NDA Template",
            template_version: 1,
            is_latest_version: true,
            field_count: 4,
            fields: [
              {
                field_id: "uuid",
                field_name: "Signature",
                field_type: "signature",
                page: 1,
                position: { x: 200, y: 500, width: 180, height: 40 },
                required: true,
                assigned_role: null,
                placeholder: "",
                validation: "none",
                default_value: ""
              }
            ]
          }
        ]
      },
      validationRules: ['Returns 404 if package not found or belongs to different tenant', 'Includes runs_count and completed_runs for usage stats'],
    },
    {
      id: 'send-package',
      method: 'POST',
      path: '/api/public/packages/send',
      title: 'Send Package',
      description: 'Send a package using an existing blueprint. Creates a new run, generates documents, assigns recipients, and triggers routing. Reuses the same logic as the internal "Send Package" flow.',
      auth: 'API Key (X-API-Key or Authorization: Bearer)',
      queryParams: [],
      requestBody: {
        package_id: "uuid-of-existing-package",
        recipients: [
          {
            id: "signer_1",
            name: "John Doe",
            email: "john@example.com",
            role: "signer",
            routing_order: 1,
            wave: null
          },
          {
            id: "approver_1",
            name: "Jane Manager",
            email: "jane@example.com",
            role: "approver",
            routing_order: 2,
            wave: null
          }
        ],
        routing_mode: "sequential",
        delivery_mode: "email",
        template_merge_fields: [
          {
            template_id: "uuid-of-template-1",
            merge_fields: {
              "client_name": "Acme Corp",
              "effective_date": "2026-01-15",
              "contract_amount": "$50,000"
            }
          },
          {
            template_id: "uuid-of-template-2",
            merge_fields: {
              "company_address": "123 Main St",
              "city": "San Francisco"
            }
          }
        ],
        field_assignments: [
          {
            template_id: "uuid-of-template-1",
            fields: [
              { field_id: "field-uuid-1", recipient_id: "signer_1" },
              { field_id: "field-uuid-2", recipient_id: "signer_1" }
            ]
          }
        ],
        authentication: { otp_required: true }
      },
      response: {
        success: true,
        run_id: "uuid",
        package_id: "uuid",
        status: "in_progress",
        delivery_mode: "email",
        public_link: null,
        recipient_links: [
          {
            name: "John Doe",
            email: "john@example.com",
            role: "SIGN",
            routing_order: 1,
            status: "notified",
            access_link: "https://app.com/docflow/package/{run_id}/view/{token}"
          }
        ],
        documents: [
          {
            document_id: "uuid",
            template_id: "uuid",
            document_name: "NDA Agreement",
            order: 1
          }
        ],
        message: "Package sent successfully"
      },
      validationRules: [
        'package_id: required, must exist and belong to tenant',
        'Package must not be voided',
        'recipients[].name: required (string)',
        'recipients[].email: required for email/both delivery mode',
        'recipients[].role: signer | approver | reviewer | receive_copy',
        'recipients[].routing_order: integer >= 1 (determines wave)',
        'recipients[].wave: integer (used for mixed routing mode)',
        'routing_mode: sequential | parallel | mixed',
        'delivery_mode: email | public_link | both | public_recipients',
        'field_assignments[].template_id: must match a template in the package',
        'field_assignments[].fields[].recipient_id: must match a recipient id',
        'Approver must always come after signer in routing order',
        'If delivery_mode = public_link: public_link returned in response',
        'If delivery_mode = email: recipient access_links returned in response',
        'If delivery_mode = public_recipients: unique signing_link per recipient, NO emails sent',
      ],
      workflowLogic: {
        sequential: 'Recipients are processed one by one based on routing_order. Each must complete before the next is notified.',
        parallel: 'All recipients are notified simultaneously. routing_order is ignored.',
        mixed: 'Recipients with the same routing_order (or wave) run in parallel. Different orders run sequentially. Example: Wave 1 = 2 signers in parallel, Wave 2 = 1 approver after both complete.',
      },
    },
    {
      id: 'public-templates',
      method: 'GET',
      path: '/api/docflow/public/templates',
      title: 'List Active Templates',
      description: 'Fetch active templates (latest version only) for a tenant. Useful for Salesforce or CRM integrations.',
      auth: 'None (tenant_id query param required)',
      queryParams: [
        { name: 'tenant_id', type: 'string', required: true, desc: 'Tenant ID (required for isolation)' },
      ],
      requestBody: null,
      response: {
        success: true,
        data: [
          {
            template_id: "uuid",
            template_name: "NDA Template (v1)",
            version: 1,
            template_group_id: "uuid",
            status: "active",
            created_at: "2026-01-15T10:30:00Z",
            updated_at: "2026-02-01T08:00:00Z",
            field_placements: [
              { id: "uuid", name: "Full Name", type: "text_input" },
              { id: "uuid", name: "Signature", type: "signature", assigned_to: "signer_1" }
            ]
          }
        ]
      },
      validationRules: ['tenant_id is required', 'Returns 404 if tenant does not exist', 'Only returns active + latest version templates'],
    },
    {
      id: 'generate-links',
      method: 'POST',
      path: '/api/v1/documents/generate-links',
      title: 'Generate Document Links',
      description: 'Generate document(s) with full workflow. Supports basic (single doc) and package (multi doc) modes.',
      auth: 'JWT Bearer Token (admin session)',
      queryParams: [],
      requestBody: {
        send_mode: "basic",
        template_id: "uuid-of-template",
        document_name: "Client NDA",
        routing_type: "sequential",
        delivery_mode: "email",
        send_email: true,
        require_auth: true,
        recipients: [
          {
            name: "Client Name",
            email: "client@example.com",
            role: "signer",
            routing_order: 1,
            assigned_components: ["field-uuid-1", "field-uuid-2"]
          }
        ],
        merge_fields: { client_name: "Acme Corp", date: "2026-01-15" },
        source_context: { record_id: "sf-record-id", object_type: "Opportunity" },
        expires_at: null
      },
      response: {
        success: true,
        document_id: "uuid",
        status: "generated",
        recipient_links: [
          {
            name: "Client Name",
            email: "client@example.com",
            role: "signer",
            status: "notified",
            document_url: "https://app.com/docflow/view/{token}"
          }
        ],
        public_link: "https://app.com/docflow/view/{token}",
        package_id: null,
        message: "Document generated successfully"
      },
      validationRules: [
        'send_mode: basic | package',
        'template_id: required for basic mode',
        'routing_type: sequential | parallel',
        'delivery_mode: email | public_link | both | public_recipients',
        'recipients[].role: signer | approver | viewer',
        'recipients[].assigned_components: array of field IDs (basic mode)',
        'recipients[].assigned_components_map: {template_id: [field_ids]} (package mode)',
        'merge_fields: key-value pairs merged into document placeholders',
        'expires_at: ISO datetime string or null',
      ],
      workflowLogic: {
        sequential: 'Wave-based execution: recipients process in routing_order. Same order = parallel within wave.',
        parallel: 'All recipients notified at once.',
      },
    },
    {
      id: 'webhook-events',
      method: 'POST',
      path: 'Your Webhook URL',
      title: 'Webhook Events',
      description: 'DocFlow fires webhook events at key lifecycle moments. Configure webhook_url in your package. Events include signed document URLs and recipient details.',
      auth: 'N/A — outbound POST to your URL',
      queryParams: [],
      requestBody: null,
      response: {
        event_type: "document_signed",
        package_id: "uuid",
        timestamp: "2026-04-12T09:00:00Z",
        data: {
          recipient_id: "uuid",
          action: "signed",
          status: "signed",
          recipient_details: { name: "John Doe", email: "john@example.com" },
          signed_documents: [
            { document_id: "uuid", template_name: "NDA", signed_document_url: "https://..." }
          ],
          documents_signed: 1,
        }
      },
      validationRules: [
        'Events: document_signed, recipient_approved, recipient_rejected, package_completed, package_voided',
        'document_signed: includes signed_documents[] with signed_document_url',
        'recipient_details: includes name and email of the acting recipient',
        'timestamp: ISO 8601 UTC',
        'Retry: Failed webhook calls are logged but not retried automatically',
      ],
    },
  ];

  const MethodBadge = ({ method }) => {
    const colors = {
      GET: 'bg-emerald-100 text-emerald-700 border-emerald-200',
      POST: 'bg-blue-100 text-blue-700 border-blue-200',
      DELETE: 'bg-red-100 text-red-700 border-red-200',
    };
    return <span className={`px-2 py-0.5 text-[10px] font-bold rounded border ${colors[method] || 'bg-gray-100'}`}>{method}</span>;
  };

  const JsonBlock = ({ data, label }) => (
    <div className="relative group">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">{label}</span>
        <button onClick={() => copyJson(data)} className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 text-[10px] text-indigo-600 hover:text-indigo-800 font-medium">
          <Copy className="h-3 w-3" /> Copy
        </button>
      </div>
      <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 text-xs font-mono overflow-x-auto max-h-96 leading-relaxed">
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="mb-2">
        <h2 className="text-lg font-bold text-gray-900">API Documentation</h2>
        <p className="text-sm text-gray-500 mt-0.5">Complete request/response reference for all public APIs</p>
      </div>

      {/* Auth instructions */}
      <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4" data-testid="auth-instructions">
        <h3 className="text-sm font-semibold text-indigo-900 mb-2 flex items-center gap-2"><Shield className="h-4 w-4" /> Authentication</h3>
        <div className="text-xs text-indigo-800 space-y-1.5">
          <p>Most APIs require an <strong>API Key</strong> passed via header:</p>
          <code className="block bg-white/60 px-3 py-2 rounded-lg font-mono text-[11px]">
            X-API-Key: dfk_your_api_key_here
          </code>
          <p className="text-indigo-600">Or alternatively:</p>
          <code className="block bg-white/60 px-3 py-2 rounded-lg font-mono text-[11px]">
            Authorization: Bearer dfk_your_api_key_here
          </code>
        </div>
      </div>

      {/* API Cards */}
      {apis.map(api => {
        const isOpen = expandedApi === api.id;
        return (
          <div key={api.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden" data-testid={`api-card-${api.id}`}>
            <button onClick={() => toggle(api.id)} className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-gray-50 transition-colors">
              {isOpen ? <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" /> : <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />}
              <MethodBadge method={api.method} />
              <code className="text-sm font-mono text-gray-700 font-medium">{api.path}</code>
              <span className="text-sm text-gray-500 ml-2">{api.title}</span>
            </button>

            {isOpen && (
              <div className="border-t border-gray-100 px-5 py-5 space-y-5">
                <p className="text-sm text-gray-600">{api.description}</p>

                <div className="flex items-center gap-2 text-xs">
                  <Shield className="h-3.5 w-3.5 text-amber-500" />
                  <span className="font-medium text-gray-700">Auth:</span>
                  <span className="text-gray-500">{api.auth}</span>
                </div>

                {/* Query Params */}
                {api.queryParams.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Query Parameters</h4>
                    <table className="w-full text-xs">
                      <thead><tr className="border-b border-gray-100">
                        <th className="py-1.5 pr-3 text-left font-semibold text-gray-500">Param</th>
                        <th className="py-1.5 pr-3 text-left font-semibold text-gray-500">Type</th>
                        <th className="py-1.5 pr-3 text-left font-semibold text-gray-500">Required</th>
                        <th className="py-1.5 text-left font-semibold text-gray-500">Description</th>
                      </tr></thead>
                      <tbody>{api.queryParams.map(p => (
                        <tr key={p.name} className="border-b border-gray-50">
                          <td className="py-1.5 pr-3 font-mono text-indigo-600">{p.name}</td>
                          <td className="py-1.5 pr-3 text-gray-500">{p.type}</td>
                          <td className="py-1.5 pr-3">{p.required ? <span className="text-red-500 font-medium">Yes</span> : <span className="text-gray-400">No</span>}</td>
                          <td className="py-1.5 text-gray-600">{p.desc}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                )}

                {/* Request Body */}
                {api.requestBody && <JsonBlock data={api.requestBody} label="Request Body" />}

                {/* Response Body */}
                <JsonBlock data={api.response} label="Response" />

                {/* Validation Rules */}
                {api.validationRules && (
                  <div>
                    <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Validation Rules</h4>
                    <ul className="space-y-1">
                      {api.validationRules.map((r, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs text-gray-600">
                          <span className="text-indigo-400 mt-0.5">-</span> <span>{r}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Workflow Logic */}
                {api.workflowLogic && (
                  <div>
                    <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Workflow Logic</h4>
                    <div className="space-y-2">
                      {Object.entries(api.workflowLogic).map(([mode, desc]) => (
                        <div key={mode} className="flex items-start gap-2 text-xs">
                          <span className="px-1.5 py-0.5 bg-gray-100 text-gray-700 font-mono rounded text-[10px] font-bold shrink-0">{mode}</span>
                          <span className="text-gray-600">{desc}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default DeveloperSettingsPage;
