/**
 * Flow Builder Shared Utilities
 * Common utilities and components used across node config panels
 */
import React, { useState, useRef, useEffect } from 'react';
import { Search, ChevronDown, Check, GripVertical } from 'lucide-react';
import {
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

/**
 * Sortable Outcome Item Component for Drag-and-Drop Reordering
 */
export const SortableOutcomeItem = ({ outcome, outcomeIndex, children, id }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      {React.cloneElement(children, {
        dragHandleProps: listeners,
        isDragging,
      })}
    </div>
  );
};

/**
 * Utility: Auto-generate API name from label (Salesforce-like)
 * Examples:
 *   "test" → "test"
 *   "test get" → "test_get"
 *   "Test Get Again" → "test_get_again"
 */
export const generateApiName = (label) => {
  if (!label) return '';
  return label
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_')  // Replace spaces with underscores
    .replace(/[^a-z0-9_]/g, '');  // Remove special characters
};

/**
 * Searchable Select Component for Object Type
 */
export const SearchableObjectSelect = ({ value, onChange, objects, placeholder = 'Select object' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const dropdownRef = useRef(null);
  const inputRef = useRef(null);

  // Find the label for the current value
  const getDisplayLabel = () => {
    if (!value) return placeholder;
    const selectedObj = objects.find(obj => obj.name === value);
    return selectedObj ? selectedObj.label : value;
  };

  const defaultObjects = [
    { name: 'Lead', label: 'Lead' },
    { name: 'Contact', label: 'Contact' },
    { name: 'Account', label: 'Account' },
    { name: 'Task', label: 'Task' },
    { name: 'Event', label: 'Event' },
    { name: 'Opportunity', label: 'Opportunity' },
  ];

  const allObjects = objects?.length > 0 ? objects : defaultObjects;

  const filteredObjects = allObjects.filter(obj => 
    obj.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    obj.label.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Handle click outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
        setSearchQuery('');
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-3 py-2 text-left border rounded-md bg-white hover:bg-gray-50"
      >
        <span className={value ? 'text-gray-900' : 'text-gray-400'}>
          {getDisplayLabel()}
        </span>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg">
          {/* Search Input */}
          <div className="p-2 border-b">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                ref={inputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search objects..."
                className="w-full pl-8 pr-3 py-1.5 text-sm border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Options List */}
          <div className="max-h-60 overflow-auto py-1">
            {filteredObjects.length === 0 ? (
              <div className="px-3 py-2 text-sm text-gray-500">No objects found</div>
            ) : (
              filteredObjects.map((obj) => (
                <button
                  key={obj.name}
                  type="button"
                  onClick={() => {
                    onChange(obj.name);
                    setIsOpen(false);
                    setSearchQuery('');
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2 text-left text-sm hover:bg-gray-100 ${
                    value === obj.name ? 'bg-blue-50 text-blue-700' : ''
                  }`}
                >
                  <span>{obj.label}</span>
                  {value === obj.name && <Check className="w-4 h-4 text-blue-600" />}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * Loop Context Banner Component
 */
export const LoopContextBanner = ({ loopObjectName }) => (
  <div className="bg-amber-50 border border-amber-300 rounded-lg p-3 mb-2">
    <p className="text-sm text-amber-900 font-semibold flex items-center gap-2">
      <span>🔁</span> Inside Loop Context
    </p>
    <p className="text-xs text-amber-700 mt-1">
      This element runs for each <strong>{loopObjectName}</strong> in the collection.
      You can reference current item fields using <code className="bg-amber-100 px-1 rounded">{'{{' + loopObjectName + '_fieldname}}'}</code>
    </p>
  </div>
);

/**
 * Info Banner Component for node headers
 */
export const NodeInfoBanner = ({ color, icon, title, description }) => {
  const colorClasses = {
    blue: 'bg-blue-50 border-blue-200 text-blue-800',
    green: 'bg-green-50 border-green-200 text-green-800',
    purple: 'bg-purple-50 border-purple-200 text-purple-800',
    yellow: 'bg-yellow-50 border-yellow-200 text-yellow-800',
    amber: 'bg-amber-50 border-amber-200 text-amber-800',
    red: 'bg-red-50 border-red-200 text-red-800',
    slate: 'bg-slate-50 border-slate-200 text-slate-800',
    orange: 'bg-orange-50 border-orange-200 text-orange-800',
  };

  return (
    <div className={`border rounded-lg p-3 ${colorClasses[color] || colorClasses.blue}`}>
      <p className="text-sm font-medium">{icon} {title}</p>
      {description && (
        <p className="text-xs mt-1 opacity-80">{description}</p>
      )}
    </div>
  );
};

/**
 * Label and API Name Row Component
 */
export const LabelApiNameRow = ({ config, setConfig, labelPlaceholder = 'Enter label', apiNamePlaceholder = 'api_name' }) => {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <label className="text-sm font-medium">Label</label>
        <input
          type="text"
          className="w-full px-3 py-2 border rounded-md"
          value={config.label || ''}
          onChange={(e) => {
            const newLabel = e.target.value;
            const currentApiName = config.api_name || '';
            const oldAutoGeneratedApiName = generateApiName(config.label || '');
            const shouldAutoGenerate = !currentApiName || currentApiName === oldAutoGeneratedApiName;
            
            setConfig({ 
              ...config, 
              label: newLabel,
              api_name: shouldAutoGenerate ? generateApiName(newLabel) : currentApiName
            });
          }}
          placeholder={labelPlaceholder}
        />
      </div>
      <div>
        <label className="text-sm font-medium">API Name</label>
        <input
          type="text"
          className="w-full px-3 py-2 border rounded-md font-mono bg-slate-50"
          value={config.api_name || ''}
          onChange={(e) => setConfig({ ...config, api_name: e.target.value })}
          placeholder={apiNamePlaceholder}
        />
      </div>
    </div>
  );
};

/**
 * Get trigger object from various sources
 */
export const getTriggerObject = (triggers, nodes, flowVariables, flowType, launchMode, screenFlowObject) => {
  let triggerObject = null;

  // Method 1: Check triggers prop
  if (triggers && triggers.length > 0) {
    const triggerConfig = triggers[0]?.config || triggers[0] || {};
    const obj = triggerConfig.entity || triggerConfig.object || triggerConfig.trigger_object;
    if (obj) {
      triggerObject = obj;
    }
  }

  // Method 2: Check nodes array for trigger/start node
  if (!triggerObject && nodes && nodes.length > 0) {
    const triggerNode = nodes.find(n => n.type === 'trigger' || n.type === 'start' || n.id?.includes('trigger'));
    if (triggerNode) {
      const config1 = triggerNode.data?.config || {};
      const config2 = triggerNode.config || {};
      const obj = config1.entity || config1.object || config1.trigger_object ||
                 config2.entity || config2.object || config2.trigger_object;
      if (obj) {
        triggerObject = obj;
      }
    }
  }

  // Method 3: Check flow variables for Trigger.
  if (!triggerObject && flowVariables && flowVariables.length > 0) {
    const triggerVar = flowVariables.find(v => v.name?.startsWith('Trigger.'));
    if (triggerVar) {
      const parts = triggerVar.name.split('.');
      if (parts.length > 1) {
        triggerObject = parts[1];
      }
    }
  }

  // Method 4: For Screen Flows, use screenFlowObject
  if (!triggerObject && flowType === 'screen-flow' && (launchMode === 'record_detail' || launchMode === 'list_view') && screenFlowObject) {
    triggerObject = screenFlowObject;
  }

  return triggerObject;
};

/**
 * Default CRM Objects list
 */
export const DEFAULT_CRM_OBJECTS = [
  { name: 'Lead', label: 'Lead' },
  { name: 'Contact', label: 'Contact' },
  { name: 'Account', label: 'Account' },
  { name: 'Opportunity', label: 'Opportunity' },
  { name: 'Task', label: 'Task' },
  { name: 'Event', label: 'Event' },
];
