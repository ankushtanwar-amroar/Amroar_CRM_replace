/**
 * Queue Service
 * Handles all API calls for queues management
 */
import axios from 'axios';

const API = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';

const getAuthHeader = () => {
  const token = localStorage.getItem('token');
  return { Authorization: `Bearer ${token}` };
};

export const queueService = {
  /**
   * Get all queues
   */
  async getAllQueues() {
    const response = await axios.get(`${API}/api/queues`, {
      headers: getAuthHeader()
    });
    return response.data;
  },

  /**
   * Get single queue by ID
   */
  async getQueue(queueId) {
    const response = await axios.get(`${API}/api/queues/${queueId}`, {
      headers: getAuthHeader()
    });
    return response.data;
  },

  /**
   * Create new queue
   */
  async createQueue(queueData) {
    const response = await axios.post(`${API}/api/queues`, queueData, {
      headers: getAuthHeader()
    });
    return response.data;
  },

  /**
   * Update queue
   */
  async updateQueue(queueId, queueData) {
    const response = await axios.put(`${API}/api/queues/${queueId}`, queueData, {
      headers: getAuthHeader()
    });
    return response.data;
  },

  /**
   * Delete queue
   */
  async deleteQueue(queueId) {
    const response = await axios.delete(`${API}/api/queues/${queueId}`, {
      headers: getAuthHeader()
    });
    return response.data;
  },

  /**
   * Get members of a queue
   */
  async getQueueMembers(queueId) {
    const response = await axios.get(`${API}/api/queues/${queueId}/members`, {
      headers: getAuthHeader()
    });
    return response.data;
  },

  /**
   * Add member to queue
   */
  async addMember(queueId, memberType, memberId) {
    const response = await axios.post(
      `${API}/api/queues/${queueId}/members`,
      { member_type: memberType, member_id: memberId },
      { headers: getAuthHeader() }
    );
    return response.data;
  },

  /**
   * Remove member from queue
   */
  async removeMember(queueId, memberId) {
    const response = await axios.delete(
      `${API}/api/queues/${queueId}/members/${memberId}`,
      { headers: getAuthHeader() }
    );
    return response.data;
  },

  /**
   * Get available objects for queue configuration
   */
  async getAvailableObjects() {
    const response = await axios.get(`${API}/api/queue-objects`, {
      headers: getAuthHeader()
    });
    return response.data;
  },

  /**
   * Get all users (for member selection)
   */
  async getUsers() {
    const response = await axios.get(`${API}/api/users`, {
      headers: getAuthHeader()
    });
    return response.data;
  },

  /**
   * Get all roles (for member selection)
   */
  async getRoles() {
    const response = await axios.get(`${API}/api/roles`, {
      headers: getAuthHeader()
    });
    return response.data;
  },

  /**
   * Get all groups (for member selection)
   */
  async getGroups() {
    const response = await axios.get(`${API}/api/groups`, {
      headers: getAuthHeader()
    });
    return response.data;
  }
};

export default queueService;
