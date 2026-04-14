/**
 * RelatedListColumnConfig - Column configuration for a specific related object
 * Shows in property panel when a related object is selected
 */
import React, { useState, useEffect } from 'react';
import { 
  Search, GripVertical, Plus, X, Loader2, Check, 
  ArrowUp, ArrowDown, Columns
} from 'lucide-react';
import { Input } from '../../../components/ui/input';
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
import { fetchObjectFields, getDefaultColumns } from '../services/relatedListsService';

/**
 * Sortable Column Item for drag-reorder
 */
const SortableColumnItem = ({ column, onRemove }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: column.apiName });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 p-2 bg-blue-50 border border-blue-200 rounded group ${
        isDragging ? 'shadow-lg z-50' : ''
      }`}
    >
      <div {...attributes} {...listeners} className="cursor-grab hover:bg-blue-100 rounded p-0.5">
        <GripVertical className="h-3 w-3 text-blue-400" />
      </div>
      <div className="flex-1 min-w-0">
        <span className="text-xs font-medium text-blue-700">{column.label}</span>
        <span className="text-[9px] text-blue-500 ml-1">({column.apiName})</span>
      </div>
      <button
        onClick={() => onRemove(column.apiName)}
        className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-red-100 rounded text-red-400 transition-opacity"
        title="Remove column"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
};

/**
 * Available Field Item - Click to add
 */
const AvailableFieldItem = ({ field, onAdd, isAdded }) => {
  return (
    <button
      onClick={() => onAdd(field)}
      disabled={isAdded}
      className={`w-full flex items-center gap-2 p-2 rounded text-left transition-all ${
        isAdded 
          ? 'bg-slate-100 text-slate-400 cursor-not-allowed' 
          : 'bg-white hover:bg-blue-50 border border-slate-200 hover:border-blue-300'
      }`}
    >
      {isAdded ? (
        <Check className="h-3 w-3 text-green-500 flex-shrink-0" />
      ) : (
        <Plus className="h-3 w-3 text-blue-500 flex-shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <span className="text-xs font-medium text-slate-700">{field.label}</span>
        <span className="text-[9px] text-slate-400 ml-1">({field.apiName})</span>
      </div>
      <span className="text-[9px] text-slate-400 capitalize">{field.type}</span>
    </button>
  );
};

/**
 * Main RelatedListColumnConfig Component
 */
const RelatedListColumnConfig = ({
  objectName,
  objectLabel,
  currentColumns = [],
  onChange,
  className = '',
}) => {
  const [fields, setFields] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Fetch object fields
  useEffect(() => {
    const loadFields = async () => {
      if (!objectName) return;
      
      setLoading(true);
      try {
        const objectFields = await fetchObjectFields(objectName);
        setFields(objectFields);
        
        // If no columns configured, set defaults
        if (currentColumns.length === 0) {
          const defaultCols = getDefaultColumns(objectName);
          const defaultColObjects = defaultCols
            .map(colName => objectFields.find(f => f.apiName === colName))
            .filter(Boolean);
          
          if (defaultColObjects.length > 0) {
            onChange(defaultColObjects);
          }
        }
      } catch (err) {
        console.error('Error loading fields:', err);
      } finally {
        setLoading(false);
      }
    };

    loadFields();
  }, [objectName]);

  // Filter fields by search
  const filteredFields = fields.filter(field =>
    field.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
    field.apiName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Get current column API names for comparison
  const currentColumnNames = currentColumns.map(c => c.apiName);

  // Add a column
  const handleAddColumn = (field) => {
    if (!currentColumnNames.includes(field.apiName)) {
      onChange([...currentColumns, field]);
    }
  };

  // Remove a column
  const handleRemoveColumn = (apiName) => {
    onChange(currentColumns.filter(c => c.apiName !== apiName));
  };

  // Handle drag end for reordering
  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = currentColumns.findIndex(c => c.apiName === active.id);
    const newIndex = currentColumns.findIndex(c => c.apiName === over.id);

    if (oldIndex !== -1 && newIndex !== -1) {
      onChange(arrayMove(currentColumns, oldIndex, newIndex));
    }
  };

  if (loading) {
    return (
      <div className={`flex items-center justify-center py-8 ${className}`}>
        <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
        <span className="ml-2 text-xs text-slate-500">Loading fields...</span>
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Header */}
      <div className="flex items-center gap-2 pb-2 border-b">
        <Columns className="h-4 w-4 text-blue-600" />
        <span className="text-xs font-semibold text-slate-700">
          Configure Columns for {objectLabel || objectName}
        </span>
      </div>

      {/* Selected Columns */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-[10px] font-semibold text-slate-600 uppercase">
            Selected Columns ({currentColumns.length})
          </label>
          {currentColumns.length > 0 && (
            <button
              onClick={() => onChange([])}
              className="text-[9px] text-red-500 hover:text-red-600"
            >
              Clear All
            </button>
          )}
        </div>

        {currentColumns.length === 0 ? (
          <div className="p-4 bg-slate-50 rounded-lg border-2 border-dashed border-slate-200 text-center">
            <p className="text-xs text-slate-500">No columns selected</p>
            <p className="text-[10px] text-slate-400 mt-1">Click fields below to add columns</p>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext 
              items={currentColumnNames} 
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-1">
                {currentColumns.map((column) => (
                  <SortableColumnItem
                    key={column.apiName}
                    column={column}
                    onRemove={handleRemoveColumn}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
        
        {currentColumns.length > 0 && (
          <p className="text-[9px] text-slate-400 mt-1 flex items-center gap-1">
            <GripVertical className="h-2.5 w-2.5" />
            Drag to reorder columns
          </p>
        )}
      </div>

      {/* Available Fields */}
      <div>
        <label className="text-[10px] font-semibold text-slate-600 uppercase mb-2 block">
          Available Fields
        </label>
        
        {/* Search */}
        <div className="relative mb-2">
          <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-3 w-3 text-slate-400" />
          <Input
            type="text"
            placeholder="Search fields..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-7 h-8 text-xs"
          />
        </div>

        {/* Fields List */}
        <div className="space-y-1 max-h-48 overflow-y-auto">
          {filteredFields.map((field) => (
            <AvailableFieldItem
              key={field.apiName}
              field={field}
              onAdd={handleAddColumn}
              isAdded={currentColumnNames.includes(field.apiName)}
            />
          ))}
          {filteredFields.length === 0 && (
            <p className="text-center text-xs text-slate-400 py-4">
              No matching fields
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default RelatedListColumnConfig;
