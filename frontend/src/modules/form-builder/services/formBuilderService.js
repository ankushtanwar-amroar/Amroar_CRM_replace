/**
 * Form Builder API Service
 * Handles all API calls for Form Builder features
 */
import axios from 'axios';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';
const API = `${API_URL}/api/form-builder`;

// Get auth token
const getAuthHeader = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

// ============= FORM CRUD =============

export const createForm = async (formData) => {
  const response = await axios.post(`${API}/forms`, formData, {
    headers: getAuthHeader()
  });
  return response.data;
};

export const getForms = async (queryParams = '') => {
  const response = await axios.get(`${API}/forms${queryParams}`, {
    headers: getAuthHeader()
  });
  return response.data;
};

export const getForm = async (formId) => {
  const response = await axios.get(`${API}/forms/${formId}`, {
    headers: getAuthHeader()
  });
  return response.data;
};

export const updateForm = async (formId, formData) => {
  const response = await axios.put(`${API}/forms/${formId}`, formData, {
    headers: getAuthHeader()
  });
  return response.data;
};

export const deleteForm = async (formId) => {
  const response = await axios.delete(`${API}/forms/${formId}`, {
    headers: getAuthHeader()
  });
  return response.data;
};

export const publishForm = async (formId) => {
  const response = await axios.post(`${API}/forms/${formId}/publish`, {}, {
    headers: getAuthHeader()
  });
  return response.data;
};

export const duplicateForm = async (formId) => {
  const response = await axios.post(`${API}/forms/${formId}/duplicate`, {}, {
    headers: getAuthHeader()
  });
  return response.data;
};

// ============= FORM SUBMISSIONS =============

export const submitForm = async (formId, submissionData) => {
  const response = await axios.post(`${API}/forms/${formId}/submit`, submissionData);
  return response.data;
};

export const getFormSubmissions = async (formId, queryParams = '') => {
  const response = await axios.get(`${API}/forms/${formId}/submissions${queryParams}`, {
    headers: getAuthHeader()
  });
  return response.data;
};

export const exportSubmissions = async (formId) => {
  const response = await axios.get(`${API}/forms/${formId}/submissions/export`, {
    headers: getAuthHeader()
  });
  return response.data;
};

// ============= AI FEATURES =============

export const generateFormWithAI = async (prompt, formContext = {}) => {
  const response = await axios.post(`${API}/ai/generate-form`, {
    prompt,
    form_context: formContext,
    // Backward compatibility
    existing_fields: formContext.currentFields || []
  }, {
    headers: getAuthHeader()
  });
  return response.data;
};

export const analyzeForm = async (formId) => {
  const response = await axios.post(`${API}/ai/analyze-form?form_id=${formId}`, {}, {
    headers: getAuthHeader()
  });
  return response.data;
};

export const textToSpeech = async (text) => {
  const response = await axios.post(`${API}/ai/text-to-speech?text=${encodeURIComponent(text)}`, {}, {
    headers: getAuthHeader()
  });
  return response.data;
};

export const speechToText = async (audioBase64, existingForm = null) => {
  const response = await axios.post(`${API}/ai/speech-to-text`, {
    audio_base64: audioBase64,
    existing_form: existingForm
  }, {
    headers: getAuthHeader()
  });
  return response.data;
};


// ============= CRM PROPERTY MAPPING =============

export const getCRMModules = async () => {
  const response = await axios.get(`${API}/crm/modules`, {
    headers: getAuthHeader()
  });
  return response.data;
};

export const getModuleProperties = async (moduleName) => {
  const response = await axios.get(`${API}/crm/modules/${moduleName}/properties`, {
    headers: getAuthHeader()
  });
  return response.data;
};

export const autoMapProperties = async (fields, crmModule, properties) => {
  const response = await axios.post(`${API}/ai/auto-map-properties`, {
    fields,
    crm_module: crmModule,
    properties
  }, {
    headers: getAuthHeader()
  });
  return response.data;
};

export const submitFormWithCRM = async (formId, submissionData) => {
  const response = await axios.post(`${API}/forms/${formId}/submit-with-crm`, submissionData);
  return response.data;
};

// ============= AI FORM CREATOR =============

export const processAIFormRequest = async (userInput, metadata) => {
  const response = await axios.post(`${API}/ai/process-form-request`, {
    user_input: userInput,
    metadata
  }, {
    headers: getAuthHeader()
  });
  return response.data;
};

