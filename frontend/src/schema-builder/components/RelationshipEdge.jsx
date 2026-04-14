/**
 * Relationship Edge Component
 * ===========================
 * Custom React Flow edge for displaying schema relationships.
 * Shows relationship info on hover.
 */

import React, { memo, useState } from 'react';
import { getBezierPath, EdgeLabelRenderer, BaseEdge } from 'reactflow';

function RelationshipEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  data,
}) {
  const [isHovered, setIsHovered] = useState(false);
  
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  return (
    <>
      {/* Invisible wider path for easier hover detection */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={20}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        style={{ cursor: 'pointer' }}
      />
      
      {/* Actual visible edge */}
      <BaseEdge
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          ...style,
          strokeWidth: isHovered ? 3 : 2,
          stroke: isHovered ? '#4f46e5' : '#6366f1',
          transition: 'stroke-width 0.2s, stroke 0.2s',
        }}
      />
      
      {/* Hover Label */}
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: 'all',
          }}
          className="nodrag nopan"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          {/* Always visible small indicator */}
          <div 
            className={`h-3 w-3 rounded-full border-2 border-white shadow transition-all ${
              isHovered ? 'bg-indigo-600 scale-125' : 'bg-indigo-400'
            }`}
          />
          
          {/* Hover tooltip */}
          {isHovered && (
            <div 
              className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 bg-slate-800 text-white text-xs rounded-lg px-3 py-2 shadow-lg whitespace-nowrap z-50"
              style={{ minWidth: '120px' }}
            >
              <div className="font-semibold mb-1">{data?.label || 'Relationship'}</div>
              <div className="text-slate-300 text-xs">
                Field: {data?.apiName || 'Unknown'}
              </div>
              <div className="text-slate-400 text-xs mt-1">
                Click object to view details
              </div>
              {/* Tooltip arrow */}
              <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-slate-800" />
            </div>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

export default memo(RelationshipEdge);
