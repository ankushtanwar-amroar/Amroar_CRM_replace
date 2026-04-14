/**
 * ListViewFilters - Compact advanced filters panel
 */
import React from 'react';

// UI Components
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';

const ListViewFilters = ({
  object,
  filterField,
  filterValue,
  filterCondition,
  onFilterFieldChange,
  onFilterValueChange,
  onFilterConditionChange,
  onApply,
  onClear,
}) => {
  return (
    <div className="mt-2 p-3 bg-slate-50 rounded-lg border">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
        <div>
          <Label className="text-xs font-medium">Field</Label>
          <Select value={filterField || undefined} onValueChange={onFilterFieldChange}>
            <SelectTrigger className="h-7 text-xs mt-1">
              <SelectValue placeholder="Select field" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(object.fields).map(([fieldKey, field]) => (
                <SelectItem key={fieldKey} value={fieldKey} className="text-xs">
                  {field.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs font-medium">Condition</Label>
          <Select value={filterCondition} onValueChange={onFilterConditionChange}>
            <SelectTrigger className="h-7 text-xs mt-1">
              <SelectValue placeholder="Select condition" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="equals" className="text-xs">Equals</SelectItem>
              <SelectItem value="contains" className="text-xs">Contains</SelectItem>
              <SelectItem value="starts_with" className="text-xs">Starts with</SelectItem>
              <SelectItem value="not_empty" className="text-xs">Is not empty</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs font-medium">Value</Label>
          <Input
            placeholder="Enter value"
            className="h-7 text-xs mt-1"
            value={filterValue}
            onChange={(e) => onFilterValueChange(e.target.value)}
            disabled={filterCondition === 'not_empty'}
          />
        </div>
        <div className="flex justify-end space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onClear}
            className="h-7 px-2 text-xs"
          >
            Clear
          </Button>
          <Button
            size="sm"
            onClick={onApply}
            disabled={!filterField}
            className="h-7 px-2 text-xs"
          >
            Apply
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ListViewFilters;
