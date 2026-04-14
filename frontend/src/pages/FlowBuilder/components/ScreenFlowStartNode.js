/**
 * ScreenFlowStartNode - Non-clickable start node for Screen Flows
 * Salesforce-style fixed entry point
 */
import React from 'react';
import { Handle, Position } from 'reactflow';
import { Play } from 'lucide-react';

const ScreenFlowStartNode = ({ data, id }) => {
  return (
    <div 
      className="bg-gradient-to-r from-green-500 to-green-600 rounded-lg border-2 border-green-600 px-6 py-3 min-w-[200px] shadow-md pointer-events-none select-none"
      style={{ cursor: 'default' }}
      data-testid="screen-flow-start-node"
    >
      {/* Content */}
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center flex-shrink-0">
          <Play className="w-4 h-4 text-white fill-white" />
        </div>
        <div className="flex-1 text-center">
          <div className="font-semibold text-white text-sm">
            Screen Flow – Start
          </div>
        </div>
      </div>

      {/* Output Handle */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="source"
        style={{
          bottom: '-8px',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '12px',
          height: '12px',
          background: '#22c55e',
          border: '3px solid white',
          borderRadius: '50%'
        }}
      />
    </div>
  );
};

export default ScreenFlowStartNode;
