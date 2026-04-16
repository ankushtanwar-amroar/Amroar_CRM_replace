import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Send, Mail, Link as LinkIcon, Zap, Plus, Trash2, ArrowUpDown, CalendarClock, Copy, ExternalLink, X, CheckCircle, Shield, AlertCircle, GitBranch } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { docflowService } from '../services/docflowService';
import TriggerConfiguration from '../components/TriggerConfiguration';

const API_URL = process.env.REACT_APP_BACKEND_URL;



const routingModes = [
  { value: 'sequential', label: 'Sequential' },
  { value: 'parallel', label: 'Parallel' },
];

const GenerateDocumentWizard = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const templateId = searchParams.get('template');

  const [loading, setLoading] = useState(false);
  const [template, setTemplate] = useState(null);
  const [generating, setGenerating] = useState(false);
  
  // Version control
  const [versionHistory, setVersionHistory] = useState([]);
  const [selectedVersionId, setSelectedVersionId] = useState(templateId);

  const [recipientDrafts, setRecipientDrafts] = useState([]);
  const [routingMode, setRoutingMode] = useState('sequential');

  const [showLinkModal, setShowLinkModal] = useState(false);
  const [generatedLinks, setGeneratedLinks] = useState([]);
  const [expiryMode, setExpiryMode] = useState('no_expiry');
  const [expiryDate, setExpiryDate] = useState('');

  const [formData, setFormData] = useState({
    crm_object_type: 'opportunity',
    crm_object_id: '',
    delivery_channels: ['email'],
    recipient_email: '',
    recipient_name: '',
    setup_trigger: false
  });

  const [requireAuth, setRequireAuth] = useState(false);
  
  const [triggerConfig, setTriggerConfig] = useState({
    enabled: false,
    trigger_type: 'onUpdate',
    object_type: '',
    email_field: '',
    conditions: []
  });

  const [crmRecords, setCrmRecords] = useState([]);

  // Email templates
  const [emailTemplates, setEmailTemplates] = useState([]);
  const [emailTemplatesLoaded, setEmailTemplatesLoaded] = useState(false);

  // Derived state
  const deliveryChannels = formData.delivery_channels || [];
  const isEmailEnabled = deliveryChannels.includes('email');
  const isPublicLinkEnabled = deliveryChannels.includes('public_link');
  const isPublicLinkOnly = isPublicLinkEnabled && !isEmailEnabled;

  // CRM provider — hide Setup Trigger for Salesforce
  const crmProvider = template?.crm_connection?.provider || 'internal';
  const isSalesforce = crmProvider === 'salesforce';

  useEffect(() => {
    if (templateId) {
      loadTemplate();
    }
    loadEmailTemplates();
  }, [templateId]);

  useEffect(() => {
    if (formData.crm_object_type) {
      loadCrmRecords();
    }
  }, [formData.crm_object_type]);

  const loadTemplate = async () => {
    try {
      const data = await docflowService.getTemplate(templateId);
      setTemplate(data);
      setSelectedVersionId(templateId);

      // Load version history
      try {
        const vData = await docflowService.getTemplateVersions(templateId);
        setVersionHistory(vData.versions || []);
      } catch (vErr) {
        console.warn('Could not load versions:', vErr);
      }

      const tmplRecipients = data?.recipients || [];
      setRoutingMode(data?.routing_mode || 'sequential');
      
      setRecipientDrafts(tmplRecipients.map(r => ({
        id: r.id,
        template_recipient_id: r.id,
        name: '',
        email: '',
        routing_order: r.routing_order || 1,
        is_required: r.is_required !== false,
        placeholder_name: r.placeholder_name,
        assigned_field_ids: r.assigned_field_ids || []
      })));
      
      if (data.object_mapping?.parent_object) {
        setFormData(prev => ({
          ...prev,
          crm_object_type: data.object_mapping.parent_object.toLowerCase()
        }));
      }
      
      if (data.trigger_config) {
        setTriggerConfig({
          enabled: data.trigger_config.enabled || false,
          trigger_type: data.trigger_config.trigger_type || 'onUpdate',
          object_type: data.trigger_config.object_type || '',
          email_field: data.trigger_config.email_field || '',
          conditions: data.trigger_config.conditions || []
        });
        
        if (data.trigger_config.enabled) {
          setFormData(prev => ({ ...prev, setup_trigger: true }));
        }
      }
    } catch (error) {
      console.error('Error loading template:', error);
      toast.error('Failed to load template');
    } finally {
      setLoading(false);
    }
  };

  const loadCrmRecords = async () => {
    try {
      const data = await docflowService.getCrmRecords(formData.crm_object_type);
      setCrmRecords(data.records || []);
    } catch (error) {
      console.error('Error loading CRM records:', error);
      setCrmRecords([]);
    }
  };

  const loadEmailTemplates = async () => {
    try {
      const token = localStorage.getItem('token');
      const resp = await fetch(`${API_URL}/api/docflow/email-templates`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await resp.json();
      setEmailTemplates(data.templates || []);
      setEmailTemplatesLoaded(true);
    } catch {
      setEmailTemplatesLoaded(true);
    }
  };

  const updateRecipient = (id, updates) => {
    setRecipientDrafts(prev => prev.map(r => r.id === id ? { ...r, ...updates } : r));
  };

  const removeRecipient = (id) => {
    setRecipientDrafts(prev => prev.filter(r => r.id !== id));
  };

  const addRecipient = () => {
    const idx = recipientDrafts.length;
    const newId = `rcpt_${Date.now()}_${idx}`;
    setRecipientDrafts(prev => [
      ...prev,
      {
        id: newId,
        template_recipient_id: null,
        name: '',
        email: '',
        role_type: 'SIGN',
        routing_order: idx + 1,
        is_required: true,
        placeholder_name: `Recipient ${idx + 1}`,
        assigned_field_ids: [],
        email_template_id: '',
      }
    ]);
  };

  const setDeliveryMethod = (method) => {
    setFormData(prev => ({
      ...prev,
      delivery_channels: [method]
    }));
  };

  const handleGenerate = async () => {
    if (template?.status === 'draft') {
      toast.error('This template is in draft. Please validate and save it again');
      return;
    }

    // Trigger mode
    if (formData.setup_trigger) {
      if (!triggerConfig.enabled) {
        toast.error('Please enable the automatic trigger');
        return;
      }
      if (!triggerConfig.object_type) {
        toast.error('Please select a CRM object type');
        return;
      }
      if (!triggerConfig.email_field) {
        toast.error('Please select an email field for document delivery');
        return;
      }
      
      try {
        setGenerating(true);
        await docflowService.updateTemplate(templateId, { trigger_config: triggerConfig });
        toast.success('Trigger configured successfully!');
        navigate(`/setup/docflow`);
      } catch (error) {
        console.error('Error saving trigger:', error);
        toast.error('Failed to save trigger configuration');
      } finally {
        setGenerating(false);
      }
      return;
    }

    // Manual generation
    if (deliveryChannels.length === 0) {
      toast.error('Please select at least one delivery method');
      return;
    }

    // Recipient validation — only required when email is enabled
    if (isEmailEnabled) {
      if (recipientDrafts.length === 0) {
        toast.error('At least one recipient is required for email delivery.');
        return;
      }

      for (const rd of recipientDrafts) {
        if (!rd.is_required) continue;
        if (!rd.name?.trim()) {
          toast.error(`Recipient name is required for "${rd.placeholder_name || 'Recipient'}"`);
          return;
        }
        if (!rd.email?.trim()) {
          toast.error(`Recipient email is required for "${rd.placeholder_name || 'Recipient'}"`);
          return;
        }
      }
    }

    // For public link only — ensure at least a name is set if recipients exist
    if (isPublicLinkOnly) {
      for (const rd of recipientDrafts) {
        if (rd.is_required && !rd.name?.trim()) {
          toast.error(`Recipient name is required for "${rd.placeholder_name || 'Recipient'}"`);
          return;
        }
      }
    }

    // Build recipients for API
    let finalRecipients = [...recipientDrafts];

    // For public link only with no recipients, create a placeholder
    if (isPublicLinkOnly && finalRecipients.length === 0) {
      finalRecipients = [{
        id: `rcpt_public_${Date.now()}`,
        template_recipient_id: null,
        name: '',
        email: '',
        routing_order: 1,
        is_required: true,
        placeholder_name: 'Public Link Recipient',
        assigned_field_ids: []
      }];
    }

    try {
      setGenerating(true);

      // Map delivery channels to delivery_mode
      let deliveryMode = 'email';
      if (isEmailEnabled && isPublicLinkEnabled) deliveryMode = 'both';
      else if (isPublicLinkEnabled) deliveryMode = 'public_link';
      else deliveryMode = 'email';

      // Build recipients with assigned_components
      const apiRecipients = finalRecipients
        .filter(r => r.name || r.email || deliveryMode === 'public_link')
        .map(r => ({
          name: r.name || '',
          email: r.email || '',
          role: r.role_type === 'APPROVE_REJECT' ? 'approver' : r.role_type === 'REVIEWER' ? 'reviewer' : r.role_type === 'RECEIVE_COPY' ? 'receive_copy' : 'sign',
          routing_order: r.routing_order || 1,
          assigned_components: r.assigned_field_ids || [],
          email_template_id: r.email_template_id || undefined,
        }));

      const result = await docflowService.generateLinks({
        template_id: selectedVersionId || templateId,
        document_name: template?.name || '',
        routing_type: routingMode,
        delivery_mode: deliveryMode,
        send_email: isEmailEnabled,
        source_context: formData.crm_object_id ? {
          record_id: formData.crm_object_id,
          object_type: formData.crm_object_type || 'manual'
        } : { record_id: 'manual-send', object_type: 'manual' },
        recipients: apiRecipients,
        merge_fields: {},
        expires_at: expiryMode === 'custom' && expiryDate ? new Date(expiryDate).toISOString() : null,
        require_auth: requireAuth,
      });

      if (!result.success) {
        const errorMsg = result.errors?.join(', ') || result.message || 'Generation failed';
        toast.error(errorMsg);
        setGenerating(false);
        return;
      }

      toast.success(result.message || 'Document generated successfully!');

      // Show public link popup if public_link delivery was selected
      if (isPublicLinkEnabled && (result.public_link || result.recipient_links?.length)) {
        const links = result.recipient_links?.map((r, idx) => ({
          id: idx,
          name: r.name || template?.name || 'Document',
          url: r.access_link,
        })) || [];

        // Add the main public link if different from recipient links
        if (result.public_link && !links.find(l => l.url === result.public_link)) {
          links.unshift({
            id: 'public',
            name: template?.name || 'Public Link',
            url: result.public_link,
          });
        }

        if (links.length > 0) {
          setGeneratedLinks(links);
          setShowLinkModal(true);
          return;
        }
      }

      navigate(`/setup/docflow?tab=documents`);
    } catch (error) {
      console.error('Error generating document:', error);
      toast.error(error?.response?.data?.message || error?.response?.data?.detail || 'Failed to generate document');
    } finally {
      setGenerating(false);
    }
  };

  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Link copied to clipboard!');
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      toast.success('Link copied!');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between max-w-4xl mx-auto">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/setup/docflow')}
              className="text-gray-600 hover:text-gray-900"
              data-testid="back-button"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-xl font-semibold text-gray-900">Generate Document</h1>
              <p className="text-sm text-gray-600 flex items-center gap-2">
                Template: {template?.name}
                {template?.version && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded-full bg-indigo-50 text-indigo-600 border border-indigo-100">
                    <GitBranch className="h-2.5 w-2.5" />
                    v{template.version}
                    {template.is_latest !== false && ' (Latest)'}
                  </span>
                )}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="space-y-6">

          {/* ─── Public Link Modal ─── */}
          {showLinkModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" data-testid="public-link-modal">
              <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full mx-4 overflow-hidden">
                {/* Modal Header */}
                <div className="bg-gradient-to-r from-indigo-500 to-purple-600 px-6 py-5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="bg-white/20 rounded-full p-2">
                        <CheckCircle className="h-6 w-6 text-white" />
                      </div>
                      <div>
                        <h2 className="text-lg font-semibold text-white">Document Link Generated</h2>
                        <p className="text-sm text-white/80">Share this link with your recipients</p>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setShowLinkModal(false);
                        navigate(`/setup/docflow?tab=documents`);
                      }}
                      className="text-white/70 hover:text-white transition-colors"
                      data-testid="close-link-modal"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                </div>

                {/* Modal Body */}
                <div className="px-6 py-5 space-y-4">
                  {generatedLinks.map((link, idx) => (
                    <div key={link.id || idx} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-gray-700">{link.name || 'Recipient'}</span>
                        <span className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded-full font-medium">Ready</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          readOnly
                          value={link.url}
                          className="flex-1 px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm text-gray-700 select-all"
                          data-testid={`public-link-url-${idx}`}
                          onClick={(e) => e.target.select()}
                        />
                        <button
                          onClick={() => copyToClipboard(link.url)}
                          className="px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-1.5 text-sm font-medium"
                          data-testid={`copy-link-btn-${idx}`}
                        >
                          <Copy className="h-4 w-4" />
                          Copy
                        </button>
                        <a
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-1.5 text-sm font-medium"
                          data-testid={`open-link-btn-${idx}`}
                        >
                          <ExternalLink className="h-4 w-4" />
                          Open
                        </a>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Modal Footer */}
                <div className="px-6 py-4 border-t border-gray-200 flex justify-between items-center bg-gray-50">
                  <button
                    onClick={() => {
                      setShowLinkModal(false);
                      setGeneratedLinks([]);
                    }}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                    data-testid="generate-another-btn"
                  >
                    Generate Another
                  </button>
                  <button
                    onClick={() => navigate(`/setup/docflow?tab=documents`)}
                    className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700"
                    data-testid="go-to-dashboard-btn"
                  >
                    Go to Dashboard
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Mode Selection */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Generation Mode</h2>

            {/* Version Selector */}
            {versionHistory.length > 1 && (
              <div className="mb-5 p-4 bg-indigo-50/50 rounded-lg border border-indigo-100">
                <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-1.5">
                  <GitBranch className="h-4 w-4 text-indigo-600" />
                  Select Version
                </label>
                <select
                  value={selectedVersionId || templateId}
                  onChange={(e) => setSelectedVersionId(e.target.value)}
                  className="w-full px-3 py-2 border border-indigo-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 bg-white"
                  data-testid="version-selector"
                >
                  {versionHistory.map(v => (
                    <option key={v.id} value={v.id}>
                      v{v.version}{v.is_latest ? ' (Latest)' : ''}{v.created_from_version ? ` — from v${v.created_from_version}` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className={`grid gap-4 ${isSalesforce ? 'grid-cols-1' : 'grid-cols-2'}`}>
              <button
                onClick={() => setFormData({ ...formData, setup_trigger: false })}
                data-testid="manual-send-mode"
                className={`p-4 rounded-lg border-2 transition ${
                  !formData.setup_trigger
                    ? 'border-indigo-500 bg-indigo-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <Send className="h-6 w-6 text-indigo-600 mb-2" />
                <h3 className="font-semibold text-gray-900 mb-1">Manual Send</h3>
                <p className="text-sm text-gray-600">Generate and send document now</p>
              </button>
              {!isSalesforce && (
                <button
                  onClick={() => setFormData({ ...formData, setup_trigger: true })}
                  data-testid="trigger-mode"
                  className={`p-4 rounded-lg border-2 transition ${
                    formData.setup_trigger
                      ? 'border-indigo-500 bg-indigo-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <Zap className="h-6 w-6 text-yellow-600 mb-2" />
                  <h3 className="font-semibold text-gray-900 mb-1">Setup Trigger</h3>
                  <p className="text-sm text-gray-600">Auto-send when conditions are met</p>
                </button>
              )}
            </div>
          </div>

          {formData.setup_trigger ? (
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Configure Automatic Trigger</h2>
              <TriggerConfiguration
                trigger={triggerConfig}
                onUpdate={setTriggerConfig}
              />
            </div>
          ) : (
            <>
              {/* ─── Delivery Method (Radio — single selection) ─── */}
              <div className="bg-white rounded-lg border border-gray-200 p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Delivery Method</h2>
                <div className="space-y-3">
                  <label
                    className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition ${
                      isEmailEnabled
                        ? 'border-indigo-300 bg-indigo-50/50'
                        : 'border-gray-200 hover:bg-gray-50'
                    }`}
                    data-testid="delivery-email-toggle"
                  >
                    <input
                      type="radio"
                      name="delivery_method"
                      checked={isEmailEnabled}
                      onChange={() => setDeliveryMethod('email')}
                      className="h-4 w-4 text-indigo-600"
                    />
                    <Mail className="h-5 w-5 text-gray-500" />
                    <div>
                      <p className="font-medium text-gray-900">Email</p>
                      <p className="text-sm text-gray-600">Send document link via email to recipients</p>
                    </div>
                  </label>
                  <label
                    className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition ${
                      isPublicLinkEnabled
                        ? 'border-indigo-300 bg-indigo-50/50'
                        : 'border-gray-200 hover:bg-gray-50'
                    }`}
                    data-testid="delivery-public-link-toggle"
                  >
                    <input
                      type="radio"
                      name="delivery_method"
                      checked={isPublicLinkEnabled}
                      onChange={() => setDeliveryMethod('public_link')}
                      className="h-4 w-4 text-indigo-600"
                    />
                    <LinkIcon className="h-5 w-5 text-gray-500" />
                    <div>
                      <p className="font-medium text-gray-900">Public Link</p>
                      <p className="text-sm text-gray-600">Generate a shareable link — multiple users can access independently</p>
                    </div>
                  </label>
                </div>
              </div>

              {/* ─── Recipients & Routing (Conditional) ─── */}
              <div
                className={`bg-white rounded-lg border border-gray-200 p-6 transition-opacity ${
                  !isEmailEnabled && !recipientDrafts.length ? 'opacity-50 pointer-events-none' : ''
                }`}
                data-testid="recipients-section"
              >
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">Recipients & Routing</h2>
                    {!isEmailEnabled && (
                      <p className="text-sm text-amber-600 mt-1" data-testid="recipients-helper-text">
                        Recipients are only required for email delivery. You can skip this section for public links.
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={addRecipient}
                    className="inline-flex items-center px-3 py-1.5 border border-transparent text-sm font-medium rounded-md text-indigo-700 bg-indigo-100 hover:bg-indigo-200"
                    data-testid="add-recipient-btn"
                  >
                    <Plus className="h-4 w-4 mr-1.5" />
                    Add Recipient
                  </button>
                </div>

                {/* Routing Mode */}
                <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center">
                    <ArrowUpDown className="h-4 w-4 mr-2 text-gray-400" />
                    Routing Mode
                  </label>
                  <div className="flex space-x-4">
                    {routingModes.map((mode) => (
                      <label key={mode.value} className="flex items-center">
                        <input
                          type="radio"
                          name="routing_mode"
                          value={mode.value}
                          checked={routingMode === mode.value}
                          onChange={(e) => setRoutingMode(e.target.value)}
                          className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300"
                        />
                        <span className="ml-2 text-sm text-gray-700">{mode.label}</span>
                      </label>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-gray-500">
                    {routingMode === 'sequential' 
                      ? 'Recipients receive and sign the document one after another in the specified order.' 
                      : 'All recipients receive the document at the same time and can sign in any order.'}
                  </p>
                </div>

                {/* Recipients List */}
                <div className="space-y-4">
                  {recipientDrafts.map((rd, index) => (
                    <div key={rd.id} className="p-4 border border-gray-200 rounded-lg bg-gray-50 relative group hover:border-indigo-300 transition-colors">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center">
                          <span className="flex items-center justify-center h-6 w-6 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold mr-2">
                            {rd.routing_order || index + 1}
                          </span>
                          <span className="text-sm font-medium text-gray-900">
                            {rd.placeholder_name || `Recipient ${index + 1}`}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeRecipient(rd.id)}
                          className="text-gray-400 hover:text-red-500 transition-colors"
                          title="Remove Recipient"
                          data-testid={`remove-recipient-${index}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                        <div>
                          <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Name</label>
                          <input
                            type="text"
                            placeholder="Full Name"
                            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                            value={rd.name}
                            onChange={(e) => updateRecipient(rd.id, { name: e.target.value })}
                            data-testid={`recipient-name-${index}`}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
                            Email
                            {!isEmailEnabled && (
                              <span className="text-gray-400 font-normal ml-1">(optional)</span>
                            )}
                          </label>
                          <input
                            type="email"
                            placeholder="email@example.com"
                            className={`w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm ${
                              !isEmailEnabled ? 'bg-gray-100 text-gray-500' : ''
                            }`}
                            value={rd.email}
                            onChange={(e) => updateRecipient(rd.id, { email: e.target.value })}
                            data-testid={`recipient-email-${index}`}
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Role</label>
                          <select
                            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                            value={rd.role_type || 'SIGN'}
                            onChange={(e) => updateRecipient(rd.id, { role_type: e.target.value })}
                            data-testid={`recipient-role-${index}`}
                          >
                            <option value="SIGN">Signer</option>
                            <option value="APPROVE_REJECT">Approver</option>
                            <option value="REVIEWER">Reviewer</option>
                            <option value="RECEIVE_COPY">Receive Copy</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Routing Order</label>
                          <input
                            type="number"
                            min="1"
                            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                            value={rd.routing_order}
                            onChange={(e) => updateRecipient(rd.id, { routing_order: parseInt(e.target.value) || 1 })}
                          />
                        </div>
                        <div className="flex items-end pb-2">
                          <label className="flex items-center">
                            <input
                              type="checkbox"
                              className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                              checked={rd.is_required}
                              onChange={(e) => updateRecipient(rd.id, { is_required: e.target.checked })}
                            />
                            <span className="ml-2 text-sm text-gray-700 font-medium">Required</span>
                          </label>
                        </div>
                      </div>
                      {/* Email Template Selector */}
                      {emailTemplatesLoaded && emailTemplates.length > 0 && isEmailEnabled && (
                        <div className="mt-4">
                          <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Email Template <span className="text-gray-400 normal-case font-normal">(optional)</span></label>
                          <select
                            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-white"
                            value={rd.email_template_id || ''}
                            onChange={(e) => updateRecipient(rd.id, { email_template_id: e.target.value })}
                            data-testid={`recipient-email-template-${index}`}
                          >
                            <option value="">Default (based on role)</option>
                            {emailTemplates.map(et => (
                              <option key={et.id} value={et.id}>{et.name} — {(et.template_type || '').replace(/_/g, ' ')}</option>
                            ))}
                          </select>
                        </div>
                      )}
                      {/* Assigned Components — only for Signers */}
                      {(rd.role_type || 'SIGN') === 'SIGN' && (
                      <div className="mt-4">
                        <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Assigned Components</label>
                        <div className="bg-white border border-gray-200 rounded-lg p-3 max-h-40 overflow-y-auto space-y-2">
                          {(!template?.field_placements || template.field_placements.length === 0) ? (
                            <div className="text-xs text-gray-400 italic">No components found in template.</div>
                          ) : (
                            template.field_placements
                              .filter(f => !['label', 'merge'].includes(f.type))
                              .map(f => (
                                <div key={f.id} className="flex items-center gap-2 text-sm">
                                  {(() => {
                                    const isAssignedToOther = recipientDrafts.some(otherRd => otherRd.id !== rd.id && (otherRd.assigned_field_ids || []).includes(f.id));
                                    return (
                                      <>
                                        <input
                                          type="checkbox"
                                          checked={(rd.assigned_field_ids || []).includes(f.id)}
                                          disabled={isAssignedToOther}
                                          onChange={(e) => {
                                            const currentIds = rd.assigned_field_ids || [];
                                            const nextIds = e.target.checked
                                              ? [...currentIds, f.id]
                                              : currentIds.filter(id => id !== f.id);
                                            updateRecipient(rd.id, { assigned_field_ids: nextIds });
                                          }}
                                          className="h-4 w-4 text-indigo-600 border-gray-300 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                                          title={isAssignedToOther ? "Already assigned to another recipient" : ""}
                                        />
                                        <span 
                                          className={`text-gray-700 ${isAssignedToOther ? 'opacity-50 cursor-not-allowed' : ''}`}
                                          title={isAssignedToOther ? "Already assigned to another recipient" : ""}
                                        >
                                          {f.label || f.name || f.type} (Page {f.page})
                                        </span>
                                      </>
                                    );
                                  })()}
                                </div>
                              ))
                          )}
                        </div>
                      </div>
                      )}
                    </div>
                  ))}

                  {recipientDrafts.length === 0 && (
                    <div className="text-center py-8 border-2 border-dashed border-gray-300 rounded-lg">
                      <p className="text-sm text-gray-500 mb-2">
                        {isPublicLinkOnly
                          ? 'No recipients needed for public link delivery.'
                          : 'No recipients added yet.'}
                      </p>
                      {!isPublicLinkOnly && (
                        <button
                          type="button"
                          onClick={addRecipient}
                          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700"
                          data-testid="add-first-recipient-btn"
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          Add First Recipient
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Document Expiry */}
              <div className="bg-white rounded-lg border border-gray-200 p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <CalendarClock className="h-5 w-5 text-gray-500" />
                  Document Expiry
                </h2>
                <div className="space-y-3">
                  <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
                    <input
                      type="radio"
                      name="expiry_mode"
                      value="no_expiry"
                      checked={expiryMode === 'no_expiry'}
                      onChange={() => { setExpiryMode('no_expiry'); setExpiryDate(''); }}
                      className="h-4 w-4 text-indigo-600"
                    />
                    <div>
                      <p className="font-medium text-gray-900">No Expiry</p>
                      <p className="text-sm text-gray-600">Document link never expires</p>
                    </div>
                  </label>
                  <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
                    <input
                      type="radio"
                      name="expiry_mode"
                      value="custom"
                      checked={expiryMode === 'custom'}
                      onChange={() => setExpiryMode('custom')}
                      className="h-4 w-4 text-indigo-600"
                    />
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">Set Expiry Date & Time</p>
                      <p className="text-sm text-gray-600">Document expires at the specified date/time</p>
                    </div>
                  </label>
                  {expiryMode === 'custom' && (
                    <div className="ml-7 mt-2">
                      <input
                        type="datetime-local"
                        value={expiryDate}
                        onChange={(e) => setExpiryDate(e.target.value)}
                        min={new Date().toISOString().slice(0, 16)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
                        data-testid="expiry-datetime-input"
                      />
                      {expiryDate && (
                        <p className="text-xs text-gray-500 mt-1">
                          Expires: {new Date(expiryDate).toLocaleString()}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Authentication Toggle */}
              <div className="bg-white rounded-lg border border-gray-200 p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Shield className="h-5 w-5 text-gray-500" />
                    <div>
                      <h2 className="text-lg font-semibold text-gray-900">Authentication (OTP)</h2>
                      <p className="text-sm text-gray-600 mt-0.5">
                        {requireAuth
                          ? 'Recipients must verify via OTP before accessing the document'
                          : 'Recipients can open the document directly without verification'}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={requireAuth}
                    onClick={() => setRequireAuth(prev => !prev)}
                    data-testid="auth-toggle"
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
                      requireAuth ? 'bg-indigo-600' : 'bg-gray-200'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        requireAuth ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
                {!requireAuth && (
                  <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700 flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-amber-500" />
                    <span>Authentication is disabled. Anyone with the link can access and sign the document without OTP verification.</span>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3">
            <button
              onClick={() => navigate('/setup/docflow')}
              className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
              data-testid="cancel-btn"
            >
              Cancel
            </button>
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2"
              data-testid="generate-send-btn"
            >
              {generating ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  Processing...
                </>
              ) : (
                <>
                  {formData.setup_trigger ? (
                    <>
                      <Zap className="h-4 w-4" />
                      Save Trigger
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4" />
                      Generate & Send
                    </>
                  )}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GenerateDocumentWizard;
