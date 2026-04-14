/**
 * Chatter Service - API client for Chatter module
 */
const API_URL = process.env.REACT_APP_BACKEND_URL || '';

const getHeaders = () => ({
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${localStorage.getItem('token')}`
});

export const chatterService = {
  // Posts
  async createPost(postData) {
    const response = await fetch(`${API_URL}/api/chatter/posts`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(postData)
    });
    if (!response.ok) throw new Error('Failed to create post');
    return response.json();
  },

  async getPost(postId) {
    const response = await fetch(`${API_URL}/api/chatter/posts/${postId}`, {
      headers: getHeaders()
    });
    if (!response.ok) throw new Error('Failed to get post');
    return response.json();
  },

  async updatePost(postId, updateData) {
    const response = await fetch(`${API_URL}/api/chatter/posts/${postId}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(updateData)
    });
    if (!response.ok) throw new Error('Failed to update post');
    return response.json();
  },

  async deletePost(postId) {
    const response = await fetch(`${API_URL}/api/chatter/posts/${postId}`, {
      method: 'DELETE',
      headers: getHeaders()
    });
    if (!response.ok) throw new Error('Failed to delete post');
    return response.json();
  },

  async getFeed({ recordId, recordType, filter = 'ALL', page = 1, pageSize = 20, search }) {
    const params = new URLSearchParams();
    if (recordId) params.append('record_id', recordId);
    if (recordType) params.append('record_type', recordType);
    if (filter) params.append('filter', filter);
    params.append('page', page.toString());
    params.append('page_size', pageSize.toString());
    if (search) params.append('search', search);

    const response = await fetch(`${API_URL}/api/chatter/feed?${params}`, {
      headers: getHeaders()
    });
    if (!response.ok) throw new Error('Failed to get feed');
    return response.json();
  },

  // Comments
  async createComment(commentData) {
    const response = await fetch(`${API_URL}/api/chatter/comments`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(commentData)
    });
    if (!response.ok) throw new Error('Failed to create comment');
    return response.json();
  },

  async getComments(postId, { parentCommentId, page = 1, pageSize = 50 } = {}) {
    const params = new URLSearchParams();
    if (parentCommentId) params.append('parent_comment_id', parentCommentId);
    params.append('page', page.toString());
    params.append('page_size', pageSize.toString());

    const response = await fetch(`${API_URL}/api/chatter/posts/${postId}/comments?${params}`, {
      headers: getHeaders()
    });
    if (!response.ok) throw new Error('Failed to get comments');
    return response.json();
  },

  async updateComment(commentId, updateData) {
    const response = await fetch(`${API_URL}/api/chatter/comments/${commentId}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(updateData)
    });
    if (!response.ok) throw new Error('Failed to update comment');
    return response.json();
  },

  async deleteComment(commentId) {
    const response = await fetch(`${API_URL}/api/chatter/comments/${commentId}`, {
      method: 'DELETE',
      headers: getHeaders()
    });
    if (!response.ok) throw new Error('Failed to delete comment');
    return response.json();
  },

  // Reactions
  async addReaction(targetType, targetId, reactionType = 'LIKE') {
    const response = await fetch(`${API_URL}/api/chatter/reactions`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        target_type: targetType,
        target_id: targetId,
        reaction_type: reactionType
      })
    });
    if (!response.ok) throw new Error('Failed to add reaction');
    return response.json();
  },

  async removeReaction(targetType, targetId) {
    const response = await fetch(`${API_URL}/api/chatter/reactions/${targetType}/${targetId}`, {
      method: 'DELETE',
      headers: getHeaders()
    });
    if (!response.ok) throw new Error('Failed to remove reaction');
    return response.json();
  },

  async getReactions(targetType, targetId) {
    const response = await fetch(`${API_URL}/api/chatter/reactions/${targetType}/${targetId}`, {
      headers: getHeaders()
    });
    if (!response.ok) throw new Error('Failed to get reactions');
    return response.json();
  },

  // Notifications
  async getNotifications({ unreadOnly = false, page = 1, pageSize = 20 } = {}) {
    const params = new URLSearchParams();
    params.append('unread_only', unreadOnly.toString());
    params.append('page', page.toString());
    params.append('page_size', pageSize.toString());

    const response = await fetch(`${API_URL}/api/chatter/notifications?${params}`, {
      headers: getHeaders()
    });
    if (!response.ok) throw new Error('Failed to get notifications');
    return response.json();
  },

  async getUnreadCount() {
    const response = await fetch(`${API_URL}/api/chatter/notifications/unread-count`, {
      headers: getHeaders()
    });
    if (!response.ok) throw new Error('Failed to get unread count');
    return response.json();
  },

  async markNotificationsRead(notificationIds) {
    const response = await fetch(`${API_URL}/api/chatter/notifications/mark-read`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(notificationIds ? { notification_ids: notificationIds } : {})
    });
    if (!response.ok) throw new Error('Failed to mark notifications read');
    return response.json();
  },

  // User Search
  async searchUsers(query, limit = 10) {
    const response = await fetch(`${API_URL}/api/chatter/users/search?q=${encodeURIComponent(query)}&limit=${limit}`, {
      headers: getHeaders()
    });
    if (!response.ok) throw new Error('Failed to search users');
    return response.json();
  },

  // File Upload
  async uploadFile(file) {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${API_URL}/api/chatter/upload`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      },
      body: formData
    });
    if (!response.ok) throw new Error('Failed to upload file');
    return response.json();
  }
};

export default chatterService;
