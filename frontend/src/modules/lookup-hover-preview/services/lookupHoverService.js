/**
 * Lookup Hover Preview Service
 * API calls for managing per-lookup-field hover preview configurations
 */

const API = process.env.REACT_APP_BACKEND_URL || '';

const getAuthHeader = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

/**
 * Get all lookup fields for an object with their hover preview status
 */
export const getLookupFieldsForObject = async (objectName) => {
  const response = await fetch(
    `${API}/api/lookup-hover-assignments/object/${objectName}/lookup-fields`,
    { headers: getAuthHeader() }
  );
  if (!response.ok) throw new Error('Failed to fetch lookup fields');
  return response.json();
};

/**
 * Get hover assignment for a specific lookup field
 */
export const getHoverAssignment = async (objectName, fieldName) => {
  const response = await fetch(
    `${API}/api/lookup-hover-assignments/object/${objectName}/field/${fieldName}`,
    { headers: getAuthHeader() }
  );
  if (!response.ok) throw new Error('Failed to fetch hover assignment');
  return response.json();
};

/**
 * Create or update hover assignment for a lookup field
 */
export const saveHoverAssignment = async (objectName, fieldName, data) => {
  const response = await fetch(
    `${API}/api/lookup-hover-assignments/object/${objectName}/field/${fieldName}`,
    {
      method: 'PUT',
      headers: {
        ...getAuthHeader(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    }
  );
  if (!response.ok) throw new Error('Failed to save hover assignment');
  return response.json();
};

/**
 * Delete hover assignment for a lookup field
 */
export const deleteHoverAssignment = async (objectName, fieldName) => {
  const response = await fetch(
    `${API}/api/lookup-hover-assignments/object/${objectName}/field/${fieldName}`,
    {
      method: 'DELETE',
      headers: getAuthHeader(),
    }
  );
  if (!response.ok && response.status !== 404) {
    throw new Error('Failed to delete hover assignment');
  }
  return response.ok;
};

/**
 * Get enabled lookup fields for an object (runtime use)
 * Returns only fields that have hover preview explicitly enabled
 */
export const getEnabledLookupFields = async (objectName) => {
  const response = await fetch(
    `${API}/api/lookup-hover-assignments/object/${objectName}/enabled-fields`,
    { headers: getAuthHeader() }
  );
  if (!response.ok) throw new Error('Failed to fetch enabled fields');
  return response.json();
};

/**
 * Check if hover is enabled for a specific lookup field
 * Returns false unless explicitly configured with enabled=true
 */
export const checkHoverEnabled = async (objectName, fieldName) => {
  const response = await fetch(
    `${API}/api/lookup-hover-assignments/check/${objectName}/${fieldName}`,
    { headers: getAuthHeader() }
  );
  if (!response.ok) return { enabled: false };
  return response.json();
};

/**
 * Get object metadata (fields) for the related object
 * Uses /api/objects endpoint which has all standard and custom objects
 */
export const getObjectMetadata = async (objectName) => {
  const response = await fetch(
    `${API}/api/objects`,
    { headers: getAuthHeader() }
  );
  if (!response.ok) throw new Error('Failed to fetch metadata');
  
  const objects = await response.json();
  const obj = objects.find(o => o.object_name?.toLowerCase() === objectName?.toLowerCase());
  
  if (!obj) {
    // Fallback: try schema builder metadata API
    const metaResponse = await fetch(
      `${API}/api/metadata/objects/${objectName}`,
      { headers: getAuthHeader() }
    );
    if (metaResponse.ok) {
      const metadata = await metaResponse.json();
      // Transform schema builder format to array format
      return {
        fields: Object.entries(metadata.fields || {}).map(([key, field]) => ({
          api_name: key,
          key: key,
          label: field.label || key,
          type: field.type || 'text',
          ...field
        }))
      };
    }
    return { fields: [] };
  }
  
  // Transform tenant_objects format to array format
  const fields = Object.entries(obj.fields || {}).map(([key, field]) => ({
    api_name: key,
    key: key,
    name: key,
    label: field.label || key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    type: field.type || 'text',
    ...field
  }));
  
  return { fields };
};

export default {
  getLookupFieldsForObject,
  getHoverAssignment,
  saveHoverAssignment,
  deleteHoverAssignment,
  getEnabledLookupFields,
  checkHoverEnabled,
  getObjectMetadata,
};
