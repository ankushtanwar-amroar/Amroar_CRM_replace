import React, { useState, useEffect, useCallback } from 'react';
import { Cloud, CheckCircle2, XCircle, Loader2, Database, RefreshCw, Save, ShieldCheck, AlertTriangle, ChevronDown, ExternalLink } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { docflowService } from '../services/docflowService';
import SearchableSelect from './SearchableSelect';
import { useModuleEntitlementsContext } from '../../context/ModuleContext';

const ConnectionTab = ({ templateData, onUpdate }) => {
  const { isModuleAccessible, loading: modulesLoading } = useModuleEntitlementsContext();
  const isDocFlowOnly = !modulesLoading && !isModuleAccessible('crm');

  // Provider type: 'internal' or 'salesforce'
  const [providerType, setProviderType] = useState(templateData?.crm_connection?.provider || 'internal');
  // Selected CRM Sync connection_id (for Salesforce)
  const [selectedConnectionId, setSelectedConnectionId] = useState(templateData?.crm_connection?.connection_id || '');
  // List of Salesforce connections from CRM Sync
  const [sfConnections, setSfConnections] = useState([]);
  const [loadingSfConnections, setLoadingSfConnections] = useState(false);

  const [selectedObject, setSelectedObject] = useState(templateData?.crm_connection?.object_name || '');
  const [objects, setObjects] = useState([]);
  const [loadingObjects, setLoadingObjects] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState(() => {
    const conn = templateData?.crm_connection;
    if (conn?.provider === 'salesforce' && !conn?.connection_id) return 'disconnected';
    return conn?.status || 'disconnected';
  });
  const [error, setError] = useState(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastTestedAt, setLastTestedAt] = useState(null);

  // Backward compat: old templates with provider: "salesforce" but no connection_id
  const needsMigration = providerType === 'salesforce' && !selectedConnectionId;

  // Sync from props
  useEffect(() => {
    if (templateData?.crm_connection) {
      const conn = templateData.crm_connection;
      setProviderType(conn.provider || 'internal');
      setSelectedConnectionId(conn.connection_id || '');
      setSelectedObject(conn.object_name || '');
      // Only preserve connected status if we have a valid connection_id for salesforce
      if (conn.provider === 'salesforce' && !conn.connection_id) {
        setConnectionStatus('disconnected');
      } else if (conn.status) {
        setConnectionStatus(conn.status);
      }
    }
  }, [templateData?.id]);

  // Auto-switch to salesforce if DocFlow-only and currently set to internal
  useEffect(() => {
    if (isDocFlowOnly && providerType === 'internal') {
      setProviderType('salesforce');
    }
  }, [isDocFlowOnly]);

  // Fetch Salesforce connections from CRM Sync when switching to salesforce
  const fetchSfConnections = useCallback(async () => {
    setLoadingSfConnections(true);
    try {
      const data = await docflowService.getSalesforceConnections();
      setSfConnections(data.connections || []);
    } catch (err) {
      console.error('Failed to load Salesforce connections:', err);
      setSfConnections([]);
    } finally {
      setLoadingSfConnections(false);
    }
  }, []);

  useEffect(() => {
    setError(null);
    if (providerType === 'internal') {
      setConnectionStatus('connected');
      fetchInternalObjects();
    } else if (providerType === 'salesforce') {
      fetchSfConnections();
      if (!selectedConnectionId) {
        setConnectionStatus('disconnected');
      }
    }
  }, [providerType, fetchSfConnections]);

  const handleProviderTypeChange = (newType) => {
    setProviderType(newType);
    setSelectedConnectionId('');
    setSelectedObject('');
    setObjects([]);
    if (newType === 'internal') {
      setConnectionStatus('connected');
    } else {
      setConnectionStatus('disconnected');
    }
    setError(null);
  };

  const handleConnectionSelect = async (connId) => {
    setSelectedConnectionId(connId);
    setSelectedObject('');
    setObjects([]);
    setError(null);
    if (connId) {
      setConnectionStatus('disconnected');
      // Auto-test on selection
      await handleTestConnectionForId(connId);
    } else {
      setConnectionStatus('disconnected');
    }
  };

  const handleTestConnectionForId = async (connId) => {
    if (!connId) return;
    setTesting(true);
    setError(null);
    try {
      const result = await docflowService.testProviderConnection(connId);
      if (result.status === 'connected') {
        setConnectionStatus('connected');
        setLastTestedAt(new Date().toLocaleTimeString());
        toast.success('Salesforce connection verified');
        await fetchSalesforceObjects(connId);
      } else {
        setConnectionStatus('error');
        setError(result.message || 'Connection test failed');
        toast.error(result.message || 'Connection test failed');
      }
    } catch (err) {
      setConnectionStatus('error');
      setError(err.message || 'Connection test failed');
      toast.error('Connection test failed');
    } finally {
      setTesting(false);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setError(null);
    try {
      if (providerType === 'salesforce') {
        if (!selectedConnectionId) {
          setError('Please select a Salesforce connection first');
          toast.error('Please select a Salesforce connection first');
          setTesting(false);
          return;
        }
        await handleTestConnectionForId(selectedConnectionId);
        return;
      }
      // Internal CRM
      await docflowService.getCrmObjects();
      setConnectionStatus('connected');
      setLastTestedAt(new Date().toLocaleTimeString());
      toast.success('CRM connection verified');
      await fetchInternalObjects();
    } catch (err) {
      setConnectionStatus('error');
      setError(err.message || 'Connection test failed');
      toast.error('Connection test failed');
    } finally {
      setTesting(false);
    }
  };

  const handleSaveConnection = async () => {
    setSaving(true);
    setError(null);
    try {
      if (providerType === 'salesforce' && !selectedConnectionId) {
        setError('Please select a Salesforce connection');
        toast.error('Please select a Salesforce connection first');
        setSaving(false);
        return;
      }

      // Test first if not already connected
      if (providerType === 'salesforce' && connectionStatus !== 'connected') {
        const result = await docflowService.testProviderConnection(selectedConnectionId);
        if (result.status !== 'connected') {
          throw new Error(result.message || 'Connection test failed');
        }
        setConnectionStatus('connected');
      }

      // Save to parent — store connection_id
      if (onUpdate) {
        onUpdate({
          crm_connection: {
            provider: providerType,
            connection_id: providerType === 'salesforce' ? selectedConnectionId : null,
            object_name: selectedObject,
            status: 'connected'
          }
        });
      }
      toast.success('Connection saved');
    } catch (err) {
      setConnectionStatus('error');
      setError(err.message || 'Connection failed');
      toast.error('Failed to save — connection test failed');
    } finally {
      setSaving(false);
    }
  };

  const handleObjectChange = (newObject) => {
    setSelectedObject(newObject);
    if (onUpdate) {
      onUpdate({
        crm_connection: {
          provider: providerType,
          connection_id: providerType === 'salesforce' ? selectedConnectionId : null,
          object_name: newObject,
          status: connectionStatus
        }
      });
    }
  };

  const fetchSalesforceObjects = async (connId) => {
    const cid = connId || selectedConnectionId;
    if (!cid) return;
    setLoadingObjects(true);
    try {
      const data = await docflowService.getProviderObjects(cid);
      setObjects((data.objects || []).map(o => ({ ...o, source: 'salesforce' })));
    } catch (err) {
      setError('Failed to load Salesforce objects: ' + (err.message || ''));
      setObjects([]);
    } finally {
      setLoadingObjects(false);
    }
  };

  const fetchInternalObjects = async () => {
    setLoadingObjects(true);
    setError(null);
    try {
      const data = await docflowService.getCrmObjects();
      setObjects((data.objects || data || []).map(o => ({ ...o, source: 'crm' })));
      setConnectionStatus('connected');
    } catch (err) {
      setError('Failed to load CRM objects');
    } finally {
      setLoadingObjects(false);
    }
  };

  const isConnected = connectionStatus === 'connected';
  const providerLabel = providerType === 'salesforce' ? 'Salesforce' : 'Internal CRM';

  // Find selected connection info
  const selectedConn = sfConnections.find(c => c.id === selectedConnectionId);

  const objectOptions = objects.map(obj => ({
    label: `${obj.object_label || obj.object_name}${obj.source === 'schema_builder' ? ' (Custom)' : ''}`,
    value: obj.object_name || obj.value
  }));

  const statusBadge = (status) => {
    if (status === 'active' || status === 'validated') {
      return <span className="px-1.5 py-0.5 bg-green-100 text-green-700 text-[10px] font-semibold rounded-full">Active</span>;
    }
    if (status === 'draft') {
      return <span className="px-1.5 py-0.5 bg-yellow-100 text-yellow-700 text-[10px] font-semibold rounded-full">Draft</span>;
    }
    if (status === 'invalid') {
      return <span className="px-1.5 py-0.5 bg-red-100 text-red-600 text-[10px] font-semibold rounded-full">Invalid</span>;
    }
    return <span className="px-1.5 py-0.5 bg-gray-100 text-gray-500 text-[10px] font-semibold rounded-full">{status || 'Unknown'}</span>;
  };

  return (
    <div className="space-y-5" data-testid="connection-tab">
      {/* Provider Type Selection */}
      <div className="bg-white rounded-lg border border-gray-200 p-5">
        <h3 className="text-base font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <Cloud className="h-5 w-5 text-indigo-600" />
          {isDocFlowOnly ? 'Integration Provider' : 'CRM Provider'}
        </h3>
        <div className={`grid grid-cols-1 ${isDocFlowOnly ? '' : 'md:grid-cols-2'} gap-3`}>
          {/* Internal CRM — hidden for DocFlow-only tenants */}
          {!isDocFlowOnly && (
          <button
            data-testid="provider-internal"
            onClick={() => handleProviderTypeChange('internal')}
            className={`p-4 rounded-lg border-2 text-left transition-all ${
              providerType === 'internal'
                ? 'border-indigo-500 bg-indigo-50/50 shadow-sm'
                : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <Database className={`h-5 w-5 ${providerType === 'internal' ? 'text-indigo-600' : 'text-gray-400'}`} />
              {providerType === 'internal' && (
                <span className="px-2 py-0.5 bg-green-100 text-green-700 text-[10px] font-semibold rounded-full flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" /> Active
                </span>
              )}
            </div>
            <h4 className="font-semibold text-gray-900 text-sm">Internal CRM</h4>
            <p className="text-xs text-gray-500 mt-0.5">Use objects from this CRM</p>
          </button>
          )}

          {/* Salesforce */}
          <button
            data-testid="provider-salesforce"
            onClick={() => handleProviderTypeChange('salesforce')}
            className={`p-4 rounded-lg border-2 text-left transition-all ${
              providerType === 'salesforce'
                ? 'border-indigo-500 bg-indigo-50/50 shadow-sm'
                : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <Cloud className={`h-5 w-5 ${providerType === 'salesforce' ? 'text-indigo-600' : 'text-gray-400'}`} />
              {providerType === 'salesforce' && isConnected && selectedConnectionId && (
                <span className="px-2 py-0.5 bg-green-100 text-green-700 text-[10px] font-semibold rounded-full flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" /> Connected
                </span>
              )}
              {providerType === 'salesforce' && connectionStatus === 'error' && (
                <span className="px-2 py-0.5 bg-red-100 text-red-600 text-[10px] font-semibold rounded-full flex items-center gap-1">
                  <XCircle className="h-3 w-3" /> Error
                </span>
              )}
            </div>
            <h4 className="font-semibold text-gray-900 text-sm">Salesforce</h4>
            <p className="text-xs text-gray-500 mt-0.5">Connect via CRM Sync providers</p>
          </button>
        </div>
      </div>

      {/* Salesforce Connection Selector — only visible when Salesforce is selected */}
      {providerType === 'salesforce' && (
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <h3 className="text-base font-semibold text-gray-900 mb-1 flex items-center gap-2">
            <Cloud className="h-5 w-5 text-indigo-600" />
            Select Salesforce Connection
          </h3>
          <p className="text-xs text-gray-500 mb-3">
            Choose a Salesforce connection from CRM Sync. <a href="/setup/connections" target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline inline-flex items-center gap-0.5">Manage connections <ExternalLink className="h-3 w-3" /></a>
          </p>

          {/* Migration warning */}
          {needsMigration && (
            <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-medium text-amber-800">Please select a Salesforce connection</p>
                <p className="text-[11px] text-amber-600 mt-0.5">This template was using the legacy direct Salesforce connection. Please select a provider from CRM Sync to continue.</p>
              </div>
            </div>
          )}

          {loadingSfConnections ? (
            <div className="flex items-center gap-2 text-gray-500 py-3">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Loading Salesforce connections...</span>
            </div>
          ) : sfConnections.length === 0 ? (
            <div className="py-4 text-center bg-gray-50 rounded-lg border border-dashed border-gray-300">
              <Cloud className="h-8 w-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500 font-medium">No Salesforce connections found</p>
              <p className="text-xs text-gray-400 mt-1">
                Add a Salesforce connection in{' '}
                <a href="/setup/connections" className="text-indigo-600 hover:underline">CRM Sync</a> first.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {sfConnections.map(conn => {
                const isSelected = selectedConnectionId === conn.id;
                return (
                  <button
                    key={conn.id}
                    data-testid={`sf-connection-${conn.id}`}
                    onClick={() => handleConnectionSelect(conn.id)}
                    className={`w-full p-3 rounded-lg border-2 text-left transition-all flex items-center justify-between ${
                      isSelected
                        ? 'border-blue-500 bg-blue-50/50 shadow-sm'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Cloud className={`h-4 w-4 ${isSelected ? 'text-blue-600' : 'text-gray-400'}`} />
                      <div>
                        <p className={`text-sm font-medium ${isSelected ? 'text-blue-700' : 'text-gray-700'}`}>
                          {conn.name}
                        </p>
                        <p className="text-[11px] text-gray-400">{conn.provider_name || 'Salesforce'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {statusBadge(conn.status)}
                      {isSelected && <CheckCircle2 className="h-4 w-4 text-blue-600" />}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Connection Status + Actions */}
      <div className={`rounded-lg border p-4 ${
        isConnected ? 'bg-green-50 border-green-200' :
        connectionStatus === 'error' ? 'bg-red-50 border-red-200' :
        'bg-gray-50 border-gray-200'
      }`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {isConnected && <ShieldCheck className="h-5 w-5 text-green-600" />}
            {connectionStatus === 'error' && <AlertTriangle className="h-5 w-5 text-red-500" />}
            {!isConnected && connectionStatus !== 'error' && <Cloud className="h-5 w-5 text-gray-400" />}
            <div>
              <p className={`text-sm font-medium ${
                isConnected ? 'text-green-700' : connectionStatus === 'error' ? 'text-red-700' : 'text-gray-600'
              }`}>
                {isConnected
                  ? `${providerLabel} Connection Active${selectedConn ? ` — ${selectedConn.name}` : ''}`
                  : connectionStatus === 'error'
                    ? `${providerLabel} Connection Failed`
                    : providerType === 'salesforce' && !selectedConnectionId
                      ? 'Select a Salesforce connection above'
                      : `${providerLabel} Not Connected`
                }
              </p>
              {lastTestedAt && isConnected && (
                <p className="text-[10px] text-green-600 mt-0.5">Last tested: {lastTestedAt}</p>
              )}
              {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              data-testid="test-connection-btn"
              onClick={handleTestConnection}
              disabled={testing || (providerType === 'salesforce' && !selectedConnectionId)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 transition-colors disabled:opacity-50"
            >
              {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Test
            </button>
            <button
              data-testid="save-connection-btn"
              onClick={handleSaveConnection}
              disabled={saving || !isConnected || (providerType === 'salesforce' && !selectedConnectionId)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-indigo-600 text-white hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Save
            </button>
          </div>
        </div>
      </div>

      {/* Object Selection — disabled until connected, hidden for DocFlow-only internal */}
      {!(isDocFlowOnly && providerType === 'internal') && (
        <div className={`bg-white rounded-lg border border-gray-200 p-5 transition-opacity ${!isConnected ? 'opacity-50 pointer-events-none' : ''}`}>
          <h3 className="text-base font-semibold text-gray-900 mb-1 flex items-center gap-2">
            <Database className="h-5 w-5 text-indigo-600" />
            {providerType === 'salesforce' ? 'Salesforce Object' : 'CRM Object'}
          </h3>
          <p className="text-xs text-gray-500 mb-3">
            {providerType === 'salesforce'
              ? 'Select a Salesforce object to use for merge fields'
              : 'Select an internal CRM object to use for merge fields'
            }
          </p>

          {loadingObjects ? (
            <div className="flex items-center gap-2 text-gray-500 py-3">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Loading objects...</span>
            </div>
          ) : (
            <SearchableSelect
              data-testid="object-selector"
              options={objectOptions}
              value={selectedObject}
              onChange={handleObjectChange}
              placeholder={`Select ${providerType === 'salesforce' ? 'a Salesforce' : 'a CRM'} Object...`}
              disabled={!isConnected}
            />
          )}

          {selectedObject && (
            <div className="mt-3 flex items-center gap-2 text-xs text-gray-500 bg-gray-50 rounded-md px-3 py-2">
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                providerType === 'salesforce' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'
              }`}>
                {providerType === 'salesforce' ? 'Salesforce' : 'Internal CRM'}
              </span>
              <span>Merge fields: <code className="bg-gray-100 px-1 py-0.5 rounded font-mono">{`{{${selectedObject}.FieldName}}`}</code></span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ConnectionTab;
