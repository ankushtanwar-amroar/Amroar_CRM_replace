/**
 * Node Handlers Utility
 * Extracted from FlowEditorPage.js - handles node manipulation
 */
import { getNodeStyle } from './flowReconstruction';

const VERTICAL_SPACING = 150;

/**
 * Handle action selection from the add action menu
 */
export const createHandleActionSelect = ({
  nodes,
  edges,
  setNodes,
  setEdges,
  addActionPosition,
  insertAfterNodeId,
  handleAddButtonClick,
  handleOutcomePlusClick,
  handleAddNodeToDecisionOutcome,
  setShowAddActionMenu,
  toast
}) => {
  return (action) => {
    console.log('🎬 Action selected:', action);
    
    // Check if we're adding to a decision outcome
    const decisionOutcome = window._currentDecisionOutcome;
    
    if (decisionOutcome) {
      console.log('📍 Adding node to decision outcome:', decisionOutcome);
      handleAddNodeToDecisionOutcome(action, decisionOutcome);
      window._currentDecisionOutcome = null;
      return;
    }
    
    const newNodeId = `${action.type}_${Date.now()}`;
    
    // Find the position of the add button we clicked
    const addButtonNode = nodes.find(n => n.id === addActionPosition);
    if (!addButtonNode) {
      console.error('Add button not found:', addActionPosition);
      return;
    }

    const xPosition = addButtonNode.position.x;
    const yPosition = addButtonNode.position.y;
    const decisionContext = addButtonNode.data?.decisionContext;
    const loopContext = addButtonNode.data?.loopContext;

    // Create new action node
    const newNode = {
      id: newNodeId,
      type: action.nodeType === 'loop' ? 'loop' : 
            (action.nodeType === 'decision' ? 'decision' : 
            (action.nodeType === 'delay' ? 'delay' : 
            (action.nodeType === 'screen' ? 'screen' :
            (action.nodeType === 'add_error' ? 'add_error' : 'default')))),
      position: { x: xPosition, y: yPosition },
      data: {
        label: action.label,
        nodeType: action.nodeType,
        config: action.config || {},
        ...(decisionContext && { decisionContext }),
        ...(loopContext && { loopContext })
      },
      style: action.nodeType === 'loop' || action.nodeType === 'screen' || action.nodeType === 'add_error' ? {} : getNodeStyle(action.nodeType)
    };

    // Handle decision nodes
    if (action.nodeType === 'decision') {
      processDecisionNodeAddition(
        newNode, nodes, edges, setNodes, setEdges,
        addActionPosition, insertAfterNodeId, xPosition, yPosition,
        handleAddButtonClick, handleOutcomePlusClick, setShowAddActionMenu, toast
      );
      return;
    }
    
    // Handle loop nodes
    if (action.nodeType === 'loop') {
      processLoopNodeAddition(
        newNode, nodes, edges, setNodes, setEdges,
        addActionPosition, insertAfterNodeId, xPosition, yPosition,
        handleAddButtonClick, loopContext, setShowAddActionMenu, toast
      );
      return;
    }

    // Handle regular nodes
    processRegularNodeAddition(
      newNode, nodes, edges, setNodes, setEdges,
      addActionPosition, insertAfterNodeId, xPosition, yPosition,
      handleAddButtonClick, loopContext, setShowAddActionMenu, toast
    );
  };
};

/**
 * Process decision node addition
 */
function processDecisionNodeAddition(
  newNode, nodes, edges, setNodes, setEdges,
  addActionPosition, insertAfterNodeId, xPosition, yPosition,
  handleAddButtonClick, handleOutcomePlusClick, setShowAddActionMenu, toast
) {
  // Initialize outcomes
  if (!newNode.data.config.outcomes || newNode.data.config.outcomes.length === 0) {
    newNode.data.config.outcomes = [
      { name: 'outcome_1', label: 'Outcome 1', matchType: 'all', conditions: [], isDefault: false },
      { name: 'default', label: 'Default Outcome', isDefault: true, conditions: [] }
    ];
  }
  
  newNode.data.onOutcomePlusClick = handleOutcomePlusClick;
  
  const updatedNodes = nodes.map(node => {
    const shouldPushDown = node.position.y > yPosition && node.id !== addActionPosition;
    if (shouldPushDown) {
      return { ...node, position: { ...node.position, y: node.position.y + 400 } };
    }
    return node;
  }).filter(n => n.id !== addActionPosition);
  
  updatedNodes.push(newNode);
  
  const newAddButtonId = `add_button_after_decision_${Date.now()}`;
  const newAddButton = {
    id: newAddButtonId,
    type: 'addButton',
    position: { x: xPosition, y: yPosition + 360 },
    data: { onClick: () => handleAddButtonClick(newAddButtonId, newNode.id) }
  };
  updatedNodes.push(newAddButton);
  
  const newEdges = edges.filter(edge => 
    edge.source !== addActionPosition && edge.target !== addActionPosition
  );
  
  newEdges.push({
    id: `e_${insertAfterNodeId}_to_${newNode.id}`,
    source: insertAfterNodeId,
    target: newNode.id,
    targetHandle: 'input',
    type: 'smoothstep',
    animated: true,
    style: { strokeWidth: 2 }
  });
  
  // Find what was connected to the add button
  const edgeFromAddButton = edges.find(e => e.source === addActionPosition);
  if (edgeFromAddButton) {
    newEdges.push({
      id: `e_${newAddButtonId}_to_${edgeFromAddButton.target}`,
      source: newAddButtonId,
      target: edgeFromAddButton.target,
      type: 'smoothstep',
      animated: false,
      style: { stroke: '#94a3b8', strokeWidth: 2 }
    });
  }
  
  newEdges.push({
    id: `e_${newNode.id}_to_${newAddButtonId}`,
    source: newNode.id,
    sourceHandle: 'merge-output',
    target: newAddButtonId,
    type: 'smoothstep',
    animated: false,
    style: { stroke: '#94a3b8', strokeWidth: 2 }
  });
  
  setNodes(updatedNodes);
  setEdges(newEdges);
  setShowAddActionMenu(false);
  toast.success(`Added ${newNode.data.label} to flow`);
}

/**
 * Process loop node addition
 */
function processLoopNodeAddition(
  newNode, nodes, edges, setNodes, setEdges,
  addActionPosition, insertAfterNodeId, xPosition, yPosition,
  handleAddButtonClick, loopContext, setShowAddActionMenu, toast
) {
  const LOOP_SPACING = 250;
  const LOOP_VERTICAL_SPACING = 180;
  
  const updatedNodes = nodes.map(node => {
    const shouldPushDown = node.position.y > yPosition && node.id !== addActionPosition;
    if (shouldPushDown) {
      return { ...node, position: { ...node.position, y: node.position.y + (LOOP_VERTICAL_SPACING * 3) } };
    }
    return node;
  }).filter(n => n.id !== addActionPosition);
  
  updatedNodes.push(newNode);
  
  // Create For Each branch add button
  const forEachButtonId = `add_button_for_each_${newNode.id}`;
  const forEachButton = {
    id: forEachButtonId,
    type: 'addButton',
    position: { x: xPosition - LOOP_SPACING + 20, y: yPosition + LOOP_VERTICAL_SPACING },
    data: {
      onClick: () => handleAddButtonClick(forEachButtonId, newNode.id),
      label: '🔁 Add to For Each',
      loopContext: { loopNodeId: newNode.id, isInsideLoop: true, branchType: 'for_each' },
      branchInfo: { type: 'for_each', sourceHandle: 'for-each' }
    }
  };
  updatedNodes.push(forEachButton);
  
  // Create After Last branch add button
  const afterLastButtonId = `add_button_after_last_${newNode.id}`;
  const afterLastButton = {
    id: afterLastButtonId,
    type: 'addButton',
    position: { x: xPosition, y: yPosition + LOOP_VERTICAL_SPACING },
    data: {
      onClick: () => handleAddButtonClick(afterLastButtonId, newNode.id),
      label: '▶️ Continue After Loop',
      branchInfo: { type: 'after_last', sourceHandle: 'after-last', isMainFlow: true }
    }
  };
  updatedNodes.push(afterLastButton);
  
  // Create loop back connector
  const connectorId = `for_each_connector_${newNode.id}`;
  const connector = {
    id: connectorId,
    type: 'default',
    position: { x: xPosition - LOOP_SPACING, y: yPosition + (LOOP_VERTICAL_SPACING * 2.5) },
    data: {
      label: '🔄 LOOP BACK',
      nodeType: 'connector',
      config: { connectorType: 'loop_back', loopNodeId: newNode.id }
    },
    style: {
      background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
      border: '2px dashed #f59e0b',
      borderRadius: '10px',
      padding: '10px 16px',
      fontSize: '12px',
      fontWeight: '700',
      color: '#92400e',
      boxShadow: '0 2px 8px rgba(245, 158, 11, 0.2)'
    }
  };
  updatedNodes.push(connector);
  
  // Build edges
  const newEdges = edges.filter(edge => 
    edge.source !== addActionPosition && edge.target !== addActionPosition
  );
  
  // Edge from previous node to loop
  newEdges.push({
    id: `e_${insertAfterNodeId}_to_${newNode.id}`,
    source: insertAfterNodeId,
    target: newNode.id,
    type: 'smoothstep',
    animated: true,
    style: { strokeWidth: 2 }
  });
  
  // Loop internal edges
  newEdges.push({
    id: `e_${newNode.id}_for_each_to_${forEachButtonId}`,
    source: newNode.id,
    sourceHandle: 'for-each',
    target: forEachButtonId,
    type: 'smoothstep',
    animated: true,
    style: { stroke: '#f59e0b', strokeWidth: 2.5 }
  });
  
  newEdges.push({
    id: `e_${newNode.id}_after_last_to_${afterLastButtonId}`,
    source: newNode.id,
    sourceHandle: 'after-last',
    target: afterLastButtonId,
    type: 'smoothstep',
    animated: true,
    style: { stroke: '#3b82f6', strokeWidth: 2.5 }
  });
  
  newEdges.push({
    id: `e_${forEachButtonId}_to_${connectorId}`,
    source: forEachButtonId,
    target: connectorId,
    type: 'smoothstep',
    animated: true,
    style: { stroke: '#f59e0b', strokeWidth: 2 }
  });
  
  newEdges.push({
    id: `e_${connectorId}_to_${newNode.id}`,
    source: connectorId,
    target: newNode.id,
    type: 'smoothstep',
    animated: true,
    style: { stroke: '#f59e0b', strokeWidth: 2, strokeDasharray: '8,4' }
  });
  
  // Connect after last to next node
  const edgeFromAddButton = edges.find(e => e.source === addActionPosition);
  if (edgeFromAddButton) {
    newEdges.push({
      id: `e_${afterLastButtonId}_to_${edgeFromAddButton.target}`,
      source: afterLastButtonId,
      target: edgeFromAddButton.target,
      type: 'smoothstep',
      animated: false,
      style: { stroke: '#94a3b8', strokeWidth: 2 }
    });
  }
  
  setNodes(updatedNodes);
  setEdges(newEdges);
  setShowAddActionMenu(false);
  toast.success(`Added ${newNode.data.label} to flow`);
}

/**
 * Process regular node addition
 */
function processRegularNodeAddition(
  newNode, nodes, edges, setNodes, setEdges,
  addActionPosition, insertAfterNodeId, xPosition, yPosition,
  handleAddButtonClick, loopContext, setShowAddActionMenu, toast
) {
  // Update nodes - push down nodes below
  const updatedNodes = nodes.map(node => {
    const shouldPushDown = node.position.y > yPosition && node.id !== addActionPosition;
    if (shouldPushDown) {
      return { ...node, position: { ...node.position, y: node.position.y + VERTICAL_SPACING } };
    }
    return node;
  }).filter(n => n.id !== addActionPosition);
  
  updatedNodes.push(newNode);
  
  // Create new add button after this node
  const newAddButtonId = `add_button_${Date.now()}`;
  const newAddButton = {
    id: newAddButtonId,
    type: 'addButton',
    position: { x: xPosition, y: yPosition + VERTICAL_SPACING },
    data: {
      onClick: () => handleAddButtonClick(newAddButtonId, newNode.id),
      ...(loopContext && { loopContext })
    }
  };
  updatedNodes.push(newAddButton);
  
  // Build new edges
  const newEdges = [];
  
  edges.forEach(edge => {
    if (edge.source === addActionPosition) {
      // Connect new add button to what was after the old add button
      newEdges.push({
        ...edge,
        id: `e_${newAddButtonId}_to_${edge.target}`,
        source: newAddButtonId,
        style: loopContext ? { stroke: '#f59e0b', strokeWidth: 2.5 } : edge.style
      });
    } else if (edge.target === addActionPosition) {
      // Skip - we'll recreate this edge to point to the new node
    } else {
      newEdges.push(edge);
    }
  });
  
  // Edge from previous node to new node
  const edgeStyle = loopContext 
    ? { stroke: '#f59e0b', strokeWidth: 2.5 }
    : { stroke: '#94a3b8', strokeWidth: 2 };
  
  newEdges.push({
    id: `e_${insertAfterNodeId}_to_${newNode.id}`,
    source: insertAfterNodeId,
    sourceHandle: loopContext?.branchType === 'for_each' ? 'for-each' : undefined,
    target: newNode.id,
    type: 'smoothstep',
    animated: !!loopContext,
    style: edgeStyle
  });
  
  // Edge from new node to new add button
  newEdges.push({
    id: `e_${newNode.id}_to_${newAddButtonId}`,
    source: newNode.id,
    target: newAddButtonId,
    type: 'smoothstep',
    animated: !!loopContext,
    style: edgeStyle
  });
  
  setNodes(updatedNodes);
  setEdges(newEdges);
  setShowAddActionMenu(false);
  toast.success(`Added ${newNode.data.label} to flow`);
}

export default {
  createHandleActionSelect
};
