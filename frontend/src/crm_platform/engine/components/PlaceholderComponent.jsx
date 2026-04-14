/**
 * PlaceholderComponent - Fallback for Unsupported Component Types
 * 
 * Renders a visible placeholder when a component type is not yet implemented.
 * Shows in development mode only to help identify missing implementations.
 */
import React from 'react';
import { AlertTriangle, Box } from 'lucide-react';

const PlaceholderComponent = ({ config = {}, context = {}, componentType = 'unknown' }) => {
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  // In production, render nothing silently
  if (!isDevelopment) {
    console.warn(`[PlaceholderComponent] Unsupported component type: ${componentType}`);
    return null;
  }
  
  return (
    <div 
      className="bg-amber-50 border border-amber-200 rounded-lg p-4"
      data-testid={`placeholder-${componentType}`}
    >
      <div className="flex items-start gap-3">
        <div className="p-2 bg-amber-100 rounded-lg">
          <AlertTriangle className="w-5 h-5 text-amber-600" />
        </div>
        <div className="flex-1">
          <h4 className="text-sm font-semibold text-amber-800">
            Unsupported Component
          </h4>
          <p className="text-xs text-amber-700 mt-1">
            Component type <code className="bg-amber-100 px-1 rounded">{componentType}</code> is not yet implemented.
          </p>
          {config && Object.keys(config).length > 0 && (
            <details className="mt-2">
              <summary className="text-xs text-amber-600 cursor-pointer hover:text-amber-800">
                View Config
              </summary>
              <pre className="mt-1 text-xs bg-amber-100 p-2 rounded overflow-x-auto">
                {JSON.stringify(config, null, 2)}
              </pre>
            </details>
          )}
        </div>
      </div>
    </div>
  );
};

export default PlaceholderComponent;
