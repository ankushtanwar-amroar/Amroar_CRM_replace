# DocFlow — Production Fixes (May 11, 2026)

## What's been implemented (latest)

### Issue 1 — Fresh upload no longer inherits old fields by filename ✅
- Removed the "same name + tenant" fallback in `_resolve_latest_field_placements`.
- Field-placement inheritance is now strictly limited to the same `template_group_id` (intentional version chain).
- Fresh uploads always get a unique `template_group_id` at create time → no cross-upload contamination, ever.
- Affected files:
  - `backend/modules/docflow/api/template_routes_enhanced.py`
  - `backend/modules/docflow/services/document_service_enhanced.py`

### Issue 2 — Date Signed format consistent everywhere ✅
- New shared helper `backend/modules/docflow/services/date_format_util.py`:
  - Honors `field.dateFormat`, default `MM/DD/YYYY`.
  - Pass-through when input already matches target format (fixes prior US-format mis-parse).
  - Falls back through all supported formats + ISO 8601.
- Applied at every PDF stamping site:
  - `api/package_public_routes.py` (package per-recipient signing)
  - `api/package_public_link_routes.py` (public link submit)
  - `services/pdf_overlay_service_enhanced.py` (template-flow + document_service)

### Issue 3 — Final signed documents reliably produced ✅
- `api/package_public_link_routes.py` `/submit`:
  - Resolves base PDF with legacy key fallbacks (`unsigned_s3_key → signed_s3_key → s3_key → pdf_file_path`).
  - Tracks `failed_documents[]` with reason per failed doc.
  - Returns `HTTP 500 no_documents_signed` when zero docs produced (instead of silent `[]`).
  - `failed_documents` array now returned alongside `signed_documents`.
  - Submission record persists both arrays + `status: completed|partial`.
- `api/package_public_routes.py` sign-with-fields:
  - Same base-PDF fallback chain.
  - `logger.exception` on processing failures for full traceback in logs.

## Code Architecture
- Frontend: React. `MultiPageVisualBuilder.js`, `PackagePublicView.js`, `PackagePublicLinkView.js`.
- Backend: FastAPI. Public APIs under `/api/public/packages/*`; public-link submit under `/api/docflow/packages/public/*/submit`.
- MongoDB: `docflow_templates`, `docflow_packages`, `docflow_package_runs`, `docflow_documents`, `docflow_public_submissions`.

## Roadmap / Backlog (P1+)
- P1: User-driven manual test of all 3 fixes (per user instruction, no automated test this round).
- P2: Phase 2.5 Interlinked Fields — standalone template mode using recipient's most recent submission.
- P2: Gate remaining 43 un-gated modules with `@require_module_license`.
- P3: Consolidate fragmented PDF overlay logic into one engine.
- P3: SMS Templates — multi-language + categories.

## Testing
- Manual by user (per explicit instruction this round).
- Lint clean across all modified files.
- Backend restart clean; all modules loaded successfully.
