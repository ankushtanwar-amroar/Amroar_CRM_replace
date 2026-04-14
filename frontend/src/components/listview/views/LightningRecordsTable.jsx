/**
 * LightningRecordsTable - Salesforce-like Table view for records
 * 
 * Features:
 * - Checkbox column for bulk selection
 * - Concatenated "Name" column (first_name + last_name)
 * - No ID column visible
 * - Clickable name as primary link
 * - URL changes on record click (deep linking support)
 */
import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import toast from 'react-hot-toast';

// UI Components
import { Button } from '../../ui/button';
import { Badge } from '../../ui/badge';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Switch } from '../../ui/switch';
import { Checkbox } from '../../ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../../ui/dialog';

// Icons
import {
  ArrowUpDown,
  Eye,
  Save,
  Trash2,
  Settings,
  AlertCircle,
  Pencil,
  RotateCcw,
  Loader,
} from 'lucide-react';

// Import Record Dialogs
import EditRecordDialog from '../../records/EditRecordDialog';

// Import Related Record Display
import { RelatedRecordWithPreview, isRelatedField } from '../../RelatedRecordDisplay';

// Import Field Service Components
import { ScreenFlowRunnerModal } from '../../field-service';

// Hooks
import { useInlineEditing } from '../hooks/useInlineEditing';

// Utils
import { isFieldEditable, loadColumnsFromStorage, saveColumnsToStorage } from '../utils/listViewUtils';

// API
import * as listViewApi from '../services/listViewApi';

// ============================================
// SORTABLE HEADER COMPONENT - COMPACT with sticky positioning
// ============================================
const SortableHeader = ({ fieldKey, label, isCustom, onSort, sortBy, sortOrder }) => (
  <TableHead
    className="cursor-pointer hover:bg-slate-100 select-none px-3 py-2 font-medium text-slate-700 text-xs bg-slate-50 sticky top-0 z-10"
    onClick={() => onSort(fieldKey)}
  >
    <div className="flex items-center space-x-1">
      <span className="truncate">{label}</span>
      {isCustom && (
        <Badge variant="secondary" className="ml-1 text-[10px] px-1 py-0">Custom</Badge>
      )}
      <ArrowUpDown className="h-3 w-3 text-slate-400 flex-shrink-0" />
      {sortBy === fieldKey && (
        <span className="text-[10px] text-indigo-600 font-bold flex-shrink-0">
          {sortOrder === 'asc' ? '↑' : '↓'}
        </span>
      )}
    </div>
  </TableHead>
);

// ============================================
// HELPER: Get concatenated Name value
// ============================================
const getRecordDisplayName = (record, object) => {
  const data = record.data || {};
  
  // 1. ALWAYS respect the defined primary field (name_field) from Object Manager setup
  if (object?.name_field && data[object.name_field] !== undefined) {
    return data[object.name_field];
  }
  
  // 2. Check for first_name and last_name fields if no specific name_field
  if (!object?.name_field) {
    const hasFirstName = data.first_name !== undefined;
    const hasLastName = data.last_name !== undefined;
    if (hasFirstName || hasLastName) {
      const firstName = data.first_name || '';
      const lastName = data.last_name || '';
      const fullName = `${firstName} ${lastName}`.trim();
      if (fullName) return fullName;
    }
  }
  
  // 3. Fallbacks to standard object naming conventions
  if (data.account_name) return data.account_name;
  if (data.name) return data.name;
  if (data.subject) return data.subject;
  if (data.title) return data.title;
  
  // 4. Default to the very first configured field in the schema
  const firstField = object?.fields ? Object.keys(object.fields)[0] : null;
  if (firstField && data[firstField] !== undefined) {
    return data[firstField];
  }
  
  // Final fallback
  return `Record ${record.series_id || record.id?.slice(0, 8) || ''}`;
};

// ============================================
// HELPER: Filter out ID, first_name, last_name, and primary field from visible columns
// ============================================
const getFilteredFieldKeys = (fieldKeys, visibleColumns, primaryFieldKey) => {
  // Remove id, series_id, first_name, last_name, and the dynamic primary field from display
  // (Primary column will show the concatenated first+last or the primary field itself)
  const excludeFields = ['id', 'series_id', 'first_name', 'last_name'];
  if (primaryFieldKey) excludeFields.push(primaryFieldKey);
  
  return fieldKeys.filter(key => 
    visibleColumns.includes(key) && 
    !excludeFields.map(k => k?.toLowerCase()).includes(key.toLowerCase())
  );
};

const LightningRecordsTable = ({ 
  object, 
  records, 
  onUpdate, 
  onSort, 
  sortBy, 
  sortOrder, 
  getRecordName, 
  onRecordClick, 
  openRecordInTab, 
  openRelatedRecordInTab, 
  selectedView, 
  currentViewData,
  onSelectionChange  // Callback when selection changes (for List View Actions)
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  
  const [visibleColumns, setVisibleColumns] = useState([]);
  const [showColumnManager, setShowColumnManager] = useState(false);
  
  // Bulk selection state
  const [selectedRecords, setSelectedRecords] = useState(new Set());
  const [selectAll, setSelectAll] = useState(false);
  
  // Inline editing via hook
  const {
    editingCells,
    hoveredCell,
    savingEdits,
    editErrors,
    hasEdits,
    editCount,
    setHoveredCell,
    startEditing,
    updateEditingValue,
    cancelAllEdits,
    saveAllEdits,
    isCellEditing,
    getEditingValue,
    hasCellError,
    getCellError,
  } = useInlineEditing(object, records, onUpdate);

  // Determine if we're using view-specific columns or manage columns
  const isSystemViewSelected = selectedView === 'all_records' || selectedView === 'recently_viewed' || selectedView === 'my_records';
  const viewHasColumns = currentViewData?.columns && currentViewData.columns.length > 0;
  
  // Use view columns for user views with columns, otherwise use manage columns (localStorage)
  const useViewColumns = !isSystemViewSelected && viewHasColumns;

  useEffect(() => {
    if (useViewColumns) {
      // User view with specific columns - use view's column configuration
      setVisibleColumns(currentViewData.columns);
    } else {
      // System view or view without columns - load from localStorage (manage columns)
      setVisibleColumns(loadColumnsFromStorage(object.object_name, object));
    }
  }, [object, selectedView, currentViewData, useViewColumns]);

  // Handle bulk selection
  const handleSelectAll = (checked) => {
    setSelectAll(checked);
    const newSelected = checked ? new Set(records.map(r => r.id)) : new Set();
    setSelectedRecords(newSelected);
    // Notify parent of selection change
    if (onSelectionChange) {
      onSelectionChange(Array.from(newSelected));
    }
  };

  const handleSelectRecord = (recordId, checked) => {
    const newSelected = new Set(selectedRecords);
    if (checked) {
      newSelected.add(recordId);
    } else {
      newSelected.delete(recordId);
    }
    setSelectedRecords(newSelected);
    setSelectAll(newSelected.size === records.length);
    // Notify parent of selection change
    if (onSelectionChange) {
      onSelectionChange(Array.from(newSelected));
    }
  };

  // Handle record click with URL update (deep linking)
  const handleRecordClick = (record) => {
    // Call the provided onRecordClick for handling (including URL update if configured)
    if (onRecordClick) {
      onRecordClick(record);
    }
  };

  const handleDelete = async (recordId) => {
    if (!window.confirm('Are you sure you want to delete this record?')) return;

    try {
      await listViewApi.deleteRecord(object.object_name, recordId);
      toast.success('Record deleted successfully');
      // Remove from selection
      const newSelected = new Set(selectedRecords);
      newSelected.delete(recordId);
      setSelectedRecords(newSelected);
      onUpdate();
    } catch (error) {
      toast.error('Failed to delete record');
    }
  };

  const handleColumnToggle = (fieldKey) => {
    // Only allow column toggle for system views or views without specific columns (manage columns mode)
    if (useViewColumns) {
      toast('Column selection is locked for this list view', { icon: 'ℹ️' });
      return;
    }
    
    const newColumns = visibleColumns.includes(fieldKey)
      ? visibleColumns.filter(k => k !== fieldKey)
      : [...visibleColumns, fieldKey];

    setVisibleColumns(newColumns);
    saveColumnsToStorage(object.object_name, newColumns);
  };

  // Render editable cell content
  const renderEditableCell = (record, fieldKey) => {
    const cellKey = `${record.id}:::${fieldKey}`;
    const isEditing = isCellEditing(record.id, fieldKey);
    const isHovered = hoveredCell === cellKey;
    const hasError = hasCellError(record.id, fieldKey);
    const field = object.fields[fieldKey];
    const fieldValue = record.data[fieldKey];
    const isEditable = isFieldEditable(fieldKey, field);
    const isRelated = isRelatedField(fieldKey);
    const uuidPattern = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
    const isUUID = uuidPattern.test(fieldValue);

    // If editing this cell, show input
    if (isEditing) {
      const editValue = getEditingValue(record.id, fieldKey);
      return (
        <div className="flex flex-col">
          <div className={`flex items-center ${hasError ? 'ring-2 ring-red-500 rounded' : ''}`}>
            {field?.type === 'picklist' || field?.type === 'select' ? (
              <Select 
                value={editValue || ''} 
                onValueChange={(value) => updateEditingValue(record.id, fieldKey, value)}
              >
                <SelectTrigger className="h-8 w-full text-sm">
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                  {(field.options || []).map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : field?.type === 'checkbox' || field?.type === 'boolean' ? (
              <div className="flex items-center space-x-2">
                <Switch
                  checked={editValue === true || editValue === 'true'}
                  onCheckedChange={(checked) => updateEditingValue(record.id, fieldKey, checked)}
                />
                <span className="text-sm">{editValue ? 'Yes' : 'No'}</span>
              </div>
            ) : field?.type === 'date' ? (
              <Input
                type="date"
                value={editValue || ''}
                onChange={(e) => updateEditingValue(record.id, fieldKey, e.target.value)}
                className="h-8 text-sm"
                autoFocus
              />
            ) : field?.type === 'number' || field?.type === 'currency' ? (
              <Input
                type="number"
                value={editValue || ''}
                onChange={(e) => updateEditingValue(record.id, fieldKey, e.target.value)}
                className="h-8 text-sm"
                autoFocus
              />
            ) : (
              <Input
                type="text"
                value={editValue || ''}
                onChange={(e) => updateEditingValue(record.id, fieldKey, e.target.value)}
                className="h-8 text-sm"
                autoFocus
              />
            )}
          </div>
          {hasError && (
            <p className="text-xs text-red-500 mt-1">{getCellError(record.id, fieldKey)}</p>
          )}
        </div>
      );
    }

    // Read-only display with hover edit icon
    return (
      <div 
        className="flex items-center group"
        onMouseEnter={() => setHoveredCell(cellKey)}
        onMouseLeave={() => setHoveredCell(null)}
      >
        <span className="text-sm truncate max-w-[200px]">
          {isRelated && isUUID ? (
            <RelatedRecordWithPreview
              fieldKey={fieldKey}
              relatedId={fieldValue}
              onClick={() => {
                // Determine the related object type
                let relatedObjectType = fieldKey.replace('_id', '').replace('related_', '');
                if (fieldKey === 'related_to') {
                  relatedObjectType = record.data?.related_type || 'lead';
                }
                openRelatedRecordInTab(relatedObjectType, fieldValue);
              }}
            />
          ) : field?.type === 'checkbox' || field?.type === 'boolean' ? (
            fieldValue ? '✓ Yes' : '✗ No'
          ) : field?.type === 'currency' ? (
            fieldValue ? `$${Number(fieldValue).toLocaleString()}` : '-'
          ) : (
            fieldValue || '-'
          )}
        </span>
        {isEditable && isHovered && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 ml-2 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={(e) => {
              e.stopPropagation();
              startEditing(record.id, fieldKey, fieldValue);
            }}
          >
            <Pencil className="h-3 w-3 text-slate-400 hover:text-indigo-600" />
          </Button>
        )}
      </div>
    );
  };

  // Get all available fields and filter out ID/name components
  const allFieldKeys = Object.keys(object.fields);
  
  // Determine primary/display field from object configuration dynamically
  const primaryFieldKey = object.name_field || 
                          (object.fields.name ? 'name' : 
                           object.fields.account_name ? 'account_name' : 
                           object.fields.subject ? 'subject' : 
                           object.fields.title ? 'title' : 
                           (object.fields.first_name ? 'first_name' : 
                           allFieldKeys[0]));
                           
  const primaryField = object.fields[primaryFieldKey];
  const primaryFieldLabel = primaryField?.label || 'Name';

  const fieldKeys = getFilteredFieldKeys(allFieldKeys, visibleColumns, primaryFieldKey);

  return (
    <div className="overflow-auto relative">
      {/* Column Manager Button and Bulk Actions Bar - Compact */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b bg-slate-50">
        <div className="flex items-center gap-3 text-xs text-slate-500">
          {selectedRecords.size > 0 && (
            <span className="text-indigo-600 font-medium">
              {selectedRecords.size} record{selectedRecords.size > 1 ? 's' : ''} selected
            </span>
          )}
          {hasEdits && (
            <span className="text-amber-600 font-medium">
              {editCount} unsaved edit{editCount > 1 ? 's' : ''}
            </span>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowColumnManager(true)}
          className="h-6 px-2 text-xs"
        >
          <Settings className="h-3 w-3 mr-1" />
          Columns
        </Button>
      </div>

      <Table>
        <TableHeader className="bg-slate-50 border-b sticky top-0 z-10">
          <TableRow>
            {/* Checkbox column - first */}
            <TableHead className="w-10 px-3 py-2 bg-slate-50 sticky top-0 z-10">
              <Checkbox
                checked={selectAll}
                onCheckedChange={handleSelectAll}
                aria-label="Select all records"
              />
            </TableHead>
            
            {/* Primary/Name column - always second */}
            {primaryFieldKey && (
              <SortableHeader
                fieldKey={primaryFieldKey}
                label={primaryFieldLabel}
                isCustom={primaryField?.is_custom || false}
                onSort={onSort}
                sortBy={sortBy}
                sortOrder={sortOrder}
              />
            )}
            
            {/* Dynamic columns (excluding ID, first_name, last_name) */}
            {fieldKeys.map((fieldKey) => (
              <SortableHeader
                key={fieldKey}
                fieldKey={fieldKey}
                label={object.fields[fieldKey]?.label || fieldKey}
                isCustom={object.fields[fieldKey]?.is_custom || false}
                onSort={onSort}
                sortBy={sortBy}
                sortOrder={sortOrder}
              />
            ))}
            
            {/* Created column - only show if created_at is in visibleColumns */}
            {visibleColumns.includes('created_at') && (
              <SortableHeader 
                fieldKey="created_at" 
                label="Created" 
                isCustom={false}
                onSort={onSort}
                sortBy={sortBy}
                sortOrder={sortOrder}
              />
            )}
            
            {/* Actions column - always last */}
            <TableHead className="px-3 py-2 font-medium text-slate-700 text-xs bg-slate-50 sticky top-0 z-10">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {records.map((record) => (
            <TableRow 
              key={record.id} 
              className={`hover:bg-slate-50 border-b border-slate-100 cursor-pointer ${
                selectedRecords.has(record.id) ? 'bg-indigo-50' : ''
              }`}
            >
              {/* Checkbox cell */}
              <TableCell className="w-10 px-3 py-1.5" onClick={(e) => e.stopPropagation()}>
                <Checkbox
                  checked={selectedRecords.has(record.id)}
                  onCheckedChange={(checked) => handleSelectRecord(record.id, checked)}
                  aria-label={`Select record ${record.id}`}
                />
              </TableCell>
              
              {/* Primary Name cell - clickable primary link */}
              {primaryFieldKey && (
                <TableCell className="px-3 py-1.5">
                  <Button
                    variant="link"
                    className="p-0 h-auto font-semibold text-indigo-600 hover:text-indigo-800 hover:underline text-left text-sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRecordClick(record);
                    }}
                    data-testid={`record-name-${record.id}`}
                  >
                    {getRecordDisplayName(record, object)}
                  </Button>
                </TableCell>
              )}
              
              {/* Dynamic field cells */}
              {fieldKeys.map((fieldKey) => (
                <TableCell key={fieldKey} className="px-3 py-1.5 text-slate-700 text-sm">
                  {renderEditableCell(record, fieldKey)}
                </TableCell>
              ))}
              
              {/* Created cell - COMPACT */}
              {visibleColumns.includes('created_at') && (
                <TableCell className="px-3 py-1.5 text-slate-500 text-xs">
                  {new Date(record.created_at).toLocaleDateString()}
                </TableCell>
              )}
              
              {/* Actions cell */}
              <TableCell className="px-3 py-1.5" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center space-x-0.5">
                  {/* Assign Technician via Flow - Only for Service Appointments */}
                  {object.object_name === 'service_appointment' && (
                    <ScreenFlowRunnerModal
                      flowName="Assign_Technician_Flow"
                      inputVariables={{ appointmentId: record.id }}
                      variant="icon"
                      onSuccess={onUpdate}
                      triggerLabel="Assign Technician"
                    />
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRecordClick(record)}
                    data-testid={`view-record-${record.id}`}
                    className="h-6 w-6 p-0 text-slate-500 hover:text-indigo-600"
                    title="View Record"
                  >
                    <Eye className="h-3.5 w-3.5" />
                  </Button>
                  {/* Edit icon hidden as per requirement */}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(record.id)}
                    data-testid={`delete-record-${record.id}`}
                    className="h-6 w-6 p-0 text-slate-500 hover:text-red-600"
                    title="Delete Record"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* Sticky Save/Cancel Bar - COMPACT */}
      {hasEdits && (
        <div className="sticky bottom-0 left-0 right-0 bg-white border-t border-slate-200 shadow-lg px-3 py-2 flex items-center justify-between z-10">
          <div className="flex items-center space-x-2 text-xs text-slate-600">
            <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
            <span>You have unsaved changes</span>
          </div>
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={cancelAllEdits}
              disabled={savingEdits}
              className="h-9"
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={saveAllEdits}
              disabled={savingEdits}
              className="h-9 bg-indigo-600 hover:bg-indigo-700"
            >
              {savingEdits ? (
                <>
                  <Loader className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Save Changes
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Column Manager Dialog */}
      <Dialog open={showColumnManager} onOpenChange={setShowColumnManager}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Manage Columns</DialogTitle>
            <DialogDescription>
              {useViewColumns 
                ? `Columns are defined by the "${currentViewData?.name}" list view. Switch to "All Records" to customize columns.`
                : 'Show or hide columns in the table view. ID and Name components are managed automatically.'}
            </DialogDescription>
          </DialogHeader>
          {useViewColumns ? (
            <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
              <p className="text-sm text-blue-700">
                This list view has specific columns configured. The columns shown are:
              </p>
              <ul className="mt-2 space-y-1">
                {visibleColumns.map(col => (
                  <li key={col} className="text-sm text-blue-600 flex items-center">
                    <span className="w-2 h-2 bg-blue-500 rounded-full mr-2"></span>
                    {object.fields[col]?.label || col}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {allFieldKeys
                .filter(key => !['id', 'series_id'].includes(key.toLowerCase()))
                .map((fieldKey) => {
                  const field = object.fields[fieldKey];
                  // Mark the dynamic primary field and composite name components as auto-included
                  const isPrimaryField = fieldKey.toLowerCase() === primaryFieldKey?.toLowerCase();
                  const isNameComponent = ['first_name', 'last_name'].includes(fieldKey.toLowerCase()) || isPrimaryField;
                  
                  return (
                    <div key={fieldKey} className="flex items-center justify-between p-2 hover:bg-slate-50 rounded">
                      <div className="flex items-center space-x-2">
                        <Switch
                          id={`col-${fieldKey}`}
                          checked={isNameComponent || visibleColumns.includes(fieldKey)}
                          onCheckedChange={() => !isNameComponent && handleColumnToggle(fieldKey)}
                          disabled={isNameComponent}
                        />
                        <Label htmlFor={`col-${fieldKey}`} className={`cursor-pointer flex items-center ${isNameComponent ? 'text-slate-400' : ''}`}>
                          {field.label}
                          {field.is_custom && (
                            <Badge variant="secondary" className="ml-2 text-xs">Custom</Badge>
                          )}
                          {isNameComponent && (
                            <Badge variant="outline" className="ml-2 text-xs">
                              {isPrimaryField ? 'Primary' : 'In Primary'}
                            </Badge>
                          )}
                        </Label>
                      </div>
                      <Badge variant="outline" className="text-xs">{field.type}</Badge>
                    </div>
                  );
                })}
            </div>
          )}
          <div className="flex items-center justify-between pt-4 border-t">
            {!useViewColumns && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const allKeys = Object.keys(object.fields).filter(k => !['id', 'series_id'].includes(k.toLowerCase()));
                  setVisibleColumns(allKeys);
                  saveColumnsToStorage(object.object_name, allKeys);
                  toast.success('All columns shown');
                }}
              >
                Show All
              </Button>
            )}
            <Button
              onClick={() => setShowColumnManager(false)}
            >
              Done
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default LightningRecordsTable;
