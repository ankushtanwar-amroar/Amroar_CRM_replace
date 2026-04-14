import React, { useState, useMemo, useEffect } from 'react';
import { Table as TableIcon, ChevronLeft, ChevronRight, Search, ChevronsLeft, ChevronsRight, Edit2, Check, X, Loader2, AlertCircle } from 'lucide-react';
import { Input } from '../../../components/ui/input';
import { Button } from '../../../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';

const API_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';

const DataTableRuntime = ({ 
  field, 
  executionContext = {}, 
  onValueChange,
  validationError 
}) => {
  const [selectedRows, setSelectedRows] = useState(field.selectionMode === 'multi' ? [] : null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [currentPage, setCurrentPage] = useState(1);
  
  // Inline editing state
  const [editedRows, setEditedRows] = useState({});
  const [editingCell, setEditingCell] = useState(null); // { rowId, field }
  const [cellErrors, setCellErrors] = useState({}); // { "rowId_field": "error message" }
  
  // NEW: Inline query state
  const [inlineQueryData, setInlineQueryData] = useState([]);
  const [inlineQueryLoading, setInlineQueryLoading] = useState(false);
  const [inlineQueryError, setInlineQueryError] = useState(null);
  
  // Determine data source mode
  const dataSourceMode = field.dataSourceMode || 'getRecords';
  
  // NEW: Execute inline query when component mounts
  useEffect(() => {
    const executeInlineQuery = async () => {
      if (dataSourceMode !== 'inlineQuery' || !field.inlineQuery?.object) {
        return;
      }
      
      setInlineQueryLoading(true);
      setInlineQueryError(null);
      
      try {
        const token = localStorage.getItem('token');
        const { object, filters = [], limit = 10, sortField, sortOrder = 'asc' } = field.inlineQuery;
        
        // Build query parameters
        const queryParams = new URLSearchParams();
        queryParams.append('limit', Math.min(limit, 50)); // Enforce max limit
        
        if (sortField && sortField !== '_none') {
          queryParams.append('sort_by', sortField);
          queryParams.append('sort_order', sortOrder);
        }
        
        // Build filter conditions
        const filterConditions = [];
        filters.forEach((filter, index) => {
          if (filter.field && filter.operator) {
            filterConditions.push({
              field: filter.field,
              operator: filter.operator,
              value: filter.value || '',
              logic: index > 0 ? (filter.logic || 'AND') : null
            });
          }
        });
        
        if (filterConditions.length > 0) {
          queryParams.append('filters', JSON.stringify(filterConditions));
        }
        
        // Execute query
        const response = await fetch(`${API_URL}/api/crm/${object.toLowerCase()}?${queryParams.toString()}`, {
          headers: { 
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });
        
        if (!response.ok) {
          throw new Error(`Failed to fetch ${object} records: ${response.statusText}`);
        }
        
        const data = await response.json();
        const records = data.data || data.records || data || [];
        
        console.log(`[DataTable] Inline query fetched ${records.length} ${object} records`);
        setInlineQueryData(Array.isArray(records) ? records : []);
      } catch (error) {
        console.error('[DataTable] Inline query error:', error);
        setInlineQueryError(formatErrorMessage(error));
        setInlineQueryData([]);
      } finally {
        setInlineQueryLoading(false);
      }
    };
    
    executeInlineQuery();
  }, [field.inlineQuery, dataSourceMode]);
  
  // NEW: Format error messages to be user-friendly
  const formatErrorMessage = (error) => {
    const errorStr = error.message || String(error);
    
    // Map common errors to user-friendly messages
    if (errorStr.includes('404')) {
      return {
        title: 'Data not found',
        message: 'The requested records could not be found.',
        action: 'Check if the object exists and you have access to it.'
      };
    }
    if (errorStr.includes('401') || errorStr.includes('403')) {
      return {
        title: 'Access denied',
        message: 'You do not have permission to access these records.',
        action: 'Contact your administrator to request access.'
      };
    }
    if (errorStr.includes('500')) {
      return {
        title: 'Server error',
        message: 'An unexpected error occurred while fetching data.',
        action: 'Please try again. If the problem persists, contact support.'
      };
    }
    if (errorStr.includes('Network') || errorStr.includes('fetch')) {
      return {
        title: 'Connection error',
        message: 'Unable to connect to the server.',
        action: 'Check your internet connection and try again.'
      };
    }
    
    return {
      title: 'Error loading data',
      message: errorStr,
      action: 'Please check your configuration and try again.'
    };
  };
  
  // Get data from execution context based on data source
  const rawData = useMemo(() => {
    // NEW: Use inline query data if in inline query mode
    if (dataSourceMode === 'inlineQuery') {
      return inlineQueryData;
    }
    
    // Original logic for Get Records node
    if (!field.dataSource || !field.dataSource.nodeId) {
      return [];
    }
    
    // Get data from the referenced Get Records node output
    const nodeOutput = executionContext[`node_${field.dataSource.nodeId}_output`];
    if (Array.isArray(nodeOutput)) {
      return nodeOutput;
    }
    
    // Also check for records key
    if (nodeOutput && Array.isArray(nodeOutput.records)) {
      return nodeOutput.records;
    }
    
    return [];
  }, [field.dataSource, executionContext, dataSourceMode, inlineQueryData]);
  
  // Filter data based on search
  const filteredData = useMemo(() => {
    if (!field.search || !searchQuery) {
      return rawData;
    }
    
    const query = searchQuery.toLowerCase();
    return rawData.filter(row => {
      return (field.columns || []).some(col => {
        const value = row[col.field];
        return value && String(value).toLowerCase().includes(query);
      });
    });
  }, [rawData, searchQuery, field.search, field.columns]);
  
  // Sort data
  const sortedData = useMemo(() => {
    if (!sortConfig.key || !field.sorting) {
      return filteredData;
    }
    
    const sorted = [...filteredData].sort((a, b) => {
      const aVal = a[sortConfig.key];
      const bVal = b[sortConfig.key];
      
      if (aVal === bVal) return 0;
      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;
      
      if (sortConfig.direction === 'asc') {
        return aVal > bVal ? 1 : -1;
      } else {
        return aVal < bVal ? 1 : -1;
      }
    });
    
    return sorted;
  }, [filteredData, sortConfig, field.sorting]);
  
  // Paginate data
  const pageSize = field.pageSize || 10;
  const totalPages = Math.ceil(sortedData.length / pageSize);
  const paginatedData = useMemo(() => {
    if (!field.pagination) {
      return sortedData;
    }
    
    const startIndex = (currentPage - 1) * pageSize;
    return sortedData.slice(startIndex, startIndex + pageSize);
  }, [sortedData, currentPage, pageSize, field.pagination]);
  
  // Helper: Get effective cell value (edited or original)
  const getCellValue = (row, fieldName) => {
    const rowId = row.id || row._id;
    if (editedRows[rowId] && editedRows[rowId].hasOwnProperty(fieldName)) {
      return editedRows[rowId][fieldName];
    }
    return row[fieldName];
  };
  
  // Helper: Check if row is locked (read-only by condition)
  const isRowLocked = (row) => {
    if (!field.rowLockCondition || field.tableMode !== 'inlineEditable') {
      return false;
    }
    
    try {
      // Simple formula evaluation: {{row.field}} == "value"
      let condition = field.rowLockCondition;
      const matches = condition.match(/\{\{row\.(\w+)\}\}/g);
      
      if (matches) {
        matches.forEach(match => {
          const fieldName = match.replace(/\{\{row\.|\}\}/g, '');
          const value = getCellValue(row, fieldName);
          condition = condition.replace(match, `"${value}"`);
        });
      }
      
      // Simple eval for == comparison
      return eval(condition);
    } catch (e) {
      return false;
    }
  };
  
  // Helper: Check if column is editable
  const isColumnEditable = (fieldName, row) => {
    if (field.tableMode !== 'inlineEditable') return false;
    if (isRowLocked(row)) return false;
    return (field.editableColumns || []).includes(fieldName);
  };
  
  // Validate cell value
  const validateCellValue = (fieldName, value, columnType) => {
    const validationKey = `validation_${fieldName}`;
    const validation = field[validationKey] || {};
    
    // Required check
    if (validation.required && (!value || String(value).trim() === '')) {
      return 'This field is required';
    }
    
    // Max length for text
    if (columnType === 'text' && validation.maxLength) {
      if (String(value).length > validation.maxLength) {
        return `Maximum ${validation.maxLength} characters allowed`;
      }
    }
    
    // Number range
    if (columnType === 'number') {
      const numValue = parseFloat(value);
      if (validation.min !== null && validation.min !== undefined && numValue < validation.min) {
        return `Value must be at least ${validation.min}`;
      }
      if (validation.max !== null && validation.max !== undefined && numValue > validation.max) {
        return `Value must be at most ${validation.max}`;
      }
    }
    
    // Picklist allowed values
    if (columnType === 'picklist' && validation.allowedValues) {
      const allowed = validation.allowedValues.split(',').map(v => v.trim());
      if (!allowed.includes(value)) {
        return `Value must be one of: ${validation.allowedValues}`;
      }
    }
    
    return null;
  };
  
  // Handle cell edit
  const handleCellEdit = (row, fieldName, newValue, columnType) => {
    const rowId = row.id || row._id;
    
    // Validate
    const error = validateCellValue(fieldName, newValue, columnType);
    const errorKey = `${rowId}_${fieldName}`;
    
    if (error) {
      setCellErrors({ ...cellErrors, [errorKey]: error });
      return;
    } else {
      // Clear error
      const newErrors = { ...cellErrors };
      delete newErrors[errorKey];
      setCellErrors(newErrors);
    }
    
    // Update edited rows
    const updated = {
      ...editedRows,
      [rowId]: {
        ...(editedRows[rowId] || {}),
        [fieldName]: newValue
      }
    };
    setEditedRows(updated);
    
    // Close editing
    setEditingCell(null);
    
    console.log(`[DATA TABLE] Edited ${fieldName} for row ${rowId}:`, newValue);
  };
  
  // Render editable cell
  const renderEditableCell = (row, column) => {
    const rowId = row.id || row._id;
    const fieldName = column.field;
    const value = getCellValue(row, fieldName);
    const isEditing = editingCell?.rowId === rowId && editingCell?.field === fieldName;
    const errorKey = `${rowId}_${fieldName}`;
    const hasError = !!cellErrors[errorKey];
    
    if (isEditing) {
      // Render edit mode
      if (column.type === 'picklist') {
        const validationKey = `validation_${fieldName}`;
        const validation = field[validationKey] || {};
        const allowedValues = validation.allowedValues 
          ? validation.allowedValues.split(',').map(v => v.trim()) 
          : [];
        
        return (
          <Select 
            value={value} 
            onValueChange={(newValue) => handleCellEdit(row, fieldName, newValue, column.type)}
          >
            <SelectTrigger className="h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {allowedValues.map(val => (
                <SelectItem key={val} value={val}>{val}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      } else if (column.type === 'checkbox') {
        return (
          <input
            type="checkbox"
            checked={value || false}
            onChange={(e) => handleCellEdit(row, fieldName, e.target.checked, column.type)}
            className="w-4 h-4"
          />
        );
      } else {
        // Text/number/email/date input
        return (
          <Input
            type={column.type === 'number' ? 'number' : column.type === 'date' ? 'date' : 'text'}
            value={value || ''}
            onChange={(e) => {
              // For immediate feedback, update but don't validate yet
              const rowId = row.id || row._id;
              setEditedRows({
                ...editedRows,
                [rowId]: {
                  ...(editedRows[rowId] || {}),
                  [fieldName]: e.target.value
                }
              });
            }}
            onBlur={(e) => handleCellEdit(row, fieldName, e.target.value, column.type)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleCellEdit(row, fieldName, e.target.value, column.type);
              } else if (e.key === 'Escape') {
                setEditingCell(null);
              }
            }}
            autoFocus
            className="h-7 text-xs"
          />
        );
      }
    }
    
    // Display mode
    return (
      <div 
        className={`group relative flex items-center justify-between ${
          isColumnEditable(fieldName, row) ? 'cursor-pointer hover:bg-blue-50' : ''
        } ${hasError ? 'bg-red-50' : ''}`}
        onClick={() => {
          if (isColumnEditable(fieldName, row)) {
            setEditingCell({ rowId, field: fieldName });
          }
        }}
      >
        <span className={hasError ? 'text-red-600' : ''}>
          {column.type === 'checkbox' 
            ? (value ? '✓' : '○')
            : (value !== null && value !== undefined ? String(value) : '-')}
        </span>
        {isColumnEditable(fieldName, row) && (
          <Edit2 className="w-3 h-3 text-gray-400 opacity-0 group-hover:opacity-100 ml-2" />
        )}
        {hasError && (
          <div className="absolute left-0 top-full mt-1 bg-red-600 text-white text-xs p-1 rounded shadow-lg z-10 whitespace-nowrap">
            {cellErrors[errorKey]}
          </div>
        )}
      </div>
    );
  };
  
  // Handle selection
  const handleRowSelect = (row) => {
    if (field.selectionMode === 'none') return;
    
    const rowId = row.id;
    
    if (field.selectionMode === 'single') {
      setSelectedRows(rowId);
      // Emit value change
      if (field.outputSingleVar) {
        onValueChange?.(field.outputSingleVar, rowId);
      }
    } else if (field.selectionMode === 'multi') {
      const newSelection = selectedRows.includes(rowId)
        ? selectedRows.filter(id => id !== rowId)
        : [...selectedRows, rowId];
      
      setSelectedRows(newSelection);
      // Emit value change
      if (field.outputMultiVar) {
        onValueChange?.(field.outputMultiVar, newSelection);
      }
    }
  };
  
  const handleSort = (columnKey) => {
    if (!field.sorting) return;
    
    setSortConfig(prev => ({
      key: columnKey,
      direction: prev.key === columnKey && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };
  
  const isRowSelected = (row) => {
    if (field.selectionMode === 'single') {
      return selectedRows === row.id;
    } else if (field.selectionMode === 'multi') {
      return selectedRows.includes(row.id);
    }
    return false;
  };
  
  // Update execution context when selection changes or edits are made
  useEffect(() => {
    if (field.selectionMode === 'single' && field.outputSingleVar) {
      onValueChange?.(field.outputSingleVar, selectedRows);
    } else if (field.selectionMode === 'multi' && field.outputMultiVar) {
      onValueChange?.(field.outputMultiVar, selectedRows);
    }
    
    // Output edited data if inline editable
    if (field.tableMode === 'inlineEditable' && field.editedDataVar) {
      // Create payload: array of edited records with ID
      const editedPayload = Object.keys(editedRows).map(rowId => {
        return {
          id: rowId,
          ...editedRows[rowId]
        };
      });
      onValueChange?.(field.editedDataVar, editedPayload);
      
      console.log(`[DATA TABLE] Edited data payload:`, editedPayload);
    }
  }, [selectedRows, editedRows, field.selectionMode, field.outputSingleVar, field.outputMultiVar, field.tableMode, field.editedDataVar, onValueChange]);
  
  return (
    <div className="space-y-3">
      {/* Component Label */}
      {field.label && (
        <label className="block text-sm font-medium text-gray-700">
          {field.label}
          {field.required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      
      {/* NEW: Loading State for Inline Query */}
      {inlineQueryLoading && (
        <div className="p-8 text-center border rounded-lg bg-slate-50">
          <Loader2 className="w-8 h-8 mx-auto mb-2 text-blue-600 animate-spin" />
          <p className="text-sm text-slate-600">Loading records...</p>
        </div>
      )}
      
      {/* NEW: Error State for Inline Query */}
      {inlineQueryError && !inlineQueryLoading && (
        <div className="p-6 border border-red-200 rounded-lg bg-red-50">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="font-semibold text-red-800">{inlineQueryError.title}</h4>
              <p className="text-sm text-red-700 mt-1">{inlineQueryError.message}</p>
              <p className="text-xs text-red-600 mt-2 italic">
                💡 {inlineQueryError.action}
              </p>
            </div>
          </div>
        </div>
      )}
      
      {/* Only show content when not loading and no error */}
      {!inlineQueryLoading && !inlineQueryError && (
        <>
          {/* Search Bar */}
          {field.search && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={field.searchPlaceholder || 'Search records...'}
                className="pl-10"
              />
            </div>
          )}
          
          {/* Data Table */}
          <div className="border rounded-lg overflow-hidden">
            {paginatedData.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <TableIcon className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                <p className="text-sm">No records found</p>
                {dataSourceMode === 'inlineQuery' && field.inlineQuery?.filters?.length > 0 && (
                  <p className="text-xs text-gray-400 mt-1">
                    Try adjusting your filter criteria
                  </p>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      {field.selectionMode === 'multi' && (
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-12">
                          <input
                            type="checkbox"
                            checked={paginatedData.every(row => selectedRows.includes(row.id))}
                            onChange={(e) => {
                              if (e.target.checked) {
                                const allIds = paginatedData.map(r => r.id);
                                setSelectedRows(allIds);
                                if (field.outputMultiVar) {
                                  onValueChange?.(field.outputMultiVar, allIds);
                                }
                              } else {
                                setSelectedRows([]);
                                if (field.outputMultiVar) {
                                  onValueChange?.(field.outputMultiVar, []);
                                }
                              }
                            }}
                            className="w-4 h-4"
                          />
                        </th>
                      )}
                      {field.selectionMode === 'single' && (
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-12">
                          Select
                        </th>
                      )}
                      {(field.columns || []).map((column, idx) => (
                    <th
                      key={idx}
                      className={`px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase ${
                        column.sortable && field.sorting ? 'cursor-pointer hover:bg-gray-100' : ''
                      }`}
                      onClick={() => column.sortable && handleSort(column.field)}
                    >
                      <div className="flex items-center gap-1">
                        {column.label}
                        {sortConfig.key === column.field && (
                          <span className="text-blue-600">
                            {sortConfig.direction === 'asc' ? '↑' : '↓'}
                          </span>
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {paginatedData.map((row, rowIdx) => (
                  <tr
                    key={rowIdx}
                    className={`${
                      isRowSelected(row) ? 'bg-blue-50' : 'hover:bg-gray-50'
                    } transition-colors`}
                  >
                    {field.selectionMode === 'multi' && (
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={isRowSelected(row)}
                          onChange={() => handleRowSelect(row)}
                          className="w-4 h-4"
                        />
                      </td>
                    )}
                    {field.selectionMode === 'single' && (
                      <td className="px-4 py-3">
                        <input
                          type="radio"
                          checked={isRowSelected(row)}
                          onChange={() => handleRowSelect(row)}
                          className="w-4 h-4"
                        />
                      </td>
                    )}
                    {(field.columns || []).map((column, colIdx) => (
                      <td key={colIdx} className="px-4 py-3 text-sm text-gray-900">
                        {field.tableMode === 'inlineEditable' && isColumnEditable(column.field, row)
                          ? renderEditableCell(row, column)
                          : (getCellValue(row, column.field) !== null && getCellValue(row, column.field) !== undefined
                              ? String(getCellValue(row, column.field))
                              : '-')
                        }
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      
      {/* Pagination */}
      {field.pagination && totalPages > 1 && (
        <div className="flex items-center justify-between px-2">
          <div className="text-sm text-gray-600">
            Showing {(currentPage - 1) * pageSize + 1} to {Math.min(currentPage * pageSize, sortedData.length)} of {sortedData.length} records
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
            >
              <ChevronsLeft className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="px-3 text-sm">
              Page {currentPage} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
            >
              <ChevronsRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
      </>
      )}
      
      {/* Validation Error */}
      {validationError && (
        <p className="text-sm text-red-600 mt-1">{validationError}</p>
      )}
    </div>
  );
};

export default DataTableRuntime;
