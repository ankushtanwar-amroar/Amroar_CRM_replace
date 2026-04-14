import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { 
  ArrowLeft, Info, CheckCircle, XCircle, Clock, Zap, 
  FileText, GitBranch, User, Calendar, LayoutGrid 
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { toast } from 'sonner';

const API = process.env.REACT_APP_BACKEND_URL;

const FlowInfoPage = () => {
  const { flowId } = useParams();
  const navigate = useNavigate();
  const [flow, setFlow] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchFlow = async () => {
      try {
        setLoading(true);
        const response = await axios.get(`${API}/api/flow-builder/flows/${flowId}`);
        setFlow(response.data);
      } catch (error) {
        console.error('Error fetching flow:', error);
        toast.error('Failed to load flow details');
      } finally {
        setLoading(false);
      }
    };

    if (flowId) {
      fetchFlow();
    }
  }, [flowId]);

  const getTriggerLabel = (trigger) => {
    const triggerType = trigger?.type?.toLowerCase();
    switch (triggerType) {
      case 'db':
      case 'trigger':
      case 'record_trigger':
        return 'Record Trigger Automation';
      case 'webhook':
      case 'webhook_trigger':
      case 'incoming_webhook_trigger':
        return 'Webhook Trigger';
      case 'schedule':
      case 'scheduled_trigger':
        return 'Scheduled Automation';
      case 'screen':
        return 'Screen Flow';
      default:
        return trigger?.type || 'Manual';
    }
  };

  const getFlowTypeLabel = (flow) => {
    const flowType = flow.flow_type || flow.flowType;
    if (flowType === 'screen-flow' || flowType === 'screen_flow') {
      return 'Screen Flow';
    }
    if (flow.triggers?.length > 0) {
      return getTriggerLabel(flow.triggers[0]);
    }
    return 'Record-Triggered Automation';
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'active': return 'bg-green-500';
      case 'draft': return 'bg-gray-500';
      case 'inactive': return 'bg-yellow-500';
      default: return 'bg-gray-500';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'active': return <CheckCircle className="h-5 w-5 text-green-600" />;
      case 'inactive': return <XCircle className="h-5 w-5 text-yellow-600" />;
      default: return <Clock className="h-5 w-5 text-gray-500" />;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading flow details...</p>
        </div>
      </div>
    );
  }

  if (!flow) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <XCircle className="h-16 w-16 text-red-400 mx-auto" />
          <h2 className="mt-4 text-xl font-semibold text-gray-900">Flow Not Found</h2>
          <p className="mt-2 text-gray-600">The requested flow could not be found.</p>
          <Button onClick={() => navigate('/flows')} className="mt-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Flows
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => navigate('/flows')}
                className="gap-2"
                data-testid="back-to-flows-btn"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Flows
              </Button>
              <div className="h-6 w-px bg-gray-300" />
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
                  <Info className="h-5 w-5 text-indigo-600" />
                </div>
                <div>
                  <h1 className="text-lg font-semibold text-gray-900">Flow Information</h1>
                  <p className="text-sm text-gray-500">Detailed view</p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button 
                variant="outline" 
                onClick={() => navigate(`/flows/${flowId}/edit`)}
                data-testid="edit-flow-btn"
              >
                Edit Flow
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Main Info Card */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          {/* Card Header */}
          <div className="bg-gradient-to-r from-indigo-600 to-blue-600 px-6 py-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-white/20 rounded-xl flex items-center justify-center">
                  <Zap className="h-7 w-7 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">{flow.name}</h2>
                  <p className="text-blue-100 text-sm mt-1">{getFlowTypeLabel(flow)}</p>
                </div>
              </div>
              <Badge className={`${getStatusColor(flow.status)} text-white text-sm px-3 py-1 capitalize`}>
                {flow.status}
              </Badge>
            </div>
          </div>

          {/* Card Body */}
          <div className="p-6 space-y-6">
            {/* Basic Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Flow Name */}
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-indigo-50 rounded-lg flex items-center justify-center flex-shrink-0">
                  <FileText className="h-5 w-5 text-indigo-600" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Flow Name</label>
                  <p className="text-base font-semibold text-gray-900 mt-1">{flow.name}</p>
                </div>
              </div>

              {/* Flow Type */}
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-indigo-50 rounded-lg flex items-center justify-center flex-shrink-0">
                  <GitBranch className="h-5 w-5 text-indigo-600" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Flow Type</label>
                  <p className="text-base text-gray-900 mt-1">{getFlowTypeLabel(flow)}</p>
                </div>
              </div>

              {/* Status */}
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-indigo-50 rounded-lg flex items-center justify-center flex-shrink-0">
                  {getStatusIcon(flow.status)}
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Status</label>
                  <div className="mt-1">
                    <Badge className={`${getStatusColor(flow.status)} text-white capitalize text-sm`}>
                      {flow.status}
                    </Badge>
                  </div>
                </div>
              </div>

              {/* Version */}
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-indigo-50 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Zap className="h-5 w-5 text-indigo-600" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Version</label>
                  <p className="text-base text-gray-900 mt-1">v{flow.version}</p>
                </div>
              </div>
            </div>

            {/* Divider */}
            <hr className="border-gray-200" />

            {/* Trigger Type */}
            {flow.triggers && flow.triggers.length > 0 && (
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-indigo-50 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Zap className="h-5 w-5 text-indigo-600" />
                </div>
                <div className="flex-1">
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Trigger Type</label>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {flow.triggers.map((trigger, idx) => (
                      <span key={idx} className="px-3 py-1.5 bg-indigo-50 text-indigo-700 text-sm rounded-lg font-medium">
                        {getTriggerLabel(trigger)}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Description */}
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 bg-indigo-50 rounded-lg flex items-center justify-center flex-shrink-0">
                <FileText className="h-5 w-5 text-indigo-600" />
              </div>
              <div className="flex-1">
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Description</label>
                <p className="text-sm text-gray-700 mt-1">{flow.description || 'No description provided'}</p>
              </div>
            </div>

            {/* Divider */}
            <hr className="border-gray-200" />

            {/* Stats */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gradient-to-br from-indigo-50 to-blue-50 rounded-xl p-4 border border-indigo-100">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
                    <LayoutGrid className="h-5 w-5 text-indigo-600" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-indigo-600 uppercase tracking-wide">Nodes</label>
                    <p className="text-2xl font-bold text-indigo-900 mt-0.5">{flow.nodes?.length || 0}</p>
                  </div>
                </div>
              </div>
              <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-xl p-4 border border-blue-100">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                    <GitBranch className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-blue-600 uppercase tracking-wide">Connections</label>
                    <p className="text-2xl font-bold text-blue-900 mt-0.5">{flow.edges?.length || 0}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Divider */}
            <hr className="border-gray-200" />

            {/* Metadata */}
            <div className="space-y-3">
              <div className="flex items-center gap-4 text-sm">
                <div className="flex items-center gap-2 text-gray-500">
                  <User className="h-4 w-4" />
                  <span>Created By:</span>
                </div>
                <span className="text-gray-900 font-medium">{flow.created_by || 'Unknown'}</span>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <div className="flex items-center gap-2 text-gray-500">
                  <Calendar className="h-4 w-4" />
                  <span>Created:</span>
                </div>
                <span className="text-gray-900 font-medium">
                  {flow.created_at ? new Date(flow.created_at).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  }) : 'N/A'}
                </span>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <div className="flex items-center gap-2 text-gray-500">
                  <Clock className="h-4 w-4" />
                  <span>Last Modified:</span>
                </div>
                <span className="text-gray-900 font-medium">
                  {flow.updated_at ? new Date(flow.updated_at).toLocaleString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  }) : 'N/A'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FlowInfoPage;
