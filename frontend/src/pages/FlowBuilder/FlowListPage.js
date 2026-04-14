import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Play, Plus, Edit, Trash2, Zap, Clock, CheckCircle, XCircle, ArrowLeft, Eye, Info, LayoutGrid, Table, ChevronDown, Search, ChevronLeft, ChevronRight, Monitor } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Input } from '../../components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu';
import { toast } from 'sonner';
import ValidationResultsModal from './components/ValidationResultsModal';

const API = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';

const FlowListPage = () => {
  const navigate = useNavigate();
  const [flows, setFlows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState(() => {
    return localStorage.getItem('flowListViewMode') || 'grid';
  });
  const [showValidationModal, setShowValidationModal] = useState(false);
  const [validationResult, setValidationResult] = useState(null);
  const [selectedFlowForValidation, setSelectedFlowForValidation] = useState(null);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  
  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setCurrentPage(1); // Reset to first page on new search
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    fetchFlows();
  }, [currentPage, pageSize, debouncedSearch]);

  const fetchFlows = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API}/api/flow-builder/flows`, {
        params: { 
          page: currentPage,
          limit: pageSize,
          ...(debouncedSearch && { search: debouncedSearch })
        }
      });
      setFlows(response.data.flows);
      setTotalCount(response.data.total);
      setTotalPages(response.data.total_pages || Math.ceil(response.data.total / pageSize));
    } catch (error) {
      console.error('Error fetching flows:', error);
      toast.error('Failed to load flows');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateFlow = () => {
    window.open('/flows/new', '_blank', 'noopener,noreferrer');
  };

  const handleEditFlow = (flowId) => {
    navigate(`/flows/${flowId}/edit`);
  };

  // FIX #4: Navigate to Flow Info Page instead of showing modal
  const handleShowFlowInfo = (flow, event) => {
    event.stopPropagation(); // Prevent card click navigation
    event.preventDefault();
    navigate(`/flows/${flow.id}/info`);
  };

  // Original handleViewDetails - for "View Details" page navigation
  const handleViewDetails = (flowId) => {
    navigate(`/flows/${flowId}/details`);
  };

  const handleRunFlow = async (flowId) => {
    try {
      const response = await axios.post(`${API}/api/flow-builder/flows/${flowId}/run`);
      toast.success(`Flow executed! Status: ${response.data.status}`);
      navigate(`/flows/${flowId}/executions/${response.data.id}`);
    } catch (error) {
      console.error('Error running flow:', error);
      toast.error('Failed to run flow');
    }
  };

  const handleDeleteFlow = async (flowId) => {
    if (!window.confirm('Are you sure you want to delete this flow?')) {
      return;
    }

    try {
      await axios.delete(`${API}/api/flow-builder/flows/${flowId}`);
      toast.success('Flow deleted successfully');
      fetchFlows();
    } catch (error) {
      console.error('Error deleting flow:', error);
      toast.error('Failed to delete flow');
    }
  };

  const handleToggleStatus = async (flowId, currentStatus, event, validateFirst = false) => {
    event.stopPropagation();
    
    const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
    
    if (newStatus === 'inactive') {
      try {
        await axios.patch(`${API}/api/flow-builder/flows/${flowId}/status`, {
          status: newStatus
        });
        
        toast.success('Flow deactivated successfully');
        fetchFlows();
      } catch (error) {
        console.error('Error updating flow status:', error);
        toast.error('Failed to deactivate flow');
      }
      return;
    }
    
    if (validateFirst) {
      await handleValidateAndActivate(flowId, event);
      return;
    }
    
    try {
      await axios.patch(`${API}/api/flow-builder/flows/${flowId}/status`, {
        status: newStatus
      });
      
      toast.success('Flow activated successfully');
      fetchFlows();
    } catch (error) {
      console.error('Error updating flow status:', error);
      const errorMsg = error.response?.data?.detail?.message || error.response?.data?.detail || 'Failed to activate flow';
      toast.error(errorMsg);
    }
  };

  const handleValidateAndActivate = async (flowId, event) => {
    event.stopPropagation();
    
    try {
      toast('Validating flow...', { icon: 'ℹ️' });
      const validationResponse = await axios.post(`${API}/api/flow-builder/flows/${flowId}/validate`);
      const result = validationResponse.data;
      
      setValidationResult(result);
      const flow = flows.find(f => f.id === flowId);
      setSelectedFlowForValidation(flow);
      
      if (!result.is_valid) {
        setShowValidationModal(true);
        toast.error(`Validation failed with ${result.error_count} errors`);
      } else {
        toast.success('Validation passed!');
        
        try {
          await axios.patch(`${API}/api/flow-builder/flows/${flowId}/status?validate_before_activate=true`, {
            status: 'active'
          });
          
          toast.success('Flow activated successfully!');
          fetchFlows();
        } catch (activateError) {
          console.error('Error activating flow:', activateError);
          toast.error('Failed to activate flow after validation');
        }
      }
    } catch (error) {
      console.error('Error validating flow:', error);
      toast.error('Failed to validate flow');
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'active':
        return 'bg-green-500';
      case 'draft':
        return 'bg-gray-500';
      case 'inactive':
        return 'bg-yellow-500';
      default:
        return 'bg-gray-500';
    }
  };

  // Requirement #7: Fix trigger label - "db" → "Record Trigger Automation"
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

  const getTriggerIcon = (trigger) => {
    const triggerType = trigger?.type?.toLowerCase();
    switch (triggerType) {
      case 'db':
      case 'trigger':
      case 'record_trigger':
        return <Zap className="h-4 w-4" />;
      case 'webhook':
      case 'webhook_trigger':
      case 'incoming_webhook_trigger':
        return <Zap className="h-4 w-4" />;
      case 'schedule':
      case 'scheduled_trigger':
        return <Clock className="h-4 w-4" />;
      default:
        return <Zap className="h-4 w-4" />;
    }
  };

  const handleViewModeChange = (mode) => {
    setViewMode(mode);
    localStorage.setItem('flowListViewMode', mode);
  };

  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
    }
  };

  const handlePageSizeChange = (newSize) => {
    setPageSize(newSize);
    setCurrentPage(1);
  };

  if (loading && flows.length === 0) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
        <p className="ml-3 text-slate-600">Loading flows...</p>
      </div>
    );
  }

  return (
    <div className="h-full bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate('/setup')}
            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors flex items-center space-x-2"
            title="Back to CRM"
          >
            <ArrowLeft className="h-4 w-4 text-slate-600" />
            <span className="text-sm font-medium text-slate-700 hidden sm:inline">Back to CRM</span>
          </button> 
          <div className="flex-1 text-center">
            <h1 className="text-2xl font-semibold text-slate-900">Flow Builder</h1>
            <p className="text-sm text-slate-600 mt-1">
              Create and manage automation flows
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* View Toggle */}
            <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
              <button
                onClick={() => handleViewModeChange('table')}
                className={`p-2 rounded transition-colors ${
                  viewMode === 'table'
                    ? 'bg-white text-indigo-600 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Table View"
              >
                <Table className="h-4 w-4" />
              </button>
              <button
                onClick={() => handleViewModeChange('grid')}
                className={`p-2 rounded transition-colors ${
                  viewMode === 'grid'
                    ? 'bg-white text-indigo-600 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Grid View"
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
            </div>
            <Button
              onClick={handleCreateFlow}
              className="bg-indigo-600 hover:bg-indigo-700"
              data-testid="create-flow-btn"
            >
              <Plus className="h-4 w-4 mr-2" />
              Create Flow
            </Button>
          </div>
        </div>
      </div>

      {/* Search Bar - Requirement #3 */}
      <div className="px-6 py-4 bg-white border-b border-slate-200">
        <div className="max-w-md">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              type="text"
              placeholder="Search by name, type, trigger, or creator..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
              data-testid="search-flows-input"
            />
          </div>
        </div>
      </div>

      {/* Flow List */}
      <div className="p-6">
        {flows.length === 0 && !loading ? (
          <div className="text-center py-12">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-100 mb-4">
              <Zap className="h-8 w-8 text-slate-400" />
            </div>
            <h3 className="text-lg font-medium text-slate-900 mb-2">
              {debouncedSearch ? 'No flows found' : 'No flows yet'}
            </h3>
            <p className="text-slate-600 mb-6">
              {debouncedSearch 
                ? `No flows match "${debouncedSearch}". Try a different search.`
                : 'Create your first automation flow to get started'
              }
            </p>
            {!debouncedSearch && (
              <Button
                onClick={handleCreateFlow}
                className="bg-indigo-600 hover:bg-indigo-700"
              >
                <Plus className="h-4 w-4 mr-2" />
                Create Flow
              </Button>
            )}
          </div>
        ) : viewMode === 'table' ? (
          /* Table View */
          <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Flow Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Trigger
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Nodes
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Last Modified
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Version
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {flows.map((flow) => (
                  <tr key={flow.id} className="hover:bg-slate-50 transition-colors" data-testid={`flow-row-${flow.id}`}>
                    <td className="px-6 py-4">
                      <div>
                        <div className="text-sm font-medium text-slate-900">{flow.name}</div>
                        {flow.description && (
                          <div className="text-xs text-slate-500 mt-1 line-clamp-1">
                            {flow.description}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <Badge className={`${getStatusColor(flow.status)} text-white capitalize text-xs`}>
                          {flow.status}
                        </Badge>
                        <div 
                          className="relative"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {flow.status === 'active' ? (
                            <Button
                              onClick={(e) => handleToggleStatus(flow.id, flow.status, e, false)}
                              variant="outline"
                              size="sm"
                              className="text-red-600 border-red-300 hover:bg-red-50"
                            >
                              Deactivate
                            </Button>
                          ) : (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="text-green-600 border-green-300 hover:bg-green-50 flex items-center gap-1"
                                  data-testid={`activate-dropdown-${flow.id}`}
                                >
                                  Activate
                                  <ChevronDown className="h-3 w-3" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="start" className="min-w-[180px]">
                                <DropdownMenuItem
                                  onClick={(e) => handleToggleStatus(flow.id, flow.status, e, false)}
                                  className="cursor-pointer"
                                >
                                  Activate
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={(e) => handleValidateAndActivate(flow.id, e)}
                                  className="cursor-pointer font-medium text-indigo-600"
                                >
                                  Validate & Activate ⭐
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        {flow.flow_type === 'screen' ? (
                          <div className="flex items-center gap-1 text-xs bg-purple-100 px-2 py-1 rounded">
                            <Monitor className="h-4 w-4 text-purple-600" />
                            <span className="text-purple-700">Screen Flow</span>
                          </div>
                        ) : flow.triggers && flow.triggers.length > 0 ? (
                          flow.triggers.map((trigger, idx) => (
                            <div
                              key={idx}
                              className="flex items-center gap-1 text-xs bg-slate-100 px-2 py-1 rounded"
                            >
                              {getTriggerIcon(trigger)}
                              <span>{getTriggerLabel(trigger)}</span>
                            </div>
                          ))
                        ) : (
                          <span className="text-xs text-slate-400">No triggers</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-slate-600">
                        {flow.nodes?.length || 0} nodes
                        <span className="text-slate-400 mx-1">•</span>
                        {flow.edges?.length || 0} connections
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-slate-600">
                        {flow.updated_at ? new Date(flow.updated_at).toLocaleDateString() : 'N/A'}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-slate-500">v{flow.version}</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          onClick={(e) => handleShowFlowInfo(flow, e)}
                          variant="outline"
                          size="sm"
                          title="View Info"
                          data-testid={`flow-info-btn-${flow.id}`}
                        >
                          <Info className="h-3 w-3" />
                        </Button>
                        <Button
                          onClick={() => handleEditFlow(flow.id)}
                          variant="outline"
                          size="sm"
                          title="Edit"
                        >
                          <Edit className="h-3 w-3" />
                        </Button>
                        {/* Requirement #1: Deploy button removed */}
                        <Button
                          onClick={() => handleDeleteFlow(flow.id)}
                          variant="outline"
                          size="sm"
                          className="text-red-600 hover:bg-red-50"
                          title="Delete"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          /* Grid View */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {flows.map((flow) => (
              <div
                key={flow.id}
                className="bg-white rounded-lg border border-slate-200 hover:border-indigo-300 hover:shadow-md transition-all cursor-pointer"
                data-testid={`flow-card-${flow.id}`}
              >
                <div className="p-6">
                  {/* Status Badge and Activate Controls */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <Badge
                        className={`${getStatusColor(flow.status)} text-white capitalize`}
                      >
                        {flow.status}
                      </Badge>
                      <div 
                        className="relative"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {flow.status === 'active' ? (
                          <Button
                            onClick={(e) => handleToggleStatus(flow.id, flow.status, e, false)}
                            variant="outline"
                            size="sm"
                            className="text-red-600 border-red-300 hover:bg-red-50"
                          >
                            Deactivate
                          </Button>
                        ) : (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-green-600 border-green-300 hover:bg-green-50 flex items-center gap-1"
                                data-testid={`activate-dropdown-card-${flow.id}`}
                              >
                                Activate
                                <ChevronDown className="h-3 w-3" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" className="min-w-[180px]">
                              <DropdownMenuItem
                                onClick={(e) => handleToggleStatus(flow.id, flow.status, e, false)}
                                className="cursor-pointer"
                              >
                                Activate
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={(e) => handleValidateAndActivate(flow.id, e)}
                                className="cursor-pointer font-medium text-indigo-600"
                              >
                                Validate & Activate ⭐
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                    </div>
                    <span className="text-xs text-slate-500">v{flow.version}</span>
                  </div>

                  {/* Flow Name */}
                  <h3 className="text-lg font-semibold text-slate-900 mb-2">
                    {flow.name}
                  </h3>

                  {/* Description */}
                  {flow.description && (
                    <p className="text-sm text-slate-600 mb-4 line-clamp-2">
                      {flow.description}
                    </p>
                  )}

                  {/* Triggers - with fixed labels */}
                  <div className="flex items-center gap-2 mb-4">
                    {flow.flow_type === 'screen' ? (
                      <div className="flex items-center gap-1 text-xs bg-purple-100 px-2 py-1 rounded">
                        <Monitor className="h-4 w-4 text-purple-600" />
                        <span className="text-purple-700">Screen Flow</span>
                      </div>
                    ) : flow.triggers && flow.triggers.length > 0 ? (
                      flow.triggers.map((trigger, idx) => (
                        <div
                          key={idx}
                          className="flex items-center gap-1 text-xs bg-slate-100 px-2 py-1 rounded"
                        >
                          {getTriggerIcon(trigger)}
                          <span>{getTriggerLabel(trigger)}</span>
                        </div>
                      ))
                    ) : (
                      <span className="text-xs text-slate-400">No triggers</span>
                    )}
                  </div>

                  {/* Nodes Count */}
                  <div className="text-xs text-slate-500 mb-4">
                    {flow.nodes?.length || 0} nodes • {flow.edges?.length || 0} connections
                  </div>

                  {/* Last Modified */}
                  <div className="text-xs text-slate-500 mb-3">
                    <Clock className="h-3 w-3 inline mr-1" />
                    Modified: {flow.updated_at ? new Date(flow.updated_at).toLocaleDateString() : 'N/A'}
                  </div>

                  {/* Actions - Deploy button removed (Requirement #1) */}
                  <div className="flex items-center gap-2">
                    <Button
                      onClick={(e) => handleShowFlowInfo(flow, e)}
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      data-testid={`flow-info-card-btn-${flow.id}`}
                    >
                      <Info className="h-3 w-3 mr-1" />
                      Info
                    </Button>

                    <Button
                      onClick={() => handleEditFlow(flow.id)}
                      variant="outline"
                      size="sm"
                      className="flex-1"
                    >
                      <Edit className="h-3 w-3 mr-1" />
                      Edit
                    </Button>

                    <Button
                      onClick={() => handleDeleteFlow(flow.id)}
                      variant="outline"
                      size="sm"
                      className="text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination Controls - Requirement #2 */}
        {flows.length > 0 && (
          <div className="mt-6 flex items-center justify-between bg-white rounded-lg border border-slate-200 px-4 py-3">
            <div className="flex items-center gap-4">
              <span className="text-sm text-slate-600">
                Showing {((currentPage - 1) * pageSize) + 1} - {Math.min(currentPage * pageSize, totalCount)} of {totalCount} flows
              </span>
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-600">Per page:</span>
                <select
                  value={pageSize}
                  onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                  className="border border-slate-200 rounded px-2 py-1 text-sm"
                  data-testid="page-size-select"
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                </select>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage <= 1}
                data-testid="prev-page-btn"
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Button>
              
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum;
                  if (totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (currentPage <= 3) {
                    pageNum = i + 1;
                  } else if (currentPage >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = currentPage - 2 + i;
                  }
                  
                  return (
                    <button
                      key={pageNum}
                      onClick={() => handlePageChange(pageNum)}
                      className={`px-3 py-1 rounded text-sm ${
                        currentPage === pageNum
                          ? 'bg-indigo-600 text-white'
                          : 'hover:bg-slate-100 text-slate-600'
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
              </div>
              
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage >= totalPages}
                data-testid="next-page-btn"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Validation Results Modal */}
      <ValidationResultsModal
        isOpen={showValidationModal}
        onClose={() => setShowValidationModal(false)}
        validationResult={validationResult}
        flowName={selectedFlowForValidation?.name}
      />
    </div>
  );
};

export default FlowListPage;
