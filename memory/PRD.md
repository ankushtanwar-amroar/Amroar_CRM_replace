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
