/**
 * Task Dependencies Component
 * Manage blocked_by and blocking relationships
 */
import React, { useState, useEffect } from 'react';
import { 
  Link2, Plus, X, Loader2, AlertTriangle, 
  ArrowRight, Check, Search, Ban
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Badge } from '../../components/ui/badge';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const statusColors = {
  todo: 'bg-slate-100 text-slate-600',
  in_progress: 'bg-blue-100 text-blue-600',
  blocked: 'bg-amber-100 text-amber-600',
  done: 'bg-green-100 text-green-600',
};

const TaskDependencies = ({ taskId, projectId, onUpdate }) => {
  const [dependencies, setDependencies] = useState({ blocked_by: [], blocking: [] });
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addType, setAddType] = useState('blocked_by'); // 'blocked_by' or 'blocking'
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchDependencies();
  }, [taskId]);

  const fetchDependencies = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/task-manager/tasks/${taskId}/dependencies`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        setDependencies(data);
      }
    } catch (err) {
      console.error('Error fetching dependencies:', err);
    } finally {
      setLoading(false);
    }
  };

  const searchTasks = async (query) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    try {
      setSearching(true);
      const token = localStorage.getItem('token');
      const params = new URLSearchParams({ project_id: projectId });
      
      const response = await fetch(`${API_URL}/api/task-manager/tasks?${params}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const tasks = await response.json();
        // Filter out current task and already linked tasks
        const existingIds = [
          taskId,
          ...dependencies.blocked_by.map(t => t.id),
          ...dependencies.blocking.map(t => t.id)
        ];
        
        const filtered = tasks.filter(t => 
          !existingIds.includes(t.id) &&
          t.title.toLowerCase().includes(query.toLowerCase())
        );
        setSearchResults(filtered);
      }
    } catch (err) {
      console.error('Error searching tasks:', err);
    } finally {
      setSearching(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      if (showAddModal) {
        searchTasks(searchQuery);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, showAddModal]);

  const handleAddDependency = async (targetTaskId) => {
    try {
      setAdding(true);
      setError(null);
      const token = localStorage.getItem('token');
      
      const body = addType === 'blocked_by' 
        ? { blocked_by_task_id: targetTaskId }
        : { blocking_task_id: targetTaskId };

      const response = await fetch(`${API_URL}/api/task-manager/tasks/${taskId}/dependencies`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || 'Failed to add dependency');
      }

      await fetchDependencies();
      setShowAddModal(false);
      setSearchQuery('');
      onUpdate?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setAdding(false);
    }
  };

  const handleRemoveDependency = async (targetTaskId) => {
    try {
      const token = localStorage.getItem('token');
      
      const response = await fetch(
        `${API_URL}/api/task-manager/tasks/${taskId}/dependencies/${targetTaskId}`,
        {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` }
        }
      );

      if (response.ok) {
        await fetchDependencies();
        onUpdate?.();
      }
    } catch (err) {
      console.error('Error removing dependency:', err);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-4">
        <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="task-dependencies">
      {/* Blocked By Section */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs text-slate-500 flex items-center gap-1">
            <Ban className="w-3 h-3" />
            Blocked By ({dependencies.blocked_by?.length || 0})
          </label>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2"
            onClick={() => {
              setAddType('blocked_by');
              setShowAddModal(true);
            }}
          >
            <Plus className="w-3 h-3" />
          </Button>
        </div>
        
        {dependencies.blocked_by?.length > 0 ? (
          <div className="space-y-1">
            {dependencies.blocked_by.map(task => (
              <div 
                key={task.id}
                className="flex items-center gap-2 p-2 bg-amber-50 rounded-lg group"
              >
                <ArrowRight className="w-3 h-3 text-amber-500 rotate-180" />
                <span className="flex-1 text-sm text-slate-700 truncate">
                  {task.title}
                </span>
                <Badge className={`${statusColors[task.status]} text-xs capitalize`}>
                  {task.status?.replace('_', ' ')}
                </Badge>
                <button
                  onClick={() => handleRemoveDependency(task.id)}
                  className="p-1 text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-400 italic">No blocking dependencies</p>
        )}
      </div>

      {/* Blocking Section */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs text-slate-500 flex items-center gap-1">
            <Link2 className="w-3 h-3" />
            Blocking ({dependencies.blocking?.length || 0})
          </label>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2"
            onClick={() => {
              setAddType('blocking');
              setShowAddModal(true);
            }}
          >
            <Plus className="w-3 h-3" />
          </Button>
        </div>
        
        {dependencies.blocking?.length > 0 ? (
          <div className="space-y-1">
            {dependencies.blocking.map(task => (
              <div 
                key={task.id}
                className="flex items-center gap-2 p-2 bg-blue-50 rounded-lg group"
              >
                <ArrowRight className="w-3 h-3 text-blue-500" />
                <span className="flex-1 text-sm text-slate-700 truncate">
                  {task.title}
                </span>
                <Badge className={`${statusColors[task.status]} text-xs capitalize`}>
                  {task.status?.replace('_', ' ')}
                </Badge>
                <button
                  onClick={() => handleRemoveDependency(task.id)}
                  className="p-1 text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-400 italic">Not blocking any tasks</p>
        )}
      </div>

      {/* Add Dependency Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-96 max-h-[80vh] flex flex-col">
            <div className="p-4 border-b flex items-center justify-between">
              <h3 className="font-semibold text-slate-900">
                {addType === 'blocked_by' ? 'Add Blocking Task' : 'Add Task to Block'}
              </h3>
              <button onClick={() => setShowAddModal(false)}>
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            
            <div className="p-4">
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  placeholder="Search tasks..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                  autoFocus
                />
              </div>

              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-600 text-sm">
                  <AlertTriangle className="w-4 h-4" />
                  {error}
                </div>
              )}

              <div className="max-h-64 overflow-y-auto">
                {searching ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
                  </div>
                ) : searchResults.length > 0 ? (
                  <div className="space-y-1">
                    {searchResults.map(task => (
                      <button
                        key={task.id}
                        onClick={() => handleAddDependency(task.id)}
                        disabled={adding}
                        className="w-full flex items-center gap-2 p-3 hover:bg-slate-100 rounded-lg text-left"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-700 truncate">
                            {task.title}
                          </p>
                        </div>
                        <Badge className={`${statusColors[task.status]} text-xs capitalize`}>
                          {task.status?.replace('_', ' ')}
                        </Badge>
                      </button>
                    ))}
                  </div>
                ) : searchQuery ? (
                  <p className="text-center text-sm text-slate-400 py-8">
                    No matching tasks found
                  </p>
                ) : (
                  <p className="text-center text-sm text-slate-400 py-8">
                    Type to search for tasks
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TaskDependencies;
