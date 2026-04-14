import axios from 'axios';

const API_URL = process.env.REACT_APP_BACKEND_URL;

// Helper to get auth headers
const getAuthHeaders = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

class PlatformService {
  async initializePlatform(tenantId) {
    const response = await axios.post(`${API_URL}/api/crm-platform/initialize`, {
      tenant_id: tenantId
    }, {
      headers: getAuthHeaders()
    });
    return response.data;
  }

  async getObjectTypes(tenantId) {
    const response = await axios.get(
      `${API_URL}/api/crm-platform/object-types?tenant_id=${tenantId}`,
      { headers: getAuthHeaders() }
    );
    return response.data;
  }

  async getObjectType(objectTypeId, tenantId) {
    const response = await axios.get(
      `${API_URL}/api/crm-platform/object-types/${objectTypeId}?tenant_id=${tenantId}`,
      { headers: getAuthHeaders() }
    );
    return response.data;
  }

  async getRecords(objectType, tenantId, limit = 50, skip = 0) {
    const response = await axios.get(
      `${API_URL}/api/crm-platform/records/${objectType}?tenant_id=${tenantId}&limit=${limit}&skip=${skip}`,
      { headers: getAuthHeaders() }
    );
    return response.data;
  }

  async getRecord(objectType, recordId, tenantId) {
    const response = await axios.get(
      `${API_URL}/api/crm-platform/records/${objectType}/${recordId}?tenant_id=${tenantId}`,
      { headers: getAuthHeaders() }
    );
    return response.data;
  }

  async resolvePublicId(publicId, tenantId) {
    const response = await axios.get(
      `${API_URL}/api/crm-platform/resolve/${publicId}?tenant_id=${tenantId}`,
      { headers: getAuthHeaders() }
    );
    return response.data;
  }

  async createGlobalId(objectType, legacyId, tenantId) {
    const response = await axios.post(`${API_URL}/api/crm-platform/global-id`, {
      object_type: objectType,
      legacy_id: legacyId,
      tenant_id: tenantId
    }, {
      headers: getAuthHeaders()
    });
    return response.data;
  }
}

export default new PlatformService();
