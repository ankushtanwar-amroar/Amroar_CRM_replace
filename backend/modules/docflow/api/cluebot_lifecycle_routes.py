"""
ClueBot Lifecycle API Routes
Adds stage-aware chat endpoints across full DocFlow template lifecycle.
"""
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from shared.auth import get_current_user
from shared.database import db
from shared.models import User
from ..services.cluebot_lifecycle_service import ClueBotLifecycleService

router = APIRouter(prefix="/docflow", tags=["DocFlow ClueBot Lifecycle"])
cluebot_lifecycle = ClueBotLifecycleService(db)


class LifecycleChatRequest(BaseModel):
    message: str
    stage: Optional[str] = "auto"  # auto|creation|editor|merge_crm|validation|send_flow|troubleshoot
    context: Optional[Dict[str, Any]] = {}


@router.get("/cluebot/lifecycle/capabilities")
async def get_cluebot_lifecycle_capabilities(
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """
    Returns the capability matrix for lifecycle ClueBot support.
    """
    return {"success": True, "capabilities": cluebot_lifecycle.capability_matrix()}


@router.post("/cluebot/lifecycle/chat")
async def cluebot_lifecycle_chat(
    request: LifecycleChatRequest,
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """
    Stage-aware ClueBot lifecycle chat.
    """
    result = await cluebot_lifecycle.lifecycle_chat(
        message=request.message,
        stage=request.stage or "auto",
        context=request.context or {},
    )

    if not result.get("success"):
        if result.get("retry_after"):
            raise HTTPException(
                status_code=429,
                detail=result.get("error"),
                headers={"Retry-After": str(result["retry_after"])},
            )
        raise HTTPException(status_code=500, detail=result.get("error", "Unknown lifecycle chat error"))

    return result
