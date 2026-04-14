/**
 * useCrmFields - Custom hook for CRM object and field management
 * Extracted from FlowEditorPage.js
 */
import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const API = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';

/**
 * Default fields for standard CRM objects
 */
const DEFAULT_OBJECT_FIELDS = {
  'lead': [
    { name: 'first_name', label: 'First Name', is_required: true, type: 'text' },
    { name: 'last_name', label: 'Last Name', is_required: true, type: 'text' },
    { name: 'email', label: 'Email', is_required: true, type: 'email' },
    { name: 'company', label: 'Company', is_required: false, type: 'text' },
    { name: 'phone', label: 'Phone', is_required: false, type: 'phone' },
    { name: 'status', label: 'Status', is_required: true, type: 'select' },
    { name: 'title', label: 'Title', is_required: false, type: 'text' },
    { name: 'industry', label: 'Industry', is_required: false, type: 'text' },
    { name: 'rating', label: 'Rating', is_required: false, type: 'select' },
    { name: 'lead_source', label: 'Lead Source', is_required: false, type: 'select' },
    { name: 'description', label: 'Description', is_required: false, type: 'textarea' },
    { name: 'owner_id', label: 'Owner', is_required: false, type: 'lookup', related_object: 'User' },
    { name: 'converted_account_id', label: 'Converted Account', is_required: false, type: 'lookup', related_object: 'Account' },
    { name: 'converted_contact_id', label: 'Converted Contact', is_required: false, type: 'lookup', related_object: 'Contact' },
  ],
  'account': [
    { name: 'name', label: 'Name', is_required: true, type: 'text' },
    { name: 'industry', label: 'Industry', is_required: false, type: 'select' },
    { name: 'website', label: 'Website', is_required: false, type: 'text' },
    { name: 'phone', label: 'Phone', is_required: false, type: 'phone' },
    { name: 'type', label: 'Type', is_required: false, type: 'select' },
    { name: 'description', label: 'Description', is_required: false, type: 'textarea' },
    { name: 'annual_revenue', label: 'Annual Revenue', is_required: false, type: 'currency' },
    { name: 'employees', label: 'Number of Employees', is_required: false, type: 'number' },
    { name: 'rating', label: 'Account Rating', is_required: false, type: 'select' },
    { name: 'billing_address', label: 'Billing Address', is_required: false, type: 'text' },
    { name: 'owner_id', label: 'Owner', is_required: false, type: 'lookup', related_object: 'User' },
    { name: 'parent_id', label: 'Parent Account', is_required: false, type: 'lookup', related_object: 'Account' },
  ],
  'contact': [
    { name: 'first_name', label: 'First Name', is_required: true, type: 'text' },
    { name: 'last_name', label: 'Last Name', is_required: true, type: 'text' },
    { name: 'email', label: 'Email', is_required: true, type: 'email' },
    { name: 'phone', label: 'Phone', is_required: false, type: 'phone' },
    { name: 'account_id', label: 'Account', is_required: false, type: 'lookup', related_object: 'Account' },
    { name: 'title', label: 'Title', is_required: false, type: 'text' },
    { name: 'department', label: 'Department', is_required: false, type: 'text' },
    { name: 'mobile', label: 'Mobile', is_required: false, type: 'phone' },
    { name: 'description', label: 'Description', is_required: false, type: 'textarea' },
    { name: 'mailing_address', label: 'Mailing Address', is_required: false, type: 'text' },
    { name: 'owner_id', label: 'Owner', is_required: false, type: 'lookup', related_object: 'User' },
  ],
  'opportunity': [
    { name: 'name', label: 'Name', is_required: true, type: 'text' },
    { name: 'amount', label: 'Amount', is_required: true, type: 'currency' },
    { name: 'stage', label: 'Stage', is_required: true, type: 'select' },
    { name: 'close_date', label: 'Close Date', is_required: false, type: 'date' },
    { name: 'account_id', label: 'Account', is_required: false, type: 'lookup', related_object: 'Account' },
    { name: 'contact_id', label: 'Primary Contact', is_required: false, type: 'lookup', related_object: 'Contact' },
    { name: 'description', label: 'Description', is_required: false, type: 'textarea' },
    { name: 'type', label: 'Type', is_required: false, type: 'select' },
    { name: 'lead_source', label: 'Lead Source', is_required: false, type: 'select' },
    { name: 'probability', label: 'Probability (%)', is_required: false, type: 'number' },
    { name: 'next_step', label: 'Next Step', is_required: false, type: 'text' },
    { name: 'owner_id', label: 'Owner', is_required: false, type: 'lookup', related_object: 'User' },
  ],
  'task': [
    { name: 'subject', label: 'Subject', is_required: true },
    { name: 'status', label: 'Status', is_required: true },
    { name: 'priority', label: 'Priority', is_required: true },
    { name: 'due_date', label: 'Due Date', is_required: false },
    { name: 'assigned_to', label: 'Assigned To', is_required: false },
  ],
  'event': [
    { name: 'subject', label: 'Subject', is_required: true },
    { name: 'start_datetime', label: 'Start Date/Time', is_required: true },
    { name: 'end_datetime', label: 'End Date/Time', is_required: true },
    { name: 'event_type', label: 'Event Type', is_required: true },
    { name: 'location', label: 'Location', is_required: false },
  ],
  'invoice': [
    { name: 'invoice_number', label: 'Invoice Number', is_required: true },
    { name: 'customer_name', label: 'Customer Name', is_required: true },
    { name: 'amount', label: 'Amount', is_required: true },
    { name: 'due_date', label: 'Due Date', is_required: true },
    { name: 'status', label: 'Status', is_required: true },
    { name: 'description', label: 'Description', is_required: false },
  ],
  'test_object': [
    { name: 'name', label: 'Name', is_required: true },
    { name: 'description', label: 'Description', is_required: false },
  ],
  'case': [
    { name: 'subject', label: 'Subject', is_required: true },
    { name: 'status', label: 'Status', is_required: true },
    { name: 'priority', label: 'Priority', is_required: true },
    { name: 'description', label: 'Description', is_required: false },
    { name: 'contact_name', label: 'Contact Name', is_required: false },
  ],
  'campaign': [
    { name: 'name', label: 'Name', is_required: true },
    { name: 'type', label: 'Type', is_required: true },
    { name: 'status', label: 'Status', is_required: true },
    { name: 'start_date', label: 'Start Date', is_required: false },
    { name: 'budget', label: 'Budget', is_required: false },
  ],
  'user': [
    { name: 'id', label: 'User ID', is_required: true, type: 'text' },
    { name: 'email', label: 'Email', is_required: true, type: 'email' },
    { name: 'first_name', label: 'First Name', is_required: false, type: 'text' },
    { name: 'last_name', label: 'Last Name', is_required: false, type: 'text' },
    { name: 'full_name', label: 'Full Name', is_required: false, type: 'text' },
    { name: 'role', label: 'Role', is_required: false, type: 'text' },
    { name: 'title', label: 'Title', is_required: false, type: 'text' },
    { name: 'department', label: 'Department', is_required: false, type: 'text' },
    { name: 'phone', label: 'Phone', is_required: false, type: 'phone' },
    { name: 'manager_id', label: 'Manager', is_required: false, type: 'lookup', related_object: 'User' },
  ],
};

/**
 * Get default fields based on object type
 */
export const getDefaultFieldsForObject = (objectApiName) => {
  const normalizedName = objectApiName?.toLowerCase();
  const fields = DEFAULT_OBJECT_FIELDS[normalizedName] || [
    { name: 'name', label: 'Name', is_required: true },
    { name: 'status', label: 'Status', is_required: false },
  ];
  
  console.log(`getDefaultFieldsForObject(${objectApiName}) normalized to ${normalizedName}, returning ${fields.length} fields`);
  return fields;
};

/**
 * Hook to manage CRM objects and field fetching
 */
export const useCrmFields = () => {
  const [crmObjects, setCrmObjects] = useState([]);
  const [crmFieldsCache, setCrmFieldsCache] = useState({});

  /**
   * Fetch CRM objects from Object Manager (including custom objects)
   */
  useEffect(() => {
    const fetchCrmObjects = async () => {
      try {
        const tenantId = localStorage.getItem('tenant_id') || 'default_tenant';
        
        // 1. Fetch standard objects from console/objects endpoint
        const standardResponse = await axios.get(`${API}/api/console/objects?tenant_id=${tenantId}`);
        const standardObjects = standardResponse.data?.objects || [];
        
        // 2. Fetch custom objects from custom-objects endpoint
        let customObjects = [];
        try {
          const customResponse = await axios.get(`${API}/api/custom-objects?tenant_id=${tenantId}`);
          customObjects = customResponse.data || [];
        } catch (customErr) {
          console.log('No custom objects found or endpoint unavailable');
        }
        
        // 3. Combine and format all objects
        const allObjects = [
          ...standardObjects.map(obj => ({
            name: obj.api_name || obj.name,
            label: obj.label || obj.name,
            isStandard: true
          })),
          ...customObjects.map(obj => ({
            name: obj.api_name || obj.name,
            label: obj.label || obj.name,
            isStandard: false
          }))
        ];
        
        // 4. Remove duplicates by name
        const uniqueObjects = allObjects.filter((obj, index, self) =>
          index === self.findIndex((o) => o.name.toLowerCase() === obj.name.toLowerCase())
        );
        
        console.log('Loaded CRM objects:', uniqueObjects);
        setCrmObjects(uniqueObjects);
      } catch (error) {
        console.error('Error fetching CRM objects:', error);
        // Fallback to default objects
        setCrmObjects([
          { name: 'Lead', label: 'Lead', isStandard: true },
          { name: 'Contact', label: 'Contact', isStandard: true },
          { name: 'Account', label: 'Account', isStandard: true },
          { name: 'Opportunity', label: 'Opportunity', isStandard: true },
          { name: 'Task', label: 'Task', isStandard: true },
          { name: 'Event', label: 'Event', isStandard: true },
        ]);
      }
    };

    fetchCrmObjects();
  }, []);

  /**
   * Fetch fields for a specific CRM object
   */
  const fetchFieldsForObject = useCallback(async (objectApiName) => {
    // Check if fields are already cached
    if (crmFieldsCache[objectApiName]) {
      return crmFieldsCache[objectApiName];
    }

    try {
      console.log(`Fetching fields for object: ${objectApiName}`);
      const response = await axios.get(`${API}/api/objects/${objectApiName.toLowerCase()}`);
      
      console.log(`API Response for ${objectApiName}:`, response.data);
      
      if (response.data) {
        const fieldsData = response.data.fields;
        console.log(`[DEBUG] fieldsData type: ${typeof fieldsData}, isArray: ${Array.isArray(fieldsData)}, value:`, fieldsData);
        
        // Handle both array and object formats for fields
        let fieldsArray = [];
        if (Array.isArray(fieldsData)) {
          console.log('[DEBUG] fieldsData is Array');
          fieldsArray = fieldsData;
        } else if (fieldsData && typeof fieldsData === 'object' && !Array.isArray(fieldsData)) {
          // Convert object format to array format (exclude null)
          // API returns: { "field_name": { type, label, ... }, ... }
          console.log('[DEBUG] fieldsData is Object, converting to array');
          fieldsArray = Object.entries(fieldsData).map(([fieldName, fieldConfig]) => ({
            name: fieldName,
            api_name: fieldName,
            label: (fieldConfig && fieldConfig.label) || fieldName,
            type: (fieldConfig && fieldConfig.type) || 'text',
            is_required: (fieldConfig && fieldConfig.required) || false,
            related_object: (fieldConfig && fieldConfig.related_object) || null,
            options: (fieldConfig && fieldConfig.options) || null
          }));
          console.log(`[DEBUG] Converted to array with ${fieldsArray.length} items`);
        } else {
          console.log('[DEBUG] fieldsData is neither array nor valid object, using empty array');
          fieldsArray = [];
        }
        
        // Transform fields to dropdown format including is_required flag and related_object
        const transformedFields = (fieldsArray || []).map(field => ({
          name: field.api_name || field.name,
          label: field.label || field.name,
          is_required: field.is_required || field.required || false,
          type: field.type || 'Text',
          related_object: field.related_object || null
        }));
        
        console.log(`Transformed ${transformedFields.length} fields for ${objectApiName}`);
        
        // If no fields from API, use hardcoded defaults based on object type
        const fieldsToUse = transformedFields.length > 0 ? transformedFields : getDefaultFieldsForObject(objectApiName);
        
        console.log(`Using ${fieldsToUse.length} fields for ${objectApiName}`);
        
        // Cache the fields
        setCrmFieldsCache(prev => ({
          ...prev,
          [objectApiName]: fieldsToUse
        }));
        
        return fieldsToUse;
      }
    } catch (error) {
      console.error(`Error fetching fields for ${objectApiName}:`, error);
      // If API fails, return default fields
      const defaultFields = getDefaultFieldsForObject(objectApiName);
      console.log(`Using default ${defaultFields.length} fields for ${objectApiName} due to error`);
      return defaultFields;
    }
    
    // Fallback to default fields
    const defaultFields = getDefaultFieldsForObject(objectApiName);
    setCrmFieldsCache(prev => ({
      ...prev,
      [objectApiName]: defaultFields
    }));
    return defaultFields;
  }, [crmFieldsCache]);

  return {
    crmObjects,
    crmFieldsCache,
    fetchFieldsForObject,
    getDefaultFieldsForObject
  };
};

export default useCrmFields;
