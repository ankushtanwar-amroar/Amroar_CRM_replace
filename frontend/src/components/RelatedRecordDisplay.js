/**
 * Component for displaying related records with series_id
 * Now supports hover preview cards (Salesforce-style)
 */
import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRelatedRecord } from '../utils/useRelatedRecords';
import { getRelatedObjectType } from '../utils/relatedRecords';
import { HoverPreviewCard, useHoverPreview } from './HoverPreviewCard';

/**
 * Display a related record with format: Name (series_id)
 * Basic display without hover preview
 */
export const RelatedRecordDisplay = ({ 
  fieldName, 
  recordId, 
  objectType = null,
  className = "text-slate-700"
}) => {
 
  const { display, loading } = useRelatedRecord(fieldName, recordId, objectType);
  if (loading) {
    return <span className={`${className} opacity-50`}>Loading...</span>;
  }

  return <span className={className}>{display}</span>;
};

/**
 * Display a related record as a clickable link with hover preview
 */
export const RelatedRecordLink = ({ 
  fieldName, 
  recordId, 
  objectType = null,
  onClick,
  className = "text-indigo-600 hover:text-indigo-800 hover:underline cursor-pointer",
  enableHoverPreview = false
}) => {
  const { display, loading } = useRelatedRecord(fieldName, recordId, objectType);
  const { 
    showPreview, 
    previewData, 
    position, 
    handleMouseEnter, 
    handleMouseLeave, 
    closePreview 
  } = useHoverPreview(400);

  // Determine object type for preview
  const resolvedObjectType = objectType || getRelatedObjectType(fieldName, recordId);

  if (loading) {
    return <span className="text-slate-400">Loading...</span>;
  }

  if (!onClick && !enableHoverPreview) {
    return <span className={className}>{display}</span>;
  }

  return (
    <>
      <button
        onClick={onClick}
        onMouseEnter={enableHoverPreview ? (e) => handleMouseEnter(e, resolvedObjectType, recordId) : undefined}
        onMouseLeave={enableHoverPreview ? handleMouseLeave : undefined}
        className={className}
        type="button"
      >
        {display}
      </button>
      
      {/* Hover Preview Card */}
      {enableHoverPreview && showPreview && previewData && (
        <HoverPreviewCard
          objectType={previewData.objectType}
          recordId={previewData.recordId}
          position={position}
          onClose={closePreview}
        />
      )}
    </>
  );
};

/**
 * Display a related record with hover preview (no click handler required)
 */
export const RelatedRecordWithPreview = ({ 
  fieldName, 
  recordId, 
  objectType = null,
  onClick,
  className = "text-indigo-600 hover:text-indigo-800 cursor-pointer"
}) => {
  const navigate = useNavigate();
  const { display, loading } = useRelatedRecord(fieldName, recordId, objectType);
  const { 
    showPreview, 
    previewData, 
    position, 
    handleMouseEnter, 
    handleMouseLeave,
    handleCardMouseEnter,
    handleCardMouseLeave,
    closePreview 
  } = useHoverPreview(400);

  // Determine object type for preview
  const resolvedObjectType = objectType || getRelatedObjectType(fieldName, recordId);

  if (loading) {
    return <span className="text-slate-400 opacity-50">Loading...</span>;
  }

  const handleClick = () => {
    if (onClick) {
      onClick();
    } else if (recordId && resolvedObjectType) {
      // Navigate to record view
      navigate(`/crm/${resolvedObjectType}/${recordId}`);
    }
    closePreview();
  };

  const handleOpenRecord = (objType, seriesId, record) => {
    if (onClick) {
      // Use provided onClick callback
      onClick();
    } else {
      // Fallback: navigate to record view using CRM route
      navigate(`/crm/${objType}/${seriesId}`);
    }
    closePreview();
  };

  return (
    <>
      <span
        onClick={handleClick}
        onMouseEnter={(e) => handleMouseEnter(e, resolvedObjectType, recordId)}
        onMouseLeave={handleMouseLeave}
        className={`${className} inline-block`}
        role="button"
        tabIndex={0}
      >
        {display}
      </span>
      
      {/* Hover Preview Card */}
      {showPreview && previewData && (
        <HoverPreviewCard
          objectType={previewData.objectType}
          recordId={previewData.recordId}
          position={position}
          onClose={closePreview}
          onCardMouseEnter={handleCardMouseEnter}
          onCardMouseLeave={handleCardMouseLeave}
          onOpen={handleOpenRecord}
        />
      )}
    </>
  );
};

/**
 * Helper to check if a field is a related field
 */
export const isRelatedField = (fieldName) => {
  // Specific patterns for related fields - must be exact matches or end with _id
  const relatedFields = [
    'related_to',
    'lead_id',
    'contact_id',
    'account_id',
    'opportunity_id',
    'owner_id',
    'created_by',
    'modified_by',
    'assigned_to'
  ];
  
  // Check if it's in the list or ends with _id (but not lead_source, etc.)
  if (relatedFields.includes(fieldName)) {
    return true;
  }
  
  // Check if it ends with _id but exclude common non-related fields
  const nonRelatedIdFields = ['series_id', 'tenant_id', 'record_type_id'];
  if (fieldName.endsWith('_id') && !nonRelatedIdFields.includes(fieldName)) {
    return true;
  }
  
  return false;
};
