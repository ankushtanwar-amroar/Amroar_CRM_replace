# DocFlow PRD — Product Requirements Document

## Architecture
- **Frontend**: React SPA, Tailwind CSS, Shadcn UI
- **Backend**: FastAPI (Python) with MongoDB
- **Auth**: JWT (admin), API Key (public API), OTP (recipients)

### Phase 1–4: Core DocFlow, Routing, Audit, Security
### Phase 5: Polish & Bug Fixes (Apr 7)
### Phase 6: Critical P0 Fixes (Apr 8)
### Phase 7: Field-Level Assignment for Signers (Apr 8)
### Phase 8: Create Package Enhancements (Apr 8)
### Phase 9: Package Signing Flow Fix (Apr 8)
### Phase 10: Access Control & Module Visibility Fix (Apr 9)
### Phase 11: DocFlow-Only Tenant Experience Refinement (Apr 9)
### Phase 12: Admin Panel — Create Tenant Flow (Apr 9)

### Phase 13: Company Information — Global Setup Section (Apr 9)
- **Backend**: `GET /api/runtime/company-info` endpoint — returns organization details, admin info, and plan data
- **Frontend Page**: `/setup/company-info` — 3-card layout (Organization Details, Admin Information, Plan Information)
- **Sidebar**: "Company Information" link placed above "Access & Security" as a global settings item
- **Visibility**: Available for ALL tenants (DocFlow-only, CRM, hybrid) — not controlled by any module
- **Data**: Company Name, Industry, Created Date, Admin Name/Email, Plan Name/Type/Status
- **Future-Ready**: Structured for Edit Company Info, Upload Logo, Billing management

### Phase 14: Company Information UI Redesign (Apr 9)
- **Layout**: 2-column grid for Organization + Admin cards, full-width Plan card below
- **Card Design**: Modern rounded-2xl cards with gradient icon accents, hover shadow effects
- **Typography**: Uppercase tracking-wide labels, semibold values, proper visual hierarchy
- **Plan Card**: 3-column layout with plan badge, type, and status with color-coded indicators
- **Responsive**: Single column on mobile, 2-column on desktop
- **Status**: Green for Active, amber for Inactive with dot indicators

### Phase 15: Company Information Navigation Fix (Apr 9)
- **Routing**: Moved from standalone `/setup/company-info` route to inline rendering within `SetupPage` at `/setup/company-information`
- **Layout**: Now renders inside SetupPage's content area — sidebar stays visible, only center content updates
- **Sidebar**: Company Information link highlighted with indigo active state, searchable
- **SPA**: Pure client-side navigation, no page reload or layout flicker
- **Consistency**: Matches behavior of DocFlow Workspace, Features, and other Setup sections

### Phase 17: Tenant Creation SaaS Architecture Refactor (Apr 9)
- **Architecture Restored**: Plan -> License -> Modules hierarchy enforced
- **Backend `create_tenant()`**: Modules derived from plan's `enabled_modules` only. No `admin_password` or `module_entitlements` accepted
- **No Password Stored**: Admin user created with `is_active=False`, `password='!VERIFICATION_PENDING'`. Must verify via email link
- **Verification Email**: Always sent to tenant admin with 72-hour reset token. Response includes `verification_email_sent` flag
- **DocFlow Only Plan**: New plan (`docflow_only`) added with `enabled_modules: ['docflow', 'connections']` and `DOCFLOW_SEAT` license
- **Frontend**: CreateTenantPage rewritten — Plan selector dropdown, no password field, no module checkboxes
- **Success Screen**: Shows "Verification email sent" instead of credentials. No password displayed
- **Module Entitlements**: Remain functional as secondary override layer post-creation (unchanged)

### Phase 16: ClueBot Configuration — Global Setup Section (Apr 9)
- **Backward Compatibility**: Existing tenants with explicit `module_entitlements` continue to work via runtime override logic

### Phase 18: License Visibility, Standalone DocFlow & Dynamic Branding (Apr 9)
- **License Information Card**: Added 4th card to Company Information page showing license_name, module_key, assignment_type, seats, and status
- **Backend**: `/api/runtime/company-info` now returns `licenses` array by joining `tenant_licenses` with `license_catalog`
- **DOCFLOW_SEAT Standalone**: Removed CRM_CORE_SEAT dependency from DOCFLOW_SEAT in license_catalog — works independently
- **Dynamic Branding**: DocFlow-only tenants see "Cluvik DocFlow" header + "Document workflow & signing platform" subtitle; CRM tenants see "Setup" + "Configure your CRM"
- **Plan -> License Mapping**: DocFlow Only plan (`docflow_only`) provisions DOCFLOW_SEAT license deterministically

### Phase 19: DocFlow-Only UX Refinements & License Fix (Apr 9)
- **CRM_CORE_SEAT Fix**: License provisioning now checks plan's `enabled_modules` — only adds CRM_CORE_SEAT when plan includes CRM module. DocFlow-only plans get only DOCFLOW_SEAT
- **User Status Fix**: Added server-side `account_status` computation (active/pending_invite/pending_verification/frozen) — replaces unreliable `password_hash` check
- **UserDetailPage Tabs**: DocFlow-only tenants see only Overview + Licenses tabs; CRM tenants see all 6 tabs
- **Invite User Modal**: Role field hidden for DocFlow-only tenants — simplified invite flow
- **UserResponse Model**: Added `account_status` field to Pydantic model

### Phase 20: Invited User Access & License Auto-Assignment (Apr 9)
- **Root Cause**: Invited users had no `user_licenses` records -> module resolution returned `LICENSE_REQUIRED` -> all modules inaccessible
- **Fix — Invite Flow**: `POST /api/users/invite` now iterates tenant_licenses and auto-assigns user-level licenses with seat limit enforcement
- **Fix — Accept Invite**: `POST /api/auth/accept-invite` includes license assignment safety net
- **Fix — Password Reset**: `POST /api/auth/reset-password` includes license assignment safety net (for new tenant admins)
- **Seat Limits**: All auto-assignment checks `assigned_count < seats_purchased` before creating user_license record
- **Forgot Password**: Fixed to allow inactive users who haven't set a password yet (new tenant admins)
- **Shared Workspace**: Confirmed DocFlow queries use `tenant_id` — all tenant users share templates/documents/packages

### Phase 21: CluBot Control Center — DocFlow AI & Automation (Apr 10)
- **Backend**: Expanded `GET/PUT /api/runtime/cluebot-config` to support full structured config (general, connections, knowledge, tools, permissions, logs)
- **Backend**: Added `POST /api/runtime/cluebot-config/log` for action log appending (capped at 200 entries)
- **Backend**: `_default_cluebot_config()` provides DocFlow-scoped defaults — CluBot disabled by default, retrieval-only connections, safety controls on
- **Backend**: Backward compatible — merges old flat format (enabled, intent, knowledge_base) into new structured format
- **Frontend**: Rewrote `ClueBotConfigPage.jsx` as 6-tab Control Center using Shadcn Tabs:
  - **Tab 1 (General)**: Enable/disable toggle, intent textarea, personality/tone textarea
  - **Tab 2 (Connections)**: References existing connections from `/api/connections`, retrieval-only mode toggle, connection selection switches
  - **Tab 3 (Permissions & Safety)**: Per-entity permissions (documents, templates, packages, signing_actions) with granular read/create/update/execute toggles. Safety controls: require confirmation, preview before execution, block direct DB mutations
  - **Tab 4 (Company Knowledge)**: Text-based knowledge entries (title + content), file upload marked "Coming Soon"
  - **Tab 5 (Tools & External Access)**: 5 internal DocFlow tools (search templates/documents/packages, generate summary, draft email), external API access toggle
  - **Tab 6 (Logs, Memory & Evals)**: Action logging toggle, retention days config, session memory toggle, recent action logs viewer
- **Sidebar**: Renamed from "ClueBot Configuration" to "AI & Automation"
- **Scope**: DocFlow-only for MVP; CRM expansion planned for future phase
- **DB Schema**: Single `cluebot_config` document per tenant with nested sections
- **Testing**: 100% pass rate (7/7 backend, all frontend UI elements verified) — iteration_279

### Phase 22: CluBot Runtime Enforcement Layer (Apr 10)
- **ClueBotPolicyEnforcer** (`/app/backend/modules/docflow/services/cluebot_policy_enforcer.py`): New service that enforces CluBot config at runtime
  - `load_config()`: Reads tenant config directly from MongoDB (no cache for correctness)
  - `is_enabled()`: Gates all CluBot actions on enabled/disabled state
  - `check_permission()`: Validates action against entity-level permissions (documents/templates/packages/signing_actions with read/create/update/execute)
  - `check_safety()`: Returns safety controls (require_confirmation, preview_before_execution, block_direct_db_mutations) for write actions
  - `get_llm_context()`: Extracts intent, personality, and knowledge base entries from config for LLM prompt enrichment
  - `log_action()`: Appends action entries to audit trail (capped at 200)
- **Routes Rewritten** (`cluebot_routes.py`): All 3 CluBot endpoints (chat, email, validate) now:
  - Check if CluBot is enabled (403 if disabled)
  - Validate entity permissions (BLOCKED response if denied)
  - Surface safety controls to frontend for write actions
  - Log write actions to audit trail
  - Inject tenant context (intent, personality, knowledge) into LLM prompts
- **New Endpoint**: `GET /api/docflow/cluebot/policy-status` — returns current enforcement state for frontend
- **CluBotService Updated**: `chat()`, `generate_email()`, `validate_template_ai()` accept `policy_context` dict for prompt enrichment
- **Action→Entity Mapping**: ADD_FIELD/RENAME_FIELD/MOVE_FIELD/DELETE_FIELD/EDIT_CONTENT → templates.update, EMAIL → documents.read, VALIDATE → templates.read, ANSWER → no entity check
- **Testing**: 100% pass rate (11/11 backend enforcement tests, all frontend verified) — iteration_280

### Phase 23: CluBot Frontend Policy Wiring & Safety UX (Apr 10)
- **Policy Status API**: Added `cluebotPolicyStatus()` to `docflowService.js` — calls `GET /api/docflow/cluebot/policy-status`
- **ClueBotPanel.js** (full rewrite):
  - Fetches policy status on open; shows loading spinner while checking
  - **Disabled state**: Shows "CluBot is Disabled" with guidance to enable in Setup → AI & Automation
  - **Enabled state**: Shows welcome message + chat interface
  - **Policy-blocked actions**: Shows "Blocked by Policy" badge with admin guidance
  - **Confirmation dialog**: For write actions when `safety.require_confirmation=true`, shows Apply/Cancel bar — action is NOT applied until user confirms
  - **Preview info**: When `safety.preview_before_execution=true`, shows "Review Required" badge with safety details
- **TemplateEditor.js**:
  - Fetches policy status on mount via `cluebotPolicyStatus()`
  - CluBot button conditionally rendered: hidden when disabled, shown when enabled
- **ValidationPanel.js**:
  - Fetches policy status on mount
  - CluBot Validation card: active with button when enabled, greyed out with "AI validation is unavailable" when disabled
- **Testing**: 100% pass rate (10/10 backend, all frontend flows verified) — iteration_281

### Phase 24: Connections Inline Routing Fix (Apr 10)
- Moved `/setup/connections` from standalone route to inline rendering within SetupPage content area
- Sidebar stays visible when navigating to Connections, matching Company Info and AI & Automation behavior

### Phase 25: Connections Module — Enterprise-Grade Upgrade (Apr 10)
- **Sub-Navigation**: 3 tabs inside Connections — Connections (main), Categories (read-only), Providers (read-only)
- **Connection Cards Redesign**: Provider icon + name, connection name, category badge, status badge, test status, default badge, last tested timestamp, 3-dot menu (Edit, Duplicate, Test Now, Set as Default, Activate/Deactivate, Delete)
- **2-Step Wizard**: Step 1 — Category filter + provider grid with search. Step 2 — Schema-driven dynamic form (text, password, select, toggle, url, textarea), default toggle, test button
- **Connection Detail Side Panel**: Summary, Authentication (masked), Provider info, Test History
- **Categories Tab**: Read-only grid of 6 system categories with counts
- **Providers Tab**: Read-only grid of 10 providers with category badge, field count, doc links
- **Backend**: Added `POST /api/connections/{id}/duplicate`, `GET /api/connections/{id}/logs`
- **Testing**: 100% pass rate (14/14 backend, all frontend verified) — iteration_282

### Phase 26: OAuth Token Lifecycle Management (Apr 10)
- **OAuthTokenManager** (`/app/backend/modules/integrations/services/oauth_token_manager.py`):
  - Provider-agnostic OAuth 2.0 token lifecycle management (Salesforce, Google, Microsoft, etc.)
  - `get_valid_credentials()`: Checks token expiry (with 5-minute buffer), auto-refreshes if needed
  - `handle_auth_failure()`: Called on 401/403, attempts one refresh before marking connection invalid
  - `_refresh_token()`: Calls provider's token endpoint with `grant_type=refresh_token`, stores new tokens
  - `_mark_invalid()`: Sets connection status to "invalid", logs failure to validation_logs
  - `_get_token_url()`: Resolves token endpoint from credentials (Salesforce production/sandbox/custom domain, Google, Microsoft)
- **OAuth Initiate Updated**: Now includes `scope=api refresh_token full` and `prompt=login consent` to guarantee refresh token from Salesforce
- **OAuth Callback Updated**: Stores `token_expires_at` (calculated from `expires_in` using timedelta)
- **Test Connection Updated**: Uses OAuthTokenManager for credential retrieval, retries with refreshed credentials on 401/403
- **RuntimeGatewayService Updated**: `get_connection_credentials()` uses OAuthTokenManager for auto-refresh
- **Non-OAuth Unaffected**: API key connections (SendGrid, OpenAI, etc.) pass through without any refresh attempt
- **Security**: Tokens stored encrypted, never exposed in API responses, logged only at connection-id level
- **Testing**: 100% pass rate (18/18 tests) — iteration_283

### Phase 27: DocFlow-Specific Customization (Apr 13)
- **DocFlow Email Template**: New `_send_docflow_welcome()` method with "Welcome to Cluvic Docuflow!" branding, DocFlow-specific feature list (templates, documents, e-signatures, integrations), blue gradient header, set-password CTA
- **Template Selection**: `send_tenant_admin_welcome()` accepts `is_docflow` flag; `create_tenant()` computes `is_docflow_tenant` from module_entitlements ('docflow' present AND 'crm' absent)
- **CRM Preserved**: Original CRM welcome email unchanged; fallback to CRM template when `is_docflow=False`
- **License & Plans**: DocFlow-only users see "Coming Soon" card with crown icon instead of CRM plan cards; `isDocFlowOnly` detection via `getModuleState('crm') === MODULE_STATES.ADMIN_DISABLED`
- **No CRM Regression**: CRM users continue seeing full plan cards and receiving CRM welcome emails
- **Testing**: 100% pass rate (21/21 tests) — iteration_284

## Key API Endpoints
- `GET /api/runtime/company-info` — Organization, admin, plan info for Company Information page
- `GET /api/runtime/cluebot-config` — Full CluBot Control Center config (6 sections)
- `PUT /api/runtime/cluebot-config` — Update CluBot config (admin-only)
- `POST /api/runtime/cluebot-config/log` — Append action log entry
- `POST /api/admin/tenants` — Create tenant with admin user, custom modules, admin-set password
- `GET /api/runtime/modules/states` — Module states (source of truth for frontend)
- `POST /api/auth/login` — Login (auto-detects DocFlow-only landing page)
- `POST /api/connections/{id}/duplicate` — Duplicate a connection
- `GET /api/connections/{id}/logs` — Connection validation/test logs
- All DocFlow endpoints (packages, templates, signing, etc.)

### Phase 28: DocFlow vs CRM Separation (Apr 13)
- **Invitation Email**: DocFlow-only tenants (`module_entitlements` has "docflow" but not "crm") receive DocFlow-branded invitation email with "DocFlow Team" sender, "DocFlow workspace" wording. CRM tenants receive existing CRM template unchanged.
- **Connection Tab**: Uses `ModuleContext` to detect DocFlow-only tenants. Internal CRM card and "CRM Object" dropdown hidden for DocFlow-only users. Heading changes from "CRM Provider" to "Integration Provider". Auto-switches to Salesforce view.
- **No Regression**: CRM tenants continue seeing Internal CRM, Salesforce, and CRM Object as before.
- **Files Modified**: `email_service.py` (DocFlow invite template), `users_routes.py` (is_docflow detection), `ConnectionTab.js` (ModuleContext integration, conditional rendering)

### Phase 29: Invite Role Default + Sidebar Visibility + OAuth Fix (Apr 13)
- **Default Role**: Invited users without explicit role_id now default to `standard_user` instead of `None`. Bulk-fixed 25 existing users.
- **Sidebar Visibility**: Fixed `isAdminRole` to check `user.role_id` (was checking non-existent `user.role`). Made "Users" and "License & Plans" always visible for all authenticated users in the sidebar.
- **Salesforce OAuth**: Fixed `invalid_scope` error by removing unsupported `full` scope — now sends `api refresh_token` only. Added user-friendly error messages for `invalid_scope`, `redirect_uri_mismatch`, and `access_denied`. Added logging for OAuth initiation and token exchange.
- **Multi-Org Ready**: Dynamic login URL per environment (production/sandbox/custom domain), stores per-connection `instance_url`/`refresh_token`, auto-refresh via `OAuthTokenManager`.
- **Files Modified**: `users_routes.py`, `SetupPage.jsx`, `connection_routes.py`

## Remaining Tasks

### P1
- Secure `/admin/setup` endpoint
- Background worker for ProvisioningJobsService queue

### P2
- Email reminders for pending recipients
- OTP caching / rate limiting
- Edit Company Info + Upload Logo

### P3
- Consolidate document_service.py vs document_service_enhanced.py
- Redis caching, rich-text toolbar, Stripe Customer Portal
- CRM-wide CluBot expansion (separate CRM Control Center)
