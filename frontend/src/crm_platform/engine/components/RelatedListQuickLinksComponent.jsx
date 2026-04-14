/**
 * RelatedListQuickLinksComponent - Quick Navigation Links to Related Lists
 * 
 * 100% LAYOUT-DRIVEN - OBJECT-AGNOSTIC
 * 
 * Renders EXACTLY what's configured in layout JSON:
 * - If config has quickLinks: ["contacts", "tasks"] → renders exactly those two
 * - If config has no quickLinks → shows empty state message
 * - NO object-based defaults or hardcoding
 * 
 * UPDATED: Now includes + button to create records using full CreateRecordDialog
 * UPDATED: Listens for RECORD_CREATED_EVENT to auto-refresh counts
 * 
 * Works for ANY object (Lead, Account, Opportunity, Custom Objects)
 * 
 * Configuration Example:
 * {
 *   "quickLinks": ["contacts", "tasks", "events"]
 * }
 * 
 * Or with custom labels:
 * {
 *   "quickLinks": [
 *     { "objectType": "contact", "label": "Key Contacts" },
 *     { "objectType": "task", "label": "Open Tasks" }
 *   ]
 * }
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Calendar, CheckSquare, FileText, Mail, Phone, DollarSign, Link, Plus } from 'lucide-react';
import axios from 'axios';
import { useCreateRecord, RECORD_CREATED_EVENT } from '../../../services/createRecord';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

// Icon mapping for different related list types
const ICON_MAP = {
  contacts: Users,
  contact: Users,
  tasks: CheckSquare,
  task: CheckSquare,
  events: Calendar,
  event: Calendar,
  opportunities: DollarSign,
  opportunity: DollarSign,
  emails: Mail,
  email: Mail,
  emailmessage: Mail,
  calls: Phone,
  call: Phone,
  notes: FileText,
  note: FileText,
  documents: FileText,
  document: FileText,
  accounts: Users,
  account: Users,
};

// Default icon for unknown types
const DefaultIcon = Link;

/**
 * Check if a record is related to the parent record
 * Checks multiple relationship fields for compatibility
 */
const isRelatedToParent = (record, parentRecordId) => {
  const data = record?.data || record;
  return (
    data.related_to_id === parentRecordId ||
    data.related_to === parentRecordId ||
    data.parent_id === parentRecordId ||
    data.account_id === parentRecordId ||
    data.contact_id === parentRecordId ||
    data.lead_id === parentRecordId ||
    data.opportunity_id === parentRecordId
  );
};

/**
 * Format label from API name
 */
const formatLabel = (name) => {
  if (!name) return '';
  return name
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};

/**
 * Single Quick Link Button
 * FIX: Now properly navigates when clicked using React Router
 */
const QuickLinkButton = ({ objectType, parentRecordId, sourceObjectName, onNavigate }) => {
  const navigate = useNavigate();
  const [count, setCount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  
  // Get icon component
  const IconComponent = ICON_MAP[objectType?.toLowerCase()] || DefaultIcon;
  const normalizedType = objectType?.replace(/s$/, '');
  
  // Fetch count for this related list - ONLY related records
  useEffect(() => {
    const fetchCount = async () => {
      if (!parentRecordId || !objectType) {
        setLoading(false);
        return;
      }
      
      try {
        const token = localStorage.getItem('token');
        const headers = token ? { Authorization: `Bearer ${token}` } : {};
        
        // Fetch records and filter by relationship on client side
        const response = await axios.get(
          `${BACKEND_URL}/api/objects/${normalizedType}/records`,
          {
            headers,
            params: {
              limit: 1000, // Get enough to count properly
            }
          }
        );
        
        // Get records array
        const allRecords = response.data?.records || 
                          (Array.isArray(response.data) ? response.data : []);
        
        // Filter to only related records using consistent helper
        const relatedRecords = allRecords.filter(r => isRelatedToParent(r, parentRecordId));
        
        setCount(relatedRecords.length);
      } catch (error) {
        // If error, show 0
        console.warn(`Could not fetch count for ${objectType}:`, error.message);
        setCount(0);
      } finally {
        setLoading(false);
      }
    };
    
    fetchCount();
  }, [objectType, parentRecordId, normalizedType, refreshKey]);
  
  // Listen for record-created events
  useEffect(() => {
    const handleRecordCreated = (event) => {
      const { objectType: createdType, parentRecordId: createdParentId } = event.detail;
      if (createdType?.toLowerCase() === normalizedType && createdParentId === parentRecordId) {
        setRefreshKey(prev => prev + 1);
      }
    };
    
    window.addEventListener(RECORD_CREATED_EVENT, handleRecordCreated);
    return () => window.removeEventListener(RECORD_CREATED_EVENT, handleRecordCreated);
  }, [normalizedType, parentRecordId]);
  
  const handleClick = () => {
    console.log(`[QuickLinkButton] Clicked on ${objectType}, count=${count}, parentRecordId=${parentRecordId}`);
    
    // Try to scroll to the related list section on the current page
    const sectionId = `related-list-${objectType?.toLowerCase()}`;
    const element = document.getElementById(sectionId) || 
                    document.querySelector(`[data-related-list="${objectType?.toLowerCase()}"]`) ||
                    document.querySelector(`[data-testid="related-list-${objectType?.toLowerCase()}"]`);
    
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      // Add highlight effect
      element.classList.add('ring-2', 'ring-blue-500', 'ring-offset-2');
      setTimeout(() => {
        element.classList.remove('ring-2', 'ring-blue-500', 'ring-offset-2');
      }, 2000);
    } else {
      // Navigate to the related list view using React Router
      const listUrl = `/crm/${normalizedType}?related_to_id=${parentRecordId}&parent_object=${sourceObjectName || 'record'}`;
      navigate(listUrl);
    }
    
    // Call onNavigate callback if provided
    if (onNavigate) {
      onNavigate(objectType, parentRecordId);
    }
  };
  
  const label = formatLabel(objectType);
  
  return (
    <button
      onClick={handleClick}
      className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-lg hover:bg-blue-50 hover:border-blue-300 transition-all group cursor-pointer"
      data-testid={`quick-link-${objectType}`}
      title={`View ${label} related to this record`}
    >
      <div className="p-1.5 bg-slate-100 rounded group-hover:bg-blue-100 transition-colors">
        <IconComponent className="w-4 h-4 text-slate-600 group-hover:text-blue-600" />
      </div>
      <span className="text-sm font-medium text-slate-700 group-hover:text-blue-700">
        {label}
      </span>
      <span className="ml-auto px-2 py-0.5 text-xs font-semibold bg-slate-100 text-slate-600 rounded-full group-hover:bg-blue-100 group-hover:text-blue-700">
        {loading ? '...' : count ?? 0}
      </span>
    </button>
  );
};

/**
 * Quick Link Button with Create Option
 * Shows a + button to create new records using the full CreateRecordDialog
 * 
 * FIX: Now properly navigates to related list page when clicked using React Router
 */
const QuickLinkWithCreate = ({ objectType, parentRecordId, sourceObjectName, onCreateClick, onNavigate }) => {
  const navigate = useNavigate();
  const [count, setCount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  
  // Get icon component
  const IconComponent = ICON_MAP[objectType?.toLowerCase()] || DefaultIcon;
  const normalizedType = objectType?.replace(/s$/, '');
  
  // Fetch count for this related list
  useEffect(() => {
    const fetchCount = async () => {
      if (!parentRecordId || !objectType) {
        setLoading(false);
        return;
      }
      
      try {
        const token = localStorage.getItem('token');
        const headers = token ? { Authorization: `Bearer ${token}` } : {};
        
        const response = await axios.get(
          `${BACKEND_URL}/api/objects/${normalizedType}/records`,
          { headers, params: { limit: 1000 } }
        );
        
        const allRecords = response.data?.records || 
                          (Array.isArray(response.data) ? response.data : []);
        
        const relatedRecords = allRecords.filter(r => isRelatedToParent(r, parentRecordId));
        
        setCount(relatedRecords.length);
      } catch (error) {
        console.warn(`Could not fetch count for ${objectType}:`, error.message);
        setCount(0);
      } finally {
        setLoading(false);
      }
    };
    
    fetchCount();
  }, [objectType, parentRecordId, normalizedType, refreshKey]);
  
  // Listen for record-created events
  useEffect(() => {
    const handleRecordCreated = (event) => {
      const { objectType: createdType, parentRecordId: createdParentId } = event.detail;
      const createdTypeNorm = createdType?.toLowerCase().replace(/s$/, '');
      
      // Refresh if the created record matches this type AND is related to this parent
      // Be more generous - refresh if type matches, regardless of parent matching
      if (createdTypeNorm === normalizedType) {
        // If parent explicitly matches OR if we're on the same parent context
        if (createdParentId === parentRecordId || !createdParentId) {
          console.log(`[QuickLinkWithCreate] Refreshing ${normalizedType} count after record created`);
          // Small delay to allow backend to process
          setTimeout(() => {
            setRefreshKey(prev => prev + 1);
          }, 500);
        }
      }
    };
    
    window.addEventListener(RECORD_CREATED_EVENT, handleRecordCreated);
    return () => window.removeEventListener(RECORD_CREATED_EVENT, handleRecordCreated);
  }, [normalizedType, parentRecordId]);
  
  const handleClick = () => {
    console.log(`[QuickLinkWithCreate] Clicked on ${objectType}, count=${count}, parentRecordId=${parentRecordId}`);
    
    // First try to scroll to the related list section on the page
    const sectionId = `related-list-${objectType?.toLowerCase()}`;
    const element = document.getElementById(sectionId) || 
                    document.querySelector(`[data-related-list="${objectType?.toLowerCase()}"]`) ||
                    document.querySelector(`[data-testid="related-list-${objectType?.toLowerCase()}"]`);
    
    if (element) {
      console.log(`[QuickLinkWithCreate] Found element, scrolling to it`);
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      element.classList.add('ring-2', 'ring-blue-500', 'ring-offset-2');
      setTimeout(() => {
        element.classList.remove('ring-2', 'ring-blue-500', 'ring-offset-2');
      }, 2000);
    } else {
      // Navigate to the related object's list view filtered by parent record using React Router
      console.log(`[QuickLinkWithCreate] No element found, navigating to list view`);
      
      // Build the URL for the related list view
      const listUrl = `/crm/${normalizedType}?related_to_id=${parentRecordId}&parent_object=${sourceObjectName}`;
      
      // Use React Router for navigation
      navigate(listUrl);
    }
    
    // Call onNavigate callback if provided
    if (onNavigate) {
      onNavigate(objectType, parentRecordId);
    }
  };
  
  const label = formatLabel(objectType);
  
  return (
    <div 
      className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg overflow-hidden hover:border-blue-300 transition-all group cursor-pointer"
      data-testid={`quick-link-${objectType}`}
    >
      <button
        onClick={handleClick}
        className="flex items-center gap-2 px-3 py-2 hover:bg-blue-50 transition-all flex-1"
        title={`View ${label} related to this record`}
      >
        <div className="p-1.5 bg-slate-100 rounded group-hover:bg-blue-100 transition-colors">
          <IconComponent className="w-4 h-4 text-slate-600 group-hover:text-blue-600" />
        </div>
        <span className="text-sm font-medium text-slate-700 group-hover:text-blue-700">
          {label}
        </span>
        <span className="ml-auto px-2 py-0.5 text-xs font-semibold bg-slate-100 text-slate-600 rounded-full group-hover:bg-blue-100 group-hover:text-blue-700">
          {loading ? '...' : count ?? 0}
        </span>
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onCreateClick?.(objectType);
        }}
        className="px-2 py-2 border-l border-slate-200 hover:bg-blue-50 text-blue-600 hover:text-blue-700 transition-colors"
        title={`Create new ${label}`}
        data-testid={`quick-link-create-${objectType}`}
      >
        <Plus className="w-4 h-4" />
      </button>
    </div>
  );
};

/**
 * Main RelatedListQuickLinksComponent
 * 
 * 100% LAYOUT-DRIVEN - No object-based hardcoding.
 * Renders EXACTLY what's configured in layout JSON, nothing more.
 * 
 * UPDATED: Now includes + button to create records using full CreateRecordDialog
 * 
 * Expected config format:
 * {
 *   "quickLinks": ["contacts", "tasks", "events"]
 * }
 * 
 * If no quickLinks config exists → shows empty state (not auto-defaults)
 */
const RelatedListQuickLinksComponent = ({ config = {}, context = {} }) => {
  const { record, objectName } = context;
  const recordId = record?.id || record?.series_id;
  const { openCreateDialog } = useCreateRecord();
  
  // Get quick links ONLY from layout config - NO defaults
  const quickLinks = config.quickLinks || config.quick_links || config.lists || [];
  
  // Normalize links (handle both string array and object array formats)
  const normalizedLinks = quickLinks.map(link => {
    if (typeof link === 'string') {
      return { id: link, objectType: link, label: formatLabel(link) };
    }
    return {
      id: link.id || link.objectType || link,
      objectType: link.objectType || link.object_type || link.id || link,
      label: link.label || link.name || formatLabel(link.objectType || link.id),
    };
  });

  // Handle create click - opens full CreateRecordDialog
  const handleCreateClick = (relatedObjectType) => {
    openCreateDialog(relatedObjectType, {
      parentRecordId: recordId,
      sourceObject: objectName,
    });
  };
  
  // Empty state if no links configured
  if (normalizedLinks.length === 0) {
    return (
      <div 
        className="bg-white rounded-lg shadow-sm border border-slate-200 p-4"
        data-testid="related-list-quick-links-component"
      >
        <h3 className="text-sm font-semibold text-slate-700 mb-2">Related List Quick Links</h3>
        <p className="text-xs text-slate-400 text-center py-2">
          No quick links configured. Add links in Lightning App Builder.
        </p>
      </div>
    );
  }
  
  // No record context - don't render
  if (!recordId) {
    return null;
  }
  
  return (
    <div 
      className="bg-white rounded-lg shadow-sm border border-slate-200 p-4"
      data-testid="related-list-quick-links-component"
    >
      <h3 className="text-sm font-semibold text-slate-700 mb-3">Related List Quick Links</h3>
      
      <div className="flex flex-wrap gap-2">
        {normalizedLinks.map((link, idx) => (
          <QuickLinkWithCreate
            key={link.id || idx}
            objectType={link.objectType}
            parentRecordId={recordId}
            sourceObjectName={objectName}
            onCreateClick={handleCreateClick}
          />
        ))}
      </div>
    </div>
  );
};

export default RelatedListQuickLinksComponent;
