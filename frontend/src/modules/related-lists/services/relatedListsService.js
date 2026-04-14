/**
 * Related Lists Service - API calls for related lists configuration
 */

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

const getAuthHeader = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

/**
 * Fetch object metadata and fields
 */
export const fetchObjectFields = async (objectName) => {
  try {
    const response = await fetch(`${API_URL}/api/objects`, {
      headers: getAuthHeader()
    });
    
    if (!response.ok) {
      throw new Error('Failed to fetch objects');
    }
    
    const objects = await response.json();
    
    // Normalize object name - handle plural to singular conversion
    const normalizedName = objectName.toLowerCase();
    const singularName = normalizedName.endsWith('s') 
      ? normalizedName.slice(0, -1) 
      : normalizedName;
    
    // Try to find object by exact match first, then by singular form
    let targetObject = objects.find(
      obj => obj.object_name.toLowerCase() === normalizedName
    );
    
    if (!targetObject) {
      targetObject = objects.find(
        obj => obj.object_name.toLowerCase() === singularName
      );
    }
    
    if (!targetObject || !targetObject.fields) {
      console.warn(`Object "${objectName}" not found in API. Available: ${objects.map(o => o.object_name).join(', ')}`);
      return [];
    }
    
    // Convert fields object to array with metadata
    const fieldsArray = Object.entries(targetObject.fields).map(([key, config]) => ({
      apiName: key,
      label: config.label || key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
      type: config.type || 'text',
      isSortable: config.type !== 'textarea' && config.type !== 'richtext',
      isFilterable: config.type === 'picklist' || config.type === 'select' || config.type === 'boolean',
      required: config.required || false,
    }));
    
    return fieldsArray;
  } catch (err) {
    console.error('Error fetching object fields:', err);
    return [];
  }
};

/**
 * Fetch related records for an object
 */
export const fetchRelatedRecords = async (objectName, limit = 10) => {
  try {
    const response = await fetch(
      `${API_URL}/api/objects/${objectName}/records?limit=${limit}`,
      { headers: getAuthHeader() }
    );
    
    if (!response.ok) {
      throw new Error('Failed to fetch records');
    }
    
    const data = await response.json();
    return data.records || data || [];
  } catch (err) {
    console.error('Error fetching related records:', err);
    return [];
  }
};

/**
 * Get default columns for an object
 */
export const getDefaultColumns = (objectName) => {
  const defaults = {
    contact: ['name', 'email', 'phone'],
    contacts: ['name', 'email', 'phone'],
    account: ['name', 'industry', 'rating'],
    accounts: ['name', 'industry', 'rating'],
    opportunity: ['name', 'stage', 'amount'],
    opportunities: ['name', 'stage', 'amount'],
    event: ['subject', 'start_date', 'end_date'],
    events: ['subject', 'start_date', 'end_date'],
    task: ['subject', 'status', 'due_date'],
    tasks: ['subject', 'status', 'due_date'],
    lead: ['name', 'company', 'status'],
    leads: ['name', 'company', 'status'],
    invoice: ['invoice_number', 'amount', 'status'],
    invoices: ['invoice_number', 'amount', 'status'],
  };
  
  return defaults[objectName.toLowerCase()] || ['name'];
};

export default {
  fetchObjectFields,
  fetchRelatedRecords,
  getDefaultColumns,
};
