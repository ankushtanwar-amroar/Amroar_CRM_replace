import React from 'react';
import { X, ChevronDown } from 'lucide-react';
import { useConsole } from '../contexts/ConsoleContext';

const PrimaryTabBar = () => {
  const { 
    primaryTabs, 
    activePrimaryTabId, 
    setActivePrimaryTabId,
    closePrimaryTab 
  } = useConsole();

  if (primaryTabs.length === 0) return null;

  return (
    <div className="bg-white border-b flex items-center overflow-x-auto">
      {primaryTabs.map(tab => (
        <div
          key={tab.id}
          className={`
            flex items-center px-4 py-2 border-r cursor-pointer
            ${activePrimaryTabId === tab.id 
              ? 'bg-blue-50 border-b-2 border-blue-500' 
              : 'hover:bg-gray-50'}
          `}
          onClick={() => setActivePrimaryTabId(tab.id)}
        >
          <span className="text-sm font-medium truncate max-w-xs">
            {tab.title}
          </span>
          {tab.closeable && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                closePrimaryTab(tab.id);
              }}
              className="ml-2 p-0.5 hover:bg-gray-200 rounded"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
};

export default PrimaryTabBar;
