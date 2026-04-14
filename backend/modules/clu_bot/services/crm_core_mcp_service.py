"""
CLU-BOT CRM Core MCP Service
Handles read operations: record search and record summaries.
MCP = Model Context Protocol - provides CRM data to the AI assistant.
"""
import logging
from typing import Dict, Any, Optional, List
from datetime import datetime
from motor.motor_asyncio import AsyncIOMotorDatabase

from ..models import (
    ActionType, SearchRecordsPayload, RecordSummaryPayload
)

logger = logging.getLogger(__name__)

# Object types supported for search
SEARCHABLE_OBJECTS = ["lead", "contact", "account", "opportunity", "task", "event", "file", "note"]


class CRMCoreMCPService:
    """
    CRM Core MCP - Provides read access to CRM data for CLU-BOT.
    All operations are read-only and respect user permissions.
    """
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
    
    async def search_records(
        self,
        tenant_id: str,
        user_id: str,
        payload: SearchRecordsPayload
    ) -> Dict[str, Any]:
        """
        Search records across specified object type.
        Respects visibility rules based on user permissions.
        
        Returns:
            {
                "records": [...],
                "total": int,
                "object_type": str,
                "query": str
            }
        """
        object_type = payload.object_type.lower()
        
        if object_type not in SEARCHABLE_OBJECTS:
            return {
                "error": f"Object type '{object_type}' is not searchable. Supported: {', '.join(SEARCHABLE_OBJECTS)}",
                "records": [],
                "total": 0
            }
        
        # Build search query
        query = {
            "tenant_id": tenant_id,
            "object_name": object_type
        }
        
        # Add text search across common fields
        search_text = payload.query
        if search_text:
            search_conditions = self._build_search_conditions(object_type, search_text)
            if search_conditions:
                query["$or"] = search_conditions
        
        # Add any additional filters
        if payload.filters:
            for field, value in payload.filters.items():
                query[f"data.{field}"] = value
        
        try:
            # Execute search
            cursor = self.db.object_records.find(query, {"_id": 0})
            cursor = cursor.sort("created_at", -1).limit(payload.limit)
            
            records = await cursor.to_list(length=payload.limit)
            total = await self.db.object_records.count_documents(query)
            
            # Format records for display
            formatted_records = [self._format_record_for_display(r, object_type) for r in records]
            
            return {
                "records": formatted_records,
                "total": total,
                "object_type": object_type,
                "query": search_text,
                "success": True
            }
            
        except Exception as e:
            logger.error(f"Search error: {str(e)}")
            return {
                "error": f"Search failed: {str(e)}",
                "records": [],
                "total": 0,
                "success": False
            }
    
    async def get_record_summary(
        self,
        tenant_id: str,
        user_id: str,
        payload: RecordSummaryPayload
    ) -> Dict[str, Any]:
        """
        Get a summary of a specific record.
        Provides key fields and related information.
        
        Returns:
            {
                "record": {...},
                "summary": "AI-friendly summary text",
                "related": {...}
            }
        """
        object_type = payload.object_type.lower()
        record_id = payload.record_id
        
        try:
            # Find record by ID or series_id
            record = await self.db.object_records.find_one({
                "tenant_id": tenant_id,
                "object_name": object_type,
                "$or": [
                    {"id": record_id},
                    {"series_id": record_id}
                ]
            }, {"_id": 0})
            
            if not record:
                # Try searching by name if it looks like a name
                if not self._looks_like_id(record_id):
                    record = await self._find_by_name(tenant_id, object_type, record_id)
            
            if not record:
                return {
                    "error": f"Record not found: {record_id}",
                    "success": False
                }
            
            # Build summary
            summary = self._build_record_summary(record, object_type)
            
            # Get related records
            related = await self._get_related_records(tenant_id, record, object_type)
            
            # Get recent activities
            activities = await self._get_recent_activities(tenant_id, record.get("id"))
            
            return {
                "record": self._format_record_for_display(record, object_type),
                "summary": summary,
                "related": related,
                "activities": activities,
                "success": True
            }
            
        except Exception as e:
            logger.error(f"Get summary error: {str(e)}")
            return {
                "error": f"Failed to get record summary: {str(e)}",
                "success": False
            }
    
    def _build_search_conditions(self, object_type: str, search_text: str) -> List[Dict]:
        """Build $or conditions for searching common fields"""
        conditions = []
        
        # Common searchable fields by object type
        SEARCH_FIELDS = {
            "lead": ["first_name", "last_name", "email", "company", "name"],
            "contact": ["first_name", "last_name", "email", "phone", "name"],
            "account": ["account_name", "name", "phone", "website"],
            "opportunity": ["name", "opportunity_name", "stage"],
            "task": ["subject", "description"],
            "event": ["subject", "name", "description", "location"],
            "file": ["name", "file_name", "title"],
            "note": ["title", "body_text"]
        }
        
        fields = SEARCH_FIELDS.get(object_type, ["name"])
        
        for field in fields:
            conditions.append({
                f"data.{field}": {"$regex": search_text, "$options": "i"}
            })
        
        # Also search series_id
        conditions.append({"series_id": {"$regex": search_text, "$options": "i"}})
        
        return conditions
    
    def _format_record_for_display(self, record: Dict[str, Any], object_type: str) -> Dict[str, Any]:
        """Format record for user-friendly display"""
        data = record.get("data", {})
        
        # Get display name based on object type
        display_name = self._get_display_name(data, object_type)
        
        return {
            "id": record.get("id"),
            "series_id": record.get("series_id"),
            "object_type": object_type,
            "name": display_name,
            "data": data,
            "created_at": record.get("created_at"),
            "updated_at": record.get("updated_at"),
            "owner_id": record.get("owner_id")
        }
    
    def _get_display_name(self, data: Dict[str, Any], object_type: str) -> str:
        """Get the display name for a record"""
        if object_type in ["lead", "contact"]:
            first = data.get("first_name", "")
            last = data.get("last_name", "")
            if first or last:
                return f"{first} {last}".strip()
            return data.get("name", "Unknown")
        
        if object_type == "account":
            return data.get("account_name") or data.get("name", "Unknown Account")
        
        if object_type == "opportunity":
            return data.get("opportunity_name") or data.get("name", "Unknown Opportunity")
        
        if object_type in ["task", "event"]:
            return data.get("subject") or data.get("name", "Unknown")
        
        if object_type == "note":
            return data.get("title", "Untitled Note")
        
        if object_type == "file":
            return data.get("file_name") or data.get("name", "Unknown File")
        
        return data.get("name", "Unknown")
    
    def _build_record_summary(self, record: Dict[str, Any], object_type: str) -> str:
        """Build a human-readable summary of a record"""
        data = record.get("data", {})
        name = self._get_display_name(data, object_type)
        parts = [f"**{object_type.title()}**: {name}"]
        
        if object_type == "lead":
            if data.get("email"):
                parts.append(f"Email: {data['email']}")
            if data.get("company"):
                parts.append(f"Company: {data['company']}")
            if data.get("status"):
                parts.append(f"Status: {data['status']}")
            if data.get("lead_source"):
                parts.append(f"Source: {data['lead_source']}")
        
        elif object_type == "contact":
            if data.get("email"):
                parts.append(f"Email: {data['email']}")
            if data.get("phone"):
                parts.append(f"Phone: {data['phone']}")
            if data.get("title"):
                parts.append(f"Title: {data['title']}")
        
        elif object_type == "account":
            if data.get("industry"):
                parts.append(f"Industry: {data['industry']}")
            if data.get("phone"):
                parts.append(f"Phone: {data['phone']}")
            if data.get("website"):
                parts.append(f"Website: {data['website']}")
        
        elif object_type == "opportunity":
            if data.get("amount"):
                parts.append(f"Amount: ${data['amount']:,.2f}" if isinstance(data['amount'], (int, float)) else f"Amount: {data['amount']}")
            if data.get("stage"):
                parts.append(f"Stage: {data['stage']}")
            if data.get("close_date"):
                parts.append(f"Close Date: {data['close_date']}")
        
        elif object_type == "task":
            if data.get("status"):
                parts.append(f"Status: {data['status']}")
            if data.get("priority"):
                parts.append(f"Priority: {data['priority']}")
            if data.get("due_date"):
                parts.append(f"Due: {data['due_date']}")
        
        return " | ".join(parts)
    
    async def _get_related_records(
        self,
        tenant_id: str,
        record: Dict[str, Any],
        object_type: str
    ) -> Dict[str, List[Dict]]:
        """Get records related to this record"""
        related = {}
        record_id = record.get("id")
        series_id = record.get("series_id")
        
        try:
            # Get related tasks
            tasks = await self.db.object_records.find({
                "tenant_id": tenant_id,
                "object_name": "task",
                "$or": [
                    {"data.related_to": record_id},
                    {"data.related_to": series_id},
                    {f"data.{object_type}_id": record_id},
                    {f"data.{object_type}_id": series_id}
                ]
            }, {"_id": 0}).limit(5).to_list(5)
            
            if tasks:
                related["tasks"] = [self._format_record_for_display(t, "task") for t in tasks]
            
            # Get related notes
            notes = await self.db.notes.find({
                "tenant_id": tenant_id,
                "$or": [
                    {"linked_entity_id": record_id},
                    {"linked_entity_id": series_id}
                ]
            }, {"_id": 0}).limit(5).to_list(5)
            
            if notes:
                related["notes"] = notes
            
        except Exception as e:
            logger.warning(f"Error getting related records: {e}")
        
        return related
    
    async def _get_recent_activities(self, tenant_id: str, record_id: str) -> List[Dict]:
        """Get recent activities for a record"""
        try:
            activities = await self.db.crm_activities.find({
                "tenant_id": tenant_id,
                "record_id": record_id
            }, {"_id": 0}).sort("timestamp", -1).limit(5).to_list(5)
            return activities
        except Exception as e:
            logger.warning(f"Error getting activities: {e}")
            return []
    
    async def _find_by_name(self, tenant_id: str, object_type: str, name: str) -> Optional[Dict]:
        """Try to find a record by name"""
        search_conditions = self._build_search_conditions(object_type, name)
        
        record = await self.db.object_records.find_one({
            "tenant_id": tenant_id,
            "object_name": object_type,
            "$or": search_conditions
        }, {"_id": 0})
        
        return record
    
    def _looks_like_id(self, value: str) -> bool:
        """Check if a value looks like an ID (UUID or series_id)"""
        import re
        # UUID pattern
        uuid_pattern = r'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
        # Series ID pattern (prefix-suffix)
        series_pattern = r'^[a-z]{3}-[a-z0-9]+$'
        
        return bool(re.match(uuid_pattern, value) or re.match(series_pattern, value))


# Factory function
def get_crm_core_mcp_service(db: AsyncIOMotorDatabase) -> CRMCoreMCPService:
    """Get CRMCoreMCPService instance"""
    return CRMCoreMCPService(db)
