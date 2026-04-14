/**
 * Basic Rule Builder Component
 * Visual condition builder for field behavior rules
 */
import React, { useState, useEffect } from 'react';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../../components/ui/select';
import { Input } from '../../../components/ui/input';
import { Button } from '../../../components/ui/button';
import { Trash2 } from 'lucide-react';

const OPERATORS = [
  { value: '=', label: 'equals' },
  { value: '!=', label: 'not equal to' },
  { value: '>', label: 'greater than' },
  { value: '<', label: 'less than' },
  { value: '>=', label: 'greater or equal' },
  { value: '<=', label: 'less or equal' },
  { value: 'contains', label: 'contains' },
  { value: 'not_contains', label: 'does not contain' },
  { value: 'starts_with', label: 'starts with' },
  { value: 'ends_with', label: 'ends with' },
  { value: 'is_null', label: 'is blank' },
  { value: 'is_not_null', label: 'is not blank' },
  { value: 'includes', label: 'includes (multi-select)' }
];

const BasicRuleBuilder = ({ 
  condition, 
  onChange, 
  onRemove,
  availableFields = [],
  fieldType = 'text'
}) => {
  const [localCondition, setLocalCondition] = useState(condition || {
    left: '',
    operator: '=',
    right: ''
  });

  useEffect(() => {
    if (condition) {
      setLocalCondition(condition);
    }
  }, [condition]);

  const handleChange = (key, value) => {
    const updated = { ...localCondition, [key]: value };
    setLocalCondition(updated);
    onChange(updated);
  };

  // Get field info for the selected left field
  const selectedField = availableFields.find(f => 
    f.fullPath === localCondition.left || f.apiName === localCondition.left
  );
  const selectedFieldType = selectedField?.fieldType || 'text';

  // Get operators based on field type
  const getOperatorsForType = (type) => {
    switch (type) {
      case 'number':
      case 'currency':
      case 'percent':
        return OPERATORS;
      case 'boolean':
      case 'checkbox':
        return OPERATORS.filter(op => ['=', '!='].includes(op.value));
      case 'select':
      case 'picklist':
        return OPERATORS.filter(op => 
          ['=', '!=', 'is_null', 'is_not_null'].includes(op.value)
        );
      case 'multiselect':
        return OPERATORS.filter(op => 
          ['includes', 'is_null', 'is_not_null'].includes(op.value)
        );
      default:
        return OPERATORS;
    }
  };

  const operators = getOperatorsForType(selectedFieldType);
  const showValueInput = !['is_null', 'is_not_null'].includes(localCondition.operator);

  // Group fields by object
  const groupedFields = availableFields.reduce((acc, field) => {
    const group = field.isParentField ? field.parentLookupField : 'Current Object';
    if (!acc[group]) acc[group] = [];
    acc[group].push(field);
    return acc;
  }, {});

  // Get picklist options if field is a select type
  const getPicklistOptions = () => {
    if (!selectedField) return [];
    return selectedField.options || [];
  };

  return (
    <div className="space-y-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
      {/* Field Selection */}
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Field</label>
        <Select
          value={localCondition.left}
          onValueChange={(value) => handleChange('left', value)}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="Select field..." />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(groupedFields).map(([group, fields]) => (
              <React.Fragment key={group}>
                <div className="px-2 py-1 text-[10px] font-semibold text-slate-500 bg-slate-100 uppercase">
                  {group}
                </div>
                {fields.map(field => (
                  <SelectItem 
                    key={field.fullPath} 
                    value={field.fullPath}
                    className="text-xs"
                  >
                    {field.isParentField ? field.fullPath : field.label}
                    <span className="ml-2 text-slate-400 text-[10px]">
                      ({field.fieldType})
                    </span>
                  </SelectItem>
                ))}
              </React.Fragment>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Operator Selection */}
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Operator</label>
        <Select
          value={localCondition.operator}
          onValueChange={(value) => handleChange('operator', value)}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {operators.map(op => (
              <SelectItem key={op.value} value={op.value} className="text-xs">
                {op.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Value Input */}
      {showValueInput && (
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Value</label>
          {selectedFieldType === 'select' || selectedFieldType === 'picklist' ? (
            <Select
              value={localCondition.right}
              onValueChange={(value) => handleChange('right', value)}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Select value..." />
              </SelectTrigger>
              <SelectContent>
                {getPicklistOptions().map(opt => (
                  <SelectItem key={opt.value || opt} value={opt.value || opt} className="text-xs">
                    {opt.label || opt}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : selectedFieldType === 'boolean' || selectedFieldType === 'checkbox' ? (
            <Select
              value={String(localCondition.right)}
              onValueChange={(value) => handleChange('right', value === 'true')}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="true" className="text-xs">True</SelectItem>
                <SelectItem value="false" className="text-xs">False</SelectItem>
              </SelectContent>
            </Select>
          ) : (
            <Input
              type={selectedFieldType === 'number' ? 'number' : 'text'}
              value={localCondition.right || ''}
              onChange={(e) => handleChange('right', e.target.value)}
              placeholder="Enter value..."
              className="h-8 text-xs"
            />
          )}
        </div>
      )}

      {/* Remove Button */}
      {onRemove && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onRemove}
          className="w-full h-7 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
        >
          <Trash2 className="h-3 w-3 mr-1" />
          Remove Condition
        </Button>
      )}
    </div>
  );
};

export default BasicRuleBuilder;
