/**
 * LookupConfigurationPanel - Unified Lookup Configuration UI
 * 
 * Two tabs:
 * - Tab A: Lookup Fields (Schema View) - Manage all lookup fields
 * - Tab B: Lookup Display & Search - Configure UI behavior (hover, search, etc.)
 * 
 * This component unifies lookup field management and configuration.
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
  Settings,
  ExternalLink,
  ChevronRight,
  Check,
  Search,
  Link2,
  Database,
  Pencil,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Clock,
  Sparkles,
} from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Switch } from '../../../components/ui/switch';
import { Badge } from '../../../components/ui/badge';
import { Input } from '../../../components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../../components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../../../components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../../components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/ui/select';
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
import {
  getLookupFieldsForObject,
  getHoverAssignment,
  saveHoverAssignment,
  deleteHoverAssignment,
  getObjectMetadata,
} from '../services/lookupHoverService';

const API = process.env.REACT_APP_BACKEND_URL || '';

// Sortable Field Item for the preview fields list
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
      className={`flex items-center gap-2 p-2 bg-white border rounded-lg shadow-sm ${
        isDragging ? 'shadow-lg ring-2 ring-indigo-500' : 'hover:border-indigo-300'
      }`}
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab text-slate-400 hover:text-slate-600"
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm text-slate-800 truncate">
          {field.label || field.key}
        </div>
      </div>
      
      <Badge variant="outline" className="text-xs capitalize shrink-0">
        {field.type || 'text'}
      </Badge>
      
      <button
        onClick={() => onRemove(field.key)}
        className="text-slate-400 hover:text-red-500 transition-colors p-0.5"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
};

// ============================================
// Tab A: Lookup Fields Schema View
// ============================================
const LookupFieldsSchemaTab = ({ objectName, objectLabel, lookupFields, onRefresh }) => {
  const [searchQuery, setSearchQuery] = useState('');
  
  const filteredFields = lookupFields.filter(field => 
    field.field_label?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    field.field_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    field.related_object?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input
          placeholder="Search lookup fields..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Info Box */}
      <div className="bg-slate-50 border rounded-lg p-3 flex items-start gap-2 text-sm">
        <Info className="h-4 w-4 text-slate-500 mt-0.5 shrink-0" />
        <div className="text-slate-600">
          <p>
            This view shows all <strong>lookup relationship fields</strong> defined on {objectLabel || objectName}.
            Lookup fields create relationships between objects, linking records together.
          </p>
        </div>
      </div>

      {/* Fields Table */}
      {filteredFields.length === 0 ? (
        <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-lg p-8 text-center">
          <Link2 className="h-10 w-10 text-slate-300 mx-auto mb-3" />
          <h4 className="font-medium text-slate-600">
            {searchQuery ? 'No Matching Fields' : 'No Lookup Fields'}
          </h4>
          <p className="text-sm text-slate-500 mt-1">
            {searchQuery 
              ? 'Try a different search term'
              : 'Create lookup fields in Fields & Relationships to link objects together.'
            }
          </p>
        </div>
      ) : (
        <div className="bg-white border rounded-lg overflow-hidden">
          {/* Table Header */}
          <div className="grid grid-cols-12 gap-4 px-4 py-2 bg-slate-50 border-b text-xs font-medium text-slate-500 uppercase tracking-wider">
            <div className="col-span-3">Field Label</div>
            <div className="col-span-2">API Name</div>
            <div className="col-span-2">Related Object</div>
            <div className="col-span-1 text-center">Required</div>
            <div className="col-span-1 text-center">Searchable</div>
            <div className="col-span-1 text-center">Hover</div>
            <div className="col-span-2 text-right">Status</div>
          </div>
          
          {/* Table Body */}
          <div className="divide-y">
            {filteredFields.map((field) => (
              <div
                key={field.field_name}
                className="grid grid-cols-12 gap-4 px-4 py-3 items-center hover:bg-slate-50 transition-colors"
              >
                <div className="col-span-3">
                  <div className="font-medium text-slate-800">{field.field_label}</div>
                </div>
                <div className="col-span-2">
                  <code className="text-xs text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                    {field.field_name}
                  </code>
                </div>
                <div className="col-span-2">
                  <div className="flex items-center gap-1 text-sm text-slate-600">
                    <ChevronRight className="h-3 w-3" />
                    {field.related_object_label || field.related_object}
                  </div>
                </div>
                <div className="col-span-1 text-center">
                  {field.is_required ? (
                    <Badge className="bg-amber-100 text-amber-700 text-xs">Yes</Badge>
                  ) : (
                    <span className="text-xs text-slate-400">No</span>
                  )}
                </div>
                <div className="col-span-1 text-center">
                  {field.is_searchable !== false ? (
                    <Check className="h-4 w-4 text-green-500 mx-auto" />
                  ) : (
                    <X className="h-4 w-4 text-slate-300 mx-auto" />
                  )}
                </div>
                <div className="col-span-1 text-center">
                  {field.hover_enabled ? (
                    <Eye className="h-4 w-4 text-green-500 mx-auto" />
                  ) : (
                    <EyeOff className="h-4 w-4 text-slate-300 mx-auto" />
                  )}
                </div>
                <div className="col-span-2 text-right">
                  {field.hover_enabled ? (
                    <Badge className="bg-green-100 text-green-700 text-xs">
                      Configured
                    </Badge>
                  ) : field.has_hover_config ? (
                    <Badge variant="outline" className="text-xs text-slate-500">
                      Disabled
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs text-slate-400">
                      Not Configured
                    </Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Summary */}
      <div className="flex items-center justify-between text-sm text-slate-500 pt-2">
        <span>{filteredFields.length} lookup field{filteredFields.length !== 1 ? 's' : ''}</span>
        <Button variant="ghost" size="sm" onClick={onRefresh} className="h-7">
          <RefreshCw className="h-3.5 w-3.5 mr-1" />
          Refresh
        </Button>
      </div>
    </div>
  );
};

// ============================================
// Tab B: Lookup Display & Search Settings
// ============================================
const LookupDisplaySearchTab = ({ 
  objectName, 
  objectLabel, 
  lookupFields, 
  onRefresh 
}) => {
  const [selectedField, setSelectedField] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const handleConfigureField = (field) => {
    setSelectedField(field);
    setDialogOpen(true);
  };

  const handleDialogClose = () => {
    setDialogOpen(false);
    setSelectedField(null);
  };

  const handleSaveComplete = () => {
    onRefresh();
  };

  return (
    <div className="space-y-4">
      {/* Info Box */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-start gap-2 text-sm">
        <Sparkles className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
        <div className="text-blue-800">
          <p className="font-medium">Configure how lookup fields behave in the UI</p>
          <p className="mt-1 text-blue-700">
            For each lookup field, you can configure: display field, searchable fields, 
            hover preview fields, and toggle features like recent records and quick create.
          </p>
        </div>
      </div>

      {/* Fields List */}
      {lookupFields.length === 0 ? (
        <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-lg p-8 text-center">
          <Settings className="h-10 w-10 text-slate-300 mx-auto mb-3" />
          <h4 className="font-medium text-slate-600">No Lookup Fields to Configure</h4>
          <p className="text-sm text-slate-500 mt-1">
            Create lookup fields in Fields & Relationships first.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {lookupFields.map((field) => (
            <div
              key={field.field_name}
              className="bg-white border rounded-lg p-4 hover:border-indigo-200 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-lg ${
                    field.hover_enabled 
                      ? 'bg-green-100 text-green-600' 
                      : 'bg-slate-100 text-slate-400'
                  }`}>
                    {field.hover_enabled ? (
                      <Eye className="h-5 w-5" />
                    ) : (
                      <EyeOff className="h-5 w-5" />
                    )}
                  </div>
                  <div>
                    <div className="font-medium text-slate-900">{field.field_label}</div>
                    <div className="text-sm text-slate-500 flex items-center gap-2 mt-0.5">
                      <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded">
                        {field.field_name}
                      </code>
                      <ChevronRight className="h-3 w-3" />
                      <span>{field.related_object_label}</span>
                    </div>
                    
                    {/* Quick Status Indicators */}
                    <div className="flex items-center gap-2 mt-2">
                      {field.hover_enabled && (
                        <Badge className="bg-green-50 text-green-700 border-green-200 text-xs">
                          <Eye className="h-3 w-3 mr-1" />
                          Hover Preview
                        </Badge>
                      )}
                      <Badge variant="outline" className="text-xs">
                        <Search className="h-3 w-3 mr-1" />
                        Searchable
                      </Badge>
                    </div>
                  </div>
                </div>
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleConfigureField(field)}
                  className="flex items-center gap-1"
                >
                  <Settings className="h-4 w-4" />
                  Configure
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Configuration Dialog */}
      <LookupDisplayConfigDialog
        isOpen={dialogOpen}
        onClose={handleDialogClose}
        lookupField={selectedField}
        objectName={objectName}
        onSave={handleSaveComplete}
      />
    </div>
  );
};

// ============================================
// Configuration Dialog Component
// ============================================
const LookupDisplayConfigDialog = ({ 
  isOpen, 
  onClose, 
  lookupField, 
  objectName,
  onSave 
}) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // Configuration state
  const [config, setConfig] = useState({
    enabled: false,
    primaryDisplayField: 'name',
    searchableFields: [],
    previewFields: [],
    showRecentRecords: true,
    enableQuickCreate: false,
  });
  
  const [availableFields, setAvailableFields] = useState([]);
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

  // Load existing config and related object fields
  useEffect(() => {
    const fetchData = async () => {
      if (!isOpen || !lookupField) return;
      
      setLoading(true);
      try {
        // Fetch existing assignment and related object metadata in parallel
        const [assignment, metadata] = await Promise.all([
          getHoverAssignment(objectName, lookupField.field_name),
          getObjectMetadata(lookupField.related_object),
        ]);

        // Build available fields from related object metadata
        const fields = (metadata?.fields || []).map(f => ({
          key: f.api_name || f.key || f.name,
          label: f.label || formatLabel(f.api_name || f.key || f.name),
          type: f.type || 'text',
        }));
        setAvailableFields(fields);

        // Set config from assignment
        const previewFieldKeys = assignment.preview_fields || [];
        const previewFieldsWithMeta = previewFieldKeys.map(key => {
          const metaField = fields.find(f => f.key === key);
          return metaField || { key, label: formatLabel(key), type: 'text' };
        });

        setConfig({
          enabled: assignment.configured ? assignment.enabled : false,
          primaryDisplayField: assignment.primary_display_field || 'name',
          searchableFields: assignment.searchable_fields || ['name'],
          previewFields: previewFieldsWithMeta,
          showRecentRecords: assignment.show_recent_records !== false,
          enableQuickCreate: assignment.enable_quick_create || false,
        });

        setHasChanges(false);
      } catch (error) {
        console.error('Error loading config:', error);
        toast.error('Failed to load configuration');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [isOpen, lookupField, objectName, formatLabel]);

  const handleSave = async () => {
    if (!lookupField) return;
    
    setSaving(true);
    try {
      await saveHoverAssignment(objectName, lookupField.field_name, {
        related_object: lookupField.related_object,
        enabled: config.enabled,
        preview_fields: config.previewFields.map(f => f.key),
        primary_display_field: config.primaryDisplayField,
        searchable_fields: config.searchableFields,
        show_recent_records: config.showRecentRecords,
        enable_quick_create: config.enableQuickCreate,
      });
      toast.success('Configuration saved');
      setHasChanges(false);
      onSave?.();
      onClose();
    } catch (error) {
      console.error('Error saving config:', error);
      toast.error('Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  const handleRemovePreviewField = (fieldKey) => {
    setConfig(prev => ({
      ...prev,
      previewFields: prev.previewFields.filter(f => f.key !== fieldKey)
    }));
    setHasChanges(true);
  };

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (active.id !== over?.id) {
      setConfig(prev => {
        const items = prev.previewFields;
        const oldIndex = items.findIndex(i => i.key === active.id);
        const newIndex = items.findIndex(i => i.key === over.id);
        return {
          ...prev,
          previewFields: arrayMove(items, oldIndex, newIndex)
        };
      });
      setHasChanges(true);
    }
  };

  const unselectedFields = availableFields.filter(
    f => !config.previewFields.some(sf => sf.key === f.key)
  );

  if (!lookupField) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-indigo-600" />
            Configure Lookup: {lookupField.field_label}
          </DialogTitle>
          <DialogDescription>
            Configure display, search, and hover behavior for the <strong>{lookupField.field_label}</strong> lookup 
            field pointing to <strong>{lookupField.related_object_label}</strong>.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="h-6 w-6 animate-spin text-indigo-600" />
            <span className="ml-2 text-slate-600">Loading configuration...</span>
          </div>
        ) : (
          <div className="space-y-6 py-4">
            
            {/* Primary Display Field */}
            <div className="bg-slate-50 border rounded-lg p-4">
              <h4 className="font-medium text-slate-800 mb-2">Primary Display Field</h4>
              <p className="text-sm text-slate-500 mb-3">
                The field shown as the link text when displaying this lookup value.
              </p>
              <Select
                value={config.primaryDisplayField}
                onValueChange={(value) => {
                  setConfig(prev => ({ ...prev, primaryDisplayField: value }));
                  setHasChanges(true);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select display field" />
                </SelectTrigger>
                <SelectContent>
                  {availableFields.map(field => (
                    <SelectItem key={field.key} value={field.key}>
                      {field.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Searchable Fields */}
            <div className="bg-slate-50 border rounded-lg p-4">
              <h4 className="font-medium text-slate-800 mb-2 flex items-center gap-2">
                <Search className="h-4 w-4" />
                Searchable Fields
              </h4>
              <p className="text-sm text-slate-500 mb-3">
                Fields that users can search by in the lookup dropdown.
              </p>
              <div className="flex flex-wrap gap-2">
                {availableFields.slice(0, 10).map(field => {
                  const isSelected = config.searchableFields.includes(field.key);
                  return (
                    <button
                      key={field.key}
                      onClick={() => {
                        setConfig(prev => ({
                          ...prev,
                          searchableFields: isSelected
                            ? prev.searchableFields.filter(f => f !== field.key)
                            : [...prev.searchableFields, field.key]
                        }));
                        setHasChanges(true);
                      }}
                      className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                        isSelected
                          ? 'bg-indigo-100 border-indigo-300 text-indigo-700'
                          : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                      }`}
                    >
                      {isSelected && <Check className="h-3 w-3 inline mr-1" />}
                      {field.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Hover Preview Toggle */}
            <div className="bg-slate-50 border rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium text-slate-800 flex items-center gap-2">
                    <Eye className="h-4 w-4" />
                    Enable Hover Preview
                  </h4>
                  <p className="text-sm text-slate-500 mt-0.5">
                    {config.enabled 
                      ? 'A preview card appears when hovering over this lookup field'
                      : 'No hover preview for this lookup field'
                    }
                  </p>
                </div>
                <Switch
                  checked={config.enabled}
                  onCheckedChange={(val) => {
                    setConfig(prev => ({ ...prev, enabled: val }));
                    setHasChanges(true);
                  }}
                />
              </div>
            </div>

            {/* Preview Fields (only shown when hover enabled) */}
            {config.enabled && (
              <div className="bg-white border rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium text-slate-800">
                    Hover Preview Fields
                  </h4>
                  <Badge variant="outline" className="text-xs">
                    {config.previewFields.length} field{config.previewFields.length !== 1 ? 's' : ''}
                  </Badge>
                </div>

                {/* Add Field Dropdown */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="w-full justify-between">
                      <span className="text-slate-500">Add field to preview...</span>
                      <Plus className="h-4 w-4 ml-2" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-72 max-h-64 overflow-y-auto">
                    {unselectedFields.length === 0 ? (
                      <div className="p-3 text-sm text-slate-500 text-center">
                        All fields added
                      </div>
                    ) : (
                      unselectedFields.map(field => (
                        <DropdownMenuItem
                          key={field.key}
                          onClick={() => {
                            setConfig(prev => ({
                              ...prev,
                              previewFields: [...prev.previewFields, field]
                            }));
                            setHasChanges(true);
                          }}
                          className="cursor-pointer"
                        >
                          <Plus className="h-3.5 w-3.5 mr-2 text-green-600" />
                          <span className="font-medium">{field.label}</span>
                          <span className="text-xs text-slate-400 ml-auto">{field.type}</span>
                        </DropdownMenuItem>
                      ))
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* Selected Fields List */}
                {config.previewFields.length === 0 ? (
                  <div className="border-2 border-dashed border-slate-200 rounded-lg p-4 text-center">
                    <EyeOff className="h-6 w-6 text-slate-300 mx-auto mb-1" />
                    <p className="text-slate-500 text-sm">No fields selected</p>
                  </div>
                ) : (
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                  >
                    <SortableContext
                      items={config.previewFields.map(f => f.key)}
                      strategy={verticalListSortingStrategy}
                    >
                      <div className="space-y-1.5">
                        {config.previewFields.map(field => (
                          <SortableFieldItem
                            key={field.key}
                            field={field}
                            onRemove={handleRemovePreviewField}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                )}
              </div>
            )}

            {/* Additional Options */}
            <div className="border rounded-lg divide-y">
              {/* Show Recent Records */}
              <div className="p-4 flex items-center justify-between">
                <div>
                  <h4 className="font-medium text-slate-800 flex items-center gap-2 text-sm">
                    <Clock className="h-4 w-4 text-slate-400" />
                    Show Recent Records
                  </h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Display recently viewed records at the top of search
                  </p>
                </div>
                <Switch
                  checked={config.showRecentRecords}
                  onCheckedChange={(val) => {
                    setConfig(prev => ({ ...prev, showRecentRecords: val }));
                    setHasChanges(true);
                  }}
                />
              </div>
              
              {/* Quick Create */}
              {/* <div className="p-4 flex items-center justify-between">
                <div>
                  <h4 className="font-medium text-slate-800 flex items-center gap-2 text-sm">
                    <Plus className="h-4 w-4 text-slate-400" />
                    Enable Quick Create
                    <Badge variant="outline" className="text-xs ml-1">Coming Soon</Badge>
                  </h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Allow creating new records directly from lookup dropdown
                  </p>
                </div>
                <Switch
                  checked={config.enableQuickCreate}
                  onCheckedChange={(val) => {
                    setConfig(prev => ({ ...prev, enableQuickCreate: val }));
                    setHasChanges(true);
                  }}
                  disabled
                />
              </div> */}
            </div>

            {/* Warning for unsaved changes */}
            {hasChanges && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-amber-600" />
                <span className="text-sm text-amber-800">You have unsaved changes</span>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="flex items-center justify-between sm:justify-between">
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || loading}
            className="bg-indigo-600 hover:bg-indigo-700"
          >
            {saving ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Save Configuration
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ============================================
// Main Panel Component
// ============================================
const LookupConfigurationPanel = ({ objectName, objectLabel }) => {
  const [loading, setLoading] = useState(true);
  const [lookupFields, setLookupFields] = useState([]);
  const [activeTab, setActiveTab] = useState('fields');

  const fetchLookupFields = useCallback(async () => {
    if (!objectName) return;
    
    setLoading(true);
    try {
      const fields = await getLookupFieldsForObject(objectName);
      setLookupFields(fields);
    } catch (error) {
      console.error('Error fetching lookup fields:', error);
      toast.error('Failed to load lookup fields');
    } finally {
      setLoading(false);
    }
  }, [objectName]);

  useEffect(() => {
    fetchLookupFields();
  }, [fetchLookupFields]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="h-6 w-6 animate-spin text-indigo-600" />
        <span className="ml-2 text-slate-600">Loading lookup configuration...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
          <Link2 className="h-5 w-5 text-indigo-600" />
          Lookup Configuration
        </h3>
        <p className="text-sm text-slate-500 mt-1">
          Manage lookup relationship fields and configure their display, search, and hover behavior 
          for <strong>{objectLabel || objectName}</strong>.
        </p>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="fields" className="flex items-center gap-2">
            <Database className="h-4 w-4" />
            Lookup Fields
          </TabsTrigger>
          <TabsTrigger value="display" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Display & Search
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="fields" className="mt-4">
          <LookupFieldsSchemaTab 
            objectName={objectName}
            objectLabel={objectLabel}
            lookupFields={lookupFields}
            onRefresh={fetchLookupFields}
          />
        </TabsContent>
        
        <TabsContent value="display" className="mt-4">
          <LookupDisplaySearchTab 
            objectName={objectName}
            objectLabel={objectLabel}
            lookupFields={lookupFields}
            onRefresh={fetchLookupFields}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export { LookupConfigurationPanel };
export default LookupConfigurationPanel;
