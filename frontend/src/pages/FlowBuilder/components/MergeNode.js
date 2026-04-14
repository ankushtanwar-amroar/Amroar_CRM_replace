import React from 'react';
import { Handle, Position } from 'reactflow';

const MergeNode = ({ data, id }) => {
  const outcomeCount = data?.outcomeCount || 2;
  
  return (
    <div 
      className="merge-node"
      style={{
        position: 'relative',
        width: '1px',
        height: '1px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: 0,  // Invisible - just logical convergence
        pointerEvents: 'none',  // Not interactive
        visibility: 'hidden'  // Extra insurance for invisibility
      }}
    >
      {/* Input handles for each outcome - positioned at top */}
      {Array.from({ length: outcomeCount }).map((_, index) => {
        const position = ((index + 1) / (outcomeCount + 1)) * 100;
        
        return (
          <Handle
            key={`input-${index}`}
            type="target"
            position={Position.Top}
            id={`merge-input-${index}`}
            style={{
              top: '-10px',
              left: `${position}%`,
              transform: 'translateX(-50%)',
              width: '0px',
              height: '0px',
              background: 'transparent',
              border: 'none',
              opacity: 0
            }}
          />
        );
      })}
      
      {/* Single output handle at bottom */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="merge-output"
        style={{
          bottom: '-10px',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '0px',
          height: '0px',
          background: 'transparent',
          border: 'none',
          opacity: 0
        }}
      />
    </div>
  );
};

export default MergeNode;
