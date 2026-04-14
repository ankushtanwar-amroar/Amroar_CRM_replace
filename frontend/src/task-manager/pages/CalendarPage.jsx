/**
 * Calendar Page
 * Global calendar view showing all tasks across projects
 */
import React, { useState, useEffect } from 'react';
import { Loader2, Calendar as CalendarIcon } from 'lucide-react';
import CalendarView from '../components/CalendarView';
import TaskDetailModal from '../components/TaskDetailModal';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const CalendarPage = () => {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTask, setSelectedTask] = useState(null);
  const [currentDate, setCurrentDate] = useState(new Date());

  useEffect(() => {
    fetchTasks();
  }, [currentDate]);

  const fetchTasks = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const params = new URLSearchParams({
        year: currentDate.getFullYear(),
        month: currentDate.getMonth() + 1,
      });

      const response = await fetch(`${API_URL}/api/task-manager/calendar?${params}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        setTasks(data.tasks || []);
      }
    } catch (err) {
      console.error('Error fetching calendar tasks:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleTaskUpdated = (updatedTask) => {
    setTasks(prev => prev.map(t => t.id === updatedTask.id ? updatedTask : t));
    setSelectedTask(null);
  };

  const handleTaskDeleted = (taskId) => {
    setTasks(prev => prev.filter(t => t.id !== taskId));
    setSelectedTask(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full" data-testid="calendar-page">
      <CalendarView
        tasks={tasks}
        onTaskClick={setSelectedTask}
        isGlobalView={true}
      />

      {/* Task Detail Modal */}
      {selectedTask && (
        <TaskDetailModal
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onUpdate={handleTaskUpdated}
          onDelete={handleTaskDeleted}
        />
      )}
    </div>
  );
};

export default CalendarPage;
