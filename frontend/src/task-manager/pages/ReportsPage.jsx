/**
 * Reports Page - Phase 15
 * Advanced reporting with exports and scheduled delivery
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  BarChart3, Download, Calendar, Filter, RefreshCw,
  FileText, Clock, CheckCircle, AlertTriangle, Repeat,
  Users, Target, TrendingUp, Loader2, ChevronDown,
  Plus, Mail, Pause, Play, Trash2, MoreHorizontal
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Badge } from '../../components/ui/badge';
import { Label } from '../../components/ui/label';
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '../../components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '../../components/ui/dropdown-menu';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Legend
} from 'recharts';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const REPORT_TYPES = [
  { id: 'task_performance', name: 'Task Performance', icon: BarChart3, color: '#3B82F6' },
  { id: 'time_tracking', name: 'Time Tracking', icon: Clock, color: '#10B981' },
  { id: 'sla_compliance', name: 'SLA Compliance', icon: Target, color: '#F59E0B' },
  { id: 'recurring_tasks', name: 'Recurring Tasks', icon: Repeat, color: '#8B5CF6' },
  { id: 'approval_analytics', name: 'Approval Analytics', icon: CheckCircle, color: '#EC4899' },
];

const CHART_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4'];

const ReportsPage = () => {
  const [selectedReport, setSelectedReport] = useState('task_performance');
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [projects, setProjects] = useState([]);
  const [schedules, setSchedules] = useState([]);
  
  // Filters
  const [dateRange, setDateRange] = useState('last_30_days');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [projectId, setProjectId] = useState('');
  
  // Schedule dialog
  const [showScheduleDialog, setShowScheduleDialog] = useState(false);
  const [scheduleForm, setScheduleForm] = useState({
    name: '',
    report_type: 'task_performance',
    frequency: 'weekly',
    export_format: 'pdf',
    recipients: '',
    day_of_week: 0,
    day_of_month: 1,
    time_of_day: '09:00',
  });
  const [savingSchedule, setSavingSchedule] = useState(false);

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

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      let url = `${API_URL}/api/task-manager/reports/${selectedReport.replace('_', '-')}?`;
      
      // Add date filters
      const now = new Date();
      let start = null;
      if (dateRange === 'last_7_days') {
        start = new Date(now - 7 * 24 * 60 * 60 * 1000);
      } else if (dateRange === 'last_30_days') {
        start = new Date(now - 30 * 24 * 60 * 60 * 1000);
      } else if (dateRange === 'last_90_days') {
        start = new Date(now - 90 * 24 * 60 * 60 * 1000);
      } else if (dateRange === 'custom' && startDate) {
        start = new Date(startDate);
      }
      
      if (start) {
        url += `start_date=${start.toISOString()}&`;
      }
      if (dateRange === 'custom' && endDate) {
        url += `end_date=${new Date(endDate).toISOString()}&`;
      }
      if (projectId) {
        url += `project_id=${projectId}&`;
      }
      
      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        setReportData(data);
      }
    } catch (error) {
      console.error('Error fetching report:', error);
      toast.error('Failed to load report');
    } finally {
      setLoading(false);
    }
  }, [selectedReport, dateRange, startDate, endDate, projectId]);

  const fetchSchedules = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/task-manager/reports/schedules`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setSchedules(data.schedules || []);
      }
    } catch (error) {
      console.error('Error fetching schedules:', error);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
    fetchSchedules();
  }, [fetchProjects, fetchSchedules]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const handleExport = async (format) => {
    try {
      const token = localStorage.getItem('token');
      let url = `${API_URL}/api/task-manager/reports/export/${selectedReport}/${format}?`;
      
      const now = new Date();
      let start = null;
      if (dateRange === 'last_7_days') {
        start = new Date(now - 7 * 24 * 60 * 60 * 1000);
      } else if (dateRange === 'last_30_days') {
        start = new Date(now - 30 * 24 * 60 * 60 * 1000);
      } else if (dateRange === 'last_90_days') {
        start = new Date(now - 90 * 24 * 60 * 60 * 1000);
      } else if (dateRange === 'custom' && startDate) {
        start = new Date(startDate);
      }
      
      if (start) url += `start_date=${start.toISOString()}&`;
      if (dateRange === 'custom' && endDate) url += `end_date=${new Date(endDate).toISOString()}&`;
      if (projectId) url += `project_id=${projectId}&`;
      
      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const blob = await response.blob();
        const downloadUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = `${selectedReport}_report.${format}`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(downloadUrl);
        toast.success(`Report exported as ${format.toUpperCase()}`);
      } else {
        toast.error('Failed to export report');
      }
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Failed to export report');
    }
  };

  const handleCreateSchedule = async () => {
    if (!scheduleForm.name.trim()) {
      toast.error('Please enter a schedule name');
      return;
    }
    
    const recipients = scheduleForm.recipients.split(',').map(e => e.trim()).filter(e => e);
    if (recipients.length === 0) {
      toast.error('Please enter at least one recipient email');
      return;
    }
    
    setSavingSchedule(true);
    try {
      const token = localStorage.getItem('token');
      const payload = {
        name: scheduleForm.name,
        report_type: scheduleForm.report_type,
        frequency: scheduleForm.frequency,
        export_format: scheduleForm.export_format,
        recipients: recipients,
        time_of_day: scheduleForm.time_of_day,
        filters: {
          date_range: dateRange,
          project_id: projectId || null
        }
      };
      
      if (scheduleForm.frequency === 'weekly') {
        payload.day_of_week = parseInt(scheduleForm.day_of_week);
      } else if (scheduleForm.frequency === 'monthly') {
        payload.day_of_month = parseInt(scheduleForm.day_of_month);
      }
      
      const response = await fetch(`${API_URL}/api/task-manager/reports/schedules`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      
      if (response.ok) {
        toast.success('Schedule created successfully');
        setShowScheduleDialog(false);
        fetchSchedules();
        setScheduleForm({
          name: '',
          report_type: 'task_performance',
          frequency: 'weekly',
          export_format: 'pdf',
          recipients: '',
          day_of_week: 0,
          day_of_month: 1,
          time_of_day: '09:00',
        });
      } else {
        const error = await response.json();
        toast.error(error.detail || 'Failed to create schedule');
      }
    } catch (error) {
      console.error('Error creating schedule:', error);
      toast.error('Failed to create schedule');
    } finally {
      setSavingSchedule(false);
    }
  };

  const handleToggleSchedule = async (schedule) => {
    try {
      const token = localStorage.getItem('token');
      const action = schedule.is_paused ? 'resume' : 'pause';
      
      const response = await fetch(`${API_URL}/api/task-manager/reports/schedules/${schedule.id}/${action}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        toast.success(`Schedule ${action}d`);
        fetchSchedules();
      }
    } catch (error) {
      console.error('Error toggling schedule:', error);
    }
  };

  const handleDeleteSchedule = async (schedule) => {
    if (!window.confirm('Delete this schedule?')) return;
    
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/task-manager/reports/schedules/${schedule.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        toast.success('Schedule deleted');
        fetchSchedules();
      }
    } catch (error) {
      console.error('Error deleting schedule:', error);
    }
  };

  const renderReportContent = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      );
    }
    
    if (!reportData) {
      return (
        <div className="text-center py-12 text-slate-500">
          No data available
        </div>
      );
    }
    
    switch (selectedReport) {
      case 'task_performance':
        return <TaskPerformanceReport data={reportData} />;
      case 'time_tracking':
        return <TimeTrackingReport data={reportData} />;
      case 'sla_compliance':
        return <SLAComplianceReport data={reportData} />;
      case 'recurring_tasks':
        return <RecurringTasksReport data={reportData} />;
      case 'approval_analytics':
        return <ApprovalAnalyticsReport data={reportData} />;
      default:
        return null;
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6" data-testid="reports-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-blue-600" />
            Reports
          </h1>
          <p className="text-slate-500 mt-1">
            Advanced analytics and exports
          </p>
        </div>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" data-testid="export-dropdown">
                <Download className="w-4 h-4 mr-2" />
                Export
                <ChevronDown className="w-4 h-4 ml-2" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => handleExport('csv')}>
                <FileText className="w-4 h-4 mr-2" />
                Export as CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport('pdf')}>
                <FileText className="w-4 h-4 mr-2" />
                Export as PDF
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button onClick={() => setShowScheduleDialog(true)} data-testid="schedule-report-btn">
            <Mail className="w-4 h-4 mr-2" />
            Schedule
          </Button>
        </div>
      </div>

      {/* Report Type Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {REPORT_TYPES.map((type) => {
          const Icon = type.icon;
          return (
            <Button
              key={type.id}
              variant={selectedReport === type.id ? 'default' : 'outline'}
              onClick={() => setSelectedReport(type.id)}
              className="whitespace-nowrap"
              data-testid={`report-tab-${type.id}`}
            >
              <Icon className="w-4 h-4 mr-2" style={{ color: selectedReport === type.id ? 'white' : type.color }} />
              {type.name}
            </Button>
          );
        })}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="min-w-[150px]">
              <Label className="text-xs text-slate-500">Date Range</Label>
              <Select value={dateRange} onValueChange={setDateRange}>
                <SelectTrigger data-testid="date-range-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="last_7_days">Last 7 days</SelectItem>
                  <SelectItem value="last_30_days">Last 30 days</SelectItem>
                  <SelectItem value="last_90_days">Last 90 days</SelectItem>
                  <SelectItem value="all_time">All time</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {dateRange === 'custom' && (
              <>
                <div>
                  <Label className="text-xs text-slate-500">Start Date</Label>
                  <Input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-[150px]"
                  />
                </div>
                <div>
                  <Label className="text-xs text-slate-500">End Date</Label>
                  <Input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-[150px]"
                  />
                </div>
              </>
            )}
            
            <div className="min-w-[180px]">
              <Label className="text-xs text-slate-500">Project</Label>
              <Select value={projectId || 'all'} onValueChange={(v) => setProjectId(v === 'all' ? '' : v)}>
                <SelectTrigger data-testid="project-filter">
                  <SelectValue placeholder="All Projects" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Projects</SelectItem>
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <Button variant="outline" onClick={fetchReport}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Report Content */}
      <Card>
        <CardContent className="pt-6">
          {renderReportContent()}
        </CardContent>
      </Card>

      {/* Scheduled Reports */}
      {schedules.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Mail className="w-5 h-5" />
              Scheduled Reports
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {schedules.map((schedule) => (
                <div
                  key={schedule.id}
                  className="flex items-center justify-between p-3 bg-slate-50 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-full ${schedule.is_paused ? 'bg-amber-100' : 'bg-blue-100'}`}>
                      <Mail className={`w-4 h-4 ${schedule.is_paused ? 'text-amber-600' : 'text-blue-600'}`} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{schedule.name}</span>
                        {schedule.is_paused && (
                          <Badge variant="secondary" className="bg-amber-100 text-amber-700 text-xs">
                            Paused
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-slate-500">
                        {schedule.frequency.charAt(0).toUpperCase() + schedule.frequency.slice(1)} • {schedule.export_format.toUpperCase()} • {schedule.recipients?.length || 0} recipients
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleToggleSchedule(schedule)}
                    >
                      {schedule.is_paused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteSchedule(schedule)}
                      className="text-red-600"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Schedule Dialog */}
      <Dialog open={showScheduleDialog} onOpenChange={setShowScheduleDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Schedule Report</DialogTitle>
            <DialogDescription>
              Set up automated report delivery via email
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div>
              <Label>Schedule Name</Label>
              <Input
                value={scheduleForm.name}
                onChange={(e) => setScheduleForm({ ...scheduleForm, name: e.target.value })}
                placeholder="e.g., Weekly Performance Report"
                data-testid="schedule-name-input"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Report Type</Label>
                <Select
                  value={scheduleForm.report_type}
                  onValueChange={(v) => setScheduleForm({ ...scheduleForm, report_type: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REPORT_TYPES.map((type) => (
                      <SelectItem key={type.id} value={type.id}>{type.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label>Frequency</Label>
                <Select
                  value={scheduleForm.frequency}
                  onValueChange={(v) => setScheduleForm({ ...scheduleForm, frequency: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            {scheduleForm.frequency === 'weekly' && (
              <div>
                <Label>Day of Week</Label>
                <Select
                  value={scheduleForm.day_of_week.toString()}
                  onValueChange={(v) => setScheduleForm({ ...scheduleForm, day_of_week: parseInt(v) })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">Monday</SelectItem>
                    <SelectItem value="1">Tuesday</SelectItem>
                    <SelectItem value="2">Wednesday</SelectItem>
                    <SelectItem value="3">Thursday</SelectItem>
                    <SelectItem value="4">Friday</SelectItem>
                    <SelectItem value="5">Saturday</SelectItem>
                    <SelectItem value="6">Sunday</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            
            {scheduleForm.frequency === 'monthly' && (
              <div>
                <Label>Day of Month</Label>
                <Select
                  value={scheduleForm.day_of_month.toString()}
                  onValueChange={(v) => setScheduleForm({ ...scheduleForm, day_of_month: parseInt(v) })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[...Array(28)].map((_, i) => (
                      <SelectItem key={i + 1} value={(i + 1).toString()}>Day {i + 1}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Format</Label>
                <Select
                  value={scheduleForm.export_format}
                  onValueChange={(v) => setScheduleForm({ ...scheduleForm, export_format: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pdf">PDF</SelectItem>
                    <SelectItem value="csv">CSV</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label>Time</Label>
                <Input
                  type="time"
                  value={scheduleForm.time_of_day}
                  onChange={(e) => setScheduleForm({ ...scheduleForm, time_of_day: e.target.value })}
                />
              </div>
            </div>
            
            <div>
              <Label>Recipients (comma-separated emails)</Label>
              <Input
                value={scheduleForm.recipients}
                onChange={(e) => setScheduleForm({ ...scheduleForm, recipients: e.target.value })}
                placeholder="email1@example.com, email2@example.com"
                data-testid="schedule-recipients-input"
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowScheduleDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateSchedule} disabled={savingSchedule}>
              {savingSchedule && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Create Schedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// Task Performance Report Component
const TaskPerformanceReport = ({ data }) => {
  const summary = data.summary || {};
  const byStatus = data.by_status || [];
  const byProject = data.by_project || [];
  const trend = data.trend || [];
  
  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-slate-500">Created</p>
            <p className="text-2xl font-bold">{summary.total_created || 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-slate-500">Completed</p>
            <p className="text-2xl font-bold text-green-600">{summary.total_completed || 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-slate-500">Completion Rate</p>
            <p className="text-2xl font-bold">{summary.completion_rate || 0}%</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-slate-500">Avg Cycle Time</p>
            <p className="text-2xl font-bold">{summary.avg_cycle_time_days || 0}d</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-slate-500">Cycle (Hours)</p>
            <p className="text-2xl font-bold">{summary.avg_cycle_time_hours || 0}h</p>
          </CardContent>
        </Card>
      </div>
      
      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Status Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Tasks by Status</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={byStatus}
                  dataKey="count"
                  nameKey="status"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label={({ name, value }) => `${name}: ${value}`}
                >
                  {byStatus.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        
        {/* Trend Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Task Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="created" stroke="#3B82F6" name="Created" />
                <Line type="monotone" dataKey="completed" stroke="#10B981" name="Completed" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
      
      {/* By Project Table */}
      {byProject.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">By Project</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-3">Project</th>
                    <th className="text-right py-2 px-3">Total</th>
                    <th className="text-right py-2 px-3">Completed</th>
                    <th className="text-right py-2 px-3">Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {byProject.slice(0, 10).map((row, i) => (
                    <tr key={i} className="border-b border-slate-100">
                      <td className="py-2 px-3">{row.project}</td>
                      <td className="py-2 px-3 text-right">{row.total}</td>
                      <td className="py-2 px-3 text-right text-green-600">{row.completed}</td>
                      <td className="py-2 px-3 text-right font-medium">{row.completion_rate}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

// Time Tracking Report Component
const TimeTrackingReport = ({ data }) => {
  const summary = data.summary || {};
  const byProject = data.by_project || [];
  const byUser = data.by_user || [];
  const dailyTrend = data.daily_trend || [];
  
  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-slate-500">Total Hours</p>
            <p className="text-2xl font-bold">{summary.total_hours || 0}h</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-slate-500">Total Minutes</p>
            <p className="text-2xl font-bold">{summary.total_minutes || 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-slate-500">Time Entries</p>
            <p className="text-2xl font-bold">{summary.total_entries || 0}</p>
          </CardContent>
        </Card>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* By Project Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Time by Project</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={byProject.slice(0, 8)} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="project" type="category" width={100} tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="hours" fill="#10B981" name="Hours" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        
        {/* Daily Trend */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Daily Time Logged</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={dailyTrend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey="hours" stroke="#10B981" name="Hours" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
      
      {/* By User Table */}
      {byUser.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Time by User</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-3">User</th>
                    <th className="text-right py-2 px-3">Hours</th>
                    <th className="text-right py-2 px-3">Entries</th>
                  </tr>
                </thead>
                <tbody>
                  {byUser.slice(0, 10).map((row, i) => (
                    <tr key={i} className="border-b border-slate-100">
                      <td className="py-2 px-3">{row.user}</td>
                      <td className="py-2 px-3 text-right font-medium">{row.hours}h</td>
                      <td className="py-2 px-3 text-right text-slate-500">{row.entries}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

// SLA Compliance Report Component
const SLAComplianceReport = ({ data }) => {
  const summary = data.summary || {};
  const byProject = data.by_project || [];
  const byPriority = data.by_priority || [];
  const breachedTasks = data.breached_tasks || [];
  
  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-slate-500">Total with SLA</p>
            <p className="text-2xl font-bold">{summary.total_with_sla || 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-slate-500">Met</p>
            <p className="text-2xl font-bold text-green-600">{summary.met || 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-slate-500">Breached</p>
            <p className="text-2xl font-bold text-red-600">{summary.breached || 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-slate-500">Compliance Rate</p>
            <p className="text-2xl font-bold text-green-600">{summary.compliance_rate || 0}%</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-slate-500">At Risk</p>
            <p className="text-2xl font-bold text-amber-600">{summary.at_risk || 0}</p>
          </CardContent>
        </Card>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* By Priority */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">SLA by Priority</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={byPriority}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="priority" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="met" fill="#10B981" name="Met" stackId="a" />
                <Bar dataKey="breached" fill="#EF4444" name="Breached" stackId="a" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        
        {/* By Project */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">SLA by Project</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-[200px] overflow-y-auto">
              {byProject.slice(0, 6).map((row, i) => (
                <div key={i} className="flex items-center justify-between p-2 bg-slate-50 rounded">
                  <span className="text-sm truncate flex-1">{row.project}</span>
                  <Badge variant={row.breach_rate > 20 ? 'destructive' : 'secondary'}>
                    {row.breach_rate}% breach
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
      
      {/* Breached Tasks */}
      {breachedTasks.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-red-600 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              Breached Tasks
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-3">Task</th>
                    <th className="text-left py-2 px-3">Priority</th>
                    <th className="text-left py-2 px-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {breachedTasks.slice(0, 10).map((task, i) => (
                    <tr key={i} className="border-b border-slate-100">
                      <td className="py-2 px-3 truncate max-w-[200px]">{task.title}</td>
                      <td className="py-2 px-3">
                        <Badge variant="outline">{task.priority}</Badge>
                      </td>
                      <td className="py-2 px-3">{task.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

// Recurring Tasks Report Component
const RecurringTasksReport = ({ data }) => {
  const summary = data.summary || {};
  const rules = data.rules || [];
  const byType = data.by_type || [];
  const trend = data.trend || [];
  
  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-slate-500">Active Rules</p>
            <p className="text-2xl font-bold text-green-600">{summary.active_rules || 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-slate-500">Paused Rules</p>
            <p className="text-2xl font-bold text-amber-600">{summary.paused_rules || 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-slate-500">Tasks Generated</p>
            <p className="text-2xl font-bold">{summary.total_generated || 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-slate-500">Success Rate</p>
            <p className="text-2xl font-bold">{summary.success_rate || 100}%</p>
          </CardContent>
        </Card>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* By Type */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Rules by Type</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={byType}
                  dataKey="rules"
                  nameKey="type"
                  cx="50%"
                  cy="50%"
                  outerRadius={70}
                  label
                >
                  {byType.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        
        {/* Trend */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Generated Tasks Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey="generated" stroke="#8B5CF6" name="Generated" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
      
      {/* Rules Table */}
      {rules.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Recurrence Rules</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-3">Name</th>
                    <th className="text-left py-2 px-3">Type</th>
                    <th className="text-left py-2 px-3">Status</th>
                    <th className="text-right py-2 px-3">Run Count</th>
                  </tr>
                </thead>
                <tbody>
                  {rules.slice(0, 10).map((rule, i) => (
                    <tr key={i} className="border-b border-slate-100">
                      <td className="py-2 px-3">{rule.name}</td>
                      <td className="py-2 px-3">
                        <Badge variant="outline">{rule.recurrence_type}</Badge>
                      </td>
                      <td className="py-2 px-3">
                        <Badge variant={rule.is_paused ? 'secondary' : 'default'}>
                          {rule.is_paused ? 'Paused' : 'Active'}
                        </Badge>
                      </td>
                      <td className="py-2 px-3 text-right font-medium">{rule.run_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

// Approval Analytics Report Component
const ApprovalAnalyticsReport = ({ data }) => {
  const summary = data.summary || {};
  const byWorkflow = data.by_workflow || [];
  const byApprover = data.by_approver || [];
  const trend = data.trend || [];
  
  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-slate-500">Total Approvals</p>
            <p className="text-2xl font-bold">{summary.total || 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-slate-500">Approved</p>
            <p className="text-2xl font-bold text-green-600">{summary.approved || 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-slate-500">Approval Rate</p>
            <p className="text-2xl font-bold">{summary.approval_rate || 0}%</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-slate-500">Avg Turnaround</p>
            <p className="text-2xl font-bold">{summary.avg_turnaround_hours || 0}h</p>
          </CardContent>
        </Card>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* By Workflow */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">By Workflow</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={byWorkflow.slice(0, 5)}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="workflow" tick={{ fontSize: 10 }} />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="approved" fill="#10B981" name="Approved" />
                <Bar dataKey="rejected" fill="#EF4444" name="Rejected" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        
        {/* Trend */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Approval Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="approved" stroke="#10B981" name="Approved" />
                <Line type="monotone" dataKey="rejected" stroke="#EF4444" name="Rejected" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
      
      {/* By Approver Table */}
      {byApprover.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">By Approver</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-3">Approver</th>
                    <th className="text-right py-2 px-3">Approved</th>
                    <th className="text-right py-2 px-3">Rejected</th>
                    <th className="text-right py-2 px-3">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {byApprover.slice(0, 10).map((row, i) => (
                    <tr key={i} className="border-b border-slate-100">
                      <td className="py-2 px-3">{row.approver}</td>
                      <td className="py-2 px-3 text-right text-green-600">{row.approved}</td>
                      <td className="py-2 px-3 text-right text-red-600">{row.rejected}</td>
                      <td className="py-2 px-3 text-right font-medium">{row.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default ReportsPage;
