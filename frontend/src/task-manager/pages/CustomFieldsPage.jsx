/**
 * Custom Fields Admin Page
 * Setup → Task Manager → Custom Fields
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Badge } from '../../components/ui/badge';
import { Switch } from '../../components/ui/switch';
import { Textarea } from '../../components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table';
import {
  ArrowLeft,
  Plus,
  Edit2,
  Trash2,
  Search,
  Type,
  Hash,
  List,
  Calendar,
  CheckSquare,
  GripVertical,
  Loader2,
  Globe,
  FolderOpen,
  X,
  Calculator,
  AlertCircle,
  CheckCircle,
} from 'lucide-react';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const FIELD_TYPES = [
  { value: 'text', label: 'Text', icon: Type, description: 'Single line text' },
  { value: 'number', label: 'Number', icon: Hash, description: 'Numeric values' },
  { value: 'dropdown', label: 'Dropdown', icon: List, description: 'Select from options' },
  { value: 'date', label: 'Date', icon: Calendar, description: 'Date picker' },
  { value: 'checkbox', label: 'Checkbox', icon: CheckSquare, description: 'Yes/No toggle' },
  { value: 'formula', label: 'Formula', icon: Calculator, description: 'Calculated value' },
];

const getFieldIcon = (type) => {
  const found = FIELD_TYPES.find(f => f.value === type);
  return found ? found.icon : Type;
};

const CustomFieldsPage = () => {
  const navigate = useNavigate();
  const [fields, setFields] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingField, setEditingField] = useState(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    label: '',
    field_type: 'text',
    scope: 'global',
    project_id: null,
    is_required: false,
    default_value: '',
    options: [],
    description: '',
    formula_expression: '',
  });
  const [optionInput, setOptionInput] = useState('');
  const [formulaValidation, setFormulaValidation] = useState({ valid: null, error: null, checking: false });
  const [availableFields, setAvailableFields] = useState([]);

  const fetchFields = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/api/task-manager/custom-fields`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setFields(data);
      }
    } catch (error) {
      console.error('Error fetching fields:', error);
      toast.error('Failed to load custom fields');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchProjects = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/api/task-manager/projects`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setProjects(data);
      }
    } catch (error) {
      console.error('Error fetching projects:', error);
    }
  }, []);

  useEffect(() => {
    fetchFields();
    fetchProjects();
  }, [fetchFields, fetchProjects]);

  // Fetch available numeric fields for formula references
  const fetchAvailableFields = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/api/task-manager/custom-fields`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        // Filter to only number, checkbox, and formula fields (numeric types)
        const numericFields = data.filter(f => 
          ['number', 'checkbox', 'formula'].includes(f.field_type) &&
          f.api_name !== formData.api_name // Exclude self
        );
        setAvailableFields(numericFields);
      }
    } catch (error) {
      console.error('Error fetching available fields:', error);
    }
  }, [formData.api_name]);

  useEffect(() => {
    if (formData.field_type === 'formula') {
      fetchAvailableFields();
    }
  }, [formData.field_type, fetchAvailableFields]);

  const resetForm = () => {
    setFormData({
      label: '',
      field_type: 'text',
      scope: 'global',
      project_id: null,
      is_required: false,
      default_value: '',
      options: [],
      description: '',
      formula_expression: '',
    });
    setOptionInput('');
    setFormulaValidation({ valid: null, error: null, checking: false });
  };

  // Validate formula expression
  const validateFormula = async (expression) => {
    if (!expression.trim()) {
      setFormulaValidation({ valid: false, error: 'Formula is required', checking: false });
      return false;
    }

    setFormulaValidation({ valid: null, error: null, checking: true });

    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/api/task-manager/formulas/validate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          formula_expression: expression,
          project_id: formData.project_id
        })
      });

      const data = await res.json();
      setFormulaValidation({
        valid: data.valid,
        error: data.error,
        checking: false,
        referenced_fields: data.referenced_fields
      });
      return data.valid;
    } catch (error) {
      console.error('Error validating formula:', error);
      setFormulaValidation({ valid: false, error: 'Validation failed', checking: false });
      return false;
    }
  };

  // Debounced formula validation
  useEffect(() => {
    if (formData.field_type !== 'formula' || !formData.formula_expression) {
      return;
    }

    const timer = setTimeout(() => {
      validateFormula(formData.formula_expression);
    }, 500);

    return () => clearTimeout(timer);
  }, [formData.formula_expression, formData.field_type, formData.project_id]);

  // Insert field reference into formula
  const insertFieldReference = (apiName) => {
    setFormData(prev => ({
      ...prev,
      formula_expression: prev.formula_expression + `{${apiName}}`
    }));
  };

  const handleCreate = async () => {
    if (!formData.label.trim()) {
      toast.error('Field label is required');
      return;
    }

    if (formData.field_type === 'dropdown' && formData.options.length === 0) {
      toast.error('Please add at least one option for dropdown field');
      return;
    }

    if (formData.field_type === 'formula') {
      if (!formData.formula_expression.trim()) {
        toast.error('Formula expression is required');
        return;
      }
      // Validate formula before saving
      const isValid = await validateFormula(formData.formula_expression);
      if (!isValid) {
        toast.error('Please fix the formula errors before saving');
        return;
      }
    }

    if (formData.scope === 'project' && !formData.project_id) {
      toast.error('Please select a project for project-scoped field');
      return;
    }

    setSaving(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/api/task-manager/custom-fields`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ...formData,
          default_value: formData.field_type === 'formula' ? null : (formData.default_value || null),
          project_id: formData.scope === 'project' ? formData.project_id : null,
          formula_expression: formData.field_type === 'formula' ? formData.formula_expression : null,
        })
      });

      if (res.ok) {
        toast.success('Custom field created');
        setShowCreateDialog(false);
        resetForm();
        fetchFields();
      } else {
        const error = await res.json();
        toast.error(error.detail || 'Failed to create field');
      }
    } catch (error) {
      console.error('Error creating field:', error);
      toast.error('Failed to create field');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async () => {
    if (!editingField) return;

    setSaving(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/api/task-manager/custom-fields/${editingField.id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          label: formData.label,
          is_required: formData.is_required,
          default_value: formData.default_value || null,
          options: formData.options,
          description: formData.description,
        })
      });

      if (res.ok) {
        toast.success('Custom field updated');
        setEditingField(null);
        resetForm();
        fetchFields();
      } else {
        const error = await res.json();
        toast.error(error.detail || 'Failed to update field');
      }
    } catch (error) {
      console.error('Error updating field:', error);
      toast.error('Failed to update field');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (field) => {
    if (!window.confirm(`Are you sure you want to delete "${field.label}"? This will remove the field from all tasks.`)) {
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/api/task-manager/custom-fields/${field.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.ok) {
        toast.success('Custom field deleted');
        fetchFields();
      } else {
        toast.error('Failed to delete field');
      }
    } catch (error) {
      console.error('Error deleting field:', error);
      toast.error('Failed to delete field');
    }
  };

  const openEditDialog = (field) => {
    setFormData({
      label: field.label,
      field_type: field.field_type,
      scope: field.scope,
      project_id: field.project_id,
      is_required: field.is_required,
      default_value: field.default_value || '',
      options: field.options || [],
      description: field.description || '',
      formula_expression: field.formula_expression || '',
      api_name: field.api_name, // Store for circular reference check
    });
    setEditingField(field);
    // Reset formula validation when opening dialog
    setFormulaValidation({ valid: null, error: null, checking: false });
  };

  const addOption = () => {
    if (optionInput.trim() && !formData.options.includes(optionInput.trim())) {
      setFormData(prev => ({
        ...prev,
        options: [...prev.options, optionInput.trim()]
      }));
      setOptionInput('');
    }
  };

  const removeOption = (opt) => {
    setFormData(prev => ({
      ...prev,
      options: prev.options.filter(o => o !== opt)
    }));
  };

  const filteredFields = fields.filter(f =>
    f.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
    f.api_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const FieldIcon = ({ type }) => {
    const Icon = getFieldIcon(type);
    return <Icon className="w-4 h-4" />;
  };

  return (
    <div className="min-h-full pb-8 bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/task-manager')}
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Task Manager
            </Button>
            <div className="h-6 w-px bg-slate-200" />
            <div>
              <h1 className="text-xl font-semibold text-slate-900">Custom Fields</h1>
              <p className="text-sm text-slate-500">Define custom fields for tasks</p>
            </div>
          </div>
          <Button
            onClick={() => {
              resetForm();
              setShowCreateDialog(true);
            }}
            data-testid="create-custom-field-btn"
          >
            <Plus className="w-4 h-4 mr-2" />
            New Field
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="p-6 max-w-5xl mx-auto">
        {/* Search */}
        <div className="mb-6">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Search fields..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
              data-testid="search-custom-fields"
            />
          </div>
        </div>

        {/* Fields Table */}
        <div className="bg-white rounded-lg border shadow-sm">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
            </div>
          ) : filteredFields.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-500">
              <Type className="w-12 h-12 mb-4 text-slate-300" />
              <p className="text-lg font-medium">No custom fields yet</p>
              <p className="text-sm">Create your first custom field to get started</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead className="w-8"></TableHead>
                  <TableHead>Field Label</TableHead>
                  <TableHead>API Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Scope</TableHead>
                  <TableHead>Required</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredFields.map((field) => (
                  <TableRow key={field.id} data-testid={`custom-field-${field.id}`}>
                    <TableCell>
                      <GripVertical className="w-4 h-4 text-slate-300" />
                    </TableCell>
                    <TableCell className="font-medium">{field.label}</TableCell>
                    <TableCell>
                      <code className="text-xs bg-slate-100 px-2 py-1 rounded">
                        {field.api_name}
                      </code>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <FieldIcon type={field.field_type} />
                        <span className="capitalize">{field.field_type}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={field.scope === 'global' ? 'default' : 'secondary'}>
                        {field.scope === 'global' ? (
                          <><Globe className="w-3 h-3 mr-1" /> Global</>
                        ) : (
                          <><FolderOpen className="w-3 h-3 mr-1" /> Project</>
                        )}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {field.is_required ? (
                        <Badge variant="outline" className="text-amber-600 border-amber-300">Required</Badge>
                      ) : (
                        <span className="text-slate-400">Optional</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEditDialog(field)}
                          data-testid={`edit-field-${field.id}`}
                        >
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(field)}
                          className="text-red-500 hover:text-red-700 hover:bg-red-50"
                          data-testid={`delete-field-${field.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>

      {/* Create/Edit Dialog */}
      <Dialog 
        open={showCreateDialog || !!editingField} 
        onOpenChange={(open) => {
          if (!open) {
            setShowCreateDialog(false);
            setEditingField(null);
            resetForm();
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingField ? 'Edit Custom Field' : 'Create Custom Field'}
            </DialogTitle>
            <DialogDescription>
              {editingField 
                ? 'Update the field settings below'
                : 'Define a new custom field for tasks'
              }
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Field Label */}
            <div className="space-y-2">
              <Label htmlFor="label">Field Label *</Label>
              <Input
                id="label"
                placeholder="e.g., Story Points, Customer Name"
                value={formData.label}
                onChange={(e) => setFormData(prev => ({ ...prev, label: e.target.value }))}
                data-testid="field-label-input"
              />
            </div>

            {/* Field Type (disabled in edit mode) */}
            {!editingField && (
              <div className="space-y-2">
                <Label>Field Type *</Label>
                <Select
                  value={formData.field_type}
                  onValueChange={(value) => setFormData(prev => ({ 
                    ...prev, 
                    field_type: value,
                    options: value === 'dropdown' ? prev.options : [],
                    default_value: ''
                  }))}
                >
                  <SelectTrigger data-testid="field-type-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FIELD_TYPES.map(type => (
                      <SelectItem key={type.value} value={type.value}>
                        <div className="flex items-center gap-2">
                          <type.icon className="w-4 h-4" />
                          <span>{type.label}</span>
                          <span className="text-xs text-slate-400">- {type.description}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Dropdown Options */}
            {formData.field_type === 'dropdown' && (
              <div className="space-y-2">
                <Label>Options *</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="Add option"
                    value={optionInput}
                    onChange={(e) => setOptionInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addOption())}
                    data-testid="option-input"
                  />
                  <Button type="button" variant="outline" onClick={addOption}>
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2 mt-2">
                  {formData.options.map((opt, idx) => (
                    <Badge key={idx} variant="secondary" className="flex items-center gap-1">
                      {opt}
                      <X 
                        className="w-3 h-3 cursor-pointer hover:text-red-500" 
                        onClick={() => removeOption(opt)}
                      />
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Formula Editor */}
            {formData.field_type === 'formula' && (
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label>Formula Expression *</Label>
                  <div className="relative">
                    <Textarea
                      placeholder="e.g., {cf_hours} * {cf_rate}"
                      value={formData.formula_expression}
                      onChange={(e) => setFormData(prev => ({ ...prev, formula_expression: e.target.value }))}
                      rows={3}
                      className={`font-mono text-sm ${
                        formulaValidation.valid === true ? 'border-green-500' :
                        formulaValidation.valid === false ? 'border-red-500' : ''
                      }`}
                      data-testid="formula-expression-input"
                    />
                    {formulaValidation.checking && (
                      <div className="absolute right-2 top-2">
                        <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                      </div>
                    )}
                    {formulaValidation.valid === true && !formulaValidation.checking && (
                      <div className="absolute right-2 top-2">
                        <CheckCircle className="w-4 h-4 text-green-500" />
                      </div>
                    )}
                    {formulaValidation.valid === false && !formulaValidation.checking && (
                      <div className="absolute right-2 top-2">
                        <AlertCircle className="w-4 h-4 text-red-500" />
                      </div>
                    )}
                  </div>
                  {formulaValidation.error && (
                    <p className="text-xs text-red-500">{formulaValidation.error}</p>
                  )}
                  <p className="text-xs text-slate-500">
                    Use {'{field_api_name}'} to reference other numeric fields. Supports +, -, *, / operators.
                  </p>
                </div>

                {/* Available Fields */}
                {availableFields.length > 0 && (
                  <div className="space-y-2">
                    <Label className="text-xs text-slate-600">Insert Field Reference</Label>
                    <div className="flex flex-wrap gap-2">
                      {availableFields.map(field => (
                        <Badge
                          key={field.api_name}
                          variant="outline"
                          className="cursor-pointer hover:bg-slate-100 transition-colors"
                          onClick={() => insertFieldReference(field.api_name)}
                        >
                          <Hash className="w-3 h-3 mr-1" />
                          {field.label}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Formula Help */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <p className="text-xs font-medium text-blue-800 mb-1">Formula Examples:</p>
                  <ul className="text-xs text-blue-700 space-y-1">
                    <li><code className="bg-blue-100 px-1 rounded">{'{cf_hours}'} * {'{cf_rate}'}</code> - Multiply hours by rate</li>
                    <li><code className="bg-blue-100 px-1 rounded">({'{cf_price}'} * {'{cf_qty}'}) - {'{cf_discount}'}</code> - Calculate total with discount</li>
                    <li><code className="bg-blue-100 px-1 rounded">{'{cf_score}'} / 10 * 100</code> - Convert to percentage</li>
                  </ul>
                </div>
              </div>
            )}

            {/* Scope (disabled in edit mode) */}
            {!editingField && (
              <div className="space-y-2">
                <Label>Scope</Label>
                <Select
                  value={formData.scope}
                  onValueChange={(value) => setFormData(prev => ({ 
                    ...prev, 
                    scope: value,
                    project_id: value === 'global' ? null : prev.project_id
                  }))}
                >
                  <SelectTrigger data-testid="scope-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="global">
                      <div className="flex items-center gap-2">
                        <Globe className="w-4 h-4" />
                        <span>Global</span>
                        <span className="text-xs text-slate-400">- All tasks</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="project">
                      <div className="flex items-center gap-2">
                        <FolderOpen className="w-4 h-4" />
                        <span>Project-specific</span>
                        <span className="text-xs text-slate-400">- Selected project only</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Project Selection (for project scope) */}
            {!editingField && formData.scope === 'project' && (
              <div className="space-y-2">
                <Label>Project *</Label>
                <Select
                  value={formData.project_id || ''}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, project_id: value }))}
                >
                  <SelectTrigger data-testid="project-select">
                    <SelectValue placeholder="Select project" />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map(project => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Required Toggle (not for formula fields) */}
            {formData.field_type !== 'formula' && (
              <div className="flex items-center justify-between">
                <div>
                  <Label>Required Field</Label>
                  <p className="text-xs text-slate-500">Users must fill this field</p>
                </div>
                <Switch
                  checked={formData.is_required}
                  onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_required: checked }))}
                  data-testid="required-switch"
                />
              </div>
            )}

            {/* Default Value (not for formula or checkbox) */}
            {!['checkbox', 'formula'].includes(formData.field_type) && (
              <div className="space-y-2">
                <Label>Default Value</Label>
                {formData.field_type === 'dropdown' ? (
                  <Select
                    value={formData.default_value}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, default_value: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select default" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">No default</SelectItem>
                      {formData.options.map(opt => (
                        <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : formData.field_type === 'date' ? (
                  <Input
                    type="date"
                    value={formData.default_value}
                    onChange={(e) => setFormData(prev => ({ ...prev, default_value: e.target.value }))}
                  />
                ) : (
                  <Input
                    type={formData.field_type === 'number' ? 'number' : 'text'}
                    placeholder="Enter default value"
                    value={formData.default_value}
                    onChange={(e) => setFormData(prev => ({ ...prev, default_value: e.target.value }))}
                  />
                )}
              </div>
            )}

            {/* Description */}
            <div className="space-y-2">
              <Label>Description (optional)</Label>
              <Textarea
                placeholder="Help text for this field"
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowCreateDialog(false);
                setEditingField(null);
                resetForm();
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={editingField ? handleUpdate : handleCreate}
              disabled={saving}
              data-testid="save-field-btn"
            >
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editingField ? 'Update Field' : 'Create Field'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CustomFieldsPage;
