/**
 * ScreenFlowEndNode - Non-clickable end node for Screen Flows
 * Salesforce-style fixed exit point
 */
import React from 'react';
import { Handle, Position } from 'reactflow';
import { Square } from 'lucide-react';

const ScreenFlowEndNode = ({ data, id }) => {
  return (
    <div 
      className="bg-gradient-to-r from-red-500 to-red-600 rounded-lg border-2 border-red-600 px-6 py-3 min-w-[120px] shadow-md pointer-events-none select-none"
      style={{ cursor: 'default' }}
      data-testid="screen-flow-end-node"
    >
      {/* Input Handle */}
      <Handle
        type="target"
        position={Position.Top}
        id="target"
        style={{
          top: '-8px',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '12px',
          height: '12px',
          background: '#ef4444',
          border: '3px solid white',
          borderRadius: '50%'
        }}
      />

      {/* Content */}
      <div className="flex items-center gap-2 justify-center">
        <Square className="w-4 h-4 text-white fill-white" />
        <div className="font-semibold text-white text-sm">
          End
        </div>
      </div>
    </div>
  );
};

export default ScreenFlowEndNode;
