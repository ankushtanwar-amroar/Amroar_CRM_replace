"""
Screen Flow Launch Modes - Salesforce Parity

Implements three launch modes for Screen Flows:
1. BASIC MODE (Use Anywhere) - No record context
2. RECORD DETAIL MODE - Single record context with recordId
3. LIST VIEW MODE - Multiple records context with recordIds
"""
from typing import List, Dict, Any, Optional
from enum import Enum

class ScreenFlowLaunchMode(str, Enum):
    """Screen Flow launch modes matching Salesforce behavior"""
    BASIC = "basic"  # Use Anywhere - Home/App pages, no record context
    RECORD_DETAIL = "record_detail"  # Record Detail Page - Single record
    LIST_VIEW = "list_view"  # List View - Multiple records (bulk)


def get_system_variables_for_mode(launch_mode: str) -> List[Dict[str, Any]]:
    """
    Get system-defined variables for a Screen Flow launch mode.
    
    Salesforce Behavior:
    - BASIC MODE: No system variables
    - RECORD DETAIL MODE: recordId (Text)
    - LIST VIEW MODE: recordIds (Text Collection), selectedCount (Number)
    
    All system variables are:
    - Read-only
    - Cannot be deleted
    - Cannot be renamed
    - Available for input = TRUE
    - Automatically populated at runtime
    """
    if launch_mode == ScreenFlowLaunchMode.BASIC:
        # Basic Mode: No system variables
        # Flow launched from Home/App pages without record context
        return []
    
    elif launch_mode == ScreenFlowLaunchMode.RECORD_DETAIL:
        # Record Detail Mode: Single record context
        # Salesforce automatically passes recordId when flow is on record page
        return [
            {
                "name": "recordId",
                "label": "Record ID",
                "type": "Text",
                "data_type": "String",
                "is_system": True,  # Marks as system-defined
                "is_required": False,
                "is_input": True,  # Available for input
                "is_output": False,
                "default_value": None,
                "description": "System variable - The ID of the current record. Automatically populated when flow is launched from a record page."
            }
        ]
    
    elif launch_mode == ScreenFlowLaunchMode.LIST_VIEW:
        # List View Mode: Multiple records context (bulk action)
        # Salesforce passes selected record IDs when bulk action is triggered
        return [
            {
                "name": "recordIds",
                "label": "Record IDs",
                "type": "Text",
                "data_type": "String",
                "is_collection": True,  # Text Collection
                "is_system": True,
                "is_required": False,
                "is_input": True,
                "is_output": False,
                "default_value": None,
                "description": "System variable - Collection of selected record IDs. Automatically populated when flow is launched from list view bulk action."
            },
            {
                "name": "selectedCount",
                "label": "Selected Count",
                "type": "Number",
                "data_type": "Number",
                "is_system": True,
                "is_required": False,
                "is_input": False,  # Not an input, calculated at runtime
                "is_output": False,
                "default_value": 0,
                "description": "System variable - Count of selected records. Equals the number of items in recordIds."
            }
        ]
    
    return []


def validate_system_variables(variables: List[Dict[str, Any]], launch_mode: str) -> List[str]:
    """
    Validate that system variables are not modified or deleted.
    
    Returns list of validation errors.
    """
    errors = []
    
    # Get expected system variables for this mode
    expected_system_vars = get_system_variables_for_mode(launch_mode)
    expected_names = {var["name"] for var in expected_system_vars}
    
    # Check if system variables are present
    for expected_var in expected_system_vars:
        var_name = expected_var["name"]
        found = False
        
        for var in variables:
            if var.get("name") == var_name:
                found = True
                
                # Check if system variable was modified
                if not var.get("is_system"):
                    errors.append(f"System variable '{var_name}' cannot be modified or marked as non-system")
                
                # Check if type was changed
                if var.get("type") != expected_var["type"]:
                    errors.append(f"System variable '{var_name}' type cannot be changed from {expected_var['type']}")
                
                break
        
        if not found:
            errors.append(f"System variable '{var_name}' is required for {launch_mode} mode and cannot be deleted")
    
    # Check for user variables with same names as system variables
    for var in variables:
        var_name = var.get("name")
        if var_name in expected_names and not var.get("is_system"):
            errors.append(f"Cannot create user variable with name '{var_name}' - reserved for system use")
    
    return errors


def should_show_object_selection(flow_type: str, launch_mode: Optional[str] = None) -> bool:
    """
    Determine if object selection should be shown in the UI.
    
    Salesforce Rules:
    - Trigger Flows: YES (need to know which object triggers the flow)
    - Scheduled Flows: YES (need to know which object to query)
    - Screen Flows: NO (object is implied by launch context)
      - BASIC MODE: No record context, object selection irrelevant
      - RECORD DETAIL MODE: Object implied by record page
      - LIST VIEW MODE: Object implied by list view
    """
    if flow_type == "screen":
        # Screen Flows NEVER show object selection
        # Reason: Object is either not needed (basic) or implied by context (record/list)
        return False
    
    # Trigger and Scheduled flows need object selection
    return flow_type in ["trigger", "scheduled"]


def inject_runtime_context(launch_mode: str, context: Dict[str, Any], flow_object: Optional[str] = None) -> Dict[str, Any]:
    """
    Inject system variable values at runtime based on launch mode.
    
    Args:
        launch_mode: The Screen Flow launch mode
        context: Runtime context (may contain recordId, recordIds, etc.)
        flow_object: The object this Screen Flow is scoped to (for record_detail and list_view)
    
    Returns:
        Updated context with system variables populated
    
    Raises:
        ValueError: If flow_object doesn't match context object
    """
    if launch_mode == ScreenFlowLaunchMode.RECORD_DETAIL:
        # Ensure recordId is in context
        if "recordId" not in context:
            context["recordId"] = context.get("record_id") or context.get("id")
        
        # Validate object if specified
        if flow_object and "objectType" in context:
            if context["objectType"].lower() != flow_object.lower():
                raise ValueError(
                    f"Flow is scoped to {flow_object} but received record of type {context['objectType']}. "
                    f"This flow can only run on {flow_object} records."
                )
    
    elif launch_mode == ScreenFlowLaunchMode.LIST_VIEW:
        # Ensure recordIds and selectedCount are in context
        if "recordIds" not in context:
            record_ids = context.get("record_ids") or context.get("selected_ids") or []
            context["recordIds"] = record_ids
            context["selectedCount"] = len(record_ids)
        
        # Validate object if specified
        if flow_object and "objectType" in context:
            if context["objectType"].lower() != flow_object.lower():
                raise ValueError(
                    f"Flow is scoped to {flow_object} list view but received records of type {context['objectType']}. "
                    f"This flow can only run on {flow_object} list view."
                )
    
    return context
