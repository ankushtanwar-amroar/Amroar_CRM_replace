/**
 * ConfigurableLookupDisplay - Lookup field display with configurable hover preview
 * 
 * This component respects the per-lookup-field hover configuration.
 * Hover preview only appears if admin has explicitly enabled it for this specific field.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import axios from 'axios';
import { 
  User, Building2, Mail, Phone, Briefcase, Calendar, ExternalLink, Copy, 
  FileText, DollarSign, Tag, Clock, CheckCircle, Hash, MapPin, Globe, 
  Percent, ToggleLeft, List, Type 
} from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import toast from 'react-hot-toast';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';
const API = `${API_URL}/api`;

// Cache for hover configs, records, and metadata
const hoverConfigCache = new Map();
const previewCache = new Map();
const metadataCache = new Map();
const CACHE_DURATION = 5 * 60 * 1000;

const getAuthHeader = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

// Object icons mapping
const objectIcons = {
  lead: User, contact: User, account: Building2, opportunity: Briefcase,
  task: CheckCircle, event: Calendar, default: FileText
};

// Field type icons
const fieldTypeIcons = {
  email: Mail, phone: Phone, text: Type, textarea: FileText, number: Hash,
  currency: DollarSign, percent: Percent, date: Calendar, datetime: Clock,
  picklist: Tag, select: Tag, checkbox: ToggleLeft, boolean: ToggleLeft,
  url: Globe, lookup: ExternalLink, address: MapPin, multipicklist: List,
  default: FileText
};

const formatFieldLabel = (key) => key
  .replace(/_/g, ' ')
  .replace(/([a-z])([A-Z])/g, '$1 $2')
  .replace(/\b\w/g, c => c.toUpperCase());

const formatFieldValue = (value, fieldKey, fieldType) => {
  if (value === null || value === undefined || value === '') return null;
  if (fieldType === 'date' || fieldType === 'datetime' || fieldKey.includes('date')) {
    try { return new Date(value).toLocaleDateString(); } catch { return value; }
  }
  if (fieldType === 'currency' || fieldKey === 'amount' || fieldKey.includes('revenue')) {
    const num = Number(value);
    if (!isNaN(num)) return `$${num.toLocaleString()}`;
  }
  if (fieldType === 'percent' || fieldKey === 'probability') return `${value}%`;
  if (fieldType === 'checkbox' || fieldType === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
};

const getFieldIcon = (fieldKey, fieldType) => {
  if (fieldKey === 'email' || fieldKey.includes('email')) return Mail;
  if (fieldKey === 'phone' || fieldKey.includes('phone')) return Phone;
  if (fieldKey === 'company' || fieldKey.includes('company')) return Building2;
  if (fieldKey === 'title' || fieldKey === 'job_title') return Briefcase;
  if (fieldKey === 'website' || fieldKey.includes('url')) return Globe;
  if (fieldKey === 'address' || fieldKey.includes('address')) return MapPin;
  return fieldTypeIcons[fieldType] || fieldTypeIcons.default;
};

/**
 * Check if hover is enabled for a specific lookup field on an object
 */
const checkHoverEnabled = async (sourceObjectName, fieldName) => {
  const cacheKey = `${sourceObjectName}:${fieldName}`;
  const cached = hoverConfigCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.data;
  }
  
  try {
    const response = await axios.get(
      `${API}/lookup-hover-assignments/object/${sourceObjectName}/field/${fieldName}`,
      { headers: getAuthHeader() }
    );
    const result = {
      enabled: response.data.configured && response.data.enabled,
      previewFields: response.data.preview_fields || [],
      relatedObject: response.data.related_object,
    };
    hoverConfigCache.set(cacheKey, { data: result, timestamp: Date.now() });
    return result;
  } catch {
    hoverConfigCache.set(cacheKey, { data: { enabled: false }, timestamp: Date.now() });
    return { enabled: false };
  }
};

/**
 * Hover Preview Card Component
 */
const HoverPreviewCard = ({ 
  relatedObjectType, 
  recordId, 
  previewFields,
  position, 
  onClose,
  onCardMouseEnter,
  onCardMouseLeave,
  onOpen
}) => {
  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [fieldsWithMeta, setFieldsWithMeta] = useState([]);
  const cardRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchData = async () => {
      if (!relatedObjectType || !recordId) {
        setError('Invalid record reference');
        setLoading(false);
        return;
      }

      try {
        // Fetch record and metadata in parallel
        const [recordRes, metadataRes] = await Promise.all([
          (async () => {
            const cacheKey = `record:${relatedObjectType}:${recordId}`;
            const cached = previewCache.get(cacheKey);
            if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
              return cached.data;
            }
            const resp = await axios.get(
              `${API}/objects/${relatedObjectType}/records/${recordId}`,
              { headers: getAuthHeader() }
            );
            previewCache.set(cacheKey, { data: resp.data, timestamp: Date.now() });
            return resp.data;
          })(),
          (async () => {
            const cacheKey = `metadata:${relatedObjectType}`;
            const cached = metadataCache.get(cacheKey);
            if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
              return cached.data;
            }
            try {
              const resp = await axios.get(
                `${API}/metadata/${relatedObjectType}`,
                { headers: getAuthHeader() }
              );
              metadataCache.set(cacheKey, { data: resp.data, timestamp: Date.now() });
              return resp.data;
            } catch { return null; }
          })()
        ]);

        setRecord(recordRes);

        // Build fields with metadata
        const fields = previewFields.map(fieldKey => {
          const metaField = metadataRes?.fields?.find(f => 
            f.key === fieldKey || f.api_name === fieldKey || f.name === fieldKey
          );
          const fieldType = metaField?.type || 'text';
          return {
            key: fieldKey,
            label: metaField?.label || formatFieldLabel(fieldKey),
            type: fieldType,
            icon: getFieldIcon(fieldKey, fieldType)
          };
        });
        setFieldsWithMeta(fields);
      } catch (err) {
        console.error('Error fetching preview data:', err);
        setError('Unable to load preview');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [relatedObjectType, recordId, previewFields]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (cardRef.current && !cardRef.current.contains(e.target)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  const ObjectIcon = objectIcons[relatedObjectType] || objectIcons.default;

  const cardStyle = {
    position: 'fixed',
    top: position.y,
    left: position.x,
    zIndex: 9999,
    transform: 'translateY(-50%)'
  };

  if (position.x + 320 > window.innerWidth) cardStyle.left = position.x - 340;
  if (position.y - 150 < 0) cardStyle.transform = 'translateY(0)';
  if (position.y + 150 > window.innerHeight) cardStyle.transform = 'translateY(-100%)';

  const getRecordName = (rec) => {
    if (!rec?.data) return 'Unnamed';
    const d = rec.data;
    if (d.name) return d.name;
    if (d.first_name && d.last_name) return `${d.first_name} ${d.last_name}`.trim();
    if (d.first_name) return d.first_name;
    if (d.title) return d.title;
    if (d.subject) return d.subject;
    return 'Unnamed';
  };

  const handleOpen = () => {
    if (record) {
      if (onOpen) onOpen(relatedObjectType, record.series_id, record);
      else navigate(`/crm/${relatedObjectType}/${record.series_id}`);
      onClose();
    }
  };

  const handleCopyLink = () => {
    if (record) {
      const url = `${window.location.origin}/crm/${relatedObjectType}/${record.series_id}`;
      navigator.clipboard.writeText(url);
      toast.success('Link copied');
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
                <h3 className="text-white font-semibold truncate">{getRecordName(record)}</h3>
                <div className="flex items-center space-x-2 mt-0.5">
                  <Badge variant="secondary" className="bg-white/20 text-white text-xs capitalize">
                    {relatedObjectType}
                  </Badge>
                  {record?.series_id && (
                    <span className="text-white/70 text-xs font-mono">{record.series_id}</span>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="px-4 py-3 space-y-2.5 max-h-48 overflow-y-auto">
        {loading ? (
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
          <div className="text-center py-4 text-slate-500 text-sm">{error}</div>
        ) : (
          fieldsWithMeta.map(({ key, label, type, icon: FieldIcon }) => {
            const value = formatFieldValue(record?.data?.[key], key, type);
            if (!value) return null;
            return (
              <div key={key} className="flex items-start space-x-3">
                <FieldIcon className="h-4 w-4 text-slate-400 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="text-xs text-slate-500 block">{label}</span>
                  <span className="text-sm text-slate-900 truncate block">
                    {key === 'email' || type === 'email' ? (
                      <a href={`mailto:${value}`} className="text-indigo-600 hover:underline">{value}</a>
                    ) : key === 'phone' || type === 'phone' ? (
                      <a href={`tel:${value}`} className="text-indigo-600 hover:underline">{value}</a>
                    ) : key === 'website' || type === 'url' ? (
                      <a href={value.startsWith('http') ? value : `https://${value}`} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">{value}</a>
                    ) : value}
                  </span>
                </div>
              </div>
            );
          }).filter(Boolean)
        )}
        {!loading && !error && fieldsWithMeta.every(({ key }) => !record?.data?.[key]) && (
          <div className="text-center py-2 text-slate-500 text-sm">No details available</div>
        )}
      </div>

      {!loading && !error && (
        <div className="px-4 py-2 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={handleCopyLink} className="text-slate-600 hover:text-slate-900 h-8">
            <Copy className="h-3.5 w-3.5 mr-1.5" />Copy Link
          </Button>
          <Button size="sm" onClick={handleOpen} className="bg-indigo-600 hover:bg-indigo-700 h-8">
            <ExternalLink className="h-3.5 w-3.5 mr-1.5" />Open
          </Button>
        </div>
      )}
    </div>
  );

  return createPortal(cardContent, document.body);
};

/**
 * ConfigurableLookupDisplay - Main component
 * 
 * Props:
 * - sourceObjectName: The object containing this lookup field (e.g., 'contact')
 * - fieldName: The API name of the lookup field (e.g., 'account_id')
 * - relatedObjectType: The object the lookup points to (e.g., 'account')
 * - recordId: The ID of the related record
 * - displayValue: Text to display (record name)
 * - onClick: Optional click handler
 * - className: Optional CSS classes
 * 
 * UX Behavior (Salesforce standard):
 * - Hover = Shows preview card (after 400ms delay)
 * - Click = Navigates to record (NEVER blocked by hover)
 * - Clean separation of hover and click interactions
 */
export const ConfigurableLookupDisplay = ({
  sourceObjectName,
  fieldName,
  relatedObjectType,
  recordId,
  displayValue,
  onClick,
  className = "text-indigo-600 hover:text-indigo-800 hover:underline cursor-pointer"
}) => {
  const navigate = useNavigate();
  const [hoverConfig, setHoverConfig] = useState({ enabled: false, previewFields: [] });
  const [configLoaded, setConfigLoaded] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  
  const timeoutRef = useRef(null);
  const closeTimeoutRef = useRef(null);
  const isHoveringTriggerRef = useRef(false);
  const isHoveringCardRef = useRef(false);

  // Load hover config on mount
  useEffect(() => {
    const loadConfig = async () => {
      if (sourceObjectName && fieldName) {
        const config = await checkHoverEnabled(sourceObjectName, fieldName);
        setHoverConfig(config);
      }
      setConfigLoaded(true);
    };
    loadConfig();
  }, [sourceObjectName, fieldName]);

  const handleMouseEnter = useCallback((e) => {
    if (!hoverConfig.enabled) return;
    
    isHoveringTriggerRef.current = true;
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    timeoutRef.current = setTimeout(() => {
      if (isHoveringTriggerRef.current) {
        const rect = e.target.getBoundingClientRect();
        setPosition({ x: rect.right + 10, y: rect.top + rect.height / 2 });
        setShowPreview(true);
      }
    }, 400);
  }, [hoverConfig.enabled]);

  const handleMouseLeave = useCallback(() => {
    isHoveringTriggerRef.current = false;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    
    closeTimeoutRef.current = setTimeout(() => {
      if (!isHoveringTriggerRef.current && !isHoveringCardRef.current) {
        setShowPreview(false);
      }
    }, 150);
  }, []);

  const handleCardMouseEnter = useCallback(() => {
    isHoveringCardRef.current = true;
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
  }, []);

  const handleCardMouseLeave = useCallback(() => {
    isHoveringCardRef.current = false;
    closeTimeoutRef.current = setTimeout(() => {
      if (!isHoveringTriggerRef.current && !isHoveringCardRef.current) {
        setShowPreview(false);
      }
    }, 150);
  }, []);

  const closePreview = useCallback(() => {
    isHoveringTriggerRef.current = false;
    isHoveringCardRef.current = false;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
    setShowPreview(false);
  }, []);

  // Handle click - ALWAYS navigates, never blocked by hover
  const handleClick = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Close hover preview immediately
    closePreview();
    
    // Navigate
    if (onClick) {
      onClick();
    } else if (recordId && relatedObjectType) {
      navigate(`/crm/${relatedObjectType}/${recordId}`);
    }
  }, [onClick, recordId, relatedObjectType, navigate, closePreview]);

  const handleOpenRecord = useCallback((objType, seriesId, record) => {
    closePreview();
    if (onClick) onClick();
    else navigate(`/crm/${objType}/${seriesId}`);
  }, [onClick, navigate, closePreview]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
    };
  }, []);

  if (!displayValue) return null;

  return (
    <>
      {/* Link element - always clickable, hover does NOT block click */}
      <a
        href={recordId && relatedObjectType ? `#${relatedObjectType}/${recordId}` : '#'}
        onClick={handleClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={`${className} inline-block`}
        data-testid={`lookup-${fieldName}`}
      >
        {displayValue}
      </a>
      
      {/* Only show hover preview if explicitly enabled for this field */}
      {hoverConfig.enabled && showPreview && recordId && (
        <HoverPreviewCard
          relatedObjectType={hoverConfig.relatedObject || relatedObjectType}
          recordId={recordId}
          previewFields={hoverConfig.previewFields}
          position={position}
          onClose={closePreview}
          onCardMouseEnter={handleCardMouseEnter}
          onCardMouseLeave={handleCardMouseLeave}
          onOpen={handleOpenRecord}
        />
      )}
    </>
  );
};

/**
 * Clear all hover-related caches
 */
export const clearLookupHoverCaches = () => {
  hoverConfigCache.clear();
  previewCache.clear();
  metadataCache.clear();
};

export default ConfigurableLookupDisplay;
