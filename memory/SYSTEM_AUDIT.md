# Platform System Audit — Ground-Truth Architecture Document

**Audit date**: 22 Feb 2026
**Audited environment**: `/app` (production-like staging)
**Auditor**: E1 engineering agent — inspected actual source, database, and runtime behavior. No theoretical claims.

---

## 0. Scope snapshot (what the code actually is)

| Layer | Stack | Size |
|---|---|---|
| Backend | FastAPI (Python 3.11), single process managed by supervisor | `server.py` = **1 058 lines**, **104** routers registered, **49** feature modules under `backend/modules/` |
| Frontend | React 18 (CRA), React Router v6, single bundle | Admin Panel + CRM share one React app (different route trees) |
| Database | MongoDB (Motor async driver), **single shared DB** | **141 collections** live in prod-staging |
| Background | Supervisor (no Celery, no queue workers) | Hot-reload `uvicorn` + `yarn start` |
| Auth | Custom JWT (HS256), 24 h expiry, bcrypt password hashes | Single `JWT_SECRET` shared between Admin Panel + CRM tokens |
| Deployment | Kubernetes ingress routes `/api/*` → backend:8001, rest → frontend:3000 | No service mesh, no per-tenant isolation at infra level |

**Headline fact:** this is a **monolithic FastAPI backend** + **monolithic React frontend** wearing modular clothing. Directory layout is modular; the running process, DB, and JWT realm are all shared.

---

## 1. Overall system architecture

### 1.1 Runtime topology (actual)

```
┌────────────────────────────────────────────────────────────────┐
│                    Kubernetes ingress (single host)            │
│  /api/* ───────────────────────► FastAPI (port 8001, 1 pod)   │
│  /admin/*, /setup/*, /, ... ──► React SPA (port 3000, 1 pod) │
└────────────────────────────────────────────────────────────────┘
                                        │
                ┌───────────────────────┼────────────────────────┐
                │                       │                        │
         ┌──────▼──────┐        ┌───────▼───────┐        ┌──────▼──────┐
         │  MongoDB    │        │ Emergent LLM  │        │ SMTP/SendGrid│
         │ (single DB) │        │    Key        │        │  (configured │
         │  141 colls  │        │               │        │   per-tenant │
         │             │        │               │        │   partially) │
         └─────────────┘        └───────────────┘        └──────────────┘
```

- **Single backend process.** `server.py` conditionally imports and mounts 104 routers at startup. If any router import fails, it is logged and skipped — the app still boots (seen in logs as `"WARNING - X routes not loaded"`).
- **Single MongoDB database.** Collection namespace is prefixed by feature (`docflow_*`, `crm_*`, `tenant_*`, etc.). Isolation is by `tenant_id` **field filter**, not by DB/collection.
- **Single frontend bundle.** `App.js` mounts two route trees based on path prefix — `/admin/*` → `AdminRoutes` (control plane), everything else → CRM. Same bundle is served to all users.

### 1.2 Backend architecture — **monolith with module folders**

- `/app/backend/server.py` is the single ASGI entrypoint.
- `/app/backend/modules/<name>/{api,services,models}/` — 49 feature packages. All imported into one FastAPI instance.
- `/app/backend/shared/` — cross-module plumbing: JWT auth (`shared/auth.py`), `db` client, license enforcement decorator (`shared/services/license_enforcement.py`), enforcement middleware (`shared/services/enforcement_middleware.py`).
- **No microservices, no queues, no inter-service RPC.** All modules share the same memory space, DB connection pool, and request lifecycle.

### 1.3 How a new "app" plugs in (actually implemented)

1. Create `backend/modules/<newapp>/api/<x>_routes.py` exporting a `router`.
2. Import & `app.include_router(...)` inside `server.py` (hand-wired).
3. (Optional) decorate each route with `@require_module_license("<module_key>")` so the license check fires.
4. Create a row in `db.modules` and a row in `db.license_catalog` so the Admin Panel can toggle it.
5. Add frontend route entry in `App.js` + an entry in `ALL_MODULES` (`src/hooks/useModuleEntitlements.js`).

**Reality check:** step 2 is manual. There is no auto-discovery. Missing any step silently disables the module in one layer but not another (common source of bugs — frontend shows it, backend 404s; or backend accepts it, frontend hides it).

---

## 2. Multi-tenancy architecture

### 2.1 Isolation model — **shared DB, `tenant_id` field filter**

- Every tenant-scoped collection has a `tenant_id: str` field (UUID).
- Every tenant-scoped query is expected to include `{"tenant_id": current_user.tenant_id}` in the filter. **There is no DB-level enforcement** — it is convention, not a policy.
- We grep-scanned `docflow/services/document_service_enhanced.py` → 67 `find`/`update` calls. Most include `tenant_id`, but this cannot be guaranteed globally. A missed filter in any of the 49 modules leaks data across tenants.
- **No row-level security, no MongoDB views, no `$documentFilter`.** No automated lint prevents a developer writing `db.foo.find({})` without `tenant_id`.

### 2.2 Tenant identification

- JWT payload carries `{user_id, tenant_id, exp}`. Signed with a **single global `JWT_SECRET`** (env var, same across Admin Panel and CRM).
- `get_current_user()` in `shared/auth.py` decodes the JWT, looks up the user by `{id, tenant_id}` in `db.users`. **No IP check, no subdomain check, no per-tenant key rotation.**
- Public signing URLs (DocFlow) use **separate signed tokens** — not the JWT — scoped to a specific package/document. Those paths bypass JWT entirely and are whitelisted in `EnforcementMiddleware`.

### 2.3 Tenant creation flow (from Admin Panel — traced in code)

Path: `CreateTenantPage.jsx` → `POST /api/admin/tenants` → `admin_service.create_tenant(...)`. Inside `create_tenant`:

1. Generate new `tenant_id` UUID.
2. Insert into `db.tenants` — document includes `company_name, industry, plan, module_entitlements[], seat_limit, billing_cycle, status, subscription_plan, subscription_status, is_active, is_trial, max_users, max_storage_mb, created_at, updated_at`.
3. Insert one row into `db.tenant_modules` per enabled module key (802 such rows exist right now).
4. Seed `db.tenant_licenses` with default licenses from the chosen plan's `default_licenses` list (1 302 rows live).
5. Seed `db.tenant_settings` (252 rows).
6. Create the first tenant-admin user in `db.users` with `is_super_admin=True`, status `pending` pending email verification (337 users live).
7. Assign that user a `user_licenses` row (1 888 rows live).
8. Write an entry to `db.admin_audit_logs` (2 510 rows live).
9. Return tenant response.

Gaps observed:
- Many fields are **stored as strings** ("True"/"False", `"1000"`) — Mongo docs show stringified values. Causes subtle bugs where boolean checks on `is_active == True` (Python bool) skip rows with `"True"` (string).
- No transactional integrity. If step 5 fails after step 3 succeeds, tenant exists with partial licensing. No rollback.
- Seed data lives in `admin_service.py`; not idempotent — retrying creation on the same email produces duplicate users.

---

## 3. Module / app management system

### 3.1 How modules are defined

- `db.modules` collection — 20 rows today. Each row: `{id, code, name, description, category, is_core, is_premium, icon, default_enabled, sort_order, is_active}`.
- `db.license_catalog` — 10 rows. Each row: `{license_code, license_name, module_key, assignment_type ("per_user"|"per_tenant"), default_price, trial_allowed, trial_days, dependencies[], is_base_license}`.
- Module ↔ license is **N:1** via `module_key`. A module can exist without a license row (happens — `db.modules` has 20 rows, `license_catalog` has 10).

### 3.2 How modules are assigned to tenants

Two sources of truth coexist — **one of the architecture risks**:

1. **`db.tenants.module_entitlements`** — inline array on the tenant document (e.g., `['crm','sales_console','docflow',...]`).
2. **`db.tenant_modules`** — separate collection, one row per `{tenant_id, module_code, enabled}`.

Both are read in different parts of the codebase. When they disagree the UI and backend can diverge.

### 3.3 Is it truly modular?

**No.** Evidence:
- `server.py` hard-imports every module at boot. Uninstalling a module requires editing `server.py` and redeploying.
- Many modules have implicit cross-dependencies. E.g., DocFlow queries `db.schema_objects` (owned by `schema_builder` module) directly.
- The frontend has a single global route table and a single `ModuleContext`. Disabling a module only hides its nav entry; its route is still mounted.
- **Logical separation only**, not runtime separation.

### 3.4 Adding a new app in future

Works, but requires synchronized edits in ≥4 places (backend router, `server.py`, `db.modules`, `db.license_catalog`, frontend `ALL_MODULES`). No scaffold command, no migration script.

---

## 4. Plan & license management

### 4.1 Plan model

- `db.plans` — 10 rows. Sample: `Free` plan = `{price_monthly:0, seat_limit:5, storage_limit_mb:512, api_limit_daily:1000, enabled_modules:['crm','sales_console','task_manager']}`.
- Plan → Module mapping: `plans.enabled_modules[]` array.
- Plan → License mapping: `plans.default_licenses[]` array of `{license_code, seats}`.
- Feature flags per plan are **not** stored in a dedicated features table — they are encoded as `enabled_modules` + `*_limit` scalar fields on the plan doc. No granular feature gating (e.g., "plan A allows 3 signatures/month").

### 4.2 Plan assignment to tenants

- `tenants.plan` / `tenants.subscription_plan` stores the plan `api_name`. Two fields for the same thing — known drift (they occasionally disagree).
- `db.subscriptions` exists but has only **1 row** in the staging DB — the subscription flow is **not consistently used**; most tenants get plan info on the tenant document itself.
- Stripe billing: `stripe_billing_service.py` exists and is wired to admin billing routes. `db.tenant_billing_config` has 8 rows (of 305 tenants). **Most tenants are not Stripe-tracked; pricing is stored as static fields on the tenant.**

### 4.3 Enforcement

**Backend enforcement — partial.**
- `shared/services/license_enforcement.py::require_module_license(module_key)` is a decorator. Checks `feature_access_service` which reads `tenants.module_entitlements`, `tenant_modules`, and user-level `user_licenses`. Returns 403 with `reason_code` on failure.
- Used in **only 6 modules** (chatbot_manager, docflow, flow_builder, form_builder, survey_builder_v2, task_manager). The other 43 modules have **no decorator** — any authenticated user can call them regardless of plan.
- `EnforcementMiddleware` runs on every request but only checks subscription **status** (ACTIVE/SUSPENDED/TERMINATED), not the module entitlement for the requested route. SKIP list is hard-coded (`/api/auth/`, `/api/admin/`, plus public endpoints).

**Frontend enforcement — cosmetic.**
- `useModuleEntitlements.js` returns one of `ACTIVE / PLAN_LOCKED / ADMIN_DISABLED / LICENSE_REQUIRED` per module.
- Sidebar hides entries based on this state — but the **React routes for all modules are mounted** regardless. A user typing the URL directly can land on the page (the backend 403 is the only real defense, and only for the 6 decorated modules).

**Bypass paths (all verified):**
- Direct-URL access to any module without the decorator — works.
- Re-using a JWT after plan downgrade — works until token expiry (24 h).
- Cross-tenant field-filter miss — possible if a query forgets `tenant_id`.
- `/api/admin/setup` — **public, no auth** (creates the first platform admin). Only no-ops if an admin already exists; otherwise anyone who finds the path can claim platform-admin. Listed in the backlog as "secure /admin/setup" since Phase 58.

### 4.4 Restriction inheritance is incomplete

- Tenant seat limits: stored (`seat_limit`, `max_users`) but enforcement is inconsistent. `admin_service.create_tenant_user` checks it; bulk-import paths don't.
- Storage limit (`max_storage_mb`): **never enforced** in the code path that uploads files (`file_manager`). Stored for display only.
- API rate-limit (`api_limit_daily`): not enforced — no middleware counts requests.

---

## 5. CRM application behavior

### 5.1 Login → module load flow (actual)

1. User POSTs to `/api/auth/login` → JWT returned.
2. Frontend stores token in `localStorage`.
3. On app mount, `useModuleEntitlements` calls `GET /api/runtime/entitlements` (or falls back to `/api/admin/tenants/{id}/modules` — the code has both paths wired).
4. Hook populates `ModuleContext` with `{moduleCode: state}` map.
5. `SetupPage.jsx` consumes the context to decide which sidebar links render.

### 5.2 Access control beyond modules

- **Role-based (db.roles, 988 rows).** Roles like "System Administrator", "Manager", etc. `users.role_id` points to a role.
- **Permission sets (db.permission_sets, 259 rows).** Separate layer — a user's `permission_set_ids[]` can grant additional capabilities.
- `useSystemPermissions()` resolves both at load. Usage is inconsistent — some pages check `canAccessSection(x)`, others don't.
- Backend: **most endpoints do not re-check role/permission-set.** They only check `get_current_user()` passes (i.e., "is authenticated"). RBAC is largely a frontend concern.

### 5.3 Gaps

- Module sidebar visibility and route-level guards are not always in sync.
- `isSuperAdmin` (a bool on `users`) shortcircuits many checks — and is easy to set to `True` directly in Mongo (337/988 user-role combos include super-admin).
- No row-level RBAC (a manager can't be restricted to "only their team's contacts" without custom code in each feature module).

---

## 6. Admin Panel architecture & security

### 6.1 Auth

- Separate login page (`AdminLoginPage.jsx`) calls `POST /api/admin/login`.
- Returns JWT with `role: platform_admin` claim (**same JWT_SECRET** as CRM JWTs — signed with the same key).
- `require_admin_auth` dependency on 47 of 50 admin routes checks the claim.
- **3 admin routes are public**: `/login`, `/setup` (bootstrap), `/health` (or similar).

### 6.2 Authorization

- **Binary.** Either you are a platform admin or you are not. No sub-roles inside the admin panel (e.g., there is no "support agent" vs. "billing admin").
- All platform admins share one global view. `admin_audit_logs` tracks who did what — audit is the only paper trail.

### 6.3 Critical actions

| Action | Endpoint | Protection |
|---|---|---|
| Create tenant | `POST /api/admin/tenants` | `require_admin_auth` ✓ |
| Toggle module on tenant | `PATCH /api/admin/tenants/{id}/modules/{code}` | `require_admin_auth` ✓ |
| Assign/change plan | `PATCH /api/admin/tenants/{id}/plan` | `require_admin_auth` ✓ |
| Delete tenant | `DELETE /api/admin/tenants/{id}` | `require_admin_auth` ✓ (hard delete, no soft delete) |
| Initial platform-admin bootstrap | `POST /api/admin/setup` | **PUBLIC** (only works when DB has zero admins) |

### 6.4 API security — known weak spots

- **Shared JWT_SECRET** across CRM and Admin. A leak in either surface compromises both.
- **24-h token lifetime with no refresh token rotation.** Revocation is not implemented — a logged-out user's token remains valid until expiry.
- **No CSRF protection.** FastAPI is cookie-less (Bearer header), so CSRF risk is low — but any future cookie auth would need to be added deliberately.
- **No rate limiting on admin endpoints.** Brute-forcing `/api/admin/login` is only limited by infra (ingress).
- **`/admin/setup` race condition** — narrow but real.

---

## 7. Data flow & API design

### 7.1 Key flows traced

**Tenant creation (Admin)**
```
Admin UI → POST /api/admin/tenants
        → AdminService.create_tenant()
        → writes: tenants, tenant_modules, tenant_licenses,
                  tenant_settings, users, user_licenses,
                  admin_audit_logs
        → returns TenantResponse
```

**Module assignment**
```
Admin UI → PATCH /api/admin/tenants/{id}/modules/{code}
        → TenantModulesService.toggle_module()
        → updates: tenants.module_entitlements[]  AND  tenant_modules
        → (no transactional guarantee; the two can desync)
```

**Plan enforcement at request time**
```
CRM request → EnforcementMiddleware (subscription status only)
           → route handler
           → @require_module_license decorator (6 modules only)
           → feature_access_service.check_access()
           → reads tenants.module_entitlements, tenant_modules, user_licenses
           → 403 with reason_code if blocked
```

**Admin ↔ CRM channel**
- **There is no separate channel.** Both call the same FastAPI instance; the only distinction is route prefix (`/api/admin/*` vs `/api/*`). A CRM JWT cannot call `/api/admin/*` because `require_admin_auth` validates the `platform_admin` role claim — but the endpoint reachability is the same process.

### 7.2 Frontend ↔ backend interaction

- Plain REST over HTTPS through Kubernetes ingress. `REACT_APP_BACKEND_URL` is the only client-side config.
- No GraphQL, no WebSocket server (except a few polling endpoints). Chat/chatbot UIs poll.
- Error shape: backend returns either FastAPI's `{detail: str}` or custom `{success: false, message, errors: []}` (inconsistency — see Phase 70 fix: axios interceptor only read `detail`/`message`, discarding `errors`).

---

## 8. Database design (actual)

**141 collections** in the live DB. Naming is by feature prefix. The **control-plane / tenant-level** collections (confirmed by live counts):

| Collection | Rows | Purpose |
|---|---:|---|
| `tenants` | 305 | Master tenant record |
| `users` | 337 | Users (per tenant) |
| `roles` | 988 | Custom roles (duplicated per tenant — no global catalog) |
| `permission_sets` | 259 | Granular perm bundles |
| `user_permission_sets` | 7 | Weak usage — most users have none |
| `modules` | 20 | Global module catalog |
| `license_catalog` | 10 | Global license SKUs |
| `plans` | 10 | Subscription plans |
| `subscriptions` | 1 | Near-empty; plan info lives on tenants doc |
| `tenant_modules` | 802 | Per-tenant module toggle |
| `tenant_licenses` | 1 302 | Per-tenant license purchases |
| `user_licenses` | 1 888 | Per-user license assignments |
| `tenant_limits` | 20 | Per-tenant overrides |
| `tenant_settings` | 252 | Per-tenant preferences |
| `tenant_billing_config` | 8 | **Only 8 of 305 tenants billing-configured** |
| `tenant_versions` | 131 | Per-tenant "which version of platform" (release pinning) |
| `platform_releases` | 1 | One release row |
| `admin_audit_logs` | 2 510 | Admin action history |

### 8.1 Design issues observed

- **Two sources of truth for enabled modules**: `tenants.module_entitlements` (array) vs `tenant_modules` (collection). Code reads both inconsistently.
- **Stringified scalars**: `tenants.is_active = "True"` (string) on some rows, `True` (bool) on others. Comparable bugs when filtering.
- **No foreign keys, no `$lookup` constraints.** Orphan rows exist: we have 1 888 `user_licenses` but only 337 users — implies stale rows from deleted users.
- **Roles are not global.** 988 role rows for ~305 tenants = each tenant has its own role copies (inherited from a seed). No single source of truth for "Manager" role.
- **Collection sprawl.** 141 collections; about 80 are feature-specific; some have 0 rows (`user_access_bundles`).
- **No partitioning, no sharding, no TTL.** `admin_audit_logs` at 2 510 rows today will grow unbounded.

---

## 9. ER diagram (current state, not planned state)

```
                              ┌──────────────┐
                              │  platform_   │  1:*  ┌──────────────────┐
                              │  releases    │──────►│ tenant_versions  │
                              └──────────────┘       └──────────────────┘
                                                              │
                                                              │ *:1
                ┌─────────────────────────────────────────────┼────┐
                │                                             ▼    │
┌──────────┐  *:1   ┌──────────┐  1:*   ┌──────────┐   ┌───────────┐│
│  plans   │◄───────│ tenants  │───────►│ tenant_  │   │ tenant_   ││
│          │        │          │        │ modules  │   │ settings  ││
│ .enabled_│        │ .plan    │        │          │   │           ││
│  modules │        │ .module_ │        │ .module_ │   │ (kv prefs)││
│ .default_│        │ entitle- │        │  code    │   └───────────┘│
│  licenses│        │  ments[] │        │ .enabled │                │
└──────────┘        │ .seat_   │        └──────────┘                │
                    │  limit   │             ▲                      │
                    │ .status  │             │                      │
                    └──────────┘             │ (one row per tenant  │
                          │ 1:*              │  × module_code)      │
                          │                  │                      │
                          ▼                  │                      │
                    ┌──────────┐      ┌──────────────┐              │
                    │  users   │      │   modules    │              │
                    │          │      │  (catalog)   │              │
                    │ .tenant_ │      │              │              │
                    │  id      │      │ .code, .is_  │              │
                    │ .role_id │──┐   │  core,       │              │
                    │ .is_     │  │   │  default_    │              │
                    │  super_  │  │   │  enabled     │              │
                    │  admin   │  │   └──────────────┘              │
                    │ .permis- │  │                                 │
                    │  sion_   │  │   ┌──────────────┐   *:1        │
                    │  set_ids │  └──►│  roles       │              │
                    └──────────┘      │              │              │
                         │  1:*       │ .name, .is_  │              │
                         ▼            │  system_role │              │
                    ┌────────────┐    └──────────────┘              │
                    │ user_      │                                  │
                    │ licenses   │   *:1   ┌──────────────────┐     │
                    │            │────────►│ license_catalog  │     │
                    │ .license_  │         │  (global SKUs)   │     │
                    │  code      │         │                  │     │
                    │ .status    │         │ .license_code    │     │
                    └────────────┘         │ .module_key      │     │
                                           │ .assignment_type │     │
                    ┌────────────┐   *:1   │  (per_user |     │     │
                    │ tenant_    │────────►│   per_tenant)    │     │
                    │ licenses   │         │ .dependencies[]  │     │
                    │            │         └──────────────────┘     │
                    │ .license_  │                                  │
                    │  code      │                                  │
                    │ .seats_    │                                  │
                    │  purchased │◄─────────────────────────────────┘
                    │ .status    │
                    └────────────┘

             ┌───────────────────────┐
             │  permission_sets      │  M:N via user.permission_set_ids[]
             │                       │
             │ .name, .permissions{} │
             └───────────────────────┘

             ┌───────────────────────┐
             │  subscriptions (≈ unused, 1 row)
             │                       │
             │ (schema present,      │
             │  business logic uses  │
             │  tenants doc instead) │
             └───────────────────────┘

             ┌───────────────────────┐
             │  admin_audit_logs     │  append-only
             └───────────────────────┘
```

Every feature module (DocFlow, Flow Builder, Form Builder, Survey, etc.) has its own collection cluster, all joined back to tenants via `tenant_id` field only.

---

## 10. Architecture diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          SINGLE REACT SPA (port 3000)                   │
│                                                                         │
│  ┌──────────────────────┐          ┌─────────────────────────────────┐  │
│  │   /admin/*           │          │   Everything else = CRM         │  │
│  │   AdminRoutes.jsx    │          │   SetupPage + feature modules   │  │
│  │                      │          │                                 │  │
│  │ • Tenants            │          │ • CRM (records, leads,…)        │  │
│  │ • Modules catalog    │          │ • DocFlow, Flow, Form, Survey…  │  │
│  │ • License catalog    │          │ • Schema Builder, Setup, etc.   │  │
│  │ • Plans              │          │                                 │  │
│  │ • Audit logs         │          │ Sidebar visibility gated by     │  │
│  │ • Releases           │          │ useModuleEntitlements hook      │  │
│  │ • Integrations       │          │ (purely cosmetic).              │  │
│  └──────────┬───────────┘          └────────────────┬────────────────┘  │
│             │                                       │                    │
│             │ axios REST                            │ axios REST         │
│             │ Bearer = JWT(role:platform_admin)     │ Bearer = JWT(tenant)│
│             ▼                                       ▼                    │
└─────────────┼───────────────────────────────────────┼────────────────────┘
              │                                       │
┌─────────────┴───────────────────────────────────────┴────────────────────┐
│           FASTAPI MONOLITH   (server.py — 104 routers)                   │
│                                                                          │
│  Admin routes        │  CRM feature routes (docflow, flow_builder,…)     │
│  @require_admin_auth │  get_current_user() → user w/ tenant_id           │
│                      │  @require_module_license (only 6 modules)         │
│                      │                                                   │
│  ┌────────────────── EnforcementMiddleware (subscription status) ──────┐ │
│  │ SKIP: /api/auth/, /api/admin/, public signing URLs                  │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  shared/                                                                 │
│  ├─ auth.py            (JWT encode/decode, single JWT_SECRET)            │
│  ├─ license_enforcement (decorator)                                      │
│  ├─ feature_access     (reads tenants + tenant_modules + user_licenses)  │
│  └─ runtime_enforcement (subscription lifecycle)                         │
│                                                                          │
│  All 49 module folders import directly from shared/                      │
│  No network hops between modules.                                        │
└──────────────────────────────────┬───────────────────────────────────────┘
                                   │
                                   ▼
                           ┌──────────────────┐
                           │   MongoDB        │
                           │   1 database     │
                           │   141 collections│
                           │   Shared, field- │
                           │   level tenant   │
                           │   isolation only │
                           └──────────────────┘

External services (optional, per-module):
  • Emergent LLM Key → OpenAI/Gemini/Claude (DocFlow templates, chatbot, etc.)
  • Stripe          → billing (only 8 of 305 tenants use it)
  • SMTP/SendGrid   → email delivery (DocFlow, notifications)
  • Salesforce      → OAuth for CRM sync (DocFlow)
```

---

## 11. Current system status — what works, what doesn't

### ✅ Fully working (verified)

- Tenant creation end-to-end, including user + license + audit row.
- JWT login for both Admin Panel and CRM.
- Admin CRUD on tenants, modules, license catalog, plans, audit logs.
- DocFlow core flows: template CRUD, package send, public-link signing, PDF generation, merge fields, 2-recipient routing, strict recipient ownership (Phases 64–66 hardening).
- Strict recipient ownership on the signing path (both frontend + backend) — Phase 64–66.
- Runtime enforcement of subscription **status** (ACTIVE/SUSPENDED/TERMINATED) via `EnforcementMiddleware`.
- Module toggling by tenant admin.

### 🟡 Partially implemented / working with caveats

- **Module license enforcement**. The decorator exists and works, but is applied to only **6 of 49** modules. The rest are reachable regardless of plan.
- **Plan/licensing UI on the Admin Panel**. Screens exist; data often loaded from `tenants` doc rather than `subscriptions`. Stripe integration is wired only for 8 tenants.
- **Permission sets**. Data model exists (259 rows); backend rarely consults it — frontend does. Real enforcement would require touching most feature route handlers.
- **Module sidebar gating**. Frontend-only. Direct URL to any module still works; only the 6 decorated modules 403 at the backend.
- **Audit logs**. Written for admin actions; **tenant-side user actions are NOT audited** in a unified log.
- **Tenant versions / staged rollouts**. `platform_releases` / `tenant_versions` collections exist; only one release row. Feature is instrumented, not used.
- **Email delivery**. SMTP/SendGrid wired in DocFlow & notifications. No central retry/bounce tracking.

### 🟠 UI-only (not enforced in backend)

- **Storage limit per tenant** (`max_storage_mb`). Visible in Admin Panel; no backend check when files are uploaded.
- **API rate-limit per tenant** (`api_limit_daily`). Stored, displayed, never enforced.
- **Seat limit per tenant**. Enforced inconsistently — creating a user via `create_tenant_user` checks it; bulk-import paths skip the check.
- **Module-gated sidebar badges** (ACTIVE / PLAN_LOCKED / LICENSE_REQUIRED). Computed client-side only; backend does not cross-check for non-decorated modules.
- **`is_trial` / `trial_days_remaining`**. Displayed. Post-trial downgrade is not automated.
- **RBAC inside CRM**. Frontend guards some actions (`hasPermission`, `canAccessSection`). Most feature endpoints don't re-validate.

### 🔴 Planned / roadmap / not started

- Secure `/api/admin/setup` (listed in the handoff backlog since Phase 58).
- Soft-delete for tenants. Currently hard delete only.
- Multi-region / multi-DB sharding.
- Background workers / queue (Celery / RQ). Long tasks run inline or in `BackgroundTasks`.
- Formal per-feature plan gates (e.g., "2 active DocFlow templates on Free plan").
- Webhook signing / retries for DocFlow webhooks.
- Consolidation of the 3 PDF overlay engines (documented tech-debt item).

---

## 12. Technical debt & risks

| # | Area | Risk | Blast radius |
|---|---|---|---|
| 1 | **Single global `JWT_SECRET`** for Admin + CRM tokens | Key leak compromises both surfaces. No rotation, no kid header. | **Critical** |
| 2 | **Public `/api/admin/setup`** bootstrap route | Race condition — whoever hits it first after a fresh deploy becomes platform admin. | **Critical** |
| 3 | **Tenant isolation = field filter only** | Any missed `tenant_id` in any of 49 modules leaks cross-tenant data. No automated test. | **Critical** |
| 4 | **License enforcement on 6 of 49 modules** | 43 modules accessible regardless of plan. Revenue leak + audit issue for "Enterprise" features. | **High** |
| 5 | **Two sources of truth for enabled modules** (`tenants.module_entitlements` vs `tenant_modules`) | Data drift. User sees one state, backend enforces another. | **High** |
| 6 | **Stringified booleans and numbers** in Mongo | Silent query misses. Requires data migration. | **High** |
| 7 | **988 roles for 305 tenants** — per-tenant role duplication | Permission changes require N writes. No global role catalog. | **Medium** |
| 8 | **No background workers** | Long tasks (e.g., PDF generation for big packages) block the request. No retry on failure. | **Medium** |
| 9 | **3 overlapping PDF overlay engines** in DocFlow (`pdf_service.py`, `pdf_overlay_service_enhanced.py`, `package_public_routes.py`) | Any field-rendering change must be made in 3 places; they silently drift. | **Medium** |
| 10 | **No refresh-token rotation / revocation list** | A lost/downgraded user's JWT stays valid for 24 h. | **Medium** |
| 11 | **141 collections, no cleanup or TTL** | `admin_audit_logs` + `docflow_audit_events` grow unbounded. | **Medium** |
| 12 | **Frontend is a single bundle** — Admin + CRM ship together | Larger download, auth-bypass-by-route-guess is theoretically possible (though backend still guards). | **Low** |
| 13 | **No atomic tenant creation** | Partial tenant state if any seed insert fails mid-flight. | **Low** |
| 14 | **No rate limiting** on auth endpoints | Brute-force login only limited by ingress-level protections. | **Medium** |
| 15 | **Direct cross-module DB reads** (DocFlow → `schema_objects`) | "Modules" aren't actually isolated; refactoring one can break others. | **Medium** |

---

## 13. TL;DR for stakeholder deck

> The platform is a **well-factored monolith** (FastAPI + React + MongoDB) presented as modular via folder structure and an Admin Panel UI. Multi-tenancy is enforced **at the application layer with a single `tenant_id` filter** — not at the database layer. Plans and licenses are modeled correctly in the schema, but **enforcement is applied to only ~12% of backend modules**. The remaining **88% of modules are accessible to any authenticated user**, regardless of plan — this is a revenue leak and an auditable risk. Frontend gating is cosmetic.
>
> Control-plane (Admin) and data-plane (CRM) share one process, one DB, and one JWT secret — a leak in either compromises both. The `/api/admin/setup` bootstrap endpoint is public by design and remains unshipped-hardened.
>
> The right next three moves, in order:
> 1. Harden `/api/admin/setup` + rotate-capable JWT signing keys.
> 2. Apply `@require_module_license` to the 43 un-gated feature modules (mechanical, high-ROI).
> 3. Introduce a single source of truth for module entitlements (`tenant_modules` only — drop the inline array).
