import React from 'react';
import { Handle, Position } from 'reactflow';
import { Plus } from 'lucide-react';

const DecisionNode = ({ data, id, selected }) => {
  const { label, config, onAddOutcome, onOutcomePlusClick } = data;
  const displayLabel = label || config?.label || 'Decision';
  
  // Get outcomes from config
  const allOutcomes = config?.outcomes || [];
  const regularOutcomes = allOutcomes.filter(o => !o.isDefault);
  const defaultOutcome = allOutcomes.find(o => o.isDefault) || {
    label: 'Default Outcome',
    isDefault: true
  };

  return (
    <div 
      className="decision-node-salesforce" 
      style={{ 
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '16px'
      }}
    >
      {/* Input Handle */}
      <Handle
        type="target"
        position={Position.Top}
        id="input"
        style={{
          top: '-8px',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '10px',
          height: '10px',
          background: '#94a3b8',
          border: '2px solid white',
          borderRadius: '50%',
          zIndex: 10
        }}
      />

      {/* Decision Box - Exact Salesforce Match */}
      <div
        className={`decision-box ${selected ? 'selected' : ''}`}
        style={{
          position: 'relative',
          padding: '12px 16px',
          background: '#FFFFFF',
          border: selected ? '2px solid #0070D2' : '1px solid #DDDDDD',
          borderRadius: '6px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
          minWidth: '200px'
        }}
      >
        {/* Orange Diamond Icon - Salesforce Orange */}
        <div style={{
          width: '36px',
          height: '36px',
          background: '#FF9900',
          clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0
        }}>
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '3px',
            alignItems: 'center'
          }}>
            <div style={{ width: '16px', height: '2px', background: 'white', borderRadius: '1px' }} />
            <div style={{ width: '16px', height: '2px', background: 'white', borderRadius: '1px' }} />
            <div style={{ width: '16px', height: '2px', background: 'white', borderRadius: '1px' }} />
          </div>
        </div>

        {/* Labels */}
        <div style={{ 
          display: 'flex', 
          flexDirection: 'column',
          gap: '2px'
        }}>
          <div style={{
            fontSize: '14px',
            fontWeight: 600,
            color: '#333333',
            lineHeight: '1.3',
            fontFamily: 'Arial, sans-serif'
          }}>
            {displayLabel}
          </div>
          <div style={{
            fontSize: '12px',
            color: '#666666',
            lineHeight: '1.3',
            fontFamily: 'Arial, sans-serif'
          }}>
            Decision
          </div>
        </div>
      </div>

      {/* Outcome Container - Light Gray Background */}
      <div style={{
        padding: '20px 28px',
        background: '#F8F8F8',
        border: '1px solid #DDDDDD',
        borderRadius: '8px',
        minWidth: '500px',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.08)',
        display: 'flex',
        flexDirection: 'row',
        gap: '48px',
        justifyContent: 'space-between',
        alignItems: 'flex-start'
      }}>
        {/* Left/Center - Regular Outcomes */}
        <div style={{
          display: 'flex',
          flexDirection: 'row',
          gap: '40px',
          flex: 1,
          flexWrap: 'wrap'
        }}>
          {regularOutcomes.map((outcome, index) => (
            <div 
              key={index}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '12px'
              }}
            >
              {/* Outcome Label - Pill Shape with Salesforce Colors */}
              <div style={{
                padding: '6px 16px',
                background: '#FFFFFF',
                border: '1px solid #A0A0A0',
                borderRadius: '16px',
                fontSize: '13px',
                fontWeight: 400,
                color: '#333333',
                whiteSpace: 'nowrap',
                fontFamily: 'Arial, sans-serif',
                boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)'
              }}>
                {outcome.label || `Outcome ${index + 1}`}
              </div>

              {/* + Icon - Salesforce Blue */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (onOutcomePlusClick) {
                    onOutcomePlusClick(id, index, false);
                  }
                }}
                style={{
                  width: '24px',
                  height: '24px',
                  borderRadius: '50%',
                  background: '#0070D2',
                  border: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  boxShadow: '0 1px 3px rgba(0, 112, 210, 0.3)',
                  transition: 'all 0.2s'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.transform = 'scale(1.1)';
                  e.currentTarget.style.background = '#005FB2';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.transform = 'scale(1)';
                  e.currentTarget.style.background = '#0070D2';
                }}
              >
                <Plus className="h-3 w-3 text-white" strokeWidth={3} />
              </button>

              {/* Hidden Handle for this outcome */}
              <Handle
                type="source"
                position={Position.Bottom}
                id={`outcome-${index}`}
                style={{
                  bottom: '-12px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  width: '8px',
                  height: '8px',
                  background: '#0070D2',
                  border: '2px solid white',
                  borderRadius: '50%',
                  opacity: 0
                }}
              />
            </div>
          ))}
        </div>

        {/* Right - Default Outcome */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '12px'
        }}>
          {/* Default Label - Pill Shape */}
          <div style={{
            padding: '6px 16px',
            background: '#FFFFFF',
            border: '1px solid #A0A0A0',
            borderRadius: '16px',
            fontSize: '13px',
            fontWeight: 400,
            fontStyle: 'italic',
            color: '#666666',
            whiteSpace: 'nowrap',
            fontFamily: 'Arial, sans-serif',
            boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)'
          }}>
            Default Outcome
          </div>

          {/* + Icon - Salesforce Blue */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (onOutcomePlusClick) {
                onOutcomePlusClick(id, -1, true);
              }
            }}
            style={{
              width: '24px',
              height: '24px',
              borderRadius: '50%',
              background: '#0070D2',
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              boxShadow: '0 1px 3px rgba(0, 112, 210, 0.3)',
              transition: 'all 0.2s'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.transform = 'scale(1.1)';
              e.currentTarget.style.background = '#005FB2';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
              e.currentTarget.style.background = '#0070D2';
            }}
          >
            <Plus className="h-3 w-3 text-white" strokeWidth={3} />
          </button>

          {/* Hidden Handle for default outcome */}
          <Handle
            type="source"
            position={Position.Bottom}
            id="default"
            style={{
              bottom: '-12px',
              left: '50%',
              transform: 'translateX(-50%)',
              width: '8px',
              height: '8px',
              background: '#0070D2',
              border: '2px solid white',
              borderRadius: '50%',
              opacity: 0
            }}
          />
        </div>
      </div>
    </div>
  );
};

export default DecisionNode;
