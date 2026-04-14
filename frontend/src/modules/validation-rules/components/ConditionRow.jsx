/**
 * Condition Row Component
 * Single condition in rule builder
 * Uses Salesforce-style cascading field picker for parent references
 */
import React, { useState, useMemo } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';
import { Input } from '../../../components/ui/input';
import { Button } from '../../../components/ui/button';
import { X, ChevronRight, Search } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../../../components/ui/dialog';

const ConditionRow = ({ condition, index, fields, parentFieldGroups = {}, onChange, onRemove, objectName = '', objectLabel = '' }) => {
  const [showFieldPicker, setShowFieldPicker] = useState(false);
  const [selectedColumn1, setSelectedColumn1] = useState(null);
  const [selectedColumn2, setSelectedColumn2] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  const operators = [
    { value: 'equals', label: 'Equals', hint: 'Block if field equals this value' },
    { value: 'not_equals', label: 'Not Equals', hint: 'Block if field does not equal this value' },
    { value: 'contains', label: 'Contains', hint: 'Block if field contains this value' },
    { value: 'starts_with', label: 'Starts With', hint: 'Block if field starts with this value' },
    { value: 'ends_with', label: 'Ends With', hint: 'Block if field ends with this value' },
    { value: 'greater_than', label: 'Greater Than', hint: 'Block if field is greater than this value' },
    { value: 'less_than', label: 'Less Than', hint: 'Block if field is less than this value' },
    { value: 'is_empty', label: 'Is Empty (Required)', hint: 'Block if field is blank - use to require fields' },
    { value: 'is_not_empty', label: 'Is Not Empty', hint: 'Block if field has a value' }
  ];

  const needsValue = !['is_empty', 'is_not_empty'].includes(condition.operator);

  // Identify lookup fields
  const lookupFieldsMap = useMemo(() => {
    const lookups = {};
    
    fields.forEach(field => {
      const fieldName = field.name || field.key;
      const fieldType = field.type || field.field_type;
      
      // Check if field is a lookup type OR ends with _id
      if (fieldType === 'lookup' || fieldName?.endsWith('_id')) {
        const parentName = fieldName?.replace('_id', '');
        
        const parentKey = Object.keys(parentFieldGroups).find(
          k => k.toLowerCase() === parentName?.toLowerCase()
        );
        
        if (parentKey && parentFieldGroups[parentKey]?.length > 0) {
          lookups[fieldName] = parentKey;
        }
      }
    });
    
    return lookups;
  }, [fields, parentFieldGroups]);

  // Check if current field is a parent reference
  const isParentReference = condition.field_name?.includes('.');

  // Find selected field for options
  const selectedField = useMemo(() => {
    if (isParentReference) {
      const [parentName, fieldName] = condition.field_name.split('.');
      const parentGroup = parentFieldGroups[parentName];
      if (parentGroup) {
        return parentGroup.find(f => 
          (f.api_name || f.name) === fieldName || f.name === condition.field_name
        );
      }
      return null;
    }
    return fields.find(f => (f.name || f.key) === condition.field_name);
  }, [condition.field_name, fields, parentFieldGroups, isParentReference]);

  const hasOptions = selectedField?.options?.length > 0;

  // Get display label for current field
  const getFieldDisplayLabel = () => {
    if (!condition.field_name) return 'Select field...';
    
    if (isParentReference) {
      return condition.field_name;
    }
    
    const field = fields.find(f => (f.name || f.key) === condition.field_name);
    return field?.label || condition.field_name;
  };

  // Column 1 items - just the current object
  const column1Items = useMemo(() => {
    return [{ id: 'current', label: objectLabel || objectName || 'Current Object', hasChildren: true }];
  }, [objectName, objectLabel]);

  // Column 2 items - fields of current object
  const column2Items = useMemo(() => {
    if (selectedColumn1 !== 'current') return [];

    let fieldList = fields.map(f => {
      const fieldName = f.name || f.key;
      const isLookup = !!lookupFieldsMap[fieldName];
      
      return {
        id: fieldName,
        label: f.label || fieldName,
        hasChildren: isLookup,
        parentKey: isLookup ? lookupFieldsMap[fieldName] : null,
        type: f.type,
        options: f.options
      };
    });

    // Filter by search
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      fieldList = fieldList.filter(f => 
        f.label.toLowerCase().includes(search) || 
        f.id.toLowerCase().includes(search)
      );
    }

    return fieldList;
  }, [selectedColumn1, fields, lookupFieldsMap, searchTerm]);

  // Column 3 items - parent object fields
  const column3Items = useMemo(() => {
    if (!selectedColumn2?.hasChildren || !selectedColumn2?.parentKey) {
      return [];
    }

    const parentFields = parentFieldGroups[selectedColumn2.parentKey] || [];
    
    return parentFields.map(f => ({
      id: f.api_name || f.name || f.key,
      label: f.label || f.api_name || f.name,
      fullPath: f.name || `${selectedColumn2.parentKey}.${f.api_name || f.name}`,
      hasChildren: false,
      type: f.type,
      options: f.options
    }));
  }, [selectedColumn2, parentFieldGroups]);

  // Open field picker
  const openFieldPicker = () => {
    setSelectedColumn1('current');
    setSelectedColumn2(null);
    setSearchTerm('');
    setShowFieldPicker(true);
  };

  // Handle column selections
  const handleColumn1Select = (item) => {
    setSelectedColumn1(item.id);
    setSelectedColumn2(null);
  };

  const handleColumn2Select = (item) => {
    if (item.hasChildren) {
      setSelectedColumn2(item);
    } else {
      // Direct field selection
      onChange(index, 'field_name', item.id);
      setShowFieldPicker(false);
    }
  };

  const handleColumn3Select = (item) => {
    onChange(index, 'field_name', item.fullPath);
    setShowFieldPicker(false);
  };

  // Column renderer
  const renderColumn = (items, selectedId, onSelect, emptyMsg, showArrow = true) => (
    <div className="flex-1 border-r last:border-r-0 overflow-y-auto h-[280px] min-w-[160px] bg-white">
      {items.length === 0 ? (
        <div className="p-4 text-xs text-gray-400 text-center">{emptyMsg}</div>
      ) : (
        items.map((item, idx) => (
          <button
            key={item.id + idx}
            type="button"
            onClick={() => onSelect(item)}
            className={`w-full text-left px-3 py-1.5 text-sm flex items-center justify-between hover:bg-blue-50 transition-colors border-b border-gray-100 ${
              selectedId === item.id ? 'bg-blue-100 text-blue-700 font-medium' : 'text-gray-700'
            }`}
          >
            <span className="truncate pr-1">{item.label}</span>
            {showArrow && item.hasChildren && (
              <ChevronRight className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
            )}
          </button>
        ))
      )}
    </div>
  );

  return (
    <>
      <div className="flex items-center gap-2 p-3 bg-slate-50 rounded border">
        {/* Field Selector Button */}
        <Button
          type="button"
          variant="outline"
          className="w-56 justify-between text-left font-normal"
          onClick={openFieldPicker}
        >
          <span className={`truncate ${isParentReference ? 'text-indigo-600 font-medium' : ''}`}>
            {getFieldDisplayLabel()}
          </span>
          <ChevronRight className="h-4 w-4 text-gray-400" />
        </Button>

        {/* Operator Selector */}
        <Select value={condition.operator} onValueChange={(val) => onChange(index, 'operator', val)}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Operator..." />
          </SelectTrigger>
          <SelectContent>
            {operators.map(op => (
              <SelectItem key={op.value} value={op.value}>
                <div className="flex flex-col">
                  <span>{op.label}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Value Input */}
        {needsValue && (
          hasOptions ? (
            <Select value={condition.value || ''} onValueChange={(val) => onChange(index, 'value', val)}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Select value..." />
              </SelectTrigger>
              <SelectContent>
                {selectedField.options.map(opt => (
                  <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              placeholder="Value..."
              value={condition.value || ''}
              onChange={(e) => onChange(index, 'value', e.target.value)}
              className="flex-1"
            />
          )
        )}

        {/* Remove Button */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onRemove(index)}
          className="text-red-600 hover:text-red-700"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Salesforce-style Field Picker Dialog */}
      <Dialog open={showFieldPicker} onOpenChange={setShowFieldPicker}>
        <DialogContent className="sm:max-w-xl p-0 gap-0">
          <DialogHeader className="px-4 py-3 border-b bg-white">
            <DialogTitle className="text-base font-medium">Insert Field</DialogTitle>
          </DialogHeader>

          <div className="px-4 py-2 border-b bg-gray-50 text-xs text-gray-600">
            Select a field, then click Insert. Labels followed by a "&gt;" indicate that there are more fields available.
          </div>

          {/* Search */}
          <div className="px-4 py-2 border-b">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <input
                type="text"
                placeholder="Search fields..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 border rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Three-column picker */}
          <div className="flex border-b">
            {renderColumn(column1Items, selectedColumn1, handleColumn1Select, 'No objects')}
            {renderColumn(column2Items, selectedColumn2?.id, handleColumn2Select, selectedColumn1 ? 'No fields' : 'Select object')}
            {renderColumn(column3Items, null, handleColumn3Select, selectedColumn2?.hasChildren ? 'Select a field' : 'Select lookup →', false)}
          </div>

          <div className="px-4 py-3 bg-gray-50 flex justify-center">
            <Button variant="outline" size="sm" onClick={() => setShowFieldPicker(false)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ConditionRow;
