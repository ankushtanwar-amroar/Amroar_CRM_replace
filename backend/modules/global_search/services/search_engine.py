"""
Global Search Engine Service
Core search execution logic.

Responsibilities:
- Query parsing and tokenization
- Execute optimized searches across objects
- Aggregate and return results
- Respect sharing rules for record visibility
"""
from typing import Dict, List, Any, Optional
from motor.motor_asyncio import AsyncIOMotorDatabase
import re
import logging
from datetime import datetime, timezone

from .search_config import SearchConfigService
from .search_permissions import SearchPermissionService
from .search_ranking import SearchRankingService
from services.sharing_rule_engine import apply_sharing_visibility

logger = logging.getLogger(__name__)


class SearchQueryParser:
    """Parses and normalizes search queries"""
    
    @staticmethod
    def normalize(query: str) -> str:
        """Normalize query string"""
        if not query:
            return ""
        # Remove extra whitespace
        query = re.sub(r'\s+', ' ', query.strip())
        return query
    
    @staticmethod
    def tokenize(query: str) -> List[str]:
        """Split query into tokens for multi-term search"""
        normalized = SearchQueryParser.normalize(query)
        if not normalized:
            return []
        # Split by whitespace
        tokens = normalized.split()
        # Remove very short tokens (1 char)
        return [t for t in tokens if len(t) > 1]
    
    @staticmethod
    def build_regex_pattern(query: str) -> str:
        """Build regex pattern for flexible matching"""
        tokens = SearchQueryParser.tokenize(query)
        if not tokens:
            return ""
        # Escape special regex characters
        escaped = [re.escape(t) for t in tokens]
        # Create pattern that matches any token
        return '|'.join(escaped)


class GlobalSearchEngine:
    """
    Main search engine orchestrating search across all objects.
    
    Flow:
    1. Parse and normalize query
    2. Get searchable objects (respecting permissions)
    3. Get searchable fields for each object
    4. Execute search queries
    5. Rank and aggregate results
    6. Return grouped response
    """
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.config_service = SearchConfigService(db)
        self.permission_service = SearchPermissionService(db)
        self.records_collection = db.object_records
    
    async def search(
        self,
        tenant_id: str,
        user_id: str,
        query: str,
        role_id: str = None,
        limit_per_object: int = None,
        object_filter: List[str] = None,
        is_super_admin: bool = False
    ) -> Dict[str, Any]:
        """
        Execute global search across all accessible objects.
        
        Args:
            tenant_id: Tenant ID
            user_id: User ID for permission filtering
            query: Search query string
            role_id: Optional role ID for permission checks
            limit_per_object: Max results per object (default from config)
            object_filter: Optional list of object names to search
            is_super_admin: Whether user is a super admin (bypasses permissions)
            
        Returns:
            Grouped search results with metadata
        """
        start_time = datetime.now(timezone.utc)
        
        # Normalize query
        normalized_query = SearchQueryParser.normalize(query)
        if not normalized_query or len(normalized_query) < 2:
            return {
                "query": query,
                "results": [],
                "total_count": 0,
                "grouped_results": {},
                "search_time_ms": 0
            }
        
        # Get limit per object
        if limit_per_object is None:
            limit_per_object = await self.config_service.get_results_per_object(tenant_id)
        
        # Get accessible objects (respects Permission Set visibility)
        accessible_objects = await self.permission_service.get_accessible_objects(
            tenant_id, user_id, role_id, is_super_admin
        )
        
        # Get searchable objects
        searchable_objects = await self.config_service.get_searchable_objects(tenant_id)
        
        # Filter to only accessible and optionally filtered objects
        objects_to_search = []
        for obj in searchable_objects:
            obj_name = obj.get("object_name", "").lower()
            if obj_name in accessible_objects:
                if object_filter is None or obj_name in [o.lower() for o in object_filter]:
                    objects_to_search.append(obj)
        
        # Build ranking service with object priorities
        object_priorities = {}
        for obj in objects_to_search:
            obj_name = obj.get("object_name", "").lower()
            priority = await self.config_service.get_object_priority(tenant_id, obj_name)
            object_priorities[obj_name] = priority
        
        ranking_service = SearchRankingService(object_priorities)
        
        # Search each object
        grouped_results = {}
        all_results = []
        total_count = 0
        
        for obj in objects_to_search:
            obj_name = obj.get("object_name", "").lower()
            obj_label = obj.get("object_label", obj_name.title())
            obj_icon = obj.get("icon", "file")
            
            try:
                # Get searchable fields for this object
                searchable_fields = await self.config_service.get_searchable_fields(
                    tenant_id, obj_name
                )
                
                if not searchable_fields:
                    continue
                
                # Get visible fields for permission filtering
                visible_fields = await self.permission_service.get_visible_fields(
                    tenant_id, user_id, obj_name, role_id
                )
                
                # Filter to only visible searchable fields
                searchable_fields = [f for f in searchable_fields if f["name"] in visible_fields]
                
                if not searchable_fields:
                    continue
                
                # Build search query
                object_results = await self._search_object(
                    tenant_id=tenant_id,
                    user_id=user_id,
                    object_name=obj_name,
                    query=normalized_query,
                    searchable_fields=searchable_fields,
                    ranking_service=ranking_service,
                    limit=limit_per_object * 2,  # Get extra for permission filtering
                    role_id=role_id
                )
                
                # Filter by record-level permissions
                object_results = await self.permission_service.filter_records_by_permission(
                    tenant_id, user_id, obj_name, object_results, role_id
                )
                
                # Apply limit
                object_results = object_results[:limit_per_object]
                
                if object_results:
                    # Format results
                    formatted_results = []
                    for result in object_results:
                        formatted = self._format_result(
                            result, 
                            obj_name, 
                            obj_label, 
                            obj_icon,
                            searchable_fields,
                            normalized_query,
                            ranking_service
                        )
                        formatted_results.append(formatted)
                        all_results.append(formatted)
                    
                    grouped_results[obj_name] = {
                        "object_name": obj_name,
                        "object_label": obj_label,
                        "object_icon": obj_icon,
                        "count": len(formatted_results),
                        "results": formatted_results
                    }
                    total_count += len(formatted_results)
                    
            except Exception as e:
                logger.error(f"Error searching object {obj_name}: {str(e)}")
                continue
        
        # Sort grouped results by object priority
        sorted_groups = sorted(
            grouped_results.values(),
            key=lambda g: object_priorities.get(g["object_name"], 100)
        )
        
        # Calculate search time
        search_time_ms = (datetime.now(timezone.utc) - start_time).total_seconds() * 1000
        
        return {
            "query": query,
            "normalized_query": normalized_query,
            "results": all_results,
            "total_count": total_count,
            "grouped_results": {g["object_name"]: g for g in sorted_groups},
            "groups_order": [g["object_name"] for g in sorted_groups],
            "search_time_ms": round(search_time_ms, 2)
        }
    
    async def _search_object(
        self,
        tenant_id: str,
        user_id: str,
        object_name: str,
        query: str,
        searchable_fields: List[Dict[str, Any]],
        ranking_service: SearchRankingService,
        limit: int,
        role_id: str = None
    ) -> List[Dict[str, Any]]:
        """Search a single object and return scored results (respects sharing rules)"""
        
        # Build MongoDB query with $or for each searchable field
        regex_pattern = SearchQueryParser.build_regex_pattern(query)
        if not regex_pattern:
            return []
        
        field_conditions = []
        for field in searchable_fields:
            field_name = field["name"]
            # Search in both data.field_name and top-level field_name
            field_conditions.append({
                f"data.{field_name}": {"$regex": regex_pattern, "$options": "i"}
            })
            field_conditions.append({
                field_name: {"$regex": regex_pattern, "$options": "i"}
            })
        
        # Build base query with search conditions
        base_query = {
            "tenant_id": tenant_id,
            "object_name": object_name,
            "$or": field_conditions
        }
        
        # Apply sharing rule visibility filter
        try:
            visibility_query, _ = await apply_sharing_visibility(
                tenant_id=tenant_id,
                user_id=user_id,
                object_name=object_name,
                base_query=base_query,
                include_debug=False
            )
        except Exception as e:
            logger.warning(f"[GlobalSearch] Failed to apply sharing visibility for {object_name}: {e}")
            visibility_query = base_query
        
        # Execute query with visibility filter
        cursor = self.records_collection.find(
            visibility_query,
            {"_id": 0}
        ).limit(limit * 3)  # Get more to allow for scoring/filtering
        
        records = await cursor.to_list(None)
        
        # Score each record
        scored_records = []
        for record in records:
            score, match_details = ranking_service.calculate_record_score(
                query, record, searchable_fields
            )
            if score > 0:
                record["score"] = score
                record["match_details"] = match_details
                scored_records.append(record)
        
        # Sort by score and return top results
        scored_records.sort(key=lambda r: r.get("score", 0), reverse=True)
        return scored_records[:limit]
    
    def _format_result(
        self,
        record: Dict[str, Any],
        object_name: str,
        object_label: str,
        object_icon: str,
        searchable_fields: List[Dict[str, Any]],
        query: str,
        ranking_service: SearchRankingService
    ) -> Dict[str, Any]:
        """Format a search result for API response"""
        
        data = record.get("data", {})
        
        # Get primary display field (name or first searchable field)
        primary_value = None
        primary_field = None
        
        # Try common name fields first
        for name_field in ['name', 'first_name', 'account_name', 'subject']:
            if data.get(name_field):
                primary_value = data[name_field]
                primary_field = name_field
                break
            if record.get(name_field):
                primary_value = record[name_field]
                primary_field = name_field
                break
        
        # Combine first_name and last_name if available
        if data.get('first_name') and data.get('last_name'):
            primary_value = f"{data['first_name']} {data['last_name']}"
            primary_field = 'name'
        
        # Fallback to first searchable field with value
        if not primary_value:
            for field in searchable_fields:
                val = data.get(field["name"]) or record.get(field["name"])
                if val:
                    primary_value = val
                    primary_field = field["name"]
                    break
        
        # Get secondary identifier (email, phone, etc.)
        secondary_value = None
        secondary_field = None
        for sec_field in ['email', 'phone', 'company', 'status']:
            val = data.get(sec_field) or record.get(sec_field)
            if val and sec_field != primary_field:
                secondary_value = val
                secondary_field = sec_field
                break
        
        # Get highlight positions
        highlights = {}
        if primary_value:
            positions = ranking_service.get_highlight_positions(query, str(primary_value))
            if positions:
                highlights["primary"] = positions
        if secondary_value:
            positions = ranking_service.get_highlight_positions(query, str(secondary_value))
            if positions:
                highlights["secondary"] = positions
        
        return {
            "id": record.get("id"),
            "series_id": record.get("series_id"),
            "object_name": object_name,
            "object_label": object_label,
            "object_icon": object_icon,
            "primary_field": primary_field,
            "primary_value": str(primary_value) if primary_value else None,
            "secondary_field": secondary_field,
            "secondary_value": str(secondary_value) if secondary_value else None,
            "score": record.get("score", 0),
            "match_details": record.get("match_details"),
            "highlights": highlights,
            "record_url": f"/{object_name}/{record.get('series_id', record.get('id'))}/view"
        }
