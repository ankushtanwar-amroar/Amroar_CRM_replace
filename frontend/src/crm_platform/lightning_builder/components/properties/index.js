/**
 * Lightning Page Builder Property Panel Components
 * Contains all property panel sub-components for configuring builder components
 */
import React, { useState, useEffect } from 'react';
import {
  ChevronDown, Search, GripVertical, X, List, Plus, FileText, Check, Trash2,
  User, Mail, Phone, Globe, Star, Target, Zap, BarChart3, Clock, Calendar, Smartphone,
  CheckCircle, Loader2
} from 'lucide-react';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { Button } from '../../../../components/ui/button';
import { Input } from '../../../../components/ui/input';
import { getRecordFields, getDefaultRecordDetailItems, getSampleValue } from '../../utils/builderUtils';
import { getRelatedObjects } from '../../../../modules/related-lists';
import FieldBehaviorRulesPanel from '../../../../modules/field-behavior-rules/components/FieldBehaviorRulesPanel';

// Lead fields definition for Highlights Panel
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

// ============================================================================
// RECORD DETAIL PROPERTIES
// ============================================================================
export const RecordDetailProperties = ({ component, onUpdate, objectName }) => {
  const [fieldSearch, setFieldSearch] = useState('');
  const [selectedFieldId, setSelectedFieldId] = useState(null);
  const allFields = getRecordFields(objectName);
  
  const getCurrentItems = () => component.config?.items || getDefaultRecordDetailItems(objectName);
  
  const columns = component.config?.columns || 2;
  const showActions = component.config?.showActions !== false;
  const configuredItems = getCurrentItems();
  
  const selectedField = selectedFieldId 
    ? configuredItems.find(item => item.id === selectedFieldId)
    : null;
  
  const filteredFields = allFields.filter(f => 
    f.label.toLowerCase().includes(fieldSearch.toLowerCase())
  );

  const addField = (field) => {
    const newItem = {
      id: `field-${field.key}-${Date.now()}`,
      type: 'field',
      key: field.key,
      label: field.label
    };
    const newItems = [...getCurrentItems(), newItem];
    onUpdate({ ...component, config: { ...component.config, items: newItems }});
  };

  const addBlankSpace = () => {
    const newItem = {
      id: `blank-${Date.now()}`,
      type: 'blank_space',
      label: 'Blank Space'
    };
    const newItems = [...getCurrentItems(), newItem];
    onUpdate({ ...component, config: { ...component.config, items: newItems }});
  };

  const addFieldSection = () => {
    const newItem = {
      id: `section-${Date.now()}`,
      type: 'field_section',
      label: 'New Section',
      fields: [],
      collapsed: false
    };
    const newItems = [...getCurrentItems(), newItem];
    onUpdate({ ...component, config: { ...component.config, items: newItems }});
  };

  const removeItem = (itemId) => {
    const newItems = getCurrentItems().filter(i => i.id !== itemId);
    onUpdate({ ...component, config: { ...component.config, items: newItems }});
    if (selectedFieldId === itemId) setSelectedFieldId(null);
  };
  
  const updateFieldRules = (fieldId, ruleConfig) => {
    const items = getCurrentItems().map(item => {
      if (item.id === fieldId) {
        return {
          ...item,
          visibilityRule: ruleConfig.visibilityRule,
          requiredRule: ruleConfig.requiredRule,
          readonlyRule: ruleConfig.readonlyRule
        };
      }
      return item;
    });
    onUpdate({ ...component, config: { ...component.config, items }});
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-2 uppercase">Layout Settings</label>
        <div className="flex space-x-2 mb-3">
          <Button 
            variant={columns === 1 ? 'default' : 'outline'} 
            size="sm"
            onClick={() => onUpdate({ ...component, config: { ...component.config, columns: 1 }})}
          >
            1 Column
          </Button>
          <Button 
            variant={columns === 2 ? 'default' : 'outline'} 
            size="sm"
            onClick={() => onUpdate({ ...component, config: { ...component.config, columns: 2 }})}
          >
            2 Columns
          </Button>
        </div>
      </div>

      <div className="pt-3 border-t">
        <label className="block text-xs font-semibold text-slate-700 mb-2 uppercase">Add Elements</label>
        <div className="flex flex-wrap gap-2 mb-3">
          <Button variant="outline" size="sm" onClick={addBlankSpace} className="text-xs">
            <Plus className="h-3 w-3 mr-1" /> Blank Space
          </Button>
          <Button variant="outline" size="sm" onClick={addFieldSection} className="text-xs">
            <Plus className="h-3 w-3 mr-1" /> Section
          </Button>
        </div>
        
        <div className="relative mb-2">
          <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <Input
            placeholder="Search fields..."
            value={fieldSearch}
            onChange={(e) => setFieldSearch(e.target.value)}
            className="h-8 pl-8 text-sm"
          />
        </div>
        
        <div className="max-h-32 overflow-y-auto border rounded">
          {filteredFields.map(field => (
            <button
              key={field.key}
              onClick={() => addField(field)}
              className="w-full flex items-center px-2 py-1.5 text-left hover:bg-blue-50 border-b last:border-0"
            >
              <Plus className="h-3 w-3 text-blue-500 mr-2" />
              <span className="text-xs text-slate-700">{field.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Field Behavior Rules Section */}
      {selectedField && selectedField.type === 'field' && (
        <div className="pt-3 border-t">
          <FieldBehaviorRulesPanel
            fieldName={selectedField.label}
            fieldKey={selectedField.key}
            objectFields={allFields}
            config={{
              visibilityRule: selectedField.visibilityRule,
              requiredRule: selectedField.requiredRule,
              readonlyRule: selectedField.readonlyRule
            }}
            onSave={(ruleConfig) => updateFieldRules(selectedField.id, ruleConfig)}
          />
        </div>
      )}

      <div className="pt-3 border-t">
        <label className="flex items-center space-x-3 cursor-pointer">
          <input 
            type="checkbox" 
            checked={showActions}
            onChange={(e) => onUpdate({ ...component, config: { ...component.config, showActions: e.target.checked }})}
            className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" 
          />
          <span className="text-sm text-slate-700">Show Action Buttons</span>
        </label>
      </div>

      <div className="pt-3 border-t">
        <label className="block text-xs font-semibold text-slate-700 mb-2 uppercase">
          Current Fields ({configuredItems.length})
        </label>
        <p className="text-[10px] text-slate-500 mb-2">
          Click a field to configure behavior rules. Fields can be reordered and removed on the canvas.
        </p>
        <div className="max-h-40 overflow-y-auto border rounded space-y-0.5 p-1">
          {configuredItems.map(item => (
            <div 
              key={item.id} 
              onClick={() => item.type === 'field' && setSelectedFieldId(item.id)}
              className={`flex items-center justify-between px-2 py-1 rounded text-xs ${
                item.type === 'field' ? 'cursor-pointer hover:bg-blue-50' : ''
              } ${selectedFieldId === item.id ? 'bg-blue-100 border border-blue-300' : 'bg-slate-50'}`}
            >
              <div className="flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full ${
                  item.type === 'blank_space' ? 'bg-slate-300' :
                  item.type === 'field_section' ? 'bg-purple-400' : 'bg-blue-400'
                }`} />
                <span className="text-slate-700">{item.label}</span>
                {item.type === 'field' && (item.visibilityRule || item.requiredRule || item.readonlyRule) && (
                  <span className="text-[8px] text-orange-500 font-medium">RULES</span>
                )}
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); removeItem(item.id); }}
                className="p-0.5 hover:bg-red-100 rounded"
              >
                <X className="h-3 w-3 text-slate-400 hover:text-red-500" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// DRAGGABLE RELATED OBJECT ITEM
// ============================================================================
export const DraggableRelatedObjectItem = ({ obj, isDropdownItem = false, onClickAdd }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    isDragging,
  } = useDraggable({ 
    id: `sidebar-relatedlist-${obj.id}`,
    data: { type: 'sidebar-relatedlist', obj }
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    opacity: isDragging ? 0.5 : 1,
  };

  // Handle click to add (alternative to drag)
  const handleClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (onClickAdd) {
      onClickAdd(obj);
    }
  };

  if (isDropdownItem) {
    return (
      <div 
        ref={setNodeRef} 
        style={style}
        {...attributes}
        {...listeners}
        onClick={handleClick}
        className={`flex items-center gap-3 px-3 py-2.5 cursor-grab hover:bg-blue-50 rounded-md transition-all group ${
          isDragging ? 'bg-blue-100 ring-2 ring-blue-400' : ''
        }`}
      >
        <div className="flex items-center justify-center w-8 h-8 bg-slate-100 rounded group-hover:bg-blue-100 transition-colors">
          <List className="h-4 w-4 text-slate-500 group-hover:text-blue-600" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium text-slate-700 group-hover:text-blue-700">{obj.name}</p>
          <p className="text-xs text-slate-400">Click or drag to add</p>
        </div>
        <GripVertical className="h-4 w-4 text-slate-300 group-hover:text-blue-400" />
      </div>
    );
  }

  return (
    <div 
      ref={setNodeRef} 
      style={style}
      {...attributes}
      {...listeners}
      onClick={handleClick}
      className="flex items-center gap-2 px-3 py-2 bg-white border rounded cursor-grab hover:bg-blue-50 hover:border-blue-300 transition-all"
    >
      <GripVertical className="h-3.5 w-3.5 text-slate-400" />
      <List className="h-3.5 w-3.5 text-blue-500" />
      <span className="text-sm text-slate-700">{obj.name}</span>
    </div>
  );
};

// ============================================================================
// DRAGGABLE QUICK LINK ITEM
// ============================================================================
export const DraggableQuickLinkItem = ({ obj }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    isDragging,
  } = useDraggable({ 
    id: `sidebar-quicklink-${obj.id}`,
    data: { type: 'sidebar-quicklink', obj }
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div 
      ref={setNodeRef} 
      style={style}
      {...attributes}
      {...listeners}
      className={`flex items-center gap-2 px-3 py-2 bg-white border rounded cursor-grab hover:bg-blue-50 hover:border-blue-300 transition-all ${
        isDragging ? 'ring-2 ring-blue-400' : ''
      }`}
    >
      <GripVertical className="h-3.5 w-3.5 text-slate-400" />
      <List className="h-3.5 w-3.5 text-purple-500" />
      <span className="text-sm text-slate-700">{obj.name}</span>
    </div>
  );
};

// ============================================================================
// RELATED LISTS PROPERTIES
// ============================================================================
export const RelatedListsProperties = ({ component, onUpdate, objectName }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  
  const allRelatedObjects = getRelatedObjects(objectName);
  const addedLists = component.config?.lists || [];
  const addedIds = addedLists.map(l => l.objectId);
  const availableObjects = allRelatedObjects.filter(obj => !addedIds.includes(obj.id));
  
  const filteredObjects = availableObjects.filter(obj =>
    obj.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Handle click to add a related list directly
  const handleAddRelatedList = (obj) => {
    const currentLists = component.config?.lists || [];
    const alreadyAdded = currentLists.some(l => l.objectId === obj.id);
    
    if (alreadyAdded) {
      return; // Already added
    }
    
    const newList = {
      objectId: obj.id,
      objectName: obj.name,
      displayName: obj.name,
      columns: ['name', 'created_at']
    };
    
    const updatedComponent = {
      ...component,
      config: {
        ...component.config,
        lists: [...currentLists, newList]
      }
    };
    
    onUpdate(updatedComponent);
    setIsDropdownOpen(false); // Close dropdown after adding
  };

  return (
    <div className="space-y-4">
      <div className="p-3 bg-blue-50 rounded-lg border border-blue-100">
        <p className="text-xs text-blue-700 font-medium mb-1">Click or Drag & Drop</p>
        <p className="text-[10px] text-blue-600">
          Click on a related list to add it, or drag it to the canvas. Click on an added list to configure columns.
        </p>
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-2 uppercase">
          Available Related Lists ({availableObjects.length})
        </label>
        
        <div className="relative">
          <button
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className="w-full flex items-center justify-between px-3 py-2.5 bg-white border rounded-lg text-left hover:border-blue-400 transition-colors"
          >
            <div className="flex items-center gap-2">
              <List className="h-4 w-4 text-slate-400" />
              <span className="text-sm text-slate-600">
                {availableObjects.length > 0 
                  ? `${availableObjects.length} lists available` 
                  : 'All lists added'}
              </span>
            </div>
            <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
          </button>

          {isDropdownOpen && availableObjects.length > 0 && (
            <div className="absolute z-10 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-64 overflow-hidden">
              <div className="p-2 border-b sticky top-0 bg-white">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search related objects..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full h-8 pl-8 pr-3 text-sm border rounded-md focus:ring-2 focus:ring-blue-500"
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
              </div>
              <div className="overflow-y-auto max-h-48 p-1">
                {filteredObjects.length === 0 ? (
                  <p className="text-center text-xs text-slate-400 py-4">No related objects found</p>
                ) : (
                  filteredObjects.map(obj => (
                    <DraggableRelatedObjectItem 
                      key={obj.id} 
                      obj={obj} 
                      isDropdownItem 
                      onClickAdd={handleAddRelatedList}
                    />
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {addedLists.length > 0 && (
        <div className="pt-3 border-t">
          <label className="block text-xs font-semibold text-slate-700 mb-2 uppercase">
            Added Lists ({addedLists.length})
          </label>
          <p className="text-[10px] text-slate-500 mb-2">
            Manage lists on the canvas - drag to reorder, hover to remove
          </p>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// RELATED LIST QUICK LINKS PROPERTIES
// ============================================================================
export const RelatedListQuickLinksProperties = ({ component, onUpdate, objectName }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const showHeader = component.config?.showHeader !== false;
  
  const allRelatedObjects = getRelatedObjects(objectName);
  const currentLinks = component.config?.quickLinks || [];
  const availableObjects = allRelatedObjects.filter(obj => !currentLinks.includes(obj.id));
  
  const filteredObjects = availableObjects.filter(obj =>
    obj.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const addQuickLink = (objId) => {
    const newLinks = [...currentLinks, objId];
    onUpdate({ ...component, config: { ...component.config, quickLinks: newLinks }});
  };

  const removeQuickLink = (objId) => {
    const newLinks = currentLinks.filter(id => id !== objId);
    onUpdate({ ...component, config: { ...component.config, quickLinks: newLinks }});
  };

  return (
    <div className="space-y-4">
      <div className="p-3 bg-purple-50 rounded-lg border border-purple-100">
        <p className="text-xs text-purple-700 font-medium mb-1">Quick Links</p>
        <p className="text-[10px] text-purple-600">
          Add quick navigation links to related objects. These appear as clickable badges.
        </p>
      </div>

      <div>
        <label className="flex items-center space-x-3 cursor-pointer mb-3">
          <input 
            type="checkbox" 
            checked={showHeader}
            onChange={(e) => onUpdate({ 
              ...component, 
              config: { ...component.config, showHeader: e.target.checked }
            })}
            className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" 
          />
          <span className="text-sm text-slate-700">Show Header</span>
        </label>
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-2 uppercase">
          Add Quick Links
        </label>
        
        <div className="relative">
          <button
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className="w-full flex items-center justify-between px-3 py-2.5 bg-white border rounded-lg text-left hover:border-purple-400 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Plus className="h-4 w-4 text-purple-400" />
              <span className="text-sm text-slate-600">
                {availableObjects.length > 0 
                  ? `${availableObjects.length} objects available` 
                  : 'All objects added'}
              </span>
            </div>
            <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
          </button>

          {isDropdownOpen && availableObjects.length > 0 && (
            <div className="absolute z-10 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-48 overflow-hidden">
              <div className="p-2 border-b sticky top-0 bg-white">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search objects..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full h-8 pl-8 pr-3 text-sm border rounded-md focus:ring-2 focus:ring-purple-500"
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
              </div>
              <div className="overflow-y-auto max-h-36">
                {filteredObjects.map(obj => (
                  <button
                    key={obj.id}
                    onClick={() => { addQuickLink(obj.id); setIsDropdownOpen(false); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-purple-50 border-b last:border-0"
                  >
                    <Plus className="h-3.5 w-3.5 text-purple-500" />
                    <span className="text-sm text-slate-700">{obj.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {currentLinks.length > 0 && (
        <div className="pt-3 border-t">
          <label className="block text-xs font-semibold text-slate-700 mb-2 uppercase">
            Current Links ({currentLinks.length})
          </label>
          <div className="flex flex-wrap gap-1.5">
            {currentLinks.map(objId => {
              const obj = allRelatedObjects.find(o => o.id === objId);
              if (!obj) return null;
              return (
                <span 
                  key={objId}
                  className="inline-flex items-center px-2 py-0.5 bg-purple-100 text-purple-700 text-[10px] rounded-full"
                >
                  {obj.name}
                  <button onClick={() => removeQuickLink(objId)} className="ml-1 hover:text-purple-900">
                    <X className="h-2.5 w-2.5" />
                  </button>
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// HIGHLIGHTS PANEL PROPERTIES - Enhanced with Custom Actions Selection
// ============================================================================
export const HighlightsPanelProperties = ({ component, onUpdate, objectName }) => {
  const [fieldSearch, setFieldSearch] = useState('');
  const [actionSearch, setActionSearch] = useState('');
  const [allActions, setAllActions] = useState([]);
  const [loadingActions, setLoadingActions] = useState(false);
  
  // Ensure default values for displayFields when component is first rendered
  const selectedFields = component.config?.displayFields || ['phone', 'website'];
  const selectedActionIds = component.config?.selectedActions || [];
  
  // Initialize displayFields in component config if not present
  React.useEffect(() => {
    if (!component.config?.displayFields) {
      onUpdate({
        ...component,
        config: {
          ...component.config,
          displayFields: ['phone', 'website']
        }
      });
    }
  }, []);
  
  // Fetch all Record Detail actions when objectName changes
  React.useEffect(() => {
    const fetchActions = async () => {
      if (!objectName) {
        setAllActions([]);
        return;
      }
      
      try {
        setLoadingActions(true);
        const token = localStorage.getItem('token');
        const API_URL = process.env.REACT_APP_BACKEND_URL || '';
        const response = await fetch(
          `${API_URL}/api/actions?object=${objectName.toLowerCase()}&action_context=RECORD_DETAIL`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        
        if (response.ok) {
          const data = await response.json();
          setAllActions(data || []);
        }
      } catch (err) {
        console.error('Error fetching actions:', err);
        setAllActions([]);
      } finally {
        setLoadingActions(false);
      }
    };
    
    fetchActions();
  }, [objectName]);
  
  const filteredFields = LEAD_FIELDS.filter(field => 
    field.label.toLowerCase().includes(fieldSearch.toLowerCase()) ||
    field.key.toLowerCase().includes(fieldSearch.toLowerCase())
  );
  
  const filteredActions = allActions.filter(action =>
    action.label.toLowerCase().includes(actionSearch.toLowerCase()) ||
    action.type.toLowerCase().includes(actionSearch.toLowerCase())
  );

  const toggleField = (fieldKey) => {
    const currentFields = component.config?.displayFields || ['phone', 'website'];
    let newFields;
    if (currentFields.includes(fieldKey)) {
      newFields = currentFields.filter(f => f !== fieldKey);
    } else {
      newFields = [...currentFields, fieldKey];
    }
    onUpdate({ ...component, config: { ...component.config, displayFields: newFields }});
  };

  const removeField = (fieldKey) => {
    const currentFields = component.config?.displayFields || ['phone', 'website'];
    const newFields = currentFields.filter(f => f !== fieldKey);
    onUpdate({ ...component, config: { ...component.config, displayFields: newFields }});
  };
  
  // Toggle action selection for Highlights Panel
  const toggleAction = (actionId) => {
    const currentActions = component.config?.selectedActions || [];
    let newActions;
    if (currentActions.includes(actionId)) {
      newActions = currentActions.filter(id => id !== actionId);
    } else {
      newActions = [...currentActions, actionId];
    }
    onUpdate({ ...component, config: { ...component.config, selectedActions: newActions }});
  };
  
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

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-2 uppercase">Display Fields</label>
        <p className="text-[10px] text-slate-500 mb-2">
          Search and select Lead fields to display in the Highlights Panel
        </p>
        
        <div className="relative mb-2">
          <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search fields..."
            value={fieldSearch}
            onChange={(e) => setFieldSearch(e.target.value)}
            className="w-full h-8 pl-8 pr-3 text-sm border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          {fieldSearch && (
            <button 
              onClick={() => setFieldSearch('')}
              className="absolute right-2 top-1/2 transform -translate-y-1/2 p-0.5 hover:bg-slate-100 rounded"
            >
              <X className="h-3 w-3 text-slate-400" />
            </button>
          )}
        </div>

        {selectedFields.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2 p-2 bg-blue-50 rounded-md">
            {selectedFields.map((fieldKey) => {
              const field = LEAD_FIELDS.find(f => f.key === fieldKey);
              if (!field) return null;
              return (
                <span 
                  key={fieldKey}
                  className="inline-flex items-center px-2 py-0.5 bg-blue-100 text-blue-700 text-[10px] rounded-full"
                >
                  {field.label}
                  <button onClick={() => removeField(fieldKey)} className="ml-1 hover:text-blue-900">
                    <X className="h-2.5 w-2.5" />
                  </button>
                </span>
              );
            })}
          </div>
        )}

        <div className="max-h-40 overflow-y-auto border rounded-md">
          {filteredFields.length === 0 ? (
            <div className="p-2 text-center text-[10px] text-slate-400">No fields found</div>
          ) : (
            filteredFields.map((field) => {
              const Icon = field.icon;
              const isSelected = selectedFields.includes(field.key);
              return (
                <label 
                  key={field.key}
                  className={`flex items-center space-x-2 px-2 py-1.5 cursor-pointer border-b last:border-0 hover:bg-slate-50 ${
                    isSelected ? 'bg-blue-50' : ''
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleField(field.key)}
                    className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <Icon className="h-3.5 w-3.5 text-slate-400" />
                  <span className="text-xs text-slate-700">{field.label}</span>
                </label>
              );
            })
          )}
        </div>
      </div>

      <div className="pt-3 border-t">
        <label className="block text-xs font-semibold text-slate-700 mb-2 uppercase">Display Options</label>
        
        <label className="flex items-center space-x-3 p-2 rounded hover:bg-slate-50 cursor-pointer">
          <input 
            type="checkbox" 
            checked={component.config?.showAsCollapsed || false}
            onChange={(e) => onUpdate({ 
              ...component, 
              config: { ...component.config, showAsCollapsed: e.target.checked }
            })}
            className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" 
          />
          <div>
            <span className="text-sm text-slate-700">Show as Collapsed</span>
            <p className="text-xs text-slate-500">Display panel in collapsed state</p>
          </div>
        </label>
        
        <label className="flex items-center space-x-3 p-2 rounded hover:bg-slate-50 cursor-pointer mt-2 border border-slate-200">
          <input 
            type="checkbox" 
            checked={component.config?.visibleActionButton !== false}
            onChange={(e) => onUpdate({ 
              ...component, 
              config: { ...component.config, visibleActionButton: e.target.checked }
            })}
            className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" 
          />
          <div className="flex-1">
            <span className="text-sm text-slate-700 font-medium">Show Action Buttons</span>
            <p className="text-xs text-slate-500">
              {component.config?.visibleActionButton !== false 
                ? 'Action buttons will appear in the panel header'
                : 'Action buttons are hidden'}
            </p>
          </div>
          {component.config?.visibleActionButton !== false && (
            <span className="text-[10px] px-2 py-0.5 bg-green-100 text-green-700 rounded-full">ON</span>
          )}
        </label>
      </div>
      
      {/* Action Selection Section - Shows when Show Action Buttons is enabled */}
      {component.config?.visibleActionButton !== false && (
        <div className="pt-3 border-t">
          <div className="p-3 bg-purple-50 rounded-lg border border-purple-100 mb-3">
            <p className="text-xs text-purple-700 font-medium mb-1">Select Actions for Highlights Panel</p>
            <p className="text-[10px] text-purple-600">
              Choose which actions appear in the Highlights Panel header. Both standard and custom Record Detail actions are shown.
            </p>
          </div>
          
          <label className="block text-xs font-semibold text-slate-700 mb-2 uppercase">
            Available Actions
          </label>
          
          {/* Action Search */}
          <div className="relative mb-2">
            <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search actions..."
              value={actionSearch}
              onChange={(e) => setActionSearch(e.target.value)}
              className="w-full h-8 pl-8 pr-3 text-sm border rounded-md focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
            />
            {actionSearch && (
              <button 
                onClick={() => setActionSearch('')}
                className="absolute right-2 top-1/2 transform -translate-y-1/2 p-0.5 hover:bg-slate-100 rounded"
              >
                <X className="h-3 w-3 text-slate-400" />
              </button>
            )}
          </div>
          
          {/* Selected Actions Summary */}
          {selectedActionIds.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-2 p-2 bg-purple-50 rounded-md">
              {selectedActionIds.map((actionId) => {
                const action = allActions.find(a => a.id === actionId);
                if (!action) return null;
                return (
                  <span 
                    key={actionId}
                    className="inline-flex items-center px-2 py-0.5 bg-purple-100 text-purple-700 text-[10px] rounded-full"
                  >
                    {action.label}
                    <button onClick={() => toggleAction(actionId)} className="ml-1 hover:text-purple-900">
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </span>
                );
              })}
            </div>
          )}
          
          {/* Actions List */}
          {loadingActions ? (
            <div className="flex items-center justify-center py-4 border rounded-lg bg-slate-50">
              <span className="text-sm text-slate-500">Loading actions...</span>
            </div>
          ) : allActions.length === 0 ? (
            <div className="py-4 border rounded-lg bg-slate-50 text-center">
              <Zap className="h-6 w-6 mx-auto mb-2 text-slate-300" />
              <p className="text-sm text-slate-500">No Record Detail actions found</p>
              <p className="text-xs text-slate-400 mt-1">
                Create actions in Object Manager → Actions
              </p>
            </div>
          ) : (
            <div className="border rounded-lg divide-y max-h-48 overflow-y-auto">
              {filteredActions.map((action) => {
                const isSelected = selectedActionIds.includes(action.id);
                const IconComponent = getActionIcon(action);
                
                return (
                  <div 
                    key={action.id}
                    onClick={() => toggleAction(action.id)}
                    className={`flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-slate-50 transition-colors ${
                      isSelected ? 'bg-purple-50' : ''
                    }`}
                  >
                    {/* Checkbox */}
                    <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                      isSelected ? 'bg-purple-600 border-purple-600' : 'border-slate-300'
                    }`}>
                      {isSelected && <Check className="h-3 w-3 text-white" />}
                    </div>
                    
                    {/* Icon */}
                    <IconComponent className="h-4 w-4 text-slate-500 flex-shrink-0" />
                    
                    {/* Label and Type */}
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-slate-700 block truncate">
                        {action.label}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {action.type.replace('SYSTEM_', '').replace('_', ' ')}
                      </span>
                    </div>
                    
                    {/* Status badges */}
                    <div className="flex gap-1 flex-shrink-0">
                      {!action.is_active && (
                        <span className="text-[9px] px-1.5 py-0.5 bg-yellow-100 text-yellow-700 rounded">
                          Inactive
                        </span>
                      )}
                      {action.is_system && (
                        <span className="text-[9px] px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded">
                          System
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
              
              {filteredActions.length === 0 && actionSearch && (
                <div className="py-3 text-center text-sm text-slate-400">
                  No actions match "{actionSearch}"
                </div>
              )}
            </div>
          )}
          
          {/* Selection Summary */}
          <p className="text-[10px] text-slate-500 mt-2">
            {selectedActionIds.length === 0 
              ? 'No actions selected — all active actions will be shown by default'
              : `${selectedActionIds.length} action(s) selected for Highlights Panel`
            }
          </p>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// FLOW PROPERTIES - Screen Flow Selection
// ============================================================================
export const FlowProperties = ({ component, onUpdate, objectName }) => {
  const [flows, setFlows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  const selectedFlowId = component.config?.flowId;
  const selectedFlowName = component.config?.flowName;

  // Fetch screen flows on mount
  useEffect(() => {
    fetchScreenFlows();
  }, [objectName]);

  const fetchScreenFlows = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const response = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/flow-builder/flows`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (response.ok) {
        const responseData = await response.json();
        // API returns { flows: [...] } object, not direct array
        const allFlows = responseData.flows || responseData || [];
        
        // Filter to only Screen Flows with allowed launch modes
        // Flow type is 'screen', launch_mode can be 'basic', 'record_detail', or 'list_view'
        // We only allow 'basic' (Use Anywhere) and 'record_detail' - NOT 'list_view'
        const screenFlows = allFlows.filter(flow => {
          // Check if it's a screen flow - the flow_type is 'screen'
          const isScreenFlow = flow.flow_type === 'screen' ||
                               flow.automation_type === 'screen-flow' || 
                               flow.trigger_type === 'screen';
          
          // Only include active flows
          const isActive = flow.status === 'active';
          
          // Get launch mode - actual field is 'launch_mode'
          const launchMode = flow.launch_mode || flow.launchMode || 'basic';
          
          // Only allow 'basic' (Use Anywhere) and 'record_detail' launch modes
          // Exclude 'list_view' flows as they are for bulk operations
          const isValidLaunchMode = launchMode === 'basic' || launchMode === 'record_detail';
          
          // Also filter by object if it's a record_detail flow
          const matchesObject = launchMode === 'basic' || 
                               !flow.screen_flow_object || 
                               flow.screen_flow_object?.toLowerCase() === objectName?.toLowerCase();
          
          return isScreenFlow && isActive && isValidLaunchMode && matchesObject;
        });
        
        setFlows(screenFlows);
      }
    } catch (error) {
      console.error('Error fetching flows:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectFlow = (flow) => {
    onUpdate({
      ...component,
      config: {
        ...component.config,
        flowId: flow.id,
        flowName: flow.name,
        flowLaunchMode: flow.launch_mode || flow.launchMode || 'basic',
        flowObject: flow.object
      }
    });
  };

  const handleClearFlow = () => {
    onUpdate({
      ...component,
      config: {
        ...component.config,
        flowId: null,
        flowName: null,
        flowLaunchMode: null,
        flowObject: null
      }
    });
  };

  const filteredFlows = flows.filter(flow =>
    flow.name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getLaunchModeLabel = (mode) => {
    switch (mode) {
      case 'basic': return 'Use Anywhere';
      case 'record_detail': return 'Record Detail';
      case 'list_view': return 'List View';
      default: return mode || 'Basic';
    }
  };

  const getLaunchModeColor = (mode) => {
    switch (mode) {
      case 'basic': return 'bg-blue-100 text-blue-700';
      case 'record_detail': return 'bg-green-100 text-green-700';
      case 'list_view': return 'bg-orange-100 text-orange-700';
      default: return 'bg-slate-100 text-slate-600';
    }
  };

  return (
    <div className="space-y-4">
      <div className="pb-2 border-b border-slate-200">
        <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
          Flow Component
        </h4>
        <p className="text-[10px] text-slate-500 mt-1">
          Embed a Screen Flow on this record page
        </p>
      </div>

      {/* Selected Flow Display */}
      {selectedFlowId && (
        <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-blue-500 rounded flex items-center justify-center">
                <Zap className="h-4 w-4 text-white" />
              </div>
              <div>
                <p className="text-sm font-medium text-blue-700">{selectedFlowName}</p>
                <p className="text-[10px] text-blue-600">
                  {getLaunchModeLabel(component.config?.flowLaunchMode)}
                </p>
              </div>
            </div>
            <button
              onClick={handleClearFlow}
              className="p-1 hover:bg-blue-100 rounded text-blue-500 hover:text-blue-700"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Flow Selection */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-slate-600">
          {selectedFlowId ? 'Change Flow' : 'Select Screen Flow'}
        </label>
        
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search flows..."
            className="w-full h-8 pl-8 pr-3 text-xs border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Flow List */}
        <div className="max-h-64 overflow-y-auto border border-slate-200 rounded-md">
          {loading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
              <span className="ml-2 text-xs text-slate-500">Loading flows...</span>
            </div>
          ) : filteredFlows.length === 0 ? (
            <div className="py-6 text-center">
              <Zap className="h-8 w-8 text-slate-300 mx-auto mb-2" />
              <p className="text-xs text-slate-500">
                {flows.length === 0 
                  ? 'No Screen Flows available' 
                  : 'No matching flows found'}
              </p>
              <p className="text-[10px] text-slate-400 mt-1">
                Only "Use Anywhere" and "Record Detail"<br />
                Screen Flows can be added to pages
              </p>
            </div>
          ) : (
            filteredFlows.map(flow => {
              const launchMode = flow.launch_mode || flow.launchMode || 'basic';
              const isSelected = flow.id === selectedFlowId;
              
              return (
                <button
                  key={flow.id}
                  onClick={() => handleSelectFlow(flow)}
                  className={`w-full flex items-center gap-3 p-3 hover:bg-slate-50 transition-colors text-left border-b last:border-0 ${
                    isSelected ? 'bg-blue-50' : ''
                  }`}
                >
                  <div className={`w-8 h-8 rounded flex items-center justify-center flex-shrink-0 ${
                    isSelected ? 'bg-blue-500' : 'bg-slate-200'
                  }`}>
                    <Zap className={`h-4 w-4 ${isSelected ? 'text-white' : 'text-slate-500'}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate ${
                      isSelected ? 'text-blue-700' : 'text-slate-700'
                    }`}>
                      {flow.name}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${getLaunchModeColor(launchMode)}`}>
                        {getLaunchModeLabel(launchMode)}
                      </span>
                      {flow.object && (
                        <span className="text-[9px] px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded">
                          {flow.object}
                        </span>
                      )}
                    </div>
                  </div>
                  {isSelected && (
                    <CheckCircle className="h-4 w-4 text-blue-500 flex-shrink-0" />
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Help Text */}
      <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
        <h5 className="text-[10px] font-semibold text-slate-600 mb-1">About Flow Component</h5>
        <ul className="text-[9px] text-slate-500 space-y-1">
          <li>• <strong>Use Anywhere</strong> flows run without record context</li>
          <li>• <strong>Record Detail</strong> flows automatically receive the current recordId</li>
          <li>• List View flows are not supported on record pages</li>
        </ul>
      </div>
    </div>
  );
};

/**
 * Property panel exports for all component types
 */
export { default as ActionsProperties } from './ActionsProperties';