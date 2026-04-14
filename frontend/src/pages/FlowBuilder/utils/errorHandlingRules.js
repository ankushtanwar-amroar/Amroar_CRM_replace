/**
 * Error Handling Eligibility Rules (Frontend)
 * Matches Salesforce Flow Builder behavior
 * Centralized rule engine for Add Error and Fault Path visibility
 */

// Flow type constants
export const FlowType = {
  SCREEN_FLOW: 'screen_flow',
  RECORD_TRIGGERED: 'record_triggered',
  SCHEDULED: 'scheduled',
  WEBHOOK: 'webhook',
  AUTOLAUNCHED: 'autolaunched',
  PLATFORM_EVENT: 'platform_event',
};

// Node type constants
export const NodeType = {
  // Action nodes that can fail
  CREATE_RECORD: 'mcp',
  UPDATE_RECORD: 'mcp',
  DELETE_RECORD: 'mcp',
  ACTION: 'action',
  DELAY: 'delay',
  ASSIGNMENT: 'assignment',
  LOOP: 'loop',
  
  // Control flow nodes
  DECISION: 'decision',
  SCREEN: 'screen',
  
  // Terminal/Special nodes
  START: 'trigger',
  END: 'end',
  MERGE: 'merge',
  ADD_ERROR: 'add_error',
};

/**
 * Centralized error handling rules
 */
export class ErrorHandlingRules {
  // Flow types where "Add Error" is visible
  static ADD_ERROR_ELIGIBLE_FLOW_TYPES = new Set([
    FlowType.SCREEN_FLOW,
    FlowType.RECORD_TRIGGERED,
    FlowType.SCHEDULED,
    FlowType.WEBHOOK,
    'incoming_webhook',  // Support incoming webhook flows
    'webhook_trigger',   // Support webhook trigger flows
  ]);

  // Node types that can have fault paths
  static FAULT_PATH_ELIGIBLE_NODE_TYPES = new Set([
    'mcp',        // CRM actions
    'action',     // Generic actions
    'delay',      // Can fail
    'assignment', // Expression errors
    'loop',       // Collection errors
  ]);

  // Node types that CANNOT have fault paths
  static FAULT_PATH_INELIGIBLE_NODE_TYPES = new Set([
    'trigger',
    'screen',
    'end',
    'merge',
    'decision',
    'add_button',
    'add_error',
  ]);

  /**
   * Determine if "Add Error" element should be visible in the palette
   * 
   * Salesforce Rule:
   * Add Error is ONLY visible in flows that have user-facing context
   */
  static canShowAddError(flowType) {
    // Normalize flow type (handle both 'record-triggered' and 'record_triggered')
    const normalizedFlowType = flowType ? flowType.replace(/-/g, '_') : '';
    return this.ADD_ERROR_ELIGIBLE_FLOW_TYPES.has(normalizedFlowType);
  }

  /**
   * Determine if a node can have a fault path added
   * 
   * Salesforce Rule:
   * Fault paths are available for ANY element that can fail during execution
   */
  static canAddFaultPath(nodeType, nodeConfig = {}) {
    // Explicitly ineligible nodes
    if (this.FAULT_PATH_INELIGIBLE_NODE_TYPES.has(nodeType)) {
      return false;
    }

    // Explicitly eligible nodes
    if (this.FAULT_PATH_ELIGIBLE_NODE_TYPES.has(nodeType)) {
      return true;
    }

    // For mcp nodes, check action type
    if (nodeType === 'mcp') {
      const actionType = nodeConfig.action_type || '';
      if (['create', 'update', 'delete', 'get', 'query'].includes(actionType)) {
        return true;
      }
    }

    // For action nodes, always allow fault path
    if (nodeType === 'action') {
      return true;
    }

    return false;
  }

  /**
   * Get metadata about a node's error handling capabilities
   */
  static getNodeMetadata(nodeType, nodeConfig = {}) {
    return {
      canFail: this.canAddFaultPath(nodeType, nodeConfig),
      supportsFaultPath: this.canAddFaultPath(nodeType, nodeConfig),
      nodeType: nodeType,
    };
  }

  /**
   * Get flow type from triggers configuration
   * CRITICAL: Must match Salesforce trigger type mapping
   * Returns normalized format with underscores
   */
  static getFlowTypeFromTriggers(triggers = []) {
    if (!triggers || triggers.length === 0) {
      return FlowType.AUTOLAUNCHED;
    }

    const trigger = triggers[0];
    const triggerType = trigger.type || '';

    // Map trigger types to flow types
    // CRITICAL: 'db', 'record_triggered', 'database', 'trigger' all map to RECORD_TRIGGERED
    if (['db', 'record_triggered', 'record-triggered', 'database', 'trigger'].includes(triggerType)) {
      return FlowType.RECORD_TRIGGERED;
    } else if (['schedule', 'scheduled', 'scheduled-trigger'].includes(triggerType)) {
      return FlowType.SCHEDULED;
    } else if (['webhook', 'incoming_webhook', 'incoming_webhook_trigger', 'webhook-trigger'].includes(triggerType)) {
      return FlowType.WEBHOOK;
    } else if (triggerType === 'screen' || triggerType === 'screen-flow') {
      return FlowType.SCREEN_FLOW;
    }

    return FlowType.AUTOLAUNCHED;
  }

  /**
   * Filter action menu options based on flow type and node context
   */
  static filterActionMenuOptions(options, flowType, selectedNode = null) {
    return options.filter(option => {
      // Filter "Add Error" based on flow type
      if (option.type === 'add_error') {
        return this.canShowAddError(flowType);
      }

      // Filter "Add Fault Path" based on node type
      if (option.type === 'fault_path') {
        if (!selectedNode) return false;
        return this.canAddFaultPath(selectedNode.type, selectedNode.data?.config);
      }

      // All other options always visible
      return true;
    });
  }

  /**
   * Validate if action is allowed
   */
  static validateAction(actionType, flowType, selectedNode = null) {
    if (actionType === 'add_error') {
      if (!this.canShowAddError(flowType)) {
        return {
          valid: false,
          message: 'Add Error is not available in this flow type. It is only available in Screen, Trigger, Scheduled, and Webhook flows.',
        };
      }
    }

    if (actionType === 'fault_path') {
      if (!selectedNode || !this.canAddFaultPath(selectedNode.type, selectedNode.data?.config)) {
        return {
          valid: false,
          message: 'Fault Path is not available for this element type. It is only available for elements that can fail during execution.',
        };
      }
    }

    return { valid: true };
  }
}

export default ErrorHandlingRules;
