from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import sys
import os

# Add backend directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))))

security = HTTPBearer()

router = APIRouter(prefix="/api/data-operations/metadata", tags=["Data Operations Metadata"])

# DB and auth will be imported at call time from server
def get_db():
    import server
    return server.db

async def get_auth_user(credentials: HTTPAuthorizationCredentials):
    import server
    return await server.get_current_user(credentials)

@router.get("/objects")
async def get_objects(
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    """Get available objects from tenant's object definitions"""
    
    db = get_db()
    current_user = await get_auth_user(credentials)
    tenant_id = current_user.tenant_id
    
    # Fetch objects for this tenant from tenant_objects collection
    objects_list = await db.tenant_objects.find(
        {"tenant_id": tenant_id},
        {"_id": 0, "object_name": 1, "object_label": 1, "object_plural": 1}
    ).to_list(1000)
    
    print(f"=== METADATA API: Found {len(objects_list)} objects for tenant {tenant_id} ===")
    
    # Format for import/export UI
    formatted_objects = []
    for obj in objects_list:
        formatted_objects.append({
            "name": obj.get("object_name"),
            "label": obj.get("object_label"),
            "api_name": obj.get("object_name"),
            "plural": obj.get("object_plural")
        })
    
    return formatted_objects
    
    # Format for import/export UI
    formatted_objects = []
    for obj in objects_list:
        formatted_objects.append({
            "name": obj.get("object_name"),
            "label": obj.get("object_label"),
            "api_name": obj.get("object_name"),
            "plural": obj.get("object_plural")
        })
    
    return formatted_objects

@router.get("/objects/{object_name}/fields")
async def get_object_fields(
    object_name: str,
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    """Get fields for an object from its definition"""
    
    db = get_db()
    current_user = await get_auth_user(credentials)
    tenant_id = current_user.tenant_id
    
    # Fetch object definition from tenant_objects collection
    obj = await db.tenant_objects.find_one(
        {"tenant_id": tenant_id, "object_name": object_name},
        {"_id": 0}
    )
    
    if not obj:
        print(f"Object {object_name} not found for tenant {tenant_id}")
        return []
    
    print(f"=== FIELDS API: Found object {object_name}, fields count: {len(obj.get('fields', {}))} ===")
    
    # Format fields for import/export UI
    fields = []
    for field_key, field_def in obj.get("fields", {}).items():
        field_info = {
            "name": field_key,
            "label": field_def.get("label", field_key),
            "type": field_def.get("type", "text"),
            "required": field_def.get("required", False)
        }
        
        # Add picklist values if applicable
        if field_def.get("type") in ["select", "picklist"] and field_def.get("options"):
            field_info["picklist_values"] = field_def.get("options")
        
        fields.append(field_info)
    
    return fields
