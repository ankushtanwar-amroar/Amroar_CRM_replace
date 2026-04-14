"""
Records Module API Routes
CRUD operations for object records.
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone
import uuid
import re
import json
import logging

from config.database import db
from shared.models import User, ObjectRecord, DuplicateRecord
from modules.auth.api.auth_routes import get_current_user
from modules.records.services.records_service import (
    parse_from_mongo,
    prepare_for_mongo,
    generate_series_id,
    evaluate_formula_fields_for_record,
    get_subordinate_user_ids,
    log_audit_event
)
from modules.records.services.notification_triggers import (
    check_and_notify_owner_change,
    check_and_notify_assignment_change,
    get_record_display_name,
    get_assignment_field_value
)
from services.sharing_rule_engine import apply_sharing_visibility, check_user_record_access
from modules.activity_linking.services import (
    compute_name_field,
    resolve_activity_links,
    update_linked_records_last_activity,
    ensure_name_field,
    ACTIVITY_OBJECTS
)
from modules.activity_linking.services.account_rollup_service import (
    on_opportunity_change,
    on_opportunity_delete
)
from modules.stage_definitions.services import get_stage_definition_service

# Import audit helper for detailed field-level audit logging
try:
    from modules.audit.integration import audit_helper
    from modules.audit.models import AuditChangeSource
    AUDIT_MODULE_AVAILABLE = True
except ImportError:
    AUDIT_MODULE_AVAILABLE = False
    audit_helper = None

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Records"])


def normalize_object_name(object_name: str) -> str:
    """
    Normalize object name to handle singular/plural variations.
    Maps common plural forms to their singular counterparts.
    """
    # Common plural to singular mappings for Field Service objects
    plural_to_singular = {
        'work_orders': 'work_order',
        'service_appointments': 'service_appointment',
        'workorders': 'work_order',
        'serviceappointments': 'service_appointment',
    }
    
    normalized = object_name.lower().strip()
    return plural_to_singular.get(normalized, object_name)


async def get_object_definition(tenant_id: str, object_name: str) -> Optional[Dict]:
    """
    Get object definition from tenant_objects or Schema Builder.
    
    INTEGRATION: This function checks both sources:
    1. First checks tenant_objects (existing CRM objects take precedence)
    2. If not found, checks Schema Builder objects
    
    Returns the object definition or None if not found.
    """
    # 1. Check existing CRM objects first (takes precedence)
    obj = await db.tenant_objects.find_one({
        "tenant_id": tenant_id,
        "object_name": object_name
    }, {"_id": 0})
    
    if obj:
        return obj
    
    # 2. Check Schema Builder objects
    try:
        schema_obj = await db.schema_objects.find_one({
            "tenant_id": tenant_id,
            "api_name": object_name.lower(),
            "is_active": True
        }, {"_id": 0})
        
        if schema_obj:
            # Convert Schema Builder object to minimal tenant_object format
            # Just need enough for records API to work
            return {
                "id": schema_obj["id"],
                "tenant_id": tenant_id,
                "object_name": schema_obj["api_name"],
                "object_label": schema_obj["label"],
                "object_plural": schema_obj.get("plural_label", f"{schema_obj['label']}s"),
                "grant_access_using_hierarchies": True,
                "is_from_schema_builder": True
            }
    except Exception as e:
        logger.warning(f"Error checking Schema Builder for object {object_name}: {str(e)}")
    
    return None


# Import check_permission and evaluate_validation_rules from server
# These will be imported at runtime to avoid circular imports
async def check_permission(current_user: User, object_name: str, action: str):
    """Check if user has permission for action on object"""
    from modules.users.services import check_permission as users_check_permission
    await users_check_permission(current_user, object_name, action)


async def evaluate_validation_rules(tenant_id: str, object_name: str, data: Dict[str, Any]):
    """Evaluate validation rules"""
    from shared.services import evaluate_validation_rules as shared_evaluate_validation_rules
    return await shared_evaluate_validation_rules(tenant_id, object_name, data)


# Pydantic models
from pydantic import BaseModel

class RecordCreate(BaseModel):
    data: Dict[str, Any]
    record_type_id: Optional[str] = None
    owner_type: str = "USER"

class RecordUpdate(BaseModel):
    data: Dict[str, Any]
    record_type_id: Optional[str] = None
    owner_id: Optional[str] = None  # Allow owner change via API
    owner_type: Optional[str] = "USER"


# Duplicate detection helpers
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
        duplicates.append(DuplicateRecord(
            id=contact["id"],
            name=f"{contact['data'].get('first_name', '')} {contact['data'].get('last_name', '')}",
            email=contact["data"].get("email"),
            score=100.0
        ))
    
    return duplicates


async def detect_duplicate_leads(email: str, tenant_id: str, limit: int = 5) -> List[DuplicateRecord]:
    """Detect potential duplicate leads by email"""
    if not email:
        return []
    
    leads = await db.object_records.find({
        "tenant_id": tenant_id,
        "object_name": "lead",
        "data.email": {"$regex": f"^{email}$", "$options": "i"}
    }).to_list(length=limit)
    
    duplicates = []
    for lead in leads:
        duplicates.append(DuplicateRecord(
            id=lead["id"],
            name=f"{lead['data'].get('first_name', '')} {lead['data'].get('last_name', '')}",
            email=lead["data"].get("email"),
            score=100.0
        ))
    
    return duplicates


@router.get("/objects/{object_name}/records")
async def get_object_records(
    object_name: str,
    page: int = 1,
    limit: int = 20,
    sort_by: Optional[str] = None,
    sort_order: Optional[str] = "asc",
    filter_field: Optional[str] = None,
    filter_value: Optional[str] = None,
    filter_condition: Optional[str] = "equals",
    search: Optional[str] = None,
    paginate: bool = True,
    list_view_filters: Optional[str] = None,
    my_records_only: bool = False,
    include_sharing_debug: bool = False,
    current_user: User = Depends(get_current_user)
):
    """Get records for an object with filtering and pagination"""
    # Normalize object name to handle plural/singular variations
    object_name = normalize_object_name(object_name)
    
    # Permission check
    if object_name in ["lead", "contact", "account", "opportunity", "task", "event"]:
        await check_permission(current_user, object_name, "read")
    
    # Verify object exists (checks both tenant_objects and Schema Builder)
    obj = await get_object_definition(current_user.tenant_id, object_name)
    if not obj:
        raise HTTPException(status_code=404, detail="Object not found")
    
    # Build base query
    base_query = {
        "tenant_id": current_user.tenant_id,
        "object_name": object_name
    }
    
    # My Records filter - show records owned by the user themselves, OR by any
    # group/queue they are a member of (mirrors Salesforce-style "My Records" behavior)
    if my_records_only:
        from services.sharing_rule_engine import SharingRuleEngine
        _engine = SharingRuleEngine(current_user.tenant_id, current_user.id)
        _group_ids = await _engine._get_user_group_ids()
        _queue_ids = await _engine._get_user_queue_ids()
        _all_owner_ids = list({current_user.id} | set(_group_ids) | set(_queue_ids))
        if len(_all_owner_ids) == 1:
            base_query["owner_id"] = current_user.id
        else:
            base_query["owner_id"] = {"$in": _all_owner_ids}
        query = base_query
        sharing_debug = None
    else:
        # Apply sharing rule visibility (comprehensive visibility engine)
        # This handles: owner, role hierarchy, sharing rules, groups, queues
        hierarchy_enabled = obj.get("grant_access_using_hierarchies", True)
        
        # Check if user has "view_all" permission which bypasses sharing rules
        view_all_permission = False
        if current_user.role_id:
            perm_set = await db.permission_sets.find_one({"role_id": current_user.role_id}, {"_id": 0})
            if perm_set:
                for perm in perm_set.get("permissions", []):
                    if perm.get("object_name") == object_name and perm.get("view_all"):
                        view_all_permission = True
                        break
        
        if view_all_permission:
            # User can see all records - skip sharing rules
            query = base_query
            sharing_debug = {"bypassed": "view_all_permission"} if include_sharing_debug else None
            logger.debug(f"[Records] User {current_user.id} has view_all permission for {object_name}")
        elif hierarchy_enabled:
            # Apply sharing rule engine for visibility filtering
            query, sharing_debug = await apply_sharing_visibility(
                tenant_id=current_user.tenant_id,
                user_id=current_user.id,
                object_name=object_name,
                base_query=base_query,
                include_debug=include_sharing_debug
            )
            logger.debug(f"[Records] Applied sharing visibility for {object_name}, user {current_user.id}")
        else:
            # Hierarchy disabled - show all records
            query = base_query
            sharing_debug = {"bypassed": "hierarchy_disabled"} if include_sharing_debug else None
    
    # List view filters
    if list_view_filters:
        try:
            filters = json.loads(list_view_filters)
            for field_name, filter_config in filters.items():
                if field_name in ['recently_viewed', 'created_by']:
                    continue
                
                if isinstance(filter_config, dict):
                    condition = filter_config.get('condition', 'equals')
                    value = filter_config.get('value', '')
                else:
                    condition = 'equals'
                    value = str(filter_config)
                
                if value:
                    if condition == 'equals':
                        query[f"data.{field_name}"] = {"$regex": f"^{value}$", "$options": "i"}
                    elif condition == 'contains':
                        query[f"data.{field_name}"] = {"$regex": value, "$options": "i"}
                    elif condition == 'starts_with':
                        query[f"data.{field_name}"] = {"$regex": f"^{value}", "$options": "i"}
                    elif condition == 'ends_with':
                        query[f"data.{field_name}"] = {"$regex": f"{value}$", "$options": "i"}
                    elif condition == 'not_equals':
                        query[f"data.{field_name}"] = {"$not": {"$regex": f"^{value}$", "$options": "i"}}
                    elif condition == 'is_empty':
                        query[f"data.{field_name}"] = {"$in": [None, "", []]}
                    elif condition == 'is_not_empty':
                        query[f"data.{field_name}"] = {"$nin": [None, "", []], "$exists": True}
                    else:
                        query[f"data.{field_name}"] = {"$regex": value, "$options": "i"}
        except json.JSONDecodeError:
            pass
    
    # Single filter (backward compatibility)
    elif filter_field and filter_value:
        if filter_condition == 'equals':
            query[f"data.{filter_field}"] = {"$regex": f"^{filter_value}$", "$options": "i"}
        elif filter_condition == 'contains':
            query[f"data.{filter_field}"] = {"$regex": filter_value, "$options": "i"}
        elif filter_condition == 'starts_with':
            query[f"data.{filter_field}"] = {"$regex": f"^{filter_value}", "$options": "i"}
        elif filter_condition == 'ends_with':
            query[f"data.{filter_field}"] = {"$regex": f"{filter_value}$", "$options": "i"}
        else:
            query[f"data.{filter_field}"] = {"$regex": filter_value, "$options": "i"}
    
    # Search
    if search:
        search_conditions = []
        for field_name in obj.get('fields', {}).keys():
            search_conditions.append({f"data.{field_name}": {"$regex": search, "$options": "i"}})
        search_conditions.append({"series_id": {"$regex": search, "$options": "i"}})
        if search_conditions:
            query["$or"] = search_conditions
    
    # Get total count
    total = await db.object_records.count_documents(query)
    
    # Build cursor
    cursor = db.object_records.find(query, {"_id": 0})
    
    # Sorting
    if sort_by:
        sort_direction = 1 if sort_order == "asc" else -1
        if sort_by in ["created_at", "series_id"]:
            cursor = cursor.sort(sort_by, sort_direction)
        else:
            cursor = cursor.sort(f"data.{sort_by}", sort_direction)
    else:
        cursor = cursor.sort("created_at", -1)
    
    # Pagination
    skip = (page - 1) * limit
    records = await cursor.skip(skip).limit(limit).to_list(None)
    
    # Evaluate formula and rollup fields
    parsed_records = []
    for record in records:
        parsed_record = parse_from_mongo(record)
        record_id = parsed_record.get("id")
        enhanced_data = await evaluate_formula_fields_for_record(
            current_user.tenant_id,
            object_name,
            parsed_record.get("data", {}),
            record_id=record_id
        )
        parsed_record["data"] = enhanced_data
        parsed_records.append(ObjectRecord(**parsed_record))
    
    # Return response
    if paginate:
        total_pages = (total + limit - 1) // limit
        response = {
            "records": parsed_records,
            "pagination": {
                "total": total,
                "page": page,
                "limit": limit,
                "total_pages": total_pages
            }
        }
        # Include sharing debug info if requested
        if include_sharing_debug and sharing_debug:
            response["sharing_debug"] = sharing_debug
        return response
    else:
        return parsed_records


@router.post("/objects/{object_name}/records", response_model=ObjectRecord)
async def create_object_record(
    object_name: str,
    record_data: RecordCreate,
    current_user: User = Depends(get_current_user)
):
    """Create a new record"""
    # Normalize object name to handle plural/singular variations
    object_name = normalize_object_name(object_name)
    
    # Permission check
    if object_name in ["lead", "contact", "account", "opportunity", "task", "event"]:
        await check_permission(current_user, object_name, "create")
    
    # Validation rules
    is_valid, error_info = await evaluate_validation_rules(
        current_user.tenant_id,
        object_name,
        record_data.data
    )
    
    if not is_valid:
        error_detail = {
            "message": f"Validation failed: {error_info.get('message', 'Unknown error')}",
            "error_location": error_info.get("error_location", "page"),
            "error_field": error_info.get("error_field"),
            "rule_name": error_info.get("rule_name")
        }
        raise HTTPException(status_code=400, detail=error_detail)
    
    # Verify object exists (checks both tenant_objects and Schema Builder)
    obj = await get_object_definition(current_user.tenant_id, object_name)
    if not obj:
        raise HTTPException(status_code=404, detail="Object not found")
    
    # Get record type
    record_type_id = record_data.record_type_id
    if not record_type_id:
        default_rt = await db.record_types.find_one({
            "tenant_id": current_user.tenant_id,
            "object_name": object_name,
            "is_default": True,
            "is_active": True
        })
        if default_rt:
            record_type_id = default_rt["id"]
        else:
            default_rt_config = await db.record_type_configs.find_one({
                "tenant_id": current_user.tenant_id,
                "object_name": object_name,
                "is_active": True
            })
            if default_rt_config:
                record_type_id = default_rt_config["id"]
    
    # Phase 1: Process data for computed fields and activity links
    processed_data = dict(record_data.data)
    
    # Compute name field for Lead/Contact
    processed_data = await ensure_name_field(
        current_user.tenant_id,
        object_name,
        processed_data
    )
    
    # Resolve activity links for Task/Event
    if object_name.lower() in ACTIVITY_OBJECTS:
        processed_data = resolve_activity_links(processed_data)
    
    # Phase 2A: Compute stage-derived fields for Opportunity
    if object_name.lower() == "opportunity" and "stage" in processed_data:
        stage_service = get_stage_definition_service()
        computed = await stage_service.get_computed_fields_for_stage(
            current_user.tenant_id,
            "opportunity",
            processed_data["stage"]
        )
        processed_data["probability_percent"] = computed.get("probability_percent", 0)
        processed_data["forecast_category"] = computed.get("forecast_category", "Pipeline")
        processed_data["is_closed"] = computed.get("is_closed", False)
        # Compute expected_revenue
        amount = processed_data.get("amount", 0) or 0
        try:
            amount = float(amount)
        except (ValueError, TypeError):
            amount = 0
        processed_data["expected_revenue"] = round(amount * computed.get("probability_percent", 0) / 100, 2)
    
    # Create record with all system fields
    now = datetime.now(timezone.utc)
    record = ObjectRecord(
        tenant_id=current_user.tenant_id,
        object_name=object_name,
        record_type_id=record_type_id,
        data=processed_data,
        owner_id=current_user.id,
        owner_type=record_data.owner_type or "USER",
        created_by=current_user.id,
        updated_by=current_user.id,
        system_timestamp=now,
        is_deleted=False
    )
    
    # Generate series_id
    series_id = await generate_series_id(current_user.tenant_id, object_name, record.id)
    record.series_id = series_id
    
    record_doc = prepare_for_mongo(record.model_dump())
    await db.object_records.insert_one(record_doc)
    
    # Audit - Legacy
    await log_audit_event(
        tenant_id=current_user.tenant_id,
        event_type="data",
        action="record_created",
        actor_user_id=current_user.id,
        actor_email=current_user.email,
        object_name=object_name,
        record_id=record.id,
        details={"series_id": series_id}
    )
    
    # Audit - New detailed field-level audit trail
    if AUDIT_MODULE_AVAILABLE and audit_helper:
        try:
            user_name = f"{current_user.first_name or ''} {current_user.last_name or ''}".strip() or current_user.email
            await audit_helper.log_record_create(
                object_name=object_name,
                record_id=record.id,
                record_data=processed_data,
                user_id=current_user.id,
                user_name=user_name,
                tenant_id=current_user.tenant_id,
                record_label=processed_data.get('name') or processed_data.get('subject') or processed_data.get('title'),
                source=AuditChangeSource.UI,
                source_name=f"{object_name.title()} Record Page"
            )
        except Exception as e:
            logger.debug(f"Audit trail logging failed (non-blocking): {e}")
    
    # Trigger flow builder
    try:
        from modules.flow_builder.triggers.db_trigger import DbTriggerHandler
        db_trigger_handler = DbTriggerHandler(db)
        await db_trigger_handler.handle_entity_event(
            entity=object_name.capitalize(),
            event="afterInsert",
            record=record_doc,
            tenant_id=current_user.tenant_id
        )
    except Exception as e:
        logger.error(f"Error triggering flow for {object_name} insert: {str(e)}")
    
    # Trigger DocFlow
    try:
        from crm_webhook_integration import trigger_docflow_webhook, extract_field_changes
        field_changes = extract_field_changes({}, record_doc)
        await trigger_docflow_webhook(
            object_type=object_name,
            object_id=record.id,
            tenant_id=current_user.tenant_id,
            field_changes=field_changes,
            record_data=record_doc,
            event_type="onCreate"
        )
    except Exception as e:
        logger.error(f"Error triggering DocFlow for {object_name} insert: {str(e)}")
    
    # Trigger rollup
    try:
        from modules.field_management.services.rollup_trigger_handler import get_rollup_trigger_handler
        rollup_handler = get_rollup_trigger_handler(db)
        await rollup_handler.on_record_create(object_name, record_doc, current_user.tenant_id)
    except Exception as e:
        logger.error(f"Error triggering rollup recalc for {object_name} create: {str(e)}")
    
    # Phase 1: Update last_activity_at on linked records (for Task/Event)
    if object_name.lower() in ACTIVITY_OBJECTS:
        try:
            await update_linked_records_last_activity(
                current_user.tenant_id,
                processed_data
            )
        except Exception as e:
            logger.error(f"Error updating last_activity_at for linked records: {str(e)}")
    
    # Phase 3: Update account rollups when opportunity is created
    if object_name.lower() == "opportunity":
        try:
            await on_opportunity_change(
                current_user.tenant_id,
                processed_data
            )
        except Exception as e:
            logger.error(f"Error updating account rollups: {str(e)}")
    
    return record


@router.get("/objects/{object_name}/records/{record_id}", response_model=ObjectRecord)
async def get_object_record(
    object_name: str,
    record_id: str,
    current_user: User = Depends(get_current_user)
):
    """Get a single record by ID"""
    # Normalize object name to handle plural/singular variations
    object_name = normalize_object_name(object_name)
    
    payload = {
        "tenant_id": current_user.tenant_id,
        "object_name": object_name
    }

    uuid_pattern = r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
    is_uuid = bool(re.match(uuid_pattern, record_id))

    if is_uuid:
        payload["id"] = record_id
    else:
        payload["series_id"] = record_id

    record = await db.object_records.find_one(payload, {"_id": 0})

    if not record:
        raise HTTPException(status_code=404, detail="Record not found")
    
    # Check if user has access to this record via sharing rules
    # Check if user has "view_all" permission first
    is_super_admin = getattr(current_user, 'is_super_admin', False)
    view_all_permission = is_super_admin
    
    if not view_all_permission and current_user.role_id:
        perm_set = await db.permission_sets.find_one({"role_id": current_user.role_id}, {"_id": 0})
        if perm_set:
            for perm in perm_set.get("permissions", []):
                if perm.get("object_name") == object_name and perm.get("view_all"):
                    view_all_permission = True
                    break
    
    if not view_all_permission:
        # Apply sharing rule access check
        has_access, access_reason, _ = await check_user_record_access(
            tenant_id=current_user.tenant_id,
            user_id=current_user.id,
            object_name=object_name,
            record=record,
            required_access="read"
        )
        
        if not has_access:
            logger.warning(f"[Records] Access denied to record {record_id} for user {current_user.id}: {access_reason}")
            raise HTTPException(status_code=403, detail="You don't have access to this record")
        
        logger.debug(f"[Records] Access granted to record {record_id} for user {current_user.id}: {access_reason}")
    
    parsed_record = parse_from_mongo(record)
    
    # Pass record_id for rollup calculations
    actual_record_id = parsed_record.get("id")
    enhanced_data = await evaluate_formula_fields_for_record(
        current_user.tenant_id,
        object_name,
        parsed_record.get("data", {}),
        record_id=actual_record_id
    )
    parsed_record["data"] = enhanced_data
    
    # Apply Field-Level Security (FLS) - filter hidden fields
    from modules.users.services.field_level_security import FieldLevelSecurityService
    fls_service = FieldLevelSecurityService(current_user.tenant_id, current_user.id)
    
    if parsed_record.get("data"):
        parsed_record["data"] = await fls_service.filter_record_fields(
            object_name=object_name,
            record=parsed_record["data"],
            is_super_admin=is_super_admin
        )

    return ObjectRecord(**parsed_record)


@router.put("/objects/{object_name}/records/{record_id}", response_model=ObjectRecord)
async def update_object_record(
    object_name: str,
    record_id: str,
    record_data: RecordUpdate,
    current_user: User = Depends(get_current_user)
):
    try:
        # Normalize object name to handle plural/singular variations
        object_name = normalize_object_name(object_name)
        
        is_super_admin = getattr(current_user, 'is_super_admin', False)
        
        # Permission check
        if object_name in ["lead", "contact", "account", "opportunity", "task", "event"]:
            await check_permission(current_user, object_name, "edit")
        
        # Field-Level Security (FLS) check - validate fields being updated
        from modules.users.services.field_level_security import FieldLevelSecurityService
        fls_service = FieldLevelSecurityService(current_user.tenant_id, current_user.id)
        
        is_valid, invalid_fields = await fls_service.validate_update_fields(
            object_name=object_name,
            update_data=record_data.data,
            is_super_admin=is_super_admin
        )
        
        if not is_valid:
            raise HTTPException(
                status_code=403,
                detail=f"You don't have permission to edit these fields: {', '.join(invalid_fields)}"
            )
        
        # Validation rules
        is_valid, error_info = await evaluate_validation_rules(
            current_user.tenant_id,
            object_name,
            record_data.data
        )
        
        if not is_valid:
            error_detail = {
                "message": f"Validation failed: {error_info.get('message', 'Unknown error')}",
                "error_location": error_info.get("error_location", "page"),
                "error_field": error_info.get("error_field"),
                "rule_name": error_info.get("rule_name")
            }
            raise HTTPException(status_code=400, detail=error_detail)
        
        # Find existing record - check both 'id' and 'series_id' fields
        existing_record = await db.object_records.find_one({
            "tenant_id": current_user.tenant_id,
            "object_name": object_name,
            "$or": [
                {"id": record_id},
                {"series_id": record_id}
            ]
        })
        
        if not existing_record:
            raise HTTPException(status_code=404, detail="Record not found")
        
        # Check if user has write access to this record via sharing rules
        # Check if user has "modify_all" permission first
        modify_all_permission = is_super_admin
        if not modify_all_permission and current_user.role_id:
            perm_set = await db.permission_sets.find_one({"role_id": current_user.role_id}, {"_id": 0})
            if perm_set:
                for perm in perm_set.get("permissions", []):
                    if perm.get("object_name") == object_name and perm.get("modify_all"):
                        modify_all_permission = True
                        break
        
        if not modify_all_permission:
            # Apply sharing rule access check for write access
            has_access, access_reason, _ = await check_user_record_access(
                tenant_id=current_user.tenant_id,
                user_id=current_user.id,
                object_name=object_name,
                record=existing_record,
                required_access="write"
            )
            
            if not has_access:
                logger.warning(f"[Records] Write access denied to record {record_id} for user {current_user.id}: {access_reason}")
                raise HTTPException(status_code=403, detail="You don't have write access to this record")
            
            logger.debug(f"[Records] Write access granted to record {record_id} for user {current_user.id}: {access_reason}")
        
        # Phase 1: Process data for computed fields and activity links
        processed_data = dict(record_data.data)
        
        # Compute name field for Lead/Contact
        processed_data = await ensure_name_field(
            current_user.tenant_id,
            object_name,
            processed_data,
            record_id
        )
        
        # Resolve activity links for Task/Event
        if object_name.lower() in ACTIVITY_OBJECTS:
            processed_data = resolve_activity_links(processed_data)
        
        # Phase 2A: Compute stage-derived fields for Opportunity
        if object_name.lower() == "opportunity" and "stage" in processed_data:
            stage_service = get_stage_definition_service()
            computed = await stage_service.get_computed_fields_for_stage(
                current_user.tenant_id,
                "opportunity",
                processed_data["stage"]
            )
            processed_data["probability_percent"] = computed.get("probability_percent", 0)
            processed_data["forecast_category"] = computed.get("forecast_category", "Pipeline")
            processed_data["is_closed"] = computed.get("is_closed", False)
            # Compute expected_revenue
            amount = processed_data.get("amount", 0) or 0
            try:
                amount = float(amount)
            except (ValueError, TypeError):
                amount = 0
            processed_data["expected_revenue"] = round(amount * computed.get("probability_percent", 0) / 100, 2)
        
        # Update with all system fields
        now = datetime.now(timezone.utc)
        
        # IMPORTANT: Merge existing data with new data to preserve fields not in the update
        # This ensures fields like AccountId are not lost during partial updates
        existing_data = existing_record.get("data", {})
        merged_data = {**existing_data, **processed_data}
        
        update_data = {
            "data": merged_data,
            "updated_at": now.isoformat(),
            "updated_by": current_user.id,
            "system_timestamp": now.isoformat()
        }
        
        if record_data.record_type_id is not None:
            update_data["record_type_id"] = record_data.record_type_id
        
        # Handle owner change if provided
        if record_data.owner_id is not None:
            update_data["owner_id"] = record_data.owner_id
            update_data["owner_type"] = record_data.owner_type or "USER"
        
        # Use the actual ID from the found record for the update
        actual_record_id = existing_record.get("id")
        
        await db.object_records.update_one(
            {
                "tenant_id": current_user.tenant_id,
                "object_name": object_name,
                "id": actual_record_id
            },
            {"$set": update_data}
        )
        
        # Audit - Legacy
        await log_audit_event(
            tenant_id=current_user.tenant_id,
            event_type="data",
            action="record_updated",
            actor_user_id=current_user.id,
            actor_email=current_user.email,
            object_name=object_name,
            record_id=actual_record_id
        )
        
        # Audit - New detailed field-level audit trail
        if AUDIT_MODULE_AVAILABLE and audit_helper:
            try:
                user_name = f"{current_user.first_name or ''} {current_user.last_name or ''}".strip() or current_user.email
                old_data = existing_record.get("data", {})
                await audit_helper.log_record_update(
                    object_name=object_name,
                    record_id=actual_record_id,
                    old_record=old_data,
                    new_record=merged_data,
                    user_id=current_user.id,
                    user_name=user_name,
                    tenant_id=current_user.tenant_id,
                    record_label=merged_data.get('name') or merged_data.get('subject') or merged_data.get('title'),
                    source=AuditChangeSource.UI,
                    source_name=f"{object_name.title()} Record Page"
                )
            except Exception as e:
                logger.debug(f"Audit trail logging failed (non-blocking): {e}")
        
        # History Tracking - Record field value changes
        try:
            from modules.history_tracking.api.history_tracking_routes import record_field_changes
            old_data = existing_record.get("data", {})
            await record_field_changes(
                tenant_id=current_user.tenant_id,
                object_name=object_name,
                record_id=existing_record.get("series_id") or actual_record_id,
                old_data=old_data,
                new_data=merged_data,
                changed_by=current_user.id
            )
        except Exception as e:
            logger.debug(f"History tracking failed (non-blocking): {e}")
        
        # Get updated record
        updated_record = await db.object_records.find_one({
            "tenant_id": current_user.tenant_id,
            "object_name": object_name,
            "id": actual_record_id
        }, {"_id": 0})
        
        # Trigger flow builder
        try:
            from modules.flow_builder.triggers.db_trigger import DbTriggerHandler
            db_trigger_handler = DbTriggerHandler(db)
            await db_trigger_handler.handle_entity_event(
                entity=object_name.capitalize(),
                event="afterUpdate",
                record=updated_record,
                tenant_id=current_user.tenant_id
            )
        except Exception as e:
            logger.error(f"Error triggering flow for {object_name} update: {str(e)}")
        
        # Trigger DocFlow
        try:
            from crm_webhook_integration import trigger_docflow_webhook, extract_field_changes
            field_changes = extract_field_changes(existing_record, updated_record)
            await trigger_docflow_webhook(
                object_type=object_name,
                object_id=record_id,
                tenant_id=current_user.tenant_id,
                field_changes=field_changes,
                record_data=updated_record,
                old_data=existing_record,
                event_type="onUpdate"
            )
        except Exception as e:
            logger.error(f"Error triggering DocFlow for {object_name} update: {str(e)}")
        
        # Trigger rollup
        try:
            from modules.field_management.services.rollup_trigger_handler import get_rollup_trigger_handler
            rollup_handler = get_rollup_trigger_handler(db)
            await rollup_handler.on_record_update(object_name, existing_record, updated_record, current_user.tenant_id)
        except Exception as e:
            logger.error(f"Error triggering rollup recalc for {object_name} update: {str(e)}")
        
        # Phase 1: Update last_activity_at on linked records (for Task/Event)
        if object_name.lower() in ACTIVITY_OBJECTS:
            try:
                await update_linked_records_last_activity(
                    current_user.tenant_id,
                    processed_data
                )
            except Exception as e:
                logger.error(f"Error updating last_activity_at for linked records: {str(e)}")
        
        # Phase 3: Update account rollups when opportunity is updated
        if object_name.lower() == "opportunity":
            try:
                old_data = existing_record.get("data", {})
                await on_opportunity_change(
                    current_user.tenant_id,
                    processed_data,
                    old_data
                )
            except Exception as e:
                logger.error(f"Error updating account rollups: {str(e)}")
        
        # =========================================================================
        # NOTIFICATION CENTER TRIGGERS
        # =========================================================================
        try:
            # Get user name for notifications
            user_name = f"{getattr(current_user, 'first_name', '')} {getattr(current_user, 'last_name', '')}".strip()
            if not user_name:
                user_name = getattr(current_user, 'name', current_user.email)
            
            record_name = get_record_display_name(object_name, updated_record)
            
            # Check for owner change
            old_owner = existing_record.get("owner_id")
            old_owner_type = existing_record.get("owner_type", "USER")
            
            # Only proceed if we have an updated record to compare with
            if updated_record:
                new_owner = updated_record.get("owner_id")
                new_owner_type = updated_record.get("owner_type", "USER")
                
                if old_owner != new_owner and new_owner:
                    await check_and_notify_owner_change(
                        db=db,
                        tenant_id=current_user.tenant_id,
                        object_name=object_name,
                        record_id=actual_record_id,
                        record_name=record_name,
                        old_owner_id=old_owner,
                        new_owner_id=new_owner,
                        changed_by_user_id=current_user.id,
                        changed_by_name=user_name,
                        old_owner_type=old_owner_type,
                        new_owner_type=new_owner_type
                    )
            
            # Check for assignment change (Task/Event AssignedTo field)
            old_data = existing_record.get("data", {})
            new_data = updated_record.get("data", {}) if updated_record else {}
            
            old_assigned = get_assignment_field_value(object_name, old_data)
            new_assigned = get_assignment_field_value(object_name, new_data)
            
            if old_assigned != new_assigned and new_assigned:
                await check_and_notify_assignment_change(
                    db=db,
                    tenant_id=current_user.tenant_id,
                    object_name=object_name,
                    record_id=actual_record_id,
                    record_name=record_name,
                    field_name="assigned_to",
                    old_assigned_id=old_assigned,
                    new_assigned_id=new_assigned,
                    assigned_by_user_id=current_user.id,
                    assigned_by_name=user_name
                )
        except Exception as e:
            logger.error(f"Error sending notification triggers for {object_name} update: {str(e)}")

        if not updated_record:
            return ObjectRecord(**parse_from_mongo(existing_record))
        return ObjectRecord(**parse_from_mongo(updated_record))

    except Exception as e:
        logger.error(f"FATAL error in update_object_record for {object_name}/{record_id}: {str(e)}", exc_info=True)
        # Re-raise if it's already an HTTPException
        if isinstance(e, HTTPException):
            raise e
        # Otherwise, reveal the internal error for debugging
        raise HTTPException(
            status_code=500, 
            detail=f"Record update failed: {type(e).__name__}: {str(e)}"
        )


@router.delete("/objects/{object_name}/records/{record_id}")
async def delete_object_record(
    object_name: str,
    record_id: str,
    current_user: User = Depends(get_current_user)
):
    """Delete a record"""
    # Normalize object name to handle plural/singular variations
    object_name = normalize_object_name(object_name)
    
    # Permission check
    if object_name in ["lead", "contact", "account", "opportunity", "task", "event"]:
        await check_permission(current_user, object_name, "delete")
    
    # Get record before deleting
    record_to_delete = await db.object_records.find_one({
        "tenant_id": current_user.tenant_id,
        "object_name": object_name,
        "id": record_id
    }, {"_id": 0})
    
    result = await db.object_records.delete_one({
        "tenant_id": current_user.tenant_id,
        "object_name": object_name,
        "id": record_id
    })
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Record not found")
    
    # Audit - Legacy
    await log_audit_event(
        tenant_id=current_user.tenant_id,
        event_type="data",
        action="record_deleted",
        actor_user_id=current_user.id,
        actor_email=current_user.email,
        object_name=object_name,
        record_id=record_id
    )
    
    # Audit - New detailed field-level audit trail
    if AUDIT_MODULE_AVAILABLE and audit_helper and record_to_delete:
        try:
            user_name = f"{current_user.first_name or ''} {current_user.last_name or ''}".strip() or current_user.email
            record_data = record_to_delete.get("data", {})
            await audit_helper.log_record_delete(
                object_name=object_name,
                record_id=record_id,
                record_data=record_data,
                user_id=current_user.id,
                user_name=user_name,
                tenant_id=current_user.tenant_id,
                record_label=record_data.get('name') or record_data.get('subject') or record_data.get('title'),
                source=AuditChangeSource.UI,
                source_name=f"{object_name.title()} Record Page"
            )
        except Exception as e:
            logger.debug(f"Audit trail logging failed (non-blocking): {e}")
    
    # Trigger rollup
    if record_to_delete:
        try:
            from modules.field_management.services.rollup_trigger_handler import get_rollup_trigger_handler
            rollup_handler = get_rollup_trigger_handler(db)
            await rollup_handler.on_record_delete(object_name, record_to_delete, current_user.tenant_id)
        except Exception as e:
            logger.error(f"Error triggering rollup recalc for {object_name} delete: {str(e)}")
    
    # Trigger DB flows for afterDelete event
    if record_to_delete:
        try:
            from modules.flow_builder.triggers.db_trigger import DbTriggerHandler
            db_trigger_handler = DbTriggerHandler(db)
            
            # Ensure the record has proper structure for trigger handler
            trigger_record = {
                "id": record_to_delete.get("id", record_id),
                "data": record_to_delete.get("data", record_to_delete),
                "object_name": object_name
            }
            
            await db_trigger_handler.handle_entity_event(
                entity=object_name.capitalize(),
                event="afterDelete",
                record=trigger_record,
                tenant_id=current_user.tenant_id
            )
        except Exception as e:
            logger.error(f"Error triggering flow for {object_name} afterDelete: {str(e)}")
    
    # Phase 3: Update account rollups when opportunity is deleted
    if object_name.lower() == "opportunity" and record_to_delete:
        try:
            await on_opportunity_delete(
                current_user.tenant_id,
                record_to_delete.get("data", {})
            )
        except Exception as e:
            logger.error(f"Error updating account rollups after delete: {str(e)}")
    
    return {"message": "Record deleted successfully"}


@router.get("/objects/{object_name}/records/{record_id}/activities")
async def get_record_activities(
    object_name: str,
    record_id: str,
    current_user: User = Depends(get_current_user)
):
    """Get activities (tasks/events) related to a record"""
    parent_record = await db.object_records.find_one({
        "tenant_id": current_user.tenant_id,
        "object_name": object_name.lower(),
        "$or": [{"id": record_id}, {"series_id": record_id}]
    }, {"_id": 0})
    
    actual_id = parent_record.get("id") if parent_record else record_id
    series_id = parent_record.get("series_id") if parent_record else record_id
    
    search_conditions = [
        {"data.related_to": actual_id},
        {"data.related_to": series_id},
        {f"data.related_{object_name}": actual_id},
        {f"data.related_{object_name}": series_id},
        {f"data.{object_name}_id": actual_id},
        {f"data.{object_name}_id": series_id},
    ]
    
    activities = []
    
    # Get tasks
    tasks = await db.object_records.find({
        "tenant_id": current_user.tenant_id,
        "object_name": "task",
        "$or": search_conditions
    }, {"_id": 0}).sort("created_at", -1).to_list(None)
    
    for task in tasks:
        activities.append({
            "id": task["id"],
            "type": "task",
            "subject": task["data"].get("subject", "Untitled Task"),
            "status": task["data"].get("status", ""),
            "due_date": task["data"].get("due_date", ""),
            "priority": task["data"].get("priority", ""),
            "created_at": task.get("created_at", "")
        })
    
    # Get events
    events = await db.object_records.find({
        "tenant_id": current_user.tenant_id,
        "object_name": "event",
        "$or": search_conditions
    }, {"_id": 0}).sort("created_at", -1).to_list(None)
    
    for event in events:
        activities.append({
            "id": event["id"],
            "type": "event",
            "subject": event["data"].get("subject", event["data"].get("name", "Untitled Event")),
            "start_date": event["data"].get("start_date", ""),
            "end_date": event["data"].get("end_date", ""),
            "location": event["data"].get("location", ""),
            "created_at": event.get("created_at", "")
        })
    
    return {"activities": activities, "total": len(activities)}


@router.get("/objects/{object_name}/records/{record_id}/related")
async def get_related_records(
    object_name: str,
    record_id: str,
    current_user: User = Depends(get_current_user)
):
    """Get all related records for a given record (respects sharing rules)"""
    # First check if user has access to parent record
    parent_record = await db.object_records.find_one({
        "tenant_id": current_user.tenant_id,
        "object_name": object_name.lower(),
        "$or": [{"id": record_id}, {"series_id": record_id}]
    }, {"_id": 0})
    
    if not parent_record:
        raise HTTPException(status_code=404, detail="Record not found")
    
    # Check access to parent record
    has_access, _, _ = await check_user_record_access(
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        object_name=object_name,
        record=parent_record,
        required_access="read"
    )
    
    if not has_access:
        raise HTTPException(status_code=403, detail="You don't have access to this record")
    
    actual_id = parent_record.get("id")
    series_id = parent_record.get("series_id")
    
    related_data = {}
    
    related_object_types = {
        "lead": ["contact", "account", "opportunity", "task", "event"],
        "contact": ["account", "opportunity", "task", "event", "case"],
        "account": ["contact", "opportunity", "task", "event", "case"],
        "opportunity": ["contact", "task", "event", "account"],
    }
    
    objects_to_fetch = related_object_types.get(object_name.lower(), ["contact", "account", "opportunity", "task", "event"])
    
    for related_obj in objects_to_fetch:
        # Build relationship search conditions
        search_conditions = [
            {"data.related_to": actual_id},
            {"data.related_to": series_id},
            {"data.related_lead": actual_id},
            {"data.related_lead": series_id},
            {"data.related_contact": actual_id},
            {"data.related_contact": series_id},
            {"data.related_account": actual_id},
            {"data.related_account": series_id},
            {"data.related_opportunity": actual_id},
            {"data.related_opportunity": series_id},
            {"data.lead_id": actual_id},
            {"data.lead_id": series_id},
            {"data.contact_id": actual_id},
            {"data.contact_id": series_id},
            {"data.account_id": actual_id},
            {"data.account_id": series_id},
        ]
        
        # Build base query with relationship conditions
        base_query = {
            "tenant_id": current_user.tenant_id,
            "object_name": related_obj,
            "$or": search_conditions
        }
        
        # Apply sharing visibility filter to related records
        visibility_query, _ = await apply_sharing_visibility(
            tenant_id=current_user.tenant_id,
            user_id=current_user.id,
            object_name=related_obj,
            base_query=base_query,
            include_debug=False
        )
        
        records = await db.object_records.find(
            visibility_query, 
            {"_id": 0}
        ).sort("created_at", -1).limit(10).to_list(None)
        
        # Check company name if no records found
        if not records and parent_record and related_obj in ["contact", "account"]:
            company = parent_record.get("data", {}).get("company", "")
            if company:
                # Also apply sharing visibility to company search
                company_base_query = {
                    "tenant_id": current_user.tenant_id,
                    "object_name": related_obj,
                    "$or": [
                        {"data.company": {"$regex": company, "$options": "i"}},
                        {"data.name": {"$regex": company, "$options": "i"}},
                        {"data.account_name": {"$regex": company, "$options": "i"}}
                    ]
                }
                company_visibility_query, _ = await apply_sharing_visibility(
                    tenant_id=current_user.tenant_id,
                    user_id=current_user.id,
                    object_name=related_obj,
                    base_query=company_base_query,
                    include_debug=False
                )
                company_records = await db.object_records.find(
                    company_visibility_query, 
                    {"_id": 0}
                ).limit(10).to_list(None)
                records = company_records
        
        formatted_records = []
        for rec in records:
            data = rec.get("data", {})
            formatted = {
                "id": rec.get("id"),
                "series_id": rec.get("series_id"),
                "created_at": rec.get("created_at"),
            }
            
            if related_obj == "contact":
                formatted["name"] = data.get("name") or f"{data.get('first_name', '')} {data.get('last_name', '')}".strip() or "Unknown"
                formatted["title"] = data.get("title") or data.get("job_title", "")
                formatted["email"] = data.get("email", "")
                formatted["phone"] = data.get("phone", "")
            elif related_obj == "account":
                formatted["name"] = data.get("name") or data.get("account_name", "Unknown")
                formatted["industry"] = data.get("industry", "")
                formatted["phone"] = data.get("phone", "")
                formatted["website"] = data.get("website", "")
            elif related_obj == "opportunity":
                formatted["name"] = data.get("name") or data.get("opportunity_name", "Unknown")
                formatted["stage"] = data.get("stage", "")
                formatted["amount"] = data.get("amount", "")
                formatted["close_date"] = data.get("close_date", "")
            elif related_obj == "task":
                formatted["subject"] = data.get("subject", "Untitled Task")
                formatted["status"] = data.get("status", "")
                formatted["due_date"] = data.get("due_date", "")
                formatted["priority"] = data.get("priority", "")
            elif related_obj == "event":
                formatted["subject"] = data.get("subject") or data.get("name", "Untitled Event")
                formatted["start_date"] = data.get("start_date", "")
                formatted["end_date"] = data.get("end_date", "")
                formatted["location"] = data.get("location", "")
            elif related_obj == "case":
                formatted["case_number"] = data.get("case_number", "")
                formatted["subject"] = data.get("subject", "")
                formatted["status"] = data.get("status", "")
            
            formatted_records.append(formatted)
        
        related_data[related_obj] = {
            "count": len(formatted_records),
            "records": formatted_records
        }
    
    return related_data


@router.post("/objects/{object_name}/records/{record_id}/view")
async def track_recently_viewed(
    object_name: str,
    record_id: str,
    current_user: User = Depends(get_current_user)
):
    """Track recently viewed record"""
    preference = {
        "id": str(uuid.uuid4()),
        "user_id": current_user.id,
        "tenant_id": current_user.tenant_id,
        "preference_type": "recently_viewed",
        "object_name": object_name,
        "value": {
            "record_id": record_id,
            "viewed_at": datetime.now(timezone.utc).isoformat()
        },
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.user_preferences.update_one(
        {
            "user_id": current_user.id,
            "tenant_id": current_user.tenant_id,
            "preference_type": "recently_viewed",
            "object_name": object_name,
            "value.record_id": record_id
        },
        {"$set": preference},
        upsert=True
    )
    return {"success": True}


@router.get("/objects/{object_name}/recently-viewed")
async def get_recently_viewed_records(
    object_name: str,
    limit: int = 10,
    current_user: User = Depends(get_current_user)
):
    """Get recently viewed records (respects sharing rules)"""
    recent_prefs = await db.user_preferences.find({
        "user_id": current_user.id,
        "tenant_id": current_user.tenant_id,
        "preference_type": "recently_viewed",
        "object_name": object_name
    }).sort("updated_at", -1).limit(limit).to_list(None)
    
    if not recent_prefs:
        return []
    
    record_ids = [pref["value"]["record_id"] for pref in recent_prefs]
    
    # Apply sharing visibility filter
    # Also ensure records have the required 'data' field
    base_query = {
        "tenant_id": current_user.tenant_id,
        "object_name": object_name,
        "id": {"$in": record_ids},
        "data": {"$exists": True, "$ne": None}  # Ensure data field exists
    }
    
    visibility_query, _ = await apply_sharing_visibility(
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        object_name=object_name,
        base_query=base_query,
        include_debug=False
    )
    
    records = await db.object_records.find(visibility_query, {"_id": 0}).to_list(None)
    
    record_dict = {record["id"]: record for record in records}
    sorted_records = [record_dict[record_id] for record_id in record_ids if record_id in record_dict]
    
    # Parse and validate each record, skip any that fail validation
    result = []
    for record in sorted_records:
        try:
            parsed = parse_from_mongo(record)
            # Ensure 'data' field exists and is not None
            if parsed.get("data") is None:
                parsed["data"] = {}
            result.append(ObjectRecord(**parsed))
        except Exception as e:
            logger.warning(f"Skipping invalid record {record.get('id')}: {e}")
            continue
    
    return result


@router.get("/calendar/activities")
async def get_calendar_activities(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """Get calendar activities (tasks and events) - respects sharing rules"""
    date_filter = {}
    if start_date and end_date:
        date_filter = {
            "$or": [
                {"data.due_date": {"$gte": start_date, "$lte": end_date}},
                {"data.start_date": {"$gte": start_date, "$lte": end_date}}
            ]
        }
    
    # Get tasks with sharing visibility
    tasks_base_query = {
        "tenant_id": current_user.tenant_id,
        "object_name": "task",
        "data.due_date": {"$exists": True, "$ne": ""}
    }
    if date_filter:
        tasks_base_query.update(date_filter)
    
    tasks_visibility_query, _ = await apply_sharing_visibility(
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        object_name="task",
        base_query=tasks_base_query,
        include_debug=False
    )
    
    tasks = await db.object_records.find(tasks_visibility_query, {"_id": 0}).to_list(None)
    
    # Get events with sharing visibility
    events_base_query = {
        "tenant_id": current_user.tenant_id,
        "object_name": "event",
        "data.start_date": {"$exists": True, "$ne": ""}
    }
    if date_filter:
        events_base_query.update(date_filter)
    
    events_visibility_query, _ = await apply_sharing_visibility(
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        object_name="event",
        base_query=events_base_query,
        include_debug=False
    )
    
    events = await db.object_records.find(events_visibility_query, {"_id": 0}).to_list(None)
    
    calendar_items = []
    
    for task in tasks:
        calendar_items.append({
            "id": task["id"],
            "type": "task",
            "title": task["data"].get("subject", "Untitled Task"),
            "date": task["data"].get("due_date"),
            "status": task["data"].get("status", ""),
            "priority": task["data"].get("priority", ""),
            "description": task["data"].get("description", ""),
            "related_to": task["data"].get("related_to", ""),
            "related_type": task["data"].get("related_type", "")
        })
    
    for event in events:
        calendar_items.append({
            "id": event["id"],
            "type": "event",
            "title": event["data"].get("subject", "Untitled Event"),
            "date": event["data"].get("start_date"),
            "start_date": event["data"].get("start_date"),
            "end_date": event["data"].get("end_date"),
            "location": event["data"].get("location", ""),
            "event_type": event["data"].get("event_type", ""),
            "description": event["data"].get("description", ""),
            "related_to": event["data"].get("related_to", ""),
            "related_type": event["data"].get("related_type", "")
        })
    
    return {
        "activities": calendar_items,
        "total_tasks": len(tasks),
        "total_events": len(events)
    }
