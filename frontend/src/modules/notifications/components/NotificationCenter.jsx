/**
 * NotificationCenter Component
 * 
 * Bell icon with dropdown for notifications.
 * Includes real-time updates via WebSocket.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Bell, 
  CheckCircle, 
  Clock, 
  User, 
  AtSign, 
  Users,
  Calendar,
  ChevronRight,
  MoreHorizontal,
  Check,
  X,
  Settings
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { 
  fetchNotifications, 
  fetchUnreadCount,
  markAsRead,
  markAsUnread,
  markAllAsRead,
  snoozeNotification
} from '../services/notificationService';
import { useNotificationWebSocket } from '../hooks/useNotificationWebSocket';
import NotificationCard from './NotificationCard';

// Notification type icons
const TYPE_ICONS = {
  MENTION: AtSign,
  OWNER_CHANGE: User,
  ASSIGNMENT: Users,
  REMINDER: Calendar,
  CUSTOM: Bell
};

// Tab configuration
const TABS = [
  { id: 'ALL', label: 'All' },
  { id: 'MENTION', label: 'Mentions' },
  { id: 'OWNER_CHANGE', label: 'Ownership' },
  { id: 'ASSIGNMENT', label: 'Assignments' },
  { id: 'REMINDER', label: 'Reminders' }
];

const NotificationCenter = () => {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('ALL');
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const dropdownRef = useRef(null);
  
  // WebSocket for real-time updates
  const handleNewNotification = useCallback((notification) => {
    setNotifications(prev => [notification, ...prev]);
    setUnreadCount(prev => prev + 1);
  }, []);
  
  const handleCountUpdate = useCallback((count) => {
    setUnreadCount(count);
  }, []);
  
  useNotificationWebSocket({
    onNotification: handleNewNotification,
    onCountUpdate: handleCountUpdate
  });
  
  // Load initial unread count
  useEffect(() => {
    const loadUnreadCount = async () => {
      try {
        const count = await fetchUnreadCount();
        setUnreadCount(count);
      } catch (error) {
        console.error('Failed to load unread count:', error);
      }
    };
    loadUnreadCount();
  }, []);
  
  // Load notifications when dropdown opens or tab changes
  useEffect(() => {
    if (isOpen) {
      loadNotifications();
    }
  }, [isOpen, activeTab]);
  
  const loadNotifications = async () => {
    setLoading(true);
    try {
      const filter = activeTab === 'ALL' ? null : activeTab;
      const result = await fetchNotifications({ filter, limit: 20, grouped: false });
      setNotifications(result.notifications || []);
      setHasMore(result.has_more || false);
    } catch (error) {
      console.error('Failed to load notifications:', error);
    } finally {
      setLoading(false);
    }
  };
  
  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  
  // Handle mark as read
  const handleMarkRead = async (notificationId) => {
    try {
      await markAsRead(notificationId);
      setNotifications(prev => 
        prev.map(n => n.id === notificationId ? { ...n, is_read: true } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Failed to mark as read:', error);
    }
  };
  
  // Handle mark as unread
  const handleMarkUnread = async (notificationId) => {
    try {
      await markAsUnread(notificationId);
      setNotifications(prev => 
        prev.map(n => n.id === notificationId ? { ...n, is_read: false } : n)
      );
      setUnreadCount(prev => prev + 1);
    } catch (error) {
      console.error('Failed to mark as unread:', error);
    }
  };
  
  // Handle mark all as read
  const handleMarkAllRead = async () => {
    try {
      const filter = activeTab === 'ALL' ? null : activeTab;
      await markAllAsRead(filter);
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch (error) {
      console.error('Failed to mark all as read:', error);
    }
  };
  
  // Handle snooze
  const handleSnooze = async (notificationId, option) => {
    try {
      await snoozeNotification(notificationId, option);
      setNotifications(prev => prev.filter(n => n.id !== notificationId));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Failed to snooze:', error);
    }
  };
  
  // Handle open notification
  const handleOpen = (notification) => {
    // Mark as read
    if (!notification.is_read) {
      handleMarkRead(notification.id);
    }
    
    // Navigate to target
    if (notification.target_url) {
      // Ensure URL ends with /view for record pages
      let targetUrl = notification.target_url;
      
      // Check if this looks like a record URL (e.g., /lead/123) - convert to /crm/ route
      const recordPattern = /^\/([a-z_]+)\/([^\/]+)$/i;
      const match = targetUrl.match(recordPattern);
      if (match) {
        // Convert to /crm/ route format
        targetUrl = `/crm/${match[1]}/${match[2]}`;
      }
      
      navigate(targetUrl);
      setIsOpen(false);
    } else if (notification.target_object_type && notification.target_object_id) {
      // Build URL from object type and ID
      const objectType = notification.target_object_type.toLowerCase();
      navigate(`/crm/${objectType}/${notification.target_object_id}`);
      setIsOpen(false);
    } else {
      // No target - just close the dropdown
      console.warn('Notification has no target URL:', notification);
      setIsOpen(false);
    }
  };
  
  // Format relative time
  const formatTime = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };
  
  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Icon Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-full hover:bg-slate-100 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
        data-testid="notification-bell"
      >
        <Bell className="h-5 w-5 text-slate-600" />
        
        {/* Unread Badge */}
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold text-white bg-red-500 rounded-full">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>
      
      {/* Dropdown Panel */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-[420px] bg-white rounded-lg shadow-xl border border-slate-200 z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-200">
            <h3 className="text-sm font-semibold text-slate-800">Notifications</h3>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                >
                  Mark all as read
                </button>
              )}
              <button
                onClick={() => {
                  setIsOpen(false);
                  navigate('/setup/notification-configuration');
                }}
                className="p-1 hover:bg-slate-200 rounded transition-colors"
                title="Notification Settings"
              >
                <Settings className="h-4 w-4 text-slate-500" />
              </button>
            </div>
          </div>
          
          {/* Tabs */}
          <div className="flex border-b border-slate-200 px-2 overflow-x-auto">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-2 text-xs font-medium whitespace-nowrap transition-colors ${
                  activeTab === tab.id 
                    ? 'text-blue-600 border-b-2 border-blue-600' 
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          
          {/* Notifications List */}
          <div className="max-h-[400px] overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
              </div>
            ) : notifications.length === 0 ? (
              <div className="py-12 text-center">
                <Bell className="h-10 w-10 text-slate-300 mx-auto mb-3" />
                <p className="text-sm text-slate-500">No notifications</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {notifications.map(notification => (
                  <NotificationCard
                    key={notification.id}
                    notification={notification}
                    onOpen={() => handleOpen(notification)}
                    onMarkRead={() => handleMarkRead(notification.id)}
                    onMarkUnread={() => handleMarkUnread(notification.id)}
                    onSnooze={(option) => handleSnooze(notification.id, option)}
                    formatTime={formatTime}
                  />
                ))}
              </div>
            )}
          </div>
          
          {/* Footer */}
          {notifications.length > 0 && (
            <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 text-center">
              <button
                onClick={() => {
                  setIsOpen(false);
                  navigate('/setup/notification-configuration');
                }}
                className="text-xs text-blue-600 hover:text-blue-700 font-medium"
              >
                View All Notifications & Settings
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default NotificationCenter;
