import React from 'react';
import { Switch } from '../../../components/ui/switch';
import { Badge } from '../../../components/ui/badge';

const FieldVisibilityRow = ({ field, isVisible, onToggle, disabled }) => {
  return (
    <div className="flex items-center justify-between p-3 border-b hover:bg-slate-50">
      <div className="flex-1">
        <div className="font-medium text-sm">{field.label}</div>
        <div className="text-xs text-slate-500">{field.name}</div>
      </div>
      {field.required && (
        <Badge variant="outline" className="mr-3 bg-amber-50 text-amber-700 border-amber-200">
          Required
        </Badge>
      )}
      <div className="flex items-center space-x-2">
        <span className="text-sm text-slate-600 min-w-[60px]">
          {isVisible ? 'Visible' : 'Hidden'}
        </span>
        <Switch
          checked={isVisible}
          onCheckedChange={() => onToggle(field.name)}
          disabled={disabled || field.required}
        />
      </div>
    </div>
  );
};

export default FieldVisibilityRow;