"""
CRM Application Server
Refactored: Phase 3 - Reduced from 2044 LOC to target <1000 LOC
"""
from fastapi import FastAPI, APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from datetime import datetime, timezone
import jwt

ROOT_DIR = Path(__file__).parent
from config.settings import settings
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Security setup
JWT_SECRET = os.environ.get('JWT_SECRET', 'your-secret-key-here-change-in-production')
ALGORITHM = "HS256"

security = HTTPBearer()

# Create the main app
app = FastAPI(title="Multi-Tenant CRM API", version="1.0.0")

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Import shared constants and models
from shared.constants import PAGE_LAYOUTS
from shared.constants.industry_templates import INDUSTRY_TEMPLATES
from shared.models import User

# Configure logging - supports LOG_LEVEL env variable for debugging
log_level = os.environ.get("LOG_LEVEL", "INFO").upper()
logging.basicConfig(
    level=getattr(logging, log_level, logging.INFO),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)
logger.info(f"Logging level set to: {log_level}")


# ============================================================================
# AUTHENTICATION HELPER (kept for backward compatibility)
# ============================================================================

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Verify JWT token and return current user"""
    try:
        token = credentials.credentials
        payload = jwt.decode(token, JWT_SECRET, algorithms=[ALGORITHM])
        user_id: str = payload.get("user_id")
        tenant_id: str = payload.get("tenant_id")
        if user_id is None or tenant_id is None:
            raise HTTPException(status_code=401, detail="Invalid authentication credentials")
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid authentication credentials")
    
    user = await db.users.find_one({"id": user_id, "tenant_id": tenant_id}, {"_id": 0})
    if user is None:
        raise HTTPException(status_code=401, detail="User not found")
    
    if not user.get("is_active", True):
        raise HTTPException(
            status_code=401, 
            detail="Your account has been deactivated. Please contact your administrator."
        )
    
    if user.get("is_frozen", False):
        frozen_until = user.get("frozen_until")
        if frozen_until and datetime.now(timezone.utc) > frozen_until:
            await db.users.update_one(
                {"id": user_id},
                {
                    "$set": {"is_frozen": False},
                    "$unset": {"frozen_until": "", "frozen_at": "", "frozen_by": "", "freeze_reason": ""}
                }
            )
        else:
            freeze_msg = "Your account has been temporarily frozen"
            if frozen_until:
                freeze_msg += f" until {frozen_until.strftime('%Y-%m-%d %H:%M UTC')}"
            freeze_msg += ". Please contact your administrator."
            raise HTTPException(status_code=403, detail=freeze_msg)
    
    return User(**user)


# ============================================================================
# UTILITY FUNCTIONS (shared across modules)
# ============================================================================

async def generate_series_id(tenant_id: str, object_name: str, record_id: str) -> str:
    """Generate UUID-based series_id for records"""
    import random
    import string
    
    prefix_map = {
        "lead": "led", "task": "tsk", "contact": "con", "event": "evt",
        "opportunity": "opp", "account": "acc", "note": "not", "call": "cal"
    }
    prefix = prefix_map.get(object_name.lower(), "rec")
    uuid_suffix = record_id.split('-')[-1]
    series_id = f"{prefix}-{uuid_suffix}"
    
    existing = await db.object_records.find_one({
        "tenant_id": tenant_id,
        "object_name": object_name,
        "series_id": series_id
    })
    
    if existing:
        random_suffix = ''.join(random.choices(string.ascii_lowercase + string.digits, k=4))
        series_id = f"{prefix}-{uuid_suffix}-{random_suffix}"
    
    return series_id


async def evaluate_formula_fields_for_record(
    tenant_id: str, object_name: str, record_data: dict
) -> dict:
    """Evaluate all formula fields for a record"""
    from modules.field_management.services.formula_service import FormulaEngine
    
    formula_fields = await db.advanced_fields.find({
        "tenant_id": tenant_id,
        "object_name": object_name,
        "field_type": "formula",
        "is_active": True
    }, {"_id": 0}).to_list(100)
    
    if not formula_fields:
        return record_data
    
    enhanced_data = dict(record_data)
    engine = FormulaEngine(blank_as_zero=True)
    
    for formula_field in formula_fields:
        try:
            expression = formula_field.get("expression", "")
            api_key = formula_field.get("api_key", "")
            return_type = formula_field.get("return_type", "Text")
            decimal_places = formula_field.get("decimal_places", 2)
            blank_as_zero = formula_field.get("blank_as_zero", True)
            
            engine.blank_as_zero = blank_as_zero
            result, error = engine.evaluate(expression, record_data)
            
            if error is None:
                if return_type in ['Number', 'Currency', 'Percent']:
                    try:
                        result = round(float(result), decimal_places)
                    except (ValueError, TypeError):
                        result = 0 if blank_as_zero else None
                elif return_type == 'Boolean':
                    result = bool(result) if result is not None else False
                enhanced_data[api_key] = result
            else:
                enhanced_data[api_key] = None
        except Exception as e:
            logging.warning(f"Formula evaluation error for {api_key}: {str(e)}")
            enhanced_data[formula_field.get("api_key", "")] = None
    
    return enhanced_data


# ============================================================================
# CORE API ROUTES (minimal - most moved to modules)
# ============================================================================

@api_router.get("/me", response_model=User)
async def get_current_user_info(current_user: User = Depends(get_current_user)):
    """Get current authenticated user info"""
    return current_user


@api_router.get("/industries")
async def get_available_industries():
    """Get available industry templates"""
    return {
        industry: {
            "name": config["name"],
            "description": config["description"],
            "objects": list(config["objects"].keys())
        }
        for industry, config in INDUSTRY_TEMPLATES.items()
    }


@api_router.post("/admin/migrate-series-id")
async def migrate_series_id(current_user: User = Depends(get_current_user)):
    """Utility endpoint to regenerate series_id for all existing records"""
    try:
        object_types = ["lead", "task", "contact", "event", "opportunity", "account"]
        migration_results = {}
        
        for object_name in object_types:
            records = await db.object_records.find({
                "tenant_id": current_user.tenant_id,
                "object_name": object_name
            }).sort("created_at", 1).to_list(None)
            
            updated_count = 0
            skipped_count = 0
            
            for record in records:
                record_id = record.get("id")
                current_series_id = record.get("series_id")
                new_series_id = await generate_series_id(current_user.tenant_id, object_name, record_id)
                
                if current_series_id != new_series_id:
                    await db.object_records.update_one(
                        {"id": record_id},
                        {"$set": {"series_id": new_series_id}}
                    )
                    updated_count += 1
                else:
                    skipped_count += 1
            
            migration_results[object_name] = {
                "updated": updated_count,
                "skipped": skipped_count,
                "total": len(records),
                "status": "completed"
            }
        
        return {
            "message": "Migration completed successfully",
            "format": "prefix-{uuid_suffix}",
            "results": migration_results
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Migration failed: {str(e)}")


# Simple file upload endpoint for Screen Flows (legacy, uses /api/simple-files/)
from fastapi import UploadFile, File
import shutil
from uuid import uuid4

SIMPLE_UPLOAD_DIR = os.path.join(settings.STORAGE_BASE_DIR, "uploads", "simple_files")
os.makedirs(SIMPLE_UPLOAD_DIR, exist_ok=True)

@api_router.post("/simple-files/upload")
async def simple_file_upload(file: UploadFile = File(...)):
    """
    Simple file upload endpoint for Screen Flows
    Returns file metadata including URL for downloading
    """
    file_id = str(uuid4())
    file_extension = os.path.splitext(file.filename)[1] if file.filename else ""
    file_name = f"{file_id}{file_extension}"
    file_path = os.path.join(SIMPLE_UPLOAD_DIR, file_name)
    
    # Save file
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    file_size = os.path.getsize(file_path)
    file_url = f"/api/simple-files/{file_id}/download"
    
    # Store in DB
    file_record = {
        "id": file_id,
        "name": file.filename,
        "size": file_size,
        "type": file.content_type or "application/octet-stream",
        "path": file_path,
        "url": file_url,
        "uploaded_at": datetime.now(timezone.utc).isoformat()
    }
    await db.uploaded_files.insert_one(file_record)
    
    return {
        "id": file_id,
        "file_id": file_id,
        "name": file.filename,
        "url": file_url,
        "file_url": file_url,
        "size": file_size,
        "type": file.content_type
    }


@api_router.get("/simple-files/{file_id}/download")
async def download_simple_file(file_id: str):
    """Download an uploaded file"""
    from fastapi.responses import FileResponse
    
    file_record = await db.uploaded_files.find_one({"id": file_id})
    if not file_record:
        raise HTTPException(status_code=404, detail="File not found")
    
    file_path = file_record.get("path")
    if not file_path or not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found on disk")
    
    return FileResponse(
        path=file_path,
        filename=file_record.get("name", "download"),
        media_type=file_record.get("type", "application/octet-stream")
    )


# Include the main api_router
app.include_router(api_router)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================================
# RUNTIME ENFORCEMENT MIDDLEWARE (Control Plane Integration)
# ============================================================================

# Import and add enforcement middleware
# Note: Middleware is added in reverse order (last added runs first)
try:
    from shared.services import EnforcementMiddleware, ModuleEnforcementMiddleware
    
    # Module enforcement middleware (checks if module is enabled for URL path)
    app.add_middleware(ModuleEnforcementMiddleware)
    
    # Subscription enforcement middleware (checks tenant status)
    app.add_middleware(EnforcementMiddleware)
    
    logger.info("Runtime enforcement middleware loaded successfully")
except Exception as e:
    logger.warning(f"Runtime enforcement middleware not loaded: {str(e)}")


# ============================================================================
# MODULE ROUTER INCLUSIONS
# ============================================================================

# Runtime Entitlements API (Control Plane)
try:
    from shared.services import runtime_router
    app.include_router(runtime_router, prefix="/api", tags=["Runtime Entitlements"])
    logger.info("Runtime Entitlements API loaded successfully")
except Exception as e:
    logger.warning(f"Runtime Entitlements API not loaded: {str(e)}")

# Auth Module
try:
    from modules.auth import auth_router
    app.include_router(auth_router, prefix="/api", tags=["Authentication"])
    logger.info("Auth module routes loaded successfully")
except Exception as e:
    logger.warning(f"Auth module routes not loaded: {str(e)}")

# Metadata Module
try:
    from modules.metadata import metadata_router
    app.include_router(metadata_router, prefix="/api", tags=["Objects & Metadata"])
    logger.info("Metadata module routes loaded successfully")
except Exception as e:
    logger.warning(f"Metadata module routes not loaded: {str(e)}")

# List Views Module
try:
    from modules.list_views import list_views_router
    app.include_router(list_views_router, prefix="/api", tags=["List Views"])
    logger.info("List Views module routes loaded successfully")
except Exception as e:
    logger.warning(f"List Views module routes not loaded: {str(e)}")

# Records Module
try:
    from modules.records import records_router
    app.include_router(records_router, prefix="/api", tags=["Records"])
    logger.info("Records module routes loaded successfully")
except Exception as e:
    logger.warning(f"Records module routes not loaded: {str(e)}")

# Users Module (Refactored into multiple routers)
try:
    from modules.users import (
        users_router,
        roles_router,
        groups_router,
        queues_router,
        sharing_rules_router,
        access_bundles_router,
        security_settings_router,
        permission_sets_router,
        record_sharing_router,
        licenses_router,
        system_permissions_router,
        owners_router
    )
    app.include_router(users_router, prefix="/api", tags=["Users"])
    app.include_router(roles_router, prefix="/api", tags=["Roles"])
    app.include_router(groups_router, prefix="/api", tags=["Groups"])
    app.include_router(queues_router, prefix="/api", tags=["Queues"])
    app.include_router(sharing_rules_router, prefix="/api", tags=["Sharing Rules"])
    app.include_router(access_bundles_router, prefix="/api", tags=["Access Bundles"])
    app.include_router(security_settings_router, prefix="/api", tags=["Security Settings"])
    app.include_router(permission_sets_router, prefix="/api", tags=["Permission Sets"])
    app.include_router(record_sharing_router, prefix="/api", tags=["Record Sharing"])
    app.include_router(licenses_router, prefix="/api", tags=["Licenses"])
    app.include_router(system_permissions_router, prefix="/api", tags=["System Permissions"])
    app.include_router(owners_router, prefix="/api", tags=["Owners"])
    logger.info("Users module routes loaded successfully (12 routers)")
except Exception as e:
    logger.warning(f"Users module routes not loaded: {str(e)}")

# User License Assignment Routes (CRM Side)
try:
    from routes.user_license_routes import router as user_license_router
    app.include_router(user_license_router, prefix="/api", tags=["User Licenses"])
    logger.info("User License routes loaded successfully")
except Exception as e:
    logger.warning(f"User License routes not loaded: {str(e)}")

# Feature Access Routes (License Enforcement)
try:
    from routes.feature_access_routes import router as feature_access_router
    app.include_router(feature_access_router, prefix="/api", tags=["Feature Access"])
    logger.info("Feature Access routes loaded successfully")
except Exception as e:
    logger.warning(f"Feature Access routes not loaded: {str(e)}")

# Leads Module (NEW - Phase 3)
try:
    from modules.leads import leads_router
    app.include_router(leads_router, prefix="/api", tags=["Leads"])
    logger.info("Leads module routes loaded successfully")
except Exception as e:
    logger.warning(f"Leads module routes not loaded: {str(e)}")

# Config Module
try:
    from modules.config import config_router
    app.include_router(config_router, prefix="/api", tags=["Configuration"])
    logger.info("Config module routes loaded successfully")
except Exception as e:
    logger.warning(f"Config module routes not loaded: {str(e)}")

# Record Types Module
try:
    from modules.record_types import record_types_router
    app.include_router(record_types_router, prefix="/api", tags=["Record Types"])
    logger.info("Record Types module routes loaded successfully")
except Exception as e:
    logger.warning(f"Record Types module routes not loaded: {str(e)}")

# Custom Metadata Module
try:
    from modules.custom_metadata import custom_metadata_router
    app.include_router(custom_metadata_router, prefix="/api", tags=["Custom Metadata"])
    logger.info("Custom Metadata module routes loaded successfully")
except Exception as e:
    logger.warning(f"Custom Metadata module routes not loaded: {str(e)}")

# Validation Rules Module
try:
    from modules.validation_rules import validation_router
    app.include_router(validation_router, prefix="/api", tags=["Validation Rules"])
    logger.info("Validation Rules module routes loaded successfully")
except Exception as e:
    logger.warning(f"Validation Rules module routes not loaded: {str(e)}")

# Page Assignments Module
try:
    from modules.page_assignments import page_assignments_router
    app.include_router(page_assignments_router, prefix="/api", tags=["Page Assignments"])
    logger.info("Page Assignments module routes loaded successfully")
except Exception as e:
    logger.warning(f"Page Assignments module routes not loaded: {str(e)}")

# Form Builder Module (Refactored - Phase 3 Step 2)
try:
    from modules.form_builder import form_builder_router
    app.include_router(form_builder_router, prefix="/api/form-builder", tags=["Form Builder"])
    logger.info("Form Builder routes loaded successfully")
except Exception as e:
    logger.warning(f"Form Builder routes not loaded: {str(e)}")

# Flow Builder Module
try:
    from modules.flow_builder.api.flows_api import router as flows_router
    app.include_router(flows_router, prefix="/api/flow-builder", tags=["Flow Builder"])
    logger.info("Flow Builder routes loaded successfully")
except Exception as e:
    logger.warning(f"Flow Builder routes not loaded: {str(e)}")

# Data Operations Module
try:
    from modules.data_operations.api import router as data_operations_router
    app.include_router(data_operations_router, tags=["Data Operations"])
    logger.info("Data Operations routes loaded successfully")
except Exception as e:
    logger.warning(f"Data Operations routes not loaded: {str(e)}")

# Chatbot Manager Module
try:
    from modules.chatbot_manager.api.chatbots_api import router as chatbots_router
    from modules.chatbot_manager.api.conversations_api import router as conversations_router
    from modules.chatbot_manager.api.knowledge_api import router as knowledge_router
    from modules.chatbot_manager.api.knowledge_api_enhanced import router as knowledge_enhanced_router
    
    app.include_router(chatbots_router, prefix="/api", tags=["Chatbot Manager"])
    app.include_router(conversations_router, prefix="/api", tags=["Chatbot Conversations"])
    app.include_router(knowledge_router, prefix="/api", tags=["Knowledge Sources"])
    app.include_router(knowledge_enhanced_router, prefix="/api", tags=["Knowledge Sources"])
    logger.info("Chatbot Manager routes loaded successfully")
except Exception as e:
    logger.warning(f"Chatbot Manager routes not loaded: {str(e)}")

# Booking Module
try:
    from modules.booking.api.booking_routes import router as booking_router
    app.include_router(booking_router, prefix="/api/booking", tags=["Booking System"])
    logger.info("Booking System routes loaded successfully")
except Exception as e:
    logger.warning(f"Booking System routes not loaded: {str(e)}")

# Slack Integration Module
try:
    from modules.slack.slack_events import router as slack_router
    app.include_router(slack_router, prefix="/api", tags=["Slack Integration"])
    logger.info("Slack Integration routes loaded successfully")
except Exception as e:
    logger.warning(f"Slack Integration routes not loaded: {str(e)}")

# DocFlow Module
try:
    from modules.docflow.api.template_routes import router as template_router
    from modules.docflow.api.template_routes_enhanced import router as template_enhanced_router
    from modules.docflow.api.document_routes import router as document_router
    from modules.docflow.api.trigger_routes import router as trigger_router
    from modules.docflow.api.crm_routes import router as docflow_crm_router
    from modules.docflow.api.generate_links_routes import router as generate_links_router
    from modules.docflow.api.salesforce_routes import router as salesforce_router
    from modules.docflow.api.cluebot_routes import router as cluebot_router
    from modules.docflow.api.package_routes import router as package_router
    from modules.docflow.api.package_template_routes import router as package_template_router
    from modules.docflow.api.package_public_routes import router as package_public_router
    from modules.docflow.api.template_public_routes import router as template_public_router
    from modules.docflow.api.package_public_link_routes import router as package_public_link_router
    from modules.docflow.api.package_public_api_routes import router as package_public_api_router

    app.include_router(template_router, prefix="/api", tags=["DocFlow"])
    app.include_router(template_enhanced_router, prefix="/api", tags=["DocFlow"])
    app.include_router(document_router, prefix="/api", tags=["DocFlow"])
    app.include_router(trigger_router, prefix="/api", tags=["DocFlow"])
    app.include_router(docflow_crm_router, prefix="/api", tags=["DocFlow CRM"])
    app.include_router(generate_links_router, prefix="/api", tags=["DocFlow External APIs"])
    app.include_router(salesforce_router, prefix="/api", tags=["DocFlow Salesforce"])
    app.include_router(cluebot_router, prefix="/api", tags=["DocFlow ClueBot"])
    app.include_router(package_router, prefix="/api", tags=["DocFlow Packages"])
    app.include_router(package_template_router, prefix="/api", tags=["DocFlow Package Templates"])
    app.include_router(package_public_router, prefix="/api", tags=["DocFlow Package Public"])
    app.include_router(package_public_link_router, prefix="/api", tags=["DocFlow Public Link"])
    app.include_router(package_public_api_router, prefix="/api", tags=["DocFlow Public API"])
    app.include_router(template_public_router, prefix="/api", tags=["DocFlow Public Templates"])
    logger.info("DocFlow routes loaded successfully (including CRM routes)")
except Exception as e:
    logger.warning(f"DocFlow routes not loaded: {str(e)}")

# Survey Builder V2 Module
try:
    from modules.survey_builder_v2.api.survey_routes import router as survey_v2_router
    app.include_router(survey_v2_router, prefix="/api/survey-v2", tags=["Survey Builder V2"])
    logger.info("Survey Builder V2 routes loaded successfully")
except Exception as e:
    logger.warning(f"Survey Builder V2 routes not loaded: {str(e)}")

# CRM Platform Module
try:
    from modules.crm_platform.api.platform_routes import router as platform_router
    from modules.crm_platform.api.activity_routes import router as activity_router
    from modules.crm_platform.api.file_routes import router as file_router
    from modules.crm_platform.api.layout_routes import router as layout_router
    from modules.crm_platform.api.config_routes import router as crm_config_router
    from modules.crm_platform.api.workspace_routes import router as workspace_router
    from modules.crm_platform.api.console_routes import router as console_router
    from modules.crm_platform.api.crm_records_routes import router as crm_records_router
    from modules.lightning_builder.api.lightning_layout_routes import router as lightning_router
    
    app.include_router(platform_router, tags=["CRM Platform"])
    app.include_router(activity_router, tags=["CRM Platform - Activities"])
    app.include_router(file_router, tags=["CRM Platform - Files"])
    app.include_router(layout_router, tags=["CRM Platform - Layouts"])
    app.include_router(crm_config_router, tags=["CRM Platform - Configuration"])
    app.include_router(workspace_router, tags=["CRM Platform - Workspace"])
    app.include_router(console_router, tags=["CRM Platform - Console"])
    app.include_router(crm_records_router, tags=["CRM Records"])
    app.include_router(lightning_router, tags=["Lightning Page Builder"])
    logger.info("CRM Platform routes loaded successfully")
except Exception as e:
    logger.warning(f"CRM Platform routes not loaded: {str(e)}")

# Email Templates Module
try:
    from modules.email_templates.api.routes import router as email_templates_router
    app.include_router(email_templates_router, tags=["Email Templates"])
    logger.info("Email Templates module loaded successfully")
except Exception as e:
    logger.warning(f"Email Templates module not loaded: {str(e)}")

# Email Module (Drafts & Sending)
try:
    from modules.email.api.email_routes import router as email_router
    app.include_router(email_router, prefix="/api", tags=["Email"])
    logger.info("Email module loaded successfully")
except Exception as e:
    logger.warning(f"Email module not loaded: {str(e)}")

# Billing Module (Stripe Integration)
try:
    from modules.admin.api.billing_routes import router as billing_router
    from modules.admin.api.billing_routes import admin_router as admin_billing_router
    from modules.admin.api.billing_routes import webhook_router
    
    app.include_router(billing_router, prefix="/api", tags=["Billing"])
    app.include_router(admin_billing_router, prefix="/api", tags=["Admin Billing"])
    app.include_router(webhook_router, prefix="/api", tags=["Webhooks"])
    logger.info("Billing module (Stripe) loaded successfully")
except Exception as e:
    logger.warning(f"Billing module not loaded: {str(e)}")

# Field Management Module
try:
    from modules.field_management.api.lookup_routes import router as lookup_router
    from modules.field_management.api.rollup_routes import router as rollup_router
    from modules.field_management.api.formula_routes import router as formula_router
    from modules.field_management.api.field_routes import router as field_mgmt_router
    
    app.include_router(lookup_router, tags=["Lookup Fields"])
    app.include_router(rollup_router, tags=["Rollup Fields"])
    app.include_router(formula_router, tags=["Formula Fields"])
    app.include_router(field_mgmt_router, tags=["Field Management"])
    logger.info("Field Management module loaded successfully")
except Exception as e:
    logger.warning(f"Field Management module not loaded: {str(e)}")

# Field Behavior Rules Module
try:
    from modules.field_behavior.api.field_behavior_routes import router as field_behavior_router
    app.include_router(field_behavior_router, prefix="/api", tags=["Field Behavior Rules"])
    logger.info("Field Behavior Rules module loaded successfully")
except Exception as e:
    logger.warning(f"Field Behavior Rules module not loaded: {str(e)}")

# Lookup Hover Preview Module
try:
    from modules.lookup_hover.api.hover_routes import router as lookup_hover_router
    app.include_router(lookup_hover_router, prefix="/api", tags=["Lookup Hover Preview"])
    logger.info("Lookup Hover Preview module loaded successfully")
except Exception as e:
    logger.warning(f"Lookup Hover Preview module not loaded: {str(e)}")

# History Tracking Module
try:
    from modules.history_tracking.api.history_tracking_routes import router as history_tracking_router
    app.include_router(history_tracking_router, prefix="/api", tags=["History Tracking"])
    logger.info("History Tracking module loaded successfully")
except Exception as e:
    logger.warning(f"History Tracking module not loaded: {str(e)}")

# Dependent Picklists Module
try:
    from modules.dependent_picklists.api.dependent_picklist_routes import router as dependent_picklist_router
    app.include_router(dependent_picklist_router, prefix="/api", tags=["Dependent Picklists"])
    logger.info("Dependent Picklists module loaded successfully")
except Exception as e:
    logger.warning(f"Dependent Picklists module not loaded: {str(e)}")

# Actions Module (Quick Actions like Salesforce)
try:
    from modules.actions.api.action_routes import router as actions_router
    app.include_router(actions_router, prefix="/api", tags=["Actions"])
    logger.info("Actions module loaded successfully")
except Exception as e:
    logger.warning(f"Actions module not loaded: {str(e)}")

# Stage Definitions Module (Stage/Status metadata configuration)
try:
    from modules.stage_definitions.api import router as stage_definitions_router
    app.include_router(stage_definitions_router, prefix="/api", tags=["Stage Definitions"])
    logger.info("Stage Definitions module loaded successfully")
except Exception as e:
    logger.warning(f"Stage Definitions module not loaded: {str(e)}")

# Task Manager Module
try:
    from modules.task_manager import task_manager_router
    app.include_router(task_manager_router, prefix="/api", tags=["Task Manager"])
    logger.info("Task Manager module loaded successfully")
except Exception as e:
    logger.warning(f"Task Manager module not loaded: {str(e)}")

# Task Manager Integrations
try:
    from modules.task_manager.api.integrations_api import integrations_router
    app.include_router(integrations_router, tags=["Task Manager Integrations"])
    logger.info("Task Manager Integrations module loaded successfully")
except Exception as e:
    logger.warning(f"Task Manager Integrations module not loaded: {str(e)}")

# Task Manager Governance (Formula Fields, Validation Rules, SLA)
try:
    from modules.task_manager.api.governance_api import governance_router
    app.include_router(governance_router, tags=["Task Manager Governance"])
    logger.info("Task Manager Governance module loaded successfully")
except Exception as e:
    logger.warning(f"Task Manager Governance module not loaded: {str(e)}")

# Task Manager Recurring Tasks (Phase 14)
try:
    from modules.task_manager.api.recurring_tasks_api import recurring_tasks_router
    app.include_router(recurring_tasks_router, tags=["Task Manager Recurring Tasks"])
    logger.info("Task Manager Recurring Tasks module loaded successfully")
except Exception as e:
    logger.warning(f"Task Manager Recurring Tasks module not loaded: {str(e)}")

# Task Manager Reports (Phase 15)
try:
    from modules.task_manager.api.reports_api import reports_router
    app.include_router(reports_router, tags=["Task Manager Reports"])
    logger.info("Task Manager Reports module loaded successfully")
except Exception as e:
    logger.warning(f"Task Manager Reports module not loaded: {str(e)}")

# Task Manager Custom Dashboards (Phase 16)
try:
    from modules.task_manager.api.custom_dashboards_api import custom_dashboards_router
    app.include_router(custom_dashboards_router, tags=["Task Manager Custom Dashboards"])
    logger.info("Task Manager Custom Dashboards module loaded successfully")
except Exception as e:
    logger.warning(f"Task Manager Custom Dashboards module not loaded: {str(e)}")

# Schema Builder Module (Isolated Admin Module)
try:
    from modules.schema_builder.api import (
        objects_router as schema_objects_router,
        fields_router as schema_fields_router,
        relationships_router as schema_relationships_router,
        metadata_api_router as schema_metadata_router
    )
    from modules.schema_builder import visualization_router as schema_visualization_router
    app.include_router(schema_objects_router, prefix="/api/schema-builder", tags=["Schema Builder - Objects"])
    app.include_router(schema_fields_router, prefix="/api/schema-builder", tags=["Schema Builder - Fields"])
    app.include_router(schema_relationships_router, prefix="/api/schema-builder", tags=["Schema Builder - Relationships"])
    app.include_router(schema_metadata_router, prefix="/api/schema-builder", tags=["Schema Builder - Metadata"])
    app.include_router(schema_visualization_router, prefix="/api/schema-builder", tags=["Schema Builder - Visualization"])
    logger.info("Schema Builder module routes loaded successfully")
except Exception as e:
    logger.warning(f"Schema Builder module routes not loaded: {str(e)}")

# Object Import Module (Create Objects via Excel)
try:
    from modules.object_import import object_import_router
    app.include_router(object_import_router, tags=["Object Import"])
    logger.info("Object Import module loaded successfully")
except Exception as e:
    logger.warning(f"Object Import module not loaded: {str(e)}")

# Global Search Module (Unified Search across all objects)
try:
    from modules.global_search import global_search_router
    app.include_router(global_search_router, tags=["Global Search"])
    logger.info("Global Search module loaded successfully")
except Exception as e:
    logger.warning(f"Global Search module not loaded: {str(e)}")

# Chatter Module (Salesforce-like social feed)
try:
    from modules.chatter import chatter_router
    app.include_router(chatter_router, prefix="/api", tags=["Chatter"])
    logger.info("Chatter module loaded successfully")
except Exception as e:
    logger.warning(f"Chatter module not loaded: {str(e)}")

# File Manager Module
try:
    from modules.file_manager.api.file_routes import router as file_manager_router
    from modules.file_manager.api.setup_routes import router as file_manager_setup_router
    from modules.file_manager.api.admin_routes import router as file_manager_admin_router
    app.include_router(file_manager_router, prefix="/api", tags=["File Manager"])
    app.include_router(file_manager_setup_router, prefix="/api", tags=["File Manager Setup"])
    app.include_router(file_manager_admin_router, prefix="/api", tags=["File Manager Admin"])
    logger.info("File Manager module loaded successfully")
except Exception as e:
    logger.warning(f"File Manager module not loaded: {str(e)}")

# Notifications Module (Bell Icon Notification Center)
try:
    from modules.notifications import notifications_router
    app.include_router(notifications_router, prefix="/api", tags=["Notifications"])
    logger.info("Notifications module loaded successfully")
except Exception as e:
    logger.warning(f"Notifications module not loaded: {str(e)}")

# Notes Module (Enhanced Notes - Salesforce Style)
try:
    from modules.notes import notes_router
    app.include_router(notes_router, tags=["Notes"])
    logger.info("Notes module loaded successfully")
except Exception as e:
    logger.warning(f"Notes module not loaded: {str(e)}")

# App Manager Module (Configurable Apps, Pages, Components)
try:
    from modules.app_manager import app_manager_router
    app.include_router(app_manager_router, prefix="/api", tags=["App Manager"])
    logger.info("App Manager module loaded successfully")
except Exception as e:
    logger.warning(f"App Manager module not loaded: {str(e)}")

# Audit Trail Module (Universal Audit Logging)
try:
    from modules.audit import audit_router
    app.include_router(audit_router, prefix="/api", tags=["Audit Trail"])
    logger.info("Audit Trail module loaded successfully")
except Exception as e:
    logger.warning(f"Audit Trail module not loaded: {str(e)}")

# Record Inspector Module (Admin Utility)
try:
    from modules.record_inspector.api.record_inspector_routes import router as record_inspector_router
    app.include_router(record_inspector_router, prefix="/api", tags=["Record Inspector"])
    logger.info("Record Inspector module loaded successfully")
except Exception as e:
    logger.warning(f"Record Inspector module not loaded: {str(e)}")

# Field Service Module (Work Orders & Service Appointments)
try:
    from modules.field_service import field_service_router
    app.include_router(field_service_router, prefix="/api", tags=["Field Service"])
    logger.info("Field Service module loaded successfully")
except Exception as e:
    logger.warning(f"Field Service module not loaded: {str(e)}")

# Admin Portal Module (Isolated Admin Module)
try:
    from modules.admin import admin_router
    app.include_router(admin_router, prefix="/api", tags=["Admin Portal"])
    logger.info("Admin Portal module loaded successfully")
except Exception as e:
    logger.warning(f"Admin Portal module not loaded: {str(e)}")

# Integrations Module (Connections Architecture)
try:
    from modules.integrations import admin_integration_router, connection_router
    app.include_router(admin_integration_router, prefix="/api", tags=["Admin Integrations"])
    app.include_router(connection_router, prefix="/api", tags=["Connections"])
    logger.info("Integrations module loaded successfully")
except Exception as e:
    logger.warning(f"Integrations module not loaded: {str(e)}")


# Roles Module (Enhanced) - DISABLED: Using routes from users module
# try:
#     from modules.roles.api import router as roles_router
#     app.include_router(roles_router, tags=["Roles"])
#     logger.info("Roles module loaded successfully")
# except Exception as e:
#     logger.warning(f"Roles module not loaded: {str(e)}")

# CLU-BOT Module (AI CRM Assistant - Phase 1)
try:
    from modules.clu_bot import clu_bot_router
    app.include_router(clu_bot_router, prefix="/api", tags=["CLU-BOT"])
    logger.info("CLU-BOT module loaded successfully")
except Exception as e:
    logger.warning(f"CLU-BOT module not loaded: {str(e)}")


# ============================================================================
# STARTUP & SHUTDOWN EVENTS
# ============================================================================

from modules.users import seed_roles, seed_permission_sets, seed_organization_wide_defaults


async def migrate_users_to_roles():
    """Migrate existing users to have default role"""
    try:
        users_without_role = await db.users.count_documents({"role_id": {"$exists": False}})
        if users_without_role > 0:
            await db.users.update_many(
                {"role_id": {"$exists": False}},
                {"$set": {"role_id": "standard_user"}}
            )
            logger.info(f"✅ Migrated {users_without_role} users to standard_user role")
    except Exception as e:
        logger.error(f"❌ Error migrating users: {str(e)}")


async def migrate_record_ownership():
    """Ensure all records have owner_id"""
    try:
        records_without_owner = await db.object_records.count_documents({"owner_id": {"$exists": False}})
        if records_without_owner > 0:
            cursor = db.object_records.find({"owner_id": {"$exists": False}})
            async for record in cursor:
                await db.object_records.update_one(
                    {"id": record["id"]},
                    {"$set": {"owner_id": record.get("created_by", "system")}}
                )
            logger.info(f"✅ Migrated {records_without_owner} records to have owner_id")
    except Exception as e:
        logger.error(f"❌ Error migrating record ownership: {str(e)}")


@app.on_event("startup")
async def startup_event():
    """Initialize security models on startup"""
    logger.info("🚀 Application startup - initializing security models...")
    await seed_roles()
    await seed_permission_sets()
    
    # Skip slow migrations/seeds that iterate over all tenants
    # These have already been run in previous startups
    # await migrate_users_to_roles()  # Skipped - already migrated
    # await migrate_record_ownership()  # Skipped - already migrated
    # await seed_organization_wide_defaults()  # Skipped - already seeded
    
    logger.info("✅ Core security initialization complete")
    
    # OPTIMIZATION: Create indexes for DocFlow collections (idempotent)
    try:
        # DocFlow Templates - compound index for tenant + status queries
        await db.docflow_templates.create_index([("tenant_id", 1), ("status", 1)])
        await db.docflow_templates.create_index([("tenant_id", 1), ("created_at", -1)])
        await db.docflow_templates.create_index([("tenant_id", 1), ("trigger_config.enabled", 1), ("trigger_config.object_type", 1)])
        
        # DocFlow Documents - compound indexes for common queries
        await db.docflow_documents.create_index([("tenant_id", 1), ("status", 1)])
        await db.docflow_documents.create_index([("tenant_id", 1), ("created_at", -1)])
        await db.docflow_documents.create_index("public_token", unique=True, sparse=True)
        await db.docflow_documents.create_index("parent_document_id", sparse=True)
        await db.docflow_documents.create_index("recipients.public_token", sparse=True)
        
        # Tenant Objects & Schema - for trigger/CRM object queries
        await db.tenant_objects.create_index([("tenant_id", 1), ("object_name", 1)])
        await db.metadata_fields.create_index([("tenant_id", 1), ("object_name", 1)])
        await db.schema_objects.create_index([("tenant_id", 1), ("is_active", 1)])
        await db.schema_fields.create_index([("tenant_id", 1), ("object_id", 1), ("is_active", 1)])
        await db.schema_fields.create_index([("tenant_id", 1), ("object_id", 1), ("field_type", 1)])
        
        # Email history
        await db.docflow_email_history.create_index([("tenant_id", 1), ("sent_at", -1)])
        
        # Version control indexes
        await db.docflow_templates.create_index([("template_group_id", 1), ("tenant_id", 1)])
        await db.docflow_templates.create_index([("tenant_id", 1), ("is_latest", 1)])

        # DocFlow Package indexes
        await db.docflow_packages.create_index([("tenant_id", 1), ("status", 1)])
        await db.docflow_packages.create_index([("tenant_id", 1), ("created_at", -1)])
        await db.docflow_packages.create_index("recipients.public_token", sparse=True)
        await db.docflow_documents.create_index("package_id", sparse=True)

        # DocFlow Audit Event indexes
        await db.docflow_audit_events.create_index([("package_id", 1), ("tenant_id", 1)])
        await db.docflow_audit_events.create_index([("document_id", 1), ("tenant_id", 1)])
        await db.docflow_audit_events.create_index([("tenant_id", 1), ("timestamp", -1)])

        # DocFlow Package Template indexes
        await db.docflow_package_templates.create_index([("tenant_id", 1), ("created_at", -1)])

        # DocFlow Package Runs indexes
        await db.docflow_package_runs.create_index([("package_id", 1), ("tenant_id", 1)])
        await db.docflow_package_runs.create_index([("tenant_id", 1), ("created_at", -1)])
        
        logger.info("✅ DocFlow database indexes created/verified")
    except Exception as e:
        logger.warning(f"DocFlow index creation warning: {str(e)}")

    # Auto-migrate legacy templates with version fields (idempotent)
    try:
        from modules.docflow.services.template_service import TemplateService
        ts = TemplateService(db)
        migrated = await ts.migrate_version_fields()
        if migrated:
            logger.info(f"✅ Migrated {migrated} templates with version control fields")
    except Exception as e:
        logger.warning(f"Template version migration warning: {str(e)}")
    
    # Skip tenant iteration loops for faster startup
    # These features are already seeded from previous runs
    
    # Start notification reminder scheduler
    try:
        from modules.notifications.services import get_reminder_scheduler
        reminder_scheduler = get_reminder_scheduler(db)
        await reminder_scheduler.start()
        logger.info("✅ Notification reminder scheduler started")
    except Exception as e:
        logger.warning(f"Notification reminder scheduler not started: {str(e)}")
    
    # Start audit cleanup scheduler
    try:
        from modules.audit.scheduler import start_audit_cleanup_scheduler
        await start_audit_cleanup_scheduler()
        logger.info("✅ Audit cleanup scheduler started")
    except Exception as e:
        logger.warning(f"Audit cleanup scheduler not started: {str(e)}")
    
    logger.info("✅ Application startup complete")


@app.on_event("shutdown")
async def shutdown_db_client():
    """Close database connection on shutdown"""
    logger.info("🛑 Application shutdown - closing database connection...")
    
    # Stop notification reminder scheduler
    try:
        from modules.notifications.services import get_reminder_scheduler
        reminder_scheduler = get_reminder_scheduler(db)
        await reminder_scheduler.stop()
        logger.info("✅ Notification reminder scheduler stopped")
    except Exception as e:
        logger.warning(f"Error stopping reminder scheduler: {str(e)}")
    
    # Stop audit cleanup scheduler
    try:
        from modules.audit.scheduler import stop_audit_cleanup_scheduler
        await stop_audit_cleanup_scheduler()
        logger.info("✅ Audit cleanup scheduler stopped")
    except Exception as e:
        logger.warning(f"Error stopping audit cleanup scheduler: {str(e)}")
    
    client.close()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
