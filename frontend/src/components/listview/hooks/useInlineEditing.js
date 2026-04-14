/**
 * useInlineEditing Hook
 * Manages inline cell editing state for the table view
 */
import { useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import * as listViewApi from '../services/listViewApi';

export const useInlineEditing = (object, records, onUpdate) => {
  const [editingCells, setEditingCells] = useState({}); // { "recordId:::fieldKey": value }
  const [hoveredCell, setHoveredCell] = useState(null); // "recordId:::fieldKey"
  const [savingEdits, setSavingEdits] = useState(false);
  const [editErrors, setEditErrors] = useState({}); // { "recordId:::fieldKey": "error message" }

  // Check if there are pending edits
  const hasEdits = Object.keys(editingCells).length > 0;
  const editCount = Object.keys(editingCells).length;

  // Start editing a cell
  const startEditing = useCallback((recordId, fieldKey, currentValue) => {
    const cellKey = `${recordId}:::${fieldKey}`;
    setEditingCells(prev => ({
      ...prev,
      [cellKey]: currentValue || ''
    }));
    // Clear any previous error for this cell
    setEditErrors(prev => {
      const newErrors = { ...prev };
      delete newErrors[cellKey];
      return newErrors;
    });
  }, []);

  // Update editing value
  const updateEditingValue = useCallback((recordId, fieldKey, value) => {
    const cellKey = `${recordId}:::${fieldKey}`;
    setEditingCells(prev => ({
      ...prev,
      [cellKey]: value
    }));
  }, []);

  // Cancel all edits
  const cancelAllEdits = useCallback(() => {
    setEditingCells({});
    setEditErrors({});
  }, []);

  // Save all edits
  const saveAllEdits = useCallback(async () => {
    if (Object.keys(editingCells).length === 0) return;
    
    setSavingEdits(true);
    setEditErrors({});
    
    // Group edits by record
    // cellKey format is "recordId:::fieldKey" (using ::: as separator to avoid conflicts with UUIDs)
    const editsByRecord = {};
    Object.entries(editingCells).forEach(([cellKey, value]) => {
      const separatorIndex = cellKey.indexOf(':::');
      if (separatorIndex === -1) return;
      const recordId = cellKey.substring(0, separatorIndex);
      const fieldKey = cellKey.substring(separatorIndex + 3);
      if (!editsByRecord[recordId]) {
        editsByRecord[recordId] = {};
      }
      editsByRecord[recordId][fieldKey] = value;
    });
    
    const errors = {};
    let successCount = 0;
    
    // Save each record
    for (const [recordId, fieldUpdates] of Object.entries(editsByRecord)) {
      try {
        const record = records.find(r => r.id === recordId);
        if (!record) continue;
        
        const updatedData = {
          ...record.data,
          ...fieldUpdates
        };
        
        await listViewApi.updateRecord(object.object_name, recordId, updatedData);
        
        successCount++;
      } catch (error) {
        // Mark all cells for this record as having errors
        Object.keys(fieldUpdates).forEach(fieldKey => {
          errors[`${recordId}:::${fieldKey}`] = error.response?.data?.detail || 'Failed to save';
        });
      }
    }
    
    setSavingEdits(false);
    
    if (Object.keys(errors).length > 0) {
      setEditErrors(errors);
      toast.error(`Some edits failed to save. Please check highlighted cells.`);
    } else {
      setEditingCells({});
      toast.success(`${successCount} record${successCount > 1 ? 's' : ''} updated successfully`);
      if (onUpdate) {
        onUpdate();
      }
    }
  }, [editingCells, records, object?.object_name, onUpdate]);

  // Check if a specific cell is being edited
  const isCellEditing = useCallback((recordId, fieldKey) => {
    const cellKey = `${recordId}:::${fieldKey}`;
    return cellKey in editingCells;
  }, [editingCells]);

  // Get the current editing value for a cell
  const getEditingValue = useCallback((recordId, fieldKey) => {
    const cellKey = `${recordId}:::${fieldKey}`;
    return editingCells[cellKey];
  }, [editingCells]);

  // Check if a cell has an error
  const hasCellError = useCallback((recordId, fieldKey) => {
    const cellKey = `${recordId}:::${fieldKey}`;
    return cellKey in editErrors;
  }, [editErrors]);

  // Get error message for a cell
  const getCellError = useCallback((recordId, fieldKey) => {
    const cellKey = `${recordId}:::${fieldKey}`;
    return editErrors[cellKey];
  }, [editErrors]);

  return {
    // State
    editingCells,
    hoveredCell,
    savingEdits,
    editErrors,
    hasEdits,
    editCount,
    
    // Setters
    setHoveredCell,
    
    // Actions
    startEditing,
    updateEditingValue,
    cancelAllEdits,
    saveAllEdits,
    
    // Helpers
    isCellEditing,
    getEditingValue,
    hasCellError,
    getCellError,
  };
};

export default useInlineEditing;
