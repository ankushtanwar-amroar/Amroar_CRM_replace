/**
 * Validation Rules Admin Page
 * Create and manage validation rules for tasks
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
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../components/ui/card';
import {
  ArrowLeft,
  Plus,
  Edit2,
  Trash2,
  ShieldCheck,
  AlertTriangle,
  Loader2,
  X,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const OPERATORS = [
  { value: 'equals', label: 'Equals' },
  { value: 'not_equals', label: 'Does Not Equal' },
  { value: 'is_empty', label: 'Is Empty' },
  { value: 'is_not_empty', label: 'Is Not Empty' },
  { value: 'greater_than', label: 'Greater Than' },
  { value: 'less_than', label: 'Less Than' },
  { value: 'greater_than_or_equal', label: 'Greater Than or Equal' },
  { value: 'less_than_or_equal', label: 'Less Than or Equal' },
  { value: 'contains', label: 'Contains' },
  { value: 'not_contains', label: 'Does Not Contain' },
];

const TASK_FIELDS = [
  { value: 'priority', label: 'Priority' },
  { value: 'status', label: 'Status' },
  { value: 'title', label: 'Title' },
  { value: 'description', label: 'Description' },
  { value: 'task_type', label: 'Task Type' },
  { value: 'due_date', label: 'Due Date' },
];

const PRIORITY_VALUES = ['low', 'medium', 'high', 'urgent'];
const STATUS_VALUES = ['todo', 'in_progress', 'blocked', 'done'];

const ValidationRulesPage = () => {
  const navigate = useNavigate();
  const [rules, setRules] = useState([]);
  const [customFields, setCustomFields] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingRule, setEditingRule] = useState(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    scope: 'global',
    project_id: null,
    conditions: [{ field: 'priority', operator: 'equals', value: '' }],
    condition_logic: 'all',
    error_message: '',
    target_field: null,
  });

  const fetchRules = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/api/task-manager/validation-rules`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setRules(data);
      }
    } catch (error) {
      console.error('Error fetching rules:', error);
      toast.error('Failed to load validation rules');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchCustomFields = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/api/task-manager/custom-fields`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setCustomFields(data);
      }
    } catch (error) {
      console.error('Error fetching custom fields:', error);
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
    fetchRules();
    fetchCustomFields();
    fetchProjects();
  }, [fetchRules, fetchCustomFields, fetchProjects]);

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      scope: 'global',
      project_id: null,
      conditions: [{ field: 'priority', operator: 'equals', value: '' }],
      condition_logic: 'all',
      error_message: '',
      target_field: null,
    });
  };

  const addCondition = () => {
    setFormData(prev => ({
      ...prev,
      conditions: [...prev.conditions, { field: 'priority', operator: 'equals', value: '' }]
    }));
  };

  const removeCondition = (index) => {
    if (formData.conditions.length === 1) return;
    setFormData(prev => ({
      ...prev,
      conditions: prev.conditions.filter((_, i) => i !== index)
    }));
  };

  const updateCondition = (index, key, value) => {
    setFormData(prev => ({
      ...prev,
      conditions: prev.conditions.map((c, i) => 
        i === index ? { ...c, [key]: value } : c
      )
    }));
  };

  const handleCreate = async () => {
    if (!formData.name.trim()) {
      toast.error('Rule name is required');
      return;
    }
    if (!formData.error_message.trim()) {
      toast.error('Error message is required');
      return;
    }
    if (formData.scope === 'project' && !formData.project_id) {
      toast.error('Please select a project');
      return;
    }

    setSaving(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/api/task-manager/validation-rules`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      });

      if (res.ok) {
        toast.success('Validation rule created');
        setShowCreateDialog(false);
        resetForm();
        fetchRules();
      } else {
        const error = await res.json();
        toast.error(error.detail || 'Failed to create rule');
      }
    } catch (error) {
      console.error('Error creating rule:', error);
      toast.error('Failed to create rule');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async () => {
    if (!editingRule) return;

    setSaving(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/api/task-manager/validation-rules/${editingRule.id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      });

      if (res.ok) {
        toast.success('Validation rule updated');
        setEditingRule(null);
        resetForm();
        fetchRules();
      } else {
        const error = await res.json();
        toast.error(error.detail || 'Failed to update rule');
      }
    } catch (error) {
      console.error('Error updating rule:', error);
      toast.error('Failed to update rule');
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (rule) => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/api/task-manager/validation-rules/${rule.id}/toggle`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.ok) {
        toast.success(rule.is_active ? 'Rule disabled' : 'Rule enabled');
        fetchRules();
      } else {
        toast.error('Failed to toggle rule');
      }
    } catch (error) {
      console.error('Error toggling rule:', error);
      toast.error('Failed to toggle rule');
    }
  };

  const handleDelete = async (rule) => {
    if (!window.confirm(`Delete "${rule.name}"?`)) return;

    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/api/task-manager/validation-rules/${rule.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.ok) {
        toast.success('Validation rule deleted');
        fetchRules();
      } else {
        toast.error('Failed to delete rule');
      }
    } catch (error) {
      console.error('Error deleting rule:', error);
      toast.error('Failed to delete rule');
    }
  };

  const openEditDialog = (rule) => {
    setFormData({
      name: rule.name,
      description: rule.description || '',
      scope: rule.scope,
      project_id: rule.project_id,
      conditions: rule.conditions || [{ field: 'priority', operator: 'equals', value: '' }],
      condition_logic: rule.condition_logic || 'all',
      error_message: rule.error_message,
      target_field: rule.target_field,
    });
    setEditingRule(rule);
  };

  const getAllFields = () => {
    const fields = [...TASK_FIELDS];
    customFields.forEach(cf => {
      fields.push({ value: cf.api_name, label: `${cf.label} (Custom)` });
    });
    return fields;
  };

  const getFieldValueOptions = (fieldName) => {
    if (fieldName === 'priority') return PRIORITY_VALUES;
    if (fieldName === 'status') return STATUS_VALUES;
    return null;
  };

  return (
    <div className="min-h-full pb-8 bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => navigate('/task-manager')}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            <div className="h-6 w-px bg-slate-200" />
            <div>
              <h1 className="text-xl font-semibold text-slate-900">Validation Rules</h1>
              <p className="text-sm text-slate-500">Enforce data quality on tasks</p>
            </div>
          </div>
          <Button onClick={() => { resetForm(); setShowCreateDialog(true); }} data-testid="create-rule-btn">
            <Plus className="w-4 h-4 mr-2" />
            New Rule
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="p-6 max-w-5xl mx-auto">
        {/* Info Card */}
        <Card className="mb-6 bg-amber-50 border-amber-200">
          <CardContent className="flex items-start gap-3 pt-4">
            <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />
            <div className="text-sm text-amber-800">
              <p className="font-medium">How Validation Rules Work</p>
              <p className="mt-1">
                When all conditions in a rule are TRUE, the save is blocked and the error message is shown.
                Use "ALL" logic for AND conditions, "ANY" for OR conditions.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Rules Table */}
        <div className="bg-white rounded-lg border shadow-sm">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
            </div>
          ) : rules.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-500">
              <ShieldCheck className="w-12 h-12 mb-4 text-slate-300" />
              <p className="text-lg font-medium">No validation rules yet</p>
              <p className="text-sm">Create your first rule to enforce data quality</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead>Rule Name</TableHead>
                  <TableHead>Conditions</TableHead>
                  <TableHead>Scope</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rules.map((rule) => (
                  <TableRow key={rule.id} data-testid={`rule-${rule.id}`}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{rule.name}</p>
                        <p className="text-xs text-slate-500 mt-1">{rule.error_message}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-mono text-xs">
                        {rule.conditions?.length || 0} condition(s) • {rule.condition_logic?.toUpperCase()}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={rule.scope === 'global' ? 'default' : 'secondary'}>
                        {rule.scope === 'global' ? 'Global' : 'Project'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={rule.is_active}
                        onCheckedChange={() => handleToggle(rule)}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openEditDialog(rule)}>
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-500 hover:text-red-700"
                          onClick={() => handleDelete(rule)}
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
        open={showCreateDialog || !!editingRule} 
        onOpenChange={(open) => {
          if (!open) {
            setShowCreateDialog(false);
            setEditingRule(null);
            resetForm();
          }
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingRule ? 'Edit Validation Rule' : 'Create Validation Rule'}
            </DialogTitle>
            <DialogDescription>
              Define conditions that will block task saves when matched
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Rule Name */}
            <div className="space-y-2">
              <Label>Rule Name *</Label>
              <Input
                placeholder="e.g., Require Description for Urgent Tasks"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                placeholder="Optional description of what this rule enforces"
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                rows={2}
              />
            </div>

            {/* Scope */}
            {!editingRule && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Scope</Label>
                  <Select
                    value={formData.scope}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, scope: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="global">Global (All Projects)</SelectItem>
                      <SelectItem value="project">Specific Project</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                {formData.scope === 'project' && (
                  <div className="space-y-2">
                    <Label>Project</Label>
                    <Select
                      value={formData.project_id || ''}
                      onValueChange={(value) => setFormData(prev => ({ ...prev, project_id: value }))}
                    >
                      <SelectTrigger>
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
              </div>
            )}

            {/* Condition Logic */}
            <div className="space-y-2">
              <Label>Block save when</Label>
              <Select
                value={formData.condition_logic}
                onValueChange={(value) => setFormData(prev => ({ ...prev, condition_logic: value }))}
              >
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">ALL conditions are true (AND)</SelectItem>
                  <SelectItem value="any">ANY condition is true (OR)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Conditions */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Conditions</Label>
                <Button type="button" variant="outline" size="sm" onClick={addCondition}>
                  <Plus className="w-4 h-4 mr-1" />
                  Add Condition
                </Button>
              </div>
              
              {formData.conditions.map((condition, index) => (
                <div key={index} className="flex items-center gap-2 p-3 bg-slate-50 rounded-lg">
                  <Select
                    value={condition.field}
                    onValueChange={(value) => updateCondition(index, 'field', value)}
                  >
                    <SelectTrigger className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {getAllFields().map(field => (
                        <SelectItem key={field.value} value={field.value}>
                          {field.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  
                  <Select
                    value={condition.operator}
                    onValueChange={(value) => updateCondition(index, 'operator', value)}
                  >
                    <SelectTrigger className="w-44">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {OPERATORS.map(op => (
                        <SelectItem key={op.value} value={op.value}>
                          {op.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  
                  {!['is_empty', 'is_not_empty'].includes(condition.operator) && (
                    getFieldValueOptions(condition.field) ? (
                      <Select
                        value={condition.value || ''}
                        onValueChange={(value) => updateCondition(index, 'value', value)}
                      >
                        <SelectTrigger className="flex-1">
                          <SelectValue placeholder="Select value" />
                        </SelectTrigger>
                        <SelectContent>
                          {getFieldValueOptions(condition.field).map(val => (
                            <SelectItem key={val} value={val}>
                              {val.charAt(0).toUpperCase() + val.slice(1).replace('_', ' ')}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        className="flex-1"
                        placeholder="Value"
                        value={condition.value || ''}
                        onChange={(e) => updateCondition(index, 'value', e.target.value)}
                      />
                    )
                  )}
                  
                  {formData.conditions.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeCondition(index)}
                      className="text-red-500"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>

            {/* Error Message */}
            <div className="space-y-2">
              <Label>Error Message *</Label>
              <Textarea
                placeholder="Message shown to user when validation fails"
                value={formData.error_message}
                onChange={(e) => setFormData(prev => ({ ...prev, error_message: e.target.value }))}
                rows={2}
              />
              <p className="text-xs text-slate-500">
                This message will be displayed when the rule blocks a save
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowCreateDialog(false);
                setEditingRule(null);
                resetForm();
              }}
            >
              Cancel
            </Button>
            <Button onClick={editingRule ? handleUpdate : handleCreate} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editingRule ? 'Update Rule' : 'Create Rule'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ValidationRulesPage;
