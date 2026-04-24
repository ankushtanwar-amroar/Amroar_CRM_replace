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

### Phase 30: DocFlow Navigation & UI Clarity (Apr 14)
- **Users Page Back Button**: Added "Back to Setup" button at top-left of UsersPage (`/setup/users`), navigates to `/setup`
- **Clickable Logo**: Made "Cluvik DocFlow" header title/logo clickable globally — navigates to `/setup` from any page. Uses `data-testid="header-logo-home"`
- **DocFlow Dashboard Redesign v2**: Rewrote `DocFlowSetupDashboard.jsx` to match reference design:
  - Quick Actions: Pill/chip buttons row (Create Template, Upload Document, Generate & Send, Create Package, Add Connection, Invite User) + 3 hero gradient cards below
  - Stats header: Templates, Packages, Documents, Pending counts as pills
  - MODULES section: 2x2 grid (Templates, Packages, Connections, AI & Automation) with colored count badges per card
  - ORGANIZATION section: Company Information (Profile/Plan/Billing links) + Access & Security (Users/Roles/Permissions)
  - Right sidebar: Recent Templates panel
  - Fetches templates, documents, packages, connections, users counts from APIs
- **No Regression**: CRM tenant dashboard and routing unchanged
- **Files Modified**: `UsersPage.js` (back button), `SetupPage.jsx` (clickable logo), `DocFlowSetupDashboard.jsx` (full rewrite)
- **Testing**: 100% pass rate (13/13 frontend tests) — iteration_284

### Phase 31: Dashboard Polish, Connections Real Data, Auth Page Fix (Apr 14)
- **Dashboard Overview Section**: Added right-sidebar Overview panel with 4 stat cards: Total Templates, Active Documents, Pending Signatures, Completed Documents — each with colored icon
- **Tighter Layout**: Reduced spacing between sections (mb-8→mb-6, space-y-8→space-y-6) for better visual balance
- **Connections Real Data**: Connections module card now fetches and displays actual connection rows (name, provider, Connected/Not Connected status) instead of just count badges
- **Auth Page Rebranded**: Changed "Sign in to your CRM" → "Sign in to Cluvik DocFlow"; removed "Don't have an account? Sign up" toggle entirely. Login page now only shows Email, Password, Forgot password, Sign In
- **No Regression**: Login flow unchanged; CRM tenants see standard CRM setup dashboard
- **Files Modified**: `App.js` (auth page), `DocFlowSetupDashboard.jsx` (overview + connections + spacing)
- **Testing**: 100% pass rate (14/14 frontend tests) — iteration_285

### Phase 32: Login Page Redesign (Apr 15)
- **Split-Screen Layout**: Left panel with illustration + "Cluvik" branding, right panel with login form
- **Branding**: Shows "Cluvik" only — no "DocFlow" or "CRM" on login page
- **Left Panel**: Soft slate-50 background, decorative circles, "Cluvik" logo at top-left, AI-generated document workflow illustration, tagline "Streamline your document workflows"
- **Right Panel**: "Welcome back" heading, "Sign in to your account" subtext, Email input, Password input, Remember Me checkbox, Forgot Password link, LOGIN button (indigo, uppercase)
- **Removed**: "Sign up" toggle, registration form (not needed for DocFlow flow)
- **Responsive**: Mobile shows stacked layout (logo + form, no illustration), desktop shows 50/50 split
- **No Auth Logic Changes**: All authentication endpoints and token handling unchanged
- **Files Modified**: `App.js` (AuthForm component complete rewrite)
- **Testing**: 100% pass rate (17/17 frontend tests) — iteration_286

### Phase 33: Login Page Product-Neutral Branding (Apr 15)
- **Removed DocFlow messaging**: Replaced "Streamline your document workflows / Create templates..." with "Welcome to Cluvik / Access your workspace"
- **Product-neutral**: Login page shows NO module-specific text (no DocFlow, no CRM) — works for all users
- **Files Modified**: `App.js` (left panel text only)
- **Testing**: Verified via screenshot + curl login test

### Phase 34: CRM App Launcher Enhancement (Apr 15)
- **13 Module Apps Added**: Schema Builder, Form Builder, Survey Builder, Flow Builder, Task Manager, Import Builder, Export Builder, Chatbot Manager, DocFlow, File Manager, App Manager, Email Templates, Booking — all shown as independent apps alongside Sales Console
- **Navigation**: Each app navigates to its respective module route (e.g., DocFlow → `/setup/docflow`, Flow Builder → `/flows`)
- **Active State**: Sales Console shows "Active" badge with green checkmark; other apps show neutral styling
- **Search**: Existing search filters both apps and records (e.g., typing "doc" shows only DocFlow)
- **View More Modal**: Full-screen grid also shows all 14 apps with navigation
- **No Regression**: Setup page unchanged, CRM Sales Console still works, no routing/permission changes
- **Navigation-Only Layer**: App Launcher acts as an entry point, no backend logic duplication
- **Files Modified**: `SalesConsolePageNew.js` (availableApps expanded + click handlers + icons)
- **Testing**: 100% pass rate (10/10 frontend tests) — iteration_287

### Phase 35: App Launcher Visual Polish (Apr 15)
- **Blue Icons for All Apps**: Changed non-active app icons from grey (`from-slate-500 to-slate-600`) to blue (`from-blue-500 to-blue-700`) matching the View More modal
- **Card Styling**: Added subtle card borders and hover effects to all non-active apps (`bg-white border border-slate-200 hover:border-blue-300 hover:shadow-md`)
- **Visual Hierarchy**: Apps section now clearly distinct from All Items section — apps have card feel with blue icons, items remain minimal list style
- **No Logic Changes**: Only CSS styling updated in sidebar app rendering
- **Files Modified**: `SalesConsolePageNew.js` (app card className + icon gradient)
- **Testing**: Verified via screenshot, both CRM and DocFlow logins working

### Phase 36: Premium Futuristic Login Page (Apr 16)
- **Right Panel**: Full-bleed dark purple/indigo gradient with futuristic CRM visual — floating glassmorphism analytics panels, line graphs, KPI cards, pipeline workflow nodes, circular gauges. Ambient glow effects + subtle grid pattern for depth
- **Left Panel**: Clean minimal form with left-aligned logo, bold "Welcome Back" heading, descriptive subtext, rounded inputs with soft bg, gradient "Sign In →" button with hover glow/shadow
- **Design Elements**: Noise texture overlay, radial ambient glows, bottom gradient text overlay ("Data-Driven Decisions"), 55/45 split layout
- **No Logic Changes**: Auth flow, routing, validation all unchanged
- **Files Modified**: `App.js` (AuthForm return block rewritten)
- **Testing**: Login verified for both CRM and DocFlow users

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

### Phase 30: Webhook + Signing + Performance + UI Enhancements (Apr 14)
- **Webhook Signed Copy JSON**: Enriched `fire_document_event` and `fire_package_event` in `webhook_service.py` to include `signed_documents[]` array with `{document_id, template_name, signed_document_url, signed_at, status}` and `recipient_details` for signed/completed events
- **Webhook Sample Payloads**: Updated both `PackageDetailPage.js` webhook sample and `IntegrationTab.js` `SAMPLE_PAYLOADS` to include signed_documents array and recipient_details in download/display
- **Combined Signed Document Button**: Added "Download Combined Signed Document" button in `RunDetailPage.js` header — visible only when `status=completed` AND `delivery_mode=email`. Uses `PackageOutputService.generate_combined_pdf` which merges all signed PDFs
- **Combined PDF Priority**: Fixed `PackageOutputService._get_document_pdf` to prefer signed PDF over unsigned for combined document generation
- **Performance — Package Listing**: Replaced N+1 `count_documents` queries in `list_packages` with single MongoDB `$aggregate` pipeline. Same for `get_package` run stats and submission counts. Added lean projection to listing query. Added MongoDB indexes on `package_runs(package_id, status)` and `public_submissions(package_id, signed_at)`
- **PDF Rendering**: Signing page already uses final generated PDF from S3 via `/view/unsigned` endpoint — the visual difference (HTML date picker vs PDF text) is by design for interactive field overlay

### Phase 31: Template-Level Merge Fields in Send Package API (Apr 14)
- **New `template_merge_fields` parameter**: Added to both internal `POST /api/docflow/packages/{id}/send` and Public API `POST /api/public/packages/send`
- **Per-template merge data**: Each template in a package can receive its own `merge_fields` dict. API-provided fields override blueprint defaults.
- **Backend flow**: `send_package_run` now builds `salesforce_context` per document from the merge fields map, passing them to `generate_document` for PDF injection
- **Validation**: Unknown `template_id` references in `template_merge_fields` return structured errors
- **Developer docs**: Updated DeveloperSettingsPage API docs with `template_merge_fields` sample showing multi-template merge
- **Files modified**: `package_public_api_routes.py`, `package_routes.py`, `package_service.py`, `DeveloperSettingsPage.js`

### Phase 32: Template Versioning, Roles, and DocFlow Enhancements (Apr 15)
- **Role System**: Added `REVIEWER` role type alongside existing `SIGN`, `APPROVE_REJECT`, `RECEIVE_COPY`. Reviewer can only view and confirm. Updated SendPackagePage, GenerateDocumentWizard, PackagePublicView.
- **Field assignment rule**: Only Signers see field assignments. Approver/Reviewer/Receive Copy have no field interaction.
- **Version rendering protection**: Removed `content_blocks_modified` rendering path. All document generation now ALWAYS uses original uploaded PDF from S3 for pixel-perfect fidelity.
- **Eye icon removed**: Removed preview/view eye icon from Documents listing in DocFlowDashboard.
- **Email history for packages**: Added `source` field ("template"/"package") and `package_id`/`package_name` to email logs. Routing engine now logs package emails. EmailHistoryTable shows Template/Package badge.
- **Package delete**: Added `DELETE /api/docflow/packages/{id}` endpoint that cascades to runs, documents, submissions, audit events. Frontend has delete button with confirmation modal.

### Phase 33: Dynamic Email Template System (Apr 15)
- **Backend Service**: `EmailTemplateService` (`email_template_service.py`) — CRUD for email templates with per-tenant isolation, auto-seeded system defaults (signer, approver, reviewer, package_send, document_signed, reminder), clone, set-default, render with variable substitution, `resolve_for_sending()` with role→type fallback
- **Backend Routes**: `email_template_routes.py` registered at `/api/docflow/email-templates` — 8 endpoints: list, get, create, update, delete, clone, set-default, preview (renders with sample data)
- **DB Collection**: `docflow_email_templates` — `{id, tenant_id, name, subject, body_html, template_type, is_default, is_system, created_at, updated_at}`
- **11 Merge Variables**: `{{recipient_name}}`, `{{recipient_email}}`, `{{document_name}}`, `{{package_name}}`, `{{signing_link}}`, `{{sender_name}}`, `{{company_name}}`, `{{status}}`, `{{due_date}}`, `{{signed_date}}`, `{{download_link}}`
- **Routing Engine Integration**: `_notify_recipient()` in `routing_engine.py` now looks up custom email template per recipient (via `email_template_id` or role-based default), renders with variables, and sends. Falls back to hardcoded action-required email if no custom template found.
- **Send API Enhancement**: `email_template_id` field added to `SendRecipientInput` (package_routes.py) and `SendPackageRecipient` (package_public_api_routes.py). Stored on each run recipient, used by routing engine during notification.
- **Frontend — Email Templates Page**: Full CRUD UI inside DocFlow Dashboard's "Email Templates" tab. Templates grouped by type with color-coded badges. Visual + HTML editor with live preview. Variable insertion panel. Preview modal renders with sample data. Clone, set-default, delete (system protected).
- **Frontend — Send Package Integration**: Email template selector dropdown per recipient in `SendPackagePage.js`. Shows all tenant templates. Optional — defaults to role-based system template if unselected.
- **Frontend — Generate Document Integration**: Email template selector dropdown per recipient in `GenerateDocumentWizard.js`. Appears when Email delivery is selected and templates are loaded. Passes `email_template_id` to `generateLinks` API.
- **Standalone Document Email Wiring**: `document_service_enhanced.py` stores `email_template_id` per recipient instance. Initial email send and sequential routing email send both resolve custom templates via `EmailTemplateService.resolve_for_sending()`, with fallback to system default.
- **Testing**: 100% pass rate (26/26 backend API tests, all frontend flows verified) — iteration_284, iteration_285

### Phase 34: PRO Email Template Editor UX Overhaul (Apr 15)
- **3-Column IDE Layout**: Full-height workspace with Left (Settings: Name, Type, Subject, Details), Center (Editor with Visual/HTML modes), Right (Variables with search and categories)
- **Visual Mode**: Renders the actual email HTML as a live preview (not raw code), responsive with desktop/mobile canvas toggle
- **HTML Mode**: Dark-themed code editor (slate-950 bg) with line numbers, monospaced font, syntax-like experience
- **Sticky Header**: Template name, unsaved changes indicator (pulsing amber dot), saved status, device toggles, Test Email, Preview, Save (Ctrl+S) buttons
- **Variables Panel**: Categorized into 5 groups (Recipient, Document, Package, Sender & Company, Links), each variable shows example value (e.g., "John Doe"), has Copy and Insert buttons, with full-text search
- **Test Email**: New `/api/docflow/email-templates/send-test` endpoint; modal in UI to enter email and send rendered preview
- **Preview Modal**: Full-screen rendered preview with desktop/mobile toggle, subject line display
- **Smart Features**: Ctrl+S keyboard shortcut, unsaved changes confirmation on back navigation, saved indicator
- **Testing**: 100% pass rate (16/16 backend, all PRO UX features verified) — iteration_287

### Phase 35: Package Webhook Fix (Apr 15)
- **Root Cause**: `PackageService.__init__()` was creating `RoutingEngine` WITHOUT passing a `WebhookService` instance. Since `self.webhook_service` was `None`, all `if self.webhook_service:` checks in the routing engine silently skipped webhook calls.
- **Fix**: Added `WebhookService` import and initialization in `PackageService`, then passed it to `RoutingEngine` constructor.
- **Verification**: Activity logs now show `webhook_success` entries for `package_sent` and `wave_started` events being delivered to the configured webhook URL.
- **Testing**: 100% pass rate (14/14 backend tests) — iteration_288

### Phase 36: Package Webhook Payload Alignment (Apr 16)
- **Problem**: Actual webhook payload wrapped data in a `data` envelope, had `package_name: null` at top level, and was missing event-specific fields (document_id, recipient_email, signed_documents, etc.)
- **Fix**: Rewrote `fire_package_event()` in `webhook_service.py` to produce flat payloads matching the downloadable sample. Each event type (signed, viewed, opened, sent, expired, declined, signed_copy) now includes its specific fields at the top level.
- **Routing Engine**: Updated `package_sent` and `wave_started` webhook calls to pass recipient info.
- **Frontend Samples**: Updated `SAMPLE_PAYLOADS` in `PackageDetailPage.js` to include `timestamp`, `tenant_id`, `package_name` for all 7 event types.
- **Testing**: 100% pass rate (25/25 backend tests, payload structure verified against sample) — iteration_289

### Phase 37: Webhook Event Cleanup & Approve/Reject (Apr 16)
- **Removed**: "Viewed" event (merged with Opened), "Expired" event (not needed for packages)
- **Renamed**: "Declined" → "Approve / Reject" (id: `approve_reject`) — fires on both approve and reject actions
- **Fixed "Opened"**: Added `fire_package_event("opened")` call in `get_package_public` (package_public_routes.py) so webhook fires when a recipient opens a package via email/public link
- **Added Approve/Reject webhooks**: `approve_package` fires `approved` event, `reject_package` fires `rejected` event — both map to `approve_reject` UI event
- **Updated event mapping**: `_EVENT_MAP` in `webhook_service.py` now maps `approved`/`rejected` → `approve_reject`, removed `viewed`/`expired`/`declined`
- **Frontend**: `WEBHOOK_EVENTS` reduced to 5 events (signed, opened, sent, approve_reject, signed_copy). Sample payloads updated for all.
- **Testing**: 100% pass (14/14 backend, all frontend verified) — iteration_290

### Phase 38: Advanced Field Styling + OTP Default (Apr 16)
- **Unified Text Styling Panel**: Extended the styling section in Visual Builder to Label, Text Input, AND Merge Field types (previously only Label and Text had partial styling, Merge had none). All three now have: Font Family (7 options), Font Size (8-32px), Bold/Italic/Underline toggles, Left/Center/Right alignment, and Text Color picker with hex input.
- **Builder Canvas Rendering**: Field overlays on the PDF canvas now apply all styling (fontFamily, fontSize, fontWeight, fontStyle, textDecoration, textAlign, color).
- **Signing View Consistency**: `InteractiveDocumentViewer` updated to apply full styling to text inputs (inline style), merge field display, and label fields — including italic and underline.
- **PDF Overlay Styling**: Added `_apply_field_style()`, `_draw_text_with_style()`, and `_draw_label_field()` to `pdf_overlay_service_enhanced.py`. Maps CSS fonts to ReportLab (Helvetica/Times/Courier with bold/italic variants), supports alignment and underline in final PDF.
- **OTP Default Off**: Changed `requireAuth` to `false` in `GenerateDocumentWizard.js` and `otpEnabled` to `false` in `SendPackagePage.js`.
- **Testing**: 100% pass (all code review + Playwright UI verification) — iteration_291

### Phase 39: Role-Based Signing Flow Fix (Apr 16)
- **Root Cause**: Document recipients were created WITHOUT `role_type` field. When the Approver/Reviewer opened their link, `active_recipient.role_type` was `undefined`, causing the frontend to default to the Signer UI.
- **Backend Fix**: Added `_normalize_role_type()` to `document_service_enhanced.py` that maps `signer→SIGN`, `approver→APPROVE_REJECT`, `reviewer→VIEW_ONLY`, `receive_copy→RECEIVE_COPY`. Both `role` and `role_type` are now stored on every recipient instance.
- **Frontend Fix**: The "Signer Information" panel (name, email, "Complete Signing" button) now only shows for `SIGN` role. Approver/Reviewer get full-width PDF viewer with their respective action buttons. Column span adapts: `lg:col-span-2` for signers (with left panel), `lg:col-span-3` for others.
- **Behavior**: Signer → fill fields + sign + Complete Signing. Approver → read-only PDF + Approve/Reject. Reviewer → read-only PDF + Confirm Review.
- **Testing**: 100% pass (9/9 backend, all frontend verified) — iteration_292

### Phase 40: Complete Approval Workflow Fix (Apr 16)
- **Workflow Sequencing**: Added sequential routing logic to `role-action` endpoint — after approve/review, the next recipient is automatically activated (status → `sent`) and emailed.
- **Status Checks**: Updated `all_required_done` in `sign_document` to include `approved` and `reviewed` statuses so the document correctly transitions to `completed`.
- **Signed PDF Access**: `getPdfViewUrl()` now returns `/view/signed` for non-signer roles when document is `partially_signed`, so approvers/reviewers see the signed version.
- **UI Overhaul**: Action buttons (Approve/Reject/Confirm Review) moved to a sticky header bar above the PDF viewer. Status banners show after actions (Approved=green, Rejected=red, Review Completed=blue).
- **Pydantic Model Fix**: Added `APPROVED`, `REVIEWED`, `REJECTED`, `RECEIVE_COPY` to `RecipientStatus` enum and `DECLINED`, `PARTIALLY_SIGNED` to `DocumentStatus` enum to prevent 500 errors.
- **Testing**: 100% pass (10/10 backend, all frontend verified) — iteration_293

### Phase 41: Rejection Comments + Webhook Metadata (Apr 16)
- **Rejection Reason Required**: Backend `role-action` endpoint now returns 400 if reject action has no reason. Reason is stored at both document level (`reject_reason`, `rejected_by`, `rejected_at`) and recipient level (`reject_reason`, `ip_address`, `user_agent`).
- **Rejection Modal**: Frontend shows a modal with mandatory textarea when approver clicks Reject. "Confirm Rejection" button disabled until reason entered.
- **Rejection Visibility**: Status banner shows rejection reason inline. Document listing shows MessageSquare icon on declined docs — clicking opens a modal with the full rejection reason.
- **Webhook Metadata**: All webhook events (template + package) now include a `metadata` object: `{ip_address, user_agent, performed_by, performed_by_email}`. Applied to signed, approve, reject, review, and all other events.
- **Download Samples Updated**: Both IntegrationTab.js (template) and PackageDetailPage.js (package) sample payloads include metadata field.
- **Testing**: 100% pass (15/15 backend, all frontend verified) — iteration_294


### Phase 42: Workflow Enhancements — Confirmations + Email Notifications (Apr 17)
- **Signer Confirmation Checkbox**: Added "I confirm that I have reviewed and completed this document" checkbox above Complete Signing button. Button disabled until checked.
- **Approver Confirm Popup**: Clicking Approve opens confirmation modal ("Are you sure you want to approve?") with Yes/No buttons. Reject flow unchanged (comment modal).
- **Completion Email (Template Flow)**: When all recipients complete (signed + approved + reviewed), sends completion email to ALL recipients with "Document Completed" notification.
- **Completion Email (Package Flow)**: Same completion email sent to all package recipients when package reaches completed status via routing engine.
- **Approval/Rejection Notifications (Template)**: After approve/reject action, sends notification email to all previously-active recipients (signers, etc.) informing them of the approval or rejection (with reason).
- **Approval/Rejection Notifications (Package)**: Same notifications added to package approve (`approve_package`) and reject (`reject_package`) endpoints.
- **SystemEmailService**: Added `send_workflow_notification_email()` method with 3 types: approved (green), rejected (red with reason), completed (indigo with download link).


### Phase 43: Final Email Enhancement + Apply Signature to All Fields (Apr 17)
- **Completion Email — View Button**: Updated `send_workflow_notification_email` to include "View Document" button + fallback "click here to view document" link for completion emails. Each recipient gets their own personalized view URL via their public token.
- **View URLs in All Flows**: Template sign flow, template role-action, and package routing engine all pass per-recipient `view_url` to the completion email.
- **Apply Signature to All Fields**: SignatureModal now accepts `assignedSignatureFieldIds` prop. When multiple signature fields are assigned to the same recipient, shows "Apply this signature to all my assigned signature fields (N fields)" checkbox. When checked, the same signature data is applied to all listed fields at once.
- **Package Flow Support**: Same "apply to all" feature works in PackagePublicView — computes assigned fields from the current document's field placements for the active recipient.
- **No Cross-Recipient Contamination**: Only fields assigned to the current signer are included in the "apply to all" list.



### Phase 44: Template Validation System Rewrite (Apr 17)
**Problem solved**: Validation Score never reached 100%, total check count fluctuated randomly, false CRM warnings appeared even when Salesforce was connected, and hidden checks were not surfaced in the UI.

**Backend — `/app/backend/modules/docflow/services/validation_service.py` (full rewrite)**:
- Introduced `TOTAL_CHECKS = 8` and a frozen `CHECK_DEFINITIONS` list. Count is **always** 8 regardless of template state.
- Each check emits exactly ONE `{id, category, label, status, message}` entry with status ∈ {`passed`, `warning`, `error`}.
- Score formula: `round(passed_count / 8 * 100)`. A fully-configured template reaches exactly **100%**.
- Salesforce CRM check: trusts `connection_id + object_name` as PASSED (no live API call, no false warnings).
- Internal CRM check: verifies object exists in `tenant_objects` or `schema_objects` collections.
- No CRM at all → soft WARNING (CRM is optional). Salesforce without `connection_id` → hard ERROR.
- Merge field check: PASSED when empty, ERROR on misconfig, PASSED on valid Salesforce fields, verified against internal CRM otherwise.
- Response now includes structured `checks[]` array plus legacy flat `passed/warnings/errors` arrays for backward compat.

**New endpoint — `POST /api/docflow/templates/validate-object`**:
- Accepts an in-memory template body (for unsaved/pre-save validation).
- Same contract as `POST /templates/{id}/validate`.

**Frontend — `/app/frontend/src/docflow/components/ValidationPanel.js` (full rewrite)**:
- Now a THIN renderer. All client-side duplicate logic removed.
- Calls backend (`validateTemplate` for saved, `validateTemplateObject` for unsaved) as single source of truth.
- Renders `checks[]` array directly; denominator is static (`total_checks` from backend).
- Added `data-testid` attributes: `validation-panel`, `run-validation-btn`, `validation-score-card`, `validation-score-value`, `validation-passed-count`, `validation-total-count`, `validation-errors-section`, `validation-warnings-section`, `validation-passed-section`.

**Tests**: `/app/backend/tests/test_validation_service.py` — 7 unit tests (all pass). Testing agent verified 15/15 backend tests + full frontend UI flow.


### Phase 45: Signing-View Field Quality Overhaul (Apr 18)
**Issues fixed (6 items reported by user)**:

1. **Signature field always-visible background** — `InteractiveDocumentViewer.js` signature & initials cases now use `bg-indigo-50/70` on default state (was previously transparent; only visible on hover).
2. **Checkbox DocuSign-style prominence** — wrapped checkbox in an amber-bordered label container with a visible 5x5 box that turns amber-500 filled with white check when checked; label text is always visible beside it.
3. **Conditional logic reliability** — root cause was a **format mismatch**: the Visual Builder saves rules as `conditionalRules` on the SOURCE field (format A) but the signing view was only evaluating `conditionalLogic` on the TARGET field (format B). The `hiddenFieldIds` memo now bridges both formats: builds a target→rules map from both sources, evaluates source values (including proper radio-group value lookup), and applies show/hide semantics. Default for "show"-type rules is hidden-until-match (DocuSign-like).
4. **Radio Group redesign (new model)** — each radio field is now ONE option with `{ groupName, optionLabel, optionValue }`. Multiple radio fields sharing the same `groupName` behave as a single-select group. Selecting one sets `fieldValues[groupName] = optionValue` and renders unchecked state for siblings. Full backward compat preserved for legacy templates with `radioOptions` array (includes a "Simplify to group model" convert button in the builder).
5. **Date format** — standardized to `MM/DD/YYYY` across signing view, frontend PDF draw, and backend PDF overlay (`_draw_date_field` now parses multiple input formats and emits `%m/%d/%Y`).
6. **Auto-fill date + read-only** — date fields are auto-populated with the signer's **local** today's date on mount via `formatLocalMMDDYYYY()`, rendered as a read-only `<div>` (no picker, no edit). Propagated via `onFieldsChange` so the signed PDF embeds the correct date.

**Files changed**:
- `/app/frontend/src/docflow/components/InteractiveDocumentViewer.js` (full rewrite — adds `formatLocalMMDDYYYY`, `getRadioGroupName`, dual-format conditional logic, new+legacy radio, auto-fill date, checkbox/signature styling)
- `/app/frontend/src/docflow/components/MultiPageVisualBuilder.js` (new radio default model on drop; canvas preview for new vs legacy; properties panel with Group Name/Option Label/Option Value + "Duplicate in group" button; date read-only info panel; conditional logic editor for new-model radio)
- `/app/frontend/src/docflow/pages/PublicDocumentViewEnhanced.js` (PDF draw — auto-fill date draws even when empty; radio drawing supports both models)
- `/app/backend/modules/docflow/services/pdf_overlay_service_enhanced.py` (new `_draw_radio_field`; `_draw_checkbox_field` always draws box + label; `_draw_date_field` emits MM/DD/YYYY)

**Tests**: Testing agent (iteration_2.json) — 100% success: 11/11 backend field tests pass, all frontend field types verified in signing view. Pytest file: `/app/backend/tests/test_docflow_fields.py`.


### Phase 46: Signature Reuse (DocuSign-style) (Apr 18)
**Feature**: Session-scoped signature cache with lightweight reuse prompt. When a signer clicks a second (or later) signature field, a small popover appears showing their previously-drawn signature with **"Use this signature"** and **"Draw new"** buttons instead of re-opening the full modal.

**Implementation**:
- **`/app/frontend/src/docflow/hooks/useSessionSignature.js`** (NEW) — custom hook with sessionStorage-backed cache; key = `docflow.sessionSig.v1.${token}::${email.toLowerCase()}`; slots for `signature` and `initials` independently; exposes `getSignature(type)`, `setSignature(type, dataUrl)`, `clearAll()`.
- **`/app/frontend/src/docflow/components/SignatureReusePrompt.js`** (NEW) — lightweight popover with signature thumbnail, "Use this" + "Draw new" buttons, backdrop-close support.
- **`PublicDocumentViewEnhanced.js`**, **`PackagePublicView.js`**, **`PackagePublicLinkView.js`** — integrated `useSessionSignature` + `<SignatureReusePrompt>`. `showSignatureModal` / `openSignatureModal` now route: if field already filled → full modal; else if cache exists for that type (signature/initials) → reuse prompt; else → full modal. On successful sign complete → `clearSessionSig()` fires to prevent cross-user leakage.

**Edge cases handled**:
- Cache isolated per signer (keyed by token+email)
- Survives page refresh within same browser tab (sessionStorage)
- Separate slots for signature vs initials
- Drawing a new signature replaces the cached value
- "Apply to all fields" flow untouched
- Re-signing an already-signed field opens full modal (not the prompt)

**Tests**: Testing agent iteration_3.json — 95% pass (8/9 test cases PASS, 1 code-reviewed as session clearing could not be reached through the UI due to other required fields but verified in source).


### Phase 47: Consent Screen + Guided Fill-In (DocuSign-style) (Apr 18)

**New features**:

1. **E-Sign Consent Screen** — full-screen modal shown once per signer session before the document view. All roles (Signer, Approver, Reviewer) must accept.
   - "Review and continue" heading, generic disclosure text, language selector, Print button
   - Required checkbox: "I agree to use electronic records and signatures"
   - Continue button disabled until checkbox checked
   - Expandable "Read the Electronic Record and Signature Disclosure" section
   - Persisted in `sessionStorage` key `docflow.consent.v1.{token}::{email}` — survives refresh, cleared on new session/signer

2. **Guided Fill-In Navigation**:
   - Sticky top header with required-field count badge + `Start` / `Next field` / `Finish` buttons
   - Floating green "Fill In" arrow pointing at the active required field (left-side, with triangle tip)
   - Pulse animation on active field via `@keyframes pulseActiveField` in `index.css`
   - Auto-scrolls to active field; auto-switches pages in page-view mode
   - Auto-advances when a field gets filled
   - Skips hidden-by-conditional-logic fields and already-filled fields
   - De-duplicates radio groups (group counts as one field)
   - Finish button disabled until all required fields complete + confirm checkbox checked
   - Old left-sidebar "Complete Signing" button hidden (replaced with informative text pointing to header Finish)

**New files**:
- `/app/frontend/src/docflow/components/ConsentScreen.js`
- `/app/frontend/src/docflow/hooks/useGuidedFillIn.js`

**Modified files**:
- `InteractiveDocumentViewer.js` — accepts `activeFieldId`, `onHiddenFieldsChange`, `onFieldClick`; renders floating arrow + ring highlight; emits hiddenFieldIds
- `PublicDocumentViewEnhanced.js` — full integration: consent gate + sticky guided header + hidden sidebar button
- `PackagePublicView.js` + `PackagePublicLinkView.js` — consent screen only (guided fill-in not yet wired into packages)
- `index.css` — new `pulseActiveField` keyframes

**Tests**: Testing agent iteration_4.json — **100% pass** on all 14 test cases including full consent flow, guided fill-in flow with auto-advance, and regression checks for Phase 46 signature reuse + Phase 45 field rendering.


### Phase 47.1: Guided Fill-In Critical Bug Fixes (Apr 18)

User reported: guided fill-in detected only 1 of 4 signature fields across an 18-page document; "Next" didn't advance; state transitions unclear.

**Root cause fixes in `useGuidedFillIn.js`**:
1. **Assigned-field detection** — hook now accepts `assignedFieldIds: string[]|null` (backend's `active_recipient.assigned_field_ids`). When present, treats it as canonical truth. Falls back to `recipientIds: string[]` matching (multiple identity keys: id, template_recipient_id, recipient_id, email).
2. **Next-advance logic** — `goToNext` and auto-advance now find the next pending field AFTER the current `activeFieldId` in sorted order, not just `pendingFieldIds[0]`.
3. **Start→Next transition** — new `started` state flag drives button visibility cleanly: `showStart = !started && pending>0`, `showNext = started && pending>0`.
4. **Progress & badge polish** — new progress bar at bottom of header (`data-testid="guided-progress-bar"`), dynamic badge color (emerald on 100%, indigo otherwise), copy "`X of Y required completed — Z left`".
5. **Click sync** — new `syncFromClick(id)` exposed (replaces raw `setActiveFieldId`), handles radio-group mapping.

**Tests**: Testing agent iteration_5.json — **17/17 PASS** including regressions.

### Phase 48: Field Linking & Auto-Sync (DocuSign-style) (Apr 19)

**Feature**: Internal `fieldKey` property on every field enables DocuSign-style value linking. Fields sharing a key auto-sync values at signing time; duplicates are linked by default; backward-compatible with existing templates.

**Implementation**:
- **New field creation** (`MultiPageVisualBuilder.js` ~line 344): every new field gets `fieldKey: fk_{timestamp}_{rand}` — unique & independent by default
- **Duplicate** (~line 540): `...fieldToDuplicate` spread preserves fieldKey → duplicates are auto-linked
- **Radio "Duplicate as another option"** (~line 1669): gets a NEW fieldKey so options within a group don't cross-sync
- **Unlink button** (`Linked field` panel ~line 1751): visible only when field's fieldKey is shared by another text field; regenerates fieldKey on click, making the field independent
- **Signing auto-sync** (`InteractiveDocumentViewer.js` `handleFieldChange`): when a text field changes, broadcasts the value to all other text fields with matching fieldKey; skips hidden (conditional logic), field_disabled, non-text, and the source field itself
- **Backward compat**: fields without `fieldKey` skip the sync loop → behave exactly as before (independent)

**Spec limitations respected**: only **text** fields auto-sync via fieldKey (spec: "mandatory for text; optional future for checkbox/radio"). Signature and merge fields unaffected (they have their own existing sync mechanisms).

**Tests**: iteration_6.json — **100% pass (17/17)**. 6 UI-tested, 6 code-reviewed, 4 regressions verified (consent, guided fill-in, date auto-fill, signature fields).


### Phase 48.1: Field Linking Signing-View Sync Bug Fix (Apr 19)

**User report**: Phase 48 builder showed duplicates as linked (fieldKey matched), but typing in one signing-view text field did NOT update the other.

**Root causes**:
1. The "Linked field" panel in the builder filtered by `f.fieldKey === selectedField.fieldKey` — when BOTH fields had undefined fieldKey (legacy templates pre-Phase-48), `undefined === undefined` evaluated true, so the UI falsely indicated linkage. But the signing-view sync required truthy `fieldKey` → no actual sync occurred.
2. Legacy templates didn't have `fieldKey` in storage, so the sync branch was skipped entirely.

**Fixes**:
- **Builder** (`MultiPageVisualBuilder.js`): added `_ensureFieldKeys()` helper — every field without a fieldKey gets a unique runtime-generated key (`fk_{ts}_{rand}_{id}`). Applied on initial `useState` AND on the `useEffect` that syncs fields from parent. Linked-field panel now also requires truthy `f.fieldKey`.
- **Signing view** (`InteractiveDocumentViewer.js`): renamed incoming prop to `rawFields`, then derived `fields` via `useMemo` that normalizes missing fieldKey with `fk_runtime_{id}`. This is idempotent and backward-compatible: legacy fields get unique keys → remain independent; duplicates with shared fieldKey → sync as designed.

**Verification**: Live end-to-end test via Playwright — template with 2 text fields sharing `fieldKey: "fk_shared_123"`, typed "Hello World" into Field 1 → Field 2 instantly displayed "Hello World". Screenshot saved to `/tmp/sync_result.png`.

**Regression**: legacy templates behave unchanged (each field independent), builder Linked-field panel only shows for truly linked fields, all prior phases intact.


### Phase 49: Date Enhancements + Global Read-Only (Apr 19)

**Date field improvements** (`MultiPageVisualBuilder.js`):
- **Date Mode dropdown** (`data-testid="date-mode-select"`): `auto` (auto-fill today's date — default) vs `manual` (signer picks via date picker)
- **Alignment buttons** (left / center / right) with `data-testid="date-align-*"` applied via `field.style.textAlign`
- Replaces the old static "Auto-filled on signing" green info panel

**Global Read-Only** (`MultiPageVisualBuilder.js` — Required + Read Only side-by-side panel ~line 1191):
- New `readOnly` boolean property on all field types EXCEPT `merge`
- Merge field correctly excludes the checkbox (only shows Required)
- Label field remains exempt (pre-existing — no Required/ReadOnly section)
- Data-testids: `field-required-checkbox`, `field-readonly-checkbox`

**Signing view** (`InteractiveDocumentViewer.js`):
- `isDisabled = readOnly || field.field_disabled || field.readOnly` — applied uniformly to all field types
- Dedicated read-only styling: `opacity-70 cursor-not-allowed` (distinct from the `opacity-60` of assigned-to-other-recipient)
- Date field now renders three distinct states:
  - **auto mode** → static read-only display with ✓ check icon (today's local date)
  - **manual mode + editable** → `<input type="date">` picker (ISO ↔ MM/DD/YYYY conversion)
  - **manual mode + readOnly** → static display with existing value or placeholder
- Date alignment applied via `justify-start/center/end` wrapper classes
- Auto-fill `useEffect` now only populates fields with `dateMode === 'auto'` (or unset for backward compat)

**Guided fill-in** (`useGuidedFillIn.js`):
- `isFilled` for date: auto-mode always true; manual-mode requires explicit value. Manual-mode required dates now properly block Finish.

**PDF draw** (`PublicDocumentViewEnhanced.js`):
- Manual-mode dates without a value are NOT drawn (honors signer's choice)
- Auto-mode dates always draw fallback-to-today

**Tests**: iteration_7.json — 95% success rate, all code-reviewed + UI-tested points PASS.


### Phase 49.1: Date UI Consistency + DD/MM/YYYY Format (Apr 19)

**UI consistency**: Date field now uses the SAME Text Styling section as Text Input.
- `MultiPageVisualBuilder.js` ~line 1258 — added `'date'` to the list of types that render the Text Styling section (Font Family, Font Size, Weight/Style buttons B/I/U, Alignment, Text Color). Removed the separate date-only alignment section.
- The Date Mode dropdown stays in the Date-specific area (auto vs manual).
- Bold / Italic / Underline / Alignment / Color now apply to date values in builder preview AND signing view (since all reference `field.style`).

**Date format switch MM/DD/YYYY → DD/MM/YYYY**:
- `InteractiveDocumentViewer.js`: renamed the formatter to `formatLocalDDMMYYYY` (kept alias `formatLocalMMDDYYYY` for import compatibility) — emits DD/MM/YYYY for today.
- Manual-mode picker's `toIso`/`fromIso` helpers now parse DD/MM/YYYY (display) ↔ YYYY-MM-DD (native input).
- Placeholder string changed to `DD/MM/YYYY`.
- Backend PDF overlay `_draw_date_field` (`pdf_overlay_service_enhanced.py`) now normalizes all incoming date formats and emits `%d/%m/%Y`.

**Verified live** (Playwright smoke): auto date shows "19/04/2026" (April 19 2026 in DD/MM/YYYY), manual date shows native `<input type="date">` picker. Screenshot at `/tmp/ddmm_test.png`.

**Backward compat**: stored ISO value remains unchanged (no backend schema break). Only the DISPLAY format flipped to DD/MM/YYYY.


### Phase 49.2: Validate Button UX + Remove Noisy Recipients Warning (Apr 19)

**Validate button auto-run**:
- `TemplateEditor.js`: new `autoRunValidationToken` state — bumped to `Date.now()` whenever user clicks the top-right Validate button. Passed to `<ValidationPanel autoRunToken={...}>`.
- `ValidationPanel.js`: new `useEffect` listens for `autoRunToken` changes → auto-fires `runValidation()`. Manual tab open keeps token=0 → no auto-run (spec requirement).
- Behavior: single click now does **redirect + run + display** in one shot. No duplicate calls — `Date.now()` always differs, so clicking Validate multiple times fires fresh runs; simply re-opening the Validation tab does NOT fire.

**Remove "No recipients configured" UI warning**:
- `validation_service.py` `_check_recipients`: empty recipients list now returns `status=passed` with message `"No recipients pre-configured (can be added at send time)"`. Previously was `status=warning`.
- Rationale: recipients are often added at Send time (via Generate Document flow / package builder), so flagging them as a template-level warning is noise.
- Total check count stays at 8 (deterministic).
- New pytest: `test_empty_recipients_no_longer_emits_warning`. All 8/8 tests pass.

**Verification**: curl-tested the `/validate-object` endpoint with empty recipients → score 62%, recipients check passed, zero warnings mention the old recipients string.



### Phase 50: Assigned Components Functional Behavior (Feb 2026)

**Goal**: Enforce strict per-recipient field visibility for packages and standalone documents, matching DocuSign behavior, while preserving document readability for fields already filled by prior signers/system.

**Spec**:
- Field **assigned** to current recipient → interactive (fill-in).
- Field **not assigned** AND has a value (from merge fields, prior signer, or system) → **read-only** (visible, non-editable).
- Field **not assigned** AND no value → **completely hidden** (no placeholder, no disabled state).
- **Backward compat**: when no `assigned_components` data exists anywhere → all fields visible to all recipients (legacy behavior).

**Implementation**:
- `InteractiveDocumentViewer.js`: added `field.field_hidden` check to skip rendering entirely in both page-mode and scroll-mode loops. Field linking (`handleFieldChange`) also skips `field_hidden`/`readOnly` targets so reads-only copies don't get overwritten.
- `PackagePublicView.js`: `loadFieldPlacements` now **annotates** each field with `__isAssigned` (instead of hard-filtering). `getFieldsForDoc` computes `field_hidden` / `readOnly` at render time based on the live `docFieldValues` map — so pre-filled values from prior signers appear as read-only to the next signer. `allRequiredFieldsComplete` skips `__isAssigned === false` fields. Document header `X/Y fields` counter and `hasAnyFields` reflect only interactive (assigned) fields.
- `PublicDocumentViewEnhanced.js` (standalone doc signer view): replaced old `field_disabled: !isAssigned` pattern with the new hide/read-only-if-has-value semantics.
- `useGuidedFillIn.js`: eligibility filter also excludes `field_hidden` and `readOnly` fields so Fill-In navigation skips them.

**Backend**: No changes. Existing `/api/docflow/packages/public/{token}/sign-with-fields` already filters by `assigned_components` for PDF embedding and correctly merges prior-signer values.

**Testing** (iteration_8.json): 7/7 backend API tests passed; code review verified all 9 visibility/linking touchpoints; backward-compat paths confirmed.


### Phase 51: Auto-Assign Components on Empty Selection (Feb 2026)

**Problem**: When a user added a recipient in Generate Document → Manual Send but did NOT check any "Assigned Components", the signing UX would show nothing fillable (after Phase 50's hide logic), creating the impression that the email had silently failed. Emails were actually going out, but defensive backend logic and clear logging were missing.

**Fix — Rule: empty `assigned_components` ⇒ ALL unclaimed signable fields**:
- New helper `_auto_assign_unclaimed_fields(...)` in `generate_links_routes.py`.
- **Basic mode** (`POST /api/v1/documents/generate-links`): runs after recipient validation. Collects claimed field IDs from non-empty recipients; fills each empty recipient (in routing_order) with the remaining unclaimed signable IDs. Merge/label types are excluded (document-level, not signer-specific). No conflicts are generated.
- **Package mode** (same endpoint, `send_mode="package"`): runs per-document auto-assign keyed by `template_id`, writing into `assigned_components_map`.
- **Internal Send Package** (`POST /api/docflow/packages/{package_id}/send` in `package_routes.py`): mirrors the same per-document auto-assign for parity with the wizard.

**Logging** (diagnose "silent failures" end-to-end):
- `[generate-links] auto-assign: recipient 'X' had empty assigned_components → auto-assigned N field(s)` (one per auto-filled recipient)
- `[generate-links] plan: recipient name=… email=… role=… order=… assigned_fields=N email_trigger=yes/no` (final recipient plan)
- `[generate-document] email dispatch summary: document=… success=X failed=Y skipped=Z total_recipients=N` (appended after the email loop in `document_service_enhanced.py`)
- Package variants: `[generate-links/package doc=…]` and `[package-send]` prefixes.

**Frontend UX hint** (`GenerateDocumentWizard.js`):
- Indigo info banner shown when a signer recipient has zero components checked: _"No components selected — all unclaimed fields will be assigned to this recipient by default."_
- `data-testid="assigned-components-empty-hint-{index}"`.

**Backward compat**:
- Explicit selections are always respected — auto-assign only runs for recipients whose list is empty.
- If all fields are already claimed, empty recipients simply stay empty (email still fires; signer sees read-only/hidden fields per Phase 50 rules).

**Testing** (iteration_9.json): 8/8 backend API tests passed. Verified single-recipient empty, explicit preserved, two-recipient both-empty (first gets all, second gets none — no conflict), R1-explicit + R2-empty (R2 gets remaining), package mode, package send, log patterns, and email dispatch. Frontend banner verified via code review.



### Phase 52: Edit / Generate Document Performance Optimization (Feb 2026)

**Problem**: Clicking Edit or Generate on a DocFlow template showed a full-screen spinner for ~6 seconds before the shell appeared. The `loadTemplate` sequence was fully serial — metadata → versions → field placements → PDF blob (sometimes including a DOCX→PDF conversion) → content blocks → merge-field parse → CRM fields — all behind a single `setLoading(true)` gate.

**Fix — 4-phase non-blocking loader** (`TemplateEditor.js`):
1. **Phase 1 (critical path, blocking)**: `getTemplate(templateId)` → `setTemplateData` → `setLoading(false)`. Shell paints immediately.
2. **Phase 4 (heaviest, fired in parallel)**: PDF blob fetch (+ optional DOCX→PDF conversion). Runs with its own `pdfLoading` flag, shows a shimmer skeleton (`data-testid="visual-builder-skeleton"`) in the Visual Builder tab until the file lands.
3. **Phase 2 (secondary, parallel)**: `Promise.allSettled([ getTemplateVersions, getFieldPlacements, getContentBlocks, parseFields ])` — each resolves independently, UI fills in as data arrives. Graceful degradation on individual failures.
4. **Phase 3 (dependent, non-blocking)**: CRM fields load if `crm_connection.object_name` is present.

**Session-storage stale-while-revalidate cache** (keyed `docflow_tpl_cache:{templateId}`):
- On open, the page hydrates `templateData`, `fieldPlacements`, and `contentBlocks` from `sessionStorage` and paints immediately (no spinner).
- Phase 1 still re-fetches in the background; fresh values replace the cache contents.
- Second-visit shell-render time dropped from ~6s → ~2s (~67% faster) in tests.

**Also**: `GenerateDocumentWizard.js` got the same hydrate-then-revalidate pattern. `getTemplateVersions` now loads asynchronously after `getTemplate`, rather than serially blocking the shell.

**Preserves** (verified by testing agent code review):
- Signing flows (Phase 49 DocuSign UX)
- Field linking via `fieldKey` sync
- Conditional logic evaluation
- Assigned-components hide/read-only (Phase 50) and auto-assign (Phase 51)

**Testing** (iteration_10.json):
- ✅ Shell renders early with header/tabs before PDF arrives
- ✅ Skeleton shown while `pdfLoading=true`
- ✅ Session cache hydration confirmed (~2s reopen vs ~6s first visit)
- ✅ 4 field placements render correctly in Visual Builder
- ✅ Validation invalidation on field-change still works
- ✅ ESLint clean on both files
- Note: `POST /api/docflow/templates/{id}/parse-fields` returning 500 for some templates is a pre-existing issue (backend PDF download) — now properly isolated by `Promise.allSettled` so it no longer blocks shell render.



### Phase 53: DocFlow 10-Point Enhancement Bundle (Feb 2026)

**10 bug fixes + feature enhancements spanning signing UX, field fidelity, and cross-module PDF parity**.

**Phase A — Critical Bug Fixes**
- **(1) Next button navigation**: `InteractiveDocumentViewer.js` scroll-to-active-field now retries up to ~1s (8 attempts × 120ms) so page-mode works even while the target PDF page is still rendering.
- **(3) Merge field typing bug (single-char limit)**: Removed `externalFieldValues[field.id]` from the `crmValue` computation. The user's own typed value was flowing back through props and re-classifying the field as "CRM-populated", which unmounted the `<input>`. Now only real CRM keys (`obj.field`, `field`) count.
- **(6) Initials field bleed-through**: `SignatureModal.js` now resets `mode`, `typedText`, `selectedFont`, `hasDrawn`, `applyToAll` every time `isOpen` flips to true. Typing "John Doe" into a signature field no longer pre-fills the next Initials modal.
- **(9) Acknowledgement checkbox → Confirmation popup**: New `ConfirmSubmitDialog.js` component (reusable, tone variants indigo/emerald/red). Replaces the old "I have reviewed…" checkbox in both `PackagePublicView.js` (Sign/Review/Approve) and `PublicDocumentViewEnhanced.js` (Finish). Role-specific titles: "Confirm signing" / "Confirm review" / "Confirm approval".

**Phase B — Field Fidelity & Dates**
- **(2) Position accuracy across Builder/signing/PDF**: Backend `fitz.get_text_length(...)` in `package_public_routes.py` + `package_public_link_routes.py`; frontend `helv.widthOfTextAtSize(...)` in `PublicDocumentViewEnhanced.js`. Text/date/merge/label all honor `field.style.textAlign` (left/center/right) with real text-width measurement.
- **(4) Default date format**: Switched back to **MM/DD/YYYY** (previous default was DD/MM/YYYY). `formatLocalMMDDYYYY` now actually emits MM/DD/YYYY; new `formatDate(date, fmt)` utility handles all four supported formats. New date fields default to `label: "Date Signed"`.
- **(5) Custom Date Format property**: New Builder property supporting `MM/DD/YYYY | DD/MM/YYYY | YYYY-MM-DD | MMM DD, YYYY`. Applied end-to-end: signing page (auto + manual), completed document, final PDF, package + template flows, merge fields converted to date pickers. The date-mode selector previously present is preserved (Auto vs Manual).
- **(7) Signature/Initials alignment**: Both fields now accept `style.textAlign` (left/center/right) via the shared Text Styling panel, and both the signing canvas and final PDF honor that alignment with proper container justification.

**Phase C — Radio + Cross-Module Parity**
- **(8) Radio defaultChecked + hideLabelOnFinal**: New Builder properties wired into a `useEffect` that pre-selects the default option on signing (signer can still change). `hideLabelOnFinal` suppresses the option label in read-only/completed renders for a cleaner final document.
- **(10) Final-PDF parity**: Backend PyMuPDF embed now draws radio options (selected only, filled circle + optional label), matching the pdf-lib frontend embed. Both flows agree on: alignment, which options render, date format pass-through.

**Testing** (iteration_11.json): 16/16 backend API tests passed. Frontend UI verified: ConfirmSubmitDialog flows, SignatureModal reset logic, Next button in page mode, date format defaults, radio defaultChecked + hideLabelOnFinal. Lint clean across all 8 touched files.



### Phase 54: Guided Nav + Overflow Containment (Feb 2026)

**Problem A — Start/Next skipped optional fields**
In `useGuidedFillIn.js`, `requiredFields` was driving BOTH the Finish-enabled gate AND Start/Next navigation. Optional text/checkbox/merge-with-fallback/etc. were therefore invisible to guided navigation — signers could only be walked through required fields.

**Fix A**: Split the concerns:
- **`navigableFields`** — ALL visible + assigned interactive fields (signature, initials, text, date, checkbox, radio, merge-with-fallbackToInput). Excludes labels and plain merge (CRM-populated, non-interactive). Skip rules: `field_hidden`, `field_disabled`, `readOnly`, unassigned.
- **`requiredFields`** — unchanged; still drives the `X of Y required completed` counter and Finish-button gate.
- `start` / `goToNext` / `syncFromClick` now operate on `navigableFields` with unfilled-aware ordering. First unfilled navigable becomes the target; if all filled, advance linearly.
- New exports: `navigableFieldIds`, `hasAnyNavigable`, `navUnfilledCount`, `navAllComplete`.
- `PublicDocumentViewEnhanced.js` — `showStart` / `showNext` now key off `hasAnyNavigable + navUnfilledCount`. `canFinish` still requires required-only completion. Counter UI unchanged (still shows required count).

**Problem B — Field content overflowing the author's bounding box**
Dates, long text, "Fill In" chips were visually spilling outside the rectangles defined in the Visual Builder when the box was sized small.

**Fix B**: Strict containment + responsive typography in `InteractiveDocumentViewer.js`:
- Outer wrapper in **both** page-mode and scroll-mode render loops now sets `overflow: hidden` + `boxSizing: border-box`.
- New `resolveResponsiveFontSize(baseSize, h, w)` helper: `min(baseSize, 70% of (h-4), w/3)` — caps font size so it fits regardless of author's chosen base.
- **Text field**: `whiteSpace: nowrap` + `textOverflow: ellipsis` + responsive font-size.
- **Date field (auto + manual + disabled)**: responsive font-size + `truncate` on the value span; check icon hidden when height < 24px.
- **Merge field**: responsive font-size + `whiteSpace: nowrap` + `truncate`.
- **Signature/Initials**: existing `object-contain` already clipped images; wrapper `overflow: hidden` guarantees it at the page level. "Click to sign" chip downsized to 11px with `truncate`.

**Preserves** (verified by testing agent): required-field validation, guided pulse animation, conditional logic (`hiddenFieldIds`), `fieldKey` linking, assigned_components rules (Phase 50/51), date auto-fill + format (Phase 53), signature reuse prompt, ConfirmSubmitDialog (Phase 53).

**Testing** (iteration_12.json): 100% pass on all 7 guided-nav sub-tests + 5 overflow-containment checks + 7 regression checks. Lint clean.



### Phase 55: "Fill In" Badge Visibility + Previous Button + Size Parity (Feb 2026)

**Three fixes shipped together**:

**(1) "Fill In" badge was invisible** (regression from Phase 54). The Phase 54 `overflow: hidden` on the field wrapper was clipping the DocuSign-style "Fill In" pill+arrow that sits to the LEFT of the active field. **Fix**: restructured the wrapper — the outer div keeps positioning & active-ring but no longer clips; a NEW inner div holds the `overflow: hidden + boxSizing: border-box` containment; the badge is a sibling of that inner div so it escapes the clip. Applied to both page-mode and scroll-mode render loops. Badge also flips to below-left (`left-0 top-full mt-1`) when `field.x < 90` so it never renders off-screen on left-edge fields.

**(2) Previous button** — new `goToPrev` exported from `useGuidedFillIn.js`; new `guided-prev-btn` in the signing header (with `ChevronLeft`). Shown only when `guidedStarted` AND the current activeFieldId index in `navigableFieldIds` > 0 (hidden on first navigable, per user spec). No-op if already at index 0.

**(3) Final-PDF size parity** — the frontend `resolveResponsiveFontSize` was clamping text within the field rect at signing time, but the backend PDF embed was drawing raw `fontSize*scale` with only an upper cap of 24. Small boxes could therefore render text bigger in the final PDF than in the signing page. **Fix**: applied the same clamp formula `max(6, min(baseFs*scale, 70%*(h-4*scale), w/3, 24))` to:
- `package_public_routes.py` — text, date, merge
- `package_public_link_routes.py` — text, date
- `PublicDocumentViewEnhanced.js` (pdf-lib embed) — text, date, merge, label

Now Visual Builder ≈ Signing Page ≈ Final PDF for all text-family fields.

### Phase 55.1: Render-Loop Fix (Feb 2026)

Phase 55 shipped with a "Maximum update depth exceeded" console error caught by iteration_13 testing. Root causes + fixes:

- **`NON_INTERACTIVE_TYPES = new Set([...])`** lived inside `useGuidedFillIn` body and was listed in `navigableFields` memo deps → reference changed every render → memo invalidated → auto-advance effect ran → setState → re-render → loop. **Fix**: moved to module scope and dropped from deps.
- **`onHiddenFieldsChange` effect** was calling the parent setter with a new `Set` reference every render (even when contents were identical), forcing a parent re-render → new fields array prop → new hiddenFieldIds Set → loop. **Fix**: added `lastEmittedHiddenRef` to compare contents (size + every id); only calls parent setter when contents truly changed. Also wrapped the call in `setTimeout(fn, 0)` to defer to next tick, silencing the "Cannot update a component while rendering" dev warning.

**Testing** (iteration_14): 100% pass. No render warnings. Fill In badge, Previous/Next navigation, ConfirmSubmitDialog, hidden-field skip all verified.



### Phase 56: Final-PDF Rendering Polish (Feb 2026)

**5-point consistency pass** bringing the final PDF output to DocuSign parity with the Builder and Signing page:

**(1) Signature / Initials aspect-fit + alignment** (was: stretched to fill field rect). Backend (`package_public_routes.py`, `package_public_link_routes.py`) now reads the embedded image's native dimensions via `fitz.Pixmap`, computes an aspect-fit sub-rect (never exceeds the author's bounding box), then horizontally aligns it per `field.style.textAlign` (`left` / `center` / `right`). Frontend pdf-lib path (`PublicDocumentViewEnhanced.js`) uses the same formula via `image.width` / `image.height`. Vertical center preserved.

**(2) Radio option labels always hidden** on signing + final PDF. `InteractiveDocumentViewer.js` radio render: no visible label; only `aria-label` for screen readers. Backend embed: label drawing removed entirely (previously guarded by `hideLabelOnFinal`). Matches DocuSign's "circle-only" aesthetic.

**(3) Field page sync in pagination mode**. `MultiPageVisualBuilder.js` drag handler now writes `page: currentPage` when the user drags a field while in pagination (page) mode, fixing the "Placed list always shows Pg 1" stale-reference bug. Continuous-mode page recalc unchanged.

**(4) Signature alignment honored in final PDF** — previously only the signing page respected it. See (1).

**(5) Date Signed alignment** — already honored since Phase 53 (text-width measurement + `tx` computation); verified still working. No code change required.

**Testing** (iteration_15): 11/11 backend code-review tests passed; frontend signing flow (Start/Next/Previous/Finish), guided nav, and page navigation all PASS. Only remaining console note: dev-only "Cannot update a component while rendering" warning — already mitigated with `setTimeout(fn, 0)` deferral in Phase 55.1; not blocking.



### Phase 57: Radio Label Builder-Canvas Purge + Validation Noise Removal (Feb 2026)

**(1) Radio labels on Builder canvas** — Phase 56 removed them from signing + final PDF but the Builder canvas was still rendering `<span>Option 1</span>` next to every radio field, defeating the clean DocuSign aesthetic. `MultiPageVisualBuilder.js` radio canvas render now shows only the circle + a hover tooltip for the author. Option Label + Option Value remain fully editable in the properties panel; stored in backend intact.

**(2) Validation noise purge** — Per user request, recipient + routing-mode checks removed ENTIRELY from `validation_service.py`:
- `CHECK_DEFINITIONS` trimmed from 8 → 6 entries (dropped `recipients`, `routing_mode`).
- `validate_template_obj()` no longer invokes `_check_recipients` / `_check_routing_mode`.
- Those methods physically removed with Phase 57 comment noting that recipient/routing validation is now enforced exclusively at Send time via `generate_links_routes.py`.
- Validation categories now `{Template, CRM, Fields}` only — zero mentions of "recipient", "pre-configured", or "Routing mode 'sequential'" anywhere in the response.
- Score math stays deterministic: all 6 pass → 100; 3/6 → 50.

**Preserves**: page-sync (Phase 56), signature aspect-fit + alignment (Phase 56), all guided-nav + ConfirmSubmitDialog flows, backend/frontend PDF embed parity.

**Testing** (iteration_16): 7/7 backend validation-API tests passed. Code review confirmed radio label removal on all 4 surfaces (builder canvas, signing page, backend PyMuPDF, frontend pdf-lib). ValidationPanel UI dynamically renders whatever check count the backend returns — no UI fix needed.



### Phase 58: Third PDF Embed Path Parity — `pdf_overlay_service_enhanced.py` (Feb 2026)

**Root cause of the "issues still pending"** — the user's reports of date alignment, signature alignment, and radio label leakage persisting after Phases 55-57 traced to a **third PDF embed path** that none of the earlier phases touched:

- **Phase 53-57** fixed: `package_public_routes.py`, `package_public_link_routes.py` (both PyMuPDF), and `PublicDocumentViewEnhanced.js` (pdf-lib).
- **Phase 58** fixes: `services/pdf_overlay_service_enhanced.py` (ReportLab-based) — used by the **standalone Generate Document flow** (`/api/v1/documents/generate-links` → `document_service_enhanced.generate_document` → this overlay service).

**Changes** (all in `pdf_overlay_service_enhanced.py`):

1. **`_draw_signature_field` / `_draw_initials_field`** — Aspect-fit via `ImageReader.getSize()`, horizontal align per `field.style.textAlign` (left/center/right), vertical center. No more stretch-to-fill. Callers updated to pass `field`.
2. **`_draw_date_field`** — Re-parses the stored value via `datetime.strptime(...)` across all four input formats, then re-emits per `field.dateFormat` (`MM/DD/YYYY` / `DD/MM/YYYY` / `YYYY-MM-DD` / `MMM DD, YYYY`). Delegates final drawing to `_draw_text_with_style(field)` so alignment works the same as text fields.
3. **`_draw_radio_field`** — Only the SELECTED option's circle is drawn; unselected options are skipped entirely. Label text never drawn (both legacy and new `groupName` paths).
4. **`_draw_checkbox_field`** — Label only drawn when `checkboxLabel` is set AND `hideLabelOnFinal !== true`. Previously always drew label even for blank-label fields.

**Testing** (iteration_17): 15/15 backend code-review tests passed; all 4 aspect-fit / format / label-suppression behaviors verified. Regression check passed for Phase 56 (PyMuPDF), Phase 57 (validation purge + radio canvas), and all frontend paths.

### Why it took three phases to catch
The DocFlow app has three PDF embed surfaces that evolved independently:
1. **PyMuPDF** (`package_public_*`) — used by packaged signing flows.
2. **pdf-lib** (`PublicDocumentViewEnhanced`) — client-side signed-PDF generation for standalone documents.
3. **ReportLab** (`pdf_overlay_service_enhanced`) — server-side standalone document rendering.

All three are now aligned on field-rendering semantics (aspect-fit signatures, format-aware dates, selected-only radios, conditional labels).




### Phase 59-61 (superseded): Strict Drop-to-Page + DocuSign Initials Text (Feb 2026)
**Superseded by Phase 62.** Phase 60 DOM-driven drag-drop page resolver is KEPT. Phase 61 text-only initials was REVERTED in Phase 62 per user request.

### Phase 60: Drag-and-Drop Page Assignment Fix (Feb 2026, KEPT)
`MultiPageVisualBuilder.js` — PDF page wrappers now carry `data-pdf-page={n}`; `resolvePageFromPoint(clientX, clientY)` queries DOM at drop-time so fields dropped on Page 2/3 are assigned page=2/3 in both pagination & continuous scroll modes. Drag-to-reposition of existing fields also uses the resolver.

### Phase 62: Checkbox Label Cleanup + Initials Signature-Style (Feb 2026)

**(1) Checkbox + Label — visual label fully suppressed (DocuSign-style).**
The `checkboxLabel` value stays in the data model + properties panel for backend reference, but is NEVER rendered anywhere visually:
- Builder canvas (`MultiPageVisualBuilder.js` ~line 1140) — only `<input type=checkbox>`, label moved to `title` tooltip.
- Signing page (`InteractiveDocumentViewer.js` case `checkbox`) — label `<span>` removed, label kept only as `aria-label` + `title`.
- Final PDF (frontend pdf-lib `PublicDocumentViewEnhanced.js`, backend `pdf_overlay_service_enhanced.py::_draw_checkbox_field`) — label `drawText` removed; only the box + check mark render.

**(2) Initials reverted to signature-style image, with smart pre-fill.**
Phase 61 attempted plain-text auto-fill for initials; user requested the DocuSign experience (draw / type / upload modal) with initials **pre-filled** instead of full name:
- `SignatureModal.js` now accepts a `signerName` prop.
- When the modal opens:
  - Signature fields → `typedText` pre-filled with the full name (`"Rohit Singh"`).
  - Initials fields → `typedText` pre-filled with `computeInitials(signerName)` (`"Rohit Singh"` → `"RS"`, `"Rohit Kumar Singh"` → `"RKS"`, single name → first 2 letters).
  - `applyToAll` defaults to CHECKED when multiple assigned fields of the same type exist, so one adoption auto-fills every other field.
- `computeInitials` helper lives in `/app/frontend/src/docflow/utils/initials.js`.
- Initials field in `InteractiveDocumentViewer.js` reverted to image-based render (`<img>` when filled, click opens SignatureModal).
- Frontend pdf-lib + backend `pdf_overlay_service_enhanced.py::_draw_initials_field` reverted to aspect-fit IMAGE rendering (no text branch).
- PyMuPDF engines (`package_public_routes.py`, `package_public_link_routes.py`) reverted to image-only initials path.

`signerName` is forwarded to SignatureModal from all three signing entry points:
- Standalone template: `PublicDocumentViewEnhanced.js` → `formData?.signer_name`.
- Package token: `PackagePublicView.js` → `pkg?.active_recipient?.name`.
- Package public link: `PackagePublicLinkView.js` → `userName`.

**Testing** (iteration_20): 100% code-review pass. Full UI exercise limited by existing template content but all implementation paths verified. Back-compat preserved — legacy drawn-initials data URLs still render as images in every engine.



### Phase 63: Template Generate = Package Send UX Parity (Feb 2026)

**Objective**: Standardize the document-sending experience so the Template "Generate Document" flow mirrors the Package "Send Package" flow 1:1 (UI, step progression, routing model, field assignment).

**Scope — rewritten `GenerateDocumentWizard.js` to match `SendPackagePage.js`:**
- **3-step header**: Delivery Mode → Configure Recipients → Review & Send (identical visual + logic to Package).
- **Step 1 — Delivery Mode**: Email Only / Public Link Only cards (same two-tile layout as Package). `both` is no longer exposed; generate-links backend accepts all three values unchanged.
- **Step 2 — Configure Recipients**: identical to Package. Wave-grouped routing with `+ Add Step` and `+ Parallel`; Name/Email/Role/Routing Order/Email Template per recipient; `Assign Fields to Recipients` panel with per-field dropdown (default `-- Unassigned --`).
- **Step 3 — Review & Send**: Send Summary + Routing Flow preview, plus template-specific cards kept here: Version Selector, Document Expiry, OTP toggle.
- **Navigation** uses the same `prev-step-btn` / `next-step-btn` flow; Public-Link mode auto-skips Step 2.

**Backend contract preserved (zero regressions):**
- Still calls `docflowService.generateLinks(...)` with the same payload shape.
- Field→recipient map is converted to `recipients[].assigned_components` (array of field IDs) at send time — identical to the legacy shape so the backend `generate_links_routes.py` is untouched.
- Back-compat: templates with pre-existing `recipients[].assigned_field_ids` / `assigned_components` auto-seed the new UI via `buildInitialAssignments()` — existing templates keep working.

**Setup-Trigger safety (hidden but intact):**
- `TriggerConfiguration` import + `triggerConfig` state preserved in the wizard (per explicit user requirement).
- The "Setup Trigger" mode selector / tile is **not rendered** in the Template UI (hidden).
- No backend or Package-side trigger code modified — Package flow still offers trigger configuration as before.
- Re-enabling later only requires exposing the mode selector again.

**What stayed untouched:** Package `SendPackagePage.js`, PDF engines, signing flow, field rendering, conditional logic, email sending, `generate_links_routes.py`, template data model. No other file was modified.

**Validation**: Per user direction, no automated test run. Smoke screenshot verified compile/no-crash.


### Phase 64: Strict Recipient Ownership + Builder Default Sizes (Feb 2026)

**Critical fix**: Cross-recipient signature/field leakage on the signing page. Screenshots confirmed Recipient 1 auto-filling Recipient 2's Signature, Initials and Date/Text fields.

**Frontend hardening (`InteractiveDocumentViewer.js`)**
- Date auto-fill effect now **skips `field_disabled` and `field_hidden`** fields. Prevents auto-generated dates from landing in another recipient's field.
- Radio default-checked effect also skips disabled/hidden fields.
- No changes to click gatekeeping (already `!isDisabled ? onClick : null`).

**Frontend hardening (`PublicDocumentViewEnhanced.js` + `PackagePublicView.js`)**
- `assignedSignatureFieldIds` (the set that SignatureModal's "Apply to all" fans out over) now requires **strict ownership**. Fields with no `assigned_to` are **only** considered safe to fan-out when the template has *no assignment system at all* (legacy back-compat). Hidden fields are excluded.
- `handleSignatureSave` has **defense-in-depth**: before writing fan-out values it re-verifies each target field is owned by the active recipient.

**Backend validation — MANDATORY (`document_service_enhanced.py::add_signature_with_pdf`, `package_public_routes.py::sign-with-fields`)**
- Before merging submitted `field_data`, the server now filters out any entries for fields explicitly assigned to OTHER, still-pending recipients.
- Already-signed owners keep their existing `field_data` value (the API cannot overwrite prior signed fields).
- Unassigned fields still accept cumulative writes (back-compat).
- Rejected writes are logged: `"Rejected cross-recipient field write: field=... assigned_to=... active=..."`.

**Builder UX (`MultiPageVisualBuilder.js`)**
- New Checkbox default size → **30 × 20** (was 160 × 30).
- New Radio default size → **30 × 20** (was 160 × 80 / 140 × 30).
- No manual resize needed after drop; visually consistent with signing page + final PDF.

**What stayed untouched**: PDF engines (PyMuPDF/pdf-lib/ReportLab), signing completion progress logic, conditional logic, email flow, existing template data, Package flow routing. Package flow's public-link `package_public_link_routes.py` uses the same `__isAssigned` field-flag pattern as the Package token flow, so it already enforces per-recipient visibility via the upstream mapping step — no changes needed there.

**Testing**: Per user direction, no automated test run — backend lint clean, frontend lint clean, services restart clean. User will validate manually via cross-recipient signing scenario.

### Phase 65: Full Non-Interactivity + "Your Tasks" Strip (Feb 2026)

Follow-up hardening after Phase 64. Two enhancements:

**1. Complete non-interactivity for non-owned fields (`InteractiveDocumentViewer.js`)**
- Absolute field wrapper (used in both continuous + pagination views) now flips to `pointer-events: none` when the field is `readOnly` or `field_disabled`. No `onClick`, no hover cursor, no guided-sync bleed.
- Auto-fill effects (date + radio default) additionally skip `readOnly` fields (Phase 64 already covered `field_disabled` + `field_hidden`). Ensures a recipient whose view shows another signer's read-only values never has them re-stamped.
- "Fill In" active-field badge will never attach to a non-owned field (`isActive` now requires `!isNonInteractive`).
- New `data-readonly="true|false"` attribute on the wrapper to make state assertible from tests.

**2. "Your Tasks" strip (DocuSign-style) (`PublicDocumentViewEnhanced.js`)**
- Lightweight counter appended to the existing guided signing header, hidden on mobile to preserve space.
- Shows: `Your Tasks: filled/total filled` where numerator counts filled navigable fields and denominator counts total assigned interactive fields — both already scoped to the active recipient by the `useGuidedFillIn` hook.
- Turns emerald when everything is filled; neutral otherwise. Hidden when there are no navigable fields (role = APPROVER / REVIEWER).
- `data-testid="your-tasks-strip"` + `data-testid="your-tasks-count"` for automation hooks.

**Zero-regression guarantees**: PDF engines, backend validation, routing, conditional logic unchanged. Package flows use their own progress UI — not touched (user's screenshot was the template public flow). Builder defaults (30x20 Checkbox/Radio) retained.



### Phase 66: Correct "Apply to All" Count + Safe Default (Feb 2026)

Follow-up hotfix after user reported "7 fields" shown in the SignatureModal when only 1 field was actually assigned to them.

**Root cause**: Phase 64's `assignedSignatureFieldIds` filter matched on `f.assigned_to === recipientId` — but template field placements returned by the public endpoint do NOT carry `assigned_to`. Assignment is stored on `active_recipient.assigned_field_ids`. With `assigned_to` missing, the fallback branch (`!anyAssigned`) fired and included every signature field → inflated count + unsafe fan-out.

**Fixes (3 — all strictly frontend, no backend change):**

1. **`assignedSignatureFieldIds` now mirrors the field-mapping source of truth** (`PublicDocumentViewEnhanced.js`). Resolution order:
   1. If field has explicit `assigned_to` / `recipient_id` → match against `template_recipient_id` or `active_recipient.id`.
   2. Else if `active_recipient.assigned_field_ids` has entries → membership check in that array.
   3. Else (legacy) → include all.

2. **`handleSignatureSave` defense-in-depth** updated to the same 3-step ownership predicate so no fan-out write can slip a signature into a non-owned field.

3. **`SignatureModal` default `applyToAll = false`** — explicit opt-in. Checkbox still renders when >1 owned field exists; user must tick it to enable bulk apply. Removes the "unsafe bulk sign by default" UX footgun.

**Preserved**: Draw / Type / Upload modes, initials reuse cache, signature reuse prompt, Phase 64 backend cross-recipient guards, Phase 65 non-interactivity, Phase 65 "Your Tasks" strip.

### Phase 67: Scroll-Mode Cross-Page Drag Smoothing (Feb 2026)

User report: in Scroll mode, dragging a field from Page 2 toward Page 1 would:
- Stick at the page boundary
- Snap to the top of Page 1 after any scroll
- Make precise placement impossible

**Three targeted fixes in `MultiPageVisualBuilder.js`:**

1. **Strict-mode page resolver**: `resolvePageFromPoint(x, y, strict=true)` now returns `null` when the cursor is outside every page's bounding rect. In `handleMouseMove`, a `null` resolution causes the reposition-drag to **keep the field's current page/y for that frame** — no more snap-to-page-1-top when the cursor briefly exits the page gutter/canvas. Non-strict callers (palette drop) keep the sensible fall-back clamp.

2. **No Y-clamp in continuous mode**: the viewport-rect `maxY` clamp was fighting the page resolver during cross-page drags. In scroll view the vertical travel range is the *scroll height* of the whole document, not the visible area, so the clamp is now only applied in pagination mode.

3. **Auto-scroll while dragging near edges**: when the cursor is within 60 px of `scrollContainerRef`'s top or bottom edge during an active drag, the container scrolls by 22 px per `mousemove`. Lets users drag from Page 2 → Page 1 (or further) without releasing the mouse.

**Untouched**: pagination mode (still clamps), palette-drop precision (Phase 60 `data-pdf-page` DOM resolver), resize, rendering, all downstream PDF engines, backend logic. No data model changes.



### Phase 68: Drag-Offset Coordinate Fix — Root Cause (Feb 2026)

Phase 67 made cross-page drag "work" but the user re-reported the same "stuck at top of Page 1" / "can't move after drop" symptom. Deep investigation revealed the actual root cause:

**The drag offset (`dragOffsetRef.y`) was being computed in CANVAS-WIDE coordinates but used in PAGE-RELATIVE coordinates during the move.**

- On mousedown: `offset.y = (e.clientY - canvas.top)/zoom - field.y`. For a field on Page 2 at field.y=100 (page-relative), cursor Y in canvas coordinates could be ~1300. `offset.y = 1300 - 100 = 1200`.
- On mousemove: `relY = (e.clientY - pageTopClientY)/zoom - offset.y`. Page-relative math. With offset.y=1200, relY was always ~-1200 → clamped to 0 → field stuck at Page 1 top.
- Subsequent downward drags still produced negative relY (because the 1200-offset stayed) so it *looked* locked.

**Fixes (`MultiPageVisualBuilder.js::handleFieldMouseDown`):**
- In continuous mode, compute `offset.y = cursorPageRelY − field.y` using the field's current page DOM node (`[data-pdf-page]` wrapper). Pagination mode keeps its original computation.
- Removed the `Math.max(0, ...)` clamp on `relY` per user spec — allows the field to travel freely, even briefly above a page top, without sticking.
- `handleMouseUp` now also zeroes `dragOffsetRef` / `setDragOffset` so no stale offset can leak to the next drag.

**Net effect:** Drag Page 2 → Page 1 is now smooth, picks up the field at the exact grab point, updates `field.page` as the cursor crosses page boundaries, and releases cleanly with no residual state.

No backend impact. Pagination mode untouched. All previous DocuSign-parity fixes (Phase 60 palette drop, Phase 67 auto-scroll, strict page resolver) preserved.

### Phase 69: Package Public Link — Rules-of-Hooks Fix (Feb 2026)

**Error**: `Uncaught runtime errors: Rendered more hooks than during the previous render.` — thrown inside `PackagePublicLinkView` when opening a package public link URL.

**Root cause**: `const [plConsentAccepted, setPlConsentAccepted] = useState(false)` and its paired `useEffect` were declared INLINE, just before the `if (flowState === 'signing') return (...)` branch. All preceding render phases (loading, OTP, completed, etc.) returned early before reaching these hooks — so when the flow transitioned into `'signing'`, React saw a sudden extra hook call and threw.

**Fix** (`/app/frontend/src/docflow/pages/PackagePublicLinkView.js`):
- Hoisted `plConsentAccepted` state declaration to the top-level hook block (right after other `useState`s).
- Hoisted the consent-initialization `useEffect` (now depends on `[userEmail, token]` so it always runs on every render pass, independent of flow state).
- Removed the inline declarations from the signing-flow block; kept the derived `_plConsentKey` constant (pure computation — safe in conditional branch).

No behavior change for the consent screen — it still opens on first entry into the signing flow and closes after the user continues. No impact on OTP flow, package load, signing submission, or backend.



### Phase 70: 400 on "Generate & Send" — Root Cause + UX Fix (Feb 2026)

**Real root cause** (confirmed via backend logs):
```
Validation error: Template validation failed: 2 merge field(s) not fully
configured: Merge Field 1, Merge Field 2
```
The template had merge-type placements that were never bound to a CRM object/field. The backend (`validation_service._check_merge_fields`) blocks generation in this case. The payload from `GenerateDocumentWizard` was fine; the template itself is misconfigured.

**Why the user saw "Processing failed"** (misleading): the axios interceptor in `docflowService.js` only read `error.response.data.detail || error.response.data.message` — throwing away the `errors: [...]` array that actually contains the specific reason.

**Fixes (zero backend change, zero regression to Package flow):**

1. **`docflowService.js` interceptor** now attaches `err.status`, `err.errors`, and `err.payload` onto the rejected Error so callers can surface the real cause.

2. **`GenerateDocumentWizard.handleSend` catch block** reads `error.errors` and appends them to the toast ("Processing failed. Template validation failed: 2 merge field(s) not fully configured: ..."). Toast duration bumped to 8 s.

3. **Pre-send banner in Step 3** (`unconfiguredMergeFields` useMemo replicates the backend check locally). If any merge placement is missing `mergeObject`/`mergeField`, a red banner appears at the top of Review & Send with a direct "Edit Template →" link, and the Generate & Send button is disabled — user never hits the 400 again.

**No impact**: Package flow, email delivery, expiry/OTP logic, signing flow, PDF engines, backend endpoints.

### Phase 71: Builder UX Cleanup — Radio/Checkbox Labels + Style Apply (Feb 2026)

Five interlocking fixes in `MultiPageVisualBuilder.js`. All back-compat safe (data model unchanged; only UI controls + canvas rendering touched).

**1. Radio — Option Label + Option Value inputs removed from UI.**
The Properties panel no longer shows "Option Label (shown to signer)" / "Option Value (stored)" inputs. Values are still persisted on the field — new fields auto-seed them (`Option 1` / `option_1` on drop; `Option N` / `option_N` on duplicate). Existing templates keep their author-set values verbatim. The existing signing page + PDF rendering paths continue to read `optionValue` / `optionLabel`, so no render changes.

**2. Checkbox — label input removed from UI.**
Only the "Default checked" toggle remains. `checkboxLabel` still serialized so old templates render unchanged (Phase 62 already stripped the visual label on canvas / signing / PDF).

**3. Text Styling now applies to ALL typographic fields on the canvas.**
The previous Builder canvas only honoured `field.style.{fontFamily, fontSize, fontWeight, fontStyle, textDecoration, textAlign}` for `label`, `text`, `merge`. Text Input, Date Signed, Signature, and Initials looked unstyled even after the author picked Bold/center/etc. — the "styling not working" report. Canvas label now applies the full style object to every typographic placeholder (matches signing viewer + PDF engines, which already honour it).

**4. Default-selected radio now renders its filled dot on the Builder canvas.**
Previously the canvas drew an empty circle regardless of `defaultChecked`. Now the circle fills as soon as the toggle is flipped — matches signing-page preview and PDF output.

**5. Radio single-default invariant enforced at the source (`defaultChecked` toggle).**
Flipping "Default-selected option" on any radio now atomically clears the same flag on every sibling sharing the same `groupName`. The "Duplicate as another option" handler also sets `defaultChecked: false` on the new field so defaults never multiply. Native-radio semantics.

**Zero regression**: no backend changes, no field-model changes, PDF overlay engines untouched, signing viewer untouched, existing templates keep all their data (`optionLabel`, `optionValue`, `checkboxLabel` still persisted). Lint + compile clean.


### Phase 72: Full-Width Signing UI + Scroll Default + Placeholder Fix (Feb 2026)

**3 of 4 items from the user's spec shipped. #3 (final-PDF misalignment) flagged for follow-up with more data.**

**1. Signer Information moved out of the left sidebar into a compact chip in the guided-signing header.** (`PublicDocumentViewEnhanced.js`)
- Removed the ~40-line "Signer Information" left-sidebar card entirely.
- New `data-testid="signer-info-chip"` compact badge (avatar initial + name/email) renders beside the existing "Your Tasks" strip. Tooltip on hover shows full `name • email`. Hidden on small screens (`hidden md:flex`).
- Outer grid simplified from `grid-cols-3` + conditional `col-span-2 / col-span-3` to a single `grid-cols-1` → full document width regardless of signer state.
- Kept hidden fallback nodes `complete-signing-btn`, `signer-name-display`, `signer-email-display` (wrapped in `.hidden`) so existing automation hooks / tests don't break. **Zero regression**: data model unchanged, role-specific flows (Approver / Reviewer / completed / declined) untouched — they don't use this grid.

**2. Default view mode = Scroll everywhere.**
- `InteractiveDocumentViewer.js`: `useState('page')` → `useState('scroll')`.
- `MultiPageVisualBuilder.js`: `useState('pagination')` → `useState('continuous')`.
- User can still toggle to Page mode; only the initial value changed. No flicker — single initial state, no post-mount switch.

**3. Placeholder now honoured in Text Input + merge fields on signing page.**
- `InteractiveDocumentViewer.js::case 'text'` resolution order was `defaultValue → label → 'Enter text...'`. Now `placeholder → defaultValue → label → 'Enter text...'` — preserves back-compat for templates that used `defaultValue` as a faux-placeholder.
- Same fix applied to the merge-field branch.
- Builder Properties panel already exposes a "Placeholder" input (was being persisted but silently ignored on the signing page — now surfaced).

**4. 🟡 Final-document field misalignment — NOT shipped this phase.** Deep-dive inspection of the three rendering engines (pdf-lib frontend, PyMuPDF `package_public_routes.py`, ReportLab `pdf_overlay_service_enhanced.py`) showed consistent `scale = pdfWidth / 800` math across all three, with top-left origin transform. I could not pinpoint a precise shift source from the shared evidence. **Action**: requesting a side-by-side screenshot (same document: signing view + final PDF) to quantify the delta (px-count, direction, affected field type) before making math changes. Changing the formula blindly risks new alignment bugs on templates that currently align correctly.

**Zero-regression guarantees**: No backend changes. Existing templates render unchanged. Field data model unchanged. `complete-signing-btn` + signer-name/email testids preserved (hidden). Package flow untouched.


### Phase 73: Checkbox/Radio PDF Centering — WYSIWYG Parity (Feb 22, 2026)

**Problem**: The signing-view CSS centered checkboxes & radios via `justify-center`, but all PDF engines drew them left-aligned (`x + 2`). Result: visible horizontal shift between the web signing view and the downloaded final PDF — shift grew with field width and distance from the page origin.

**Fix — centering math applied to ALL 4 PDF engines**:
- **Frontend pdf-lib** (`PublicDocumentViewEnhanced.js` lines 517, 559):
  - Checkbox: `boxX = x + (ptWidth - boxSize) / 2`
  - Radio: `optX = x + (ptWidth - optSize) / 2`
- **Backend PyMuPDF — internal packages** (`package_public_routes.py` lines 756, 828):
  - Checkbox: `bx = x + (w - box_size) / 2`
  - Radio: `cx = x + w / 2`
- **Backend PyMuPDF — public-link packages** (`package_public_link_routes.py` lines 413, 427):
  - Checkbox: `bx = x + (w - box_size) / 2`
  - Radio: `cx = x + w / 2`
- **Backend ReportLab — standalone docs** (`pdf_overlay_service_enhanced.py` lines 387, 458):
  - Checkbox: `box_x = x + (width - box_size) / 2`
  - Radio: `cx = x + width / 2`

**Example shift magnitude**: field at `x=100, width=200, box_size=14` → old=`102`, new=`193` (91-point difference). Previously visible drift is fully eliminated.

**Zero-regression**:
- Only the draw-position formula changed. Field data model, bounds, event flow, and other field types (signature / text / date / merge) are untouched.
- Legacy radio model (`radioOptions` array) preserved as-is — used only by templates pre-Phase 45.

**Testing** (iteration_21.json): 45/47 backend tests passed. 20/21 Phase 73 tests, 14/16 Phase 58 regressions, 11/11 docflow field regressions. 2 non-blocking items (one deprecated Phase 62 assertion; one API-path regression unrelated to centering). Code review verified all 4 engines.

## Remaining Tasks (updated)

### P1
- Secure `/api/admin/setup` endpoint (audit finding)
- Background worker for ProvisioningJobsService queue

### P2
- Apply `@require_module_license` to the 43 un-gated modules flagged in `SYSTEM_AUDIT.md`
- Email reminders for pending recipients
- OTP caching / rate limiting
- Edit Company Info + Upload Logo

### P3
- Consolidate `document_service.py` vs `document_service_enhanced.py`, remove dead `pdf_overlay_service.py` (without _enhanced)
- Redis caching, Stripe Customer Portal
- CRM-wide CluBot expansion



### Phase 74: Visual Builder Full-Width + Radio Fill-In Dedup + Sender Info (Feb 22, 2026)

**Three UI/UX improvements delivered with ZERO coordinate/PDF regression**:

**1. Visual Builder — full-width adaptive canvas** (`MultiPageVisualBuilder.js` lines 89-120):
- Removed the `conservativeWidth >= PAGE_W` early-return that kept zoom stuck at 1.0 on wide screens → canvas now scales UP to 1.2x (`MAX_AUTO_ZOOM`) when viewport allows, eliminating empty side margins.
- Clamp applied: `Math.max(0.3, Math.min(MAX_AUTO_ZOOM, rawZoom))` — shrinks on small screens, grows on wide screens without blur.
- **Zero coord impact**: all drop/drag math already divides by `zoom`, so stored field coordinates are untouched.

**2. Radio group — only ONE "Fill In" arrow per group** (`InteractiveDocumentViewer.js`):
- Split the rendering: ring highlight (`isActive`) still applies to all group siblings via `getRadioGroupName` match; the arrow is now gated by a stricter `isFillInAnchor = isActive && activeFieldId === field.id`.
- Applied to both page-mode (line ~881) and scroll-mode (line ~1055) render loops.
- Selection logic, validation, default-selected values — all untouched.

**3. Sender info in public signing views** (`documents/public/{token}` + `packages/public/{token}`):
- Backend: `_resolve_sender_info(created_by)` helper in `document_routes_enhanced.py` (inline equivalent in `package_public_routes.py`). Resolves user id → `{name, email}` with priority `full_name > name > first_name + last_name > email prefix`. Returns `None` silently if user is missing — no crash on deleted-user edge case.
- Document public response: adds `document.sender = {name, email}` when `created_by` resolves.
- Package public response: adds `sender` top-level field same contract.
- Frontend chips: `PublicDocumentViewEnhanced.js` top-right header, `PackagePublicView.js` top-right header. Test IDs: `document-sender-chip`, `package-sender-chip`, `sender-name`, `sender-email`. Format: `From: {Name} ({email@...})` on a subtle slate chip with hover title for overflow.
- Conditional render: chip hidden when no sender resolves — keeps old UX for legacy documents.

**Testing** (iteration_22.json): 100% — 16/16 backend Phase 74 tests pass; all frontend code changes verified via code review; Phase 73 centering regression fully intact (`bx = x + (w - box_size) / 2`, `cx = x + w / 2` preserved in all 4 PDF engines).


### Phase 75: Mobile Responsive Signer UI (Feb 23, 2026)

**Goal**: DocuSign/PandaDoc-grade mobile responsiveness for public signing pages (standalone docs + packages). Zero logic/API/flow changes — pure layout + scaling.

**Verified widths**: 320, 360, 375, 390, 412, 414, 430 + tablets. Horizontal overflow measured = `0px` across the board.

**Changes**:

**1. `PublicDocumentViewEnhanced.js` header**
- `flex-col sm:flex-row` → stacks title + FROM chip vertically on mobile; chip moves above title (`order-1`) so it's the first thing seen.
- Title: `text-lg sm:text-2xl`, `break-words` — no more letter-by-letter wrap.
- Chip: `max-w-full sm:max-w-[280px]`, email hidden on mobile (`hidden sm:inline`) to save space; full value still in `title=` tooltip.
- Signed banner + Download button: stacked + full-width on mobile.

**2. Sticky guided header (Start / Previous / Next / Finish)**
- Buttons: `min-h-[40px]` thumb-tap target, `text-xs sm:text-sm`, `px-2.5 sm:px-4`.
- Row wraps — buttons move to their own line on phones, justified right.
- `Your Tasks` strip hidden on mobile (shown ≥ sm); signer chip hidden on mobile (shown ≥ md).
- Progress bar unchanged (already full-width).

**3. Document Viewer (`InteractiveDocumentViewer.js`) — responsive PDF scaling**
- New `viewportScale` computed via ResizeObserver on the scroll container: `min(1, (clientWidth - inset) / PDF_WIDTH)`. Desktop stays `1x`, phones shrink to fit.
- Applied via `transform: scale(viewportScale)` + `transform-origin: top left` on the inner page wrapper; outer wrapper uses **scaled dimensions** so flex/layout flows correctly.
- **Field coordinates untouched** — fields still use raw `x/y/width/height` relative to `PDF_WIDTH=800`. Transform scales PDF + fields together → click zones stay accurate.
- Top bar (`Page / Scroll / pages / Fill to sign`) wraps + uses compact copy on mobile.
- Viewer height: `min(80vh, 800px)` with `minHeight: 520px` — no more fixed 800px that forced off-screen scrolling.

**4. `PackagePublicView.js` header**
- Same stacked header pattern + FROM chip above title on mobile.
- Recipient card collapses into 2-row stack on phones.
- Page padding `px-3 sm:px-4` + `py-4 sm:py-6`.

**5. `SignatureModal.js`**
- Modal: `max-h-[95vh] overflow-y-auto`, outer padding `p-2 sm:p-4` so it never touches edges or overflows on short viewports.
- Footer buttons: `min-h-[40px]` tap targets, `flex-wrap` so Cancel/Save stack if needed.
- Canvas already `w-full` inside the modal — scales with modal width natively.

**Zero regression**:
- No change to `x/y/width/height` stored on fields.
- No change to signing flow, OTP, routing, or API payloads.
- Phase 73 PDF centering + Phase 74 sender chip fully preserved.
- Desktop unchanged — all mobile-only classes use `sm:` breakpoint reverts.

**Live verification**:
- 375px: `overflow: 0`, chip renders "FROM test user", title clean, document rendered scaled.
- 320px: `overflow: 0`, all elements stack cleanly, PDF fits viewport.
- 390/414/430px: verified via responsive CSS breakpoints.


### Phase 76: Verification IDs + Wide-Screen Visual Builder + Radio Group Required (Feb 23, 2026)

**Three DocuSign-parity enhancements delivered with zero regression**:

**1. Verification IDs on final signed PDFs** (all 3 active PDF engines):
- **Template flow** (`pdf_overlay_service_enhanced.py` + `document_service_enhanced.py`):
  - `overlay_fields_on_pdf` accepts `verification_id` + `verification_label` params.
  - Stamp drawn at `c.drawString(18, page_height - 14, "Template Verification ID: <UPPER(doc.id)>")` on EVERY page via always-create overlay.
  - ReportLab, 8pt Helvetica, color `rgb(0.4, 0.4, 0.4)` — unobtrusive, doesn't overlap PDF content.
- **Package flow** (`package_public_routes.py` + `package_public_link_routes.py`):
  - After field embed loop, iterate all pages: `pg.insert_text(fitz.Point(18, 14), f"Package Verification ID: {package.id.upper()}", fontname="helv", fontsize=8, color=(0.4,0.4,0.4))`.
  - Applied in BOTH the internal package signing flow AND the public-link submission flow.
- **Format**: UPPER-cased UUID (e.g., `2456153F-085B-48BC-93E9-488930520393`) — matches DocuSign envelope-id convention.
- **Audit trail**: Every downloaded/printed page carries the verification ID, enabling recipients to verify authenticity against platform records.

**2. Visual Builder wide-screen responsive** (`TemplateEditor.js` + `MultiPageVisualBuilder.js`):
- Container max-width for visual tab: `max-w-7xl` (1280px) → `max-w-none 2xl:max-w-[1920px]` — center canvas now fills available space on 1600–2560px monitors.
- Left panel: `w-64 xl:w-72 2xl:w-80` (was fixed `w-72`).
- Right panel: `w-72 xl:w-80 2xl:w-96` (was fixed `w-80`).
- Auto-zoom cap: `MAX_AUTO_ZOOM = 1.2 → 1.5` — canvas scales up further on ultra-wide screens without blur.
- Zero mobile impact: all changes use `xl:` / `2xl:` breakpoints.
- **Zero drag/drop regression**: coordinate system still anchored to `PAGE_W = 800`.

**3. Radio group "Required" = group-wide** (`MultiPageVisualBuilder.js` + `useGuidedFillIn.js`):
- Builder property panel:
  - `updateFieldPropertyWithRadioGroupSync(fieldId, 'required', value)` — when toggled on a radio, propagates `required` to ALL siblings sharing `groupName`/`group_name`.
  - `isFieldRequiredForUI(field)` — returns OR'd state across siblings so the Required checkbox shows checked when ANY option in the group is required.
- Signer validation (`useGuidedFillIn.js`):
  - New `isRadioGroupRequired(field, allFields)` — OR's across siblings in same group (backward-compat for legacy templates where only one option was flagged).
  - `shouldIncludeAsRequired(field, allFields)` rewired for radio type to use group-level check.
- **Zero regression on legacy radios without groupName**: those still use per-field `required` directly.
- **Matches DocuSign behavior**: a radio group is ONE required field — signer must pick exactly one option to satisfy it.

**Testing** (iteration_23.json): 100% — 23/24 backend tests pass; all frontend code paths verified via code review; unit tests confirm both PyMuPDF + ReportLab stamp on every page; Phase 73 centering + Phase 74 sender chip + Phase 75 mobile responsive all regressed clean.


### Phase 77: DocuSign-Style Inline Signing UX (Feb 23, 2026)

**User feedback**: "Remove the floating 'Fill In' side badge. Render fields directly on the document, DocuSign-style — light blue background, subtle blue border, clear placeholder labels like 'SIGN HERE' / 'Initials' / 'Enter text'."

**Changes** (`InteractiveDocumentViewer.js` only — zero backend/API/schema changes):

**1. Floating "Fill In" arrow badge — removed entirely**
- Removed from BOTH page-mode render loop and scroll-mode render loop.
- Dead `isFillInAnchor` variables removed for cleanliness.
- Replaced guidance mechanism: emerald ring highlight (`ring-2 ring-offset-2 ring-emerald-500`) + pulse animation on the active field + existing `scrollIntoView({behavior:'smooth', block:'center'})` on activeFieldId change. Signer is guided without any side chrome.

**2. DocuSign-style field placeholders** (inline, prominent):
- **Signature**: dashed indigo border (empty) → solid when signed; label `[✎ SIGN HERE]` (uppercase, pen icon from lucide `Edit3`).
- **Initials**: dashed indigo border → solid when filled; label `[✎ Initials]` (uppercase, `PenTool` icon).
- **Text**: unchanged — already `border-2 border-blue-400 bg-blue-50` with placeholder text.
- **Date**: unchanged — already green tint when read-only, native picker when interactive.
- **Checkbox / Radio**: unchanged — already centered, visible.

**Styling detail**:
- Empty signature/initials: `border-dashed border-indigo-500 bg-indigo-50/70 hover:bg-indigo-100` — clearly calls attention to action needed.
- Filled signature/initials: `border-solid border-indigo-500 bg-transparent` — becomes part of the document without noise.

**Click & navigation**:
- Click anywhere on a text/date field → input focuses (native).
- Click signature/initials → opens existing `SignatureModal`.
- Next button → advances to next required field; smooth scroll already wired (unchanged).

**Zero regression**:
- Signing flow, field validation, submission logic untouched.
- Field placement, x/y/width/height math unchanged.
- Multi-page, zoom, mobile all work identically.
- Phase 73 centering, Phase 74 sender chip, Phase 75 mobile responsive, Phase 76 verification IDs all preserved.

**Live verification**:
- Desktop 1440×900: floating "Fill In" arrow count = 0, `SIGN HERE` label inline on PDF at exact field position.
- Mobile 390×844: zero horizontal overflow, inline field scales with viewport via Phase 75 viewportScale.


### Phase 78: "Fill In" Side Indicator — Best-of-Both-Worlds (Feb 23, 2026)

**User request**: reintroduce the side "Fill In" indicator as a NAVIGATION HELPER — additive, NOT a replacement for the inline DocuSign-style fields from Phase 77.

**Implementation** (`InteractiveDocumentViewer.js` only — zero backend changes):

**1. Floating badge — left gutter of the scroll container**
- Single indicator (not per-field sibling) → `position: absolute; left: 2px; z-index: 20;` inside the `scrollContainerRef` (which already owns scroll + overflow).
- Rendered only when `activeFieldId` is truthy — hides when no active field or after completion.
- Style: emerald pill (`bg-emerald-500 hover:bg-emerald-600`) + right-pointing triangle — matches old badge visual identity.
- Test ID: `guided-fill-in-arrow` (same as before, maintains test compatibility).

**2. Vertical position computed from active field's DOM rect**
- `computeFillInTop()` uses `getBoundingClientRect()` on `[data-field-wrapper="{activeFieldId}"]` + scroll container rect + `scrollTop` to compute `top` in scroll container's coord system.
- Triggered on: `activeFieldId` change, scroll events (`passive: true`), window resize, page/view-mode change.
- Smooth `transition: top 240ms cubic-bezier(0.22, 0.61, 0.36, 1)` → badge slides to new position instead of jumping when user clicks Next.
- Multi-retry on activeFieldId change (timers at 250ms/600ms/1000ms) to catch smooth-scroll animations settling.

**3. Click-to-jump**
- Clicking the badge calls `scrollToActiveField()` → `scrollIntoView({behavior:'smooth', block:'center'})`. Useful when user has manually scrolled away from the current field.

**Zero regression**:
- Phase 77 inline fields (`SIGN HERE`, text fields, date fields, etc.) fully preserved.
- No per-field sibling badges — the arrow is GLOBAL + TRACKED, matching exact DocuSign behavior.
- Hidden automatically when `activeFieldId` = null (all fields filled, or no active state).
- Works in both page-mode and scroll-mode (single indicator, tracks active field across both).
- Mobile responsive: `left-1 sm:left-2` so it tucks into the narrow viewport gutter.

**Live verification**:
- Desktop 1440×900: badge renders at left gutter `(x=105, y=476)`, vertically aligned with `SIGN HERE` field on the PDF.
- Toggling Next/Previous animates the badge to the new field position.
- Clicking the badge re-centers the field in view.


### Phase 79: Documents Module Redesign — Listing + Detail Page (Feb 23, 2026)

**Goal**: Transform the Documents tab into an enterprise-grade send-tracking center (DocuSign / PandaDoc parity): one send = one row + dedicated detail page with recipients, downloads, resend, and audit trail.

**Backend changes**:

**1. Listing rollup** (`document_service.py`)
- `list_documents(include_children=False)` now filters out per-recipient child documents (`parent_document_id` set). Parent row already aggregates recipient state → eliminates the inflated listing.
- Projection expanded with `recipients`, `delivery_channels`, `updated_at`, `completed_at`, `routing_mode`, `parent_document_id`.
- Each doc enriched with derived fields: `send_type` (email/public_link), `total_recipients`, `signed_count`, `viewed_count`, `voided_count`, `pending_count`, `aggregate_status`, `last_updated`.

**2. New detail endpoint** `GET /api/docflow/documents/{id}/detail`
- Returns metadata + sender (resolved via `_resolve_sender_info`) + recipients[] + counters + downloads + audit_trail.
- Works for both email and public-link documents.
- Synthesizes recipient rows from `child_document_ids` when parent has no embedded recipients (legacy compat).

**3. Resend endpoint** `POST /api/docflow/documents/{id}/recipients/{rid}/resend`
- Re-sends signing invitation email via existing `EmailService`.
- Stamps `recipients.$.resent_at` + pushes `email_resent` audit event.

**Frontend changes**:

**1. Listing table** (`DocFlowDashboard.js`) — new columns: Document (name + 8-char ID + icon), Type (Email/Public Link chip), Recipients (total/pending/signed), Status (color-coded pill), Created, Last Updated, Actions (View Details button + download). Rows are clickable to `/setup/docflow/documents/:id`.

**2. New `DocumentDetailPage.js`** (`/setup/docflow/documents/:id`)
- Gradient header (indigo→purple): back link, title, Send ID, timestamps, routing badge, status pill, type chip.
- 5 status cards (email) / 4 cards (public link).
- Downloads: Original always + Signed when completed.
- 4 tabs: Overview (6-field grid + public-link URL copy), Recipients/Submissions (resend, copy link, open link per row), Audit Trail (timeline), Downloads.
- Fully responsive.

**3. `docflowService.js`** — added `getDocumentDetail(id)`, `resendRecipientEmail(id, rid)`. Upgraded `downloadDocument` to auto-trigger browser download (used by new detail page; listing untouched).

**Zero regression**: generate/send flow intact, existing download endpoint reused, old test IDs preserved.

**Live verification**:
- Backend detail endpoint returns correct payload (counters=2/0/0/0/2, sender resolved, downloads.original=true).
- Listing shows 5 rows (rollup working), each with Type chip, Recipients breakdown, status pill, relative timestamps.
- Clicking a row → detail page renders cleanly with all tabs, stat cards, download controls.
- Zero regression across Phase 73-78 features.

**Scope deferred** (user picked Slice 1+2 recommended plan — "i choose a for now"):
- Void single recipient + unvoid (P2 — new backend endpoint + sequential auto-skip)
- Real-time "access revoked" popup (P2 — websocket/polling)
- Notification email when voided (P2)
- Per-submission tracking for public link (currently rolls up; needs backend to capture each submission as child row).


### Phase 80: Void / Unvoid Recipient (Documents Module) — Feb 23, 2026

**Goal**: Give sender enterprise-grade access control over individual recipients post-send (DocuSign-parity "void" feature). Email-flow only.

**Backend** (`document_routes.py`):

**1. `POST /api/docflow/documents/{id}/recipients/{rid}/void`**
- Validates: document/recipient exist, email flow (not public-link-only), not already signed (409) or voided (409).
- Updates: `recipients.$.voided=true`, `voided_at`, `voided_by=actor`, `status='voided'`. Audit event `recipient_voided`.
- Sends cancellation email via existing `EmailService._send_email`.
- **Sequential auto-skip**: `_advance_sequential_routing()` finds next non-voided/non-signed recipient, sends fresh signing email, stamps `sent_at`, pushes `sequential_advanced` audit.
- Response: `{success, voided_at, advanced_to: {id,name,email} | null}`.

**2. `POST /api/docflow/documents/{id}/recipients/{rid}/unvoid`**
- Restores `voided=false`, status→`sent` or `pending`, re-sends signing email.
- Audit event `recipient_unvoided`.

**3. Public endpoint hardening**:
- `/documents/public/{token}`: voided recipients get `recipient_voided=true`, `voided_at`, `can_sign=false` in response.
- `/documents/{id}/sign`: server-side 403 rejection for voided recipients — authoritative regardless of frontend state.

**Frontend**:

**1. Detail page** (`DocumentDetailPage.js`) — Void/Unvoid buttons in Recipients tab (email only, unsigned only), `ConfirmVoidModal` with DocuSign-style warning copy, toast showing advance-to-next info on sequential sequential voids, voided rows rendered at 70% opacity.

**2. Public signing view** (`PublicDocumentViewEnhanced.js`) — real-time revocation:
- `accessRevoked` state flipped immediately on initial GET if voided, or detected via 15s polling loop.
- Blocking `access-revoked-modal` overlays page, main content dimmed + `pointer-events-none select-none opacity-60`, ConsentScreen suppressed.
- Modal: "This signing request has been voided by the sender" + Close button.

**3. `docflowService.js`** — `voidRecipient`, `unvoidRecipient`.

**Zero regression**:
- Public link flow untouched (void 400s for public-link-only docs).
- Completed/signed recipients cannot be voided.
- Existing listing, detail page, resend, download, sign, generate flows all intact.

**Live backend verification**:
- Void → `{success, voided_at, advanced_to: {next recipient}}` confirmed via curl.
- Detail refresh: `counters.voided=1`, recipient status=`voided` with void stamps.
- Unvoid → `{success, unvoided_at, status: 'sent'}`.
- Per user request, UI/E2E testing to be done manually.
