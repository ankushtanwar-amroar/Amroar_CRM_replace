import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle, XCircle, Clock, ExternalLink, RefreshCw } from 'lucide-react';
import axios from 'axios';

const WebhookLogsPage = () => {
  const navigate = useNavigate();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedLog, setSelectedLog] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  
  const API = process.env.REACT_APP_BACKEND_URL;

  useEffect(() => {
    fetchLogs();
  }, []);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API}/api/flow-builder/webhook-logs?limit=100`);
      setLogs(response.data || []);
    } catch (error) {
      console.error('Error fetching webhook logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  const getStatusBadge = (status) => {
    if (status === 'success') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 text-xs font-semibold rounded">
          <CheckCircle className="w-3 h-3" />
          Success
        </span>
      );
    } else {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-100 text-red-700 text-xs font-semibold rounded">
          <XCircle className="w-3 h-3" />
          Failed
        </span>
      );
    }
  };

  const getHttpStatusColor = (status) => {
    if (status >= 200 && status < 300) return 'text-green-600';
    if (status >= 400 && status < 500) return 'text-yellow-600';
    return 'text-red-600';
  };

  const handleViewDetails = (log) => {
    setSelectedLog(log);
    setShowDetailModal(true);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center">
            <button
              onClick={() => navigate('/flows')}
              className="mr-4 p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </button>
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">Webhook Executions</h1>
              <p className="text-sm text-gray-600 mt-1">Monitor incoming webhook triggers and executions</p>
            </div>
          </div>
          <button
            onClick={fetchLogs}
            disabled={loading}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto"></div>
              <p className="mt-4 text-gray-600">Loading webhook logs...</p>
            </div>
          </div>
        ) : logs.length === 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Clock className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No Webhook Executions Yet</h3>
            <p className="text-gray-600 text-sm">
              Webhook executions will appear here once external systems start triggering your flows.
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      Timestamp
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      Flow
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      HTTP Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      Execution Time
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {logs.map((log) => (
                    <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4 text-gray-400" />
                          {formatTimestamp(log.timestamp)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{log.flow_name}</div>
                        <div className="text-xs text-gray-500 font-mono">{log.flow_id.substring(0, 8)}...</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {getStatusBadge(log.status)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`text-sm font-semibold font-mono ${getHttpStatusColor(log.http_status)}`}>
                          {log.http_status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {log.execution_time_ms}ms
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <button
                          onClick={() => handleViewDetails(log)}
                          className="text-purple-600 hover:text-purple-800 font-medium flex items-center gap-1"
                        >
                          View Details
                          <ExternalLink className="w-3 h-3" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {showDetailModal && selectedLog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-hidden">
            {/* Modal Header */}
            <div className="bg-purple-600 text-white px-6 py-4 flex items-center justify-between">
              <h3 className="text-xl font-semibold">Webhook Execution Details</h3>
              <button
                onClick={() => setShowDetailModal(false)}
                className="text-white hover:text-gray-200 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-8rem)]">
              <div className="space-y-4">
                {/* Basic Info */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-gray-600 uppercase">Flow Name</label>
                    <p className="text-sm text-gray-900 mt-1">{selectedLog.flow_name}</p>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-600 uppercase">Status</label>
                    <div className="mt-1">{getStatusBadge(selectedLog.status)}</div>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-600 uppercase">HTTP Status</label>
                    <p className={`text-sm font-mono font-semibold mt-1 ${getHttpStatusColor(selectedLog.http_status)}`}>
                      {selectedLog.http_status}
                    </p>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-600 uppercase">Execution Time</label>
                    <p className="text-sm text-gray-900 mt-1">{selectedLog.execution_time_ms}ms</p>
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs font-semibold text-gray-600 uppercase">Timestamp</label>
                    <p className="text-sm text-gray-900 mt-1">{formatTimestamp(selectedLog.timestamp)}</p>
                  </div>
                </div>

                {/* Webhook URL */}
                <div>
                  <label className="text-xs font-semibold text-gray-600 uppercase">Webhook URL</label>
                  <p className="text-sm text-gray-900 mt-1 font-mono bg-gray-50 p-2 rounded">{selectedLog.webhook_url}</p>
                </div>

                {/* Payload */}
                <div>
                  <label className="text-xs font-semibold text-gray-600 uppercase">Request Payload</label>
                  <pre className="mt-2 bg-gray-900 text-gray-100 p-4 rounded-lg text-xs overflow-x-auto">
                    {JSON.stringify(selectedLog.payload, null, 2)}
                  </pre>
                </div>

                {/* Error Message */}
                {selectedLog.error_message && (
                  <div>
                    <label className="text-xs font-semibold text-red-600 uppercase">Error Message</label>
                    <p className="text-sm text-red-700 mt-2 bg-red-50 p-3 rounded border border-red-200">
                      {selectedLog.error_message}
                    </p>
                  </div>
                )}

                {/* Execution ID */}
                {selectedLog.execution_id && (
                  <div>
                    <label className="text-xs font-semibold text-gray-600 uppercase">Execution ID</label>
                    <p className="text-sm text-gray-900 mt-1 font-mono">{selectedLog.execution_id}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="bg-gray-50 px-6 py-4 flex justify-end border-t border-gray-200">
              <button
                onClick={() => setShowDetailModal(false)}
                className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WebhookLogsPage;
