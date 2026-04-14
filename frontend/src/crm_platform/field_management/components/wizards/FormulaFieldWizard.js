import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  X, ArrowLeft, ArrowRight, FunctionSquare, Loader, AlertCircle, Check, Play, 
  ChevronRight, Search, Link2, Image, ExternalLink, QrCode, Code2, 
  Hash, Type, Calendar, ToggleLeft, ChevronDown, ChevronUp, Sparkles
} from 'lucide-react';
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
import LayoutAssignment from '../common/LayoutAssignment';
import fieldManagementService from '../../services/fieldManagementService';
import { generateApiKey, FORMULA_RETURN_TYPES } from '../../utils/fieldUtils';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const STEPS = [
  { id: 'basics', label: 'Basics' },
  { id: 'formula', label: 'Formula Editor' },
  { id: 'layout', label: 'Page Layouts' }
];

// Category icons for function panel
const CATEGORY_ICONS = {
  'Math': Hash,
  'Text': Type,
  'Logical': ToggleLeft,
  'Date': Calendar,
  'Display/UI': Image,
  'all': Sparkles
};

// Insert templates for Display/UI functions
const FUNCTION_INSERT_TEMPLATES = {
  'IMAGE': 'IMAGE("", "", 40, 40)',
  'HYPERLINK': 'HYPERLINK("", "", "_blank")',
  'QRCODE': 'QRCODE("", 150)',
  'URLENCODE': 'URLENCODE("")',
};

/**
 * Formula Field Wizard - Create/Edit formula (computed) fields
 * Enhanced with parent field picker, function helpers, and live preview
 */
const FormulaFieldWizard = ({ 
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
  const [returnType, setReturnType] = useState('Text');
  const [decimalPlaces, setDecimalPlaces] = useState(2);
  const [currencySymbol, setCurrencySymbol] = useState('$');

  // Step 2: Formula
  const [expression, setExpression] = useState('');
  const [blankAsZero, setBlankAsZero] = useState(true);
  const [availableFields, setAvailableFields] = useState([]);
  const [parentFields, setParentFields] = useState({});
  const [availableFunctions, setAvailableFunctions] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [validationResult, setValidationResult] = useState(null);
  const [validating, setValidating] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [testing, setTesting] = useState(false);
  const [testRecordId, setTestRecordId] = useState('');
  const [fieldSearch, setFieldSearch] = useState('');
  const [functionSearch, setFunctionSearch] = useState('');
  const [expandedParents, setExpandedParents] = useState({});

  // Step 3: Layout
  const [layouts, setLayouts] = useState([]);
  const [selectedLayouts, setSelectedLayouts] = useState([]);
  const [addToAllLayouts, setAddToAllLayouts] = useState(true);

  const [errors, setErrors] = useState({});
  const textareaRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      loadAvailableFields();
      loadParentFields();
      loadFunctions();
      loadLayouts();
      
      if (editingField) {
        populateFromExisting(editingField);
      } else {
        resetForm();
      }
    }
  }, [isOpen, editingField, objectName]);

  const loadAvailableFields = async () => {
    try {
      const result = await fieldManagementService.getCompleteFields(objectName);
      const fields = Object.entries(result.fields || {}).map(([key, field]) => ({
        api_name: key,
        label: field.label || key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        type: field.type
      }));
      setAvailableFields(fields);
    } catch (err) {
      console.error('Failed to load fields:', err);
    }
  };

  const loadParentFields = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(
        `${API_URL}/api/fields/${objectName}?include_parent=true&depth=1`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (response.ok) {
        const data = await response.json();
        // API returns { object_fields, parent_groups, all_fields }
        const grouped = {};
        
        // Process parent_groups from API response
        if (data.parent_groups) {
          Object.entries(data.parent_groups).forEach(([parentName, fields]) => {
            grouped[parentName] = fields.map(field => ({
              ...field,
              full_path: field.full_path || `${parentName}.${field.api_name}`
            }));
          });
        }
        
        setParentFields(grouped);
        // Auto-expand first parent
        if (Object.keys(grouped).length > 0) {
          setExpandedParents({});
        }
      }
    } catch (err) {
      console.error('Failed to load parent fields:', err);
    }
  };

  const loadFunctions = async () => {
    try {
      const functions = await fieldManagementService.getFormulaFunctions();
      setAvailableFunctions(functions);
    } catch (err) {
      console.error('Failed to load functions:', err);
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

  const populateFromExisting = (field) => {
    setLabel(field.label);
    setApiKey(field.api_key);
    setDescription(field.description || '');
    setHelpText(field.help_text || '');
    setReturnType(field.return_type);
    setDecimalPlaces(field.decimal_places);
    setCurrencySymbol(field.currency_symbol);
    setExpression(field.expression);
    setBlankAsZero(field.blank_as_zero);
    setSelectedLayouts(field.layout_assignments || []);
    setAddToAllLayouts(field.add_to_all_layouts);
  };

  const resetForm = () => {
    setCurrentStep(0);
    setLabel('');
    setApiKey('');
    setDescription('');
    setHelpText('');
    setReturnType('Text');
    setDecimalPlaces(2);
    setCurrencySymbol('$');
    setExpression('');
    setBlankAsZero(true);
    setSelectedLayouts([]);
    setAddToAllLayouts(true);
    setValidationResult(null);
    setTestResult(null);
    setErrors({});
    setFieldSearch('');
    setFunctionSearch('');
  };

  const handleLabelChange = (e) => {
    const newLabel = e.target.value;
    setLabel(newLabel);
    if (!apiKey || apiKey === generateApiKey(label)) {
      setApiKey(generateApiKey(newLabel));
    }
  };

  const insertAtCursor = (text) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const newExpression = expression.substring(0, start) + text + expression.substring(end);
    setExpression(newExpression);
    setValidationResult(null);
    
    // Reset cursor position
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + text.length, start + text.length);
    }, 0);
  };

  const insertField = (fieldName) => {
    insertAtCursor(fieldName);
  };

  const insertFunction = (func) => {
    // Check if there's a custom template for this function
    const template = FUNCTION_INSERT_TEMPLATES[func.name];
    if (template) {
      insertAtCursor(template);
    } else {
      // Default: insert function with placeholder parameters
      const params = func.parameters?.map(p => p.name).join(', ') || '';
      insertAtCursor(`${func.name}(${params})`);
    }
  };

  const validateFormula = async () => {
    setValidating(true);
    setValidationResult(null);

    try {
      const result = await fieldManagementService.validateFormula({
        expression,
        object_name: objectName,
        return_type: returnType
      });
      setValidationResult(result);
    } catch (err) {
      setValidationResult({
        is_valid: false,
        errors: [err.response?.data?.detail || 'Validation failed']
      });
    } finally {
      setValidating(false);
    }
  };

  const testFormula = async () => {
    if (!testRecordId) {
      setTestResult({ success: false, error: 'Please enter a record ID' });
      return;
    }

    setTesting(true);
    setTestResult(null);

    try {
      const result = await fieldManagementService.testFormula({
        expression,
        object_name: objectName,
        record_id: testRecordId,
        return_type: returnType
      });
      setTestResult(result);
    } catch (err) {
      setTestResult({
        success: false,
        error: err.response?.data?.detail || 'Test failed'
      });
    } finally {
      setTesting(false);
    }
  };

  const validateStep = (step) => {
    const newErrors = {};

    if (step === 0) {
      if (!label.trim()) newErrors.label = 'Field label is required';
      if (!apiKey.trim()) newErrors.apiKey = 'API key is required';
    }

    if (step === 1) {
      if (!expression.trim()) newErrors.expression = 'Formula expression is required';
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
        return_type: returnType,
        decimal_places: decimalPlaces,
        currency_symbol: currencySymbol,
        expression,
        blank_as_zero: blankAsZero,
        layout_assignments: selectedLayouts,
        add_to_all_layouts: addToAllLayouts
      };

      if (editingField) {
        await fieldManagementService.updateFormulaField(objectName, editingField.id, fieldData);
      } else {
        await fieldManagementService.createFormulaField(objectName, fieldData);
      }

      onSuccess?.();
      onClose();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to save formula field');
    } finally {
      setSaving(false);
    }
  };

  // Filter fields based on search
  const filteredFields = useMemo(() => {
    if (!fieldSearch) return availableFields;
    const search = fieldSearch.toLowerCase();
    return availableFields.filter(f => 
      f.label.toLowerCase().includes(search) || 
      f.api_name.toLowerCase().includes(search)
    );
  }, [availableFields, fieldSearch]);

  // Filter parent fields based on search
  const filteredParentFields = useMemo(() => {
    if (!fieldSearch) return parentFields;
    const search = fieldSearch.toLowerCase();
    const filtered = {};
    Object.entries(parentFields).forEach(([parent, fields]) => {
      const matchingFields = fields.filter(f =>
        f.label.toLowerCase().includes(search) ||
        f.full_path.toLowerCase().includes(search)
      );
      if (matchingFields.length > 0) {
        filtered[parent] = matchingFields;
      }
    });
    return filtered;
  }, [parentFields, fieldSearch]);

  // Group functions by category and filter
  const functionCategories = useMemo(() => {
    const cats = new Set(availableFunctions.map(f => f.category));
    return ['all', ...Array.from(cats)];
  }, [availableFunctions]);

  const filteredFunctions = useMemo(() => {
    let funcs = selectedCategory === 'all' 
      ? availableFunctions 
      : availableFunctions.filter(f => f.category === selectedCategory);
    
    if (functionSearch) {
      const search = functionSearch.toLowerCase();
      funcs = funcs.filter(f => 
        f.name.toLowerCase().includes(search) ||
        f.description.toLowerCase().includes(search)
      );
    }
    return funcs;
  }, [availableFunctions, selectedCategory, functionSearch]);

  const toggleParentExpanded = (parentName) => {
    setExpandedParents(prev => ({
      ...prev,
      [parentName]: !prev[parentName]
    }));
  };

  // Get icon for field type
  const getFieldTypeIcon = (type) => {
    switch(type?.toLowerCase()) {
      case 'number':
      case 'currency':
      case 'percent':
        return Hash;
      case 'date':
      case 'datetime':
        return Calendar;
      case 'boolean':
      case 'checkbox':
        return ToggleLeft;
      default:
        return Type;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b bg-gradient-to-r from-emerald-600 to-teal-600 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white/20 rounded-lg">
                <FunctionSquare className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">
                  {editingField ? 'Edit' : 'New'} Formula Field
                </h2>
                <p className="text-sm text-emerald-100">{objectLabel}</p>
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
                <p className="text-sm text-gray-500">Define the basic properties of your formula field</p>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">
                    Field Label <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    value={label}
                    onChange={handleLabelChange}
                    placeholder="e.g., Full Name"
                    className={errors.label ? 'border-red-500' : ''}
                    data-testid="formula-field-label"
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
                    placeholder="e.g., full_name"
                    className={`font-mono text-sm ${errors.apiKey ? 'border-red-500' : ''}`}
                    data-testid="formula-field-api-key"
                  />
                  {errors.apiKey && <p className="text-xs text-red-500">{errors.apiKey}</p>}
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium">Description</Label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe what this formula calculates..."
                  rows={2}
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Return Type</Label>
                  <Select value={returnType} onValueChange={setReturnType}>
                    <SelectTrigger data-testid="formula-return-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FORMULA_RETURN_TYPES.map(type => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {['Number', 'Currency', 'Percent'].includes(returnType) && (
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

                {returnType === 'Currency' && (
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

          {/* Step 2: Formula Editor */}
          {currentStep === 1 && (
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-1">Formula Editor</h3>
                <p className="text-sm text-gray-500">Build your formula using fields and functions. Click to insert.</p>
              </div>

              <div className="grid grid-cols-12 gap-4 h-[450px]">
                {/* Left: Salesforce-style 3-Column Cascading Field Picker */}
                <div className="col-span-4 border rounded-lg overflow-hidden flex flex-col bg-white">
                  <div className="px-3 py-2 bg-gray-50 border-b">
                    <h4 className="text-sm font-semibold text-gray-700">Insert Field</h4>
                    <p className="text-xs text-gray-500 mt-0.5">Labels with &quot;&gt;&quot; have more fields</p>
                  </div>
                  
                  {/* Search */}
                  <div className="px-2 py-2 border-b">
                    <div className="relative">
                      <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                      <Input
                        value={fieldSearch}
                        onChange={(e) => setFieldSearch(e.target.value)}
                        placeholder="Search fields..."
                        className="h-7 pl-7 text-xs"
                      />
                    </div>
                  </div>
                  
                  {/* Three-column cascading picker */}
                  <div className="flex-1 flex min-h-0">
                    {/* Column 1: Object categories */}
                    <div className="w-1/3 border-r overflow-y-auto bg-gray-50">
                      {/* Current Object */}
                      <button
                        type="button"
                        onClick={() => {
                          setExpandedParents({});
                        }}
                        className={`w-full text-left px-2 py-1.5 text-xs flex items-center justify-between hover:bg-blue-50 border-b ${
                          Object.keys(expandedParents).length === 0 ? 'bg-blue-100 text-blue-700 font-medium' : ''
                        }`}
                      >
                        <span className="truncate">{objectLabel || objectName}</span>
                        <ChevronRight className="w-3 h-3 text-gray-400 flex-shrink-0" />
                      </button>
                      
                      {/* Parent lookup categories */}
                      {Object.keys(parentFields).map(parentName => (
                        <button
                          key={parentName}
                          type="button"
                          onClick={() => setExpandedParents({ [parentName]: true })}
                          className={`w-full text-left px-2 py-1.5 text-xs flex items-center justify-between hover:bg-blue-50 border-b ${
                            expandedParents[parentName] ? 'bg-blue-100 text-blue-700 font-medium' : ''
                          }`}
                        >
                          <span className="flex items-center gap-1 truncate">
                            <Link2 className="w-3 h-3 text-indigo-500 flex-shrink-0" />
                            <span className="truncate">{parentName}</span>
                          </span>
                          <ChevronRight className="w-3 h-3 text-gray-400 flex-shrink-0" />
                        </button>
                      ))}
                    </div>
                    
                    {/* Column 2: Fields of selected object */}
                    <div className="w-1/3 border-r overflow-y-auto">
                      {Object.keys(expandedParents).length === 0 ? (
                        // Show current object fields
                        filteredFields.map(field => {
                          const isLookup = field.api_name?.endsWith('_id') && parentFields[
                            Object.keys(parentFields).find(k => k.toLowerCase() === field.api_name.replace('_id', '').toLowerCase())
                          ];
                          return (
                            <button
                              key={field.api_name}
                              type="button"
                              onClick={() => {
                                if (isLookup) {
                                  // Drill into parent fields
                                  const parentKey = Object.keys(parentFields).find(k => 
                                    k.toLowerCase() === field.api_name.replace('_id', '').toLowerCase()
                                  );
                                  if (parentKey) {
                                    setExpandedParents({ [parentKey]: true });
                                  }
                                } else {
                                  insertField(field.api_name);
                                }
                              }}
                              className="w-full text-left px-2 py-1.5 text-xs hover:bg-blue-50 border-b border-gray-100 flex items-center justify-between"
                              data-testid={`field-${field.api_name}`}
                            >
                              <span className="truncate">{field.label}</span>
                              {isLookup && <ChevronRight className="w-3 h-3 text-indigo-400 flex-shrink-0" />}
                            </button>
                          );
                        })
                      ) : (
                        // Show parent fields for selected lookup
                        Object.entries(expandedParents).map(([parentName]) => (
                          (filteredParentFields[parentName] || parentFields[parentName] || []).map(field => (
                            <button
                              key={field.full_path || field.name}
                              type="button"
                              onClick={() => insertField(field.full_path || field.name)}
                              className="w-full text-left px-2 py-1.5 text-xs hover:bg-indigo-50 border-b border-gray-100"
                              data-testid={`parent-field-${field.full_path}`}
                            >
                              <span className="truncate">{field.label}</span>
                            </button>
                          ))
                        ))
                      )}
                      {Object.keys(expandedParents).length === 0 && filteredFields.length === 0 && (
                        <div className="p-3 text-xs text-gray-400 text-center">No fields</div>
                      )}
                    </div>
                    
                    {/* Column 3: Parent fields when drilling into lookup OR hint */}
                    <div className="w-1/3 overflow-y-auto bg-gray-50">
                      {Object.keys(expandedParents).length > 0 ? (
                        // Show parent field details/path
                        Object.entries(expandedParents).map(([parentName]) => (
                          (filteredParentFields[parentName] || parentFields[parentName] || []).map(field => (
                            <button
                              key={`detail-${field.full_path || field.name}`}
                              type="button"
                              onClick={() => insertField(field.full_path || field.name)}
                              className="w-full text-left px-2 py-1.5 text-xs hover:bg-indigo-50 border-b border-gray-100"
                            >
                              <div className="text-[10px] text-indigo-600 font-mono truncate">
                                {field.full_path || field.name}
                              </div>
                            </button>
                          ))
                        ))
                      ) : (
                        <div className="p-3 text-xs text-gray-400 text-center">
                          Click a lookup field with → to see parent fields
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Middle: Formula Editor */}
                <div className="col-span-4 border rounded-lg overflow-hidden flex flex-col">
                  <div className="px-3 py-2 bg-gray-50 border-b flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-gray-700">Formula Expression</h4>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={validateFormula}
                      disabled={validating || !expression}
                      className="h-7 text-xs"
                      data-testid="validate-formula-btn"
                    >
                      {validating ? <Loader className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                      <span className="ml-1">Check Syntax</span>
                    </Button>
                  </div>
                  <div className="flex-1 p-2">
                    <Textarea
                      ref={textareaRef}
                      value={expression}
                      onChange={(e) => {
                        setExpression(e.target.value);
                        setValidationResult(null);
                      }}
                      placeholder={`Enter your formula here...

Examples:
• first_name & ' ' & last_name
• IF(amount > 1000, 'High', 'Low')
• Account.industry
• IMAGE(logo_url, 'Logo', 40, 40)
• QRCODE(email, 150)`}
                      className={`h-full font-mono text-sm resize-none ${
                        errors.expression ? 'border-red-500' : ''
                      }`}
                      data-testid="formula-expression-input"
                    />
                  </div>
                  
                  {/* Validation Result */}
                  {validationResult && (
                    <div className={`px-3 py-2 border-t text-sm ${
                      validationResult.is_valid 
                        ? 'bg-green-50 text-green-700' 
                        : 'bg-red-50 text-red-700'
                    }`}>
                      {validationResult.is_valid ? (
                        <div className="flex items-center gap-2">
                          <Check className="w-4 h-4" />
                          Formula syntax is valid
                          {validationResult.dependencies?.length > 0 && (
                            <span className="text-xs text-green-600">
                              ({validationResult.dependencies.length} field{validationResult.dependencies.length > 1 ? 's' : ''} referenced)
                            </span>
                          )}
                        </div>
                      ) : (
                        <div>
                          {validationResult.errors?.map((err, i) => (
                            <div key={i} className="flex items-center gap-2">
                              <AlertCircle className="w-4 h-4 flex-shrink-0" />
                              {err}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Test with Record */}
                  <div className="px-3 py-2 border-t bg-gray-50">
                    <div className="flex items-center gap-2">
                      <Input
                        value={testRecordId}
                        onChange={(e) => setTestRecordId(e.target.value)}
                        placeholder="Enter record ID to test"
                        className="h-8 text-sm flex-1"
                        data-testid="test-record-id"
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={testFormula}
                        disabled={testing || !expression || !testRecordId}
                        className="h-8"
                        data-testid="test-formula-btn"
                      >
                        {testing ? <Loader className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                        <span className="ml-1">Test</span>
                      </Button>
                    </div>
                    {testResult && (
                      <div className={`mt-2 p-2 rounded text-sm ${
                        testResult.success ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                      }`} data-testid="test-result">
                        {testResult.success ? (
                          <div>
                            <strong>Result:</strong>{' '}
                            {String(testResult.result).startsWith('<') ? (
                              <span dangerouslySetInnerHTML={{ __html: testResult.result }} />
                            ) : (
                              String(testResult.result)
                            )}
                          </div>
                        ) : (
                          <span>{testResult.error}</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Right: Function Library */}
                <div className="col-span-4 border rounded-lg overflow-hidden flex flex-col bg-gray-50">
                  <div className="px-3 py-2 bg-white border-b">
                    <h4 className="text-sm font-semibold text-gray-700 mb-2">Functions</h4>
                    <div className="flex gap-2 mb-2">
                      <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                        <SelectTrigger className="h-8 text-xs flex-1" data-testid="function-category-select">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {functionCategories.map(cat => {
                            const IconComponent = CATEGORY_ICONS[cat] || Code2;
                            return (
                              <SelectItem key={cat} value={cat}>
                                <span className="flex items-center gap-2">
                                  <IconComponent className="w-3.5 h-3.5" />
                                  {cat === 'all' ? 'All Categories' : cat}
                                </span>
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="relative">
                      <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                      <Input
                        value={functionSearch}
                        onChange={(e) => setFunctionSearch(e.target.value)}
                        placeholder="Search functions..."
                        className="h-8 pl-7 text-xs"
                      />
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto p-2">
                    {filteredFunctions.map(func => {
                      const isDisplayUI = func.category === 'Display/UI';
                      const FuncIcon = isDisplayUI ? 
                        (func.name === 'IMAGE' ? Image : 
                         func.name === 'HYPERLINK' ? ExternalLink : 
                         func.name === 'QRCODE' ? QrCode : Code2) : Code2;
                      
                      return (
                        <button
                          key={func.name}
                          type="button"
                          onClick={() => insertFunction(func)}
                          className={`w-full text-left px-3 py-2 rounded transition-colors mb-1 ${
                            isDisplayUI 
                              ? 'hover:bg-purple-50 border border-purple-100' 
                              : 'hover:bg-emerald-50'
                          }`}
                          data-testid={`function-${func.name}`}
                        >
                          <div className="flex items-center justify-between mb-0.5">
                            <span className="flex items-center gap-1.5">
                              <FuncIcon className={`w-3.5 h-3.5 ${isDisplayUI ? 'text-purple-500' : 'text-emerald-600'}`} />
                              <span className="font-semibold text-sm text-gray-900">{func.name}</span>
                            </span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                              isDisplayUI 
                                ? 'bg-purple-100 text-purple-700' 
                                : 'bg-gray-100 text-gray-600'
                            }`}>
                              {func.category}
                            </span>
                          </div>
                          <div className="text-xs text-gray-500 mb-0.5">{func.description}</div>
                          <div className="text-[10px] text-gray-400 font-mono bg-gray-100 px-1.5 py-0.5 rounded">
                            {func.syntax}
                          </div>
                        </button>
                      );
                    })}
                    {filteredFunctions.length === 0 && (
                      <div className="text-center py-8 text-gray-400 text-sm">
                        No functions found
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Blank handling */}
              <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg">
                <Switch
                  id="blankAsZero"
                  checked={blankAsZero}
                  onCheckedChange={setBlankAsZero}
                />
                <div>
                  <Label htmlFor="blankAsZero" className="text-sm font-medium cursor-pointer">
                    Treat blank fields as zero
                  </Label>
                  <p className="text-xs text-gray-500">
                    If disabled, blank fields will cause the formula to return blank
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Layout */}
          {currentStep === 2 && (
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
              <Button onClick={handleNext} data-testid="formula-wizard-next">
                Next
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            ) : (
              <Button onClick={handleSave} disabled={saving} data-testid="formula-wizard-save">
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

export default FormulaFieldWizard;
