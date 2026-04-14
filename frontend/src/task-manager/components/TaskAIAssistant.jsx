/**
 * TaskAIAssistant Component
 * AI-powered task assistance features
 */
import React, { useState } from 'react';
import { Button } from '../../components/ui/button';
import { Textarea } from '../../components/ui/textarea';
import { Badge } from '../../components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import {
  Sparkles,
  Loader2,
  Wand2,
  ListTodo,
  AlertTriangle,
  Check,
  Copy,
  ArrowRight,
  Brain,
  Lightbulb,
} from 'lucide-react';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const priorityColors = {
  low: 'bg-slate-100 text-slate-600',
  medium: 'bg-blue-100 text-blue-600',
  high: 'bg-orange-100 text-orange-600',
  urgent: 'bg-red-100 text-red-600',
};

const TaskAIAssistant = ({ taskId, projectId, currentDescription, onDescriptionUpdate }) => {
  const [showDialog, setShowDialog] = useState(false);
  const [activeAction, setActiveAction] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  
  // Notes to tasks state
  const [notesInput, setNotesInput] = useState('');
  const [suggestedTasks, setSuggestedTasks] = useState([]);
  const [selectedTasks, setSelectedTasks] = useState([]);

  const handleImproveDescription = async () => {
    setActiveAction('improve');
    setLoading(true);
    setResult(null);
    
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/api/task-manager/ai/improve-description?task_id=${taskId}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (res.ok) {
        const data = await res.json();
        setResult({
          type: 'improve',
          content: data.improved_description,
          reasoning: data.reasoning
        });
      } else {
        const error = await res.json();
        toast.error(error.detail || 'Failed to improve description');
        setShowDialog(false);
      }
    } catch (error) {
      console.error('AI error:', error);
      toast.error('AI service error');
      setShowDialog(false);
    } finally {
      setLoading(false);
    }
  };

  const handleSuggestPriority = async () => {
    setActiveAction('priority');
    setLoading(true);
    setResult(null);
    
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/api/task-manager/ai/suggest-priority`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ task_ids: [taskId] })
      });
      
      if (res.ok) {
        const data = await res.json();
        const suggestion = data.suggestions?.[0];
        setResult({
          type: 'priority',
          suggestion: suggestion,
        });
      } else {
        const error = await res.json();
        toast.error(error.detail || 'Failed to suggest priority');
        setShowDialog(false);
      }
    } catch (error) {
      console.error('AI error:', error);
      toast.error('AI service error');
      setShowDialog(false);
    } finally {
      setLoading(false);
    }
  };

  const handleNotesToTasks = async () => {
    if (!notesInput.trim()) {
      toast.error('Please enter some notes');
      return;
    }

    setActiveAction('notes');
    setLoading(true);
    setSuggestedTasks([]);
    
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/api/task-manager/ai/notes-to-tasks`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          notes: notesInput,
          project_id: projectId
        })
      });
      
      if (res.ok) {
        const data = await res.json();
        setSuggestedTasks(data.suggested_tasks || []);
        setSelectedTasks(data.suggested_tasks?.map((_, i) => i) || []);
        setResult({
          type: 'notes',
          reasoning: data.reasoning
        });
      } else {
        const error = await res.json();
        toast.error(error.detail || 'Failed to parse notes');
      }
    } catch (error) {
      console.error('AI error:', error);
      toast.error('AI service error');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTasksFromNotes = async () => {
    const tasksToCreate = suggestedTasks.filter((_, i) => selectedTasks.includes(i));
    
    if (tasksToCreate.length === 0) {
      toast.error('Please select at least one task');
      return;
    }

    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/api/task-manager/ai/notes-to-tasks/confirm`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          tasks: tasksToCreate,
          project_id: projectId
        })
      });

      if (res.ok) {
        const data = await res.json();
        toast.success(`Created ${data.created_count} tasks`);
        setShowDialog(false);
        resetState();
        // Trigger refresh
        if (onDescriptionUpdate) onDescriptionUpdate();
      } else {
        const error = await res.json();
        toast.error(error.detail || 'Failed to create tasks');
      }
    } catch (error) {
      console.error('Error creating tasks:', error);
      toast.error('Failed to create tasks');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyImprovedDescription = () => {
    if (result?.content) {
      navigator.clipboard.writeText(result.content);
      toast.success('Copied to clipboard');
    }
  };

  const handleApplyDescription = async () => {
    if (result?.content && onDescriptionUpdate) {
      onDescriptionUpdate(result.content);
      toast.success('Description updated');
      setShowDialog(false);
      resetState();
    }
  };

  const resetState = () => {
    setActiveAction(null);
    setResult(null);
    setNotesInput('');
    setSuggestedTasks([]);
    setSelectedTasks([]);
  };

  const toggleTaskSelection = (index) => {
    setSelectedTasks(prev => 
      prev.includes(index) 
        ? prev.filter(i => i !== index)
        : [...prev, index]
    );
  };

  return (
    <>
      {/* AI Assistant Button */}
      <Button
        variant="outline"
        size="sm"
        onClick={() => setShowDialog(true)}
        className="text-purple-600 border-purple-200 hover:bg-purple-50"
        data-testid="ai-assistant-btn"
      >
        <Sparkles className="w-4 h-4 mr-1" />
        Ask AI
      </Button>

      {/* AI Assistant Dialog */}
      <Dialog open={showDialog} onOpenChange={(open) => {
        setShowDialog(open);
        if (!open) resetState();
      }}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-purple-600" />
              AI Assistant
            </DialogTitle>
            <DialogDescription>
              Let AI help you with task management
            </DialogDescription>
          </DialogHeader>

          {!activeAction ? (
            /* Action Selection */
            <div className="space-y-4 py-4">
              <p className="text-sm text-slate-500">What would you like help with?</p>
              
              <div className="grid gap-3">
                {/* Improve Description */}
                <button
                  onClick={handleImproveDescription}
                  className="flex items-start gap-4 p-4 rounded-lg border hover:border-purple-300 hover:bg-purple-50 transition-colors text-left"
                  data-testid="ai-improve-description"
                >
                  <div className="p-2 bg-purple-100 rounded-lg">
                    <Wand2 className="w-5 h-5 text-purple-600" />
                  </div>
                  <div>
                    <h4 className="font-medium text-slate-900">Improve Description</h4>
                    <p className="text-sm text-slate-500">
                      Expand this task into Problem, Acceptance Criteria, and Steps
                    </p>
                  </div>
                </button>

                {/* Suggest Priority */}
                <button
                  onClick={handleSuggestPriority}
                  className="flex items-start gap-4 p-4 rounded-lg border hover:border-blue-300 hover:bg-blue-50 transition-colors text-left"
                  data-testid="ai-suggest-priority"
                >
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <AlertTriangle className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <h4 className="font-medium text-slate-900">Suggest Priority</h4>
                    <p className="text-sm text-slate-500">
                      Analyze due date, dependencies, and status to recommend priority
                    </p>
                  </div>
                </button>

                {/* Notes to Tasks */}
                {projectId && (
                  <button
                    onClick={() => setActiveAction('notes-input')}
                    className="flex items-start gap-4 p-4 rounded-lg border hover:border-green-300 hover:bg-green-50 transition-colors text-left"
                    data-testid="ai-notes-to-tasks"
                  >
                    <div className="p-2 bg-green-100 rounded-lg">
                      <ListTodo className="w-5 h-5 text-green-600" />
                    </div>
                    <div>
                      <h4 className="font-medium text-slate-900">Notes → Tasks</h4>
                      <p className="text-sm text-slate-500">
                        Convert pasted notes or text into multiple actionable tasks
                      </p>
                    </div>
                  </button>
                )}
              </div>
            </div>
          ) : loading ? (
            /* Loading State */
            <div className="flex flex-col items-center justify-center py-12">
              <div className="relative">
                <Brain className="w-12 h-12 text-purple-200 animate-pulse" />
                <Loader2 className="w-6 h-6 text-purple-600 animate-spin absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
              </div>
              <p className="mt-4 text-slate-600">AI is thinking...</p>
              <p className="text-sm text-slate-400">This may take a few seconds</p>
            </div>
          ) : activeAction === 'notes-input' ? (
            /* Notes Input */
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">
                  Paste your notes or text
                </label>
                <Textarea
                  placeholder="Meeting notes, requirements, ideas, bug reports..."
                  value={notesInput}
                  onChange={(e) => setNotesInput(e.target.value)}
                  rows={8}
                  data-testid="notes-input-textarea"
                />
                <p className="text-xs text-slate-400">
                  AI will extract actionable tasks from your text
                </p>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setActiveAction(null)}>
                  Back
                </Button>
                <Button onClick={handleNotesToTasks} disabled={!notesInput.trim()}>
                  <Sparkles className="w-4 h-4 mr-1" />
                  Extract Tasks
                </Button>
              </div>
            </div>
          ) : result?.type === 'improve' ? (
            /* Improve Description Result */
            <div className="space-y-4 py-4">
              <div className="flex items-start gap-2 p-3 bg-purple-50 rounded-lg border border-purple-200">
                <Lightbulb className="w-4 h-4 text-purple-600 mt-0.5" />
                <p className="text-sm text-purple-800">{result.reasoning}</p>
              </div>
              
              <div className="bg-slate-50 rounded-lg p-4 border max-h-64 overflow-y-auto">
                <pre className="text-sm text-slate-700 whitespace-pre-wrap font-sans">
                  {result.content}
                </pre>
              </div>
              
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={handleCopyImprovedDescription}>
                  <Copy className="w-4 h-4 mr-1" />
                  Copy
                </Button>
                <Button onClick={handleApplyDescription} data-testid="apply-description-btn">
                  <Check className="w-4 h-4 mr-1" />
                  Apply to Task
                </Button>
              </div>
            </div>
          ) : result?.type === 'priority' ? (
            /* Suggest Priority Result */
            <div className="space-y-4 py-4">
              <div className="text-center py-6">
                <p className="text-sm text-slate-500 mb-3">Suggested Priority</p>
                <Badge className={`text-lg px-4 py-2 ${priorityColors[result.suggestion?.suggested_priority || 'medium']}`}>
                  {(result.suggestion?.suggested_priority || 'medium').toUpperCase()}
                </Badge>
              </div>
              
              <div className="flex items-start gap-2 p-3 bg-blue-50 rounded-lg border border-blue-200">
                <Lightbulb className="w-4 h-4 text-blue-600 mt-0.5" />
                <p className="text-sm text-blue-800">{result.suggestion?.reasoning}</p>
              </div>
              
              <div className="flex justify-end">
                <Button onClick={() => {
                  toast.success('Priority recommendation noted');
                  setShowDialog(false);
                  resetState();
                }}>
                  Got it
                </Button>
              </div>
            </div>
          ) : result?.type === 'notes' && suggestedTasks.length > 0 ? (
            /* Notes to Tasks Result */
            <div className="space-y-4 py-4">
              <div className="flex items-start gap-2 p-3 bg-green-50 rounded-lg border border-green-200">
                <Lightbulb className="w-4 h-4 text-green-600 mt-0.5" />
                <p className="text-sm text-green-800">{result.reasoning}</p>
              </div>
              
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {suggestedTasks.map((task, index) => (
                  <div
                    key={index}
                    className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                      selectedTasks.includes(index)
                        ? 'border-green-400 bg-green-50'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                    onClick={() => toggleTaskSelection(index)}
                    data-testid={`suggested-task-${index}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`w-5 h-5 rounded border flex items-center justify-center ${
                        selectedTasks.includes(index)
                          ? 'bg-green-500 border-green-500'
                          : 'border-slate-300'
                      }`}>
                        {selectedTasks.includes(index) && (
                          <Check className="w-3 h-3 text-white" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-slate-900">{task.title}</p>
                        {task.description && (
                          <p className="text-sm text-slate-500 mt-1 line-clamp-2">
                            {task.description}
                          </p>
                        )}
                        <div className="flex items-center gap-2 mt-2">
                          <Badge className={priorityColors[task.priority]}>
                            {task.priority}
                          </Badge>
                          <Badge variant="outline">{task.task_type}</Badge>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              
              <div className="flex items-center justify-between pt-2">
                <p className="text-sm text-slate-500">
                  {selectedTasks.length} of {suggestedTasks.length} selected
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => {
                    setActiveAction('notes-input');
                    setResult(null);
                    setSuggestedTasks([]);
                  }}>
                    Back
                  </Button>
                  <Button 
                    onClick={handleCreateTasksFromNotes}
                    disabled={selectedTasks.length === 0}
                    data-testid="create-tasks-btn"
                  >
                    <ArrowRight className="w-4 h-4 mr-1" />
                    Create {selectedTasks.length} Tasks
                  </Button>
                </div>
              </div>
            </div>
          ) : null}

          {(activeAction && !loading && !result) && (
            <DialogFooter>
              <Button variant="outline" onClick={() => setActiveAction(null)}>
                Back
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default TaskAIAssistant;
