/**
 * Cascading Field Picker - Salesforce-style multi-column field selector
 * Used for selecting fields including parent lookup fields across:
 * - Validation Rules
 * - Formula Field Builder
 * - Lightning Builder visibility conditions
 */
import React, { useState, useMemo, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Button } from '../components/ui/button';
import { ChevronRight, Search, X } from 'lucide-react';

const CascadingFieldPicker = ({
  open,
  onOpenChange,
  objectName,
  objectLabel,
  fields = [],
  parentFieldGroups = {},
  onSelectField,
  title = "Insert Field"
}) => {
  // Column states
  const [selectedColumn1, setSelectedColumn1] = useState(null);
  const [selectedColumn2, setSelectedColumn2] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setSelectedColumn1(objectName);
      setSelectedColumn2(null);
      setSearchTerm('');
    }
  }, [open, objectName]);

  // Build column 1 data - Object types
  const column1Items = useMemo(() => {
    const items = [
      { id: objectName, label: objectLabel || objectName, hasChildren: true }
    ];
    return items;
  }, [objectName, objectLabel]);

  // Build column 2 data - Fields of selected object
  const column2Items = useMemo(() => {
    if (!selectedColumn1) return [];

    // Get fields for the selected object
    const objectFields = fields.map(f => {
      const fieldName = f.name || f.key || f.api_name;
      const isLookup = fieldName?.endsWith('_id') && parentFieldGroups[
        Object.keys(parentFieldGroups).find(k => 
          k.toLowerCase() === fieldName.replace('_id', '').toLowerCase()
        )
      ];
      
      return {
        id: fieldName,
        label: f.label || fieldName,
        hasChildren: !!isLookup,
        parentKey: isLookup ? Object.keys(parentFieldGroups).find(k => 
          k.toLowerCase() === fieldName.replace('_id', '').toLowerCase()
        ) : null,
        type: f.type
      };
    });

    // Filter by search
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      return objectFields.filter(f => 
        f.label.toLowerCase().includes(search) || 
        f.id.toLowerCase().includes(search)
      );
    }

    return objectFields;
  }, [selectedColumn1, fields, parentFieldGroups, searchTerm]);

  // Build column 3 data - Parent object fields
  const column3Items = useMemo(() => {
    if (!selectedColumn2?.hasChildren || !selectedColumn2?.parentKey) return [];

    const parentFields = parentFieldGroups[selectedColumn2.parentKey] || [];
    
    return parentFields.map(f => ({
      id: f.api_name || f.name || f.key,
      label: f.label || f.api_name || f.name,
      fullPath: f.name || `${selectedColumn2.parentKey}.${f.api_name || f.name}`,
      hasChildren: false,
      type: f.type
    }));
  }, [selectedColumn2, parentFieldGroups]);

  // Handle column 1 selection
  const handleColumn1Select = (item) => {
    setSelectedColumn1(item.id);
    setSelectedColumn2(null);
  };

  // Handle column 2 selection
  const handleColumn2Select = (item) => {
    if (item.hasChildren) {
      setSelectedColumn2(item);
    } else {
      // Direct field selection
      onSelectField(item.id);
      onOpenChange(false);
    }
  };

  // Handle column 3 selection
  const handleColumn3Select = (item) => {
    // Parent field selection
    onSelectField(item.fullPath);
    onOpenChange(false);
  };

  // Column component
  const Column = ({ items, selectedId, onSelect, emptyMessage, showArrow = true }) => (
    <div className="flex-1 border-r last:border-r-0 overflow-y-auto max-h-[300px] min-w-[180px]">
      {items.length === 0 ? (
        <div className="p-4 text-sm text-gray-400 text-center">{emptyMessage}</div>
      ) : (
        items.map((item, idx) => (
          <button
            key={item.id + idx}
            type="button"
            onClick={() => onSelect(item)}
            className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between hover:bg-blue-50 transition-colors ${
              selectedId === item.id ? 'bg-blue-100 text-blue-700' : 'text-gray-700'
            }`}
          >
            <span className="truncate">{item.label}</span>
            {showArrow && item.hasChildren && (
              <ChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0" />
            )}
          </button>
        ))
      )}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl p-0">
        <DialogHeader className="px-4 py-3 border-b">
          <DialogTitle className="text-base font-medium flex items-center justify-between">
            {title}
            <button
              onClick={() => onOpenChange(false)}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="h-5 w-5" />
            </button>
          </DialogTitle>
        </DialogHeader>

        <div className="px-4 py-3 border-b bg-gray-50">
          <p className="text-sm text-gray-600 mb-2">
            Select a field, then click Insert. Labels followed by a "&gt;" indicate that there are more fields available.
          </p>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search fields..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Three-column picker */}
        <div className="flex border-b min-h-[300px]">
          {/* Column 1: Object types */}
          <Column
            items={column1Items}
            selectedId={selectedColumn1}
            onSelect={handleColumn1Select}
            emptyMessage="No objects"
          />

          {/* Column 2: Fields */}
          <Column
            items={column2Items}
            selectedId={selectedColumn2?.id}
            onSelect={handleColumn2Select}
            emptyMessage={selectedColumn1 ? "No fields found" : "Select an object"}
          />

          {/* Column 3: Parent fields */}
          <Column
            items={column3Items}
            selectedId={null}
            onSelect={handleColumn3Select}
            emptyMessage={selectedColumn2?.hasChildren ? "Loading..." : "Select a lookup field"}
            showArrow={false}
          />
        </div>

        <div className="px-4 py-3 bg-gray-50 flex justify-center">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CascadingFieldPicker;
