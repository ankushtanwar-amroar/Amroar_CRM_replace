import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Zap, Loader2, Mail, AlertCircle } from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const TriggerConfiguration = ({ trigger, onUpdate }) => {
  const [triggerData, setTriggerData] = useState(trigger || {
    enabled: false,
    trigger_type: 'onUpdate',
    object_type: '',
    email_field: '',
    conditions: []
  });

  const [objects, setObjects] = useState([]);
  const [fields, setFields] = useState([]);
  const [emailFields, setEmailFields] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingFields, setLoadingFields] = useState(false);
  const [error, setError] = useState(null);

  const triggerTypes = [
    { value: 'onCreate', label: 'On Record Create' },
    { value: 'onUpdate', label: 'On Record Update' },
    { value: 'onStageChange', label: 'On Stage/Status Change' }
  ];

  const operators = [
    { value: 'equals', label: 'Equals' },
    { value: 'not_equals', label: 'Not Equals' },
    { value: 'contains', label: 'Contains' },
    { value: 'changes_to', label: 'Changes To' },
    { value: 'changes_from', label: 'Changes From' },
    { value: 'is_empty', label: 'Is Empty' },
    { value: 'is_not_empty', label: 'Is Not Empty' }
  ];

  // Fetch objects with email fields on mount
  useEffect(() => {
    fetchObjectsWithEmail();
  }, []);

  // Fetch fields when object changes
  useEffect(() => {
    if (triggerData.object_type) {
      fetchObjectFields(triggerData.object_type);
    } else {
      setFields([]);
      setEmailFields([]);
    }
  }, [triggerData.object_type]);

  const fetchObjectsWithEmail = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/docflow/trigger-objects`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch objects');
      }
      
      const data = await response.json();
      setObjects(data);
      
      // If we already have an object_type set, ensure it's still valid
      if (triggerData.object_type) {
        const validObject = data.find(o => o.object_name === triggerData.object_type);
        if (!validObject && data.length > 0) {
          // Reset if the current object is no longer valid
          handleUpdate({ object_type: '', email_field: '', conditions: [] });
        }
      }
    } catch (err) {
      console.error('Error fetching objects:', err);
      setError('Failed to load objects. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const fetchObjectFields = async (objectName) => {
    setLoadingFields(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/docflow/trigger-objects/${objectName}/fields`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch fields');
      }
      
      const data = await response.json();
      setFields(data.fields || []);
      setEmailFields(data.email_fields || []);
      
      // Auto-select email field if only one exists
      if (data.email_fields?.length === 1 && !triggerData.email_field) {
        handleUpdate({ email_field: data.email_fields[0].api_name });
      }
    } catch (err) {
      console.error('Error fetching fields:', err);
      setFields([]);
      setEmailFields([]);
    } finally {
      setLoadingFields(false);
    }
  };

  const handleUpdate = (updates) => {
    const updated = { ...triggerData, ...updates };
    setTriggerData(updated);
    onUpdate(updated);
  };

  const handleObjectChange = (objectName) => {
    // Reset conditions and email field when object changes
    handleUpdate({ 
      object_type: objectName, 
      email_field: '', 
      conditions: [] 
    });
  };

  const addCondition = () => {
    const newCondition = {
      field: '',
      operator: 'equals',
      value: ''
    };
    const updated = {
      ...triggerData,
      conditions: [...triggerData.conditions, newCondition]
    };
    setTriggerData(updated);
    onUpdate(updated);
  };

  const updateCondition = (index, updates) => {
    const conditions = [...triggerData.conditions];
    conditions[index] = { ...conditions[index], ...updates };
    const updated = { ...triggerData, conditions };
    setTriggerData(updated);
    onUpdate(updated);
  };

  const removeCondition = (index) => {
    const conditions = triggerData.conditions.filter((_, i) => i !== index);
    const updated = { ...triggerData, conditions };
    setTriggerData(updated);
    onUpdate(updated);
  };

  // Get options for a specific field (for picklist fields)
  const getFieldOptions = (fieldName) => {
    const field = fields.find(f => f.api_name === fieldName);
    return field?.options || [];
  };

  return (
    <div className="space-y-6" data-testid="trigger-configuration">
      {/* Enable Trigger */}
      <div className="flex items-center gap-3">
        <input
          type="checkbox"
          id="enable-trigger"
          data-testid="enable-trigger-checkbox"
          checked={triggerData.enabled}
          onChange={(e) => handleUpdate({ enabled: e.target.checked })}
          className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
        />
        <label htmlFor="enable-trigger" className="flex items-center gap-2 text-sm font-medium text-gray-900">
          <Zap className="h-4 w-4 text-yellow-500" />
          Enable Automatic Trigger
        </label>
      </div>

      {triggerData.enabled && (
        <>
          {/* Loading/Error States */}
          {loading && (
            <div className="flex items-center gap-2 text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Loading objects...</span>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg">
              <AlertCircle className="h-4 w-4" />
              <span>{error}</span>
            </div>
          )}

          {!loading && !error && (
            <>
              {/* Trigger Type Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Trigger Event
                </label>
                <select
                  value={triggerData.trigger_type}
                  onChange={(e) => handleUpdate({ trigger_type: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  data-testid="trigger-type-select"
                >
                  {triggerTypes.map(type => (
                    <option key={type.value} value={type.value}>{type.label}</option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  Choose when the trigger should fire
                </p>
              </div>

              {/* Object Type Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  CRM Object Type
                </label>
                {objects.length === 0 ? (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <p className="text-sm text-yellow-800">
                      <strong>No objects with email fields found.</strong> To use automatic triggers, 
                      at least one CRM object must have an email field defined.
                    </p>
                  </div>
                ) : (
                  <select
                    value={triggerData.object_type}
                    onChange={(e) => handleObjectChange(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                    data-testid="object-type-select"
                  >
                    <option value="">Select an object...</option>
                    {objects.map(obj => (
                      <option key={obj.object_name} value={obj.object_name}>
                        {obj.object_label} ({obj.email_fields.length} email field{obj.email_fields.length > 1 ? 's' : ''})
                      </option>
                    ))}
                  </select>
                )}
                <p className="text-xs text-gray-500 mt-1">
                  Only objects with email fields are shown (required for sending documents)
                </p>
              </div>

              {/* Email Field Selection */}
              {triggerData.object_type && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <Mail className="h-4 w-4 inline mr-1" />
                    Recipient Email Field
                  </label>
                  {loadingFields ? (
                    <div className="flex items-center gap-2 text-gray-500 py-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Loading fields...</span>
                    </div>
                  ) : emailFields.length === 0 ? (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                      <p className="text-sm text-yellow-800">
                        No email fields found for this object.
                      </p>
                    </div>
                  ) : (
                    <select
                      value={triggerData.email_field}
                      onChange={(e) => handleUpdate({ email_field: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                      data-testid="email-field-select"
                    >
                      <option value="">Select email field...</option>
                      {emailFields.map(field => (
                        <option key={field.api_name} value={field.api_name}>
                          {field.label} ({field.api_name})
                        </option>
                      ))}
                    </select>
                  )}
                  <p className="text-xs text-gray-500 mt-1">
                    The document link will be sent to this email address
                  </p>
                </div>
              )}

              {/* Conditions */}
              {triggerData.object_type && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <label className="block text-sm font-medium text-gray-700">
                      Trigger Conditions
                    </label>
                    <button
                      onClick={addCondition}
                      className="flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-700"
                      data-testid="add-condition-btn"
                    >
                      <Plus className="h-4 w-4" />
                      Add Condition
                    </button>
                  </div>

                  {triggerData.conditions.length === 0 ? (
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-center">
                      <p className="text-sm text-gray-600">
                        No conditions added yet. Click "Add Condition" to start.
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        Without conditions, the trigger will fire on every {triggerData.trigger_type === 'onCreate' ? 'create' : 'update'} event.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {triggerData.conditions.map((condition, index) => (
                        <div key={index} className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg" data-testid={`condition-row-${index}`}>
                          {/* Field Select */}
                          <select
                            value={condition.field}
                            onChange={(e) => updateCondition(index, { field: e.target.value })}
                            className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500"
                            data-testid={`condition-field-${index}`}
                          >
                            <option value="">Select Field</option>
                            {fields.map(field => (
                              <option key={field.api_name} value={field.api_name}>
                                {field.label}
                              </option>
                            ))}
                          </select>

                          {/* Operator Select */}
                          <select
                            value={condition.operator}
                            onChange={(e) => updateCondition(index, { operator: e.target.value })}
                            className="px-3 py-2 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500"
                            data-testid={`condition-operator-${index}`}
                          >
                            {operators.map(op => (
                              <option key={op.value} value={op.value}>{op.label}</option>
                            ))}
                          </select>

                          {/* Value Input - Use select if field has options */}
                          {!['is_empty', 'is_not_empty'].includes(condition.operator) && (
                            <>
                              {getFieldOptions(condition.field).length > 0 ? (
                                <select
                                  value={condition.value}
                                  onChange={(e) => updateCondition(index, { value: e.target.value })}
                                  className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500"
                                  data-testid={`condition-value-${index}`}
                                >
                                  <option value="">Select Value</option>
                                  {getFieldOptions(condition.field).map(opt => (
                                    <option key={opt} value={opt}>{opt}</option>
                                  ))}
                                </select>
                              ) : (
                                <input
                                  type="text"
                                  value={condition.value}
                                  onChange={(e) => updateCondition(index, { value: e.target.value })}
                                  placeholder="Value"
                                  className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500"
                                  data-testid={`condition-value-${index}`}
                                />
                              )}
                            </>
                          )}

                          {/* Remove Button */}
                          <button
                            onClick={() => removeCondition(index)}
                            className="p-2 text-red-600 hover:bg-red-50 rounded"
                            data-testid={`remove-condition-${index}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Use Case Examples */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-blue-900 mb-2">Example Use Cases:</h4>
                <ul className="text-xs text-blue-800 space-y-1">
                  <li>• <strong>Lead Status</strong> changes to "Lost" → Send rejection letter</li>
                  <li>• <strong>Lead Status</strong> changes to "Converted" → Send welcome document</li>
                  <li>• <strong>Opportunity Stage</strong> changes to "Closed Won" → Send contract</li>
                  <li>• <strong>Contact</strong> is created → Send onboarding materials</li>
                </ul>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
};

export default TriggerConfiguration;
