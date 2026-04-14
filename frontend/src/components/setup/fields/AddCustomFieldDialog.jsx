/**
 * AddCustomFieldDialog - Dialog for creating new custom fields
 * Extracted from App.js for better maintainability
 */
import React, { useState } from 'react';
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
 * AddCustomFieldDialog Component
 */
const AddCustomFieldDialog = ({ isOpen, onClose, objectName, onFieldAdded }) => {
  const [formData, setFormData] = useState({
    label: '',
    api_name: '',
    type: 'Text',
    options: [],
    default_value: '',
    is_required: false,
    is_searchable: false,
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

    if (formData.type === 'Geolocation') {
      if (!formData.latitude_field && !formData.longitude_field) {
        formData.latitude_field = `${formData.api_name}_lat`;
        formData.longitude_field = `${formData.api_name}_lng`;
      }
    }

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

          {/* Include in Global Search - Only for searchable field types */}
          {['Text', 'Textarea', 'Email', 'Phone', 'URL', 'Picklist'].includes(formData.type) && (
            <div className="flex items-center space-x-2">
              <Switch
                id="is_searchable"
                checked={formData.is_searchable}
                onCheckedChange={(checked) => setFormData({ ...formData, is_searchable: checked })}
                data-testid="include-in-search-toggle"
              />
              <Label htmlFor="is_searchable" className="cursor-pointer">
                Include in Global Search
              </Label>
            </div>
          )}

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

export default AddCustomFieldDialog;
