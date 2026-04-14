/**
 * Task Board View Component
 * Kanban-style board with enhanced drag and drop UX
 */
import React, { useState } from 'react';
import { 
  Circle, Clock, Ban, CheckCircle2,
  User, Calendar, GripVertical
} from 'lucide-react';
import { Badge } from '../../components/ui/badge';

const statusColumns = [
  { id: 'todo', label: 'To Do', icon: Circle, color: 'slate', gradient: 'from-slate-400 to-slate-500' },
  { id: 'in_progress', label: 'In Progress', icon: Clock, color: 'blue', gradient: 'from-blue-400 to-blue-600' },
  { id: 'pending_approval', label: 'Pending Approval', icon: Clock, color: 'amber', gradient: 'from-amber-400 to-amber-500' },
  { id: 'blocked', label: 'Blocked', icon: Ban, color: 'red', gradient: 'from-red-400 to-red-600' },
  { id: 'done', label: 'Done', icon: CheckCircle2, color: 'green', gradient: 'from-green-400 to-green-600' },
];

const priorityColors = {
  low: 'bg-slate-400',
  medium: 'bg-blue-500',
  high: 'bg-orange-500',
  urgent: 'bg-red-500',
};

const TaskBoardView = ({ tasks, onTaskClick, onTaskMove, projectId }) => {
  const [draggedTask, setDraggedTask] = useState(null);
  const [dragOverColumn, setDragOverColumn] = useState(null);
  const [dragOverPosition, setDragOverPosition] = useState(null);

  const handleDragStart = (e, task) => {
    setDraggedTask(task);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', task.id);
    
    // Add drag ghost styling
    if (e.target) {
      e.target.style.opacity = '0.5';
    }
  };

  const handleDragEnd = (e) => {
    setDraggedTask(null);
    setDragOverColumn(null);
    setDragOverPosition(null);
    
    // Reset drag ghost styling
    if (e.target) {
      e.target.style.opacity = '1';
    }
  };

  const handleDragOver = (e, columnId) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverColumn(columnId);
  };

  const handleDragLeave = (e) => {
    // Only clear if leaving the column entirely
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setDragOverColumn(null);
      setDragOverPosition(null);
    }
  };

  const handleDrop = (e, columnId) => {
    e.preventDefault();
    if (draggedTask && draggedTask.status !== columnId) {
      onTaskMove(draggedTask.id, columnId);
    }
    setDraggedTask(null);
    setDragOverColumn(null);
    setDragOverPosition(null);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const isOverdue = (dateStr) => {
    if (!dateStr) return false;
    return new Date(dateStr) < new Date();
  };

  return (
    <div className="h-full flex gap-4 p-4 overflow-x-auto bg-slate-50" data-testid="task-board-view">
      {statusColumns.map((column) => {
        const columnTasks = tasks.filter(t => t.status === column.id);
        const Icon = column.icon;
        const isDragOver = dragOverColumn === column.id;
        const isSourceColumn = draggedTask?.status === column.id;
        
        return (
          <div
            key={column.id}
            className={`flex-shrink-0 w-80 flex flex-col rounded-xl transition-all duration-200 ${
              isDragOver && !isSourceColumn 
                ? 'bg-blue-50 ring-2 ring-blue-400 ring-opacity-50' 
                : 'bg-slate-100'
            }`}
            onDragOver={(e) => handleDragOver(e, column.id)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, column.id)}
            data-testid={`board-column-${column.id}`}
          >
            {/* Column Header */}
            <div className={`flex items-center gap-2 px-3 py-3 rounded-t-xl bg-gradient-to-r ${column.gradient}`}>
              <Icon className="w-4 h-4 text-white" />
              <span className="text-sm font-semibold text-white">{column.label}</span>
              <span className="text-xs text-white/80 bg-white/20 px-2 py-0.5 rounded-full ml-auto">
                {columnTasks.length}
              </span>
            </div>

            {/* Cards Container */}
            <div 
              className={`flex-1 overflow-y-auto px-2 pb-2 pt-2 space-y-2 transition-all duration-200 ${
                isDragOver && !isSourceColumn ? 'min-h-[120px]' : ''
              }`}
            >
              {columnTasks.map((task, index) => {
                const isDragging = draggedTask?.id === task.id;
                
                return (
                  <div
                    key={task.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, task)}
                    onDragEnd={handleDragEnd}
                    onClick={() => onTaskClick(task)}
                    className={`bg-white rounded-lg p-3 border border-slate-200 cursor-grab active:cursor-grabbing 
                      transition-all duration-200 group
                      ${isDragging 
                        ? 'opacity-50 scale-95 rotate-2 shadow-lg ring-2 ring-blue-400' 
                        : 'hover:shadow-md hover:-translate-y-0.5'
                      }`}
                    data-testid={`task-card-${task.id}`}
                  >
                    {/* Drag Handle Indicator */}
                    <div className="flex items-center gap-2 mb-2">
                      <GripVertical className="w-3 h-3 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                      <div className={`w-2 h-2 rounded-full ${priorityColors[task.priority] || priorityColors.medium}`} />
                      <span className="text-xs text-slate-400 capitalize">{task.priority}</span>
                      {task.task_type && task.task_type !== 'other' && (
                        <Badge variant="outline" className="text-xs ml-auto capitalize">
                          {task.task_type}
                        </Badge>
                      )}
                    </div>

                    {/* Title */}
                    <h4 className={`text-sm font-medium mb-2 ${
                      task.status === 'done' ? 'line-through text-slate-400' : 'text-slate-900'
                    }`}>
                      {task.title}
                    </h4>

                    {/* Tags */}
                    {task.tags?.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-2">
                        {task.tags.slice(0, 3).map((tag, i) => (
                          <Badge key={i} variant="secondary" className="text-xs">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    )}

                    {/* Footer */}
                    <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-100">
                      <div className="flex items-center gap-2">
                        {/* Subtask Progress */}
                        {task.subtask_count > 0 && (
                          <span className="text-xs text-slate-400 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" />
                            {task.completed_subtask_count}/{task.subtask_count}
                          </span>
                        )}
                        
                        {/* Due Date */}
                        {task.due_date && (
                          <span className={`text-xs flex items-center gap-1 ${
                            isOverdue(task.due_date) && task.status !== 'done' 
                              ? 'text-red-500 font-medium' 
                              : 'text-slate-400'
                          }`}>
                            <Calendar className="w-3 h-3" />
                            {formatDate(task.due_date)}
                          </span>
                        )}
                      </div>

                      {/* Assignee */}
                      {task.assignee_id ? (
                        <div 
                          className="w-7 h-7 bg-gradient-to-br from-blue-400 to-blue-600 rounded-full flex items-center justify-center text-white text-xs font-medium shadow-sm"
                          title={task.assignee?.name || 'Assigned'}
                        >
                          {task.assignee?.initials || <User className="w-3 h-3" />}
                        </div>
                      ) : (
                        <div className="w-7 h-7 bg-slate-100 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-50 transition-opacity">
                          <User className="w-3 h-3 text-slate-400" />
                        </div>
                      )}
                    </div>

                    {/* Blocked Indicator */}
                    {task.is_blocked && (
                      <div className="mt-2 flex items-center gap-1 text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded">
                        <Ban className="w-3 h-3" />
                        Blocked by dependencies
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Drop Zone Indicator */}
              {isDragOver && !isSourceColumn && (
                <div className="flex items-center justify-center h-20 border-2 border-dashed border-blue-400 rounded-lg bg-blue-50 animate-pulse">
                  <p className="text-sm text-blue-600 font-medium">
                    Drop here to move to {column.label}
                  </p>
                </div>
              )}

              {/* Empty State */}
              {columnTasks.length === 0 && !isDragOver && (
                <div className="flex items-center justify-center h-24 border-2 border-dashed border-slate-200 rounded-lg">
                  <p className="text-sm text-slate-400">No tasks</p>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default TaskBoardView;
