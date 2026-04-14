/**
 * Criteria Builder Component
 * Build field-based criteria for sharing rules
 */
import React from 'react';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';
import { Plus, X, Filter } from 'lucide-react';

const OPERATORS = [
  { value: 'equals', label: 'Equals' },
  { value: 'not_equals', label: 'Does Not Equal' },
  { value: 'contains', label: 'Contains' },
  { value: 'starts_with', label: 'Starts With' },
  { value: 'ends_with', label: 'Ends With' },
  { value: 'greater_than', label: 'Greater Than' },
  { value: 'less_than', label: 'Less Than' },
  { value: 'greater_or_equal', label: 'Greater or Equal' },
  { value: 'less_or_equal', label: 'Less or Equal' },
  { value: 'is_empty', label: 'Is Empty' },
  { value: 'is_not_empty', label: 'Is Not Empty' },
];

const CriteriaBuilder = ({ criteria, onChange, fields, disabled }) => {
  const addCriterion = () => {
    onChange([...criteria, { field: '', operator: 'equals', value: '' }]);
  };

  const removeCriterion = (index) => {
    const newCriteria = criteria.filter((_, i) => i !== index);
    onChange(newCriteria);
  };

  const updateCriterion = (index, key, value) => {
    const newCriteria = [...criteria];
    newCriteria[index] = { ...newCriteria[index], [key]: value };
    onChange(newCriteria);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2 text-sm font-medium text-slate-700">
          <Filter className="h-4 w-4" />
          <span>Criteria</span>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addCriterion}
          disabled={disabled}
        >
          <Plus className="h-3 w-3 mr-1" />
          Add Condition
        </Button>
      </div>

      {criteria.length === 0 ? (
        <div className="text-center py-6 bg-slate-50 rounded-lg border border-dashed">
          <p className="text-sm text-slate-500">No criteria defined</p>
          <p className="text-xs text-slate-400 mt-1">Click "Add Condition" to add filter criteria</p>
        </div>
      ) : (
        <div className="space-y-2">
          {criteria.map((criterion, index) => (
            <div key={index} className="flex items-center space-x-2 p-3 bg-slate-50 rounded-lg">
              {index > 0 && (
                <span className="text-xs font-medium text-slate-500 w-10">AND</span>
              )}
              
              {/* Field Selector */}
              <Select
                value={criterion.field}
                onValueChange={(value) => updateCriterion(index, 'field', value)}
                disabled={disabled}
              >
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Field" />
                </SelectTrigger>
                <SelectContent>
                  {fields.map((field) => (
                    <SelectItem key={field.name} value={field.name}>
                      {field.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Operator Selector */}
              <Select
                value={criterion.operator}
                onValueChange={(value) => updateCriterion(index, 'operator', value)}
                disabled={disabled}
              >
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Operator" />
                </SelectTrigger>
                <SelectContent>
                  {OPERATORS.map((op) => (
                    <SelectItem key={op.value} value={op.value}>
                      {op.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Value Input (hide for is_empty/is_not_empty) */}
              {!['is_empty', 'is_not_empty'].includes(criterion.operator) && (
                <Input
                  value={criterion.value}
                  onChange={(e) => updateCriterion(index, 'value', e.target.value)}
                  placeholder="Value"
                  className="flex-1"
                  disabled={disabled}
                />
              )}

              {/* Remove Button */}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 text-red-500 hover:bg-red-50"
                onClick={() => removeCriterion(index)}
                disabled={disabled}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default CriteriaBuilder;
