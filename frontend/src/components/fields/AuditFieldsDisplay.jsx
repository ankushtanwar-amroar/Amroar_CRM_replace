/**
 * AuditFieldsDisplay - Display system audit fields and Owner
 * 
 * Shows:
 * - Owner (user name with link)
 * - Created At (timestamp)
 * - Created By (user name with link)
 * - Updated At (timestamp)
 * - Updated By (user name with link)
 * 
 * These fields are read-only and auto-managed by the backend.
 */
import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Clock, User, Calendar, RefreshCw, Loader2, UserCircle, Crown } from 'lucide-react';
import { cn } from '../../lib/utils';

const API_URL = process.env.REACT_APP_BACKEND_URL;

// Cache for user names to avoid repeated API calls
const userNameCache = {};

// Helper to fetch user by ID
const fetchUserName = async (userId, token) => {
  if (!userId) return null;
  if (userNameCache[userId]) return userNameCache[userId];
  
  try {
    const response = await fetch(`${API_URL}/api/users/${userId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (response.ok) {
      const user = await response.json();
      const name = `${user.first_name || ''} ${user.last_name || ''}`.trim() || 
                  user.name || user.email || 'Unknown User';
      userNameCache[userId] = name;
      return name;
    }
  } catch (error) {
    console.error('Error fetching user:', error);
  }
  return 'Unknown User';
};

const AuditFieldsDisplay = ({ 
  record,
  className = '',
  showOwner = false  // Owner is now in header, default to false
}) => {
  const navigate = useNavigate();
  const [ownerName, setOwnerName] = useState(null);
  const [createdByName, setCreatedByName] = useState(null);
  const [updatedByName, setUpdatedByName] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  // Get values from record (both top-level and data)
  const createdAt = record?.created_at || record?.createdAt;
  const updatedAt = record?.updated_at || record?.updatedAt;
  const createdBy = record?.created_by || record?.createdBy;
  const updatedBy = record?.updated_by || record?.updatedBy;
  const ownerId = record?.owner_id || record?.ownerId;

  // Fetch user names
  useEffect(() => {
    const fetchAllUsers = async () => {
      const token = localStorage.getItem('token');
      if (!token) return;

      setIsLoading(true);
      
      try {
        // Fetch all user names in parallel
        const [owner, creator, updater] = await Promise.all([
          (showOwner && ownerId) ? fetchUserName(ownerId, token) : Promise.resolve(null),
          createdBy ? fetchUserName(createdBy, token) : Promise.resolve(null),
          updatedBy ? fetchUserName(updatedBy, token) : Promise.resolve(null)
        ]);
        
        setOwnerName(owner);
        setCreatedByName(creator);
        setUpdatedByName(updater);
      } finally {
        setIsLoading(false);
      }
    };

    fetchAllUsers();
  }, [ownerId, createdBy, updatedBy, showOwner]);

  // Format date/time
  const formatDateTime = (dateStr) => {
    if (!dateStr) return '—';
    try {
      const date = new Date(dateStr);
      return date.toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return dateStr;
    }
  };

  // Format relative time
  const formatRelativeTime = (dateStr) => {
    if (!dateStr) return '';
    try {
      const date = new Date(dateStr);
      const now = new Date();
      const diffMs = now - date;
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffMins < 1) return 'just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays < 7) return `${diffDays}d ago`;
      return '';
    } catch {
      return '';
    }
  };

  // No audit data
  if (!createdAt && !updatedAt && !createdBy && !updatedBy && !ownerId) {
    return null;
  }

  return (
    <div className={cn(
      "bg-slate-50 rounded-lg border border-slate-200 p-4",
      className
    )}>
      <h4 className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-3 flex items-center gap-2">
        <Clock className="h-3.5 w-3.5" />
        System Information
      </h4>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Owner - Only show if showOwner is true */}
        {showOwner && ownerId && (
          <div className="space-y-1 bg-white p-3 rounded-md border border-slate-100">
            <label className="text-xs text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
              <Crown className="h-3 w-3 text-yellow-500" />
              Record Owner
            </label>
            <div className="text-sm font-medium">
              {isLoading && !ownerName ? (
                <span className="text-slate-500 flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Loading...
                </span>
              ) : (
                <button
                  onClick={() => navigate(`/user/${ownerId}`)}
                  className="text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1.5"
                  data-testid="owner-link"
                >
                  <UserCircle className="h-4 w-4" />
                  {ownerName || 'Unknown User'}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Created At */}
        {createdAt && (
          <div className="space-y-1">
            <label className="text-xs text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
              <Calendar className="h-3 w-3" />
              Created At
            </label>
            <p className="text-sm text-slate-900">
              {formatDateTime(createdAt)}
              {formatRelativeTime(createdAt) && (
                <span className="text-xs text-slate-500 ml-1.5">
                  ({formatRelativeTime(createdAt)})
                </span>
              )}
            </p>
          </div>
        )}

        {/* Created By */}
        {createdBy && (
          <div className="space-y-1">
            <label className="text-xs text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
              <User className="h-3 w-3" />
              Created By
            </label>
            <div className="text-sm">
              {isLoading && !createdByName ? (
                <span className="text-slate-500 flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Loading...
                </span>
              ) : (
                <button
                  onClick={() => navigate(`/user/${createdBy}`)}
                  className="text-blue-600 hover:text-blue-800 hover:underline"
                  data-testid="created-by-link"
                >
                  {createdByName || 'Unknown User'}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Updated At */}
        {updatedAt && (
          <div className="space-y-1">
            <label className="text-xs text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
              <RefreshCw className="h-3 w-3" />
              Last Modified
            </label>
            <p className="text-sm text-slate-900">
              {formatDateTime(updatedAt)}
              {formatRelativeTime(updatedAt) && (
                <span className="text-xs text-slate-500 ml-1.5">
                  ({formatRelativeTime(updatedAt)})
                </span>
              )}
            </p>
          </div>
        )}

        {/* Updated By */}
        {updatedBy && (
          <div className="space-y-1">
            <label className="text-xs text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
              <User className="h-3 w-3" />
              Last Modified By
            </label>
            <div className="text-sm">
              {isLoading && !updatedByName ? (
                <span className="text-slate-500 flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Loading...
                </span>
              ) : (
                <button
                  onClick={() => navigate(`/user/${updatedBy}`)}
                  className="text-blue-600 hover:text-blue-800 hover:underline"
                  data-testid="updated-by-link"
                >
                  {updatedByName || 'Unknown User'}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AuditFieldsDisplay;
