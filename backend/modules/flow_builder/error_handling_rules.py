"""
Error Handling Eligibility Rules
Centralized rule engine for Add Error and Fault Path visibility
Matches Salesforce Flow Builder behavior
"""

class FlowType:
    """Flow type constants"""
    SCREEN_FLOW = 'screen_flow'
    RECORD_TRIGGERED = 'record_triggered'
    SCHEDULED = 'scheduled'
    WEBHOOK = 'webhook'
    AUTOLAUNCHED = 'autolaunched'
    PLATFORM_EVENT = 'platform_event'


class NodeType:
    """Node type constants"""
    # Action nodes that can fail
    CREATE_RECORD = 'mcp'
    UPDATE_RECORD = 'mcp'
    DELETE_RECORD = 'mcp'
    ACTION = 'action'
    DELAY = 'delay'
    ASSIGNMENT = 'assignment'
    LOOP = 'loop'
    
    # Control flow nodes
    DECISION = 'decision'
    SCREEN = 'screen'
    
    # Terminal/Special nodes
    START = 'trigger'
    END = 'end'
    MERGE = 'merge'


class ErrorHandlingRules:
    """
    Centralized rule engine for error handling eligibility
    Implements Salesforce Flow Builder behavior
    """
    
    # Flow types where "Add Error" is visible and valid
    ADD_ERROR_ELIGIBLE_FLOW_TYPES = {
        FlowType.SCREEN_FLOW,
        FlowType.RECORD_TRIGGERED,
        FlowType.SCHEDULED,
        FlowType.WEBHOOK,
        'trigger',  # Also accept 'trigger' as it maps to record_triggered
    }
    
    # Node types that can have fault paths (can fail during execution)
    FAULT_PATH_ELIGIBLE_NODE_TYPES = {
        'mcp',           # CRM actions (create, update, delete)
        'action',        # Generic actions
        'delay',         # Delay can fail if invalid config
        'assignment',    # Assignment can fail with expression errors
        'loop',          # Loop can fail with collection errors
    }
    
    # Node types that CANNOT have fault paths
    FAULT_PATH_INELIGIBLE_NODE_TYPES = {
        'trigger',       # Start node
        'screen',        # Screen is user-facing, doesn't "fail"
        'end',           # Terminal node
        'merge',         # Flow control only
        'decision',      # Logic only, doesn't fail
        'add_button',    # UI helper
    }
    
    @classmethod
    def can_show_add_error(cls, flow_type: str) -> bool:
        """
        Determine if "Add Error" element should be visible in the palette
        
        Args:
            flow_type: Type of flow (screen_flow, record_triggered, etc.)
            
        Returns:
            True if Add Error should be visible, False otherwise
            
        Salesforce Rule:
            Add Error is ONLY visible in flows that have user-facing context
            or can surface errors to end users/admins meaningfully.
        """
        return flow_type in cls.ADD_ERROR_ELIGIBLE_FLOW_TYPES
    
    @classmethod
    def can_add_fault_path(cls, node_type: str, node_config: dict = None) -> bool:
        """
        Determine if a node can have a fault path added
        
        Args:
            node_type: Type of node (mcp, action, screen, etc.)
            node_config: Node configuration dict (optional, for additional checks)
            
        Returns:
            True if node supports fault paths, False otherwise
            
        Salesforce Rule:
            Fault paths are available for ANY element that can fail during execution,
            regardless of flow type. This includes database operations, external calls,
            and complex expressions.
        """
        # Explicitly ineligible nodes
        if node_type in cls.FAULT_PATH_INELIGIBLE_NODE_TYPES:
            return False
        
        # Explicitly eligible nodes
        if node_type in cls.FAULT_PATH_ELIGIBLE_NODE_TYPES:
            return True
        
        # For mcp nodes, check action type
        if node_type == 'mcp' and node_config:
            action_type = node_config.get('action_type', '')
            # Database operations can fail
            if action_type in ['create', 'update', 'delete', 'get']:
                return True
        
        # For action nodes, always allow fault path (external integrations can fail)
        if node_type == 'action':
            return True
        
        # Default to False for unknown node types
        return False
    
    @classmethod
    def get_failable_action_types(cls) -> list:
        """
        Get list of action types that can fail and need fault paths
        
        Returns:
            List of action type strings
        """
        return [
            'create',
            'update',
            'delete',
            'get',
            'query',
            'callout',
            'integration',
            'send_email',
            'post_to_chat',
        ]
    
    @classmethod
    def validate_error_element_in_flow(cls, flow_type: str, has_add_error: bool) -> tuple:
        """
        Validate if Add Error element is allowed in this flow type
        
        Args:
            flow_type: Type of flow
            has_add_error: Whether flow contains Add Error element
            
        Returns:
            Tuple of (is_valid, error_message)
            
        Salesforce Rule:
            Add Error in an ineligible flow type is a validation error
        """
        if has_add_error and not cls.can_show_add_error(flow_type):
            return (
                False,
                f"Add Error element is not allowed in {flow_type} flows. "
                f"Add Error is only available in Screen, Trigger, Scheduled, and Webhook flows."
            )
        return (True, None)
    
    @classmethod
    def validate_fault_path_on_node(cls, node_type: str, has_fault_path: bool, node_config: dict = None) -> tuple:
        """
        Validate if fault path is allowed on this node type
        
        Args:
            node_type: Type of node
            has_fault_path: Whether node has a fault path configured
            node_config: Node configuration dict
            
        Returns:
            Tuple of (is_valid, error_message)
            
        Salesforce Rule:
            Fault path on a non-failable element is a validation error
        """
        if has_fault_path and not cls.can_add_fault_path(node_type, node_config):
            return (
                False,
                f"Fault path is not allowed on {node_type} nodes. "
                f"Fault paths are only available for elements that can fail during execution."
            )
        return (True, None)
    
    @classmethod
    def get_node_metadata(cls, node_type: str) -> dict:
        """
        Get metadata about a node's error handling capabilities
        
        Args:
            node_type: Type of node
            
        Returns:
            Dict with canFail and supportsFaultPath flags
        """
        return {
            'canFail': cls.can_add_fault_path(node_type),
            'supportsFaultPath': cls.can_add_fault_path(node_type),
            'nodeType': node_type
        }


def get_flow_type_from_triggers(triggers: list) -> str:
    """
    Determine flow type from triggers configuration
    
    Args:
        triggers: List of trigger configurations
        
    Returns:
        Flow type string
    """
    if not triggers or len(triggers) == 0:
        return FlowType.AUTOLAUNCHED
    
    trigger = triggers[0]
    trigger_type = trigger.get('type', '')
    
    # Map trigger types to flow types
    # CRITICAL: 'db', 'record_triggered', 'database' all map to RECORD_TRIGGERED (Trigger Flow)
    if trigger_type in ['db', 'record_triggered', 'database', 'trigger', 'record_trigger']:
        return FlowType.RECORD_TRIGGERED
    elif trigger_type in ['schedule', 'scheduled']:
        return FlowType.SCHEDULED
    elif trigger_type in ['webhook', 'incoming_webhook', 'incoming_webhook_trigger']:
        return FlowType.WEBHOOK
    elif trigger_type == 'screen':
        return FlowType.SCREEN_FLOW
    else:
        return FlowType.AUTOLAUNCHED


def validate_flow_error_handling(flow: dict) -> list:
    """
    Validate all error handling rules in a flow
    
    Args:
        flow: Flow configuration dict
        
    Returns:
        List of validation error messages (empty if valid)
    """
    errors = []
    
    # Determine flow type
    triggers = flow.get('triggers', [])
    flow_type = get_flow_type_from_triggers(triggers)
    
    # Check for Add Error elements
    nodes = flow.get('nodes', [])
    has_add_error = any(n.get('type') == 'add_error' for n in nodes)
    
    # Validate Add Error eligibility
    is_valid, error_msg = ErrorHandlingRules.validate_error_element_in_flow(flow_type, has_add_error)
    if not is_valid:
        errors.append(error_msg)
    
    # Validate fault paths on nodes
    edges = flow.get('edges', [])
    
    for node in nodes:
        node_id = node.get('id')
        node_type = node.get('type')
        node_config = node.get('config', {})
        
        # Check if this node has a fault path edge
        fault_edges = [e for e in edges if e.get('source') == node_id and e.get('sourceHandle') == 'fault']
        has_fault_path = len(fault_edges) > 0
        
        # Validate fault path eligibility
        is_valid, error_msg = ErrorHandlingRules.validate_fault_path_on_node(node_type, has_fault_path, node_config)
        if not is_valid:
            node_label = node.get('label', node_id)
            errors.append(f"Node '{node_label}': {error_msg}")
    
    return errors
