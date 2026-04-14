import React from 'react';
import { Handle, Position } from 'reactflow';
import { Flag } from 'lucide-react';

/**
 * FaultEndNode - White "End" node for fault paths (Salesforce-style)
 * Used to terminate fault paths with distinct white styling
 */
const FaultEndNode = ({ data, selected }) => {
  return (
    <div
      className={`
        px-4 py-3
        bg-white
        border border-slate-300
        rounded-lg
        shadow-sm
        transition-all duration-200
        ${selected ? 'ring-2 ring-slate-400 ring-offset-2' : ''}
        hover:shadow-md
        cursor-default
      `}
      style={{
        minWidth: '100px',
        textAlign: 'center'
      }}
    >
      {/* Input Handle (Top) */}
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-slate-400 !w-3 !h-3 !border-2 !border-white"
      />

      <div className="flex flex-col items-center gap-1">
        {/* Flag Icon */}
        <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center">
          <Flag className="w-4 h-4 text-slate-500" />
        </div>
        
        {/* Label */}
        <span className="text-sm font-semibold text-slate-600 uppercase tracking-wide">
          End
        </span>
      </div>

      {/* No output handle - this is a terminal node */}
    </div>
  );
};

export default FaultEndNode;
