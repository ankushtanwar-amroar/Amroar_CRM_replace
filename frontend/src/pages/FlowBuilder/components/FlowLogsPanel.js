import React, { useState, useEffect } from 'react';
import {
  X,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Activity,
  RefreshCw
} from 'lucide-react';
import { Button } from '../../../components/ui/button';
import axios from 'axios';

const FlowLogsPanel = ({ flowId, onClose }) => {
  const [executions, setExecutions] = useState([]);
  const [flowNodes, setFlowNodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedExecution, setSelectedExecution] = useState(null);
  const [expandedNodes, setExpandedNodes] = useState({});
  const [dateRange, setDateRange] = useState('7d');

  /* ----------------------------------------------------
     FETCH FLOW DEFINITION (ALL NODES)
  ---------------------------------------------------- */
  useEffect(() => {
    fetchFlowDefinition();
  }, [flowId]);

  const fetchFlowDefinition = async () => {
    try {
      const token = localStorage.getItem('token');
      const backendUrl = process.env.REACT_APP_BACKEND_URL;

      const res = await axios.get(
        `${backendUrl}/api/flow-builder/flows/${flowId}`,
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      setFlowNodes(res.data.nodes || []);
    } catch (err) {
      console.error('❌ Failed to fetch flow definition', err);
    }
  };

  /* ----------------------------------------------------
     FETCH EXECUTIONS
  ---------------------------------------------------- */
  useEffect(() => {
    fetchExecutions();
  }, [flowId, dateRange]);

  const fetchExecutions = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const backendUrl = process.env.REACT_APP_BACKEND_URL;

      let startDate = null;
      const now = new Date();

      if (dateRange === '7d') {
        startDate = new Date(now.getTime() - 7 * 86400000);
      } else if (dateRange === '30d') {
        startDate = new Date(now.getTime() - 30 * 86400000);
      }

      const res = await axios.get(
        `${backendUrl}/api/flow-builder/flows/${flowId}/executions`,
        {
          params: {
            page: 1,
            limit: 100,
            ...(startDate && { start_date: startDate.toISOString() })
          },
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      const list = res.data.executions || res.data.items || [];
      setExecutions(list);
      setSelectedExecution(list[0] || null);
    } catch (err) {
      console.error('❌ Failed to fetch executions', err);
    } finally {
      setLoading(false);
    }
  };

  /* ----------------------------------------------------
     NORMALIZE + MERGE NODES (CRITICAL FIX)
  ---------------------------------------------------- */
  const normalizeId = id => String(id).toLowerCase();

  const getCompleteNodeExecutions = () => {
    if (!selectedExecution) {
      return [];
    }

    // If we have node_executions from the execution, use them directly
    const nodeExecs = selectedExecution.node_executions || [];
    
    // If there are node_executions, sort by step_number and return them
    if (nodeExecs.length > 0) {
      // Sort by step_number first, then by started_at as secondary sort
      const sortedExecs = [...nodeExecs].sort((a, b) => {
        const stepA = a.step_number || 0;
        const stepB = b.step_number || 0;
        if (stepA !== stepB) return stepA - stepB;
        // Secondary sort by started_at if same step_number
        const timeA = a.started_at || '';
        const timeB = b.started_at || '';
        return timeA.localeCompare(timeB);
      });
      
      return sortedExecs.map(exec => ({
        ...exec,
        skipped: false
      }));
    }
    
    // Fallback: If no node_executions but we have flowNodes, try to map them
    if (flowNodes.length === 0) {
      return [];
    }

    // Create a map of executed nodes from the execution log
    const execMap = {};
    nodeExecs.forEach(exec => {
      execMap[normalizeId(exec.node_id)] = exec;
    });

    // Start with trigger if it exists in execution logs
    const result = [];
    const triggerExec = nodeExecs.find(
      exec => exec.node_type === 'trigger' || exec.node_id === 'trigger_start'
    );
    if (triggerExec) {
      result.push({
        ...triggerExec,
        skipped: false
      });
    }

    // Then add flow nodes
    flowNodes.forEach(node => {
      const exec = execMap[normalizeId(node.id)];

      if (exec) {
        result.push({
          ...exec,
          skipped: false
        });
      } else {
        result.push({
          node_id: node.id,
          node_type: node.type,
          status: 'skipped',
          skipped: true,
          input: null,
          output: null,
          error: null,
          started_at: null,
          completed_at: null,
          retry_count: 0
        });
      }
    });

    return result;
  };

  /* ----------------------------------------------------
     HELPERS
  ---------------------------------------------------- */
  const toggleNodeExpand = id => {
    setExpandedNodes(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const getStatusIcon = status => {
    switch (status) {
      case 'success':
        return <CheckCircle className="h-5 w-5 text-green-600" />;
      case 'failed':
        return <XCircle className="h-5 w-5 text-red-600" />;
      case 'running':
        return <Clock className="h-5 w-5 text-blue-600 animate-spin" />;
      case 'skipped':
        return <AlertCircle className="h-5 w-5 text-gray-400" />;
      case 'started':
        return <Activity className="h-5 w-5 text-blue-600" />;
      default:
        return <AlertCircle className="h-5 w-5 text-gray-400" />;
    }
  };

  // Requirement #8: Better timestamp formatting for execution logs
  const formatTimestamp = (dateStr) => {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    return d.toLocaleString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3
    });
  };

  const formatDate = d =>
    d
      ? new Date(d).toLocaleString('en-US', {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        })
      : '-';

  const formatDuration = (start, end, skipped) => {
    if (skipped) return 'Skipped';
    if (!end) return 'In progress';
    const ms = new Date(end) - new Date(start);
    return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(2)}s`;
  };

  /* ----------------------------------------------------
     DEEP VALUE RENDERER (RESTORED)
  ---------------------------------------------------- */
  const renderValue = (value, depth = 0) => {
    if (value === null) return <span className="text-gray-400 italic">null</span>;
    if (value === undefined)
      return <span className="text-gray-400 italic">undefined</span>;
    if (typeof value === 'boolean')
      return <span className="text-purple-600">{String(value)}</span>;
    if (typeof value === 'number')
      return <span className="text-blue-600">{value}</span>;
    if (typeof value === 'string')
      return <span className="text-green-700">"{value}"</span>;

    if (Array.isArray(value)) {
      if (depth > 2) return <span>[{value.length} items]</span>;
      return (
        <div className="ml-4 space-y-1">
          {value.map((v, i) => (
            <div key={i}>{renderValue(v, depth + 1)}</div>
          ))}
        </div>
      );
    }

    if (typeof value === 'object') {
      if (depth > 2) return <span>{`{${Object.keys(value).length} fields}`}</span>;
      return (
        <div className="ml-4 space-y-1">
          {Object.entries(value).map(([k, v]) => (
            <div key={k}>
              <span className="font-semibold text-indigo-600">{k}:</span>{' '}
              {renderValue(v, depth + 1)}
            </div>
          ))}
        </div>
      );
    }

    return <span>{String(value)}</span>;
  };

  /* ----------------------------------------------------
     RENDER
  ---------------------------------------------------- */
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-7xl h-[90vh] flex flex-col">
        {/* HEADER */}
        <div className="flex justify-between items-center p-4 border-b">
          <div className="flex items-center gap-3">
            <Activity className="h-6 w-6 text-indigo-600" />
            <h2 className="text-xl font-bold">Flow Execution Logs</h2>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={fetchExecutions}>
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button variant="ghost" onClick={onClose}>
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {/* BODY */}
        <div className="flex flex-1 overflow-hidden">
          {/* LEFT */}
          <div className="w-80 border-r bg-gray-50 overflow-y-auto">
            {executions.map(exec => (
              <button
                key={exec.id}
                onClick={() => setSelectedExecution(exec)}
                className={`w-full p-3 border-b text-left ${
                  selectedExecution?.id === exec.id
                    ? 'bg-indigo-50'
                    : 'hover:bg-gray-100'
                }`}
              >
                <div className="flex justify-between">
                  <span className="text-xs font-semibold uppercase">
                    {exec.status}
                  </span>
                  <span className="text-xs text-gray-500">
                    {formatDuration(exec.started_at, exec.completed_at)}
                  </span>
                </div>
                <p className="text-xs text-gray-500">
                  {formatDate(exec.started_at)}
                </p>
              </button>
            ))}
          </div>

          {/* RIGHT - Node Execution Logs (Requirement #8: Step-by-step logs) */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {getCompleteNodeExecutions().length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <Activity className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                <p className="text-lg font-medium">No execution logs yet</p>
                <p className="text-sm">Run the flow to see step-by-step execution details</p>
              </div>
            ) : (
              getCompleteNodeExecutions().map((node, idx) => (
                <div key={node.node_id} className="border rounded-lg" data-testid={`node-log-${node.node_id}`}>
                  <button
                    onClick={() => toggleNodeExpand(node.node_id)}
                    className="w-full p-4 flex justify-between items-center hover:bg-gray-50"
                  >
                    <div className="flex items-center gap-3">
                      {/* Step Number */}
                      <span className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center font-bold text-sm">
                        {node.step_number || idx + 1}
                      </span>
                      
                      {/* Status Icon */}
                      {getStatusIcon(node.status)}
                      
                      {/* Node Info */}
                      <div>
                        <p className="font-semibold">{node.display_name || node.node_id}</p>
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                          <span className="px-1.5 py-0.5 bg-gray-100 rounded">{node.category || node.node_type}</span>
                          {/* Timestamp for started */}
                          {node.started_at && (
                            <span className="text-gray-400">
                              Started: {formatTimestamp(node.started_at)}
                            </span>
                          )}
                        </div>
                      </div>
                      
                      {/* Status Badge */}
                      {node.skipped ? (
                        <span className="ml-2 px-2 py-0.5 text-xs bg-gray-200 rounded text-gray-600">
                          SKIPPED
                        </span>
                      ) : (
                        <span className={`ml-2 px-2 py-0.5 text-xs rounded uppercase ${
                          node.status === 'success' ? 'bg-green-100 text-green-700' :
                          node.status === 'failed' ? 'bg-red-100 text-red-700' :
                          node.status === 'running' ? 'bg-blue-100 text-blue-700' :
                          'bg-gray-100 text-gray-600'
                        }`}>
                          {node.status}
                        </span>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-3">
                      {/* Duration */}
                      {!node.skipped && node.completed_at && (
                        <span className="text-xs text-gray-500">
                          {formatDuration(node.started_at, node.completed_at, node.skipped)}
                        </span>
                      )}
                      {expandedNodes[node.node_id] ? (
                        <ChevronDown className="h-5 w-5 text-gray-400" />
                      ) : (
                        <ChevronRight className="h-5 w-5 text-gray-400" />
                      )}
                    </div>
                  </button>

                  {expandedNodes[node.node_id] && !node.skipped && (
                    <div className="p-4 border-t bg-gray-50 space-y-3 text-sm">
                      {/* Timing Details */}
                      <div className="flex gap-6 text-xs text-gray-500 pb-2 border-b">
                        <div>
                          <span className="font-medium">Started:</span> {formatDate(node.started_at)}
                        </div>
                        <div>
                          <span className="font-medium">Completed:</span> {formatDate(node.completed_at)}
                        </div>
                        <div>
                          <span className="font-medium">Duration:</span> {formatDuration(node.started_at, node.completed_at, node.skipped)}
                        </div>
                        {node.retry_count > 0 && (
                          <div className="text-orange-600">
                            <span className="font-medium">Retries:</span> {node.retry_count}
                          </div>
                        )}
                      </div>
                      
                      {node.input && (
                        <div>
                          <strong>INPUT</strong>
                          <div className="bg-white p-2 border rounded font-mono">
                            {renderValue(node.input)}
                          </div>
                        </div>
                      )}

                      {node.output && (
                        <div>
                          <strong>OUTPUT</strong>
                          <div className="bg-white p-2 border rounded font-mono">
                            {renderValue(node.output)}
                          </div>
                        </div>
                      )}

                      {node.error && (
                        <div className="text-red-600">
                          <strong>ERROR:</strong> {node.error}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default FlowLogsPanel;
