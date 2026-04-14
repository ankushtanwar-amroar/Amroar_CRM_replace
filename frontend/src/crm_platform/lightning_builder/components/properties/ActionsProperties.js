/**
 * ActionsProperties
 * Property editor for the Actions component in Lightning App Builder
 * 
 * Properties:
 * - Select Actions: Choose which actions appear on the record page
 * - Format: Button, Dropdown
 * - Max Visible: Number of actions before overflow
 */
import React, { useState, useEffect } from 'react';
import { Label } from '../../../../components/ui/label';
import { Input } from '../../../../components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../../components/ui/select';
import { Check, Search, Loader2, Zap, FileText, Trash2, Globe, Plus } from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import axios from 'axios';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

const ActionsProperties = ({ component, onUpdate, objectName }) => {
  const config = component.config || {};
  
  // State for fetching actions
  const [allActions, setAllActions] = useState([]);
  const [loadingActions, setLoadingActions] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch actions when objectName changes
  useEffect(() => {
    const fetchActions = async () => {
      if (!objectName) {
        setAllActions([]);
        return;
      }
      
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
  }, [objectName]);

  const updateConfig = (updates) => {
    onUpdate({
      ...component,
      config: { ...config, ...updates }
    });
  };

  // Get icon component for action
  const getActionIcon = (action) => {
    if (action.icon && LucideIcons[action.icon]) {
      return LucideIcons[action.icon];
    }
    // Default icons based on action type
    if (action.type === 'SYSTEM_CREATE' || action.type === 'CREATE_RECORD') return Plus;
    if (action.type === 'SYSTEM_EDIT') return FileText;
    if (action.type === 'SYSTEM_DELETE') return Trash2;
    if (action.type === 'OPEN_URL') return Globe;
    if (action.type === 'RUN_FLOW') return Zap;
    return Zap;
  };

  // Handle action selection toggle
  const toggleAction = (actionId) => {
    const selectedActions = config.selectedActions || [];
    const isSelected = selectedActions.includes(actionId);
    
    const updated = isSelected 
      ? selectedActions.filter(id => id !== actionId)
      : [...selectedActions, actionId];
    
    updateConfig({ selectedActions: updated });
  };

  // Filter actions by search
  const filteredActions = allActions.filter(action =>
    action.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
    action.type.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const selectedActions = config.selectedActions || [];

  return (
    <div className="space-y-4">
      {/* Info Box */}
      <div className="p-3 bg-blue-50 rounded-lg border border-blue-100">
        <p className="text-xs text-blue-700 font-medium mb-1">Actions Configuration</p>
        <p className="text-[10px] text-blue-600">
          Select which actions appear on the record page. Unselected actions will be hidden from users.
        </p>
      </div>

      {/* Select Actions Section */}
      <div>
        <Label className="text-xs font-semibold text-slate-700 uppercase mb-2 block">
          Select Actions to Display
        </Label>
        
        {/* Search */}
        <div className="relative mb-2">
          <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <Input
            placeholder="Search actions..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 pl-8 text-sm"
          />
        </div>

        {/* Actions List */}
        {loadingActions ? (
          <div className="flex items-center justify-center py-4 border rounded-lg bg-slate-50">
            <Loader2 className="h-4 w-4 animate-spin text-slate-400 mr-2" />
            <span className="text-sm text-slate-500">Loading actions...</span>
          </div>
        ) : allActions.length === 0 ? (
          <div className="py-4 border rounded-lg bg-slate-50 text-center">
            <Zap className="h-6 w-6 mx-auto mb-2 text-slate-300" />
            <p className="text-sm text-slate-500">No Record Detail actions found</p>
            <p className="text-xs text-slate-400 mt-1">
              Create actions in Object Manager → Actions
            </p>
          </div>
        ) : (
          <div className="border rounded-lg divide-y max-h-48 overflow-y-auto">
            {filteredActions.map((action) => {
              const isSelected = selectedActions.includes(action.id);
              const IconComponent = getActionIcon(action);
              
              return (
                <div 
                  key={action.id}
                  onClick={() => toggleAction(action.id)}
                  className={`flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-slate-50 transition-colors ${
                    isSelected ? 'bg-blue-50' : ''
                  }`}
                >
                  {/* Checkbox */}
                  <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                    isSelected ? 'bg-blue-600 border-blue-600' : 'border-slate-300'
                  }`}>
                    {isSelected && <Check className="h-3 w-3 text-white" />}
                  </div>
                  
                  {/* Icon */}
                  <IconComponent className="h-4 w-4 text-slate-500 flex-shrink-0" />
                  
                  {/* Label and Type */}
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-slate-700 block truncate">
                      {action.label}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {action.type.replace('SYSTEM_', '').replace('_', ' ')}
                    </span>
                  </div>
                  
                  {/* Status badges */}
                  <div className="flex gap-1 flex-shrink-0">
                    {!action.is_active && (
                      <span className="text-[9px] px-1.5 py-0.5 bg-yellow-100 text-yellow-700 rounded">
                        Inactive
                      </span>
                    )}
                    {action.is_system && (
                      <span className="text-[9px] px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded">
                        System
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
            
            {filteredActions.length === 0 && searchQuery && (
              <div className="py-3 text-center text-sm text-slate-400">
                No actions match "{searchQuery}"
              </div>
            )}
          </div>
        )}
        
        {/* Selection Summary */}
        <p className="text-[10px] text-slate-500 mt-2">
          {selectedActions.length === 0 
            ? 'No actions selected — all active actions will be shown by default'
            : `${selectedActions.length} action(s) selected`
          }
        </p>
      </div>

      {/* Display Format */}
      <div className="pt-3 border-t">
        <Label htmlFor="format" className="text-xs font-semibold text-slate-700 uppercase mb-2 block">
          Display Format
        </Label>
        <Select
          value={config.format || 'button'}
          onValueChange={(val) => updateConfig({ format: val })}
        >
          <SelectTrigger id="format" className="h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="button">Button</SelectItem>
            <SelectItem value="dropdown">Dropdown Menu</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-[10px] text-slate-500 mt-1">
          {config.format === 'dropdown' 
            ? 'All actions shown in a single dropdown menu'
            : 'Actions shown as individual buttons'}
        </p>
      </div>

      {/* Max Visible (only for button format) */}
      {(!config.format || config.format === 'button') && (
        <div className="pt-3 border-t">
          <Label htmlFor="maxVisible" className="text-xs font-semibold text-slate-700 uppercase mb-2 block">
            Max Visible Actions
          </Label>
          <Input
            id="maxVisible"
            type="number"
            min="1"
            max="10"
            value={config.maxVisible || 3}
            onChange={(e) => updateConfig({ maxVisible: parseInt(e.target.value) || 3 })}
            className="h-9 w-24"
          />
          <p className="text-[10px] text-slate-500 mt-1">
            Actions beyond this number appear in an overflow menu
          </p>
        </div>
      )}
    </div>
  );
};

export default ActionsProperties;
