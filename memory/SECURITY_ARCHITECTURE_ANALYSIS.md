# CRM Security Architecture Analysis
## Comparison with Salesforce-Style Framework

**Analysis Date:** March 12, 2026  
**Analyst:** E1 Agent  
**Status:** Comprehensive Gap Analysis Complete

---

## 1. ARCHITECTURE ALIGNMENT ANALYSIS

### Target Access Model:
```
License/Plan → User → Role (Hierarchy) → Permission Sets/Bundles → OWD → Sharing Rules
```

### Current Implementation Status:

| Component | Target Framework | Current Status | Alignment |
|-----------|-----------------|----------------|-----------|
| **License/Plan Layer** | Controls feature eligibility | ❌ NOT IMPLEMENTED | Missing |
| **Super Admin Flag** | Bypasses all permission checks | ❌ NOT IMPLEMENTED | Missing |
| **Users** | Links to license, role, permission sets | ⚠️ PARTIAL - Has role_id only | Needs enhancement |
| **Roles (Hierarchy Only)** | Controls record visibility ONLY | ⚠️ PARTIAL - Currently tied to permissions | Needs refactoring |
| **Permission Sets (Granular)** | User-assignable, independent of roles | ❌ WRONG DESIGN - Tied to role_id | Needs major refactoring |
| **Permission Bundles** | Groups permission sets for job roles | ✅ IMPLEMENTED (access_bundles) | Aligned |
| **User Permission Sets** | Direct user-to-permset assignment | ❌ NOT IMPLEMENTED | Missing table |
| **User Permission Bundles** | Direct user-to-bundle assignment | ✅ IMPLEMENTED (user_access_bundles) | Aligned |
| **Organization-Wide Defaults** | Per-object default access | ✅ IMPLEMENTED | Aligned |
| **Sharing Rules** | Criteria & Owner-based sharing | ✅ IMPLEMENTED | Aligned |
| **Groups** | Public groups for sharing | ✅ IMPLEMENTED | Aligned |
| **Queues** | Queue ownership | ✅ IMPLEMENTED | Aligned |
| **Record Access Evaluation** | Ordered evaluation chain | ⚠️ PARTIAL - Missing Super Admin check | Needs enhancement |
| **Object-Level Permissions** | CRUD + View All/Modify All | ✅ IMPLEMENTED | Aligned |
| **Field-Level Permissions** | Per-field read/edit control | ⚠️ SCHEMA EXISTS - Not enforced | Needs implementation |
| **Flow Permissions** | Control flow execution | ❌ NOT IMPLEMENTED | Missing |
| **System Permissions** | Setup access, API limits | ❌ NOT IMPLEMENTED | Missing |
| **AI/Automation Permissions** | Control AI features | ❌ NOT IMPLEMENTED | Missing |
| **Manual Sharing (record_shares)** | Per-record explicit access | ❌ NOT IMPLEMENTED | Missing |

---

## 2. ROLE VS PERMISSION REFACTOR ANALYSIS

### Current Problem:
```python
# Current Schema - TIGHTLY COUPLED
permission_sets = {
    "id": "permset_system_administrator",
    "role_id": "system_administrator",  # <-- PROBLEM: Tied to role
    "role_name": "System Administrator",
    "permissions": [...]
}
```

### Salesforce Model (Target):
```
Role = ONLY hierarchy/visibility
Permission Set = Granular permissions, assigned to USERS directly
```

### What Needs to Change:

1. **Decouple permission_sets from roles**
   - Remove `role_id` from permission_sets
   - Add `user_permission_sets` junction table
   - Permission sets become standalone, user-assignable entities

2. **Roles become hierarchy-only**
   - Roles control: Record visibility via hierarchy
   - Roles DO NOT control: Object permissions, field permissions, system permissions

3. **Migration Strategy:**
   - Create new `user_permission_sets` table
   - For each user with a role, auto-assign the legacy role's permission set
   - Keep legacy permission_sets working during transition (backward compatible)

---

## 3. LICENSE/PLAN LAYER DESIGN

### Proposed Schema:
```javascript
// New Collection: licenses
{
  "id": "uuid",
  "tenant_id": "uuid",
  "name": "Enterprise",                    // Plan name
  "api_name": "enterprise",
  "max_users": 100,                         // User limit
  "max_storage_gb": 50,                     // Storage limit
  "features": {
    "api_access": true,
    "flow_builder": true,
    "advanced_reporting": true,
    "ai_features": true,
    "custom_objects": true,
    "approval_workflows": true
  },
  "object_limits": {
    "custom_objects": 200,
    "custom_fields_per_object": 500
  },
  "is_active": true,
  "created_at": "datetime"
}

// User Schema Enhancement
users: {
  ...existing_fields,
  "license_id": "uuid",        // NEW: Reference to license
  "is_super_admin": false      // NEW: Bypasses all permission checks
}
```

### Implementation Notes:
- License is at TENANT level (organization-wide)
- Users inherit tenant's license
- Super Admin flag is per-user, independent of license

---

## 4. PERMISSION ARCHITECTURE GAPS

### Current Structure:
```
permission_sets → tied to role_id
access_bundles → groups permission_set_ids
user_access_bundles → assigns bundles to users
```

### Required Changes:

| Table | Current | Target | Action |
|-------|---------|--------|--------|
| `permission_sets` | Has role_id | Standalone, no role_id | MODIFY |
| `permission_set_items` | N/A (embedded) | Separate table for granular perms | CREATE |
| `user_permission_sets` | N/A | Junction table | CREATE |
| `permission_bundles` | Exists as `access_bundles` | Rename/keep | OK |
| `permission_bundle_members` | Embedded in bundles | Keep embedded | OK |
| `user_permission_bundles` | Exists as `user_access_bundles` | Keep | OK |

### New Permission Types to Add:
```javascript
// System Permissions
{
  "manage_users": true,
  "view_setup": true,
  "manage_roles": true,
  "manage_sharing": true,
  "api_enabled": true,
  "manage_custom_objects": true,
  "manage_flows": true,
  "export_reports": true
}

// Flow Permissions (per flow)
{
  "flow_id": "uuid",
  "can_run": true,
  "can_edit": true
}

// AI Permissions
{
  "use_ai_assistant": true,
  "use_ai_scoring": true,
  "use_ai_recommendations": true
}
```

---

## 5. FIELD-LEVEL SECURITY DESIGN

### Current State:
- Schema exists in `shared/models.py` (FieldPermission class)
- NOT enforced in record APIs
- NOT integrated with permission evaluation

### Proposed Implementation:

```javascript
// Collection: field_level_security
{
  "id": "uuid",
  "tenant_id": "uuid",
  "permission_set_id": "uuid",          // Which permission set this applies to
  "object_name": "lead",
  "field_permissions": [
    {
      "field_name": "annual_revenue",
      "read": true,
      "edit": false                      // Read-only
    },
    {
      "field_name": "ssn",
      "read": false,                     // Hidden
      "edit": false
    }
  ]
}
```

### Enforcement Points:
1. **Record Read API** - Filter out hidden fields
2. **Record Update API** - Reject changes to read-only fields
3. **List View API** - Exclude hidden fields from response
4. **Export API** - Honor field visibility

---

## 6. RECORD SHARING ENGINE ANALYSIS

### Current Evaluation Order (sharing_rule_engine.py):
```
1. Record Owner (user always sees their own records)
2. Role Hierarchy access
3. Object-level sharing settings (OWD)
4. Sharing Rules (criteria-based or owner-based)
5. Group membership access
6. Queue ownership
```

### Target Evaluation Order:
```
1. Super Admin                    ← MISSING
2. Object Permission              ← EXISTS (check_permission)
3. Org-Wide Default               ← EXISTS
4. Owner                          ← EXISTS
5. Role Hierarchy                 ← EXISTS
6. Sharing Rules                  ← EXISTS
7. Manual Share / Explicit Access ← MISSING (record_shares)
```

### Required Changes:
1. Add Super Admin bypass check at top
2. Add Manual Share (record_shares) evaluation
3. Integrate object permission check into sharing engine

---

## 7. DATABASE CHANGES REQUIRED

### Tables to CREATE:

```javascript
// 1. licenses
{
  "id": "uuid",
  "tenant_id": "uuid",
  "name": "string",
  "api_name": "string",
  "max_users": "number",
  "features": "object",
  "is_active": "boolean"
}

// 2. user_permission_sets (junction table)
{
  "id": "uuid",
  "user_id": "uuid",
  "permission_set_id": "uuid",
  "assigned_at": "datetime",
  "assigned_by": "uuid"
}

// 3. record_shares (manual sharing)
{
  "id": "uuid",
  "tenant_id": "uuid",
  "object_name": "string",
  "record_id": "uuid",
  "shared_with_type": "user|group|role",
  "shared_with_id": "uuid",
  "access_level": "read|edit",
  "shared_by": "uuid",
  "shared_at": "datetime",
  "expiration": "datetime|null"   // Optional expiration
}

// 4. system_permissions
{
  "id": "uuid",
  "permission_set_id": "uuid",
  "permissions": {
    "manage_users": "boolean",
    "view_setup": "boolean",
    "api_enabled": "boolean",
    ...
  }
}

// 5. field_level_security
{
  "id": "uuid",
  "tenant_id": "uuid",
  "permission_set_id": "uuid",
  "object_name": "string",
  "field_permissions": [
    {"field_name": "string", "read": "boolean", "edit": "boolean"}
  ]
}
```

### Tables to MODIFY:

```javascript
// users - ADD fields
{
  ...existing,
  "license_id": "uuid|null",
  "is_super_admin": "boolean (default: false)"
}

// permission_sets - REMOVE role coupling
{
  ...existing,
  // REMOVE: "role_id"
  // REMOVE: "role_name"
  // ADD:
  "name": "string",
  "api_name": "string",
  "description": "string",
  "is_custom": "boolean"
}
```

---

## 8. IMPLEMENTATION PLAN

### Phase 1: MVP (Must Implement Now)
**Priority: Critical for Salesforce-style alignment**

#### Step 1.1: Add Super Admin Flag (2 hours)
- Add `is_super_admin` field to users collection
- Update `check_permission()` to bypass if super admin
- Update `sharing_rule_engine.py` to bypass for super admin
- Update UI to show super admin toggle in user management

#### Step 1.2: Decouple Permission Sets from Roles (4 hours)
- Create migration script to:
  - Add `name`, `api_name`, `description` to permission_sets
  - Keep `role_id` for backward compatibility (soft deprecation)
- Create `user_permission_sets` collection
- Update `check_permission()` to check:
  1. User's direct permission sets (new)
  2. User's role's permission set (legacy, for backward compat)
  3. User's bundles' permission sets

#### Step 1.3: Create record_shares Collection (3 hours)
- Create collection and indexes
- Add API endpoints:
  - POST `/api/records/{object}/{id}/share`
  - DELETE `/api/records/{object}/{id}/share/{share_id}`
  - GET `/api/records/{object}/{id}/shares`
- Integrate into `sharing_rule_engine.py`

#### Step 1.4: License/Plan Layer (4 hours)
- Create `licenses` collection with seed data
- Add `license_id` to users (nullable for migration)
- Create API for license management
- Add feature flag checks in critical paths

### Phase 2: Improvements (Can Be Added Later)

#### Step 2.1: Field-Level Security Enforcement (6 hours)
- Create `field_level_security` collection
- Build field filtering service
- Integrate into:
  - GET record API
  - GET records list API
  - PUT record API (validation)
- Build UI for FLS management

#### Step 2.2: System Permissions (4 hours)
- Create `system_permissions` collection
- Define standard system permissions
- Integrate checks into Setup pages
- Build UI for system permission management

#### Step 2.3: Flow Permissions (3 hours)
- Add permissions to flow definitions
- Check permissions before flow execution
- Build UI for flow permission management

#### Step 2.4: AI/Automation Permissions (2 hours)
- Add AI permission flags to system_permissions
- Check before AI feature usage
- Build UI controls

### Phase 3: Future Enhancements

#### Step 3.1: Permission Set Groups
- Group permission sets for easier assignment
- UI for managing groups

#### Step 3.2: Time-Based Permissions
- Expiring permission assignments
- Scheduled access windows

#### Step 3.3: Delegated Administration
- Allow certain users to manage specific permission sets
- Territory-based administration

---

## 9. RISK ASSESSMENT

### Breaking Changes:

| Change | Risk Level | Mitigation |
|--------|------------|------------|
| Decouple permission_sets from roles | HIGH | Keep role_id for backward compat, dual-check in permission engine |
| Add Super Admin bypass | LOW | New feature, no existing behavior changed |
| Add record_shares | LOW | New feature, additive |
| Add license_id to users | LOW | Nullable field, optional enforcement initially |
| FLS enforcement | MEDIUM | Gradual rollout, admin toggle to enable |

### Migration Safety:

1. **Backward Compatibility Period**
   - Keep `role_id` in permission_sets for 3 months
   - `check_permission()` checks both old and new paths
   - Logging to track which path is used

2. **Data Migration Script**
   ```python
   # For each user with a role:
   # 1. Find role's permission set
   # 2. Create user_permission_sets entry
   # This preserves existing access while enabling new model
   ```

3. **Feature Flags**
   - `USE_NEW_PERMISSION_MODEL` = false (default)
   - When ready, flip to true
   - Old model continues working

---

## 10. PRIORITY ROADMAP

### MVP (Week 1-2)
- [ ] Super Admin flag implementation
- [ ] user_permission_sets table and API
- [ ] Permission set decoupling (soft)
- [ ] record_shares table and API
- [ ] Basic license table (for future use)

### Phase 2 (Week 3-4)
- [ ] Field-Level Security enforcement
- [ ] System permissions
- [ ] License feature enforcement
- [ ] UI updates for new permission model

### Phase 3 (Month 2+)
- [ ] Flow permissions
- [ ] AI permissions
- [ ] Complete role decoupling
- [ ] Advanced delegation features

---

## SUMMARY

### Current Alignment: ~60%

**Strengths:**
- OWD implementation is solid
- Sharing rules work correctly
- Groups and queues are well-implemented
- Access bundles concept is correct
- Role hierarchy for visibility exists

**Critical Gaps:**
1. No License/Plan layer
2. No Super Admin bypass
3. Permission sets tied to roles (wrong model)
4. No user-direct permission set assignment
5. No manual record sharing (record_shares)
6. Field-level security not enforced
7. No system/flow/AI permissions

**Recommended Priority:**
Start with Super Admin + user_permission_sets + record_shares as these are foundational for Salesforce-style security.

