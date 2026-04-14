import React, { useState, useEffect } from 'react';
import { 
  Link, Calculator, FunctionSquare, Plus, Edit, Trash2, 
  MoreVertical, Search, RefreshCw, ChevronDown, AlertCircle 
} from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../../components/ui/dropdown-menu';
import LookupFieldWizard from './wizards/LookupFieldWizard';
import RollupFieldWizard from './wizards/RollupFieldWizard';
import FormulaFieldWizard from './wizards/FormulaFieldWizard';
import fieldManagementService from '../services/fieldManagementService';

/**
 * Advanced Field Manager Component
 * Displays and manages Lookup, Rollup, and Formula fields for an object
 */
const AdvancedFieldManager = ({ objectName, objectLabel, onFieldsChanged }) => {
  const [fields, setFields] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all');

  // Wizard states
  const [showLookupWizard, setShowLookupWizard] = useState(false);
  const [showRollupWizard, setShowRollupWizard] = useState(false);
  const [showFormulaWizard, setShowFormulaWizard] = useState(false);
  const [editingField, setEditingField] = useState(null);

  useEffect(() => {
    if (objectName) {
      loadFields();
    }
  }, [objectName]);

  const loadFields = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fieldManagementService.getAllAdvancedFields(objectName);
      setFields(result.fields || []);
    } catch (err) {
      console.error('Failed to load advanced fields:', err);
      setError('Failed to load advanced fields');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateField = (type) => {
    setEditingField(null);
    if (type === 'lookup') setShowLookupWizard(true);
    else if (type === 'rollup') setShowRollupWizard(true);
    else if (type === 'formula') setShowFormulaWizard(true);
  };

  const handleEditField = (field) => {
    setEditingField(field);
    if (field.field_type === 'lookup') setShowLookupWizard(true);
    else if (field.field_type === 'rollup') setShowRollupWizard(true);
    else if (field.field_type === 'formula') setShowFormulaWizard(true);
  };

  const handleDeleteField = async (field) => {
    if (!window.confirm(`Are you sure you want to delete the field "${field.label}"? This cannot be undone.`)) {
      return;
    }

    try {
      if (field.field_type === 'lookup') {
        await fieldManagementService.deleteLookupField(objectName, field.id);
      } else if (field.field_type === 'rollup') {
        await fieldManagementService.deleteRollupField(objectName, field.id);
      } else if (field.field_type === 'formula') {
        await fieldManagementService.deleteFormulaField(objectName, field.id);
      }
      loadFields();
      onFieldsChanged?.();
    } catch (err) {
      console.error('Failed to delete field:', err);
      alert('Failed to delete field');
    }
  };

  const handleRecalculateRollup = async (field) => {
    try {
      await fieldManagementService.recalculateRollup(objectName, field.id);
      alert('Rollup recalculation started');
    } catch (err) {
      console.error('Failed to recalculate:', err);
      alert('Failed to recalculate rollup');
    }
  };

  const handleSuccess = () => {
    loadFields();
    onFieldsChanged?.();
  };

  const getFieldTypeIcon = (type) => {
    switch (type) {
      case 'lookup': return <Link className="w-4 h-4" />;
      case 'rollup': return <Calculator className="w-4 h-4" />;
      case 'formula': return <FunctionSquare className="w-4 h-4" />;
      default: return null;
    }
  };

  const getFieldTypeColor = (type) => {
    switch (type) {
      case 'lookup': return 'bg-blue-100 text-blue-700';
      case 'rollup': return 'bg-purple-100 text-purple-700';
      case 'formula': return 'bg-green-100 text-green-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const getFieldTypeLabel = (type) => {
    switch (type) {
      case 'lookup': return 'Lookup';
      case 'rollup': return 'Rollup Summary';
      case 'formula': return 'Formula';
      default: return type;
    }
  };

  // Filter and search fields
  const filteredFields = fields.filter(field => {
    const matchesSearch = field.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          field.api_key.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = filterType === 'all' || field.field_type === filterType;
    return matchesSearch && matchesType;
  });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Advanced Fields</h3>
          <p className="text-sm text-gray-500">
            Lookup, Rollup Summary, and Formula fields
          </p>
        </div>
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button className="bg-blue-600 hover:bg-blue-700">
              <Plus className="w-4 h-4 mr-2" />
              New Advanced Field
              <ChevronDown className="w-4 h-4 ml-2" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem onClick={() => handleCreateField('lookup')}>
              <Link className="w-4 h-4 mr-2 text-blue-600" />
              <div>
                <div className="font-medium">Lookup (Relationship)</div>
                <div className="text-xs text-gray-500">Reference another record</div>
              </div>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleCreateField('rollup')}>
              <Calculator className="w-4 h-4 mr-2 text-purple-600" />
              <div>
                <div className="font-medium">Rollup Summary</div>
                <div className="text-xs text-gray-500">Aggregate child records</div>
              </div>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleCreateField('formula')}>
              <FunctionSquare className="w-4 h-4 mr-2 text-green-600" />
              <div>
                <div className="font-medium">Formula</div>
                <div className="text-xs text-gray-500">Computed field</div>
              </div>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Search fields..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">Filter:</span>
          <div className="flex gap-1">
            {[
              { value: 'all', label: 'All' },
              { value: 'lookup', label: 'Lookup', icon: Link },
              { value: 'rollup', label: 'Rollup', icon: Calculator },
              { value: 'formula', label: 'Formula', icon: FunctionSquare }
            ].map(filter => (
              <button
                key={filter.value}
                onClick={() => setFilterType(filter.value)}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors flex items-center gap-1.5 ${
                  filterType === filter.value
                    ? 'bg-blue-100 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {filter.icon && <filter.icon className="w-3.5 h-3.5" />}
                {filter.label}
              </button>
            ))}
          </div>
        </div>

        <Button variant="outline" size="sm" onClick={loadFields} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Error */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}

      {/* Fields Table */}
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-[#0176d3] text-white text-xs uppercase">
              <th className="px-4 py-3 text-left font-semibold">Field Label</th>
              <th className="px-4 py-3 text-left font-semibold">API Key</th>
              <th className="px-4 py-3 text-left font-semibold">Type</th>
              <th className="px-4 py-3 text-left font-semibold">Details</th>
              <th className="px-4 py-3 text-center font-semibold w-24">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-gray-500">
                  <div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-2" />
                  Loading fields...
                </td>
              </tr>
            ) : filteredFields.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-gray-500">
                  {searchQuery || filterType !== 'all' 
                    ? 'No fields match your search or filter'
                    : 'No advanced fields yet. Create one to get started.'
                  }
                </td>
              </tr>
            ) : (
              filteredFields.map((field, index) => (
                <tr key={field.id} className={`hover:bg-blue-50 transition-colors ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleEditField(field)}
                      className="text-blue-600 hover:text-blue-800 hover:underline font-medium text-sm"
                    >
                      {field.label}
                    </button>
                    {field.description && (
                      <p className="text-xs text-gray-500 mt-0.5 truncate max-w-xs">
                        {field.description}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 font-mono">
                    {field.api_key}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium ${getFieldTypeColor(field.field_type)}`}>
                      {getFieldTypeIcon(field.field_type)}
                      {getFieldTypeLabel(field.field_type)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {field.field_type === 'lookup' && (
                      <span>→ {field.target_object}</span>
                    )}
                    {field.field_type === 'rollup' && (
                      <span>{field.rollup_type}({field.child_object})</span>
                    )}
                    {field.field_type === 'formula' && (
                      <span className="font-mono text-xs truncate block max-w-[200px]">
                        {field.expression?.substring(0, 30)}{field.expression?.length > 30 ? '...' : ''}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEditField(field)}
                        className="h-8 w-8 p-0 hover:bg-blue-100"
                      >
                        <Edit className="w-4 h-4 text-gray-500" />
                      </Button>
                      
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                            <MoreVertical className="w-4 h-4 text-gray-500" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {field.field_type === 'rollup' && (
                            <DropdownMenuItem onClick={() => handleRecalculateRollup(field)}>
                              <RefreshCw className="w-4 h-4 mr-2" />
                              Recalculate
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem 
                            onClick={() => handleDeleteField(field)}
                            className="text-red-600"
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Summary */}
      {!loading && fields.length > 0 && (
        <div className="flex items-center gap-4 text-xs text-gray-500">
          <span className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-blue-500" />
            {fields.filter(f => f.field_type === 'lookup').length} Lookup
          </span>
          <span className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-purple-500" />
            {fields.filter(f => f.field_type === 'rollup').length} Rollup
          </span>
          <span className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-green-500" />
            {fields.filter(f => f.field_type === 'formula').length} Formula
          </span>
        </div>
      )}

      {/* Wizards */}
      <LookupFieldWizard
        isOpen={showLookupWizard}
        onClose={() => { setShowLookupWizard(false); setEditingField(null); }}
        objectName={objectName}
        objectLabel={objectLabel}
        editingField={editingField?.field_type === 'lookup' ? editingField : null}
        onSuccess={handleSuccess}
      />

      <RollupFieldWizard
        isOpen={showRollupWizard}
        onClose={() => { setShowRollupWizard(false); setEditingField(null); }}
        objectName={objectName}
        objectLabel={objectLabel}
        editingField={editingField?.field_type === 'rollup' ? editingField : null}
        onSuccess={handleSuccess}
      />

      <FormulaFieldWizard
        isOpen={showFormulaWizard}
        onClose={() => { setShowFormulaWizard(false); setEditingField(null); }}
        objectName={objectName}
        objectLabel={objectLabel}
        editingField={editingField?.field_type === 'formula' ? editingField : null}
        onSuccess={handleSuccess}
      />
    </div>
  );
};

export default AdvancedFieldManager;
