import React, { useState, useEffect } from 'react';
import { X, GripVertical, Check } from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import axios from 'axios';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

const ComponentPropertyEditor = ({ component, onSave, onClose, availableFields, objectName }) => {
  const [properties, setProperties] = useState({
    label: component?.label || '',
    field_name: component?.field_name || '',
    ...component?.properties || {}
  });
  
  // State for actions selection (when component type is 'actions')
  const [allActions, setAllActions] = useState([]);
  const [loadingActions, setLoadingActions] = useState(false);

  useEffect(() => {
    if (component) {
      setProperties({
        label: component.label || '',
        field_name: component.field_name || '',
        ...component.properties || {}
      });
    }
  }, [component]);

  // Fetch all Record Detail actions when component is 'actions' type
  useEffect(() => {
    const fetchActions = async () => {
      if (component?.type !== 'actions' || !objectName) return;
      
      try {
        setLoadingActions(true);
        const token = localStorage.getItem('token');
        const response = await axios.get(`${API_URL}/api/actions`, {
          headers: { Authorization: `Bearer ${token}` },
          params: { 
            object: objectName.toLowerCase(),
            active_only: false, // Get all actions to allow selecting inactive ones too
            action_context: 'RECORD_DETAIL'
          }
        });
        setAllActions(response.data || []);
      } catch (err) {
        console.error('Error fetching actions:', err);
        setAllActions([]);
      } finally {
        setLoadingActions(false);
      }
    };
    
    fetchActions();
  }, [component?.type, objectName]);

  const handlePropertyChange = (key, value) => {
    setProperties(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const handleSave = () => {
    const { label, field_name, ...otherProps } = properties;
    
    onSave({
      ...component,
      label,
      field_name: field_name || component.field_name,
      properties: otherProps
    });
  };

  if (!component) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">
            Edit Component: {component.label}
          </h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-4 overflow-y-auto max-h-[calc(80vh-140px)]">
          <div className="space-y-4">
            {/* Label */}
            <div>
              <Label htmlFor="label">Display Label</Label>
              <Input
                id="label"
                value={properties.label || ''}
                onChange={(e) => handlePropertyChange('label', e.target.value)}
                placeholder="Enter label"
                className="mt-1"
              />
            </div>

            {/* Field Name (for field components) */}
            {component.type === 'field' && (
              <div>
                <Label htmlFor="field_name">Field Name</Label>
                <select
                  id="field_name"
                  value={properties.field_name || ''}
                  onChange={(e) => handlePropertyChange('field_name', e.target.value)}
                  className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select a field</option>
                  {availableFields.map(field => (
                    <option key={field.name} value={field.name}>
                      {field.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Show Label Toggle */}
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="showLabel"
                checked={properties.showLabel !== false}
                onChange={(e) => handlePropertyChange('showLabel', e.target.checked)}
                className="rounded"
              />
              <Label htmlFor="showLabel">Show field label</Label>
            </div>

            {/* Is Editable Toggle */}
            {component.type === 'field' && (
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="isEditable"
                  checked={properties.isEditable !== false}
                  onChange={(e) => handlePropertyChange('isEditable', e.target.checked)}
                  className="rounded"
                />
                <Label htmlFor="isEditable">Allow inline editing</Label>
              </div>
            )}

            {/* Custom HTML Content */}
            {component.type === 'custom_html' && (
              <div>
                <Label htmlFor="content">HTML Content</Label>
                <textarea
                  id="content"
                  value={properties.content || ''}
                  onChange={(e) => handlePropertyChange('content', e.target.value)}
                  placeholder="Enter HTML content"
                  className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[100px] font-mono text-sm"
                />
              </div>
            )}

            {/* Related Object (for related lists) */}
            {component.type === 'related_list' && (
              <div>
                <Label htmlFor="relatedObject">Related Object</Label>
                <select
                  id="relatedObject"
                  value={properties.relatedObject || ''}
                  onChange={(e) => handlePropertyChange('relatedObject', e.target.value)}
                  className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="task">Tasks</option>
                  <option value="event">Events</option>
                  <option value="note">Notes</option>
                  <option value="file">Files</option>
                </select>
              </div>
            )}

            {/* Show New Button */}
            {component.type === 'related_list' && (
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="showNewButton"
                  checked={properties.showNewButton !== false}
                  onChange={(e) => handlePropertyChange('showNewButton', e.target.checked)}
                  className="rounded"
                />
                <Label htmlFor="showNewButton">Show "New" button</Label>
              </div>
            )}

            {/* Conditional Visibility */}
            <div className="pt-4 border-t border-slate-200">
              <h3 className="text-sm font-semibold text-slate-700 mb-3">Conditional Visibility (Optional)</h3>
              
              <div className="space-y-3">
                <div>
                  <Label htmlFor="visibilityField">Show only when field</Label>
                  <select
                    id="visibilityField"
                    value={properties.visibilityField || ''}
                    onChange={(e) => handlePropertyChange('visibilityField', e.target.value)}
                    className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Always show</option>
                    {availableFields.map(field => (
                      <option key={field.name} value={field.name}>
                        {field.label}
                      </option>
                    ))}
                  </select>
                </div>

                {properties.visibilityField && (
                  <>
                    <div>
                      <Label htmlFor="visibilityOperator">Operator</Label>
                      <select
                        id="visibilityOperator"
                        value={properties.visibilityOperator || 'equals'}
                        onChange={(e) => handlePropertyChange('visibilityOperator', e.target.value)}
                        className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-md"
                      >
                        <option value="equals">Equals</option>
                        <option value="not_equals">Not Equals</option>
                        <option value="contains">Contains</option>
                        <option value="is_empty">Is Empty</option>
                        <option value="is_not_empty">Is Not Empty</option>
                      </select>
                    </div>

                    {properties.visibilityOperator !== 'is_empty' && properties.visibilityOperator !== 'is_not_empty' && (
                      <div>
                        <Label htmlFor="visibilityValue">Value</Label>
                        <Input
                          id="visibilityValue"
                          value={properties.visibilityValue || ''}
                          onChange={(e) => handlePropertyChange('visibilityValue', e.target.value)}
                          placeholder="Enter value"
                          className="mt-1"
                        />
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Actions Selection (for actions component) */}
            {component.type === 'actions' && (
              <div className="pt-4 border-t border-slate-200">
                <h3 className="text-sm font-semibold text-slate-700 mb-3">Select Actions to Display</h3>
                <p className="text-xs text-slate-500 mb-3">
                  Choose which actions to show and their order. Unselected actions will be hidden.
                </p>
                
                {loadingActions ? (
                  <div className="text-sm text-slate-400 py-2">Loading actions...</div>
                ) : allActions.length === 0 ? (
                  <div className="text-sm text-slate-400 py-2">No Record Detail actions found</div>
                ) : (
                  <div className="space-y-2">
                    {/* Max Visible Actions */}
                    <div className="mb-4">
                      <Label htmlFor="maxVisible">Max Visible Buttons</Label>
                      <Input
                        id="maxVisible"
                        type="number"
                        min="1"
                        max="10"
                        value={properties.maxVisible || 3}
                        onChange={(e) => handlePropertyChange('maxVisible', parseInt(e.target.value) || 3)}
                        className="mt-1 w-24"
                      />
                      <p className="text-xs text-slate-500 mt-1">
                        Additional actions will appear in overflow menu
                      </p>
                    </div>
                    
                    {/* Actions List */}
                    <div className="border rounded-lg divide-y max-h-64 overflow-y-auto">
                      {allActions.map((action) => {
                        const selectedActions = properties.selectedActions || [];
                        const isSelected = selectedActions.includes(action.id);
                        const IconComponent = LucideIcons[action.icon] || LucideIcons.Zap;
                        
                        return (
                          <div 
                            key={action.id}
                            className={`flex items-center gap-3 p-2 cursor-pointer hover:bg-slate-50 ${
                              isSelected ? 'bg-blue-50' : ''
                            }`}
                            onClick={() => {
                              const current = properties.selectedActions || [];
                              const updated = isSelected 
                                ? current.filter(id => id !== action.id)
                                : [...current, action.id];
                              handlePropertyChange('selectedActions', updated);
                            }}
                          >
                            <div className={`w-5 h-5 rounded border flex items-center justify-center ${
                              isSelected ? 'bg-blue-600 border-blue-600' : 'border-slate-300'
                            }`}>
                              {isSelected && <Check className="h-3 w-3 text-white" />}
                            </div>
                            <IconComponent className="h-4 w-4 text-slate-500" />
                            <div className="flex-1">
                              <span className="text-sm font-medium text-slate-700">{action.label}</span>
                              <span className="text-xs text-slate-400 ml-2">({action.type})</span>
                            </div>
                            {!action.is_active && (
                              <span className="text-xs px-1.5 py-0.5 bg-yellow-100 text-yellow-700 rounded">
                                Inactive
                              </span>
                            )}
                            {action.is_system && (
                              <span className="text-xs px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded">
                                System
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    
                    {/* Selection Summary */}
                    <p className="text-xs text-slate-500 mt-2">
                      {(properties.selectedActions || []).length === 0 
                        ? 'No actions selected - all active actions will be shown by default'
                        : `${(properties.selectedActions || []).length} action(s) selected`
                      }
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-end space-x-3">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave}>
            Save Changes
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ComponentPropertyEditor;
