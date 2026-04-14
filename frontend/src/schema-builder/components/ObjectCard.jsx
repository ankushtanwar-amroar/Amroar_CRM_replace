/**
 * Object Card Component
 * ====================
 * Custom React Flow node for displaying schema objects.
 * Shows object name and fields with type icons.
 */

import React, { memo } from 'react';
import { Handle, Position } from 'reactflow';
import { 
  Database, FileText, Hash, Mail, Phone, Calendar, 
  ToggleLeft, List, AlignLeft, Link, Lock
} from 'lucide-react';
import { Badge } from '../../components/ui/badge';

// Field type icons mapping
const FIELD_TYPE_ICONS = {
  text: FileText,
  number: Hash,
  email: Mail,
  phone: Phone,
  date: Calendar,
  datetime: Calendar,
  checkbox: ToggleLeft,
  picklist: List,
  long_text: AlignLeft,
  lookup: Link
};

// Field type colors
const FIELD_TYPE_COLORS = {
  text: 'text-slate-500',
  number: 'text-blue-500',
  email: 'text-green-500',
  phone: 'text-purple-500',
  date: 'text-amber-500',
  datetime: 'text-amber-500',
  checkbox: 'text-emerald-500',
  picklist: 'text-orange-500',
  long_text: 'text-slate-500',
  lookup: 'text-indigo-500'
};

function ObjectCard({ data, selected }) {
  const { object, fields, showFields, isSelected, onSelect } = data;
  
  // Filter fields - show non-system first, limit display
  const displayFields = showFields 
    ? fields.filter(f => !f.is_system).slice(0, 8) 
    : [];
  const systemFieldCount = fields.filter(f => f.is_system).length;
  const hasMoreFields = fields.filter(f => !f.is_system).length > 8;
  
  // Check for lookup fields
  const lookupFields = fields.filter(f => f.field_type === 'lookup');

  return (
    <div 
      className={`bg-white rounded-lg shadow-md border-2 transition-all duration-200 min-w-[260px] max-w-[280px] ${
        isSelected 
          ? 'border-indigo-500 shadow-lg shadow-indigo-100' 
          : 'border-slate-200 hover:border-indigo-300'
      }`}
      onClick={onSelect}
      data-testid={`object-card-${object.api_name}`}
    >
      {/* Connection Handles */}
      <Handle
        type="target"
        position={Position.Left}
        className="w-3 h-3 bg-indigo-500 border-2 border-white"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="w-3 h-3 bg-indigo-500 border-2 border-white"
      />

      {/* Header */}
      <div className={`px-4 py-3 rounded-t-lg ${isSelected ? 'bg-indigo-600' : 'bg-slate-700'}`}>
        <div className="flex items-center gap-2">
          <Database className="h-4 w-4 text-white" />
          <span className="font-semibold text-white truncate">{object.label}</span>
        </div>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-xs text-slate-300">{object.api_name}</span>
          {!object.is_custom && (
            <Badge variant="secondary" className="text-xs bg-slate-600 text-slate-200 h-4 px-1">
              Std
            </Badge>
          )}
        </div>
      </div>

      {/* Fields List */}
      {showFields && (
        <div className="p-2">
          {displayFields.length > 0 ? (
            <div className="space-y-1 max-h-[180px] overflow-y-auto">
              {displayFields.map((field) => {
                const FieldIcon = FIELD_TYPE_ICONS[field.field_type] || FileText;
                const iconColor = FIELD_TYPE_COLORS[field.field_type] || 'text-slate-500';
                const isLookup = field.field_type === 'lookup';
                
                return (
                  <div
                    key={field.id}
                    className={`flex items-center gap-2 px-2 py-1.5 rounded text-sm ${
                      isLookup ? 'bg-indigo-50' : 'bg-slate-50'
                    }`}
                  >
                    <FieldIcon className={`h-3.5 w-3.5 flex-shrink-0 ${iconColor}`} />
                    <span className="text-slate-700 truncate flex-1">{field.label}</span>
                    {field.is_required && (
                      <span className="text-red-400 text-xs">*</span>
                    )}
                    {isLookup && field.lookup_object && (
                      <span className="text-xs text-indigo-500 flex items-center">
                        → {field.lookup_object}
                      </span>
                    )}
                  </div>
                );
              })}
              
              {/* More fields indicator */}
              {hasMoreFields && (
                <div className="text-xs text-slate-400 px-2 py-1 text-center">
                  +{fields.filter(f => !f.is_system).length - 8} more fields
                </div>
              )}
            </div>
          ) : (
            <div className="text-xs text-slate-400 px-2 py-2 text-center">
              No custom fields
            </div>
          )}
          
          {/* System fields indicator */}
          {systemFieldCount > 0 && (
            <div className="flex items-center gap-1 text-xs text-slate-400 px-2 pt-2 border-t border-slate-100 mt-2">
              <Lock className="h-3 w-3" />
              <span>{systemFieldCount} system field{systemFieldCount !== 1 ? 's' : ''}</span>
            </div>
          )}
        </div>
      )}

      {/* Collapsed state */}
      {!showFields && (
        <div className="px-4 py-2 text-xs text-slate-500">
          {fields.length} field{fields.length !== 1 ? 's' : ''}
          {lookupFields.length > 0 && (
            <span className="ml-2 text-indigo-500">
              • {lookupFields.length} lookup{lookupFields.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export default memo(ObjectCard);
