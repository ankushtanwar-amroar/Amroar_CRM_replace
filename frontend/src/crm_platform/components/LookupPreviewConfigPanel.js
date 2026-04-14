/**
 * LookupPreviewConfigPanel - Admin panel for configuring lookup field hover preview
 * Allows admins to select which fields appear in the hover preview card for an object
 */
import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { 
  Eye, 
  EyeOff, 
  Save, 
  RefreshCw, 
  GripVertical, 
  Plus, 
  X, 
  AlertCircle,
  Info,
  User,
  Building2,
  Briefcase,
  Mail,
  Phone,
  Calendar,
  FileText,
  ExternalLink,
  Copy
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Switch } from '../../components/ui/switch';
import { Badge } from '../../components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import toast from 'react-hot-toast';

const API = process.env.REACT_APP_BACKEND_URL || '';

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
  task: FileText,
  event: Calendar,
  default: FileText
};

// Field icon mapping
const getFieldIcon = (fieldKey) => {
  if (!fieldKey) return FileText;
  const key = fieldKey.toLowerCase();
  if (key.includes('email')) return Mail;
  if (key.includes('phone')) return Phone;
  if (key.includes('company') || key.includes('account')) return Building2;
  if (key.includes('date')) return Calendar;
  return FileText;
};

// Sample data for preview
const sampleData = {
  lead: { name: 'John Smith', email: 'john.smith@example.com', phone: '(555) 123-4567', company: 'Acme Corp', title: 'CEO', status: 'Working' },
  contact: { name: 'Jane Doe', email: 'jane.doe@example.com', phone: '(555) 987-6543', account_name: 'TechCo', title: 'VP Sales', department: 'Sales' },
  account: { name: 'Global Industries', phone: '(555) 456-7890', website: 'www.globalindustries.com', industry: 'Technology', type: 'Customer', annual_revenue: '$5,000,000' },
  opportunity: { name: 'Big Deal Q1', amount: '$50,000', stage: 'Negotiation', close_date: '2026-02-15', probability: '75%', type: 'New Business' },
  task: { subject: 'Follow up call', status: 'In Progress', priority: 'High', due_date: '2026-01-15' },
  event: { subject: 'Client Meeting', start_date: '2026-01-20', end_date: '2026-01-20', location: 'Conference Room A' }
};

// Live Preview Card Component
const LivePreviewCard = ({ objectName, objectLabel, selectedFields, enabled }) => {
  const ObjectIcon = objectIcons[objectName] || objectIcons.default;
  const data = sampleData[objectName] || sampleData.lead;
  
  if (!enabled) {
    return (
      <div className="bg-slate-100 border-2 border-dashed border-slate-300 rounded-lg p-8 text-center">
        <EyeOff className="h-8 w-8 text-slate-400 mx-auto mb-2" />
        <p className="text-slate-500 font-medium">Preview Disabled</p>
        <p className="text-slate-400 text-sm mt-1">Enable hover preview to see the card</p>
      </div>
    );
  }
  
  const fieldsToShow = selectedFields.length > 0 
    ? selectedFields 
    : [
        { key: 'email', label: 'Email' },
        { key: 'phone', label: 'Phone' },
        { key: 'company', label: 'Company' }
      ];

  return (
    <div className="bg-white rounded-lg shadow-xl border border-slate-200 w-80 overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-500 to-indigo-600 px-4 py-3">
        <div className="flex items-center space-x-3">
          <div className="bg-white/20 rounded-lg p-2">
            <ObjectIcon className="h-5 w-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-white font-semibold truncate">
              {data.name || data.subject || 'Sample Record'}
            </h3>
            <div className="flex items-center space-x-2 mt-0.5">
              <Badge variant="secondary" className="bg-white/20 text-white text-xs capitalize">
                {objectLabel || objectName}
              </Badge>
              <span className="text-white/70 text-xs font-mono">
                {objectName.substring(0,3).toUpperCase()}-001
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Fields */}
      <div className="px-4 py-3 space-y-2.5 max-h-48 overflow-y-auto">
        {fieldsToShow.map(field => {
          const fieldKey = field.key || '';
          const FieldIcon = getFieldIcon(fieldKey);
          const value = data[fieldKey] || 'Sample value';
          
          return (
            <div key={fieldKey || field.label} className="flex items-start space-x-3">
              <FieldIcon className="h-4 w-4 text-slate-400 mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <span className="text-xs text-slate-500 block">{field.label}</span>
                <span className="text-sm text-slate-900 truncate block">
                  {fieldKey.toLowerCase().includes('email') ? (
                    <span className="text-indigo-600">{value}</span>
                  ) : fieldKey.toLowerCase().includes('phone') ? (
                    <span className="text-indigo-600">{value}</span>
                  ) : (
                    value
                  )}
                </span>
              </div>
            </div>
          );
        })}
        
        {fieldsToShow.length === 0 && (
          <div className="text-center py-2 text-slate-500 text-sm">
            No fields configured
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="px-4 py-2 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
        <Button variant="ghost" size="sm" className="text-slate-600 h-8" disabled>
          <Copy className="h-3.5 w-3.5 mr-1.5" />
          Copy Link
        </Button>
        <Button size="sm" className="bg-indigo-600 h-8" disabled>
          <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
          Open
        </Button>
      </div>
    </div>
  );
};

// Sortable Field Item Component
const SortableFieldItem = ({ field, onRemove }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: field.key });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 p-3 bg-white border rounded-lg shadow-sm ${
        isDragging ? 'shadow-lg ring-2 ring-indigo-500' : 'hover:border-indigo-300'
      }`}
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab text-slate-400 hover:text-slate-600"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm text-slate-800 truncate">
          {field.label || field.key}
        </div>
        <div className="text-xs text-slate-500 font-mono truncate">
          {field.key}
        </div>
      </div>
      
      <Badge variant="outline" className="text-xs capitalize shrink-0">
        {field.type || 'text'}
      </Badge>
      
      <button
        onClick={() => onRemove(field.key)}
        className="text-slate-400 hover:text-red-500 transition-colors p-1"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
};

const LookupPreviewConfigPanel = ({ objectName, objectLabel }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState({
    enabled: true,
    preview_fields: [],
    field_order: []
  });
  const [availableFields, setAvailableFields] = useState([]);
  const [selectedFields, setSelectedFields] = useState([]);
  const [hasChanges, setHasChanges] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const formatLabel = useCallback((key) => {
    return key
      .replace(/_/g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/\b\w/g, c => c.toUpperCase());
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch config and metadata in parallel
      const [configRes, metadataRes] = await Promise.all([
        axios.get(`${API}/api/lookup-preview-config/${objectName}`, {
          headers: getAuthHeader()
        }),
        axios.get(`${API}/api/metadata/${objectName}`, {
          headers: getAuthHeader()
        })
      ]);

      const configData = configRes.data;
      const metadataData = metadataRes.data;

      // Build available fields list from metadata
      // Note: metadata uses api_name as the field key
      const fields = (metadataData?.fields || []).map(f => ({
        ...f,
        key: f.api_name || f.key || f.name,
        name: f.api_name || f.key || f.name
      }));
      setAvailableFields(fields);

      // Build selected fields with metadata
      const selectedFieldKeys = configData.preview_fields || [];
      const selected = selectedFieldKeys.map(key => {
        const metaField = fields.find(f => f.key === key || f.api_name === key);
        return {
          key,
          label: metaField?.label || formatLabel(key),
          type: metaField?.type || 'text'
        };
      }).filter(f => f.key); // Filter out any fields without keys

      setConfig(configData);
      setSelectedFields(selected);
      setHasChanges(false);
    } catch (error) {
      console.error('Error fetching config:', error);
      toast.error('Failed to load configuration');
    } finally {
      setLoading(false);
    }
  }, [objectName, formatLabel]);

  useEffect(() => {
    if (objectName) {
      fetchData();
    }
  }, [objectName, fetchData]);

  const handleToggleEnabled = (enabled) => {
    setConfig(prev => ({ ...prev, enabled }));
    setHasChanges(true);
  };

  const handleRemoveField = (fieldKey) => {
    setSelectedFields(prev => prev.filter(f => f.key !== fieldKey));
    setHasChanges(true);
  };

  const handleDragEnd = (event) => {
    const { active, over } = event;

    if (active.id !== over.id) {
      setSelectedFields((items) => {
        const oldIndex = items.findIndex(i => i.key === active.id);
        const newIndex = items.findIndex(i => i.key === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
      setHasChanges(true);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Filter out any fields with undefined/null keys
      const validFields = selectedFields.filter(f => f.key);
      const fieldKeys = validFields.map(f => f.key);
      
      const payload = {
        enabled: config.enabled,
        preview_fields: fieldKeys,
        field_order: fieldKeys
      };

      console.log('Saving config:', payload);

      await axios.put(
        `${API}/api/lookup-preview-config/${objectName}`,
        payload,
        { headers: getAuthHeader() }
      );

      toast.success('Configuration saved successfully');
      setHasChanges(false);
    } catch (error) {
      console.error('Error saving config:', error);
      const errorMsg = error.response?.data?.detail || 'Failed to save configuration';
      toast.error(typeof errorMsg === 'string' ? errorMsg : 'Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  // Get fields that haven't been selected yet
  const unselectedFields = availableFields.filter(
    f => !selectedFields.some(sf => sf.key === f.key || sf.key === f.api_name)
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="h-6 w-6 animate-spin text-indigo-600" />
        <span className="ml-2 text-slate-600">Loading configuration...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
            <Eye className="h-5 w-5 text-indigo-600" />
            Lookup Hover Preview
          </h3>
          <p className="text-sm text-slate-500 mt-1">
            Configure which fields appear when users hover over {objectLabel || objectName} lookup links
          </p>
        </div>
        
        <Button
          onClick={handleSave}
          disabled={!hasChanges || saving}
          className="bg-indigo-600 hover:bg-indigo-700"
        >
          {saving ? (
            <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          Save Changes
        </Button>
      </div>

      {/* Info Box */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
        <Info className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" />
        <div className="text-sm text-blue-800">
          <p className="font-medium">About Lookup Hover Preview</p>
          <p className="mt-1">
            When users hover over a link to a {objectLabel || objectName} record, a preview card 
            will appear showing the fields you configure below. This provides quick context 
            without navigating away from the current page.
          </p>
        </div>
      </div>

      {/* Enable/Disable Toggle */}
      <div className="bg-white border rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="font-medium text-slate-800">Enable Hover Preview</h4>
            <p className="text-sm text-slate-500 mt-0.5">
              {config.enabled 
                ? 'Preview cards will appear when hovering over lookup links'
                : 'Hover preview is disabled for this object'
              }
            </p>
          </div>
          <Switch
            checked={config.enabled}
            onCheckedChange={handleToggleEnabled}
          />
        </div>
      </div>

      {/* Field Configuration */}
      {config.enabled && (
        <div className="bg-white border rounded-lg p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-medium text-slate-800">Preview Fields</h4>
            <Badge variant="outline" className="text-xs">
              {selectedFields.length} field{selectedFields.length !== 1 ? 's' : ''} selected
            </Badge>
          </div>

          {/* Add Field - Using DropdownMenu for single-click add */}
          <div className="flex gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="flex-1 justify-between">
                  <span className="text-slate-500">Select a field to add...</span>
                  <Plus className="h-4 w-4 ml-2" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-80 max-h-64 overflow-y-auto">
                {unselectedFields.length === 0 ? (
                  <div className="p-3 text-sm text-slate-500 text-center">
                    All available fields have been added
                  </div>
                ) : (
                  unselectedFields.map(field => (
                    <DropdownMenuItem
                      key={field.key || field.name}
                      onClick={() => {
                        const fieldKey = field.key || field.name;
                        const newField = {
                          key: fieldKey,
                          label: field.label || formatLabel(fieldKey),
                          type: field.type || 'text'
                        };
                        setSelectedFields(prev => [...prev, newField]);
                        setHasChanges(true);
                        toast.success(`Added "${newField.label}" to preview`);
                      }}
                      className="cursor-pointer"
                    >
                      <div className="flex items-center gap-2 w-full">
                        <Plus className="h-4 w-4 text-green-600" />
                        <span className="font-medium">{field.label || formatLabel(field.key || field.name)}</span>
                        <span className="text-xs text-slate-400 font-mono ml-auto">
                          {field.key || field.name}
                        </span>
                      </div>
                    </DropdownMenuItem>
                  ))
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Selected Fields List */}
          {selectedFields.length === 0 ? (
            <div className="border-2 border-dashed border-slate-200 rounded-lg p-8 text-center">
              <EyeOff className="h-8 w-8 text-slate-300 mx-auto mb-2" />
              <p className="text-slate-500 text-sm">
                No fields selected. Add fields above to display in the hover preview.
              </p>
              <p className="text-slate-400 text-xs mt-1">
                If no fields are selected, default fields will be shown.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-slate-500">
                Drag to reorder • Fields will appear in this order in the preview card
              </p>
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={selectedFields.map(f => f.key)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-2">
                    {selectedFields.map(field => (
                      <SortableFieldItem
                        key={field.key}
                        field={field}
                        onRemove={handleRemoveField}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            </div>
          )}
        </div>
      )}

      {/* Live Preview Section */}
      <div className="bg-slate-50 border rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h4 className="font-medium text-slate-800 flex items-center gap-2">
              <Eye className="h-4 w-4 text-indigo-600" />
              Live Preview
            </h4>
            <p className="text-sm text-slate-500 mt-0.5">
              See how the hover card will look with your selected fields
            </p>
          </div>
          <Badge variant="outline" className="text-xs">
            Sample Data
          </Badge>
        </div>
        
        <div className="flex justify-center">
          <LivePreviewCard
            objectName={objectName}
            objectLabel={objectLabel}
            selectedFields={selectedFields}
            enabled={config.enabled}
          />
        </div>
      </div>

      {/* Unsaved Changes Warning */}
      {hasChanges && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-amber-600" />
          <span className="text-sm text-amber-800">
            You have unsaved changes. Click &quot;Save Changes&quot; to apply them.
          </span>
        </div>
      )}
    </div>
  );
};

export default LookupPreviewConfigPanel;
