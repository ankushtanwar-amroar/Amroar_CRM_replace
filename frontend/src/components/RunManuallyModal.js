import React, { useState, useEffect } from 'react';
import { X, Play, AlertTriangle } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';

const RunManuallyModal = ({ isOpen, onClose, onRun, flow, versions = [] }) => {
  const [selectedVersion, setSelectedVersion] = useState(flow?.id || '');
  const [inputValues, setInputValues] = useState({});
  const [validationErrors, setValidationErrors] = useState({});
  const [isRunning, setIsRunning] = useState(false);

  // Get input variables from selected version
  const selectedVersionData = versions.find(v => v.id === selectedVersion) || flow;
  const inputVariables = selectedVersionData?.input_variables || [];
  const isArchived = selectedVersionData?.status === 'archived';
  const isDraft = selectedVersionData?.status === 'draft';

  // Initialize input values with defaults
  useEffect(() => {
    if (inputVariables.length > 0) {
      const defaults = {};
      inputVariables.forEach(variable => {
        defaults[variable.name] = variable.defaultValue || '';
      });
      setInputValues(defaults);
    }
  }, [selectedVersion, inputVariables]);

  // Validate input values
  const validateInputs = () => {
    const errors = {};
    
    inputVariables.forEach(variable => {
      const value = inputValues[variable.name];
      
      // Check required fields
      if (variable.required && (!value || value === '')) {
        errors[variable.name] = `${variable.label} is required`;
        return;
      }
      
      // Type validation
      if (value && value !== '') {
        if (variable.dataType === 'Number' && isNaN(value)) {
          errors[variable.name] = `${variable.label} must be a number`;
        } else if (variable.dataType === 'Boolean' && !['true', 'false', true, false].includes(value)) {
          errors[variable.name] = `${variable.label} must be true or false`;
        }
      }
    });
    
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleInputChange = (name, value) => {
    setInputValues(prev => ({ ...prev, [name]: value }));
    // Clear validation error for this field
    if (validationErrors[name]) {
      setValidationErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
    }
  };

  const handleRun = async () => {
    // Validate inputs
    if (!validateInputs()) {
      return;
    }
    
    setIsRunning(true);
    try {
      await onRun(selectedVersion, inputValues);
      onClose();
    } catch (error) {
      console.error('Error running flow:', error);
    } finally {
      setIsRunning(false);
    }
  };

  if (!isOpen) return null;

  const hasValidationErrors = Object.keys(validationErrors).length > 0;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b sticky top-0 bg-white z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center">
              <Play className="h-5 w-5 text-indigo-600" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Run Flow Manually</h2>
              <p className="text-sm text-gray-500 mt-0.5">{flow?.name}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Version Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select Version to Run
            </label>
            <select
              value={selectedVersion}
              onChange={(e) => setSelectedVersion(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {versions.map((version) => (
                <option key={version.id} value={version.id}>
                  v{version.version} - {version.status.toUpperCase()}
                  {version.status === 'active' && ' (Current)'}
                </option>
              ))}
            </select>
          </div>

          {/* Warning for Archived Version */}
          {isArchived && (
            <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
              <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-red-900">Archived Version Warning</p>
                <p className="text-sm text-red-700 mt-1">
                  You are about to run an archived version. This version is read-only and may contain outdated logic.
                </p>
              </div>
            </div>
          )}

          {/* Info for Draft Version */}
          {isDraft && (
            <div className="flex items-start gap-3 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-yellow-900">Draft Version</p>
                <p className="text-sm text-yellow-700 mt-1">
                  This is a draft version and has not been activated. Changes may not be production-ready.
                </p>
              </div>
            </div>
          )}

          {/* Input Variables Section */}
          {inputVariables.length > 0 ? (
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-4">Input Variables</h3>
              <div className="space-y-4">
                {inputVariables.map((variable) => (
                  <div key={variable.name}>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {variable.label}
                      {variable.required && <span className="text-red-500 ml-1">*</span>}
                    </label>
                    
                    {variable.description && (
                      <p className="text-xs text-gray-500 mb-2">{variable.description}</p>
                    )}
                    
                    {variable.dataType === 'Boolean' ? (
                      <select
                        value={inputValues[variable.name] || ''}
                        onChange={(e) => handleInputChange(variable.name, e.target.value)}
                        className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                          validationErrors[variable.name] ? 'border-red-500' : 'border-gray-300'
                        }`}
                      >
                        <option value="">Select...</option>
                        <option value="true">True</option>
                        <option value="false">False</option>
                      </select>
                    ) : variable.dataType === 'Number' ? (
                      <Input
                        type="number"
                        value={inputValues[variable.name] || ''}
                        onChange={(e) => handleInputChange(variable.name, e.target.value)}
                        placeholder={variable.defaultValue ? `Default: ${variable.defaultValue}` : 'Enter number'}
                        className={validationErrors[variable.name] ? 'border-red-500' : ''}
                      />
                    ) : variable.dataType === 'Date' ? (
                      <Input
                        type="date"
                        value={inputValues[variable.name] || ''}
                        onChange={(e) => handleInputChange(variable.name, e.target.value)}
                        className={validationErrors[variable.name] ? 'border-red-500' : ''}
                      />
                    ) : variable.dataType === 'DateTime' ? (
                      <Input
                        type="datetime-local"
                        value={inputValues[variable.name] || ''}
                        onChange={(e) => handleInputChange(variable.name, e.target.value)}
                        className={validationErrors[variable.name] ? 'border-red-500' : ''}
                      />
                    ) : (
                      <Input
                        type="text"
                        value={inputValues[variable.name] || ''}
                        onChange={(e) => handleInputChange(variable.name, e.target.value)}
                        placeholder={variable.defaultValue ? `Default: ${variable.defaultValue}` : 'Enter value'}
                        className={validationErrors[variable.name] ? 'border-red-500' : ''}
                      />
                    )}
                    
                    {validationErrors[variable.name] && (
                      <p className="text-sm text-red-600 mt-1">{validationErrors[variable.name]}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-sm text-gray-500 italic bg-gray-50 p-4 rounded-lg border border-gray-200">
              ℹ️ This flow does not require input variables.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t bg-gray-50 sticky bottom-0">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isRunning}
          >
            Cancel
          </Button>
          <Button
            onClick={handleRun}
            disabled={isRunning || hasValidationErrors}
            className="bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            {isRunning ? (
              <>
                <span className="animate-spin mr-2">⏳</span>
                Running...
              </>
            ) : (
              <>
                <Play className="h-4 w-4 mr-2" />
                Run Flow
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default RunManuallyModal;
