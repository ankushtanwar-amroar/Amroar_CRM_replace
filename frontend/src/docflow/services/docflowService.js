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
    const message = error.response?.data?.detail || error.response?.data?.message || error.message || 'Request failed';
    return Promise.reject(new Error(message));
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

  async deleteTemplate(templateId) {
    return api.delete(`/docflow/templates/${templateId}`);
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

  async getDocuments(params = {}) {
    return api.get('/docflow/documents', { params });
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
