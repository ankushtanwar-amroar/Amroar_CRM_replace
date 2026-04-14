import React from 'react';
import { X } from 'lucide-react';
import { useConsole } from '../contexts/ConsoleContext';

const SubtabBar = ({ primaryTabId }) => {
  const { 
    subtabsByPrimaryTab, 
    activeSubtabIds,
    setActiveSubtabIds,
    closeSubtab 
  } = useConsole();

  const subtabs = subtabsByPrimaryTab[primaryTabId] || [];
  const activeSubtabId = activeSubtabIds[primaryTabId];

  if (subtabs.length === 0) return null;

  return (
    <div className="bg-gray-50 border-b flex items-center overflow-x-auto px-4">
      {subtabs.map(subtab => (
        <div
          key={subtab.id}
          className={`
            flex items-center px-3 py-1.5 mr-2 rounded-t cursor-pointer text-sm
            ${activeSubtabId === subtab.id 
              ? 'bg-white border-t border-l border-r' 
              : 'bg-gray-100 hover:bg-gray-200'}
          `}
          onClick={() => setActiveSubtabIds(prev => ({ ...prev, [primaryTabId]: subtab.id }))}
        >
          <span className="truncate max-w-xs">{subtab.title}</span>
          {subtab.closeable && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                closeSubtab(primaryTabId, subtab.id);
              }}
              className="ml-2 p-0.5 hover:bg-gray-300 rounded"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
};

export default SubtabBar;
