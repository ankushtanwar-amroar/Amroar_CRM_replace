/**
 * ActivityFieldsConfig - Field configuration for activity types (Event, Task, etc.)
 * Allows admins to select which fields appear in timeline preview
 * NOTE: "Fields in Create Form" has been removed as per requirement
 */
import React, { useState, useEffect, useMemo } from 'react';
import { 
  Search, GripVertical, X, Loader2, Eye, ChevronDown, ChevronUp
} from 'lucide-react';
import { Input } from '../../../components/ui/input';
import { Checkbox } from '../../../components/ui/checkbox';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
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
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

/**
 * Sortable Field Item for drag-reorder
 */
const SortableFieldItem = ({ field, isSelected, onToggle }) => {
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
      className={`flex items-center gap-2 p-2 rounded-lg border transition-all ${
        isSelected 
          ? 'bg-blue-50 border-blue-200 shadow-sm' 
          : 'bg-white border-slate-200 hover:border-slate-300'
      } ${isDragging ? 'shadow-md' : ''}`}
      data-testid={`field-item-${field.key}`}
    >
      <div {...attributes} {...listeners} className="cursor-grab hover:bg-slate-100 rounded p-0.5 transition-colors">
        <GripVertical className="h-3 w-3 text-slate-400" />
      </div>
      <Checkbox 
        checked={isSelected}
        onCheckedChange={() => onToggle(field.key)}
        className="h-4 w-4"
      />
      <div className="flex-1 min-w-0">
        <span className="text-xs font-medium text-slate-700">{field.label}</span>
        <span className="text-[10px] text-slate-400 ml-1.5">({field.key})</span>
      </div>
    </div>
  );
};

/**
 * Main ActivityFieldsConfig Component
 * Only shows Timeline Preview fields (Create Form section removed)
 */
const ActivityFieldsConfig = ({
  activityType, // 'event', 'task', etc.
  config, // { createFields: [], timelineFields: [] }
  onChange,
  className = '',
}) => {
  const [fields, setFields] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isCollapsed, setIsCollapsed] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Fetch object fields from backend
  useEffect(() => {
    const fetchFields = async () => {
      if (!activityType) return;
      
      setLoading(true);
      setError(null);
      
      try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_URL}/api/objects`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        
        if (!response.ok) {
          throw new Error('Failed to fetch objects');
        }
        
        const objects = await response.json();
        const activityObject = objects.find(
          obj => obj.object_name.toLowerCase() === activityType.toLowerCase()
        );
        
        if (activityObject && activityObject.fields) {
          const fieldsList = Object.entries(activityObject.fields).map(([key, cfg]) => ({
            key,
            label: cfg.label || key,
            type: cfg.type || 'text',
            required: cfg.required || false,
          }));
          setFields(fieldsList);
        } else {
          // Use fallback fields if object not found
          setFields(getDefaultFields(activityType));
        }
      } catch (err) {
        console.error('Error fetching fields:', err);
        setError(err.message);
        // Use fallback fields on error
        setFields(getDefaultFields(activityType));
      } finally {
        setLoading(false);
      }
    };

    fetchFields();
  }, [activityType]);

  // Get default fields for fallback
  const getDefaultFields = (type) => {
    const commonFields = [
      { key: 'subject', label: 'Subject', type: 'text' },
      { key: 'description', label: 'Description', type: 'textarea' },
      { key: 'status', label: 'Status', type: 'picklist' },
    ];
    
    if (type === 'event') {
      return [
        ...commonFields,
        { key: 'start_date', label: 'Start Date/Time', type: 'datetime' },
        { key: 'end_date', label: 'End Date/Time', type: 'datetime' },
        { key: 'location', label: 'Location', type: 'text' },
        { key: 'assigned_to', label: 'Assigned To', type: 'lookup' },
      ];
    } else if (type === 'task') {
      return [
        ...commonFields,
        { key: 'due_date', label: 'Due Date', type: 'date' },
        { key: 'priority', label: 'Priority', type: 'picklist' },
        { key: 'assigned_to', label: 'Assigned To', type: 'lookup' },
      ];
    } else if (type === 'call') {
      return [
        ...commonFields,
        { key: 'call_date', label: 'Call Date/Time', type: 'datetime' },
        { key: 'duration', label: 'Duration', type: 'number' },
        { key: 'call_result', label: 'Call Result', type: 'picklist' },
      ];
    }
    
    return commonFields;
  };

  // Filter fields by search
  const filteredFields = useMemo(() => {
    if (!searchTerm.trim()) return fields;
    const term = searchTerm.toLowerCase();
    return fields.filter(field => 
      field.label.toLowerCase().includes(term) ||
      field.key.toLowerCase().includes(term)
    );
  }, [fields, searchTerm]);

  // Get selected timeline fields
  const selectedFields = config?.timelineFields || [];

  // Toggle field selection
  const toggleField = (fieldKey) => {
    let newSelected;
    if (selectedFields.includes(fieldKey)) {
      newSelected = selectedFields.filter(k => k !== fieldKey);
    } else {
      newSelected = [...selectedFields, fieldKey];
    }
    onChange({
      ...config,
      timelineFields: newSelected,
    });
  };

  // Handle drag end for reordering
  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = selectedFields.indexOf(active.id);
    const newIndex = selectedFields.indexOf(over.id);

    if (oldIndex !== -1 && newIndex !== -1) {
      onChange({
        ...config,
        timelineFields: arrayMove(selectedFields, oldIndex, newIndex),
      });
    }
  };

  // Select/Deselect all
  const selectAll = () => {
    onChange({
      ...config,
      timelineFields: fields.map(f => f.key),
    });
  };

  const deselectAll = () => {
    onChange({
      ...config,
      timelineFields: [],
    });
  };

  if (loading) {
    return (
      <div className={`flex items-center justify-center py-6 ${className}`}>
        <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
        <span className="ml-2 text-xs text-slate-500">Loading fields...</span>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-lg border border-slate-200 overflow-hidden ${className}`}>
      {/* Header */}
      <div 
        className="flex items-center gap-2 p-2.5 bg-slate-50 cursor-pointer hover:bg-slate-100 transition-colors"
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <div className="w-6 h-6 bg-white rounded flex items-center justify-center shadow-sm">
          <Eye className="h-3.5 w-3.5 text-slate-600" />
        </div>
        <div className="flex-1">
          <span className="text-xs font-semibold text-slate-700">Fields in Timeline Preview</span>
          <p className="text-[10px] text-slate-500">Select fields shown in activity cards</p>
        </div>
        <Badge variant="secondary" className="text-[10px] bg-white">
          {selectedFields.length} / {fields.length}
        </Badge>
        <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
          {isCollapsed ? (
            <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
          ) : (
            <ChevronUp className="h-3.5 w-3.5 text-slate-400" />
          )}
        </Button>
      </div>

      {/* Collapsible Content */}
      {!isCollapsed && (
        <div className="p-2.5 space-y-2">
          {/* Search */}
          {fields.length > 5 && (
            <div className="relative">
              <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-3 w-3 text-slate-400" />
              <Input
                type="text"
                placeholder="Search fields..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-7 pr-7 h-7 text-xs"
                data-testid="search-timeline-fields"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          )}

          {/* Quick Actions */}
          <div className="flex items-center gap-2 px-1">
            <button
              onClick={selectAll}
              className="text-[10px] text-blue-600 hover:text-blue-700 font-medium"
            >
              Select All
            </button>
            <span className="text-slate-300">|</span>
            <button
              onClick={deselectAll}
              className="text-[10px] text-slate-500 hover:text-slate-600"
            >
              Deselect All
            </button>
            <span className="flex-1" />
            <span className="text-[10px] text-slate-400">
              <GripVertical className="h-2.5 w-2.5 inline mr-0.5" />
              Drag to reorder
            </span>
          </div>

          {/* Field List with Drag-Drop */}
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={selectedFields} strategy={verticalListSortingStrategy}>
              <div className="space-y-1 max-h-40 overflow-y-auto border rounded-lg p-1.5 bg-slate-50/50">
                {filteredFields.length === 0 ? (
                  <p className="text-center text-xs text-slate-400 py-4">
                    {searchTerm ? `No fields match "${searchTerm}"` : 'No fields available'}
                  </p>
                ) : (
                  filteredFields.map((field) => (
                    <SortableFieldItem
                      key={field.key}
                      field={field}
                      isSelected={selectedFields.includes(field.key)}
                      onToggle={toggleField}
                    />
                  ))
                )}
              </div>
            </SortableContext>
          </DndContext>
          
          {/* Preview hint */}
          {selectedFields.length > 0 && (
            <div className="text-[10px] text-green-600 bg-green-50 px-2 py-1.5 rounded border border-green-100">
              ✓ Selected fields will appear in activity cards in the canvas preview
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ActivityFieldsConfig;
