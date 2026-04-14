# DocFlow Evolution — Architecture & Implementation Plan

## 1. Current System Audit

### What Exists Today

| Layer | Component | Status |
|---|---|---|
| **Data Models** | `Template` (versioned, single-doc) | Stable |
| | `Document` (single PDF, recipients, signatures, audit_trail) | Stable |
| | `Recipient` (name, email, role, routing_order, status) | Basic roles only (signer/approver/viewer/witness) |
| | `SignatureField` (per-page coordinates, assigned to recipient) | Stable |
| **APIs** | `POST /api/docflow/documents/generate-links` | Primary send endpoint |
| | `POST /api/docflow/documents/generate` | Legacy generate |
| | `POST /api/docflow/documents/{id}/sign` | Signature capture |
| | `GET /api/docflow/documents/public/{token}` | Public document access |
| **Services** | `EnhancedDocumentService` (1262 lines) | Core engine — generate, sign, OTP, audit |
| | `ActivityLogService` | Basic event logging (created/sent/viewed/signed) |
| | `EmailService` / `SystemEmailService` | Email delivery + OTP |
| | `PDFGenerationService` / `PDFOverlayService` | PDF creation + signature overlay |
| **Frontend** | `TemplateEditor` (validation, save, field placement) | Recently refactored |
| | `GenerateDocumentWizard` (send flow) | Single-doc wizard |
| | `RecipientsRoutingTab` (sequential/parallel, component assignment) | Basic routing UI |
| | `PublicDocumentViewEnhanced` (OTP, signature, view) | Public signer experience |
| **Security** | OTP-based auth (`docflow_otps` collection) | Per-access, no session persistence |
| **Routing** | Sequential OR parallel (global toggle) | No mixed/hybrid support |
| **Audit** | `audit_trail[]` embedded in Document | Basic events, no structured schema |

### Key Observations

1. **Single-document architecture** — Document is the top-level entity. No parent grouping concept.
2. **OTP exists but is stateless** — Each access triggers OTP verification, but there's no session token persisted after verification. No timeout/re-auth.
3. **Routing is binary** — Either all sequential OR all parallel. No per-recipient routing_order based hybrid.
4. **Roles are labels only** — `role` field exists on recipients but doesn't drive UI behavior or workflow logic.
5. **No void/cancel** — No mechanism to abort a document mid-workflow.
6. **Audit is an embedded array** — Works for single docs but won't scale to package-level tracking.

---

## 2. Architecture Strategy

### Core Principle: **Package as Optional Wrapper**

```
┌─────────────────────────────────────────┐
│              PACKAGE (new)              │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐  │
│  │  Doc 1  │ │  Doc 2  │ │  Doc 3  │  │
│  └─────────┘ └─────────┘ └─────────┘  │
│  ┌──────────────────────────────────┐  │
│  │     Shared Recipients/Routing    │  │
│  └──────────────────────────────────┘  │
│  ┌──────────────────────────────────┐  │
│  │     Package-Level Audit Trail    │  │
│  └──────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

**Strategy**: Introduce `Package` as an **optional parent entity**. A single-document send creates a package with one document (internally). This means:

- **Zero breaking changes** — existing single-doc API continues to work
- **Unified routing engine** — one engine handles both single and multi-doc
- **Shared audit** — package-level + document-level events coexist
- **Backward compatible** — existing documents in DB remain valid; package_id is nullable

### What to Reuse vs Refactor

| Component | Decision | Reason |
|---|---|---|
| `generate-links` API | **Extend** | Add `send_mode` + `documents[]` fields; existing payloads still work as `basic` mode |
| `EnhancedDocumentService` | **Refactor into 3 services** | Too large (1262 lines). Split into: `PackageService`, `RoutingEngine`, `DocumentService` |
| `Document` model | **Extend** | Add `package_id`, keep all existing fields |
| `Recipient` model | **Extend** | Add `role_type` enum, `action_taken`, `action_at` |
| OTP flow | **Wrap with Session layer** | Keep OTP for initial auth, add session token on top |
| `ActivityLogService` | **Extend** | Add structured event types, package-level logging |
| Frontend `GenerateDocumentWizard` | **Extend** | Add document picker step for packages |
| Frontend `RecipientsRoutingTab` | **Refactor** | New role selector, per-recipient routing_order, mixed mode |

---

## 3. Data Model Design

### New Collections

```
┌──────────────────────────────────────────────────┐
│  docflow_packages (NEW)                          │
├──────────────────────────────────────────────────┤
│  id: str (uuid)                                  │
│  tenant_id: str                                  │
│  name: str                                       │
│  status: PackageStatus                           │
│    → draft | in_progress | completed |           │
│      voided | expired | declined                 │
│  send_mode: "basic" | "package"                  │
│  document_ids: [str]          # ordered          │
│  recipients: [PackageRecipient]                  │
│  routing_config: RoutingConfig                   │
│  output_mode: "combined" | "separate" | "both"   │
│  security_settings: SecuritySettings             │
│  source_context: SourceContext | null             │
│  void_reason: str | null                         │
│  voided_by: str | null                           │
│  voided_at: datetime | null                      │
│  certificate_url: str | null                     │
│  created_by: str                                 │
│  created_at: datetime                            │
│  updated_at: datetime                            │
│  completed_at: datetime | null                   │
│  expires_at: datetime | null                     │
└──────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────┐
│  PackageRecipient (embedded in package)           │
├──────────────────────────────────────────────────┤
│  id: str                                         │
│  name: str                                       │
│  email: str                                      │
│  role_type: RecipientRoleType                    │
│    → SIGN | VIEW_ONLY | APPROVE_REJECT |         │
│      RECEIVE_COPY                                │
│  routing_order: int                              │
│  status: RecipientWorkflowStatus                 │
│    → pending | notified | in_progress |          │
│      completed | declined | skipped              │
│  action_taken: str | null                        │
│    → signed | approved | rejected | reviewed     │
│  action_at: datetime | null                      │
│  reject_reason: str | null                       │
│  assigned_components: {doc_id: [field_ids]}      │
│  public_token: str                               │
│  notified_at: datetime | null                    │
└──────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────┐
│  RoutingConfig (embedded in package)              │
├──────────────────────────────────────────────────┤
│  mode: "sequential" | "parallel" | "mixed"       │
│  on_reject: "void" | "rework" | "draft"          │
│  # Mixed mode: same routing_order = parallel,    │
│  # different routing_order = sequential           │
└──────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────┐
│  SecuritySettings (embedded in package)           │
├──────────────────────────────────────────────────┤
│  require_auth: bool (default true)               │
│  session_timeout_minutes: int (default 15)       │
│  allow_reassign: bool (default false)            │
└──────────────────────────────────────────────────┘
```

### Modified Collections

```
┌──────────────────────────────────────────────────┐
│  docflow_documents (EXTENDED)                     │
├──────────────────────────────────────────────────┤
│  + package_id: str | null      # FK to package   │
│  + package_order: int | null   # position in pkg │
│  ... all existing fields unchanged ...            │
└──────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────┐
│  docflow_sessions (NEW)                           │
├──────────────────────────────────────────────────┤
│  id: str                                         │
│  package_id: str                                 │
│  recipient_id: str                               │
│  recipient_email: str                            │
│  session_token: str (crypto-random)              │
│  authenticated_via: "otp" | "link"               │
│  created_at: datetime                            │
│  last_activity_at: datetime                      │
│  expires_at: datetime                            │
│  is_active: bool                                 │
│  invalidated_reason: str | null                  │
│    → timeout | completed | voided | replaced     │
└──────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────┐
│  docflow_audit_events (NEW — replaces embedded)   │
├──────────────────────────────────────────────────┤
│  id: str                                         │
│  tenant_id: str                                  │
│  package_id: str                                 │
│  document_id: str | null     # null = pkg-level  │
│  recipient_id: str | null                        │
│  event_type: AuditEventType                      │
│    → package_created | document_added |          │
│      recipient_notified | document_viewed |      │
│      signature_applied | approved | rejected |   │
│      reviewed | routing_advanced |               │
│      package_completed | package_voided |        │
│      session_created | session_expired |         │
│      otp_sent | otp_verified                     │
│  actor: str        # email or system             │
│  ip_address: str | null                          │
│  user_agent: str | null                          │
│  metadata: dict    # event-specific data         │
│  timestamp: datetime                             │
└──────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────┐
│  docflow_package_templates (NEW)                  │
├──────────────────────────────────────────────────┤
│  id: str                                         │
│  tenant_id: str                                  │
│  name: str                                       │
│  description: str                                │
│  template_ids: [str]         # ordered list      │
│  default_recipients: [RecipientTemplate]         │
│  default_routing_config: RoutingConfig           │
│  default_output_mode: str                        │
│  default_security_settings: SecuritySettings     │
│  status: "draft" | "active"                      │
│  created_by: str                                 │
│  created_at: datetime                            │
│  updated_at: datetime                            │
└──────────────────────────────────────────────────┘
```

### Entity Relationships

```
PackageTemplate ──1:N──> Template (references)
         │
         │ (used to create)
         ▼
      Package ──1:N──> Document (package_id FK)
         │
         ├── Recipients[] (embedded, shared across docs)
         ├── RoutingConfig (embedded)
         ├── SecuritySettings (embedded)
         │
         │──1:N──> AuditEvent (package_id FK)
         │──1:N──> Session (package_id + recipient_id)
```

---

## 4. Backend Flow Design

### 4.1 Routing Engine (Core)

```python
class RoutingEngine:
    """
    Unified routing for both single-doc and package workflows.
    
    Rule: Same routing_order → parallel, different → sequential.
    Engine processes one "wave" at a time.
    """
    
    async def get_current_wave(self, package) -> list[Recipient]:
        """Return all recipients in the current (lowest pending) routing_order."""
        pending = [r for r in package.recipients if r.status == 'pending']
        if not pending:
            return []
        min_order = min(r.routing_order for r in pending)
        return [r for r in pending if r.routing_order == min_order]
    
    async def advance(self, package_id, completed_recipient_id):
        """
        Called when a recipient completes their action.
        1. Mark recipient as completed
        2. Check if entire wave is done
        3. If yes, notify next wave
        4. If all waves done, complete package
        """
        pass
    
    async def handle_reject(self, package_id, recipient_id, reason):
        """
        Based on routing_config.on_reject:
        - void: void entire package
        - rework: reset to draft, notify sender
        - draft: mark as draft, allow re-send
        """
        pass
```

### 4.2 State Machine

```
PACKAGE STATES:
  draft → in_progress → completed
                      → voided (at any time)
                      → expired (auto)
                      → declined (on reject with void policy)

RECIPIENT STATES:
  pending → notified → in_progress → completed
                                    → declined (APPROVE_REJECT only)
                                    → skipped (if package voided)

TRANSITIONS:
  Package created           → draft
  First wave notified       → in_progress
  All recipients completed  → completed
  Reject + void policy      → declined / voided
  Void by sender            → voided (all recipients → skipped)
  Expiry reached            → expired
```

### 4.3 Role-Based Action Logic

```
SIGN:
  - Can: Fill assigned fields, apply signature/initials
  - Completes when: All assigned fields filled + signature applied
  - Workflow: Advances routing on completion

VIEW_ONLY:
  - Can: View document(s), mark as "reviewed"
  - Completes when: Clicks "Mark as Reviewed"
  - Workflow: Advances routing on completion

APPROVE_REJECT:
  - Can: View document(s), approve or reject with comment
  - Completes when: Clicks "Approve" or "Reject"
  - On Approve: Advances routing
  - On Reject: Triggers on_reject policy (void/rework/draft)

RECEIVE_COPY:
  - Can: Nothing during workflow — passive recipient
  - Triggered: After package completes, receives final output
  - Does NOT block routing (excluded from routing waves)
```

### 4.4 Session Lifecycle

```
1. Recipient clicks access link
2. System checks: Does active session exist?
   YES → Validate expiry → If valid, continue
                          → If expired, require re-auth (OTP)
   NO  → Require OTP
3. OTP verified → Create session:
   - session_token (httpOnly cookie or header)
   - expires_at = now + 15min (configurable)
   - Invalidate any previous sessions for this recipient
4. Every action → Update last_activity_at
5. Session expires → Must re-authenticate
6. Package completes/voided → Invalidate all sessions
```

---

## 5. API Design

### Extended `generate-links` Endpoint

```python
# Backward-compatible extension
POST /api/docflow/documents/generate-links

# BASIC mode (existing — unchanged)
{
    "template_id": "tmpl_abc",           # Single template
    "send_mode": "basic",                # Default, backward compat
    "routing_type": "sequential",
    "delivery_mode": "email",
    "recipients": [...],
    "merge_fields": {...},
    ...existing fields...
}

# PACKAGE mode (new)
{
    "send_mode": "package",
    "package_name": "Q1 Contract Bundle",
    "documents": [
        {
            "template_id": "tmpl_abc",
            "document_name": "NDA",
            "merge_fields": {"Company": "Acme"},
            "order": 1
        },
        {
            "template_id": "tmpl_def",
            "document_name": "Master Agreement",
            "merge_fields": {"Company": "Acme"},
            "order": 2
        }
    ],
    "recipients": [
        {
            "name": "John Doe",
            "email": "john@acme.com",
            "role_type": "SIGN",
            "routing_order": 1,
            "assigned_components": {
                "tmpl_abc": ["sig_field_1"],
                "tmpl_def": ["sig_field_2", "initial_field_1"]
            }
        },
        {
            "name": "Jane Manager",
            "email": "jane@acme.com",
            "role_type": "APPROVE_REJECT",
            "routing_order": 2
        },
        {
            "name": "Legal Archive",
            "email": "legal@acme.com",
            "role_type": "RECEIVE_COPY"
        }
    ],
    "routing_config": {
        "mode": "mixed",
        "on_reject": "void"
    },
    "output_mode": "both",
    "security": {
        "require_auth": true,
        "session_timeout_minutes": 15
    },
    "source_context": {...},
    "expires_at": "2026-04-30T00:00:00Z"
}

# RESPONSE (extended)
{
    "success": true,
    "send_mode": "package",
    "package_id": "pkg_xyz",
    "document_id": null,                 # null for packages
    "documents": [
        {"id": "doc_1", "name": "NDA", "template_id": "tmpl_abc"},
        {"id": "doc_2", "name": "Master Agreement", "template_id": "tmpl_def"}
    ],
    "recipient_links": [...],
    "public_link": "...",
    "status": "in_progress"
}
```

### New Endpoints

```
# Package management
GET    /api/docflow/packages                    # List packages
GET    /api/docflow/packages/{id}               # Package detail + status
POST   /api/docflow/packages/{id}/void          # Void with reason
GET    /api/docflow/packages/{id}/audit          # Full audit trail
GET    /api/docflow/packages/{id}/certificate    # Completion certificate

# Recipient actions (public, session-authenticated)
POST   /api/docflow/packages/{pkg}/recipients/{rid}/approve
POST   /api/docflow/packages/{pkg}/recipients/{rid}/reject
POST   /api/docflow/packages/{pkg}/recipients/{rid}/review

# Session management
POST   /api/docflow/sessions/verify              # OTP → session token
GET    /api/docflow/sessions/validate             # Check session validity
POST   /api/docflow/sessions/invalidate           # Manual logout

# Package templates
POST   /api/docflow/package-templates             # Create package template
GET    /api/docflow/package-templates             # List
GET    /api/docflow/package-templates/{id}        # Detail
PUT    /api/docflow/package-templates/{id}        # Update
```

### Backward Compatibility

```
# OLD call (still works — send_mode defaults to "basic"):
POST /api/docflow/documents/generate-links
{
    "template_id": "tmpl_abc",
    "recipients": [{"name": "John", "email": "john@x.com", "role": "signer"}]
}

# Internally: Creates a package with one document.
# Response shape unchanged for basic mode.
```

---

## 6. UI/UX Impact

### Template Creation

| Change | Detail |
|---|---|
| **New: Package Template Creator** | "Create Package" button alongside "Create Template" on DocFlow dashboard. Multi-step: select templates → configure shared recipients → set routing → set output mode |
| **Updated: RecipientsRoutingTab** | New `role_type` dropdown (SIGN/VIEW_ONLY/APPROVE_REJECT/RECEIVE_COPY). Per-recipient `routing_order` input for mixed mode. On-reject policy selector |
| **Updated: Template Editor** | No changes to individual template editing. Package composition is a separate flow |

### Send Flow (GenerateDocumentWizard)

| Step | Basic Mode | Package Mode |
|---|---|---|
| 1 | Select template | Select package template (or assemble ad-hoc) |
| 2 | Fill merge fields | Fill merge fields per document |
| 3 | Configure recipients | Configure shared recipients with roles |
| 4 | Review & send | Review all docs + recipients + routing |
| 5 | — | Select output mode (combined/separate/both) |

### Recipient Experience (PublicDocumentView)

| Role | UI Changes |
|---|---|
| SIGN | Existing signature flow (no change needed) |
| VIEW_ONLY | Read-only view + "Mark as Reviewed" button |
| APPROVE_REJECT | Read-only view + "Approve" / "Reject" buttons + comment field |
| RECEIVE_COPY | Email with download links after completion (no interactive UI) |
| **Package view** | Document switcher tabs: "NDA (1/3)" "Agreement (2/3)" etc. |

### Security Settings

| Change | Detail |
|---|---|
| **Send dialog** | New "Security" section: session timeout slider, require auth toggle |
| **Public view** | Session indicator in header showing remaining time, re-auth prompt on expiry |

---

## 7. Phased Implementation Plan

### Phase 1 — Package Foundation (MVP) 
**Scope**: Package data model, basic multi-doc generation, package list/detail UI

| Task | Backend/Frontend | Complexity | Dependencies |
|---|---|---|---|
| Create `docflow_packages` collection + Pydantic models | Backend | Medium | None |
| Create `PackageService` (create, get, list) | Backend | Medium | Models |
| Extend `generate-links` with `send_mode: package` | Backend | High | PackageService |
| Basic `PackageTemplate` CRUD API | Backend | Medium | Models |
| Package Template Creator UI (select templates, name, order) | Frontend | High | APIs |
| Package list view on DocFlow dashboard | Frontend | Medium | APIs |
| Package detail view (documents, status, recipients) | Frontend | Medium | APIs |
| Update `GenerateDocumentWizard` for package mode | Frontend | High | APIs |

**Risks**:
- PDF generation for multiple documents must handle failures gracefully (partial generation)
- Merge field resolution across multiple templates with different CRM mappings

**Test criteria**: Create a package template with 2 docs → generate → receive 2 separate PDFs → recipients get links

---

### Phase 2 — Roles + Routing Engine
**Scope**: Full role-type support, mixed routing, reject handling

| Task | Backend/Frontend | Complexity | Dependencies |
|---|---|---|---|
| Implement `RoutingEngine` service (wave-based) | Backend | High | Phase 1 |
| Implement `RecipientRoleType` enum + role-based action handlers | Backend | Medium | Phase 1 |
| `approve` / `reject` / `review` endpoints | Backend | Medium | RoutingEngine |
| On-reject policies (void/rework/draft) | Backend | High | RoutingEngine |
| Update `RecipientsRoutingTab` with role_type selector + mixed routing | Frontend | Medium | APIs |
| Update `PublicDocumentViewEnhanced` for VIEW_ONLY and APPROVE_REJECT roles | Frontend | High | APIs |
| Recipient status tracking in package detail UI | Frontend | Medium | APIs |

**Risks**:
- Reject → rework flow is complex (which recipients get reset? which documents?)
- Race conditions in parallel routing waves (two recipients completing simultaneously)

**Dependencies**: Phase 1 complete

**Test criteria**: 3-recipient mixed routing (signer order 1, approver order 2, CC) → signer signs → approver approves → CC gets copy

---

### Phase 3 — Audit + Output
**Scope**: Structured audit trail, combined PDF output, completion certificate

| Task | Backend/Frontend | Complexity | Dependencies |
|---|---|---|---|
| Create `docflow_audit_events` collection + service | Backend | Medium | Phase 1 |
| Instrument all actions with structured audit events | Backend | Medium | Audit service |
| Migrate existing `audit_trail[]` reads to new collection | Backend | Low | Audit service |
| Combined PDF generation (merge multiple docs into one) | Backend | High | pdf-lib/PyMuPDF |
| Completion certificate generation | Backend | Medium | PDF service |
| Output mode selector in send flow | Frontend | Low | APIs |
| Audit trail viewer in package detail | Frontend | Medium | APIs |
| Certificate download button | Frontend | Low | APIs |

**Risks**:
- Combined PDF with signatures from different documents requires careful page merging
- Certificate layout/content needs business sign-off

**Dependencies**: Phase 2 recommended but not required (audit can parallel Phase 2)

**Test criteria**: Complete a package → view structured audit trail → download combined PDF → download certificate

---

### Phase 4 — Security (Session + Void)
**Scope**: Session management, void/cancel, security hardening

| Task | Backend/Frontend | Complexity | Dependencies |
|---|---|---|---|
| Create `docflow_sessions` collection + service | Backend | Medium | Phase 1 |
| Session creation after OTP verification | Backend | Medium | Existing OTP |
| Session validation middleware | Backend | Medium | Session service |
| Session timeout + re-auth flow | Backend | Medium | Session service |
| Single active session enforcement | Backend | Low | Session service |
| Void/cancel endpoint with reason | Backend | Medium | Phase 1 |
| Void → invalidate sessions + notify recipients + stop routing | Backend | High | Session + Routing |
| Session indicator in public document view | Frontend | Low | APIs |
| Re-auth prompt UI on session expiry | Frontend | Medium | APIs |
| Void button + confirmation dialog in package detail | Frontend | Low | APIs |
| Session audit events | Backend | Low | Audit service |

**Risks**:
- Session storage strategy (DB vs Redis) — DB is simpler but slower for high-frequency validation
- Void during active signing (recipient is mid-signature when void happens)

**Dependencies**: Phase 1 (minimum), Phase 2 (for full routing integration)

**Test criteria**: Sign in with OTP → get session → wait for timeout → re-auth required → void package → links invalidated

---

## 8. Risk & Complexity Analysis

### Major Technical Risks

| Risk | Impact | Mitigation |
|---|---|---|
| **Partial package generation failure** | One doc fails, others succeed — inconsistent state | Implement transaction-like pattern: generate all docs first, only create package if all succeed. Rollback on failure. |
| **Routing race conditions** | Two parallel recipients complete at exact same time | Use MongoDB `findOneAndUpdate` with atomic status transitions. RoutingEngine must be idempotent. |
| **PDF merge complexity** | Combined PDF with overlaid signatures from different source docs | Use PyMuPDF for reliable page merging. Test with varied page sizes and orientations. |
| **Session vs OTP migration** | Breaking existing public document access during transition | Keep OTP as the auth mechanism. Session is a layer ON TOP — not a replacement. Old OTP-only links continue to work. |
| **Package template versioning** | Package references template IDs, but templates have versions | Package template stores `template_group_id` (stable) not `template_id` (version-specific). At generation time, resolve to latest active version. |

### Where to Avoid Over-Engineering

1. **Don't build a generic workflow engine** — The routing engine handles document signing workflows specifically. Don't abstract it into a general-purpose state machine.
2. **Don't build real-time collaboration** — Recipients work independently. No need for WebSocket-based live updates between recipients.
3. **Don't build custom PDF rendering** — Use existing PyMuPDF/pdf-lib for merging. Don't build a PDF renderer.
4. **Session storage** — Start with MongoDB. Move to Redis only if session validation becomes a measurable bottleneck (unlikely before 10K+ concurrent sessions).
5. **Certificate design** — Start with a simple PDF table (events + timestamps + signatures). Don't build a fancy certificate designer.

### Simplification Recommendations

1. **Phase 1 can ship without mixed routing** — Start with sequential-only packages. Add parallel/mixed in Phase 2.
2. **RECEIVE_COPY doesn't need a UI** — Just email the final PDF. No need for a portal experience.
3. **Rework policy can be Phase 3** — Start with void-only on reject. Rework adds significant complexity.
4. **Combined PDF can be Phase 3** — Separate PDFs work for MVP. Combined is an enhancement.

---

## 9. File Organization (Proposed)

```
backend/modules/docflow/
├── api/
│   ├── template_routes.py          # existing
│   ├── document_routes_enhanced.py # existing  
│   ├── generate_links_routes.py    # extend for package mode
│   ├── package_routes.py           # NEW: package CRUD + void
│   ├── package_template_routes.py  # NEW: package template CRUD
│   ├── session_routes.py           # NEW: session management
│   └── audit_routes.py             # NEW: audit trail queries
├── models/
│   ├── template_model.py           # existing
│   ├── document_model.py           # extend with package_id
│   ├── package_model.py            # NEW
│   ├── session_model.py            # NEW
│   └── audit_model.py              # NEW
├── services/
│   ├── package_service.py          # NEW: package lifecycle
│   ├── routing_engine.py           # NEW: wave-based routing
│   ├── session_service.py          # NEW: session management
│   ├── audit_service.py            # NEW: structured audit events
│   ├── certificate_service.py      # NEW: completion certificates
│   ├── document_service_enhanced.py # existing (refactored)
│   ├── pdf_generation_service.py   # existing
│   └── ...existing services...
```

---

## 10. Summary & Recommendation

This plan evolves DocFlow from a single-document signing tool into a multi-document package workflow system comparable to DocuSign/Adobe Sign, while keeping the existing system fully operational.

**Key design decisions:**
- Package is an optional wrapper (not a forced migration)
- Routing engine is wave-based (same order = parallel, different = sequential)
- Sessions layer on top of existing OTP (no breaking changes)
- Audit moves from embedded arrays to a dedicated collection

**Recommended starting point:** Phase 1 (Package Foundation) — it delivers immediate value (multi-doc sending) and establishes the data model that all other phases build on.

**Estimated effort per phase:**
- Phase 1: 2-3 weeks (largest, foundational)
- Phase 2: 1.5-2 weeks
- Phase 3: 1-1.5 weeks (can parallel with Phase 2)
- Phase 4: 1-1.5 weeks
