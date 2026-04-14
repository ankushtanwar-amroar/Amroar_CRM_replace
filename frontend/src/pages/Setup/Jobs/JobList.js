import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import { 
  ArrowLeft, Plus, Clock, CheckCircle, XCircle, AlertCircle,
  Download, Eye, RefreshCw
} from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { Badge } from '../../../components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../../components/ui/tabs';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const JobList = () => {
  const navigate = useNavigate();
  const [importJobs, setImportJobs] = useState([]);
  const [exportJobs, setExportJobs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('import');

  useEffect(() => {
    fetchJobs();
  }, []);

  const fetchJobs = async () => {
    setLoading(true);
    try {
      const [importRes, exportRes] = await Promise.all([
        axios.get(`${API}/data-operations/import/jobs`).catch(() => ({ data: [] })),
        axios.get(`${API}/data-operations/export/jobs`).catch(() => ({ data: [] }))
      ]);
      
      setImportJobs(importRes.data);
      setExportJobs(exportRes.data);
    } catch (error) {
      console.error('Error fetching jobs:', error);
      toast.error('Failed to load jobs');
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status) => {
    const statusConfig = {
      draft: { color: 'bg-slate-100 text-slate-700', icon: Clock },
      running: { color: 'bg-blue-100 text-blue-700', icon: RefreshCw },
      completed: { color: 'bg-green-100 text-green-700', icon: CheckCircle },
      completed_with_errors: { color: 'bg-yellow-100 text-yellow-700', icon: AlertCircle },
      failed: { color: 'bg-red-100 text-red-700', icon: XCircle }
    };

    const config = statusConfig[status] || statusConfig.draft;
    const Icon = config.icon;

    return (
      <Badge className={config.color}>
        <Icon className="h-3 w-3 mr-1" />
        {status.replace('_', ' ').toUpperCase()}
      </Badge>
    );
  };

  const JobTable = ({ jobs, type }) => {
    if (jobs.length === 0) {
      return (
        <div className="text-center py-12 text-slate-500 border rounded-lg bg-slate-50">
          <Clock className="h-12 w-12 mx-auto mb-3 text-slate-300" />
          <p className="text-lg font-medium mb-2">No {type} jobs yet</p>
          <p className="text-sm mb-4">Create your first {type} job to get started</p>
          <Button
            onClick={() => navigate(`/setup/${type}-builder`)}
            className="bg-indigo-600 hover:bg-indigo-700"
          >
            <Plus className="h-4 w-4 mr-2" />
            New {type === 'import' ? 'Import' : 'Export'}
          </Button>
        </div>
      );
    }

    return (
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader className="bg-slate-50">
            <TableRow>
              <TableHead>Job Name</TableHead>
              <TableHead>Object</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Records</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {jobs.map((job) => (
              <TableRow key={job.id} className="hover:bg-slate-50">
                <TableCell className="font-medium">{job.job_name}</TableCell>
                <TableCell className="capitalize">{job.object_name}</TableCell>
                <TableCell>{getStatusBadge(job.status)}</TableCell>
                <TableCell>
                  {job.status === 'completed' || job.status === 'completed_with_errors' ? (
                    <div className="text-sm">
                      <span className="text-green-600">{job.success_count || 0} success</span>
                      {job.error_count > 0 && (
                        <span className="text-red-600 ml-2">{job.error_count} errors</span>
                      )}
                    </div>
                  ) : (
                    <span className="text-slate-500">{job.total_rows || 0} rows</span>
                  )}
                </TableCell>
                <TableCell className="text-slate-500">
                  {new Date(job.created_at).toLocaleDateString()}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => navigate(`/setup/jobs/${type}/${job.id}`)}
                    className="text-indigo-600 hover:text-indigo-700"
                  >
                    <Eye className="h-4 w-4 mr-1" />
                    View Details
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 shadow-sm">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/setup')}
                className="text-slate-600"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Setup
              </Button>
              <div className="h-6 w-px bg-slate-300" />
              <div>
                <h1 className="text-xl font-bold text-slate-800">Data Operations Jobs</h1>
                <p className="text-sm text-slate-500">View and manage your import/export jobs</p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={fetchJobs}
                disabled={loading}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <Button
                onClick={() => navigate('/setup/import-builder')}
                className="bg-indigo-600 hover:bg-indigo-700"
              >
                <Plus className="h-4 w-4 mr-2" />
                New Import
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6">
            <TabsTrigger value="import">
              Import Jobs ({importJobs.length})
            </TabsTrigger>
            <TabsTrigger value="export">
              Export Jobs ({exportJobs.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="import">
            <JobTable jobs={importJobs} type="import" />
          </TabsContent>

          <TabsContent value="export">
            <JobTable jobs={exportJobs} type="export" />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default JobList;
