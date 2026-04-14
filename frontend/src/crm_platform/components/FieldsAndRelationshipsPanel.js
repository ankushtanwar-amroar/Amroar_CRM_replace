/**
 * FieldsAndRelationshipsPanel Component
 * Unified Fields & Relationships view with tabs for Standard/Custom fields, Advanced fields, and Dependencies
 * Used in both Setup Object Manager and CRM Platform Object Manager
 */
import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { Plus, Search, Clock, ChevronDown, Loader, Pencil, Trash2, Database, List, ToggleLeft, Calendar, User, Link2, Hash, FileText, X, Loader2, Shield, Check } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Badge } from '../../components/ui/badge';
import { Label } from '../../components/ui/label';
import { Switch } from '../../components/ui/switch';
import { Textarea } from '../../components/ui/textarea';
import { Checkbox } from '../../components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import { AdvancedFieldManager } from '../field_management';
import { DependentPicklistsConfig } from '../../modules/dependent-picklists';
import toast from 'react-hot-toast';

const API = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';

// Field types for the Add/Edit dialogs
const FIELD_TYPES = [
  { value: 'Text', label: 'Text', description: 'Text field up to 255 characters' },
  { value: 'Textarea', label: 'Text Area (Long)', description: 'Text area for longer content' },
  { value: 'Number', label: 'Number', description: 'Whole or decimal numbers' },
  { value: 'Currency', label: 'Currency', description: 'Dollar amounts with currency symbol' },
  { value: 'Percent', label: 'Percent', description: 'Percentage values' },
  { value: 'Date', label: 'Date', description: 'Date without time' },
  { value: 'DateTime', label: 'Date/Time', description: 'Date and time combined' },
  { value: 'Checkbox', label: 'Checkbox', description: 'True/False toggle' },
  { value: 'Picklist', label: 'Picklist', description: 'Single select dropdown list' },
  { value: 'URL', label: 'URL', description: 'Web address link' },
  { value: 'Email', label: 'Email', description: 'Email address' },
  { value: 'Phone', label: 'Phone', description: 'Phone number' },
];

const FieldsAndRelationshipsPanel = ({ objectName, objectLabel }) => {
  const [activeFieldsTab, setActiveFieldsTab] = useState('standard');
  const [fields, setFields] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState('label');
  const [sortOrder, setSortOrder] = useState('asc');
  const [showAddField, setShowAddField] = useState(false);
  const [editingField, setEditingField] = useState(null);
  
  // History tracking modal state
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [trackableFields, setTrackableFields] = useState([]);
  const [trackedFields, setTrackedFields] = useState(new Set());
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [savingHistory, setSavingHistory] = useState(false);
  
  // Dependencies tab state
  const [picklistFields, setPicklistFields] = useState([]);

  // Fetch fields when object changes
  useEffect(() => {
    if (objectName) {
      fetchFields();
    }
  }, [objectName]); // fetchFields is stable, defined in component scope

  // Extract picklist fields from fields for Dependencies tab
  useEffect(() => {
    const picklists = fields.filter(f => 
      f.type === 'picklist' || 
      f.type === 'select' ||
      (f.options && f.options.length > 0)
    ).map(f => ({
      api_name: f.api_name,
      label: f.label || f.api_name,
      type: 'picklist',
      options: f.options || []
    }));
    setPicklistFields(picklists);
  }, [fields]);

  const fetchFields = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      
      // Use the new all-fields endpoint that includes system fields
      const response = await axios.get(`${API}/api/objects/${objectName}/all-fields`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      // The response already has fields as an array with field_type
      const fieldsArray = response.data.fields || [];
      setFields(fieldsArray);
    } catch (error) {
      console.error('Error fetching fields:', error);
      // Fallback to old endpoint if new one fails
      try {
        const token = localStorage.getItem('token');
        const response = await axios.get(`${API}/api/objects/${objectName}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        
        // Transform fields object to array
        const fieldsObj = response.data.fields || {};
        const fieldsArray = Object.entries(fieldsObj).map(([key, field]) => ({
          api_name: key,
          ...field,
          is_custom: field.is_custom || false,
          field_type: field.is_custom ? 'custom' : 'standard',
          is_searchable: field.is_searchable === true
        }));
        
        setFields(fieldsArray);
      } catch (fallbackError) {
        console.error('Fallback also failed:', fallbackError);
        toast.error('Failed to load fields');
      }
    } finally {
      setLoading(false);
    }
  };
  
  // Fetch trackable fields for history tracking modal
  const fetchTrackableFields = async () => {
    try {
      setLoadingHistory(true);
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API}/api/history-tracking/trackable-fields/${objectName}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      setTrackableFields(response.data.fields || []);
      // Set currently tracked fields
      const tracked = new Set(
        (response.data.fields || [])
          .filter(f => f.is_tracked)
          .map(f => f.api_name)
      );
      setTrackedFields(tracked);
    } catch (error) {
      console.error('Error fetching trackable fields:', error);
      toast.error('Failed to load trackable fields');
    } finally {
      setLoadingHistory(false);
    }
  };
  
  // Save history tracking configuration
  const saveHistoryConfig = async () => {
    try {
      setSavingHistory(true);
      const token = localStorage.getItem('token');
      await axios.put(
        `${API}/api/history-tracking/config/${objectName}`,
        {
          object_name: objectName,
          tracked_fields: Array.from(trackedFields)
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success('History tracking configuration saved');
      setShowHistoryModal(false);
    } catch (error) {
      console.error('Error saving history config:', error);
      toast.error('Failed to save history tracking configuration');
    } finally {
      setSavingHistory(false);
    }
  };
  
  // Toggle field tracking
  const toggleFieldTracking = (apiName) => {
    setTrackedFields(prev => {
      const next = new Set(prev);
      if (next.has(apiName)) {
        next.delete(apiName);
      } else {
        next.add(apiName);
      }
      return next;
    });
  };
  
  // Open history tracking modal
  const openHistoryModal = () => {
    setShowHistoryModal(true);
    fetchTrackableFields();
  };

  const handleSort = (field) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const handleDeleteField = async (field) => {
    if (!field.is_custom) {
      toast.error('Cannot delete standard fields');
      return;
    }

    if (!window.confirm(`Are you sure you want to delete the field "${field.label}"?`)) {
      return;
    }

    try {
      const token = localStorage.getItem('token');
      await axios.delete(`${API}/api/objects/${objectName}/fields/${field.api_name}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success('Field deleted successfully');
      fetchFields();
    } catch (error) {
      console.error('Error deleting field:', error);
      toast.error(error.response?.data?.detail || 'Failed to delete field');
    }
  };

  const sortedAndFilteredFields = useMemo(() => {
    let filtered = fields;
    
    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = fields.filter(f => 
        (f.label || '').toLowerCase().includes(query) ||
        (f.api_name || '').toLowerCase().includes(query) ||
        (f.type || '').toLowerCase().includes(query)
      );
    }
    
    // Apply sorting
    return [...filtered].sort((a, b) => {
      let aVal = a[sortField] || '';
      let bVal = b[sortField] || '';
      
      if (typeof aVal === 'string') aVal = aVal.toLowerCase();
      if (typeof bVal === 'string') bVal = bVal.toLowerCase();
      
      if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
  }, [fields, searchQuery, sortField, sortOrder]);

  const getFieldTypeIcon = (type) => {
    switch ((type || '').toLowerCase()) {
      case 'text':
      case 'string':
        return <FileText className="h-4 w-4 text-slate-500" />;
      case 'number':
      case 'integer':
      case 'float':
      case 'currency':
        return <Hash className="h-4 w-4 text-blue-500" />;
      case 'boolean':
      case 'checkbox':
        return <ToggleLeft className="h-4 w-4 text-green-500" />;
      case 'date':
      case 'datetime':
        return <Calendar className="h-4 w-4 text-purple-500" />;
      case 'select':
      case 'picklist':
        return <List className="h-4 w-4 text-orange-500" />;
      case 'email':
        return <span className="text-red-500">@</span>;
      case 'phone':
        return <span className="text-blue-500">#</span>;
      case 'url':
        return <Link2 className="h-4 w-4 text-cyan-500" />;
      case 'lookup':
        return <Database className="h-4 w-4 text-indigo-500" />;
      case 'user':
        return <User className="h-4 w-4 text-amber-500" />;
      default:
        return <FileText className="h-4 w-4 text-slate-400" />;
    }
  };

  const formatFieldType = (type) => {
    const typeMap = {
      'text': 'Text',
      'string': 'Text',
      'number': 'Number',
      'integer': 'Number',
      'float': 'Decimal',
      'currency': 'Currency',
      'boolean': 'Checkbox',
      'checkbox': 'Checkbox',
      'date': 'Date',
      'datetime': 'Date/Time',
      'select': 'Picklist',
      'picklist': 'Picklist',
      'email': 'Email',
      'phone': 'Phone',
      'url': 'URL',
      'textarea': 'Long Text Area',
      'lookup': 'Lookup',
      'user': 'User Lookup'
    };
    return typeMap[(type || '').toLowerCase()] || type || 'Unknown';
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border">
      {/* Header Section */}
      <div className="px-6 py-4 border-b bg-slate-50">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-semibold text-slate-800">Fields & Relationships</h1>
            <p className="text-sm text-slate-500 mt-1">
              Manage all fields for {objectLabel || objectName}
            </p>
          </div>
        </div>

        {/* Tabs for Standard vs Advanced Fields vs Dependencies */}
        <div className="flex items-center gap-1 border-b -mx-6 px-6">
          <button
            onClick={() => setActiveFieldsTab('standard')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeFieldsTab === 'standard'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
            data-testid="standard-fields-tab"
          >
            Standard & Custom Fields
          </button>
          <button
            onClick={() => setActiveFieldsTab('advanced')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeFieldsTab === 'advanced'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
            data-testid="advanced-fields-tab"
          >
            Lookup, Rollup & Formula
          </button>
          <button
            onClick={() => setActiveFieldsTab('dependencies')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeFieldsTab === 'dependencies'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
            data-testid="dependencies-tab"
          >
            <Link2 className="h-4 w-4 inline mr-1" />
            Dependencies
          </button>
        </div>
      </div>

      {/* Tab Content */}
      {activeFieldsTab === 'standard' ? (
        <>
          {/* Standard Fields Header */}
          <div className="px-6 py-3 border-b bg-slate-50/50">
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-500">
                {sortedAndFilteredFields.length} Items • Sorted by {sortField === 'label' ? 'Field Label' : sortField === 'api_name' ? 'Field Name' : 'Data Type'}
              </p>
              <Button 
                onClick={() => setShowAddField(true)} 
                className="bg-blue-600 hover:bg-blue-700 h-9"
                data-testid="new-field-button"
              >
                <Plus className="h-4 w-4 mr-2" />
                New Field
              </Button>
            </div>

            {/* Quick Find / Search */}
            <div className="mt-3 flex items-center gap-4">
              <div className="relative flex-1 max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Quick Find"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 h-9 border-slate-300"
                  data-testid="fields-search"
                />
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                className="h-9 text-slate-600"
                onClick={openHistoryModal}
                data-testid="set-history-tracking-btn"
              >
                <Clock className="h-4 w-4 mr-2" />
                Set History Tracking
              </Button>
            </div>
          </div>

          {/* Table Section */}
          <div className="overflow-x-auto">
            {loading ? (
              <div className="text-center py-12 text-slate-500">
                <Loader className="h-8 w-8 animate-spin mx-auto mb-2 text-blue-500" />
                <p>Loading fields...</p>
              </div>
            ) : sortedAndFilteredFields.length === 0 ? (
              <div className="text-center py-12 text-slate-500">
                {searchQuery ? 'No matching fields found' : 'No fields found for this object'}
              </div>
            ) : (
              <table className="w-full">
                {/* Salesforce-style Blue Header */}
                <thead>
                  <tr className="bg-[#0176d3] text-white text-xs uppercase">
                    <th 
                      className="px-4 py-3 text-left font-semibold cursor-pointer hover:bg-[#0165b8]"
                      onClick={() => handleSort('label')}
                    >
                      <div className="flex items-center gap-1">
                        Field Label
                        {sortField === 'label' && (
                          <ChevronDown className={`h-3 w-3 transition-transform ${sortOrder === 'desc' ? 'rotate-180' : ''}`} />
                        )}
                      </div>
                    </th>
                    <th 
                      className="px-4 py-3 text-left font-semibold cursor-pointer hover:bg-[#0165b8]"
                      onClick={() => handleSort('api_name')}
                    >
                      <div className="flex items-center gap-1">
                        Field Name
                        {sortField === 'api_name' && (
                          <ChevronDown className={`h-3 w-3 transition-transform ${sortOrder === 'desc' ? 'rotate-180' : ''}`} />
                        )}
                      </div>
                    </th>
                    <th 
                      className="px-4 py-3 text-left font-semibold cursor-pointer hover:bg-[#0165b8]"
                      onClick={() => handleSort('type')}
                    >
                      <div className="flex items-center gap-1">
                        Data Type
                        {sortField === 'type' && (
                          <ChevronDown className={`h-3 w-3 transition-transform ${sortOrder === 'desc' ? 'rotate-180' : ''}`} />
                        )}
                      </div>
                    </th>
                    <th className="px-4 py-3 text-left font-semibold">Required</th>
                    <th className="px-4 py-3 text-left font-semibold">Field Type</th>
                    <th className="px-4 py-3 text-left font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedAndFilteredFields.map((field, index) => (
                    <tr 
                      key={field.api_name} 
                      className={`border-b hover:bg-blue-50/30 transition-colors ${index % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="text-blue-600 hover:underline cursor-pointer font-medium">
                            {field.label || field.api_name}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <code className="text-sm bg-slate-100 px-2 py-0.5 rounded text-slate-700">
                          {field.api_name}
                        </code>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {getFieldTypeIcon(field.type)}
                          <span className="text-slate-700">{formatFieldType(field.type)}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {field.required ? (
                          <Badge variant="destructive" className="bg-red-100 text-red-700 border-red-200 text-xs">
                            Required
                          </Badge>
                        ) : (
                          <span className="text-slate-400 text-sm">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {field.field_type === 'system' || field.is_system ? (
                          <span className="text-slate-500 font-medium text-sm flex items-center gap-1">
                            <Shield className="h-3 w-3" />
                            System
                          </span>
                        ) : field.is_custom || field.field_type === 'custom' ? (
                          <span className="text-indigo-600 font-medium text-sm">Custom</span>
                        ) : (
                          <span className="text-slate-600 text-sm">Standard</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          {/* System fields: No actions */}
                          {(field.field_type === 'system' || field.is_system) ? (
                            <span className="text-slate-400 text-xs">Read-only</span>
                          ) : !field.is_custom && field.field_type !== 'custom' ? (
                            /* Standard fields: Only allow label editing */
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 text-slate-500 hover:text-blue-600"
                              onClick={() => setEditingField({ ...field, is_standard: true })}
                              title="Edit Label"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          ) : (
                            /* Custom fields: Allow full edit and delete */
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 text-slate-500 hover:text-blue-600"
                                onClick={() => setEditingField(field)}
                                title="Edit Field"
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 text-slate-500 hover:text-red-600"
                                onClick={() => handleDeleteField(field)}
                                title="Delete Field"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Footer Stats */}
          {!loading && fields.length > 0 && (
            <div className="px-6 py-3 border-t bg-slate-50 text-xs text-slate-500 flex items-center justify-between">
              <div className="flex gap-4">
                <span className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-indigo-500"></div>
                  {fields.filter(f => f.is_custom).length} Custom Fields
                </span>
                <span className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-slate-400"></div>
                  {fields.filter(f => !f.is_custom).length} Standard Fields
                </span>
              </div>
              <span>Total: {fields.length} fields</span>
            </div>
          )}
        </>
      ) : activeFieldsTab === 'advanced' ? (
        /* Advanced Fields Tab Content */
        <div className="p-6">
          <AdvancedFieldManager
            objectName={objectName}
            objectLabel={objectLabel || objectName}
            onFieldsChanged={fetchFields}
          />
        </div>
      ) : (
        /* Dependencies Tab Content - GLOBAL (object-level) */
        <div className="p-6">
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Dependent Picklists</h3>
              <p className="text-sm text-gray-500 mb-4">
                Configure dependent picklist relationships for this object. When a controlling field value changes, 
                the available options in the dependent field are automatically filtered. These rules apply globally to all records of this object.
              </p>
            </div>

            {/* Check for Picklist Fields */}
            {picklistFields.length === 0 ? (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-6 text-center">
                <Link2 className="h-12 w-12 text-amber-400 mx-auto mb-4" />
                <h4 className="text-lg font-medium text-amber-800 mb-2">No Picklist Fields</h4>
                <p className="text-sm text-amber-600">
                  This object does not have any picklist fields. Add picklist fields to the object 
                  before configuring dependent picklists.
                </p>
              </div>
            ) : (
              <DependentPicklistsConfig
                objectName={objectName}
                picklistFields={picklistFields}
              />
            )}
          </div>
        </div>
      )}

      {/* History Tracking Configuration Modal */}
      <Dialog open={showHistoryModal} onOpenChange={setShowHistoryModal}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-blue-600" />
              Set History Tracking
            </DialogTitle>
            <DialogDescription>
              Select which fields should track history for {objectLabel || objectName}. 
              When enabled, changes to these fields will be recorded with old and new values.
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex-1 overflow-y-auto py-4">
            {loadingHistory ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-blue-500 mr-2" />
                <span className="text-slate-500">Loading trackable fields...</span>
              </div>
            ) : trackableFields.length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                <Shield className="h-12 w-12 mx-auto mb-4 text-slate-400" />
                <p>No trackable fields found for this object.</p>
                <p className="text-sm text-slate-400 mt-2">
                  Formula and rollup fields cannot be tracked.
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                {/* Header */}
                <div className="grid grid-cols-12 px-3 py-2 bg-slate-100 rounded-t-lg font-medium text-sm text-slate-600">
                  <div className="col-span-6">Field Name</div>
                  <div className="col-span-4">Type</div>
                  <div className="col-span-2 text-center">Track</div>
                </div>
                
                {/* Field List */}
                <div className="border rounded-b-lg divide-y max-h-[350px] overflow-y-auto">
                  {trackableFields.map((field) => (
                    <div 
                      key={field.api_name}
                      className="grid grid-cols-12 px-3 py-2.5 hover:bg-blue-50/50 items-center cursor-pointer"
                      onClick={() => toggleFieldTracking(field.api_name)}
                    >
                      <div className="col-span-6">
                        <div className="font-medium text-slate-800">{field.label}</div>
                        <div className="text-xs text-slate-400">{field.api_name}</div>
                      </div>
                      <div className="col-span-4">
                        <span className="text-sm text-slate-600 capitalize">{field.type}</span>
                        {field.is_custom && (
                          <Badge variant="outline" className="ml-2 text-xs text-indigo-600 border-indigo-200">
                            Custom
                          </Badge>
                        )}
                      </div>
                      <div className="col-span-2 flex justify-center">
                        <Checkbox 
                          checked={trackedFields.has(field.api_name)}
                          onCheckedChange={() => toggleFieldTracking(field.api_name)}
                          className="data-[state=checked]:bg-blue-600"
                        />
                      </div>
                    </div>
                  ))}
                </div>
                
                {/* Summary */}
                <div className="pt-3 text-sm text-slate-500">
                  {trackedFields.size} of {trackableFields.length} fields selected for tracking
                </div>
              </div>
            )}
          </div>
          
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button 
              variant="outline" 
              onClick={() => setShowHistoryModal(false)}
            >
              Cancel
            </Button>
            <Button 
              onClick={saveHistoryConfig}
              disabled={savingHistory || loadingHistory}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {savingHistory ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Save Configuration
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Field Dialog */}
      <AddFieldDialog
        isOpen={showAddField}
        onClose={() => setShowAddField(false)}
        objectName={objectName}
        onFieldAdded={() => {
          fetchFields();
          setShowAddField(false);
        }}
      />

      {/* Edit Field Dialog */}
      <EditFieldDialog
        isOpen={!!editingField}
        onClose={() => setEditingField(null)}
        objectName={objectName}
        field={editingField}
        onFieldUpdated={() => {
          fetchFields();
          setEditingField(null);
        }}
      />
    </div>
  );
};

// Add Field Dialog Component
const AddFieldDialog = ({ isOpen, onClose, objectName, onFieldAdded }) => {
  const [formData, setFormData] = useState({
    label: '',
    api_name: '',
    type: 'Text',
    options: [],
    default_value: '',
    is_required: false,
    is_searchable: false
  });
  const [optionInput, setOptionInput] = useState('');
  const [saving, setSaving] = useState(false);

  const handleLabelChange = (label) => {
    setFormData({
      ...formData,
      label,
      api_name: label.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
    });
  };

  const handleAddOption = () => {
    if (optionInput.trim()) {
      setFormData({
        ...formData,
        options: [...formData.options, optionInput.trim()]
      });
      setOptionInput('');
    }
  };

  const handleRemoveOption = (index) => {
    setFormData({
      ...formData,
      options: formData.options.filter((_, i) => i !== index)
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.label || !formData.api_name) {
      toast.error('Label and API Name are required');
      return;
    }

    if (formData.type === 'Picklist' && formData.options.length === 0) {
      toast.error('Picklist type requires at least one option');
      return;
    }

    setSaving(true);
    try {
      const token = localStorage.getItem('token');
      await axios.post(`${API}/api/metadata/${objectName}/fields`, formData, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success('Custom field added successfully');
      setFormData({
        label: '',
        api_name: '',
        type: 'Text',
        options: [],
        default_value: '',
        is_required: false,
        is_searchable: false
      });
      onFieldAdded();
    } catch (error) {
      console.error('Error adding field:', error);
      toast.error(error.response?.data?.detail || 'Failed to add custom field');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add Custom Field</DialogTitle>
          <DialogDescription>
            Create a new custom field for {objectName}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="label">Field Label *</Label>
            <Input
              id="label"
              value={formData.label}
              onChange={(e) => handleLabelChange(e.target.value)}
              placeholder="e.g., Industry, Annual Revenue"
              required
            />
          </div>

          <div>
            <Label htmlFor="api_name">API Name *</Label>
            <Input
              id="api_name"
              value={formData.api_name}
              onChange={(e) => setFormData({ ...formData, api_name: e.target.value })}
              placeholder="e.g., industry, annual_revenue"
              className="font-mono"
              required
            />
          </div>

          <div>
            <Label htmlFor="type">Field Type *</Label>
            <Select
              value={formData.type}
              onValueChange={(value) => setFormData({ ...formData, type: value, options: value === 'Picklist' ? formData.options : [] })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-80">
                {FIELD_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    <div className="flex flex-col">
                      <span className="font-medium">{type.label}</span>
                      <span className="text-xs text-slate-500">{type.description}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {formData.type === 'Picklist' && (
            <div className="p-3 bg-slate-50 rounded-lg border">
              <Label className="mb-2 block">Picklist Options *</Label>
              <div className="flex items-center space-x-2 mb-2">
                <Input
                  value={optionInput}
                  onChange={(e) => setOptionInput(e.target.value)}
                  placeholder="Enter option"
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddOption())}
                />
                <Button type="button" onClick={handleAddOption}>Add</Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {formData.options.map((option, index) => (
                  <Badge key={index} variant="secondary" className="pl-3 pr-1">
                    {option}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-4 w-4 p-0 ml-2"
                      onClick={() => handleRemoveOption(index)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </Badge>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center space-x-2">
            <Switch
              id="is_required"
              checked={formData.is_required}
              onCheckedChange={(checked) => setFormData({ ...formData, is_required: checked })}
            />
            <Label htmlFor="is_required" className="cursor-pointer">
              Make this field required
            </Label>
          </div>

          {/* Include in Global Search - Only for searchable field types */}
          {['Text', 'Textarea', 'Email', 'Phone', 'URL', 'Picklist'].includes(formData.type) && (
            <div className="flex items-center space-x-2">
              <Switch
                id="is_searchable"
                checked={formData.is_searchable}
                onCheckedChange={(checked) => setFormData({ ...formData, is_searchable: checked })}
                data-testid="include-in-search-toggle"
              />
              <Label htmlFor="is_searchable" className="cursor-pointer">
                Include in Global Search
              </Label>
            </div>
          )}

          <div className="flex items-center justify-end space-x-2 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving} className="bg-indigo-600 hover:bg-indigo-700">
              {saving ? 'Adding...' : 'Add Field'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

// Edit Field Dialog Component
const EditFieldDialog = ({ isOpen, onClose, objectName, field, onFieldUpdated }) => {
  const [formData, setFormData] = useState({
    label: '',
    api_name: '',
    type: 'Text',
    options: [],
    default_value: '',
    is_required: false,
    is_searchable: false
  });
  const [optionInput, setOptionInput] = useState('');
  const [saving, setSaving] = useState(false);

  // Check if this is a standard field (can only edit label)
  const isStandardField = field?.is_standard || !field?.is_custom;

  useEffect(() => {
    if (field) {
      // Normalize the field type to match FIELD_TYPES values (capitalized)
      const normalizeType = (type) => {
        if (!type) return 'Text';
        const typeMap = {
          'text': 'Text',
          'textarea': 'Textarea',
          'number': 'Number',
          'currency': 'Currency',
          'percent': 'Percent',
          'date': 'Date',
          'datetime': 'DateTime',
          'boolean': 'Boolean',
          'checkbox': 'Checkbox',
          'picklist': 'Picklist',
          'multipicklist': 'Multipicklist',
          'url': 'URL',
          'email': 'Email',
          'phone': 'Phone',
          'geolocation': 'Geolocation',
          'formula': 'Formula',
          'lookup': 'Lookup'
        };
        const lowerType = type.toLowerCase();
        return typeMap[lowerType] || type;
      };
      
      setFormData({
        label: field.label || '',
        api_name: field.api_name || field.key || '',
        type: normalizeType(field.type),
        options: field.options || [],
        default_value: field.default_value || '',
        is_required: field.is_required || field.required || false,
        is_searchable: field.is_searchable === true
      });
    }
  }, [field]);

  const handleAddOption = () => {
    if (optionInput.trim()) {
      setFormData({
        ...formData,
        options: [...formData.options, optionInput.trim()]
      });
      setOptionInput('');
    }
  };

  const handleRemoveOption = (index) => {
    setFormData({
      ...formData,
      options: formData.options.filter((_, i) => i !== index)
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.label) {
      toast.error('Label is required');
      return;
    }

    // For custom fields with picklist, validate options
    if (!isStandardField && formData.type === 'Picklist' && formData.options.length === 0) {
      toast.error('Picklist type requires at least one option');
      return;
    }

    setSaving(true);
    try {
      const token = localStorage.getItem('token');
      
      if (isStandardField) {
        // Standard fields: Use the new standard field label update endpoint
        // Only send label - API name, type, and required are immutable
        await axios.put(
          `${API}/api/objects/${objectName}/fields/${field.api_name}`, 
          { label: formData.label },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        toast.success('Field label updated successfully');
      } else {
        // Custom fields: Use the metadata endpoint
        await axios.put(
          `${API}/api/metadata/${objectName}/fields/${field.id || field.api_name}`, 
          formData,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        toast.success('Custom field updated successfully');
      }
      onFieldUpdated();
    } catch (error) {
      console.error('Error updating field:', error);
      toast.error(error.response?.data?.detail || 'Failed to update field');
    } finally {
      setSaving(false);
    }
  };

  if (!field) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isStandardField ? 'Edit Standard Field' : 'Edit Custom Field'}</DialogTitle>
          <DialogDescription>
            {isStandardField 
              ? `You can only edit the label for standard fields. API Name, Type, and Required settings cannot be changed.`
              : `Update the custom field for ${objectName}`
            }
          </DialogDescription>
        </DialogHeader>

        {/* Standard Field Notice */}
        {isStandardField && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
            <div className="font-medium mb-1">Standard Field</div>
            <p>This is a system-defined field. Only the display label can be modified.</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="edit_label">Field Label *</Label>
            <Input
              id="edit_label"
              value={formData.label}
              onChange={(e) => setFormData({ ...formData, label: e.target.value })}
              placeholder="e.g., Industry"
              required
            />
          </div>

          <div>
            <Label htmlFor="edit_api_name">API Name (Read Only)</Label>
            <Input
              id="edit_api_name"
              value={formData.api_name}
              disabled
              className="font-mono bg-slate-50"
            />
          </div>

          <div>
            <Label htmlFor="edit_type">Field Type {!isStandardField && '*'}</Label>
            <Select
              value={formData.type}
              onValueChange={(value) => setFormData({ ...formData, type: value })}
              disabled={isStandardField}
            >
              <SelectTrigger className={isStandardField ? 'bg-slate-50 cursor-not-allowed' : ''}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-80">
                {FIELD_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isStandardField && (
              <p className="text-xs text-slate-500 mt-1">Field type cannot be changed for standard fields</p>
            )}
          </div>

          {/* Picklist options - only for custom fields */}
          {!isStandardField && formData.type === 'Picklist' && (
            <div className="p-3 bg-slate-50 rounded-lg border">
              <Label className="mb-2 block">Picklist Options *</Label>
              <div className="flex items-center space-x-2 mb-2">
                <Input
                  value={optionInput}
                  onChange={(e) => setOptionInput(e.target.value)}
                  placeholder="Enter option"
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddOption())}
                />
                <Button type="button" onClick={handleAddOption}>Add</Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {formData.options.map((option, index) => (
                  <Badge key={index} variant="secondary" className="pl-3 pr-1">
                    {option}
                    <button
                      type="button"
                      onClick={() => handleRemoveOption(index)}
                      className="ml-2 text-red-500 hover:text-red-700"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Required toggle - only for custom fields */}
          <div className="flex items-center space-x-2">
            <Switch
              id="edit_is_required"
              checked={formData.is_required}
              onCheckedChange={(checked) => setFormData({ ...formData, is_required: checked })}
              disabled={isStandardField}
            />
            <Label htmlFor="edit_is_required" className={isStandardField ? 'text-slate-400' : ''}>
              Required field
            </Label>
            {isStandardField && (
              <span className="text-xs text-slate-500">(Cannot be changed for standard fields)</span>
            )}
          </div>

          {/* Include in Global Search - Only for searchable field types */}
          {['Text', 'Textarea', 'Email', 'Phone', 'URL', 'Picklist'].includes(formData.type) && (
            <div className="flex items-center space-x-2">
              <Switch
                id="edit_is_searchable"
                checked={formData.is_searchable}
                onCheckedChange={(checked) => setFormData({ ...formData, is_searchable: checked })}
                data-testid="edit-include-in-search-toggle"
              />
              <Label htmlFor="edit_is_searchable" className="cursor-pointer">
                Include in Global Search
              </Label>
            </div>
          )}

          <div className="flex justify-end space-x-2 pt-4 border-t">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving} className="bg-indigo-600 hover:bg-indigo-700">
              {saving ? 'Saving...' : isStandardField ? 'Update Label' : 'Update Field'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default FieldsAndRelationshipsPanel;
