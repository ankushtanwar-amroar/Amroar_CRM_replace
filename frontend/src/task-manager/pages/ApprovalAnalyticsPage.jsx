/**
 * Approval Analytics Dashboard - Phase 10
 * Provides visibility into approval processes, bottlenecks, and insights
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
  Clock,
  AlertTriangle,
  Download,
  Loader2,
  RefreshCw,
  Filter,
  TrendingUp,
  Users,
  CheckCircle,
  XCircle,
  Activity,
  PieChart,
  Timer,
  FileWarning,
} from 'lucide-react';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL;

// Simple bar chart component - moved outside to avoid recreation
const SimpleBarChart = ({ data, valueKey = 'total', labelKey = 'name' }) => {
  if (!data || data.length === 0) return null;
  const max = Math.max(...data.map(d => d[valueKey])) || 1;
  
  return (
    <div className="space-y-3">
      {data.slice(0, 8).map((item, index) => (
        <div key={index} className="space-y-1">
          <div className="flex justify-between text-sm">
            <span className="text-slate-600 truncate max-w-[200px]">
              {item[labelKey] || 'Unknown'}
            </span>
            <span className="font-medium">{item[valueKey]}</span>
          </div>
          <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500 bg-blue-500"
              style={{ width: `${(item[valueKey] / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
};

// Format hours to readable string - moved outside
const formatHours = (hours) => {
  if (!hours || hours === 0) return '0h';
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 24) return `${hours.toFixed(1)}h`;
  return `${(hours / 24).toFixed(1)}d`;
};

const ApprovalAnalyticsPage = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(false);
  
  // Filter options
  const [projects, setProjects] = useState([]);
  const [workflows, setWorkflows] = useState([]);
  
  // Filters
  const [projectFilter, setProjectFilter] = useState('');
  const [workflowFilter, setWorkflowFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  
  // Data
  const [summaryData, setSummaryData] = useState(null);
  const [volumeByProject, setVolumeByProject] = useState([]);
  const [volumeByWorkflow, setVolumeByWorkflow] = useState([]);
  const [volumeTrend, setVolumeTrend] = useState([]);
  const [turnaroundByApprover, setTurnaroundByApprover] = useState([]);
  const [turnaroundByWorkflow, setTurnaroundByWorkflow] = useState([]);
  const [bottlenecks, setBottlenecks] = useState({ count: 0, bottlenecks: [] });
  const [approverWorkload, setApproverWorkload] = useState([]);
  const [rejectionData, setRejectionData] = useState(null);

  // Memoize buildQueryParams to avoid lint issues
  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    if (projectFilter) params.append('project_id', projectFilter);
    if (workflowFilter) params.append('workflow_id', workflowFilter);
    if (startDate) params.append('start_date', new Date(startDate).toISOString());
    if (endDate) params.append('end_date', new Date(endDate).toISOString());
    return params.toString();
  }, [projectFilter, workflowFilter, startDate, endDate]);

  const fetchFilterOptions = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const headers = { 'Authorization': `Bearer ${token}` };
      
      const [projectsRes, workflowsRes] = await Promise.all([
        fetch(`${API_URL}/api/task-manager/projects`, { headers }),
        fetch(`${API_URL}/api/task-manager/analytics/workflows`, { headers })
      ]);
      
      if (projectsRes.ok) {
        const data = await projectsRes.json();
        setProjects(data || []);
      }
      if (workflowsRes.ok) {
        const data = await workflowsRes.json();
        setWorkflows(data.workflows || []);
      }
    } catch (error) {
      console.error('Error fetching filter options:', error);
    }
  }, []);

  const fetchSummary = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/api/task-manager/analytics/summary?${queryParams}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setSummaryData(data);
      }
    } catch (error) {
      console.error('Error fetching summary:', error);
    }
  }, [queryParams]);

  const fetchVolumeData = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const headers = { 'Authorization': `Bearer ${token}` };
      
      const [byProject, byWorkflow, trend] = await Promise.all([
        fetch(`${API_URL}/api/task-manager/analytics/volume/by-project?${queryParams}`, { headers }),
        fetch(`${API_URL}/api/task-manager/analytics/volume/by-workflow?${queryParams}`, { headers }),
        fetch(`${API_URL}/api/task-manager/analytics/volume/trend?${queryParams}&granularity=day`, { headers })
      ]);
      
      if (byProject.ok) {
        const data = await byProject.json();
        setVolumeByProject(data.projects || []);
      }
      if (byWorkflow.ok) {
        const data = await byWorkflow.json();
        setVolumeByWorkflow(data.workflows || []);
      }
      if (trend.ok) {
        const data = await trend.json();
        setVolumeTrend(data.trend || []);
      }
    } catch (error) {
      console.error('Error fetching volume data:', error);
    }
  }, [queryParams]);

  const fetchTurnaroundData = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const headers = { 'Authorization': `Bearer ${token}` };
      
      const [byApprover, byWorkflow] = await Promise.all([
        fetch(`${API_URL}/api/task-manager/analytics/turnaround/by-approver?${queryParams}`, { headers }),
        fetch(`${API_URL}/api/task-manager/analytics/turnaround/by-workflow?${queryParams}`, { headers })
      ]);
      
      if (byApprover.ok) {
        const data = await byApprover.json();
        setTurnaroundByApprover(data.approvers || []);
      }
      if (byWorkflow.ok) {
        const data = await byWorkflow.json();
        setTurnaroundByWorkflow(data.workflows || []);
      }
    } catch (error) {
      console.error('Error fetching turnaround data:', error);
    }
  }, [queryParams]);

  const fetchBottleneckData = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const headers = { 'Authorization': `Bearer ${token}` };
      
      const [bottlenecksRes, workloadRes] = await Promise.all([
        fetch(`${API_URL}/api/task-manager/analytics/bottlenecks?threshold_hours=24`, { headers }),
        fetch(`${API_URL}/api/task-manager/analytics/approver-workload`, { headers })
      ]);
      
      if (bottlenecksRes.ok) {
        const data = await bottlenecksRes.json();
        setBottlenecks(data);
      }
      if (workloadRes.ok) {
        const data = await workloadRes.json();
        setApproverWorkload(data.approvers || []);
      }
    } catch (error) {
      console.error('Error fetching bottleneck data:', error);
    }
  }, []);

  const fetchRejectionData = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/api/task-manager/analytics/rejections?${queryParams}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setRejectionData(data);
      }
    } catch (error) {
      console.error('Error fetching rejection data:', error);
    }
  }, [queryParams]);

  const refreshCurrentTab = useCallback(async () => {
    setLoading(true);
    
    await fetchSummary();
    
    switch (activeTab) {
      case 'overview':
        await fetchVolumeData();
        break;
      case 'turnaround':
        await fetchTurnaroundData();
        break;
      case 'bottlenecks':
        await fetchBottleneckData();
        break;
      case 'rejections':
        await fetchRejectionData();
        break;
      default:
        break;
    }
    
    setLoading(false);
  }, [activeTab, fetchSummary, fetchVolumeData, fetchTurnaroundData, fetchBottleneckData, fetchRejectionData]);

  useEffect(() => {
    fetchFilterOptions();
  }, [fetchFilterOptions]);

  useEffect(() => {
    refreshCurrentTab();
  }, [refreshCurrentTab]);

  const handleExportCSV = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/api/task-manager/analytics/export?${queryParams}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `approval_analytics_${new Date().toISOString().split('T')[0]}.csv`;
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

  const clearFilters = () => {
    setProjectFilter('');
    setWorkflowFilter('');
    setStartDate('');
    setEndDate('');
  };

  const hasFilters = projectFilter || workflowFilter || startDate || endDate;

  return (
    <div className="min-h-full pb-8 bg-slate-50" data-testid="approval-analytics-page">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/task-manager/dashboards')}
              data-testid="back-btn"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            <div className="h-6 w-px bg-slate-200" />
            <div>
              <h1 className="text-xl font-semibold text-slate-900">Approval Analytics</h1>
              <p className="text-sm text-slate-500">Insights into approval workflows</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              onClick={handleExportCSV}
              data-testid="export-btn"
            >
              <Download className="w-4 h-4 mr-2" />
              Export CSV
            </Button>
            <Button 
              variant="outline" 
              onClick={refreshCurrentTab} 
              disabled={loading}
              data-testid="refresh-btn"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
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
              <SelectTrigger className="w-40" data-testid="project-filter">
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
            <Label className="text-sm">Workflow:</Label>
            <Select
              value={workflowFilter || 'all'}
              onValueChange={(val) => setWorkflowFilter(val === 'all' ? '' : val)}
            >
              <SelectTrigger className="w-40" data-testid="workflow-filter">
                <SelectValue placeholder="All Workflows" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Workflows</SelectItem>
                {workflows.map(workflow => (
                  <SelectItem key={workflow.id} value={workflow.id}>
                    {workflow.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="flex items-center gap-2">
            <Label className="text-sm">From:</Label>
            <Input
              type="date"
              className="w-36"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              data-testid="start-date-filter"
            />
          </div>
          
          <div className="flex items-center gap-2">
            <Label className="text-sm">To:</Label>
            <Input
              type="date"
              className="w-36"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              data-testid="end-date-filter"
            />
          </div>
          
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              Clear
            </Button>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      {summaryData && (
        <div className="px-6 py-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="bg-gradient-to-br from-blue-50 to-blue-100/50">
              <CardContent className="pt-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-500 rounded-lg">
                    <Activity className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-blue-700">
                      {summaryData.volume?.total || 0}
                    </p>
                    <p className="text-sm text-blue-600">Total Requests</p>
                  </div>
                </div>
                <div className="mt-3 flex gap-4 text-xs">
                  <span className="text-green-600">
                    {summaryData.volume?.approved || 0} approved
                  </span>
                  <span className="text-red-600">
                    {summaryData.volume?.rejected || 0} rejected
                  </span>
                </div>
              </CardContent>
            </Card>
            
            <Card className="bg-gradient-to-br from-green-50 to-green-100/50">
              <CardContent className="pt-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-green-500 rounded-lg">
                    <Timer className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-green-700">
                      {formatHours(summaryData.turnaround?.avg_hours || 0)}
                    </p>
                    <p className="text-sm text-green-600">Avg Turnaround</p>
                  </div>
                </div>
                <div className="mt-3 text-xs text-green-600">
                  Median: {formatHours(summaryData.turnaround?.median_hours || 0)}
                </div>
              </CardContent>
            </Card>
            
            <Card className="bg-gradient-to-br from-amber-50 to-amber-100/50">
              <CardContent className="pt-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-amber-500 rounded-lg">
                    <AlertTriangle className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-amber-700">
                      {summaryData.bottlenecks?.count || 0}
                    </p>
                    <p className="text-sm text-amber-600">Bottlenecks</p>
                  </div>
                </div>
                <div className="mt-3 text-xs text-amber-600">
                  Pending &gt;{summaryData.bottlenecks?.threshold_hours || 24}h
                </div>
              </CardContent>
            </Card>
            
            <Card className="bg-gradient-to-br from-red-50 to-red-100/50">
              <CardContent className="pt-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-red-500 rounded-lg">
                    <XCircle className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-red-700">
                      {summaryData.rejections?.total || 0}
                    </p>
                    <p className="text-sm text-red-600">Rejections</p>
                  </div>
                </div>
                <div className="mt-3 text-xs text-red-600">
                  {summaryData.volume?.total > 0 
                    ? `${((summaryData.rejections?.total / summaryData.volume?.total) * 100).toFixed(1)}% rejection rate`
                    : 'No data'
                  }
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Tabs Content */}
      <div className="p-6 max-w-7xl mx-auto">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-4 mb-6">
            <TabsTrigger value="overview" className="text-xs sm:text-sm" data-testid="tab-overview">
              <PieChart className="w-4 h-4 mr-1" />
              Volume
            </TabsTrigger>
            <TabsTrigger value="turnaround" className="text-xs sm:text-sm" data-testid="tab-turnaround">
              <Clock className="w-4 h-4 mr-1" />
              Turnaround
            </TabsTrigger>
            <TabsTrigger value="bottlenecks" className="text-xs sm:text-sm" data-testid="tab-bottlenecks">
              <AlertTriangle className="w-4 h-4 mr-1" />
              Bottlenecks
            </TabsTrigger>
            <TabsTrigger value="rejections" className="text-xs sm:text-sm" data-testid="tab-rejections">
              <FileWarning className="w-4 h-4 mr-1" />
              Rejections
            </TabsTrigger>
          </TabsList>

          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            </div>
          )}

          {/* Volume Overview Tab */}
          <TabsContent value="overview" className={loading ? 'hidden' : ''}>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="w-5 h-5 text-blue-500" />
                    Volume by Project
                  </CardTitle>
                  <CardDescription>Approval requests per project</CardDescription>
                </CardHeader>
                <CardContent>
                  {volumeByProject.length === 0 ? (
                    <div className="text-center py-8 text-slate-500">
                      <PieChart className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                      <p className="font-medium">No data available</p>
                    </div>
                  ) : (
                    <SimpleBarChart 
                      data={volumeByProject} 
                      labelKey="project_name"
                    />
                  )}
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="w-5 h-5 text-purple-500" />
                    Volume by Workflow
                  </CardTitle>
                  <CardDescription>Approval requests per workflow</CardDescription>
                </CardHeader>
                <CardContent>
                  {volumeByWorkflow.length === 0 ? (
                    <div className="text-center py-8 text-slate-500">
                      <PieChart className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                      <p className="font-medium">No data available</p>
                    </div>
                  ) : (
                    <SimpleBarChart 
                      data={volumeByWorkflow} 
                      labelKey="workflow_name"
                    />
                  )}
                </CardContent>
              </Card>
              
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-green-500" />
                    Volume Trend
                  </CardTitle>
                  <CardDescription>Approval requests over time</CardDescription>
                </CardHeader>
                <CardContent>
                  {volumeTrend.length === 0 ? (
                    <div className="text-center py-8 text-slate-500">
                      <TrendingUp className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                      <p className="font-medium">No trend data available</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Date</TableHead>
                            <TableHead className="text-right">Total</TableHead>
                            <TableHead className="text-right">Approved</TableHead>
                            <TableHead className="text-right">Rejected</TableHead>
                            <TableHead className="text-right">Pending</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {volumeTrend.slice(-14).map((item, index) => (
                            <TableRow key={index}>
                              <TableCell className="font-medium">{item.date}</TableCell>
                              <TableCell className="text-right">{item.total}</TableCell>
                              <TableCell className="text-right text-green-600">{item.approved}</TableCell>
                              <TableCell className="text-right text-red-600">{item.rejected}</TableCell>
                              <TableCell className="text-right text-amber-600">{item.pending}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Turnaround Time Tab */}
          <TabsContent value="turnaround" className={loading ? 'hidden' : ''}>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="w-5 h-5 text-blue-500" />
                    Turnaround by Approver
                  </CardTitle>
                  <CardDescription>Average response time per approver</CardDescription>
                </CardHeader>
                <CardContent>
                  {turnaroundByApprover.length === 0 ? (
                    <div className="text-center py-8 text-slate-500">
                      <Clock className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                      <p className="font-medium">No data available</p>
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Approver</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                          <TableHead className="text-right">Avg Time</TableHead>
                          <TableHead className="text-right">Median</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {turnaroundByApprover.map((item, index) => (
                          <TableRow key={index}>
                            <TableCell className="font-medium">
                              {item.approver_name}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1">
                                <Badge variant="outline" className="text-green-600">
                                  {item.approved_count}
                                </Badge>
                                <Badge variant="outline" className="text-red-600">
                                  {item.rejected_count}
                                </Badge>
                              </div>
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {formatHours(item.avg_hours)}
                            </TableCell>
                            <TableCell className="text-right font-mono text-slate-500">
                              {formatHours(item.median_hours)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="w-5 h-5 text-purple-500" />
                    Turnaround by Workflow
                  </CardTitle>
                  <CardDescription>Average completion time per workflow</CardDescription>
                </CardHeader>
                <CardContent>
                  {turnaroundByWorkflow.length === 0 ? (
                    <div className="text-center py-8 text-slate-500">
                      <Clock className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                      <p className="font-medium">No data available</p>
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Workflow</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                          <TableHead className="text-right">Avg Time</TableHead>
                          <TableHead className="text-right">Median</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {turnaroundByWorkflow.map((item, index) => (
                          <TableRow key={index}>
                            <TableCell className="font-medium">
                              {item.workflow_name}
                            </TableCell>
                            <TableCell className="text-right">
                              {item.total}
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {formatHours(item.avg_hours)}
                            </TableCell>
                            <TableCell className="text-right font-mono text-slate-500">
                              {formatHours(item.median_hours)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Bottlenecks Tab */}
          <TabsContent value="bottlenecks" className={loading ? 'hidden' : ''}>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-amber-500" />
                    Pending Bottlenecks
                  </CardTitle>
                  <CardDescription>
                    Tasks pending approval for more than {bottlenecks.threshold_hours || 24} hours
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {bottlenecks.bottlenecks?.length === 0 ? (
                    <div className="text-center py-8 text-slate-500">
                      <CheckCircle className="w-12 h-12 mx-auto mb-3 text-green-500" />
                      <p className="font-medium">No bottlenecks!</p>
                      <p className="text-sm">All approvals are being processed on time.</p>
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Task</TableHead>
                          <TableHead>Workflow</TableHead>
                          <TableHead>Approver</TableHead>
                          <TableHead className="text-right">Waiting</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {bottlenecks.bottlenecks?.slice(0, 15).map((item, index) => (
                          <TableRow key={index}>
                            <TableCell className="font-medium max-w-[200px] truncate">
                              {item.task_title}
                            </TableCell>
                            <TableCell className="text-slate-500">
                              {item.workflow_name}
                            </TableCell>
                            <TableCell>
                              {item.current_approver}
                            </TableCell>
                            <TableCell className="text-right">
                              <Badge 
                                variant="outline" 
                                className={item.pending_days > 3 ? 'text-red-600 border-red-200' : 'text-amber-600 border-amber-200'}
                              >
                                {item.pending_days}d
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="w-5 h-5 text-blue-500" />
                    Approver Workload
                  </CardTitle>
                  <CardDescription>Pending approvals per person</CardDescription>
                </CardHeader>
                <CardContent>
                  {approverWorkload.length === 0 ? (
                    <div className="text-center py-8 text-slate-500">
                      <Users className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                      <p className="font-medium">No pending approvals</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {approverWorkload.map((item, index) => (
                        <div 
                          key={index} 
                          className="flex items-center justify-between p-2 rounded-lg bg-slate-50"
                        >
                          <span className="text-sm font-medium truncate max-w-[150px]">
                            {item.approver_name}
                          </span>
                          <Badge 
                            variant={item.pending_count > 5 ? 'destructive' : 'secondary'}
                          >
                            {item.pending_count}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Rejections Tab */}
          <TabsContent value="rejections" className={loading ? 'hidden' : ''}>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <XCircle className="w-5 h-5 text-red-500" />
                    Rejections by Workflow
                  </CardTitle>
                  <CardDescription>
                    {rejectionData?.total_rejections || 0} total rejections
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {(!rejectionData?.by_workflow || rejectionData.by_workflow.length === 0) ? (
                    <div className="text-center py-8 text-slate-500">
                      <CheckCircle className="w-12 h-12 mx-auto mb-3 text-green-500" />
                      <p className="font-medium">No rejections!</p>
                      <p className="text-sm">All approvals have been successful.</p>
                    </div>
                  ) : (
                    <SimpleBarChart 
                      data={rejectionData.by_workflow}
                      valueKey="count"
                      labelKey="workflow_name"
                    />
                  )}
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileWarning className="w-5 h-5 text-amber-500" />
                    Top Rejection Reasons
                  </CardTitle>
                  <CardDescription>Most common rejection comments</CardDescription>
                </CardHeader>
                <CardContent>
                  {(!rejectionData?.top_reasons || rejectionData.top_reasons.length === 0) ? (
                    <div className="text-center py-8 text-slate-500">
                      <FileWarning className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                      <p className="font-medium">No rejection reasons</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {rejectionData.top_reasons.map((item, index) => (
                        <div 
                          key={index} 
                          className="p-3 rounded-lg bg-red-50 border border-red-100"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm text-slate-700 flex-1">
                              &ldquo;{item.reason}&rdquo;
                            </p>
                            <Badge variant="outline" className="text-red-600 shrink-0">
                              {item.count}x
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default ApprovalAnalyticsPage;
