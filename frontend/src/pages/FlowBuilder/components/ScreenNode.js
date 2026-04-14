import React from 'react';
import { Handle, Position } from 'reactflow';
import { Monitor } from 'lucide-react';

const ScreenNode = ({ data, id, selected }) => {
  const { label, config } = data;
  const displayLabel = label || config?.label || 'Screen';
  const fields = config?.fields || [];

  return (
    <div 
      className={`bg-white rounded-lg border-2 ${
        selected ? 'border-blue-500 shadow-lg' : 'border-gray-300'
      } p-4 min-w-[250px] transition-all duration-200`}
    >
      {/* Input Handle */}
      <Handle
        type="target"
        position={Position.Top}
        style={{
          top: '-8px',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '10px',
          height: '10px',
          background: '#3b82f6',
          border: '2px solid white',
          borderRadius: '50%'
        }}
      />

      {/* Header */}
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
          <Monitor className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1">
          <div className="font-semibold text-gray-900 text-base">
            {displayLabel}
          </div>
          <div className="text-xs text-gray-500">Screen</div>
        </div>
      </div>

      {/* Fields Preview */}
      {fields.length > 0 && (
        <div className="border-t border-gray-200 pt-3 mt-3">
          <div className="text-xs font-medium text-gray-600 mb-2">
            Form Fields ({fields.length})
          </div>
          <div className="space-y-1">
            {fields.slice(0, 3).map((field, index) => (
              <div 
                key={index}
                className="text-xs text-gray-700 flex items-center gap-2 bg-gray-50 px-2 py-1 rounded"
              >
                <div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div>
                <span className="truncate">{field.label || field.name}</span>
                <span className="text-gray-400">({field.type})</span>
              </div>
            ))}
            {fields.length > 3 && (
              <div className="text-xs text-gray-400 italic">
                +{fields.length - 3} more fields
              </div>
            )}
          </div>
        </div>
      )}

      {fields.length === 0 && (
        <div className="text-xs text-gray-400 italic text-center py-2">
          No fields configured
        </div>
      )}

      {/* Output Handle */}
      <Handle
        type="source"
        position={Position.Bottom}
        style={{
          bottom: '-8px',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '10px',
          height: '10px',
          background: '#3b82f6',
          border: '2px solid white',
          borderRadius: '50%'
        }}
      />
    </div>
  );
};

export default ScreenNode;
