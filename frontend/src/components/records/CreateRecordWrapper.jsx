/**
 * CreateRecordWrapper - Wrapper for CreateRecordDialog
 * 
 * All objects now use the standard metadata-driven CreateRecordDialog.
 * This maintains backward compatibility with existing components.
 * 
 * NOTE: Previously this component had special handling for work_order
 * and service_appointment objects. That special logic has been removed
 * to maintain consistent metadata-driven architecture across all objects.
 */
import React from 'react';
import CreateRecordDialog from './CreateRecordDialog';

const CreateRecordWrapper = ({
  object,
  onSuccess,
  prefilledValues = {},
  defaultOpen = false,
  onOpenChange,
  parentContext = null,
  trigger = null,
  // Legacy props (no longer used, kept for backward compatibility)
  parentCase = null,
  parentWorkOrder = null,
  parentAccount = null,
  parentContact = null,
}) => {
  // All objects use the standard metadata-driven CreateRecordDialog
  return (
    <CreateRecordDialog
      object={object}
      onSuccess={onSuccess}
      prefilledValues={prefilledValues}
      defaultOpen={defaultOpen}
      onOpenChange={onOpenChange}
      parentContext={parentContext}
      trigger={trigger}
    />
  );
};

export default CreateRecordWrapper;
