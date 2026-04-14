/**
 * KanbanView - Kanban board view with drag & drop
 * Extracted from EnhancedObjectListView
 */
import React, { useState, useEffect, useMemo } from 'react';
import toast from 'react-hot-toast';
import axios from 'axios';

// UI Components
import { Button } from '../../ui/button';
import { Badge } from '../../ui/badge';
import { Label } from '../../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';
import { Card, CardContent } from '../../ui/card';

// Icons
import {
  Eye,
  Mail,
  Phone,
  Building,
  FileText,
  Kanban,
} from 'lucide-react';

// Import dnd-kit for drag and drop
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// Utils
import { getKanbanColumnColor, getPicklistFields, getDefaultKanbanField } from '../utils/listViewUtils';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// ============================================
// KANBAN CARD COMPONENT
// ============================================
const KanbanCard = ({ record, object, getRecordName, onRecordClick, isDragging }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSortableDragging,
  } = useSortable({
    id: record.id,
    data: { type: 'card', record }
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging || isSortableDragging ? 0.5 : 1,
  };

  // Get key fields to display - exclude status field and prioritize system fields
  const systemFields = Object.entries(object.fields)
    .filter(([key, field]) => !field.is_custom && !key.toLowerCase().includes('status'))
    .map(([key]) => key)
    .slice(0, 2);

  const customFields = Object.entries(object.fields)
    .filter(([key, field]) => field.is_custom && !key.toLowerCase().includes('status'))
    .map(([key]) => key)
    .slice(0, 1);

  const fieldKeys = [...systemFields, ...customFields];

  const getFieldIcon = (fieldKey) => {
    const field = object.fields[fieldKey];
    if (field.type === 'email' || fieldKey.toLowerCase().includes('email')) return <Mail className="h-3 w-3" />;
    if (field.type === 'phone' || fieldKey.toLowerCase().includes('phone')) return <Phone className="h-3 w-3" />;
    if (fieldKey.toLowerCase().includes('company')) return <Building className="h-3 w-3" />;
    return <FileText className="h-3 w-3" />;
  };

  return (
    <Card
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="cursor-move hover:shadow-md transition-shadow bg-white"
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <h4
            className="font-medium text-slate-900 cursor-pointer hover:text-indigo-600 flex-1"
            onClick={(e) => {
              e.stopPropagation();
              onRecordClick(record);
            }}
          >
            {getRecordName(record)}
          </h4>
        </div>
        <div className="space-y-2">
          {fieldKeys.map(fieldKey => (
            record.data[fieldKey] && (
              <div key={fieldKey} className="flex items-start text-sm text-slate-600">
                <span className="mr-2 text-slate-400 mt-0.5">{getFieldIcon(fieldKey)}</span>
                <div className="flex-1 min-w-0">
                  {object.fields[fieldKey].is_custom && (
                    <Badge variant="secondary" className="text-xs mb-1">Custom</Badge>
                  )}
                  <span className="truncate block">{record.data[fieldKey]}</span>
                </div>
              </div>
            )
          ))}
        </div>
        <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <span>{new Date(record.created_at).toLocaleDateString()}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onRecordClick(record);
            }}
            className="h-6 px-2 text-xs"
          >
            <Eye className="h-3 w-3 mr-1" />
            View
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

// ============================================
// KANBAN COLUMN COMPONENT
// ============================================
const KanbanColumn = ({ status, records, object, getRecordName, onRecordClick, fieldLabel }) => {
  const { setNodeRef } = useSortable({
    id: status,
    data: { type: 'column', status }
  });

  return (
    <div
      ref={setNodeRef}
      className="flex-shrink-0 w-80 bg-slate-50 rounded-lg p-4"
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-slate-900">{status}</h3>
        <Badge variant="secondary" className={getKanbanColumnColor(status)}>
          {records.length}
        </Badge>
      </div>
      <div className="space-y-3 max-h-[calc(100vh-300px)] overflow-y-auto">
        {records.map(record => (
          <KanbanCard
            key={record.id}
            record={record}
            object={object}
            getRecordName={getRecordName}
            onRecordClick={onRecordClick}
          />
        ))}
        {records.length === 0 && (
          <div className="text-center py-8 text-slate-400 text-sm">
            No items
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================
// MAIN KANBAN VIEW COMPONENT
// ============================================
const KanbanView = ({ object, records, onUpdate, getRecordName, onRecordClick }) => {
  const [columns, setColumns] = useState({});
  const [activeId, setActiveId] = useState(null);
  const [selectedPicklistField, setSelectedPicklistField] = useState(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Find ALL picklist fields in the object
  const picklistFields = useMemo(() => {
    return getPicklistFields(object);
  }, [object.fields]);

  // Set default selected field (prioritize 'status' field if available)
  useEffect(() => {
    if (picklistFields.length > 0 && !selectedPicklistField) {
      setSelectedPicklistField(getDefaultKanbanField(picklistFields));
    }
  }, [picklistFields, selectedPicklistField]);

  // Get the currently selected field configuration
  const currentField = useMemo(() => {
    if (!selectedPicklistField) return null;
    return picklistFields.find(f => f.key === selectedPicklistField);
  }, [selectedPicklistField, picklistFields]);

  // Group records by the selected picklist field
  useEffect(() => {
    if (!currentField) return;

    const options = currentField.options || [];

    // Group records by the selected field value
    const grouped = {};
    options.forEach(optionValue => {
      grouped[optionValue] = records.filter(record => record.data[selectedPicklistField] === optionValue);
    });

    // Add "Unassigned" column for records without a value
    const unassignedRecords = records.filter(record => 
      !record.data[selectedPicklistField] || !options.includes(record.data[selectedPicklistField])
    );
    if (unassignedRecords.length > 0) {
      grouped['Unassigned'] = unassignedRecords;
    }

    setColumns(grouped);
  }, [records, currentField, selectedPicklistField]);

  const handleDragStart = (event) => {
    setActiveId(event.active.id);
  };

  const handleDragEnd = async (event) => {
    const { active, over } = event;

    if (!over) {
      setActiveId(null);
      return;
    }

    const activeRecord = records.find(r => r.id === active.id);
    const newValue = over.id;

    if (!activeRecord || !selectedPicklistField) {
      setActiveId(null);
      return;
    }

    const currentValue = activeRecord.data[selectedPicklistField];

    // Handle "Unassigned" column - set to empty or first option
    const actualNewValue = newValue === 'Unassigned' ? '' : newValue;

    if (currentValue !== actualNewValue) {
      try {
        // Update the record's picklist field value
        await axios.put(`${API}/objects/${object.object_name}/records/${activeRecord.id}`, {
          data: {
            ...activeRecord.data,
            [selectedPicklistField]: actualNewValue
          }
        });

        toast.success(`Moved to ${newValue}`);
        onUpdate();
      } catch (error) {
        toast.error('Failed to update record');
        console.error('Error updating record:', error);
      }
    }

    setActiveId(null);
  };

  const handleDragCancel = () => {
    setActiveId(null);
  };

  if (picklistFields.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-500">
        <div className="text-center">
          <Kanban className="h-12 w-12 mx-auto mb-4 text-slate-400" />
          <p className="text-lg font-medium mb-2">Kanban view not available</p>
          <p className="text-sm">This object doesn&apos;t have any picklist fields</p>
        </div>
      </div>
    );
  }

  const activeRecord = activeId ? records.find(r => r.id === activeId) : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      {/* Group By Selector */}
      <div className="flex items-center gap-4 px-6 py-3 border-b bg-slate-50">
        <div className="flex items-center gap-2">
          <Label className="text-sm font-medium text-slate-600">Group By:</Label>
          <Select value={selectedPicklistField || ''} onValueChange={setSelectedPicklistField}>
            <SelectTrigger className="w-48 h-9 bg-white">
              <SelectValue placeholder="Select field" />
            </SelectTrigger>
            <SelectContent>
              {picklistFields.map(field => (
                <SelectItem key={field.key} value={field.key}>
                  {field.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <span className="text-xs text-slate-400">
          {Object.keys(columns).length} columns • {records.length} records
        </span>
      </div>
      
      <div className="flex gap-4 p-6 overflow-x-auto h-full">
        {Object.entries(columns).map(([columnValue, columnRecords]) => (
          <KanbanColumn
            key={columnValue}
            status={columnValue}
            records={columnRecords}
            object={object}
            getRecordName={getRecordName}
            onRecordClick={onRecordClick}
            fieldLabel={currentField?.label || 'Status'}
          />
        ))}
      </div>
      <DragOverlay>
        {activeRecord ? (
          <KanbanCard
            record={activeRecord}
            object={object}
            getRecordName={getRecordName}
            isDragging
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
};

export default KanbanView;
