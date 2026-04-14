import React, { useState, useEffect } from 'react';
import { X, ArrowLeft, ArrowRight, Link, Loader, AlertCircle } from 'lucide-react';
import { Button } from '../../../../components/ui/button';
import { Label } from '../../../../components/ui/label';
import { Input } from '../../../../components/ui/input';
import { Switch } from '../../../../components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../../components/ui/select';
import WizardStepper from '../common/WizardStepper';
import BasicFieldInfo from '../common/BasicFieldInfo';
import FilterRuleBuilder from '../common/FilterRuleBuilder';
import LayoutAssignment from '../common/LayoutAssignment';
import fieldManagementService from '../../services/fieldManagementService';
import { generateApiKey, ENFORCEMENT_MODES } from '../../utils/fieldUtils';

const STEPS = [
  { id: 'basics', label: 'Basics' },
  { id: 'related', label: 'Related Object' },
  { id: 'filter', label: 'Lookup Filter' },
  { id: 'layout', label: 'Page Layouts' }
];

/**
 * Lookup Field Wizard - Create/Edit lookup (relationship) fields
 */
const LookupFieldWizard = ({ 
  isOpen, 
  onClose, 
  objectName,
  objectLabel,
  editingField = null,
  onSuccess 
}) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Step 1: Basics
  const [label, setLabel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [description, setDescription] = useState('');
  const [helpText, setHelpText] = useState('');
  const [isRequired, setIsRequired] = useState(false);
  const [isUnique, setIsUnique] = useState(false);
  const [isIndexed, setIsIndexed] = useState(true);

  // Step 2: Related Object
  const [availableObjects, setAvailableObjects] = useState([]);
  const [targetObject, setTargetObject] = useState('');

  // Step 3: Lookup Filter
  const [filterEnabled, setFilterEnabled] = useState(false);
  const [filterRules, setFilterRules] = useState([]);
  const [filterLogic, setFilterLogic] = useState('AND');
  const [enforcementMode, setEnforcementMode] = useState('filter_only');
  const [errorMessage, setErrorMessage] = useState('');
  const [sourceObjectFields, setSourceObjectFields] = useState([]);
  const [targetObjectFields, setTargetObjectFields] = useState([]);

  // Step 4: Layout
  const [layouts, setLayouts] = useState([]);
  const [selectedLayouts, setSelectedLayouts] = useState([]);
  const [addToAllLayouts, setAddToAllLayouts] = useState(true);

  // On delete action
  const [onDeleteAction, setOnDeleteAction] = useState('set_null');

  const [errors, setErrors] = useState({});

  // Load initial data
  useEffect(() => {
    if (isOpen) {
      loadAvailableObjects();
      loadLayouts();
      loadSourceObjectFields();
      
      if (editingField) {
        populateFromExisting(editingField);
      } else {
        resetForm();
      }
    }
  }, [isOpen, editingField]);

  const loadAvailableObjects = async () => {
    try {
      const result = await fieldManagementService.getAvailableObjects();
      setAvailableObjects(result.objects || []);
    } catch (err) {
      console.error('Failed to load objects:', err);
    }
  };

  const loadLayouts = async () => {
    try {
      const result = await fieldManagementService.getObjectLayouts(objectName);
      setLayouts(result.layouts || []);
    } catch (err) {
      console.error('Failed to load layouts:', err);
    }
  };

  const loadSourceObjectFields = async () => {
    try {
      const result = await fieldManagementService.getCompleteFields(objectName);
      const fields = Object.entries(result.fields || {}).map(([key, field]) => ({
        api_name: key,
        label: field.label,
        type: field.type
      }));
      setSourceObjectFields(fields);
    } catch (err) {
      console.error('Failed to load source fields:', err);
    }
  };

  // Load target object fields when target object changes
  const loadTargetObjectFields = async (targetObjName) => {
    if (!targetObjName) {
      setTargetObjectFields([]);
      return;
    }
    try {
      const result = await fieldManagementService.getCompleteFields(targetObjName);
      const fields = Object.entries(result.fields || {}).map(([key, field]) => ({
        api_name: key,
        label: field.label || key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        type: field.type
      }));
      setTargetObjectFields(fields);
    } catch (err) {
      console.error('Failed to load target object fields:', err);
      setTargetObjectFields([]);
    }
  };

  // Effect to load target object fields when targetObject changes
  useEffect(() => {
    if (targetObject) {
      loadTargetObjectFields(targetObject);
    } else {
      setTargetObjectFields([]);
    }
  }, [targetObject]);

  const populateFromExisting = (field) => {
    setLabel(field.label);
    setApiKey(field.api_key);
    setDescription(field.description || '');
    setHelpText(field.help_text || '');
    setIsRequired(field.is_required);
    setIsUnique(field.is_unique);
    setIsIndexed(field.is_indexed);
    setTargetObject(field.target_object);
    setFilterEnabled(field.filter_config?.is_enabled || false);
    setFilterRules(field.filter_config?.rules || []);
    setFilterLogic(field.filter_config?.logic || 'AND');
    setEnforcementMode(field.filter_config?.enforcement_mode || 'filter_only');
    setErrorMessage(field.filter_config?.error_message || '');
    setSelectedLayouts(field.layout_assignments || []);
    setAddToAllLayouts(field.add_to_all_layouts);
    setOnDeleteAction(field.on_delete_action || 'set_null');
  };

  const resetForm = () => {
    setCurrentStep(0);
    setLabel('');
    setApiKey('');
    setDescription('');
    setHelpText('');
    setIsRequired(false);
    setIsUnique(false);
    setIsIndexed(true);
    setTargetObject('');
    setTargetObjectFields([]);
    setFilterEnabled(false);
    setFilterRules([]);
    setFilterLogic('AND');
    setEnforcementMode('filter_only');
    setErrorMessage('');
    setSelectedLayouts([]);
    setAddToAllLayouts(true);
    setOnDeleteAction('set_null');
    setErrors({});
  };

  const validateStep = (step) => {
    const newErrors = {};

    if (step === 0) {
      if (!label.trim()) newErrors.label = 'Field label is required';
      if (!apiKey.trim()) newErrors.apiKey = 'API key is required';
      if (!/^[a-z][a-z0-9_]*$/.test(apiKey)) {
        newErrors.apiKey = 'API key must start with a letter and contain only lowercase letters, numbers, and underscores';
      }
    }

    if (step === 1) {
      if (!targetObject) newErrors.targetObject = 'Please select a related object';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (validateStep(currentStep)) {
      setCurrentStep(prev => Math.min(prev + 1, STEPS.length - 1));
    }
  };

  const handleBack = () => {
    setCurrentStep(prev => Math.max(prev - 1, 0));
  };

  const handleSave = async () => {
    if (!validateStep(currentStep)) return;

    setSaving(true);
    setError(null);

    try {
      const fieldData = {
        label,
        api_key: apiKey,
        description,
        help_text: helpText,
        is_required: isRequired,
        is_unique: isUnique,
        is_indexed: isIndexed,
        target_object: targetObject,
        // Note: display_field is now managed in Lookup Configuration → Display & Search
        // Using 'name' as default for backend compatibility
        display_field: 'name',
        filter_config: filterEnabled ? {
          is_enabled: true,
          rules: filterRules,
          logic: filterLogic,
          enforcement_mode: enforcementMode,
          error_message: errorMessage
        } : { is_enabled: false, rules: [] },
        layout_assignments: selectedLayouts,
        add_to_all_layouts: addToAllLayouts,
        on_delete_action: onDeleteAction
      };

      if (editingField) {
        await fieldManagementService.updateLookupField(objectName, editingField.id, fieldData);
      } else {
        await fieldManagementService.createLookupField(objectName, fieldData);
      }

      onSuccess?.();
      onClose();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to save lookup field');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  const selectedTargetObj = availableObjects.find(o => o.object_name === targetObject);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b bg-gradient-to-r from-blue-600 to-blue-700 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white/20 rounded-lg">
                <Link className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">
                  {editingField ? 'Edit' : 'New'} Lookup Field
                </h2>
                <p className="text-sm text-blue-100">{objectLabel}</p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-lg transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Stepper */}
        <div className="px-6 pt-6">
          <WizardStepper 
            steps={STEPS} 
            currentStep={currentStep} 
            onStepClick={setCurrentStep} 
          />
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          )}

          {/* Step 1: Basics */}
          {currentStep === 0 && (
            <BasicFieldInfo
              label={label}
              setLabel={setLabel}
              apiKey={apiKey}
              setApiKey={setApiKey}
              description={description}
              setDescription={setDescription}
              helpText={helpText}
              setHelpText={setHelpText}
              isRequired={isRequired}
              setIsRequired={setIsRequired}
              isUnique={isUnique}
              setIsUnique={setIsUnique}
              isIndexed={isIndexed}
              setIsIndexed={setIsIndexed}
              apiKeySuffix="_id"
              errors={errors}
            />
          )}

          {/* Step 2: Related Object */}
          {currentStep === 1 && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-1">Related Object</h3>
                <p className="text-sm text-gray-500">Choose which object this field will reference</p>
              </div>

              <div className="space-y-4">
                {/* Target Object */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">
                    Target Object <span className="text-red-500">*</span>
                  </Label>
                  <Select value={targetObject} onValueChange={setTargetObject}>
                    <SelectTrigger className={errors.targetObject ? 'border-red-500' : ''}>
                      <SelectValue placeholder="Select an object..." />
                    </SelectTrigger>
                    <SelectContent>
                      {availableObjects.map(obj => (
                        <SelectItem key={obj.object_name} value={obj.object_name}>
                          {obj.object_label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.targetObject && (
                    <p className="text-xs text-red-500">{errors.targetObject}</p>
                  )}
                  <p className="text-xs text-gray-500">
                    This field will store references to records from the selected object
                  </p>
                </div>

                {/* On Delete Action */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">When Related Record is Deleted</Label>
                  <Select value={onDeleteAction} onValueChange={setOnDeleteAction}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="set_null">Clear this field (Set to Null)</SelectItem>
                      <SelectItem value="restrict">Prevent deletion (Restrict)</SelectItem>
                      <SelectItem value="cascade">Delete this record too (Cascade)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-gray-500">
                    What happens when the referenced record is deleted
                  </p>
                </div>

                {/* Info Box about Display Configuration */}
                {targetObject && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-4">
                    <h4 className="text-sm font-medium text-blue-800 mb-1">Display & Search Configuration</h4>
                    <p className="text-xs text-blue-700">
                      After creating this lookup field, configure display settings (primary display field, 
                      searchable fields, and hover preview) in <strong>Object Manager → Lookup Configuration → Display & Search</strong>.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Step 3: Lookup Filter */}
          {currentStep === 2 && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-1">Lookup Filter (Optional)</h3>
                <p className="text-sm text-gray-500">
                  Optionally limit which {selectedTargetObj?.object_label || 'records'} can be selected
                </p>
              </div>

              {/* Enable filter toggle */}
              <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg">
                <Switch
                  id="enableFilter"
                  checked={filterEnabled}
                  onCheckedChange={setFilterEnabled}
                />
                <div>
                  <Label htmlFor="enableFilter" className="text-sm font-medium cursor-pointer">
                    Enable Lookup Filter
                  </Label>
                  <p className="text-xs text-gray-500">
                    Restrict which records appear in the lookup dropdown
                  </p>
                </div>
              </div>

              {filterEnabled && (
                <>
                  {/* Filter Rules */}
                  <FilterRuleBuilder
                    rules={filterRules}
                    onChange={setFilterRules}
                    availableFields={targetObjectFields}
                    allowSourceField={true}
                    sourceFields={sourceObjectFields}
                    logic={filterLogic}
                    onLogicChange={setFilterLogic}
                  />

                  {/* Enforcement Mode */}
                  <div className="space-y-3">
                    <Label className="text-sm font-medium">Enforcement Mode</Label>
                    <div className="space-y-2">
                      {ENFORCEMENT_MODES.map(mode => (
                        <label
                          key={mode.value}
                          className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors
                            ${enforcementMode === mode.value ? 'border-blue-500 bg-blue-50' : 'hover:bg-gray-50'}
                          `}
                        >
                          <input
                            type="radio"
                            name="enforcement"
                            value={mode.value}
                            checked={enforcementMode === mode.value}
                            onChange={(e) => setEnforcementMode(e.target.value)}
                            className="mt-1"
                          />
                          <div>
                            <p className="font-medium text-sm">{mode.label}</p>
                            <p className="text-xs text-gray-500">{mode.description}</p>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Custom Error Message */}
                  {enforcementMode === 'block_save' && (
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Custom Error Message</Label>
                      <Input
                        value={errorMessage}
                        onChange={(e) => setErrorMessage(e.target.value)}
                        placeholder="e.g., Please select an active account"
                      />
                      <p className="text-xs text-gray-500">
                        Shown when a user tries to save with an invalid selection
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Step 4: Layout Assignment */}
          {currentStep === 3 && (
            <LayoutAssignment
              layouts={layouts}
              selectedLayouts={selectedLayouts}
              setSelectedLayouts={setSelectedLayouts}
              addToAllLayouts={addToAllLayouts}
              setAddToAllLayouts={setAddToAllLayouts}
            />
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t bg-gray-50 flex items-center justify-between">
          <Button
            variant="outline"
            onClick={handleBack}
            disabled={currentStep === 0}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>

          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>

            {currentStep < STEPS.length - 1 ? (
              <Button onClick={handleNext}>
                Next
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            ) : (
              <Button onClick={handleSave} disabled={saving}>
                {saving && <Loader className="w-4 h-4 mr-2 animate-spin" />}
                {editingField ? 'Save Changes' : 'Create Field'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default LookupFieldWizard;
