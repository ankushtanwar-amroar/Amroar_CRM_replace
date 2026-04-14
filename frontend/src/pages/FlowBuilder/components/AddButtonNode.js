import React from 'react';
import { Handle, Position } from 'reactflow';
import { Plus } from 'lucide-react';

const AddButtonNode = ({ data }) => {
  const hasLabel = data?.label;
  const isLoopButton = data?.loopContext?.isInsideLoop;
  
  return (
    <div className="relative flex flex-col items-center gap-2">
      <Handle type="target" position={Position.Top} className="opacity-0" />
      
      {hasLabel && (
        <div className={`text-xs font-semibold px-3 py-1 rounded-full ${
          isLoopButton 
            ? 'bg-amber-100 text-amber-700 border border-amber-300' 
            : 'bg-blue-100 text-blue-700 border border-blue-300'
        }`}>
          {data.label}
        </div>
      )}
      
      <button
        onClick={data.onClick}
        className={`w-10 h-10 rounded-full bg-white border-2 border-dashed transition-all duration-200 flex items-center justify-center shadow-sm hover:shadow-md group ${
          isLoopButton
            ? 'border-amber-400 hover:border-amber-600 hover:bg-amber-50'
            : 'border-gray-400 hover:border-gray-600 hover:bg-gray-50'
        }`}
      >
        <Plus className={`w-5 h-5 group-hover:scale-110 transition-transform ${
          isLoopButton
            ? 'text-amber-600 group-hover:text-amber-700'
            : 'text-gray-500 group-hover:text-gray-700'
        }`} />
      </button>
      
      <Handle type="source" position={Position.Bottom} className="opacity-0" />
    </div>
  );
};

export default AddButtonNode;
