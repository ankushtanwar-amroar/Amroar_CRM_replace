import axios from 'axios';

const API_URL = process.env.REACT_APP_BACKEND_URL;

// Create axios instance with defaults
const api = axios.create({
  baseURL: `${API_URL}/api`,
  headers: { 'Content-Type': 'application/json' }
});

// Auth interceptor
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor — unwrap data
api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const data = error.response?.data;
    const message = data?.detail || data?.message || error.message || 'Request failed';
    const err = new Error(message);
    // Preserve backend's structured error payload (list of specific validation
    // reasons) so callers can surface the real cause, not just the top-level
    // "Processing failed." label. Also attach HTTP status for finer-grained
    // error UX in the caller.
    err.status = error.response?.status;
    err.errors = Array.isArray(data?.errors) ? data.errors : [];
    err.payload = data;
    return Promise.reject(err);
  }
);

export const docflowService = {
  // ===== Template APIs =====

  async getTemplates(search = '', status = '', page = 1, limit = 20) {
    const params = { page, limit };
    if (search) params.search = search;
    if (status) params.status = status;
    return api.get('/docflow/templates', { params });
  },

  async getLatestActiveTemplates(search = '', page = 1, limit = 20) {
    const params = { page, limit };
    if (search) params.search = search;
    return api.get('/docflow/templates-active-latest', { params });
  },

  async getTemplate(templateId) {
    return api.get(`/docflow/templates/${templateId}`);
  },

  async createTemplate(data) {
    return api.post('/docflow/templates', data);
  },

  async updateTemplate(templateId, data) {
    return api.put(`/docflow/templates/${templateId}`, data);
  },

  async updateTemplateWebhook(templateId, webhookConfig) {
    return api.patch(`/docflow/templates/${templateId}/webhook`, { webhook_config: webhookConfig });
  },

  async deleteTemplate(templateId) {
    return api.delete(`/docflow/templates/${templateId}`);
  },

  // Phase 81.54 — Incoming interlinks: list every other template whose
  // field_placements declare a linked_to.field_id pointing at the given
  // field on this template. Used by the Visual Builder to surface an
  // "Linked from" panel even when the link is owned by Template B.
  async getIncomingLinks(fieldId, excludeTemplateId = null) {
    const params = { field_id: fieldId };
    if (excludeTemplateId) params.exclude_template_id = excludeTemplateId;
    return api.get('/docflow/templates-incoming-links', { params });
  },

  // Phase 81.55 — Bulk variant: returns a field-id-keyed map of incoming
  // links for every field on the given template in one round-trip. Used
  // by the Visual Builder canvas to colorize/count link badges per field.
  async getAllIncomingLinks(templateId) {
    return api.get(`/docflow/templates/${templateId}/all-incoming-links`);
  },

  // Phase 81.54 — Surgically patch a single field's linked_to config on a
  // template the author may not own end-to-end. Pass {linked_to: null} to
  // remove the link. Pass a partial object to merge.
  async updateFieldLinkedTo(templateId, fieldId, linkedTo) {
    return api.patch(
      `/docflow/templates/${templateId}/fields/${fieldId}/linked-to`,
      { linked_to: linkedTo },
    );
  },

  // ===== Version Control =====

  async getTemplateVersions(templateId) {
    return api.get(`/docflow/templates/${templateId}/versions`);
  },

  async createNewVersion(sourceTemplateId, updateData = null) {
    return api.post(`/docflow/templates/${sourceTemplateId}/create-version`, {
      update_data: updateData,
    });
  },

  async cloneTemplate(templateId) {
    return api.post(`/docflow/templates/${templateId}/clone`);
  },

  async migrateVersions() {
    return api.post('/docflow/templates/migrate-versions');
  },

  // ===== PDF Upload =====

  async uploadTemplatePDF(file, name, description = '', templateType = 'contract') {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('name', name);
    formData.append('description', description);
    formData.append('template_type', templateType);
    return api.post('/docflow/templates/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  },

  // Phase 81.76 — Replace the source PDF/DOC/DOCX of an EXISTING template.
  async replaceTemplateFile(templateId, file) {
    const formData = new FormData();
    formData.append('file', file);
    return api.post(`/docflow/templates/${templateId}/replace-file`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  },

  async getTemplatePDF(templateId) {
    const response = await axios.get(`${API_URL}/api/docflow/templates/${templateId}/pdf`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      responseType: 'blob'
    });
    return response.data;
  },

  // ===== Field Placements =====

  async getFieldPlacements(templateId) {
    return api.get(`/docflow/templates/${templateId}/field-placements`);
  },

  async updateFieldPlacements(templateId, fieldPlacements) {
    return api.put(`/docflow/templates/${templateId}/field-placements`, { field_placements: fieldPlacements });
  },

  // ===== AI Generation =====

  async aiGenerateTemplate(prompt, industry = 'General', selectedDocType = null, basePrompt = '') {
    return api.post('/docflow/templates/ai-generate', {
      prompt,
      industry,
      selected_doc_type: selectedDocType,
      base_prompt: basePrompt
    });
  },

  async aiVisualAssistant(instruction, fields, pageCount) {
    return api.post('/docflow/templates/visual-assistant', { instruction, fields, page_count: pageCount });
  },

  // ===== Parse Fields =====

  async parseTemplateFields(templateId) {
    return api.post(`/docflow/templates/${templateId}/parse-fields`);
  },

  // ===== Validation =====

  async validateTemplate(templateId) {
    return api.post(`/docflow/templates/${templateId}/validate`);
  },

  async validateTemplateObject(templateBody) {
    return api.post('/docflow/templates/validate-object', templateBody);
  },

  // ===== Logs =====

  async getTemplateLogs(templateId, eventType = 'all') {
    const params = {};
    if (eventType && eventType !== 'all') params.event_type = eventType;
    return api.get(`/docflow/templates/${templateId}/logs`, { params });
  },

  // ===== CRM Integration =====

  async getCrmObjects() {
    try {
      return await api.get('/docflow/crm/objects');
    } catch {
      const data = await api.get('/docflow/trigger-objects');
      return { objects: Array.isArray(data) ? data : data.objects || [] };
    }
  },

  async getCrmObjectFields(objectName) {
    try {
      return await api.get(`/docflow/crm/objects/${objectName}/fields`);
    } catch {
      return api.get(`/docflow/trigger-objects/${objectName}/fields`);
    }
  },

  async getCrmRecords(objectName, search = '', limit = 20) {
    return api.get(`/docflow/crm/objects/${objectName}/records`, {
      params: { search: search || undefined, limit }
    });
  },

  // ===== Salesforce Provider Integration (via CRM Sync) =====

  async getSalesforceConnections() {
    return api.get('/docflow/crm/salesforce-connections');
  },

  async testProviderConnection(connectionId) {
    return api.post(`/docflow/crm/test-provider/${connectionId}`);
  },

  async getProviderObjects(connectionId) {
    return api.get(`/docflow/crm/provider/${connectionId}/objects`);
  },

  async getProviderObjectFields(connectionId, objectName) {
    return api.get(`/docflow/crm/provider/${connectionId}/objects/${objectName}/fields`);
  },

  async getSalesforceFields(objectName) {
    return api.get('/docflow/salesforce/fields', { params: { sobject: objectName } });
  },

  // ===== Document APIs =====

  async generateDocument(data) {
    return api.post('/docflow/documents/generate', data);
  },

  async getDocuments(params = {}, config = {}) {
    // Phase 81.14 — accept an optional axios config (e.g. AbortController
    // signal) so callers can cancel rapid successive requests when the
    // user changes page-size / filter quickly.
    return api.get('/docflow/documents', { params, ...config });
  },

  async getDocumentDetail(documentId) {
    // Phase 79 — full detail payload for the new document detail page.
    const resp = await api.get(`/docflow/documents/${documentId}/detail`);
    return resp;
  },

  async resendRecipientEmail(documentId, recipientId) {
    // Phase 79 — resend signing email to a single recipient.
    return api.post(`/docflow/documents/${documentId}/recipients/${recipientId}/resend`);
  },

  async voidRecipient(documentId, recipientId) {
    // Phase 80 — block a recipient's access + send cancellation email.
    return api.post(`/docflow/documents/${documentId}/recipients/${recipientId}/void`);
  },

  async unvoidRecipient(documentId, recipientId) {
    // Phase 80 — restore a voided recipient + send fresh signing email.
    return api.post(`/docflow/documents/${documentId}/recipients/${recipientId}/unvoid`);
  },

  // Phase 81.67 — Full document void (cascades to all active recipients).
  async voidDocument(documentId, reason) {
    return api.post(`/docflow/documents/${documentId}/void`, { reason: reason || null });
  },

  // Phase 81.42 — Package RUN recipient actions (resend / void / unvoid).
  async resendRunRecipientEmail(runId, recipientId) {
    return api.post(`/docflow/packages/runs/${runId}/recipients/${recipientId}/resend`);
  },

  async voidRunRecipient(runId, recipientId) {
    return api.post(`/docflow/packages/runs/${runId}/recipients/${recipientId}/void`);
  },

  async unvoidRunRecipient(runId, recipientId) {
    return api.post(`/docflow/packages/runs/${runId}/recipients/${recipientId}/unvoid`);
  },


  // Phase 81 — SMS verification (public, recipient-scoped via token).
  async smsSendOtp(token) {
    const resp = await fetch(`${API_URL}/api/docflow/documents/public/${token}/sms/send-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to send code');
    }
    return resp.json();
  },

  async smsVerifyOtp(token, code) {
    const resp = await fetch(`${API_URL}/api/docflow/documents/public/${token}/sms/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.detail || 'Verification failed');
    }
    return resp.json();
  },

  // Phase 81 — Package SMS verification (token in URL identifies the recipient
  // on the package run). Mirrors the document-flow pair above.
  async packageSmsSendOtp(token) {
    const resp = await fetch(`${API_URL}/api/docflow/packages/public/${token}/sms/send-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to send code');
    }
    return resp.json();
  },

  async packageSmsVerifyOtp(token, code) {
    const resp = await fetch(`${API_URL}/api/docflow/packages/public/${token}/sms/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.detail || 'Verification failed');
    }
    return resp.json();
  },

  async downloadDocument(documentId, version = 'signed') {
    const token = localStorage.getItem('token');
    const resp = await fetch(`${API_URL}/api/docflow/documents/${documentId}/download/${version}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.detail || `Failed to download ${version} document`);
    }
    const blob = await resp.blob();
    // Trigger browser download
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `document-${documentId}-${version}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return blob;
  },

  // ===== Generate Links API (Salesforce → DocFlow) =====

  async generateLinks(data) {
    return api.post('/v1/documents/generate-links', data);
  },

  // ===== Email History =====

  async getEmailHistory(params = {}) {
    return api.get('/docflow/email-history', { params });
  },

  // ===== ClueBot AI =====

  async cluebotPolicyStatus() {
    return api.get('/docflow/cluebot/policy-status');
  },

  async cluebotChat(message, context = {}) {
    return api.post('/docflow/cluebot/chat', { message, context });
  },

  async cluebotValidate(templateData) {
    return api.post('/docflow/cluebot/validate', { template_data: templateData });
  },

  async cluebotGenerateEmail(templateName, recipientName, documentUrl) {
    return api.post('/docflow/cluebot/email', {
      template_name: templateName,
      recipient_name: recipientName,
      document_url: documentUrl
    });
  },

  // ── Content Blocks API ─────────────────────────

  async getContentBlocks(templateId) {
    return api.get(`/docflow/templates/${templateId}/content-blocks`);
  },

  async updateContentBlocks(templateId, contentBlocks) {
    return api.put(`/docflow/templates/${templateId}/content-blocks`, { content_blocks: contentBlocks });
  },

  async convertToBlocks(templateId) {
    return api.post(`/docflow/templates/${templateId}/convert-to-blocks`);
  },

  // ── Connection API ─────────────────────────
  async testSalesforceConnection(connectionId) {
    return api.post('/docflow/crm/test-salesforce', { connection_id: connectionId });
  },

  async testCrmConnection(provider = 'internal', connectionId = null) {
    return api.post('/docflow/crm/test-connection', { provider, connection_id: connectionId });
  },

  // ===== Package APIs (Phase 2 — Reusable Packages) =====

  async createPackage(data) {
    return api.post('/docflow/packages', data);
  },

  async sendPackage(packageId, data) {
    return api.post(`/docflow/packages/${packageId}/send`, data);
  },

  async getPackageRuns(packageId) {
    return api.get(`/docflow/packages/${packageId}/runs`);
  },

  async getPackageRun(packageId, runId) {
    return api.get(`/docflow/packages/${packageId}/runs/${runId}`);
  },

  async getPackageLogs(packageId) {
    return api.get(`/docflow/packages/${packageId}/logs`);
  },

  async updatePackageDocuments(packageId, documents) {
    return api.put(`/docflow/packages/${packageId}/documents`, { documents });
  },

  async voidBlueprintPackage(packageId, reason) {
    return api.post(`/docflow/packages/${packageId}/void-package`, { reason });
  },

  async getPackages(params = {}) {
    return api.get('/docflow/packages', { params });
  },

  async getPackage(packageId, includeDocuments = false) {
    return api.get(`/docflow/packages/${packageId}`, { params: { include_documents: includeDocuments } });
  },

  async getPackageRoutingStatus(packageId) {
    return api.get(`/docflow/packages/${packageId}/routing-status`);
  },

  async getPackageAudit(packageId) {
    return api.get(`/docflow/packages/${packageId}/audit`);
  },

  async voidPackage(packageId, reason) {
    return api.post(`/docflow/packages/${packageId}/void`, { reason });
  },

  async updatePackageWebhook(packageId, webhookConfig) {
    return api.put(`/docflow/packages/${packageId}/webhook`, webhookConfig);
  },

  async getPackageSubmissions(packageId) {
    return api.get(`/docflow/packages/${packageId}/submissions`);
  },

  // ===== Package Virtual Builder APIs =====

  async getPackageBuilderFields(packageId, templateId) {
    return api.get(`/docflow/packages/${packageId}/builder/${templateId}/fields`);
  },

  async savePackageBuilderFields(packageId, templateId, fieldPlacements) {
    return api.put(`/docflow/packages/${packageId}/builder/${templateId}/fields`, {
      field_placements: fieldPlacements,
    });
  },

  // ===== SMS Templates APIs (Phase 81.81) =====

  async listSmsTemplates() {
    return api.get('/docflow/sms-templates');
  },

  async getSmsTemplate(templateId) {
    return api.get(`/docflow/sms-templates/${templateId}`);
  },

  async getDefaultSmsTemplate() {
    return api.get('/docflow/sms-templates/default');
  },

  async getSmsTemplateVariables() {
    return api.get('/docflow/sms-templates/variables');
  },

  async createSmsTemplate(payload) {
    return api.post('/docflow/sms-templates', payload);
  },

  async updateSmsTemplate(templateId, payload) {
    return api.put(`/docflow/sms-templates/${templateId}`, payload);
  },

  async deleteSmsTemplate(templateId) {
    return api.delete(`/docflow/sms-templates/${templateId}`);
  },

  async setDefaultSmsTemplate(templateId) {
    return api.post(`/docflow/sms-templates/${templateId}/set-default`);
  },

  async previewSmsTemplate(content) {
    return api.post('/docflow/sms-templates/preview', { content });
  },

  // ===== Content Configuration APIs (Phase 81.80) =====

  async getContentConfig() {
    return api.get('/docflow/content-config');
  },

  async getContentSection(sectionType) {
    return api.get(`/docflow/content-config/${sectionType}`);
  },

  async updateContentSection(sectionType, content) {
    return api.put(`/docflow/content-config/${sectionType}`, { content });
  },

  async resetContentSection(sectionType) {
    return api.post(`/docflow/content-config/${sectionType}/reset`);
  },

  async getContentDefaults() {
    return api.get('/docflow/content-config/_defaults/all');
  },

  // Public — no auth required. Resolves tenant from token / package_id / document_id.
  async getPublicContentConfig({ token, packageId, documentId } = {}) {
    const params = new URLSearchParams();
    if (token) params.set('token', token);
    if (packageId) params.set('package_id', packageId);
    if (documentId) params.set('document_id', documentId);
    const qs = params.toString();
    const url = `${API_URL}/api/docflow/public/content-config${qs ? `?${qs}` : ''}`;
    const resp = await fetch(url);
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to load content config');
    }
    return resp.json();
  },

  // ===== Submission Download APIs (Phase 81.77) =====

  async listSubmissionDocuments(packageId, runId, submissionId) {
    return api.get(`/docflow/packages/${packageId}/runs/${runId}/submissions/${submissionId}/documents`);
  },

  async downloadSubmissionDocument(packageId, runId, submissionId, docId) {
    const token = localStorage.getItem('token');
    const resp = await fetch(
      `${API_URL}/api/docflow/packages/${packageId}/runs/${runId}/submissions/${submissionId}/documents/${docId}/download`,
      { headers: { 'Authorization': `Bearer ${token}` } }
    );
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to download document');
    }
    return resp.blob();
  },

  async downloadSubmissionCombined(packageId, runId, submissionId) {
    const token = localStorage.getItem('token');
    const resp = await fetch(
      `${API_URL}/api/docflow/packages/${packageId}/runs/${runId}/submissions/${submissionId}/download/combined`,
      { headers: { 'Authorization': `Bearer ${token}` } }
    );
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to download combined PDF');
    }
    return resp.blob();
  },

  // ===== Package Output APIs =====

  async downloadCombinedPdf(packageId) {
    const token = localStorage.getItem('token');
    const resp = await fetch(`${API_URL}/api/docflow/packages/${packageId}/combined-pdf`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to download combined PDF');
    }
    return resp.blob();
  },

  async downloadCertificate(packageId) {
    const token = localStorage.getItem('token');
    const resp = await fetch(`${API_URL}/api/docflow/packages/${packageId}/certificate`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to download certificate');
    }
    return resp.blob();
  },

  // ===== Package Template APIs =====

  async getPackageTemplates() {
    return api.get('/docflow/package-templates');
  },

  async getPackageTemplate(templateId) {
    return api.get(`/docflow/package-templates/${templateId}`);
  },

  async createPackageTemplate(data) {
    return api.post('/docflow/package-templates', data);
  },

  async updatePackageTemplate(templateId, data) {
    return api.put(`/docflow/package-templates/${templateId}`, data);
  },

  async deletePackageTemplate(templateId) {
    return api.delete(`/docflow/package-templates/${templateId}`);
  },

  async deletePackage(packageId) {
    const resp = await api.delete(`/docflow/packages/${packageId}`);
    return resp.data;
  },
};

export default docflowService;
