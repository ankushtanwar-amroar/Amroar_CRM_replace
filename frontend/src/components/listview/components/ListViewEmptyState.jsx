/**
 * ListViewEmptyState - Empty state display when no records
 */
import React from 'react';

// UI Components
import { Button } from '../../ui/button';

// Icons
import { Plus, UserPlus } from 'lucide-react';

// Import Record Dialog - Using wrapper for specialized form routing
import CreateRecordWrapper from '../../records/CreateRecordWrapper';

const ListViewEmptyState = ({ object, onRefresh }) => {
  return (
    <div className="flex flex-col items-center justify-center h-64 text-slate-500">
      <UserPlus className="h-12 w-12 mb-4 text-slate-400" />
      <p className="text-lg font-medium mb-2">No {object.object_plural.toLowerCase()} found</p>
      <p className="text-sm mb-4">Get started by creating your first {object.object_label.toLowerCase()}</p>
      <CreateRecordWrapper
        key={object?.object_name}
        object={object}
        onSuccess={onRefresh}
        trigger={
          <Button data-testid="create-first-record" className="bg-indigo-600 hover:bg-indigo-700">
            <Plus className="h-4 w-4 mr-2" />
            Create {object.object_label}
          </Button>
        }
      />
    </div>
  );
};

export default ListViewEmptyState;
