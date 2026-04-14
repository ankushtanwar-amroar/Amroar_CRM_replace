/**
 * NotificationCard Component
 * 
 * Individual notification item with actions
 */

import React, { useState } from 'react';
import {
  Bell,
  AtSign,
  User,
  Users,
  Calendar,
  ChevronRight,
  MoreHorizontal,
  Check,
  Clock,
  Eye,
  EyeOff
} from 'lucide-react';

// Notification type icons and colors
const TYPE_CONFIG = {
  MENTION: { 
    icon: AtSign, 
    color: 'bg-blue-100 text-blue-600',
    label: 'Mention'
  },
  OWNER_CHANGE: { 
    icon: User, 
    color: 'bg-purple-100 text-purple-600',
    label: 'Ownership'
  },
  ASSIGNMENT: { 
    icon: Users, 
    color: 'bg-green-100 text-green-600',
    label: 'Assignment'
  },
  REMINDER: { 
    icon: Calendar, 
    color: 'bg-amber-100 text-amber-600',
    label: 'Reminder'
  },
  CUSTOM: { 
    icon: Bell, 
    color: 'bg-slate-100 text-slate-600',
    label: 'Notification'
  }
};

// Snooze options
const SNOOZE_OPTIONS = [
  { value: '10_MINUTES', label: '10 minutes' },
  { value: '30_MINUTES', label: '30 minutes' },
  { value: '1_HOUR', label: '1 hour' },
  { value: 'TOMORROW_9AM', label: 'Tomorrow 9 AM' }
];

const NotificationCard = ({
  notification,
  onOpen,
  onMarkRead,
  onMarkUnread,
  onSnooze,
  formatTime
}) => {
  const [showMenu, setShowMenu] = useState(false);
  const [showSnooze, setShowSnooze] = useState(false);
  
  const config = TYPE_CONFIG[notification.type] || TYPE_CONFIG.CUSTOM;
  const Icon = config.icon;
  
  return (
    <div 
      className={`relative px-4 py-3 hover:bg-slate-50 transition-colors ${
        !notification.is_read ? 'bg-blue-50/50' : ''
      }`}
    >
      <div className="flex gap-3">
        {/* Icon */}
        <div className={`flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center ${config.color}`}>
          <Icon className="h-4 w-4" />
        </div>
        
        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              {/* Title */}
              <p className={`text-sm ${!notification.is_read ? 'font-semibold text-slate-800' : 'font-medium text-slate-700'}`}>
                {notification.title}
              </p>
              
              {/* Message */}
              <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">
                {notification.message}
              </p>
              
              {/* Timestamp */}
              <p className="text-[10px] text-slate-400 mt-1">
                {formatTime(notification.created_at)}
              </p>
            </div>
            
            {/* Unread indicator */}
            {!notification.is_read && (
              <div className="flex-shrink-0 w-2 h-2 bg-blue-500 rounded-full mt-1.5" />
            )}
          </div>
          
          {/* Actions */}
          <div className="flex items-center gap-2 mt-2">
            <button
              onClick={onOpen}
              className="px-3 py-1 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700 transition-colors"
            >
              Open
            </button>
            
            <div className="relative">
              <button
                onClick={() => setShowMenu(!showMenu)}
                className="p-1 rounded hover:bg-slate-200 transition-colors"
              >
                <MoreHorizontal className="h-4 w-4 text-slate-400" />
              </button>
              
              {/* Actions Menu */}
              {showMenu && (
                <div className="absolute left-0 bottom-full mb-1 w-40 bg-white rounded-lg shadow-lg border border-slate-200 py-1 z-10">
                  {notification.is_read ? (
                    <button
                      onClick={() => {
                        onMarkUnread();
                        setShowMenu(false);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50"
                    >
                      <EyeOff className="h-3.5 w-3.5" />
                      Mark as unread
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        onMarkRead();
                        setShowMenu(false);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      Mark as read
                    </button>
                  )}
                  
                  {/* Snooze option (only for reminders) */}
                  {notification.type === 'REMINDER' && (
                    <div className="relative">
                      <button
                        onClick={() => setShowSnooze(!showSnooze)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50"
                      >
                        <Clock className="h-3.5 w-3.5" />
                        Snooze
                        <ChevronRight className="h-3 w-3 ml-auto" />
                      </button>
                      
                      {showSnooze && (
                        <div className="absolute left-full top-0 ml-1 w-36 bg-white rounded-lg shadow-lg border border-slate-200 py-1">
                          {SNOOZE_OPTIONS.map(option => (
                            <button
                              key={option.value}
                              onClick={() => {
                                onSnooze(option.value);
                                setShowMenu(false);
                                setShowSnooze(false);
                              }}
                              className="w-full px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 text-left"
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NotificationCard;
