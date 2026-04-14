import axios from 'axios';

const API_URL = process.env.REACT_APP_BACKEND_URL;

// Helper to get auth headers
const getAuthHeaders = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

class ConsoleService {
  /**
   * Get all available objects for console
   */
  async getObjects(tenantId) {
    const response = await axios.get(
      `${API_URL}/api/console/objects?tenant_id=${tenantId}`,
      { headers: getAuthHeaders() }
    );
    return response.data;
  }

  /**
   * Get list view for any object dynamically
   * @param {string} objectApiName - lead, account, contact, opportunity, task, event
   * @param {string} tenantId 
   * @param {object} options - { limit, skip, search, sortBy, sortOrder }
   */
  async getListView(objectApiName, tenantId, options = {}) {
    const {
      limit = 50,
      skip = 0,
      search = null,
      sortBy = null,
      sortOrder = 'asc'
    } = options;

    let url = `${API_URL}/api/console/list-view/${objectApiName}?tenant_id=${tenantId}&limit=${limit}&skip=${skip}`;
    
    if (search) {
      url += `&search=${encodeURIComponent(search)}`;
    }
    if (sortBy) {
      url += `&sort_by=${sortBy}&sort_order=${sortOrder}`;
    }

    const response = await axios.get(url, { headers: getAuthHeaders() });
    return response.data;
  }

  /**
   * Get record by public ID (works for all objects)
   * @param {string} publicId - LEA-abc123, ACC-xyz789, etc.
   * @param {string} tenantId 
   */
  async getRecord(publicId, tenantId) {
    const response = await axios.get(
      `${API_URL}/api/console/record/${publicId}?tenant_id=${tenantId}`,
      { headers: getAuthHeaders() }
    );
    return response.data;
  }

  /**
   * Get object metadata
   */
  async getObjectMetadata(objectApiName) {
    const response = await axios.get(
      `${API_URL}/api/console/object-metadata/${objectApiName}`,
      { headers: getAuthHeaders() }
    );
    return response.data;
  }
}

export default new ConsoleService();
