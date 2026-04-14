import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

// Core objects that always use the enhanced layout resolution system
// Custom objects are automatically included if they have a Lightning layout
const CORE_RESOLVED_LAYOUT_OBJECTS = ['lead', 'opportunity', 'contact', 'account', 'task', 'event', 'emailmessage'];

class LightningLayoutService {
  /**
   * Resolve layout for an object using the new Phase 2B system.
   * Uses the resolve endpoint which implements the fallback chain:
   * custom → system → default_template → legacy → empty
   * 
   * @param {string} objectName - Object API name (e.g., 'lead', 'opportunity')
   * @param {string} pageType - 'detail' or 'new'
   * @param {string} token - Auth token
   * @returns {Promise<{layout: object, source: string, has_custom_layout: boolean}>}
   */
  async resolveLayout(objectName, pageType = 'detail', token) {
    try {
      // Add cache-busting parameter to prevent stale data
      const timestamp = Date.now();
      const response = await axios.get(
        `${BACKEND_URL}/api/lightning/resolve/${objectName}?page_type=${pageType}&_t=${timestamp}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Cache-Control': 'no-cache'
          }
        }
      );
      return response.data;
    } catch (error) {
      console.error('Error resolving layout:', error);
      // Return fallback structure on error
      return {
        layout: null,
        source: 'error',
        has_custom_layout: false
      };
    }
  }

  /**
   * Check if an object uses the resolved layout system
   * Now returns true for ALL objects - custom objects also get enhanced UI
   */
  usesResolvedLayouts(objectName) {
    // All objects now use the resolved layout system
    // This ensures custom objects get the same enhanced UI as core objects
    return true;
  }
  
  /**
   * Check if an object is a core/system object
   */
  isCoreObject(objectName) {
    return CORE_RESOLVED_LAYOUT_OBJECTS.includes(objectName?.toLowerCase());
  }

  /**
   * Get Lightning layout for a specific object (legacy method)
   */
  async getLayoutForObject(objectName, token) {
    try {
      const response = await axios.get(
        `${BACKEND_URL}/api/lightning/layouts/${objectName}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );
      return response.data;
    } catch (error) {
      console.error('Error fetching Lightning layout:', error);
      throw error;
    }
  }

  /**
   * Create a new Lightning layout
   */
  async createLayout(layoutData, token) {
    try {
      const response = await axios.post(
        `${BACKEND_URL}/api/lightning/layouts`,
        layoutData,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );
      return response.data;
    } catch (error) {
      console.error('Error creating Lightning layout:', error);
      throw error;
    }
  }

  /**
   * Update an existing Lightning layout
   */
  async updateLayout(layoutId, updateData, token) {
    try {
      const response = await axios.put(
        `${BACKEND_URL}/api/lightning/layouts/${layoutId}`,
        updateData,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );
      return response.data;
    } catch (error) {
      console.error('Error updating Lightning layout:', error);
      throw error;
    }
  }

  /**
   * Delete a Lightning layout
   */
  async deleteLayout(layoutId, token) {
    try {
      const response = await axios.delete(
        `${BACKEND_URL}/api/lightning/layouts/${layoutId}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );
      return response.data;
    } catch (error) {
      console.error('Error deleting Lightning layout:', error);
      throw error;
    }
  }

  /**
   * Get layout template
   */
  async getTemplate(templateType, objectName) {
    try {
      const response = await axios.get(
        `${BACKEND_URL}/api/lightning/templates/${templateType}?object_name=${objectName}`
      );
      return response.data;
    } catch (error) {
      console.error('Error fetching template:', error);
      throw error;
    }
  }

  /**
   * List all layouts for tenant
   */
  async listLayouts(objectName, token) {
    try {
      const params = objectName ? `?object_name=${objectName}` : '';
      const response = await axios.get(
        `${BACKEND_URL}/api/lightning/layouts${params}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );
      return response.data;
    } catch (error) {
      console.error('Error listing Lightning layouts:', error);
      throw error;
    }
  }

  /**
   * Get a specific layout by ID
   */
  async getLayoutById(objectName, layoutId, token) {
    try {
      const response = await axios.get(
        `${BACKEND_URL}/api/lightning/layouts/${objectName}/${layoutId}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );
      return response.data;
    } catch (error) {
      console.error('Error fetching Lightning layout by ID:', error);
      throw error;
    }
  }
}

export default new LightningLayoutService();
