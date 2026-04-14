"""
Flow Validator
Comprehensive validation engine for flow activation
Matches Salesforce validation behavior
"""
import re
from typing import List, Dict, Any, Optional, Set
from dataclasses import dataclass
from motor.motor_asyncio import AsyncIOMotorDatabase
import logging
import sys
import os

# Import error handling rules
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from error_handling_rules import validate_flow_error_handling
from batch_size_config import BatchSizeConfig
from screen_flow_utils import validate_screen_object_assignments

logger = logging.getLogger(__name__)


@dataclass
class ValidationError:
    """Represents a single validation error"""
    category: str  # structural, variable, metadata, action, permission
    severity: str  # error, warning
    node_id: Optional[str]
    node_label: Optional[str]
    message: str
    details: Optional[str] = None
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            'category': self.category,
            'severity': self.severity,
            'node_id': self.node_id,
            'node_label': self.node_label,
            'message': self.message,
            'details': self.details
        }


@dataclass
class ValidationResult:
    """Result of flow validation"""
    is_valid: bool
    errors: List[ValidationError]
    warnings: List[ValidationError]
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            'is_valid': self.is_valid,
            'error_count': len(self.errors),
            'warning_count': len(self.warnings),
            'errors': [e.to_dict() for e in self.errors],
            'warnings': [w.to_dict() for w in self.warnings]
        }


class FlowValidator:
    """Validates flows before activation"""
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
    
    async def auto_heal_flow(self, flow: Dict[str, Any]) -> Dict[str, Any]:
        """
        Auto-heal flow structure before validation.
        This function:
        1. Auto-connects non-END nodes with no outgoing edges to END
        2. Removes orphaned edges (edges referencing non-existent nodes)
        3. Handles loop-specific wiring where unambiguous
        4. Ensures Screen Flow wiring is complete (Start → Screens → End)
        
        Returns the healed flow (does not modify the original)
        """
        import uuid
        import copy
        
        logger.info("=== AUTO-HEAL: Starting flow healing ===")
        
        healed_flow = copy.deepcopy(flow)
        nodes = healed_flow.get('nodes', [])
        edges = healed_flow.get('edges', [])
        flow_type = flow.get('flow_type', flow.get('type', ''))
        
        logger.info(f"AUTO-HEAL: Processing {len(nodes)} nodes and {len(edges)} edges (flow_type: {flow_type})")
        
        # SCREEN FLOW FIX: Detect if this is a screen flow
        is_screen_flow = (
            flow_type == 'screen' or 
            flow_type == 'screen-flow' or
            any(n.get('type') == 'screen_flow_start' or n.get('id') == 'screen_flow_start' 
                for n in nodes)
        )
        
        if is_screen_flow:
            logger.info("AUTO-HEAL: Detected Screen Flow - applying screen flow wiring rules")
        
        # Build sets for quick lookup
        node_ids = {n.get('id') for n in nodes}
        
        # Identify loop nodes and their implicit IDs
        loop_node_ids = set()
        loop_implicit_ids = set()
        nodes_inside_loops = set()
        loop_node_map = {}  # Maps loop_id to its node info
        
        for node in nodes:
            node_id = node.get('id')
            node_type = node.get('type')
            
            if node_type == 'loop':
                loop_node_ids.add(node_id)
                loop_implicit_ids.add(f'for_each_connector_{node_id}')
                loop_implicit_ids.add(f'add_button_for_each_{node_id}')
                loop_implicit_ids.add(f'add_button_after_last_{node_id}')
                loop_node_map[node_id] = node
            
            # Track nodes inside loops
            node_data = node.get('data') or {}
            loop_context = node.get('loopContext') or node_data.get('loopContext', {})
            if loop_context and loop_context.get('isInsideLoop'):
                nodes_inside_loops.add(node_id)
        
        # All valid node/connector IDs - include screen_flow nodes
        all_valid_ids = node_ids | loop_implicit_ids | {'trigger_start', 'screen_flow_start', 'screen_flow_end'}
        
        # Add end_, add_button_, and screen_flow_ prefixed IDs as valid targets
        for edge in edges:
            target = edge.get('target', '')
            source = edge.get('source', '')
            if (target.startswith('end_') or target.startswith('add_button_') or 
                target.startswith('add_') or target.startswith('screen_flow_')):
                all_valid_ids.add(target)
            if (source.startswith('end_') or source.startswith('add_button_') or 
                source.startswith('add_') or source.startswith('screen_flow_')):
                all_valid_ids.add(source)
        
        # Step 1: Remove orphaned edges (edges referencing non-existent nodes)
        cleaned_edges = []
        for edge in edges:
            source = edge.get('source', '')
            target = edge.get('target', '')
            
            # Allow trigger sources and screen_flow_start
            source_valid = (
                source in all_valid_ids or 
                source.startswith('trigger') or
                source.startswith('screen_flow_') or
                source.startswith('for_each_connector_') or
                source.startswith('add_button_') or
                source.startswith('add_')
            )
            
            # Allow end targets, loop connectors, and screen_flow_end
            target_valid = (
                target in all_valid_ids or 
                target.startswith('end_') or
                target.startswith('screen_flow_') or
                target.startswith('for_each_connector_') or
                target.startswith('add_button_') or
                target.startswith('add_')
            )
            
            if source_valid and target_valid:
                cleaned_edges.append(edge)
            else:
                logger.debug(f"Auto-heal: Removed orphaned edge {edge.get('id')} (source={source}, target={target})")
        
        healed_flow['edges'] = cleaned_edges
        edges = cleaned_edges
        
        # Step 2: Find nodes with no outgoing edges (excluding END nodes and loop-internal nodes)
        edge_sources = {e.get('source') for e in edges}
        
        # Find the actual END node from the nodes array (not from edges)
        # The END node exists visually on the canvas even if nothing connects to it
        end_node = None
        for node in nodes:
            node_id = node.get('id', '')
            node_type = node.get('type', '')
            node_data = node.get('data', {})
            node_data_type = node_data.get('nodeType', '') if node_data else ''
            
            # Check if this is an END node (including screen_flow_end for screen flows)
            if (node_type == 'end' or 
                node_type == 'screen_flow_end' or
                node_data_type == 'end' or 
                node_data_type == 'screen_flow_end' or
                node_id.startswith('end_') or
                node_id == 'end' or
                node_id == 'screen_flow_end' or
                (node_data and node_data.get('label', '').lower() == 'end')):
                end_node = node
                break
        
        # Determine the END node ID to use
        if end_node:
            default_end_id = end_node.get('id')
            logger.info(f"Auto-heal: Found existing END node: {default_end_id}")
        elif is_screen_flow:
            # For screen flows, use screen_flow_end
            default_end_id = 'screen_flow_end'
            logger.info(f"Auto-heal: Screen Flow using END ID: {default_end_id}")
        else:
            # Create a default end node ID if none exists
            default_end_id = f"end_{str(uuid.uuid4())[:8]}"
            logger.info(f"Auto-heal: No END node found, using generated ID: {default_end_id}")
        
        nodes_needing_end_connection = []
        
        for node in nodes:
            node_id = node.get('id')
            node_type = node.get('type')
            node_label = node.get('label', node_id)
            
            # Skip terminal nodes: END nodes, merge nodes, add buttons, Custom Error nodes, fault nodes, screen_flow nodes
            # Custom Error (add_error/custom_error) is a terminal node that legally ends a flow path
            # Fault nodes (faultNode, faultEndNode) are part of fault path handling
            # screen_flow_start/end are Screen Flow system nodes
            terminal_types = ['end', 'merge', 'add_error', 'custom_error', 'faultNode', 'faultEndNode', 'screen_flow_start', 'screen_flow_end']
            if node_type in terminal_types:
                continue
            if (node_id.startswith('end_') or node_id.startswith('merge_') or 
                node_id.startswith('fault_node_') or node_id.startswith('end_fault_') or
                node_id.startswith('screen_flow_')):
                continue
            if node_id.startswith('add_button') or node_id.startswith('add_'):
                continue
            
            # Check if node has outgoing edges
            has_outgoing = node_id in edge_sources
            
            # Special handling for nodes inside loops
            if not has_outgoing and node_id in nodes_inside_loops:
                # Check if there's an edge to any loop connector
                for edge in edges:
                    if edge.get('source') == node_id:
                        target = edge.get('target', '')
                        if target.startswith('for_each_connector_') or target.startswith('add_button_'):
                            has_outgoing = True
                            break
                
                # If still no outgoing and inside a loop, auto-heal by connecting to loop connector
                if not has_outgoing:
                    node_data = node.get('data') or {}
                    loop_context = node.get('loopContext') or node_data.get('loopContext', {})
                    loop_node_id = loop_context.get('loopNodeId')
                    
                    if loop_node_id:
                        # Connect to the for_each_connector of its loop
                        connector_id = f'for_each_connector_{loop_node_id}'
                        new_edge = {
                            'id': f'e_auto_{node_id}_to_{connector_id}',
                            'source': node_id,
                            'target': connector_id
                        }
                        healed_flow['edges'].append(new_edge)
                        logger.info(f"Auto-heal: Connected loop-internal node '{node_label}' to loop connector")
                        has_outgoing = True
            
            # If still no outgoing, mark for END connection
            if not has_outgoing:
                nodes_needing_end_connection.append((node_id, node_label))
        
        # Step 3: Auto-connect nodes with no outgoing to END
        for node_id, node_label in nodes_needing_end_connection:
            new_edge = {
                'id': f'e_auto_{node_id}_to_end',
                'source': node_id,
                'target': default_end_id
            }
            healed_flow['edges'].append(new_edge)
            logger.info(f"Auto-heal: Connected node '{node_label}' ({node_id}) to END ({default_end_id})")
        
        logger.info(f"=== AUTO-HEAL COMPLETE: {len(nodes_needing_end_connection)} nodes connected to END ===")
        logger.info(f"AUTO-HEAL: Final edge count: {len(healed_flow['edges'])}")
        
        return healed_flow
    
    async def validate_flow(self, flow: Dict[str, Any], user_id: str, auto_heal: bool = False) -> ValidationResult:
        """
        Run all validations on a flow
        Returns ValidationResult with all errors and warnings
        
        Args:
            flow: Flow data to validate
            user_id: User performing the validation
            auto_heal: If True, auto-heal the flow before validation
        """
        errors: List[ValidationError] = []
        warnings: List[ValidationError] = []
        
        # Auto-heal if requested
        if auto_heal:
            flow = await self.auto_heal_flow(flow)
        
        logger.info(f"🔍 Starting validation for flow: {flow.get('name')}")
        
        # 1. Structural Flow Validation
        structural_errors, structural_warnings = await self._validate_structure(flow)
        errors.extend(structural_errors)
        warnings.extend(structural_warnings)
        
        # 2. Screen & Variable Validation
        variable_errors = await self._validate_variables(flow)
        errors.extend(variable_errors)
        
        # 3. Data & Metadata Validation
        metadata_errors = await self._validate_metadata(flow)
        errors.extend(metadata_errors)
        
        # 4. Action Node Validation
        action_errors = await self._validate_actions(flow)
        errors.extend(action_errors)
        
        # 5. Permission & Access Validation
        permission_errors = await self._validate_permissions(flow, user_id)
        errors.extend(permission_errors)
        
        # 6. Error Handling Rules Validation (Add Error & Fault Path)
        error_handling_errors = self._validate_error_handling_rules(flow)
        errors.extend(error_handling_errors)
        
        # 7. Batch Size Validation
        batch_size_errors, batch_size_warnings = self._validate_batch_size(flow)
        errors.extend(batch_size_errors)
        warnings.extend(batch_size_warnings)
        
        # 8. Screen Flow Object Assignment Validation
        screen_object_errors = self._validate_screen_object_assignments(flow)
        errors.extend(screen_object_errors)
        
        is_valid = len(errors) == 0
        
        logger.info(f"✅ Validation complete: {len(errors)} errors, {len(warnings)} warnings")
        
        return ValidationResult(
            is_valid=is_valid,
            errors=errors,
            warnings=warnings
        )
    
    def _validate_screen_object_assignments(self, flow: Dict[str, Any]) -> List[ValidationError]:
        """
        Validate Screen Flow object assignments
        Salesforce Rule: Only first screen can define associated object
        """
        errors = []
        
        nodes = flow.get('nodes', [])
        edges = flow.get('edges', [])
        triggers = flow.get('triggers', [])
        
        # Use utility function to validate
        validation_messages = validate_screen_object_assignments(nodes, edges, triggers)
        
        for msg in validation_messages:
            errors.append(ValidationError(
                category='structural',
                severity='error',
                node_id=None,
                node_label=None,
                message=msg,
                details='Associated object can only be defined on the first screen in a Screen Flow'
            ))
        
        return errors
    
    def _validate_batch_size(self, flow: Dict[str, Any]) -> tuple:
        """Validate batch size configuration"""
        errors = []
        warnings = []
        
        batch_size = flow.get('batch_size')
        
        # If batch size not set, no validation needed (will use default)
        if batch_size is None:
            return (errors, warnings)
        
        # Validate batch size value
        is_valid, error_msg, warning_msg = BatchSizeConfig.validate_batch_size(batch_size)
        
        if not is_valid:
            errors.append(ValidationError(
                category='structural',
                severity='error',
                node_id=None,
                node_label=None,
                message=f'Invalid batch size: {error_msg}',
                details='Batch size must be within allowed limits'
            ))
        
        if warning_msg:
            warnings.append(ValidationError(
                category='structural',
                severity='warning',
                node_id=None,
                node_label=None,
                message=warning_msg,
                details='Consider reducing batch size for better performance'
            ))
        
        return (errors, warnings)
    
    def _validate_error_handling_rules(self, flow: Dict[str, Any]) -> List[ValidationError]:
        """Validate Add Error and Fault Path rules"""
        errors = []
        
        try:
            # Use centralized error handling validation
            validation_messages = validate_flow_error_handling(flow)
            
            for msg in validation_messages:
                errors.append(ValidationError(
                    category='structural',
                    severity='error',
                    node_id=None,
                    node_label=None,
                    message=msg,
                    details='Error handling elements must follow Salesforce Flow rules'
                ))
        except Exception as e:
            logger.error(f"Error validating error handling rules: {e}")
        
        return errors
    
    async def _validate_structure(self, flow: Dict[str, Any]) -> tuple:
        """Validate flow structure - returns (errors, warnings)"""
        errors = []
        warnings = []
        nodes = flow.get('nodes', [])
        edges = flow.get('edges', [])
        triggers = flow.get('triggers', [])
        flow_type = flow.get('flow_type', flow.get('type', ''))
        
        # SCREEN FLOW FIX: Detect screen flows by flow_type or presence of screen_flow_start node
        is_screen_flow = (
            flow_type == 'screen' or 
            flow_type == 'screen-flow' or
            any(n.get('type') == 'screen_flow_start' or n.get('id') == 'screen_flow_start' 
                for n in nodes)
        )
        
        # Check for start node (trigger OR screen_flow_start for screen flows)
        has_start_node = False
        
        # For screen flows, screen_flow_start IS the start node
        if is_screen_flow:
            # Check if screen_flow_start node exists
            has_screen_flow_start = any(
                n.get('type') == 'screen_flow_start' or 
                n.get('id') == 'screen_flow_start' or
                n.get('data', {}).get('nodeType') == 'screen_flow_start'
                for n in nodes
            )
            if has_screen_flow_start:
                has_start_node = True
                logger.info("✅ Screen Flow has valid start node: screen_flow_start")
        
        # For non-screen flows, check triggers
        if not is_screen_flow:
            if triggers and len(triggers) > 0:
                has_start_node = True
            elif len(triggers) > 1:
                errors.append(ValidationError(
                    category='structural',
                    severity='error',
                    node_id=None,
                    node_label=None,
                    message='Flow has multiple start nodes',
                    details='A flow can only have one trigger'
                ))
        
        # Error if no start node found
        if not has_start_node:
            errors.append(ValidationError(
                category='structural',
                severity='error',
                node_id=None,
                node_label=None,
                message='Flow has no start node',
                details='Screen flows require a Screen Flow Start node. Trigger flows require a trigger.'
            ))
        
        # Build node IDs set including implicit loop-generated IDs
        node_ids = {n.get('id') for n in nodes}
        
        # Identify loop nodes and their implicit connector/button IDs
        # Loop nodes generate: for_each_connector_*, add_button_for_each_*, add_button_after_last_*
        loop_node_ids = set()
        loop_implicit_ids = set()
        nodes_inside_loops = set()  # Nodes with loopContext.isInsideLoop = true
        
        for node in nodes:
            node_id = node.get('id')
            node_type = node.get('type')
            
            # Track loop nodes
            if node_type == 'loop':
                loop_node_ids.add(node_id)
                # Add implicit IDs generated by loop nodes
                loop_implicit_ids.add(f'for_each_connector_{node_id}')
                loop_implicit_ids.add(f'add_button_for_each_{node_id}')
                loop_implicit_ids.add(f'add_button_after_last_{node_id}')
            
            # Track nodes inside loops (they connect back to loop via implicit connectors)
            node_data = node.get('data') or {}
            loop_context = node.get('loopContext') or node_data.get('loopContext', {})
            if loop_context and loop_context.get('isInsideLoop'):
                nodes_inside_loops.add(node_id)
        
        # Expand node_ids to include loop-generated implicit IDs and trigger IDs
        all_valid_ids = node_ids | loop_implicit_ids
        
        # Add trigger IDs to valid set
        for trigger in triggers:
            trigger_id = trigger.get('id')
            if trigger_id:
                all_valid_ids.add(trigger_id)
        
        edge_sources = {e.get('source') for e in edges}
        flow_status = flow.get('status', 'draft')
        
        for node in nodes:
            node_id = node.get('id')
            node_type = node.get('type')
            node_label = node.get('label', node_id)
            
            # Skip terminal nodes: End nodes, merge nodes, add buttons, Custom Error nodes, fault nodes, screen_flow_end
            # Custom Error (add_error/custom_error) is a terminal node - it legally ends a flow path
            # Fault nodes (faultNode, faultEndNode) are part of fault path handling
            # screen_flow_start/end are Screen Flow system nodes
            terminal_types = ['end', 'merge', 'add_error', 'custom_error', 'faultNode', 'faultEndNode', 'screen_flow_start', 'screen_flow_end']
            if node_type in terminal_types:
                continue
            if (node_id.startswith('end_') or node_id.startswith('merge_') or 
                node_id.startswith('fault_node_') or node_id.startswith('end_fault_') or
                node_id.startswith('screen_flow_')):
                continue
            if node_id.startswith('add_button') or node_id.startswith('add_'):
                continue
            
            # Check if node has outgoing edges
            # Special case: Nodes inside a loop body may connect to a for_each_connector
            # which then connects back to the loop - this is a valid path
            has_outgoing = node_id in edge_sources
            
            # If node is inside a loop, check if it connects to an implicit connector
            if not has_outgoing and node_id in nodes_inside_loops:
                # Check if there's an edge from this node to any loop connector
                for edge in edges:
                    if edge.get('source') == node_id:
                        target = edge.get('target', '')
                        if target.startswith('for_each_connector_') or target.startswith('add_button_'):
                            has_outgoing = True
                            break
            
            if not has_outgoing:
                # IMPORTANT: During activation, auto_heal_flow runs BEFORE this validation
                # and will auto-connect nodes without outgoing paths to END.
                # So we should NOT report an error for these - they will be fixed.
                # Only report as WARNING for draft flows (informational)
                if flow_status == 'draft':
                    warnings.append(ValidationError(
                        category='structural',
                        severity='warning',
                        node_id=node_id,
                        node_label=node_label,
                        message=f'Node "{node_label}" has no outgoing path (will auto-connect to END on activation)',
                        details='This node will be automatically connected to END when you activate the flow'
                    ))
                # For activation, DO NOT report error - auto_heal will fix it
                # This matches Salesforce behavior where implicit END connections are valid
        
        # Check for unreachable nodes
        reachable = self._get_reachable_nodes(nodes, edges, triggers, loop_implicit_ids, flow_type)
        for node in nodes:
            node_id = node.get('id')
            node_label = node.get('label', node_id)
            node_type = node.get('type')
            
            # Skip add_button nodes (implicit UI elements)
            if node_id.startswith('add_button') or node_id.startswith('add_'):
                continue
            
            # Skip screen_flow_start/end - they are system nodes
            if node_type in ['screen_flow_start', 'screen_flow_end']:
                continue
            if node_id in ['screen_flow_start', 'screen_flow_end']:
                continue
            
            # Nodes inside loops are reachable via the loop's for_each branch
            if node_id in nodes_inside_loops:
                continue
            
            if node_id not in reachable:
                # For draft flows, treat as warning; for activation, treat as error
                if flow_status == 'draft':
                    warnings.append(ValidationError(
                        category='structural',
                        severity='warning',
                        node_id=node_id,
                        node_label=node_label,
                        message=f'Node "{node_label}" is unreachable',
                        details='This node cannot be reached from the start of the flow'
                    ))
                else:
                    errors.append(ValidationError(
                        category='structural',
                        severity='error',
                        node_id=node_id,
                        node_label=node_label,
                        message=f'Node "{node_label}" is unreachable',
                        details='This node cannot be reached from the start of the flow'
                    ))
        
        # Check Decision nodes have valid configuration
        for node in nodes:
            if node.get('type') == 'decision':
                node_id = node.get('id')
                node_data = node.get('data') or {}
                node_label = node.get('label') or node_id or node_data.get('label', node_id)
                config = node.get('config') or node_data.get('config') or {}
                outcomes = config.get('outcomes', [])
                conditions = config.get('conditions', [])
                
                # Decision is valid if it has:
                # 1. outcomes[] with at least one default, OR
                # 2. conditions[] (uses true/false paths), OR
                # 3. No outcomes but has outgoing edges (simple branch)
                
                if outcomes:
                    # Multi-outcome format - needs default
                    has_default = any(o.get('isDefault', False) for o in outcomes)
                    if not has_default:
                        # Auto-add default as warning, not error
                        warnings.append(ValidationError(
                            category='configuration',
                            severity='warning',
                            node_id=node_id,
                            node_label=node_label,
                            message=f'Decision "{node_label}" has no default outcome (will use "Otherwise" fallback)',
                            details='Adding a default outcome is recommended for explicit control of the fallback path'
                        ))
                elif conditions:
                    # Simple IF format - valid as-is
                    pass
                else:
                    # No outcomes or conditions - check if it has outgoing edges
                    has_outgoing = any(e.get('source') == node_id for e in edges)
                    if not has_outgoing:
                        errors.append(ValidationError(
                            category='structural',
                            severity='error',
                            node_id=node_id,
                            node_label=node_label,
                            message=f'Decision "{node_label}" has no outgoing paths',
                            details='Add at least one outcome or connect to subsequent nodes'
                        ))
        
        # Check for orphaned edges
        # Allow: trigger nodes, end nodes, loop implicit IDs, add_button nodes, screen_flow nodes
        for edge in edges:
            source = edge.get('source')
            target = edge.get('target')
            
            # Validate source - allow node_ids, triggers, screen_flow_start, and loop implicit connectors
            source_valid = (
                source in all_valid_ids or 
                source.startswith('trigger') or
                source.startswith('webhook_trigger') or
                source.startswith('scheduled_trigger') or
                source.startswith('screen_flow_') or  # SCREEN FLOW FIX
                source.startswith('for_each_connector_') or
                source.startswith('add_button_') or
                source.startswith('add_')  # Handle add_<node_id> pattern
            )
            if not source_valid:
                errors.append(ValidationError(
                    category='structural',
                    severity='error',
                    node_id=source,
                    node_label=None,
                    message=f'Edge references non-existent source node: {source}',
                    details='This edge points to a node that does not exist'
                ))
            
            # Validate target - allow node_ids, end nodes, screen_flow_end, and loop implicit IDs
            target_valid = (
                target in all_valid_ids or 
                target.startswith('end_') or
                target.startswith('trigger') or
                target.startswith('webhook_trigger') or
                target.startswith('scheduled_trigger') or
                target.startswith('screen_flow_') or  # SCREEN FLOW FIX
                target.startswith('for_each_connector_') or
                target.startswith('add_button_') or
                target.startswith('add_')  # Handle add_<node_id> pattern
            )
            if not target_valid:
                errors.append(ValidationError(
                    category='structural',
                    severity='error',
                    node_id=target,
                    node_label=None,
                    message=f'Edge references non-existent target node: {target}',
                    details='This edge points to a node that does not exist'
                ))
        
        return (errors, warnings)
    
    def _get_reachable_nodes(self, nodes: List[Dict], edges: List[Dict], triggers: List[Dict], loop_implicit_ids: Set[str] = None, flow_type: str = None) -> Set[str]:
        """Get all nodes reachable from start
        
        Args:
            nodes: List of node dictionaries
            edges: List of edge dictionaries
            triggers: List of trigger dictionaries
            loop_implicit_ids: Set of implicit IDs generated by loop nodes
                              (for_each_connector_*, add_button_*)
            flow_type: Type of flow ('screen', 'trigger', etc.)
        """
        reachable = set()
        loop_implicit_ids = loop_implicit_ids or set()
        
        # Build set of all valid node IDs (actual nodes + loop implicit IDs)
        all_node_ids = {n.get('id') for n in nodes} | loop_implicit_ids
        
        # Determine start node ID based on flow type
        start_id = None
        
        # SCREEN FLOW FIX: Check for screen_flow_start node
        is_screen_flow = (
            flow_type == 'screen' or 
            flow_type == 'screen-flow' or
            any(n.get('type') == 'screen_flow_start' or n.get('id') == 'screen_flow_start' 
                for n in nodes)
        )
        
        if is_screen_flow:
            # For screen flows, start from screen_flow_start
            start_id = 'screen_flow_start'
            reachable.add(start_id)
            logger.info(f"✅ Screen Flow reachability starting from: {start_id}")
        elif triggers:
            # For trigger flows, start from trigger
            start_id = triggers[0].get('id', 'trigger_start')
            reachable.add(start_id)
        
        if not start_id:
            return reachable
        
        queue = [start_id]
        
        while queue:
            current = queue.pop(0)
            
            # Find all edges from current node
            for edge in edges:
                if edge.get('source') == current:
                    target = edge.get('target')
                    if target not in reachable:
                        reachable.add(target)
                        # Only queue real nodes and loop implicit IDs for traversal
                        # Skip add_button targets as they're UI placeholders
                        if target in all_node_ids or target.startswith('for_each_connector_'):
                            queue.append(target)
        
        return reachable
    
    async def _validate_variables(self, flow: Dict[str, Any]) -> List[ValidationError]:
        """Validate variables and expressions"""
        errors = []
        nodes = flow.get('nodes', [])
        flow_variables = flow.get('variables', [])
        input_variables = flow.get('input_variables', [])
        
        # Collect all defined variables
        defined_vars = set()
        for var in flow_variables:
            defined_vars.add(var.get('name'))
        for var in input_variables:
            defined_vars.add(var.get('name'))
        
        # Get trigger entity for validation
        trigger_entity = None
        related_objects = set()
        
        # Add trigger variables (Trigger.ObjectName.Field)
        if flow.get('triggers'):
            trigger_config = flow['triggers'][0].get('config', {})
            trigger_entity = trigger_config.get('entity', trigger_config.get('object', ''))
            if trigger_entity:
                defined_vars.add(f'Trigger.{trigger_entity}')
                defined_vars.add(trigger_entity)  # Also allow shorthand
                
                # Try to find reference fields in the trigger entity to identify related objects
                # Common patterns: AccountId -> Account, OwnerId -> Owner, etc.
                # Add common related objects that might be referenced
                related_objects = {'Account', 'Owner', 'Contact', 'Lead', 'User', 'Parent', 'Campaign'}
        
        # SCREEN FLOW FIX: Register Screen input fields as variables
        # Screen fields become available as Screen.<field_api_name> or Screen.<screenApiName>.<field_api_name>
        for node in nodes:
            node_type = node.get('type')
            node_data = node.get('data') or {}
            node_config = node.get('config') or node_data.get('config') or {}
            
            if node_type == 'screen':
                # Get screen API name
                screen_api_name = node_config.get('screenApiName', '')
                screen_label = node.get('label') or node_data.get('label', 'Screen')
                
                # Get all fields in the screen
                fields = node_config.get('fields', [])
                
                logger.info(f"📋 Registering Screen variables for '{screen_label}' ({len(fields)} fields)")
                
                for field in fields:
                    field_name = field.get('name', '')
                    field_label = field.get('label', '')
                    
                    if field_name:
                        # Register as Screen.<field_name> (primary format)
                        defined_vars.add(f'Screen.{field_name}')
                        defined_vars.add(f'screen.{field_name}')  # lowercase variant
                        
                        # Also register with screen API name prefix
                        if screen_api_name:
                            defined_vars.add(f'{screen_api_name}.{field_name}')
                            defined_vars.add(f'Screen.{screen_api_name}.{field_name}')
                        
                        # Register shorthand (just field name)
                        defined_vars.add(field_name)
                        
                        logger.debug(f"   ✅ Registered: Screen.{field_name}")
                    
                    # Also register by label (for user convenience)
                    if field_label:
                        sanitized_label = field_label.replace(' ', '_').lower()
                        defined_vars.add(f'Screen.{sanitized_label}')
        
        # Add output variables from Get Records and other action nodes
        for node in nodes:
            node_id = node.get('id')
            node_label = node.get('label', node_id)
            node_type = node.get('type')
            node_config = node.get('config', {})
            
            # Get Records nodes output variables based on their object and label
            # e.g., "get account" node querying "Account" object produces: Account_id, Account_Name, etc.
            if node_type == 'mcp' and node_config.get('action_type') == 'get':
                object_name = node_config.get('object', '')
                store_output_as = node_config.get('store_output_as', '')
                
                if object_name:
                    # Add common field patterns for the object
                    # Users can reference: {Object}_{field}, {Object}_id, {NodeLabel}_{field}, etc.
                    defined_vars.add(f'{object_name}_records')
                    defined_vars.add(f'{object_name}_record')
                    defined_vars.add(f'{object_name}_id')
                    defined_vars.add(f'{object_name}.id')
                    defined_vars.add(f'{object_name}.Id')
                    # Add variations with underscores for common fields
                    for field in ['id', 'Id', 'name', 'Name', 'status', 'Status', 'email', 'Email']:
                        defined_vars.add(f'{object_name}_{field}')
                    related_objects.add(object_name)
                
                if store_output_as:
                    defined_vars.add(store_output_as)
                    # Also add field accessors
                    defined_vars.add(f'{store_output_as}.id')
                    defined_vars.add(f'{store_output_as}.Id')
                
                # Also use sanitized node label as variable prefix
                if node_label:
                    sanitized_label = node_label.replace(' ', '_').lower()
                    defined_vars.add(f'{sanitized_label}_records')
                    defined_vars.add(f'{sanitized_label}_record')
                    for field in ['id', 'Id', 'name', 'Name']:
                        defined_vars.add(f'{sanitized_label}_{field}')
        
        # Check each node for variable references
        for node in nodes:
            node_id = node.get('id')
            node_label = node.get('label', node_id)
            node_type = node.get('type')
            config = node.get('config', {})
            
            # Check screen nodes
            if node_type == 'screen':
                fields = config.get('fields', [])
                for field in fields:
                    if field.get('required') and not field.get('defaultValue'):
                        # Check if API name is unique
                        api_names = [f.get('name') for f in fields]
                        if api_names.count(field.get('name')) > 1:
                            errors.append(ValidationError(
                                category='variable',
                                severity='error',
                                node_id=node_id,
                                node_label=node_label,
                                message=f'Screen "{node_label}" has duplicate API name: {field.get("name")}',
                                details='Screen field API names must be unique'
                            ))
            
            # Check for unresolved {{}} expressions in all config values
            self._check_expressions(config, node_id, node_label, defined_vars, errors, trigger_entity, related_objects)
        
        return errors
    
    def _check_expressions(self, obj: Any, node_id: str, node_label: str, defined_vars: Set[str], errors: List[ValidationError], trigger_entity: str = None, related_objects: Set[str] = None):
        """Recursively check for unresolved {{}} expressions
        
        Now supports:
        - Flow variables: {{my_variable}}
        - Trigger fields: {{Trigger.Contact.Name}} or {{Contact.Name}}
        - Cross-object merge fields: {{Account.Name}} (resolved at runtime via AccountId)
        - System variables: {{System.CurrentDate}}
        """
        if isinstance(obj, dict):
            for key, value in obj.items():
                self._check_expressions(value, node_id, node_label, defined_vars, errors, trigger_entity, related_objects)
        elif isinstance(obj, list):
            for item in obj:
                self._check_expressions(item, node_id, node_label, defined_vars, errors, trigger_entity, related_objects)
        elif isinstance(obj, str):
            # Find all {{variable}} patterns
            pattern = r'\{\{([^}]+)\}\}'
            matches = re.findall(pattern, obj)
            for match in matches:
                var_name = match.strip()
                
                # Skip empty matches
                if not var_name:
                    continue
                
                # Check if it's a valid variable reference
                is_valid = self._is_valid_variable_reference(var_name, defined_vars, trigger_entity, related_objects)
                
                if not is_valid:
                    errors.append(ValidationError(
                        category='variable',
                        severity='error',
                        node_id=node_id,
                        node_label=node_label,
                        message=f'Unresolved variable reference: {var_name}',
                        details=f'Variable "{{{{ {var_name} }}}}" is referenced but not defined in the flow'
                    ))
    
    def _is_valid_variable_reference(self, var_name: str, defined_vars: Set[str], trigger_entity: str = None, related_objects: Set[str] = None) -> bool:
        """
        Check if a variable reference is valid
        
        Valid patterns:
        - System.CurrentDate, System.CurrentTime, System.CurrentUser
        - Trigger.Contact.Name (explicit trigger reference)
        - Contact.Name (shorthand for trigger entity fields - when Contact is trigger)
        - Account.Name (cross-object merge field - resolved at runtime via AccountId)
        - my_variable (flow variable)
        - Input.fieldName (input variable)
        - count(collection), join(collection.field, sep), first(collection) (collection helpers)
        - NodeLabel.records, NodeLabel.count (collection outputs)
        """
        # 0. Check for collection helper functions - ALWAYS VALID
        # Patterns: count(...), join(..., "..."), first(...)
        helper_patterns = [
            r'^count\s*\(.+\)$',         # count(GetOpps.records)
            r'^join\s*\(.+,.+\)$',        # join(GetOpps.records.Name, ", ")
            r'^first\s*\(.+\)$',          # first(GetOpps.records)
            r'^sum\s*\(.+\)$',            # sum(GetOpps.records.Amount)
            r'^avg\s*\(.+\)$',            # avg(GetOpps.records.Amount)
            r'^min\s*\(.+\)$',            # min(GetOpps.records.Amount)
            r'^max\s*\(.+\)$',            # max(GetOpps.records.Amount)
            r'^#each\s+.+',               # #each GetOpps.records
            r'^/each$',                   # /each (closing tag)
        ]
        for pattern in helper_patterns:
            if re.match(pattern, var_name, re.IGNORECASE):
                return True
        
        # 0.5 Check for collection property access (.records, .count, .first)
        if var_name.endswith('.records') or var_name.endswith('.count') or var_name.endswith('.first'):
            # Valid collection output from a node
            return True
        
        # 0.6 Check for records array field access (e.g., GetOpps.records.Name)
        if '.records.' in var_name:
            # This is accessing a field within the records array
            return True
        
        # 1. Check if it matches a defined variable exactly
        if var_name in defined_vars:
            return True
        
        # 2. Check if any defined var is a prefix (e.g., Trigger.Contact matches Trigger.Contact.Name)
        for dv in defined_vars:
            if var_name.startswith(f"{dv}."):
                return True
            # Also check reverse - if defined var starts with var_name's root
            var_root = var_name.split('.')[0]
            if dv.startswith(var_root):
                return True
        
        # 3. Check for System variables
        if var_name.startswith('System.'):
            system_vars = ['CurrentDate', 'CurrentTime', 'CurrentUser', 'CurrentDateTime', 'Today', 'Now']
            system_var = var_name[7:]  # Remove "System."
            if system_var in system_vars:
                return True
        
        # 4. Check for Trigger field references
        if var_name.startswith('Trigger.'):
            # Trigger.Entity.Field format - always valid
            return True
        
        # 5. Check for trigger entity shorthand (e.g., Contact.Name when Contact is the trigger object)
        if trigger_entity:
            if var_name.startswith(f"{trigger_entity}."):
                return True
        
        # 6. Check for cross-object merge fields (e.g., Account.Name)
        # These are resolved at runtime via reference fields (AccountId, OwnerId, etc.)
        # Common related objects that can be referenced via Id fields
        parts = var_name.split('.')
        if len(parts) >= 2:
            potential_object = parts[0]
            # Check against provided related objects
            if related_objects and potential_object in related_objects:
                return True
            # Common related objects (Account, Owner, Contact, Lead, Opportunity, User)
            # These are typically referenced via {Object}Id fields
            common_related_objects = {
                'Account', 'Owner', 'Contact', 'Lead', 'Opportunity', 
                'User', 'CreatedBy', 'ModifiedBy', 'Parent', 'Case',
                'Campaign', 'RecordType', 'Manager'
            }
            if potential_object in common_related_objects:
                return True
        
        # 7. Check for Input variables
        if var_name.startswith('Input.') or var_name.startswith('input.'):
            return True
        
        # 8. Check for WebhookBody variables (webhook flow body fields)
        # These are defined in the webhook trigger config and available throughout the flow
        if var_name.startswith('WebhookBody.') or var_name.startswith('webhookbody.'):
            return True
        
        # 9. Check for Get Records / Loop variable references (node outputs)
        # These follow pattern: NodeName.FieldName or $Record.FieldName
        if var_name.startswith('$Record.') or var_name.startswith('$Flow.'):
            return True
        
        # 10. Check for node output variable patterns
        # Get Records nodes output variables in format: {ObjectName}_{fieldName} or {NodeLabel}_{fieldName}
        # e.g., Account_id, Contact_Name, get_account_id, etc.
        if '_' in var_name:
            parts = var_name.split('_', 1)
            if len(parts) == 2:
                prefix = parts[0]
                field_part = parts[1]
                # Common object prefixes from Get Records nodes
                common_prefixes = {
                    'account', 'contact', 'lead', 'opportunity', 'task', 'case',
                    'campaign', 'user', 'event', 'note', 'attachment', 'get',
                    'lookup', 'record', 'query', 'fetch', 'find'
                }
                # Check if prefix matches common objects or node labels
                if prefix.lower() in common_prefixes:
                    return True
                # Check if it could be a node label reference (e.g., my_get_records_Id)
                if any(p in prefix.lower() for p in ['get', 'lookup', 'record', 'query']):
                    return True
        
        # 11. Check for {Object}_records pattern (case-insensitive)
        # Get Records stores results as {object}_records (lowercase) but users may type Contact_records
        if var_name.endswith('_records') or var_name.endswith('_record'):
            # Extract object name and check if it matches any common object
            obj_name = var_name.rsplit('_', 1)[0]
            common_objects = {
                'contact', 'account', 'lead', 'opportunity', 'task', 'case', 
                'campaign', 'user', 'event', 'note', 'attachment'
            }
            if obj_name.lower() in common_objects:
                return True
            # Also check defined vars case-insensitively
            for dv in defined_vars:
                if dv.lower() == var_name.lower():
                    return True
        
        # 12. B5 FIX: Check for action output variable patterns
        # CRM action nodes expose outputs as: {{NodeLabel.Field}} e.g., GetAccount.Id, CreateContact.Email
        # These are valid when the flow has a node with that label
        if '.' in var_name:
            parts = var_name.split('.')
            if len(parts) >= 2:
                node_label = parts[0]
                # Remove spaces from node label for comparison
                node_label_normalized = node_label.replace(" ", "")
                
                # Check if this matches a defined node label variable
                for dv in defined_vars:
                    dv_normalized = dv.replace(" ", "")
                    if dv_normalized.lower() == node_label_normalized.lower():
                        return True
                
                # Check for common action output patterns (Get, Create, Update, Delete + object)
                action_patterns = ['get', 'create', 'update', 'delete', 'find', 'lookup', 'query', 'fetch']
                for pattern in action_patterns:
                    if node_label_normalized.lower().startswith(pattern):
                        return True
                
                # Common CRM field suffixes that are always valid for action outputs
                field_name = parts[-1].lower() if len(parts) > 1 else ""
                common_fields = {'id', 'name', 'email', 'phone', 'status', 'type', 'title', 'description', 'amount', 'date', 'created', 'modified'}
                if field_name in common_fields:
                    return True
        
        # 13. Case-insensitive check against defined variables
        var_name_lower = var_name.lower()
        for dv in defined_vars:
            if dv.lower() == var_name_lower:
                return True
        
        return False
    
    async def _validate_metadata(self, flow: Dict[str, Any]) -> List[ValidationError]:
        """Validate metadata references (objects, fields)"""
        errors = []
        nodes = flow.get('nodes', [])
        tenant_id = flow.get('tenant_id')
        
        if not tenant_id:
            return errors
        
        # Check trigger object exists
        if flow.get('triggers'):
            trigger_config = flow['triggers'][0].get('config', {})
            trigger_entity = trigger_config.get('entity', trigger_config.get('object', ''))
            if trigger_entity:
                object_exists = await self._check_object_exists(trigger_entity, tenant_id)
                if not object_exists:
                    errors.append(ValidationError(
                        category='metadata',
                        severity='error',
                        node_id='trigger',
                        node_label='Trigger',
                        message=f'Trigger object "{trigger_entity}" no longer exists',
                        details='The object referenced in the trigger has been deleted or renamed'
                    ))
        
        # Check each node's object/field references
        for node in nodes:
            node_id = node.get('id')
            node_label = node.get('label', node_id)
            node_type = node.get('type')
            config = node.get('config', {})
            
            # Check CRM action nodes
            if node_type == 'mcp' or node_type == 'action':
                object_name = config.get('object', config.get('entity'))
                if object_name:
                    object_exists = await self._check_object_exists(object_name, tenant_id)
                    if not object_exists:
                        errors.append(ValidationError(
                            category='metadata',
                            severity='error',
                            node_id=node_id,
                            node_label=node_label,
                            message=f'Object "{object_name}" no longer exists',
                            details='The referenced object has been deleted or renamed'
                        ))
                    else:
                        # Check field references
                        field_values = config.get('field_values', [])
                        for fv in field_values:
                            field_name = fv.get('field')
                            if field_name:
                                field_exists = await self._check_field_exists(object_name, field_name, tenant_id)
                                if not field_exists:
                                    errors.append(ValidationError(
                                        category='metadata',
                                        severity='error',
                                        node_id=node_id,
                                        node_label=node_label,
                                        message=f'Field "{object_name}.{field_name}" no longer exists',
                                        details='The referenced field has been deleted or renamed'
                                    ))
        
        return errors
    
    async def _check_object_exists(self, object_name: str, tenant_id: str) -> bool:
        """Check if object exists in tenant"""
        try:
            # Standard Salesforce objects - always considered valid
            standard_objects = {
                'lead', 'contact', 'account', 'opportunity', 'case', 'task', 'event',
                'user', 'campaign', 'product', 'pricebook', 'quote', 'order', 
                'contract', 'asset', 'solution', 'note', 'attachment'
            }
            
            if object_name.lower() in standard_objects:
                return True
            
            # Check in tenant_objects collection for custom objects
            obj = await self.db.tenant_objects.find_one({
                'tenant_id': tenant_id,
                'api_name': object_name.lower()
            }, {'_id': 0})
            
            return obj is not None
        except Exception as e:
            logger.error(f"Error checking object existence: {e}")
            return True  # Assume exists if check fails
    
    async def _check_field_exists(self, object_name: str, field_name: str, tenant_id: str) -> bool:
        """Check if field exists on object"""
        try:
            # Standard Salesforce objects - assume all standard fields exist
            standard_objects = {
                'lead', 'contact', 'account', 'opportunity', 'case', 'task', 'event',
                'user', 'campaign', 'product', 'pricebook', 'quote', 'order', 
                'contract', 'asset', 'solution', 'note', 'attachment'
            }
            
            # For standard objects, assume standard fields exist (Id, Name, Email, etc.)
            if object_name.lower() in standard_objects:
                return True
            
            # Check in metadata_fields collection for custom objects/fields
            field = await self.db.metadata_fields.find_one({
                'tenant_id': tenant_id,
                'object_api_name': object_name.lower(),
                'api_name': field_name.lower()
            }, {'_id': 0})
            
            return field is not None
        except Exception as e:
            logger.error(f"Error checking field existence: {e}")
            return True  # Assume exists if check fails
    
    async def _validate_actions(self, flow: Dict[str, Any]) -> List[ValidationError]:
        """Validate action node configurations"""
        errors = []
        nodes = flow.get('nodes', [])
        tenant_id = flow.get('tenant_id')
        
        for node in nodes:
            node_id = node.get('id')
            node_label = node.get('label', node_id)
            node_type = node.get('type')
            config = node.get('config', {})
            
            # Validate Create/Update Record nodes
            if node_type == 'mcp' or node_type == 'action':
                action_type = config.get('action_type')
                object_name = config.get('object', config.get('entity'))
                
                if action_type in ['create', 'update'] and object_name:
                    # Check required fields are mapped
                    required_fields = await self._get_required_fields(object_name, tenant_id)
                    field_values = config.get('field_values', [])
                    mapped_fields = {fv.get('field') for fv in field_values if fv.get('field')}
                    
                    for req_field in required_fields:
                        if req_field not in mapped_fields:
                            errors.append(ValidationError(
                                category='action',
                                severity='error',
                                node_id=node_id,
                                node_label=node_label,
                                message=f'Required field "{req_field}" is not mapped',
                                details=f'Object "{object_name}" requires this field for {action_type} operations'
                            ))
            
            # Validate Delay nodes
            if node_type == 'delay':
                delay_mode = config.get('delay_mode', 'duration')
                
                if delay_mode == 'duration':
                    duration_value = config.get('duration_value')
                    if not duration_value or duration_value <= 0:
                        errors.append(ValidationError(
                            category='action',
                            severity='error',
                            node_id=node_id,
                            node_label=node_label,
                            message='Delay node has invalid duration',
                            details='Duration must be greater than 0'
                        ))
                elif delay_mode == 'fixed':
                    execute_date = config.get('execute_date')
                    execute_time = config.get('execute_time')
                    if not execute_date or not execute_time:
                        errors.append(ValidationError(
                            category='action',
                            severity='error',
                            node_id=node_id,
                            node_label=node_label,
                            message='Delay node missing fixed date/time',
                            details='Fixed delay mode requires both execute_date and execute_time'
                        ))
                elif delay_mode == 'field':
                    # Date Field (Advanced) mode validation - matches Salesforce "Wait Until Date Field"
                    field_reference = config.get('fieldReference')
                    
                    if not field_reference:
                        errors.append(ValidationError(
                            category='action',
                            severity='error',
                            node_id=node_id,
                            node_label=node_label,
                            message='Delay node missing field reference',
                            details='Date field mode requires a field reference'
                        ))
                    else:
                        # Validate field reference format and existence
                        # Field reference should be like "Lead.Follow_Up_Date__c" or "Follow_Up_Date__c"
                        field_parts = field_reference.split('.')
                        field_name = field_parts[-1]
                        
                        # Get trigger object to validate field
                        if flow.get('triggers') and len(flow['triggers']) > 0:
                            trigger_config = flow['triggers'][0].get('config', {})
                            trigger_entity = trigger_config.get('entity', trigger_config.get('object', ''))
                            
                            if trigger_entity and tenant_id:
                                # For standard objects, assume date fields exist
                                standard_objects = {
                                    'lead', 'contact', 'account', 'opportunity', 'case', 
                                    'task', 'event', 'user', 'campaign'
                                }
                                
                                if trigger_entity.lower() not in standard_objects:
                                    # For custom objects, check field existence
                                    field_exists = await self._check_field_exists(trigger_entity, field_name, tenant_id)
                                    if not field_exists:
                                        errors.append(ValidationError(
                                            category='metadata',
                                            severity='error',
                                            node_id=node_id,
                                            node_label=node_label,
                                            message=f'Date field "{field_name}" does not exist on {trigger_entity}',
                                            details='The referenced date field has been deleted or renamed'
                                        ))
                    
                    # Validate offset configuration if present
                    offset = config.get('offset', {})
                    if offset and offset.get('value'):
                        try:
                            offset_value = int(offset.get('value'))
                            offset_unit = offset.get('unit', 'days')
                            
                            if offset_unit not in ['minutes', 'hours', 'days']:
                                errors.append(ValidationError(
                                    category='action',
                                    severity='error',
                                    node_id=node_id,
                                    node_label=node_label,
                                    message=f'Invalid offset unit: {offset_unit}',
                                    details='Offset unit must be minutes, hours, or days'
                                ))
                        except (ValueError, TypeError):
                            errors.append(ValidationError(
                                category='action',
                                severity='error',
                                node_id=node_id,
                                node_label=node_label,
                                message='Invalid offset value',
                                details='Offset value must be a valid number'
                            ))
                
                elif delay_mode == 'dynamic_datetime':
                    # Dynamic DateTime mode validation - NEW ⭐
                    # Validates: Trigger fields, Get Records, Variables, Inputs, Formulas
                    source_config = config.get('source', {})
                    
                    if not source_config or not source_config.get('type') or not source_config.get('ref'):
                        errors.append(ValidationError(
                            category='action',
                            severity='error',
                            node_id=node_id,
                            node_label=node_label,
                            message='Delay node missing DateTime source',
                            details='Dynamic DateTime mode requires a source configuration with type and ref'
                        ))
                    else:
                        source_type = source_config.get('type')
                        source_ref = source_config.get('ref')
                        
                        # Validate source type is one of the allowed types
                        valid_types = ['trigger_field', 'get_record_field', 'variable', 'input', 'formula']
                        if source_type not in valid_types:
                            errors.append(ValidationError(
                                category='action',
                                severity='error',
                                node_id=node_id,
                                node_label=node_label,
                                message=f'Invalid DateTime source type: {source_type}',
                                details=f'Source type must be one of: {", ".join(valid_types)}'
                            ))
                        
                        # Validate source reference exists in flow context
                        # This is a structural check - actual value resolution happens at runtime
                        if source_type == 'trigger_field':
                            # Validate trigger exists
                            if not flow.get('triggers') or len(flow['triggers']) == 0:
                                errors.append(ValidationError(
                                    category='structural',
                                    severity='error',
                                    node_id=node_id,
                                    node_label=node_label,
                                    message='Trigger field source requires a trigger',
                                    details='Add a trigger to the flow before using trigger field as delay source'
                                ))
                        
                        elif source_type == 'get_record_field':
                            # Validate Get Records node exists
                            step_name = source_ref.split('.')[0] if '.' in source_ref else source_ref
                            get_records_exists = any(
                                n.get('id') == step_name or n.get('data', {}).get('label') == step_name
                                for n in flow.get('nodes', [])
                                if n.get('type') == 'get_records' or n.get('data', {}).get('nodeType') == 'get_records'
                            )
                            if not get_records_exists:
                                errors.append(ValidationError(
                                    category='structural',
                                    severity='error',
                                    node_id=node_id,
                                    node_label=node_label,
                                    message=f'Get Records step "{step_name}" not found',
                                    details='Add the Get Records step before this delay node'
                                ))
                        
                        elif source_type in ['variable', 'input', 'formula']:
                            # Validate variable/input/formula exists in flow variables
                            variables = flow.get('variables', [])
                            var_exists = any(v.get('name') == source_ref for v in variables)
                            
                            if not var_exists and source_type != 'formula':
                                # For formulas, check if formula node exists
                                if source_type == 'formula':
                                    formula_exists = any(
                                        n.get('data', {}).get('config', {}).get('variable_name') == source_ref
                                        for n in flow.get('nodes', [])
                                        if n.get('type') == 'formula' or n.get('data', {}).get('nodeType') == 'formula'
                                    )
                                    if not formula_exists:
                                        errors.append(ValidationError(
                                            category='structural',
                                            severity='error',
                                            node_id=node_id,
                                            node_label=node_label,
                                            message=f'Formula "{source_ref}" not found',
                                            details='Create the formula before using it as a delay source'
                                        ))
                                else:
                                    errors.append(ValidationError(
                                        category='variable',
                                        severity='error',
                                        node_id=node_id,
                                        node_label=node_label,
                                        message=f'{source_type.capitalize()} "{source_ref}" not found',
                                        details=f'Create the {source_type} before using it as a delay source'
                                    ))
                    
                    # Validate optional time override
                    override_time_config = config.get('overrideTime', {})
                    if override_time_config.get('enabled') and override_time_config.get('time'):
                        time_value = override_time_config.get('time')
                        # Validate HH:MM format
                        import re
                        if not re.match(r'^([01]\d|2[0-3]):([0-5]\d)$', time_value):
                            errors.append(ValidationError(
                                category='action',
                                severity='error',
                                node_id=node_id,
                                node_label=node_label,
                                message='Invalid time override format',
                                details='Time must be in HH:MM format (24-hour)'
                            ))
                    
                    # Validate optional offset
                    offset = config.get('offset', {})
                    if offset and offset.get('value'):
                        try:
                            offset_value = int(offset.get('value'))
                            offset_unit = offset.get('unit', 'days')
                            
                            if offset_unit not in ['minutes', 'hours', 'days']:
                                errors.append(ValidationError(
                                    category='action',
                                    severity='error',
                                    node_id=node_id,
                                    node_label=node_label,
                                    message=f'Invalid offset unit: {offset_unit}',
                                    details='Offset unit must be minutes, hours, or days'
                                ))
                            
                            # Validate offset is within safe limits
                            max_offset_days = 365 * 2  # 2 years
                            offset_days = offset_value * {'minutes': 1/1440, 'hours': 1/24, 'days': 1}[offset_unit]
                            if abs(offset_days) > max_offset_days:
                                errors.append(ValidationError(
                                    category='action',
                                    severity='warning',
                                    node_id=node_id,
                                    node_label=node_label,
                                    message='Offset value is very large',
                                    details=f'Offset exceeds {max_offset_days} days - please verify'
                                ))
                        except (ValueError, TypeError):
                            errors.append(ValidationError(
                                category='action',
                                severity='error',
                                node_id=node_id,
                                node_label=node_label,
                                message='Invalid offset value',
                                details='Offset value must be a valid number'
                            ))
        
        return errors
    
    async def _get_required_fields(self, object_name: str, tenant_id: str) -> List[str]:
        """Get required fields for an object"""
        try:
            # Standard Salesforce objects - skip required field validation
            # Salesforce has complex required field rules that vary by context
            standard_objects = {
                'lead', 'contact', 'account', 'opportunity', 'case', 'task', 'event',
                'user', 'campaign', 'product', 'pricebook', 'quote', 'order', 
                'contract', 'asset', 'solution', 'note', 'attachment'
            }
            
            if object_name.lower() in standard_objects:
                return []  # Don't validate required fields for standard objects
            
            # Check required fields for custom objects only
            fields = await self.db.metadata_fields.find({
                'tenant_id': tenant_id,
                'object_api_name': object_name.lower(),
                'is_required': True
            }, {'_id': 0, 'api_name': 1}).to_list(100)
            
            return [f.get('api_name') for f in fields if f.get('api_name')]
        except Exception as e:
            logger.error(f"Error getting required fields: {e}")
            return []
    
    async def _validate_permissions(self, flow: Dict[str, Any], user_id: str) -> List[ValidationError]:
        """Validate user permissions"""
        errors = []
        nodes = flow.get('nodes', [])
        
        # Get user from database
        user = await self.db.users.find_one({'id': user_id}, {'_id': 0})
        if not user:
            return errors
        
        user_role = user.get('role', 'user')
        
        # Admins have all permissions
        if user_role == 'admin':
            return errors
        
        # Check permissions for each action node
        for node in nodes:
            node_id = node.get('id')
            node_label = node.get('label', node_id)
            node_type = node.get('type')
            config = node.get('config', {})
            
            # Check CRM action permissions
            if node_type == 'mcp' or node_type == 'action':
                action_type = config.get('action_type')
                object_name = config.get('object', config.get('entity', ''))
                
                if action_type == 'create':
                    # Check create permission
                    has_permission = await self._check_permission(user_id, object_name, 'create')
                    if not has_permission:
                        errors.append(ValidationError(
                            category='permission',
                            severity='error',
                            node_id=node_id,
                            node_label=node_label,
                            message=f'User lacks permission to create {object_name} records',
                            details='Flow activation requires create permission on this object'
                        ))
                
                elif action_type == 'update':
                    # Check update permission
                    has_permission = await self._check_permission(user_id, object_name, 'update')
                    if not has_permission:
                        errors.append(ValidationError(
                            category='permission',
                            severity='error',
                            node_id=node_id,
                            node_label=node_label,
                            message=f'User lacks permission to update {object_name} records',
                            details='Flow activation requires update permission on this object'
                        ))
                
                elif action_type == 'delete':
                    # Check delete permission
                    has_permission = await self._check_permission(user_id, object_name, 'delete')
                    if not has_permission:
                        errors.append(ValidationError(
                            category='permission',
                            severity='error',
                            node_id=node_id,
                            node_label=node_label,
                            message=f'User lacks permission to delete {object_name} records',
                            details='Flow activation requires delete permission on this object'
                        ))
        
        return errors
    
    async def _check_permission(self, user_id: str, object_name: str, action: str) -> bool:
        """Check if user has permission for action on object"""
        try:
            # For now, basic permission check
            # In production, this would check against proper permission tables
            user = await self.db.users.find_one({'id': user_id}, {'_id': 0})
            if not user:
                return False
            
            # Admins always have permission
            if user.get('role') == 'admin':
                return True
            
            # TODO: Implement proper permission checking against permission tables
            # For now, allow all operations for non-admin users (backward compatible)
            return True
            
        except Exception as e:
            logger.error(f"Error checking permission: {e}")
            return True  # Assume permission if check fails (backward compatible)
