/**
 * AuditTrailComponent - Record Audit History Renderer
 * 
 * Layout-driven component that displays audit trail for a record.
 * Can be placed in any region of the Lightning Page layout.
 * 
 * Props from LayoutRenderer:
 * - config: Component configuration from layout builder
 * - context: Contains record, objectName, objectSchema
 */
import React from 'react';
import { AuditTimeline } from '../../../../features/audit-trail';

const AuditTrailComponent = ({
  config = {},
  context = {},
  // Legacy direct props (for ComponentRenderer compatibility)
  record: directRecord,
  objectName: directObjectName,
  objectSchema: directObjectSchema,
}) => {
  // Support both context-based props (LayoutRenderer) and direct props (ComponentRenderer)
  const record = context?.record || directRecord;
  const objectName = context?.objectName || directObjectName;
  const objectSchema = context?.objectSchema || directObjectSchema;
  
  if (!record || !objectName) {
    return null;
  }
  
  // Get record label for display
  const getRecordLabel = () => {
    const data = record?.data || {};
    return data.name || data.subject || data.title || 
           `${data.first_name || ''} ${data.last_name || ''}`.trim() || 
           'Record';
  };
  
  // Get object fields for settings modal
  const getObjectFields = () => {
    const fields = objectSchema?.fields;
    // Handle both array and object formats
    if (Array.isArray(fields)) {
      return fields.map(f => ({
        key: f.field_name || f.api_name || f.name,
        label: f.label || f.field_label || f.field_name
      }));
    } else if (fields && typeof fields === 'object') {
      // Convert object format to array
      return Object.entries(fields).map(([key, f]) => ({
        key: f?.field_name || f?.api_name || key,
        label: f?.label || f?.field_label || key
      }));
    }
    return [];
  };
  
  return (
    <AuditTimeline
      objectName={objectName}
      recordId={record.id}
      recordLabel={getRecordLabel()}
      objectFields={getObjectFields()}
      showHeader={config.show_header !== false}
      maxHeight={config.max_height || '500px'}
    />
  );
};

export default AuditTrailComponent;
