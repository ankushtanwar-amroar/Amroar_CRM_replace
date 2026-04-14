/**
 * InboxPage - Personal Activity Feed for Task Manager
 * Shows notifications that require user attention:
 * - Task Assignments
 * - @Mentions  
 * - Approval Requests/Decisions
 * - Dependency Unblocked
 * - SLA Breach
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Inbox, User, AtSign, GitBranch, Link2, AlertTriangle, 
  Check, CheckCheck, Clock, Bell, Loader2, RefreshCw,
  ChevronRight, PartyPopper
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';

const API_URL = process.env.REACT_APP_BACKEND_URL;

// Icon mapping for notification types
const notificationConfig = {
  assignment: {
    icon: User,
    color: 'bg-blue-100 text-blue-600',
    label: 'Assignment'
  },
  mention: {
    icon: AtSign,
    color: 'bg-purple-100 text-purple-600',
    label: 'Mention'
  },
  approval_request: {
    icon: GitBranch,
    color: 'bg-amber-100 text-amber-600',
    label: 'Approval Request'
  },
  approval_requested: {
    icon: GitBranch,
    color: 'bg-amber-100 text-amber-600',
    label: 'Approval Request'
  },
  approval_approved: {
    icon: Check,
    color: 'bg-green-100 text-green-600',
    label: 'Approved'
  },
  approval_rejected: {
    icon: AlertTriangle,
    color: 'bg-red-100 text-red-600',
    label: 'Rejected'
  },
  dependency_resolved: {
    icon: Link2,
    color: 'bg-teal-100 text-teal-600',
    label: 'Unblocked'
  },
  sla_breach: {
    icon: AlertTriangle,
    color: 'bg-red-100 text-red-600',
    label: 'SLA Breach'
  },
  due_date_reminder: {
    icon: Clock,
    color: 'bg-orange-100 text-orange-600',
    label: 'Due Soon'
  },
  task_completed: {
    icon: Check,
    color: 'bg-green-100 text-green-600',
    label: 'Completed'
  },
  default: {
    icon: Bell,
    color: 'bg-slate-100 text-slate-600',
    label: 'Notification'
  }
};

const InboxPage = () => {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const navigate = useNavigate();

  const fetchNotifications = useCallback(async (showRefresh = false) => {
    try {
      if (showRefresh) setRefreshing(true);
      else setLoading(true);
      
      const token = localStorage.getItem('token');
      if (!token) return;
      
      const response = await fetch(`${API_URL}/api/task-manager/notifications?limit=100`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        setNotifications(data.notifications || []);
        setUnreadCount(data.unread_count || 0);
      }
    } catch (err) {
      console.error('Error fetching inbox:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
    
    // Poll for new notifications every 30 seconds
    const interval = setInterval(() => fetchNotifications(false), 30000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  const markAsRead = async (notificationId) => {
    try {
      const token = localStorage.getItem('token');
      await fetch(`${API_URL}/api/task-manager/notifications/${notificationId}/read`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      setNotifications(prev => 
        prev.map(n => n.id === notificationId ? { ...n, is_read: true } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (err) {
      console.error('Error marking notification as read:', err);
    }
  };

  const markAllAsRead = async () => {
    try {
      const token = localStorage.getItem('token');
      await fetch(`${API_URL}/api/task-manager/notifications/mark-all-read`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error('Error marking all as read:', err);
    }
  };

  const handleItemClick = (notification) => {
    // Mark as read if unread
    if (!notification.is_read) {
      markAsRead(notification.id);
    }
    
    // Navigate to the related task
    if (notification.task_id && notification.project_id) {
      navigate(`/task-manager/projects/${notification.project_id}?task=${notification.task_id}`);
    } else if (notification.task_id) {
      // Try to find project from task or just go to projects
      navigate(`/task-manager/projects`);
    }
  };

  const formatTime = (dateStr) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
  };

  const getNotificationConfig = (type) => {
    return notificationConfig[type] || notificationConfig.default;
  };

  // Group notifications by date
  const groupedNotifications = notifications.reduce((groups, notification) => {
    const date = new Date(notification.created_at);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    let groupKey;
    if (date.toDateString() === today.toDateString()) {
      groupKey = 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      groupKey = 'Yesterday';
    } else if (date > new Date(today.setDate(today.getDate() - 7))) {
      groupKey = 'This Week';
    } else {
      groupKey = 'Earlier';
    }
    
    if (!groups[groupKey]) {
      groups[groupKey] = [];
    }
    groups[groupKey].push(notification);
    return groups;
  }, {});

  const groupOrder = ['Today', 'Yesterday', 'This Week', 'Earlier'];

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
            <Inbox className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Inbox</h1>
            <p className="text-sm text-slate-500">
              {unreadCount > 0 ? `${unreadCount} unread item${unreadCount > 1 ? 's' : ''}` : 'All caught up'}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchNotifications(true)}
            disabled={refreshing}
            data-testid="inbox-refresh-btn"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          {unreadCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={markAllAsRead}
              data-testid="inbox-mark-all-read-btn"
            >
              <CheckCheck className="w-4 h-4 mr-2" />
              Mark all read
            </Button>
          )}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500 mb-4" />
          <p className="text-slate-500">Loading your inbox...</p>
        </div>
      ) : notifications.length === 0 ? (
        /* Empty State */
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center" data-testid="inbox-empty-state">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <PartyPopper className="w-8 h-8 text-green-600" />
          </div>
          <h3 className="text-lg font-semibold text-slate-900 mb-2">You&apos;re all caught up!</h3>
          <p className="text-slate-500 max-w-sm mx-auto">
            No new notifications. When someone assigns you a task, mentions you, or requests your approval, it will show up here.
          </p>
        </div>
      ) : (
        /* Notification List */
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden" data-testid="inbox-list">
          {groupOrder.map(group => {
            const items = groupedNotifications[group];
            if (!items || items.length === 0) return null;
            
            return (
              <div key={group}>
                {/* Group Header */}
                <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 sticky top-0">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    {group}
                  </span>
                </div>
                
                {/* Group Items */}
                <div className="divide-y divide-slate-100">
                  {items.map(notification => {
                    const config = getNotificationConfig(notification.type);
                    const Icon = config.icon;
                    
                    return (
                      <div
                        key={notification.id}
                        onClick={() => handleItemClick(notification)}
                        className={`flex items-start gap-4 p-4 cursor-pointer transition-colors hover:bg-slate-50 ${
                          !notification.is_read ? 'bg-blue-50/50' : ''
                        }`}
                        data-testid={`inbox-item-${notification.id}`}
                      >
                        {/* Icon */}
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${config.color}`}>
                          <Icon className="w-5 h-5" />
                        </div>
                        
                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className={`text-sm ${!notification.is_read ? 'font-semibold text-slate-900' : 'text-slate-700'}`}>
                                {notification.title}
                              </p>
                              {notification.message && (
                                <p className="text-sm text-slate-500 mt-0.5 line-clamp-2">
                                  {notification.message}
                                </p>
                              )}
                              {notification.task_title && (
                                <div className="flex items-center gap-2 mt-2">
                                  <Badge variant="secondary" className="text-xs">
                                    {notification.task_title}
                                  </Badge>
                                </div>
                              )}
                            </div>
                            
                            {/* Unread indicator */}
                            {!notification.is_read && (
                              <div className="w-2.5 h-2.5 bg-blue-500 rounded-full flex-shrink-0 mt-1.5" />
                            )}
                          </div>
                          
                          {/* Footer */}
                          <div className="flex items-center gap-3 mt-2">
                            <span className="text-xs text-slate-400">
                              {formatTime(notification.created_at)}
                            </span>
                            <Badge variant="outline" className="text-xs">
                              {config.label}
                            </Badge>
                          </div>
                        </div>
                        
                        {/* Arrow */}
                        <ChevronRight className="w-5 h-5 text-slate-300 flex-shrink-0 mt-2" />
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default InboxPage;
