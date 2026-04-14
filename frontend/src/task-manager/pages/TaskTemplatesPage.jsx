/**
 * Task Templates Page - Phase 11
 * Allows admins to create and manage task templates
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  FileText, Plus, Pencil, Trash2, Copy, Loader2, 
  Calendar, Tag, User, ChevronDown, CheckSquare,
  Settings, Search, MoreHorizontal
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { Label } from '../../components/ui/label';
import { Badge } from '../../components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../../components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '../../components/ui/dropdown-menu';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../components/ui/card';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const priorityOptions = [
  { value: 'low', label: 'Low', color: 'bg-slate-100 text-slate-600' },
  { value: 'medium', label: 'Medium', color: 'bg-blue-100 text-blue-600' },
  { value: 'high', label: 'High', color: 'bg-orange-100 text-orange-600' },
  { value: 'urgent', label: 'Urgent', color: 'bg-red-100 text-red-600' },
];

const taskTypeOptions = [
  { value: 'other', label: 'Task' },
  { value: 'bug', label: 'Bug' },
  { value: 'feature', label: 'Feature' },
  { value: 'support', label: 'Support' },
  { value: 'sales', label: 'Sales' },
];

const TaskTemplatesPage = () => {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    scope: 'global',
    project_id: null,
    default_title: '',
    default_description: '',
    default_status: 'todo',
    default_priority: 'medium',
    default_task_type: 'other',
    default_tags: [],
    default_due_days: null,
    checklist_items: [],
  });
  const [tagInput, setTagInput] = useState('');
  const [checklistInput, setChecklistInput] = useState('');

  const fetchTemplates = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/task-manager/task-templates`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        setTemplates(data.templates || []);
      }
    } catch (err) {
      console.error('Error fetching templates:', err);
      toast.error('Failed to load templates');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      scope: 'global',
      project_id: null,
      default_title: '',
      default_description: '',
      default_status: 'todo',
      default_priority: 'medium',
      default_task_type: 'other',
      default_tags: [],
      default_due_days: null,
      checklist_items: [],
    });
    setTagInput('');
    setChecklistInput('');
  };

  const openCreateModal = () => {
    resetForm();
    setEditingTemplate(null);
    setShowModal(true);
  };

  const openEditModal = (template) => {
    setEditingTemplate(template);
    setFormData({
      name: template.name || '',
      description: template.description || '',
      scope: template.scope || 'global',
      project_id: template.project_id,
      default_title: template.default_title || '',
      default_description: template.default_description || '',
      default_status: template.default_status || 'todo',
      default_priority: template.default_priority || 'medium',
      default_task_type: template.default_task_type || 'other',
      default_tags: template.default_tags || [],
      default_due_days: template.default_due_days,
      checklist_items: template.checklist_items || [],
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error('Template name is required');
      return;
    }

    setSaving(true);
    try {
      const token = localStorage.getItem('token');
      const url = editingTemplate 
        ? `${API_URL}/api/task-manager/task-templates/${editingTemplate.id}`
        : `${API_URL}/api/task-manager/task-templates`;
      
      const response = await fetch(url, {
        method: editingTemplate ? 'PUT' : 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      });

      if (response.ok) {
        toast.success(editingTemplate ? 'Template updated' : 'Template created');
        setShowModal(false);
        fetchTemplates();
      } else {
        const error = await response.json();
        toast.error(error.detail || 'Failed to save template');
      }
    } catch (err) {
      console.error('Save error:', err);
      toast.error('Failed to save template');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (template) => {
    if (!window.confirm(`Delete template "${template.name}"?`)) return;

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(
        `${API_URL}/api/task-manager/task-templates/${template.id}`,
        {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` }
        }
      );

      if (response.ok) {
        toast.success('Template deleted');
        fetchTemplates();
      } else {
        toast.error('Failed to delete template');
      }
    } catch (err) {
      console.error('Delete error:', err);
      toast.error('Failed to delete template');
    }
  };

  const handleDuplicate = async (template) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(
        `${API_URL}/api/task-manager/task-templates/${template.id}/duplicate`,
        {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        }
      );

      if (response.ok) {
        toast.success('Template duplicated');
        fetchTemplates();
      } else {
        toast.error('Failed to duplicate template');
      }
    } catch (err) {
      console.error('Duplicate error:', err);
      toast.error('Failed to duplicate template');
    }
  };

  const addTag = () => {
    if (tagInput.trim() && !formData.default_tags.includes(tagInput.trim())) {
      setFormData(prev => ({
        ...prev,
        default_tags: [...prev.default_tags, tagInput.trim()]
      }));
      setTagInput('');
    }
  };

  const removeTag = (tag) => {
    setFormData(prev => ({
      ...prev,
      default_tags: prev.default_tags.filter(t => t !== tag)
    }));
  };

  const addChecklistItem = () => {
    if (checklistInput.trim()) {
      setFormData(prev => ({
        ...prev,
        checklist_items: [...prev.checklist_items, { title: checklistInput.trim() }]
      }));
      setChecklistInput('');
    }
  };

  const removeChecklistItem = (index) => {
    setFormData(prev => ({
      ...prev,
      checklist_items: prev.checklist_items.filter((_, i) => i !== index)
    }));
  };

  const filteredTemplates = templates.filter(t => 
    t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (t.description || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto" data-testid="task-templates-page">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 flex items-center gap-2">
            <FileText className="w-6 h-6" />
            Task Templates
          </h1>
          <p className="text-slate-500 mt-1">
            Create reusable task blueprints to accelerate task creation
          </p>
        </div>
        <Button onClick={openCreateModal} data-testid="create-template-btn">
          <Plus className="w-4 h-4 mr-2" />
          New Template
        </Button>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input
          placeholder="Search templates..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
          data-testid="template-search"
        />
      </div>

      {/* Templates Grid */}
      {filteredTemplates.length === 0 ? (
        <div className="text-center py-12 border border-dashed rounded-lg">
          <FileText className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-slate-700 mb-2">No templates found</h3>
          <p className="text-slate-500 mb-4">
            {searchQuery ? 'Try a different search term' : 'Create your first template to get started'}
          </p>
          {!searchQuery && (
            <Button onClick={openCreateModal}>
              <Plus className="w-4 h-4 mr-2" />
              Create Template
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTemplates.map((template) => (
            <Card key={template.id} className="hover:shadow-md transition-shadow" data-testid={`template-card-${template.id}`}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-base truncate">{template.name}</CardTitle>
                    {template.description && (
                      <CardDescription className="mt-1 line-clamp-2">
                        {template.description}
                      </CardDescription>
                    )}
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => openEditModal(template)}>
                        <Pencil className="w-4 h-4 mr-2" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleDuplicate(template)}>
                        <Copy className="w-4 h-4 mr-2" />
                        Duplicate
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem 
                        onClick={() => handleDelete(template)}
                        className="text-red-600 focus:text-red-600"
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {/* Default Title */}
                  {template.default_title && (
                    <div className="text-sm">
                      <span className="text-slate-500">Default title:</span>
                      <span className="ml-2 font-medium">{template.default_title}</span>
                    </div>
                  )}

                  {/* Priority & Type */}
                  <div className="flex gap-2 flex-wrap">
                    <Badge 
                      variant="secondary"
                      className={priorityOptions.find(p => p.value === template.default_priority)?.color}
                    >
                      {template.default_priority}
                    </Badge>
                    <Badge variant="outline">
                      {taskTypeOptions.find(t => t.value === template.default_task_type)?.label || 'Task'}
                    </Badge>
                    {template.scope === 'project' && (
                      <Badge variant="outline" className="text-purple-600 border-purple-300">
                        Project-scoped
                      </Badge>
                    )}
                  </div>

                  {/* Tags */}
                  {template.default_tags?.length > 0 && (
                    <div className="flex gap-1 flex-wrap">
                      {template.default_tags.slice(0, 3).map((tag, i) => (
                        <Badge key={i} variant="secondary" className="text-xs">
                          <Tag className="w-3 h-3 mr-1" />
                          {tag}
                        </Badge>
                      ))}
                      {template.default_tags.length > 3 && (
                        <Badge variant="secondary" className="text-xs">
                          +{template.default_tags.length - 3}
                        </Badge>
                      )}
                    </div>
                  )}

                  {/* Checklist Items */}
                  {template.checklist_items?.length > 0 && (
                    <div className="flex items-center text-sm text-slate-500">
                      <CheckSquare className="w-4 h-4 mr-1" />
                      {template.checklist_items.length} checklist item(s)
                    </div>
                  )}

                  {/* Due Days */}
                  {template.default_due_days && (
                    <div className="flex items-center text-sm text-slate-500">
                      <Calendar className="w-4 h-4 mr-1" />
                      Due in {template.default_due_days} day(s)
                    </div>
                  )}

                  {/* Usage Count */}
                  <div className="text-xs text-slate-400 pt-2 border-t">
                    Used {template.usage_count || 0} time(s)
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingTemplate ? 'Edit Template' : 'Create Task Template'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Template Info */}
            <div className="space-y-4">
              <div>
                <Label htmlFor="name">Template Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Bug Report Template"
                  className="mt-1"
                  data-testid="template-name-input"
                />
              </div>
              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Describe when to use this template..."
                  className="mt-1"
                  rows={2}
                />
              </div>
            </div>

            {/* Default Task Settings */}
            <div className="border-t pt-4">
              <h3 className="font-medium text-slate-900 mb-4">Default Task Settings</h3>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="default_title">Default Title</Label>
                  <Input
                    id="default_title"
                    value={formData.default_title}
                    onChange={(e) => setFormData({ ...formData, default_title: e.target.value })}
                    placeholder="Task title template"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Default Priority</Label>
                  <Select
                    value={formData.default_priority}
                    onValueChange={(v) => setFormData({ ...formData, default_priority: v })}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {priorityOptions.map(opt => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Default Type</Label>
                  <Select
                    value={formData.default_task_type}
                    onValueChange={(v) => setFormData({ ...formData, default_task_type: v })}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {taskTypeOptions.map(opt => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="due_days">Due in (days)</Label>
                  <Input
                    id="due_days"
                    type="number"
                    value={formData.default_due_days || ''}
                    onChange={(e) => setFormData({ ...formData, default_due_days: e.target.value ? parseInt(e.target.value) : null })}
                    placeholder="e.g., 3"
                    className="mt-1"
                    min={1}
                  />
                </div>
              </div>

              <div className="mt-4">
                <Label htmlFor="default_description">Default Description</Label>
                <Textarea
                  id="default_description"
                  value={formData.default_description || ''}
                  onChange={(e) => setFormData({ ...formData, default_description: e.target.value })}
                  placeholder="Template description for new tasks..."
                  className="mt-1"
                  rows={3}
                />
              </div>
            </div>

            {/* Default Tags */}
            <div className="border-t pt-4">
              <Label>Default Tags</Label>
              <div className="flex flex-wrap gap-2 mt-2 mb-2">
                {formData.default_tags.map((tag, i) => (
                  <Badge key={i} variant="secondary" className="gap-1">
                    {tag}
                    <button onClick={() => removeTag(tag)} className="ml-1 hover:text-red-500">×</button>
                  </Badge>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
                  placeholder="Add a tag"
                  className="flex-1"
                />
                <Button type="button" variant="outline" onClick={addTag}>Add</Button>
              </div>
            </div>

            {/* Checklist Items */}
            <div className="border-t pt-4">
              <Label>Checklist Items</Label>
              <div className="space-y-2 mt-2 mb-2">
                {formData.checklist_items.map((item, i) => (
                  <div key={i} className="flex items-center gap-2 bg-slate-50 p-2 rounded">
                    <CheckSquare className="w-4 h-4 text-slate-400" />
                    <span className="flex-1 text-sm">{item.title}</span>
                    <button 
                      onClick={() => removeChecklistItem(i)}
                      className="text-slate-400 hover:text-red-500"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  value={checklistInput}
                  onChange={(e) => setChecklistInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addChecklistItem())}
                  placeholder="Add checklist item"
                  className="flex-1"
                />
                <Button type="button" variant="outline" onClick={addChecklistItem}>Add</Button>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving} data-testid="save-template-btn">
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editingTemplate ? 'Update Template' : 'Create Template'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TaskTemplatesPage;
