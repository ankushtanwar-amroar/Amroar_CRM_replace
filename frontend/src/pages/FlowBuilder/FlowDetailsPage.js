import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Eye, Play, Pause, Archive, Edit, Clock, User, Calendar } from 'lucide-react';
import { Button } from '../../components/ui/button';
import RunManuallyModal from '../../components/RunManuallyModal';
import { toast } from 'sonner';

const FlowDetailsPage = () => {
  const { flowId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [flowDetails, setFlowDetails] = useState(null);
  const [error, setError] = useState(null);
  const [showRunManuallyModal, setShowRunManuallyModal] = useState(false);

  useEffect(() => {
    fetchFlowDetails();
  }, [flowId]);

  const fetchFlowDetails = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const backendUrl = process.env.REACT_APP_BACKEND_URL;
      
      const response = await fetch(`${backendUrl}/api/flow-builder/flows/${flowId}/details`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (!response.ok) throw new Error('Failed to fetch flow details');
      
      const data = await response.json();
      setFlowDetails(data);
      setLoading(false);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  const handleActivate = async (versionFlowId) => {
    try {
      const token = localStorage.getItem('token');
      const backendUrl = process.env.REACT_APP_BACKEND_URL;
      
      await fetch(`${backendUrl}/api/flow-builder/flows/${versionFlowId}/activate`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      fetchFlowDetails(); // Refresh
    } catch (err) {
      alert('Failed to activate version: ' + err.message);
    }
  };

  const handleDeactivate = async (versionFlowId) => {
    try {
      const token = localStorage.getItem('token');
      const backendUrl = process.env.REACT_APP_BACKEND_URL;
      
      await fetch(`${backendUrl}/api/flow-builder/flows/${versionFlowId}/deactivate`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      fetchFlowDetails(); // Refresh
    } catch (err) {
      alert('Failed to deactivate version: ' + err.message);
    }
  };

  const handleArchive = async (versionFlowId) => {
    if (!window.confirm('Are you sure you want to archive this version? Archived versions cannot be activated again.')) {
      return;
    }
    
    try {
      const token = localStorage.getItem('token');
      const backendUrl = process.env.REACT_APP_BACKEND_URL;
      
      await fetch(`${backendUrl}/api/flow-builder/flows/${versionFlowId}/archive`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      fetchFlowDetails(); // Refresh
    } catch (err) {
      alert('Failed to archive version: ' + err.message);
    }
  };

  const handleViewVersion = (versionFlowId, isReadOnly) => {
    navigate(`/flows/${versionFlowId}/view?readonly=${isReadOnly}`);
  };

  const handleEditVersion = (versionFlowId) => {
    navigate(`/flows/${versionFlowId}/edit`);
  };
  
  const handleRunManually = async (versionId, inputValues) => {
    try {
      const token = localStorage.getItem('token');
      const backendUrl = process.env.REACT_APP_BACKEND_URL;
      
      const response = await fetch(`${backendUrl}/api/flow-builder/flows/${flowId}/run-manually`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          version_id: versionId,
          input_values: inputValues  // Send input values
        })
      });
      
      if (!response.ok) throw new Error('Failed to run flow');
      
      toast.success('Flow execution started!');
      fetchFlowDetails(); // Refresh execution count
    } catch (err) {
      toast.error('Failed to run flow: ' + err.message);
    }
  };

  const getStatusBadge = (status) => {
    const styles = {
      active: 'bg-green-100 text-green-800',
      draft: 'bg-yellow-100 text-yellow-800',
      inactive: 'bg-gray-100 text-gray-800',
      archived: 'bg-red-100 text-red-800'
    };
    
    return (
      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${styles[status] || styles.inactive}`}>
        {status?.toUpperCase()}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-lg">Loading flow details...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-red-600">Error: {error}</div>
      </div>
    );
  }

  if (!flowDetails) return null;

  const { flow, metadata, versions, active_version, execution_count } = flowDetails;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center gap-4 mb-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/flows')}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Flows
            </Button>
          </div>
          
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">{metadata.name}</h1>
              <p className="text-gray-600 mt-1">{metadata.description || 'No description'}</p>
            </div>
            <div className="flex items-center gap-3">
              {metadata.flow_type === 'screen-flow' && (
                <Button
                  onClick={() => navigate(`/flows/${flowId}/run`)}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                  size="sm"
                >
                  <Play className="h-4 w-4 mr-2" />
                  Run Screen Flow
                </Button>
              )}
              <Button
                onClick={() => setShowRunManuallyModal(true)}
                className="bg-green-600 hover:bg-green-700 text-white"
                size="sm"
              >
                <Play className="h-4 w-4 mr-2" />
                Run Manually
              </Button>
              {getStatusBadge(metadata.current_status)}
            </div>
          </div>
        </div>
      </div>

      {/* Metadata Cards */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white p-4 rounded-lg border">
            <div className="flex items-center gap-2 text-gray-600 mb-1">
              <Calendar className="h-4 w-4" />
              <span className="text-sm">Current Version</span>
            </div>
            <div className="text-2xl font-bold">v{metadata.current_version}</div>
          </div>
          
          <div className="bg-white p-4 rounded-lg border">
            <div className="flex items-center gap-2 text-gray-600 mb-1">
              <Clock className="h-4 w-4" />
              <span className="text-sm">Total Versions</span>
            </div>
            <div className="text-2xl font-bold">{versions.length}</div>
          </div>
          
          <div className="bg-white p-4 rounded-lg border">
            <div className="flex items-center gap-2 text-gray-600 mb-1">
              <Play className="h-4 w-4" />
              <span className="text-sm">Executions</span>
            </div>
            <div className="text-2xl font-bold">{execution_count}</div>
          </div>
          
          <div className="bg-white p-4 rounded-lg border">
            <div className="flex items-center gap-2 text-gray-600 mb-1">
              <User className="h-4 w-4" />
              <span className="text-sm">Last Modified By</span>
            </div>
            <div className="text-sm font-semibold truncate">{metadata.updated_by || 'Unknown'}</div>
            <div className="text-xs text-gray-500 mt-1">
              {metadata.updated_at ? new Date(metadata.updated_at).toLocaleString() : 'N/A'}
            </div>
          </div>
        </div>

        {/* Version History Table */}
        <div className="bg-white rounded-lg border">
          <div className="p-6 border-b">
            <h2 className="text-xl font-bold">Version History</h2>
            <p className="text-sm text-gray-600 mt-1">All versions of this flow in descending order</p>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Version
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Created Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Created By
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {versions.map((version) => (
                  <tr key={version.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="font-semibold">v{version.version}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {getStatusBadge(version.status)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {version.created_at ? new Date(version.created_at).toLocaleString() : 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {version.created_by || 'Unknown'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleViewVersion(version.id, version.status !== 'draft')}
                          className="flex items-center gap-1"
                        >
                          <Eye className="h-4 w-4" />
                          View
                        </Button>
                        
                        {version.status === 'draft' && (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleEditVersion(version.id)}
                              className="flex items-center gap-1"
                            >
                              <Edit className="h-4 w-4" />
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleActivate(version.id)}
                              className="flex items-center gap-1 text-green-600 hover:text-green-700"
                            >
                              <Play className="h-4 w-4" />
                              Activate
                            </Button>
                          </>
                        )}
                        
                        {version.status === 'active' && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDeactivate(version.id)}
                            className="flex items-center gap-1 text-orange-600 hover:text-orange-700"
                          >
                            <Pause className="h-4 w-4" />
                            Deactivate
                          </Button>
                        )}
                        
                        {version.status !== 'archived' && version.status !== 'active' && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleArchive(version.id)}
                            className="flex items-center gap-1 text-red-600 hover:text-red-700"
                          >
                            <Archive className="h-4 w-4" />
                            Archive
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      
      {/* Run Manually Modal */}
      {showRunManuallyModal && (
        <RunManuallyModal
          isOpen={showRunManuallyModal}
          onClose={() => setShowRunManuallyModal(false)}
          onRun={handleRunManually}
          flow={{ id: flowId, name: metadata.name, version: metadata.current_version, status: metadata.current_status }}
          versions={versions}
        />
      )}
    </div>
  );
};

export default FlowDetailsPage;
