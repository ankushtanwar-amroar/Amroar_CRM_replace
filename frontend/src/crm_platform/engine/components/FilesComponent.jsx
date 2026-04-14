/**
 * FilesComponent - CRM Engine Component for Files Related List
 * 
 * This component is automatically rendered on ALL record pages.
 * It provides CRM-native file management functionality.
 */

import React from 'react';
import FilesRelatedListComponent from '../../../components/files/FilesRelatedListComponent';

/**
 * FilesComponent for Lightning Engine
 * Wraps FilesRelatedListComponent with engine context
 */
const FilesComponent = ({ context, config }) => {
  const { recordId, objectName } = context;
  
  if (!recordId || !objectName) {
    return null;
  }
  
  return (
    <FilesRelatedListComponent
      objectName={objectName}
      recordId={recordId}
      showHeader={config?.showHeader !== false}
      maxHeight={config?.maxHeight || '400px'}
    />
  );
};

export default FilesComponent;
