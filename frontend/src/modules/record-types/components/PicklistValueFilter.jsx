/**
 * PicklistValueFilter - Configure which picklist values are available for a record type
 * Similar to Salesforce's picklist value filtering per record type
 */
import React, { useState, useMemo } from 'react';
import { 
  ChevronDown, ChevronUp, Search, Check, X, List, Filter,
  CheckSquare, Square, AlertCircle
} from 'lucide-react';
import { Input } from '../../../components/ui/input';
import { Checkbox } from '../../../components/ui/checkbox';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';

/**
 * Single Picklist Field Configuration
 */
const PicklistFieldConfig = ({ 
  field, 
  selectedValues, 
  onValuesChange,
  isExpanded,
  onToggleExpand
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  
  // Memoize allValues to avoid recreation on every render
  const allValues = useMemo(() => {
    return field.picklist_values || field.options || [];
  }, [field.picklist_values, field.options]);
  
  const totalCount = allValues.length;
  const selectedCount = selectedValues?.length || 0;
  const isAllSelected = selectedCount === 0 || selectedCount === totalCount;
  
  // Filter values by search
  const filteredValues = useMemo(() => {
    if (!searchTerm.trim()) return allValues;
    const term = searchTerm.toLowerCase();
    return allValues.filter(v => {
      const value = typeof v === 'string' ? v : v.value || v.label;
      return value.toLowerCase().includes(term);
    });
  }, [allValues, searchTerm]);

  // Get display value
  const getValueDisplay = (v) => {
    if (typeof v === 'string') return v;
    return v.label || v.value || String(v);
  };

  // Get value key
  const getValueKey = (v) => {
    if (typeof v === 'string') return v;
    return v.value || v.label || String(v);
  };

  // Check if value is selected
  const isValueSelected = (v) => {
    const key = getValueKey(v);
    // If no filter set (empty array), all values are available
    if (!selectedValues || selectedValues.length === 0) return true;
    return selectedValues.includes(key);
  };

  // Toggle single value
  const toggleValue = (v) => {
    const key = getValueKey(v);
    let newValues;
    
    if (!selectedValues || selectedValues.length === 0) {
      // First time filtering - select all except this one
      newValues = allValues.map(getValueKey).filter(k => k !== key);
    } else if (selectedValues.includes(key)) {
      // Remove from selected
      newValues = selectedValues.filter(k => k !== key);
    } else {
      // Add to selected
      newValues = [...selectedValues, key];
    }
    
    // If all are selected, reset to empty (means all available)
    if (newValues.length === totalCount) {
      newValues = [];
    }
    
    onValuesChange(newValues);
  };

  // Select all values
  const selectAll = () => {
    onValuesChange([]); // Empty means all available
  };

  // Deselect all values
  const deselectAll = () => {
    // Select only the first value (can't have zero)
    if (allValues.length > 0) {
      onValuesChange([getValueKey(allValues[0])]);
    }
  };

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden" data-testid={`picklist-filter-${field.key}`}>
      {/* Header */}
      <div 
        className={`flex items-center gap-3 p-3 cursor-pointer transition-colors ${
          isExpanded ? 'bg-blue-50 border-b border-blue-100' : 'bg-white hover:bg-slate-50'
        }`}
        onClick={onToggleExpand}
      >
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
          isExpanded ? 'bg-blue-500' : 'bg-slate-100'
        }`}>
          <List className={`h-4 w-4 ${isExpanded ? 'text-white' : 'text-slate-500'}`} />
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm text-slate-800">{field.label}</span>
            <Badge variant="outline" className="text-[10px] text-slate-500">
              {field.key}
            </Badge>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            {isAllSelected ? (
              <span className="text-xs text-green-600 flex items-center gap-1">
                <Check className="h-3 w-3" />
                All {totalCount} values available
              </span>
            ) : (
              <span className="text-xs text-amber-600 flex items-center gap-1">
                <Filter className="h-3 w-3" />
                {selectedCount} of {totalCount} values selected
              </span>
            )}
          </div>
        </div>
        
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
          {isExpanded ? (
            <ChevronUp className="h-4 w-4 text-slate-400" />
          ) : (
            <ChevronDown className="h-4 w-4 text-slate-400" />
          )}
        </Button>
      </div>
      
      {/* Expanded Content */}
      {isExpanded && (
        <div className="p-3 bg-slate-50/50 space-y-3">
          {/* Search */}
          {allValues.length > 5 && (
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <Input
                type="text"
                placeholder="Search values..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 pr-8 h-8 text-xs"
                data-testid={`search-${field.key}`}
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSearchTerm('');
                  }}
                  className="absolute right-2.5 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}
          
          {/* Quick Actions */}
          <div className="flex items-center gap-2 px-1">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                selectAll();
              }}
              className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
            >
              <CheckSquare className="h-3 w-3" />
              Select All
            </button>
            <span className="text-slate-300">|</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                deselectAll();
              }}
              className="text-xs text-slate-500 hover:text-slate-600 flex items-center gap-1"
            >
              <Square className="h-3 w-3" />
              Clear
            </button>
          </div>
          
          {/* Values List */}
          <div className="max-h-48 overflow-y-auto border rounded-lg bg-white">
            {filteredValues.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-400">
                {searchTerm ? `No values match "${searchTerm}"` : 'No picklist values defined'}
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {filteredValues.map((value, index) => {
                  const key = getValueKey(value);
                  const display = getValueDisplay(value);
                  const isSelected = isValueSelected(value);
                  
                  return (
                    <label
                      key={key}
                      className={`flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors ${
                        isSelected ? 'bg-blue-50/50' : 'hover:bg-slate-50'
                      }`}
                      data-testid={`value-${field.key}-${index}`}
                    >
                      <Checkbox 
                        checked={isSelected}
                        onCheckedChange={() => toggleValue(value)}
                        className="h-4 w-4"
                      />
                      <span className={`text-sm ${isSelected ? 'text-slate-800' : 'text-slate-500'}`}>
                        {display}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
          
          {/* Info */}
          <div className="text-[10px] text-slate-400 px-1">
            {isAllSelected 
              ? 'All values are available for this record type'
              : `Only ${selectedCount} selected values will appear in dropdowns for this record type`
            }
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * Main PicklistValueFilter Component
 */
const PicklistValueFilter = ({ 
  picklistFields = [], 
  filters = {}, 
  onChange,
  className = ''
}) => {
  const [expandedField, setExpandedField] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Filter picklist fields by search
  const filteredFields = useMemo(() => {
    if (!searchTerm.trim()) return picklistFields;
    const term = searchTerm.toLowerCase();
    return picklistFields.filter(f => 
      f.label.toLowerCase().includes(term) ||
      f.key.toLowerCase().includes(term)
    );
  }, [picklistFields, searchTerm]);

  // Handle values change for a field
  const handleValuesChange = (fieldKey, values) => {
    const newFilters = { ...filters };
    if (values.length === 0) {
      // Remove filter if all values selected
      delete newFilters[fieldKey];
    } else {
      newFilters[fieldKey] = values;
    }
    onChange(newFilters);
  };

  // Count filtered fields
  const filteredCount = Object.keys(filters).filter(k => 
    filters[k] && filters[k].length > 0
  ).length;

  if (picklistFields.length === 0) {
    return (
      <div className={`p-4 bg-slate-50 rounded-lg text-center ${className}`}>
        <AlertCircle className="h-5 w-5 text-slate-300 mx-auto mb-2" />
        <p className="text-sm text-slate-500">No picklist fields found</p>
        <p className="text-xs text-slate-400 mt-1">
          Add picklist fields to this object to configure value filters
        </p>
      </div>
    );
  }

  return (
    <div className={`space-y-3 ${className}`} data-testid="picklist-value-filter">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-amber-100 rounded flex items-center justify-center">
            <Filter className="h-3.5 w-3.5 text-amber-600" />
          </div>
          <span className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
            Picklist Value Filters
          </span>
        </div>
        {filteredCount > 0 && (
          <Badge variant="secondary" className="text-[10px] bg-amber-100 text-amber-700">
            {filteredCount} filtered
          </Badge>
        )}
      </div>
      
      {/* Description */}
      <p className="text-xs text-slate-500 leading-relaxed">
        Control which picklist values are available when creating or editing records with this record type.
        By default, all values are available.
      </p>
      
      {/* Search Fields */}
      {picklistFields.length > 3 && (
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <Input
            type="text"
            placeholder="Search picklist fields..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-8 h-8 text-xs"
            data-testid="search-picklist-fields"
          />
        </div>
      )}
      
      {/* Picklist Fields List */}
      <div className="space-y-2">
        {filteredFields.length === 0 ? (
          <div className="p-4 bg-slate-50 rounded-lg text-center">
            <p className="text-xs text-slate-400">
              No picklist fields match &quot;{searchTerm}&quot;
            </p>
          </div>
        ) : (
          filteredFields.map(field => (
            <PicklistFieldConfig
              key={field.key}
              field={field}
              selectedValues={filters[field.key] || []}
              onValuesChange={(values) => handleValuesChange(field.key, values)}
              isExpanded={expandedField === field.key}
              onToggleExpand={() => setExpandedField(
                expandedField === field.key ? null : field.key
              )}
            />
          ))
        )}
      </div>
      
      {/* Help Text */}
      <div className="p-2.5 bg-blue-50 rounded-lg border border-blue-100">
        <p className="text-[11px] text-blue-700">
          <strong>Tip:</strong> If no filter is set for a picklist, all values are available.
          Filters only restrict values for this specific record type.
        </p>
      </div>
    </div>
  );
};

export default PicklistValueFilter;
