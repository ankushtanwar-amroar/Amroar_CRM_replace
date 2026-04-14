import React, { useState } from 'react';
import { Plus, Trash2, ChevronDown } from 'lucide-react';
import { Button } from '../../../../components/ui/button';
import { Input } from '../../../../components/ui/input';
import { Label } from '../../../../components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../../components/ui/select';
import { FILTER_OPERATORS } from '../../utils/fieldUtils';

/**
 * Filter Rule Builder Component
 * Used for Lookup Filter and Rollup Filter criteria
 */
const FilterRuleBuilder = ({ 
  rules = [], 
  onChange, 
  availableFields = [],
  allowSourceField = false,  // For lookup filters - allows selecting current record field
  sourceFields = [],
  logic = 'AND',
  onLogicChange
}) => {
  const [expanded, setExpanded] = useState(true);

  const addRule = () => {
    const newRule = {
      id: Date.now().toString(),
      target_field: '',
      operator: '=',
      value_type: 'static',
      static_value: '',
      source_field: ''
    };
    onChange([...rules, newRule]);
  };

  const updateRule = (index, field, value) => {
    const updated = [...rules];
    updated[index] = { ...updated[index], [field]: value };
    onChange(updated);
  };

  const removeRule = (index) => {
    onChange(rules.filter((_, i) => i !== index));
  };

  const getFilteredOperators = (fieldType) => {
    // Filter operators based on field type
    if (fieldType === 'number' || fieldType === 'currency' || fieldType === 'date') {
      return FILTER_OPERATORS;
    }
    // Text fields - exclude numeric comparisons
    return FILTER_OPERATORS.filter(op => 
      !['>', '<', '>=', '<='].includes(op.value)
    );
  };

  return (
    <div className="border rounded-lg overflow-hidden">
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <span className="font-medium text-sm text-gray-700">
          Filter Rules ({rules.length})
        </span>
        <ChevronDown className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>

      {expanded && (
        <div className="p-4 space-y-4">
          {/* Logic selector */}
          {rules.length > 1 && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-gray-600">Match</span>
              <Select value={logic} onValueChange={onLogicChange}>
                <SelectTrigger className="w-24 h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="AND">ALL</SelectItem>
                  <SelectItem value="OR">ANY</SelectItem>
                </SelectContent>
              </Select>
              <span className="text-gray-600">of the following rules</span>
            </div>
          )}

          {/* Rules list */}
          <div className="space-y-3">
            {rules.map((rule, index) => (
              <div key={rule.id} className="flex items-start gap-2 p-3 bg-gray-50 rounded-lg">
                <div className="flex-1 grid grid-cols-12 gap-2">
                  {/* Field selector */}
                  <div className="col-span-3">
                    <Label className="text-xs text-gray-500 mb-1">Field</Label>
                    <Select 
                      value={rule.target_field} 
                      onValueChange={(v) => updateRule(index, 'target_field', v)}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Select field" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableFields.map(field => (
                          <SelectItem key={field.api_name} value={field.api_name}>
                            {field.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Operator selector */}
                  <div className="col-span-3">
                    <Label className="text-xs text-gray-500 mb-1">Operator</Label>
                    <Select 
                      value={rule.operator} 
                      onValueChange={(v) => updateRule(index, 'operator', v)}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FILTER_OPERATORS.map(op => (
                          <SelectItem key={op.value} value={op.value}>
                            {op.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Value type selector (only for lookup filters) */}
                  {allowSourceField && (
                    <div className="col-span-2">
                      <Label className="text-xs text-gray-500 mb-1">Value From</Label>
                      <Select 
                        value={rule.value_type} 
                        onValueChange={(v) => updateRule(index, 'value_type', v)}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="static">Static Value</SelectItem>
                          <SelectItem value="current_record">Current Record</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* Value input */}
                  <div className={allowSourceField ? 'col-span-3' : 'col-span-5'}>
                    <Label className="text-xs text-gray-500 mb-1">Value</Label>
                    {rule.value_type === 'current_record' && allowSourceField ? (
                      <Select 
                        value={rule.source_field} 
                        onValueChange={(v) => updateRule(index, 'source_field', v)}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="Select field" />
                        </SelectTrigger>
                        <SelectContent>
                          {sourceFields.map(field => (
                            <SelectItem key={field.api_name} value={field.api_name}>
                              {field.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        value={rule.static_value || ''}
                        onChange={(e) => updateRule(index, 'static_value', e.target.value)}
                        placeholder="Enter value"
                        className="h-9"
                        disabled={['is_null', 'is_not_null'].includes(rule.operator)}
                      />
                    )}
                  </div>
                </div>

                {/* Remove button */}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeRule(index)}
                  className="h-9 w-9 p-0 text-red-500 hover:text-red-700 hover:bg-red-50 mt-5"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>

          {/* Add rule button */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addRule}
            className="w-full"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Filter Rule
          </Button>
        </div>
      )}
    </div>
  );
};

export default FilterRuleBuilder;
