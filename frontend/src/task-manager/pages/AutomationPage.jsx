/**
 * Automation Rules Page
 * Create, manage, and test automation rules
 */
import React, { useState, useEffect } from 'react';
import { 
  Zap, Plus, Play, Pause, Trash2, Edit2, Loader2,
  ChevronRight, CheckCircle2, AlertTriangle, Clock,
  Settings, Copy, Search
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Badge } from '../../components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const triggerLabels = {
  task_created: 'Task Created',
  status_changed: 'Status Changed',
  task_overdue: 'Task Becomes Overdue',
  assignee_changed: 'Assignee Changed',
  dependency_resolved: 'Dependency Resolved'
};

const actionLabels = {
  assign_task: 'Assign Task',
  change_status: 'Change Status',
  set_priority: 'Set Priority',
  add_comment: 'Add Comment',
  add_watcher: 'Add Watcher',
  send_notification: 'Send Notification'
};

const AutomationPage = () => {
  const [rules, setRules] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showEditor, setShowEditor] = useState(false);
  const [editingRule, setEditingRule] = useState(null);
  const [logs, setLogs] = useState([]);
  const [showLogs, setShowLogs] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchRules();
    fetchTemplates();
  }, []);

  const fetchRules = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/task-manager/automation/rules`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        setRules(data);
      }
    } catch (err) {
      console.error('Error fetching rules:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchTemplates = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/task-manager/automation/templates`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        setTemplates(data);
      }
    } catch (err) {
      console.error('Error fetching templates:', err);
    }
  };

  const fetchLogs = async (ruleId = null) => {
    try {
      const token = localStorage.getItem('token');
      const params = ruleId ? `?rule_id=${ruleId}` : '';
      const response = await fetch(`${API_URL}/api/task-manager/automation/logs${params}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        setLogs(data);
        setShowLogs(true);
      }
    } catch (err) {
      console.error('Error fetching logs:', err);
    }
  };

  const toggleRule = async (ruleId) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/task-manager/automation/rules/${ruleId}/toggle`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        setRules(prev => prev.map(r => 
          r.id === ruleId ? { ...r, is_enabled: data.is_enabled } : r
        ));
      }
    } catch (err) {
      console.error('Error toggling rule:', err);
    }
  };

  const deleteRule = async (ruleId) => {
    if (!window.confirm('Delete this automation rule?')) return;
    
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/task-manager/automation/rules/${ruleId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        setRules(prev => prev.filter(r => r.id !== ruleId));
      }
    } catch (err) {
      console.error('Error deleting rule:', err);
    }
  };

  const applyTemplate = async (templateId) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(
        `${API_URL}/api/task-manager/automation/templates/${templateId}/apply`,
        {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        }
      );
      
      if (response.ok) {
        const newRule = await response.json();
        setRules(prev => [newRule, ...prev]);
      }
    } catch (err) {
      console.error('Error applying template:', err);
    }
  };

  const handleCreateRule = () => {
    setEditingRule(null);
    setShowEditor(true);
  };

  const handleEditRule = (rule) => {
    setEditingRule(rule);
    setShowEditor(true);
  };

  const handleSaveRule = async (ruleData) => {
    try {
      const token = localStorage.getItem('token');
      const isEdit = !!editingRule;
      
      const response = await fetch(
        `${API_URL}/api/task-manager/automation/rules${isEdit ? `/${editingRule.id}` : ''}`,
        {
          method: isEdit ? 'PUT' : 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(ruleData)
        }
      );
      
      if (response.ok) {
        const savedRule = await response.json();
        if (isEdit) {
          setRules(prev => prev.map(r => r.id === savedRule.id ? savedRule : r));
        } else {
          setRules(prev => [savedRule, ...prev]);
        }
        setShowEditor(false);
      }
    } catch (err) {
      console.error('Error saving rule:', err);
    }
  };

  const filteredRules = rules.filter(rule =>
    rule.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    rule.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatDate = (dateStr) => {
    if (!dateStr) return 'Never';
    return new Date(dateStr).toLocaleString();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-white" data-testid="automation-page">
      {/* Header */}
      <div className="px-6 py-4 border-b">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <Zap className="w-6 h-6 text-amber-500" />
              Automation Rules
            </h1>
            <p className="text-slate-500 mt-1">
              Automate repetitive tasks with custom rules
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => fetchLogs()}>
              <Clock className="w-4 h-4 mr-2" />
              View Logs
            </Button>
            <Button onClick={handleCreateRule} data-testid="create-rule-btn">
              <Plus className="w-4 h-4 mr-2" />
              New Rule
            </Button>
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Search rules..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 max-w-md"
          />
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {/* Templates Section */}
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Quick Start Templates</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {templates.map(template => (
              <div 
                key={template.id}
                className="border rounded-lg p-4 hover:border-blue-400 hover:shadow-md transition-all cursor-pointer group"
                onClick={() => applyTemplate(template.id)}
              >
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-medium text-slate-900">{template.name}</h3>
                  <Badge variant="secondary" className="text-xs">
                    {triggerLabels[template.trigger]}
                  </Badge>
                </div>
                <p className="text-sm text-slate-500 mb-3">{template.description}</p>
                <div className="flex items-center text-xs text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Copy className="w-3 h-3 mr-1" />
                  Click to use template
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Rules List */}
        <div>
          <h2 className="text-lg font-semibold text-slate-900 mb-4">
            Active Rules ({filteredRules.length})
          </h2>
          
          {filteredRules.length > 0 ? (
            <div className="space-y-3">
              {filteredRules.map(rule => (
                <div 
                  key={rule.id}
                  className={`border rounded-lg p-4 ${rule.is_enabled ? 'bg-white' : 'bg-slate-50'}`}
                  data-testid={`rule-${rule.id}`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-medium text-slate-900">{rule.name}</h3>
                        <Badge 
                          variant={rule.is_enabled ? 'default' : 'secondary'}
                          className={rule.is_enabled ? 'bg-green-100 text-green-700' : ''}
                        >
                          {rule.is_enabled ? 'Active' : 'Disabled'}
                        </Badge>
                      </div>
                      
                      {rule.description && (
                        <p className="text-sm text-slate-500 mb-2">{rule.description}</p>
                      )}
                      
                      <div className="flex items-center gap-4 text-xs text-slate-500">
                        <span className="flex items-center gap-1">
                          <Zap className="w-3 h-3" />
                          {triggerLabels[rule.trigger]}
                        </span>
                        <span>
                          {rule.conditions?.length || 0} condition(s)
                        </span>
                        <span>
                          {rule.actions?.length || 0} action(s)
                        </span>
                        <span>
                          Executed: {rule.execution_count || 0} times
                        </span>
                        {rule.last_executed_at && (
                          <span>
                            Last run: {formatDate(rule.last_executed_at)}
                          </span>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleRule(rule.id)}
                        title={rule.is_enabled ? 'Disable' : 'Enable'}
                      >
                        {rule.is_enabled ? (
                          <Pause className="w-4 h-4 text-amber-500" />
                        ) : (
                          <Play className="w-4 h-4 text-green-500" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEditRule(rule)}
                      >
                        <Edit2 className="w-4 h-4 text-slate-500" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => fetchLogs(rule.id)}
                      >
                        <Clock className="w-4 h-4 text-slate-500" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteRule(rule.id)}
                      >
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <Zap className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-slate-900 mb-2">No automation rules yet</h3>
              <p className="text-slate-500 mb-4">
                Create your first rule or use a template to get started
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Rule Editor Modal */}
      {showEditor && (
        <RuleEditor
          rule={editingRule}
          onSave={handleSaveRule}
          onClose={() => setShowEditor(false)}
        />
      )}

      {/* Logs Modal */}
      {showLogs && (
        <LogsModal logs={logs} onClose={() => setShowLogs(false)} />
      )}
    </div>
  );
};

// Rule Editor Component
const RuleEditor = ({ rule, onSave, onClose }) => {
  const [formData, setFormData] = useState({
    name: rule?.name || '',
    description: rule?.description || '',
    trigger: rule?.trigger || 'task_created',
    conditions: rule?.conditions || [],
    actions: rule?.actions || [{ action_type: 'send_notification', params: { message: '' } }],
    is_enabled: rule?.is_enabled ?? true
  });
  const [saving, setSaving] = useState(false);

  const handleAddCondition = () => {
    setFormData(prev => ({
      ...prev,
      conditions: [...prev.conditions, { field: 'status', operator: 'equals', value: '' }]
    }));
  };

  const handleRemoveCondition = (index) => {
    setFormData(prev => ({
      ...prev,
      conditions: prev.conditions.filter((_, i) => i !== index)
    }));
  };

  const handleAddAction = () => {
    setFormData(prev => ({
      ...prev,
      actions: [...prev.actions, { action_type: 'send_notification', params: {} }]
    }));
  };

  const handleRemoveAction = (index) => {
    setFormData(prev => ({
      ...prev,
      actions: prev.actions.filter((_, i) => i !== index)
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    await onSave(formData);
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-[600px] max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b flex items-center justify-between sticky top-0 bg-white">
          <h2 className="text-lg font-semibold">
            {rule ? 'Edit Rule' : 'Create New Rule'}
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded" data-testid="close-rule-editor">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400 hover:text-slate-600"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-6">
          {/* Name & Description */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Rule Name *
              </label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Auto-assign bugs"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Description
              </label>
              <Input
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="What does this rule do?"
              />
            </div>
          </div>

          {/* Trigger */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              <Zap className="w-4 h-4 inline mr-1" />
              When this happens (Trigger)
            </label>
            <Select
              value={formData.trigger}
              onValueChange={(v) => setFormData({ ...formData, trigger: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(triggerLabels).map(([key, label]) => (
                  <SelectItem key={key} value={key}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Conditions */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-slate-700">
                If these conditions are true (optional)
              </label>
              <Button type="button" variant="outline" size="sm" onClick={handleAddCondition}>
                <Plus className="w-3 h-3 mr-1" />
                Add
              </Button>
            </div>
            
            {formData.conditions.map((cond, index) => (
              <div key={index} className="flex items-center gap-2 mb-2 p-2 bg-slate-50 rounded">
                <Select
                  value={cond.field}
                  onValueChange={(v) => {
                    const newConditions = [...formData.conditions];
                    newConditions[index].field = v;
                    setFormData({ ...formData, conditions: newConditions });
                  }}
                >
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="status">Status</SelectItem>
                    <SelectItem value="priority">Priority</SelectItem>
                    <SelectItem value="task_type">Type</SelectItem>
                  </SelectContent>
                </Select>
                
                <span className="text-sm text-slate-500">equals</span>
                
                <Input
                  value={cond.value}
                  onChange={(e) => {
                    const newConditions = [...formData.conditions];
                    newConditions[index].value = e.target.value;
                    setFormData({ ...formData, conditions: newConditions });
                  }}
                  placeholder="Value"
                  className="flex-1"
                />
                
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRemoveCondition(index)}
                >
                  <Trash2 className="w-4 h-4 text-red-500" />
                </Button>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-slate-700">
                Then do this (Actions) *
              </label>
              <Button type="button" variant="outline" size="sm" onClick={handleAddAction}>
                <Plus className="w-3 h-3 mr-1" />
                Add
              </Button>
            </div>
            
            {formData.actions.map((action, index) => (
              <div key={index} className="p-3 bg-blue-50 rounded mb-2">
                <div className="flex items-center gap-2 mb-2">
                  <Select
                    value={action.action_type}
                    onValueChange={(v) => {
                      const newActions = [...formData.actions];
                      newActions[index].action_type = v;
                      newActions[index].params = {};
                      setFormData({ ...formData, actions: newActions });
                    }}
                  >
                    <SelectTrigger className="w-48">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(actionLabels).map(([key, label]) => (
                        <SelectItem key={key} value={key}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemoveAction(index)}
                    disabled={formData.actions.length === 1}
                  >
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </Button>
                </div>
                
                {/* Action-specific params */}
                {action.action_type === 'change_status' && (
                  <Select
                    value={action.params.status || ''}
                    onValueChange={(v) => {
                      const newActions = [...formData.actions];
                      newActions[index].params.status = v;
                      setFormData({ ...formData, actions: newActions });
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todo">To Do</SelectItem>
                      <SelectItem value="in_progress">In Progress</SelectItem>
                      <SelectItem value="blocked">Blocked</SelectItem>
                      <SelectItem value="done">Done</SelectItem>
                    </SelectContent>
                  </Select>
                )}
                
                {action.action_type === 'set_priority' && (
                  <Select
                    value={action.params.priority || ''}
                    onValueChange={(v) => {
                      const newActions = [...formData.actions];
                      newActions[index].params.priority = v;
                      setFormData({ ...formData, actions: newActions });
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select priority" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="urgent">Urgent</SelectItem>
                    </SelectContent>
                  </Select>
                )}
                
                {(action.action_type === 'send_notification' || action.action_type === 'add_comment') && (
                  <Input
                    value={action.params.message || action.params.comment || ''}
                    onChange={(e) => {
                      const newActions = [...formData.actions];
                      const key = action.action_type === 'add_comment' ? 'comment' : 'message';
                      newActions[index].params[key] = e.target.value;
                      setFormData({ ...formData, actions: newActions });
                    }}
                    placeholder={action.action_type === 'add_comment' ? 'Comment text' : 'Notification message'}
                  />
                )}
              </div>
            ))}
          </div>

          {/* Submit */}
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !formData.name || !formData.actions.length}>
              {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              {rule ? 'Update Rule' : 'Create Rule'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Logs Modal Component
const LogsModal = ({ logs, onClose }) => {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-[600px] max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b flex items-center justify-between">
          <h2 className="text-lg font-semibold">Automation Logs</h2>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded" data-testid="close-logs-modal">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400 hover:text-slate-600"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {logs.length > 0 ? (
            <div className="space-y-2">
              {logs.map(log => (
                <div 
                  key={log.id}
                  className={`p-3 rounded-lg border ${
                    log.status === 'success' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-slate-900">{log.rule_name}</span>
                    <Badge variant={log.status === 'success' ? 'default' : 'destructive'}>
                      {log.status}
                    </Badge>
                  </div>
                  <p className="text-sm text-slate-500">
                    Trigger: {triggerLabels[log.trigger] || log.trigger}
                  </p>
                  <p className="text-xs text-slate-400">
                    {new Date(log.executed_at).toLocaleString()}
                  </p>
                  {log.error && (
                    <p className="text-sm text-red-600 mt-1">{log.error}</p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-slate-500">
              No automation logs yet
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AutomationPage;
