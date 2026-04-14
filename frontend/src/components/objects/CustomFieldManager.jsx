/**
 * CustomFieldManager - Custom Fields Management Components
 * Extracted from App.js for better maintainability
 */
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';

// UI Components
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Switch } from '../ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';

// Icons
import {
  Plus,
  Edit,
  Trash2,
  FileText,
  Settings,
  X,
} from 'lucide-react';

// Import ManageObjectsTab from sibling file
import { ManageObjectsTab } from './ManageObjectsTab';

// Import RecordTypeManager
import RecordTypeManager from '../RecordTypeManager';

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
 * AddCustomFieldDialog - Dialog for adding custom fields
 */
export const AddCustomFieldDialog = ({ isOpen, onClose, objectName, onFieldAdded }) => {
  const [formData, setFormData] = useState({
    label: '',
    api_name: '',
    type: 'Text',
    options: [],
    default_value: '',
    is_required: false,
    currency_symbol: '$',
    decimal_places: 2,
    formula_expression: '',
    formula_return_type: 'Text',
    length: 18
  });
  const [optionInput, setOptionInput] = useState('');
  const [saving, setSaving] = useState(false);

  const handleLabelChange = (label) => {
    setFormData({
      ...formData,
      label,
      // Auto-generate API name from label
      api_name: label.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
    });
  };

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

    if (!formData.label || !formData.api_name) {
      toast.error('Label and API Name are required');
      return;
    }

    if (formData.type === 'Picklist' && formData.options.length === 0) {
      toast.error('Picklist type requires at least one option');
      return;
    }

    // Validate Geolocation has both lat and lng
    if (formData.type === 'Geolocation') {
      if (!formData.latitude_field && !formData.longitude_field) {
        // Auto-create field names for geolocation
        formData.latitude_field = `${formData.api_name}_lat`;
        formData.longitude_field = `${formData.api_name}_lng`;
      }
    }

    // Validate Formula has expression
    if (formData.type === 'Formula' && !formData.formula_expression) {
      toast.error('Formula type requires an expression');
      return;
    }

    setSaving(true);
    try {
      await axios.post(`${API}/metadata/${objectName}/fields`, formData);
      toast.success('Custom field added successfully');
      onFieldAdded();
    } catch (error) {
      console.error('Error adding field:', error);
      toast.error(error.response?.data?.detail || 'Failed to add custom field');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add Custom Field</DialogTitle>
          <DialogDescription>
            Create a new custom field for {objectName}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Field Label */}
          <div>
            <Label htmlFor="label">Field Label *</Label>
            <Input
              id="label"
              value={formData.label}
              onChange={(e) => handleLabelChange(e.target.value)}
              placeholder="e.g., Industry, Annual Revenue"
              required
            />
          </div>

          {/* API Name */}
          <div>
            <Label htmlFor="api_name">API Name *</Label>
            <Input
              id="api_name"
              value={formData.api_name}
              onChange={(e) => setFormData({ ...formData, api_name: e.target.value })}
              placeholder="e.g., industry, annual_revenue"
              className="font-mono"
              required
            />
            <p className="text-xs text-slate-500 mt-1">
              Lowercase letters, numbers, and underscores only
            </p>
          </div>

          {/* Field Type */}
          <div>
            <Label htmlFor="type">Field Type *</Label>
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
                  <Label htmlFor="currency_symbol" className="text-sm">Currency Symbol</Label>
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
                  <Label htmlFor="decimal_places" className="text-sm">Decimal Places</Label>
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
                  <Label htmlFor="decimal_places" className="text-sm">Decimal Places</Label>
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
                  <Label htmlFor="length" className="text-sm">Length (max digits)</Label>
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
                This will create two sub-fields: <code className="bg-blue-100 px-1 rounded">{formData.api_name || 'field'}_lat</code> (Latitude) and <code className="bg-blue-100 px-1 rounded">{formData.api_name || 'field'}_lng</code> (Longitude).
              </p>
              <div className="grid grid-cols-2 gap-3 mt-3">
                <div>
                  <Label htmlFor="decimal_places" className="text-sm">Decimal Places</Label>
                  <Select
                    value={String(formData.decimal_places || 6)}
                    onValueChange={(value) => setFormData({ ...formData, decimal_places: parseInt(value) })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="4">4 (~11m accuracy)</SelectItem>
                      <SelectItem value="5">5 (~1.1m accuracy)</SelectItem>
                      <SelectItem value="6">6 (~0.11m accuracy)</SelectItem>
                      <SelectItem value="7">7 (very precise)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
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
                <Label htmlFor="formula_return_type" className="text-sm">Return Type</Label>
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
              <Label htmlFor="default_value">Default Value</Label>
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
                  id="default_value"
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
                id="default_checked"
                checked={formData.default_value === true || formData.default_value === 'true'}
                onCheckedChange={(checked) => setFormData({ ...formData, default_value: checked })}
              />
              <Label htmlFor="default_checked" className="cursor-pointer">
                Default: Checked
              </Label>
            </div>
          )}

          {/* Required Checkbox */}
          <div className="flex items-center space-x-2">
            <Switch
              id="is_required"
              checked={formData.is_required}
              onCheckedChange={(checked) => setFormData({ ...formData, is_required: checked })}
            />
            <Label htmlFor="is_required" className="cursor-pointer">
              Make this field required
            </Label>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end space-x-2 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving} className="bg-indigo-600 hover:bg-indigo-700">
              {saving ? 'Adding...' : 'Add Field'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

/**
 * EditCustomFieldDialog - Dialog for editing custom fields
 */
export const EditCustomFieldDialog = ({ isOpen, onClose, objectName, field, onFieldUpdated }) => {
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

/**
 * CustomFieldManager - Main dialog for managing fields and objects
 */
export const CustomFieldManager = ({ isOpen, onClose, objects }) => {
  const [activeTab, setActiveTab] = useState('fields'); // 'fields' or 'objects'
  const [selectedObject, setSelectedObject] = useState('');
  const [fields, setFields] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showAddField, setShowAddField] = useState(false);
  const [editingField, setEditingField] = useState(null);

  useEffect(() => {
    if (selectedObject && isOpen) {
      fetchCustomFields();
    }
  }, [selectedObject, isOpen]);

  const fetchCustomFields = async () => {
    if (!selectedObject) return;

    setLoading(true);
    try {
      // Fetch the complete object definition (includes both system and custom fields)
      const response = await axios.get(`${API}/objects/${selectedObject}`);

      // Convert fields object to array format
      const fieldsArray = Object.entries(response.data.fields).map(([key, field]) => ({
        id: field.id || key, // Use existing id or fallback to key
        api_name: key,
        label: field.label,
        type: field.type.charAt(0).toUpperCase() + field.type.slice(1), // Capitalize type
        options: field.options || null,
        default_value: field.default || null,
        is_required: field.required || false,
        is_custom: field.is_custom || false
      }));

      setFields(fieldsArray);
    } catch (error) {
      console.error('Error fetching fields:', error);
      toast.error('Failed to load fields');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteField = async (field) => {
    const fieldType = field.is_custom ? 'custom field' : 'system field';
    const warningMessage = field.is_custom
      ? 'Are you sure you want to delete this custom field? This action cannot be undone.'
      : '⚠️ WARNING: You are about to delete a SYSTEM field! This may break functionality. Are you absolutely sure?';

    if (!window.confirm(warningMessage)) {
      return;
    }

    try {
      if (field.is_custom) {
        // Delete custom field via metadata API
        await axios.delete(`${API}/metadata/${selectedObject}/fields/${field.id}`);
      } else {
        // For system fields, we need to add them to a "hidden fields" list in metadata
        await axios.post(`${API}/metadata/${selectedObject}/hide-field`, {
          field_name: field.api_name
        });
      }

      toast.success(`${field.label} deleted successfully`);
      fetchCustomFields();

      // Trigger a refresh of the object in the dashboard
      window.location.reload();
    } catch (error) {
      console.error('Error deleting field:', error);
      toast.error(`Failed to delete ${fieldType}`);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center text-xl">
            <Settings className="h-5 w-5 mr-2" />
            Object & Field Manager
          </DialogTitle>
          <DialogDescription>
            Manage custom objects and fields for your CRM
          </DialogDescription>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex space-x-1 border-b mb-4">
          <Button
            variant={activeTab === 'fields' ? 'default' : 'ghost'}
            onClick={() => setActiveTab('fields')}
            className="rounded-b-none"
          >
            Manage Fields
          </Button>
          <Button
            variant={activeTab === 'objects' ? 'default' : 'ghost'}
            onClick={() => setActiveTab('objects')}
            className="rounded-b-none"
          >
            Manage Objects
          </Button>
        </div>

        {/* Fields Tab */}
        {activeTab === 'fields' && (
          <div className="space-y-4">
            {/* Object Selector */}
            <div>
              <Label>Select Object</Label>
              <Select value={selectedObject} onValueChange={setSelectedObject}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choose an object..." />
                </SelectTrigger>
                <SelectContent>
                  {objects.map((obj) => (
                    <SelectItem key={obj.object_name} value={obj.object_name}>
                      {obj.object_label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedObject && (
              <>
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">
                    Fields for {objects.find(o => o.object_name === selectedObject)?.object_label}
                  </h3>
                  <Button
                    onClick={() => setShowAddField(true)}
                    className="bg-indigo-600 hover:bg-indigo-700"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Field
                  </Button>
                </div>

                {/* Fields Table */}
                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                  </div>
                ) : fields.length === 0 ? (
                  <div className="text-center py-8 text-slate-500">
                    <FileText className="h-12 w-12 mx-auto mb-3 text-slate-300" />
                    <p>No fields found</p>
                    <p className="text-sm">Click "Add Field" to create a custom field</p>
                  </div>
                ) : (
                  <div className="border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader className="bg-slate-50">
                        <TableRow>
                          <TableHead>Field Label</TableHead>
                          <TableHead>API Name</TableHead>
                          <TableHead>Data Type</TableHead>
                          <TableHead>Required</TableHead>
                          <TableHead>Field Type</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {fields.map((field) => (
                          <TableRow key={field.id || field.api_name}>
                            <TableCell className="font-medium">
                              {field.label}
                            </TableCell>
                            <TableCell className="font-mono text-sm text-slate-600">
                              {field.api_name}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">{field.type}</Badge>
                            </TableCell>
                            <TableCell>
                              {field.is_required ? (
                                <Badge className="bg-red-100 text-red-800">Required</Badge>
                              ) : (
                                <span className="text-slate-400">-</span>
                              )}
                            </TableCell>
                            <TableCell>
                              {field.is_custom ? (
                                <span className="text-indigo-600 font-medium">Custom</span>
                              ) : (
                                <span className="text-slate-600">Standard</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end space-x-2">
                                {field.is_custom && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setEditingField(field)}
                                    className="text-indigo-600 hover:text-indigo-700"
                                    title="Edit custom field"
                                  >
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                )}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDeleteField(field)}
                                  className="text-red-600 hover:text-red-700"
                                  title={field.is_custom ? 'Delete custom field' : 'Delete system field (Warning!)'}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Objects Tab */}
        {activeTab === 'objects' && (
          <ManageObjectsTab objects={objects} onObjectsChanged={() => window.location.reload()} />
        )}

        {/* Record Types Tab */}
        {activeTab === 'recordTypes' && (
          <RecordTypeManager objects={objects} />
        )}
      </DialogContent>

      {/* Add Field Dialog */}
      {showAddField && (
        <AddCustomFieldDialog
          isOpen={showAddField}
          onClose={() => setShowAddField(false)}
          objectName={selectedObject}
          onFieldAdded={() => {
            fetchCustomFields();
            setShowAddField(false);
          }}
        />
      )}

      {/* Edit Field Dialog */}
      {editingField && (
        <EditCustomFieldDialog
          isOpen={!!editingField}
          onClose={() => setEditingField(null)}
          objectName={selectedObject}
          field={editingField}
          onFieldUpdated={() => {
            fetchCustomFields();
            setEditingField(null);
            window.location.reload(); // Refresh to show updated field
          }}
        />
      )}
    </Dialog>
  );
};

export default CustomFieldManager;
