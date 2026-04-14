/**
 * BlankSpaceComponent - Visual Spacer Component
 * 
 * 100% LAYOUT-DRIVEN - OBJECT-AGNOSTIC
 * 
 * Renders empty space for visual separation as configured in layout.
 * 
 * Configuration Example:
 * {
 *   "height": "md",  // "sm" | "md" | "lg" | "xl" or number in pixels
 *   "showDivider": true  // optional: show horizontal divider
 * }
 */
import React from 'react';

// Height presets
const HEIGHT_PRESETS = {
  sm: 'h-4',
  md: 'h-8',
  lg: 'h-12',
  xl: 'h-16',
};

const BlankSpaceComponent = ({ config = {}, context = {} }) => {
  // Get height from config (default: md)
  const heightConfig = config.height || 'md';
  const showDivider = config.showDivider || config.show_divider || false;
  
  // Resolve height class or custom value
  let heightClass = HEIGHT_PRESETS[heightConfig] || HEIGHT_PRESETS.md;
  let customStyle = {};
  
  // Handle numeric height (pixels)
  if (typeof heightConfig === 'number') {
    heightClass = '';
    customStyle = { height: `${heightConfig}px` };
  }
  
  return (
    <div 
      className={`w-full ${heightClass}`}
      style={customStyle}
      data-testid="blank-space-component"
    >
      {showDivider && (
        <div className="h-full flex items-center">
          <div className="w-full border-t border-slate-200" />
        </div>
      )}
    </div>
  );
};

export default BlankSpaceComponent;
