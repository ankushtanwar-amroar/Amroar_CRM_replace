/**
 * ChatterComponent - Salesforce-like Chatter for Record Pages
 * 
 * This is the engine component that renders in the Lightning App Builder layouts.
 * It wraps the full ChatterFeed component with record context.
 */
import React, { useState, useEffect } from 'react';
import { MessageCircle, Bell, X, Loader2 } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import ChatterFeed from '../../../modules/chatter/components/ChatterFeed';
import chatterService from '../../../modules/chatter/services/chatterService';
import toast from 'react-hot-toast';

/**
 * Notification Bell with Badge
 */
const NotificationBell = () => {
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadUnreadCount();
  }, []);

  const loadUnreadCount = async () => {
    try {
      const result = await chatterService.getUnreadCount();
      setUnreadCount(result.unread_count);
    } catch (err) {
      console.error('Failed to load unread count:', err);
    }
  };

  const loadNotifications = async () => {
    setLoading(true);
    try {
      const data = await chatterService.getNotifications({ unreadOnly: false });
      setNotifications(data);
    } catch (err) {
      toast.error('Failed to load notifications');
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = () => {
    if (!showNotifications) {
      loadNotifications();
    }
    setShowNotifications(!showNotifications);
  };

  const markAllRead = async () => {
    try {
      await chatterService.markNotificationsRead();
      setUnreadCount(0);
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      toast.success('All notifications marked as read');
    } catch (err) {
      toast.error('Failed to mark notifications');
    }
  };

  return (
    <div className="relative">
      <button
        onClick={handleToggle}
        className="relative p-2 rounded-lg hover:bg-slate-100 transition-colors"
      >
        <Bell className="h-5 w-5 text-slate-600" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-red-500 text-white text-xs font-medium rounded-full flex items-center justify-center px-1">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {showNotifications && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-lg border shadow-xl z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b bg-slate-50">
            <h3 className="font-semibold text-slate-800">Notifications</h3>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  className="text-xs text-blue-600 hover:underline"
                >
                  Mark all read
                </button>
              )}
              <button onClick={() => setShowNotifications(false)}>
                <X className="h-4 w-4 text-slate-400 hover:text-slate-600" />
              </button>
            </div>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
              </div>
            ) : notifications.length > 0 ? (
              <div className="divide-y">
                {notifications.map(notif => (
                  <div
                    key={notif.id}
                    className={`px-4 py-3 hover:bg-slate-50 cursor-pointer ${
                      !notif.is_read ? 'bg-blue-50' : ''
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white text-xs font-medium flex-shrink-0">
                        {notif.actor_name?.[0]?.toUpperCase() || '?'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-700">{notif.preview_text}</p>
                        <p className="text-xs text-slate-400 mt-1">
                          {new Date(notif.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      {!notif.is_read && (
                        <div className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0 mt-2" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center text-slate-400 text-sm">
                No notifications
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * Tab Navigation Component
 */
const TabNav = ({ activeTab, onTabChange, tabs }) => {
  return (
    <div className="flex border-b">
      {tabs.map(tab => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === tab.id
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
};

/**
 * Main ChatterComponent for Engine
 */
const ChatterComponent = ({ config = {}, context = {} }) => {
  const { record, recordId, objectName } = context;
  const [activeTab, setActiveTab] = useState('feed');
  
  // Get current user from localStorage
  const [currentUser, setCurrentUser] = useState(null);
  
  useEffect(() => {
    const userData = localStorage.getItem('user');
    if (userData) {
      try {
        setCurrentUser(JSON.parse(userData));
      } catch (e) {
        console.error('Failed to parse user data');
      }
    }
  }, []);

  const tabs = [
    // { id: 'feed', label: 'Feed' },
    // { id: 'related', label: 'Related' },
  ];

  // Get record ID from various sources
  const effectiveRecordId = recordId || record?.id || record?.series_id;

  return (
    <div 
      className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden"
      data-testid="chatter-component"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-slate-50 to-white border-b">
        <div className="flex items-center gap-2">
          <MessageCircle className="w-5 h-5 text-blue-600" />
          <h3 className="text-base font-semibold text-slate-800">
            {config.title || 'Chatter'}
          </h3>
        </div>
        {/* <NotificationBell /> */}
      </div>

      {/* Tabs */}
      <TabNav 
        activeTab={activeTab} 
        onTabChange={setActiveTab}
        tabs={tabs}
      />

      {/* Content */}
      <div className="p-4">
        {activeTab === 'feed' && (
          <ChatterFeed 
            recordId={effectiveRecordId}
            recordType={objectName}
            currentUserId={currentUser?.user_id}
          />
        )}
        
        {activeTab === 'related' && (
          <div className="py-8 text-center text-slate-400">
            <p className="text-sm">Related items will appear here</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatterComponent;
