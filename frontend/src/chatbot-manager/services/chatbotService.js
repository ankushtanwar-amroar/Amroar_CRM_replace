import axios from 'axios';

const API ="https://sign-flow-fix-1.preview.emergentagent.com";

export const chatbotService = {
  // Chatbots
  listBots: async () => {
    const response = await axios.get(`${API}/api/chatbot-manager/bots`);
    return response.data;
  },

  getBot: async (botId) => {
    const response = await axios.get(`${API}/api/chatbot-manager/bots/${botId}`);
    return response.data;
  },

  createBot: async (botData) => {
    const response = await axios.post(`${API}/api/chatbot-manager/bots`, botData);
    return response.data;
  },

  updateBot: async (botId, botData) => {
    const response = await axios.put(`${API}/api/chatbot-manager/bots/${botId}`, botData);
    return response.data;
  },

  deleteBot: async (botId) => {
    const response = await axios.delete(`${API}/api/chatbot-manager/bots/${botId}`);
    return response.data;
  },

  duplicateBot: async (botId) => {
    const response = await axios.post(`${API}/api/chatbot-manager/bots/${botId}/duplicate`);
    return response.data;
  },

  toggleBotStatus: async (botId) => {
    const response = await axios.patch(`${API}/api/chatbot-manager/bots/${botId}/toggle-status`);
    return response.data;
  },

  getBotMetrics: async (botId, days = 7) => {
    const response = await axios.get(`${API}/api/chatbot-manager/bots/${botId}/metrics?days=${days}`);
    return response.data;
  },

  // Conversations
  createConversation: async (data) => {
    const response = await axios.post(`${API}/api/chatbot-manager/conversations`, data);
    return response.data;
  },

  getConversation: async (conversationId) => {
    const response = await axios.get(`${API}/api/chatbot-manager/conversations/${conversationId}`);
    return response.data;
  },

  listBotConversations: async (botId, limit = 50, status = null) => {
    let url = `${API}/api/chatbot-manager/bots/${botId}/conversations?limit=${limit}`;
    if (status) url += `&status=${status}`;
    const response = await axios.get(url);
    return response.data;
  },

  sendMessage: async (conversationId, content) => {
    const response = await axios.post(
      `${API}/api/chatbot-manager/conversations/${conversationId}/messages`,
      { content }
    );
    return response.data;
  },

  updateConversationStatus: async (conversationId, status) => {
    const response = await axios.patch(
      `${API}/api/chatbot-manager/conversations/${conversationId}/status`,
      { status }
    );
    return response.data;
  },

  submitCSAT: async (conversationId, score) => {
    const response = await axios.post(
      `${API}/api/chatbot-manager/conversations/${conversationId}/csat`,
      { score }
    );
    return response.data;
  },

  searchConversations: async (query, botId = null, limit = 20) => {
    let url = `${API}/api/chatbot-manager/conversations/search?q=${query}&limit=${limit}`;
    if (botId) url += `&bot_id=${botId}`;
    const response = await axios.get(url);
    return response.data;
  },

  // Knowledge Sources
  addKnowledgeSource: async (botId, sourceType, name, config) => {
    const response = await axios.post(
      `${API}/api/chatbot-manager/bots/${botId}/knowledge-sources`,
      { source_type: sourceType, name, config }
    );
    return response.data;
  },

  uploadKnowledgeFile: async (botId, file) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await axios.post(
      `${API}/api/chatbot-manager/bots/${botId}/knowledge-sources/upload`,
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    );
    return response.data;
  },

  reindexKnowledgeSource: async (botId, sourceId) => {
    const response = await axios.post(
      `${API}/api/chatbot-manager/bots/${botId}/knowledge-sources/${sourceId}/reindex`
    );
    return response.data;
  },

  deleteKnowledgeSource: async (botId, sourceId) => {
    const response = await axios.delete(
      `${API}/api/chatbot-manager/bots/${botId}/knowledge-sources/${sourceId}`
    );
    return response.data;
  }
};

export default chatbotService;
