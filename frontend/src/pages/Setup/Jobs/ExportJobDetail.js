import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { 
  ArrowLeft, Download, Clock, CheckCircle, XCircle, 
  AlertCircle, RefreshCw, FileText, Database, Calendar, FileSpreadsheet
} from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { Badge } from '../../../components/ui/badge';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const ExportJobDetail = () => {
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
      const response = await axios.get(`${API}/data-operations/export/jobs/${jobId}`);
      setJob(response.data);
    } catch (error) {
      console.error('Error fetching job details:', error);
      toast.error('Failed to load job details');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadFile = async () => {
    try {
      if (!job.output_file_path) {
        toast.error('Export file not available');
        return;
      }

      const response = await axios.get(`${API}/data-operations/export/jobs/${jobId}/download`, {
        responseType: 'blob'
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', job.output_filename || `export_${jobId}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      
      toast.success('File downloaded successfully');
    } catch (error) {
      console.error('Error downloading file:', error);
      toast.error('Failed to download file');
    }
  };

  const getStatusIcon = (status) => {
    const icons = {
      draft: Clock,
      running: RefreshCw,
      completed: CheckCircle,
      failed: XCircle
    };
    return icons[status] || Clock;
  };

  const getStatusColor = (status) => {
    const colors = {
      draft: 'text-slate-600 bg-slate-100',
      running: 'text-blue-600 bg-blue-100',
      completed: 'text-green-600 bg-green-100',
      failed: 'text-red-600 bg-red-100'
    };
    return colors[status] || colors.draft;
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return 'N/A';
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(2)} KB`;
    const mb = kb / 1024;
    return `${mb.toFixed(2)} MB`;
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
                <p className="text-sm text-slate-500">Export Job Details</p>
              </div>
            </div>
            {job.status === 'completed' && job.output_file_path && (
              <Button onClick={handleDownloadFile} className="bg-green-600 hover:bg-green-700">
                <Download className="h-4 w-4 mr-2" />
                Download Export File
              </Button>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Status Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <StatusIcon className={`h-5 w-5 ${job.status === 'running' ? 'animate-spin' : ''}`} />
                  Job Status
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <Badge className={`${getStatusColor(job.status)} px-4 py-2 text-sm font-medium`}>
                    {job.status.replace('_', ' ').toUpperCase()}
                  </Badge>
                  {polling && (
                    <span className="text-sm text-slate-500">Auto-refreshing...</span>
                  )}
                </div>
                {job.status === 'failed' && job.error_message && (
                  <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-sm text-red-800 font-medium mb-1">Error Details:</p>
                    <p className="text-sm text-red-700">{job.error_message}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Export Configuration */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Database className="h-5 w-5 text-blue-600" />
                  Export Configuration
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-slate-600">Object</label>
                  <p className="text-base text-slate-900 capitalize">{job.object_name}</p>
                </div>
                
                <div>
                  <label className="text-sm font-medium text-slate-600">Selected Fields</label>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {job.selected_fields?.map((field, index) => (
                      <Badge key={index} variant="secondary" className="font-mono text-xs">
                        {field}
                      </Badge>
                    ))}
                  </div>
                </div>

                {job.filters && job.filters.length > 0 && (
                  <div>
                    <label className="text-sm font-medium text-slate-600">Filters Applied</label>
                    <div className="mt-2 space-y-2">
                      {job.filters.map((filter, index) => (
                        <div key={index} className="text-sm bg-slate-50 p-2 rounded border">
                          <code className="text-slate-700">
                            {filter.field} {filter.operator} "{filter.value}"
                          </code>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-slate-600">Output Format</label>
                    <p className="text-base text-slate-900 uppercase">{job.output_format}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-600">Encoding</label>
                    <p className="text-base text-slate-900 uppercase">{job.encoding}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Export Results */}
            {(job.status === 'completed' || job.status === 'failed') && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileSpreadsheet className="h-5 w-5 text-green-600" />
                    Export Results
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                    <div>
                      <label className="text-sm font-medium text-slate-600">Total Records</label>
                      <p className="text-2xl font-bold text-green-600">{job.total_records || 0}</p>
                    </div>
                    
                    {job.status === 'completed' && (
                      <>
                        <div>
                          <label className="text-sm font-medium text-slate-600">File Size</label>
                          <p className="text-2xl font-bold text-blue-600">
                            {formatFileSize(job.file_size_bytes)}
                          </p>
                        </div>
                        
                        <div>
                          <label className="text-sm font-medium text-slate-600">File Name</label>
                          <p className="text-sm font-mono text-slate-700 mt-2">
                            {job.output_filename || `export_${job.id}.csv`}
                          </p>
                        </div>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Job Info */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <FileText className="h-4 w-4 text-slate-600" />
                  Job Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div>
                  <label className="text-xs font-medium text-slate-500">Job ID</label>
                  <p className="font-mono text-xs text-slate-700">{job.id}</p>
                </div>
                
                <div>
                  <label className="text-xs font-medium text-slate-500">Created By</label>
                  <p className="text-slate-700">{job.created_by}</p>
                </div>
                
                <div>
                  <label className="text-xs font-medium text-slate-500">Created At</label>
                  <p className="text-slate-700 flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {new Date(job.created_at).toLocaleString()}
                  </p>
                </div>
                
                {job.started_at && (
                  <div>
                    <label className="text-xs font-medium text-slate-500">Started At</label>
                    <p className="text-slate-700 flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {new Date(job.started_at).toLocaleString()}
                    </p>
                  </div>
                )}
                
                {job.completed_at && (
                  <div>
                    <label className="text-xs font-medium text-slate-500">Completed At</label>
                    <p className="text-slate-700 flex items-center gap-1">
                      <CheckCircle className="h-3 w-3" />
                      {new Date(job.completed_at).toLocaleString()}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Actions */}
            {job.status === 'completed' && job.output_file_path && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Download</CardTitle>
                </CardHeader>
                <CardContent>
                  <Button 
                    onClick={handleDownloadFile}
                    className="w-full bg-green-600 hover:bg-green-700"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Download Export File
                  </Button>
                  <p className="text-xs text-slate-500 mt-2 text-center">
                    {formatFileSize(job.file_size_bytes)} • {job.total_records} records
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExportJobDetail;
