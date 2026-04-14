"""
Leads Routes - Lead conversion, web-to-lead, and search functionality
Extracted from server.py as part of Phase 3 refactoring.
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Dict, Any, Optional, List
from datetime import datetime, timezone
import uuid
import logging

from config.database import db
from modules.auth.api.auth_routes import get_current_user
from shared.models import User
from shared.constants import LEAD_CONVERSION_MAPPINGS

router = APIRouter(tags=["Leads"])


# ============================================================================
# PYDANTIC MODELS
# ============================================================================

class DuplicateRecord(BaseModel):
    """Represents a potential duplicate record"""
    id: str
    name: str
    email: Optional[str] = None
    score: float


class ConvertLeadRequest(BaseModel):
    """Request body for lead conversion"""
    account_action: str = "create"  # "create" or "link"
    account_id: Optional[str] = None  # If linking to existing
    account_name: Optional[str] = None  # Override for new account name
    contact_action: str = "create"  # "create" or "link"
    contact_id: Optional[str] = None  # If linking to existing
    create_opportunity: bool = True
    opportunity_name: Optional[str] = None
    opportunity_amount: Optional[float] = None


class ConvertLeadResponse(BaseModel):
    """Response for lead conversion"""
    success: bool
    message: str
    account_id: Optional[str] = None
    contact_id: Optional[str] = None
    opportunity_id: Optional[str] = None
    lead_id: str
    duplicate_accounts: List[DuplicateRecord] = []
    duplicate_contacts: List[DuplicateRecord] = []


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

async def generate_series_id(tenant_id: str, object_name: str, record_id: str) -> str:
    """Generate UUID-based series_id for records"""
    prefix_map = {
        "lead": "led",
        "contact": "con",
        "account": "acc",
        "opportunity": "opp",
        "task": "tsk",
        "event": "evt"
    }
    prefix = prefix_map.get(object_name, object_name[:3])
    # Use first 12 characters of UUID for shorter, readable IDs
    uuid_suffix = record_id.replace("-", "")[:12]
    return f"{prefix}-{uuid_suffix}"


async def detect_duplicate_accounts(company_name: str, tenant_id: str, limit: int = 5) -> List[DuplicateRecord]:
    """Detect potential duplicate accounts by company name"""
    if not company_name:
        return []
    
    accounts = await db.object_records.find({
        "tenant_id": tenant_id,
        "object_name": "account",
        "data.account_name": {"$regex": company_name, "$options": "i"}
    }).to_list(length=limit)
    
    duplicates = []
    for acc in accounts:
        acc_name = acc["data"].get("account_name", "")
        if acc_name.lower() == company_name.lower():
            score = 100.0
        elif company_name.lower() in acc_name.lower() or acc_name.lower() in company_name.lower():
            score = 75.0
        else:
            score = 50.0
        
        duplicates.append(DuplicateRecord(
            id=acc["id"],
            name=acc_name,
            email=acc["data"].get("email"),
            score=score
        ))
    
    return sorted(duplicates, key=lambda x: x.score, reverse=True)


async def detect_duplicate_contacts(email: str, tenant_id: str, limit: int = 5) -> List[DuplicateRecord]:
    """Detect potential duplicate contacts by email"""
    if not email:
        return []
    
    contacts = await db.object_records.find({
        "tenant_id": tenant_id,
        "object_name": "contact",
        "data.email": {"$regex": f"^{email}$", "$options": "i"}
    }).to_list(length=limit)
    
    duplicates = []
    for contact in contacts:
        contact_email = contact["data"].get("email", "")
        score = 100.0 if contact_email.lower() == email.lower() else 75.0
        
        name = f"{contact['data'].get('first_name', '')} {contact['data'].get('last_name', '')}".strip()
        duplicates.append(DuplicateRecord(
            id=contact["id"],
            name=name or "Unnamed Contact",
            email=contact_email,
            score=score
        ))
    
    return sorted(duplicates, key=lambda x: x.score, reverse=True)


def map_custom_fields(source_data: dict, target_data: dict) -> dict:
    """Map custom fields between objects (fields ending with __c)"""
    for field_name, field_value in source_data.items():
        if field_name.endswith("__c"):
            target_data[field_name] = field_value
    return target_data


def map_status_to_stage(lead_status: str) -> str:
    """Map Lead status to Opportunity stage"""
    status_to_stage_mapping = {
        "New": "Prospecting",
        "Contacted": "Qualification",
        "Qualified": "Needs Analysis",
        "Converted": "Closed Won",
        "Lost": "Closed Lost"
    }
    return status_to_stage_mapping.get(lead_status, "Prospecting")


# ============================================================================
# ROUTES
# ============================================================================

@router.post("/web-to-lead/submit")
async def web_to_lead_submit(data: Dict[str, Any], tenant_key: Optional[str] = None):
    """
    Public endpoint for web-to-lead form submissions.
    Creates a new Lead in the CRM from external website forms.
    """
    try:
        if tenant_key:
            default_tenant = await db.tenants.find_one({"tenant_id": tenant_key})
            if not default_tenant:
                default_tenant = await db.tenants.find_one({"id": tenant_key})
        else:
            default_tenant = await db.tenants.find_one({}, sort=[("created_at", -1)])
        
        if not default_tenant:
            raise HTTPException(status_code=500, detail="No tenant configured for web-to-lead")
        
        tenant_id = default_tenant.get("tenant_id") or default_tenant.get("id")
        lead_id = str(uuid.uuid4())
        series_id = await generate_series_id(tenant_id, "lead", lead_id)
        
        # Get default record type if exists
        record_type_id = None
        default_rt = await db.record_types.find_one({
            "tenant_id": tenant_id,
            "object_name": "lead",
            "is_default": True,
            "is_active": True
        })
        if default_rt:
            record_type_id = default_rt.get("id")
        
        lead_data = {
            "id": lead_id,
            "tenant_id": tenant_id,
            "object_name": "lead",
            "series_id": series_id,
            "record_type_id": record_type_id,
            "data": {
                **data,
                "status": data.get("status", "Qualified"),
                "created_at": datetime.now(timezone.utc).isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat()
            },
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        
        await db.object_records.insert_one(lead_data)
        
        # Trigger flow builder DB triggers
        try:
            from modules.flow_builder.triggers.db_trigger import DbTriggerHandler
            db_trigger_handler = DbTriggerHandler(db)
            await db_trigger_handler.handle_entity_event(
                entity="Lead",
                event="afterInsert",
                record=lead_data,
                tenant_id=tenant_id
            )
        except Exception as e:
            logging.error(f"Error triggering flow for lead insert: {str(e)}")
        
        # Trigger DocFlow automation
        try:
            from crm_webhook_integration import trigger_docflow_webhook, extract_field_changes
            field_changes = extract_field_changes({}, lead_data)
            await trigger_docflow_webhook(
                object_type="lead",
                object_id=lead_id,
                tenant_id=tenant_id,
                field_changes=field_changes,
                record_data=lead_data,
                event_type="onCreate"
            )
        except Exception as e:
            logging.error(f"Error triggering DocFlow for lead insert: {str(e)}")
        
        return {
            "success": True,
            "message": "Lead created successfully",
            "lead_id": lead_id,
            "series_id": series_id
        }
        
    except Exception as e:
        logging.error(f"Web-to-Lead submission error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to create lead: {str(e)}")


@router.post("/leads/{lead_id}/convert", response_model=ConvertLeadResponse)
async def convert_lead(
    lead_id: str,
    conversion_data: ConvertLeadRequest,
    current_user: User = Depends(get_current_user)
):
    """Convert a Lead to Account, Contact, and optionally Opportunity with duplicate detection"""
    
    lead = await db.object_records.find_one({
        "id": lead_id,
        "tenant_id": current_user.tenant_id,
        "object_name": "lead"
    })
    
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    if lead.get("data", {}).get("is_converted"):
        raise HTTPException(status_code=400, detail="Lead is already converted")
    
    if lead.get("data", {}).get("status") != "Qualified":
        raise HTTPException(status_code=400, detail="Lead must be Qualified before conversion")
    
    lead_data = lead.get("data", {})
    
    # Duplicate detection
    duplicate_accounts = await detect_duplicate_accounts(lead_data.get("company", ""), current_user.tenant_id)
    duplicate_contacts = await detect_duplicate_contacts(lead_data.get("email", ""), current_user.tenant_id)
    
    # Handle Account
    account_id = None
    if conversion_data.account_action == "link" and conversion_data.account_id:
        account_id = conversion_data.account_id
    else:
        account_data = {}
        for lead_field, account_field in LEAD_CONVERSION_MAPPINGS["lead_to_account"].items():
            if lead_field in lead_data and lead_data[lead_field]:
                account_data[account_field] = lead_data[lead_field]
        
        account_data = map_custom_fields(lead_data, account_data)
        
        if conversion_data.account_name:
            account_data["account_name"] = conversion_data.account_name
        
        if "account_type" not in account_data:
            account_data["account_type"] = "Customer"
        
        # Phase 3: Add conversion tracking fields
        account_data["created_from_prospect"] = True
        account_data["source_prospect_id"] = lead_id
        
        account_id = str(uuid.uuid4())
        account_series_id = await generate_series_id(current_user.tenant_id, "account", account_id)
        
        account_record = {
            "id": account_id,
            "series_id": account_series_id,
            "tenant_id": current_user.tenant_id,
            "object_name": "account",
            "data": account_data,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "created_by": current_user.id
        }
        await db.object_records.insert_one(account_record)
    
    # Handle Contact
    contact_id = None
    if conversion_data.contact_action == "link" and conversion_data.contact_id:
        contact_id = conversion_data.contact_id
    else:
        contact_data = {}
        for lead_field, contact_field in LEAD_CONVERSION_MAPPINGS["lead_to_contact"].items():
            if lead_field in lead_data and lead_data[lead_field]:
                contact_data[contact_field] = lead_data[lead_field]
        
        contact_data = map_custom_fields(lead_data, contact_data)
        contact_data["account_id"] = account_id
        
        if "contact_type" not in contact_data:
            contact_data["contact_type"] = "Customer"
        
        # Phase 3: Add conversion tracking fields
        contact_data["created_from_prospect"] = True
        contact_data["source_prospect_id"] = lead_id
        
        contact_id = str(uuid.uuid4())
        contact_series_id = await generate_series_id(current_user.tenant_id, "contact", contact_id)
        
        contact_record = {
            "id": contact_id,
            "series_id": contact_series_id,
            "tenant_id": current_user.tenant_id,
            "object_name": "contact",
            "data": contact_data,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "created_by": current_user.id
        }
        await db.object_records.insert_one(contact_record)
    
    # Handle Opportunity
    opportunity_id = None
    if conversion_data.create_opportunity:
        opportunity_data = {}
        for lead_field, opp_field in LEAD_CONVERSION_MAPPINGS["lead_to_opportunity"].items():
            if lead_field in lead_data and lead_data[lead_field]:
                if lead_field == "status":
                    opportunity_data["stage"] = map_status_to_stage(lead_data[lead_field])
                else:
                    opportunity_data[opp_field] = lead_data[lead_field]
        
        opportunity_data = map_custom_fields(lead_data, opportunity_data)
        
        if conversion_data.opportunity_name:
            opportunity_data["name"] = conversion_data.opportunity_name
        elif "name" not in opportunity_data and lead_data.get("company"):
            opportunity_data["name"] = f"{lead_data.get('company')} - Opportunity"
        
        if conversion_data.opportunity_amount:
            opportunity_data["amount"] = conversion_data.opportunity_amount
        
        opportunity_data["account_id"] = account_id
        opportunity_data["contact_id"] = contact_id
        
        # Phase 3: Add conversion tracking fields
        opportunity_data["created_from_prospect"] = True
        opportunity_data["source_prospect_id"] = lead_id
        
        if "stage" not in opportunity_data:
            opportunity_data["stage"] = "Needs Analysis"
        
        stage_probabilities = {
            "Prospecting": 10, "Qualification": 20, "Needs Analysis": 30,
            "Value Proposition": 40, "Decision Makers": 50, "Proposal": 60,
            "Negotiation": 75, "Closed Won": 100, "Closed Lost": 0
        }
        opportunity_data["probability"] = stage_probabilities.get(opportunity_data["stage"], 30)
        
        opportunity_id = str(uuid.uuid4())
        opportunity_record = {
            "id": opportunity_id,
            "tenant_id": current_user.tenant_id,
            "object_name": "opportunity",
            "data": opportunity_data,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "created_by": current_user.id
        }
        await db.object_records.insert_one(opportunity_record)
    
    # Mark lead as converted
    await db.object_records.update_one(
        {"id": lead_id, "tenant_id": current_user.tenant_id},
        {
            "$set": {
                "data.is_converted": True,
                "data.converted_date": datetime.now(timezone.utc).isoformat(),
                "data.converted_account_id": account_id,
                "data.converted_contact_id": contact_id,
                "data.converted_opportunity_id": opportunity_id,
                "updated_at": datetime.now(timezone.utc).isoformat(),
                "is_read_only": True
            }
        }
    )
    
    return ConvertLeadResponse(
        success=True,
        message="Lead converted successfully",
        account_id=account_id,
        contact_id=contact_id,
        opportunity_id=opportunity_id,
        lead_id=lead_id,
        duplicate_accounts=duplicate_accounts,
        duplicate_contacts=duplicate_contacts
    )


@router.get("/accounts/search")
async def search_accounts(query: str, current_user: User = Depends(get_current_user)):
    """Search for accounts by name"""
    accounts = await db.object_records.find({
        "tenant_id": current_user.tenant_id,
        "object_name": "account",
        "data.account_name": {"$regex": query, "$options": "i"}
    }).to_list(length=10)
    
    return [{"id": acc["id"], "name": acc["data"].get("account_name", "")} for acc in accounts]


@router.get("/contacts/search")
async def search_contacts(query: str, current_user: User = Depends(get_current_user)):
    """Search for contacts by email or name"""
    contacts = await db.object_records.find({
        "tenant_id": current_user.tenant_id,
        "object_name": "contact",
        "$or": [
            {"data.email": {"$regex": query, "$options": "i"}},
            {"data.first_name": {"$regex": query, "$options": "i"}},
            {"data.last_name": {"$regex": query, "$options": "i"}}
        ]
    }).to_list(length=10)
    
    return [{
        "id": contact["id"], 
        "name": f"{contact['data'].get('first_name', '')} {contact['data'].get('last_name', '')}",
        "email": contact["data"].get("email", "")
    } for contact in contacts]
