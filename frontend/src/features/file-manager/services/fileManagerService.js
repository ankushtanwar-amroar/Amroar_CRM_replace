/**
 * File Manager API Service
 * Handles all API calls to the File Manager backend
 */

import axios from 'axios';

const API = process.env.REACT_APP_BACKEND_URL;

// Get authorization header
const getAuthHeader = () => ({
  Authorization: `Bearer ${localStorage.getItem('token')}`
});

// ============================================================================
// FILE OPERATIONS
// ============================================================================

export const fileManagerService = {
  // Status and initialization
  async getStatus() {
    const response = await axios.get(`${API}/api/files/status`, {
      headers: getAuthHeader()
    });
    return response.data;
  },

  async initialize() {
    const response = await axios.post(`${API}/api/files/init`, {}, {
      headers: getAuthHeader()
    });
    return response.data;
  },

  // File operations
  async listFiles(params = {}) {
    const response = await axios.get(`${API}/api/files`, {
      headers: getAuthHeader(),
      params
    });
    return response.data;
  },

  async getFile(fileId, includeVersions = false) {
    const response = await axios.get(`${API}/api/files/${fileId}`, {
      headers: getAuthHeader(),
      params: { include_versions: includeVersions }
    });
    return response.data;
  },

  async uploadFile(file, metadata = {}) {
    const formData = new FormData();
    formData.append('file', file);
    
    Object.entries(metadata).forEach(([key, value]) => {
      if (value !== null && value !== undefined) {
        formData.append(key, value);
      }
    });

    const response = await axios.post(`${API}/api/files/upload`, formData, {
      headers: {
        ...getAuthHeader(),
        'Content-Type': 'multipart/form-data'
      }
    });
    return response.data;
  },

  async updateFile(fileId, data) {
    const response = await axios.put(`${API}/api/files/${fileId}`, data, {
      headers: getAuthHeader()
    });
    return response.data;
  },

  async deleteFile(fileId, permanent = false) {
    const response = await axios.delete(`${API}/api/files/${fileId}`, {
      headers: getAuthHeader(),
      params: { permanent }
    });
    return response.data;
  },

  async getRecentFiles(limit = 10, myFiles = false) {
    const response = await axios.get(`${API}/api/files/recent`, {
      headers: getAuthHeader(),
      params: { limit, my_files: myFiles }
    });
    return response.data;
  },

  async getStarredFiles(limit = 50) {
    const response = await axios.get(`${API}/api/files/starred`, {
      headers: getAuthHeader(),
      params: { limit }
    });
    return response.data;
  },

  async starFile(fileId) {
    const response = await axios.post(`${API}/api/files/starred/${fileId}`, {}, {
      headers: getAuthHeader()
    });
    return response.data;
  },

  async unstarFile(fileId) {
    const response = await axios.delete(`${API}/api/files/starred/${fileId}`, {
      headers: getAuthHeader()
    });
    return response.data;
  },

  async getSharedWithMe(limit = 50) {
    const response = await axios.get(`${API}/api/files/shared-with-me`, {
      headers: getAuthHeader(),
      params: { limit }
    });
    return response.data;
  },

  async downloadFile(fileId, version = null) {
    const params = version ? { version } : {};
    const response = await axios.get(`${API}/api/files/download/${fileId}`, {
      headers: getAuthHeader(),
      params,
      responseType: 'blob'
    });
    return response;
  },

  async shareFileInternally(fileId, userIds) {
    const response = await axios.post(`${API}/api/files/${fileId}/share`, {}, {
      headers: getAuthHeader(),
      params: { user_ids: userIds }
    });
    return response.data;
  },

  // Version operations
  async uploadNewVersion(fileId, file) {
    const formData = new FormData();
    formData.append('file', file);

    const response = await axios.post(`${API}/api/files/${fileId}/versions`, formData, {
      headers: {
        ...getAuthHeader(),
        'Content-Type': 'multipart/form-data'
      }
    });
    return response.data;
  },

  async getFileVersions(fileId) {
    const response = await axios.get(`${API}/api/files/${fileId}/versions`, {
      headers: getAuthHeader()
    });
    return response.data;
  },

  // Record linking
  async linkToRecord(fileId, recordId, objectName, options = {}) {
    const params = new URLSearchParams({
      record_id: recordId,
      object_name: objectName,
      ...options
    });
    
    const response = await axios.post(`${API}/api/files/${fileId}/link?${params}`, {}, {
      headers: getAuthHeader()
    });
    return response.data;
  },

  async unlinkFromRecord(fileId, recordId) {
    const response = await axios.delete(`${API}/api/files/${fileId}/link/${recordId}`, {
      headers: getAuthHeader()
    });
    return response.data;
  },

  async getRecordFiles(objectName, recordId) {
    const response = await axios.get(`${API}/api/files/record/${objectName}/${recordId}`, {
      headers: getAuthHeader()
    });
    return response.data;
  },

  // AI suggestions
  async getAISuggestions(filename, mimeType) {
    const response = await axios.post(
      `${API}/api/files/ai/suggest?filename=${encodeURIComponent(filename)}&mime_type=${encodeURIComponent(mimeType)}`,
      {},
      { headers: getAuthHeader() }
    );
    return response.data;
  },

  // ============================================================================
  // LIBRARY OPERATIONS
  // ============================================================================

  async listLibraries() {
    const response = await axios.get(`${API}/api/files/libraries`, {
      headers: getAuthHeader()
    });
    return response.data;
  },

  async getLibrary(libraryId) {
    const response = await axios.get(`${API}/api/files/libraries/${libraryId}`, {
      headers: getAuthHeader()
    });
    return response.data;
  },

  async createLibrary(data) {
    const response = await axios.post(`${API}/api/files/libraries`, data, {
      headers: getAuthHeader()
    });
    return response.data;
  },

  // ============================================================================
  // FOLDER OPERATIONS
  // ============================================================================

  async listFolders(libraryId = null, parentFolderId = null) {
    const response = await axios.get(`${API}/api/files/folders`, {
      headers: getAuthHeader(),
      params: { library_id: libraryId, parent_folder_id: parentFolderId }
    });
    return response.data;
  },

  async getFolderTree(libraryId) {
    const response = await axios.get(`${API}/api/files/folders/tree/${libraryId}`, {
      headers: getAuthHeader()
    });
    return response.data;
  },

  async createFolder(data) {
    const response = await axios.post(`${API}/api/files/folders`, data, {
      headers: getAuthHeader()
    });
    return response.data;
  },

  // ============================================================================
  // PUBLIC LINKS
  // ============================================================================

  async createPublicLink(data) {
    const response = await axios.post(`${API}/api/files/public-links`, data, {
      headers: getAuthHeader()
    });
    return response.data;
  },

  async getFilePublicLinks(fileId) {
    const response = await axios.get(`${API}/api/files/public-links/file/${fileId}`, {
      headers: getAuthHeader()
    });
    return response.data;
  },

  // ============================================================================
  // AUDIT
  // ============================================================================

  async getAuditLog(params = {}) {
    const response = await axios.get(`${API}/api/files/audit`, {
      headers: getAuthHeader(),
      params
    });
    return response.data;
  },

  async getFileAuditHistory(fileId, limit = 50) {
    const response = await axios.get(`${API}/api/files/audit/file/${fileId}`, {
      headers: getAuthHeader(),
      params: { limit }
    });
    return response.data;
  },

  // ============================================================================
  // SETUP / CONFIGURATION
  // ============================================================================

  async getSettings() {
    const response = await axios.get(`${API}/api/files/setup/settings`, {
      headers: getAuthHeader()
    });
    return response.data;
  },

  async getCategories(objectName = null) {
    const response = await axios.get(`${API}/api/files/setup/categories`, {
      headers: getAuthHeader(),
      params: objectName ? { object_name: objectName } : {}
    });
    return response.data;
  },

  async createCategory(data) {
    const response = await axios.post(`${API}/api/files/setup/categories`, data, {
      headers: getAuthHeader()
    });
    return response.data;
  },

  async getTags() {
    const response = await axios.get(`${API}/api/files/setup/tags`, {
      headers: getAuthHeader()
    });
    return response.data;
  },

  async createTag(data) {
    const response = await axios.post(`${API}/api/files/setup/tags`, data, {
      headers: getAuthHeader()
    });
    return response.data;
  },

  async getSensitivities() {
    const response = await axios.get(`${API}/api/files/setup/sensitivities`, {
      headers: getAuthHeader()
    });
    return response.data;
  },

  async getFeatureFlags() {
    const response = await axios.get(`${API}/api/files/setup/feature-flags`, {
      headers: getAuthHeader()
    });
    return response.data;
  }
};

export default fileManagerService;
