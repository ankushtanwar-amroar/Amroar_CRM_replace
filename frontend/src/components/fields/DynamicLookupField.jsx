/**
 * DynamicLookupField - Salesforce-style Lookup Field Component
 * 
 * A reusable, metadata-driven lookup field that provides:
 * - Rich dropdown with search
 * - Recent records section
 * - Live search with debounce
 * - "+ New Record" option (opens full CreateRecordDialog)
 * - Hover preview card
 * - Click-to-navigate functionality
 * 
 * Used in: CreateRecordDialog, Inline Edit, Related Lists, Flow Forms
 */
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { 
  Search, 
  X, 
  Plus, 
  Loader2, 
  Clock, 
  ChevronDown,
  ChevronUp,
  Building2,
  User,
  FileText,
  ExternalLink,
  AlertCircle
} from 'lucide-react';
import { useConsoleSafe } from '../../crm_platform/contexts/ConsoleContext';
import { useCreateRecord } from '../../services/createRecord/CreateRecordService';
import { cn } from '../../lib/utils';

// Safe navigate hook that handles being outside router context
const useSafeNavigate = () => {
  try {
    const navigate = useNavigate();
    return navigate;
  } catch (error) {
    // If not in router context, return a fallback function
    console.warn('[DynamicLookupField] Not in Router context, navigation will use window.location');
    return (path) => {
      window.location.href = path;
    };
  }
};

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Cache for recent records per object type
const recentRecordsCache = new Map();
const RECENT_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Cache for resolved record names
const resolvedNamesCache = new Map();

// Icon mapping for object types
const OBJECT_ICONS = {
  account: Building2,
  contact: User,
  lead: User,
  opportunity: FileText,
  task: FileText,
  event: FileText,
  user: User,  // Add user icon mapping
};

/**
 * Format object name to human-readable label
 * Handles underscores, capitalization, and proper pluralization
 */
const formatObjectLabel = (objectType) => {
  if (!objectType) return 'Record';
  
  // Replace underscores and hyphens with spaces
  let label = String(objectType).replace(/[_-]/g, ' ');
  
  // Capitalize each word
  label = label.replace(/\b\w/g, char => char.toUpperCase());
  
  // Handle special cases for proper English
  const specialCases = {
    'Territory': 'Territory',
    'Territorys': 'Territories',
    'Activitys': 'Activities',
    'Opportunitys': 'Opportunities',
    'Companys': 'Companies',
    'Categorys': 'Categories',
    'Entitys': 'Entities',
    'Historys': 'Histories',
  };
  
  // Apply special case fixes
  Object.entries(specialCases).forEach(([wrong, correct]) => {
    label = label.replace(new RegExp(wrong, 'gi'), correct);
  });
  
  // Remove trailing 's' if singular form is needed
  // (we'll add proper plural later)
  if (label.endsWith('s') && !label.endsWith('ss')) {
    // Keep it as is for now - we handle plural in the template
  }
  
  return label.trim();
};

/**
 * Get proper plural form of an object label
 */
const getPluralLabel = (label) => {
  if (!label) return 'Records';
  
  // Already plural patterns
  if (label.endsWith('ies') || label.endsWith('es')) return label;
  
  // Handle special pluralization
  if (label.endsWith('y') && !['ay', 'ey', 'iy', 'oy', 'uy'].some(v => label.endsWith(v))) {
    return label.slice(0, -1) + 'ies';
  }
  if (label.endsWith('s') || label.endsWith('x') || label.endsWith('z') || 
      label.endsWith('ch') || label.endsWith('sh')) {
    return label + 'es';
  }
  if (label.endsWith('s')) {
    return label; // Already plural
  }
  
  return label + 's';
};

/**
 * Get auth headers for API calls
 */
const getAuthHeaders = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

/**
 * Debounce hook
 */
const useDebounce = (value, delay) => {
  const [debouncedValue, setDebouncedValue] = useState(value);
  
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);
    
    return () => clearTimeout(handler);
  }, [value, delay]);
  
  return debouncedValue;
};

// Cache for lookup configurations
const lookupConfigCache = new Map();
const LOOKUP_CONFIG_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

/**
 * Fetch lookup configuration for a field
 */
const fetchLookupConfig = async (sourceObject, fieldName) => {
  const cacheKey = `${sourceObject}:${fieldName}`;
  const cached = lookupConfigCache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < LOOKUP_CONFIG_CACHE_TTL) {
    return cached.data;
  }
  
  try {
    const response = await axios.get(
      `${API}/lookup-hover-assignments/object/${sourceObject}/field/${fieldName}`,
      { headers: getAuthHeaders() }
    );
    
    const config = response.data;
    lookupConfigCache.set(cacheKey, { data: config, timestamp: Date.now() });
    return config;
  } catch (error) {
    console.warn(`[DynamicLookup] Failed to fetch lookup config for ${sourceObject}/${fieldName}:`, error);
    return null;
  }
};

/**
 * Extract display name from record using configured display field
 */
const getDisplayNameWithConfig = (record, primaryDisplayField) => {
  if (!record) return null;
  const data = record?.data || record;
  
  // First try the configured primary display field
  if (primaryDisplayField && data[primaryDisplayField]) {
    return data[primaryDisplayField];
  }
  
  // Fallback to common display fields
  return data?.name || 
    data?.display_value ||
    (data?.first_name && data?.last_name ? `${data.first_name} ${data.last_name}`.trim() : null) ||
    data?.account_name ||
    data?.subject ||
    data?.title ||
    data?.email ||
    null;
};

/**
 * Transform records to include display_value based on config
 */
const transformRecordsWithDisplayField = (records, primaryDisplayField) => {
  return records.map(record => {
    const displayValue = getDisplayNameWithConfig(record, primaryDisplayField);
    return {
      ...record,
      display_value: displayValue || record?.id || 'Unnamed'
    };
  });
};

/**
 * Fetch recent records for an object type
 */
const fetchRecentRecords = async (objectType, limit = 5) => {
  const cacheKey = objectType;
  const cached = recentRecordsCache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < RECENT_CACHE_TTL) {
    return cached.data;
  }
  
  try {
    // Special handling for user lookups - use /api/users endpoint
    if (objectType === 'user') {
      const response = await axios.get(
        `${API}/users?limit=${limit}`,
        { headers: getAuthHeaders() }
      );
      
      const users = response.data || [];
      // Transform users to match expected record format
      const records = users.map(user => ({
        ...user,
        series_id: user.id,
        display_value: user.display_value || user.name || `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email,
        secondary_value: user.email
      }));
      
      recentRecordsCache.set(cacheKey, { data: records, timestamp: Date.now() });
      return records;
    }
    
    // Standard object lookup
    const response = await axios.get(
      `${API}/objects/${objectType}/records?limit=${limit}&sort=-updated_at`,
      { headers: getAuthHeaders() }
    );
    
    const records = response.data?.records || response.data || [];
    recentRecordsCache.set(cacheKey, { data: records, timestamp: Date.now() });
    return records;
  } catch (error) {
    console.warn(`[DynamicLookup] Failed to fetch recent ${objectType} records:`, error);
    return [];
  }
};

/**
 * Search records using the lookup search API
 */
const searchRecords = async (objectType, query, sourceObject, fieldName, limit = 10) => {
  try {
    // Special handling for user lookups - use /api/users endpoint with search
    if (objectType === 'user') {
      const response = await axios.get(
        `${API}/users?search=${encodeURIComponent(query)}&limit=${limit}`,
        { headers: getAuthHeaders() }
      );
      
      const users = response.data || [];
      // Transform users to match expected record format
      return users.map(user => ({
        ...user,
        series_id: user.id,
        display_value: user.display_value || user.name || `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email,
        secondary_value: user.email
      }));
    }
    
    // Standard object lookup search
    const response = await axios.post(
      `${API}/fields/lookup/search`,
      {
        object: objectType,
        query: query,
        source_object: sourceObject,
        field_name: fieldName,
        limit: limit
      },
      { headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' } }
    );
    
    return response.data || [];
  } catch (error) {
    console.warn(`[DynamicLookup] Failed to search ${objectType} records:`, error);
    // Fallback to basic search
    return fetchRecentRecords(objectType, limit);
  }
};

/**
 * Resolve a record ID to its display name
 */
const resolveRecordName = async (objectType, recordId) => {
  if (!recordId || !objectType) return null;
  
  const cacheKey = `${objectType}:${recordId}`;
  if (resolvedNamesCache.has(cacheKey)) {
    return resolvedNamesCache.get(cacheKey);
  }
  
  try {
    let response;
    
    // Special handling for user lookups
    if (objectType === 'user') {
      response = await axios.get(
        `${API}/users/${recordId}`,
        { headers: getAuthHeaders() }
      );
    } else {
      response = await axios.get(
        `${API}/objects/${objectType}/records/${recordId}`,
        { headers: getAuthHeaders() }
      );
    }
    
    const record = response.data;
    const data = record?.data || record;
    
    // Get display name - handle user records specially
    let displayName;
    if (objectType === 'user') {
      displayName = `${data?.first_name || ''} ${data?.last_name || ''}`.trim() || data?.email;
    } else {
      displayName = data?.name || 
        (data?.first_name && data?.last_name ? `${data.first_name} ${data.last_name}`.trim() : null) ||
        data?.account_name ||
        data?.subject ||
        data?.title ||
        null;
    }
    
    const result = { displayName, record };
    resolvedNamesCache.set(cacheKey, result);
    return result;
  } catch (error) {
    console.warn(`[DynamicLookup] Failed to resolve record ${objectType}/${recordId}:`, error);
    return null;
  }
};

/**
 * Extract display name from record data
 */
const getDisplayName = (record) => {
  if (!record) return null;
  const data = record?.data || record;
  
  return data?.name || 
    data?.display_value ||
    (data?.first_name && data?.last_name ? `${data.first_name} ${data.last_name}`.trim() : null) ||
    data?.account_name ||
    data?.subject ||
    data?.title ||
    data?.email ||
    null;
};

/**
 * Get secondary info for display
 */
const getSecondaryInfo = (record) => {
  if (!record) return null;
  const data = record?.data || record;
  
  return data?.email || data?.phone || data?.industry || data?.website || null;
};

/**
 * Hover Preview Card Component
 * Now accepts configuredPreviewFields from Display & Search configuration
 */
const HoverPreviewCard = ({ 
  record, 
  objectType, 
  position, 
  onNavigate, 
  onMouseEnter,
  onMouseLeave,
  configuredPreviewFields = [],
  primaryDisplayField = 'name'
}) => {
  const cardRef = useRef(null);
  const Icon = OBJECT_ICONS[objectType?.toLowerCase()] || FileText;
  
  // Calculate position to avoid going off-screen
  const getCardStyle = () => {
    const cardWidth = 320; // Slightly wider for better display
    const cardHeight = 250;
    
    let x = position.x;
    let y = position.y;
    
    // Adjust if card would go off-screen to the right
    if (x + cardWidth > window.innerWidth - 20) {
      x = position.x - cardWidth - 20;
    }
    
    // Adjust if card would go off-screen at the bottom
    if (y + cardHeight > window.innerHeight - 20) {
      y = window.innerHeight - cardHeight - 20;
    }
    
    // Ensure not negative
    x = Math.max(10, x);
    y = Math.max(10, y);
    
    return {
      position: 'fixed',
      zIndex: 99999, // Very high z-index to be above modals
      top: y,
      left: x,
    };
  };
  
  if (!record) return null;
  
  const data = record?.data || record;
  
  // Get the display name using primary display field from configuration
  const displayName = data?.[primaryDisplayField] || getDisplayName(record);
  
  // Build preview fields from configuration (Single Source of Truth)
  const previewFields = [];
  
  // Check if we have configured preview fields
  const hasConfiguredFields = configuredPreviewFields && 
    Array.isArray(configuredPreviewFields) && 
    configuredPreviewFields.length > 0;
  
  if (hasConfiguredFields) {
    // Use ONLY configured fields from Display & Search
    configuredPreviewFields.forEach(fieldConfig => {
      // Handle both string and object formats
      const fieldKey = typeof fieldConfig === 'string' 
        ? fieldConfig 
        : (fieldConfig.key || fieldConfig.field_name || fieldConfig.name);
      
      const fieldLabel = typeof fieldConfig === 'string'
        ? fieldKey.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
        : (fieldConfig.label || fieldKey.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()));
      
      const value = data[fieldKey];
      
      // Always add the field if it's configured, even with empty value
      let displayValue = value;
      
      if (value === undefined || value === null || value === '') {
        displayValue = '-'; // Show dash for empty values
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
            // Keep original value if parsing fails
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
      className="w-72 bg-white rounded-lg shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {/* Header */}
      <div className="px-4 py-3 bg-gradient-to-r from-blue-50 to-white border-b">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-100 rounded-lg">
            <Icon className="h-5 w-5 text-blue-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-slate-500 uppercase tracking-wide">{objectType}</p>
            <p className="text-sm font-semibold text-slate-800 truncate">{displayName}</p>
          </div>
        </div>
      </div>
      
      {/* Preview Fields - strictly from configuration */}
      {previewFields.length > 0 && (
        <div className="px-4 py-3 space-y-2">
          {previewFields.slice(0, 5).map(field => (
            <div key={field.key} className="flex items-center gap-2 text-sm">
              <span className="text-slate-500 min-w-[80px] text-xs">{field.label}:</span>
              <span className="text-slate-700 truncate flex-1">{field.value}</span>
            </div>
          ))}
        </div>
      )}
      
      {/* Show message if no preview fields configured */}
      {previewFields.length === 0 && (
        <div className="px-4 py-3 text-sm text-slate-400 italic">
          No preview fields configured
        </div>
      )}
      
      {/* Footer */}
      <div className="px-4 py-2 bg-slate-50 border-t flex items-center justify-between">
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onNavigate();
          }}
          className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Open Record
        </button>
        <span className="text-xs text-slate-400">{record?.series_id}</span>
      </div>
    </div>,
    document.body
  );
};

/**
 * Dropdown Item Component
 */
const DropdownItem = ({ record, objectType, isSelected, onSelect, onMouseEnter, onMouseLeave }) => {
  const Icon = OBJECT_ICONS[objectType?.toLowerCase()] || FileText;
  const displayName = record?.display_value || getDisplayName(record) || record?.id || 'Unnamed Record';
  const secondaryInfo = record?.secondary_value || getSecondaryInfo(record);
  
  return (
    <div
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onSelect(record);
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={cn(
        "flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors",
        isSelected ? "bg-blue-50" : "hover:bg-slate-50"
      )}
    >
      <div className={cn(
        "p-1.5 rounded-md",
        isSelected ? "bg-blue-100" : "bg-slate-100"
      )}>
        <Icon className={cn(
          "h-4 w-4",
          isSelected ? "text-blue-600" : "text-slate-500"
        )} />
      </div>
      <div className="flex-1 min-w-0">
        <p className={cn(
          "text-sm font-medium truncate",
          isSelected ? "text-blue-700" : "text-slate-700"
        )}>
          {displayName}
        </p>
        {secondaryInfo && (
          <p className="text-xs text-slate-500 truncate">{secondaryInfo}</p>
        )}
      </div>
    </div>
  );
};

/**
 * Main DynamicLookupField Component
 */
const DynamicLookupField = ({
  value,                    // Current selected ID
  onChange,                 // Callback when selection changes (id, record)
  objectType,               // Target object type (e.g., 'account')
  sourceObject,             // Source object containing this field
  fieldName,                // Field API name (e.g., 'account_id')
  label,                    // Field label
  placeholder,              // Placeholder text
  required = false,         // Is field required
  disabled = false,         // Is field disabled
  showPreview = true,       // Show hover preview
  allowCreate = true,       // Show "+ New" option
  onCreateNew,              // Optional custom callback for "+New" (overrides default)
  className = '',           // Additional classes
  error = null,             // Error message
}) => {
  const navigate = useSafeNavigate();
  const consoleContext = useConsoleSafe();
  const createRecordService = useCreateRecord();
  const containerRef = useRef(null);
  const inputRef = useRef(null);
  const dropdownRef = useRef(null);
  const itemRefs = useRef(new Map());
  
  // State
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [recentRecords, setRecentRecords] = useState([]);
  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingRecent, setLoadingRecent] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [displayValue, setDisplayValue] = useState('');
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  
  // Lookup configuration state
  const [lookupConfig, setLookupConfig] = useState(null);
  
  // Hover preview state
  const [hoveredRecord, setHoveredRecord] = useState(null);
  const [hoverPosition, setHoverPosition] = useState({ x: 0, y: 0 });
  const [showHoverCard, setShowHoverCard] = useState(false);
  const isHoveringCardRef = useRef(false); // Use ref for immediate updates
  const hoverTimeoutRef = useRef(null);
  const hideTimeoutRef = useRef(null);
  
  // Debounced search query
  const debouncedQuery = useDebounce(searchQuery, 300);
  
  // Get the configured primary display field
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
  
  // Resolve initial value to display name
  useEffect(() => {
    const resolveValue = async () => {
      if (value && objectType) {
        const resolved = await resolveRecordName(objectType, value);
        if (resolved) {
          // Use configured display field if available
          const displayName = getDisplayNameWithConfig(resolved.record, primaryDisplayField);
          setDisplayValue(displayName || value);
          setSelectedRecord(resolved.record);
        } else {
          // If can't resolve, still show the ID
          setDisplayValue(value);
        }
      } else if (!value) {
        setDisplayValue('');
        setSelectedRecord(null);
      }
    };
    
    resolveValue();
  }, [value, objectType, primaryDisplayField]);
  
  // Clear recent records when config changes to force re-fetch with new display field
  useEffect(() => {
    if (lookupConfig) {
      setRecentRecords([]);
    }
  }, [lookupConfig?.primary_display_field]);
  
  // Fetch recent records when dropdown opens
  useEffect(() => {
    const loadRecent = async () => {
      if (isOpen && objectType && recentRecords.length === 0) {
        setLoadingRecent(true);
        const records = await fetchRecentRecords(objectType);
        // Transform records with the configured display field
        const transformedRecords = transformRecordsWithDisplayField(records, primaryDisplayField);
        setRecentRecords(transformedRecords);
        setLoadingRecent(false);
      }
    };
    
    loadRecent();
  }, [isOpen, objectType, recentRecords.length, primaryDisplayField]);
  
  // Search when query changes
  useEffect(() => {
    const performSearch = async () => {
      if (!debouncedQuery || !objectType) {
        setSearchResults([]);
        return;
      }
      
      setLoading(true);
      const results = await searchRecords(objectType, debouncedQuery, sourceObject, fieldName);
      setSearchResults(results);
      setLoading(false);
    };
    
    performSearch();
  }, [debouncedQuery, objectType, sourceObject, fieldName]);
  
  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
        setSearchQuery('');
        setShowHoverCard(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  
  // Handle record selection
  const handleSelect = useCallback((record) => {
    if (!record) return;
    
    const recordId = record?.id || record?.series_id;
    // Use configured display field for the name
    const name = record?.display_value || getDisplayNameWithConfig(record, primaryDisplayField) || recordId;
    
    // Update local state immediately
    setDisplayValue(name);
    setSelectedRecord(record);
    setIsOpen(false);
    setSearchQuery('');
    setShowHoverCard(false);
    setHoveredRecord(null);
    
    // Clear any pending hover timeout
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    
    // Call onChange with both ID and full record
    if (onChange) {
      onChange(recordId, record);
    }
  }, [onChange, primaryDisplayField]);
  
  // Handle clear selection
  const handleClear = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    
    setDisplayValue('');
    setSelectedRecord(null);
    
    if (onChange) {
      onChange(null, null);
    }
  }, [onChange]);
  
  // Handle hover preview - calculate position from the hovered element
  const handleItemHoverStart = useCallback((record, itemElement) => {
    if (!showPreview || !itemElement) return;
    
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    
    // Get the position of the hovered item
    const rect = itemElement.getBoundingClientRect();
    
    // Position the card to the right of the dropdown
    setHoverPosition({
      x: rect.right + 10,
      y: rect.top
    });
    
    hoverTimeoutRef.current = setTimeout(() => {
      setHoveredRecord(record);
      setShowHoverCard(true);
    }, 200);
  }, [showPreview]);
  
  // Handle mouse leaving a dropdown item
  const handleItemHoverEnd = useCallback(() => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    
    // Clear any existing hide timeout
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
    }
    
    // Delay hiding to allow cursor to move to the hover card
    hideTimeoutRef.current = setTimeout(() => {
      // Only hide if not currently hovering the card (use ref for current value)
      if (!isHoveringCardRef.current) {
        setShowHoverCard(false);
        setHoveredRecord(null);
      }
    }, 200); // Increased delay for better UX
  }, []);
  
  // Handle mouse entering the hover card
  const handleCardMouseEnter = useCallback(() => {
    // Clear any pending hide timeout immediately
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
    isHoveringCardRef.current = true;
  }, []);
  
  // Handle mouse leaving the hover card
  const handleCardMouseLeave = useCallback(() => {
    isHoveringCardRef.current = false;
    
    // Hide the card after a delay
    hideTimeoutRef.current = setTimeout(() => {
      if (!isHoveringCardRef.current) {
        setShowHoverCard(false);
        setHoveredRecord(null);
      }
    }, 150);
  }, []);
  
  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }
    };
  }, []);
  
  // Handle navigation to record
  const handleNavigate = useCallback((record) => {
    if (!record) return;
    
    const recordId = record?.series_id || record?.id;
    const name = record?.display_value || getDisplayName(record);
    
    // Close dropdown and hover
    setIsOpen(false);
    setShowHoverCard(false);
    
    // Special navigation for user records
    if (objectType === 'user') {
      navigate(`/users/${recordId}`);
      return;
    }
    
    // Use console context if available
    if (consoleContext?.openRecordAsSubtab) {
      consoleContext.openRecordAsSubtab(objectType, record?.id, recordId, name);
      return;
    }
    if (consoleContext?.openRecordAsPrimary) {
      consoleContext.openRecordAsPrimary(objectType, record?.id, recordId, name);
      return;
    }
    
    // Fallback to router navigation (safe navigate handles missing router context)
    navigate(`/crm/${objectType}/${recordId}`);
  }, [consoleContext, objectType, navigate]);
  
  // Handle create new - uses CreateRecordService to open full dialog
  const handleCreateNew = useCallback(() => {
    // Close the dropdown first
    setIsOpen(false);
    setShowHoverCard(false);
    setSearchQuery('');
    
    // If custom callback provided, use it
    if (onCreateNew) {
      onCreateNew();
      return;
    }
    
    // Use the CreateRecordService to open the full create dialog
    if (createRecordService?.openCreateDialog) {
      setIsCreatingNew(true);
      
      createRecordService.openCreateDialog(objectType, {
        onSuccess: (newRecord) => {
          setIsCreatingNew(false);
          
          // If a new record was created, auto-select it
          if (newRecord) {
            handleSelect(newRecord);
            
            // Clear cache to include the new record in recent list
            recentRecordsCache.delete(objectType);
          }
        },
      });
    } else {
      console.warn('[DynamicLookup] CreateRecordService not available');
    }
  }, [objectType, createRecordService, onCreateNew, handleSelect]);
  
  // Records to display in dropdown
  const displayRecords = useMemo(() => {
    if (searchQuery && debouncedQuery) {
      return searchResults;
    }
    return recentRecords;
  }, [searchQuery, debouncedQuery, searchResults, recentRecords]);
  
  const Icon = OBJECT_ICONS[objectType?.toLowerCase()] || FileText;
  
  // Safely format objectLabel - use formatObjectLabel for proper naming
  const objectLabel = formatObjectLabel(objectType);
  const objectLabelPlural = getPluralLabel(objectLabel);
  
  return (
    <div ref={containerRef} className={cn("relative", className)}>
      {/* Input Field / Trigger - When open, show search input directly */}
      {!isOpen ? (
        <div
          onClick={() => !disabled && setIsOpen(true)}
          className={cn(
            "relative flex items-center gap-2 px-3 py-2 border rounded-md bg-white cursor-pointer transition-all min-h-[42px]",
            "border-slate-300 hover:border-slate-400",
            disabled && "opacity-50 cursor-not-allowed bg-slate-50",
            error && "border-red-300"
          )}
        >
          <Icon className="h-4 w-4 text-slate-400 flex-shrink-0" />
          
          {displayValue ? (
            <div className="flex-1 flex items-center justify-between min-w-0 gap-2">
              <span 
                className="text-sm text-slate-700 truncate cursor-pointer hover:text-blue-600 hover:underline"
                onClick={(e) => {
                  e.stopPropagation();
                  if (selectedRecord) {
                    handleNavigate(selectedRecord);
                  }
                }}
              >
                {displayValue}
              </span>
              {!disabled && (
                <button
                  type="button"
                  onClick={handleClear}
                  className="p-0.5 hover:bg-slate-100 rounded flex-shrink-0"
                >
                  <X className="h-3.5 w-3.5 text-slate-400" />
                </button>
              )}
            </div>
          ) : (
            <span className="flex-1 text-sm text-slate-400">
              {placeholder || `Search ${objectLabelPlural.toLowerCase()}...`}
            </span>
          )}
          
          <ChevronDown className="h-4 w-4 text-slate-400 flex-shrink-0" />
        </div>
      ) : (
        <div
          className={cn(
            "relative flex items-center gap-2 px-3 py-2 border rounded-t-md bg-white min-h-[42px]",
            "border-blue-500 ring-2 ring-blue-100 border-b-0"
          )}
        >
          <Search className="h-4 w-4 text-slate-400 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={placeholder || `Search ${objectLabelPlural.toLowerCase()}...`}
            className="flex-1 text-sm bg-transparent border-0 outline-none focus:ring-0 p-0"
            autoFocus
          />
          {loading ? (
            <Loader2 className="h-4 w-4 text-blue-500 animate-spin flex-shrink-0" />
          ) : (
            <ChevronUp className="h-4 w-4 text-slate-400 flex-shrink-0" />
          )}
        </div>
      )}
      
      {/* Error Message */}
      {error && (
        <p className="mt-1 text-xs text-red-500 flex items-center gap-1">
          <AlertCircle className="h-3 w-3" />
          {error}
        </p>
      )}
      
      {/* Dropdown - Results only, no separate search input */}
      {isOpen && !disabled && (
        <div 
          ref={dropdownRef}
          className="absolute z-[100] bg-white border border-blue-500 border-t-0 rounded-b-lg shadow-lg overflow-hidden ring-2 ring-blue-100"
          style={{ maxHeight: '280px', width: '100%', top: '100%', left: 0 }}
        >
          
          {/* Results Container */}
          <div className="overflow-y-auto" style={{ maxHeight: '250px' }}>
            {/* Section Header */}
            {!searchQuery && recentRecords.length > 0 && (
              <div className="px-3 py-2 bg-slate-50 border-b">
                <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500 uppercase tracking-wide">
                  <Clock className="h-3 w-3" />
                  Recent {objectLabelPlural}
                </div>
              </div>
            )}
            
            {searchQuery && searchResults.length > 0 && (
              <div className="px-3 py-2 bg-slate-50 border-b">
                <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500 uppercase tracking-wide">
                  <Search className="h-3 w-3" />
                  Search Results
                </div>
              </div>
            )}
            
            {/* Loading State */}
            {(loading || loadingRecent) && displayRecords.length === 0 && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />
                <span className="ml-2 text-sm text-slate-500">Loading...</span>
              </div>
            )}
            
            {/* No Results */}
            {!loading && !loadingRecent && displayRecords.length === 0 && (
              <div className="py-8 text-center">
                <div className="text-slate-400 mb-2">
                  <Search className="h-8 w-8 mx-auto opacity-50" />
                </div>
                <p className="text-sm text-slate-500">
                  {searchQuery ? `No ${objectLabelPlural.toLowerCase()} found` : `No recent ${objectLabelPlural.toLowerCase()}`}
                </p>
              </div>
            )}
            
            {/* Records List */}
            {displayRecords.map((record, index) => {
              const recordKey = record.id || record.series_id || index;
              return (
                <div
                  key={recordKey}
                  ref={(el) => {
                    if (el) itemRefs.current.set(recordKey, el);
                  }}
                >
                  <DropdownItem
                    record={record}
                    objectType={objectType}
                    isSelected={value === record.id}
                    onSelect={handleSelect}
                    onMouseEnter={() => {
                      const el = itemRefs.current.get(recordKey);
                      handleItemHoverStart(record, el);
                    }}
                    onMouseLeave={handleItemHoverEnd}
                  />
                </div>
              );
            })}
          </div>
          
          {/* Create New Option */}
          {allowCreate && (
            <div className="border-t bg-slate-50">
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleCreateNew();
                }}
                disabled={isCreatingNew}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-blue-600 hover:bg-blue-50 transition-colors disabled:opacity-50"
              >
                {isCreatingNew ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                <span className="font-medium">New {objectLabel}</span>
              </button>
            </div>
          )}
        </div>
      )}
      
      {/* Hover Preview Card */}
      {showHoverCard && hoveredRecord && showPreview && (
        <HoverPreviewCard
          record={hoveredRecord}
          objectType={objectType}
          position={hoverPosition}
          onNavigate={() => handleNavigate(hoveredRecord)}
          onMouseEnter={handleCardMouseEnter}
          onMouseLeave={handleCardMouseLeave}
          configuredPreviewFields={lookupConfig?.preview_fields || []}
          primaryDisplayField={primaryDisplayField}
        />
      )}
    </div>
  );
};

/**
 * Clear lookup caches (useful after record updates)
 */
export const clearLookupCaches = (objectType = null) => {
  if (objectType) {
    recentRecordsCache.delete(objectType);
    // Clear resolved names for this object type
    for (const key of resolvedNamesCache.keys()) {
      if (key.startsWith(`${objectType}:`)) {
        resolvedNamesCache.delete(key);
      }
    }
  } else {
    recentRecordsCache.clear();
    resolvedNamesCache.clear();
  }
};

export default DynamicLookupField;
