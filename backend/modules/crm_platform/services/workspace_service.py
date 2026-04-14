from motor.motor_asyncio import AsyncIOMotorDatabase
from typing import Optional, Dict, Any, List
from datetime import datetime, timezone
from uuid import uuid4

class WorkspaceService:
    """Service to manage user workspace state"""
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.collection = db.crm_workspaces
    
    async def get_workspace(self, user_id: str, tenant_id: str) -> Optional[Dict[str, Any]]:
        """Get user's workspace state"""
        return await self.collection.find_one(
            {"user_id": user_id, "tenant_id": tenant_id},
            {"_id": 0}
        )
    
    async def create_workspace(self, user_id: str, tenant_id: str) -> Dict[str, Any]:
        """Create new workspace for user"""
        workspace = {
            "id": str(uuid4()),
            "user_id": user_id,
            "tenant_id": tenant_id,
            "app_id": None,
            "primary_tabs": [],
            "active_primary_tab_id": None,
            "subtabs": {},
            "active_subtab_ids": {},
            "last_updated": datetime.now(timezone.utc),
            "created_at": datetime.now(timezone.utc)
        }
        await self.collection.insert_one(workspace)
        return workspace
    
    async def update_workspace(self, user_id: str, tenant_id: str, updates: Dict[str, Any]) -> bool:
        """Update workspace state"""
        updates["last_updated"] = datetime.now(timezone.utc)
        
        result = await self.collection.update_one(
            {"user_id": user_id, "tenant_id": tenant_id},
            {"$set": updates},
            upsert=True
        )
        return result.modified_count > 0 or result.upserted_id is not None
    
    async def open_primary_tab(self, user_id: str, tenant_id: str, tab_data: Dict[str, Any]) -> Dict[str, Any]:
        """Open a primary tab"""
        workspace = await self.get_workspace(user_id, tenant_id)
        if not workspace:
            workspace = await self.create_workspace(user_id, tenant_id)
        
        # Check if tab already exists
        existing_tabs = workspace.get("primary_tabs", [])
        for tab in existing_tabs:
            if tab.get("id") == tab_data.get("id"):
                # Tab exists, just activate it
                await self.update_workspace(user_id, tenant_id, {
                    "active_primary_tab_id": tab["id"]
                })
                return workspace
        
        # Add new tab
        existing_tabs.append(tab_data)
        await self.update_workspace(user_id, tenant_id, {
            "primary_tabs": existing_tabs,
            "active_primary_tab_id": tab_data["id"]
        })
        
        return await self.get_workspace(user_id, tenant_id)
    
    async def open_subtab(self, user_id: str, tenant_id: str, primary_tab_id: str, 
                         subtab_data: Dict[str, Any]) -> Dict[str, Any]:
        """Open a subtab under a primary tab"""
        workspace = await self.get_workspace(user_id, tenant_id)
        if not workspace:
            return None
        
        subtabs = workspace.get("subtabs", {})
        tab_subtabs = subtabs.get(primary_tab_id, [])
        
        # Check if subtab already exists
        for subtab in tab_subtabs:
            if subtab.get("id") == subtab_data.get("id"):
                # Subtab exists, just activate it
                active_subtab_ids = workspace.get("active_subtab_ids", {})
                active_subtab_ids[primary_tab_id] = subtab["id"]
                await self.update_workspace(user_id, tenant_id, {
                    "active_subtab_ids": active_subtab_ids
                })
                return workspace
        
        # Add new subtab
        tab_subtabs.append(subtab_data)
        subtabs[primary_tab_id] = tab_subtabs
        
        active_subtab_ids = workspace.get("active_subtab_ids", {})
        active_subtab_ids[primary_tab_id] = subtab_data["id"]
        
        await self.update_workspace(user_id, tenant_id, {
            "subtabs": subtabs,
            "active_subtab_ids": active_subtab_ids
        })
        
        return await self.get_workspace(user_id, tenant_id)
    
    async def close_primary_tab(self, user_id: str, tenant_id: str, tab_id: str) -> Dict[str, Any]:
        """Close a primary tab and its subtabs"""
        workspace = await self.get_workspace(user_id, tenant_id)
        if not workspace:
            return None
        
        # Remove tab
        tabs = [t for t in workspace.get("primary_tabs", []) if t.get("id") != tab_id]
        
        # Remove subtabs
        subtabs = workspace.get("subtabs", {})
        if tab_id in subtabs:
            del subtabs[tab_id]
        
        # Update active tab if needed
        active_tab_id = workspace.get("active_primary_tab_id")
        if active_tab_id == tab_id:
            active_tab_id = tabs[0]["id"] if tabs else None
        
        await self.update_workspace(user_id, tenant_id, {
            "primary_tabs": tabs,
            "subtabs": subtabs,
            "active_primary_tab_id": active_tab_id
        })
        
        return await self.get_workspace(user_id, tenant_id)
    
    async def close_subtab(self, user_id: str, tenant_id: str, primary_tab_id: str, 
                          subtab_id: str) -> Dict[str, Any]:
        """Close a subtab"""
        workspace = await self.get_workspace(user_id, tenant_id)
        if not workspace:
            return None
        
        subtabs = workspace.get("subtabs", {})
        if primary_tab_id in subtabs:
            subtabs[primary_tab_id] = [
                s for s in subtabs[primary_tab_id] 
                if s.get("id") != subtab_id
            ]
            
            # Update active subtab
            active_subtab_ids = workspace.get("active_subtab_ids", {})
            if active_subtab_ids.get(primary_tab_id) == subtab_id:
                remaining = subtabs[primary_tab_id]
                active_subtab_ids[primary_tab_id] = remaining[-1]["id"] if remaining else None
            
            await self.update_workspace(user_id, tenant_id, {
                "subtabs": subtabs,
                "active_subtab_ids": active_subtab_ids
            })
        
        return await self.get_workspace(user_id, tenant_id)
    
    async def reorder_tabs(self, user_id: str, tenant_id: str, new_order: List[str]) -> Dict[str, Any]:
        """Reorder primary tabs"""
        workspace = await self.get_workspace(user_id, tenant_id)
        if not workspace:
            return None
        
        tabs = workspace.get("primary_tabs", [])
        tab_dict = {t["id"]: t for t in tabs}
        
        # Reorder based on new_order
        reordered = [tab_dict[tab_id] for tab_id in new_order if tab_id in tab_dict]
        
        await self.update_workspace(user_id, tenant_id, {
            "primary_tabs": reordered
        })
        
        return await self.get_workspace(user_id, tenant_id)
