/**
 * Create Task Modal - Phase 11
 * Form to create a new task with template support
 */
import React, { useState, useEffect } from 'react';
import { X, Loader2, Calendar, Tag, User, Flag, FileText } from 'lucide-react';
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
} from '../../components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '../../components/ui/tabs';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const CreateTaskModal = ({ projectId, onClose, onCreate }) => {
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('blank');
  const [templates, setTemplates] = useState([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    project_id: projectId,
    status: 'todo',
    priority: 'medium',
    task_type: 'other',
    due_date: '',
    tags: [],
  });
  const [tagInput, setTagInput] = useState('');

  // Fetch templates on mount
  useEffect(() => {
    const fetchTemplates = async () => {
      setLoadingTemplates(true);
      try {
        const token = localStorage.getItem('token');
        const response = await fetch(
          `${API_URL}/api/task-manager/task-templates?project_id=${projectId}&include_global=true`,
          { headers: { 'Authorization': `Bearer ${token}` } }
        );
        if (response.ok) {
          const data = await response.json();
          setTemplates(data.templates || []);
        }
      } catch (err) {
        console.error('Error fetching templates:', err);
      } finally {
        setLoadingTemplates(false);
      }
    };
    fetchTemplates();
  }, [projectId]);

  const handleTemplateSelect = (template) => {
    setSelectedTemplate(template);
    // Pre-fill form with template defaults
    setFormData({
      title: template.default_title || '',
      description: template.default_description || '',
      project_id: projectId,
      status: template.default_status || 'todo',
      priority: template.default_priority || 'medium',
      task_type: template.default_task_type || 'other',
      due_date: '', // Will be calculated on submit if default_due_days is set
      tags: template.default_tags || [],
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.title.trim()) {
      toast.error('Task title is required');
      return;
    }

    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      
      // If using template, use the template endpoint
      if (selectedTemplate && activeTab === 'template') {
        const response = await fetch(`${API_URL}/api/task-manager/tasks/from-template`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            template_id: selectedTemplate.id,
            project_id: projectId,
            overrides: {
              title: formData.title,
              description: formData.description,
              priority: formData.priority,
              status: formData.status,
              task_type: formData.task_type,
              tags: formData.tags,
              due_date: formData.due_date ? new Date(formData.due_date).toISOString() : null,
            }
          }),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.detail || 'Failed to create task from template');
        }

        const result = await response.json();
        toast.success('Task created from template');
        onCreate(result.task);
      } else {
        // Standard task creation
        const payload = {
          ...formData,
          due_date: formData.due_date ? new Date(formData.due_date).toISOString() : null,
        };

        const response = await fetch(`${API_URL}/api/task-manager/tasks`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) throw new Error('Failed to create task');

        const newTask = await response.json();
        onCreate(newTask);
      }
    } catch (err) {
      console.error('Error creating task:', err);
      toast.error(err.message || 'Failed to create task');
    } finally {
      setLoading(false);
    }
  };

  const handleAddTag = (e) => {
    if (e.key === 'Enter' && tagInput.trim()) {
      e.preventDefault();
      if (!formData.tags.includes(tagInput.trim())) {
        setFormData(prev => ({
          ...prev,
          tags: [...prev.tags, tagInput.trim()]
        }));
      }
      setTagInput('');
    }
  };

  const removeTag = (tagToRemove) => {
    setFormData(prev => ({
      ...prev,
      tags: prev.tags.filter(t => t !== tagToRemove)
    }));
  };

  const clearTemplateSelection = () => {
    setSelectedTemplate(null);
    setFormData({
      title: '',
      description: '',
      project_id: projectId,
      status: 'todo',
      priority: 'medium',
      task_type: 'other',
      due_date: '',
      tags: [],
    });
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New Task</DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); clearTemplateSelection(); }}>
          <TabsList className="grid w-full grid-cols-2 mb-4">
            <TabsTrigger value="blank" data-testid="tab-blank">
              Blank Task
            </TabsTrigger>
            <TabsTrigger value="template" data-testid="tab-template">
              <FileText className="w-4 h-4 mr-2" />
              From Template
            </TabsTrigger>
          </TabsList>

          {/* Template Selection */}
          <TabsContent value="template" className="mt-0">
            {loadingTemplates ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
              </div>
            ) : templates.length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                <FileText className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                <p>No templates available</p>
                <p className="text-sm">Create templates in Settings → Task Templates</p>
              </div>
            ) : (
              <div className="space-y-2 mb-4 max-h-48 overflow-y-auto">
                {templates.map((template) => (
                  <div
                    key={template.id}
                    className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                      selectedTemplate?.id === template.id 
                        ? 'border-blue-500 bg-blue-50' 
                        : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                    onClick={() => handleTemplateSelect(template)}
                    data-testid={`template-option-${template.id}`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="font-medium text-sm">{template.name}</p>
                        {template.description && (
                          <p className="text-xs text-slate-500 mt-1">{template.description}</p>
                        )}
                      </div>
                      <Badge variant="secondary" className="text-xs capitalize">
                        {template.default_priority}
                      </Badge>
                    </div>
                    {template.default_tags?.length > 0 && (
                      <div className="flex gap-1 mt-2">
                        {template.default_tags.slice(0, 3).map((tag, i) => (
                          <Badge key={i} variant="outline" className="text-xs">{tag}</Badge>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {selectedTemplate && (
              <div className="text-sm text-slate-500 mb-4 flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Using template: <strong>{selectedTemplate.name}</strong>
                <button onClick={clearTemplateSelection} className="text-blue-600 hover:underline">
                  (change)
                </button>
              </div>
            )}
          </TabsContent>

          <TabsContent value="blank" className="mt-0" />
        </Tabs>

        {/* Task Form - shown for both tabs */}
        {(activeTab === 'blank' || selectedTemplate) && (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Title */}
            <div>
              <Label htmlFor="title">Task Title *</Label>
              <Input
                id="title"
                placeholder="What needs to be done?"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="mt-1"
                autoFocus
                data-testid="create-task-title"
              />
            </div>

            {/* Description */}
            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="Add more details..."
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="mt-1"
                rows={3}
                data-testid="create-task-description"
              />
            </div>

            {/* Status & Priority Row */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Status</Label>
                <Select
                  value={formData.status}
                  onValueChange={(v) => setFormData({ ...formData, status: v })}
                >
                  <SelectTrigger className="mt-1" data-testid="create-task-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todo">To Do</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="blocked">Blocked</SelectItem>
                    <SelectItem value="done">Done</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Priority</Label>
                <Select
                  value={formData.priority}
                  onValueChange={(v) => setFormData({ ...formData, priority: v })}
                >
                  <SelectTrigger className="mt-1" data-testid="create-task-priority">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Type & Due Date Row */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Type</Label>
                <Select
                  value={formData.task_type}
                  onValueChange={(v) => setFormData({ ...formData, task_type: v })}
                >
                  <SelectTrigger className="mt-1" data-testid="create-task-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="other">Task</SelectItem>
                    <SelectItem value="bug">Bug</SelectItem>
                    <SelectItem value="feature">Feature</SelectItem>
                    <SelectItem value="support">Support</SelectItem>
                    <SelectItem value="sales">Sales</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="due_date">Due Date</Label>
                <Input
                  id="due_date"
                  type="date"
                  value={formData.due_date}
                  onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                  className="mt-1"
                  data-testid="create-task-due-date"
                />
              </div>
            </div>

            {/* Tags */}
            <div>
              <Label>Tags</Label>
              <div className="flex flex-wrap gap-2 mt-1 mb-2">
                {formData.tags.map((tag, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-sm"
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() => removeTag(tag)}
                      className="hover:text-blue-900"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
              <Input
                placeholder="Add tag and press Enter"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleAddTag}
                data-testid="create-task-tag-input"
              />
            </div>

            {/* Template Checklist Preview */}
            {selectedTemplate?.checklist_items?.length > 0 && (
              <div className="bg-slate-50 p-3 rounded-lg">
                <p className="text-sm font-medium text-slate-700 mb-2">
                  Checklist items from template:
                </p>
                <ul className="space-y-1">
                  {selectedTemplate.checklist_items.map((item, i) => (
                    <li key={i} className="text-sm text-slate-600 flex items-center gap-2">
                      <span className="w-4 h-4 rounded border border-slate-300" />
                      {item.title}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={loading || !formData.title.trim()}
                data-testid="create-task-submit"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                Create Task
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default CreateTaskModal;
