/**
 * EditCustomFieldDialog - Dialog for editing existing custom fields
 * Extracted from App.js for better maintainability
 */
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';

// UI Components
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Badge } from '../../../components/ui/badge';
import { Textarea } from '../../../components/ui/textarea';
import { Switch } from '../../../components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../../../components/ui/dialog';

// Icons
import { X } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Salesforce-style field types with descriptions
const fieldTypes = [
  { value: 'Text', label: 'Text', description: 'Text field up to 255 characters' },
  { value: 'Textarea', label: 'Text Area (Long)', description: 'Text area for longer content up to 32,000 characters' },
  { value: 'Number', label: 'Number', description: 'Whole or decimal numbers' },
  { value: 'Currency', label: 'Currency', description: 'Dollar amounts with currency symbol' },
  { value: 'Percent', label: 'Percent', description: 'Percentage values (stored as decimals)' },
  { value: 'Date', label: 'Date', description: 'Date without time' },
  { value: 'DateTime', label: 'Date/Time', description: 'Date and time combined' },
  { value: 'Checkbox', label: 'Checkbox', description: 'True/False toggle' },
  { value: 'Picklist', label: 'Picklist', description: 'Single select dropdown list' },
  { value: 'URL', label: 'URL', description: 'Web address link' },
  { value: 'Email', label: 'Email', description: 'Email address with validation' },
  { value: 'Phone', label: 'Phone', description: 'Phone number' },
  { value: 'Geolocation', label: 'Geolocation', description: 'Latitude and longitude coordinates' },
  { value: 'Formula', label: 'Formula', description: 'Calculated field based on other fields (read-only)' },
];

/**
 * EditCustomFieldDialog Component
 */
const EditCustomFieldDialog = ({ isOpen, onClose, objectName, field, onFieldUpdated }) => {
  const [formData, setFormData] = useState({
    label: field?.label || '',
    api_name: field?.api_name || '',
    type: field?.type || 'Text',
    options: field?.options || [],
    default_value: field?.default_value || '',
    is_required: field?.is_required || false
  });
  const [optionInput, setOptionInput] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (field) {
      setFormData({
        label: field.label || '',
        api_name: field.api_name || '',
        type: field.type || 'Text',
        options: field.options || [],
        default_value: field.default_value || '',
        is_required: field.is_required || false,
        currency_symbol: field.currency_symbol || '$',
        decimal_places: field.decimal_places || 2,
        formula_expression: field.formula_expression || '',
        formula_return_type: field.formula_return_type || 'Text',
        length: field.length || 18
      });
    }
  }, [field]);

  const handleAddOption = () => {
    if (optionInput.trim()) {
      setFormData({
        ...formData,
        options: [...formData.options, optionInput.trim()]
      });
      setOptionInput('');
    }
  };

  const handleRemoveOption = (index) => {
    setFormData({
      ...formData,
      options: formData.options.filter((_, i) => i !== index)
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.label) {
      toast.error('Label is required');
      return;
    }

    if (formData.type === 'Picklist' && formData.options.length === 0) {
      toast.error('Picklist type requires at least one option');
      return;
    }

    setSaving(true);
    try {
      await axios.put(`${API}/metadata/${objectName}/fields/${field.id}`, formData);
      toast.success('Custom field updated successfully');
      onFieldUpdated();
    } catch (error) {
      console.error('Error updating field:', error);
      toast.error(error.response?.data?.detail || 'Failed to update custom field');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit Custom Field</DialogTitle>
          <DialogDescription>
            Update the custom field for {objectName}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Field Label */}
          <div>
            <Label htmlFor="edit_label">Field Label *</Label>
            <Input
              id="edit_label"
              value={formData.label}
              onChange={(e) => setFormData({ ...formData, label: e.target.value })}
              placeholder="e.g., Industry, Annual Revenue"
              required
            />
          </div>

          {/* API Name - Read Only */}
          <div>
            <Label htmlFor="edit_api_name">API Name (Read Only)</Label>
            <Input
              id="edit_api_name"
              value={formData.api_name}
              disabled
              className="font-mono bg-slate-50"
            />
            <p className="text-xs text-slate-500 mt-1">
              API name cannot be changed after creation
            </p>
          </div>

          {/* Field Type */}
          <div>
            <Label htmlFor="edit_type">Field Type *</Label>
            <Select
              value={formData.type}
              onValueChange={(value) => setFormData({ ...formData, type: value, options: value === 'Picklist' ? formData.options : [] })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-80">
                {fieldTypes.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    <div className="flex flex-col">
                      <span className="font-medium">{type.label}</span>
                      <span className="text-xs text-slate-500">{type.description}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Picklist Options */}
          {formData.type === 'Picklist' && (
            <div className="p-3 bg-slate-50 rounded-lg border">
              <Label className="mb-2 block">Picklist Options *</Label>
              <div className="flex items-center space-x-2 mb-2">
                <Input
                  value={optionInput}
                  onChange={(e) => setOptionInput(e.target.value)}
                  placeholder="Enter option"
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddOption())}
                />
                <Button type="button" onClick={handleAddOption}>Add</Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {formData.options.map((option, index) => (
                  <Badge key={index} variant="secondary" className="pl-3 pr-1">
                    {option}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-4 w-4 p-0 ml-2"
                      onClick={() => handleRemoveOption(index)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Currency Settings */}
          {formData.type === 'Currency' && (
            <div className="p-3 bg-slate-50 rounded-lg border space-y-3">
              <Label className="mb-2 block">Currency Settings</Label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="edit_currency_symbol" className="text-sm">Currency Symbol</Label>
                  <Select
                    value={formData.currency_symbol || '$'}
                    onValueChange={(value) => setFormData({ ...formData, currency_symbol: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="$">$ (USD)</SelectItem>
                      <SelectItem value="€">€ (EUR)</SelectItem>
                      <SelectItem value="£">£ (GBP)</SelectItem>
                      <SelectItem value="¥">¥ (JPY/CNY)</SelectItem>
                      <SelectItem value="₹">₹ (INR)</SelectItem>
                      <SelectItem value="₽">₽ (RUB)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="edit_decimal_places" className="text-sm">Decimal Places</Label>
                  <Select
                    value={String(formData.decimal_places || 2)}
                    onValueChange={(value) => setFormData({ ...formData, decimal_places: parseInt(value) })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">0</SelectItem>
                      <SelectItem value="2">2</SelectItem>
                      <SelectItem value="3">3</SelectItem>
                      <SelectItem value="4">4</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}

          {/* Number/Percent Settings */}
          {(formData.type === 'Number' || formData.type === 'Percent') && (
            <div className="p-3 bg-slate-50 rounded-lg border space-y-3">
              <Label className="mb-2 block">{formData.type} Settings</Label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="edit_decimal_places" className="text-sm">Decimal Places</Label>
                  <Select
                    value={String(formData.decimal_places || 0)}
                    onValueChange={(value) => setFormData({ ...formData, decimal_places: parseInt(value) })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">0</SelectItem>
                      <SelectItem value="1">1</SelectItem>
                      <SelectItem value="2">2</SelectItem>
                      <SelectItem value="3">3</SelectItem>
                      <SelectItem value="4">4</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="edit_length" className="text-sm">Length (max digits)</Label>
                  <Input
                    type="number"
                    value={formData.length || 18}
                    onChange={(e) => setFormData({ ...formData, length: parseInt(e.target.value) })}
                    placeholder="18"
                    min={1}
                    max={18}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Geolocation Settings */}
          {formData.type === 'Geolocation' && (
            <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
              <Label className="mb-2 block text-blue-800">Geolocation Info</Label>
              <p className="text-sm text-blue-700">
                Uses sub-fields: <code className="bg-blue-100 px-1 rounded">{formData.api_name || 'field'}_lat</code> and <code className="bg-blue-100 px-1 rounded">{formData.api_name || 'field'}_lng</code>
              </p>
            </div>
          )}

          {/* Formula Field */}
          {formData.type === 'Formula' && (
            <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 space-y-3">
              <Label className="mb-2 block text-amber-800">Formula Expression *</Label>
              <Textarea
                value={formData.formula_expression || ''}
                onChange={(e) => setFormData({ ...formData, formula_expression: e.target.value })}
                placeholder="e.g., amount * quantity or CONCAT(first_name, ' ', last_name)"
                rows={3}
                className="font-mono text-sm"
              />
              <p className="text-xs text-amber-700">
                Use field API names. Supported: +, -, *, /, CONCAT(), IF(), NOW(), TODAY()
              </p>
              <div>
                <Label htmlFor="edit_formula_return_type" className="text-sm">Return Type</Label>
                <Select
                  value={formData.formula_return_type || 'Text'}
                  onValueChange={(value) => setFormData({ ...formData, formula_return_type: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Text">Text</SelectItem>
                    <SelectItem value="Number">Number</SelectItem>
                    <SelectItem value="Currency">Currency</SelectItem>
                    <SelectItem value="Percent">Percent</SelectItem>
                    <SelectItem value="Date">Date</SelectItem>
                    <SelectItem value="Checkbox">Checkbox</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* Default Value - Only for certain types */}
          {!['Checkbox', 'Formula', 'Geolocation'].includes(formData.type) && (
            <div>
              <Label htmlFor="edit_default_value">Default Value</Label>
              {formData.type === 'Picklist' ? (
                <Select
                  value={formData.default_value}
                  onValueChange={(value) => setFormData({ ...formData, default_value: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select default..." />
                  </SelectTrigger>
                  <SelectContent>
                    {formData.options.map((option) => (
                      <SelectItem key={option} value={option}>{option}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  id="edit_default_value"
                  type={
                    formData.type === 'Number' || formData.type === 'Currency' || formData.type === 'Percent' ? 'number' : 
                    formData.type === 'Date' ? 'date' : 
                    formData.type === 'DateTime' ? 'datetime-local' :
                    formData.type === 'URL' ? 'url' :
                    formData.type === 'Email' ? 'email' :
                    'text'
                  }
                  step={formData.type === 'Currency' || formData.type === 'Percent' ? '0.01' : undefined}
                  value={formData.default_value}
                  onChange={(e) => setFormData({ ...formData, default_value: e.target.value })}
                  placeholder={
                    formData.type === 'URL' ? 'https://example.com' :
                    formData.type === 'Email' ? 'email@example.com' :
                    formData.type === 'Phone' ? '+1 (555) 123-4567' :
                    'Optional default value'
                  }
                />
              )}
            </div>
          )}

          {/* Checkbox Default */}
          {formData.type === 'Checkbox' && (
            <div className="flex items-center space-x-2 p-3 bg-slate-50 rounded-lg border">
              <Switch
                id="edit_default_checked"
                checked={formData.default_value === true || formData.default_value === 'true'}
                onCheckedChange={(checked) => setFormData({ ...formData, default_value: checked })}
              />
              <Label htmlFor="edit_default_checked" className="cursor-pointer">
                Default: Checked
              </Label>
            </div>
          )}

          {/* Required Checkbox */}
          <div className="flex items-center space-x-2">
            <Switch
              id="edit_is_required"
              checked={formData.is_required}
              onCheckedChange={(checked) => setFormData({ ...formData, is_required: checked })}
            />
            <Label htmlFor="edit_is_required" className="cursor-pointer">
              Make this field required
            </Label>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end space-x-2 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving} className="bg-indigo-600 hover:bg-indigo-700">
              {saving ? 'Updating...' : 'Update Field'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default EditCustomFieldDialog;
