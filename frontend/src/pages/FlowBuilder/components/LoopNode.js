import React, { memo } from 'react';
import { Handle, Position } from 'reactflow';
import { Repeat } from 'lucide-react';

/**
 * LoopNode - Custom node for Loop element with two output handles
 * Salesforce-like structure: "For Each" and "After Last"
 */
const LoopNode = ({ data, selected }) => {
  return (
    <div
      className={`
        relative
        bg-white
        border-2 rounded-lg
        shadow-md
        transition-all duration-200
        ${selected ? 'border-amber-500 shadow-lg' : 'border-amber-300'}
        hover:shadow-lg
        min-w-[280px]
      `}
    >
      {/* Input Handle (Top) */}
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-amber-500 !w-3 !h-3 !border-2 !border-white"
      />

      {/* Main Content */}
      <div className="px-4 py-3">
        {/* Header */}
        <div className="flex items-center gap-2 mb-2">
          <div className="flex items-center justify-center w-8 h-8 bg-amber-100 rounded-lg">
            <Repeat className="h-5 w-5 text-amber-600" />
          </div>
          <div className="flex-1">
            <div className="text-xs font-medium text-amber-600 uppercase tracking-wide">Loop</div>
            <div className="text-sm font-semibold text-slate-900">
              {data.label || data.config?.label || 'LOOP'}
            </div>
          </div>
        </div>

        {/* Collection Info */}
        {data.config?.collection_variable && (
          <div className="text-xs text-slate-600 bg-slate-50 px-2 py-1 rounded border border-slate-200">
            {data.config.collection_variable}
          </div>
        )}
      </div>

      {/* Two Output Handles with Labels */}
      <div className="border-t border-amber-200">
        <div className="grid grid-cols-2 divide-x divide-amber-200">
          {/* For Each Branch - Left side, repeating actions */}
          <div className="relative px-3 py-2 bg-amber-50 hover:bg-amber-100 transition-colors">
            <div className="text-xs font-semibold text-amber-700 text-center">For Each</div>
            <div className="text-[10px] text-amber-600 text-center mt-0.5">Repeats for each item</div>
            <Handle
              type="source"
              position={Position.Bottom}
              id="for-each"
              className="!bg-amber-500 !w-3 !h-3 !border-2 !border-white"
              style={{ left: '25%' }}
            />
          </div>
          
          {/* After Last Branch - Right side, continues main flow */}
          <div className="relative px-3 py-2 bg-blue-50 hover:bg-blue-100 transition-colors">
            <div className="text-xs font-semibold text-blue-700 text-center">After Last</div>
            <div className="text-[10px] text-blue-600 text-center mt-0.5">Runs once after loop</div>
            <Handle
              type="source"
              position={Position.Bottom}
              id="after-last"
              className="!bg-blue-500 !w-3 !h-3 !border-2 !border-white"
              style={{ left: '75%' }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default memo(LoopNode);
