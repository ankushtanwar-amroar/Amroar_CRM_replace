/**
 * Group Service
 * Handles all API calls for groups management
 */
import axios from 'axios';

const API = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';

const getAuthHeader = () => {
  const token = localStorage.getItem('token');
  return { Authorization: `Bearer ${token}` };
};

export const groupService = {
  /**
   * Get all groups
   */
  async getAllGroups(groupType = null) {
    const params = groupType ? { group_type: groupType } : {};
    const response = await axios.get(`${API}/api/groups`, {
      headers: getAuthHeader(),
      params
    });
    return response.data;
  },

  /**
   * Get single group by ID
   */
  async getGroup(groupId) {
    const response = await axios.get(`${API}/api/groups/${groupId}`, {
      headers: getAuthHeader()
    });
    return response.data;
  },

  /**
   * Create new group
   */
  async createGroup(groupData) {
    const response = await axios.post(`${API}/api/groups`, groupData, {
      headers: getAuthHeader()
    });
    return response.data;
  },

  /**
   * Update group
   */
  async updateGroup(groupId, groupData) {
    const response = await axios.put(`${API}/api/groups/${groupId}`, groupData, {
      headers: getAuthHeader()
    });
    return response.data;
  },

  /**
   * Delete group
   */
  async deleteGroup(groupId) {
    const response = await axios.delete(`${API}/api/groups/${groupId}`, {
      headers: getAuthHeader()
    });
    return response.data;
  },

  /**
   * Get members of a group
   */
  async getGroupMembers(groupId) {
    const response = await axios.get(`${API}/api/groups/${groupId}/members`, {
      headers: getAuthHeader()
    });
    return response.data;
  },

  /**
   * Add member to group
   */
  async addMember(groupId, memberType, memberId) {
    const response = await axios.post(
      `${API}/api/groups/${groupId}/members`,
      { member_type: memberType, member_id: memberId },
      { headers: getAuthHeader() }
    );
    return response.data;
  },

  /**
   * Remove member from group
   */
  async removeMember(groupId, memberId) {
    const response = await axios.delete(
      `${API}/api/groups/${groupId}/members/${memberId}`,
      { headers: getAuthHeader() }
    );
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
  }
};

export default groupService;
