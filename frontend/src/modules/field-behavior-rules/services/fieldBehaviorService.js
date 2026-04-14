/**
 * Field Behavior Rules Service
 * Handles API calls for field behavior rules
 */

const API_BASE = process.env.REACT_APP_BACKEND_URL;

class FieldBehaviorService {
  /**
   * Get available fields for rule configuration
   * @param {string} objectName - Object name (e.g., 'account')
   * @param {number} depth - How deep to traverse lookups (default 2)
   * @returns {Promise<Array>} List of fields
   */
  async getAvailableFields(objectName, depth = 2) {
    const token = localStorage.getItem('token');
    const response = await fetch(
      `${API_BASE}/api/field-behavior/fields/${objectName}?depth=${depth}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    if (!response.ok) {
      throw new Error(`Failed to get fields: ${response.statusText}`);
    }
    
    const data = await response.json();
    return data.fields || [];
  }

  /**
   * Evaluate field behavior rules for a record
   * @param {Object} params
   * @param {string} params.objectName - Object name
   * @param {Object} params.recordData - Current record data
   * @param {Array} params.fieldRules - Field behavior rules to evaluate
   * @param {string} params.pageType - Page type: 'new', 'edit', or 'view'
   * @returns {Promise<Array>} Evaluation results for each field
   */
  async evaluateRules({ objectName, recordData, fieldRules, pageType = 'edit' }) {
    const token = localStorage.getItem('token');
    const response = await fetch(
      `${API_BASE}/api/field-behavior/evaluate`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          objectName,
          recordData,
          fieldRules,
          pageType
        })
      }
    );
    
    if (!response.ok) {
      throw new Error(`Failed to evaluate rules: ${response.statusText}`);
    }
    
    return response.json();
  }

  /**
   * Resolve parent lookup field values
   * @param {string} objectName - Object name
   * @param {string} recordId - Record ID
   * @param {Array<string>} parentReferences - List of parent field paths
   * @returns {Promise<Object>} Map of paths to values
   */
  async resolveParentLookups(objectName, recordId, parentReferences) {
    const token = localStorage.getItem('token');
    const response = await fetch(
      `${API_BASE}/api/field-behavior/resolve-parents`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          objectName,
          recordId,
          parentReferences
        })
      }
    );
    
    if (!response.ok) {
      throw new Error(`Failed to resolve parents: ${response.statusText}`);
    }
    
    const data = await response.json();
    return data.resolvedValues || {};
  }

  /**
   * Validate a formula expression
   * @param {string} formula - Formula expression
   * @param {string} objectName - Object name for context
   * @returns {Promise<Object>} Validation result
   */
  async validateFormula(formula, objectName) {
    const token = localStorage.getItem('token');
    const response = await fetch(
      `${API_BASE}/api/field-behavior/validate-formula?formula=${encodeURIComponent(formula)}&object_name=${objectName}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    if (!response.ok) {
      throw new Error(`Failed to validate formula: ${response.statusText}`);
    }
    
    return response.json();
  }
}

const fieldBehaviorService = new FieldBehaviorService();
export default fieldBehaviorService;
