/**
 * Notification Service
 * 
 * API client for notification operations
 */

const API = process.env.REACT_APP_BACKEND_URL || '';

// Get auth token
const getAuthHeader = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

/**
 * Fetch notifications with optional filtering
 */
export async function fetchNotifications(options = {}) {
  const { filter, limit = 20, skip = 0, grouped = false } = options;
  
  const params = new URLSearchParams();
  if (filter) params.append('filter', filter);
  params.append('limit', limit.toString());
  params.append('skip', skip.toString());
  params.append('grouped', grouped.toString());
  
  const response = await fetch(`${API}/api/notifications?${params}`, {
    headers: getAuthHeader()
  });
  
  if (!response.ok) {
    throw new Error('Failed to fetch notifications');
  }
  
  return response.json();
}

/**
 * Get unread notification count
 */
export async function fetchUnreadCount() {
  const response = await fetch(`${API}/api/notifications/unread-count`, {
    headers: getAuthHeader()
  });
  
  if (!response.ok) {
    throw new Error('Failed to fetch unread count');
  }
  
  const data = await response.json();
  return data.unread_count;
}

/**
 * Mark notification as read
 */
export async function markAsRead(notificationId) {
  const response = await fetch(`${API}/api/notifications/${notificationId}/read`, {
    method: 'POST',
    headers: getAuthHeader()
  });
  
  if (!response.ok) {
    throw new Error('Failed to mark as read');
  }
  
  return response.json();
}

/**
 * Mark notification as unread
 */
export async function markAsUnread(notificationId) {
  const response = await fetch(`${API}/api/notifications/${notificationId}/unread`, {
    method: 'POST',
    headers: getAuthHeader()
  });
  
  if (!response.ok) {
    throw new Error('Failed to mark as unread');
  }
  
  return response.json();
}

/**
 * Mark all notifications as read
 */
export async function markAllAsRead(filter = null) {
  const params = filter ? `?filter=${filter}` : '';
  const response = await fetch(`${API}/api/notifications/mark-all-read${params}`, {
    method: 'POST',
    headers: getAuthHeader()
  });
  
  if (!response.ok) {
    throw new Error('Failed to mark all as read');
  }
  
  return response.json();
}

/**
 * Snooze a notification
 */
export async function snoozeNotification(notificationId, option) {
  const response = await fetch(`${API}/api/notifications/${notificationId}/snooze`, {
    method: 'POST',
    headers: {
      ...getAuthHeader(),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ option })
  });
  
  if (!response.ok) {
    throw new Error('Failed to snooze notification');
  }
  
  return response.json();
}

/**
 * Delete a notification
 */
export async function deleteNotification(notificationId) {
  const response = await fetch(`${API}/api/notifications/${notificationId}`, {
    method: 'DELETE',
    headers: getAuthHeader()
  });
  
  if (!response.ok) {
    throw new Error('Failed to delete notification');
  }
  
  return response.json();
}

/**
 * Get notification preferences
 */
export async function fetchPreferences() {
  const response = await fetch(`${API}/api/notifications/preferences`, {
    headers: getAuthHeader()
  });
  
  if (!response.ok) {
    throw new Error('Failed to fetch preferences');
  }
  
  return response.json();
}

/**
 * Update notification preferences
 */
export async function updatePreferences(updates) {
  const response = await fetch(`${API}/api/notifications/preferences`, {
    method: 'POST',
    headers: {
      ...getAuthHeader(),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(updates)
  });
  
  if (!response.ok) {
    throw new Error('Failed to update preferences');
  }
  
  return response.json();
}

/**
 * Send custom notification (for testing or Flow Builder)
 */
export async function sendCustomNotification(data) {
  const response = await fetch(`${API}/api/notifications/send`, {
    method: 'POST',
    headers: {
      ...getAuthHeader(),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(data)
  });
  
  if (!response.ok) {
    throw new Error('Failed to send notification');
  }
  
  return response.json();
}
