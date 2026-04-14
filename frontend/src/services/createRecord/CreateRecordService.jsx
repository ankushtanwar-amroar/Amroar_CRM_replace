/**
 * CreateRecordService - Centralized service for creating records
 * 
 * Provides a unified way to open the full CreateRecordDialog from anywhere:
 * - Related Lists
 * - Activity Timeline
 * - Quick Links
 * - Header Actions
 * - Dashboard Quick Create
 * 
 * Features:
 * - Respects Record Type selection
 * - Loads correct Create Layout
 * - Supports field prefilling for relationships
 * - Auto-refreshes related lists after creation
 * - Emits events for UI refresh
 * 
 * NOTE: All objects now use the standard metadata-driven CreateRecordDialog.
 * No special form handling for work_order or service_appointment.
 */
import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import axios from 'axios';
import CreateRecordDialog from '../../components/records/CreateRecordDialog';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Event for notifying related lists to refresh
export const RECORD_CREATED_EVENT = 'record-created';

// Emit a custom event when a record is created
export const emitRecordCreated = (objectType, recordId, parentRecordId) => {
  const event = new CustomEvent(RECORD_CREATED_EVENT, {
    detail: { objectType, recordId, parentRecordId }
  });
  window.dispatchEvent(event);
  console.log('[CreateRecordService] Emitted record-created event:', { objectType, recordId, parentRecordId });
};

// Context for the CreateRecord service
const CreateRecordContext = createContext(null);

/**
 * Hook to use the CreateRecord service
 */
export const useCreateRecord = () => {
  const context = useContext(CreateRecordContext);
  if (!context) {
    console.warn('[useCreateRecord] Used outside of CreateRecordProvider');
    return {
      openCreateDialog: () => console.warn('CreateRecordProvider not found'),
      closeCreateDialog: () => {},
      isOpen: false,
    };
  }
  return context;
};

/**
 * Get relationship field name based on source and target objects
 * Maps parent object to the correct lookup field on the child object
 */
const getRelationshipField = (sourceObject, targetObject) => {
  const sourceNorm = sourceObject?.toLowerCase();
  const targetNorm = targetObject?.toLowerCase();
  
  // Common relationship mappings - use related_to_id for polymorphic relationships
  const mappings = {
    // From Account
    'account': {
      'contact': 'account_id',
      'opportunity': 'account_id',
      'task': 'related_to_id',
      'event': 'related_to_id',
      'emailmessage': 'related_to_id',
      'case': 'account_id',
    },
    // From Contact
    'contact': {
      'task': 'related_to_id',
      'event': 'related_to_id',
      'opportunity': 'contact_id',
      'emailmessage': 'related_to_id',
      'case': 'contact_id',
    },
    // From Lead - ALL related records use related_to_id
    'lead': {
      'contact': 'related_to_id',
      'task': 'related_to_id',
      'event': 'related_to_id',
      'emailmessage': 'related_to_id',
    },
    // From Opportunity
    'opportunity': {
      'task': 'related_to_id',
      'event': 'related_to_id',
      'contact': 'opportunity_id',
    },
    // From Case
    'case': {
      'task': 'related_to_id',
      'event': 'related_to_id',
      'emailmessage': 'related_to_id',
    },
    // From Prospect (custom object)
    'prospect': {
      'contact': 'related_to_id',
      'task': 'related_to_id',
      'event': 'related_to_id',
    },
  };
  
  // Try exact match
  if (mappings[sourceNorm]?.[targetNorm]) {
    return mappings[sourceNorm][targetNorm];
  }
  
  // Fallback: For activities and most related records, use related_to_id
  if (['task', 'event', 'emailmessage', 'call', 'contact'].includes(targetNorm)) {
    return 'related_to_id';
  }
  
  // For standard objects, try {source_object}_id
  return `${sourceNorm}_id`;
};

/**
 * CreateRecordProvider - Provides the CreateRecord service to the app
 */
export const CreateRecordProvider = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [targetObject, setTargetObject] = useState(null);
  const [prefilledValues, setPrefilledValues] = useState({});
  const [parentContext, setParentContext] = useState(null);
  const [onSuccessCallback, setOnSuccessCallback] = useState(null);
  const [objectSchema, setObjectSchema] = useState(null);
  const [loadingSchema, setLoadingSchema] = useState(false);

  /**
   * Open the Create Record dialog
   * 
   * @param {string} objectName - The object to create (e.g., 'contact', 'task')
   * @param {Object} options - Configuration options
   * @param {Object} options.prefilledValues - Values to prefill in the form
   * @param {string} options.parentRecordId - ID of the parent record
   * @param {string} options.sourceObject - Name of the source/parent object
   * @param {Function} options.onSuccess - Callback after successful creation
   */
  const openCreateDialog = useCallback(async (objectName, options = {}) => {
    const {
      prefilledValues: customPrefilled = {},
      parentRecordId = null,
      sourceObject = null,
      onSuccess = null,
    } = options;

    // Normalize object name - convert plural to singular
    // Handle common patterns: opportunities -> opportunity, contacts -> contact, etc.
    let normalizedObjectName = objectName?.toLowerCase();
    if (normalizedObjectName?.endsWith('ies')) {
      // opportunities -> opportunity
      normalizedObjectName = normalizedObjectName.slice(0, -3) + 'y';
    } else if (normalizedObjectName?.endsWith('s') && !normalizedObjectName?.endsWith('ss')) {
      // contacts -> contact, leads -> lead (but not 'address' -> 'addres')
      normalizedObjectName = normalizedObjectName.slice(0, -1);
    }
    
    console.log(`[CreateRecordService] Opening dialog for: ${normalizedObjectName} (original: ${objectName})`, {
      parentRecordId,
      sourceObject,
      customPrefilled,
    });

    // Calculate prefilled values based on parent context
    let finalPrefilled = { ...customPrefilled };
    
    if (parentRecordId && sourceObject) {
      const relationshipField = getRelationshipField(sourceObject, normalizedObjectName);
      console.log(`[CreateRecordService] Relationship mapping: ${sourceObject} -> ${normalizedObjectName} = ${relationshipField}`);
      finalPrefilled[relationshipField] = parentRecordId;
      
      // For polymorphic related_to_id field, also set the related_to_type
      // This ensures the created record properly links back to the parent
      if (relationshipField === 'related_to_id') {
        finalPrefilled['related_to_type'] = sourceObject.toLowerCase();
        finalPrefilled['related_to'] = parentRecordId; // Some components use 'related_to' as the field name
      }
      
      // For standard lookup fields, also set the related_to fields as backup
      // This ensures compatibility with different query patterns
      if (!finalPrefilled['related_to_id'] && relationshipField !== 'related_to_id') {
        finalPrefilled['related_to_id'] = parentRecordId;
        finalPrefilled['related_to_type'] = sourceObject.toLowerCase();
      }
    }

    // Set parent context
    setParentContext(parentRecordId && sourceObject ? { 
      objectName: sourceObject, 
      recordId: parentRecordId 
    } : null);

    // Store callback (wrapped to avoid stale closure)
    setOnSuccessCallback(() => onSuccess);
    setPrefilledValues(finalPrefilled);

    // Fetch object schema
    setLoadingSchema(true);
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        console.error(`[CreateRecordService] No auth token found`);
      }
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      
      console.log(`[CreateRecordService] Fetching schema from: ${API}/objects/${normalizedObjectName}`);
      const response = await axios.get(`${API}/objects/${normalizedObjectName}`, { headers });
      const schema = response.data;
      
      console.log(`[CreateRecordService] Schema fetched:`, {
        object_name: schema?.object_name,
        object_label: schema?.object_label,
        fieldCount: Object.keys(schema?.fields || {}).length,
        fields: Object.keys(schema?.fields || {}).slice(0, 5)
      });
      
      // Validate schema has fields
      if (!schema?.fields || Object.keys(schema.fields).length === 0) {
        console.warn(`[CreateRecordService] Schema has no fields for ${normalizedObjectName}`);
      }
      
      setObjectSchema(schema);
      setTargetObject(normalizedObjectName);
      setIsOpen(true);
    } catch (error) {
      console.error(`[CreateRecordService] Failed to fetch schema for ${normalizedObjectName}:`, error);
      console.error(`[CreateRecordService] Error details:`, error.response?.data);
      // Still try to open with minimal schema
      setObjectSchema({
        object_name: normalizedObjectName,
        object_label: normalizedObjectName.charAt(0).toUpperCase() + normalizedObjectName.slice(1),
        fields: {},
      });
      setTargetObject(normalizedObjectName);
      setIsOpen(true);
    } finally {
      setLoadingSchema(false);
    }
  }, []);

  /**
   * Close the dialog
   */
  const closeCreateDialog = useCallback(() => {
    setIsOpen(false);
    setTargetObject(null);
    setPrefilledValues({});
    setParentContext(null);
    setOnSuccessCallback(null);
    setObjectSchema(null);
  }, []);

  /**
   * Handle successful record creation
   * @param {Object} createdRecord - The newly created record from the API
   */
  const handleSuccess = useCallback((createdRecord) => {
    console.log('[CreateRecordService] Record created successfully:', createdRecord);
    
    // Emit event so related lists and quick links can refresh
    emitRecordCreated(
      targetObject,
      createdRecord?.id || createdRecord?.series_id,
      parentContext?.recordId
    );
    
    // Call the success callback if provided, passing the created record
    if (onSuccessCallback) {
      onSuccessCallback(createdRecord);
    }
    
    // Close the dialog
    closeCreateDialog();
  }, [onSuccessCallback, closeCreateDialog, targetObject, parentContext]);

  /**
   * Handle dialog open state change
   */
  const handleOpenChange = useCallback((newOpen) => {
    if (!newOpen) {
      closeCreateDialog();
    }
  }, [closeCreateDialog]);

  const value = {
    openCreateDialog,
    closeCreateDialog,
    isOpen,
    targetObject,
  };

  return (
    <CreateRecordContext.Provider value={value}>
      {children}
      
      {/* All objects use the standard metadata-driven CreateRecordDialog */}
      {isOpen && objectSchema && (
        <CreateRecordDialog
          object={objectSchema}
          onSuccess={handleSuccess}
          prefilledValues={prefilledValues}
          defaultOpen={true}
          onOpenChange={handleOpenChange}
          parentContext={parentContext}
          trigger={null} // No trigger, controlled externally
        />
      )}
    </CreateRecordContext.Provider>
  );
};

export default CreateRecordProvider;
