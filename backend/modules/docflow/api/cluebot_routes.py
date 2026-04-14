"""
ClueBot API Routes - AI assistant endpoints for DocFlow
All endpoints are policy-enforced via CluBot Control Center config.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Dict, Any, Optional
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))))

from shared.database import db
from shared.models import User
from shared.auth import get_current_user
from ..services.cluebot_service import ClueBotService
from ..services.cluebot_policy_enforcer import (
    ClueBotPolicyEnforcer,
    ACTION_ENTITY_MAP,
    EMAIL_ACTION,
    VALIDATE_ACTION,
)

router = APIRouter(prefix="/docflow", tags=["DocFlow ClueBot"])

cluebot_service = ClueBotService(db)
policy_enforcer = ClueBotPolicyEnforcer(db)


# ── Request Models ─────────────────────────────────

class ChatRequest(BaseModel):
    message: str
    context: Optional[Dict[str, Any]] = {}


class EmailRequest(BaseModel):
    template_name: str
    recipient_name: Optional[str] = ""
    document_url: Optional[str] = ""
    custom_prompt: Optional[str] = ""


class ValidateRequest(BaseModel):
    template_data: Dict[str, Any]


# ── Endpoints ──────────────────────────────────────

@router.post("/cluebot/chat")
async def cluebot_chat(
    request: ChatRequest,
    current_user: User = Depends(get_current_user)
) -> Dict[str, Any]:
    """
    ClueBot chat endpoint — template builder assistant.
    Policy-enforced: checks enabled state and entity permissions before executing.
    For write actions, permission is validated after the LLM determines the action type,
    then safety controls (confirmation, preview) are surfaced to the frontend.
    """
    tenant_id = current_user.tenant_id

    # Step 1: Load config and check if CluBot is enabled
    config = await policy_enforcer.load_config(tenant_id)
    if not policy_enforcer.is_enabled(config):
        raise HTTPException(
            status_code=403,
            detail="CluBot is currently disabled. An admin can enable it in AI & Automation settings."
        )

    # Step 2: Get LLM context enrichment from config
    llm_context = policy_enforcer.get_llm_context(config)

    # Step 3: Call the LLM with enriched context
    result = await cluebot_service.chat(
        message=request.message,
        context=request.context,
        policy_context=llm_context,
    )

    if not result.get("success"):
        if result.get("retry_after"):
            raise HTTPException(
                status_code=429,
                detail=result.get("error"),
                headers={"Retry-After": str(result["retry_after"])}
            )
        raise HTTPException(status_code=500, detail=result.get("error"))

    # Step 4: Post-LLM enforcement — check permissions for the determined action
    action_type = result.get("action", "ANSWER")
    mapped = ACTION_ENTITY_MAP.get(action_type, (None, "read"))
    entity, operation = mapped

    if entity:
        allowed, reason = policy_enforcer.check_permission(config, entity, operation)
        if not allowed:
            # Block the write action, return the response as informational only
            return {
                "success": True,
                "action": "BLOCKED",
                "original_action": action_type,
                "response": f"Action blocked by policy: {reason}",
                "policy_blocked": True,
                "policy_reason": reason,
            }

    # Step 5: Apply safety controls for write actions
    is_write = operation in ("create", "update", "execute")
    safety = policy_enforcer.check_safety(config, is_write)

    if is_write:
        result["safety"] = safety

    # Step 6: Log the action
    if is_write and config.get("logs", {}).get("logging_enabled", True):
        log_status = "completed"
        if safety.get("require_confirmation") or safety.get("preview_before_execution"):
            log_status = "requires_review"

        await policy_enforcer.log_action(
            tenant_id=tenant_id,
            user_id=current_user.id,
            action=action_type,
            entity=entity or "unknown",
            details=f"Chat command: {request.message[:200]}",
            status=log_status,
        )

    return result


@router.post("/cluebot/email")
async def cluebot_generate_email(
    request: EmailRequest,
    current_user: User = Depends(get_current_user)
) -> Dict[str, Any]:
    """
    Generate email subject + body for document delivery.
    Policy-enforced: requires CluBot enabled + documents read permission.
    """
    tenant_id = current_user.tenant_id
    entity, operation = EMAIL_ACTION

    allowed, reason, config = await policy_enforcer.enforce(
        tenant_id=tenant_id,
        action_type="EMAIL",
        entity=entity,
        operation=operation,
    )
    if not allowed:
        raise HTTPException(status_code=403, detail=reason)

    llm_context = policy_enforcer.get_llm_context(config)

    result = await cluebot_service.generate_email(
        template_name=request.template_name,
        recipient_name=request.recipient_name,
        document_url=request.document_url,
        custom_prompt=request.custom_prompt,
        policy_context=llm_context,
    )

    if not result.get("success"):
        if result.get("retry_after"):
            raise HTTPException(
                status_code=429,
                detail=result.get("error"),
                headers={"Retry-After": str(result["retry_after"])}
            )
        raise HTTPException(status_code=500, detail=result.get("error"))

    # Log the action
    if config.get("logs", {}).get("logging_enabled", True):
        await policy_enforcer.log_action(
            tenant_id=tenant_id,
            user_id=current_user.id,
            action="GENERATE_EMAIL",
            entity="documents",
            details=f"Email generated for template: {request.template_name}",
            status="completed",
        )

    return result


@router.post("/cluebot/validate")
async def cluebot_validate(
    request: ValidateRequest,
    current_user: User = Depends(get_current_user)
) -> Dict[str, Any]:
    """
    AI-powered template validation.
    Policy-enforced: requires CluBot enabled + templates read permission.
    """
    tenant_id = current_user.tenant_id
    entity, operation = VALIDATE_ACTION

    allowed, reason, config = await policy_enforcer.enforce(
        tenant_id=tenant_id,
        action_type="VALIDATE",
        entity=entity,
        operation=operation,
    )
    if not allowed:
        raise HTTPException(status_code=403, detail=reason)

    llm_context = policy_enforcer.get_llm_context(config)

    result = await cluebot_service.validate_template_ai(
        template_data=request.template_data,
        policy_context=llm_context,
    )

    if not result.get("success"):
        if result.get("retry_after"):
            raise HTTPException(
                status_code=429,
                detail=result.get("error"),
                headers={"Retry-After": str(result["retry_after"])}
            )
        raise HTTPException(status_code=500, detail=result.get("error"))

    # Log the action
    if config.get("logs", {}).get("logging_enabled", True):
        await policy_enforcer.log_action(
            tenant_id=tenant_id,
            user_id=current_user.id,
            action="VALIDATE_TEMPLATE",
            entity="templates",
            details=f"Template validation: {request.template_data.get('name', 'Untitled')}",
            status="completed",
        )

    return result


@router.get("/cluebot/policy-status")
async def cluebot_policy_status(
    current_user: User = Depends(get_current_user)
) -> Dict[str, Any]:
    """
    Returns the current CluBot policy status for the frontend.
    Used by UI to show/hide CluBot features based on config.
    """
    config = await policy_enforcer.load_config(current_user.tenant_id)
    enabled = policy_enforcer.is_enabled(config)
    tools = policy_enforcer.get_allowed_tools(config)
    permissions = config.get("permissions", {})

    return {
        "enabled": enabled,
        "scope": config.get("general", {}).get("scope", "docflow"),
        "tools": tools,
        "permissions": {
            "entities": permissions.get("entities", {}),
            "require_confirmation": permissions.get("require_confirmation", True),
            "preview_before_execution": permissions.get("preview_before_execution", True),
            "block_direct_db_mutations": permissions.get("block_direct_db_mutations", True),
        },
    }
