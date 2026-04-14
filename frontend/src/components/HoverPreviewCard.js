/**
 * HoverPreviewCard - Salesforce-style hover preview for lookup fields
 * Shows a card with key fields when hovering over a related record link
 * Now supports configurable fields per object via admin settings
 */
import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import { 
  User, 
  Building2, 
  Mail, 
  Phone, 
  Briefcase, 
  Calendar,
  ExternalLink,
  Copy,
  FileText,
  DollarSign,
  Tag,
  Clock,
  CheckCircle,
  Hash,
  MapPin,
  Globe,
  Percent,
  ToggleLeft,
  List,
  Type
} from 'lucide-react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';
const API = `${API_URL}/api`;

// Cache for preview data
const previewCache = new Map();
const configCache = new Map();
const objectMetadataCache = new Map();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

const getAuthHeader = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

// Object icons mapping
const objectIcons = {
  lead: User,
  contact: User,
  account: Building2,
  opportunity: Briefcase,
  task: CheckCircle,
  event: Calendar,
  default: FileText
};

// Field type to icon mapping
const fieldTypeIcons = {
  email: Mail,
  phone: Phone,
  text: Type,
  textarea: FileText,
  number: Hash,
  currency: DollarSign,
  percent: Percent,
  date: Calendar,
  datetime: Clock,
  picklist: Tag,
  select: Tag,
  checkbox: ToggleLeft,
  boolean: ToggleLeft,
  url: Globe,
  lookup: ExternalLink,
  address: MapPin,
  multipicklist: List,
  default: FileText
};

// Default preview field configurations per object type (fallback when no admin config exists)
const defaultPreviewFieldKeys = {
  lead: ['email', 'phone', 'company', 'title', 'status', 'lead_source'],
  contact: ['email', 'phone', 'account_name', 'title', 'department'],
  account: ['phone', 'website', 'industry', 'type', 'annual_revenue'],
  opportunity: ['amount', 'stage', 'close_date', 'probability', 'type'],
  task: ['subject', 'status', 'priority', 'due_date'],
  event: ['subject', 'start_date', 'end_date', 'location']
};

// Default fields for unknown object types
const defaultPreviewFieldList = ['email', 'phone', 'status', 'type', 'created_at'];

/**
 * Get the name/title of a record
 */
const getRecordName = (record) => {
  if (!record?.data) return 'Unnamed';
  
  const data = record.data;
  
  // Try common name field patterns
  if (data.name) return data.name;
  if (data.first_name && data.last_name) return `${data.first_name} ${data.last_name}`.trim();
  if (data.first_name) return data.first_name;
  if (data.title) return data.title;
  if (data.subject) return data.subject;
  
  return 'Unnamed';
};

/**
 * Format field value for display
 */
const formatFieldValue = (value, fieldKey, fieldType) => {
  if (value === null || value === undefined || value === '') return null;
  
  // Format dates
  if (fieldType === 'date' || fieldType === 'datetime' || fieldKey.includes('date') || fieldKey === 'created_at' || fieldKey === 'updated_at') {
    try {
      return new Date(value).toLocaleDateString();
    } catch {
      return value;
    }
  }
  
  // Format currency
  if (fieldType === 'currency' || fieldKey === 'amount' || fieldKey === 'annual_revenue') {
    const num = Number(value);
    if (!isNaN(num)) {
      return `$${num.toLocaleString()}`;
    }
  }
  
  // Format percentage
  if (fieldType === 'percent' || fieldKey === 'probability') {
    return `${value}%`;
  }
  
  // Format boolean
  if (fieldType === 'checkbox' || fieldType === 'boolean') {
    return value ? 'Yes' : 'No';
  }
  
  return String(value);
};

/**
 * Get icon component for a field
 */
const getFieldIcon = (fieldKey, fieldType) => {
  // Check for specific field name patterns first
  if (fieldKey === 'email' || fieldKey.includes('email')) return Mail;
  if (fieldKey === 'phone' || fieldKey.includes('phone')) return Phone;
  if (fieldKey === 'company' || fieldKey.includes('company')) return Building2;
  if (fieldKey === 'title' || fieldKey === 'job_title') return Briefcase;
  if (fieldKey === 'website' || fieldKey.includes('url')) return Globe;
  if (fieldKey === 'address' || fieldKey.includes('address')) return MapPin;
  
  // Fall back to field type icon
  return fieldTypeIcons[fieldType] || fieldTypeIcons.default;
};

/**
 * Guess field type from field key name
 */
const guessFieldType = (fieldKey) => {
  if (fieldKey === 'email' || fieldKey.includes('email')) return 'email';
  if (fieldKey === 'phone' || fieldKey.includes('phone')) return 'phone';
  if (fieldKey.includes('date')) return 'date';
  if (fieldKey === 'amount' || fieldKey.includes('revenue') || fieldKey.includes('price')) return 'currency';
  if (fieldKey === 'probability' || fieldKey.includes('percent')) return 'percent';
  if (fieldKey === 'website' || fieldKey.includes('url')) return 'url';
  if (fieldKey === 'status' || fieldKey === 'stage' || fieldKey === 'type' || fieldKey === 'industry' || fieldKey === 'priority') return 'picklist';
  if (fieldKey.includes('_id') || fieldKey === 'account_name' || fieldKey === 'contact_name') return 'lookup';
  return 'text';
};

/**
 * Format field key to human-readable label
 */
const formatFieldLabel = (fieldKey) => {
  return fieldKey
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, c => c.toUpperCase());
};

/**
 * HoverPreviewCard Component
 */
export const HoverPreviewCard = ({ 
  objectType, 
  recordId, 
  position, 
  onClose,
  onOpen,
  onCardMouseEnter,
  onCardMouseLeave
}) => {
  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [previewFields, setPreviewFields] = useState([]);
  const cardRef = useRef(null);
  const navigate = useNavigate();

  // Fetch record data and preview config
  useEffect(() => {
    const fetchData = async () => {
      if (!objectType || !recordId) {
        setError('Invalid record reference');
        setLoading(false);
        return;
      }

      try {
        // Fetch record, config, and metadata in parallel
        const [recordResponse, configResponse, metadataResponse] = await Promise.all([
          // Fetch record data (with cache check)
          (async () => {
            const cacheKey = `preview:${objectType}:${recordId}`;
            const cached = previewCache.get(cacheKey);
            if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
              return { data: cached.data, fromCache: true };
            }
            const resp = await axios.get(
              `${API}/objects/${objectType}/records/${recordId}`,
              { headers: getAuthHeader() }
            );
            previewCache.set(cacheKey, { data: resp.data, timestamp: Date.now() });
            return { data: resp.data, fromCache: false };
          })(),
          // Fetch preview config (with cache check)
          (async () => {
            const cacheKey = `config:${objectType}`;
            const cached = configCache.get(cacheKey);
            if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
              return { data: cached.data, fromCache: true };
            }
            try {
              const resp = await axios.get(
                `${API}/lookup-preview-config/${objectType}`,
                { headers: getAuthHeader() }
              );
              configCache.set(cacheKey, { data: resp.data, timestamp: Date.now() });
              return { data: resp.data, fromCache: false };
            } catch {
              return { data: null, fromCache: false };
            }
          })(),
          // Fetch object metadata for field labels (with cache check)
          (async () => {
            const cacheKey = `metadata:${objectType}`;
            const cached = objectMetadataCache.get(cacheKey);
            if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
              return { data: cached.data, fromCache: true };
            }
            try {
              const resp = await axios.get(
                `${API}/metadata/${objectType}`,
                { headers: getAuthHeader() }
              );
              objectMetadataCache.set(cacheKey, { data: resp.data, timestamp: Date.now() });
              return { data: resp.data, fromCache: false };
            } catch {
              return { data: null, fromCache: false };
            }
          })()
        ]);

        setRecord(recordResponse.data);

        // Build preview fields array with labels and icons
        const config = configResponse.data;
        const metadata = metadataResponse.data;
        
        // Determine which field keys to show
        let fieldKeys = [];
        if (config?.enabled !== false && config?.preview_fields?.length > 0) {
          // Use admin-configured fields
          fieldKeys = config.preview_fields;
        } else {
          // Fall back to defaults
          fieldKeys = defaultPreviewFieldKeys[objectType] || defaultPreviewFieldList;
        }

        // Build field objects with labels and icons
        const fieldsWithMeta = fieldKeys.map(fieldKey => {
          // Try to find field in metadata
          const metaField = metadata?.fields?.find(f => f.key === fieldKey || f.name === fieldKey);
          const fieldType = metaField?.type || guessFieldType(fieldKey);
          
          return {
            key: fieldKey,
            label: metaField?.label || formatFieldLabel(fieldKey),
            type: fieldType,
            icon: getFieldIcon(fieldKey, fieldType)
          };
        });

        setPreviewFields(fieldsWithMeta);
      } catch (err) {
        console.error('Error fetching preview data:', err);
        setError('Unable to load preview');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [objectType, recordId]);

  // Handle click outside to close
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (cardRef.current && !cardRef.current.contains(e.target)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  // Get icon for this object type
  const ObjectIcon = objectIcons[objectType] || objectIcons.default;

  // Calculate card position
  const cardStyle = {
    position: 'fixed',
    top: position.y,
    left: position.x,
    zIndex: 9999,
    transform: 'translateY(-50%)'
  };

  // Adjust position if card would go off screen
  if (position.x + 320 > window.innerWidth) {
    cardStyle.left = position.x - 340;
  }
  if (position.y - 150 < 0) {
    cardStyle.transform = 'translateY(0)';
  }
  if (position.y + 150 > window.innerHeight) {
    cardStyle.transform = 'translateY(-100%)';
  }

  const handleOpen = () => {
    if (record) {
      if (onOpen) {
        // Use callback if provided (for opening in tab)
        onOpen(objectType, record.series_id, record);
      } else {
        // Fallback to navigation
        navigate(`/crm/${objectType}/${record.series_id}`);
      }
      onClose();
    }
  };

  const handleCopyLink = () => {
    if (record) {
      const url = `${window.location.origin}/crm/${objectType}/${record.series_id}`;
      navigator.clipboard.writeText(url);
      toast.success('Link copied to clipboard');
    }
  };

  const cardContent = (
    <div 
      ref={cardRef}
      style={cardStyle}
      className="bg-white rounded-lg shadow-xl border border-slate-200 w-80 overflow-hidden animate-in fade-in zoom-in-95 duration-200"
      onMouseEnter={onCardMouseEnter}
      onMouseLeave={onCardMouseLeave}
    >
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-500 to-indigo-600 px-4 py-3">
        <div className="flex items-center space-x-3">
          <div className="bg-white/20 rounded-lg p-2">
            <ObjectIcon className="h-5 w-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            {loading ? (
              <div className="h-5 bg-white/30 rounded animate-pulse w-32"></div>
            ) : error ? (
              <span className="text-white/80 text-sm">{error}</span>
            ) : (
              <>
                <h3 className="text-white font-semibold truncate">
                  {getRecordName(record)}
                </h3>
                <div className="flex items-center space-x-2 mt-0.5">
                  <Badge variant="secondary" className="bg-white/20 text-white text-xs capitalize">
                    {objectType}
                  </Badge>
                  {record?.series_id && (
                    <span className="text-white/70 text-xs font-mono">
                      {record.series_id}
                    </span>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Fields */}
      <div className="px-4 py-3 space-y-2.5 max-h-48 overflow-y-auto">
        {loading ? (
          // Loading skeleton
          [...Array(4)].map((_, i) => (
            <div key={i} className="flex items-center space-x-3">
              <div className="h-4 w-4 bg-slate-200 rounded animate-pulse"></div>
              <div className="flex-1">
                <div className="h-3 bg-slate-200 rounded animate-pulse w-16 mb-1"></div>
                <div className="h-4 bg-slate-100 rounded animate-pulse w-32"></div>
              </div>
            </div>
          ))
        ) : error ? (
          <div className="text-center py-4 text-slate-500 text-sm">
            {error}
          </div>
        ) : (
          previewFields.map(({ key, label, type, icon: FieldIcon }) => {
            const value = formatFieldValue(record?.data?.[key], key, type);
            if (!value) return null;
            
            return (
              <div key={key} className="flex items-start space-x-3">
                <FieldIcon className="h-4 w-4 text-slate-400 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="text-xs text-slate-500 block">{label}</span>
                  <span className="text-sm text-slate-900 truncate block">
                    {key === 'email' || type === 'email' ? (
                      <a href={`mailto:${value}`} className="text-indigo-600 hover:underline">
                        {value}
                      </a>
                    ) : key === 'phone' || type === 'phone' ? (
                      <a href={`tel:${value}`} className="text-indigo-600 hover:underline">
                        {value}
                      </a>
                    ) : key === 'website' || type === 'url' ? (
                      <a href={value.startsWith('http') ? value : `https://${value}`} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">
                        {value}
                      </a>
                    ) : (
                      value
                    )}
                  </span>
                </div>
              </div>
            );
          }).filter(Boolean)
        )}
        
        {/* Show message if no fields have values */}
        {!loading && !error && previewFields.every(({ key }) => !record?.data?.[key]) && (
          <div className="text-center py-2 text-slate-500 text-sm">
            No additional details available
          </div>
        )}
      </div>

      {/* Actions */}
      {!loading && !error && (
        <div className="px-4 py-2 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCopyLink}
            className="text-slate-600 hover:text-slate-900 h-8"
          >
            <Copy className="h-3.5 w-3.5 mr-1.5" />
            Copy Link
          </Button>
          <Button
            size="sm"
            onClick={handleOpen}
            className="bg-indigo-600 hover:bg-indigo-700 h-8"
          >
            <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
            Open
          </Button>
        </div>
      )}
    </div>
  );

  // Render using portal to avoid z-index issues
  return createPortal(cardContent, document.body);
};

/**
 * Hook for managing hover preview state
 */
export const useHoverPreview = (delay = 400) => {
  const [showPreview, setShowPreview] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const timeoutRef = useRef(null);
  const closeTimeoutRef = useRef(null);
  const isHoveringTriggerRef = useRef(false);
  const isHoveringCardRef = useRef(false);

  const handleMouseEnter = (e, objectType, recordId) => {
    isHoveringTriggerRef.current = true;
    
    // Clear any close timeout
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    
    // Clear any existing open timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Set timeout for delay before showing
    timeoutRef.current = setTimeout(() => {
      if (isHoveringTriggerRef.current) {
        const rect = e.target.getBoundingClientRect();
        setPosition({
          x: rect.right + 10,
          y: rect.top + rect.height / 2
        });
        setPreviewData({ objectType, recordId });
        setShowPreview(true);
      }
    }, delay);
  };

  const handleMouseLeave = () => {
    isHoveringTriggerRef.current = false;
    
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    
    // Delay before closing to allow moving to card
    closeTimeoutRef.current = setTimeout(() => {
      if (!isHoveringTriggerRef.current && !isHoveringCardRef.current) {
        setShowPreview(false);
        setPreviewData(null);
      }
    }, 150);
  };

  const handleCardMouseEnter = () => {
    isHoveringCardRef.current = true;
    // Clear close timeout when entering card
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
  };

  const handleCardMouseLeave = () => {
    isHoveringCardRef.current = false;
    // Delay before closing to allow moving back to trigger
    closeTimeoutRef.current = setTimeout(() => {
      if (!isHoveringTriggerRef.current && !isHoveringCardRef.current) {
        setShowPreview(false);
        setPreviewData(null);
      }
    }, 150);
  };

  const closePreview = () => {
    isHoveringTriggerRef.current = false;
    isHoveringCardRef.current = false;
    setShowPreview(false);
    setPreviewData(null);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current);
      }
    };
  }, []);

  return {
    showPreview,
    previewData,
    position,
    handleMouseEnter,
    handleMouseLeave,
    handleCardMouseEnter,
    handleCardMouseLeave,
    closePreview
  };
};

/**
 * Clear the preview cache
 */
export const clearPreviewCache = () => {
  previewCache.clear();
};

export default HoverPreviewCard;
