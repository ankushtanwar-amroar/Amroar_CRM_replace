"""
Salesforce API Routes - Salesforce field fetch and connection endpoints for DocFlow
"""
from fastapi import APIRouter, Depends, HTTPException
from typing import Dict, Any, Optional
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))))

from shared.database import db
from shared.models import User
from shared.auth import get_current_user
from ..services.salesforce_service import SalesforceService

router = APIRouter(prefix="/docflow", tags=["DocFlow Salesforce"])

salesforce_service = SalesforceService(db)


@router.get("/salesforce/test-connection")
async def test_salesforce_connection(
    current_user: User = Depends(get_current_user)
) -> Dict[str, Any]:
    """Test Salesforce API connection."""
    result = await salesforce_service.test_connection()
    if not result.get("connected"):
        # Still return 200 even if disconnected — let frontend handle status
        return result
    return result


@router.get("/salesforce/fields")
async def get_salesforce_fields(
    sobject: str,
    current_user: User = Depends(get_current_user)
) -> Dict[str, Any]:
    """
    Get fields for a Salesforce object.
    Calls: /services/apexrest/publicfields?sobject={ObjectName}

    Supported objects: Lead, Account, Contact, Opportunity
    """
    if not sobject:
        raise HTTPException(status_code=400, detail="sobject parameter is required")

    result = await salesforce_service.get_object_fields(sobject)

    if "error" in result and not result.get("fields"):
        raise HTTPException(status_code=400, detail=result["error"])

    return result
