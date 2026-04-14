"""
Schema Builder - Seed Service
=============================
Pre-seeds Lead and Account objects for initial setup.
"""

import uuid
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorDatabase
import logging

from .models import FieldType

logger = logging.getLogger(__name__)


async def seed_schema_objects(db: AsyncIOMotorDatabase, tenant_id: str, user_id: str = "system"):
    """
    Seed initial schema objects (Lead, Account) for a tenant.
    Only runs if no schema objects exist.
    """
    
    # Check if objects already exist
    existing = await db.schema_objects.count_documents({"tenant_id": tenant_id})
    if existing > 0:
        logger.info(f"Schema objects already exist for tenant {tenant_id}, skipping seed")
        return
    
    now = datetime.now(timezone.utc)
    
    # ========== LEAD OBJECT ==========
    lead_id = str(uuid.uuid4())
    lead_object = {
        "id": lead_id,
        "tenant_id": tenant_id,
        "label": "Lead",
        "api_name": "lead",
        "description": "Potential customers or prospects",
        "plural_label": "Leads",
        "icon": "user-plus",
        "is_custom": False,  # Standard object
        "is_active": True,
        "created_at": now,
        "updated_at": now,
        "created_by": user_id
    }
    
    lead_fields = [
        # System fields
        {
            "id": str(uuid.uuid4()),
            "tenant_id": tenant_id,
            "object_id": lead_id,
            "label": "ID",
            "api_name": "id",
            "field_type": FieldType.TEXT.value,
            "is_required": True,
            "is_unique": True,
            "is_system": True,
            "is_active": True,
            "sort_order": 0,
            "created_at": now,
            "updated_at": now,
            "created_by": user_id
        },
        {
            "id": str(uuid.uuid4()),
            "tenant_id": tenant_id,
            "object_id": lead_id,
            "label": "Created At",
            "api_name": "created_at",
            "field_type": FieldType.DATETIME.value,
            "is_required": False,
            "is_system": True,
            "is_active": True,
            "sort_order": 1,
            "created_at": now,
            "updated_at": now,
            "created_by": user_id
        },
        {
            "id": str(uuid.uuid4()),
            "tenant_id": tenant_id,
            "object_id": lead_id,
            "label": "Updated At",
            "api_name": "updated_at",
            "field_type": FieldType.DATETIME.value,
            "is_required": False,
            "is_system": True,
            "is_active": True,
            "sort_order": 2,
            "created_at": now,
            "updated_at": now,
            "created_by": user_id
        },
        # User fields
        {
            "id": str(uuid.uuid4()),
            "tenant_id": tenant_id,
            "object_id": lead_id,
            "label": "Name",
            "api_name": "name",
            "field_type": FieldType.TEXT.value,
            "is_required": True,
            "is_unique": False,
            "is_system": False,
            "is_active": True,
            "sort_order": 3,
            "help_text": "Full name of the lead",
            "created_at": now,
            "updated_at": now,
            "created_by": user_id
        },
        {
            "id": str(uuid.uuid4()),
            "tenant_id": tenant_id,
            "object_id": lead_id,
            "label": "Email",
            "api_name": "email",
            "field_type": FieldType.EMAIL.value,
            "is_required": False,
            "is_unique": False,
            "is_system": False,
            "is_active": True,
            "sort_order": 4,
            "help_text": "Primary email address",
            "created_at": now,
            "updated_at": now,
            "created_by": user_id
        },
        {
            "id": str(uuid.uuid4()),
            "tenant_id": tenant_id,
            "object_id": lead_id,
            "label": "Phone",
            "api_name": "phone",
            "field_type": FieldType.PHONE.value,
            "is_required": False,
            "is_unique": False,
            "is_system": False,
            "is_active": True,
            "sort_order": 5,
            "help_text": "Primary phone number",
            "created_at": now,
            "updated_at": now,
            "created_by": user_id
        }
    ]
    
    # ========== ACCOUNT OBJECT ==========
    account_id = str(uuid.uuid4())
    account_object = {
        "id": account_id,
        "tenant_id": tenant_id,
        "label": "Account",
        "api_name": "account",
        "description": "Companies or organizations",
        "plural_label": "Accounts",
        "icon": "building",
        "is_custom": False,  # Standard object
        "is_active": True,
        "created_at": now,
        "updated_at": now,
        "created_by": user_id
    }
    
    account_fields = [
        # System fields
        {
            "id": str(uuid.uuid4()),
            "tenant_id": tenant_id,
            "object_id": account_id,
            "label": "ID",
            "api_name": "id",
            "field_type": FieldType.TEXT.value,
            "is_required": True,
            "is_unique": True,
            "is_system": True,
            "is_active": True,
            "sort_order": 0,
            "created_at": now,
            "updated_at": now,
            "created_by": user_id
        },
        {
            "id": str(uuid.uuid4()),
            "tenant_id": tenant_id,
            "object_id": account_id,
            "label": "Created At",
            "api_name": "created_at",
            "field_type": FieldType.DATETIME.value,
            "is_required": False,
            "is_system": True,
            "is_active": True,
            "sort_order": 1,
            "created_at": now,
            "updated_at": now,
            "created_by": user_id
        },
        {
            "id": str(uuid.uuid4()),
            "tenant_id": tenant_id,
            "object_id": account_id,
            "label": "Updated At",
            "api_name": "updated_at",
            "field_type": FieldType.DATETIME.value,
            "is_required": False,
            "is_system": True,
            "is_active": True,
            "sort_order": 2,
            "created_at": now,
            "updated_at": now,
            "created_by": user_id
        },
        # User fields
        {
            "id": str(uuid.uuid4()),
            "tenant_id": tenant_id,
            "object_id": account_id,
            "label": "Name",
            "api_name": "name",
            "field_type": FieldType.TEXT.value,
            "is_required": True,
            "is_unique": False,
            "is_system": False,
            "is_active": True,
            "sort_order": 3,
            "help_text": "Company or organization name",
            "created_at": now,
            "updated_at": now,
            "created_by": user_id
        },
        {
            "id": str(uuid.uuid4()),
            "tenant_id": tenant_id,
            "object_id": account_id,
            "label": "Phone",
            "api_name": "phone",
            "field_type": FieldType.PHONE.value,
            "is_required": False,
            "is_unique": False,
            "is_system": False,
            "is_active": True,
            "sort_order": 4,
            "help_text": "Main phone number",
            "created_at": now,
            "updated_at": now,
            "created_by": user_id
        }
    ]
    
    # Insert objects
    await db.schema_objects.insert_many([lead_object, account_object])
    
    # Insert fields
    await db.schema_fields.insert_many(lead_fields + account_fields)
    
    logger.info(f"Seeded Lead and Account schema objects for tenant {tenant_id}")
    
    return {
        "objects_created": 2,
        "fields_created": len(lead_fields) + len(account_fields)
    }
