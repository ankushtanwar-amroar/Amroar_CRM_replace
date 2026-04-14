/**
 * Field Behavior Rules Panel
 * Main panel for configuring visibility, required, and readonly rules
 */
import React, { useState, useEffect } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../../components/ui/tabs';
import { Switch } from '../../../components/ui/switch';
import { Label } from '../../../components/ui/label';
import { 
  Eye, 
  EyeOff, 
  Asterisk, 
  Lock, 
  Unlock,
  AlertCircle
} from 'lucide-react';
import BasicRuleBuilder from './BasicRuleBuilder';
import FormulaRuleEditor from './FormulaRuleEditor';
import fieldBehaviorService from '../services/fieldBehaviorService';

const RuleSection = ({
  title,
  icon: Icon,
  iconColor,
  mode,
  onModeChange,
  modeOptions,
  ruleType,
  onRuleTypeChange,
  basicCondition,
  onBasicConditionChange,
  formula,
  onFormulaChange,
  availableFields,
  objectName
}) => {
  const showConditionBuilder = mode === 'conditional';

  return (
    <div className="space-y-3">
      {/* Mode Selection */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className={`h-4 w-4 ${iconColor}`} />
          <span className="text-sm font-medium text-slate-700">{title}</span>
        </div>
        <select
          value={mode}
          onChange={(e) => onModeChange(e.target.value)}
          className="h-7 text-xs border rounded px-2 bg-white"
        >
          {modeOptions.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {/* Condition Builder */}
      {showConditionBuilder && (
        <div className="pl-6 space-y-3">
          {/* Rule Type Toggle */}
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name={`${title}-type`}
                value="basic"
                checked={ruleType === 'basic'}
                onChange={() => onRuleTypeChange('basic')}
                className="text-blue-600"
              />
              <span className="text-xs text-slate-600">Basic Builder</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name={`${title}-type`}
                value="formula"
                checked={ruleType === 'formula'}
                onChange={() => onRuleTypeChange('formula')}
                className="text-blue-600"
              />
              <span className="text-xs text-slate-600">Advanced Formula</span>
            </label>
          </div>

          {/* Condition Editor */}
          {ruleType === 'basic' ? (
            <BasicRuleBuilder
              condition={basicCondition}
              onChange={onBasicConditionChange}
              availableFields={availableFields}
            />
          ) : (
            <FormulaRuleEditor
              formula={formula}
              onChange={onFormulaChange}
              availableFields={availableFields}
              objectName={objectName}
              onValidate={fieldBehaviorService.validateFormula.bind(fieldBehaviorService)}
            />
          )}
        </div>
      )}
    </div>
  );
};

const FieldBehaviorRulesPanel = ({
  fieldConfig,
  onChange,
  objectName,
  pageType = 'detail' // 'new' or 'detail'
}) => {
  const [availableFields, setAvailableFields] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  // Load available fields
  useEffect(() => {
    const loadFields = async () => {
      if (!objectName) return;
      
      setIsLoading(true);
      try {
        const fields = await fieldBehaviorService.getAvailableFields(objectName, 3);
        setAvailableFields(fields);
      } catch (err) {
        console.error('Failed to load fields:', err);
      } finally {
        setIsLoading(false);
      }
    };

    loadFields();
  }, [objectName]);

  // Initialize rules if not present
  const visibilityRule = fieldConfig?.visibilityRule || {
    mode: 'always',
    type: 'basic',
    basic: null,
    formula: ''
  };

  const requiredRule = fieldConfig?.requiredRule || {
    mode: 'conditional', // Default: not required
    type: 'basic',
    basic: null,
    formula: ''
  };

  const readonlyRule = fieldConfig?.readonlyRule || {
    mode: 'editable',
    type: 'basic',
    basic: null,
    formula: ''
  };

  const handleVisibilityChange = (updates) => {
    onChange({
      ...fieldConfig,
      visibilityRule: { ...visibilityRule, ...updates }
    });
  };

  const handleRequiredChange = (updates) => {
    onChange({
      ...fieldConfig,
      requiredRule: { ...requiredRule, ...updates }
    });
  };

  const handleReadonlyChange = (updates) => {
    onChange({
      ...fieldConfig,
      readonlyRule: { ...readonlyRule, ...updates }
    });
  };

  if (isLoading) {
    return (
      <div className="p-4 text-center text-sm text-slate-500">
        Loading field options...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="pb-3 border-b">
        <h4 className="text-sm font-semibold text-slate-800">Field Behavior Rules</h4>
        <p className="text-xs text-slate-500 mt-1">
          Configure when this field is visible, required, or read-only
        </p>
      </div>

      {/* Visibility Rule */}
      <RuleSection
        title="Visibility"
        icon={Eye}
        iconColor="text-blue-500"
        mode={visibilityRule.mode}
        onModeChange={(mode) => handleVisibilityChange({ mode })}
        modeOptions={[
          { value: 'always', label: 'Always Visible' },
          { value: 'conditional', label: 'Conditional' }
        ]}
        ruleType={visibilityRule.type}
        onRuleTypeChange={(type) => handleVisibilityChange({ type })}
        basicCondition={visibilityRule.basic}
        onBasicConditionChange={(basic) => handleVisibilityChange({ basic })}
        formula={visibilityRule.formula}
        onFormulaChange={(formula) => handleVisibilityChange({ formula })}
        availableFields={availableFields}
        objectName={objectName}
      />

      {/* Required Rule */}
      <RuleSection
        title="Required"
        icon={Asterisk}
        iconColor="text-red-500"
        mode={requiredRule.mode}
        onModeChange={(mode) => handleRequiredChange({ mode })}
        modeOptions={[
          { value: 'always', label: 'Always Required' },
          { value: 'conditional', label: 'Conditionally Required' }
        ]}
        ruleType={requiredRule.type}
        onRuleTypeChange={(type) => handleRequiredChange({ type })}
        basicCondition={requiredRule.basic}
        onBasicConditionChange={(basic) => handleRequiredChange({ basic })}
        formula={requiredRule.formula}
        onFormulaChange={(formula) => handleRequiredChange({ formula })}
        availableFields={availableFields}
        objectName={objectName}
      />

      {/* Read-Only Rule */}
      <RuleSection
        title="Read-Only"
        icon={Lock}
        iconColor="text-amber-500"
        mode={readonlyRule.mode}
        onModeChange={(mode) => handleReadonlyChange({ mode })}
        modeOptions={[
          { value: 'editable', label: 'Always Editable' },
          { value: 'always', label: 'Always Read-Only' },
          { value: 'conditional', label: 'Conditionally Read-Only' }
        ]}
        ruleType={readonlyRule.type}
        onRuleTypeChange={(type) => handleReadonlyChange({ type })}
        basicCondition={readonlyRule.basic}
        onBasicConditionChange={(basic) => handleReadonlyChange({ basic })}
        formula={readonlyRule.formula}
        onFormulaChange={(formula) => handleReadonlyChange({ formula })}
        availableFields={availableFields}
        objectName={objectName}
      />

      {/* Info Box */}
      <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
        <div className="flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-slate-400 flex-shrink-0 mt-0.5" />
          <div className="text-[10px] text-slate-600">
            <p className="font-medium mb-1">How Rules Work:</p>
            <ul className="list-disc ml-4 space-y-0.5">
              <li><strong>Visibility:</strong> Controls if the field is shown on the page</li>
              <li><strong>Required:</strong> Marks the field as mandatory (hidden fields are never required)</li>
              <li><strong>Read-Only:</strong> Prevents editing (field value is still displayed)</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FieldBehaviorRulesPanel;
