import axios from 'axios';

const API_URL = process.env.REACT_APP_BACKEND_URL;

class FieldManagementService {
  // Get auth headers
  getHeaders() {
    const token = localStorage.getItem('token');
    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
  }

  // ============ LOOKUP FIELDS ============
  
  async getLookupFields(objectName) {
    const response = await axios.get(
      `${API_URL}/api/fields/lookup/${objectName}`,
      { headers: this.getHeaders() }
    );
    return response.data;
  }

  async getLookupField(objectName, fieldId) {
    const response = await axios.get(
      `${API_URL}/api/fields/lookup/${objectName}/${fieldId}`,
      { headers: this.getHeaders() }
    );
    return response.data;
  }

  async createLookupField(objectName, fieldData) {
    const response = await axios.post(
      `${API_URL}/api/fields/lookup/${objectName}`,
      fieldData,
      { headers: this.getHeaders() }
    );
    return response.data;
  }

  async updateLookupField(objectName, fieldId, fieldData) {
    const response = await axios.put(
      `${API_URL}/api/fields/lookup/${objectName}/${fieldId}`,
      fieldData,
      { headers: this.getHeaders() }
    );
    return response.data;
  }

  async deleteLookupField(objectName, fieldId) {
    const response = await axios.delete(
      `${API_URL}/api/fields/lookup/${objectName}/${fieldId}`,
      { headers: this.getHeaders() }
    );
    return response.data;
  }

  async searchLookupRecords(searchRequest) {
    const response = await axios.post(
      `${API_URL}/api/fields/lookup/search`,
      searchRequest,
      { headers: this.getHeaders() }
    );
    return response.data;
  }

  // ============ ROLLUP FIELDS ============
  
  async getRollupFields(objectName) {
    const response = await axios.get(
      `${API_URL}/api/fields/rollup/${objectName}`,
      { headers: this.getHeaders() }
    );
    return response.data;
  }

  async getRollupField(objectName, fieldId) {
    const response = await axios.get(
      `${API_URL}/api/fields/rollup/${objectName}/${fieldId}`,
      { headers: this.getHeaders() }
    );
    return response.data;
  }

  async createRollupField(objectName, fieldData) {
    const response = await axios.post(
      `${API_URL}/api/fields/rollup/${objectName}`,
      fieldData,
      { headers: this.getHeaders() }
    );
    return response.data;
  }

  async updateRollupField(objectName, fieldId, fieldData) {
    const response = await axios.put(
      `${API_URL}/api/fields/rollup/${objectName}/${fieldId}`,
      fieldData,
      { headers: this.getHeaders() }
    );
    return response.data;
  }

  async deleteRollupField(objectName, fieldId) {
    const response = await axios.delete(
      `${API_URL}/api/fields/rollup/${objectName}/${fieldId}`,
      { headers: this.getHeaders() }
    );
    return response.data;
  }

  async recalculateRollup(objectName, fieldId, parentId = null) {
    const response = await axios.post(
      `${API_URL}/api/fields/rollup/${objectName}/${fieldId}/recalculate`,
      { parent_id: parentId },
      { headers: this.getHeaders() }
    );
    return response.data;
  }

  async getChildRelationships(objectName) {
    const response = await axios.get(
      `${API_URL}/api/fields/rollup/${objectName}/relationships/children`,
      { headers: this.getHeaders() }
    );
    return response.data;
  }

  // Scheduled recalculation
  async scheduleRollupRecalculation(objectName, fieldId, cronExpression = null) {
    const response = await axios.post(
      `${API_URL}/api/fields/rollup/${objectName}/${fieldId}/schedule`,
      {},
      { 
        headers: this.getHeaders(),
        params: cronExpression ? { cron_expression: cronExpression } : {}
      }
    );
    return response.data;
  }

  async unscheduleRollupRecalculation(objectName, fieldId) {
    const response = await axios.delete(
      `${API_URL}/api/fields/rollup/${objectName}/${fieldId}/schedule`,
      { headers: this.getHeaders() }
    );
    return response.data;
  }

  async triggerRollupRecalculationNow(objectName, fieldId, parentId = null) {
    const response = await axios.post(
      `${API_URL}/api/fields/rollup/${objectName}/${fieldId}/trigger-recalc`,
      parentId ? { parent_id: parentId } : {},
      { headers: this.getHeaders() }
    );
    return response.data;
  }

  async getRollupSchedulerStatus() {
    const response = await axios.get(
      `${API_URL}/api/fields/rollup/scheduler/status`,
      { headers: this.getHeaders() }
    );
    return response.data;
  }

  // Formula filter validation
  async validateRollupFilterFormula(formula) {
    const response = await axios.post(
      `${API_URL}/api/fields/rollup/validate-filter-formula`,
      {},
      { 
        headers: this.getHeaders(),
        params: { formula }
      }
    );
    return response.data;
  }

  // ============ FORMULA FIELDS ============
  
  async getFormulaFields(objectName) {
    const response = await axios.get(
      `${API_URL}/api/fields/formula/${objectName}`,
      { headers: this.getHeaders() }
    );
    return response.data;
  }

  async getFormulaField(objectName, fieldId) {
    const response = await axios.get(
      `${API_URL}/api/fields/formula/${objectName}/${fieldId}`,
      { headers: this.getHeaders() }
    );
    return response.data;
  }

  async createFormulaField(objectName, fieldData) {
    const response = await axios.post(
      `${API_URL}/api/fields/formula/${objectName}`,
      fieldData,
      { headers: this.getHeaders() }
    );
    return response.data;
  }

  async updateFormulaField(objectName, fieldId, fieldData) {
    const response = await axios.put(
      `${API_URL}/api/fields/formula/${objectName}/${fieldId}`,
      fieldData,
      { headers: this.getHeaders() }
    );
    return response.data;
  }

  async deleteFormulaField(objectName, fieldId) {
    const response = await axios.delete(
      `${API_URL}/api/fields/formula/${objectName}/${fieldId}`,
      { headers: this.getHeaders() }
    );
    return response.data;
  }

  async getFormulaFunctions() {
    const response = await axios.get(
      `${API_URL}/api/fields/formula/functions`,
      { headers: this.getHeaders() }
    );
    return response.data;
  }

  async validateFormula(validationRequest) {
    const response = await axios.post(
      `${API_URL}/api/fields/formula/validate`,
      validationRequest,
      { headers: this.getHeaders() }
    );
    return response.data;
  }

  async testFormula(testRequest) {
    const response = await axios.post(
      `${API_URL}/api/fields/formula/test`,
      testRequest,
      { headers: this.getHeaders() }
    );
    return response.data;
  }

  // ============ GENERAL FIELD MANAGEMENT ============
  
  async getAllAdvancedFields(objectName, fieldType = null) {
    let url = `${API_URL}/api/fields/advanced/${objectName}`;
    if (fieldType) {
      url += `?field_type=${fieldType}`;
    }
    const response = await axios.get(url, { headers: this.getHeaders() });
    return response.data;
  }

  async getCompleteFields(objectName) {
    const response = await axios.get(
      `${API_URL}/api/fields/complete/${objectName}`,
      { headers: this.getHeaders() }
    );
    return response.data;
  }

  async getAvailableObjects() {
    const response = await axios.get(
      `${API_URL}/api/fields/objects`,
      { headers: this.getHeaders() }
    );
    return response.data;
  }

  async getObjectRelationships(objectName) {
    const response = await axios.get(
      `${API_URL}/api/fields/${objectName}/relationships`,
      { headers: this.getHeaders() }
    );
    return response.data;
  }

  async getObjectLayouts(objectName) {
    const response = await axios.get(
      `${API_URL}/api/fields/${objectName}/layouts`,
      { headers: this.getHeaders() }
    );
    return response.data;
  }

  async validateApiKey(objectName, apiKey, excludeFieldId = null) {
    let url = `${API_URL}/api/fields/validate-api-key?object_name=${objectName}&api_key=${apiKey}`;
    if (excludeFieldId) {
      url += `&exclude_field_id=${excludeFieldId}`;
    }
    const response = await axios.get(url, { headers: this.getHeaders() });
    return response.data;
  }

  async getFieldTypes() {
    const response = await axios.get(
      `${API_URL}/api/fields/types`,
      { headers: this.getHeaders() }
    );
    return response.data;
  }
}

export default new FieldManagementService();
