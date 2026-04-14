/**
 * ReferenceFieldPicker - Dot-walk capable field selector for Flow Builder
 * 
 * Supports:
 * - Reference field expansion (Contact.Account.Name)
 * - Multi-level traversal up to 3 levels deep
 * - Dynamic field loading based on object metadata
 * - Visual indicators for reference fields
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronRight, Link2, Search, Loader2, X, ArrowLeft } from 'lucide-react';
import { Badge } from '../../../components/ui/badge';

const API_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';
const MAX_DOT_WALK_DEPTH = 3;

// Field type icons and colors
const FIELD_TYPE_CONFIG = {
  lookup: { color: 'text-purple-600', bgColor: 'bg-purple-50', icon: Link2, label: 'Reference' },
  reference: { color: 'text-purple-600', bgColor: 'bg-purple-50', icon: Link2, label: 'Reference' },
  text: { color: 'text-slate-600', bgColor: 'bg-slate-50', label: 'Text' },
  textarea: { color: 'text-slate-600', bgColor: 'bg-slate-50', label: 'Text Area' },
  email: { color: 'text-blue-600', bgColor: 'bg-blue-50', label: 'Email' },
  phone: { color: 'text-green-600', bgColor: 'bg-green-50', label: 'Phone' },
  number: { color: 'text-orange-600', bgColor: 'bg-orange-50', label: 'Number' },
  currency: { color: 'text-emerald-600', bgColor: 'bg-emerald-50', label: 'Currency' },
  date: { color: 'text-indigo-600', bgColor: 'bg-indigo-50', label: 'Date' },
  datetime: { color: 'text-indigo-600', bgColor: 'bg-indigo-50', label: 'DateTime' },
  boolean: { color: 'text-amber-600', bgColor: 'bg-amber-50', label: 'Boolean' },
  select: { color: 'text-cyan-600', bgColor: 'bg-cyan-50', label: 'Picklist' },
  picklist: { color: 'text-cyan-600', bgColor: 'bg-cyan-50', label: 'Picklist' },
};

const ReferenceFieldPicker = ({ 
  value, 
  onChange, 
  objectName,
  fetchFieldsForObject,
  placeholder = 'Select field',
  allowDotWalk = true,
  maxDepth = MAX_DOT_WALK_DEPTH,
  disabled = false
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [fields, setFields] = useState([]);
  const [loading, setLoading] = useState(false);
  const [fieldsCache, setFieldsCache] = useState({});
  
  // Navigation state for dot-walking
  const [navigationPath, setNavigationPath] = useState([]); // [{objectName, fieldName, label}]
  const [currentObjectName, setCurrentObjectName] = useState(objectName);
  
  const dropdownRef = useRef(null);
  const inputRef = useRef(null);

  // Parse the current value to determine initial navigation state
  useEffect(() => {
    if (value && value.includes('.') && allowDotWalk) {
      // Value like "Account.Name" or "Account.Owner.Email"
      // We start from the base object
    }
  }, [value, allowDotWalk]);

  // Fetch fields when object changes or navigation changes
  useEffect(() => {
    const loadFields = async () => {
      if (!currentObjectName) {
        setFields([]);
        return;
      }
      
      // Check cache first
      if (fieldsCache[currentObjectName]) {
        setFields(fieldsCache[currentObjectName]);
        return;
      }
      
      setLoading(true);
      try {
        let fetchedFields = [];
        
        if (fetchFieldsForObject) {
          fetchedFields = await fetchFieldsForObject(currentObjectName);
        } else {
          // Direct API call
          const token = localStorage.getItem('token');
          const response = await fetch(`${API_URL}/api/objects/${currentObjectName.toLowerCase()}`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (response.ok) {
            const data = await response.json();
            const fieldsData = data.fields || {};
            
            // Handle both array and object formats for fields
            if (Array.isArray(fieldsData)) {
              fetchedFields = fieldsData.map(f => ({
                name: f.api_name || f.name,
                label: f.label || f.name,
                type: f.type || 'text',
                related_object: f.related_object || f.referenceTo || null,
                is_required: f.is_required || f.required || false
              }));
            } else if (typeof fieldsData === 'object') {
              // Convert object format to array format
              // API returns: { "field_name": { type, label, ... }, ... }
              fetchedFields = Object.entries(fieldsData).map(([fieldName, fieldConfig]) => ({
                name: fieldName,
                label: fieldConfig.label || fieldName,
                type: fieldConfig.type || 'text',
                related_object: fieldConfig.related_object || null,
                is_required: fieldConfig.required || false
              }));
            }
          }
        }
        
        // Mark reference fields
        let processedFields = fetchedFields.map(f => ({
          ...f,
          isReference: f.type === 'lookup' || f.type === 'reference' || !!f.related_object
        }));
        
        // When navigating into a reference object (not the root object), 
        // always add "Id" field at the top if not already present
        const hasIdField = processedFields.some(f => f.name?.toLowerCase() === 'id' || f.name?.toLowerCase() === '_id');
        if (!hasIdField) {
          processedFields = [
            {
              name: 'Id',
              label: 'Record ID',
              type: 'id',
              isReference: false,
              is_required: false
            },
            ...processedFields
          ];
        }
        
        setFieldsCache(prev => ({ ...prev, [currentObjectName]: processedFields }));
        setFields(processedFields);
      } catch (err) {
        console.error('Error loading fields:', err);
        setFields([]);
      } finally {
        setLoading(false);
      }
    };
    
    loadFields();
  }, [currentObjectName, fetchFieldsForObject, fieldsCache]);

  // Reset navigation when object changes externally
  useEffect(() => {
    setNavigationPath([]);
    setCurrentObjectName(objectName);
  }, [objectName]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
        setSearchQuery('');
        // Reset navigation when closing
        setNavigationPath([]);
        setCurrentObjectName(objectName);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [objectName]);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Filter fields based on search
  const filteredFields = fields.filter(f => 
    f.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    f.label?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Handle field selection
  const handleSelectField = (field) => {
    if (field.isReference && allowDotWalk && navigationPath.length < maxDepth - 1) {
      // Navigate into reference field
      const relatedObjects = field.related_object?.split(',').map(s => s.trim()) || [];
      const relatedObject = relatedObjects[0]; // Take first related object
      
      if (relatedObject) {
        setNavigationPath(prev => [...prev, {
          objectName: currentObjectName,
          fieldName: field.name,
          label: field.label,
          relatedObject: relatedObject
        }]);
        setCurrentObjectName(relatedObject);
        setSearchQuery('');
        return;
      }
    }
    
    // Build the final field path
    const pathParts = navigationPath.map(p => p.fieldName);
    pathParts.push(field.name);
    
    // If we're navigating from a reference, use dot notation
    const finalPath = pathParts.join('.');
    
    onChange(finalPath);
    setIsOpen(false);
    setSearchQuery('');
    setNavigationPath([]);
    setCurrentObjectName(objectName);
  };

  // Handle navigation back
  const handleNavigateBack = () => {
    if (navigationPath.length > 0) {
      const newPath = [...navigationPath];
      newPath.pop();
      setNavigationPath(newPath);
      
      if (newPath.length > 0) {
        setCurrentObjectName(newPath[newPath.length - 1].relatedObject);
      } else {
        setCurrentObjectName(objectName);
      }
      setSearchQuery('');
    }
  };

  // Get display label for current value
  const getDisplayLabel = () => {
    if (!value) return placeholder;
    
    // If it's a dot-walk path, show the full path with labels
    if (value.includes('.')) {
      // Try to resolve labels from cache
      const parts = value.split('.');
      return parts.join(' → ');
    }
    
    // Find field in current fields
    const field = fields.find(f => f.name === value);
    return field?.label || value;
  };

  // Get field type config
  const getFieldTypeConfig = (type) => {
    const normalizedType = type?.toLowerCase() || 'text';
    return FIELD_TYPE_CONFIG[normalizedType] || FIELD_TYPE_CONFIG.text;
  };

  // Build breadcrumb for current navigation
  const getBreadcrumb = () => {
    const parts = [{ label: objectName, isStart: true }];
    navigationPath.forEach(p => {
      parts.push({ label: p.label, objectName: p.relatedObject });
    });
    return parts;
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ${
          disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-accent'
        }`}
        data-testid="reference-field-picker-trigger"
      >
        <span className={value ? 'text-foreground' : 'text-muted-foreground'}>
          {getDisplayLabel()}
        </span>
        <ChevronRight className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-50 mt-1 w-full min-w-[280px] bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden"
             data-testid="reference-field-picker-dropdown">
          {/* Breadcrumb Navigation */}
          {navigationPath.length > 0 && (
            <div className="px-3 py-2 bg-slate-50 border-b flex items-center gap-2 text-xs">
              <button
                type="button"
                onClick={handleNavigateBack}
                className="p-1 hover:bg-slate-200 rounded"
              >
                <ArrowLeft className="h-3 w-3" />
              </button>
              <div className="flex items-center gap-1 overflow-x-auto">
                {getBreadcrumb().map((crumb, idx) => (
                  <React.Fragment key={idx}>
                    {idx > 0 && <ChevronRight className="h-3 w-3 text-slate-400 flex-shrink-0" />}
                    <span className={`whitespace-nowrap ${idx === getBreadcrumb().length - 1 ? 'font-medium text-slate-900' : 'text-slate-500'}`}>
                      {crumb.label}
                    </span>
                  </React.Fragment>
                ))}
              </div>
            </div>
          )}
          
          {/* Search Input */}
          <div className="p-2 border-b">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                ref={inputRef}
                type="text"
                placeholder="Search fields..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-8 py-2 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 hover:bg-slate-100 rounded"
                >
                  <X className="h-3 w-3 text-slate-400" />
                </button>
              )}
            </div>
          </div>

          {/* Fields List */}
          <div className="max-h-[300px] overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
              </div>
            ) : filteredFields.length === 0 && !searchQuery?.toLowerCase().includes('id') && !searchQuery?.toLowerCase().includes('record') ? (
              <div className="py-8 text-center text-sm text-slate-500">
                No fields found
              </div>
            ) : (
              <div className="py-1">
                {/* Record ID - Always first, highlighted */}
                {navigationPath.length === 0 && (!searchQuery || 'record id'.includes(searchQuery.toLowerCase()) || 'id'.includes(searchQuery.toLowerCase())) && (
                  <button
                    type="button"
                    onClick={() => {
                      onChange('id');
                      setIsOpen(false);
                      setSearchQuery('');
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2 hover:bg-purple-50 text-left transition-colors bg-purple-50/50 border-b border-purple-100"
                    data-testid="field-option-record-id"
                  >
                    <div className="w-6 h-6 rounded bg-purple-200 flex items-center justify-center flex-shrink-0">
                      <span className="text-xs font-bold text-purple-700">🔑</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-purple-900">
                          Record ID
                        </span>
                      </div>
                      <span className="text-xs text-purple-600 font-mono">
                        id
                      </span>
                    </div>
                  </button>
                )}
                
                {filteredFields.map(field => {
                  const typeConfig = getFieldTypeConfig(field.type);
                  const canExpand = field.isReference && allowDotWalk && navigationPath.length < maxDepth - 1;
                  
                  return (
                    <button
                      key={field.name}
                      type="button"
                      onClick={() => handleSelectField(field)}
                      className="w-full flex items-center gap-3 px-3 py-2 hover:bg-slate-50 text-left transition-colors"
                      data-testid={`field-option-${field.name}`}
                    >
                      {/* Field Icon/Type Indicator */}
                      {field.isReference ? (
                        <div className="w-6 h-6 rounded bg-purple-100 flex items-center justify-center flex-shrink-0">
                          <Link2 className="h-3.5 w-3.5 text-purple-600" />
                        </div>
                      ) : (
                        <div className={`w-6 h-6 rounded ${typeConfig.bgColor} flex items-center justify-center flex-shrink-0`}>
                          <span className={`text-xs font-medium ${typeConfig.color}`}>
                            {field.type?.charAt(0).toUpperCase() || 'T'}
                          </span>
                        </div>
                      )}
                      
                      {/* Field Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm text-slate-900 truncate">
                            {field.label}
                          </span>
                          {field.is_required && (
                            <span className="text-red-500 text-xs">*</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-slate-400 font-mono truncate">
                            {field.name}
                          </span>
                          {field.isReference && field.related_object && (
                            <Badge variant="secondary" className="text-xs px-1.5 py-0">
                              → {field.related_object.split(',')[0]}
                            </Badge>
                          )}
                        </div>
                      </div>
                      
                      {/* Expand Arrow for References */}
                      {canExpand && (
                        <ChevronRight className="h-4 w-4 text-purple-400 flex-shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          
          {/* Footer hint */}
          {allowDotWalk && navigationPath.length < maxDepth - 1 && (
            <div className="px-3 py-2 bg-slate-50 border-t text-xs text-slate-500">
              <span className="flex items-center gap-1">
                <Link2 className="h-3 w-3" />
                Click reference fields to access related object fields
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ReferenceFieldPicker;
