import React from 'react';
import { Handle, Position } from 'reactflow';

/**
 * FaultNode - Salesforce-style red "Fault" pill node
 * Used in fault paths to indicate error routing
 */
const FaultNode = ({ data, selected }) => {
  return (
    <div
      className={`
        px-4 py-2
        bg-red-500
        text-white
        rounded-full
        font-semibold
        text-sm
        shadow-md
        transition-all duration-200
        ${selected ? 'ring-2 ring-red-300 ring-offset-2' : ''}
        hover:shadow-lg
        cursor-default
      `}
      style={{
        minWidth: '80px',
        textAlign: 'center'
      }}
    >
      {/* Input Handle (Top) */}
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-red-700 !w-3 !h-3 !border-2 !border-white"
      />

      <span>Fault</span>

      {/* Output Handle (Bottom) */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-red-700 !w-3 !h-3 !border-2 !border-white"
      />
    </div>
  );
};

export default FaultNode;
