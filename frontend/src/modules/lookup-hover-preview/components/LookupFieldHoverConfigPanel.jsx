/**
 * LookupFieldHoverConfigPanel - Admin UI for configuring hover preview per lookup field
 * Shows all lookup fields in an object and allows enabling/configuring hover for each
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
} from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Switch } from '../../../components/ui/switch';
import { Badge } from '../../../components/ui/badge';
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

// Configuration Dialog for a single lookup field
const LookupFieldConfigDialog = ({ 
  isOpen, 
  onClose, 
  lookupField, 
  objectName,
  onSave 
}) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [selectedFields, setSelectedFields] = useState([]);
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

        // Set enabled state
        setEnabled(assignment.configured ? assignment.enabled : false);

        // Build available fields from related object metadata
        const fields = (metadata?.fields || []).map(f => ({
          key: f.api_name || f.key || f.name,
          label: f.label || formatLabel(f.api_name || f.key || f.name),
          type: f.type || 'text',
        }));
        setAvailableFields(fields);

        // Build selected fields
        const selectedKeys = assignment.preview_fields || [];
        const selected = selectedKeys.map(key => {
          const metaField = fields.find(f => f.key === key);
          return metaField || { key, label: formatLabel(key), type: 'text' };
        });
        setSelectedFields(selected);

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
        enabled,
        preview_fields: selectedFields.map(f => f.key),
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

  const handleDisable = async () => {
    if (!lookupField) return;
    
    setSaving(true);
    try {
      await deleteHoverAssignment(objectName, lookupField.field_name);
      toast.success('Hover preview disabled');
      onSave?.();
      onClose();
    } catch (error) {
      console.error('Error disabling hover:', error);
      toast.error('Failed to disable hover preview');
    } finally {
      setSaving(false);
    }
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

  const unselectedFields = availableFields.filter(
    f => !selectedFields.some(sf => sf.key === f.key)
  );

  if (!lookupField) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5 text-indigo-600" />
            Configure Hover Preview
          </DialogTitle>
          <DialogDescription>
            Configure hover preview for the <strong>{lookupField.field_label}</strong> lookup field.
            When users hover over this field's value, they will see a preview card showing 
            the related <strong>{lookupField.related_object_label}</strong> record.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="h-6 w-6 animate-spin text-indigo-600" />
            <span className="ml-2 text-slate-600">Loading configuration...</span>
          </div>
        ) : (
          <div className="space-y-6 py-4">
            {/* Enable/Disable Toggle */}
            <div className="bg-slate-50 border rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium text-slate-800">Enable Hover Preview</h4>
                  <p className="text-sm text-slate-500 mt-0.5">
                    {enabled 
                      ? 'A preview card will appear when hovering over this lookup field'
                      : 'No hover preview will appear for this lookup field'
                    }
                  </p>
                </div>
                <Switch
                  checked={enabled}
                  onCheckedChange={(val) => {
                    setEnabled(val);
                    setHasChanges(true);
                  }}
                />
              </div>
            </div>

            {/* Field Configuration (only shown when enabled) */}
            {enabled && (
              <div className="bg-white border rounded-lg p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium text-slate-800">
                    Preview Fields from {lookupField.related_object_label}
                  </h4>
                  <Badge variant="outline" className="text-xs">
                    {selectedFields.length} field{selectedFields.length !== 1 ? 's' : ''} selected
                  </Badge>
                </div>

                {/* Info note */}
                <div className="bg-blue-50 border border-blue-100 rounded p-3 flex items-start gap-2">
                  <Info className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
                  <p className="text-sm text-blue-800">
                    Select which fields from the related {lookupField.related_object_label} record 
                    should appear in the hover preview card. Drag to reorder.
                  </p>
                </div>

                {/* Add Field Dropdown */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="w-full justify-between">
                      <span className="text-slate-500">Add a field to preview...</span>
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
                          key={field.key}
                          onClick={() => {
                            setSelectedFields(prev => [...prev, field]);
                            setHasChanges(true);
                          }}
                          className="cursor-pointer"
                        >
                          <div className="flex items-center gap-2 w-full">
                            <Plus className="h-4 w-4 text-green-600" />
                            <span className="font-medium">{field.label}</span>
                            <span className="text-xs text-slate-400 font-mono ml-auto">
                              {field.type}
                            </span>
                          </div>
                        </DropdownMenuItem>
                      ))
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* Selected Fields List */}
                {selectedFields.length === 0 ? (
                  <div className="border-2 border-dashed border-slate-200 rounded-lg p-6 text-center">
                    <EyeOff className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                    <p className="text-slate-500 text-sm">
                      No fields selected for preview.
                    </p>
                    <p className="text-slate-400 text-xs mt-1">
                      Add fields above to show in the hover card.
                    </p>
                  </div>
                ) : (
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
                )}
              </div>
            )}

            {/* Warning for unsaved changes */}
            {hasChanges && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-amber-600" />
                <span className="text-sm text-amber-800">
                  You have unsaved changes
                </span>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="flex items-center justify-between sm:justify-between">
          <Button
            variant="ghost"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </Button>
          <div className="flex items-center gap-2">
            {lookupField?.has_hover_config && (
              <Button
                variant="outline"
                onClick={handleDisable}
                disabled={saving}
                className="text-red-600 hover:text-red-700 hover:bg-red-50"
              >
                Remove Configuration
              </Button>
            )}
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
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// Main Panel Component - Shows all lookup fields for an object
const LookupFieldHoverConfigPanel = ({ objectName, objectLabel }) => {
  const [loading, setLoading] = useState(true);
  const [lookupFields, setLookupFields] = useState([]);
  const [selectedField, setSelectedField] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);

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

  const handleConfigureField = (field) => {
    setSelectedField(field);
    setDialogOpen(true);
  };

  const handleDialogClose = () => {
    setDialogOpen(false);
    setSelectedField(null);
  };

  const handleSaveComplete = () => {
    fetchLookupFields();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="h-6 w-6 animate-spin text-indigo-600" />
        <span className="ml-2 text-slate-600">Loading lookup fields...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
          <Eye className="h-5 w-5 text-indigo-600" />
          Lookup Hover Preview Configuration
        </h3>
        <p className="text-sm text-slate-500 mt-1">
          Configure which lookup fields on <strong>{objectLabel || objectName}</strong> records 
          show a hover preview card. Preview is only shown for fields you explicitly enable.
        </p>
      </div>

      {/* Info Box */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
        <Info className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" />
        <div className="text-sm text-blue-800">
          <p className="font-medium">How Lookup Hover Preview Works</p>
          <p className="mt-1">
            When enabled for a lookup field, users can hover over the linked record name 
            to see a quick preview card without leaving the page. This is especially useful 
            for related records like Accounts or Contacts.
          </p>
          <p className="mt-2 text-blue-700 font-medium">
            ⚠️ Hover preview only appears for fields you explicitly configure. 
            No configuration = no hover.
          </p>
        </div>
      </div>

      {/* Lookup Fields List */}
      {lookupFields.length === 0 ? (
        <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-lg p-8 text-center">
          <ExternalLink className="h-10 w-10 text-slate-300 mx-auto mb-3" />
          <h4 className="font-medium text-slate-600">No Lookup Fields Found</h4>
          <p className="text-sm text-slate-500 mt-1">
            This object doesn't have any lookup relationship fields.
          </p>
        </div>
      ) : (
        <div className="bg-white border rounded-lg divide-y">
          {lookupFields.map((field) => (
            <div
              key={field.field_name}
              className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors"
            >
              <div className="flex items-center gap-4">
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
                  <div className="font-medium text-slate-900">
                    {field.field_label}
                  </div>
                  <div className="text-sm text-slate-500 flex items-center gap-2">
                    <span className="font-mono text-xs">{field.field_name}</span>
                    <ChevronRight className="h-3 w-3" />
                    <span>{field.related_object_label}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {field.hover_enabled ? (
                  <Badge className="bg-green-100 text-green-700 border-green-200">
                    <Check className="h-3 w-3 mr-1" />
                    Enabled
                  </Badge>
                ) : field.has_hover_config ? (
                  <Badge variant="outline" className="text-slate-500">
                    Configured (Disabled)
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-slate-400">
                    Not Configured
                  </Badge>
                )}
                
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
      <LookupFieldConfigDialog
        isOpen={dialogOpen}
        onClose={handleDialogClose}
        lookupField={selectedField}
        objectName={objectName}
        onSave={handleSaveComplete}
      />
    </div>
  );
};

export default LookupFieldHoverConfigPanel;
