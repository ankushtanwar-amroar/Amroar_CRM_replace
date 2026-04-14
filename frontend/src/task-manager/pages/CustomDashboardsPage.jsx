/**
 * Custom Dashboards Page - Phase 16
 * Dashboard builder with drag-and-drop widgets
 */
import React, { useState, useEffect, useCallback } from 'react';
import GridLayout from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import {
  Plus, LayoutDashboard, Settings, Trash2, Edit2,
  Share2, Copy, MoreHorizontal, Loader2, Save,
  GripVertical, X, BarChart3, PieChart, LineChart,
  Table2, Hash, Filter, RefreshCw, ChevronDown,
  Eye, Users, Lock, Clock
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Badge } from '../../components/ui/badge';
import { Label } from '../../components/ui/label';
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
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '../../components/ui/dropdown-menu';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '../../components/ui/tabs';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart as RechartsPie,
  Pie,
  Cell,
  LineChart as RechartsLine,
  Line,
  Legend
} from 'recharts';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const CHART_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4'];

const WIDGET_ICONS = {
  kpi_card: Hash,
  bar_chart: BarChart3,
  line_chart: LineChart,
  pie_chart: PieChart,
  table: Table2
};

const CustomDashboardsPage = () => {
  const [view, setView] = useState('list'); // 'list' or 'builder'
  const [dashboards, setDashboards] = useState([]);
  const [currentDashboard, setCurrentDashboard] = useState(null);
  const [widgetsData, setWidgetsData] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [metadata, setMetadata] = useState(null);
  const [projects, setProjects] = useState([]);
  const [users, setUsers] = useState([]);
  
  // Dialogs
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showWidgetDialog, setShowWidgetDialog] = useState(false);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [editingWidget, setEditingWidget] = useState(null);
  
  // Form states
  const [dashboardForm, setDashboardForm] = useState({ name: '', description: '' });
  const [widgetForm, setWidgetForm] = useState({
    widget_type: 'kpi_card',
    title: '',
    data_source: 'task_performance',
    config: { metric: 'total_created' }
  });
  const [shareWith, setShareWith] = useState([]);
  
  // Filters
  const [dateRange, setDateRange] = useState('last_30_days');
  const [projectFilter, setProjectFilter] = useState('');

  const fetchDashboards = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/task-manager/custom-dashboards`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setDashboards(data.dashboards || []);
      }
    } catch (error) {
      console.error('Error fetching dashboards:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchMetadata = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/task-manager/custom-dashboards/metadata`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setMetadata(data);
      }
    } catch (error) {
      console.error('Error fetching metadata:', error);
    }
  }, []);

  const fetchProjects = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/task-manager/projects`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setProjects(data || []);
      }
    } catch (error) {
      console.error('Error fetching projects:', error);
    }
  }, []);

  const fetchUsers = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/task-manager/custom-dashboards/users/available`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setUsers(data.users || []);
      }
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  }, []);

  const fetchDashboardData = useCallback(async (dashboardId) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/task-manager/custom-dashboards/${dashboardId}/data`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setWidgetsData(data.widgets_data || {});
      }
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    }
  }, []);

  useEffect(() => {
    fetchDashboards();
    fetchMetadata();
    fetchProjects();
    fetchUsers();
  }, [fetchDashboards, fetchMetadata, fetchProjects, fetchUsers]);

  useEffect(() => {
    if (currentDashboard) {
      fetchDashboardData(currentDashboard.id);
    }
  }, [currentDashboard, fetchDashboardData]);

  const openDashboard = async (dashboard) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/task-manager/custom-dashboards/${dashboard.id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setCurrentDashboard(data);
        setView('builder');
      }
    } catch (error) {
      console.error('Error opening dashboard:', error);
    }
  };

  const handleCreateDashboard = async () => {
    if (!dashboardForm.name.trim()) {
      toast.error('Please enter a dashboard name');
      return;
    }
    
    setSaving(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/task-manager/custom-dashboards`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: dashboardForm.name,
          description: dashboardForm.description,
          global_filters: { date_range: dateRange, project_id: projectFilter || null }
        })
      });
      
      if (response.ok) {
        const dashboard = await response.json();
        toast.success('Dashboard created');
        setShowCreateDialog(false);
        setDashboardForm({ name: '', description: '' });
        setCurrentDashboard(dashboard);
        setView('builder');
        fetchDashboards();
      } else {
        const error = await response.json();
        toast.error(error.detail || 'Failed to create dashboard');
      }
    } catch (error) {
      toast.error('Failed to create dashboard');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteDashboard = async (dashboard) => {
    if (!window.confirm(`Delete "${dashboard.name}"?`)) return;
    
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/task-manager/custom-dashboards/${dashboard.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        toast.success('Dashboard deleted');
        fetchDashboards();
        if (currentDashboard?.id === dashboard.id) {
          setCurrentDashboard(null);
          setView('list');
        }
      }
    } catch (error) {
      toast.error('Failed to delete dashboard');
    }
  };

  const handleCloneDashboard = async (dashboard) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/task-manager/custom-dashboards/${dashboard.id}/clone`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      });
      
      if (response.ok) {
        toast.success('Dashboard cloned');
        fetchDashboards();
      }
    } catch (error) {
      toast.error('Failed to clone dashboard');
    }
  };

  const handleAddWidget = async () => {
    if (!widgetForm.title.trim()) {
      toast.error('Please enter a widget title');
      return;
    }
    
    setSaving(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/task-manager/custom-dashboards/${currentDashboard.id}/widgets`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(widgetForm)
      });
      
      if (response.ok) {
        toast.success('Widget added');
        setShowWidgetDialog(false);
        setWidgetForm({
          widget_type: 'kpi_card',
          title: '',
          data_source: 'task_performance',
          config: { metric: 'total_created' }
        });
        // Refresh dashboard
        await openDashboard(currentDashboard);
      } else {
        const error = await response.json();
        toast.error(error.detail || 'Failed to add widget');
      }
    } catch (error) {
      toast.error('Failed to add widget');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveWidget = async (widgetId) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/task-manager/custom-dashboards/${currentDashboard.id}/widgets/${widgetId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        toast.success('Widget removed');
        await openDashboard(currentDashboard);
      }
    } catch (error) {
      toast.error('Failed to remove widget');
    }
  };

  const handleLayoutChange = async (newLayout) => {
    if (!currentDashboard || currentDashboard.access_level !== 'owner') return;
    
    try {
      const token = localStorage.getItem('token');
      await fetch(`${API_URL}/api/task-manager/custom-dashboards/${currentDashboard.id}/layout`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ layout: newLayout })
      });
    } catch (error) {
      console.error('Error saving layout:', error);
    }
  };

  const handleShare = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/task-manager/custom-dashboards/${currentDashboard.id}/share`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ share_with: shareWith.map(id => ({ user_id: id })) })
      });
      
      if (response.ok) {
        toast.success('Dashboard shared');
        setShowShareDialog(false);
        await openDashboard(currentDashboard);
      }
    } catch (error) {
      toast.error('Failed to share dashboard');
    }
  };

  const handleUpdateFilters = async () => {
    if (!currentDashboard || currentDashboard.access_level !== 'owner') return;
    
    try {
      const token = localStorage.getItem('token');
      await fetch(`${API_URL}/api/task-manager/custom-dashboards/${currentDashboard.id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          global_filters: { date_range: dateRange, project_id: projectFilter || null }
        })
      });
      
      // Refresh data with new filters
      await fetchDashboardData(currentDashboard.id);
      toast.success('Filters updated');
    } catch (error) {
      toast.error('Failed to update filters');
    }
  };

  const renderWidget = (widget) => {
    const data = widgetsData[widget.id] || {};
    const Icon = WIDGET_ICONS[widget.type] || Hash;
    
    if (data.error) {
      return (
        <div className="flex items-center justify-center h-full text-red-500 text-sm">
          <span>Error loading data</span>
        </div>
      );
    }
    
    switch (widget.type) {
      case 'kpi_card':
        return (
          <div className="flex flex-col items-center justify-center h-full">
            <span className="text-4xl font-bold text-slate-900">
              {data.value !== undefined ? data.value : '-'}
            </span>
            <span className="text-sm text-slate-500 mt-1">{data.label || widget.title}</span>
          </div>
        );
      
      case 'bar_chart':
        return (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.data || []} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey={Object.keys(data.data?.[0] || {})[0]} tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip />
              <Bar dataKey={Object.keys(data.data?.[0] || {}).find(k => typeof data.data?.[0]?.[k] === 'number') || 'count'} fill="#3B82F6" />
            </BarChart>
          </ResponsiveContainer>
        );
      
      case 'line_chart':
        return (
          <ResponsiveContainer width="100%" height="100%">
            <RechartsLine data={data.data || []} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip />
              <Line type="monotone" dataKey={Object.keys(data.data?.[0] || {}).find(k => k !== 'date' && typeof data.data?.[0]?.[k] === 'number') || 'value'} stroke="#3B82F6" />
            </RechartsLine>
          </ResponsiveContainer>
        );
      
      case 'pie_chart':
        return (
          <ResponsiveContainer width="100%" height="100%">
            <RechartsPie>
              <Pie
                data={data.data || []}
                dataKey={Object.keys(data.data?.[0] || {}).find(k => typeof data.data?.[0]?.[k] === 'number') || 'count'}
                nameKey={Object.keys(data.data?.[0] || {})[0]}
                cx="50%"
                cy="50%"
                outerRadius={60}
                label
              >
                {(data.data || []).map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </RechartsPie>
          </ResponsiveContainer>
        );
      
      case 'table':
        const tableData = data.data || [];
        const columns = Object.keys(tableData[0] || {}).slice(0, 5);
        return (
          <div className="overflow-auto h-full">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b">
                  {columns.map(col => (
                    <th key={col} className="text-left py-1 px-2 font-medium">
                      {col.replace(/_/g, ' ')}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tableData.slice(0, 10).map((row, i) => (
                  <tr key={i} className="border-b border-slate-100">
                    {columns.map(col => (
                      <td key={col} className="py-1 px-2 truncate max-w-[120px]">
                        {String(row[col] || '-').slice(0, 30)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      
      default:
        return <div className="text-slate-500">Unknown widget type</div>;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64" data-testid="dashboards-loading">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  // Dashboard Builder View
  if (view === 'builder' && currentDashboard) {
    const isOwner = currentDashboard.access_level === 'owner';
    
    return (
      <div className="p-6 space-y-4" data-testid="dashboard-builder">
        {/* Builder Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={() => { setView('list'); setCurrentDashboard(null); }}>
              ← Back
            </Button>
            <div>
              <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                {currentDashboard.name}
                {!isOwner && <Badge variant="secondary">View Only</Badge>}
              </h1>
              {currentDashboard.description && (
                <p className="text-sm text-slate-500">{currentDashboard.description}</p>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {isOwner && (
              <>
                <Button variant="outline" onClick={() => setShowWidgetDialog(true)} data-testid="add-widget-btn">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Widget
                </Button>
                <Button variant="outline" onClick={() => {
                  setShareWith(currentDashboard.shared_with?.map(s => s.user_id) || []);
                  setShowShareDialog(true);
                }}>
                  <Share2 className="w-4 h-4 mr-2" />
                  Share
                </Button>
              </>
            )}
            <Button variant="outline" onClick={() => fetchDashboardData(currentDashboard.id)}>
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        </div>
        
        {/* Filters */}
        <Card>
          <CardContent className="pt-4">
            <div className="flex flex-wrap gap-4 items-end">
              <div className="min-w-[150px]">
                <Label className="text-xs text-slate-500">Date Range</Label>
                <Select value={dateRange} onValueChange={setDateRange} disabled={!isOwner}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="last_7_days">Last 7 days</SelectItem>
                    <SelectItem value="last_30_days">Last 30 days</SelectItem>
                    <SelectItem value="last_90_days">Last 90 days</SelectItem>
                    <SelectItem value="all_time">All time</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="min-w-[180px]">
                <Label className="text-xs text-slate-500">Project</Label>
                <Select value={projectFilter || 'all'} onValueChange={(v) => setProjectFilter(v === 'all' ? '' : v)} disabled={!isOwner}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Projects" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Projects</SelectItem>
                    {projects.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              {isOwner && (
                <Button variant="outline" onClick={handleUpdateFilters}>
                  <Filter className="w-4 h-4 mr-2" />
                  Apply Filters
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
        
        {/* Widgets Grid */}
        {currentDashboard.widgets?.length === 0 ? (
          <Card className="py-12">
            <CardContent className="text-center">
              <LayoutDashboard className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-slate-900 mb-2">No widgets yet</h3>
              <p className="text-slate-500 mb-4">Add widgets to build your dashboard</p>
              {isOwner && (
                <Button onClick={() => setShowWidgetDialog(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Your First Widget
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="bg-slate-50 rounded-lg p-4 min-h-[500px]">
            <GridLayout
              className="layout"
              layout={currentDashboard.layout || []}
              cols={12}
              rowHeight={60}
              width={1100}
              isDraggable={isOwner}
              isResizable={isOwner}
              onLayoutChange={handleLayoutChange}
              draggableHandle=".widget-drag-handle"
            >
              {currentDashboard.widgets?.map((widget) => (
                <div key={widget.id} className="bg-white rounded-lg shadow-sm border overflow-hidden">
                  <div className="flex items-center justify-between px-3 py-2 border-b bg-slate-50">
                    <div className="flex items-center gap-2">
                      {isOwner && (
                        <GripVertical className="w-4 h-4 text-slate-400 cursor-move widget-drag-handle" />
                      )}
                      <span className="text-sm font-medium truncate">{widget.title}</span>
                    </div>
                    {isOwner && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 text-slate-400 hover:text-red-500"
                        onClick={() => handleRemoveWidget(widget.id)}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                  <div className="p-3 h-[calc(100%-40px)]">
                    {renderWidget(widget)}
                  </div>
                </div>
              ))}
            </GridLayout>
          </div>
        )}
        
        {/* Add Widget Dialog */}
        <Dialog open={showWidgetDialog} onOpenChange={setShowWidgetDialog}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Add Widget</DialogTitle>
              <DialogDescription>
                Choose a widget type and configure its data source
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4 py-4">
              <div>
                <Label>Title</Label>
                <Input
                  value={widgetForm.title}
                  onChange={(e) => setWidgetForm({ ...widgetForm, title: e.target.value })}
                  placeholder="e.g., Tasks Overview"
                  data-testid="widget-title-input"
                />
              </div>
              
              <div>
                <Label>Widget Type</Label>
                <Select
                  value={widgetForm.widget_type}
                  onValueChange={(v) => setWidgetForm({ ...widgetForm, widget_type: v })}
                >
                  <SelectTrigger data-testid="widget-type-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {metadata && Object.entries(metadata.widget_types).map(([key, value]) => (
                      <SelectItem key={key} value={key}>{value.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label>Data Source</Label>
                <Select
                  value={widgetForm.data_source}
                  onValueChange={(v) => setWidgetForm({ ...widgetForm, data_source: v })}
                >
                  <SelectTrigger data-testid="data-source-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {metadata && Object.entries(metadata.data_sources).map(([key, value]) => (
                      <SelectItem key={key} value={key}>{value.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              {widgetForm.widget_type === 'kpi_card' && metadata && (
                <div>
                  <Label>Metric</Label>
                  <Select
                    value={widgetForm.config.metric || ''}
                    onValueChange={(v) => setWidgetForm({
                      ...widgetForm,
                      config: { ...widgetForm.config, metric: v }
                    })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select metric" />
                    </SelectTrigger>
                    <SelectContent>
                      {metadata.data_sources[widgetForm.data_source]?.metrics?.map(metric => (
                        <SelectItem key={metric} value={metric}>
                          {metric.replace(/_/g, ' ')}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              
              {['bar_chart', 'pie_chart'].includes(widgetForm.widget_type) && metadata && (
                <div>
                  <Label>Breakdown</Label>
                  <Select
                    value={widgetForm.config.breakdown || ''}
                    onValueChange={(v) => setWidgetForm({
                      ...widgetForm,
                      config: { ...widgetForm.config, breakdown: v }
                    })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select breakdown" />
                    </SelectTrigger>
                    <SelectContent>
                      {metadata.data_sources[widgetForm.data_source]?.breakdowns?.map(bd => (
                        <SelectItem key={bd} value={bd}>
                          {bd.replace(/_/g, ' ')}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowWidgetDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleAddWidget} disabled={saving}>
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Add Widget
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        
        {/* Share Dialog */}
        <Dialog open={showShareDialog} onOpenChange={setShowShareDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Share Dashboard</DialogTitle>
              <DialogDescription>
                Share read-only access with team members
              </DialogDescription>
            </DialogHeader>
            
            <div className="py-4">
              <Label className="mb-2 block">Select Users</Label>
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {users.map(user => (
                  <label key={user.id} className="flex items-center gap-2 p-2 hover:bg-slate-50 rounded cursor-pointer">
                    <input
                      type="checkbox"
                      checked={shareWith.includes(user.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setShareWith([...shareWith, user.id]);
                        } else {
                          setShareWith(shareWith.filter(id => id !== user.id));
                        }
                      }}
                    />
                    <span>{user.first_name} {user.last_name}</span>
                    <span className="text-slate-400 text-sm">({user.email})</span>
                  </label>
                ))}
              </div>
            </div>
            
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowShareDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleShare}>
                <Share2 className="w-4 h-4 mr-2" />
                Share
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // Dashboard List View
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6" data-testid="dashboards-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <LayoutDashboard className="w-6 h-6 text-blue-600" />
            Custom Dashboards
          </h1>
          <p className="text-slate-500 mt-1">
            Build and customize your analytics dashboards
          </p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)} data-testid="create-dashboard-btn">
          <Plus className="w-4 h-4 mr-2" />
          New Dashboard
        </Button>
      </div>

      {/* Dashboard List */}
      {dashboards.length === 0 ? (
        <Card className="py-12">
          <CardContent className="text-center">
            <LayoutDashboard className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-slate-900 mb-2">No dashboards yet</h3>
            <p className="text-slate-500 mb-4">
              Create your first custom dashboard to visualize your data
            </p>
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Create Your First Dashboard
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {dashboards.map((dashboard) => (
            <Card
              key={dashboard.id}
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => openDashboard(dashboard)}
              data-testid={`dashboard-card-${dashboard.id}`}
            >
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg flex items-center gap-2">
                      {dashboard.name}
                      {!dashboard.is_owner && (
                        <Badge variant="secondary" className="text-xs">Shared</Badge>
                      )}
                    </CardTitle>
                    <CardDescription className="truncate">
                      {dashboard.description || 'No description'}
                    </CardDescription>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="sm">
                        <MoreHorizontal className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); openDashboard(dashboard); }}>
                        <Eye className="w-4 h-4 mr-2" />
                        View
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleCloneDashboard(dashboard); }}>
                        <Copy className="w-4 h-4 mr-2" />
                        Clone
                      </DropdownMenuItem>
                      {dashboard.is_owner && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={(e) => { e.stopPropagation(); handleDeleteDashboard(dashboard); }}
                            className="text-red-600"
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4 text-sm text-slate-500">
                  <span className="flex items-center gap-1">
                    <Hash className="w-4 h-4" />
                    {dashboard.widget_count} widgets
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-4 h-4" />
                    {new Date(dashboard.updated_at).toLocaleDateString()}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Dashboard Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create Dashboard</DialogTitle>
            <DialogDescription>
              Create a new custom dashboard to visualize your data
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="name">Dashboard Name</Label>
              <Input
                id="name"
                value={dashboardForm.name}
                onChange={(e) => setDashboardForm({ ...dashboardForm, name: e.target.value })}
                placeholder="e.g., Executive Overview"
                data-testid="dashboard-name-input"
              />
            </div>
            
            <div>
              <Label htmlFor="description">Description (optional)</Label>
              <Textarea
                id="description"
                value={dashboardForm.description}
                onChange={(e) => setDashboardForm({ ...dashboardForm, description: e.target.value })}
                placeholder="Brief description of this dashboard"
                rows={2}
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateDashboard} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Create Dashboard
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CustomDashboardsPage;
