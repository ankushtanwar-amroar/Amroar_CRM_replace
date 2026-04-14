"""
Screen Flow First Screen Detection
Determines if a screen is the first screen in a Screen Flow
Matches Salesforce Screen Flow behavior
"""
from typing import Dict, Any, List, Set, Optional


def is_first_screen(
    screen_node_id: str,
    nodes: List[Dict[str, Any]],
    edges: List[Dict[str, Any]],
    triggers: List[Dict[str, Any]]
) -> bool:
    """
    Determine if a screen is the first screen in the flow
    
    Salesforce Rule:
        - The first screen is the first screen element reachable from the start node
        - Determined by flow graph topology, NOT creation order
        - Only the first screen can define the associated object
    
    Args:
        screen_node_id: ID of the screen node to check
        nodes: List of all flow nodes
        edges: List of all flow edges
        triggers: List of flow triggers
        
    Returns:
        True if this is the first screen, False otherwise
    """
    if not nodes or not edges:
        return True  # If no graph structure, assume first
    
    # Get all screen nodes
    screen_nodes = [n for n in nodes if n.get('type') == 'screen']
    
    if not screen_nodes:
        return True
    
    # Find the first screen reachable from start/trigger
    first_screen = find_first_screen_in_flow(nodes, edges, triggers)
    
    if not first_screen:
        # No reachable screen found, check if this is the only screen
        return screen_node_id == screen_nodes[0].get('id')
    
    return screen_node_id == first_screen


def find_first_screen_in_flow(
    nodes: List[Dict[str, Any]],
    edges: List[Dict[str, Any]],
    triggers: List[Dict[str, Any]]
) -> Optional[str]:
    """
    Find the first screen node reachable from the start of the flow
    
    Uses breadth-first search from trigger/start node
    
    Args:
        nodes: List of all flow nodes
        edges: List of all flow edges
        triggers: List of flow triggers
        
    Returns:
        Node ID of first screen, or None if no screen reachable
    """
    # Determine start node
    start_node_id = None
    if triggers and len(triggers) > 0:
        start_node_id = triggers[0].get('id', 'trigger_start')
    else:
        # Look for start/trigger node
        for node in nodes:
            if node.get('type') in ['trigger', 'start']:
                start_node_id = node.get('id')
                break
    
    if not start_node_id:
        # No clear start, return first screen by order
        screen_nodes = [n for n in nodes if n.get('type') == 'screen']
        return screen_nodes[0].get('id') if screen_nodes else None
    
    # BFS from start node to find first screen
    visited = set()
    queue = [start_node_id]
    visited.add(start_node_id)
    
    while queue:
        current_id = queue.pop(0)
        
        # Check if current node is a screen
        current_node = next((n for n in nodes if n.get('id') == current_id), None)
        if current_node and current_node.get('type') == 'screen':
            return current_id  # Found first screen
        
        # Add connected nodes to queue
        for edge in edges:
            if edge.get('source') == current_id:
                target_id = edge.get('target')
                if target_id and target_id not in visited:
                    visited.add(target_id)
                    queue.append(target_id)
    
    return None  # No screen reachable from start


def get_first_screen_object(
    nodes: List[Dict[str, Any]],
    edges: List[Dict[str, Any]],
    triggers: List[Dict[str, Any]]
) -> Optional[str]:
    """
    Get the associated object from the first screen in the flow
    
    Args:
        nodes: List of all flow nodes
        edges: List of all flow edges
        triggers: List of flow triggers
        
    Returns:
        Associated object name from first screen, or None
    """
    first_screen_id = find_first_screen_in_flow(nodes, edges, triggers)
    
    if not first_screen_id:
        return None
    
    # Find the first screen node
    first_screen = next((n for n in nodes if n.get('id') == first_screen_id), None)
    
    if not first_screen:
        return None
    
    # Get associated object from config
    config = first_screen.get('config', {}) or first_screen.get('data', {}).get('config', {})
    return config.get('associatedObject')


def validate_screen_object_assignments(
    nodes: List[Dict[str, Any]],
    edges: List[Dict[str, Any]],
    triggers: List[Dict[str, Any]]
) -> List[str]:
    """
    Validate that only the first screen has an associated object defined
    
    Salesforce Rule:
        - Only first screen can define associated object
        - Subsequent screens must NOT define object
    
    Args:
        nodes: List of all flow nodes
        edges: List of all flow edges
        triggers: List of flow triggers
        
    Returns:
        List of error messages (empty if valid)
    """
    errors = []
    
    # Find first screen
    first_screen_id = find_first_screen_in_flow(nodes, edges, triggers)
    
    if not first_screen_id:
        return errors  # No screens, nothing to validate
    
    # Check all screen nodes
    for node in nodes:
        if node.get('type') != 'screen':
            continue
        
        node_id = node.get('id')
        node_label = node.get('label', node_id)
        
        # Get config
        config = node.get('config', {}) or node.get('data', {}).get('config', {})
        associated_object = config.get('associatedObject')
        
        # If this is NOT the first screen and has an associated object defined
        if node_id != first_screen_id and associated_object:
            errors.append(
                f"Screen '{node_label}' incorrectly defines an associated object. "
                f"Only the first screen in a Screen Flow can define the object. "
                f"Remove the object assignment from this screen."
            )
    
    return errors
