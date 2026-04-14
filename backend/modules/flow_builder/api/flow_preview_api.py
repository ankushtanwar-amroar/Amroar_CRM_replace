"""
Flow Preview API
Enables testing/previewing Screen Flows before activation
Salesforce-like "Debug/Run/Preview" functionality
"""
from fastapi import APIRouter, Depends, HTTPException
from typing import Dict, Any, Optional
from pydantic import BaseModel
from datetime import datetime, timezone
from uuid import uuid4
import logging

# Corrected imports to match other flow builder modules
from server import db, User
from shared.auth import get_current_user
from ..runtime.flow_runtime import FlowRuntimeEngine
from ..models.flow import Flow, FlowExecution

logger = logging.getLogger(__name__)

router = APIRouter()


class PreviewStartRequest(BaseModel):
    safe_mode: bool = True
    initial_context: Dict[str, Any] = {}


class PreviewNextRequest(BaseModel):
    screen_data: Dict[str, Any] = {}


@router.post("/flows/{flow_id}/preview")
async def start_flow_preview(
    flow_id: str,
    request: PreviewStartRequest,
    current_user: User = Depends(get_current_user)
):
    """
    Start a preview execution of a Screen Flow
    
    - Creates a preview execution (not saved as real execution)
    - Initializes execution context
    - Returns execution_id for subsequent preview steps
    """
    try:
        # Get flow
        flow_data = await db.flows.find_one({"id": flow_id}, {"_id": 0})
        if not flow_data:
            raise HTTPException(status_code=404, detail="Flow not found")
        
        flow = Flow(**flow_data)
        
        # Verify it's a Screen Flow (both 'screen' and 'screen-flow' are valid)
        if flow.flow_type not in ["screen", "screen-flow"]:
            raise HTTPException(
                status_code=400, 
                detail="Preview is only available for Screen Flows"
            )
        
        # Create preview execution
        execution_id = str(uuid4())
        
        # Initialize context with system variables if needed
        initial_context = request.initial_context.copy()
        
        # For record_detail mode, add recordId if provided
        if flow.launch_mode == "record_detail" and "recordId" not in initial_context:
            # Use mock recordId for preview
            initial_context["recordId"] = "preview_mock_record_id"
        
        # For list_view mode, add recordIds if provided
        if flow.launch_mode == "list_view" and "recordIds" not in initial_context:
            # Use mock recordIds for preview
            initial_context["recordIds"] = ["preview_mock_record_1", "preview_mock_record_2"]
        
        # Store preview execution in memory (or temporary collection)
        preview_execution = {
            "id": execution_id,
            "flow_id": flow_id,
            "status": "running",
            "safe_mode": request.safe_mode,
            "context": initial_context,
            "current_node_index": 0,
            "created_at": datetime.now(timezone.utc),
            "is_preview": True
        }
        
        # Store in preview_executions collection (temporary)
        await db.preview_executions.insert_one(preview_execution)
        
        logger.info(f"Preview started for flow {flow_id}: {execution_id} (safe_mode={request.safe_mode})")
        
        return {
            "execution_id": execution_id,
            "safe_mode": request.safe_mode,
            "initial_context": initial_context
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error starting preview: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/flows/{flow_id}/preview/{execution_id}/next")
async def preview_next_step(
    flow_id: str,
    execution_id: str,
    request: PreviewNextRequest,
    current_user: User = Depends(get_current_user)
):
    """
    Execute next step in preview
    
    - Processes screen input data
    - Evaluates decisions
    - Executes actions (in safe mode if enabled)
    - Returns next screen or completion status
    """
    try:
        # Get preview execution
        preview_exec = await db.preview_executions.find_one({"id": execution_id}, {"_id": 0})
        if not preview_exec:
            raise HTTPException(status_code=404, detail="Preview execution not found")
        
        # Get flow
        flow_data = await db.flows.find_one({"id": flow_id}, {"_id": 0})
        if not flow_data:
            raise HTTPException(status_code=404, detail="Flow not found")
        
        flow = Flow(**flow_data)
        
        # Update context with screen data
        context = preview_exec.get("context", {})
        if request.screen_data:
            # Store screen data as nested Screen object for proper {{Screen.field}} resolution
            # Also store flat keys for backwards compatibility
            if 'Screen' not in context:
                context['Screen'] = {}
            for key, value in request.screen_data.items():
                context['Screen'][key] = value  # Nested for {{Screen.key}} syntax
                context[f"Screen.{key}"] = value  # Flat for direct access
        
        # Get current node index
        current_index = preview_exec.get("current_node_index", 0)
        
        # Find next node to execute
        nodes = flow.nodes or []
        if current_index >= len(nodes):
            # No more nodes - flow complete
            await db.preview_executions.update_one(
                {"id": execution_id},
                {"$set": {"status": "completed"}}
            )
            return {
                "node_type": "end",
                "status": "completed"
            }
        
        current_node = nodes[current_index]
        node_type = current_node.type
        node_config = current_node.config or {}
        
        # Execute based on node type
        if node_type == "screen_flow_start":
            # Start node - just advance to next node
            await db.preview_executions.update_one(
                {"id": execution_id},
                {
                    "$set": {
                        "context": context,
                        "current_node_index": current_index + 1
                    }
                }
            )
            
            # Auto-advance to next node
            return await preview_next_step(flow_id, execution_id, PreviewNextRequest(screen_data={}), current_user)
        
        if node_type == "screen":
            # Return screen configuration for rendering
            await db.preview_executions.update_one(
                {"id": execution_id},
                {
                    "$set": {
                        "context": context,
                        "current_node_index": current_index + 1
                    }
                }
            )
            
            return {
                "node_type": "screen",
                "current_node_id": current_node.id,
                "screen_config": {
                    "label": current_node.data.get("label", "Screen"),
                    "description": node_config.get("description", ""),
                    "components": node_config.get("components", [])
                }
            }
        
        elif node_type == "decision":
            # Evaluate decision outcomes
            # This is simplified - in real implementation, use decision evaluation logic
            outcome = "default"  # Placeholder
            
            await db.preview_executions.update_one(
                {"id": execution_id},
                {
                    "$set": {
                        "context": context,
                        "current_node_index": current_index + 1
                    }
                }
            )
            
            return {
                "node_type": "decision",
                "current_node_id": current_node.id,
                "node_label": current_node.data.get("label", "Decision"),
                "details": f"Outcome: {outcome}",
                "continue": True
            }
        
        elif node_type in ["create_record", "update_record", "delete_record", "get_records"]:
            # Execute action (safe mode handling)
            safe_mode = preview_exec.get("safe_mode", True)
            
            if safe_mode:
                # Simulate action - don't actually write to DB
                result = {
                    "simulated": True,
                    "action": node_type,
                    "would_execute": f"{node_type} on {node_config.get('object', 'Unknown')}"
                }
            else:
                # Real execution - use runtime engine
                # TODO: Integrate with real runtime engine
                result = {"executed": True}
            
            await db.preview_executions.update_one(
                {"id": execution_id},
                {
                    "$set": {
                        "context": context,
                        "current_node_index": current_index + 1
                    }
                }
            )
            
            return {
                "node_type": "action",
                "current_node_id": current_node.id,
                "node_label": current_node.data.get("label", "Action"),
                "details": f"Action: {node_type} (safe_mode={safe_mode})",
                "result": result,
                "continue": True
            }
        
        elif node_type == "end":
            # Flow completed
            await db.preview_executions.update_one(
                {"id": execution_id},
                {"$set": {"status": "completed"}}
            )
            
            return {
                "node_type": "end",
                "status": "completed"
            }
        
        else:
            # Unknown node type - skip
            await db.preview_executions.update_one(
                {"id": execution_id},
                {"$set": {"current_node_index": current_index + 1}}
            )
            
            return {
                "node_type": "unknown",
                "continue": True
            }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in preview next step: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/flows/{flow_id}/preview/{execution_id}")
async def stop_flow_preview(
    flow_id: str,
    execution_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Stop and cleanup preview execution
    """
    try:
        # Delete preview execution
        result = await db.preview_executions.delete_one({"id": execution_id})
        
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Preview execution not found")
        
        logger.info(f"Preview stopped: {execution_id}")
        
        return {"status": "stopped"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error stopping preview: {e}")
        raise HTTPException(status_code=500, detail=str(e))
