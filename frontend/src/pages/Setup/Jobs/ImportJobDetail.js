import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import { 
  ArrowLeft, Download, Clock, CheckCircle, XCircle, 
  AlertCircle, RefreshCw, FileText, Database, Calendar
} from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { Badge } from '../../../components/ui/badge';
import { Progress } from '../../../components/ui/progress';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const ImportJobDetail = () => {
  const navigate = useNavigate();
  const { jobId } = useParams();
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [polling, setPolling] = useState(false);

  useEffect(() => {
    fetchJobDetails();
  }, [jobId]);

  // Poll for job status if it's running
  useEffect(() => {
    if (job && job.status === 'running') {
      setPolling(true);
      const interval = setInterval(() => {
        fetchJobDetails();
      }, 3000); // Poll every 3 seconds

      return () => {
        clearInterval(interval);
        setPolling(false);
      };
    } else {
      setPolling(false);
    }
  }, [job?.status]);

  const fetchJobDetails = async () => {
    try {
      const response = await axios.get(`${API}/data-operations/import/jobs/${jobId}`);
      setJob(response.data);
    } catch (error) {
      console.error('Error fetching job details:', error);
      toast.error('Failed to load job details');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadFile = async (fileType) => {
    try {
      const filePath = fileType === 'success' ? job.success_file_path : job.error_file_path;
      if (!filePath) {
        toast.error(`${fileType === 'success' ? 'Success' : 'Error'} file not available`);
        return;
      }

      toast.loading(`Downloading ${fileType} file...`, { id: 'download' });
      
      const response = await axios.get(
        `${API}/data-operations/import/jobs/${jobId}/download/${fileType}`,
        { responseType: 'blob' }
      );
      
      // Create blob URL and trigger download
      const blob = new Blob([response.data], { type: 'text/csv;charset=utf-8' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      
      // Get filename from Content-Disposition header or use default
      const contentDisposition = response.headers['content-disposition'];
      let filename = `${job.job_name || 'import'}_${fileType}.csv`;
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="?([^";\n]+)"?/);
        if (filenameMatch && filenameMatch[1]) {
          filename = decodeURIComponent(filenameMatch[1]);
        }
      }
      
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      
      // Cleanup
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      toast.success(`Downloaded ${fileType} file`, { id: 'download' });
    } catch (error) {
      console.error('Error downloading file:', error);
      const errorMsg = error.response?.data?.detail || error.response?.statusText || 'Download failed';
      toast.error(errorMsg, { id: 'download' });
      toast.error('Failed to download file');
    }
  };

  const handleRetry = async () => {
    if (!window.confirm(`Create a new job to retry ${job.error_count} failed rows?`)) {
      return;
    }

    try {
      const response = await axios.post(`${API}/data-operations/import/jobs/${jobId}/retry`);
      toast.success(`Retry job created! Redirecting to new job...`);
      
      // Navigate to the new retry job
      setTimeout(() => {
        navigate(`/setup/jobs/import/${response.data.retry_job_id}`);
      }, 1500);
    } catch (error) {
      console.error('Error creating retry job:', error);
      toast.error(error.response?.data?.detail || 'Failed to create retry job');
    }
  };

  const handleRollback = async () => {
    const reason = window.prompt(
      'Please provide a reason for rollback (required):\n\n' +
      'WARNING: This will undo all changes made by this job.\n' +
      (job.import_type === 'insert' 
        ? `• ${job.success_count} created records will be deleted.\n`
        : `• ${job.success_count} updated records will be restored to their previous values.\n`) +
      '\nThis action cannot be undone.'
    );
    
    if (!reason || reason.trim() === '') {
      toast.error('Rollback reason is required');
      return;
    }

    try {
      const response = await axios.post(
        `${API}/data-operations/import/jobs/${jobId}/rollback?rollback_reason=${encodeURIComponent(reason)}`
      );
      
      toast.success('Rollback completed successfully');
      fetchJobDetails(); // Refresh job details
    } catch (error) {
      console.error('Error rolling back job:', error);
      toast.error(error.response?.data?.detail || 'Failed to rollback job');
    }
  };

  const getStatusIcon = (status) => {
    const icons = {
      draft: Clock,
      running: RefreshCw,
      completed: CheckCircle,
      completed_with_errors: AlertCircle,
      failed: XCircle
    };
    return icons[status] || Clock;
  };

  const getStatusColor = (status) => {
    const colors = {
      draft: 'text-slate-600 bg-slate-100',
      running: 'text-blue-600 bg-blue-100',
      completed: 'text-green-600 bg-green-100',
      completed_with_errors: 'text-yellow-600 bg-yellow-100',
      failed: 'text-red-600 bg-red-100'
    };
    return colors[status] || colors.draft;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 animate-spin text-indigo-600 mx-auto mb-2" />
          <p className="text-slate-600">Loading job details...</p>
        </div>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <XCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <p className="text-slate-700 font-medium mb-2">Job not found</p>
          <Button onClick={() => navigate('/setup/jobs')}>
            Back to Jobs
          </Button>
        </div>
      </div>
    );
  }

  const StatusIcon = getStatusIcon(job.status);
  const successRate = job.processed_rows > 0 
    ? Math.round((job.success_count / job.processed_rows) * 100) 
    : 0;

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
                onClick={() => navigate('/setup/jobs')}
                className="text-slate-600"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Jobs
              </Button>
              <div className="h-6 w-px bg-slate-300" />
              <div>
                <h1 className="text-xl font-bold text-slate-800">{job.job_name}</h1>
                <p className="text-sm text-slate-500">Import Job Details</p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              {polling && (
                <Badge className="bg-blue-100 text-blue-700">
                  <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                  Auto-refreshing
                </Badge>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={fetchJobDetails}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Status Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-slate-700">Status</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center space-x-3">
                <div className={`p-3 rounded-full ${getStatusColor(job.status)}`}>
                  <StatusIcon className={`h-6 w-6 ${job.status === 'running' ? 'animate-spin' : ''}`} />
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-900 capitalize">
                    {job.status.replace('_', ' ')}
                  </p>
                  {job.status === 'running' && (
                    <p className="text-sm text-slate-500">Processing records...</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Records Processed */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-slate-700">Records Processed</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-2xl font-bold text-slate-900">{job.processed_rows || 0}</span>
                  <span className="text-sm text-slate-500">of {job.total_rows || 0}</span>
                </div>
                <Progress value={(job.processed_rows / job.total_rows) * 100 || 0} className="h-2" />
              </div>
            </CardContent>
          </Card>

          {/* Success Rate */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-slate-700">Success Rate</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <p className="text-2xl font-bold text-slate-900">{successRate}%</p>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="flex items-center space-x-2">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <span className="text-slate-600">{job.success_count || 0} success</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <XCircle className="h-4 w-4 text-red-600" />
                    <span className="text-slate-600">{job.error_count || 0} errors</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Job Details */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Job Information</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <div>
                <div className="flex items-center space-x-2 text-slate-600 mb-1">
                  <Database className="h-4 w-4" />
                  <p className="text-sm font-medium">Object</p>
                </div>
                <p className="text-lg font-semibold text-slate-900 capitalize">{job.object_name}</p>
              </div>
              
              <div>
                <div className="flex items-center space-x-2 text-slate-600 mb-1">
                  <FileText className="h-4 w-4" />
                  <p className="text-sm font-medium">Import Type</p>
                </div>
                <p className="text-lg font-semibold text-slate-900 capitalize">{job.import_type}</p>
              </div>

              <div>
                <div className="flex items-center space-x-2 text-slate-600 mb-1">
                  <Calendar className="h-4 w-4" />
                  <p className="text-sm font-medium">Created</p>
                </div>
                <p className="text-lg font-semibold text-slate-900">
                  {new Date(job.created_at).toLocaleDateString()}
                </p>
              </div>

              <div>
                <div className="flex items-center space-x-2 text-slate-600 mb-1">
                  <Clock className="h-4 w-4" />
                  <p className="text-sm font-medium">Created By</p>
                </div>
                <p className="text-lg font-semibold text-slate-900">{job.created_by}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Field Mappings */}
        {job.field_mappings && job.field_mappings.length > 0 && (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Field Mappings</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {job.field_mappings.map((mapping, idx) => (
                  <div key={idx} className="p-3 border rounded-lg bg-slate-50">
                    <p className="text-sm text-slate-600">{mapping.csv_column}</p>
                    <p className="text-sm font-medium text-slate-900 mt-1">→ {mapping.field_name}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Match Configuration for Update/Upsert */}
        {job.match_config && (job.import_type === 'update' || job.import_type === 'upsert') && (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Match Configuration</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center space-x-4">
                <div>
                  <p className="text-sm text-slate-600">Match Mode</p>
                  <p className="text-lg font-semibold text-slate-900 capitalize">{job.match_config.mode}</p>
                </div>
                <div className="h-8 w-px bg-slate-300" />
                <div>
                  <p className="text-sm text-slate-600">Match Fields</p>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {job.match_config.fields?.map((field, idx) => (
                      <Badge key={idx} variant="secondary">{field}</Badge>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Download Files */}
        {(job.status === 'completed' || job.status === 'completed_with_errors') && (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Download Results</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {job.success_file_path && (
                  <Button
                    variant="outline"
                    onClick={() => handleDownloadFile('success')}
                    className="w-full justify-start"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Download Success Records ({job.success_count})
                  </Button>
                )}
                
                {job.error_file_path && (
                  <Button
                    variant="outline"
                    onClick={() => handleDownloadFile('error')}
                    className="w-full justify-start text-red-600 hover:text-red-700"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Download Error Records ({job.error_count})
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Actions: Retry & Rollback */}
        {(job.status === 'completed' || job.status === 'completed_with_errors' || job.status === 'failed') && (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Job Actions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Retry Failed Rows */}
                {job.error_count > 0 && job.status !== 'rolled_back' && (
                  <div className="p-4 border rounded-lg bg-amber-50 border-amber-200">
                    <div className="flex items-start space-x-3">
                      <RefreshCw className="h-5 w-5 text-amber-600 mt-0.5" />
                      <div className="flex-1">
                        <h3 className="font-semibold text-slate-900">Retry Failed Rows</h3>
                        <p className="text-sm text-slate-600 mt-1">
                          Create a new job to retry the {job.error_count} failed records
                        </p>
                        <Button
                          onClick={handleRetry}
                          className="mt-3 bg-amber-600 hover:bg-amber-700"
                          size="sm"
                        >
                          <RefreshCw className="h-4 w-4 mr-2" />
                          Retry Failed Rows
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Rollback */}
                {job.is_rollback_available && job.status !== 'rolled_back' && (
                  <div className="p-4 border rounded-lg bg-red-50 border-red-200">
                    <div className="flex items-start space-x-3">
                      <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
                      <div className="flex-1">
                        <h3 className="font-semibold text-slate-900">Rollback Changes</h3>
                        <p className="text-sm text-slate-600 mt-1">
                          Undo all changes made by this job. {job.import_type === 'insert' ? 'Created records will be deleted.' : 'Modified records will be restored.'}
                        </p>
                        <Button
                          onClick={handleRollback}
                          variant="destructive"
                          className="mt-3"
                          size="sm"
                        >
                          <XCircle className="h-4 w-4 mr-2" />
                          Rollback Job
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Rollback Status */}
                {job.status === 'rolled_back' && (
                  <div className="col-span-2 p-4 border rounded-lg bg-slate-100 border-slate-300">
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-5 w-5 text-slate-600" />
                      <div>
                        <h3 className="font-semibold text-slate-900">Job Rolled Back</h3>
                        <p className="text-sm text-slate-600 mt-1">
                          Rolled back by {job.rolled_back_by} on {new Date(job.rolled_back_at).toLocaleString()}
                        </p>
                        {job.rollback_reason && (
                          <p className="text-sm text-slate-600 mt-1">
                            Reason: {job.rollback_reason}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Timeline */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Timeline</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-start space-x-3">
                <div className="w-2 h-2 bg-indigo-600 rounded-full mt-2" />
                <div>
                  <p className="font-medium text-slate-900">Job Created</p>
                  <p className="text-sm text-slate-500">
                    {new Date(job.created_at).toLocaleString()}
                  </p>
                </div>
              </div>

              {job.started_at && (
                <div className="flex items-start space-x-3">
                  <div className="w-2 h-2 bg-blue-600 rounded-full mt-2" />
                  <div>
                    <p className="font-medium text-slate-900">Import Started</p>
                    <p className="text-sm text-slate-500">
                      {new Date(job.started_at).toLocaleString()}
                    </p>
                  </div>
                </div>
              )}

              {job.completed_at && (
                <div className="flex items-start space-x-3">
                  <div className={`w-2 h-2 rounded-full mt-2 ${
                    job.status === 'completed' ? 'bg-green-600' : 
                    job.status === 'failed' ? 'bg-red-600' : 'bg-yellow-600'
                  }`} />
                  <div>
                    <p className="font-medium text-slate-900">
                      {job.status === 'completed' ? 'Import Completed' : 
                       job.status === 'failed' ? 'Import Failed' : 'Import Completed with Errors'}
                    </p>
                    <p className="text-sm text-slate-500">
                      {new Date(job.completed_at).toLocaleString()}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ImportJobDetail;
