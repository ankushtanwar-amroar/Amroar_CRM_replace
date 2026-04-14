import axios from 'axios';

const API = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';

const getAuthHeader = () => {
  const token = localStorage.getItem('token');
  return { Authorization: `Bearer ${token}` };
};

export const recordTypesService = {
  async getRecordTypes(objectName) {
    const response = await axios.get(`${API}/api/record-types-config/${objectName}`, {
      headers: getAuthHeader()
    });
    return response.data;
  },

  async createRecordType(objectName, data) {
    const response = await axios.post(`${API}/api/record-types-config/${objectName}`, data, {
      headers: getAuthHeader()
    });
    return response.data;
  },

  async updateRecordType(objectName, id, data) {
    const response = await axios.put(`${API}/api/record-types-config/${objectName}/${id}`, data, {
      headers: getAuthHeader()
    });
    return response.data;
  },

  async deleteRecordType(objectName, id) {
    const response = await axios.delete(`${API}/api/record-types-config/${objectName}/${id}`, {
      headers: getAuthHeader()
    });
    return response.data;
  },

  async getObjectFields(objectName) {
    const response = await axios.get(`${API}/api/objects/${objectName}`, {
      headers: getAuthHeader()
    });
    return response.data;
  },

  // Get picklist fields for an object
  getPicklistFields(objectFields) {
    if (!objectFields?.fields) return [];
    // Handle both array and object formats for fields
    const fieldsArray = Array.isArray(objectFields.fields) 
      ? objectFields.fields 
      : Object.entries(objectFields.fields).map(([key, field]) => ({ ...field, key }));
    
    return fieldsArray.filter(f => 
      f.type === 'picklist' || f.type === 'multipicklist' || f.type === 'select'
    );
  }
};

export default recordTypesService;