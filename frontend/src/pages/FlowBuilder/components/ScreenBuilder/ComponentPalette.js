import React, { useState } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { 
  Type, Hash, Mail, Phone, Calendar, CheckSquare, 
  ChevronDown, AlignLeft, GripVertical, DollarSign, Clock, Link,
  Image, FileText, Map, MapPin, Star, Percent, Calculator,
  Code, Radio, ToggleLeft, Sliders, Upload, User, Users,
  Building, CreditCard, Globe, Lock, Search as SearchIcon,
  Tag, List, Table, Paperclip, MessageSquare, Info,
  Eye, AlignCenter, Heading, FileImage, ChevronRight, Bell
} from 'lucide-react';
import { Input } from '../../../../components/ui/input';

const DraggableComponent = ({ id, type, icon: Icon, label, category, disabled, disabledReason }) => {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette-${type}`,
    disabled: disabled
  });

  return (
    <div
      ref={setNodeRef}
      {...(disabled ? {} : listeners)}
      {...(disabled ? {} : attributes)}
      className={`flex items-center gap-2 p-2.5 rounded-md border transition-all ${
        disabled 
          ? 'bg-gray-100 border-gray-300 cursor-not-allowed opacity-60' 
          : 'bg-white cursor-grab active:cursor-grabbing hover:border-blue-500 hover:shadow-sm'
      } ${isDragging ? 'opacity-50' : ''}`}
      title={disabled ? disabledReason : ''}
    >
      <GripVertical className={`w-3.5 h-3.5 flex-shrink-0 ${disabled ? 'text-gray-300' : 'text-gray-400'}`} />
      <Icon className={`w-4 h-4 flex-shrink-0 ${disabled ? 'text-gray-400' : 'text-blue-600'}`} />
      <span className={`text-xs font-medium truncate ${disabled ? 'text-gray-500' : 'text-gray-700'}`}>
        {label}
        {disabled && <span className="ml-1 text-red-600">✗</span>}
      </span>
    </div>
  );
};

const ComponentPalette = ({ hasToast = false }) => {
  const [searchQuery, setSearchQuery] = useState('');
  // FIX #2: Collapsible sections state
  const [inputExpanded, setInputExpanded] = useState(true);
  const [displayExpanded, setDisplayExpanded] = useState(true);

  // All 36 Input Components + 3 Display Components
  const allComponents = {
    input: [
      { type: 'Text', icon: Type, label: 'Text' },
      { type: 'Number', icon: Hash, label: 'Number' },
      { type: 'Email', icon: Mail, label: 'Email' },
      { type: 'Phone', icon: Phone, label: 'Phone' },
      { type: 'Date', icon: Calendar, label: 'Date' },
      { type: 'DateTime', icon: Clock, label: 'Date/Time' },
      { type: 'Time', icon: Clock, label: 'Time' },
      { type: 'Checkbox', icon: CheckSquare, label: 'Checkbox' },
      { type: 'Toggle', icon: ToggleLeft, label: 'Toggle' },
      { type: 'Radio', icon: Radio, label: 'Radio Group' },
      { type: 'Dropdown', icon: ChevronDown, label: 'Picklist' },
      { type: 'MultiSelect', icon: List, label: 'Multi-Select Picklist' },
      { type: 'Textarea', icon: AlignLeft, label: 'Long Text Area' },
      { type: 'RichText', icon: FileText, label: 'Rich Text Area' },
      { type: 'Password', icon: Lock, label: 'Password' },
      { type: 'Currency', icon: DollarSign, label: 'Currency' },
      { type: 'Percent', icon: Percent, label: 'Percent' },
      { type: 'URL', icon: Link, label: 'URL' },
      { type: 'Lookup', icon: SearchIcon, label: 'Lookup' },
      { type: 'File', icon: Upload, label: 'File Upload' },
      { type: 'Image', icon: Image, label: 'Image Upload' },
      { type: 'Signature', icon: FileImage, label: 'Signature' },
      { type: 'Address', icon: MapPin, label: 'Address' },
      { type: 'Location', icon: Map, label: 'Geolocation' },
      { type: 'Rating', icon: Star, label: 'Rating' },
      { type: 'Slider', icon: Sliders, label: 'Slider' },
      { type: 'Name', icon: User, label: 'Name' },
      { type: 'FullName', icon: Users, label: 'Full Name' },
      { type: 'Company', icon: Building, label: 'Company' },
      { type: 'CreditCard', icon: CreditCard, label: 'Credit Card' },
      { type: 'SSN', icon: Lock, label: 'SSN' },
      { type: 'Country', icon: Globe, label: 'Country' },
      { type: 'State', icon: Map, label: 'State/Province' },
      { type: 'Tag', icon: Tag, label: 'Tags' },
      { type: 'Color', icon: Paperclip, label: 'Color Picker' },
      { type: 'Formula', icon: Calculator, label: 'Formula' }
    ],
    display: [
      { type: 'DisplayText', icon: Eye, label: 'Display Text' },
      { type: 'Section', icon: AlignCenter, label: 'Section' },
      { type: 'Heading', icon: Heading, label: 'Rich Text' },
      { type: 'Toast', icon: Bell, label: 'Toast' },
      { type: 'DataTable', icon: Table, label: 'Data Table' }
    ]
  };

  // Filter components based on search
  const filterComponents = (components) => {
    if (!searchQuery.trim()) return components;
    return components.filter(comp => 
      comp.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
      comp.type.toLowerCase().includes(searchQuery.toLowerCase())
    );
  };

  const filteredInputComponents = filterComponents(allComponents.input);
  const filteredDisplayComponents = filterComponents(allComponents.display);

  return (
    <div className="w-64 bg-gray-50 border-r flex flex-col" style={{ height: '100%', overflow: 'hidden' }}>
      {/* Header - Fixed */}
      <div className="p-3 border-b bg-white flex-shrink-0">
        <h3 className="text-sm font-semibold text-gray-900 mb-2">Components</h3>
        
        {/* Search Input */}
        <div className="relative">
          <SearchIcon className="absolute left-2.5 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            type="text"
            placeholder="Search components..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 h-8 text-xs"
          />
        </div>
      </div>
      
      {/* Scrollable Component List - MANDATORY SCROLLING */}
      <div className="flex-1 p-3 space-y-4" style={{ overflowY: 'auto', overflowX: 'hidden' }}>
        {/* Input Components Section - FIX #2: Collapsible */}
        {filteredInputComponents.length > 0 && (
          <div>
            <div 
              className="flex items-center justify-between mb-2 cursor-pointer hover:bg-gray-100 p-1 rounded"
              onClick={() => setInputExpanded(!inputExpanded)}
            >
              <div className="flex items-center gap-1">
                {inputExpanded ? (
                  <ChevronDown className="w-3.5 h-3.5 text-gray-500" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5 text-gray-500" />
                )}
                <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                  Input
                </h4>
              </div>
              <span className="text-xs text-gray-500">{filteredInputComponents.length}</span>
            </div>
            {inputExpanded && (
              <div className="space-y-1.5">
                {filteredInputComponents.map((component) => (
                  <DraggableComponent
                    key={component.type}
                    type={component.type}
                    icon={component.icon}
                    label={component.label}
                    category="input"
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Display Components Section - FIX #2: Collapsible */}
        {filteredDisplayComponents.length > 0 && (
          <div>
            <div 
              className="flex items-center justify-between mb-2 cursor-pointer hover:bg-gray-100 p-1 rounded"
              onClick={() => setDisplayExpanded(!displayExpanded)}
            >
              <div className="flex items-center gap-1">
                {displayExpanded ? (
                  <ChevronDown className="w-3.5 h-3.5 text-gray-500" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5 text-gray-500" />
                )}
                <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                  Display
                </h4>
              </div>
              <span className="text-xs text-gray-500">{filteredDisplayComponents.length}</span>
            </div>
            {displayExpanded && (
              <div className="space-y-1.5">
                {/* Show warning if Toast exists */}
                {hasToast && filteredDisplayComponents.some(c => c.type === 'Toast') && (
                  <div className="p-2 bg-amber-50 border border-amber-200 rounded-md">
                    <p className="text-xs text-amber-800 font-medium">
                      ⚠️ Only one Toast allowed per screen
                    </p>
                  </div>
                )}
                
                {filteredDisplayComponents.map((component) => {
                  // Disable Toast if one already exists
                  const isToast = component.type === 'Toast';
                  const isDisabled = isToast && hasToast;
                  const disabledReason = isDisabled ? 'Only one Toast allowed per screen' : '';
                  
                  return (
                    <DraggableComponent
                      key={component.type}
                      type={component.type}
                      icon={component.icon}
                      label={component.label}
                      category="display"
                      disabled={isDisabled}
                      disabledReason={disabledReason}
                    />
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* No Results */}
        {filteredInputComponents.length === 0 && filteredDisplayComponents.length === 0 && (
          <div className="text-center py-8">
            <Info className="w-8 h-8 text-gray-400 mx-auto mb-2" />
            <p className="text-xs text-gray-500">No components found</p>
          </div>
        )}
      </div>
      
      {/* Footer - FIXED */}
      <div className="p-3 border-t bg-white flex-shrink-0">
        <div className="text-xs text-gray-500">
          <p className="font-medium mb-1">Total: {allComponents.input.length + allComponents.display.length} components</p>
          <p className="text-gray-400">Drag any component to canvas</p>
        </div>
      </div>
    </div>
  );
};

export default ComponentPalette;
