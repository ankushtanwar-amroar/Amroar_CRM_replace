"""
Lookup Hover Service
Business logic for managing lookup field hover preview assignments
"""
from typing import Dict, List, Optional
from datetime import datetime, timezone
from config.database import db


class LookupHoverService:
    """Service for managing lookup field hover preview configurations"""
    
    COLLECTION_NAME = "lookup_hover_assignments"
    
    @classmethod
    async def get_assignment(cls, object_name: str, field_name: str) -> Optional[Dict]:
        """
        Get hover assignment for a specific lookup field
        
        Args:
            object_name: The object containing the lookup field (e.g., 'contact')
            field_name: The API name of the lookup field (e.g., 'account_id')
            
        Returns:
            Assignment config or None if not configured
        """
        assignment = await db[cls.COLLECTION_NAME].find_one(
            {"object_name": object_name, "field_name": field_name},
            {"_id": 0}
        )
        return assignment
    
    @classmethod
    async def get_assignments_for_object(cls, object_name: str) -> List[Dict]:
        """
        Get all hover assignments for an object
        
        Args:
            object_name: The object to get assignments for
            
        Returns:
            List of assignment configs
        """
        cursor = db[cls.COLLECTION_NAME].find(
            {"object_name": object_name},
            {"_id": 0}
        )
        return await cursor.to_list(length=100)
    
    @classmethod
    async def get_all_assignments(cls) -> List[Dict]:
        """
        Get all hover assignments across all objects
        
        Returns:
            List of all assignment configs
        """
        cursor = db[cls.COLLECTION_NAME].find({}, {"_id": 0})
        return await cursor.to_list(length=500)
    
    @classmethod
    async def upsert_assignment(
        cls,
        object_name: str,
        field_name: str,
        related_object: str,
        enabled: bool,
        preview_fields: List[str],
        primary_display_field: Optional[str] = None,
        searchable_fields: Optional[List[str]] = None,
        show_recent_records: bool = True,
        enable_quick_create: bool = False
    ) -> Dict:
        """
        Create or update a hover assignment for a lookup field
        
        Args:
            object_name: Object containing the lookup field
            field_name: API name of the lookup field
            related_object: Object that the lookup points to
            enabled: Whether hover preview is enabled
            preview_fields: Fields to show in the hover preview
            primary_display_field: Main field to display as link text
            searchable_fields: Fields to include in search
            show_recent_records: Show recently viewed records
            enable_quick_create: Allow creating new records from dropdown
            
        Returns:
            The created/updated assignment
        """
        now = datetime.now(timezone.utc).isoformat()
        
        # Check if assignment exists
        existing = await cls.get_assignment(object_name, field_name)
        
        assignment_data = {
            "object_name": object_name,
            "field_name": field_name,
            "related_object": related_object,
            "enabled": enabled,
            "preview_fields": preview_fields,
            "primary_display_field": primary_display_field or "name",
            "searchable_fields": searchable_fields or ["name"],
            "show_recent_records": show_recent_records,
            "enable_quick_create": enable_quick_create,
            "updated_at": now
        }
        
        if existing:
            # Update existing
            await db[cls.COLLECTION_NAME].update_one(
                {"object_name": object_name, "field_name": field_name},
                {"$set": assignment_data}
            )
        else:
            # Create new
            assignment_data["created_at"] = now
            await db[cls.COLLECTION_NAME].insert_one(assignment_data)
        
        # Return without _id
        return {k: v for k, v in assignment_data.items() if k != "_id"}
    
    @classmethod
    async def delete_assignment(cls, object_name: str, field_name: str) -> bool:
        """
        Delete a hover assignment
        
        Args:
            object_name: Object containing the lookup field
            field_name: API name of the lookup field
            
        Returns:
            True if deleted, False if not found
        """
        result = await db[cls.COLLECTION_NAME].delete_one(
            {"object_name": object_name, "field_name": field_name}
        )
        return result.deleted_count > 0
    
    @classmethod
    async def is_hover_enabled(cls, object_name: str, field_name: str) -> bool:
        """
        Check if hover preview is enabled for a specific lookup field
        
        This is the critical function - returns False unless explicitly configured
        
        Args:
            object_name: Object containing the lookup field
            field_name: API name of the lookup field
            
        Returns:
            True only if assignment exists AND is enabled
        """
        assignment = await cls.get_assignment(object_name, field_name)
        if not assignment:
            return False
        return assignment.get("enabled", False)
    
    @classmethod
    async def get_enabled_lookup_fields_for_object(cls, object_name: str) -> Dict[str, Dict]:
        """
        Get all enabled lookup field hover configs for an object
        Useful for frontend to know which lookup fields should show hover preview
        
        Args:
            object_name: Object to check
            
        Returns:
            Dict mapping field_name to config (only for enabled fields)
        """
        assignments = await cls.get_assignments_for_object(object_name)
        enabled_fields = {}
        for assignment in assignments:
            if assignment.get("enabled", False):
                enabled_fields[assignment["field_name"]] = {
                    "related_object": assignment.get("related_object"),
                    "preview_fields": assignment.get("preview_fields", [])
                }
        return enabled_fields
    
    @classmethod
    async def get_lookup_fields_for_object(cls, object_name: str, tenant_id: str = None) -> List[Dict]:
        """
        Get all lookup fields for an object from tenant_objects.fields AND standard lookup patterns
        This helps the admin UI know which lookup fields exist
        
        Args:
            object_name: Object to get lookup fields for
            tenant_id: Tenant ID (optional for backwards compatibility)
            
        Returns:
            List of lookup field info
        """
        # Standard lookup fields that exist on most objects
        STANDARD_LOOKUP_FIELDS = {
            "lead": [
                {"field_name": "owner_id", "field_label": "Owner", "related_object": "user"},
                {"field_name": "converted_contact_id", "field_label": "Converted Contact", "related_object": "contact"},
                {"field_name": "converted_account_id", "field_label": "Converted Account", "related_object": "account"},
            ],
            "contact": [
                {"field_name": "account_id", "field_label": "Account", "related_object": "account"},
                {"field_name": "owner_id", "field_label": "Owner", "related_object": "user"},
                {"field_name": "reports_to_id", "field_label": "Reports To", "related_object": "contact"},
            ],
            "account": [
                {"field_name": "owner_id", "field_label": "Owner", "related_object": "user"},
                {"field_name": "parent_account_id", "field_label": "Parent Account", "related_object": "account"},
            ],
            "opportunity": [
                {"field_name": "account_id", "field_label": "Account", "related_object": "account"},
                {"field_name": "contact_id", "field_label": "Primary Contact", "related_object": "contact"},
                {"field_name": "owner_id", "field_label": "Owner", "related_object": "user"},
            ],
            "task": [
                {"field_name": "related_to", "field_label": "Related To", "related_object": "lead"},
                {"field_name": "owner_id", "field_label": "Assigned To", "related_object": "user"},
            ],
            "event": [
                {"field_name": "related_to", "field_label": "Related To", "related_object": "lead"},
                {"field_name": "owner_id", "field_label": "Assigned To", "related_object": "user"},
            ],
        }
        
        # Get existing hover assignments for this object
        assignments = await cls.get_assignments_for_object(object_name)
        assignment_map = {a["field_name"]: a for a in assignments}
        
        lookup_fields = []
        seen_fields = set()
        
        # First, get lookup fields from tenant_objects.fields (includes custom lookups)
        query = {"object_name": object_name}
        if tenant_id:
            query["tenant_id"] = tenant_id
        
        tenant_object = await db.tenant_objects.find_one(query, {"_id": 0, "fields": 1})
        
        if tenant_object and tenant_object.get("fields"):
            fields_dict = tenant_object.get("fields", {})
            for field_name, field_config in fields_dict.items():
                if field_config.get("type") == "lookup":
                    related_object = field_config.get("lookup_object") or field_config.get("related_object")
                    if not related_object:
                        continue
                    
                    # Get related object label from tenant_objects
                    related_query = {"object_name": related_object}
                    if tenant_id:
                        related_query["tenant_id"] = tenant_id
                    related_obj = await db.tenant_objects.find_one(related_query, {"_id": 0, "object_label": 1})
                    related_label = related_obj.get("object_label", related_object.capitalize()) if related_obj else related_object.capitalize()
                    
                    # Check if hover is configured
                    assignment = assignment_map.get(field_name)
                    
                    lookup_fields.append({
                        "field_name": field_name,
                        "field_label": field_config.get("label") or field_name.replace("_", " ").title(),
                        "related_object": related_object,
                        "related_object_label": field_config.get("related_object_label") or related_label,
                        "has_hover_config": assignment is not None,
                        "hover_enabled": assignment.get("enabled", False) if assignment else False,
                        "is_required": field_config.get("required", False),
                        "is_searchable": field_config.get("is_searchable", True),
                        "is_custom": field_config.get("is_custom", False)
                    })
                    seen_fields.add(field_name)
        
        # Then add standard lookup fields that may not be in tenant_objects.fields
        standard_fields = STANDARD_LOOKUP_FIELDS.get(object_name.lower(), [])
        for std_field in standard_fields:
            field_name = std_field["field_name"]
            
            # Skip if already added from tenant_objects
            if field_name in seen_fields:
                continue
            
            related_object = std_field["related_object"]
            
            # Get related object label from tenant_objects
            related_query = {"object_name": related_object}
            if tenant_id:
                related_query["tenant_id"] = tenant_id
            related_obj = await db.tenant_objects.find_one(related_query, {"_id": 0, "object_label": 1})
            related_label = related_obj.get("object_label", related_object.capitalize()) if related_obj else related_object.capitalize()
            
            # Check if hover is configured
            assignment = assignment_map.get(field_name)
            
            lookup_fields.append({
                "field_name": field_name,
                "field_label": std_field["field_label"],
                "related_object": related_object,
                "related_object_label": related_label,
                "has_hover_config": assignment is not None,
                "hover_enabled": assignment.get("enabled", False) if assignment else False,
                "is_required": False,
                "is_searchable": True,
                "is_custom": False
            })
            seen_fields.add(field_name)
        
        return lookup_fields
