import React from 'react';
import { Label } from '../../../../components/ui/label';
import { Checkbox } from '../../../../components/ui/checkbox';
import { Switch } from '../../../../components/ui/switch';

/**
 * Layout Assignment Step - Common step for all field wizards
 * Allows assigning field to page layouts
 */
const LayoutAssignment = ({
  layouts = [],
  selectedLayouts = [],
  setSelectedLayouts,
  addToAllLayouts,
  setAddToAllLayouts,
  loading = false
}) => {
  const handleLayoutToggle = (layoutId) => {
    if (selectedLayouts.includes(layoutId)) {
      setSelectedLayouts(selectedLayouts.filter(id => id !== layoutId));
    } else {
      setSelectedLayouts([...selectedLayouts, layoutId]);
    }
  };

  const handleAddToAll = (checked) => {
    setAddToAllLayouts(checked);
    if (checked) {
      setSelectedLayouts(layouts.map(l => l.id));
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-1">Page Layout Assignment</h3>
        <p className="text-sm text-gray-500">Choose which page layouts should include this field</p>
      </div>

      {/* Add to all toggle */}
      <div className="flex items-center gap-3 p-4 bg-blue-50 rounded-lg">
        <Switch
          id="addToAll"
          checked={addToAllLayouts}
          onCheckedChange={handleAddToAll}
        />
        <div>
          <Label htmlFor="addToAll" className="text-sm font-medium cursor-pointer">
            Add to all page layouts
          </Label>
          <p className="text-xs text-gray-600">
            The field will be automatically added to all existing and future layouts
          </p>
        </div>
      </div>

      {/* Layout list */}
      {!addToAllLayouts && (
        <div className="border rounded-lg overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b">
            <span className="text-sm font-medium text-gray-700">
              Select Layouts ({selectedLayouts.length} of {layouts.length} selected)
            </span>
          </div>
          
          {loading ? (
            <div className="p-8 text-center text-gray-500">
              <div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-2" />
              Loading layouts...
            </div>
          ) : layouts.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              No page layouts found for this object.
              <br />
              <span className="text-xs">Create a layout first in the Lightning Page Builder</span>
            </div>
          ) : (
            <div className="divide-y max-h-64 overflow-y-auto">
              {layouts.map(layout => (
                <label
                  key={layout.id}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer"
                >
                  <Checkbox
                    checked={selectedLayouts.includes(layout.id)}
                    onCheckedChange={() => handleLayoutToggle(layout.id)}
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">{layout.layout_name || layout.name}</p>
                    <p className="text-xs text-gray-500 capitalize">{layout.page_type || 'Record Page'}</p>
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Info box */}
      <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
        <p className="text-sm text-amber-800">
          <strong>Note:</strong> Field-level security settings (controlling which profiles can view/edit this field) 
          can be configured after the field is created.
        </p>
      </div>
    </div>
  );
};

export default LayoutAssignment;
