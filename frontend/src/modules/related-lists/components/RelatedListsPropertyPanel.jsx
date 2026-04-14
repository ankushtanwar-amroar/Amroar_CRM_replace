/**
 * RelatedListsPropertyPanel - Enhanced property panel for Related Lists component
 * Shows:
 * - State A: "Select a related list to configure" when no list selected
 * - State B: Column configuration when a list is selected
 * - Back navigation to return to object selection
 * 
 * UPDATED: Now dynamically includes History related lists when tracking is enabled
 */
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  Search, X, List, Info, Columns, 
  ChevronRight, CheckCircle, ArrowLeft, Trash2, History
} from 'lucide-react';
import { Input } from '../../../components/ui/input';
import { Button } from '../../../components/ui/button';
import RelatedListColumnConfig from './RelatedListColumnConfig';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Base related objects (always available)
const BASE_RELATED_OBJECTS = {
  lead: [
    { id: 'contacts', name: 'Contacts', icon: '👤', type: 'standard' },
    { id: 'events', name: 'Events', icon: '📅', type: 'standard' },
    { id: 'tasks', name: 'Tasks', icon: '✓', type: 'standard' },
    { id: 'notes', name: 'Notes', icon: '📝', type: 'standard' },
    { id: 'files', name: 'Files', icon: '📁', type: 'standard' },
  ],
  account: [
    { id: 'contacts', name: 'Contacts', icon: '👤', type: 'standard' },
    { id: 'opportunities', name: 'Opportunities', icon: '💰', type: 'standard' },
    { id: 'invoices', name: 'Invoices', icon: '📄', type: 'standard' },
    { id: 'events', name: 'Events', icon: '📅', type: 'standard' },
    { id: 'tasks', name: 'Tasks', icon: '✓', type: 'standard' },
    { id: 'notes', name: 'Notes', icon: '📝', type: 'standard' },
    { id: 'files', name: 'Files', icon: '📁', type: 'standard' },
  ],
  contact: [
    { id: 'accounts', name: 'Accounts', icon: '🏢', type: 'standard' },
    { id: 'opportunities', name: 'Opportunities', icon: '💰', type: 'standard' },
    { id: 'events', name: 'Events', icon: '📅', type: 'standard' },
    { id: 'tasks', name: 'Tasks', icon: '✓', type: 'standard' },
    { id: 'notes', name: 'Notes', icon: '📝', type: 'standard' },
    { id: 'files', name: 'Files', icon: '📁', type: 'standard' },
  ],
  opportunity: [
    { id: 'contacts', name: 'Contacts', icon: '👤', type: 'standard' },
    { id: 'events', name: 'Events', icon: '📅', type: 'standard' },
    { id: 'tasks', name: 'Tasks', icon: '✓', type: 'standard' },
    { id: 'invoices', name: 'Invoices', icon: '📄', type: 'standard' },
    { id: 'notes', name: 'Notes', icon: '📝', type: 'standard' },
    { id: 'files', name: 'Files', icon: '📁', type: 'standard' },
  ],
  event: [
    { id: 'contacts', name: 'Contacts', icon: '👤', type: 'standard' },
    { id: 'tasks', name: 'Tasks', icon: '✓', type: 'standard' },
    { id: 'notes', name: 'Notes', icon: '📝', type: 'standard' },
    { id: 'files', name: 'Files', icon: '📁', type: 'standard' },
  ],
  task: [
    { id: 'contacts', name: 'Contacts', icon: '👤', type: 'standard' },
    { id: 'notes', name: 'Notes', icon: '📝', type: 'standard' },
    { id: 'files', name: 'Files', icon: '📁', type: 'standard' },
  ],
};

// Default fallback for unknown objects
const DEFAULT_RELATED_OBJECTS = [
  { id: 'contacts', name: 'Contacts', icon: '👤', type: 'standard' },
  { id: 'events', name: 'Events', icon: '📅', type: 'standard' },
  { id: 'tasks', name: 'Tasks', icon: '✓', type: 'standard' },
  { id: 'notes', name: 'Notes', icon: '📝', type: 'standard' },
  { id: 'files', name: 'Files', icon: '📁', type: 'standard' },
];

/**
 * Get related objects for an object type
 * Now dynamically includes History if tracking is enabled
 */
const getRelatedObjects = (objectName, historyEnabled = false) => {
  const baseObjects = BASE_RELATED_OBJECTS[objectName?.toLowerCase()] || DEFAULT_RELATED_OBJECTS;
  
  // If history tracking is enabled for this object, add History as a related list option
  if (historyEnabled) {
    const objectLabel = objectName?.charAt(0).toUpperCase() + objectName?.slice(1).toLowerCase();
    return [
      ...baseObjects,
      { 
        id: `${objectName?.toLowerCase()}_history`, 
        name: `${objectLabel} History`, 
        icon: '📜', 
        type: 'history',
        objectName: objectName?.toLowerCase()
      }
    ];
  }
  
  return baseObjects;
};

/**
 * ClickableRelatedObjectItem - Item that can be clicked to add to Related Lists
 */
const ClickableRelatedObjectItem = ({ obj, onAdd }) => {
  const isHistory = obj.type === 'history';
  
  return (
    <button
      onClick={() => onAdd(obj)}
      className={`w-full flex items-center gap-2 p-2 rounded cursor-pointer transition-all border ${
        isHistory 
          ? 'bg-orange-50 border-orange-200 hover:border-orange-400 hover:bg-orange-100' 
          : 'bg-white border-slate-200 hover:border-blue-400 hover:bg-blue-50'
      } hover:shadow-sm`}
    >
      <span className="text-base">{obj.icon}</span>
      <span className="text-sm text-slate-700 flex-1 text-left flex items-center gap-2">
        {obj.name}
        {isHistory && (
          <span className="text-[9px] px-1.5 py-0.5 bg-orange-200 text-orange-700 rounded font-medium">
            HISTORY
          </span>
        )}
      </span>
      <span className={`text-xs font-medium ${isHistory ? 'text-orange-600' : 'text-blue-500'}`}>+ Add</span>
    </button>
  );
};

/**
 * Main RelatedListsPropertyPanel Component
 */
const RelatedListsPropertyPanel = ({
  component,
  onUpdate,
  objectName,
  selectedRelatedObject, // The currently selected related list in the preview
  onSelectRelatedObject,
  className = '',
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [historyEnabled, setHistoryEnabled] = useState(false);
  
  // Check if history tracking is enabled for this object
  useEffect(() => {
    const checkHistoryTracking = async () => {
      if (!objectName) return;
      
      try {
        const token = localStorage.getItem('token');
        const response = await axios.get(
          `${API}/history-tracking/config/${objectName}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setHistoryEnabled(response.data?.is_enabled || false);
      } catch (error) {
        console.error('Error checking history tracking:', error);
        setHistoryEnabled(false);
      }
    };
    
    checkHistoryTracking();
  }, [objectName]);
  
  // Get all available related objects for this object type (including history if enabled)
  const allRelatedObjects = getRelatedObjects(objectName, historyEnabled);
  
  // Get current configured lists
  const currentLists = component.config?.lists || [];
  const currentListIds = currentLists.map(l => l.objectId);
  
  // Available lists (not already added)
  const availableLists = allRelatedObjects.filter(obj => !currentListIds.includes(obj.id));
  
  // Filter based on search
  const filteredAvailableLists = availableLists.filter(obj =>
    obj.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Get columns config for selected object
  const getColumnsConfig = (objectId) => {
    const listConfig = currentLists.find(l => l.objectId === objectId);
    return listConfig?.columnsConfig || [];
  };

  // Update columns for a specific related object
  const handleColumnsChange = (objectId, newColumns) => {
    const updatedLists = currentLists.map(list => {
      if (list.objectId === objectId) {
        return {
          ...list,
          columnsConfig: newColumns,
          columns: newColumns.map(c => c.apiName), // Also update simple columns array for backward compat
        };
      }
      return list;
    });
    
    onUpdate({
      ...component,
      config: {
        ...component.config,
        lists: updatedLists,
      },
    });
  };

  // Clear selection
  const handleClearSelection = () => {
    if (onSelectRelatedObject) {
      onSelectRelatedObject(null);
    }
  };

  // Add a related list directly via click
  const handleAddRelatedList = (obj) => {
    const alreadyAdded = currentLists.some(l => l.objectId === obj.id);
    if (alreadyAdded) {
      return; // Already added
    }
    
    const newList = {
      id: `${obj.id}-${Date.now()}`,
      objectId: obj.id,
      name: obj.name,
      icon: obj.icon,
      displayName: obj.name,
      columns: ['name', 'created_at'],
      columnsConfig: [],
      type: obj.type || 'standard', // 'standard', 'history', etc.
      sourceObjectName: obj.objectName || null, // For history lists, the object being tracked
    };
    
    onUpdate({
      ...component,
      config: {
        ...component.config,
        lists: [...currentLists, newList]
      }
    });
  };

  // Remove a related list
  const handleRemoveRelatedList = (objectId) => {
    const updatedLists = currentLists.filter(l => l.objectId !== objectId);
    onUpdate({
      ...component,
      config: {
        ...component.config,
        lists: updatedLists
      }
    });
    // Clear selection if removing the selected object
    if (selectedRelatedObject?.objectId === objectId) {
      handleClearSelection();
    }
  };

  return (
    <div className={`space-y-4 ${className}`}>
      {/* State B: Related Object Selected - Show Column Config */}
      {selectedRelatedObject ? (
        <div className="space-y-4">
          {/* Back Navigation Header */}
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearSelection}
              className="h-8 px-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100"
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back to Lists
            </Button>
          </div>
          
          {/* Selected Object Header */}
          <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg border border-blue-200">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-blue-600" />
              <span className="text-sm font-medium text-blue-700">
                {selectedRelatedObject.name}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleRemoveRelatedList(selectedRelatedObject.objectId)}
                className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1 px-2 py-1 rounded hover:bg-red-50"
                title="Remove this list"
              >
                <Trash2 className="h-3 w-3" />
                Remove
              </button>
            </div>
          </div>

          {/* Column Configuration */}
          <RelatedListColumnConfig
            objectName={selectedRelatedObject.objectId}
            objectLabel={selectedRelatedObject.name}
            currentColumns={getColumnsConfig(selectedRelatedObject.objectId)}
            onChange={(newColumns) => handleColumnsChange(selectedRelatedObject.objectId, newColumns)}
          />
          
          {/* Change Object Option */}
          <div className="border-t pt-4">
            <Button
              variant="outline"
              size="sm"
              onClick={handleClearSelection}
              className="w-full text-slate-600 hover:text-slate-900"
            >
              <List className="h-4 w-4 mr-2" />
              Change Related Object
            </Button>
          </div>
        </div>
      ) : (
        /* State A: No Selection - Show Add Related Lists + Info */
        <div className="space-y-4">
          {/* Info Box */}
          {currentLists.length > 0 && (
            <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 flex items-start gap-2">
              <Info className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
              <div className="text-xs text-amber-700">
                <p className="font-medium">Configure Columns</p>
                <p className="mt-1 text-amber-600">
                  Click on a related list in the preview to configure which columns are displayed.
                </p>
              </div>
            </div>
          )}

          {/* Salesforce-style Search with Always-visible Draggable Items */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-2 uppercase">
              Add Related Lists
            </label>
            
            {availableLists.length === 0 ? (
              <div className="p-3 bg-slate-50 rounded-lg text-center">
                <p className="text-xs text-slate-500">All objects added</p>
              </div>
            ) : (
              <>
                {/* Search Input */}
                <div className="relative mb-2">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    placeholder="Search objects..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 h-9 text-sm border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                  {searchQuery && (
                    <button 
                      onClick={() => setSearchQuery('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
                
                {/* Always-visible clickable items list */}
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {filteredAvailableLists.map((obj) => (
                    <ClickableRelatedObjectItem 
                      key={obj.id} 
                      obj={obj} 
                      onAdd={handleAddRelatedList}
                    />
                  ))}
                  {filteredAvailableLists.length === 0 && searchQuery && (
                    <div className="p-3 text-center text-xs text-slate-400">
                      No matching objects
                    </div>
                  )}
                </div>
                
                <p className="text-xs text-slate-500 mt-2 flex items-center gap-1">
                  <span>Click an item to add it to the Related Lists</span>
                </p>
              </>
            )}
          </div>

          {/* Current Lists Summary */}
          {currentLists.length > 0 && (
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-700 uppercase">
                Added Lists ({currentLists.length})
              </label>
              <div className="space-y-1">
                {currentLists.map((list) => (
                  <button
                    key={list.id}
                    onClick={() => onSelectRelatedObject?.({
                      objectId: list.objectId,
                      name: list.name,
                    })}
                    className="w-full flex items-center justify-between p-2 bg-white border border-slate-200 rounded hover:border-blue-300 hover:bg-blue-50 transition-all"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-base">{list.icon || '📋'}</span>
                      <span className="text-sm text-slate-700">{list.name}</span>
                    </div>
                    <div className="flex items-center gap-1 text-slate-400">
                      <Columns className="h-3 w-3" />
                      <span className="text-[10px]">
                        {list.columnsConfig?.length || list.columns?.length || 0} cols
                      </span>
                      <ChevronRight className="h-3 w-3" />
                    </div>
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-slate-500">
                Click a list to configure its columns
              </p>
            </div>
          )}

          {/* Empty State */}
          {currentLists.length === 0 && (
            <div className="p-4 bg-slate-50 rounded-lg text-center">
              <List className="h-8 w-8 text-slate-300 mx-auto mb-2" />
              <p className="text-xs text-slate-500">No related lists added</p>
              <p className="text-[10px] text-slate-400 mt-1">
                Search and drag objects to add them
              </p>
            </div>
          )}
        </div>
      )}

      {/* Help Section */}
      <div className="border-t pt-4">
        <div className="p-3 bg-slate-50 rounded-lg text-[10px] text-slate-600 space-y-1">
          <p className="font-medium text-slate-700">How it works:</p>
          <p>• Search and drag related objects to add them</p>
          <p>• Click on a list in preview to configure columns</p>
          <p>• Drag to reorder columns in the list</p>
          <p>• Each list can have different columns</p>
        </div>
      </div>
    </div>
  );
};

export default RelatedListsPropertyPanel;
export { getRelatedObjects };
