/**
 * Flow Reconstruction Utilities
 * Extracted from FlowEditorPage.js - handles flow node reconstruction
 */

const VERTICAL_SPACING = 150;

/**
 * Get node style based on node type
 */
export const getNodeStyle = (nodeType) => {
  const baseStyles = {
    borderRadius: '12px',
    padding: '16px',
    fontWeight: 'bold',
    minWidth: '180px',
    textAlign: 'center'
  };

  const styles = {
    connector: {
      background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
      border: '2px solid #7c3aed',
      color: 'white',
      ...baseStyles
    },
    mcp: {
      background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
      border: '2px solid #2563eb',
      ...baseStyles,
      color: 'white'
    },
    webhook: {
      background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
      border: '2px solid #4f46e5',
      ...baseStyles,
      color: 'white'
    },
    assignment: {
      background: 'linear-gradient(135deg, #a855f7 0%, #9333ea 100%)',
      border: '2px solid #9333ea',
      ...baseStyles,
      color: 'white'
    },
    decision: {
      ...baseStyles,
      color: 'white'
    },
    condition: {
      background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
      border: '2px solid #d97706',
      ...baseStyles,
      color: 'white'
    },
    ai_prompt: {
      background: 'linear-gradient(135deg, #ec4899 0%, #be185d 100%)',
      border: '2px solid #be185d',
      ...baseStyles,
      color: 'white'
    },
    action: {
      background: 'linear-gradient(135deg, #6b7280 0%, #4b5563 100%)',
      border: '2px solid #4b5563',
      ...baseStyles,
      color: 'white'
    }
  };
  return styles[nodeType] || styles.action;
};

/**
 * Reconstruct flow with add buttons between nodes
 * @param {Array} triggers - Flow triggers
 * @param {Array} savedNodes - Saved nodes from backend
 * @param {Array} savedEdges - Saved edges from backend
 * @param {Object} handlers - Handler functions { handleAddButtonClick, handleAddOutcome, handleOutcomePlusClick, handleDecisionHeightChange }
 */
export const reconstructFlowWithAddButtons = (triggers, savedNodes, savedEdges, handlers) => {
  const { handleAddButtonClick, handleAddOutcome, handleOutcomePlusClick, handleDecisionHeightChange } = handlers;
  
  const reconstructedNodes = [];
  const reconstructedEdges = [];
  let currentY = 50;
  let previousNodeId = null;

  console.log('🔄 ===== FLOW RECONSTRUCTION START =====');
  console.log('📦 Received savedNodes from backend:', JSON.stringify(savedNodes, null, 2));
  console.log('🔗 Received savedEdges from backend:', savedEdges);

  // 1. Add Trigger node based on trigger type (only for flows with triggers)
  if (triggers.length > 0) {
    const trigger = triggers[0];
    let triggerNode;
    
    // Determine trigger node type for display
    const triggerNodeType = (trigger.type === 'webhook_trigger' || trigger.type === 'incoming_webhook_trigger') 
      ? 'webhook_trigger' 
      : trigger.type === 'scheduled_trigger' 
        ? 'scheduled_trigger' 
        : 'trigger';
    
    triggerNode = {
      id: trigger.id || `${triggerNodeType}_start`,
      type: 'default', // Use DefaultNode for rendering
      position: { x: 250, y: currentY },
      // Explicit dimensions help React Flow with initial visibility
      width: 180,
      height: 80,
      data: {
        label: triggerNodeType === 'webhook_trigger' ? 'Webhook Trigger' 
          : triggerNodeType === 'scheduled_trigger' ? 'Scheduled Trigger'
          : 'Record Trigger',
        nodeType: triggerNodeType,
        config: trigger.config || {}
      }
    };
    
    reconstructedNodes.push(triggerNode);
    previousNodeId = triggerNode.id;
    currentY += VERTICAL_SPACING;
  } else if (savedNodes.length > 0) {
    // For flows without triggers (e.g., screen flows), create a START node
    console.log('📍 No triggers found, creating START node');
    const startNode = {
      id: 'start_node',
      type: 'default', // Use DefaultNode for rendering
      position: { x: 250, y: currentY },
      width: 180,
      height: 80,
      data: {
        label: 'Start',
        nodeType: 'start',
        config: {}
      }
    };
    reconstructedNodes.push(startNode);
    previousNodeId = startNode.id;
    currentY += VERTICAL_SPACING;
  }

  // 2. Identify loop nodes and categorize all nodes
  const loopNodes = savedNodes.filter(n => n.type === 'loop');
  const loopIds = loopNodes.map(n => n.id);
  const forEachBranchNodeIds = new Set();
  
  console.log('🔍 Analyzing nodes for loop context...');
  savedNodes.forEach((node) => {
    let loopContext = null;
    
    if (node.loopContext) {
      loopContext = node.loopContext;
    } else if (node.data?.loopContext) {
      loopContext = node.data.loopContext;
    } else if (node.config?.loopContext) {
      loopContext = node.config.loopContext;
    }
    
    if (loopContext?.isInsideLoop === true && loopContext?.loopNodeId) {
      forEachBranchNodeIds.add(node.id);
    }
  });

  console.log('🔵 Loop nodes:', loopIds);
  console.log('🟡 For Each branch nodes:', Array.from(forEachBranchNodeIds));

  // 3. Sort saved nodes by Y position
  const sortedNodes = [...savedNodes].sort((a, b) => a.position.y - b.position.y);

  // 4. Process nodes in main flow
  sortedNodes.forEach((node, index) => {
    if (forEachBranchNodeIds.has(node.id)) return;

    const nodeConfig = node.data?.config || node.config;
    if (nodeConfig?.connectorType === 'loop_back') return;
    if (node.type === 'merge' || node.id.startsWith('merge_')) return;

    // Add button BEFORE this node (or create initial add button if first node with no trigger)
    if (previousNodeId) {
      const addButtonBeforeId = `add_button_before_${node.id}_${Date.now()}`;
      const addButtonNode = {
        id: addButtonBeforeId,
        type: 'addButton',
        position: { x: 270, y: currentY },
        data: {
          onClick: () => handleAddButtonClick(addButtonBeforeId, previousNodeId)
        }
      };
      reconstructedNodes.push(addButtonNode);
      
      reconstructedEdges.push({
        id: `e_${previousNodeId}_to_${addButtonBeforeId}`,
        source: previousNodeId,
        target: addButtonBeforeId,
        type: 'smoothstep',
        animated: false,
        style: { stroke: '#94a3b8', strokeWidth: 2 }
      });
      
      currentY += VERTICAL_SPACING;
      
      reconstructedEdges.push({
        id: `e_${addButtonBeforeId}_to_${node.id}`,
        source: addButtonBeforeId,
        target: node.id,
        type: 'smoothstep',
        animated: false,
        style: { stroke: '#94a3b8', strokeWidth: 2 }
      });
    }

    const preservedData = node.data || {};
    
    // Merge configs intelligently - prefer preservedData.config for fields if node.config has empty fields
    // This handles cases where API returns both node.config (legacy/root) and node.data.config (full config)
    const mergedConfig = (() => {
      const rootConfig = node.config || {};
      const dataConfig = preservedData.config || {};
      
      // If root config exists but has empty fields and data.config has fields, use data.config
      if (rootConfig && dataConfig) {
        const rootFields = rootConfig.fields || rootConfig.components || [];
        const dataFields = dataConfig.fields || dataConfig.components || [];
        
        if (rootFields.length === 0 && dataFields.length > 0) {
          // data.config has the actual fields, merge it with root config
          return { ...rootConfig, ...dataConfig };
        }
      }
      
      // Default: prefer rootConfig if exists, otherwise dataConfig
      return rootConfig || dataConfig || {};
    })();
    
    // Determine node type for React Flow - use 'default' for most nodes
    // which will be handled by DefaultNode component
    const reactFlowNodeType = node.type === 'loop' ? 'loop' 
      : node.type === 'decision' ? 'decision' 
      : node.type === 'delay' ? 'delay' 
      : node.type === 'screen' ? 'screen' 
      : 'default';
    
    const actualNode = {
      ...node,
      type: reactFlowNodeType,
      position: { x: 250, y: currentY },
      // Explicit dimensions help React Flow with initial visibility
      ...(reactFlowNodeType === 'default' && { width: 180, height: 80 }),
      data: {
        ...preservedData,
        label: preservedData.label || node.label || node.type?.toUpperCase() || 'ACTION',
        nodeType: node.type,
        config: mergedConfig,
        onOutcomeClick: node.type === 'decision' ? (outcomeIndex) => {
          console.log(`Outcome ${outcomeIndex} clicked for decision ${node.id}`);
        } : undefined,
        onAddOutcome: node.type === 'decision' ? handleAddOutcome : undefined,
        onOutcomePlusClick: node.type === 'decision' ? handleOutcomePlusClick : undefined,
        onHeightChange: node.type === 'decision' ? handleDecisionHeightChange : undefined
      },
      // Don't apply inline styles to 'default' type nodes - DefaultNode handles its own styling
      // Only apply styles to special node types that don't use DefaultNode
      ...(reactFlowNodeType !== 'default' && { style: node.type === 'loop' ? {} : getNodeStyle(node.type) })
    };
    reconstructedNodes.push(actualNode);
    
    if (node.type === 'decision') {
      currentY += 350;
      previousNodeId = node.id;
    } else if (node.type === 'loop') {
      // Loop handling
      const LOOP_SPACING = 250;
      const LOOP_VERTICAL_SPACING = 180;
      
      const forEachButtonId = `add_button_for_each_${node.id}`;
      const forEachButton = {
        id: forEachButtonId,
        type: 'addButton',
        position: { x: 250 - LOOP_SPACING + 20, y: currentY + LOOP_VERTICAL_SPACING },
        data: {
          onClick: () => handleAddButtonClick(forEachButtonId, node.id),
          label: '🔁 Add to For Each',
          loopContext: {
            loopNodeId: node.id,
            isInsideLoop: true,
            branchType: 'for_each'
          },
          branchInfo: {
            type: 'for_each',
            sourceHandle: 'for-each'
          }
        }
      };
      reconstructedNodes.push(forEachButton);
      
      const afterLastButtonId = `add_button_after_last_${node.id}`;
      const afterLastButton = {
        id: afterLastButtonId,
        type: 'addButton',
        position: { x: 250, y: currentY + LOOP_VERTICAL_SPACING },
        data: {
          onClick: () => handleAddButtonClick(afterLastButtonId, node.id),
          label: '▶️ Continue After Loop',
          branchInfo: {
            type: 'after_last',
            sourceHandle: 'after-last',
            isMainFlow: true
          }
        }
      };
      reconstructedNodes.push(afterLastButton);
      
      const connectorId = `for_each_connector_${node.id}`;
      const connector = {
        id: connectorId,
        type: 'default',
        position: { x: 250 - LOOP_SPACING, y: currentY + (LOOP_VERTICAL_SPACING * 2.5) },
        width: 120,
        height: 50,
        data: {
          label: 'Loop Back',
          nodeType: 'connector',
          config: {
            connectorType: 'loop_back',
            loopNodeId: node.id
          }
        }
      };
      reconstructedNodes.push(connector);
      
      reconstructedEdges.push({
        id: `e_${node.id}_for_each_to_${forEachButtonId}`,
        source: node.id,
        sourceHandle: 'for-each',
        target: forEachButtonId,
        type: 'smoothstep',
        animated: true,
        style: { stroke: '#f59e0b', strokeWidth: 2.5 }
      });
      
      reconstructedEdges.push({
        id: `e_${node.id}_after_last_to_${afterLastButtonId}`,
        source: node.id,
        sourceHandle: 'after-last',
        target: afterLastButtonId,
        type: 'smoothstep',
        animated: true,
        style: { stroke: '#3b82f6', strokeWidth: 2.5 }
      });
      
      // Process For Each branch nodes
      const forEachNodes = sortedNodes.filter(n => {
        let loopContext = n.loopContext || n.data?.loopContext || n.config?.loopContext;
        return loopContext?.isInsideLoop === true && loopContext?.loopNodeId === node.id;
      });
      
      if (forEachNodes.length > 0) {
        let forEachPreviousId = forEachButtonId;
        let forEachY = currentY + LOOP_VERTICAL_SPACING + VERTICAL_SPACING;
        
        forEachNodes.forEach((loopNode, idx) => {
          const loopNodeData = loopNode.data || {};
          let loopContext = loopNode.loopContext || loopNodeData.loopContext || loopNode.config?.loopContext;
          
          const loopActualNode = {
            ...loopNode,
            type: 'default', // Use DefaultNode for rendering
            position: { x: 250 - LOOP_SPACING + 20, y: forEachY },
            width: 180,
            height: 80,
            data: {
              ...loopNodeData,
              label: loopNodeData.label || loopNode.label || loopNode.type?.toUpperCase() || 'ACTION',
              nodeType: loopNode.type,
              config: loopNode.config || loopNodeData.config || {},
              loopContext: loopContext
            }
          };
          reconstructedNodes.push(loopActualNode);
          
          reconstructedEdges.push({
            id: `e_${forEachPreviousId}_to_${loopNode.id}`,
            source: forEachPreviousId,
            sourceHandle: forEachPreviousId === node.id ? 'for-each' : undefined,
            target: loopNode.id,
            type: 'smoothstep',
            animated: true,
            style: { stroke: '#f59e0b', strokeWidth: 2.5 }
          });
          
          const loopAddButtonId = `add_button_loop_${loopNode.id}`;
          const loopAddButton = {
            id: loopAddButtonId,
            type: 'addButton',
            position: { x: 250 - LOOP_SPACING + 20, y: forEachY + VERTICAL_SPACING },
            data: {
              onClick: () => handleAddButtonClick(loopAddButtonId, loopNode.id),
              label: '🔁 Add to For Each',
              loopContext: {
                loopNodeId: node.id,
                isInsideLoop: true,
                branchType: 'for_each'
              },
              branchInfo: {
                type: 'for_each',
                sourceHandle: 'for-each'
              }
            }
          };
          reconstructedNodes.push(loopAddButton);
          
          reconstructedEdges.push({
            id: `e_${loopNode.id}_to_${loopAddButtonId}`,
            source: loopNode.id,
            target: loopAddButtonId,
            type: 'smoothstep',
            animated: true,
            style: { stroke: '#f59e0b', strokeWidth: 2.5 }
          });
          
          forEachPreviousId = loopAddButtonId;
          forEachY += VERTICAL_SPACING * 2;
        });
        
        reconstructedEdges.push({
          id: `e_${forEachPreviousId}_to_${connectorId}`,
          source: forEachPreviousId,
          target: connectorId,
          type: 'smoothstep',
          animated: true,
          style: { stroke: '#f59e0b', strokeWidth: 2 }
        });
      } else {
        reconstructedEdges.push({
          id: `e_${forEachButtonId}_to_${connectorId}`,
          source: forEachButtonId,
          target: connectorId,
          type: 'smoothstep',
          animated: true,
          style: { stroke: '#f59e0b', strokeWidth: 2 }
        });
      }
      
      reconstructedEdges.push({
        id: `e_${connectorId}_to_${node.id}`,
        source: connectorId,
        target: node.id,
        type: 'smoothstep',
        animated: true,
        style: { stroke: '#f59e0b', strokeWidth: 2, strokeDasharray: '8,4' }
      });
      
      previousNodeId = afterLastButtonId;
      currentY += LOOP_VERTICAL_SPACING * 3;
    } else {
      previousNodeId = node.id;
      currentY += VERTICAL_SPACING;
    }
  });

  // 5. Add final add button before end node
  const finalAddButtonId = `add_button_final_${Date.now()}`;
  const finalAddButton = {
    id: finalAddButtonId,
    type: 'addButton',
    position: { x: 270, y: currentY },
    data: {
      onClick: () => handleAddButtonClick(finalAddButtonId, previousNodeId)
    }
  };
  reconstructedNodes.push(finalAddButton);
  
  if (previousNodeId) {
    reconstructedEdges.push({
      id: `e_${previousNodeId}_to_${finalAddButtonId}`,
      source: previousNodeId,
      target: finalAddButtonId,
      type: 'smoothstep',
      animated: false,
      style: { stroke: '#94a3b8', strokeWidth: 2 }
    });
  }
  
  currentY += VERTICAL_SPACING;

  // 6. Add End node
  const maxNodeY = reconstructedNodes.reduce((max, node) => Math.max(max, node.position.y), 0);
  const endNodeY = Math.max(currentY, maxNodeY + 200);

  const endNode = {
    id: 'end_node',
    type: 'default', // Use DefaultNode for rendering
    position: { x: 250, y: endNodeY },
    width: 180,
    height: 80,
    data: {
      label: 'End',
      nodeType: 'end',
      config: {}
    }
  };
  reconstructedNodes.push(endNode);
  
  reconstructedEdges.push({
    id: `e_${finalAddButtonId}_to_end`,
    source: finalAddButtonId,
    target: 'end_node',
    type: 'smoothstep',
    animated: false,
    style: { stroke: '#94a3b8', strokeWidth: 2 }
  });

  console.log('✅ ===== RECONSTRUCTION COMPLETE =====');
  console.log('📊 Reconstructed nodes:', reconstructedNodes.length);
  console.log('📊 Reconstructed edges:', reconstructedEdges.length);

  return { reconstructedNodes, reconstructedEdges };
};

/**
 * Create default start node based on flow type
 */
export const createStartNode = (flowType) => {
  let startNode;
  
  if (flowType === 'screen-flow') {
    startNode = {
      id: 'screen_start',
      type: 'screen',
      position: { x: 300, y: 50 },
      data: {
        label: '📱 START SCREEN',
        nodeType: 'screen',
        config: {
          label: 'Welcome Screen',
          fields: []
        }
      },
      style: {
        background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
        border: '2px solid #2563eb',
        borderRadius: '12px',
        padding: '16px',
        fontWeight: 'bold',
        color: 'white',
        minWidth: '180px',
        textAlign: 'center'
      }
    };
  } else if (flowType === 'webhook-trigger') {
    startNode = {
      id: 'webhook_trigger_start',
      type: 'default',
      position: { x: 300, y: 50 },
      data: {
        label: '🔗 WEBHOOK TRIGGER (START)',
        nodeType: 'webhook_trigger',
        config: { triggerType: 'incoming_webhook' }
      },
      style: {
        background: 'linear-gradient(135deg, #9333ea 0%, #7e22ce 100%)',
        border: '2px solid #7e22ce',
        borderRadius: '12px',
        padding: '16px',
        fontWeight: 'bold',
        color: 'white',
        minWidth: '180px',
        textAlign: 'center'
      }
    };
  } else if (flowType === 'scheduled-trigger') {
    startNode = {
      id: 'scheduled_trigger_start',
      type: 'default',
      position: { x: 300, y: 50 },
      data: {
        label: '⏰ SCHEDULED TRIGGER (START)',
        nodeType: 'scheduled_trigger',
        config: { triggerType: 'scheduled_trigger' }
      },
      style: {
        background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
        border: '2px solid #ea580c',
        borderRadius: '12px',
        padding: '16px',
        fontWeight: 'bold',
        color: 'white',
        minWidth: '180px',
        textAlign: 'center'
      }
    };
  } else {
    startNode = {
      id: 'trigger_start',
      type: 'default',
      position: { x: 300, y: 50 },
      data: {
        label: '⚡ TRIGGER (START)',
        nodeType: 'trigger',
        config: { entity: 'Lead', event: 'afterInsert' }
      },
      style: {
        background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
        border: '2px solid #059669',
        borderRadius: '12px',
        padding: '16px',
        fontWeight: 'bold',
        color: 'white',
        minWidth: '180px',
        textAlign: 'center'
      }
    };
  }
  
  return startNode;
};

/**
 * Create default end node
 */
export const createEndNode = (yPosition = 350) => {
  return {
    id: 'end_node',
    type: 'default',
    position: { x: 250, y: yPosition },
    data: {
      label: '🏁 END',
      nodeType: 'end',
      config: {}
    },
    style: {
      background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
      border: '2px solid #dc2626',
      borderRadius: '12px',
      padding: '16px',
      fontWeight: 'bold',
      color: 'white',
      minWidth: '180px',
      textAlign: 'center'
    }
  };
};

/**
 * Create add button node
 */
export const createAddButtonNode = (id, yPosition, onClick) => {
  return {
    id,
    type: 'addButton',
    position: { x: 270, y: yPosition },
    data: { onClick }
  };
};

export default {
  reconstructFlowWithAddButtons,
  getNodeStyle,
  createStartNode,
  createEndNode,
  createAddButtonNode
};
