/**
 * Path Service - API calls for Path component
 */

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

const getAuthHeader = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

/**
 * Fetch object metadata including picklist fields
 */
export const fetchObjectPicklistFields = async (objectName) => {
  try {
    const response = await fetch(`${API_URL}/api/objects`, {
      headers: getAuthHeader()
    });
    
    if (!response.ok) {
      throw new Error('Failed to fetch objects');
    }
    
    const objects = await response.json();
    const targetObject = objects.find(
      obj => obj.object_name.toLowerCase() === objectName.toLowerCase()
    );
    
    if (!targetObject || !targetObject.fields) {
      return [];
    }
    
    // Filter to only picklist/select fields
    const picklistFields = Object.entries(targetObject.fields)
      .filter(([key, config]) => {
        const fieldType = (config.type || '').toLowerCase();
        return fieldType === 'picklist' || fieldType === 'select' || config.options;
      })
      .map(([key, config]) => ({
        apiName: key,
        label: config.label || key,
        options: config.options || [],
        type: config.type,
      }));
    
    return picklistFields;
  } catch (err) {
    console.error('Error fetching picklist fields:', err);
    return [];
  }
};

/**
 * Update a record's field value (for Mark Complete)
 */
export const updateRecordField = async (objectName, recordId, fieldName, value) => {
  try {
    // First fetch the current record
    const getResponse = await fetch(
      `${API_URL}/api/objects/${objectName}/records/${recordId}`,
      { headers: getAuthHeader() }
    );
    
    if (!getResponse.ok) {
      throw new Error('Failed to fetch record');
    }
    
    const record = await getResponse.json();
    const currentData = record.data || {};
    
    // Update the field value
    const updatedData = {
      ...currentData,
      [fieldName]: value,
    };
    
    // Save the updated record
    const response = await fetch(
      `${API_URL}/api/objects/${objectName}/records/${recordId}`,
      {
        method: 'PUT',
        headers: {
          ...getAuthHeader(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ data: updatedData }),
      }
    );
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || 'Failed to update record');
    }
    
    return await response.json();
  } catch (err) {
    console.error('Error updating record field:', err);
    throw err;
  }
};

/**
 * Get picklist field options
 */
export const getPicklistOptions = async (objectName, fieldName) => {
  const picklistFields = await fetchObjectPicklistFields(objectName);
  const field = picklistFields.find(f => f.apiName === fieldName);
  return field?.options || [];
};

export default {
  fetchObjectPicklistFields,
  updateRecordField,
  getPicklistOptions,
};
