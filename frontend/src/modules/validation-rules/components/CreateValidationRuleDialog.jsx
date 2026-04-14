/**
 * Create/Edit Validation Rule Dialog
 */
import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../../components/ui/dialog';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Textarea } from '../../../components/ui/textarea';
import { Switch } from '../../../components/ui/switch';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '../../../components/ui/select';
import { Loader2, Shield, AlertCircle, Monitor, Link } from 'lucide-react';
import { toast } from 'react-hot-toast';
import ConditionBuilder from './ConditionBuilder';

const CreateValidationRuleDialog = ({ open, onOpenChange, fields, parentFieldGroups = {}, onSave, editRule, objectName = '', objectLabel = '' }) => {
  const [ruleName, setRuleName] = useState('');
  const [description, setDescription] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [conditions, setConditions] = useState([{ field_name: '', operator: 'equals', value: '' }]);
  const [logicOperator, setLogicOperator] = useState('AND');
  const [errorMessage, setErrorMessage] = useState('');
  const [errorLocation, setErrorLocation] = useState('page'); // 'page' or 'field'
  const [errorField, setErrorField] = useState(''); // Field to show error on
  const [loading, setLoading] = useState(false);

  const hasParentFields = Object.keys(parentFieldGroups).length > 0;

  useEffect(() => {
    if (editRule) {
      setRuleName(editRule.rule_name || '');
      setDescription(editRule.description || '');
      setIsActive(editRule.is_active ?? true);
      setConditions(editRule.conditions || [{ field_name: '', operator: 'equals', value: '' }]);
      setLogicOperator(editRule.logic_operator || 'AND');
      setErrorMessage(editRule.error_message || '');
      setErrorLocation(editRule.error_location || 'page');
      setErrorField(editRule.error_field || '');
    } else {
      // Reset for new rule
      setRuleName('');
      setDescription('');
      setIsActive(true);
      setConditions([{ field_name: '', operator: 'equals', value: '' }]);
      setLogicOperator('AND');
      setErrorMessage('');
      setErrorLocation('page');
      setErrorField('');
    }
  }, [editRule, open]);

  const handleConditionChange = (index, field, value) => {
    const updated = [...conditions];
    updated[index] = { ...updated[index], [field]: value };
    setConditions(updated);
  };

  const handleAddCondition = () => {
    setConditions([...conditions, { field_name: '', operator: 'equals', value: '' }]);
  };

  const handleRemoveCondition = (index) => {
    if (conditions.length > 1) {
      setConditions(conditions.filter((_, i) => i !== index));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!ruleName.trim()) {
      toast.error('Rule name is required');
      return;
    }

    if (!errorMessage.trim()) {
      toast.error('Error message is required');
      return;
    }

    // Validate error field is selected when error location is field
    if (errorLocation === 'field' && !errorField) {
      toast.error('Please select a field to display the error on');
      return;
    }

    // Validate conditions
    const invalidConditions = conditions.filter(c => !c.field_name || !c.operator);
    if (invalidConditions.length > 0) {
      toast.error('All conditions must have a field and operator');
      return;
    }

    try {
      setLoading(true);
      await onSave({
        rule_name: ruleName.trim(),
        description: description.trim(),
        is_active: isActive,
        conditions: conditions,
        logic_operator: logicOperator,
        error_message: errorMessage.trim(),
        error_location: errorLocation,
        error_field: errorLocation === 'field' ? errorField : null
      });
      
      toast.success(editRule ? 'Rule updated successfully' : 'Rule created successfully');
      onOpenChange(false);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to save rule');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-indigo-600" />
            {editRule ? 'Edit Validation Rule' : 'Create Validation Rule'}
          </DialogTitle>
          <DialogDescription>
            Define error conditions - when these are TRUE, the save is BLOCKED
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            {/* Important guidance banner */}
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
              <p className="font-medium text-amber-800 mb-1">How Validation Rules Work</p>
              <p className="text-amber-700 text-xs">
                When the condition below is <strong>TRUE</strong>, the error message is shown and the record <strong>cannot be saved</strong>.
              </p>
              <p className="text-amber-600 text-xs mt-1">
                Example: To require a field, use <code className="bg-amber-100 px-1 rounded">Field "Is Empty"</code> - this blocks save when the field is blank.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Rule Name *</Label>
              <Input
                placeholder="e.g., Require Email for Qualified Leads"
                value={ruleName}
                onChange={(e) => setRuleName(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                placeholder="Describe what this rule validates..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
              />
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                checked={isActive}
                onCheckedChange={setIsActive}
              />
              <Label>Active</Label>
            </div>

            {/* Parent Fields Info Banner */}
            {hasParentFields && (
              <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 text-sm">
                <div className="flex items-center gap-2 text-indigo-700 font-medium">
                  <Link className="h-4 w-4" />
                  Parent Lookup Fields Available
                </div>
                <p className="text-indigo-600 text-xs mt-1">
                  You can reference parent object fields in conditions. Available lookups: {Object.keys(parentFieldGroups).join(', ')}
                </p>
              </div>
            )}

            <ConditionBuilder
              conditions={conditions}
              logicOperator={logicOperator}
              fields={fields}
              parentFieldGroups={parentFieldGroups}
              onChange={handleConditionChange}
              onLogicChange={setLogicOperator}
              onAddCondition={handleAddCondition}
              onRemoveCondition={handleRemoveCondition}
              objectName={objectName}
              objectLabel={objectLabel}
            />

            <div className="space-y-2">
              <Label>Error Message *</Label>
              <Input
                placeholder="e.g., Email is required for qualified leads"
                value={errorMessage}
                onChange={(e) => setErrorMessage(e.target.value)}
                required
              />
            </div>

            {/* Error Location - Salesforce-like */}
            <div className="border rounded-lg p-4 bg-slate-50 space-y-4">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <AlertCircle className="h-4 w-4" />
                Error Display Settings
              </div>
              
              <div className="space-y-2">
                <Label>Error Location *</Label>
                <Select value={errorLocation} onValueChange={setErrorLocation}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="page">
                      <div className="flex items-center gap-2">
                        <Monitor className="h-4 w-4" />
                        <span>Page / Screen (Toast notification)</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="field">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="h-4 w-4" />
                        <span>Field (Show below specific field)</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-slate-500">
                  {errorLocation === 'page' 
                    ? 'Error will be shown as a toast notification at the top of the screen'
                    : 'Error will be shown directly below the selected field with red highlight'
                  }
                </p>
              </div>

              {errorLocation === 'field' && (
                <div className="space-y-2">
                  <Label>Error Field *</Label>
                  <Select value={errorField} onValueChange={setErrorField}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select field to show error on..." />
                    </SelectTrigger>
                    <SelectContent>
                      {fields.map(field => (
                        <SelectItem key={field.name || field.key} value={field.name || field.key}>
                          {field.label || field.name || field.key}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-slate-500">
                    The error message will appear below this field with a red border
                  </p>
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                editRule ? 'Update Rule' : 'Create Rule'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default CreateValidationRuleDialog;