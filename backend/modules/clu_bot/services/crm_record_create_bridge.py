"""
Delegates CLU-BOT object record creation to the same implementation as
POST /api/objects/{object_name}/records (create_object_record in records_routes).
Only used from CLU-BOT; keeps permission checks, validation rules, and post-create hooks identical to the API.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, Optional

from fastapi import HTTPException

from modules.records.api.records_routes import (
    RecordCreate,
    RecordUpdate,
    create_object_record,
    update_object_record,
)
from shared.models import User

logger = logging.getLogger(__name__)


def _format_http_exception_detail(detail: Any) -> str:
    if isinstance(detail, dict):
        return str(detail.get("message") or detail.get("detail") or detail)
    return str(detail)


async def create_via_records_route(
    object_name: str,
    data: Dict[str, Any],
    current_user: User,
    record_type_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Invoke create_object_record with the authenticated User (same as REST Depends(get_current_user)).

    Returns:
        {"success": True, "record": dict, "message": str} or
        {"success": False, "message": str, "error": str, "http_status"?: int}
    """
    try:
        created = await create_object_record(
            object_name,
            RecordCreate(
                data=data,
                record_type_id=record_type_id,
                owner_type="USER",
            ),
            current_user,
        )
        dumped = created.model_dump(mode="json")
        return {
            "success": True,
            "record": dumped,
            "message": f"{object_name.title()} created successfully.",
        }
    except HTTPException as e:
        msg = _format_http_exception_detail(e.detail)
        logger.info(
            "Records API create rejected: status=%s detail=%s",
            e.status_code,
            msg,
        )
        return {
            "success": False,
            "error": msg,
            "message": msg,
            "http_status": e.status_code,
        }
    except Exception as e:
        logger.exception("Unexpected error in create_via_records_route")
        return {
            "success": False,
            "error": str(e),
            "message": f"Failed to create record: {str(e)}",
        }


async def update_via_records_route(
    object_name: str,
    record_id: str,
    data: Dict[str, Any],
    current_user: User,
    owner_id: Optional[str] = None,
    owner_type: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Same behavior as PUT /api/objects/{object_name}/records/{record_id} (update_object_record).
    """
    try:
        updated = await update_object_record(
            object_name,
            record_id,
            RecordUpdate(
                data=data,
                owner_id=owner_id,
                owner_type=owner_type or "USER",
            ),
            current_user,
        )
        dumped = updated.model_dump(mode="json")
        return {
            "success": True,
            "record": dumped,
            "message": "Record updated successfully.",
        }
    except HTTPException as e:
        msg = _format_http_exception_detail(e.detail)
        logger.info(
            "Records API update rejected: status=%s detail=%s",
            e.status_code,
            msg,
        )
        return {
            "success": False,
            "error": msg,
            "message": msg,
            "http_status": e.status_code,
            "detail": e.detail if isinstance(e.detail, dict) else None,
        }
    except Exception as e:
        logger.exception("Unexpected error in update_via_records_route")
        return {
            "success": False,
            "error": str(e),
            "message": f"Failed to update record: {str(e)}",
        }
