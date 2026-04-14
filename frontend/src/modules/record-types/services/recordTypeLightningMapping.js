/**
 * Record Type Lightning Page Mapping Service
 * Handles Record Type → Lightning Page assignment
 * Separate module - does not modify existing Lightning Builder
 */
import axios from 'axios';

const API = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';

const getAuthHeader = () => {
  const token = localStorage.getItem('token');
  return { Authorization: `Bearer ${token}` };
};

export const recordTypeLightningService = {
  /**
   * Get all Lightning pages for an object from backend API
   */
  async getLightningPages(objectName) {
    try {
      const response = await axios.get(
        `${API}/api/lightning/layouts/${objectName}`,
        { headers: getAuthHeader() }
      );
      
      // Handle both single and multi-page responses
      if (response.data.layouts) {
        return response.data.layouts;
      }
      if (response.data.all_layouts) {
        return response.data.all_layouts;
      }
      if (response.data.layout) {
        return [response.data.layout];
      }
      return [];
    } catch (error) {
      console.error('Error fetching Lightning pages:', error);
      return [];
    }
  },

  /**
   * Get Lightning page for a record type
   * Returns Lightning page ID or null (use default)
   */
  getPageForRecordType(recordType) {
    if (!recordType) return null;
    
    if (recordType.page_assignment_type === 'advanced' && recordType.lightning_page_id) {
      return recordType.lightning_page_id;
    }
    
    return null; // Use default
  },

  /**
   * Runtime: Get Lightning page to render for a record
   * This is the main runtime integration point
   */
  async getPageForRecord(objectName, recordTypeId) {
    try {
      if (!recordTypeId) {
        // No record type specified, use default
        return { useDefault: true, pageId: null };
      }

      // Fetch record types for this object
      const response = await axios.get(
        `${API}/api/record-types-config/${objectName}`,
        { headers: getAuthHeader() }
      );
      const recordTypes = response.data;
      
      // Find the specific record type
      const recordType = recordTypes.find(rt => rt.id === recordTypeId);
      
      if (recordType && recordType.page_assignment_type === 'advanced' && recordType.lightning_page_id) {
        // Use assigned Lightning page
        return { useDefault: false, pageId: recordType.lightning_page_id };
      }
      
      // Use default
      return { useDefault: true, pageId: null };
    } catch (error) {
      console.error('Error determining Lightning page:', error);
      // On error, use default
      return { useDefault: true, pageId: null };
    }
  }
};

export default recordTypeLightningService;
