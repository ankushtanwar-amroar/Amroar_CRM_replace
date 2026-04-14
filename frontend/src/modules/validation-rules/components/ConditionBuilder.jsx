/**
 * Condition Builder Component
 * Build multiple conditions with AND/OR logic
 * Supports parent lookup fields
 */
import React from 'react';
import { Button } from '../../../components/ui/button';
import { Plus } from 'lucide-react';
import ConditionRow from './ConditionRow';

const ConditionBuilder = ({ 
  conditions, 
  logicOperator, 
  fields, 
  parentFieldGroups = {}, 
  onChange, 
  onLogicChange, 
  onAddCondition, 
  onRemoveCondition,
  objectName = '',
  objectLabel = ''
}) => {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-slate-900">Conditions</h3>
        {conditions.length > 1 && (
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={logicOperator === 'AND' ? 'default' : 'outline'}
              onClick={() => onLogicChange('AND')}
            >
              AND
            </Button>
            <Button
              size="sm"
              variant={logicOperator === 'OR' ? 'default' : 'outline'}
              onClick={() => onLogicChange('OR')}
            >
              OR
            </Button>
          </div>
        )}
      </div>

      {conditions.map((condition, index) => (
        <div key={index}>
          <ConditionRow
            condition={condition}
            index={index}
            fields={fields}
            parentFieldGroups={parentFieldGroups}
            onChange={onChange}
            onRemove={onRemoveCondition}
            objectName={objectName}
            objectLabel={objectLabel}
          />
          {index < conditions.length - 1 && (
            <div className="text-center py-2 text-sm font-medium text-slate-600">
              {logicOperator}
            </div>
          )}
        </div>
      ))}

      <Button
        variant="outline"
        size="sm"
        onClick={onAddCondition}
        className="w-full"
      >
        <Plus className="h-4 w-4 mr-2" />
        Add Condition
      </Button>
    </div>
  );
};

export default ConditionBuilder;