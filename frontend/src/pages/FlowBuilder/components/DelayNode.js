import React from 'react';
import { Handle, Position } from 'reactflow';
import { Clock } from 'lucide-react';

const DelayNode = ({ data, id, selected }) => {
  const { label, config } = data;
  const displayLabel = label || 'Delay';
  const duration = config?.duration_value || 1;
  const unit = config?.duration_unit || 'hours';
  const delayMode = config?.delay_mode || 'duration';
  
  // Format display based on delay mode - matches Salesforce Flow
  let displayText = '';
  if (delayMode === 'fixed') {
    const executeDate = config?.execute_date || '';
    const executeTime = config?.execute_time || '';
    if (executeDate && executeTime) {
      displayText = `${executeDate} ${executeTime}`;
    } else {
      displayText = 'Fixed Date/Time';
    }
  } else if (delayMode === 'field') {
    // Date Field (Advanced) mode display
    const fieldRef = config?.fieldReference || '';
    const offset = config?.offset;
    if (fieldRef) {
      const fieldName = fieldRef.split('.').pop(); // Get last part
      if (offset && offset.value !== 0) {
        const sign = offset.value > 0 ? '+' : '';
        displayText = `${fieldName} ${sign}${offset.value} ${offset.unit}`;
      } else {
        displayText = `Until: ${fieldName}`;
      }
    } else {
      displayText = 'Date Field (Advanced)';
    }
  } else {
    displayText = `${duration} ${unit}`;
  }

  return (
    <div className="delay-node" style={{
      padding: '16px 20px',
      background: 'linear-gradient(135deg, #a78bfa 0%, #8b5cf6 100%)',
      border: selected ? '3px solid #7c3aed' : '2px solid #7c3aed',
      borderRadius: '12px',
      minWidth: '140px',
      boxShadow: '0 4px 12px rgba(139, 92, 246, 0.3)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '8px',
      position: 'relative'
    }}>
      {/* Input Handle (Top) - for incoming connections */}
      <Handle
        type="target"
        position={Position.Top}
        id="input"
        className="!bg-purple-600 !w-3 !h-3 !border-2 !border-white"
        style={{ top: '-6px' }}
      />

      <Clock className="h-6 w-6 text-white" />
      <div className="text-sm font-bold text-white text-center">
        {displayLabel}
      </div>
      <div className="text-xs text-purple-100 text-center">
        {displayText}
      </div>
      
      {/* Output Handle (Bottom) - for outgoing connections */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="output"
        className="!bg-purple-600 !w-3 !h-3 !border-2 !border-white"
        style={{ bottom: '-6px' }}
      />
    </div>
  );
};

export default DelayNode;
