"""
Sharing Rule Engine Service
Centralized service for evaluating sharing rules at the query level.

This service handles:
1. Building MongoDB query filters based on sharing rules
2. Evaluating criteria-based and owner-based rules
3. Resolving role/group/queue memberships
4. Applying access level enforcement (Read Only / Read Write)

The visibility evaluation order is:
1. Record Owner (user always sees their own records)
2. Role Hierarchy access
3. Object-level sharing settings (OWD)
4. Sharing Rules (criteria-based or owner-based)
5. Group membership access
6. Queue ownership
"""
import logging
from typing import Dict, List, Any, Optional, Tuple, Set
from datetime import datetime, timezone
from config.database import db

logger = logging.getLogger(__name__)


class SharingRuleEngine:
    """
    Engine for evaluating sharing rules and building visibility filters.
    """
    
    def __init__(self, tenant_id: str, user_id: str):
        self.tenant_id = tenant_id
        self.user_id = user_id
        self._user_cache: Optional[Dict] = None
        self._role_cache: Dict[str, Dict] = {}
        self._group_memberships: Optional[List[str]] = None
        self._queue_memberships: Optional[List[str]] = None
        self._role_hierarchy_user_ids: Optional[Set[str]] = None
        self._owd_cache: Dict[str, Dict] = {}
    
    async def _get_owd_settings(self, object_name: str) -> Dict:
        """Get Organization-Wide Default settings for an object."""
        if object_name in self._owd_cache:
            return self._owd_cache[object_name]
        
        owd = await db.sharing_settings.find_one({
            "tenant_id": self.tenant_id,
            "object_name": object_name
        }, {"_id": 0})
        
        # Default to Private if no OWD set
        if not owd:
            owd = {
                "object_name": object_name,
                "default_internal_access": "private",
                "default_external_access": "private",
                "grant_access_using_hierarchies": True
            }
        
        self._owd_cache[object_name] = owd
        return owd
    
    async def _get_user(self) -> Optional[Dict]:
        """Get and cache current user data."""
        if self._user_cache is None:
            self._user_cache = await db.users.find_one(
                {"id": self.user_id, "tenant_id": self.tenant_id},
                {"_id": 0}
            )
        return self._user_cache
    
    async def _get_role(self, role_id: str) -> Optional[Dict]:
        """Get and cache role data."""
        if role_id not in self._role_cache:
            role = await db.roles.find_one({"id": role_id}, {"_id": 0})
            self._role_cache[role_id] = role
        return self._role_cache.get(role_id)
    
    async def _get_user_group_ids(self) -> List[str]:
        """Get all group IDs the user is a member of."""
        if self._group_memberships is not None:
            return self._group_memberships
        
        # Find groups where user is a direct member (from group_members collection)
        direct_memberships = await db.group_members.find({
            "member_type": "user",
            "member_id": self.user_id
        }, {"_id": 0, "group_id": 1}).to_list(None)
        
        direct_group_ids = [m["group_id"] for m in direct_memberships]
        
        # Also check role-based group membership
        user = await self._get_user()
        if user and user.get("role_id"):
            role_memberships = await db.group_members.find({
                "member_type": "role",
                "member_id": user["role_id"]
            }, {"_id": 0, "group_id": 1}).to_list(None)
            role_group_ids = [m["group_id"] for m in role_memberships]
            direct_group_ids.extend(role_group_ids)
        
        # Filter to only include groups from the user's tenant
        if direct_group_ids:
            valid_groups = await db.groups.find({
                "id": {"$in": direct_group_ids},
                "tenant_id": self.tenant_id
            }, {"_id": 0, "id": 1}).to_list(None)
            direct_group_ids = [g["id"] for g in valid_groups]
        
        self._group_memberships = list(set(direct_group_ids))
        logger.debug(f"[SharingEngine] User {self.user_id} is member of groups: {self._group_memberships}")
        return self._group_memberships
    
    async def _get_user_queue_ids(self) -> List[str]:
        """Get all queue IDs the user is a member of."""
        if self._queue_memberships is not None:
            return self._queue_memberships
        
        # Find queues where user is a direct member (from queue_members collection)
        direct_memberships = await db.queue_members.find({
            "member_type": "user",
            "member_id": self.user_id
        }, {"_id": 0, "queue_id": 1}).to_list(None)
        
        direct_queue_ids = [m["queue_id"] for m in direct_memberships]
        
        # Also check role-based queue membership
        user = await self._get_user()
        if user and user.get("role_id"):
            role_memberships = await db.queue_members.find({
                "member_type": "role",
                "member_id": user["role_id"]
            }, {"_id": 0, "queue_id": 1}).to_list(None)
            role_queue_ids = [m["queue_id"] for m in role_memberships]
            direct_queue_ids.extend(role_queue_ids)
        
        # Also check group-based queue membership
        group_ids = await self._get_user_group_ids()
        if group_ids:
            group_memberships = await db.queue_members.find({
                "member_type": "group",
                "member_id": {"$in": group_ids}
            }, {"_id": 0, "queue_id": 1}).to_list(None)
            group_queue_ids = [m["queue_id"] for m in group_memberships]
            direct_queue_ids.extend(group_queue_ids)
        
        # Filter to only include queues from the user's tenant
        if direct_queue_ids:
            valid_queues = await db.queues.find({
                "id": {"$in": direct_queue_ids},
                "tenant_id": self.tenant_id
            }, {"_id": 0, "id": 1}).to_list(None)
            direct_queue_ids = [q["id"] for q in valid_queues]
        
        self._queue_memberships = list(set(direct_queue_ids))
        logger.debug(f"[SharingEngine] User {self.user_id} is member of queues: {self._queue_memberships}")
        return self._queue_memberships
    
    async def _get_role_hierarchy_subordinates(self) -> Set[str]:
        """
        Get all user IDs that are subordinates in the role hierarchy.
        This includes users in subordinate roles.
        """
        if self._role_hierarchy_user_ids is not None:
            return self._role_hierarchy_user_ids
        
        user = await self._get_user()
        if not user or not user.get("role_id"):
            self._role_hierarchy_user_ids = set()
            return self._role_hierarchy_user_ids
        
        user_role_id = user["role_id"]
        subordinate_role_ids = await self._get_subordinate_role_ids(user_role_id)
        
        if not subordinate_role_ids:
            self._role_hierarchy_user_ids = set()
            return self._role_hierarchy_user_ids
        
        # Get all users with subordinate roles
        # Note: Users are considered active if:
        # - is_active is True, or
        # - is_active is not set (None/missing), or  
        # - status is 'active'
        # And NOT inactive if is_active is explicitly False
        subordinate_users = await db.users.find({
            "tenant_id": self.tenant_id,
            "role_id": {"$in": subordinate_role_ids},
            "$or": [
                {"is_active": True},
                {"is_active": {"$exists": False}},
                {"is_active": None},
                {"status": "active"}
            ],
            "is_active": {"$ne": False}  # Exclude explicitly deactivated users
        }, {"_id": 0, "id": 1}).to_list(None)
        
        self._role_hierarchy_user_ids = {u["id"] for u in subordinate_users}
        logger.debug(f"[SharingEngine] User {self.user_id} has {len(self._role_hierarchy_user_ids)} subordinates via role hierarchy")
        return self._role_hierarchy_user_ids
    
    async def _get_subordinate_role_ids(self, role_id: str) -> List[str]:
        """Recursively get all subordinate role IDs."""
        subordinate_ids = []
        
        # Find direct children
        children = await db.roles.find({
            "parent_role_id": role_id
        }, {"_id": 0, "id": 1}).to_list(None)
        
        for child in children:
            subordinate_ids.append(child["id"])
            # Recursively get grandchildren
            grandchildren = await self._get_subordinate_role_ids(child["id"])
            subordinate_ids.extend(grandchildren)
        
        return subordinate_ids
    
    async def _get_active_sharing_rules(self, object_name: str) -> List[Dict]:
        """Get all active sharing rules for an object."""
        rules = await db.sharing_rules.find({
            "tenant_id": self.tenant_id,
            "object_name": object_name,
            "is_active": True
        }, {"_id": 0}).to_list(None)
        
        logger.debug(f"[SharingEngine] Found {len(rules)} active sharing rules for {object_name}")
        return rules
    
    async def _is_user_in_share_target(self, share_with_type: str, share_with_id: str) -> bool:
        """Check if the current user is in the share target."""
        if share_with_type == "user":
            return share_with_id == self.user_id
        
        elif share_with_type == "role":
            user = await self._get_user()
            if user and user.get("role_id") == share_with_id:
                return True
            # Also check if user's role is a child of the share target role
            if user and user.get("role_id"):
                # Get parent chain for user's role
                parent_roles = await self._get_role_parent_chain(user["role_id"])
                return share_with_id in parent_roles
            return False
        
        elif share_with_type == "group":
            group_ids = await self._get_user_group_ids()
            return share_with_id in group_ids
        
        elif share_with_type == "queue":
            queue_ids = await self._get_user_queue_ids()
            return share_with_id in queue_ids
        
        return False
    
    async def _get_role_parent_chain(self, role_id: str) -> List[str]:
        """Get all parent roles in the hierarchy."""
        parent_chain = []
        current_role_id = role_id
        
        while current_role_id:
            role = await self._get_role(current_role_id)
            if not role:
                break
            parent_id = role.get("parent_role_id")
            if parent_id:
                parent_chain.append(parent_id)
            current_role_id = parent_id
        
        return parent_chain
    
    async def _get_manual_share_record_ids(self, object_name: str) -> List[str]:
        """
        Get record IDs that are explicitly shared with the current user.
        Checks shares targeting:
        - The user directly
        - Groups the user belongs to
        - The user's role
        
        Returns list of record IDs that the user has access to via manual shares.
        """
        
        # Get user's group memberships
        group_ids = await self._get_user_group_ids()
        
        # Get user's role
        user = await self._get_user()
        user_role_id = user.get("role_id") if user else None
        
        # Build conditions for shares targeting this user
        now = datetime.now(timezone.utc)
        share_conditions = [
            {"shared_with_type": "user", "shared_with_id": self.user_id}
        ]
        
        if group_ids:
            share_conditions.append({
                "shared_with_type": "group",
                "shared_with_id": {"$in": group_ids}
            })
        
        if user_role_id:
            share_conditions.append({
                "shared_with_type": "role",
                "shared_with_id": user_role_id
            })
        
        # Query for active, non-expired shares
        query = {
            "tenant_id": self.tenant_id,
            "object_name": object_name,
            "$or": share_conditions,
            "is_active": True,
            "$and": [
                {"$or": [
                    {"expires_at": None},
                    {"expires_at": {"$gt": now}}
                ]}
            ]
        }
        
        shares = await db.record_shares.find(
            query,
            {"_id": 0, "record_id": 1}
        ).to_list(None)
        
        record_ids = list(set([s["record_id"] for s in shares]))
        
        if record_ids:
            logger.debug(f"[SharingEngine] Found {len(record_ids)} manually shared records for user {self.user_id}")
        
        return record_ids
    
    async def _check_manual_share_access(
        self, 
        object_name: str, 
        record_id: str,
        required_access: str = "read"
    ) -> Tuple[bool, Optional[Dict]]:
        """
        Check if user has access to a specific record via manual share.
        
        Returns:
            Tuple of (has_access, share_info)
        """
        
        # Get user's group memberships
        group_ids = await self._get_user_group_ids()
        
        # Get user's role
        user = await self._get_user()
        user_role_id = user.get("role_id") if user else None
        
        # Build conditions for shares targeting this user
        now = datetime.now(timezone.utc)
        share_conditions = [
            {"shared_with_type": "user", "shared_with_id": self.user_id}
        ]
        
        if group_ids:
            share_conditions.append({
                "shared_with_type": "group",
                "shared_with_id": {"$in": group_ids}
            })
        
        if user_role_id:
            share_conditions.append({
                "shared_with_type": "role",
                "shared_with_id": user_role_id
            })
        
        # Query for a matching share
        query = {
            "tenant_id": self.tenant_id,
            "object_name": object_name,
            "record_id": record_id,
            "$or": share_conditions,
            "is_active": True,
            "$and": [
                {"$or": [
                    {"expires_at": None},
                    {"expires_at": {"$gt": now}}
                ]}
            ]
        }
        
        # For edit access, ensure the share grants edit level
        if required_access == "edit":
            query["access_level"] = "edit"
        
        share = await db.record_shares.find_one(query, {"_id": 0})
        
        if share:
            return True, {
                "share_id": share.get("id"),
                "shared_with_type": share.get("shared_with_type"),
                "shared_with_name": share.get("shared_with_name"),
                "access_level": share.get("access_level"),
                "shared_by_name": share.get("shared_by_name")
            }
        
        return False, None
    
    def _build_criteria_query(self, criteria: List[Dict]) -> Dict[str, Any]:
        """
        Build MongoDB query from sharing rule criteria.
        This builds the criteria filter to find matching records.
        """
        if not criteria:
            return {}
        
        conditions = []
        
        for c in criteria:
            field = c.get("field")
            operator = c.get("operator")
            value = c.get("value")
            
            if not field or not operator:
                continue
            
            field_path = f"data.{field}"
            
            if operator == "equals":
                conditions.append({field_path: value})
            elif operator == "not_equals":
                conditions.append({field_path: {"$ne": value}})
            elif operator == "contains":
                conditions.append({field_path: {"$regex": value, "$options": "i"}})
            elif operator == "starts_with":
                conditions.append({field_path: {"$regex": f"^{value}", "$options": "i"}})
            elif operator == "ends_with":
                conditions.append({field_path: {"$regex": f"{value}$", "$options": "i"}})
            elif operator == "greater_than":
                conditions.append({field_path: {"$gt": value}})
            elif operator == "less_than":
                conditions.append({field_path: {"$lt": value}})
            elif operator == "greater_or_equal":
                conditions.append({field_path: {"$gte": value}})
            elif operator == "less_or_equal":
                conditions.append({field_path: {"$lte": value}})
            elif operator == "in_list":
                values = [v.strip() for v in str(value).split(",")] if value else []
                conditions.append({field_path: {"$in": values}})
            elif operator == "not_in_list":
                values = [v.strip() for v in str(value).split(",")] if value else []
                conditions.append({field_path: {"$nin": values}})
            elif operator == "is_empty":
                conditions.append({
                    "$or": [
                        {field_path: None},
                        {field_path: ""},
                        {field_path: {"$exists": False}}
                    ]
                })
            elif operator == "is_not_empty":
                conditions.append({
                    "$and": [
                        {field_path: {"$exists": True}},
                        {field_path: {"$ne": None}},
                        {field_path: {"$ne": ""}}
                    ]
                })
        
        if len(conditions) == 0:
            return {}
        elif len(conditions) == 1:
            return conditions[0]
        else:
            return {"$and": conditions}
    
    async def _get_owner_role_users(self, role_id: str) -> List[str]:
        """Get all user IDs with a specific role (for owner-based rules)."""
        users = await db.users.find({
            "tenant_id": self.tenant_id,
            "role_id": role_id,
            "is_active": True
        }, {"_id": 0, "id": 1}).to_list(None)
        return [u["id"] for u in users]
    
    async def build_visibility_query(
        self, 
        object_name: str, 
        base_query: Optional[Dict] = None,
        include_debug_info: bool = False
    ) -> Tuple[Dict[str, Any], Optional[Dict]]:
        """
        Build a MongoDB query that enforces sharing rule visibility.
        
        Visibility evaluation order (Salesforce-style):
        1. Super Admin bypass (full access)
        2. Record Owner (user always sees their own records)
        3. Role Hierarchy access (subordinate records)
        4. Object-level sharing settings (OWD)
        5. Sharing Rules (criteria-based or owner-based)
        6. Group membership access (via rules)
        7. Queue ownership
        8. Manual Record Shares (record_shares table) - TODO
        
        Args:
            object_name: The object type to query
            base_query: Optional base query to extend
            include_debug_info: Whether to include debug information
            
        Returns:
            Tuple of (query_dict, debug_info)
        """
        query = base_query.copy() if base_query else {}
        debug_info = {"matched_rules": [], "access_sources": [], "owd": None} if include_debug_info else None
        
        # Step 1: Super Admin bypass - no visibility filtering
        user = await self._get_user()
        if user and user.get("is_super_admin", False):
            if debug_info:
                debug_info["access_sources"].append("super_admin")
            logger.debug(f"[SharingEngine] Super Admin user {self.user_id} - bypassing visibility filter")
            return query, debug_info
        
        # Get OWD settings for this object
        owd = await self._get_owd_settings(object_name)
        internal_access = owd.get("default_internal_access", "private")
        hierarchy_enabled = owd.get("grant_access_using_hierarchies", True)
        
        if debug_info:
            debug_info["owd"] = {
                "internal_access": internal_access,
                "hierarchy_enabled": hierarchy_enabled
            }
        
        # If OWD is Public Read/Write or Public Read Only, everyone can see all records
        if internal_access in ["public_read_write", "public_read_only"]:
            # No visibility filtering needed - return base query
            if debug_info:
                debug_info["access_sources"].append(f"owd:{internal_access}")
            logger.debug(f"[SharingEngine] OWD is {internal_access}, no visibility filter needed")
            return query, debug_info
        
        # For Private OWD, build visibility conditions
        # Build the visibility OR conditions
        visibility_conditions = []
        
        # 2. Record Owner - user always sees their own records
        visibility_conditions.append({"owner_id": self.user_id})
        if debug_info:
            debug_info["access_sources"].append("owner")
        logger.debug(f"[SharingEngine] Adding owner visibility for user {self.user_id}")

        # 2b. Group ownership - if user is a member of a group that owns the record
        group_ids = await self._get_user_group_ids()
        if group_ids:
            visibility_conditions.append({"owner_id": {"$in": group_ids}})
            if debug_info:
                debug_info["access_sources"].append(f"group_ownership ({len(group_ids)} groups)")
            logger.debug(f"[SharingEngine] Adding group ownership visibility for {len(group_ids)} groups")

        # 3. Role Hierarchy access - see subordinate's records (if enabled by OWD)
        if hierarchy_enabled:
            subordinate_ids = await self._get_role_hierarchy_subordinates()
            if subordinate_ids:
                visibility_conditions.append({"owner_id": {"$in": list(subordinate_ids)}})
                if debug_info:
                    debug_info["access_sources"].append(f"role_hierarchy ({len(subordinate_ids)} subordinates)")
                logger.debug(f"[SharingEngine] Adding role hierarchy visibility for {len(subordinate_ids)} subordinates")
        else:
            logger.debug(f"[SharingEngine] Role hierarchy disabled by OWD for {object_name}")
        
        # 4 & 5. Sharing Rules (criteria-based and owner-based)
        sharing_rules = await self._get_active_sharing_rules(object_name)
        
        for rule in sharing_rules:
            rule_name = rule.get("name", "Unknown")
            rule_type = rule.get("rule_type")
            share_with_type = rule.get("share_with_type")
            share_with_id = rule.get("share_with_id")
            
            # Check if current user is in the share target
            is_in_target = await self._is_user_in_share_target(share_with_type, share_with_id)
            
            if not is_in_target:
                logger.debug(f"[SharingEngine] User not in target for rule '{rule_name}' ({share_with_type}:{share_with_id})")
                continue
            
            logger.debug(f"[SharingEngine] User IS in target for rule '{rule_name}', evaluating criteria...")
            
            if rule_type == "criteria":
                # Criteria-based rule: records matching criteria are visible
                criteria = rule.get("criteria", [])
                criteria_query = self._build_criteria_query(criteria)
                
                if criteria_query:
                    visibility_conditions.append(criteria_query)
                    if debug_info:
                        debug_info["matched_rules"].append({
                            "rule_id": rule.get("id"),
                            "rule_name": rule_name,
                            "rule_type": "criteria",
                            "access_level": rule.get("access_level"),
                            "share_target": f"{share_with_type}:{share_with_id}",
                            "criteria": criteria
                        })
                    logger.info(f"[SharingEngine] Applied criteria rule '{rule_name}': {criteria}")
            
            elif rule_type == "owner":
                # Owner-based rule: records owned by specific roles/users are visible
                owner_criteria = rule.get("owner_criteria", {})
                owner_type = owner_criteria.get("owner_type")
                
                if owner_type == "role":
                    owner_role_id = owner_criteria.get("owner_role_id")
                    if owner_role_id:
                        # Get all users with this role
                        role_user_ids = await self._get_owner_role_users(owner_role_id)
                        if role_user_ids:
                            visibility_conditions.append({"owner_id": {"$in": role_user_ids}})
                            if debug_info:
                                debug_info["matched_rules"].append({
                                    "rule_id": rule.get("id"),
                                    "rule_name": rule_name,
                                    "rule_type": "owner",
                                    "access_level": rule.get("access_level"),
                                    "share_target": f"{share_with_type}:{share_with_id}",
                                    "owner_role_id": owner_role_id,
                                    "matched_owners": len(role_user_ids)
                                })
                            logger.info(f"[SharingEngine] Applied owner rule '{rule_name}': role {owner_role_id} ({len(role_user_ids)} users)")
                
                elif owner_type == "user":
                    owner_user_id = owner_criteria.get("owner_user_id")
                    if owner_user_id:
                        visibility_conditions.append({"owner_id": owner_user_id})
                        if debug_info:
                            debug_info["matched_rules"].append({
                                "rule_id": rule.get("id"),
                                "rule_name": rule_name,
                                "rule_type": "owner",
                                "access_level": rule.get("access_level"),
                                "share_target": f"{share_with_type}:{share_with_id}",
                                "owner_user_id": owner_user_id
                            })
                        logger.info(f"[SharingEngine] Applied owner rule '{rule_name}': user {owner_user_id}")
        
        # 6. Queue ownership - if user is in a queue that owns the record
        # Note: We grant access based on queue membership alone; supported_objects is
        # informational and should not block record visibility.
        queue_ids = await self._get_user_queue_ids()
        if queue_ids:
            visibility_conditions.append({"owner_id": {"$in": queue_ids}})
            if debug_info:
                debug_info["access_sources"].append(f"queue_ownership ({len(queue_ids)} queues)")
            logger.debug(f"[SharingEngine] Adding queue ownership visibility for {len(queue_ids)} queues")
        
        # 7. Manual Record Shares (record_shares table)
        # Get records explicitly shared with this user, their groups, or their role
        manual_share_record_ids = await self._get_manual_share_record_ids(object_name)
        if manual_share_record_ids:
            visibility_conditions.append({"id": {"$in": manual_share_record_ids}})
            if debug_info:
                debug_info["access_sources"].append(f"manual_shares ({len(manual_share_record_ids)} records)")
            logger.debug(f"[SharingEngine] Adding manual share visibility for {len(manual_share_record_ids)} records")
        
        # Combine all visibility conditions with OR
        if len(visibility_conditions) == 1:
            # Only owner condition - merge directly
            query.update(visibility_conditions[0])
        elif len(visibility_conditions) > 1:
            # Multiple conditions - use $or
            if "$or" in query:
                # Combine existing $or with visibility conditions
                existing_or = query.pop("$or")
                query["$and"] = [
                    {"$or": existing_or},
                    {"$or": visibility_conditions}
                ]
            else:
                query["$or"] = visibility_conditions
        
        logger.debug(f"[SharingEngine] Final visibility query for {object_name}: {len(visibility_conditions)} conditions")
        
        return query, debug_info
    
    async def check_record_access(
        self, 
        object_name: str, 
        record: Dict,
        required_access: str = "read"
    ) -> Tuple[bool, str, Optional[Dict]]:
        """
        Check if the current user has access to a specific record.
        
        Evaluation order (Salesforce-style):
        1. Super Admin bypass
        2. Owner check
        3. Role hierarchy check
        4. Sharing rules check
        5. Queue ownership check
        6. Manual record shares (record_shares table)
        
        Duplicate access paths are handled safely - we return on first "grant"
        found, so a user with access through multiple paths will still get access.
        
        Args:
            object_name: The object type
            record: The record document
            required_access: "read" or "write"
            
        Returns:
            Tuple of (has_access, access_reason, debug_info)
        """
        owner_id = record.get("owner_id")
        debug_info = {"checks": []}
        
        # 1. Super Admin bypass
        user = await self._get_user()
        if user and user.get("is_super_admin", False):
            debug_info["checks"].append({"source": "super_admin", "granted": True})
            logger.debug("[SharingEngine] Super Admin bypass for record access")
            return True, "super_admin", debug_info
        
        # 2. Owner check
        if owner_id == self.user_id:
            debug_info["checks"].append({"source": "owner", "granted": True})
            return True, "record_owner", debug_info

        # 2b. Group ownership check - user is a member of the group that owns the record
        group_ids = await self._get_user_group_ids()
        if owner_id in group_ids:
            debug_info["checks"].append({"source": "group_ownership", "granted": True})
            return True, "group_ownership", debug_info

        # 3. Role hierarchy check
        subordinate_ids = await self._get_role_hierarchy_subordinates()
        if owner_id in subordinate_ids:
            debug_info["checks"].append({"source": "role_hierarchy", "granted": True})
            return True, "role_hierarchy", debug_info
        
        # 4. Sharing rules check
        sharing_rules = await self._get_active_sharing_rules(object_name)
        
        for rule in sharing_rules:
            rule_name = rule.get("name")
            rule_type = rule.get("rule_type")
            access_level = rule.get("access_level", "read_only")
            
            # Check if required access matches rule access level
            if required_access == "write" and access_level == "read_only":
                continue
            
            # Check if user is in share target
            is_in_target = await self._is_user_in_share_target(
                rule.get("share_with_type"),
                rule.get("share_with_id")
            )
            
            if not is_in_target:
                continue
            
            # Check if record matches rule criteria
            if rule_type == "criteria":
                criteria = rule.get("criteria", [])
                if self._record_matches_criteria(record, criteria):
                    debug_info["checks"].append({
                        "source": "sharing_rule",
                        "rule_name": rule_name,
                        "rule_type": "criteria",
                        "access_level": access_level,
                        "granted": True
                    })
                    return True, f"sharing_rule:{rule_name}", debug_info
            
            elif rule_type == "owner":
                owner_criteria = rule.get("owner_criteria", {})
                if self._record_matches_owner_criteria(record, owner_criteria):
                    debug_info["checks"].append({
                        "source": "sharing_rule",
                        "rule_name": rule_name,
                        "rule_type": "owner",
                        "access_level": access_level,
                        "granted": True
                    })
                    return True, f"sharing_rule:{rule_name}", debug_info
        
        # 5. Queue ownership check
        queue_ids = await self._get_user_queue_ids()
        if owner_id in queue_ids:
            debug_info["checks"].append({"source": "queue_ownership", "granted": True})
            return True, "queue_ownership", debug_info
        
        # 6. Manual record shares check
        record_id = record.get("id")
        if record_id:
            has_manual_access, share_info = await self._check_manual_share_access(
                object_name,
                record_id,
                required_access
            )
            if has_manual_access:
                debug_info["checks"].append({
                    "source": "manual_share",
                    "granted": True,
                    "share_info": share_info
                })
                return True, f"manual_share:{share_info.get('shared_with_type', 'unknown')}", debug_info
        
        debug_info["checks"].append({"source": "none", "granted": False})
        return False, "no_access", debug_info
    
    def _record_matches_criteria(self, record: Dict, criteria: List[Dict]) -> bool:
        """Check if a record matches all criteria conditions."""
        data = record.get("data", {})
        
        for c in criteria:
            field = c.get("field")
            operator = c.get("operator")
            value = c.get("value")
            
            record_value = data.get(field)
            
            if operator == "equals":
                if str(record_value).lower() != str(value).lower():
                    return False
            elif operator == "not_equals":
                if str(record_value).lower() == str(value).lower():
                    return False
            elif operator == "contains":
                if not record_value or str(value).lower() not in str(record_value).lower():
                    return False
            elif operator == "starts_with":
                if not record_value or not str(record_value).lower().startswith(str(value).lower()):
                    return False
            elif operator == "ends_with":
                if not record_value or not str(record_value).lower().endswith(str(value).lower()):
                    return False
            elif operator == "in_list":
                values = [v.strip().lower() for v in str(value).split(",")]
                if str(record_value).lower() not in values:
                    return False
            elif operator == "is_empty":
                if record_value is not None and record_value != "":
                    return False
            elif operator == "is_not_empty":
                if record_value is None or record_value == "":
                    return False
            # Numeric comparisons
            elif operator in ["greater_than", "less_than", "greater_or_equal", "less_or_equal"]:
                try:
                    rv = float(record_value) if record_value else 0
                    cv = float(value) if value else 0
                    if operator == "greater_than" and not (rv > cv):
                        return False
                    if operator == "less_than" and not (rv < cv):
                        return False
                    if operator == "greater_or_equal" and not (rv >= cv):
                        return False
                    if operator == "less_or_equal" and not (rv <= cv):
                        return False
                except (ValueError, TypeError):
                    return False
        
        return True
    
    def _record_matches_owner_criteria(self, record: Dict, owner_criteria: Dict) -> bool:
        """Check if a record matches owner-based criteria."""
        # This would need async to check role, but for single record check
        # we compare directly against cached role user IDs
        # For now, return False - the query-level filter handles this
        return False


async def get_sharing_rule_engine(tenant_id: str, user_id: str) -> SharingRuleEngine:
    """Factory function to create a SharingRuleEngine instance."""
    return SharingRuleEngine(tenant_id, user_id)


async def apply_sharing_visibility(
    tenant_id: str,
    user_id: str,
    object_name: str,
    base_query: Optional[Dict] = None,
    include_debug: bool = False
) -> Tuple[Dict, Optional[Dict]]:
    """
    Convenience function to apply sharing rule visibility to a query.
    
    Args:
        tenant_id: Tenant ID
        user_id: Current user ID
        object_name: Object type to query
        base_query: Optional base query to extend
        include_debug: Whether to include debug information
        
    Returns:
        Tuple of (modified_query, debug_info)
    """
    engine = await get_sharing_rule_engine(tenant_id, user_id)
    return await engine.build_visibility_query(object_name, base_query, include_debug)


async def check_user_record_access(
    tenant_id: str,
    user_id: str,
    object_name: str,
    record: Dict,
    required_access: str = "read"
) -> Tuple[bool, str, Optional[Dict]]:
    """
    Convenience function to check user access to a specific record.
    
    Args:
        tenant_id: Tenant ID
        user_id: Current user ID
        object_name: Object type
        record: Record to check access for
        required_access: "read" or "write"
        
    Returns:
        Tuple of (has_access, access_reason, debug_info)
    """
    engine = await get_sharing_rule_engine(tenant_id, user_id)
    return await engine.check_record_access(object_name, record, required_access)
