/**
 * Page Assignment Service
 * Handles Lightning Page assignments for New/Detail views
 * Separate from Lightning Builder - this decides WHEN a page is used
 */
import axios from 'axios';

const API = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';

const getAuthHeader = () => {
  const token = localStorage.getItem('token');
  return { Authorization: `Bearer ${token}` };
};

export const pageAssignmentService = {
  /**
   * Get page assignments for an object
   */
  async getAssignments(objectName) {
    try {
      const response = await axios.get(
        `${API}/api/page-assignments/${objectName}`,
        { headers: getAuthHeader() }
      );
      return response.data;
    } catch (error) {
      console.error('Error fetching page assignments:', error);
      throw error;
    }
  },

  /**
   * Save page assignments for an object
   */
  async saveAssignments(objectName, assignments) {
    try {
      const response = await axios.put(
        `${API}/api/page-assignments/${objectName}`,
        assignments,
        { headers: getAuthHeader() }
      );
      return response.data;
    } catch (error) {
      console.error('Error saving page assignments:', error);
      throw error;
    }
  },

  /**
   * Resolve which page to use at runtime
   * @param {string} objectName - The object API name
   * @param {string} context - "new" or "detail"
   * @param {string|null} recordTypeId - Optional record type ID
   * @returns {Promise<{page_id: string|null, resolution_source: string}>}
   */
  async resolvePageForContext(objectName, context, recordTypeId = null) {
    try {
      const params = new URLSearchParams({ context });
      if (recordTypeId) {
        params.append('record_type_id', recordTypeId);
      }
      
      const response = await axios.get(
        `${API}/api/page-assignments/${objectName}/resolve?${params.toString()}`,
        { headers: getAuthHeader() }
      );
      return response.data;
    } catch (error) {
      console.error('Error resolving page assignment:', error);
      // Return default on error
      return { page_id: null, resolution_source: 'error' };
    }
  },

  /**
   * Client-side resolution (for performance - avoid API call when possible)
   * Uses cached assignments data
   */
  resolvePageFromCache(assignments, context, recordTypeId = null) {
    if (!assignments || !assignments.has_assignments) {
      return { page_id: null, resolution_source: 'none' };
    }

    let resolved_page_id = null;
    let resolution_source = 'none';

    // Step 1: Check Record Type override if provided
    if (recordTypeId && assignments.record_type_overrides) {
      const override = assignments.record_type_overrides.find(
        o => o.record_type_id === recordTypeId
      );
      
      if (override) {
        if (context === 'new' && override.new_page_id) {
          resolved_page_id = override.new_page_id;
          resolution_source = 'record_type_override';
        } else if (context === 'detail' && override.detail_page_id) {
          resolved_page_id = override.detail_page_id;
          resolution_source = 'record_type_override';
        }
      }
    }

    // Step 2: Fall back to Global Default
    if (!resolved_page_id) {
      if (context === 'new' && assignments.default_new_page_id) {
        resolved_page_id = assignments.default_new_page_id;
        resolution_source = 'global_default';
      } else if (context === 'detail' && assignments.default_detail_page_id) {
        resolved_page_id = assignments.default_detail_page_id;
        resolution_source = 'global_default';
      }
    }

    return { page_id: resolved_page_id, resolution_source };
  }
};

export default pageAssignmentService;
