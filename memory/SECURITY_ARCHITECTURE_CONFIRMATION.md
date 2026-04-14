# CRM Security Architecture - Final Confirmation Document

**Document Version:** 1.0  
**Date:** March 12, 2026  
**Status:** AWAITING USER APPROVAL

---

## FINAL TARGET ARCHITECTURE

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           TARGET SECURITY MODEL                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   LICENSE/PLAN ──► USER ──► ROLE (Hierarchy) ──► PERMISSION MODEL           │
│        │            │            │                      │                   │
│        │            │            │                      ▼                   │
│        │            │            │         ┌────────────────────────┐       │
│        │            │            │         │   Permission Sets      │       │
│        │            │            │         │   (User-assignable)    │       │
│        │            │            │         └──────────┬─────────────┘       │
│        │            │            │                    │                     │
│        │            │            │                    ▼                     │
│        │            │            │         ┌────────────────────────┐       │
│        │            │            │         │  Permission Bundles    │       │
│        │            │            │         │  (Job-role groupings)  │       │
│        │            │            │         └────────────────────────┘       │
│        │            │            │                                          │
│        │            │            ▼                                          │
│        │            │    RECORD VISIBILITY                                  │
│        │            │    (Role Hierarchy)                                   │
│        │            │                                                       │
│        ▼            ▼                                                       │
│   FEATURE      SHARING MODEL                                                │
│   ELIGIBILITY  (OWD → Owner → Hierarchy → Rules → Manual Share)             │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Key Principles Confirmed:

| Layer | Responsibility | Controls |
|-------|---------------|----------|
| **License/Plan** | Feature entitlement | Module access, API limits, storage, AI features |
| **User** | Identity | Authentication, profile |
| **Role** | Hierarchy ONLY | Record visibility inheritance (NOT permissions) |
| **Permission Sets** | Granular permissions | Object CRUD, Field access, System permissions |
| **Permission Bundles** | Job-role groupings | Collection of permission sets for easy assignment |
| **Sharing Model** | Record-level access | OWD, Owner, Hierarchy, Rules, Manual shares |

---

## 1. FINAL PERMISSION RESOLUTION LOGIC

### Confirmed Evaluation Order for Object/Action Permissions:

```
┌─────────────────────────────────────────────────────────────────┐
│              PERMISSION CHECK: Can user do {action} on {object}? │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Step 1: SUPER ADMIN CHECK                                      │
│          └─► If user.is_super_admin == true → ALLOW             │
│                                                                 │
│  Step 2: LICENSE CHECK (Future)                                 │
│          └─► If license doesn't include feature → DENY          │
│                                                                 │
│  Step 3: AGGREGATE PERMISSIONS FROM ALL SOURCES                 │
│          │                                                      │
│          ├─► Source A: user_permission_sets (direct)            │
│          │             SELECT permission_sets WHERE             │
│          │             user_permission_sets.user_id = user.id   │
│          │                                                      │
│          ├─► Source B: Permission Bundles                       │
│          │             SELECT permission_sets WHERE             │
│          │             bundle_id IN user_access_bundles         │
│          │                                                      │
│          └─► Source C: Role Permission Set (LEGACY/COMPAT)      │
│                        SELECT permission_sets WHERE             │
│                        role_id = user.role_id                   │
│                                                                 │
│  Step 4: MERGE PERMISSIONS (Most permissive wins)               │
│          └─► If ANY source grants permission → ALLOW            │
│                                                                 │
│  Step 5: DEFAULT DENY                                           │
│          └─► If no permission found → DENY                      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Permission Aggregation Rules:
- **Most permissive wins**: If user has `read=true` from ANY source, they can read
- **Union of all permissions**: All sources are combined, not replaced
- **No explicit deny**: We use "grant" model, not "grant/deny" model

### Pseudocode:
```python
async def check_permission(user, object_name, action):
    # Step 1: Super Admin bypass
    if user.is_super_admin:
        return True
    
    # Step 2: License check (future)
    # if not await check_license_feature(user, object_name):
    #     return False
    
    # Step 3: Aggregate all permission sources
    all_permissions = []
    
    # Source A: Direct user permission sets
    user_perm_sets = await get_user_direct_permission_sets(user.id)
    all_permissions.extend(user_perm_sets)
    
    # Source B: Bundle permission sets
    bundle_perm_sets = await get_user_bundle_permission_sets(user.id)
    all_permissions.extend(bundle_perm_sets)
    
    # Source C: Role permission set (legacy compatibility)
    if user.role_id:
        role_perm_set = await get_role_permission_set(user.role_id)
        if role_perm_set:
            all_permissions.append(role_perm_set)
    
    # Step 4: Check if ANY source grants permission
    for perm_set in all_permissions:
        for perm in perm_set.permissions:
            if perm.object_name == object_name and perm.get(action):
                return True
    
    # Step 5: Default deny
    return False
```

---

## 2. RECORD ACCESS EVALUATION ORDER

### Confirmed Final Order:

```
┌─────────────────────────────────────────────────────────────────┐
│         RECORD ACCESS CHECK: Can user access {record}?          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. SUPER ADMIN                                                 │
│     └─► If user.is_super_admin == true → FULL ACCESS            │
│                                                                 │
│  2. OBJECT PERMISSION (view_all / modify_all)                   │
│     └─► If user has view_all/modify_all on object → ACCESS      │
│                                                                 │
│  3. ORG-WIDE DEFAULT (OWD)                                      │
│     └─► If OWD = "Public Read/Write" → ACCESS                   │
│     └─► If OWD = "Public Read Only" → READ ACCESS               │
│     └─► If OWD = "Private" → Continue to next checks            │
│                                                                 │
│  4. RECORD OWNER                                                │
│     └─► If record.owner_id == user.id → FULL ACCESS             │
│                                                                 │
│  5. ROLE HIERARCHY                                              │
│     └─► If record owner is in user's subordinate chain → ACCESS │
│     └─► (Only if grant_access_using_hierarchies = true)         │
│                                                                 │
│  6. SHARING RULES (Criteria + Owner-based)                      │
│     └─► If any matching sharing rule includes user → ACCESS     │
│     └─► Via: direct user, role, group membership                │
│                                                                 │
│  7. MANUAL RECORD SHARE (NEW)                                   │
│     └─► If record_shares has entry for user → ACCESS            │
│     └─► Check: user directly, user's groups, user's role        │
│                                                                 │
│  8. QUEUE OWNERSHIP                                             │
│     └─► If record.owner_id is queue user belongs to → ACCESS    │
│                                                                 │
│  DEFAULT: NO ACCESS                                             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Important Notes:
- Steps 1-2 are "global" access (bypass record-level checks)
- Steps 3-8 are "record-level" access (evaluated per record)
- Access level (read vs edit) determined by the source that grants access

---

## 3. ROLE REFACTOR STRATEGY

### Confirmed Migration Approach:

```
┌─────────────────────────────────────────────────────────────────┐
│                    MIGRATION PHASES                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  PHASE 1: ADDITIVE (No breaking changes)                        │
│  ─────────────────────────────────────────                      │
│  • Create user_permission_sets table                            │
│  • Add is_super_admin to users (default: false)                 │
│  • Update check_permission() to check ALL sources               │
│  • Role-based permission sets continue working                  │
│                                                                 │
│  PHASE 2: GRADUAL MIGRATION                                     │
│  ──────────────────────────────                                 │
│  • For each existing user with role:                            │
│    - Create user_permission_sets entry linking to role's permset│
│    - This makes the migration transparent                       │
│  • New permission sets created without role_id                  │
│                                                                 │
│  PHASE 3: DEPRECATION (3+ months later)                         │
│  ────────────────────────────────────────                       │
│  • Mark role_id in permission_sets as deprecated                │
│  • Stop creating new role-linked permission sets                │
│  • Roles become hierarchy-only                                  │
│                                                                 │
│  PHASE 4: CLEANUP (Optional, 6+ months)                         │
│  ─────────────────────────────────────                          │
│  • Remove role_id from permission_sets schema                   │
│  • Full Salesforce-style model achieved                         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Services/APIs That Depend on role_id:

| File | Usage | Migration Impact |
|------|-------|------------------|
| `modules/users/services/__init__.py` | `check_permission()` uses role_id | MUST UPDATE (add multi-source) |
| `modules/records/api/records_routes.py` | Lines 252-253, 614-615, 697-698 check role_id for view_all/modify_all | MUST UPDATE (use aggregated perms) |
| `modules/records/services/records_service.py` | Role hierarchy for subordinates | NO CHANGE (this is correct) |
| `modules/auth/api/auth_routes.py` | Line 129 assigns default role_id | KEEP (roles still exist for hierarchy) |
| `modules/global_search/services/search_permissions.py` | Uses role_id for FLS | MUST UPDATE (use permission sets) |
| `modules/file_manager/services/access_control_service.py` | Role-based file access | MUST UPDATE (add permission set check) |
| `modules/task_manager/api/governance_api.py` | Governance checks role | MUST UPDATE |
| `services/sharing_rule_engine.py` | Role hierarchy for visibility | NO CHANGE (correct usage) |

### Breaking Change Risk Assessment:

| Change | Risk | Mitigation |
|--------|------|------------|
| Update `check_permission()` | **LOW** | Additive - adds sources, doesn't remove |
| Add `is_super_admin` | **NONE** | New field, defaults to false |
| Create `user_permission_sets` | **NONE** | New table |
| Role-based perms continue | **NONE** | Legacy path preserved |

---

## 4. LICENSE LAYER DESIGN

### Confirmed Design:

```javascript
// licenses collection
{
  "id": "uuid",
  "tenant_id": "uuid",
  "name": "Enterprise",
  "api_name": "enterprise",
  
  // Limits
  "max_users": 100,
  "max_storage_gb": 50,
  "max_api_calls_per_day": 100000,
  
  // Feature flags (module availability)
  "features": {
    "crm_core": true,           // Leads, Contacts, Accounts, Opps
    "flow_builder": true,       // Automation flows
    "advanced_reporting": true, // Custom reports/dashboards
    "api_access": true,         // REST API access
    "ai_features": true,        // AI scoring, recommendations
    "custom_objects": true,     // Create custom objects
    "approval_workflows": true, // Approval processes
    "file_manager": true,       // Document management
    "chatter": true,            // Collaboration
    "advanced_security": true   // FLS, record-level sharing
  },
  
  // Object limits
  "limits": {
    "custom_objects": 200,
    "custom_fields_per_object": 500,
    "flows": 500,
    "reports": 1000
  },
  
  "is_active": true,
  "valid_until": "datetime or null",
  "created_at": "datetime"
}
```

### License vs Permission Set Responsibilities:

| Responsibility | License | Permission Set |
|---------------|---------|----------------|
| "Can user access Flow Builder module?" | ✅ License | |
| "Can user create Lead records?" | | ✅ Permission Set |
| "Can user use AI features?" | ✅ License | |
| "Can user edit Account.AnnualRevenue field?" | | ✅ Permission Set (FLS) |
| "How many API calls allowed?" | ✅ License | |
| "Can user export reports?" | | ✅ Permission Set |

### Evaluation Order:
```
1. License Check (feature availability)
   └─► Does tenant's license include this module/feature?
   
2. Permission Check (CRUD access)
   └─► Does user's permission sets allow this action?
```

### Implementation Note:
- License is at **TENANT level** (all users in org share same license)
- Permission Sets are at **USER level** (individual permissions)
- License check happens BEFORE permission check
- If license denies, permission check is skipped

---

## 5. MANUAL RECORD SHARING (record_shares)

### Confirmed Schema:

```javascript
// record_shares collection
{
  "id": "uuid",
  "tenant_id": "uuid",
  "object_name": "opportunity",
  "record_id": "uuid",
  
  // Who is being granted access
  "shared_with_type": "user" | "group" | "role",
  "shared_with_id": "uuid",
  
  // Access level
  "access_level": "read" | "edit",
  
  // Audit trail
  "shared_by": "uuid",          // User who shared
  "shared_at": "datetime",
  "reason": "string|null",      // Optional reason
  
  // Expiration (optional)
  "expires_at": "datetime|null",
  
  // Status
  "is_active": true
}
```

### Supported Share Types:
| Type | Description | Query |
|------|-------------|-------|
| `user` | Direct user share | `shared_with_id = user.id` |
| `group` | Group share | `shared_with_id IN user.group_ids` |
| `role` | Role share | `shared_with_id = user.role_id` |

### Avoiding Duplicate Access Calculations:

```
┌─────────────────────────────────────────────────────────────────┐
│                 ACCESS EVALUATION STRATEGY                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  APPROACH: "First Grant Wins" with caching                      │
│                                                                 │
│  1. Build visibility query ONCE per request                     │
│     - Include sharing rules conditions                          │
│     - Include manual shares conditions                          │
│     - Both become $or conditions in same query                  │
│                                                                 │
│  2. For single record access check:                             │
│     - Early exit on first "grant" found                         │
│     - Order checks by likelihood (owner → hierarchy → rules →   │
│       manual shares)                                            │
│                                                                 │
│  3. Caching layer:                                              │
│     - Cache user's effective sharing rules for 5 minutes        │
│     - Cache manual shares lookup per session                    │
│     - Invalidate on share create/delete                         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Implementation in sharing_rule_engine.py:
```python
# Add to build_visibility_query() after sharing rules section:

# 7. Manual Record Shares
manual_shares = await db.record_shares.find({
    "tenant_id": self.tenant_id,
    "object_name": object_name,
    "is_active": True,
    "$or": [
        {"shared_with_type": "user", "shared_with_id": self.user_id},
        {"shared_with_type": "group", "shared_with_id": {"$in": user_group_ids}},
        {"shared_with_type": "role", "shared_with_id": self.user_role_id}
    ]
}).to_list(None)

if manual_shares:
    shared_record_ids = [share["record_id"] for share in manual_shares]
    visibility_conditions.append({"id": {"$in": shared_record_ids}})
```

---

## 6. EFFECTIVE PERMISSION CALCULATION

### Complete Permission Resolution Flow:

```
┌─────────────────────────────────────────────────────────────────┐
│            EFFECTIVE PERMISSION CALCULATION                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  INPUT: user_id, object_name, action                            │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ STEP 1: GATHER PERMISSION SETS                          │    │
│  ├─────────────────────────────────────────────────────────┤    │
│  │                                                         │    │
│  │  perm_set_ids = []                                      │    │
│  │                                                         │    │
│  │  // Direct assignments                                  │    │
│  │  direct = SELECT permission_set_id                      │    │
│  │           FROM user_permission_sets                     │    │
│  │           WHERE user_id = ?                             │    │
│  │  perm_set_ids.extend(direct)                            │    │
│  │                                                         │    │
│  │  // From bundles                                        │    │
│  │  bundle_ids = SELECT bundle_id                          │    │
│  │               FROM user_access_bundles                  │    │
│  │               WHERE user_id = ?                         │    │
│  │  FOR bundle IN bundles:                                 │    │
│  │      perm_set_ids.extend(bundle.permission_set_ids)     │    │
│  │                                                         │    │
│  │  // From role (legacy)                                  │    │
│  │  IF user.role_id:                                       │    │
│  │      role_perm = SELECT id FROM permission_sets         │    │
│  │                  WHERE role_id = user.role_id           │    │
│  │      perm_set_ids.append(role_perm)                     │    │
│  │                                                         │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ STEP 2: AGGREGATE OBJECT PERMISSIONS                    │    │
│  ├─────────────────────────────────────────────────────────┤    │
│  │                                                         │    │
│  │  effective = {                                          │    │
│  │    create: false,                                       │    │
│  │    read: false,                                         │    │
│  │    edit: false,                                         │    │
│  │    delete: false,                                       │    │
│  │    view_all: false,                                     │    │
│  │    modify_all: false                                    │    │
│  │  }                                                      │    │
│  │                                                         │    │
│  │  FOR perm_set IN permission_sets:                       │    │
│  │    FOR perm IN perm_set.permissions:                    │    │
│  │      IF perm.object_name == object_name:                │    │
│  │        effective.create |= perm.create                  │    │
│  │        effective.read |= perm.read                      │    │
│  │        effective.edit |= perm.edit                      │    │
│  │        effective.delete |= perm.delete                  │    │
│  │        effective.view_all |= perm.view_all              │    │
│  │        effective.modify_all |= perm.modify_all          │    │
│  │                                                         │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
│  OUTPUT: effective[action]                                      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Performance Optimization Strategy:

```python
# Cache structure for effective permissions
user_permission_cache = {
    "user_id": {
        "computed_at": datetime,
        "ttl_seconds": 300,  # 5 minute cache
        "permissions": {
            "lead": {"create": true, "read": true, ...},
            "contact": {"create": true, "read": true, ...},
            ...
        },
        "is_super_admin": false,
        "permission_set_ids": ["ps1", "ps2", ...]
    }
}
```

### Cache Invalidation Triggers:
- User permission set assignment changes
- User bundle assignment changes
- Permission set definition changes
- User role changes
- User is_super_admin changes

### API for Effective Permissions:
```
GET /api/security/users/{user_id}/effective-permissions
Response:
{
  "user_id": "uuid",
  "is_super_admin": false,
  "permission_sources": [
    {"type": "direct", "permission_set_id": "ps1", "name": "Sales Rep"},
    {"type": "bundle", "bundle_id": "b1", "permission_set_id": "ps2"},
    {"type": "role", "role_id": "r1", "permission_set_id": "ps3"}
  ],
  "effective_permissions": {
    "lead": {"create": true, "read": true, "edit": true, "delete": false, "view_all": false, "modify_all": false},
    "contact": {...},
    ...
  },
  "record_visibility": {
    "role_hierarchy": true,
    "subordinate_count": 5
  }
}
```

---

## 7. IMPLEMENTATION SEQUENCE

### Confirmed Safe Order:

```
┌─────────────────────────────────────────────────────────────────┐
│                  MVP IMPLEMENTATION SEQUENCE                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  STEP 1: Add Super Admin Flag (Lowest Risk)                     │
│  ──────────────────────────────────────────                     │
│  • Add is_super_admin field to users (default: false)           │
│  • Update check_permission() to check super admin first         │
│  • Update sharing_rule_engine to bypass for super admin         │
│  • UI: Add toggle in User Management                            │
│  Risk: NONE (additive, new feature)                             │
│                                                                 │
│  STEP 2: Create user_permission_sets Table (Additive)           │
│  ─────────────────────────────────────────────────────          │
│  • Create collection with indexes                               │
│  • Create CRUD API endpoints                                    │
│  • UI: Permission Set assignment in User Management             │
│  Risk: NONE (new table, no existing data affected)              │
│                                                                 │
│  STEP 3: Update Permission Engine (Backward Compatible)         │
│  ────────────────────────────────────────────────────           │
│  • Modify check_permission() to aggregate from:                 │
│    - user_permission_sets (new)                                 │
│    - user_access_bundles (existing)                             │
│    - role permission set (legacy, preserved)                    │
│  • All existing permissions continue working                    │
│  Risk: LOW (adds sources, doesn't remove any)                   │
│                                                                 │
│  STEP 4: Create record_shares Table (Additive)                  │
│  ───────────────────────────────────────────────                │
│  • Create collection with indexes                               │
│  • Create sharing API endpoints                                 │
│  • Integrate into sharing_rule_engine                           │
│  • UI: "Share" button on record pages                           │
│  Risk: NONE (new feature, additive)                             │
│                                                                 │
│  STEP 5: Create licenses Table (Schema Only)                    │
│  ────────────────────────────────────────────                   │
│  • Create collection with seed data                             │
│  • Add license_id to users (nullable)                           │
│  • NO enforcement yet (preparation for Phase 2)                 │
│  Risk: NONE (schema only, no enforcement)                       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Dependency Graph:

```
Step 1 (Super Admin)
    │
    ▼
Step 2 (user_permission_sets) ──────┐
    │                               │
    ▼                               ▼
Step 3 (Permission Engine)    Step 4 (record_shares)
    │                               │
    └───────────────┬───────────────┘
                    │
                    ▼
              Step 5 (Licenses)
```

### Testing Checkpoints:

| After Step | Test |
|------------|------|
| Step 1 | Create super admin user, verify bypasses all permission checks |
| Step 2 | Assign permission set to user, verify in database |
| Step 3 | User with direct permission set can access object; user with only role permission set still works |
| Step 4 | Share record with user, verify they can access it |
| Step 5 | License table exists, users have license_id (no enforcement yet) |

---

## CONFIRMATION CHECKLIST

Please confirm the following before I proceed with implementation:

### 1. Permission Resolution Logic
- [  ] Super Admin bypasses all checks
- [  ] License check before permission check
- [  ] Aggregate from: direct + bundles + role (legacy)
- [  ] Most permissive wins (union model)

### 2. Record Access Order
- [  ] Order: Super Admin → Object Perm → OWD → Owner → Hierarchy → Rules → Manual Share → Queue

### 3. Migration Strategy
- [  ] Phase 1: Additive only, no breaking changes
- [  ] Keep role_id in permission_sets for backward compatibility
- [  ] Deprecate role-based permissions in Phase 3 (3+ months)

### 4. License Design
- [  ] License controls feature/module availability
- [  ] Permission Sets control CRUD access
- [  ] License is tenant-level, not user-level

### 5. Manual Sharing
- [  ] Support user, group, and role shares
- [  ] Integrated into visibility query (single query)
- [  ] Optional expiration support

### 6. Implementation Sequence
- [  ] Step 1: Super Admin
- [  ] Step 2: user_permission_sets
- [  ] Step 3: Permission Engine
- [  ] Step 4: record_shares
- [  ] Step 5: licenses (schema only)

---

## READY FOR IMPLEMENTATION

Once you confirm the above, I will proceed with Step 1 (Super Admin Flag) and continue sequentially.

**Estimated MVP Timeline:** 15-20 hours of development
**Risk Level:** LOW (all changes are additive/backward compatible)

