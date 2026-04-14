/**
 * Object Selector Component
 * Select object for field permissions
 */
import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';
import { Database } from 'lucide-react';

const ObjectSelector = ({ value, onChange, objects }) => {
  const standardObjects = objects || [
    { name: 'lead', label: 'Lead' },
    { name: 'contact', label: 'Contact' },
    { name: 'account', label: 'Account' },
    { name: 'opportunity', label: 'Opportunity' },
    { name: 'task', label: 'Task' },
    { name: 'event', label: 'Event' }
  ];

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-slate-700 flex items-center gap-2">
        <Database className="h-4 w-4" />
        Select Object
      </label>
      <Select value={value || ''} onValueChange={onChange}>
        <SelectTrigger className="w-64">
          <SelectValue placeholder="Choose object..." />
        </SelectTrigger>
        <SelectContent>
          {standardObjects.map((obj) => (
            <SelectItem key={obj.name} value={obj.name}>
              {obj.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};

export default ObjectSelector;