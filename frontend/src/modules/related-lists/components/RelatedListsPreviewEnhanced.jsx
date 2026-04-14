/**
 * RelatedListsPreviewEnhanced - Enhanced preview component for Related Lists
 * Allows clicking on individual lists to select them for column configuration
 * Supports drag-and-drop from property panel to add new related lists
 */
import React, { useState } from 'react';
import { 
  GripVertical, X, ChevronDown, Plus, Columns, List
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
import toast from 'react-hot-toast';
import { getDefaultColumns } from '../services/relatedListsService';

/**
 * Sample data for preview based on object type
 */
const getSampleData = (objectId) => {
  const allSamples = {
    contacts: [
      { name: 'John Smith', email: 'john@example.com', phone: '555-0101', title: 'CEO' },
      { name: 'Sarah Johnson', email: 'sarah@example.com', phone: '555-0102', title: 'CFO' },
      { name: 'Mike Brown', email: 'mike@example.com', phone: '555-0103', title: 'CTO' },
    ],
    accounts: [
      { name: 'Acme Corp', industry: 'Technology', rating: 'Hot', type: 'Customer' },
      { name: 'Global Inc', industry: 'Finance', rating: 'Warm', type: 'Prospect' },
    ],
    opportunities: [
      { name: 'Enterprise Deal', stage: 'Negotiation', amount: '$50,000', close_date: 'Jan 15' },
      { name: 'Cloud Migration', stage: 'Proposal', amount: '$35,000', close_date: 'Feb 1' },
    ],
    events: [
      { subject: 'Discovery Call', start_date: 'Dec 20', end_date: 'Dec 20', location: 'Zoom' },
      { subject: 'Demo Meeting', start_date: 'Dec 22', end_date: 'Dec 22', location: 'Office' },
    ],
    tasks: [
      { subject: 'Follow up call', status: 'Open', due_date: 'Dec 18', priority: 'High' },
      { subject: 'Send proposal', status: 'In Progress', due_date: 'Dec 19', priority: 'Normal' },
    ],
    invoices: [
      { invoice_number: 'INV-001', amount: '$5,000', status: 'Paid', date: 'Dec 1' },
      { invoice_number: 'INV-002', amount: '$3,500', status: 'Pending', date: 'Dec 10' },
    ],
    notes: [
      { title: 'Meeting Notes', body: 'Discussed Q1 goals...', created_at: 'Dec 15' },
      { title: 'Follow Up', body: 'Need to send contract...', created_at: 'Dec 16' },
    ],
    leads: [
      { name: 'New Lead', company: 'TechStart', status: 'New', source: 'Website' },
      { name: 'Hot Lead', company: 'Enterprise Co', status: 'Working', source: 'Referral' },
    ],
  };
  
  return allSamples[objectId] || [
    { name: 'Sample Record 1' },
    { name: 'Sample Record 2' },
  ];
};

/**
 * Get display columns - either configured or defaults
 */
const getDisplayColumns = (list) => {
  if (list.columnsConfig && list.columnsConfig.length > 0) {
    return list.columnsConfig;
  }
  if (list.columns && list.columns.length > 0) {
    return list.columns.map(col => ({
      apiName: col,
      label: col.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
    }));
  }
  // Default columns
  const defaultCols = getDefaultColumns(list.objectId);
  return defaultCols.map(col => ({
    apiName: col,
    label: col.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
  }));
};

/**
 * Sortable List Item with clickable header
 */
const SortableListItem = ({ 
  list, 
  onRemove, 
  onSelect, 
  isSelected,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ 
    id: list.id,
    data: { type: 'added', list }
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const columns = getDisplayColumns(list);
  const data = getSampleData(list.objectId);

  return (
    <div 
      ref={setNodeRef} 
      style={style} 
      className={`border rounded bg-white group ${
        isSelected ? 'ring-2 ring-blue-500 border-blue-300' : 'border-slate-200'
      }`}
    >
      {/* Header - Clickable to select */}
      <div 
        onClick={(e) => {
          e.stopPropagation();
          onSelect(list);
        }}
        className={`px-2 py-1.5 border-b flex items-center justify-between cursor-pointer transition-colors ${
          isSelected 
            ? 'bg-blue-50 border-blue-200' 
            : 'bg-slate-50 hover:bg-blue-50'
        }`}
      >
        <div className="flex items-center gap-1.5">
          <div 
            {...attributes} 
            {...listeners} 
            className="cursor-grab hover:bg-slate-200 rounded p-0.5"
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical className="h-3 w-3 text-slate-400" />
          </div>
          <span className="text-base">{list.icon || '📋'}</span>
          <span className={`text-[10px] font-medium ${isSelected ? 'text-blue-700' : 'text-slate-700'}`}>
            {list.name} ({data.length})
          </span>
        </div>
        <div className="flex items-center gap-1">
          {/* Configure columns indicator */}
          <div 
            className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] ${
              isSelected 
                ? 'bg-blue-100 text-blue-600' 
                : 'bg-slate-100 text-slate-500'
            }`}
            title="Click to configure columns"
          >
            <Columns className="h-2.5 w-2.5" />
            <span>{columns.length} cols</span>
          </div>
          <button 
            onClick={(e) => { 
              e.stopPropagation(); 
              onRemove(list.id); 
            }}
            className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-red-100 rounded text-red-400 transition-opacity"
            title="Remove"
          >
            <X className="h-3 w-3" />
          </button>
          <ChevronDown className="h-3 w-3 text-slate-400" />
        </div>
      </div>

      {/* Table Preview */}
      <div className="overflow-x-auto">
        <table className="w-full text-[8px]">
          <thead className="bg-slate-50 border-b">
            <tr>
              {columns.slice(0, 4).map((col, idx) => (
                <th 
                  key={col.apiName || idx} 
                  className="px-1.5 py-0.5 text-left text-slate-600 font-medium"
                >
                  {col.label || col.apiName}
                </th>
              ))}
              {columns.length > 4 && (
                <th className="px-1.5 py-0.5 text-left text-slate-400">
                  +{columns.length - 4} more
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {data.slice(0, 2).map((item, idx) => (
              <tr key={idx} className="border-b last:border-0">
                {columns.slice(0, 4).map((col, colIdx) => (
                  <td 
                    key={col.apiName || colIdx} 
                    className={`px-1.5 py-1 ${colIdx === 0 ? 'text-blue-600' : 'text-slate-600'}`}
                  >
                    {item[col.apiName] || '-'}
                  </td>
                ))}
                {columns.length > 4 && (
                  <td className="px-1.5 py-1 text-slate-400">...</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// Icon mapping for related objects
const OBJECT_ICONS = {
  contacts: '👤',
  accounts: '🏢',
  opportunities: '💰',
  events: '📅',
  tasks: '✓',
  invoices: '📄',
  notes: '📝',
  leads: '🎯',
};

/**
 * Main RelatedListsPreviewEnhanced Component
 */
const RelatedListsPreviewEnhanced = ({ 
  config, 
  component, 
  onConfigUpdate, 
  objectName,
  selectedRelatedObject,
  onSelectRelatedObject,
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  
  // Get configured/added lists
  const addedLists = config?.lists || [];
  const addedIds = addedLists.map(l => l.id);

  // Handle drag end for reordering (dnd-kit)
  const handleDndKitDragEnd = (event) => {
    const { active, over } = event;
    
    if (!over || active.id === over.id) return;
    
    const oldIndex = addedLists.findIndex(l => l.id === active.id);
    const newIndex = addedLists.findIndex(l => l.id === over.id);
    
    if (oldIndex !== -1 && newIndex !== -1) {
      const newLists = arrayMove(addedLists, oldIndex, newIndex);
      if (onConfigUpdate) {
        onConfigUpdate({ ...config, lists: newLists });
        toast.success('Order updated');
      }
    }
  };

  // Handle native HTML5 drag over (from property panel)
  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  // Handle native HTML5 drop (from property panel)
  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    
    try {
      const data = e.dataTransfer.getData('application/json');
      if (!data) return;
      
      const dragData = JSON.parse(data);
      
      if (dragData.type === 'related-object') {
        // Check if already added
        const alreadyAdded = addedLists.some(l => l.objectId === dragData.objectId);
        if (alreadyAdded) {
          toast.error(`${dragData.objectName} is already added`);
          return;
        }
        
        // Add new related list
        const newList = {
          id: `related-${dragData.objectId}-${Date.now()}`,
          objectId: dragData.objectId,
          name: dragData.objectName,
          icon: OBJECT_ICONS[dragData.objectId] || '📋',
          columnsConfig: [], // Will use defaults
        };
        
        const newLists = [...addedLists, newList];
        if (onConfigUpdate) {
          onConfigUpdate({ ...config, lists: newLists });
          toast.success(`${dragData.objectName} added`);
        }
      }
    } catch (err) {
      console.error('Error handling drop:', err);
    }
  };

  // Remove a list
  const removeList = (listId) => {
    // If removing selected list, clear selection
    const listToRemove = addedLists.find(l => l.id === listId);
    if (selectedRelatedObject?.objectId === listToRemove?.objectId) {
      onSelectRelatedObject?.(null);
    }
    
    const newLists = addedLists.filter(l => l.id !== listId);
    if (onConfigUpdate) {
      onConfigUpdate({ ...config, lists: newLists });
    }
  };

  // Handle list selection
  const handleSelectList = (list) => {
    if (selectedRelatedObject?.objectId === list.objectId) {
      // Clicking same list deselects
      onSelectRelatedObject?.(null);
    } else {
      onSelectRelatedObject?.({
        objectId: list.objectId,
        name: list.name,
        icon: list.icon,
      });
    }
  };

  return (
    <div 
      className={`space-y-1.5 min-h-[60px] transition-colors ${
        isDragOver ? 'bg-blue-50 ring-2 ring-blue-300 ring-dashed rounded' : ''
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      data-related-lists-drop="true"
      data-component-instance-id={component?.instanceId}
    >
      {addedLists.length === 0 ? (
        <div className={`text-center py-4 text-slate-400 border-2 border-dashed rounded transition-colors ${
          isDragOver ? 'border-blue-400 bg-blue-50' : 'bg-slate-50/50'
        }`}>
          <List className={`h-6 w-6 mx-auto mb-1 ${isDragOver ? 'text-blue-400' : 'text-slate-300'}`} />
          <p className={`text-[10px] ${isDragOver ? 'text-blue-600 font-medium' : ''}`}>
            {isDragOver ? 'Drop here to add' : 'Drag related lists here'}
          </p>
          <p className="text-[9px]">from properties panel →</p>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDndKitDragEnd}
        >
          <SortableContext items={addedIds} strategy={verticalListSortingStrategy}>
            {addedLists.map((list) => (
              <SortableListItem 
                key={list.id} 
                list={list}
                onRemove={removeList}
                onSelect={handleSelectList}
                isSelected={selectedRelatedObject?.objectId === list.objectId}
              />
            ))}
          </SortableContext>
        </DndContext>
      )}
      
      {/* Drop zone indicator when dragging over existing lists */}
      {isDragOver && addedLists.length > 0 && (
        <div className="py-2 border-2 border-dashed border-blue-400 rounded bg-blue-50 text-center">
          <Plus className="h-4 w-4 mx-auto text-blue-500" />
          <p className="text-[10px] text-blue-600 font-medium">Drop to add</p>
        </div>
      )}
      
      {addedLists.length > 0 && !isDragOver && (
        <div className="text-[9px] text-slate-400 text-center pt-1 border-t border-dashed">
          Click header to configure • Drag to reorder
        </div>
      )}
    </div>
  );
};

export default RelatedListsPreviewEnhanced;
