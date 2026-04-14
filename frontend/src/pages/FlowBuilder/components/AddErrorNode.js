import React from 'react';
import { Handle, Position } from 'reactflow';
import { AlertTriangle } from 'lucide-react';

/**
 * AddErrorNode - Terminal error handling node (Salesforce-style)
 * Each error message has its own type (window/inline) and optional field
 */
const AddErrorNode = ({ data, selected }) => {
  const { label, config } = data;
  const displayLabel = label || 'Add Error';
  
  // Get error messages from config
  const errorMessages = config?.errorMessages || [];
  const messageCount = errorMessages.length || (config?.errorMessage ? 1 : 0);
  
  // Get first error's type for preview
  const firstError = errorMessages[0] || {};
  const firstType = firstError.type || 'window';
  const firstField = firstError.field;
  const firstMessage = firstError.message || config?.errorMessage || '';

  return (
    <div
      className={`
        relative
        bg-white
        border-2 rounded-lg
        shadow-md
        transition-all duration-200
        ${selected ? 'border-red-500 shadow-lg' : 'border-red-300'}
        hover:shadow-lg
        min-w-[200px]
        max-w-[280px]
      `}
    >
      {/* Input Handle (Top) */}
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-red-500 !w-3 !h-3 !border-2 !border-white"
      />

      {/* Main Content */}
      <div className="px-4 py-3">
        {/* Header */}
        <div className="flex items-center gap-2 mb-2">
          <div className="flex items-center justify-center w-8 h-8 bg-red-100 rounded-lg">
            <AlertTriangle className="h-5 w-5 text-red-600" />
          </div>
          <div className="flex-1">
            <div className="text-xs font-medium text-red-600 uppercase tracking-wide">
              Error
            </div>
            <div className="text-sm font-semibold text-slate-900">
              {displayLabel}
            </div>
          </div>
        </div>

        {/* Message Count Badge */}
        {messageCount > 0 && (
          <div className="mb-2">
            <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded">
              {messageCount} error message{messageCount > 1 ? 's' : ''}
            </span>
          </div>
        )}

        {/* First Error Preview */}
        {firstMessage && (
          <div className="text-xs text-slate-600 bg-slate-50 px-2 py-1 rounded border border-slate-200 line-clamp-2">
            {firstMessage.slice(0, 50)}{firstMessage.length > 50 ? '...' : ''}
          </div>
        )}
      </div>

      {/* Output Handle (Bottom) */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-slate-400 !w-3 !h-3 !border-2 !border-white"
      />
    </div>
  );
};

export default AddErrorNode;
