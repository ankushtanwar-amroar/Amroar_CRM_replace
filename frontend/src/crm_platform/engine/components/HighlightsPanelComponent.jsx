/**
 * HighlightsPanelComponent - Dynamic Highlights / Key Info Panel
 * 
 * Renders a highlights panel showing key record information and action buttons.
 * Similar to Salesforce's Compact Layout or Highlights Panel.
 * 
 * Config options from Lightning Builder:
 * - displayFields: Array of field keys to display
 * - visibleActionButton: Boolean to show/hide action buttons
 * - selectedActions: Array of action IDs to display (if empty, shows default active actions)
 * - showAsCollapsed: Boolean to show in collapsed state
 * 
 * Enhanced Features:
 * - Shows Record Owner prominently with avatar
 * - Owner name is clickable (navigates to user profile)
 */
import React, { useState, useEffect } from 'react';
import { Button } from '../../../components/ui/button';
import { 
  ChevronDown, ChevronRight, Plus, Edit, Trash2, 
  Globe, Zap, FileText, ExternalLink, UserCircle, Loader2
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

// Cache for user names
const userNameCache = {};

/**
 * Fetch user by ID with caching
 */
const fetchUserName = async (userId, token) => {
  if (!userId) return null;
  if (userNameCache[userId]) return userNameCache[userId];
  
  try {
    const response = await fetch(`${API_URL}/api/users/${userId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (response.ok) {
      const user = await response.json();
      const userData = {
        name: `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email || 'Unknown User',
        firstName: user.first_name,
        lastName: user.last_name,
        email: user.email,
        avatarUrl: user.avatar_url || user.profile_photo_url
      };
      userNameCache[userId] = userData;
      return userData;
    }
  } catch (error) {
    console.error('Error fetching user:', error);
  }
  return { name: 'Unknown User', firstName: '', lastName: '', email: '' };
};

/**
 * OwnerDisplay - Salesforce-style owner display with avatar
 */
const OwnerDisplay = ({ ownerId, label = "Owner" }) => {
  const navigate = useNavigate();
  const [ownerData, setOwnerData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const loadOwner = async () => {
      if (!ownerId) return;
      setIsLoading(true);
      const token = localStorage.getItem('token');
      const data = await fetchUserName(ownerId, token);
      setOwnerData(data);
      setIsLoading(false);
    };
    loadOwner();
  }, [ownerId]);

  if (!ownerId) return null;

  const handleClick = () => {
    navigate(`/users/${ownerId}`);
  };

  // Get initials for avatar
  const getInitials = () => {
    if (ownerData?.firstName && ownerData?.lastName) {
      return `${ownerData.firstName[0]}${ownerData.lastName[0]}`.toUpperCase();
    }
    if (ownerData?.name) {
      const parts = ownerData.name.split(' ');
      if (parts.length >= 2) {
        return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
      }
      return ownerData.name.substring(0, 2).toUpperCase();
    }
    return '??';
  };

  return (
    <div className="flex items-center gap-3">
      <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">
        {label}
      </span>
      {isLoading ? (
        <span className="flex items-center gap-2 text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Loading...</span>
        </span>
      ) : (
        <button
          onClick={handleClick}
          className="flex items-center gap-2 hover:bg-slate-100 rounded-full px-2 py-1 transition-colors group"
          title={`View ${ownerData?.name || 'Owner'} Profile`}
          data-testid="owner-header-link"
        >
          {/* Avatar */}
          {ownerData?.avatarUrl ? (
            <img 
              src={ownerData.avatarUrl} 
              alt={ownerData?.name} 
              className="h-6 w-6 rounded-full object-cover"
            />
          ) : (
            <div className="h-6 w-6 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white text-xs font-medium">
              {getInitials()}
            </div>
          )}
          {/* Name */}
          <span className="text-sm font-medium text-blue-600 group-hover:text-blue-800 group-hover:underline">
            {ownerData?.name || 'Unknown User'}
          </span>
        </button>
      )}
    </div>
  );
};

/**
 * Render field value with formatting
 */
const renderValue = (value, field) => {
  if (value === null || value === undefined || value === '') {
    return <span className="text-slate-400">—</span>;
  }
  
  const fieldType = field?.type?.toLowerCase() || 'text';
  
  switch (fieldType) {
    case 'currency':
      return `${field?.currency_symbol || '$'}${Number(value).toLocaleString()}`;
    case 'percent':
      return `${value}%`;
    case 'date':
      return new Date(value).toLocaleDateString();
    case 'datetime':
      return new Date(value).toLocaleString();
    case 'checkbox':
    case 'boolean':
      return value ? 'Yes' : 'No';
    case 'email':
      return <a href={`mailto:${value}`} className="text-blue-600 hover:underline">{value}</a>;
    case 'phone':
      return <a href={`tel:${value}`} className="text-blue-600 hover:underline">{value}</a>;
    case 'url':
      return <a href={value} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{value}</a>;
    default:
      return String(value);
  }
};

/**
 * Get icon component for action type
 */
const getActionIcon = (action) => {
  const type = action?.type || '';
  if (type === 'SYSTEM_CREATE' || type === 'CREATE_RECORD') return Plus;
  if (type === 'SYSTEM_EDIT') return Edit;
  if (type === 'SYSTEM_DELETE') return Trash2;
  if (type === 'OPEN_URL') return ExternalLink;
  if (type === 'RUN_FLOW') return Zap;
  return FileText;
};

/**
 * Execute action based on type
 */
const executeAction = async (action, recordId, objectName, navigate, onRefresh) => {
  const type = action?.type || '';
  const configJson = action?.config_json || {};
  
  switch (type) {
    case 'SYSTEM_EDIT':
      navigate(`/crm/${objectName}/${recordId}/edit`);
      break;
    case 'SYSTEM_DELETE':
      if (window.confirm('Are you sure you want to delete this record?')) {
        try {
          const token = localStorage.getItem('token');
          const API_URL = process.env.REACT_APP_BACKEND_URL || '';
          const response = await fetch(`${API_URL}/api/crm/${objectName}/${recordId}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` }
          });
          if (response.ok) {
            toast.success('Record deleted successfully');
            navigate(`/crm/${objectName}`);
          } else {
            toast.error('Failed to delete record');
          }
        } catch (err) {
          toast.error('Error deleting record');
        }
      }
      break;
    case 'OPEN_URL':
      if (configJson.url_template) {
        // URL template can have placeholders like {{Record.Name}}
        let url = configJson.url_template;
        // Simple placeholder replacement - in real app, would use record data
        window.open(url, '_blank');
      }
      break;
    case 'RUN_FLOW':
      toast.info('Flow execution not yet implemented');
      break;
    case 'CREATE_RECORD':
      const targetObject = configJson.target_object || objectName;
      navigate(`/crm/${targetObject}/new`);
      break;
    default:
      toast.info(`Action type ${type} not implemented`);
  }
};

/**
 * Main HighlightsPanelComponent
 */
const HighlightsPanelComponent = ({ config = {}, context = {} }) => {
  const navigate = useNavigate();
  const { id: recordId } = useParams();
  const { record, objectFields = {}, objectName } = context;
  const recordData = record?.data || record || {};
  
  // Get owner_id from record (top-level, not in data)
  const ownerId = record?.owner_id || record?.ownerId;
  
  // State for actions
  const [actions, setActions] = useState([]);
  const [loadingActions, setLoadingActions] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(config.showAsCollapsed || false);
  
  // Get display settings from config
  const visibleActionButton = config.visibleActionButton !== false;
  const selectedActionIds = config.selectedActions || [];
  
  // Get owner label based on object type
  const ownerLabel = React.useMemo(() => {
    const labels = {
      contact: 'Contact Owner',
      account: 'Account Owner',
      lead: 'Lead Owner',
      opportunity: 'Opportunity Owner',
      deal: 'Deal Owner',
      task: 'Assigned To',
      event: 'Assigned To',
    };
    return labels[objectName?.toLowerCase()] || 'Owner';
  }, [objectName]);
  
  // Get fields to display from config - use displayFields (from builder) or fields (legacy)
  let displayFields = config.displayFields || config.fields || [];
  
  // If no fields configured, show smart defaults
  if (displayFields.length === 0) {
    const commonFields = ['name', 'email', 'phone', 'status', 'stage', 'company', 'website'];
    displayFields = commonFields.filter(f => objectFields[f] || recordData[f]);
  }
  
  // Fetch actions when component mounts
  useEffect(() => {
    const fetchActions = async () => {
      if (!visibleActionButton || !objectName) return;
      
      try {
        setLoadingActions(true);
        const token = localStorage.getItem('token');
        const API_URL = process.env.REACT_APP_BACKEND_URL || '';
        const response = await fetch(
          `${API_URL}/api/actions?object=${objectName.toLowerCase()}&action_context=RECORD_DETAIL&active_only=true`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        
        if (response.ok) {
          const data = await response.json();
          setActions(data || []);
        }
      } catch (err) {
        console.error('Error fetching actions for highlights panel:', err);
      } finally {
        setLoadingActions(false);
      }
    };
    
    fetchActions();
  }, [objectName, visibleActionButton]);
  
  // Get actions to display based on selection
  const displayActions = React.useMemo(() => {
    if (selectedActionIds.length === 0) {
      // No explicit selection - show all active actions (up to 5)
      return actions.slice(0, 5);
    }
    // Show only selected actions in the order they were selected
    return selectedActionIds
      .map(id => actions.find(a => a.id === id))
      .filter(Boolean);
  }, [actions, selectedActionIds]);
  
  // Handle collapsed state
  if (isCollapsed) {
    return (
      <div 
        className="bg-gradient-to-r from-slate-50 to-white rounded-lg border border-slate-200 p-3 mb-4 cursor-pointer hover:bg-slate-100 transition-colors"
        data-testid="highlights-panel-collapsed"
        onClick={() => setIsCollapsed(false)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ChevronRight className="h-4 w-4 text-slate-500" />
            <span className="text-sm font-medium text-slate-700">Highlights Panel</span>
            <span className="text-xs text-slate-500">({displayFields.length} fields)</span>
          </div>
          {visibleActionButton && displayActions.length > 0 && (
            <span className="text-xs text-slate-500">{displayActions.length} actions</span>
          )}
        </div>
      </div>
    );
  }
  
  return (
    <div 
      className="bg-gradient-to-r from-slate-50 to-white rounded-lg border border-slate-200 p-4 mb-4"
      data-testid="highlights-panel-component"
    >
      {/* Owner and Actions Row - Salesforce Style Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 mb-3 border-b border-slate-200">
        {/* Owner Display - Left Side */}
        {ownerId && (
          <OwnerDisplay ownerId={ownerId} label={ownerLabel} />
        )}
        
        {/* Action Buttons - Right Side */}
        {visibleActionButton && (
          <div className="flex flex-wrap items-center gap-2 ml-auto">
            {loadingActions ? (
              <span className="text-xs text-slate-400">Loading actions...</span>
            ) : displayActions.length > 0 ? (
              displayActions.map((action) => {
                const Icon = getActionIcon(action);
                const isDelete = action.type === 'SYSTEM_DELETE';
                
                return (
                  <Button
                    key={action.id}
                    variant={isDelete ? 'destructive' : 'outline'}
                    size="sm"
                    className={`h-8 text-xs gap-1.5 ${isDelete ? '' : 'bg-white hover:bg-slate-50'}`}
                    onClick={() => executeAction(action, recordId, objectName, navigate)}
                    data-testid={`highlights-action-${action.api_name}`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {action.label}
                  </Button>
                );
              })
            ) : null}
            
            {/* Collapse button */}
            {config.showAsCollapsed !== undefined && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs"
                onClick={() => setIsCollapsed(true)}
              >
                <ChevronDown className="h-3.5 w-3.5 mr-1" />
                Collapse
              </Button>
            )}
          </div>
        )}
      </div>
      
      {/* Fields Section */}
      {displayFields.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {displayFields.map((fieldKey, idx) => {
            const field = objectFields[fieldKey] || {};
            const value = recordData[fieldKey];
            
            return (
              <div key={`highlight-${fieldKey}-${idx}`} className="text-center">
                <dt className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">
                  {field.label || fieldKey.replace(/_/g, ' ')}
                </dt>
                <dd className="text-sm font-semibold text-slate-900 break-words">
                  {renderValue(value, field)}
                </dd>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-4 text-slate-400 text-sm">
          No fields configured for this Highlights Panel
        </div>
      )}
    </div>
  );
};

export default HighlightsPanelComponent;
