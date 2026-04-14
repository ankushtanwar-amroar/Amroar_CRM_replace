/**
 * Survey Builder V2 API Service
 * All API calls for survey operations
 */

const API_URL = process.env.REACT_APP_BACKEND_URL;

const getAuthHeaders = () => ({
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${localStorage.getItem('token')}`,
});

const surveyService = {
  // ====== SURVEY CRUD ======
  async createSurvey(surveyData) {
    const response = await fetch(`${API_URL}/api/survey-v2/surveys`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(surveyData),
    });
    return response.json();
  },

  async listSurveys(page = 1, limit = 20, status = null, search = null) {
    let url = `${API_URL}/api/survey-v2/surveys?page=${page}&limit=${limit}`;
    if (status) url += `&status=${status}`;
    if (search) url += `&search=${search}`;
    
    const response = await fetch(url, {
      headers: getAuthHeaders(),
    });
    return response.json();
  },

  async getSurvey(surveyId) {
    const response = await fetch(`${API_URL}/api/survey-v2/surveys/${surveyId}`, {
      headers: getAuthHeaders(),
    });
    return response.json();
  },

  async updateSurvey(surveyId, updates) {
    const response = await fetch(`${API_URL}/api/survey-v2/surveys/${surveyId}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(updates),
    });
    return response.json();
  },

  async deleteSurvey(surveyId) {
    const response = await fetch(`${API_URL}/api/survey-v2/surveys/${surveyId}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    return response.json();
  },

  async duplicateSurvey(surveyId) {
    const response = await fetch(`${API_URL}/api/survey-v2/surveys/${surveyId}/duplicate`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    return response.json();
  },

  // ====== PUBLISHING ======
  async publishSurvey(surveyId) {
    const response = await fetch(`${API_URL}/api/survey-v2/surveys/${surveyId}/publish`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    return response.json();
  },

  async pauseSurvey(surveyId) {
    const response = await fetch(`${API_URL}/api/survey-v2/surveys/${surveyId}/pause`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    return response.json();
  },

  async closeSurvey(surveyId) {
    const response = await fetch(`${API_URL}/api/survey-v2/surveys/${surveyId}/close`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    return response.json();
  },

  async toggleSurveyExpiry(surveyId) {
    const response = await fetch(`${API_URL}/api/survey-v2/surveys/${surveyId}/toggle-expiry`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    return response.json();
  },

  // ====== AI FEATURES ======
  async aiCommand(command, surveyId = null) {
    const response = await fetch(`${API_URL}/api/survey-v2/ai/command`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ command, survey_id: surveyId }),
    });
    return response.json();
  },

  async aiGenerateSurvey(prompt) {
    const response = await fetch(`${API_URL}/api/survey-v2/ai/generate-survey`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ prompt }),
    });
    return response.json();
  },

  async aiAnalyzeResponses(surveyId) {
    const response = await fetch(`${API_URL}/api/survey-v2/surveys/${surveyId}/ai/analyze`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    return response.json();
  },

  async aiSuggestLogic(surveyId) {
    const response = await fetch(`${API_URL}/api/survey-v2/surveys/${surveyId}/ai/suggest-logic`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    return response.json();
  },

  async aiGeneratePDFReport(surveyId) {
    const response = await fetch(`${API_URL}/api/survey-v2/surveys/${surveyId}/ai/pdf-report`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    return response.json();
  },

  // ====== RESPONSES ======
  async submitResponse(surveyId, responseData) {
    const response = await fetch(`${API_URL}/api/survey-v2/surveys/${surveyId}/responses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(responseData),
    });
    return response.json();
  },

  async getResponses(surveyId, filters = {}) {
    let url = `${API_URL}/api/survey-v2/surveys/${surveyId}/responses?`;
    if (filters.completed !== undefined) url += `completed=${filters.completed}&`;
    if (filters.date_from) url += `date_from=${filters.date_from}&`;
    if (filters.date_to) url += `date_to=${filters.date_to}&`;
    
    const response = await fetch(url, {
      headers: getAuthHeaders(),
    });
    return response.json();
  },

  async getSingleResponse(surveyId, responseId) {
    const response = await fetch(`${API_URL}/api/survey-v2/surveys/${surveyId}/responses/${responseId}`, {
      headers: getAuthHeaders(),
    });
    return response.json();
  },

  async getResponse(surveyId, responseId) {
    const response = await fetch(`${API_URL}/api/survey-v2/surveys/${surveyId}/responses/${responseId}`, {
      headers: getAuthHeaders(),
    });
    return response.json();
  },

  async deleteResponse(surveyId, responseId) {
    const response = await fetch(`${API_URL}/api/survey-v2/surveys/${surveyId}/responses/${responseId}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    return response.json();
  },

  // ====== FILE UPLOAD ======
  async uploadFile(file) {
    const formData = new FormData();
    formData.append('file', file);
    
    const response = await fetch(`${API_URL}/api/survey-v2/upload-file`, {
      method: 'POST',
      body: formData,
    });
    return response.json();
  },

  // ====== ANALYTICS ======
  async getAnalytics(surveyId) {
    const response = await fetch(`${API_URL}/api/survey-v2/surveys/${surveyId}/analytics`, {
      headers: getAuthHeaders(),
    });
    return response.json();
  },

  async getDropOffAnalysis(surveyId) {
    const response = await fetch(`${API_URL}/api/survey-v2/surveys/${surveyId}/drop-off-analysis`, {
      headers: getAuthHeaders(),
    });
    return response.json();
  },

  // ====== EXPORT ======
  async exportToCSV(surveyId) {
    const response = await fetch(`${API_URL}/api/survey-v2/surveys/${surveyId}/export/csv`, {
      headers: getAuthHeaders(),
    });
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `survey_${surveyId}_responses.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  },

  // ====== DISTRIBUTION ======
  async generateQRCode(surveyId) {
    const response = await fetch(`${API_URL}/api/survey-v2/surveys/${surveyId}/qr-code`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    return response.json();
  },

  async sendEmailInvitations(surveyId, recipients, message) {
    const response = await fetch(`${API_URL}/api/survey-v2/surveys/${surveyId}/send-email`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ recipients, message }),
    });
    return response.json();
  },

  async sendSMSInvitations(surveyId, phoneNumbers, message) {
    const response = await fetch(`${API_URL}/api/survey-v2/surveys/${surveyId}/send-sms`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ phone_numbers: phoneNumbers, message }),
    });
    return response.json();
  },

  async sendWhatsAppInvitations(surveyId, phoneNumbers, message) {
    const response = await fetch(`${API_URL}/api/survey-v2/surveys/${surveyId}/send-whatsapp`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ phone_numbers: phoneNumbers, message }),
    });
    return response.json();
  },

  async getEmbedCode(surveyId, width = '100%', height = '600px') {
    const response = await fetch(`${API_URL}/api/survey-v2/surveys/${surveyId}/embed-code?width=${width}&height=${height}`, {
      headers: getAuthHeaders(),
    });
    return response.json();
  },

  // ====== PUBLIC ======
  async getPublicSurvey(publicLink) {
    const response = await fetch(`${API_URL}/api/survey-v2/public/surveys/${publicLink}`);
    return response.json();
  },
};

export default surveyService;
