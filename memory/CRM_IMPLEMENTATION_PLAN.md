# CRM Standardization Implementation Plan

## Executive Summary

This document outlines a phased approach to implementing the CRM specification while minimizing risk to the existing production system with active users.

---

## Current State Analysis

### What Already Exists
- **6 Standard Objects**: Lead, Contact, Account, Opportunity, Task, Event
- **Object Metadata System**: Tenant-level field definitions in `tenant_objects` collection
- **Record Storage**: `object_records` collection with `data` sub-document
- **Page Layouts**: Basic section-based layouts in `PAGE_LAYOUTS` constant
- **Related Lists Module**: Exists but limited
- **Actions Module**: Recently implemented (P1 complete)
- **Lead Conversion**: Basic implementation exists

### Key Gaps vs Specification
1. **Object Renaming**: Lead → Prospect (breaking change, defer)
2. **Activity Linking**: No `person_link_id` / `record_link_id` fields
3. **System Fields**: Missing `created_by`, `updated_by`, `system_timestamp`, `is_deleted`
4. **Computed Fields**: No `last_activity_at`, `expected_revenue`, `name` (computed)
5. **Stage Definitions**: No metadata model (just picklist values)
6. **EmailMessage Object**: Does not exist
7. **New/Detail Layouts**: Single layout type, no separation
8. **Audit Override**: No license-gated import override

---

## Phased Implementation Plan

### Phase 1: Foundation (Low Risk, High Value)
**Goal**: Add missing system fields and computed fields without breaking existing functionality.

#### 1.1 System Fields Migration (Backend)
**Effort**: Medium | **Risk**: Low

Add to ALL records (migration script):
```python
# New fields to add to object_records
{
    "created_by": "<user_id>",      # Copy from owner_id initially
    "updated_by": "<user_id>",      # Copy from owner_id initially  
    "system_timestamp": datetime,    # Copy from updated_at
    "is_deleted": False              # Default false
}
```

**Implementation Steps**:
1. Create migration script in `/app/backend/migrations/`
2. Add fields to record creation/update logic in `records` module
3. Update API responses to include new fields
4. Mark as read-only in metadata

**Files to Modify**:
- `/app/backend/modules/records/services/record_service.py`
- `/app/backend/modules/records/api/record_routes.py`

#### 1.2 Computed `name` Field for Prospect/Contact
**Effort**: Low | **Risk**: Low

Add computed `name` = `first_name + ' ' + last_name` for Lead and Contact.

**Implementation**:
- Backend: Compute on save, store in `data.name`
- Frontend: Display in headers, search results
- Make read-only in metadata

#### 1.3 Activity Link Fields (Task/Event)
**Effort**: Medium | **Risk**: Low

Replace `related_to` + `related_type` with:
- `person_link_id` (lookup to Lead/Contact)
- `record_link_id` (lookup to any object)

**Migration Strategy**:
1. Add new fields alongside existing
2. Migrate data: `related_to` → appropriate link field based on `related_type`
3. Deprecate old fields (hide from UI, keep in DB)
4. Frontend: Update forms to use new fields

#### 1.4 `last_activity_at` Computed Field
**Effort**: Medium | **Risk**: Low

Add to: Lead, Contact, Account, Opportunity

**Implementation**:
- Create background job or trigger
- On Task/Event create/update: find linked records, update their `last_activity_at`
- Add field to object metadata as read-only

---

### Phase 2: Stage Definitions & Layouts (Medium Risk)
**Goal**: Implement metadata-driven stage configuration and separate New/Detail layouts.

#### 2.1 Stage Definitions Model
**Effort**: High | **Risk**: Medium

Create new module: `/app/backend/modules/stage_definitions/`

**Data Model**:
```python
class StageDefinition:
    id: str
    tenant_id: str
    object_name: str  # "lead" or "opportunity"
    stage_name: str
    probability_percent: int  # 0-100
    is_closed_won: bool
    is_closed_lost: bool
    forecast_category: str  # Pipeline, Best Case, Commit, Closed
    sort_order: int
    is_active: bool
```

**Starter Data**:
- Lead: New(10), Contacted(20), Working(40), Qualified(60), Converted(100), Unqualified(0)
- Opportunity: Prospecting(10), Qualification(20), Proposal(50), Negotiation(70), Closed Won(100), Closed Lost(0)

**Impact**:
- Deprecate hardcoded `status` / `stage` picklist options
- UI fetches stages from API
- Computed fields: `probability_percent`, `forecast_category`, `expected_revenue`

#### 2.2 Separate New Layout vs Detail Layout
**Effort**: High | **Risk**: Medium

**Current State**: Single `PAGE_LAYOUTS` dict with sections

**Target State**:
```python
# New collection: page_layouts
{
    "id": "uuid",
    "tenant_id": "uuid",
    "object_name": "lead",
    "layout_type": "new",  # or "detail"
    "layout_name": "Lead New Layout",
    "is_system": True,
    "sections": [...],
    "header_fields": [...],  # For detail only
    "related_lists": [...],  # For detail only
    "created_at": datetime
}
```

**Implementation Steps**:
1. Create `/app/backend/modules/page_layouts/` module
2. Migrate existing `PAGE_LAYOUTS` to database
3. Create default New + Detail layouts per object
4. Update frontend to fetch layouts from API
5. Add layout editor in Object Manager

#### 2.3 Opportunity Computed Fields
**Effort**: Low | **Risk**: Low

Add computed fields (after Stage Definitions):
- `probability_percent` ← from stage definition
- `forecast_category` ← from stage definition  
- `expected_revenue` = `amount * probability_percent / 100`

---

### Phase 3: EmailMessage & Advanced Features (Higher Risk)
**Goal**: Add EmailMessage object and advanced conversion tracking.

#### 3.1 EmailMessage Object
**Effort**: High | **Risk**: Medium

Create new standard object with fields per spec.

**Considerations**:
- Mostly read-only (populated by email integration)
- Need email sync infrastructure (future)
- For now: create object, allow manual creation

#### 3.2 Conversion Tracking Fields
**Effort**: Medium | **Risk**: Low

Add to Account, Contact, Opportunity:
- `created_from_prospect` (boolean, read-only)
- `source_prospect_id` (lookup, read-only)

Update Lead Conversion logic to populate these.

#### 3.3 Audit Override Feature
**Effort**: Medium | **Risk**: Medium

Add license/permission check:
- `allow_audit_override` permission
- Only applies during import/API with special flag
- Does NOT apply to `last_activity_at`

#### 3.4 Rollup Fields for Account
**Effort**: Medium | **Risk**: Low

Add computed rollups:
- `open_opportunity_count`
- `open_pipeline_amount`

Use existing rollup field infrastructure or create triggers.

---

## Technical Risks & Mitigations

### Risk 1: Data Migration for Existing Records
**Risk Level**: Medium
**Mitigation**: 
- Run migrations in batches with progress logging
- Create backup before migration
- Add fallback defaults for missing data

### Risk 2: Breaking Frontend with Field Changes
**Risk Level**: Medium
**Mitigation**:
- Keep old fields alongside new (deprecation period)
- Use feature flags for new UI components
- Test thoroughly with existing data

### Risk 3: Stage Definitions Breaking Opportunity Pipeline
**Risk Level**: High
**Mitigation**:
- Default stage definitions match current picklist values exactly
- Add validation that all existing stage values map to definitions
- Rollback script ready

### Risk 4: Activity Linking Migration
**Risk Level**: Medium
**Mitigation**:
- Keep `related_to`/`related_type` fields working
- Add new fields as "additional" not "replacement" initially
- Migrate in background, verify counts match

---

## Implementation Priority Matrix

| Feature | Phase | Effort | Risk | Business Value | Dependency |
|---------|-------|--------|------|----------------|------------|
| System fields (created_by, etc.) | 1 | M | L | Medium | None |
| Computed `name` field | 1 | L | L | High | None |
| Activity link fields | 1 | M | L | High | None |
| `last_activity_at` | 1 | M | L | High | Activity links |
| Stage Definitions | 2 | H | M | High | None |
| New/Detail Layouts | 2 | H | M | Medium | None |
| Opp computed fields | 2 | L | L | Medium | Stage Defs |
| EmailMessage object | 3 | H | M | Medium | None |
| Conversion tracking | 3 | M | L | Medium | None |
| Audit Override | 3 | M | M | Low | System fields |
| Account rollups | 3 | M | L | Medium | None |

---

## Recommended Execution Order

### Week 1-2: Phase 1.1 + 1.2
- Add system fields to backend
- Implement computed `name` for Lead/Contact
- Update frontend displays

### Week 3-4: Phase 1.3 + 1.4
- Add activity link fields
- Migrate existing Task/Event data
- Implement `last_activity_at` computation

### Week 5-7: Phase 2.1
- Build Stage Definitions module
- Create admin UI for stage management
- Migrate Lead status + Opportunity stage

### Week 8-10: Phase 2.2
- Build Page Layouts module
- Create default New + Detail layouts
- Update frontend rendering

### Week 11+: Phase 3
- EmailMessage object
- Conversion tracking
- Audit override
- Account rollups

---

## AI-Assisted vs Manual Implementation

### Best for AI-Assisted Refactoring
- Migration scripts (pattern-based)
- CRUD API boilerplate
- Frontend form field additions
- Test generation

### Requires Careful Manual Implementation
- Stage Definitions logic (business rules)
- `last_activity_at` trigger logic
- Layout rendering engine
- Data migration validation
- Conversion flow updates

---

## Files to Create (Phase 1)

```
/app/backend/
├── migrations/
│   ├── 001_add_system_fields.py
│   ├── 002_add_activity_links.py
│   └── 003_add_computed_name.py
└── modules/
    └── activity_links/
        ├── api/activity_link_routes.py
        ├── services/activity_link_service.py
        └── models/activity_link_model.py
```

## Files to Create (Phase 2)

```
/app/backend/modules/
├── stage_definitions/
│   ├── api/stage_definition_routes.py
│   ├── services/stage_definition_service.py
│   └── models/stage_definition_model.py
└── page_layouts/
    ├── api/page_layout_routes.py
    ├── services/page_layout_service.py
    └── models/page_layout_model.py
```

---

## Questions for Stakeholder

1. **Object Renaming (Lead → Prospect)**: Defer indefinitely or plan for Phase 4?
2. **EmailMessage**: Manual creation needed now, or wait for email integration?
3. **Audit Override**: Is this needed for current import workflows?
4. **Stage Definitions**: Can we deprecate picklist-based stages, or must both work?
5. **Related Lists**: Current module sufficient, or rebuild needed?

---

## Success Criteria

### Phase 1 Complete When:
- [ ] All records have `created_by`, `updated_by`, `is_deleted` fields
- [ ] Lead/Contact show computed `name` in UI
- [ ] Task/Event have `person_link_id` and `record_link_id`
- [ ] Major objects show `last_activity_at` updating correctly

### Phase 2 Complete When:
- [ ] Stage Definitions editable in Object Manager
- [ ] Opportunity `probability`, `forecast_category`, `expected_revenue` auto-compute
- [ ] Separate New Layout and Detail Layout per object
- [ ] Layout editor functional in admin

### Phase 3 Complete When:
- [ ] EmailMessage object exists with all spec fields
- [ ] Conversion creates records with `source_prospect_id`
- [ ] Audit Override works for imports
- [ ] Account shows `open_opportunity_count` and `open_pipeline_amount`
