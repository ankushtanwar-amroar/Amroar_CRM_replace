/**
 * Dependent Picklist Service
 * API calls for managing dependent picklist configurations
 * Updated: Dependencies are now GLOBAL (object-level), not per record type
 */
import axios from 'axios';

const API_URL = process.env.REACT_APP_BACKEND_URL;

class DependentPicklistService {
  getHeaders() {
    const token = localStorage.getItem('token');
    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
  }

  // ============================================
  // Admin Configuration APIs (GLOBAL - Object Level)
  // ============================================

  /**
   * Create a new dependent picklist configuration (GLOBAL for object)
   */
  async createConfig(objectName, data) {
    const response = await axios.post(
      `${API_URL}/api/dependent-picklists/${objectName}`,
      data,
      { headers: this.getHeaders() }
    );
    return response.data;
  }

  /**
   * Get all dependent picklist configurations for an object (GLOBAL)
   */
  async getConfigsForObject(objectName, activeOnly = false) {
    const response = await axios.get(
      `${API_URL}/api/dependent-picklists/${objectName}`,
      { 
        headers: this.getHeaders(),
        params: { active_only: activeOnly }
      }
    );
    return response.data;
  }

  /**
   * Get a specific configuration
   */
  async getConfig(objectName, configId) {
    const response = await axios.get(
      `${API_URL}/api/dependent-picklists/${objectName}/config/${configId}`,
      { headers: this.getHeaders() }
    );
    return response.data;
  }

  /**
   * Update a dependent picklist configuration
   */
  async updateConfig(objectName, configId, data) {
    const response = await axios.put(
      `${API_URL}/api/dependent-picklists/${objectName}/config/${configId}`,
      data,
      { headers: this.getHeaders() }
    );
    return response.data;
  }

  /**
   * Delete a dependent picklist configuration
   */
  async deleteConfig(objectName, configId) {
    const response = await axios.delete(
      `${API_URL}/api/dependent-picklists/${objectName}/config/${configId}`,
      { headers: this.getHeaders() }
    );
    return response.data;
  }

  // ============================================
  // Runtime APIs (for form rendering) - GLOBAL
  // ============================================

  /**
   * Get all dependencies for an object (GLOBAL - used on form load)
   */
  async getRuntimeDependencies(objectName) {
    const response = await axios.get(
      `${API_URL}/api/dependent-picklists/${objectName}/runtime`,
      { headers: this.getHeaders() }
    );
    return response.data;
  }

  /**
   * Get filtered dependent values for a controlling value (GLOBAL)
   */
  async getFilteredValues(objectName, controllingFieldApi, controllingValue, dependentFieldApi) {
    const response = await axios.post(
      `${API_URL}/api/dependent-picklists/${objectName}/filter`,
      {},
      { 
        headers: this.getHeaders(),
        params: {
          controlling_field_api: controllingFieldApi,
          controlling_value: controllingValue,
          dependent_field_api: dependentFieldApi
        }
      }
    );
    return response.data;
  }

  /**
   * Validate a dependent value (GLOBAL)
   */
  async validateDependentValue(objectName, controllingFieldApi, controllingValue, dependentFieldApi, dependentValue) {
    const response = await axios.post(
      `${API_URL}/api/dependent-picklists/${objectName}/validate`,
      {},
      { 
        headers: this.getHeaders(),
        params: {
          controlling_field_api: controllingFieldApi,
          controlling_value: controllingValue,
          dependent_field_api: dependentFieldApi,
          dependent_value: dependentValue
        }
      }
    );
    return response.data;
  }

  // ============================================
  // Migration APIs
  // ============================================

  /**
   * Migrate record-type-based configs to global for an object
   */
  async migrateToGlobal(objectName) {
    const response = await axios.post(
      `${API_URL}/api/dependent-picklists/${objectName}/migrate-to-global`,
      {},
      { headers: this.getHeaders() }
    );
    return response.data;
  }
}

export default new DependentPicklistService();
