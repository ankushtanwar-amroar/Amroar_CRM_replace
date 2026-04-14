"""
List Views Module - User List View Management
Routes for managing user-defined list views.
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone
import uuid

from config.database import db
from shared.models import User, UserListView
from modules.auth.api.auth_routes import get_current_user

router = APIRouter(prefix="/list-views", tags=["List Views"])


def parse_from_mongo(data):
    """Convert ISO strings back to datetime objects"""
    if isinstance(data, dict):
        parsed_data = {}
        for key, value in data.items():
            if key in ['created_at', 'updated_at'] and isinstance(value, str):
                try:
                    parsed_data[key] = datetime.fromisoformat(value)
                except:
                    parsed_data[key] = value
            elif isinstance(value, dict):
                parsed_data[key] = parse_from_mongo(value)
            else:
                parsed_data[key] = value
        return parsed_data
    return data


def prepare_for_mongo(data):
    """Convert datetime objects to ISO strings for MongoDB"""
    if isinstance(data, dict):
        prepared_data = {}
        for key, value in data.items():
            if isinstance(value, datetime):
                prepared_data[key] = value.isoformat()
            elif isinstance(value, dict):
                prepared_data[key] = prepare_for_mongo(value)
            else:
                prepared_data[key] = value
        return prepared_data
    return data


# Request models
class CreateListViewRequest(BaseModel):
    name: str
    filter_criteria: Dict[str, Any] = {}
    columns: List[str] = []
    sort_field: Optional[str] = None
    sort_order: str = "asc"
    visibility: str = "private"


class UpdateListViewRequest(BaseModel):
    name: Optional[str] = None
    filter_criteria: Optional[Dict[str, Any]] = None
    columns: Optional[List[str]] = None
    sort_field: Optional[str] = None
    sort_order: Optional[str] = None
    visibility: Optional[str] = None


@router.get("/{object_name}")
async def get_list_views(
    object_name: str,
    current_user: User = Depends(get_current_user)
):
    """Get all list views for an object"""
    # Get user-specific list views
    user_views = await db.user_list_views.find({
        "tenant_id": current_user.tenant_id,
        "user_id": current_user.id,
        "object_name": object_name
    }, {"_id": 0}).to_list(None)
    
    # Default system views
    default_views = [
        {
            "id": "all_records",
            "name": "All Records",
            "filter_criteria": {},
            "is_system": True,
            "is_pinned": False
        },
        {
            "id": "recently_viewed",
            "name": "Recently Viewed",
            "filter_criteria": {"recently_viewed": True},
            "is_system": True,
            "is_pinned": False
        },
        {
            "id": "my_records",
            "name": "My Records", 
            "filter_criteria": {"owner_id": current_user.id},
            "is_system": True,
            "is_pinned": False
        }
    ]
    
    return {
        "system_views": default_views,
        "user_views": [UserListView(**parse_from_mongo(view)) for view in user_views]
    }


@router.post("/{object_name}")
async def create_list_view_simple(
    object_name: str,
    name: str,
    filter_criteria: Dict[str, Any],
    sort_field: Optional[str] = None,
    sort_order: str = "asc",
    current_user: User = Depends(get_current_user)
):
    """Create a new list view (simple endpoint)"""
    list_view = UserListView(
        user_id=current_user.id,
        tenant_id=current_user.tenant_id,
        object_name=object_name,
        name=name,
        filter_criteria=filter_criteria,
        sort_field=sort_field,
        sort_order=sort_order
    )
    
    list_view_doc = prepare_for_mongo(list_view.model_dump())
    await db.user_list_views.insert_one(list_view_doc)
    
    return list_view


@router.patch("/{list_view_id}/pin")
async def toggle_list_view_pin(
    list_view_id: str,
    is_pinned: bool,
    current_user: User = Depends(get_current_user)
):
    """Toggle pin status for a list view"""
    await db.user_list_views.update_one(
        {
            "id": list_view_id,
            "user_id": current_user.id,
            "tenant_id": current_user.tenant_id
        },
        {"$set": {"is_pinned": is_pinned}}
    )
    return {"success": True}


@router.post("/{object_name}/create")
async def create_user_list_view(
    object_name: str,
    request: CreateListViewRequest,
    current_user: User = Depends(get_current_user)
):
    """Create a new user list view"""
    list_view = {
        "id": str(uuid.uuid4()),
        "user_id": current_user.id,
        "tenant_id": current_user.tenant_id,
        "object_name": object_name,
        "name": request.name,
        "filter_criteria": request.filter_criteria,
        "columns": request.columns,
        "sort_field": request.sort_field,
        "sort_order": request.sort_order,
        "visibility": request.visibility,
        "is_pinned": False,
        "is_default": False,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.user_list_views.insert_one(list_view)
    list_view.pop("_id", None)
    
    return list_view


@router.post("/{object_name}/{list_view_id}/clone")
async def clone_list_view(
    object_name: str,
    list_view_id: str,
    name: str,
    current_user: User = Depends(get_current_user)
):
    """Clone an existing list view (including system views)"""
    
    # Check if it's a system view
    system_views = ["all_records", "recently_viewed", "my_records"]
    
    if list_view_id in system_views:
        # Create a clone from system view defaults
        cloned_view = {
            "id": str(uuid.uuid4()),
            "user_id": current_user.id,
            "tenant_id": current_user.tenant_id,
            "object_name": object_name,
            "name": name,
            "filter_criteria": {},
            "columns": [],
            "sort_field": None,
            "sort_order": "asc",
            "visibility": "private",
            "is_pinned": False,
            "is_default": False,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        
        # Add specific filter for my_records
        if list_view_id == "my_records":
            cloned_view["filter_criteria"] = {"owner_id": {"condition": "equals", "value": current_user.id}}
    else:
        # Find the original user view
        original = await db.user_list_views.find_one({
            "id": list_view_id,
            "tenant_id": current_user.tenant_id
        }, {"_id": 0})
        
        if not original:
            raise HTTPException(status_code=404, detail="List view not found")
        
        # Create a clone from user view
        cloned_view = {
            "id": str(uuid.uuid4()),
            "user_id": current_user.id,
            "tenant_id": current_user.tenant_id,
            "object_name": original.get("object_name", object_name),
            "name": name,
            "filter_criteria": original.get("filter_criteria", {}),
            "columns": original.get("columns", []),
            "sort_field": original.get("sort_field"),
            "sort_order": original.get("sort_order", "asc"),
            "visibility": "private",
            "is_pinned": False,
            "is_default": False,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
    
    await db.user_list_views.insert_one(cloned_view)
    cloned_view.pop("_id", None)
    
    return cloned_view


@router.patch("/{list_view_id}/update")
async def update_list_view(
    list_view_id: str,
    request: UpdateListViewRequest,
    current_user: User = Depends(get_current_user)
):
    """Update an existing list view"""
    # Build update dict from non-None fields
    update_data = {}
    if request.name is not None:
        update_data["name"] = request.name
    if request.filter_criteria is not None:
        update_data["filter_criteria"] = request.filter_criteria
    if request.columns is not None:
        update_data["columns"] = request.columns
    if request.sort_field is not None:
        update_data["sort_field"] = request.sort_field
    if request.sort_order is not None:
        update_data["sort_order"] = request.sort_order
    if request.visibility is not None:
        update_data["visibility"] = request.visibility
    
    if not update_data:
        raise HTTPException(status_code=400, detail="No update data provided")
    
    result = await db.user_list_views.update_one(
        {
            "id": list_view_id,
            "user_id": current_user.id,
            "tenant_id": current_user.tenant_id
        },
        {"$set": update_data}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="List view not found or access denied")
    
    # Return updated view
    updated = await db.user_list_views.find_one({"id": list_view_id}, {"_id": 0})
    return updated


@router.delete("/{list_view_id}")
async def delete_list_view(
    list_view_id: str,
    current_user: User = Depends(get_current_user)
):
    """Delete a user list view"""
    result = await db.user_list_views.delete_one({
        "id": list_view_id,
        "user_id": current_user.id,
        "tenant_id": current_user.tenant_id
    })
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="List view not found or access denied")
    
    return {"success": True, "message": "List view deleted"}
