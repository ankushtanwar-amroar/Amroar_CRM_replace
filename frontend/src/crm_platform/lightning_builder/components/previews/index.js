/**
 * Lightning Page Builder Preview Components
 * Lightweight preview renderings for each component type in the builder canvas
 */
import React, { useState } from 'react';
import {
  ChevronRight, ChevronDown, CheckCircle, Calendar, Mail, Phone,
  FileText, Star, Search, RotateCcw, PlusCircle, Trash2, Plus, List,
  User, Globe, Target, Zap, BarChart3, Clock, Smartphone, MoreHorizontal,
  GripVertical, X, History
} from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button } from '../../../../components/ui/button';
import toast from 'react-hot-toast';
import { getRelatedObjectsInternal } from '../../utils/builderUtils';
import { STANDARD_COMPONENTS } from '../../constants/builderConstants';

// Import RecordDetailPreview for use in Tabs (supports drag-drop)
import { RecordDetailPreview as FullRecordDetailPreview } from '../record-detail';

// ============================================================================
// PATH PREVIEW
// ============================================================================
export const PathPreview = ({ config, onMarkComplete }) => {
  const stages = config?.stages || ['New', 'Working', 'Closed', 'Converted'];
  const currentStage = config?.currentStage || 'New';
  const currentIndex = stages.indexOf(currentStage);
  const showMarkComplete = config?.showMarkComplete !== false;
  const format = config?.format || 'linear';

  return (
    <div className="space-y-2">
      <div className={`flex items-center ${format === 'non-linear' ? 'flex-wrap gap-1' : 'space-x-0.5'}`}>
        {stages.map((stage, idx) => {
          const isComplete = idx < currentIndex;
          const isCurrent = idx === currentIndex;
          
          return (
            <div 
              key={stage}
              className={`${format === 'non-linear' ? 'px-3 py-1.5 rounded-full' : 'flex-1 h-7 flex items-center justify-center'} text-[10px] font-medium ${
                format === 'linear' && idx === 0 ? 'rounded-l' : ''
              } ${
                format === 'linear' && idx === stages.length - 1 ? 'rounded-r' : ''
              } ${
                isComplete ? 'bg-green-500 text-white' :
                isCurrent ? 'bg-blue-500 text-white' :
                'bg-slate-200 text-slate-600'
              }`}
            >
              {isComplete && <CheckCircle className="h-3 w-3 mr-0.5 inline" />}
              {stage}
            </div>
          );
        })}
      </div>
      {showMarkComplete && currentIndex < stages.length - 1 && (
        <div className="flex justify-end">
          <Button 
            variant="outline" 
            size="sm" 
            className="h-7 text-xs text-blue-600 border-blue-200 hover:bg-blue-50"
            onClick={(e) => {
              e.stopPropagation();
              if (onMarkComplete) onMarkComplete();
            }}
          >
            <CheckCircle className="h-3 w-3 mr-1" />
            Mark Status as Complete
          </Button>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// ACTIVITIES PREVIEW
// ============================================================================
export const ActivitiesPreview = ({ config }) => {
  const activityTypes = config?.activityTypes || [];
  const maxVisibleButtons = config?.maxVisibleButtons || 3;
  
  const IconMap = {
    event: Calendar,
    task: CheckCircle,
    email: Mail,
    call: Phone,
    note: FileText,
  };
  
  const colorMap = {
    event: 'bg-purple-500',
    task: 'bg-green-500',
    email: 'bg-blue-500',
    call: 'bg-teal-500',
    note: 'bg-slate-500',
  };
  
  const sampleFieldValues = {
    subject: 'Follow up call',
    description: 'Discuss Q1 targets and partnership opportunities',
    status: 'In Progress',
    priority: 'High',
    due_date: 'Jan 24, 2026',
    start_date: 'Jan 24, 2026 2:30 PM',
    end_date: 'Jan 24, 2026 3:30 PM',
    assigned_to: 'John Doe',
    location: 'Conference Room A',
    call_date: 'Jan 24, 2026 10:00 AM',
    duration: '30 mins',
    call_result: 'Successful',
    related_to: 'Acme Corp',
  };
  
  const fieldLabels = {
    subject: 'Subject',
    description: 'Description',
    status: 'Status',
    priority: 'Priority',
    due_date: 'Due Date',
    start_date: 'Start Date',
    end_date: 'End Date',
    assigned_to: 'Assigned To',
    location: 'Location',
    call_date: 'Call Date',
    duration: 'Duration',
    call_result: 'Result',
    related_to: 'Related To',
  };
  
  const sampleActivities = [
    { type: 'task', title: 'Follow up call', date: 'Today, 2:30 PM', status: 'In Progress' },
    { type: 'email', title: 'Proposal sent', date: 'Yesterday', status: null },
    { type: 'event', title: 'Product demo', date: '2 days ago', status: 'Completed' },
  ].filter(a => activityTypes.some(t => t.type === a.type && t.enabledInTimeline));

  const enabledButtons = activityTypes.filter(t => t.newButtonEnabled);
  const visibleButtons = enabledButtons.slice(0, maxVisibleButtons);
  const overflowButtons = enabledButtons.slice(maxVisibleButtons);
  
  return (
    <div className="bg-white rounded-lg overflow-hidden text-[10px]">
      <div className="px-3 py-2 border-b bg-slate-50 flex flex-wrap gap-1.5">
        {visibleButtons.map(type => {
          const Icon = IconMap[type.type] || FileText;
          return (
            <button
              key={type.type}
              className={`${colorMap[type.type] || 'bg-slate-500'} text-white px-2 py-1 rounded flex items-center gap-1`}
            >
              <Icon className="h-3 w-3" />
              <span className="text-[9px]">{type.newButtonLabel || `New ${type.label}`}</span>
            </button>
          );
        })}
        {overflowButtons.length > 0 && (
          <button className="bg-white border border-slate-300 text-slate-600 px-2 py-1 rounded flex items-center gap-1 hover:bg-slate-100">
            <MoreHorizontal className="h-3 w-3" />
            <span className="text-[9px]">More</span>
            <span className="bg-slate-200 text-slate-600 text-[8px] px-1 rounded">
              {overflowButtons.length}
            </span>
          </button>
        )}
        {enabledButtons.length === 0 && (
          <span className="text-slate-400 text-[9px] py-1">No action buttons configured</span>
        )}
      </div>
      
      <div className="p-2 space-y-2">
        {sampleActivities.length > 0 ? (
          sampleActivities.map((activity, i) => {
            const typeConfig = activityTypes.find(t => t.type === activity.type);
            const Icon = IconMap[activity.type] || FileText;
            const timelineFields = typeConfig?.fieldConfig?.timelineFields || [];
            
            return (
              <div key={i} className="p-2 bg-slate-50 rounded border border-slate-100">
                <div className="flex items-start gap-2">
                  <div className={`w-5 h-5 ${colorMap[activity.type] || 'bg-slate-500'} rounded-full flex items-center justify-center flex-shrink-0`}>
                    <Icon className="h-2.5 w-2.5 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-800 truncate">{activity.title}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-slate-400">{activity.date}</span>
                      {activity.status && (
                        <span className="bg-blue-100 text-blue-600 px-1 rounded text-[8px]">
                          {activity.status}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                
                {timelineFields.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-slate-200 space-y-1 pl-7">
                    {timelineFields.slice(0, 4).map((fieldKey) => {
                      const label = fieldLabels[fieldKey] || fieldKey;
                      const value = sampleFieldValues[fieldKey] || '—';
                      return (
                        <div key={fieldKey} className="flex items-center gap-1.5 text-[9px]">
                          <span className="text-slate-500 font-medium">{label}:</span>
                          <span className="text-slate-700">{value}</span>
                        </div>
                      );
                    })}
                    {timelineFields.length > 4 && (
                      <span className="text-[8px] text-slate-400 italic">
                        +{timelineFields.length - 4} more fields
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })
        ) : (
          <div className="text-center py-4 text-slate-400">
            <Calendar className="h-6 w-6 mx-auto mb-1.5 opacity-50" />
            <p>No activity yet</p>
            <p className="text-[8px]">Configure activity types in properties</p>
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================================================
// SORTABLE ADDED LIST ITEM (for Related Lists)
// ============================================================================
export const SortableAddedListItem = ({ list, listType, onRemove }) => {
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

  const getSampleData = (objectId) => {
    const samples = {
      contacts: [{ name: 'John Smith', title: 'CEO' }, { name: 'Sarah Johnson', title: 'CFO' }],
      accounts: [{ name: 'Acme Corp', industry: 'Technology' }, { name: 'Global Inc', industry: 'Finance' }],
      opportunities: [{ name: 'Enterprise Deal', stage: 'Negotiation' }, { name: 'Cloud Migration', stage: 'Proposal' }],
      events: [{ subject: 'Discovery Call', date: 'Dec 20' }, { subject: 'Demo Meeting', date: 'Dec 22' }],
      tasks: [{ subject: 'Follow up call', status: 'Open' }, { subject: 'Send proposal', status: 'In Progress' }],
      invoices: [{ invoice_number: 'INV-001', amount: '$5,000' }, { invoice_number: 'INV-002', amount: '$3,500' }],
    };
    return samples[objectId] || [{ name: 'Sample 1' }, { name: 'Sample 2' }];
  };

  const data = getSampleData(list.objectId);
  const columns = list.columns || ['name'];

  return (
    <div ref={setNodeRef} style={style} className="border rounded bg-white group">
      <div className="px-2 py-1 bg-slate-50 border-b flex items-center justify-between">
        <div className="flex items-center gap-1">
          <div {...attributes} {...listeners} className="cursor-grab hover:bg-slate-200 rounded p-0.5">
            <GripVertical className="h-3 w-3 text-slate-400" />
          </div>
          <span className="text-[10px] font-medium text-slate-700">{list.name} ({data.length})</span>
        </div>
        <div className="flex items-center gap-1">
          <button 
            onClick={(e) => { e.stopPropagation(); onRemove(list.id); }}
            className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-red-100 rounded text-red-400 transition-opacity"
          >
            <X className="h-3 w-3" />
          </button>
          <ChevronDown className="h-3 w-3 text-slate-400" />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[8px]">
          <thead className="bg-slate-50 border-b">
            <tr>
              {columns.slice(0, 2).map((col, idx) => (
                <th key={idx} className="px-1.5 py-0.5 text-left text-slate-600 font-medium capitalize">
                  {col.replace(/_/g, ' ')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.slice(0, 2).map((item, idx) => (
              <tr key={idx} className="border-b last:border-0">
                {columns.slice(0, 2).map((col, colIdx) => (
                  <td key={colIdx} className={`px-1.5 py-1 ${colIdx === 0 ? 'text-blue-600' : 'text-slate-600'}`}>
                    {item[col] || '-'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ============================================================================
// RELATED LISTS PREVIEW
// ============================================================================
export const RelatedListsPreview = ({ config, component, onConfigUpdate, objectName }) => {
  const listType = config?.listType || 'default';
  
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  
  const addedLists = config?.lists || [];
  const addedIds = addedLists.map(l => l.id);

  const handleDragEnd = (event) => {
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

  const removeList = (listId) => {
    const newLists = addedLists.filter(l => l.id !== listId);
    if (onConfigUpdate) {
      onConfigUpdate({ ...config, lists: newLists });
    }
  };

  return (
    <div 
      className="space-y-1.5 min-h-[60px]" 
      data-related-lists-drop="true"
      data-component-instance-id={component?.instanceId}
    >
      {addedLists.length === 0 ? (
        <div className="text-center py-4 text-slate-400 border-2 border-dashed rounded bg-slate-50/50">
          <List className="h-6 w-6 mx-auto mb-1 text-slate-300" />
          <p className="text-[10px]">Drag related lists here</p>
          <p className="text-[9px]">from properties panel →</p>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={addedIds} strategy={verticalListSortingStrategy}>
            {addedLists.map((list) => (
              <SortableAddedListItem 
                key={list.id} 
                list={list} 
                listType={listType}
                onRemove={removeList}
              />
            ))}
          </SortableContext>
        </DndContext>
      )}
      
      {addedLists.length > 0 && (
        <div className="text-[9px] text-slate-400 text-center pt-1 border-t border-dashed">
          Drag to reorder • Hover to remove
        </div>
      )}
    </div>
  );
};

// ============================================================================
// RELATED LIST QUICK LINKS PREVIEW
// ============================================================================
export const RelatedListQuickLinksPreview = ({ config, objectName, onConfigChange }) => {
  const showHeader = config?.showHeader !== false;
  const configuredLinks = config?.quickLinks || [];
  const allRelatedObjects = getRelatedObjectsInternal(objectName);
  
  const getIconForObject = (iconName) => {
    const icons = {
      'Users': User,
      'Building': Globe,
      'TrendingUp': BarChart3,
      'Calendar': Calendar,
      'CheckSquare': CheckCircle,
      'FileText': FileText,
      'Paperclip': FileText,
      'Target': Target,
      'Briefcase': FileText,
      'Package': FileText,
      'Flag': Target,
      'Link': List,
    };
    return icons[iconName] || List;
  };

  const getObjectById = (objId) => {
    return allRelatedObjects.find(o => o.id === objId);
  };

  const removeQuickLink = (objId, e) => {
    e.stopPropagation();
    if (onConfigChange) {
      const newLinks = configuredLinks.filter(id => id !== objId);
      onConfigChange({ ...config, quickLinks: newLinks });
    }
  };

  return (
    <div className="border rounded-lg overflow-hidden bg-white">
      {showHeader && (
        <div className="px-3 py-2 bg-slate-50 border-b">
          <h3 className="text-[11px] font-semibold text-slate-700">Related List Quick Links</h3>
        </div>
      )}
      
      <div className="p-2">
        {configuredLinks.length === 0 ? (
          <div className="flex items-center justify-center h-12 border-2 border-dashed border-slate-200 rounded bg-slate-50">
            <p className="text-[10px] text-slate-400">Drag objects here from properties panel</p>
          </div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {configuredLinks.map((objId) => {
              const obj = getObjectById(objId);
              if (!obj) return null;
              const IconComponent = getIconForObject(obj.icon);
              return (
                <div 
                  key={objId}
                  className="inline-flex items-center gap-1.5 px-2 py-1 bg-blue-50 border border-blue-200 rounded-full group hover:bg-blue-100 transition-colors"
                >
                  <div className="w-4 h-4 rounded-full bg-blue-100 flex items-center justify-center">
                    <IconComponent className="h-2.5 w-2.5 text-blue-600" />
                  </div>
                  <span className="text-[10px] text-slate-700 font-medium">{obj.name}</span>
                  <button 
                    onClick={(e) => removeQuickLink(objId, e)}
                    className="w-4 h-4 rounded-full bg-slate-200 hover:bg-red-400 flex items-center justify-center transition-colors"
                  >
                    <X className="h-2.5 w-2.5 text-slate-500 hover:text-white" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================================================
// CHATTER PREVIEW - Updated to match runtime UI styling
// ============================================================================
export const ChatterPreview = ({ config }) => {
  const [postContent, setPostContent] = useState('');
  const title = config?.title || 'Chatter';

  return (
    <div className="border rounded-lg overflow-hidden bg-white shadow-sm">
      {/* Header - matches ChatterComponent header styling */}
      <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-slate-50 to-white border-b">
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          <h3 className="text-base font-semibold text-slate-800">{title}</h3>
        </div>
      </div>

      {/* Post Input - matches ChatterFeed styling */}
      <div className="p-4 border-b bg-white">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center flex-shrink-0">
            <span className="text-white font-semibold text-sm">A</span>
          </div>
          <div className="flex-1">
            <textarea
              placeholder="Share an update..."
              value={postContent}
              onChange={(e) => setPostContent(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
              rows={2}
            />
            <div className="flex items-center justify-between mt-2">
              <div className="flex items-center gap-2">
                <button className="p-1.5 hover:bg-slate-100 rounded text-slate-400">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                  </svg>
                </button>
                <button className="p-1.5 hover:bg-slate-100 rounded text-slate-400">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </button>
              </div>
              <Button 
                size="sm" 
                className="h-8 px-4 text-xs bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
                disabled={!postContent.trim()}
                onClick={(e) => e.stopPropagation()}
              >
                Post
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Feed Content - matches ChatterFeed empty state */}
      <div className="p-6 text-center">
        <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        </div>
        <h4 className="text-sm font-semibold text-slate-700 mb-1">Collaborate here!</h4>
        <p className="text-xs text-slate-500">
          Here&apos;s where you start talking with your<br />
          colleagues about this record.
        </p>
      </div>
    </div>
  );
};

// ============================================================================
// SIMPLE PREVIEW COMPONENTS
// ============================================================================
export const BlankSpacePreview = () => (
  <div className="h-8 bg-slate-50 rounded border-2 border-dashed border-slate-200 flex items-center justify-center">
    <span className="text-[10px] text-slate-400">Blank Space</span>
  </div>
);

export const DynamicHighlightsPanelPreview = ({ config }) => {
  return (
    <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded p-2 space-y-2">
      <div className="flex items-center space-x-2 mb-1">
        <Star className="h-3.5 w-3.5 text-yellow-500" />
        <span className="text-[10px] font-medium text-slate-700">Dynamic Highlights Panel</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="p-1.5 bg-white/50 rounded">
          <p className="text-[9px] text-slate-500">Field 1</p>
          <p className="text-[10px] font-medium text-slate-700">Dynamic Value</p>
        </div>
        <div className="p-1.5 bg-white/50 rounded">
          <p className="text-[9px] text-slate-500">Field 2</p>
          <p className="text-[10px] font-medium text-blue-600">Dynamic Value</p>
        </div>
      </div>
    </div>
  );
};

export const FieldSectionPreview = ({ config }) => {
  const sectionName = config?.sectionName || 'Section';
  return (
    <div className="border rounded overflow-hidden">
      <div className="px-2 py-1.5 bg-slate-100 border-b flex items-center justify-between">
        <span className="text-[10px] font-semibold text-slate-700">{sectionName}</span>
        <ChevronDown className="h-3 w-3 text-slate-400" />
      </div>
      <div className="p-2 grid grid-cols-2 gap-2">
        <div>
          <p className="text-[9px] text-slate-500">Field Label</p>
          <p className="text-[10px] text-slate-700">Field Value</p>
        </div>
        <div>
          <p className="text-[9px] text-slate-500">Field Label</p>
          <p className="text-[10px] text-slate-700">Field Value</p>
        </div>
      </div>
    </div>
  );
};

export const SingleFieldPreview = ({ config }) => {
  const label = config?.label || 'Field';
  const fieldType = config?.type || 'text';
  
  const getPreviewValue = () => {
    switch(fieldType) {
      case 'email': return 'example@email.com';
      case 'phone': return '(555) 123-4567';
      case 'url': return 'www.example.com';
      case 'date': return '12/18/2025';
      case 'datetime': return '12/18/2025 10:00 AM';
      case 'currency': return '$10,000.00';
      case 'number': return '100';
      case 'picklist': return 'Option';
      default: return 'Sample Value';
    }
  };

  return (
    <div className="p-2 bg-slate-50 rounded">
      <p className="text-[9px] text-slate-500 uppercase">{label}</p>
      <p className={`text-[10px] ${['email', 'phone', 'url'].includes(fieldType) ? 'text-blue-600' : 'text-slate-700'}`}>
        {getPreviewValue()}
      </p>
    </div>
  );
};

// ============================================================================
// HIGHLIGHTS PANEL PREVIEW - Enhanced with Dynamic Actions
// ============================================================================
const LEAD_FIELDS = [
  { key: 'name', label: 'Name', icon: User, value: 'John Smith', type: 'text' },
  { key: 'title', label: 'Title', icon: FileText, value: 'VP of Sales', type: 'text' },
  { key: 'company', label: 'Company', icon: FileText, value: 'Acme Corp', type: 'text' },
  { key: 'phone', label: 'Phone', icon: Phone, value: '(555) 123-4567', type: 'link' },
  { key: 'mobile', label: 'Mobile', icon: Smartphone, value: '(555) 987-6543', type: 'link' },
  { key: 'email', label: 'Email', icon: Mail, value: 'john@acme.com', type: 'link' },
  { key: 'website', label: 'Website', icon: Globe, value: 'www.acme.com', type: 'link' },
  { key: 'status', label: 'Lead Status', icon: Target, value: 'New', type: 'badge' },
  { key: 'rating', label: 'Rating', icon: Star, value: 'Hot', type: 'badge' },
  { key: 'source', label: 'Lead Source', icon: Zap, value: 'Web', type: 'text' },
  { key: 'industry', label: 'Industry', icon: BarChart3, value: 'Technology', type: 'text' },
  { key: 'annual_revenue', label: 'Annual Revenue', icon: BarChart3, value: '$5,000,000', type: 'text' },
  { key: 'employees', label: 'No. of Employees', icon: User, value: '500', type: 'text' },
  { key: 'address', label: 'Address', icon: FileText, value: '123 Main St, SF', type: 'text' },
  { key: 'description', label: 'Description', icon: FileText, value: 'Key prospect...', type: 'text' },
  { key: 'created_date', label: 'Created Date', icon: Calendar, value: '12/15/2025', type: 'text' },
  { key: 'last_activity', label: 'Last Activity', icon: Clock, value: '12/18/2025', type: 'text' },
  { key: 'owner', label: 'Lead Owner', icon: User, value: 'Admin User', type: 'text' }
];

export { LEAD_FIELDS };

export const HighlightsPanelPreview = ({ config, objectName }) => {
  const showAsCollapsed = config?.showAsCollapsed || false;
  const visibleActionButton = config?.visibleActionButton !== false;
  const selectedActionIds = config?.selectedActions || [];
  const selectedFields = config?.displayFields || ['phone', 'website'];
  
  // State for dynamically fetched actions
  const [actions, setActions] = React.useState([]);
  const [loadingActions, setLoadingActions] = React.useState(true);
  
  // Fetch actions dynamically from backend
  React.useEffect(() => {
    const fetchActions = async () => {
      // Use lead as default object if not specified
      const objName = objectName || 'lead';
      
      try {
        const token = localStorage.getItem('token');
        const API_URL = process.env.REACT_APP_BACKEND_URL || '';
        const response = await fetch(
          `${API_URL}/api/actions?object=${objName.toLowerCase()}&active_only=true&action_context=RECORD_DETAIL`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        
        if (response.ok) {
          const data = await response.json();
          setActions(data || []);
        }
      } catch (err) {
        console.error('Error fetching actions for highlights preview:', err);
      } finally {
        setLoadingActions(false);
      }
    };
    
    fetchActions();
  }, [objectName]);
  
  // Get filtered actions based on selection
  const displayActions = React.useMemo(() => {
    if (selectedActionIds.length === 0) {
      // No explicit selection - show default active actions (up to 5)
      return actions.slice(0, 5);
    }
    // Show only selected actions in the selected order
    return selectedActionIds
      .map(id => actions.find(a => a.id === id))
      .filter(Boolean);
  }, [actions, selectedActionIds]);
  
  // Get icon for action type
  const getActionIcon = (action) => {
    if (action.type === 'SYSTEM_CREATE') return Plus;
    if (action.type === 'SYSTEM_EDIT') return FileText;
    if (action.type === 'SYSTEM_DELETE') return Trash2;
    if (action.type === 'OPEN_URL') return Globe;
    if (action.type === 'RUN_FLOW') return Zap;
    if (action.type === 'CREATE_RECORD') return Plus;
    return Zap;
  };

  if (showAsCollapsed) {
    return (
      <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded p-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <span className="text-xs font-medium text-slate-700">Highlights Panel</span>
            <span className="text-[10px] text-slate-500">(Collapsed)</span>
          </div>
          <ChevronRight className="h-4 w-4 text-slate-400" />
        </div>
      </div>
    );
  }

  const fieldsToShow = selectedFields.map(fieldKey => 
    LEAD_FIELDS.find(f => f.key === fieldKey)
  ).filter(Boolean);

  return (
    <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded p-2 space-y-2">
      {visibleActionButton && (
        <div className="flex flex-wrap gap-1 pb-2 border-b border-slate-200">
          {loadingActions ? (
            <span className="text-[10px] text-slate-400">Loading actions...</span>
          ) : displayActions.length > 0 ? (
            displayActions.map((action) => {
              const Icon = getActionIcon(action);
              const isDelete = action.type === 'SYSTEM_DELETE';
              return (
                <Button 
                  key={action.id} 
                  variant={isDelete ? 'destructive' : 'outline'} 
                  size="sm" 
                  className={`text-[9px] h-5 px-2 gap-1 ${isDelete ? '' : 'bg-white'}`}
                >
                  <Icon className="h-3 w-3" />
                  {action.label}
                </Button>
              );
            })
          ) : (
            <span className="text-[10px] text-slate-400">No actions available</span>
          )}
        </div>
      )}
      
      {fieldsToShow.length > 0 ? (
        <div className="grid grid-cols-2 gap-3">
          {fieldsToShow.map((field) => {
            const Icon = field.icon;
            return (
              <div key={field.key}>
                <div className="flex items-center space-x-1 mb-0.5">
                  <Icon className="h-3 w-3 text-slate-400" />
                  <p className="text-[10px] text-slate-500">{field.label}</p>
                </div>
                {field.type === 'badge' ? (
                  <span className="inline-block px-2 py-0.5 text-[10px] font-medium bg-blue-100 text-blue-700 rounded">
                    {field.value}
                  </span>
                ) : field.type === 'link' ? (
                  <p className="text-xs font-medium text-blue-600">{field.value}</p>
                ) : (
                  <p className="text-xs font-medium text-slate-700">{field.value}</p>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-2 text-[10px] text-slate-400">
          No fields selected. Add fields from Component Properties.
        </div>
      )}
    </div>
  );
};

// ============================================================================
// TAB DROP ZONE
// ============================================================================
export const TabDropZone = ({ tabId, tabsInstanceId, children, isEmpty, isActive }) => {
  const dropId = `tabs-drop-${tabsInstanceId}-${tabId}`;
  const { setNodeRef, isOver } = useDroppable({ id: dropId });
  
  if (!isActive) return null;
  
  return (
    <div
      ref={setNodeRef}
      className={`min-h-[150px] p-3 transition-all ${
        isOver 
          ? 'bg-blue-50 border-2 border-dashed border-blue-400' 
          : isEmpty 
            ? 'bg-slate-50/50 border-2 border-dashed border-slate-200'
            : 'bg-white'
      }`}
    >
      {isEmpty ? (
        <div className="flex flex-col items-center justify-center h-[130px] text-center">
          <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-3 ${isOver ? 'bg-blue-100' : 'bg-slate-100'}`}>
            <Plus className={`h-6 w-6 ${isOver ? 'text-blue-500' : 'text-slate-400'}`} />
          </div>
          <p className={`text-sm font-medium ${isOver ? 'text-blue-600' : 'text-slate-500'}`}>
            {isOver ? 'Drop component here!' : 'Drop components here'}
          </p>
          <p className="text-xs text-slate-400 mt-1">
            Drag from sidebar to add to this tab
          </p>
        </div>
      ) : children}
    </div>
  );
};

// ============================================================================
// TAB RECORD DETAIL PREVIEW - Uses full RecordDetailPreview for drag-drop support
// ============================================================================
const TabRecordDetailPreview = ({ config, component, objectName, schemaFields, onConfigUpdate }) => {
  // Use the full RecordDetailPreview which supports drag-and-drop
  return (
    <FullRecordDetailPreview
      config={config}
      component={component}
      objectName={objectName}
      schemaFields={schemaFields}
      onConfigUpdate={onConfigUpdate}
    />
  );
};

// ============================================================================
// TABS PREVIEW - Enhanced with full drag-and-drop support
// IMPORTANT: This component does NOT create its own DndContext - it relies on
// the parent SimpleLightningPageBuilder's DndContext to handle all drag events.
// This ensures field dragging inside Record Detail components works correctly.
// ============================================================================
export const TabsPreview = ({ config, objectName, schemaFields, onConfigChange, component, onUpdate, onSelectInnerComponent, selectedInnerComponentId }) => {
  const [activeTabIndex, setActiveTabIndex] = useState(0);
  const [localSelectedId, setLocalSelectedId] = useState(null);
  
  // Use passed selectedInnerComponentId or local state
  const effectiveSelectedId = selectedInnerComponentId || localSelectedId;
  
  const tabs = config?.tabs || [
    { id: 'tab-1', label: 'Details', components: [] },
    { id: 'tab-2', label: 'Related', components: [] },
  ];
  
  const activeTab = tabs[activeTabIndex] || tabs[0];

  const addTab = (e) => {
    e.stopPropagation();
    if (tabs.length >= 5) {
      toast.error('Maximum 5 tabs allowed');
      return;
    }
    const newTab = {
      id: `tab-${Date.now()}`,
      label: `Tab ${tabs.length + 1}`,
      components: []
    };
    const newTabs = [...tabs, newTab];
    onUpdate({ ...component, config: { ...config, tabs: newTabs }});
  };

  const renameTab = (tabId, newLabel) => {
    const newTabs = tabs.map(t => t.id === tabId ? { ...t, label: newLabel } : t);
    onUpdate({ ...component, config: { ...config, tabs: newTabs }});
  };

  const removeTab = (e, tabId) => {
    e.stopPropagation();
    if (tabs.length <= 1) {
      toast.error('At least one tab is required');
      return;
    }
    const newTabs = tabs.filter(t => t.id !== tabId);
    if (activeTabIndex >= newTabs.length) {
      setActiveTabIndex(newTabs.length - 1);
    }
    onUpdate({ ...component, config: { ...config, tabs: newTabs }});
  };

  const removeComponentFromTab = (tabId, componentInstanceId) => {
    const newTabs = tabs.map(t => {
      if (t.id === tabId) {
        return { ...t, components: t.components.filter(c => c.instanceId !== componentInstanceId) };
      }
      return t;
    });
    onUpdate({ ...component, config: { ...config, tabs: newTabs }});
    toast.success('Component removed from tab');
    setLocalSelectedId(null);
  };

  // Update a component inside a tab - this is called when inner components (like Record Detail) update their config
  const updateComponentInTab = (tabId, updatedComp) => {
    const newTabs = tabs.map(t => {
      if (t.id === tabId) {
        return { 
          ...t, 
          components: t.components.map(c => 
            c.instanceId === updatedComp.instanceId ? updatedComp : c
          )
        };
      }
      return t;
    });
    onUpdate({ ...component, config: { ...config, tabs: newTabs }});
  };
  
  // Handle selecting an inner component
  const handleSelectInnerComponent = (comp, tabId) => {
    setLocalSelectedId(comp.instanceId);
    if (onSelectInnerComponent) {
      // Call with the inner component to show its properties in the parent builder
      onSelectInnerComponent(comp);
    }
  };

  return (
    <div className="border rounded-lg overflow-hidden bg-white shadow-sm" onClick={(e) => e.stopPropagation()}>
      <div className="flex border-b bg-slate-50 items-center">
        {tabs.map((tab, idx) => (
          <div
            key={tab.id}
            className={`relative flex items-center px-4 py-2.5 border-b-2 transition-colors cursor-pointer group ${
              activeTabIndex === idx
                ? 'text-blue-600 border-blue-600 bg-white font-medium'
                : 'text-slate-500 border-transparent hover:text-slate-700 hover:bg-slate-100'
            }`}
            onClick={(e) => { e.stopPropagation(); setActiveTabIndex(idx); }}
          >
            <input
              type="text"
              value={tab.label}
              onChange={(e) => renameTab(tab.id, e.target.value)}
              onClick={(e) => e.stopPropagation()}
              className={`bg-transparent text-sm w-20 text-center focus:outline-none focus:ring-1 focus:ring-blue-500 rounded ${
                activeTabIndex === idx ? 'font-medium' : ''
              }`}
            />
            {(tab.components?.length || 0) > 0 && (
              <span className={`ml-2 px-2 py-0.5 text-xs rounded-full ${
                activeTabIndex === idx 
                  ? 'bg-blue-100 text-blue-700' 
                  : 'bg-slate-200 text-slate-600'
              }`}>
                {tab.components.length}
              </span>
            )}
            {tabs.length > 1 && (
              <button
                onClick={(e) => removeTab(e, tab.id)}
                className="ml-2 opacity-0 group-hover:opacity-100 p-0.5 hover:bg-red-100 rounded transition-opacity"
                title="Remove tab"
              >
                <X className="h-3 w-3 text-red-400 hover:text-red-600" />
              </button>
            )}
          </div>
        ))}
        {tabs.length < 5 && (
          <button
            onClick={addTab}
            className="p-2.5 text-slate-400 hover:text-blue-600 hover:bg-slate-100 transition-colors"
            title="Add Tab"
          >
            <Plus className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Tab content - Uses SortableContext for component reordering.
          All drag operations are handled by the parent builder's DndContext.
          This is critical for Record Detail field drag-and-drop to work inside tabs. */}
      {tabs.map((tab, idx) => (
        <TabDropZone 
          key={tab.id}
          tabId={tab.id} 
          tabsInstanceId={component?.instanceId}
          isEmpty={!tab.components?.length}
          isActive={activeTabIndex === idx}
        >
          {tab.components?.length > 0 && (
            <SortableContext 
              items={tab.components.map(c => c.instanceId)} 
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-2">
                {tab.components.map((comp, compIndex) => (
                  <SortableTabComponent
                    key={comp.instanceId}
                    comp={comp}
                    tabId={tab.id}
                    tabsInstanceId={component?.instanceId}
                    onRemove={removeComponentFromTab}
                    onSelect={handleSelectInnerComponent}
                    onUpdate={(updatedComp) => updateComponentInTab(tab.id, updatedComp)}
                    objectName={objectName}
                    schemaFields={schemaFields}
                    isSelected={effectiveSelectedId === comp.instanceId}
                    index={compIndex}
                  />
                ))}
              </div>
            </SortableContext>
          )}
        </TabDropZone>
      ))}
    </div>
  );
};

// ============================================================================
// SORTABLE TAB COMPONENT - Enables drag-and-drop reordering of components inside tabs
// ============================================================================
const SortableTabComponent = ({ comp, tabId, tabsInstanceId, onRemove, onSelect, onUpdate, objectName, schemaFields, isSelected, index }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ 
    id: comp.instanceId,
    data: { 
      type: 'tab-inner-component',
      component: comp,
      tabId,
      tabsInstanceId,
      index,
    }
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1000 : 'auto',
  };

  return (
    <div ref={setNodeRef} style={style}>
      <TabComponentRenderer
        comp={comp}
        tabId={tabId}
        tabsInstanceId={tabsInstanceId}
        onRemove={onRemove}
        onSelect={onSelect}
        onUpdate={onUpdate}
        objectName={objectName}
        schemaFields={schemaFields}
        isSelected={isSelected}
        isDragging={isDragging}
        dragHandleProps={{ ref: setActivatorNodeRef, ...attributes, ...listeners }}
      />
    </div>
  );
};

// ============================================================================
// TAB COMPONENT RENDERER - Renders component preview with drag handle
// ============================================================================
const TabComponentRenderer = ({ comp, tabId, tabsInstanceId, onRemove, onSelect, onUpdate, objectName, schemaFields, isSelected, isDragging = false, dragHandleProps = {} }) => {
  const componentDef = STANDARD_COMPONENTS.find(c => c.id === comp.id);
  const Icon = componentDef?.icon || FileText;
  
  // Extract ref from dragHandleProps
  const { ref: dragHandleRef, ...dragHandleListeners } = dragHandleProps || {};
  
  // Render full preview for different component types
  const renderFullPreview = () => {
    switch (comp.id) {
      case 'record_detail':
        return (
          <TabRecordDetailPreview 
            config={comp.config}
            component={comp}
            objectName={objectName}
            schemaFields={schemaFields}
            onConfigUpdate={(newConfig) => onUpdate({ ...comp, config: newConfig })}
          />
        );
      case 'activities':
        return <ActivitiesPreview config={comp.config} />;
      case 'related_lists':
        return (
          <RelatedListsPreview 
            config={comp.config} 
            component={comp} 
            objectName={objectName}
            onConfigUpdate={(newConfig) => onUpdate({ ...comp, config: newConfig })}
          />
        );
      case 'related_list_quick_links':
        return (
          <RelatedListQuickLinksPreview 
            config={comp.config} 
            objectName={objectName}
            onConfigChange={(newConfig) => onUpdate({ ...comp, config: newConfig })}
          />
        );
      case 'chatter':
        return <ChatterPreview config={comp.config} />;
      case 'highlights_panel':
        return <HighlightsPanelPreview config={comp.config} objectName={objectName} />;
      case 'path':
        return <PathPreview config={comp.config} />;
      case 'actions':
        return <ActionsPreview config={comp.config} objectName={objectName} />;
      default:
        return null;
    }
  };
  
  const fullPreview = renderFullPreview();

  return (
    <div 
      onClick={(e) => { e.stopPropagation(); onSelect(comp, tabId); }}
      data-tab-component="true"
      data-tab-id={tabId}
      data-tabs-instance-id={tabsInstanceId}
      data-component-instance-id={comp.instanceId}
      data-component-type={comp.id}
      className={`bg-white border rounded-lg mb-3 group transition-all overflow-hidden cursor-pointer ${
        isSelected 
          ? 'border-blue-500 ring-2 ring-blue-200 shadow-md' 
          : 'border-slate-200 hover:border-blue-300 hover:shadow-sm'
      } ${isDragging ? 'shadow-lg ring-2 ring-blue-400' : ''}`}
    >
      {/* Component Header with Drag Handle */}
      <div className={`flex items-center justify-between p-2 border-b ${isSelected ? 'bg-blue-50' : 'bg-slate-50'}`}>
        <div className="flex items-center space-x-2">
          {/* Drag Handle - Only this element triggers component drag */}
          <div 
            ref={dragHandleRef}
            {...dragHandleListeners}
            className="cursor-grab active:cursor-grabbing p-0.5 hover:bg-slate-200 rounded"
            onClick={(e) => e.stopPropagation()}
            title="Drag to reorder"
          >
            <GripVertical className="h-3.5 w-3.5 text-slate-400" />
          </div>
          <div className={`w-6 h-6 rounded flex items-center justify-center ${isSelected ? 'bg-blue-100' : 'bg-slate-100'}`}>
            <Icon className={`h-3.5 w-3.5 ${isSelected ? 'text-blue-600' : 'text-slate-600'}`} />
          </div>
          <span className={`text-xs font-medium ${isSelected ? 'text-blue-700' : 'text-slate-700'}`}>
            {comp.name || componentDef?.name || comp.id}
          </span>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(tabId, comp.instanceId); }}
          className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-100 rounded-full transition-opacity"
          title="Remove component"
        >
          <X className="h-3.5 w-3.5 text-red-500" />
        </button>
      </div>
      
      {/* Component Preview */}
      <div className="p-3">
        {fullPreview || (
          <div className="text-center py-4 text-slate-400">
            <Icon className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-xs">{componentDef?.description || 'Component preview'}</p>
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================================================
// ACTIONS PREVIEW
// ============================================================================
export const ActionsPreview = ({ config, objectName }) => {
  const format = config?.format || 'button';
  const maxVisible = config?.maxVisible || 3;
  const selectedActionIds = config?.selectedActions || []; // Actions selected in properties
  const [actions, setActions] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  
  // Fetch actions dynamically from backend
  React.useEffect(() => {
    const fetchActions = async () => {
      if (!objectName) {
        setLoading(false);
        return;
      }
      
      try {
        const token = localStorage.getItem('token');
        const API_URL = process.env.REACT_APP_BACKEND_URL || '';
        const response = await fetch(`${API_URL}/api/actions?object=${objectName.toLowerCase()}&active_only=true&action_context=RECORD_DETAIL`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        
        if (response.ok) {
          const data = await response.json();
          setActions(data || []);
        }
      } catch (err) {
        console.error('Error fetching actions for preview:', err);
      } finally {
        setLoading(false);
      }
    };
    
    fetchActions();
  }, [objectName]);
  
  // Filter and order actions based on selection
  const filteredActions = React.useMemo(() => {
    if (selectedActionIds.length === 0) {
      // No selection - show all active actions
      return actions;
    }
    // Show only selected actions in the selected order
    return selectedActionIds
      .map(id => actions.find(a => a.id === id))
      .filter(Boolean);
  }, [actions, selectedActionIds]);
  
  // Get icon for action type
  const getActionIcon = (action) => {
    if (action.type === 'SYSTEM_CREATE') return Plus;
    if (action.type === 'SYSTEM_EDIT') return FileText;
    if (action.type === 'SYSTEM_DELETE') return Trash2;
    if (action.type === 'OPEN_URL') return Globe;
    if (action.type === 'RUN_FLOW') return Zap;
    if (action.type === 'CREATE_RECORD') return Plus;
    return Zap;
  };
  
  if (loading) {
    return (
      <div className="flex items-center gap-2 py-1">
        <span className="text-[10px] text-slate-400">Loading actions...</span>
      </div>
    );
  }
  
  if (filteredActions.length === 0) {
    return (
      <div className="flex items-center gap-2 py-1">
        <span className="text-[10px] text-slate-400">No actions configured</span>
      </div>
    );
  }
  
  const primaryActions = filteredActions.slice(0, maxVisible);
  const hasOverflow = filteredActions.length > maxVisible;

  if (format === 'dropdown') {
    return (
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5">
          <Zap className="h-3.5 w-3.5 text-blue-600" />
          Actions
          <ChevronDown className="h-3.5 w-3.5" />
        </Button>
        <span className="text-[9px] text-slate-400">({filteredActions.length} actions)</span>
      </div>
    );
  }

  // Default: button format - show list of action buttons
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {primaryActions.map((action) => {
        const Icon = getActionIcon(action);
        const isDelete = action.type === 'SYSTEM_DELETE';
        return (
          <Button 
            key={action.id} 
            variant={isDelete ? 'destructive' : 'outline'} 
            size="sm" 
            className={`h-7 text-[10px] gap-1 ${isDelete ? '' : 'bg-white'}`}
          >
            <Icon className="h-3 w-3" />
            {action.label}
          </Button>
        );
      })}
      {hasOverflow && (
        <Button variant="outline" size="sm" className="h-7 w-7 p-0 bg-white">
          <MoreHorizontal className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
};

// ============================================================================
// QUICK ACTIONS PREVIEW - For App Manager Home Dashboard
// ============================================================================
export const QuickActionsPreview = ({ config }) => {
  // Default actions for preview
  const defaultActions = [
    { id: 'new_lead', label: 'New Lead', icon: 'user-plus' },
    { id: 'new_contact', label: 'New Contact', icon: 'user' },
    { id: 'new_account', label: 'New Account', icon: 'building' },
    { id: 'new_opportunity', label: 'New Opportunity', icon: 'target' },
    { id: 'new_task', label: 'New Task', icon: 'check' },
    { id: 'new_event', label: 'New Event', icon: 'calendar' }
  ];
  
  // Parse actions from config - handle both array and object formats
  let actions = defaultActions;
  if (config?.actions) {
    if (Array.isArray(config.actions)) {
      actions = config.actions;
    } else if (typeof config.actions === 'object') {
      // Config.actions might be an object with action definitions
      actions = Object.values(config.actions).filter(a => a && typeof a === 'object' && a.label);
    }
  }
  
  const maxVisible = config?.max_visible || 6;
  const visibleActions = actions.slice(0, maxVisible);
  
  const iconMap = {
    'user-plus': User,
    'user': User,
    'building': Globe,
    'target': Target,
    'check': CheckCircle,
    'check-square': CheckCircle,
    'calendar': Calendar,
  };
  
  return (
    <div className="bg-slate-50/50 rounded p-2 space-y-2">
      <div className="flex items-center gap-1.5 mb-2">
        <Zap className="h-3.5 w-3.5 text-slate-500" />
        <span className="text-[10px] font-semibold text-slate-500 uppercase">Quick Actions</span>
      </div>
      
      <div className="flex flex-wrap gap-1.5">
        {visibleActions.map((action, idx) => {
          const Icon = iconMap[action.icon] || Zap;
          return (
            <button
              key={action.id || idx}
              className="flex items-center gap-1.5 px-2 py-1 bg-white rounded border border-slate-200 text-[10px] font-medium text-slate-700"
            >
              <div className="w-4 h-4 rounded bg-blue-500 flex items-center justify-center">
                <Icon className="h-2.5 w-2.5 text-white" />
              </div>
              {action.label || 'Action'}
            </button>
          );
        })}
      </div>
    </div>
  );
};

// ============================================================================
// AUDIT TRAIL PREVIEW - Record History Timeline
// ============================================================================
export const AuditTrailPreview = ({ config }) => {
  return (
    <div className="bg-slate-50/50 rounded p-2 space-y-2">
      <div className="flex items-center gap-1.5 mb-2">
        <History className="h-3.5 w-3.5 text-indigo-500" />
        <span className="text-[10px] font-semibold text-slate-600">Audit Trail</span>
      </div>
      
      {/* Sample timeline items */}
      <div className="space-y-1.5">
        {[
          { op: 'UPDATE', time: '2 hours ago', user: 'John Doe', summary: 'Status: Open → Closed' },
          { op: 'UPDATE', time: '1 day ago', user: 'Jane Smith', summary: 'Owner changed' },
          { op: 'CREATE', time: '3 days ago', user: 'System', summary: 'Record created' }
        ].map((item, idx) => (
          <div key={idx} className="flex items-center gap-2 py-1.5 px-2 bg-white rounded border border-slate-200">
            <span className={`text-[8px] font-semibold px-1.5 py-0.5 rounded ${
              item.op === 'CREATE' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
            }`}>
              {item.op}
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-[9px] text-slate-700 truncate">{item.summary}</div>
              <div className="text-[8px] text-slate-400">{item.user} • {item.time}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ============================================================================
// FLOW PREVIEW - Embedded Screen Flow Component
// ============================================================================
export const FlowPreview = ({ config }) => {
  const flowId = config?.flowId;
  const flowName = config?.flowName || 'Screen Flow';
  
  // No flow selected
  if (!flowId) {
    return (
      <div className="bg-slate-50/50 rounded p-3 border-2 border-dashed border-slate-300">
        <div className="flex flex-col items-center justify-center py-4 text-center">
          <div className="w-10 h-10 bg-slate-200 rounded-full flex items-center justify-center mb-2">
            <Zap className="h-5 w-5 text-slate-400" />
          </div>
          <p className="text-[10px] text-slate-500">
            Select a Screen Flow<br />from Component Properties
          </p>
        </div>
      </div>
    );
  }
  
  // Flow selected - show preview
  return (
    <div className="bg-white rounded border border-slate-200 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border-b border-blue-100">
        <div className="w-6 h-6 bg-blue-500 rounded flex items-center justify-center">
          <Zap className="h-3.5 w-3.5 text-white" />
        </div>
        <span className="text-[11px] font-semibold text-blue-700">{flowName}</span>
      </div>
      
      {/* Preview Content */}
      <div className="p-3 space-y-2">
        {/* Sample screen components */}
        <div className="space-y-2">
          <div>
            <div className="text-[9px] font-medium text-slate-600 mb-0.5">Screen Title</div>
            <div className="h-5 bg-slate-100 rounded border border-slate-200"></div>
          </div>
          <div>
            <div className="text-[9px] font-medium text-slate-600 mb-0.5">Input Field</div>
            <div className="h-5 bg-slate-100 rounded border border-slate-200"></div>
          </div>
        </div>
        
        {/* Navigation buttons preview */}
        <div className="flex justify-between pt-2 mt-2 border-t border-slate-100">
          <div className="px-2 py-1 bg-slate-100 rounded text-[8px] text-slate-500 font-medium">Previous</div>
          <div className="px-2 py-1 bg-blue-500 rounded text-[8px] text-white font-medium">Next</div>
        </div>
      </div>
    </div>
  );
};

