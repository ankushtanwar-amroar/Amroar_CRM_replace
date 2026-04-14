/**
 * Activity Mapper Utilities
 * Helper functions for mapping and transforming activity data
 */

import { ACTIVITY_COLORS, ACTIVITY_ICONS, getActivityColors } from '../config/activityConfigDefaults';

/**
 * Format date for display in timeline
 */
export const formatActivityDate = (dateString) => {
  if (!dateString) return 'No date';
  
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    // Relative time for recent activities
    if (diffDays === 0) {
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      if (diffHours === 0) {
        const diffMinutes = Math.floor(diffMs / (1000 * 60));
        return diffMinutes <= 1 ? 'Just now' : `${diffMinutes} minutes ago`;
      }
      return diffHours === 1 ? '1 hour ago' : `${diffHours} hours ago`;
    }
    
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    
    // Format as date for older activities
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    });
  } catch {
    return dateString;
  }
};

/**
 * Format date and time for display
 */
export const formatActivityDateTime = (dateString) => {
  if (!dateString) return 'No date';
  
  try {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return dateString;
  }
};

/**
 * Get status badge color based on status value
 */
export const getStatusColor = (status) => {
  const statusLower = (status || '').toLowerCase();
  
  if (['completed', 'done', 'closed', 'sent'].includes(statusLower)) {
    return { bg: 'bg-green-100', text: 'text-green-700' };
  }
  if (['in progress', 'in-progress', 'pending', 'open'].includes(statusLower)) {
    return { bg: 'bg-blue-100', text: 'text-blue-700' };
  }
  if (['overdue', 'failed', 'cancelled', 'canceled'].includes(statusLower)) {
    return { bg: 'bg-red-100', text: 'text-red-700' };
  }
  if (['not started', 'draft', 'scheduled'].includes(statusLower)) {
    return { bg: 'bg-slate-100', text: 'text-slate-700' };
  }
  
  return { bg: 'bg-slate-100', text: 'text-slate-600' };
};

/**
 * Get icon style classes for activity type
 */
export const getActivityIconStyles = (type) => {
  const colors = getActivityColors(type);
  return {
    containerClass: `${colors.iconBg} rounded-full flex items-center justify-center`,
    iconClass: 'text-white',
  };
};

/**
 * Truncate text with ellipsis
 */
export const truncateText = (text, maxLength = 50) => {
  if (!text || text.length <= maxLength) return text;
  return text.substring(0, maxLength).trim() + '...';
};

/**
 * Group activities by date
 */
export const groupActivitiesByDate = (activities) => {
  const groups = {};
  
  activities.forEach(activity => {
    const date = activity.date ? new Date(activity.date) : null;
    let groupKey;
    
    if (!date) {
      groupKey = 'No Date';
    } else {
      const now = new Date();
      const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));
      
      if (diffDays === 0) {
        groupKey = 'Today';
      } else if (diffDays === 1) {
        groupKey = 'Yesterday';
      } else if (diffDays < 7) {
        groupKey = 'This Week';
      } else if (diffDays < 30) {
        groupKey = 'This Month';
      } else {
        groupKey = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      }
    }
    
    if (!groups[groupKey]) {
      groups[groupKey] = [];
    }
    groups[groupKey].push(activity);
  });
  
  // Convert to array and sort groups
  const sortedGroups = [
    'Today',
    'Yesterday',
    'This Week',
    'This Month',
    'No Date',
  ].filter(key => groups[key]);
  
  // Add month groups in sorted order
  const monthGroups = Object.keys(groups)
    .filter(key => !sortedGroups.includes(key))
    .sort((a, b) => {
      // Sort months in reverse chronological order
      const dateA = new Date(a);
      const dateB = new Date(b);
      return dateB - dateA;
    });
  
  return [...sortedGroups, ...monthGroups].map(key => ({
    label: key,
    activities: groups[key],
  }));
};

/**
 * Filter activities by search term
 */
export const filterActivitiesBySearch = (activities, searchTerm) => {
  if (!searchTerm || searchTerm.trim() === '') {
    return activities;
  }
  
  const term = searchTerm.toLowerCase().trim();
  
  return activities.filter(activity => {
    const title = (activity.title || '').toLowerCase();
    const description = (activity.description || '').toLowerCase();
    const status = (activity.status || '').toLowerCase();
    const type = (activity.typeLabel || activity.type || '').toLowerCase();
    const owner = (activity.owner || '').toLowerCase();
    
    return (
      title.includes(term) ||
      description.includes(term) ||
      status.includes(term) ||
      type.includes(term) ||
      owner.includes(term)
    );
  });
};

/**
 * Sort activities
 */
export const sortActivities = (activities, sortBy = 'date', sortOrder = 'desc') => {
  return [...activities].sort((a, b) => {
    let valueA, valueB;
    
    switch (sortBy) {
      case 'date':
        valueA = new Date(a.date || 0);
        valueB = new Date(b.date || 0);
        break;
      case 'title':
        valueA = (a.title || '').toLowerCase();
        valueB = (b.title || '').toLowerCase();
        break;
      case 'type':
        valueA = (a.typeLabel || a.type || '').toLowerCase();
        valueB = (b.typeLabel || b.type || '').toLowerCase();
        break;
      case 'status':
        valueA = (a.status || '').toLowerCase();
        valueB = (b.status || '').toLowerCase();
        break;
      default:
        return 0;
    }
    
    if (sortOrder === 'asc') {
      return valueA > valueB ? 1 : valueA < valueB ? -1 : 0;
    }
    return valueA < valueB ? 1 : valueA > valueB ? -1 : 0;
  });
};

export default {
  formatActivityDate,
  formatActivityDateTime,
  getStatusColor,
  getActivityIconStyles,
  truncateText,
  groupActivitiesByDate,
  filterActivitiesBySearch,
  sortActivities,
};
