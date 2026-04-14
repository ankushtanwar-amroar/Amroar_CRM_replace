/**
 * PathPropertyPanel - Configuration panel for Path component in Page Builder
 * Allows selecting which picklist field drives the path stages
 */
import React, { useState, useEffect } from 'react';
import { 
  Target, Search, Loader2, Info, CheckCircle, Settings
} from 'lucide-react';
import { Input } from '../../../components/ui/input';
import { Switch } from '../../../components/ui/switch';
import { fetchObjectPicklistFields } from '../services/pathService';

const PathPropertyPanel = ({
  component,
  onUpdate,
  objectName,
  className = '',
}) => {
  const [picklistFields, setPicklistFields] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Get current config
  const config = component.config || {};
  
  // Load picklist fields from backend
  useEffect(() => {
    const loadFields = async () => {
      if (!objectName) return;
      
      setLoading(true);
      try {
        const fields = await fetchObjectPicklistFields(objectName);
        setPicklistFields(fields);
      } catch (err) {
        console.error('Error loading picklist fields:', err);
      } finally {
        setLoading(false);
      }
    };
    
    loadFields();
  }, [objectName]);
  
  // Update config helper
  const updateConfig = (updates) => {
    onUpdate({
      ...component,
      config: {
        ...config,
        ...updates,
      },
    });
  };
  
  // Filter fields by search
  const filteredFields = picklistFields.filter(field =>
    field.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
    field.apiName.toLowerCase().includes(searchTerm.toLowerCase())
  );
  
  // Get selected field info
  const selectedField = picklistFields.find(f => f.apiName === config.picklistField);
  
  return (
    <div className={`space-y-4 ${className}`}>
      {/* Info Box */}
      <div className="p-3 bg-blue-50 rounded-lg flex items-start gap-2">
        <Info className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
        <div className="text-xs text-blue-700">
          <p className="font-medium">Path Component</p>
          <p className="mt-1 text-blue-600">
            Shows progress through stages based on a picklist field. Users can advance through stages using the Mark Complete button.
          </p>
        </div>
      </div>
      
      {/* Picklist Field Selection */}
      <div className="border-t pt-4">
        <div className="flex items-center gap-2 mb-3">
          <Target className="h-4 w-4 text-slate-600" />
          <span className="text-xs font-semibold text-slate-700 uppercase">Select Picklist Field</span>
        </div>
        <p className="text-[10px] text-slate-500 mb-3">
          Choose which picklist field drives the path stages
        </p>
        
        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
            <span className="ml-2 text-xs text-slate-500">Loading fields...</span>
          </div>
        ) : picklistFields.length === 0 ? (
          <div className="p-4 bg-amber-50 rounded-lg text-center">
            <p className="text-xs text-amber-700">No picklist fields found</p>
            <p className="text-[10px] text-amber-600 mt-1">
              Add picklist fields to this object to use the Path component
            </p>
          </div>
        ) : (
          <>
            {/* Search */}
            <div className="relative mb-3">
              <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-3 w-3 text-slate-400" />
              <Input
                type="text"
                placeholder="Search picklist fields..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-7 h-8 text-xs"
              />
            </div>
            
            {/* Field List */}
            <div className="space-y-1 max-h-48 overflow-y-auto border rounded p-1 bg-slate-50">
              {filteredFields.map((field) => {
                const isSelected = config.picklistField === field.apiName;
                return (
                  <button
                    key={field.apiName}
                    onClick={() => updateConfig({ 
                      picklistField: field.apiName,
                      stages: field.options || [],
                    })}
                    className={`w-full flex items-center gap-2 p-2 rounded transition-all text-left ${
                      isSelected 
                        ? 'bg-blue-100 border-blue-300 border' 
                        : 'bg-white border border-slate-200 hover:border-blue-300'
                    }`}
                  >
                    {isSelected && (
                      <CheckCircle className="h-4 w-4 text-blue-600 flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <span className={`text-xs font-medium ${isSelected ? 'text-blue-700' : 'text-slate-700'}`}>
                        {field.label}
                      </span>
                      <span className="text-[10px] text-slate-400 ml-1">({field.apiName})</span>
                      {field.options && field.options.length > 0 && (
                        <p className="text-[9px] text-slate-400 mt-0.5 truncate">
                          {field.options.length} stages: {field.options.slice(0, 3).join(', ')}
                          {field.options.length > 3 && '...'}
                        </p>
                      )}
                    </div>
                  </button>
                );
              })}
              {filteredFields.length === 0 && (
                <p className="text-center text-xs text-slate-400 py-4">
                  No matching fields found
                </p>
              )}
            </div>
          </>
        )}
      </div>
      
      {/* Selected Field Preview */}
      {selectedField && (
        <div className="p-3 bg-green-50 rounded-lg border border-green-200">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <span className="text-xs font-medium text-green-700">Selected: {selectedField.label}</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {(selectedField.options || []).map((option, idx) => (
              <span 
                key={option}
                className="px-2 py-0.5 bg-white text-[10px] text-slate-600 rounded border border-green-200"
              >
                {idx + 1}. {option}
              </span>
            ))}
          </div>
        </div>
      )}
      
      {/* Display Options */}
      <div className="border-t pt-4">
        <div className="flex items-center gap-2 mb-3">
          <Settings className="h-4 w-4 text-slate-600" />
          <span className="text-xs font-semibold text-slate-700 uppercase">Display Options</span>
        </div>
        
        <div className="space-y-3">
          {/* Format */}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Format</label>
            <select 
              className="w-full h-9 text-sm border rounded-md px-3 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              value={config.format || 'linear'}
              onChange={(e) => updateConfig({ format: e.target.value })}
            >
              <option value="linear">Linear (Connected Path)</option>
              <option value="non-linear">Non-Linear (Separate Badges)</option>
            </select>
            <p className="text-[10px] text-slate-500 mt-1">
              {config.format === 'non-linear' 
                ? 'Stages displayed as separate badges' 
                : 'Stages displayed in a connected path'}
            </p>
          </div>
          
          {/* Mark Complete Button */}
          <div className="flex items-center justify-between p-2 rounded hover:bg-slate-50">
            <div>
              <span className="text-xs font-medium text-slate-700">Show Mark Complete Button</span>
              <p className="text-[10px] text-slate-500">Allow advancing to next stage</p>
            </div>
            <Switch
              checked={config.showMarkCompleteButton !== false}
              onCheckedChange={(val) => updateConfig({ showMarkCompleteButton: val })}
            />
          </div>
        </div>
      </div>
      
      {/* Help Section */}
      <div className="border-t pt-4">
        <div className="p-3 bg-slate-50 rounded-lg text-[10px] text-slate-600 space-y-1">
          <p className="font-medium text-slate-700">How it works:</p>
          <p>• Path displays stages from the selected picklist field</p>
          <p>• Current record value is highlighted</p>
          <p>• Mark Complete advances to the next stage</p>
          <p>• Changes are saved immediately to the record</p>
        </div>
      </div>
    </div>
  );
};

export default PathPropertyPanel;
