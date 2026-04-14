/**
 * Task Manager Home - Dashboard
 * Shows My Work, Overdue, Blocked tasks and recent projects
 */
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  Calendar, AlertTriangle, Ban, Send, 
  FolderKanban, Plus, Clock, CheckCircle2,
  ArrowRight, Loader2
} from 'lucide-react';
import { Button } from '../../components/ui/button';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const TaskManagerHome = () => {
  const [dashboardData, setDashboardData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/task-manager/my-work`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (!response.ok) throw new Error('Failed to fetch dashboard data');
      
      const data = await response.json();
      setDashboardData(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const statCards = [
    {
      label: 'My Work Today',
      value: dashboardData?.my_today || 0,
      icon: Calendar,
      color: 'bg-blue-500',
      link: '/task-manager?filter=today'
    },
    {
      label: 'Overdue',
      value: dashboardData?.overdue || 0,
      icon: AlertTriangle,
      color: 'bg-red-500',
      link: '/task-manager?filter=overdue'
    },
    {
      label: 'Blocked',
      value: dashboardData?.blocked || 0,
      icon: Ban,
      color: 'bg-amber-500',
      link: '/task-manager?filter=blocked'
    },
    {
      label: 'Assigned by Me',
      value: dashboardData?.assigned_by_me || 0,
      icon: Send,
      color: 'bg-purple-500',
      link: '/task-manager?filter=assigned-by-me'
    }
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <AlertTriangle className="w-12 h-12 text-red-500" />
        <p className="text-slate-600">{error}</p>
        <Button onClick={fetchDashboardData}>Retry</Button>
      </div>
    );
  }

  return (
    <div className="p-6 h-full overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">My Work</h1>
          <p className="text-slate-500 mt-1">Track your tasks and projects</p>
        </div>
        <Link to="/task-manager/projects">
          <Button className="gap-2">
            <Plus className="w-4 h-4" />
            New Project
          </Button>
        </Link>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <Link
              key={card.label}
              to={card.link}
              className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-md transition-all group"
            >
              <div className="flex items-center justify-between">
                <div className={`w-10 h-10 rounded-lg ${card.color} flex items-center justify-center`}>
                  <Icon className="w-5 h-5 text-white" />
                </div>
                <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500 transition-colors" />
              </div>
              <div className="mt-4">
                <p className="text-3xl font-bold text-slate-900">{card.value}</p>
                <p className="text-sm text-slate-500 mt-1">{card.label}</p>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Recent Projects */}
      <div className="bg-white rounded-xl border border-slate-200">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-semibold text-slate-900">Recent Projects</h2>
          <Link to="/task-manager/projects" className="text-sm text-blue-600 hover:text-blue-700">
            View All
          </Link>
        </div>
        
        {dashboardData?.recent_projects?.length > 0 ? (
          <div className="divide-y divide-slate-100">
            {dashboardData.recent_projects.map((project) => (
              <Link
                key={project.id}
                to={`/task-manager/projects/${project.id}`}
                className="flex items-center gap-4 px-5 py-4 hover:bg-slate-50 transition-colors"
              >
                <div 
                  className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-semibold"
                  style={{ backgroundColor: project.color || '#3b82f6' }}
                >
                  {project.name?.charAt(0)?.toUpperCase() || 'P'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-900 truncate">{project.name}</p>
                  <p className="text-sm text-slate-500 truncate">{project.description || 'No description'}</p>
                </div>
                <div className="flex items-center gap-3 text-sm text-slate-500">
                  <span className="flex items-center gap-1">
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                    {project.completed_task_count || 0}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-4 h-4 text-slate-400" />
                    {project.task_count || 0}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="p-8 text-center">
            <FolderKanban className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 mb-4">No projects yet</p>
            <Link to="/task-manager/projects">
              <Button variant="outline" className="gap-2">
                <Plus className="w-4 h-4" />
                Create your first project
              </Button>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
};

export default TaskManagerHome;
