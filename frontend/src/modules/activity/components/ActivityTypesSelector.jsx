/**
 * ActivityTypesSelector - Admin configuration for activity types in property panel
 * Allows enabling/disabling types, buttons, customizing labels, and configuring fields
 * Supports drag-to-reorder for button display order
 * Enhanced with search/filter functionality
 */
import React, { useState, useMemo } from 'react';
import { 
  Plus, Trash2, GripVertical, Calendar, CheckCircle, Mail, Phone, FileText,
  Eye, EyeOff, MousePointer, Edit3, ChevronDown, ChevronUp, Settings, Search, X
} from 'lucide-react';
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
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Switch } from '../../../components/ui/switch';
import { Badge } from '../../../components/ui/badge';
import {
  AVAILABLE_ACTIVITY_TYPES,
  getActivityColors,
} from '../config/activityConfigDefaults';
import ActivityFieldsConfig from './ActivityFieldsConfig';

// Icon mapping
const IconMap = {
  calendar: Calendar,
  'check-circle': CheckCircle,
  mail: Mail,
  phone: Phone,
  'file-text': FileText,
};

/**
 * Sortable Activity Type Row
 */
const SortableActivityTypeRow = ({
  activityType,
  onUpdate,
  onRemove,
  expanded,
  onToggleExpand,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: activityType.type });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1000 : 1,
  };

  const colors = getActivityColors(activityType.type);
  const IconComponent = IconMap[activityType.icon] || FileText;
  
  const handleChange = (field, value) => {
    onUpdate({ ...activityType, [field]: value });
  };

  // Handle field config changes
  const handleFieldConfigChange = (newFieldConfig) => {
    onUpdate({
      ...activityType,
      fieldConfig: newFieldConfig,
    });
  };
  
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`border rounded-lg overflow-hidden transition-all ${
        isDragging 
          ? 'shadow-lg border-blue-300' 
          : expanded 
            ? 'border-blue-200 shadow-sm' 
            : 'border-slate-200 hover:border-slate-300'
      }`}
      data-testid={`activity-type-row-${activityType.type}`}
    >
      {/* Header Row - Always Visible */}
      <div 
        className={`flex items-center gap-2 p-3 cursor-pointer transition-colors ${
          expanded ? 'bg-blue-50/50' : 'bg-white hover:bg-slate-50'
        }`}
        onClick={onToggleExpand}
      >
        {/* Drag Handle */}
        <div
          {...attributes}
          {...listeners}
          className="cursor-grab hover:bg-slate-100 rounded p-1 transition-colors"
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="h-4 w-4 text-slate-400" />
        </div>
        
        {/* Icon */}
        <div className={`w-8 h-8 ${colors.iconBg} rounded-full flex items-center justify-center flex-shrink-0 shadow-sm`}>
          <IconComponent className="h-4 w-4 text-white" />
        </div>
        
        {/* Name and Badges */}
        <div className="flex-1 min-w-0">
          <span className="font-medium text-sm text-slate-800">
            {activityType.label}
          </span>
          <div className="flex items-center flex-wrap gap-1.5 mt-1">
            {activityType.enabledInTimeline ? (
              <Badge variant="outline" className="text-[9px] py-0 h-4 text-green-600 border-green-200 bg-green-50">
                <Eye className="h-2.5 w-2.5 mr-0.5" />
                Timeline
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[9px] py-0 h-4 text-slate-400 border-slate-200">
                <EyeOff className="h-2.5 w-2.5 mr-0.5" />
                Hidden
              </Badge>
            )}
            {activityType.newButtonEnabled && (
              <Badge variant="outline" className="text-[9px] py-0 h-4 text-blue-600 border-blue-200 bg-blue-50">
                <MousePointer className="h-2.5 w-2.5 mr-0.5" />
                Button
              </Badge>
            )}
            {activityType.fieldConfig?.timelineFields?.length > 0 && (
              <Badge variant="outline" className="text-[9px] py-0 h-4 text-purple-600 border-purple-200 bg-purple-50">
                <Settings className="h-2.5 w-2.5 mr-0.5" />
                {activityType.fieldConfig.timelineFields.length} fields
              </Badge>
            )}
          </div>
        </div>
        
        {/* Expand/Collapse */}
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={(e) => {
            e.stopPropagation();
            onToggleExpand();
          }}
          data-testid={`expand-${activityType.type}-btn`}
        >
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-slate-400" />
          ) : (
            <ChevronDown className="h-4 w-4 text-slate-400" />
          )}
        </Button>
        
        {/* Remove */}
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 text-slate-400 hover:text-red-500 hover:bg-red-50"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          data-testid={`remove-${activityType.type}-btn`}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      
      {/* Expanded Configuration */}
      {expanded && (
        <div className="p-4 bg-gradient-to-b from-slate-50 to-white border-t border-slate-200 space-y-4">
          {/* Timeline Toggle */}
          <div className="flex items-center justify-between p-2.5 bg-white rounded-lg border border-slate-100">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 bg-green-100 rounded-full flex items-center justify-center">
                <Eye className="h-3.5 w-3.5 text-green-600" />
              </div>
              <div>
                <span className="text-xs font-medium text-slate-700">Include in Timeline</span>
                <p className="text-[10px] text-slate-500">Show this type in the activity feed</p>
              </div>
            </div>
            <Switch
              checked={activityType.enabledInTimeline}
              onCheckedChange={(val) => handleChange('enabledInTimeline', val)}
              data-testid={`timeline-toggle-${activityType.type}`}
            />
          </div>
          
          {/* Button Toggle */}
          <div className="flex items-center justify-between p-2.5 bg-white rounded-lg border border-slate-100">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 bg-blue-100 rounded-full flex items-center justify-center">
                <MousePointer className="h-3.5 w-3.5 text-blue-600" />
              </div>
              <div>
                <span className="text-xs font-medium text-slate-700">Show &quot;New&quot; Button</span>
                <p className="text-[10px] text-slate-500">Display button to create new record</p>
              </div>
            </div>
            <Switch
              checked={activityType.newButtonEnabled}
              onCheckedChange={(val) => handleChange('newButtonEnabled', val)}
              data-testid={`button-toggle-${activityType.type}`}
            />
          </div>
          
          {/* Button Label */}
          {activityType.newButtonEnabled && (
            <div className="p-2.5 bg-white rounded-lg border border-slate-100 space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 bg-slate-100 rounded-full flex items-center justify-center">
                  <Edit3 className="h-3.5 w-3.5 text-slate-600" />
                </div>
                <span className="text-xs font-medium text-slate-700">Button Label</span>
              </div>
              <Input
                type="text"
                value={activityType.newButtonLabel || ''}
                onChange={(e) => handleChange('newButtonLabel', e.target.value)}
                placeholder={`New ${activityType.label}`}
                className="h-8 text-xs"
                data-testid={`button-label-${activityType.type}`}
              />
            </div>
          )}
          
          {/* Field Configuration Section */}
          <div className="pt-3 border-t border-slate-200">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-6 h-6 bg-purple-100 rounded-full flex items-center justify-center">
                <Settings className="h-3.5 w-3.5 text-purple-600" />
              </div>
              <span className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Field Configuration</span>
            </div>
            <ActivityFieldsConfig
              activityType={activityType.type}
              config={activityType.fieldConfig || {}}
              onChange={handleFieldConfigChange}
            />
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * Add Activity Type Dropdown with search
 */
const AddActivityTypeDropdown = ({ existingTypes, onAdd }) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const [searchTerm, setSearchTerm] = React.useState('');
  
  // Get available types not already added
  const availableTypes = AVAILABLE_ACTIVITY_TYPES.filter(
    type => !existingTypes.some(t => t.type === type.type)
  );

  // Filter by search term
  const filteredTypes = availableTypes.filter(type =>
    type.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
    type.type.toLowerCase().includes(searchTerm.toLowerCase())
  );
  
  if (availableTypes.length === 0) {
    return (
      <div className="p-3 bg-slate-50 rounded-lg text-center">
        <CheckCircle className="h-4 w-4 text-green-500 mx-auto mb-1" />
        <p className="text-[10px] text-slate-500">
          All activity types have been added
        </p>
      </div>
    );
  }
  
  const handleAdd = (type) => {
    onAdd({
      type: type.type,
      label: type.label,
      enabledInTimeline: true,
      newButtonEnabled: true,
      newButtonLabel: `New ${type.label}`,
      dateField: type.defaultDateField,
      titleField: type.defaultTitleField,
      statusField: type.defaultStatusField,
      icon: type.icon,
      color: type.color,
      fieldConfig: {
        createFields: [], // Will use defaults if empty
        timelineFields: [], // Will use defaults if empty
      },
    });
    setIsOpen(false);
    setSearchTerm('');
  };
  
  return (
    <div className="relative">
      <Button
        variant="outline"
        size="sm"
        className="w-full h-9 border-dashed border-2 hover:border-blue-300 hover:bg-blue-50/50 transition-colors"
        onClick={() => setIsOpen(!isOpen)}
        data-testid="add-activity-type-btn"
      >
        <Plus className="h-4 w-4 mr-2" />
        Add Activity Type
        <Badge variant="secondary" className="ml-2 text-[10px] bg-slate-100">
          {availableTypes.length} available
        </Badge>
      </Button>
      
      {isOpen && (
        <>
          <div 
            className="fixed inset-0 z-10" 
            onClick={() => {
              setIsOpen(false);
              setSearchTerm('');
            }}
          />
          <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-20 overflow-hidden">
            {/* Search Input */}
            {availableTypes.length > 3 && (
              <div className="p-2 border-b border-slate-100">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                  <Input
                    type="text"
                    placeholder="Search types..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-8 h-7 text-xs"
                    autoFocus
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
              </div>
            )}
            
            {/* Types List */}
            <div className="py-1 max-h-48 overflow-y-auto">
              {filteredTypes.length === 0 ? (
                <p className="text-center text-xs text-slate-400 py-4">
                  No types match &quot;{searchTerm}&quot;
                </p>
              ) : (
                filteredTypes.map((type) => {
                  const colors = getActivityColors(type.type);
                  const IconComponent = IconMap[type.icon] || FileText;
                  
                  return (
                    <button
                      key={type.type}
                      onClick={() => handleAdd(type)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 transition-colors"
                      data-testid={`add-${type.type}-btn`}
                    >
                      <div className={`w-7 h-7 ${colors.iconBg} rounded-full flex items-center justify-center shadow-sm`}>
                        <IconComponent className="h-3.5 w-3.5 text-white" />
                      </div>
                      <div className="flex-1 text-left">
                        <span className="text-sm font-medium text-slate-700">{type.label}</span>
                        <p className="text-[10px] text-slate-400">
                          Click to add {type.label.toLowerCase()} activities
                        </p>
                      </div>
                      <Plus className="h-4 w-4 text-slate-300" />
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

/**
 * Main ActivityTypesSelector Component
 */
const ActivityTypesSelector = ({
  activityTypes = [],
  onChange,
  maxVisibleButtons,
  onMaxVisibleButtonsChange,
  className = '',
}) => {
  const [expandedType, setExpandedType] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  
  // Filter activity types by search term
  const filteredActivityTypes = useMemo(() => {
    if (!searchTerm.trim()) return activityTypes;
    const term = searchTerm.toLowerCase();
    return activityTypes.filter(type => 
      type.label.toLowerCase().includes(term) ||
      type.type.toLowerCase().includes(term) ||
      (type.newButtonLabel || '').toLowerCase().includes(term)
    );
  }, [activityTypes, searchTerm]);

  const handleUpdate = (index, updatedType) => {
    // Find original index in unfiltered array
    const originalIndex = activityTypes.findIndex(t => t.type === updatedType.type);
    if (originalIndex === -1) return;
    
    const newTypes = [...activityTypes];
    newTypes[originalIndex] = updatedType;
    onChange(newTypes);
  };
  
  const handleRemove = (typeToRemove) => {
    const newTypes = activityTypes.filter(t => t.type !== typeToRemove);
    onChange(newTypes);
  };
  
  const handleAdd = (newType) => {
    onChange([...activityTypes, newType]);
  };
  
  const toggleExpand = (type) => {
    setExpandedType(prev => prev === type ? null : type);
  };

  // Handle drag end for reordering
  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = activityTypes.findIndex(t => t.type === active.id);
    const newIndex = activityTypes.findIndex(t => t.type === over.id);

    if (oldIndex !== -1 && newIndex !== -1) {
      onChange(arrayMove(activityTypes, oldIndex, newIndex));
    }
  };

  // Get activity type ids for sortable context
  const activityTypeIds = activityTypes.map(t => t.type);
  
  // Count enabled buttons and timeline types
  const enabledButtonCount = activityTypes.filter(t => t.newButtonEnabled).length;
  const enabledTimelineCount = activityTypes.filter(t => t.enabledInTimeline).length;
  
  return (
    <div className={`space-y-4 ${className}`}>
      {/* Max Visible Buttons Setting */}
      <div className="p-3 bg-gradient-to-r from-slate-50 to-blue-50/50 rounded-lg border border-slate-200">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-slate-700">Max Visible Buttons</span>
            <p className="text-[10px] text-slate-500">
              Additional buttons show in &quot;More&quot; dropdown
            </p>
          </div>
          <Input
            type="number"
            min={1}
            max={10}
            value={maxVisibleButtons || 3}
            onChange={(e) => onMaxVisibleButtonsChange?.(parseInt(e.target.value) || 3)}
            className="w-16 h-8 text-xs text-center"
            data-testid="max-visible-buttons-input"
          />
        </div>
        {/* Quick Stats */}
        <div className="flex items-center gap-3 mt-2 pt-2 border-t border-slate-200">
          <span className="text-[10px] text-slate-500">
            <span className="font-medium text-blue-600">{enabledButtonCount}</span> buttons active
          </span>
          <span className="text-[10px] text-slate-500">
            <span className="font-medium text-green-600">{enabledTimelineCount}</span> in timeline
          </span>
        </div>
      </div>

      {/* Search Activity Types */}
      {activityTypes.length > 2 && (
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <Input
            type="text"
            placeholder="Search activity types..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-8 pr-8 h-8 text-xs"
            data-testid="search-activity-types"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-2.5 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Drag-Drop Info */}
      <div className="flex items-center gap-2 px-2">
        <GripVertical className="h-3 w-3 text-slate-400" />
        <span className="text-[10px] text-slate-500">
          Drag to reorder button display order
        </span>
      </div>

      {/* Activity Types List with Drag-Drop */}
      {activityTypes.length === 0 ? (
        <div className="p-4 bg-slate-50 rounded-lg text-center">
          <p className="text-xs text-slate-500">No activity types configured</p>
          <p className="text-[10px] text-slate-400 mt-1">
            Add activity types to show in the timeline
          </p>
        </div>
      ) : filteredActivityTypes.length === 0 ? (
        <div className="p-4 bg-slate-50 rounded-lg text-center">
          <Search className="h-5 w-5 text-slate-300 mx-auto mb-2" />
          <p className="text-xs text-slate-500">No activity types match &quot;{searchTerm}&quot;</p>
          <button
            onClick={() => setSearchTerm('')}
            className="text-[10px] text-blue-600 hover:text-blue-700 mt-1"
          >
            Clear search
          </button>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={activityTypeIds} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {filteredActivityTypes.map((activityType) => (
                <SortableActivityTypeRow
                  key={activityType.type}
                  activityType={activityType}
                  onUpdate={(updated) => handleUpdate(activityTypes.findIndex(t => t.type === updated.type), updated)}
                  onRemove={() => handleRemove(activityType.type)}
                  expanded={expandedType === activityType.type}
                  onToggleExpand={() => toggleExpand(activityType.type)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
      
      {/* Add Button */}
      <AddActivityTypeDropdown
        existingTypes={activityTypes}
        onAdd={handleAdd}
      />
    </div>
  );
};

export default ActivityTypesSelector;
