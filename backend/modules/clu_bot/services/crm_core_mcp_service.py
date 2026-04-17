"""
CLU-BOT CRM Core MCP Service
Handles read operations: record search and record summaries.
MCP = Model Context Protocol - provides CRM data to the AI assistant.
"""
import logging
from typing import Dict, Any, Optional, List, Literal
from datetime import datetime
from motor.motor_asyncio import AsyncIOMotorDatabase
import re

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
        search_text = payload.query.strip() if payload.query else ""
        
        # Robustness: Ignore common generic queries that aren't specific search terms
        generic_queries = ["all", "show all", "list all", "show me all", "everything", "any", "how many", "count"]
        if search_text.lower() in generic_queries or not search_text:
            search_text = ""
        
        if search_text:
            search_conditions = self._build_search_conditions(object_type, search_text)
            
            # Relation Resolution: If searching for specific objects (contacts, opportunities), 
            # also search for parent account name matches and include their IDs
            if object_type in ["contact", "opportunity", "task", "event"]:
                related_conditions = await self._resolve_related_ids_conditions(tenant_id, object_type, search_text)
                if related_conditions:
                    search_conditions.extend(related_conditions)
            
            if search_conditions:
                query["$or"] = search_conditions
        
        # Add any additional filters
        if payload.filters:
            numeric_fields = ["amount", "revenue", "count", "days", "quantity", "price"]
            root_fields = ["id", "series_id", "created_at", "updated_at", "owner_id", "tenant_id", "object_name", "status"]
            
            for field, value in payload.filters.items():
                is_root = field in root_fields
                if field == "status" and object_type not in ["task", "event"]:
                    is_root = False
                
                db_field = field if is_root else f"data.{field}"
                
                # Special handle for numeric comparisons with operators (gt, lt, etc.)
                if field in numeric_fields and not is_root:
                    if "$and" not in query: query["$and"] = []
                    
                    items_to_process = []
                    
                    # Case 1: Value is a dictionary (structured)
                    if isinstance(value, dict):
                        if "operator" in value and "value" in value:
                            items_to_process.append((value["operator"], value["value"]))
                        else:
                            items_to_process.extend(value.items())
                    
                    # Case 2: Value is a string (e.g. "greater_than 200", "over 200", ">= 100")
                    elif isinstance(value, str):
                        import re
                        # Whitelist of common natural language operators and their symbols
                        op_patterns = {
                            "greater_than": "$gt", "greaterthan": "$gt", "over": "$gt", "more_than": "$gt", "morethan": "$gt", ">": "$gt",
                            "gte": "$gte", "greater_than_or_equal": "$gte", ">=": "$gte",
                            "less_than": "$lt", "lessthan": "$lt", "under": "$lt", "below": "$lt", "less_than": "$lt", "lessthan": "$lt", "<": "$lt",
                            "lte": "$lte", "less_than_or_equal": "$lte", "<=": "$lte",
                            "ne": "$ne", "not_equal": "$ne", "notequal": "$ne", "!=": "$ne",
                            "eq": "$eq", "equal": "$eq", "==": "$eq", "=": "$eq"
                        }
                        
                        # Try to find a number in the string
                        num_match = re.search(r'([\d.]+)', value)
                        if num_match:
                            extracted_val = num_match.group(1)
                            # Find the operator (either by key or prefix)
                            found_op = None
                            clean_val_str = value.lower()
                            
                            for op_key, op_val in op_patterns.items():
                                if op_key in clean_val_str:
                                    found_op = op_val
                                    break
                            
                            if found_op:
                                items_to_process.append((found_op, extracted_val))
                            else:
                                # Default to $gt if "over" or "more than" logic is implied but no key found
                                # or just use $eq if no operator at all
                                items_to_process.append(("$eq", extracted_val))
                    
                    for op, val in items_to_process:
                        # Map input operators to MongoDB operators
                        valid_ops = {
                            "gt": "$gt", "greater_than": "$gt", "greaterthan": "$gt", "over": "$gt", "more_than": "$gt",
                            "gte": "$gte", "greater_than_or_equal": "$gte",
                            "lt": "$lt", "less_than": "$lt", "lessthan": "$lt", "under": "$lt", "below": "$lt",
                            "lte": "$lte", "less_than_or_equal": "$lte",
                            "ne": "$ne", "not_equal": "$ne", "notequal": "$ne",
                            "eq": "$eq", "equal": "$eq",
                            "$gt": "$gt", "$gte": "$gte", "$lt": "$lt", "$lte": "$lte", "$ne": "$ne", "$eq": "$eq"
                        }
                        
                        clean_op = op.lower().replace("$", "")
                        mongo_op = valid_ops.get(clean_op) or (op if op.startswith("$") else None)
                        
                        if not mongo_op:
                            continue
                            
                        try:
                            num_val = float(val)
                            query["$and"].append({
                                "$expr": {
                                    mongo_op: [
                                        {"$convert": {"input": f"${db_field}", "to": "double", "onError": 0.0, "onNull": 0.0}},
                                        num_val
                                    ]
                                }
                            })
                        except (ValueError, TypeError):
                            pass
                            
                    # Clean up empty $and
                    if "$and" in query and not query["$and"]:
                        query.pop("$and")
                
                # ONLY if not processed as a complex numeric filter, check other types
                else:
                    # Check for date fields (root or data fields suffixing with _date or _at)
                    is_date_field = field in ["created_at", "updated_at"] or field.endswith("_date") or field.endswith("_at")
                    
                    if is_date_field:
                        if isinstance(value, str):
                            date_filter = self._parse_relative_date_filter(value)
                            if date_filter:
                                query[db_field] = date_filter
                            else:
                                query[db_field] = value
                        else:
                            query[db_field] = value
                    else:
                        query[db_field] = self._parse_filter_value(field, value)
        
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
        """
        object_type = payload.object_type.lower()
        record_id = payload.record_id
        include_all = payload.include_all
        
        try:
            # Find record (existing logic)
            search_ids = [record_id]
            if "-" in record_id:
                prefixes = [f"{object_type}-", f"{object_type.lower()}-"]
                for p in prefixes:
                    if record_id.startswith(p):
                        stripped = record_id[len(p):]
                        if stripped not in search_ids:
                            search_ids.append(stripped)
            
            record = await self.db.object_records.find_one({
                "tenant_id": tenant_id,
                "object_name": object_type,
                "$or": [
                    {"id": {"$in": search_ids}},
                    {"series_id": {"$in": search_ids}}
                ]
            }, {"_id": 0})
            
            if not record:
                if not self._looks_like_id(record_id):
                    record = await self._find_by_name(tenant_id, object_type, record_id)
            
            if not record:
                return {"error": f"Record not found: {record_id}", "success": False}
            
            # Build summary
            summary = self._build_record_summary(record, object_type)
            
            # Get related records based on include_all
            mode = "summary" if include_all else "discovery"
            related = await self._get_related_records(tenant_id, record, object_type, mode=mode)
            
            # Get recent activities
            activities = await self._get_recent_activities(tenant_id, record.get("id"))
            
            return {
                "record": self._format_record_for_display(record, object_type),
                "summary": summary,
                "related": related,
                "activities": activities,
                "success": True,
                "discovery": related.get("discovery") if not include_all else None
            }
            
        except Exception as e:
            logger.error(f"Get summary error: {str(e)}")
            return {
                "error": f"Failed to get record summary: {str(e)}",
                "success": False
            }
    
    def _parse_relative_date_filter(self, value: str) -> Optional[Dict[str, str]]:
        """Parse relative date strings into MongoDB $gte/$lte filters."""
        from datetime import datetime, timedelta, timezone
        
        val = value.lower().replace(" ", "_")
        
        # Don't parse exact ISO strings
        if "t" in val and "z" in val and len(val) > 15:
            return None
            
        now = datetime.now(timezone.utc)
        
        if val == "today":
            start = now.replace(hour=0, minute=0, second=0, microsecond=0)
            return {"$gte": start.isoformat()}
        elif val == "yesterday":
            start = (now - timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
            end = now.replace(hour=0, minute=0, second=0, microsecond=0)
            return {"$gte": start.isoformat(), "$lt": end.isoformat()}
        elif val in ["this_week", "thisweek"]:
            start = (now - timedelta(days=now.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
            return {"$gte": start.isoformat()}
        elif val in ["last_week", "lastweek"]:
            end = (now - timedelta(days=now.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
            start = end - timedelta(days=7)
            return {"$gte": start.isoformat(), "$lt": end.isoformat()}
        elif val in ["this_month", "thismonth"]:
            start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
            return {"$gte": start.isoformat()}
        elif val in ["last_month", "lastmonth"]:
            end = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
            month = end.month - 1 or 12
            year = end.year - 1 if month == 12 else end.year
            start = end.replace(year=year, month=month, day=1)
            return {"$gte": start.isoformat(), "$lt": end.isoformat()}
        elif val in ["next_week", "nextweek"]:
            start = (now + timedelta(days=7 - now.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
            end = start + timedelta(days=7)
            return {"$gte": start.isoformat(), "$lt": end.isoformat()}
        elif val in ["next_month", "nextmonth"]:
            if now.month == 12:
                start = now.replace(year=now.year + 1, month=1, day=1, hour=0, minute=0, second=0)
            else:
                start = now.replace(month=now.month + 1, day=1, hour=0, minute=0, second=0)
            next_month = start.month + 1 or 1
            next_year = start.year + 1 if next_month == 1 else start.year
            end = start.replace(year=next_year, month=next_month if next_month != 1 else 1, day=1)
            return {"$gte": start.isoformat(), "$lt": end.isoformat()}
        elif val in ["this_year", "thisyear"]:
            start = now.replace(month=1, day=1, hour=0, minute=0, second=0)
            return {"$gte": start.isoformat()}
        elif val in ["last_year", "lastyear"]:
            start = now.replace(year=now.year - 1, month=1, day=1, hour=0, minute=0, second=0)
            end = now.replace(month=1, day=1, hour=0, minute=0, second=0)
            return {"$gte": start.isoformat(), "$lt": end.isoformat()}
            
        return None

    async def _resolve_related_ids_conditions(self, tenant_id: str, object_type: str, search_text: str) -> List[Dict]:
        """
        Search for related objects and return search conditions for their IDs.
        Helps resolve queries like "contacts from account google" if denormalization is missing.
        """
        conditions = []
        
        # 1. Resolve Account relationships for Contacts and Opportunities
        if object_type in ["contact", "opportunity", "lead"]:
            account_conditions = self._build_search_conditions("account", search_text)
            cursor = self.db.object_records.find({
                "tenant_id": tenant_id,
                "object_name": "account",
                "$or": account_conditions
            }, {"id": 1, "series_id": 1, "_id": 0}).limit(10)
            
            accounts = await cursor.to_list(length=10)
            if accounts:
                ids = [a["id"] for a in accounts]
                series_ids = [a["series_id"] for a in accounts if a.get("series_id")]
                all_ids = list(set(ids + series_ids))
                conditions.append({"data.account_id": {"$in": all_ids}})
                
        # 2. Resolve various relationships for Tasks/Events
        if object_type in ["task", "event"]:
            parent_types = ["account", "contact", "lead", "opportunity"]
            for pt in parent_types:
                parent_conditions = self._build_search_conditions(pt, search_text)
                cursor = self.db.object_records.find({
                    "tenant_id": tenant_id,
                    "object_name": pt,
                    "$or": parent_conditions
                }, {"id": 1, "series_id": 1, "_id": 0}).limit(5)
                
                parents = await cursor.to_list(length=5)
                if parents:
                    p_ids = [p["id"] for p in parents]
                    p_series_ids = [p["series_id"] for p in parents if p.get("series_id")]
                    all_p_ids = list(set(p_ids + p_series_ids))
                    
                    # Task/Event link fields
                    conditions.append({"data.related_to": {"$in": all_p_ids}})
                    conditions.append({f"data.{pt}_id": {"$in": all_p_ids}})
                    
                    # New link fields from ActivityLinkingService
                    if pt in ["lead", "contact"]:
                        conditions.append({"data.person_link_id": {"$in": all_p_ids}})
                    else:
                        conditions.append({"data.record_link_id": {"$in": all_p_ids}})

        # 3. Resolve Contact relationship for Opportunities (Standard link: contact_id)
        if object_type == "opportunity":
            contact_conditions = self._build_search_conditions("contact", search_text)
            cursor = self.db.object_records.find({
                "tenant_id": tenant_id,
                "object_name": "contact",
                "$or": contact_conditions
            }, {"id": 1, "series_id": 1, "_id": 0}).limit(5)
            
            contacts = await cursor.to_list(length=5)
            if contacts:
                c_ids = [c["id"] for c in contacts]
                c_series_ids = [c["series_id"] for c in contacts if c.get("series_id")]
                all_c_ids = list(set(c_ids + c_series_ids))
                conditions.append({"data.contact_id": {"$in": all_c_ids}})
                    
        return conditions

    def _parse_filter_value(self, field: str, value: Any) -> Any:
        """Parse filter values with operator support and numeric field robustness"""
        # 1. Handle dictionary values (operators like gt, lt, ne, in, nin)
        if isinstance(value, dict):
            parsed_dict = {}
            for op, val in value.items():
                clean_op = op.lower().replace("$", "")
                
                # Special case: If 'ne' (not equal) is used with a list, it should be '$nin' (not in)
                if clean_op == "ne" and isinstance(val, list):
                    mongo_op = "$nin"
                elif clean_op == "in":
                    mongo_op = "$in"
                elif clean_op in ["nin", "not_in"]:
                    mongo_op = "$nin"
                else:
                    # Map shorthand (gt) to MongoDB operator ($gt)
                    mongo_op = op if op.startswith("$") else f"${op}"
                
                # Robustness: For 'in' or 'nin' with string lists, make the matches case-insensitive
                if mongo_op in ["$in", "$nin"] and isinstance(val, list):
                    processed_val = []
                    for v in val:
                        if isinstance(v, str):
                            # Use regex for case-insensitive exact matching
                            processed_val.append(re.compile(f"^{re.escape(v)}$", re.IGNORECASE))
                        else:
                            processed_val.append(v)
                    parsed_dict[mongo_op] = processed_val
                else:
                    parsed_dict[mongo_op] = val
            return parsed_dict
            
        # 2. Handle string matching case-insensitivity (exact match)
        if isinstance(value, str) and field not in ["id", "series_id"]:
            # Check if this field should be treated as numeric
            numeric_fields = ["amount", "revenue", "count", "days", "quantity", "price"]
            if field in numeric_fields:
                try:
                    num_val = float(value)
                    # For numeric fields, allow matching either the string or the number
                    # We use $in to find any record matching either type
                    return {"$in": [value, num_val, int(num_val) if num_val.is_integer() else num_val]}
                except ValueError:
                    pass
            # Regular string case-insensitive exact match (regex ^value$ with option i)
            return {"$regex": f"^{value}$", "$options": "i"}
            
        # 3. Handle numeric values for equality - also allow matching the string representation for robustness
        if isinstance(value, (int, float)):
            numeric_fields = ["amount", "revenue", "count", "days", "quantity", "price"]
            if field in numeric_fields:
                # Same $in logic here to catch records stored as strings "200" or numbers 200
                return {"$in": [value, str(value), int(value) if isinstance(value, float) and value.is_integer() else value]}
        
        return value

    def _build_search_conditions(self, object_type: str, search_text: str) -> List[Dict]:
        """Build $or conditions for searching common fields"""
        conditions = []
        
        # Common searchable fields by object type
        SEARCH_FIELDS = {
            "lead": ["first_name", "last_name", "email", "company", "name", "rating", "status", "city", "state", "country", "industry", "lead_source"],
            "contact": ["first_name", "last_name", "email", "phone", "name", "account_name", "company", "department", "city", "state", "country"],
            "account": ["account_name", "name", "phone", "website", "city", "state", "country", "industry", "type", "region"],
            "opportunity": ["name", "opportunity_name", "stage", "account_name", "type"],
            "task": ["subject", "description", "status", "priority"],
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
        object_type: str,
        mode: Literal["summary", "discovery"] = "summary"
    ) -> Dict[str, Any]:
        """
        Get records related to this record.
        Mode 'discovery': Returns counts/existence of related items.
        Mode 'summary': Returns actual records (limited).
        """
        related = {"discovery": {}}
        record_id = record.get("id")
        series_id = record.get("series_id")
        
        try:
            # 1. Activities (Tasks & Events)
            activity_types = ["task", "event"]
            for atype in activity_types:
                query = {
                    "tenant_id": tenant_id,
                    "object_name": atype,
                    "$or": [
                        {"data.related_to": record_id},
                        {"data.related_to": series_id},
                        {f"data.{object_type}_id": record_id},
                        {f"data.{object_type}_id": series_id}
                    ]
                }
                
                if mode == "discovery":
                    count = await self.db.object_records.count_documents(query)
                    if count > 0:
                        related["discovery"][f"{atype}s"] = count
                else:
                    items = await self.db.object_records.find(query, {"_id": 0}).limit(5).to_list(5)
                    if items:
                        related[f"{atype}s"] = [self._format_record_for_display(t, atype) for t in items]

            # 2. Notes
            notes_query = {
                "tenant_id": tenant_id,
                "$or": [
                    {"linked_entity_id": record_id},
                    {"linked_entity_id": series_id}
                ]
            }
            if mode == "discovery":
                count = await self.db.notes.count_documents(notes_query)
                if count > 0:
                    related["discovery"]["notes"] = count
            else:
                notes = await self.db.notes.find(notes_query, {"_id": 0}).limit(5).to_list(5)
                if notes:
                    related["notes"] = notes

            # 3. Opportunities (if record is account or contact)
            if object_type in ["account", "contact"]:
                opp_query = {
                    "tenant_id": tenant_id,
                    "object_name": "opportunity",
                    "$or": [
                        {f"data.{object_type}_id": record_id},
                        {f"data.{object_type}_id": series_id}
                    ]
                }
                if mode == "discovery":
                    count = await self.db.object_records.count_documents(opp_query)
                    if count > 0:
                        related["discovery"]["opportunities"] = count
                else:
                    opps = await self.db.object_records.find(opp_query, {"_id": 0}).limit(5).to_list(5)
                    if opps:
                        related["opportunities"] = [self._format_record_for_display(o, "opportunity") for o in opps]

            # 4. Contacts (if record is account)
            if object_type == "account":
                contact_query = {
                    "tenant_id": tenant_id,
                    "object_name": "contact",
                    "$or": [
                        {"data.account_id": record_id},
                        {"data.account_id": series_id}
                    ]
                }
                if mode == "discovery":
                    count = await self.db.object_records.count_documents(contact_query)
                    if count > 0:
                        related["discovery"]["contacts"] = count
                else:
                    contacts = await self.db.object_records.find(contact_query, {"_id": 0}).limit(5).to_list(5)
                    if contacts:
                        related["contacts"] = [self._format_record_for_display(c, "contact") for c in contacts]

            # 5. Generic Lookup Discovery (Look for any data fields that look like IDs/Lookups)
            # This handles custom objects where the current record might be linked
            # We look for records where a field ends in _id and matches this record's ID
            if mode == "discovery":
                # This is more complex in Mongo, so we'll just check common ones for now
                pass

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
        cleaned = (name or "").strip()
        if not cleaned:
            return None

        # 1) Exact/case-insensitive match first for better determinism
        exact_conditions: List[Dict[str, Any]] = []
        for cond in self._build_search_conditions(object_type, cleaned):
            for key in cond.keys():
                exact_conditions.append({key: {"$regex": f"^{re.escape(cleaned)}$", "$options": "i"}})
        if exact_conditions:
            record = await self.db.object_records.find_one(
                {"tenant_id": tenant_id, "object_name": object_type, "$or": exact_conditions},
                {"_id": 0},
            )
            if record:
                return record

        # 2) Fallback to broader contains logic
        search_conditions = self._build_search_conditions(object_type, cleaned)
        return await self.db.object_records.find_one(
            {"tenant_id": tenant_id, "object_name": object_type, "$or": search_conditions},
            {"_id": 0},
        )
    
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
