/**
 * File Manager Admin Service
 * API calls for the 9-tab admin configuration interface
 */

import axios from 'axios';

const API = process.env.REACT_APP_BACKEND_URL;

const getAuthHeader = () => ({
  Authorization: `Bearer ${localStorage.getItem('token')}`
});

export const fileManagerAdminService = {
  // ============================================================================
  // TAB 1 - GENERAL SETTINGS
  // ============================================================================
  
  async getGeneralSettings() {
    const response = await axios.get(`${API}/api/files/admin/general`, {
      headers: getAuthHeader()
    });
    return response.data;
  },

  async updateGeneralSettings(settings) {
    const response = await axios.put(`${API}/api/files/admin/general`, settings, {
      headers: getAuthHeader()
    });
    return response.data;
  },

  // ============================================================================
  // TAB 2 - FILE TYPES & CATEGORIES
  // ============================================================================

  async getCategories() {
    const response = await axios.get(`${API}/api/files/admin/categories`, {
      headers: getAuthHeader()
    });
    return response.data;
  },

  async createCategory(data) {
    const response = await axios.post(`${API}/api/files/admin/categories`, data, {
      headers: getAuthHeader()
    });
    return response.data;
  },

  async updateCategory(categoryId, data) {
    const response = await axios.put(`${API}/api/files/admin/categories/${categoryId}`, data, {
      headers: getAuthHeader()
    });
    return response.data;
  },

  async deleteCategory(categoryId) {
    const response = await axios.delete(`${API}/api/files/admin/categories/${categoryId}`, {
      headers: getAuthHeader()
    });
    return response.data;
  },

  // ============================================================================
  // TAB 3 - TAGS & METADATA RULES
  // ============================================================================

  async getTagsConfig() {
    const response = await axios.get(`${API}/api/files/admin/tags`, {
      headers: getAuthHeader()
    });
    return response.data;
  },

  async createTag(data) {
    const response = await axios.post(`${API}/api/files/admin/tags`, data, {
      headers: getAuthHeader()
    });
    return response.data;
  },

  async updateTag(tagId, data) {
    const response = await axios.put(`${API}/api/files/admin/tags/${tagId}`, data, {
      headers: getAuthHeader()
    });
    return response.data;
  },

  async deleteTag(tagId) {
    const response = await axios.delete(`${API}/api/files/admin/tags/${tagId}`, {
      headers: getAuthHeader()
    });
    return response.data;
  },

  async updateTagSettings(settings) {
    const response = await axios.put(`${API}/api/files/admin/tags/settings`, settings, {
      headers: getAuthHeader()
    });
    return response.data;
  },

  // ============================================================================
  // TAB 4 - FOLDERS & LIBRARIES
  // ============================================================================

  async getLibraries() {
    const response = await axios.get(`${API}/api/files/admin/libraries`, {
      headers: getAuthHeader()
    });
    return response.data;
  },

  async createLibrary(data) {
    const response = await axios.post(`${API}/api/files/admin/libraries`, data, {
      headers: getAuthHeader()
    });
    return response.data;
  },

  async updateLibrary(libraryId, data) {
    const response = await axios.put(`${API}/api/files/admin/libraries/${libraryId}`, data, {
      headers: getAuthHeader()
    });
    return response.data;
  },

  async deleteLibrary(libraryId) {
    const response = await axios.delete(`${API}/api/files/admin/libraries/${libraryId}`, {
      headers: getAuthHeader()
    });
    return response.data;
  },

  async getLibraryMembers(libraryId) {
    const response = await axios.get(`${API}/api/files/admin/libraries/${libraryId}/members`, {
      headers: getAuthHeader()
    });
    return response.data;
  },

  async addLibraryMember(libraryId, data) {
    const response = await axios.post(`${API}/api/files/admin/libraries/${libraryId}/members`, data, {
      headers: getAuthHeader()
    });
    return response.data;
  },

  // ============================================================================
  // TAB 5 - SHARING & PUBLIC LINKS
  // ============================================================================

  async getSharingSettings() {
    const response = await axios.get(`${API}/api/files/admin/sharing`, {
      headers: getAuthHeader()
    });
    return response.data;
  },

  async updateSharingSettings(settings) {
    const response = await axios.put(`${API}/api/files/admin/sharing`, settings, {
      headers: getAuthHeader()
    });
    return response.data;
  },

  // ============================================================================
  // TAB 6 - STORAGE & CONNECTORS
  // ============================================================================

  async getStorageConfig() {
    const response = await axios.get(`${API}/api/files/admin/storage`, {
      headers: getAuthHeader()
    });
    return response.data;
  },

  async createStorageConnector(data) {
    const response = await axios.post(`${API}/api/files/admin/storage/connectors`, data, {
      headers: getAuthHeader()
    });
    return response.data;
  },

  async updateStorageConnector(connectorId, data) {
    const response = await axios.put(`${API}/api/files/admin/storage/connectors/${connectorId}`, data, {
      headers: getAuthHeader()
    });
    return response.data;
  },

  async deleteStorageConnector(connectorId) {
    const response = await axios.delete(`${API}/api/files/admin/storage/connectors/${connectorId}`, {
      headers: getAuthHeader()
    });
    return response.data;
  },

  async updateStorageSettings(settings) {
    const response = await axios.put(`${API}/api/files/admin/storage/settings`, settings, {
      headers: getAuthHeader()
    });
    return response.data;
  },

  // ============================================================================
  // TAB 7 - AUTOMATION & ENDPOINTS
  // ============================================================================

  async getAutomationRules() {
    const response = await axios.get(`${API}/api/files/admin/automation/rules`, {
      headers: getAuthHeader()
    });
    return response.data;
  },

  async createAutomationRule(data) {
    const response = await axios.post(`${API}/api/files/admin/automation/rules`, data, {
      headers: getAuthHeader()
    });
    return response.data;
  },

  async updateAutomationRule(ruleId, data) {
    const response = await axios.put(`${API}/api/files/admin/automation/rules/${ruleId}`, data, {
      headers: getAuthHeader()
    });
    return response.data;
  },

  async deleteAutomationRule(ruleId) {
    const response = await axios.delete(`${API}/api/files/admin/automation/rules/${ruleId}`, {
      headers: getAuthHeader()
    });
    return response.data;
  },

  async createDefaultAutomationTemplates() {
    const response = await axios.post(`${API}/api/files/admin/automation/templates`, {}, {
      headers: getAuthHeader()
    });
    return response.data;
  },

  // ============================================================================
  // TAB 8 - AI ASSISTANT
  // ============================================================================

  async getAISettings() {
    const response = await axios.get(`${API}/api/files/admin/ai`, {
      headers: getAuthHeader()
    });
    return response.data;
  },

  async updateAISettings(settings) {
    const response = await axios.put(`${API}/api/files/admin/ai`, settings, {
      headers: getAuthHeader()
    });
    return response.data;
  },

  // ============================================================================
  // TAB 9 - AUDIT & RETENTION
  // ============================================================================

  async getAuditSettings() {
    const response = await axios.get(`${API}/api/files/admin/audit`, {
      headers: getAuthHeader()
    });
    return response.data;
  },

  async updateAuditSettings(settings) {
    const response = await axios.put(`${API}/api/files/admin/audit`, settings, {
      headers: getAuthHeader()
    });
    return response.data;
  },

  async getRetentionPolicies() {
    const response = await axios.get(`${API}/api/files/admin/retention/policies`, {
      headers: getAuthHeader()
    });
    return response.data;
  },

  async createRetentionPolicy(data) {
    const response = await axios.post(`${API}/api/files/admin/retention/policies`, data, {
      headers: getAuthHeader()
    });
    return response.data;
  },

  async updateRetentionPolicy(policyId, data) {
    const response = await axios.put(`${API}/api/files/admin/retention/policies/${policyId}`, data, {
      headers: getAuthHeader()
    });
    return response.data;
  },

  async deleteRetentionPolicy(policyId) {
    const response = await axios.delete(`${API}/api/files/admin/retention/policies/${policyId}`, {
      headers: getAuthHeader()
    });
    return response.data;
  },

  async setLegalHold(fileId, enabled, reason = null) {
    const response = await axios.post(`${API}/api/files/admin/files/${fileId}/legal-hold`, {
      enabled,
      reason
    }, {
      headers: getAuthHeader()
    });
    return response.data;
  },

  async exportAuditLogs(filters = {}) {
    const response = await axios.post(`${API}/api/files/admin/audit/export`, filters, {
      headers: getAuthHeader()
    });
    return response.data;
  }
};

export default fileManagerAdminService;
