/**
 * Dashboards Page
 * Advanced reporting and analytics for Task Manager
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table';
import {
  ArrowLeft,
  BarChart3,
  PieChart,
  Clock,
  AlertTriangle,
  Link as LinkIcon,
  Zap,
  Download,
  Loader2,
  RefreshCw,
  Filter,
  TrendingUp,
  Users,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const statusColors = {
  todo: { bg: 'bg-slate-100', text: 'text-slate-700', fill: '#6B7280' },
  in_progress: { bg: 'bg-blue-100', text: 'text-blue-700', fill: '#3B82F6' },
  blocked: { bg: 'bg-red-100', text: 'text-red-700', fill: '#EF4444' },
  done: { bg: 'bg-green-100', text: 'text-green-700', fill: '#10B981' },
};

const priorityColors = {
  low: 'bg-slate-100 text-slate-600',
  medium: 'bg-blue-100 text-blue-600',
  high: 'bg-orange-100 text-orange-600',
  urgent: 'bg-red-100 text-red-600',
};

const DashboardsPage = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('status');
  const [loading, setLoading] = useState(false);
  const [projects, setProjects] = useState([]);
  
  // Filters
  const [projectFilter, setProjectFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  
  // Dashboard data
  const [statusData, setStatusData] = useState(null);
  const [overdueData, setOverdueData] = useState(null);
  const [timeData, setTimeData] = useState(null);
  const [blockedData, setBlockedData] = useState(null);
  const [automationData, setAutomationData] = useState(null);

  const fetchProjects = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/api/task-manager/projects`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setProjects(data || []);
      }
    } catch (error) {
      console.error('Error fetching projects:', error);
    }
  }, []);

  const buildQueryParams = (includeProject = true) => {
    const params = new URLSearchParams();
    if (includeProject && projectFilter) params.append('project_id', projectFilter);
    if (startDate) params.append('start_date', new Date(startDate).toISOString());
    if (endDate) params.append('end_date', new Date(endDate).toISOString());
    return params.toString();
  };

  const fetchStatusData = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const params = buildQueryParams();
      const res = await fetch(`${API_URL}/api/task-manager/dashboards/tasks-by-status?${params}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setStatusData(data);
      }
    } catch (error) {
      console.error('Error fetching status data:', error);
    }
  }, [projectFilter, startDate, endDate]);

  const fetchOverdueData = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const params = projectFilter ? `project_id=${projectFilter}` : '';
      const res = await fetch(`${API_URL}/api/task-manager/dashboards/overdue-by-assignee?${params}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setOverdueData(data);
      }
    } catch (error) {
      console.error('Error fetching overdue data:', error);
    }
  }, [projectFilter]);

  const fetchTimeData = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const params = buildQueryParams(false);
      const res = await fetch(`${API_URL}/api/task-manager/dashboards/time-by-project?${params}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setTimeData(data);
      }
    } catch (error) {
      console.error('Error fetching time data:', error);
    }
  }, [startDate, endDate]);

  const fetchBlockedData = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const params = projectFilter ? `project_id=${projectFilter}` : '';
      const res = await fetch(`${API_URL}/api/task-manager/dashboards/blocked-tasks?${params}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setBlockedData(data);
      }
    } catch (error) {
      console.error('Error fetching blocked data:', error);
    }
  }, [projectFilter]);

  const fetchAutomationData = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const params = buildQueryParams(false);
      const res = await fetch(`${API_URL}/api/task-manager/dashboards/automation-log?${params}&limit=50`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setAutomationData(data);
      }
    } catch (error) {
      console.error('Error fetching automation data:', error);
    }
  }, [startDate, endDate]);

  const refreshCurrentTab = useCallback(async () => {
    setLoading(true);
    switch (activeTab) {
      case 'status':
        await fetchStatusData();
        break;
      case 'overdue':
        await fetchOverdueData();
        break;
      case 'time':
        await fetchTimeData();
        break;
      case 'blocked':
        await fetchBlockedData();
        break;
      case 'automation':
        await fetchAutomationData();
        break;
    }
    setLoading(false);
  }, [activeTab, fetchStatusData, fetchOverdueData, fetchTimeData, fetchBlockedData, fetchAutomationData]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  useEffect(() => {
    refreshCurrentTab();
  }, [refreshCurrentTab]);

  const handleExportCSV = async (reportType) => {
    try {
      const token = localStorage.getItem('token');
      const params = buildQueryParams(reportType !== 'time_by_project' && reportType !== 'automation_log');
      const res = await fetch(`${API_URL}/api/task-manager/dashboards/export/${reportType}?${params}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${reportType}_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        toast.success('Export downloaded');
      } else {
        toast.error('Failed to export');
      }
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Failed to export');
    }
  };

  // Simple bar chart using divs
  const SimpleBarChart = ({ data, maxValue }) => {
    if (!data || data.length === 0) return null;
    const max = maxValue || Math.max(...data.map(d => d.value)) || 1;
    
    return (
      <div className="space-y-3">
        {data.map((item, index) => (
          <div key={index} className="space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-slate-600">{item.label}</span>
              <span className="font-medium">{item.value}</span>
            </div>
            <div className="h-4 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${(item.value / max) * 100}%`,
                  backgroundColor: item.color || '#3B82F6'
                }}
              />
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="min-h-full pb-8 bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/task-manager')}
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            <div className="h-6 w-px bg-slate-200" />
            <div>
              <h1 className="text-xl font-semibold text-slate-900">Dashboards</h1>
              <p className="text-sm text-slate-500">Reports and analytics</p>
            </div>
          </div>
          <Button variant="outline" onClick={refreshCurrentTab} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border-b px-6 py-3">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-400" />
            <span className="text-sm text-slate-500">Filters:</span>
          </div>
          
          <div className="flex items-center gap-2">
            <Label className="text-sm">Project:</Label>
            <Select
              value={projectFilter || 'all'}
              onValueChange={(val) => setProjectFilter(val === 'all' ? '' : val)}
            >
              <SelectTrigger className="w-48">
                <SelectValue placeholder="All Projects" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Projects</SelectItem>
                {projects.map(project => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="flex items-center gap-2">
            <Label className="text-sm">From:</Label>
            <Input
              type="date"
              className="w-40"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          
          <div className="flex items-center gap-2">
            <Label className="text-sm">To:</Label>
            <Input
              type="date"
              className="w-40"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
          
          {(projectFilter || startDate || endDate) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setProjectFilter('');
                setStartDate('');
                setEndDate('');
              }}
            >
              Clear
            </Button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="p-6 max-w-6xl mx-auto">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-5 mb-6">
            <TabsTrigger value="status" className="text-xs sm:text-sm">
              <PieChart className="w-4 h-4 mr-1" />
              By Status
            </TabsTrigger>
            <TabsTrigger value="overdue" className="text-xs sm:text-sm">
              <AlertTriangle className="w-4 h-4 mr-1" />
              Overdue
            </TabsTrigger>
            <TabsTrigger value="time" className="text-xs sm:text-sm">
              <Clock className="w-4 h-4 mr-1" />
              Time
            </TabsTrigger>
            <TabsTrigger value="blocked" className="text-xs sm:text-sm">
              <LinkIcon className="w-4 h-4 mr-1" />
              Blocked
            </TabsTrigger>
            <TabsTrigger value="automation" className="text-xs sm:text-sm">
              <Zap className="w-4 h-4 mr-1" />
              Automation
            </TabsTrigger>
          </TabsList>

          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            </div>
          )}

          {/* Tasks by Status */}
          <TabsContent value="status" className={loading ? 'hidden' : ''}>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Tasks by Status</CardTitle>
                  <CardDescription>Distribution of tasks across statuses</CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={() => handleExportCSV('tasks_by_status')}>
                  <Download className="w-4 h-4 mr-1" />
                  Export
                </Button>
              </CardHeader>
              <CardContent>
                {statusData && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Stats Cards */}
                    <div className="grid grid-cols-2 gap-4">
                      {Object.entries(statusData.statuses || {}).map(([status, count]) => (
                        <div
                          key={status}
                          className={`p-4 rounded-lg ${statusColors[status]?.bg || 'bg-slate-100'}`}
                        >
                          <p className={`text-2xl font-bold ${statusColors[status]?.text || 'text-slate-700'}`}>
                            {count}
                          </p>
                          <p className="text-sm text-slate-600">
                            {status.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                          </p>
                        </div>
                      ))}
                    </div>
                    
                    {/* Bar Chart */}
                    <div>
                      <p className="text-sm font-medium mb-4">Breakdown</p>
                      <SimpleBarChart
                        data={Object.entries(statusData.statuses || {}).map(([status, count]) => ({
                          label: status.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()),
                          value: count,
                          color: statusColors[status]?.fill || '#6B7280'
                        }))}
                      />
                      <p className="text-center text-sm text-slate-500 mt-4">
                        Total: {statusData.total} tasks
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Overdue Tasks */}
          <TabsContent value="overdue" className={loading ? 'hidden' : ''}>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-amber-500" />
                    Overdue Tasks by Assignee
                  </CardTitle>
                  <CardDescription>
                    {overdueData?.total_overdue || 0} total overdue tasks
                  </CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={() => handleExportCSV('overdue_by_assignee')}>
                  <Download className="w-4 h-4 mr-1" />
                  Export
                </Button>
              </CardHeader>
              <CardContent>
                {overdueData?.assignees?.length === 0 ? (
                  <div className="text-center py-8 text-slate-500">
                    <CheckCircle className="w-12 h-12 mx-auto mb-3 text-green-500" />
                    <p className="font-medium">No overdue tasks!</p>
                    <p className="text-sm">All tasks are on track.</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Assignee</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead className="text-right">Overdue Count</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {overdueData?.assignees?.map((assignee, index) => (
                        <TableRow key={index}>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              <Users className="w-4 h-4 text-slate-400" />
                              {assignee.assignee_name || 'Unassigned'}
                            </div>
                          </TableCell>
                          <TableCell className="text-slate-500">
                            {assignee.assignee_email || '-'}
                          </TableCell>
                          <TableCell className="text-right">
                            <Badge variant="destructive">{assignee.overdue_count}</Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Time Spent */}
          <TabsContent value="time" className={loading ? 'hidden' : ''}>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="w-5 h-5 text-blue-500" />
                    Time Spent by Project
                  </CardTitle>
                  <CardDescription>
                    Total: {timeData?.total_hours || 0} hours tracked
                  </CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={() => handleExportCSV('time_by_project')}>
                  <Download className="w-4 h-4 mr-1" />
                  Export
                </Button>
              </CardHeader>
              <CardContent>
                {timeData?.projects?.length === 0 ? (
                  <div className="text-center py-8 text-slate-500">
                    <Clock className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                    <p className="font-medium">No time tracked yet</p>
                    <p className="text-sm">Start tracking time on tasks to see data here.</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    <SimpleBarChart
                      data={timeData?.projects?.map(project => ({
                        label: project.project_name,
                        value: project.total_hours,
                        color: project.project_color || '#3B82F6'
                      })) || []}
                    />
                    
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Project</TableHead>
                          <TableHead className="text-right">Hours</TableHead>
                          <TableHead className="text-right">Entries</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {timeData?.projects?.map((project, index) => (
                          <TableRow key={index}>
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-2">
                                <div
                                  className="w-3 h-3 rounded-full"
                                  style={{ backgroundColor: project.project_color || '#6B7280' }}
                                />
                                {project.project_name}
                              </div>
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {project.total_hours}h
                            </TableCell>
                            <TableCell className="text-right text-slate-500">
                              {project.entry_count}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Blocked Tasks */}
          <TabsContent value="blocked" className={loading ? 'hidden' : ''}>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <LinkIcon className="w-5 h-5 text-red-500" />
                    Blocked Tasks Report
                  </CardTitle>
                  <CardDescription>
                    {blockedData?.total_blocked || 0} tasks currently blocked
                  </CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={() => handleExportCSV('blocked_tasks')}>
                  <Download className="w-4 h-4 mr-1" />
                  Export
                </Button>
              </CardHeader>
              <CardContent>
                {blockedData?.blocked_tasks?.length === 0 ? (
                  <div className="text-center py-8 text-slate-500">
                    <CheckCircle className="w-12 h-12 mx-auto mb-3 text-green-500" />
                    <p className="font-medium">No blocked tasks!</p>
                    <p className="text-sm">All dependencies are resolved.</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Task</TableHead>
                        <TableHead>Project</TableHead>
                        <TableHead>Assignee</TableHead>
                        <TableHead>Priority</TableHead>
                        <TableHead>Blocked By</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {blockedData?.blocked_tasks?.map((task, index) => (
                        <TableRow key={index}>
                          <TableCell className="font-medium max-w-xs truncate">
                            {task.title}
                          </TableCell>
                          <TableCell className="text-slate-500">
                            {task.project_name}
                          </TableCell>
                          <TableCell className="text-slate-500">
                            {task.assignee_name?.trim() || 'Unassigned'}
                          </TableCell>
                          <TableCell>
                            <Badge className={priorityColors[task.priority]}>
                              {task.priority}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {task.blockers?.map((blocker, i) => (
                                <Badge key={i} variant="outline" className="text-xs">
                                  {blocker.title?.substring(0, 20)}...
                                  {blocker.status === 'done' && (
                                    <CheckCircle className="w-3 h-3 ml-1 text-green-500" />
                                  )}
                                </Badge>
                              ))}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Automation Log */}
          <TabsContent value="automation" className={loading ? 'hidden' : ''}>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Zap className="w-5 h-5 text-purple-500" />
                    Automation Execution Log
                  </CardTitle>
                  <CardDescription>
                    {automationData?.stats?.success || 0} successful, {automationData?.stats?.failed || 0} failed
                  </CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={() => handleExportCSV('automation_log')}>
                  <Download className="w-4 h-4 mr-1" />
                  Export
                </Button>
              </CardHeader>
              <CardContent>
                {automationData?.executions?.length === 0 ? (
                  <div className="text-center py-8 text-slate-500">
                    <Zap className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                    <p className="font-medium">No automation executions yet</p>
                    <p className="text-sm">Rules will log their executions here.</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Rule</TableHead>
                        <TableHead>Task</TableHead>
                        <TableHead>Trigger</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Executed</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {automationData?.executions?.map((execution, index) => (
                        <TableRow key={index}>
                          <TableCell className="font-medium">
                            {execution.rule_name || 'Unknown Rule'}
                          </TableCell>
                          <TableCell className="text-slate-500 max-w-xs truncate">
                            {execution.task_title || '-'}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{execution.trigger}</Badge>
                          </TableCell>
                          <TableCell>
                            {execution.status === 'success' ? (
                              <Badge className="bg-green-100 text-green-700">
                                <CheckCircle className="w-3 h-3 mr-1" />
                                Success
                              </Badge>
                            ) : (
                              <Badge className="bg-red-100 text-red-700">
                                <XCircle className="w-3 h-3 mr-1" />
                                Failed
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-slate-500 text-sm">
                            {new Date(execution.executed_at).toLocaleString()}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default DashboardsPage;
