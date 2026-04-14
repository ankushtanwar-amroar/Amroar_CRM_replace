import React, { useState, useEffect } from 'react';
import { X, ArrowLeft, ArrowRight, Calculator, Loader, AlertCircle, Info } from 'lucide-react';
import { Button } from '../../../../components/ui/button';
import { Label } from '../../../../components/ui/label';
import { Input } from '../../../../components/ui/input';
import { Textarea } from '../../../../components/ui/textarea';
import { Switch } from '../../../../components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../../components/ui/select';
import WizardStepper from '../common/WizardStepper';
import FilterRuleBuilder from '../common/FilterRuleBuilder';
import AdvancedFormulaFilterEditor from '../common/AdvancedFormulaFilterEditor';
import LayoutAssignment from '../common/LayoutAssignment';
import fieldManagementService from '../../services/fieldManagementService';
import { generateApiKey, ROLLUP_TYPES, ROLLUP_RESULT_TYPES, RECALCULATION_MODES } from '../../utils/fieldUtils';

const STEPS = [
  { id: 'basics', label: 'Basics' },
  { id: 'relationship', label: 'Relationship' },
  { id: 'rollup', label: 'Rollup Type' },
  { id: 'filter', label: 'Filter Criteria' },
  { id: 'layout', label: 'Page Layouts' }
];

/**
 * Rollup Field Wizard - Create/Edit rollup summary fields
 */
const RollupFieldWizard = ({ 
  isOpen, 
  onClose, 
  objectName,
  objectLabel,
  editingField = null,
  onSuccess 
}) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Step 1: Basics
  const [label, setLabel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [description, setDescription] = useState('');
  const [helpText, setHelpText] = useState('');
  const [resultType, setResultType] = useState('Number');
  const [decimalPlaces, setDecimalPlaces] = useState(2);
  const [currencySymbol, setCurrencySymbol] = useState('$');

  // Step 2: Relationship
  const [childRelationships, setChildRelationships] = useState([]);
  const [childObject, setChildObject] = useState('');
  const [relationshipField, setRelationshipField] = useState('');
  const [childObjectFields, setChildObjectFields] = useState([]);

  // Step 3: Rollup Type
  const [rollupType, setRollupType] = useState('COUNT');
  const [summarizeField, setSummarizeField] = useState('');

  // Step 4: Filter
  const [filterEnabled, setFilterEnabled] = useState(false);
  const [filterRules, setFilterRules] = useState([]);
  const [filterLogic, setFilterLogic] = useState('AND');
  const [useFormulaFilter, setUseFormulaFilter] = useState(false);
  const [filterFormula, setFilterFormula] = useState('');
  const [parentFieldRefs, setParentFieldRefs] = useState([]);
  const [filterValidationResult, setFilterValidationResult] = useState(null);
  const [validatingFilter, setValidatingFilter] = useState(false);

  // Step 5: Post-Formula (kept for backward compatibility but hidden in UI)
  const [postFormulaEnabled, setPostFormulaEnabled] = useState(false);
  const [postFormulaExpression, setPostFormulaExpression] = useState('');
  const [recalculationMode, setRecalculationMode] = useState('async');

  // Step 6: Layout
  const [layouts, setLayouts] = useState([]);
  const [selectedLayouts, setSelectedLayouts] = useState([]);
  const [addToAllLayouts, setAddToAllLayouts] = useState(true);

  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (isOpen) {
      loadChildRelationships();
      loadLayouts();
      
      if (editingField) {
        populateFromExisting(editingField);
      } else {
        resetForm();
      }
    }
  }, [isOpen, editingField]);

  useEffect(() => {
    if (childObject) {
      loadChildObjectFields(childObject);
      // Find the relationship field
      const rel = childRelationships.find(r => r.child_object === childObject);
      if (rel) {
        setRelationshipField(rel.relationship_field);
      }
    }
  }, [childObject, childRelationships]);

  const loadChildRelationships = async () => {
    try {
      const result = await fieldManagementService.getChildRelationships(objectName);
      setChildRelationships(result.relationships || []);
    } catch (err) {
      console.error('Failed to load relationships:', err);
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

  const loadChildObjectFields = async (objName) => {
    try {
      const result = await fieldManagementService.getCompleteFields(objName);
      const fields = Object.entries(result.fields || {}).map(([key, field]) => ({
        api_name: key,
        label: field.label,
        type: field.type
      }));
      setChildObjectFields(fields);
    } catch (err) {
      console.error('Failed to load child fields:', err);
    }
  };

  const populateFromExisting = (field) => {
    setLabel(field.label);
    setApiKey(field.api_key);
    setDescription(field.description || '');
    setHelpText(field.help_text || '');
    setResultType(field.result_type);
    setDecimalPlaces(field.decimal_places);
    setCurrencySymbol(field.currency_symbol);
    setChildObject(field.child_object);
    setRelationshipField(field.relationship_field);
    setRollupType(field.rollup_type);
    setSummarizeField(field.summarize_field || '');
    setFilterEnabled(field.filter_config?.is_enabled || false);
    setFilterRules(field.filter_config?.rules || []);
    setFilterLogic(field.filter_config?.logic || 'AND');
    setUseFormulaFilter(field.filter_config?.use_formula || false);
    setFilterFormula(field.filter_config?.formula || '');
    setParentFieldRefs(field.filter_config?.parent_field_refs || []);
    setPostFormulaEnabled(field.post_formula?.is_enabled || false);
    setPostFormulaExpression(field.post_formula?.expression || '');
    setRecalculationMode(field.recalculation_mode);
    setSelectedLayouts(field.layout_assignments || []);
    setAddToAllLayouts(field.add_to_all_layouts);
  };

  const resetForm = () => {
    setCurrentStep(0);
    setLabel('');
    setApiKey('');
    setDescription('');
    setHelpText('');
    setResultType('Number');
    setDecimalPlaces(2);
    setCurrencySymbol('$');
    setChildObject('');
    setRelationshipField('');
    setRollupType('COUNT');
    setSummarizeField('');
    setFilterEnabled(false);
    setFilterRules([]);
    setFilterLogic('AND');
    setUseFormulaFilter(false);
    setFilterFormula('');
    setParentFieldRefs([]);
    setPostFormulaEnabled(false);
    setPostFormulaExpression('');
    setRecalculationMode('async');
    setSelectedLayouts([]);
    setAddToAllLayouts(true);
    setErrors({});
  };

  const handleLabelChange = (e) => {
    const newLabel = e.target.value;
    setLabel(newLabel);
    if (!apiKey || apiKey === generateApiKey(label)) {
      setApiKey(generateApiKey(newLabel));
    }
  };

  const validateStep = (step) => {
    const newErrors = {};

    if (step === 0) {
      if (!label.trim()) newErrors.label = 'Field label is required';
      if (!apiKey.trim()) newErrors.apiKey = 'API key is required';
    }

    if (step === 1) {
      if (!childObject) newErrors.childObject = 'Please select a child object';
      if (!relationshipField) newErrors.relationshipField = 'Relationship field is required';
    }

    if (step === 2) {
      if (!rollupType) newErrors.rollupType = 'Please select a rollup type';
      if (['SUM', 'MIN', 'MAX', 'AVERAGE'].includes(rollupType) && !summarizeField) {
        newErrors.summarizeField = 'Please select a field to summarize';
      }
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

  // Validate filter configuration
  const validateFilter = async () => {
    setValidatingFilter(true);
    setFilterValidationResult(null);

    try {
      if (useFormulaFilter) {
        // Validate formula filter
        const result = await fieldManagementService.validateRollupFilterFormula(filterFormula);
        setFilterValidationResult({
          isValid: result.valid,
          message: result.valid 
            ? 'Formula filter is valid' 
            : result.error || 'Invalid formula syntax',
          childFieldRefs: result.child_field_refs || [],
          parentFieldRefs: result.parent_field_refs || []
        });
        if (result.parent_field_refs) {
          setParentFieldRefs(result.parent_field_refs);
        }
      } else {
        // Validate basic filter rules
        if (filterRules.length === 0) {
          setFilterValidationResult({
            isValid: false,
            message: 'Please add at least one filter rule'
          });
        } else {
          // Check each rule has required fields
          const invalidRules = filterRules.filter(rule => !rule.field || !rule.operator);
          if (invalidRules.length > 0) {
            setFilterValidationResult({
              isValid: false,
              message: `${invalidRules.length} rule(s) are incomplete. Each rule needs a field and operator.`
            });
          } else {
            setFilterValidationResult({
              isValid: true,
              message: `Filter is valid with ${filterRules.length} rule(s) using ${filterLogic} logic`
            });
          }
        }
      }
    } catch (err) {
      setFilterValidationResult({
        isValid: false,
        message: err.response?.data?.detail || 'Validation failed'
      });
    } finally {
      setValidatingFilter(false);
    }
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
        result_type: resultType,
        decimal_places: decimalPlaces,
        currency_symbol: currencySymbol,
        child_object: childObject,
        relationship_field: relationshipField,
        rollup_type: rollupType,
        summarize_field: summarizeField || null,
        filter_config: filterEnabled ? {
          is_enabled: true,
          rules: useFormulaFilter ? [] : filterRules,
          logic: filterLogic,
          use_formula: useFormulaFilter,
          formula: useFormulaFilter ? filterFormula : '',
          parent_field_refs: parentFieldRefs
        } : { is_enabled: false, rules: [], use_formula: false, formula: '', parent_field_refs: [] },
        post_formula: postFormulaEnabled ? {
          is_enabled: true,
          expression: postFormulaExpression
        } : { is_enabled: false, expression: '' },
        recalculation_mode: recalculationMode,
        layout_assignments: selectedLayouts,
        add_to_all_layouts: addToAllLayouts
      };

      if (editingField) {
        await fieldManagementService.updateRollupField(objectName, editingField.id, fieldData);
      } else {
        await fieldManagementService.createRollupField(objectName, fieldData);
      }

      onSuccess?.();
      onClose();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to save rollup field');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  // Get numeric fields for summarize field selection
  const numericFields = childObjectFields.filter(f => 
    ['number', 'currency', 'percent', 'Number', 'Currency', 'Percent'].includes(f.type)
  );

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b bg-gradient-to-r from-purple-600 to-purple-700 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white/20 rounded-lg">
                <Calculator className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">
                  {editingField ? 'Edit' : 'New'} Rollup Summary Field
                </h2>
                <p className="text-sm text-purple-100">{objectLabel}</p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-lg transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Stepper */}
        <div className="px-6 pt-6">
          <WizardStepper steps={STEPS} currentStep={currentStep} onStepClick={setCurrentStep} />
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
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-1">Basic Information</h3>
                <p className="text-sm text-gray-500">Define the basic properties of your rollup field</p>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">
                    Field Label <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    value={label}
                    onChange={handleLabelChange}
                    placeholder="e.g., Total Amount"
                    className={errors.label ? 'border-red-500' : ''}
                  />
                  {errors.label && <p className="text-xs text-red-500">{errors.label}</p>}
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium">
                    API Key <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                    placeholder="e.g., total_amount"
                    className={`font-mono text-sm ${errors.apiKey ? 'border-red-500' : ''}`}
                  />
                  {errors.apiKey && <p className="text-xs text-red-500">{errors.apiKey}</p>}
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium">Description</Label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe what this rollup calculates..."
                  rows={2}
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Result Type</Label>
                  <Select value={resultType} onValueChange={setResultType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLLUP_RESULT_TYPES.map(type => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {resultType === 'Number' && (
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Decimal Places</Label>
                    <Input
                      type="number"
                      min={0}
                      max={18}
                      value={decimalPlaces}
                      onChange={(e) => setDecimalPlaces(parseInt(e.target.value) || 0)}
                    />
                  </div>
                )}

                {resultType === 'Currency' && (
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Currency Symbol</Label>
                    <Input
                      value={currencySymbol}
                      onChange={(e) => setCurrencySymbol(e.target.value)}
                      placeholder="$"
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Step 2: Relationship */}
          {currentStep === 1 && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-1">Relationship</h3>
                <p className="text-sm text-gray-500">Select the child object and relationship to summarize</p>
              </div>

              {childRelationships.length === 0 ? (
                <div className="p-8 text-center border-2 border-dashed rounded-lg">
                  <Info className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-600 font-medium">No child relationships found</p>
                  <p className="text-sm text-gray-500 mt-1">
                    Create a Lookup field on another object that references {objectLabel} first.
                  </p>
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">
                      Child Object <span className="text-red-500">*</span>
                    </Label>
                    <Select value={childObject} onValueChange={setChildObject}>
                      <SelectTrigger className={errors.childObject ? 'border-red-500' : ''}>
                        <SelectValue placeholder="Select child object..." />
                      </SelectTrigger>
                      <SelectContent>
                        {childRelationships.map(rel => (
                          <SelectItem key={rel.child_object} value={rel.child_object}>
                            {rel.child_object_label || rel.child_object} (via {rel.field_label})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {errors.childObject && <p className="text-xs text-red-500">{errors.childObject}</p>}
                  </div>

                  {childObject && (
                    <div className="p-4 bg-gray-50 rounded-lg">
                      <p className="text-sm text-gray-600">
                        <strong>Relationship Field:</strong>{' '}
                        <code className="bg-gray-200 px-2 py-0.5 rounded">{relationshipField}</code>
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Step 3: Rollup Type */}
          {currentStep === 2 && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-1">Rollup Type</h3>
                <p className="text-sm text-gray-500">Choose how to summarize the related records</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {ROLLUP_TYPES.map(type => (
                  <label
                    key={type.value}
                    className={`flex items-start gap-3 p-4 border-2 rounded-lg cursor-pointer transition-all
                      ${rollupType === type.value 
                        ? 'border-purple-500 bg-purple-50' 
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                      }
                    `}
                  >
                    <input
                      type="radio"
                      name="rollupType"
                      value={type.value}
                      checked={rollupType === type.value}
                      onChange={(e) => setRollupType(e.target.value)}
                      className="mt-1"
                    />
                    <div>
                      <p className="font-semibold text-gray-900">{type.label}</p>
                      <p className="text-sm text-gray-500">{type.description}</p>
                    </div>
                  </label>
                ))}
              </div>

              {['SUM', 'MIN', 'MAX', 'AVERAGE'].includes(rollupType) && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium">
                    Field to Summarize <span className="text-red-500">*</span>
                  </Label>
                  <Select value={summarizeField} onValueChange={setSummarizeField}>
                    <SelectTrigger className={errors.summarizeField ? 'border-red-500' : ''}>
                      <SelectValue placeholder="Select a numeric field..." />
                    </SelectTrigger>
                    <SelectContent>
                      {numericFields.length === 0 ? (
                        <SelectItem value="_no_fields" disabled>
                          No numeric fields available
                        </SelectItem>
                      ) : (
                        numericFields.map(field => (
                          <SelectItem key={field.api_name} value={field.api_name}>
                            {field.label}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  {errors.summarizeField && (
                    <p className="text-xs text-red-500">{errors.summarizeField}</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Step 4: Filter */}
          {currentStep === 3 && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-1">Filter Criteria (Optional)</h3>
                <p className="text-sm text-gray-500">Only include child records that match these criteria</p>
              </div>

              <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg">
                <Switch
                  id="enableFilter"
                  checked={filterEnabled}
                  onCheckedChange={setFilterEnabled}
                />
                <div>
                  <Label htmlFor="enableFilter" className="text-sm font-medium cursor-pointer">
                    Apply Filter Criteria
                  </Label>
                  <p className="text-xs text-gray-500">
                    Only include matching records in the rollup calculation
                  </p>
                </div>
              </div>

              {filterEnabled && (
                <div className="space-y-4">
                  {/* Toggle between basic and advanced */}
                  <div className="flex items-center gap-4 p-3 bg-blue-50 rounded-lg border border-blue-100">
                    <div className="flex items-center gap-2">
                      <input
                        type="radio"
                        id="basicFilter"
                        name="filterMode"
                        checked={!useFormulaFilter}
                        onChange={() => { setUseFormulaFilter(false); setFilterValidationResult(null); }}
                        className="w-4 h-4"
                      />
                      <Label htmlFor="basicFilter" className="text-sm cursor-pointer">
                        Basic Filter Builder
                      </Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="radio"
                        id="formulaFilter"
                        name="filterMode"
                        checked={useFormulaFilter}
                        onChange={() => { setUseFormulaFilter(true); setFilterValidationResult(null); }}
                        className="w-4 h-4"
                      />
                      <Label htmlFor="formulaFilter" className="text-sm cursor-pointer">
                        Advanced Formula
                      </Label>
                    </div>
                  </div>

                  {!useFormulaFilter ? (
                    <FilterRuleBuilder
                      rules={filterRules}
                      onChange={(rules) => { setFilterRules(rules); setFilterValidationResult(null); }}
                      availableFields={childObjectFields}
                      logic={filterLogic}
                      onLogicChange={setFilterLogic}
                    />
                  ) : (
                    <AdvancedFormulaFilterEditor
                      formula={filterFormula}
                      onChange={(formula) => { setFilterFormula(formula); setFilterValidationResult(null); }}
                      childObjectFields={childObjectFields}
                      parentObjectFields={[]} // TODO: Load parent object fields
                      objectName={objectName}
                      childObjectName={childObject}
                    />
                  )}

                  {/* Validate Button */}
                  <div className="flex items-center gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={validateFilter}
                      disabled={validatingFilter || (!useFormulaFilter && filterRules.length === 0) || (useFormulaFilter && !filterFormula)}
                      className="h-9"
                      data-testid="validate-filter-btn"
                    >
                      {validatingFilter ? (
                        <Loader className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <AlertCircle className="w-4 h-4 mr-2" />
                      )}
                      Validate Filter
                    </Button>
                    
                    {filterValidationResult && (
                      <div className={`flex-1 px-3 py-2 rounded-lg text-sm ${
                        filterValidationResult.isValid 
                          ? 'bg-green-50 text-green-700 border border-green-200' 
                          : 'bg-red-50 text-red-700 border border-red-200'
                      }`}>
                        {filterValidationResult.isValid ? '✓' : '✗'} {filterValidationResult.message}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Recalculation Mode - Moved from removed Post-Formula step */}
              <div className="pt-4 border-t space-y-2">
                <Label className="text-sm font-medium">Recalculation Mode</Label>
                <div className="space-y-2">
                  {RECALCULATION_MODES.map(mode => (
                    <label
                      key={mode.value}
                      className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer
                        ${recalculationMode === mode.value ? 'border-purple-500 bg-purple-50' : 'hover:bg-gray-50'}
                      `}
                    >
                      <input
                        type="radio"
                        name="recalcMode"
                        value={mode.value}
                        checked={recalculationMode === mode.value}
                        onChange={(e) => setRecalculationMode(e.target.value)}
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
            </div>
          )}

          {/* Step 5: Layout - Now Step 4 */}
          {currentStep === 4 && (
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
          <Button variant="outline" onClick={handleBack} disabled={currentStep === 0}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>

          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            {currentStep < STEPS.length - 1 ? (
              <Button onClick={handleNext} disabled={currentStep === 1 && childRelationships.length === 0}>
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

export default RollupFieldWizard;
