/**
 * LookupField - Smart Lookup Field Display with Hover Preview
 * 
 * 100% METADATA-DRIVEN - Uses schema to resolve lookup values
 * 
 * Features:
 * - Displays referenced record's name instead of raw ID
 * - Shows hover preview card with key fields FROM CONFIGURATION
 * - Clickable link to navigate to referenced record (Salesforce UX)
 * - Caches resolved values to prevent repeated API calls
 * 
 * UX Behavior (Salesforce standard):
 * - Hover = Shows preview card
 * - Click = Navigates to record (never blocked by hover)
 * - Clean separation of hover and click interactions
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { ExternalLink, Loader2, User, Building, FileText } from 'lucide-react';
import { useConsoleSafe } from '../../contexts/ConsoleContext';

// Safe navigate hook that handles being outside router context
const useSafeNavigate = () => {
  try {
    const navigate = useNavigate();
    return navigate;
  } catch (error) {
    // If not in router context, return a fallback function
    console.warn('[LookupField] Not in Router context, navigation will use window.location');
    return (path) => {
      window.location.href = path;
    };
  }
};

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Simple in-memory cache for lookup values
const lookupCache = new Map();

// Cache for lookup configurations
const lookupConfigCache = new Map();
const CONFIG_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

// Icon mapping for object types
const OBJECT_ICONS = {
  account: Building,
  contact: User,
  lead: User,
  opportunity: FileText,
  task: FileText,
  event: FileText,
};

/**
 * Fetch lookup configuration for a field
 */
const fetchLookupConfig = async (sourceObject, fieldName) => {
  if (!sourceObject || !fieldName) return null;
  
  const cacheKey = `config:${sourceObject}:${fieldName}`;
  const cached = lookupConfigCache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < CONFIG_CACHE_TTL) {
    return cached.data;
  }
  
  try {
    const token = localStorage.getItem('token');
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    
    const response = await axios.get(
      `${API}/lookup-hover-assignments/object/${sourceObject}/field/${fieldName}`,
      { headers }
    );
    
    const config = response.data;
    lookupConfigCache.set(cacheKey, { data: config, timestamp: Date.now() });
    return config;
  } catch (error) {
    console.warn(`Could not fetch lookup config for ${sourceObject}/${fieldName}:`, error.message);
    return null;
  }
};

/**
 * Fetch a single record by ID from an object
 */
const fetchRecord = async (objectType, recordId) => {
  const cacheKey = `${objectType}:${recordId}`;
  
  // Check cache first
  if (lookupCache.has(cacheKey)) {
    return lookupCache.get(cacheKey);
  }
  
  try {
    const token = localStorage.getItem('token');
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    
    // Use the correct API endpoint format
    const response = await axios.get(
      `${API}/objects/${objectType}/records/${recordId}`,
      { headers }
    );
    
    const record = response.data;
    
    // Cache the result
    lookupCache.set(cacheKey, record);
    
    return record;
  } catch (error) {
    console.warn(`Could not fetch ${objectType}/${recordId}:`, error.message);
    return null;
  }
};

/**
 * Extract display name from record data using configured primary display field
 */
const getDisplayName = (record, objectType, primaryDisplayField = 'name') => {
  if (!record) return null;
  
  const data = record.data || record;
  
  // First, try the configured primary display field
  if (primaryDisplayField && data[primaryDisplayField]) {
    return data[primaryDisplayField];
  }
  
  // Fallback: Try common name fields in order of preference
  const nameFields = [
    'name',
    'full_name',
    'account_name',
    'first_name', // Will combine with last_name
    'subject',
    'title',
    'label',
    'display_name',
    'company',
  ];
  
  for (const field of nameFields) {
    if (data[field]) {
      // For contacts/leads, combine first and last name
      if (field === 'first_name' && data.last_name) {
        return `${data.first_name} ${data.last_name}`;
      }
      return data[field];
    }
  }
  
  // Last resort: use public_id (cleaner than full UUID)
  if (record.public_id) {
    return record.public_id;
  }
  
  // If no name found and we have an ID, return null to trigger fallback display
  return null;
};

/**
 * Hover Preview Card Component - Uses configuration for preview fields
 */
const HoverPreviewCard = ({ 
  record, 
  objectType, 
  loading, 
  onNavigate, 
  position,
  onMouseEnter,
  onMouseLeave,
  configuredPreviewFields = [],
  primaryDisplayField = 'name'
}) => {
  const cardRef = useRef(null);
  
  // Calculate position to ensure card stays in viewport
  const getCardStyle = () => {
    const style = {
      position: 'fixed',
      zIndex: 99999,
      top: position.y,
      left: position.x,
    };
    
    // Adjust if card would go off-screen
    if (position.x + 320 > window.innerWidth) {
      style.left = position.x - 340;
    }
    if (position.y + 250 > window.innerHeight) {
      style.top = position.y - 250;
    }
    
    return style;
  };
  
  if (loading) {
    return createPortal(
      <div 
        ref={cardRef}
        style={getCardStyle()}
        className="w-72 bg-white rounded-lg shadow-lg border border-slate-200 p-4 flex items-center gap-2"
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
        <span className="text-sm text-slate-500">Loading...</span>
      </div>,
      document.body
    );
  }
  
  if (!record) {
    return createPortal(
      <div 
        ref={cardRef}
        style={getCardStyle()}
        className="w-72 bg-white rounded-lg shadow-lg border border-slate-200 p-4 text-sm text-slate-500"
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        Record not found
      </div>,
      document.body
    );
  }
  
  const data = record.data || record;
  const Icon = OBJECT_ICONS[objectType?.toLowerCase()] || FileText;
  const displayName = getDisplayName(record, objectType, primaryDisplayField);
  
  // Build preview fields from configuration (Single Source of Truth)
  const previewFields = [];
  
  const hasConfiguredFields = configuredPreviewFields && 
    Array.isArray(configuredPreviewFields) && 
    configuredPreviewFields.length > 0;
  
  if (hasConfiguredFields) {
    // Use ONLY configured fields from Display & Search
    configuredPreviewFields.forEach(fieldConfig => {
      const fieldKey = typeof fieldConfig === 'string' 
        ? fieldConfig 
        : (fieldConfig.key || fieldConfig.field_name || fieldConfig.name);
      
      const fieldLabel = typeof fieldConfig === 'string'
        ? fieldKey.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
        : (fieldConfig.label || fieldKey.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()));
      
      const value = data[fieldKey];
      
      // Always add the field if configured, show dash for empty
      let displayValue = value;
      
      if (value === undefined || value === null || value === '') {
        displayValue = '-';
      } else {
        // Format amounts
        if (fieldKey.includes('amount') || fieldKey.includes('price')) {
          displayValue = `$${Number(value).toLocaleString()}`;
        }
        // Format dates
        else if (fieldKey.includes('date') || fieldKey.includes('_at') || fieldKey.includes('time')) {
          try {
            const date = new Date(value);
            if (!isNaN(date.getTime())) {
              displayValue = date.toLocaleString();
            }
          } catch (e) {
            // Keep original value
          }
        }
        // Format booleans
        else if (typeof value === 'boolean') {
          displayValue = value ? 'Yes' : 'No';
        }
      }
      
      previewFields.push({ key: fieldKey, label: fieldLabel, value: displayValue });
    });
  } else {
    // Fallback: Show primary display field only if no configuration exists
    if (primaryDisplayField && data[primaryDisplayField]) {
      previewFields.push({
        key: primaryDisplayField,
        label: primaryDisplayField.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        value: data[primaryDisplayField]
      });
    }
  }
  
  return createPortal(
    <div 
      ref={cardRef}
      style={getCardStyle()}
      className="w-72 bg-white rounded-lg shadow-xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {/* Header */}
      <div className="px-4 py-3 bg-gradient-to-r from-slate-50 to-white border-b">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-blue-100 rounded">
            <Icon className="h-4 w-4 text-blue-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-slate-500 uppercase">{objectType}</p>
            <p className="text-sm font-semibold text-slate-800 truncate">{displayName}</p>
          </div>
        </div>
      </div>
      
      {/* Preview Fields - strictly from configuration */}
      {previewFields.length > 0 && (
        <div className="px-4 py-3 space-y-2">
          {previewFields.slice(0, 6).map(field => (
            <div key={field.key} className="flex items-center gap-2 text-sm">
              <span className="text-slate-500 min-w-[90px] text-xs">{field.label}:</span>
              <span className="text-slate-700 truncate flex-1">{field.value}</span>
            </div>
          ))}
        </div>
      )}
      
      {/* Show message if no preview fields */}
      {previewFields.length === 0 && (
        <div className="px-4 py-3 text-sm text-slate-400 italic">
          No preview fields configured
        </div>
      )}
      
      {/* Footer */}
      <div className="px-4 py-2 bg-slate-50 border-t">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onNavigate(e);
          }}
          className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 transition-colors"
        >
          <ExternalLink className="h-3 w-3" />
          Open Record
        </button>
      </div>
    </div>,
    document.body
  );
};

/**
 * Main LookupField Component
 */
const LookupField = ({ 
  value,          // The lookup ID value
  objectType,     // The referenced object type (e.g., 'account', 'contact')
  sourceObject,   // The source object containing this field (for config lookup)
  fieldName,      // Field name for context
  showPreview = true, // Whether to show hover preview
  className = '',
  onNavigate: onNavigateProp = null, // Optional callback for navigation (from parent context)
}) => {
  const consoleContext = useConsoleSafe();
  const navigate = useSafeNavigate();
  const [displayName, setDisplayName] = useState(null);
  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [showHover, setShowHover] = useState(false);
  const [hoverPosition, setHoverPosition] = useState({ x: 0, y: 0 });
  const [lookupConfig, setLookupConfig] = useState(null);
  
  // Refs for hover timing
  const hoverTimeoutRef = useRef(null);
  const closeTimeoutRef = useRef(null);
  const isHoveringCardRef = useRef(false);
  const linkRef = useRef(null);
  
  // Get configured display field
  const primaryDisplayField = lookupConfig?.primary_display_field || 'name';
  
  // Fetch lookup configuration on mount
  useEffect(() => {
    const loadConfig = async () => {
      if (sourceObject && fieldName) {
        const config = await fetchLookupConfig(sourceObject, fieldName);
        setLookupConfig(config);
      }
    };
    loadConfig();
  }, [sourceObject, fieldName]);
  
  // Fetch display name on mount or when config changes
  useEffect(() => {
    const resolveDisplayName = async () => {
      if (!value || !objectType) {
        setDisplayName(null);
        return;
      }
      
      // Check if value is already a name (not a UUID)
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
      if (!isUUID) {
        setDisplayName(value);
        return;
      }
      
      setLoading(true);
      const fetchedRecord = await fetchRecord(objectType, value);
      setRecord(fetchedRecord);
      
      // Get display name using configured primary display field
      let name = getDisplayName(fetchedRecord, objectType, primaryDisplayField);
      if (!name && fetchedRecord) {
        // Record exists but has no name - show "Unnamed [ObjectType]" or truncated ID
        name = `${objectType?.charAt(0).toUpperCase()}${objectType?.slice(1) || ''} Record`;
      }
      setDisplayName(name || value.substring(0, 8) + '...');
      setLoading(false);
    };
    
    resolveDisplayName();
  }, [value, objectType, primaryDisplayField]);
  
  // Handle hover with delay - show preview after short delay
  const handleMouseEnter = useCallback((e) => {
    if (!showPreview || !value || !objectType) return;
    
    // Clear any pending close
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    
    // Set position for the hover card
    const rect = e.currentTarget.getBoundingClientRect();
    setHoverPosition({
      x: rect.right + 10,
      y: rect.top + rect.height / 2
    });
    
    // Show after a short delay (300ms)
    hoverTimeoutRef.current = setTimeout(async () => {
      setShowHover(true);
      
      // If we don't have the record yet, fetch it
      if (!record) {
        setPreviewLoading(true);
        const fetchedRecord = await fetchRecord(objectType, value);
        setRecord(fetchedRecord);
        setPreviewLoading(false);
      }
    }, 300);
  }, [showPreview, value, objectType, record]);
  
  // Handle mouse leave with delay to allow moving to card
  const handleMouseLeave = useCallback(() => {
    // Clear pending show
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    
    // Delay close to allow moving to hover card
    closeTimeoutRef.current = setTimeout(() => {
      // Only close if not hovering the card
      if (!isHoveringCardRef.current) {
        setShowHover(false);
      }
    }, 200);
  }, []);
  
  // Handle card mouse enter
  const handleCardMouseEnter = useCallback(() => {
    // Clear any pending close
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    isHoveringCardRef.current = true;
  }, []);
  
  // Handle card mouse leave
  const handleCardMouseLeave = useCallback(() => {
    isHoveringCardRef.current = false;
    
    // Close after delay
    closeTimeoutRef.current = setTimeout(() => {
      if (!isHoveringCardRef.current) {
        setShowHover(false);
      }
    }, 150);
  }, []);
  
  // Handle click - navigate to record (NEVER blocked by hover)

  const handleClick = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Close hover preview
    setShowHover(false);
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
    
    // Get record identifier - prefer series_id (human-readable)
    const recordIdentifier = record?.series_id || record?.public_id || value;
    
    // Priority 1: Use prop callback (from parent context like SalesConsole)
    if (onNavigateProp) {
      onNavigateProp(objectType, recordIdentifier, displayName);
      return;
    }
    
    // Priority 2: Use console context if available
    if (consoleContext?.openRecordAsSubtab) {
      consoleContext.openRecordAsSubtab(objectType, value, record?.public_id, displayName);
      return;
    }
    if (consoleContext?.openRecordAsPrimary) {
      consoleContext.openRecordAsPrimary(objectType, value, record?.public_id, displayName);
      return;
    }
    
    // Priority 3: Fallback to React Router navigation
    // Use /crm/:objectName/:recordId route pattern
    navigate(`/crm/${objectType}/${recordIdentifier}`);
  }, [consoleContext, objectType, value, record, displayName, navigate, onNavigateProp]);
  
  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
      if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
    };
  }, []);
  
  // If no value, show empty state
  if (!value) {
    return <span className="text-slate-400 italic">—</span>;
  }
  
  // Loading state
  if (loading) {
    return (
      <span className="inline-flex items-center gap-1 text-slate-500">
        <Loader2 className="h-3 w-3 animate-spin" />
        <span className="text-xs">Loading...</span>
      </span>
    );
  }
  
  return (
    <>
      {/* Link element - always clickable, hover does NOT block click */}
      <a
        ref={linkRef}
        href={`#${objectType}/${value}`}
        onClick={handleClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={`text-blue-600 hover:text-blue-800 hover:underline cursor-pointer ${className}`}
        data-testid={`lookup-field-${fieldName}`}
      >
        {displayName || value}
      </a>
      
      {/* Hover Preview Card - rendered via portal, does NOT block clicks */}
      {showHover && showPreview && (
        <HoverPreviewCard 
          record={record}
          objectType={objectType}
          loading={previewLoading}
          onNavigate={handleClick}
          position={hoverPosition}
          onMouseEnter={handleCardMouseEnter}
          onMouseLeave={handleCardMouseLeave}
          configuredPreviewFields={lookupConfig?.preview_fields || []}
          primaryDisplayField={primaryDisplayField}
        />
      )}
    </>
  );
};

/**
 * Clear the lookup cache (useful after record updates)
 */
export const clearLookupCache = (objectType = null, recordId = null) => {
  if (objectType && recordId) {
    lookupCache.delete(`${objectType}:${recordId}`);
  } else if (objectType) {
    // Clear all entries for this object type
    for (const key of lookupCache.keys()) {
      if (key.startsWith(`${objectType}:`)) {
        lookupCache.delete(key);
      }
    }
  } else {
    lookupCache.clear();
  }
};

export default LookupField;
