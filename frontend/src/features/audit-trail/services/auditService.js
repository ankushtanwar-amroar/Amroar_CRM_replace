/**
 * Audit Trail Service
 * 
 * API client for the audit trail module.
 */

const API_BASE = process.env.REACT_APP_BACKEND_URL || '';

/**
 * Get auth headers
 */
const getHeaders = () => {
  const token = localStorage.getItem('token');
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };
};

/**
 * Fetch audit events with filtering
 */
export const getAuditEvents = async (params = {}) => {
  const queryParams = new URLSearchParams();
  
  if (params.target_object) queryParams.append('target_object', params.target_object);
  if (params.target_record_id) queryParams.append('target_record_id', params.target_record_id);
  if (params.operation) queryParams.append('operation', params.operation);
  if (params.change_source) queryParams.append('change_source', params.change_source);
  if (params.changed_by_user_id) queryParams.append('changed_by_user_id', params.changed_by_user_id);
  if (params.correlation_id) queryParams.append('correlation_id', params.correlation_id);
  if (params.field_search) queryParams.append('field_search', params.field_search);
  if (params.start_date) queryParams.append('start_date', params.start_date);
  if (params.end_date) queryParams.append('end_date', params.end_date);
  if (params.page) queryParams.append('page', params.page);
  if (params.page_size) queryParams.append('page_size', params.page_size);
  if (params.include_field_changes) queryParams.append('include_field_changes', 'true');
  
  const response = await fetch(`${API_BASE}/api/audit/events?${queryParams}`, {
    headers: getHeaders()
  });
  
  if (!response.ok) throw new Error('Failed to fetch audit events');
  return response.json();
};

/**
 * Get single audit event with field changes
 */
export const getAuditEvent = async (eventId) => {
  const response = await fetch(`${API_BASE}/api/audit/events/${eventId}`, {
    headers: getHeaders()
  });
  
  if (!response.ok) throw new Error('Failed to fetch audit event');
  return response.json();
};

/**
 * Get audit history for a specific record
 */
export const getRecordAuditHistory = async (objectName, recordId, limit = 50) => {
  const response = await fetch(
    `${API_BASE}/api/audit/record/${objectName}/${recordId}?limit=${limit}`,
    { headers: getHeaders() }
  );
  
  if (!response.ok) throw new Error('Failed to fetch record audit history');
  return response.json();
};

/**
 * Get audit configuration for an object
 */
export const getAuditConfig = async (objectName, createDefault = false) => {
  const response = await fetch(
    `${API_BASE}/api/audit/config/${objectName}?create_default=${createDefault}`,
    { headers: getHeaders() }
  );
  
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('Failed to fetch audit config');
  return response.json();
};

/**
 * Save audit configuration for an object
 */
export const saveAuditConfig = async (objectName, config) => {
  const response = await fetch(`${API_BASE}/api/audit/config/${objectName}`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(config)
  });
  
  if (!response.ok) throw new Error('Failed to save audit config');
  return response.json();
};

/**
 * List all audit configurations
 */
export const listAuditConfigs = async () => {
  const response = await fetch(`${API_BASE}/api/audit/configs`, {
    headers: getHeaders()
  });
  
  if (!response.ok) throw new Error('Failed to list audit configs');
  return response.json();
};

/**
 * Enable audit for an object
 */
export const enableAudit = async (objectName) => {
  const response = await fetch(`${API_BASE}/api/audit/config/${objectName}/enable`, {
    method: 'POST',
    headers: getHeaders()
  });
  
  if (!response.ok) throw new Error('Failed to enable audit');
  return response.json();
};

/**
 * Disable audit for an object
 */
export const disableAudit = async (objectName) => {
  const response = await fetch(`${API_BASE}/api/audit/config/${objectName}/disable`, {
    method: 'POST',
    headers: getHeaders()
  });
  
  if (!response.ok) throw new Error('Failed to disable audit');
  return response.json();
};

/**
 * Get available audit sources
 */
export const getAuditSources = async () => {
  const response = await fetch(`${API_BASE}/api/audit/sources`, {
    headers: getHeaders()
  });
  
  if (!response.ok) throw new Error('Failed to fetch audit sources');
  return response.json();
};

/**
 * Get available audit operations
 */
export const getAuditOperations = async () => {
  const response = await fetch(`${API_BASE}/api/audit/operations`, {
    headers: getHeaders()
  });
  
  if (!response.ok) throw new Error('Failed to fetch audit operations');
  return response.json();
};

/**
 * Get audit storage stats
 */
export const getAuditStats = async () => {
  const response = await fetch(`${API_BASE}/api/audit/stats`, {
    headers: getHeaders()
  });
  
  if (!response.ok) throw new Error('Failed to fetch audit stats');
  return response.json();
};

/**
 * Trigger audit cleanup
 */
export const triggerCleanup = async (objectName = null) => {
  const params = objectName ? `?target_object=${objectName}` : '';
  const response = await fetch(`${API_BASE}/api/audit/cleanup${params}`, {
    method: 'POST',
    headers: getHeaders()
  });
  
  if (!response.ok) throw new Error('Failed to trigger cleanup');
  return response.json();
};
