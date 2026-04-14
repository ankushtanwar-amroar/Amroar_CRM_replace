import React, { useEffect, useRef, useLayoutEffect } from 'react';
import { Handle, Position, useUpdateNodeInternals } from 'reactflow';
import { Plus } from 'lucide-react';

const DecisionNode = ({ data, id, selected }) => {
  const nodeRef = useRef(null);
  const updateNodeInternals = useUpdateNodeInternals();
  const { label, config, onOutcomePlusClick, onHeightChange } = data;
  const displayLabel = label || config?.label || 'Decision';
  const outcomeNodes = data.outcomeNodes || {}; // { outcomeIndex: [node1, node2, ...] }
  
  // Get outcomes from config
  const allOutcomes = config?.outcomes || [];
  const regularOutcomes = allOutcomes.filter(o => !o.isDefault);
  const defaultOutcome = allOutcomes.find(o => o.isDefault);

  // Calculate dynamic width based on outcomes
  const totalOutcomes = regularOutcomes.length + 1; // +1 for default
  const minWidth = Math.max(900, totalOutcomes * 250);
  
  // Measure actual DOM height and notify parent when it changes
  useLayoutEffect(() => {
    if (nodeRef.current && onHeightChange) {
      // Wait for DOM to fully settle, then measure
      // Use requestAnimationFrame to avoid ResizeObserver errors
      const timer = setTimeout(() => {
        requestAnimationFrame(() => {
          if (nodeRef.current) {
            const height = nodeRef.current.offsetHeight;
            console.log(`🔍 DecisionNode ${id} measured height: ${height}px`);
            onHeightChange(id, height);
          }
        });
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [outcomeNodes, id, onHeightChange]);
  
  // Notify React Flow when outcome nodes change so it can recalculate edges
  useEffect(() => {
    const timer = setTimeout(() => {
      updateNodeInternals(id);
    }, 50);
    return () => clearTimeout(timer);
  }, [outcomeNodes, id, updateNodeInternals]);

  return (
    <div 
      ref={nodeRef}
      key={data.nodeKey || 'default'} // Force remount when nodeKey changes
      style={{ 
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        minWidth: `${minWidth}px`,
        background: 'transparent'
      }}
    >
      {/* Input Handle - Top */}
      <Handle
        type="target"
        position={Position.Top}
        id="input"
        style={{
          top: '-8px',
          background: '#0070D2',
          border: '2px solid white',
          width: '10px',
          height: '10px'
        }}
      />

      {/* Decision Header Box */}
      <div
        style={{
          padding: '14px 20px',
          background: '#FFFFFF',
          border: selected ? '2px solid #0070D2' : '2px solid #DDDDDD',
          borderRadius: '8px',
          display: 'flex',
          alignItems: 'center',
          gap: '14px',
          boxShadow: '0 2px 6px rgba(0, 0, 0, 0.12)',
          cursor: 'pointer',
          minWidth: '220px',
          zIndex: 10
        }}
      >
        {/* Orange Diamond Icon */}
        <div style={{
          width: '40px',
          height: '40px',
          background: '#FF9900',
          transform: 'rotate(45deg)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          borderRadius: '2px'
        }}>
          <div style={{
            transform: 'rotate(-45deg)',
            display: 'flex',
            flexDirection: 'column',
            gap: '3px',
            alignItems: 'center'
          }}>
            <div style={{ width: '18px', height: '2.5px', background: 'white', borderRadius: '1px' }} />
            <div style={{ width: '18px', height: '2.5px', background: 'white', borderRadius: '1px' }} />
            <div style={{ width: '18px', height: '2.5px', background: 'white', borderRadius: '1px' }} />
          </div>
        </div>

        <div>
          <div style={{
            fontSize: '16px',
            fontWeight: 600,
            color: '#181818',
            fontFamily: 'Salesforce Sans, Arial, sans-serif',
            marginBottom: '2px'
          }}>
            {displayLabel}
          </div>
          <div style={{
            fontSize: '13px',
            color: '#706E6B',
            fontFamily: 'Salesforce Sans, Arial, sans-serif'
          }}>
            Decision
          </div>
        </div>
      </div>

      {/* Vertical Line from Decision to Outcomes Container */}
      <div style={{
        width: '3px',
        height: '30px',
        background: '#C9C7C5',
        marginTop: '-2px',
        marginBottom: '-2px'
      }} />

      {/* Outcomes Container - Box with Lines - NATURAL HEIGHT */}
      <div 
      style={{
        position: 'relative',
        width: `${minWidth}px`,
        padding: '0',
        display: 'flex'
      }}>
        {/* Top border line - FULL WIDTH to include all outcomes */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: '3%',
          right: '3%',
          height: '2px',
          background: '#C9C7C5'
        }} />

        {/* Left vertical line */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: '3%',
          bottom: "2px",
          width: '2px',
          background: '#C9C7C5'
        }} />

        {/* Right vertical line - EXTENDS to include Default */}
        <div style={{
          position: 'absolute',
          top: 0,
          right: '3%',
          bottom: "2px",
          width: '2px',
          background: '#C9C7C5'
        }} />

        {/* Bottom border line - FULL WIDTH */}
        <div style={{
          position: 'absolute',
          bottom: 0,
          left: '3%',
          right: '3%',
          height: '2px',
          background: '#C9C7C5'
        }} />

        {/* CONTENT: LEFT - MIDDLE - RIGHT Layout */}
        <div style={{
          width: '100%',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          padding: '40px 80px',
          gap: '60px'
        }}>
          
          {/* LEFT: Outcome 1 (ALWAYS FIRST) */}
          {regularOutcomes.length > 0 && (
            <div 
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '16px',
                flex: '0 0 auto',
                minWidth: '140px'
              }}
            >
              {/* Vertical line from top */}
              <div style={{
                width: '3px',
                height: '20px',
                background: '#C9C7C5',
                marginTop: '-40px'
              }} />

              {/* Outcome 1 Label */}
              <div style={{
                padding: '8px 18px',
                background: '#FFFFFF',
                border: '2px solid #B0ADAB',
                borderRadius: '20px',
                fontSize: '13px',
                fontWeight: 500,
                color: '#181818',
                whiteSpace: 'nowrap',
                fontFamily: 'Salesforce Sans, Arial, sans-serif',
                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.08)'
              }}>
                Outcome 1 of {displayLabel}
              </div>

              {/* Plus Button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (onOutcomePlusClick) {
                    onOutcomePlusClick(id, 0, false);
                  }
                }}
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  background: '#0070D2',
                  border: '2px solid white',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  boxShadow: '0 2px 4px rgba(0, 112, 210, 0.4)',
                  transition: 'all 0.2s',
                  outline: 'none'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.transform = 'scale(1.15)';
                  e.currentTarget.style.background = '#005FB2';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.transform = 'scale(1)';
                  e.currentTarget.style.background = '#0070D2';
                }}
              >
                <Plus style={{ width: '16px', height: '16px', color: 'white', strokeWidth: 3 }} />
              </button>

              {/* Render nodes stacked vertically below this outcome */}
              {outcomeNodes[0] && outcomeNodes[0].map((node, idx) => (
                <React.Fragment key={node.id}>
                  {/* Connecting line from + button or previous node */}
                  <div style={{
                    width: '3px',
                    height: '20px',
                    background: '#C9C7C5',
                    margin: '0'
                  }} />
                  
                  {/* Node */}
                  <div
                    style={{
                      padding: '12px 16px',
                      background: node.style?.background || '#8b5cf6',
                      color: 'white',
                      borderRadius: '8px',
                      fontSize: '13px',
                      fontWeight: 500,
                      textAlign: 'center',
                      minWidth: '120px',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                      cursor: 'pointer'
                    }}
                    onClick={() => node.onClick?.(node.id)}
                  >
                    {node.label}
                  </div>
                  
                  {/* Connecting line after node */}
                  <div style={{
                    width: '3px',
                    height: '20px',
                    background: '#C9C7C5',
                    margin: '0'
                  }} />
                  
                  {/* + button after this node */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onOutcomePlusClick) {
                        onOutcomePlusClick(id, 0, false);
                      }
                    }}
                    style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: '50%',
                      background: '#0070D2',
                      border: '2px solid white',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      boxShadow: '0 2px 4px rgba(0, 112, 210, 0.4)',
                      transition: 'all 0.2s',
                      outline: 'none'
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.transform = 'scale(1.15)';
                      e.currentTarget.style.background = '#005FB2';
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.transform = 'scale(1)';
                      e.currentTarget.style.background = '#0070D2';
                    }}
                  >
                    <Plus style={{ width: '16px', height: '16px', color: 'white', strokeWidth: 3 }} />
                  </button>
                </React.Fragment>
              ))}

              {/* NO vertical line to bottom */}

              {/* Hidden source handle */}
              <Handle
                type="source"
                position={Position.Bottom}
                id="outcome-0"
                style={{
                  bottom: '-60px',
                  opacity: 0,
                  width: '1px',
                  height: '1px'
                }}
              />
            </div>
          )}

          {/* MIDDLE: Outcomes 2, 3, 4, etc. (FLEXIBLE SPACE) */}
          {regularOutcomes.length > 1 && (
            <div style={{
              display: 'flex',
              gap: '50px',
              flex: '1',
              justifyContent: 'center',
              alignItems: 'flex-start'
            }}>
              {regularOutcomes.slice(1).map((outcome, index) => {
                const actualIndex = index + 1;
                return (
                  <div 
                    key={`outcome-${actualIndex}`}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '16px',
                      minWidth: '140px'
                    }}
                  >
                    {/* Vertical line from top */}
                    <div style={{
                      width: '3px',
                      height: '20px',
                      background: '#C9C7C5',
                      marginTop: '-40px'
                    }} />

                    {/* Outcome Label */}
                    <div style={{
                      padding: '8px 18px',
                      background: '#FFFFFF',
                      border: '2px solid #B0ADAB',
                      borderRadius: '20px',
                      fontSize: '13px',
                      fontWeight: 500,
                      color: '#181818',
                      whiteSpace: 'nowrap',
                      fontFamily: 'Salesforce Sans, Arial, sans-serif',
                      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.08)'
                    }}>
                      Outcome {actualIndex + 1} of {displayLabel}
                    </div>

                    {/* Plus Button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onOutcomePlusClick) {
                          onOutcomePlusClick(id, actualIndex, false);
                        }
                      }}
                      style={{
                        width: '28px',
                        height: '28px',
                        borderRadius: '50%',
                        background: '#0070D2',
                        border: '2px solid white',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        boxShadow: '0 2px 4px rgba(0, 112, 210, 0.4)',
                        transition: 'all 0.2s',
                        outline: 'none'
                      }}
                      onMouseOver={(e) => {
                        e.currentTarget.style.transform = 'scale(1.15)';
                        e.currentTarget.style.background = '#005FB2';
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.transform = 'scale(1)';
                        e.currentTarget.style.background = '#0070D2';
                      }}
                    >
                      <Plus style={{ width: '16px', height: '16px', color: 'white', strokeWidth: 3 }} />
                    </button>

                    {/* Render nodes stacked vertically below this outcome */}
                    {outcomeNodes[actualIndex] && outcomeNodes[actualIndex].map((node, idx) => (
                      <React.Fragment key={node.id}>
                        {/* Connecting line from + button or previous node */}
                        <div style={{
                          width: '3px',
                          height: '20px',
                          background: '#C9C7C5',
                          margin: '0'
                        }} />
                        
                        {/* Node */}
                        <div
                          style={{
                            padding: '12px 16px',
                            background: node.style?.background || '#8b5cf6',
                            color: 'white',
                            borderRadius: '8px',
                            fontSize: '13px',
                            fontWeight: 500,
                            textAlign: 'center',
                            minWidth: '120px',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                            cursor: 'pointer'
                          }}
                          onClick={() => node.onClick?.(node.id)}
                        >
                          {node.label}
                        </div>
                        
                        {/* Connecting line after node */}
                        <div style={{
                          width: '3px',
                          height: '20px',
                          background: '#C9C7C5',
                          margin: '0'
                        }} />
                        
                        {/* + button after this node */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (onOutcomePlusClick) {
                              onOutcomePlusClick(id, actualIndex, false);
                            }
                          }}
                          style={{
                            width: '28px',
                            height: '28px',
                            borderRadius: '50%',
                            background: '#0070D2',
                            border: '2px solid white',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            boxShadow: '0 2px 4px rgba(0, 112, 210, 0.4)',
                            transition: 'all 0.2s',
                            outline: 'none'
                          }}
                          onMouseOver={(e) => {
                            e.currentTarget.style.transform = 'scale(1.15)';
                            e.currentTarget.style.background = '#005FB2';
                          }}
                          onMouseOut={(e) => {
                            e.currentTarget.style.transform = 'scale(1)';
                            e.currentTarget.style.background = '#0070D2';
                          }}
                        >
                          <Plus style={{ width: '16px', height: '16px', color: 'white', strokeWidth: 3 }} />
                        </button>
                      </React.Fragment>
                    ))}

                    {/* NO vertical line to bottom */}

                    {/* Hidden source handle */}
                    <Handle
                      type="source"
                      position={Position.Bottom}
                      id={`outcome-${actualIndex}`}
                      style={{
                        bottom: '-60px',
                        opacity: 0,
                        width: '1px',
                        height: '1px'
                      }}
                    />
                  </div>
                );
              })}
            </div>
          )}

          {/* RIGHT: Default Outcome (ALWAYS ON RIGHT) */}
          <div 
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '16px',
              flex: '0 0 auto',
              minWidth: '140px'
            }}
          >
            {/* Vertical line from top */}
            <div style={{
              width: '3px',
              height: '20px',
              background: '#C9C7C5',
              marginTop: '-40px'
            }} />

            {/* Default Label */}
            <div style={{
              padding: '8px 18px',
              background: '#FFFFFF',
              border: '2px solid #B0ADAB',
              borderRadius: '20px',
              fontSize: '13px',
              fontWeight: 500,
              fontStyle: 'italic',
              color: '#706E6B',
              whiteSpace: 'nowrap',
              fontFamily: 'Salesforce Sans, Arial, sans-serif',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.08)'
            }}>
              Default Outcome
            </div>

            {/* Plus Button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (onOutcomePlusClick) {
                  onOutcomePlusClick(id, -1, true);
                }
              }}
              style={{
                width: '28px',
                height: '28px',
                borderRadius: '50%',
                background: '#0070D2',
                border: '2px solid white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                boxShadow: '0 2px 4px rgba(0, 112, 210, 0.4)',
                transition: 'all 0.2s',
                outline: 'none'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.transform = 'scale(1.15)';
                e.currentTarget.style.background = '#005FB2';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
                e.currentTarget.style.background = '#0070D2';
              }}
            >
              <Plus style={{ width: '16px', height: '16px', color: 'white', strokeWidth: 3 }} />
            </button>

            {/* Render nodes stacked vertically below default outcome */}
            {outcomeNodes['default'] && outcomeNodes['default'].map((node, idx) => (
              <React.Fragment key={node.id}>
                {/* Connecting line from + button or previous node */}
                <div style={{
                  width: '3px',
                  height: '20px',
                  background: '#C9C7C5',
                  margin: '0'
                }} />
                
                {/* Node */}
                <div
                  style={{
                    padding: '12px 16px',
                    background: node.style?.background || '#8b5cf6',
                    color: 'white',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontWeight: 500,
                    textAlign: 'center',
                    minWidth: '120px',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                    cursor: 'pointer'
                  }}
                  onClick={() => node.onClick?.(node.id)}
                >
                  {node.label}
                </div>
                
                {/* Connecting line after node */}
                <div style={{
                  width: '3px',
                  height: '20px',
                  background: '#C9C7C5',
                  margin: '0'
                }} />
                
                {/* + button after this node */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onOutcomePlusClick) {
                      onOutcomePlusClick(id, -1, true);
                    }
                  }}
                  style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    background: '#0070D2',
                    border: '2px solid white',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    boxShadow: '0 2px 4px rgba(0, 112, 210, 0.4)',
                    transition: 'all 0.2s',
                    outline: 'none'
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.transform = 'scale(1.15)';
                    e.currentTarget.style.background = '#005FB2';
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.transform = 'scale(1)';
                    e.currentTarget.style.background = '#0070D2';
                  }}
                >
                  <Plus style={{ width: '16px', height: '16px', color: 'white', strokeWidth: 3 }} />
                </button>
              </React.Fragment>
            ))}

            {/* NO vertical line to bottom for default (per requirements) */}

            {/* Hidden source handle */}
            <Handle
              type="source"
              position={Position.Bottom}
              id="default"
              style={{
                bottom: '-40px',
                opacity: 0,
                width: '1px',
                height: '1px'
              }}
            />
          </div>

        </div>
      </div>

      {/* Vertical Line from Outcomes Box Bottom to Handle - 30px */}
      <div style={{
        width: '3px',
        height: '30px',
        background: '#C9C7C5',
        marginTop: '0px',
        marginBottom: '8px'
      }} />

      {/* Output Handle - Bottom (Merge Point) */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="merged-output"
        style={{
          bottom: '-8px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: '#0070D2',
          border: '2px solid white',
          width: '10px',
          height: '10px',
          zIndex: 100
        }}
      />
    </div>
  );
};

export default DecisionNode;
