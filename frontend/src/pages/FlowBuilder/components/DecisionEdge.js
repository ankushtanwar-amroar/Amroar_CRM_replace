import React from 'react';
import { EdgeLabelRenderer } from 'reactflow';
import { Plus } from 'lucide-react';

const DecisionEdge = ({
  sourceX,
  sourceY,
  targetX,
  targetY,
  data
}) => {
  // Decision edges to merge nodes should be completely hidden
  // The Decision Node handles all visual representation internally
  // Only the merged-output edge (from Decision bottom to next node) should be visible
  
  return null; // Don't render anything
};

export default DecisionEdge;
