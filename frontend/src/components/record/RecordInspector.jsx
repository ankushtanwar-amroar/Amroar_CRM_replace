/**
 * RecordInspector - Enhanced "View Data" Panel with Inline Editing
 * 
 * A utility panel that allows users to view and edit all field values
 * of a record, including fields not present on the page layout.
 * 
 * Features:
 * - Floating icon on right side of record detail pages
 * - Right-side drawer showing all fields
 * - Groups fields by category (System, Standard, Custom)
 * - Search/filter functionality
 * - Copy field values to clipboard
 * - INLINE EDITING for non-system fields
 * - Edit mode toggle with Save/Cancel
 * 
 * Access: Admin users only
 * 
 * NOTE: Uses React Portal to render outside parent container hierarchy
 * to avoid visibility:hidden issues from parent tab panels.
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { 
  Search, 
  X, 
  Copy, 
  Check, 
  ChevronRight,
  Database,
  Eye,
  Loader2,
  AlertCircle,
  Settings2,
  Code,
  Hash,
  Calendar,
  User,
  ToggleLeft,
  Type,
  List,
  Pencil,
  Save,
  XCircle,
  Lock
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Badge } from '../../components/ui/badge';
import { ScrollArea } from '../../components/ui/scroll-area';
import { Separator } from '../../components/ui/separator';
import { Switch } from '../../components/ui/switch';
import { cn } from '../../lib/utils';
import toast from 'react-hot-toast';

const API_URL = process.env.REACT_APP_BACKEND_URL;

// System fields that cannot be edited
const SYSTEM_FIELDS = [
  'id', 'created_by', 'created_at', 'updated_by', 'updated_at', 
  'is_deleted', 'owner_id', 'tenant_id', 'series_id', 'record_type'
];

/**
 * Get icon for field type
 */
const getFieldTypeIcon = (type) => {
  switch (type?.toLowerCase()) {
    case 'id':
    case 'lookup':
      return <Hash className="h-3.5 w-3.5" />;
    case 'datetime':
    case 'date':
      return <Calendar className="h-3.5 w-3.5" />;
    case 'boolean':
      return <ToggleLeft className="h-3.5 w-3.5" />;
    case 'number':
    case 'currency':
    case 'percent':
      return <Code className="h-3.5 w-3.5" />;
    case 'picklist':
    case 'multi_select':
      return <List className="h-3.5 w-3.5" />;
    case 'reference':
      return <User className="h-3.5 w-3.5" />;
    default:
      return <Type className="h-3.5 w-3.5" />;
  }
};

/**
 * Get category color
 */
const getCategoryColor = (category) => {
  switch (category) {
    case 'system':
      return 'bg-slate-100 text-slate-700 border-slate-200';
    case 'standard':
      return 'bg-blue-50 text-blue-700 border-blue-200';
    case 'custom':
      return 'bg-purple-50 text-purple-700 border-purple-200';
    case 'data':
      return 'bg-amber-50 text-amber-700 border-amber-200';
    default:
      return 'bg-gray-100 text-gray-700 border-gray-200';
  }
};

/**
 * Format field value for display
 */
const formatFieldValue = (value, type, displayName = null) => {
  if (value === null || value === undefined) {
    return <span className="text-slate-400 italic">null</span>;
  }
  
  if (value === '') {
    return <span className="text-slate-400 italic">empty string</span>;
  }
  
  // For lookup fields with resolved display names
  if (displayName && (type === 'lookup' || type === 'reference')) {
    const shortId = String(value).length > 12 ? String(value).substring(0, 12) + '...' : String(value);
    return (
      <span>
        <span className="text-slate-900 font-medium">{displayName}</span>
        <span className="text-slate-500 ml-1">({shortId})</span>
      </span>
    );
  }
  
  if (typeof value === 'boolean') {
    return (
      <Badge variant={value ? 'default' : 'secondary'} className="font-mono text-xs">
        {value ? 'true' : 'false'}
      </Badge>
    );
  }
  
  if (type === 'datetime' || type === 'date') {
    try {
      const date = new Date(value);
      return date.toLocaleString();
    } catch {
      return String(value);
    }
  }
  
  if (Array.isArray(value)) {
    return value.join(', ') || <span className="text-slate-400 italic">empty array</span>;
  }
  
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  
  return String(value);
};

/**
 * Check if a field is editable
 */
const isFieldEditable = (field) => {
  // System fields are not editable
  if (field.category === 'system' || SYSTEM_FIELDS.includes(field.api_name)) {
    return false;
  }
  // Formula fields are not editable
  if (field.type === 'formula' || field.is_formula) {
    return false;
  }
  // Lookup/reference fields need special handling (not inline editable for now)
  if (field.type === 'lookup' || field.type === 'reference') {
    return false;
  }
  return true;
};

/**
 * Editable Field Input Component
 */
const EditableFieldInput = ({ field, value, onChange }) => {
  const fieldType = field.type?.toLowerCase();
  
  // Boolean field - use switch
  if (fieldType === 'boolean') {
    return (
      <div className="flex items-center gap-2">
        <Switch
          checked={value === true || value === 'true'}
          onCheckedChange={(checked) => onChange(checked)}
        />
        <span className="text-sm text-slate-600">{value ? 'true' : 'false'}</span>
      </div>
    );
  }
  
  // Number fields
  if (fieldType === 'number' || fieldType === 'currency' || fieldType === 'percent') {
    return (
      <Input
        type="number"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        className="h-8 text-sm font-mono"
        placeholder="Enter number..."
      />
    );
  }
  
  // Date fields
  if (fieldType === 'date') {
    return (
      <Input
        type="date"
        value={value ? value.split('T')[0] : ''}
        onChange={(e) => onChange(e.target.value || null)}
        className="h-8 text-sm"
      />
    );
  }
  
  // DateTime fields
  if (fieldType === 'datetime') {
    return (
      <Input
        type="datetime-local"
        value={value ? value.substring(0, 16) : ''}
        onChange={(e) => onChange(e.target.value ? new Date(e.target.value).toISOString() : null)}
        className="h-8 text-sm"
      />
    );
  }
  
  // Picklist fields
  if (fieldType === 'picklist' && field.options) {
    return (
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        className="w-full h-8 text-sm border rounded px-2 bg-white"
      >
        <option value="">-- Select --</option>
        {field.options.map((opt) => (
          <option key={opt.value || opt} value={opt.value || opt}>
            {opt.label || opt}
          </option>
        ))}
      </select>
    );
  }
  
  // Default: Text input
  return (
    <Input
      type="text"
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
      className="h-8 text-sm"
      placeholder="Enter value..."
    />
  );
};

/**
 * Field Row Component with Edit Mode Support
 */
const FieldRow = ({ field, isEditMode, editedValue, onValueChange, onCopy }) => {
  const [copied, setCopied] = useState(false);
  const editable = isFieldEditable(field);
  const isBeingEdited = isEditMode && editable;
  
  const handleCopy = () => {
    let textValue = '';
    if (field.display_name && field.value) {
      textValue = `${field.display_name} (${field.value})`;
    } else {
      textValue = field.value === null || field.value === undefined ? '' : String(field.value);
    }
    navigator.clipboard.writeText(textValue);
    setCopied(true);
    onCopy(field.api_name);
    setTimeout(() => setCopied(false), 2000);
  };
  
  // Determine the current display value
  const displayValue = isBeingEdited && editedValue !== undefined ? editedValue : field.value;
  
  return (
    <div 
      className={cn(
        "group px-4 py-3 border-b border-slate-100 last:border-b-0 transition-colors",
        isBeingEdited ? "bg-blue-50/50" : "hover:bg-slate-50"
      )}
      data-testid={`field-row-${field.api_name}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          {/* Field Label */}
          <div className="flex items-center gap-2 mb-1">
            <span className="text-slate-400">
              {getFieldTypeIcon(field.type)}
            </span>
            <span className="font-medium text-slate-800 text-sm">
              {field.label}
            </span>
            <Badge 
              variant="outline" 
              className={cn("text-[10px] px-1.5 py-0", getCategoryColor(field.category))}
            >
              {field.category}
            </Badge>
            {!editable && isEditMode && (
              <Lock className="h-3 w-3 text-slate-400" title="Read-only field" />
            )}
          </div>
          
          {/* API Name */}
          <div className="text-xs text-slate-500 font-mono mb-2">
            {field.api_name}
          </div>
          
          {/* Value / Input */}
          {isBeingEdited ? (
            <EditableFieldInput
              field={field}
              value={editedValue !== undefined ? editedValue : field.value}
              onChange={(newValue) => onValueChange(field.api_name, newValue)}
            />
          ) : (
            <div className="text-sm text-slate-900 break-all font-mono bg-slate-50 px-2 py-1.5 rounded border border-slate-200">
              {formatFieldValue(displayValue, field.type, field.display_name)}
            </div>
          )}
        </div>
        
        {/* Copy Button (only in view mode) */}
        {!isEditMode && (
          <Button
            variant="ghost"
            size="sm"
            className="opacity-0 group-hover:opacity-100 transition-opacity h-7 w-7 p-0"
            onClick={handleCopy}
            title="Copy value"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-green-600" />
            ) : (
              <Copy className="h-3.5 w-3.5 text-slate-400" />
            )}
          </Button>
        )}
      </div>
    </div>
  );
};

/**
 * Main RecordInspector Component (Renamed to "View Data" in UI)
 */
const RecordInspector = () => {
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [hasAccess, setHasAccess] = useState(false);
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [inspectionData, setInspectionData] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  
  // Edit mode state
  const [isEditMode, setIsEditMode] = useState(false);
  const [editedValues, setEditedValues] = useState({});
  
  // Extract objectName and recordId from the current route
  const { objectName, recordId, isRecordPage } = useMemo(() => {
    const pathname = location.pathname;
    
    // Match /crm/:objectType/:recordId pattern
    const crmMatch = pathname.match(/^\/crm\/([^/]+)\/([^/]+)$/);
    if (crmMatch) {
      return {
        objectName: crmMatch[1],
        recordId: crmMatch[2],
        isRecordPage: true
      };
    }
    
    // Match legacy /:objectName/:recordId/view pattern
    const legacyMatch = pathname.match(/^\/([^/]+)\/([^/]+)\/view$/);
    if (legacyMatch) {
      return {
        objectName: legacyMatch[1],
        recordId: legacyMatch[2],
        isRecordPage: true
      };
    }
    
    // Not a record page
    return {
      objectName: null,
      recordId: null,
      isRecordPage: false
    };
  }, [location.pathname]);
  
  // Reset state when route changes
  useEffect(() => {
    setIsOpen(false);
    setInspectionData(null);
    setSearchQuery('');
    setSelectedCategory('all');
    setError(null);
    setIsEditMode(false);
    setEditedValues({});
  }, [location.pathname]);
  
  // Check if user has access to inspector
  useEffect(() => {
    const checkAccess = async () => {
      try {
        const token = localStorage.getItem('token');
        if (!token) {
          setHasAccess(false);
          setCheckingAccess(false);
          return;
        }
        
        const response = await fetch(`${API_URL}/api/record-inspector/check-access`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.ok) {
          const data = await response.json();
          setHasAccess(data.has_access);
        } else {
          setHasAccess(false);
        }
      } catch (err) {
        console.error('Error checking inspector access:', err);
        setHasAccess(false);
      } finally {
        setCheckingAccess(false);
      }
    };
    
    checkAccess();
  }, []);
  
  // Fetch inspection data when drawer opens
  const fetchInspectionData = useCallback(async () => {
    if (!objectName || !recordId) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(
        `${API_URL}/api/record-inspector/${objectName}/${recordId}`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to fetch record data');
      }
      
      const data = await response.json();
      setInspectionData(data);
    } catch (err) {
      console.error('Error fetching inspection data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [objectName, recordId]);
  
  // Fetch data when drawer opens
  useEffect(() => {
    if (isOpen && hasAccess && objectName && recordId) {
      fetchInspectionData();
    }
  }, [isOpen, hasAccess, objectName, recordId, fetchInspectionData]);
  
  // Handle copy notification
  const handleCopy = (fieldName) => {
    toast.success(`Copied ${fieldName}`, { duration: 1500 });
  };
  
  // Handle value change in edit mode
  const handleValueChange = (fieldApiName, newValue) => {
    setEditedValues(prev => ({
      ...prev,
      [fieldApiName]: newValue
    }));
  };
  
  // Toggle edit mode
  const handleToggleEditMode = () => {
    if (isEditMode) {
      // Exiting edit mode - discard changes
      setEditedValues({});
    }
    setIsEditMode(!isEditMode);
  };
  
  // Cancel edit
  const handleCancelEdit = () => {
    setEditedValues({});
    setIsEditMode(false);
  };
  
  // Save changes
  const handleSaveChanges = async () => {
    if (Object.keys(editedValues).length === 0) {
      toast.info('No changes to save');
      setIsEditMode(false);
      return;
    }
    
    setSaving(true);
    try {
      const token = localStorage.getItem('token');
      
      // Build update payload - use the correct API structure
      const updatePayload = {
        data: editedValues
      };
      
      // Use the records API endpoint (PUT /api/objects/{objectName}/records/{recordId})
      const response = await fetch(
        `${API_URL}/api/objects/${objectName}/records/${recordId}`,
        {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(updatePayload)
        }
      );
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to update record');
      }
      
      toast.success('Record updated successfully');
      
      // Reset edit state and refresh data
      setEditedValues({});
      setIsEditMode(false);
      
      // Refresh the inspector data
      await fetchInspectionData();
      
      // Dispatch event to notify other components to refresh
      window.dispatchEvent(new CustomEvent('record-updated', { 
        detail: { objectName, recordId } 
      }));
      
    } catch (err) {
      console.error('Error saving changes:', err);
      toast.error(err.message || 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  };
  
  // Filter fields based on search and category
  const filteredFields = inspectionData?.fields?.filter(field => {
    // Category filter
    if (selectedCategory !== 'all' && field.category !== selectedCategory) {
      return false;
    }
    
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        field.label.toLowerCase().includes(query) ||
        field.api_name.toLowerCase().includes(query) ||
        String(field.value).toLowerCase().includes(query)
      );
    }
    
    return true;
  }) || [];
  
  // Count edited fields
  const editedCount = Object.keys(editedValues).length;
  
  // Don't render if not on record page or no access
  if (checkingAccess || !hasAccess || !isRecordPage) {
    return null;
  }
  
  // Use createPortal to render outside parent container hierarchy
  const inspectorContent = (
    <>
      {/* Floating Inspector Button with Tooltip */}
      <div className="fixed right-0 top-1/2 -translate-y-1/2 z-[9999] group">
        {/* Tooltip */}
        <div className="absolute right-full mr-2 top-1/2 -translate-y-1/2 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <div className="bg-slate-900 text-white text-xs font-medium px-2.5 py-1.5 rounded shadow-lg whitespace-nowrap">
            View Data
            <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-full">
              <div className="border-4 border-transparent border-l-slate-900"></div>
            </div>
          </div>
        </div>
        
        {/* Button */}
        <button
          onClick={() => setIsOpen(true)}
          className={cn(
            "bg-slate-800 hover:bg-slate-700 text-white",
            "w-8 py-4 rounded-l-lg shadow-lg",
            "transition-colors duration-200",
            "flex flex-col items-center justify-center gap-1"
          )}
          data-testid="record-inspector-trigger"
        >
          <Eye className="h-4 w-4" />
          <span className="text-[10px] font-medium" style={{ writingMode: 'vertical-rl' }}>
            Data
          </span>
        </button>
      </div>
      
      {/* Backdrop */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/20 z-[9998] transition-opacity"
          onClick={() => {
            if (!isEditMode) setIsOpen(false);
          }}
        />
      )}
      
      {/* Drawer Panel */}
      <div
        className={cn(
          "fixed right-0 top-0 h-full w-[420px] bg-white shadow-2xl z-[9999]",
          "transform transition-transform duration-300 ease-in-out",
          isOpen ? "translate-x-0" : "translate-x-full"
        )}
        data-testid="record-inspector-drawer"
      >
        {/* Header */}
        <div className="bg-slate-800 text-white px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              <h2 className="font-semibold">View Data</h2>
            </div>
            <div className="flex items-center gap-2">
              {/* Edit Toggle Button */}
              {!isEditMode ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleToggleEditMode}
                  className="text-white hover:bg-slate-700 h-8 px-3 gap-1"
                  data-testid="edit-mode-button"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Edit
                </Button>
              ) : null}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (isEditMode) {
                    handleCancelEdit();
                  }
                  setIsOpen(false);
                }}
                className="text-white hover:bg-slate-700 h-8 w-8 p-0"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
          
          {inspectionData && (
            <div className="mt-2 text-sm text-slate-300">
              <div className="font-medium text-white">{inspectionData.object_label}</div>
              <div className="text-xs font-mono opacity-75">{inspectionData.record_id}</div>
            </div>
          )}
        </div>
        
        {/* Edit Mode Bar */}
        {isEditMode && (
          <div className="bg-blue-600 text-white px-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm">
              <Pencil className="h-4 w-4" />
              <span>Edit Mode</span>
              {editedCount > 0 && (
                <Badge className="bg-white/20 text-white text-xs">
                  {editedCount} change{editedCount !== 1 ? 's' : ''}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCancelEdit}
                className="text-white hover:bg-blue-700 h-7 px-2 text-xs"
                disabled={saving}
              >
                <XCircle className="h-3.5 w-3.5 mr-1" />
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSaveChanges}
                className="bg-white text-blue-600 hover:bg-blue-50 h-7 px-3 text-xs font-medium"
                disabled={saving || editedCount === 0}
                data-testid="save-changes-button"
              >
                {saving ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                ) : (
                  <Save className="h-3.5 w-3.5 mr-1" />
                )}
                Save
              </Button>
            </div>
          </div>
        )}
        
        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <Loader2 className="h-8 w-8 animate-spin text-slate-400 mx-auto" />
              <p className="mt-2 text-sm text-slate-500">Loading field data...</p>
            </div>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center px-4">
              <AlertCircle className="h-10 w-10 text-red-400 mx-auto" />
              <p className="mt-2 text-sm font-medium text-slate-800">Failed to load</p>
              <p className="text-xs text-slate-500 mt-1">{error}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={fetchInspectionData}
                className="mt-3"
              >
                Retry
              </Button>
            </div>
          </div>
        ) : inspectionData ? (
          <>
            {/* Search & Filter Bar */}
            <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Search fields..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 h-9"
                  data-testid="inspector-search"
                />
              </div>
              
              {/* Category Pills */}
              <div className="flex gap-1 mt-2 flex-wrap">
                {['all', 'system', 'standard', 'custom', 'data'].map(category => (
                  <button
                    key={category}
                    onClick={() => setSelectedCategory(category)}
                    className={cn(
                      "px-2 py-1 text-xs rounded-full transition-colors",
                      selectedCategory === category
                        ? "bg-slate-800 text-white"
                        : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
                    )}
                  >
                    {category === 'all' ? 'All' : category.charAt(0).toUpperCase() + category.slice(1)}
                    {category !== 'all' && inspectionData.categories && (
                      <span className="ml-1 opacity-75">
                        ({inspectionData.categories[category] || 0})
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
            
            {/* Summary Stats */}
            <div className="px-4 py-2 bg-slate-100 border-b border-slate-200 flex items-center justify-between">
              <span className="text-xs text-slate-600">
                Showing {filteredFields.length} of {inspectionData.total_fields} fields
              </span>
              <Badge variant="outline" className="text-xs">
                {inspectionData.object_name}
              </Badge>
            </div>
            
            {/* Field List */}
            <ScrollArea className={cn(
              isEditMode ? "h-[calc(100vh-310px)]" : "h-[calc(100vh-260px)]"
            )}>
              {filteredFields.length === 0 ? (
                <div className="flex items-center justify-center h-40 text-slate-500 text-sm">
                  No fields match your search
                </div>
              ) : (
                <div>
                  {filteredFields.map((field, index) => (
                    <FieldRow 
                      key={`${field.api_name}-${index}`} 
                      field={field} 
                      isEditMode={isEditMode}
                      editedValue={editedValues[field.api_name]}
                      onValueChange={handleValueChange}
                      onCopy={handleCopy}
                    />
                  ))}
                </div>
              )}
            </ScrollArea>
          </>
        ) : null}
      </div>
    </>
  );
  
  // Render using portal to escape parent visibility:hidden issues
  return createPortal(inspectorContent, document.body);
};

export default RecordInspector;
