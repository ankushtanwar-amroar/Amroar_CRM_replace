"""
DocFlow Package Routes — Phase 2 (Reusable Package Model)

Package = reusable blueprint (name + documents).
Send = execution → creates a "run" in docflow_package_runs.
Webhook = package-level only.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from typing import Optional, Dict, Any, List
from pydantic import BaseModel, Field
import io

import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..')))

from shared.database import db
from shared.models import User
from shared.auth import get_current_user
from ..services.package_service import PackageService
from ..services.docflow_audit_service import DocFlowAuditService
from ..services.package_output_service import PackageOutputService

router = APIRouter(prefix="/docflow/packages", tags=["DocFlow Packages"])

package_service = PackageService(db)
audit_service = DocFlowAuditService(db)
output_service = PackageOutputService(db)


class VoidRequest(BaseModel):
    reason: str


# ── Create Package Blueprint ──

class PackageDocInput(BaseModel):
    template_id: str
    document_name: str = ""
    order: int = 1

class CreatePackageRequest(BaseModel):
    name: str = Field(..., min_length=1)
    documents: List[PackageDocInput]

@router.post("")
async def create_package(
    req: CreatePackageRequest,
    current_user: User = Depends(get_current_user),
):
    """Create a reusable package blueprint (name + documents only)."""
    from datetime import datetime, timezone
    from uuid import uuid4

    if not req.documents:
        raise HTTPException(status_code=400, detail="At least one document is required.")

    # Validate templates exist
    for i, doc in enumerate(req.documents):
        tmpl = await db.docflow_templates.find_one(
            {"id": doc.template_id, "tenant_id": current_user.tenant_id},
            {"_id": 0, "id": 1, "name": 1}
        )
        if not tmpl:
            raise HTTPException(status_code=400, detail=f"Document {i+1}: Template '{doc.template_id}' not found.")

    now = datetime.now(timezone.utc)
    package_id = str(uuid4())
    package_docs = [
        {"template_id": d.template_id, "document_name": d.document_name, "order": d.order}
        for d in sorted(req.documents, key=lambda x: x.order)
    ]

    package = {
        "id": package_id,
        "tenant_id": current_user.tenant_id,
        "name": req.name,
        "status": "active",
        "documents": package_docs,
        "webhook_config": {},
        "created_by": current_user.id,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat(),
    }

    await db.docflow_packages.insert_one(package)

    await audit_service.log_event(
        tenant_id=current_user.tenant_id,
        package_id=package_id,
        event_type="package_created",
        actor=current_user.id,
        metadata={"name": req.name, "document_count": len(package_docs)},
    )

    package.pop("_id", None)
    return {"success": True, "package": package}


# ── Send Package (Create a Run) ──

class SendRecipientInput(BaseModel):
    name: str
    email: Optional[str] = ""
    phone: Optional[str] = ""  # Phase 81.12 — required when sms_mode=true
    role_type: str = "SIGN"
    routing_order: int = 1
    assigned_components_map: Optional[Dict[str, List[str]]] = None
    email_template_id: Optional[str] = None
    # Phase 81.24/81.25 — Per-recipient reminder configuration. Two forms:
    #  1) reminder_config = { enabled, interval_value, interval_unit, max_count?, end_at? }
    #  2) flat fields: reminder_enabled / reminder_frequency / reminder_custom_value
    #     / reminder_custom_unit / max_reminders
    reminder_config: Optional[Dict[str, Any]] = None
    reminder_enabled: Optional[bool] = None
    reminder_frequency: Optional[str] = None
    reminder_custom_value: Optional[int] = None
    reminder_custom_unit: Optional[str] = None
    max_reminders: Optional[int] = None

class SendRoutingConfig(BaseModel):
    mode: str = "sequential"
    on_reject: str = "void"

class SendSecurityInput(BaseModel):
    require_auth: bool = True
    session_timeout_minutes: int = 15

class TemplateMergeFieldsInput(BaseModel):
    template_id: str
    merge_fields: Dict[str, Any] = {}

class SendPackageRequest(BaseModel):
    recipients: List[SendRecipientInput] = Field(default_factory=list)
    delivery_mode: str = Field(default="email")
    routing_config: Optional[SendRoutingConfig] = None
    security: Optional[SendSecurityInput] = None
    template_merge_fields: Optional[List[TemplateMergeFieldsInput]] = None
    # Phase 81.12 — SMS mode controls whether SMS is sent to recipients.
    # Every actionable recipient must have a phone number when sms_mode=true.
    sms_mode: Optional[bool] = False
    # sms_consent controls ONLY whether the SMS disclaimer popup is shown in
    # the public signing flow. Independent of sms_mode.
    sms_consent: Optional[bool] = False

@router.post("/{package_id}/send")
async def send_package(
    package_id: str,
    req: SendPackageRequest,
    current_user: User = Depends(get_current_user),
):
    """Send a package — creates a new run/execution."""
    package = await package_service.get_package(package_id, current_user.tenant_id)
    if not package:
        raise HTTPException(status_code=404, detail="Package not found")

    # Prevent sending voided packages
    if package.get("status") == "voided":
        raise HTTPException(status_code=400, detail="Cannot send a voided package")

    # Validate delivery mode
    valid_modes = ("email", "public_link", "both", "public_recipients")
    if req.delivery_mode not in valid_modes:
        raise HTTPException(status_code=400, detail=f"delivery_mode must be one of: {', '.join(valid_modes)}")

    needs_email = req.delivery_mode in ("email", "both")
    needs_recipients = req.delivery_mode in ("email", "both", "public_recipients")
    if needs_recipients and not req.recipients:
        raise HTTPException(status_code=400, detail="Recipients required for this delivery mode.")
    if needs_email:
        for i, r in enumerate(req.recipients):
            if not r.email or not r.email.strip():
                role = r.role_type
                if role != "RECEIVE_COPY":
                    raise HTTPException(status_code=400, detail=f"Recipient {i+1} ({r.name}): email required for email delivery.")

    # Build recipient data
    pkg_recipients = []
    for r in req.recipients:
        # Phase 81.25 — accept either nested `reminder_config` or flat
        # public-API style fields.
        rcfg = r.reminder_config
        if not rcfg and r.reminder_enabled:
            rcfg = {
                "reminder_enabled": True,
                "reminder_frequency": r.reminder_frequency,
                "reminder_custom_value": r.reminder_custom_value,
                "reminder_custom_unit": r.reminder_custom_unit,
                "max_reminders": r.max_reminders,
            }
        pkg_recipients.append({
            "name": r.name,
            "email": r.email or "",
            # Phase 81.12 — propagate phone so the run recipient gets it.
            "phone": (r.phone or "").strip(),
            "role_type": r.role_type,
            "routing_order": r.routing_order,
            "assigned_components": r.assigned_components_map or {},
            "email_template_id": r.email_template_id,
            "reminder_config": rcfg,
        })

    # Phase 81.12 — when sms_mode is enabled, every actionable recipient
    # (signer / approver) must carry a phone number; receive-copy roles are
    # exempt because they don't sign or verify.
    if req.sms_mode:
        actionable_roles = {"SIGN", "SIGNER", "APPROVE_REJECT", "APPROVER"}
        missing = []
        for r in req.recipients:
            role = (r.role_type or "SIGN").upper()
            if role in actionable_roles and not (r.phone or "").strip():
                missing.append(r.name or r.email or "Unnamed")
        if missing:
            raise HTTPException(
                status_code=400,
                detail=f"SMS Disclaimer is ON — phone required for: {', '.join(missing)}"
            )

    # Auto-assign: if a recipient has no assigned_components for a given document,
    # default to ALL of that document's signable fields (minus any already claimed
    # by other recipients). This matches DocuSign's "empty ⇒ all fields" behaviour
    # and guarantees email + signing UX never silently fail.
    import logging as _pkg_log
    _pkg_logger = _pkg_log.getLogger(__name__)
    try:
        for pkg_doc in (package.get("documents") or []):
            tid = pkg_doc.get("template_id")
            if not tid:
                continue
            tpl = await db.docflow_templates.find_one(
                {"id": tid, "tenant_id": current_user.tenant_id},
                {"_id": 0, "field_placements": 1}
            )
            fps = (tpl or {}).get("field_placements") or []
            assignable_ids = [
                fp.get("id") for fp in fps
                if fp.get("id") and (fp.get("type") or "").lower() not in ("merge", "label")
            ]
            if not assignable_ids:
                continue
            claimed = set()
            for pr in pkg_recipients:
                existing = (pr.get("assigned_components") or {}).get(tid) or []
                if existing:
                    claimed.update(existing)
            # Fill empties in routing_order
            for pr in sorted(pkg_recipients, key=lambda x: x.get("routing_order") or 1):
                amap = pr.get("assigned_components") or {}
                if amap.get(tid):
                    continue
                unclaimed = [fid for fid in assignable_ids if fid not in claimed]
                if not unclaimed:
                    continue
                amap[tid] = unclaimed
                pr["assigned_components"] = amap
                claimed.update(unclaimed)
                _pkg_logger.info(
                    f"[package-send] auto-assign: recipient='{pr.get('name')}' "
                    f"doc={tid} empty → auto-assigned {len(unclaimed)} field(s)"
                )

            # Phase 81.1 — final sweep: if any signable field is still unclaimed
            # after the empty-recipient pass (manual partial assignment scenario),
            # append leftovers to the FIRST recipient so checkbox/radio etc. stay
            # visible to the signer and don't get hidden by Phase 50.
            leftover = [fid for fid in assignable_ids if fid not in claimed]
            if leftover and pkg_recipients:
                first_pr = sorted(pkg_recipients, key=lambda x: x.get("routing_order") or 1)[0]
                amap = first_pr.get("assigned_components") or {}
                merged = list(dict.fromkeys((amap.get(tid) or []) + leftover))
                amap[tid] = merged
                first_pr["assigned_components"] = amap
                claimed.update(leftover)
                _pkg_logger.info(
                    f"[package-send] auto-assign sweep: doc={tid} appended "
                    f"{len(leftover)} leftover field(s) to first recipient "
                    f"'{first_pr.get('name')}'"
                )
    except Exception as _auto_err:
        _pkg_logger.warning(f"[package-send] auto-assign skipped due to error: {_auto_err}")

    # Structured log: recipient plan
    for pr in pkg_recipients:
        fld_total = sum(len(v or []) for v in (pr.get("assigned_components") or {}).values())
        _pkg_logger.info(
            f"[package-send] plan: recipient='{pr['name']}' email='{pr['email']}' "
            f"role_type={pr['role_type']} order={pr['routing_order']} "
            f"assigned_fields_total={fld_total} "
            f"email_trigger={'yes' if (needs_email and pr['email']) else 'no'}"
        )

    routing_config = {"mode": "sequential", "on_reject": "void"}
    if req.routing_config:
        routing_config = {"mode": req.routing_config.mode, "on_reject": req.routing_config.on_reject}

    security = {"require_auth": True, "session_timeout_minutes": 15}
    if req.security:
        security = {"require_auth": req.security.require_auth, "session_timeout_minutes": req.security.session_timeout_minutes}

    # Build template merge fields map — resolve by group_id, name, or direct match
    merge_fields_map = {}
    if req.template_merge_fields:
        pkg_template_ids = {d.get("template_id") for d in package.get("documents", [])}
        group_to_pkg = {}
        name_to_pkg = {}
        for doc_entry in package.get("documents", []):
            tid = doc_entry.get("template_id")
            if tid:
                tmpl = await db.docflow_templates.find_one({"id": tid}, {"_id": 0, "template_group_id": 1, "name": 1})
                if tmpl:
                    if tmpl.get("template_group_id"):
                        group_to_pkg[tmpl["template_group_id"]] = tid
                    if tmpl.get("name"):
                        name_to_pkg[tmpl["name"]] = tid
        for tmf in req.template_merge_fields:
            resolved = tmf.template_id
            if resolved not in pkg_template_ids:
                if resolved in group_to_pkg:
                    resolved = group_to_pkg[resolved]
                else:
                    ext = await db.docflow_templates.find_one({"id": resolved}, {"_id": 0, "name": 1})
                    if ext and ext.get("name") in name_to_pkg:
                        resolved = name_to_pkg[ext["name"]]
            merge_fields_map[resolved] = tmf.merge_fields

    run = await package_service.send_package_run(
        package_id=package_id,
        package=package,
        recipients=pkg_recipients,
        routing_config=routing_config,
        security=security,
        delivery_mode=req.delivery_mode,
        send_email=needs_email,
        user_id=current_user.id,
        tenant_id=current_user.tenant_id,
        template_merge_fields=merge_fields_map,
        sms_mode=bool(req.sms_mode),
        sms_consent=bool(req.sms_consent),
    )

    frontend_url = os.environ.get("FRONTEND_URL", "")
    public_link = ""
    public_link_token = run.get("public_link_token", "")
    if req.delivery_mode in ("public_link", "both") and public_link_token:
        public_link = f"{frontend_url}/docflow/package/{run['id']}/public/{public_link_token}"

    # Build recipient-specific links for public_recipients mode
    recipient_links = []
    if req.delivery_mode == "public_recipients":
        for r in run.get("recipients", []):
            token = r.get("public_token", "")
            link = f"{frontend_url}/docflow/package/{run['id']}/view/{token}" if token else ""
            recipient_links.append({
                "recipient_id": r.get("id"),
                "name": r.get("name"),
                "email": r.get("email"),
                "role": r.get("role_type"),
                "signing_link": link,
                "status": r.get("status"),
            })

    return {
        "success": True,
        "run_id": run["id"],
        "package_id": package_id,
        "status": run.get("status", "in_progress"),
        "public_link": public_link,
        "recipient_links": recipient_links,
    }


# ── List Runs for a Package ──

@router.get("/{package_id}/runs")
async def list_package_runs(
    package_id: str,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user: User = Depends(get_current_user),
):
    """List all runs/executions for a package."""
    package = await package_service.get_package(package_id, current_user.tenant_id)
    if not package:
        raise HTTPException(status_code=404, detail="Package not found")

    cursor = db.docflow_package_runs.find(
        {"package_id": package_id, "tenant_id": current_user.tenant_id},
        {"_id": 0}
    ).sort("created_at", -1).skip(skip).limit(limit)
    runs = await cursor.to_list(length=limit)
    total = await db.docflow_package_runs.count_documents(
        {"package_id": package_id, "tenant_id": current_user.tenant_id}
    )

    # Enrich each run with submission/recipient counts
    for run in runs:
        dm = run.get("delivery_mode", "email")
        if dm in ("public_link", "both"):
            run["submissions_count"] = await db.docflow_public_submissions.count_documents({"package_id": run["id"]})
        rcpts = run.get("recipients", [])
        active_r = [r for r in rcpts if r.get("role_type") != "RECEIVE_COPY"]
        run["recipients_total"] = len(active_r)
        run["recipients_completed"] = sum(1 for r in active_r if r.get("status") == "completed")

    return {"runs": runs, "total": total}


# ── Get Single Run Detail (Enriched) ──

@router.get("/{package_id}/runs/{run_id}")
async def get_package_run(
    package_id: str,
    run_id: str,
    current_user: User = Depends(get_current_user),
):
    """Get a single run with full details including submissions, documents, and audit."""
    run = await db.docflow_package_runs.find_one(
        {"id": run_id, "package_id": package_id, "tenant_id": current_user.tenant_id},
        {"_id": 0}
    )
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    delivery_mode = run.get("delivery_mode", "email")

    # Enrich with submissions (for public_link mode)
    submissions = []
    submissions_total = 0
    if delivery_mode in ("public_link", "both"):
        sub_cursor = db.docflow_public_submissions.find(
            {"package_id": run_id}, {"_id": 0}
        ).sort("submitted_at", -1)
        submissions = await sub_cursor.to_list(length=500)
        submissions_total = len(submissions)
    run["submissions"] = submissions
    run["submissions_total"] = submissions_total
    run["submissions_completed"] = sum(1 for s in submissions if s.get("status") == "completed" or s.get("signed_at"))
    run["submissions_pending"] = submissions_total - run["submissions_completed"]

    # Enrich with documents
    doc_cursor = db.docflow_documents.find(
        {"package_id": run_id}, {"_id": 0, "id": 1, "status": 1, "template_id": 1, "unsigned_pdf_url": 1, "signed_file_url": 1, "package_order": 1, "template_name": 1, "document_name": 1}
    ).sort("package_order", 1)
    gen_docs = await doc_cursor.to_list(length=50)
    for doc in gen_docs:
        if not doc.get("template_name") and doc.get("template_id"):
            tmpl = await db.docflow_templates.find_one({"id": doc["template_id"]}, {"_id": 0, "name": 1})
            if tmpl:
                doc["template_name"] = tmpl.get("name")
    run["generated_documents"] = gen_docs

    # Enrich with audit events
    audit_events = await audit_service.get_package_events(
        package_id=run_id,
        tenant_id=current_user.tenant_id,
        limit=200,
    )
    run["audit_events"] = audit_events

    # Recipient stats (for email mode)
    recipients = run.get("recipients", [])
    active_r = [r for r in recipients if r.get("role_type") != "RECEIVE_COPY"]
    run["recipients_total"] = len(active_r)
    run["recipients_completed"] = sum(1 for r in active_r if r.get("status") == "completed")
    run["recipients_pending"] = run["recipients_total"] - run["recipients_completed"]

    # Public link URL
    frontend_url = os.environ.get("FRONTEND_URL", "")
    ptoken = run.get("public_link_token", "")
    run["public_link_url"] = f"{frontend_url}/docflow/package/{run_id}/public/{ptoken}" if ptoken else ""

    return run


# ── Legacy endpoints ──

@router.get("")
async def list_packages(
    status: Optional[str] = Query(None, description="Filter by status"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user: User = Depends(get_current_user),
):
    """List packages for the current tenant."""
    result = await package_service.list_packages(
        tenant_id=current_user.tenant_id,
        status=status,
        skip=skip,
        limit=limit,
    )
    return result


@router.get("/{package_id}")
async def get_package(
    package_id: str,
    include_documents: bool = Query(False, description="Include full document details"),
    current_user: User = Depends(get_current_user),
):
    """Get a single package by ID."""
    if include_documents:
        package = await package_service.get_package_with_documents(package_id, current_user.tenant_id)
    else:
        package = await package_service.get_package(package_id, current_user.tenant_id)

    if not package:
        raise HTTPException(status_code=404, detail="Package not found")

    # Include run stats — use aggregation to avoid multiple count queries
    run_stats_pipeline = [
        {"$match": {"package_id": package_id}},
        {"$group": {
            "_id": None,
            "runs_count": {"$sum": 1},
            "completed_runs": {"$sum": {"$cond": [{"$eq": ["$status", "completed"]}, 1, 0]}},
            "last_created_at": {"$max": "$created_at"}
        }}
    ]
    run_agg = await db.docflow_package_runs.aggregate(run_stats_pipeline).to_list(1)
    if run_agg:
        package["runs_count"] = run_agg[0]["runs_count"]
        package["completed_runs"] = run_agg[0]["completed_runs"]
        package["last_run_at"] = run_agg[0]["last_created_at"]
    else:
        package["runs_count"] = 0
        package["completed_runs"] = 0
        package["last_run_at"] = None

    # Aggregate recipient/submission stats across ALL runs
    all_runs = await db.docflow_package_runs.find(
        {"package_id": package_id}, {"_id": 0, "id": 1, "recipients": 1, "delivery_mode": 1}
    ).to_list(length=500)

    total_recipients = 0
    signed_recipients = 0
    pending_recipients = 0
    total_submissions = 0
    completed_submissions = 0

    public_link_run_ids = []
    for run in all_runs:
        dm = run.get("delivery_mode", "email")
        if dm in ("email", "both", "public_recipients"):
            rcpts = [r for r in (run.get("recipients") or []) if r.get("role_type") != "RECEIVE_COPY"]
            total_recipients += len(rcpts)
            signed_recipients += sum(1 for r in rcpts if r.get("status") == "completed")
            pending_recipients += sum(1 for r in rcpts if r.get("status") != "completed")
        if dm in ("public_link", "both"):
            public_link_run_ids.append(run["id"])

    # Batch submission counts for public_link runs
    if public_link_run_ids:
        sub_pipeline = [
            {"$match": {"package_id": {"$in": public_link_run_ids}}},
            {"$group": {
                "_id": None,
                "total": {"$sum": 1},
                "completed": {"$sum": {"$cond": [{"$ne": ["$signed_at", None]}, 1, 0]}}
            }}
        ]
        sub_agg = await db.docflow_public_submissions.aggregate(sub_pipeline).to_list(1)
        if sub_agg:
            total_submissions = sub_agg[0]["total"]
            completed_submissions = sub_agg[0]["completed"]

    package["total_recipients"] = total_recipients
    package["signed_recipients"] = signed_recipients
    package["pending_recipients"] = pending_recipients
    package["total_submissions"] = total_submissions
    package["completed_submissions"] = completed_submissions

    # Include public submissions count (legacy)
    public_submissions_count = await db.docflow_public_submissions.count_documents(
        {"package_id": package_id}
    )
    package["public_signers_count"] = public_submissions_count

    return package


# ── Update Package Documents ──

class UpdateDocumentsRequest(BaseModel):
    documents: List[PackageDocInput]

@router.put("/{package_id}/documents")
async def update_package_documents(
    package_id: str,
    req: UpdateDocumentsRequest,
    current_user: User = Depends(get_current_user),
):
    """Update the documents in a package blueprint. Only affects future runs."""
    from datetime import datetime, timezone

    package = await db.docflow_packages.find_one(
        {"id": package_id, "tenant_id": current_user.tenant_id, "_type": {"$ne": "run"}},
        {"_id": 0, "id": 1, "status": 1}
    )
    if not package:
        raise HTTPException(status_code=404, detail="Package not found")

    if package.get("status") == "voided":
        raise HTTPException(status_code=400, detail="Cannot modify a voided package")

    if not req.documents:
        raise HTTPException(status_code=400, detail="At least one document required")

    # Validate templates
    for i, doc in enumerate(req.documents):
        tmpl = await db.docflow_templates.find_one(
            {"id": doc.template_id, "tenant_id": current_user.tenant_id},
            {"_id": 0, "id": 1}
        )
        if not tmpl:
            raise HTTPException(status_code=400, detail=f"Template '{doc.template_id}' not found")

    new_docs = [
        {"template_id": d.template_id, "document_name": d.document_name, "order": d.order}
        for d in sorted(req.documents, key=lambda x: x.order)
    ]

    await db.docflow_packages.update_one(
        {"id": package_id},
        {"$set": {"documents": new_docs, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )

    await audit_service.log_event(
        tenant_id=current_user.tenant_id,
        package_id=package_id,
        event_type="package_documents_updated",
        actor=current_user.id,
        metadata={"document_count": len(new_docs)},
    )

    return {"success": True, "documents": new_docs}


# ── Void Blueprint Package ──

@router.post("/{package_id}/void-package")
async def void_blueprint_package(
    package_id: str,
    req: VoidRequest,
    current_user: User = Depends(get_current_user),
):
    """Void a blueprint package. Prevents future sends and disables public links."""
    from datetime import datetime, timezone

    package = await db.docflow_packages.find_one(
        {"id": package_id, "tenant_id": current_user.tenant_id, "_type": {"$ne": "run"}},
        {"_id": 0, "id": 1, "status": 1}
    )
    if not package:
        raise HTTPException(status_code=404, detail="Package not found")

    if package.get("status") == "voided":
        raise HTTPException(status_code=400, detail="Package already voided")

    await db.docflow_packages.update_one(
        {"id": package_id},
        {"$set": {
            "status": "voided",
            "void_reason": req.reason,
            "voided_by": current_user.id,
            "voided_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }}
    )

    # Also void ALL active runs of this package
    now_iso = datetime.now(timezone.utc).isoformat()
    void_run_data = {
        "status": "voided",
        "void_reason": req.reason,
        "voided_by": current_user.id,
        "voided_at": now_iso,
        "updated_at": now_iso,
    }
    await db.docflow_packages.update_many(
        {"package_id": package_id, "_type": "run", "status": {"$nin": ["completed", "voided"]}},
        {"$set": void_run_data}
    )
    await db.docflow_package_runs.update_many(
        {"package_id": package_id, "status": {"$nin": ["completed", "voided"]}},
        {"$set": void_run_data}
    )

    await audit_service.log_event(
        tenant_id=current_user.tenant_id,
        package_id=package_id,
        event_type="package_voided",
        actor=current_user.id,
        metadata={"reason": req.reason},
    )

    return {"success": True, "message": "Package voided", "package_id": package_id}


@router.get("/{package_id}/logs")
async def get_package_logs(
    package_id: str,
    limit: int = Query(200, ge=1, le=1000),
    current_user: User = Depends(get_current_user),
):
    """Get structured logs for a package and all its runs."""
    package = await package_service.get_package(package_id, current_user.tenant_id)
    if not package:
        raise HTTPException(status_code=404, detail="Package not found")

    # Collect all run IDs for this package
    run_ids = [package_id]
    runs_cursor = db.docflow_package_runs.find(
        {"package_id": package_id}, {"_id": 0, "id": 1}
    )
    async for r in runs_cursor:
        run_ids.append(r["id"])

    # Fetch all audit events across the package and its runs
    events_cursor = db.docflow_audit_events.find(
        {"package_id": {"$in": run_ids}, "tenant_id": current_user.tenant_id},
        {"_id": 0}
    ).sort("timestamp", -1).limit(limit)
    events = await events_cursor.to_list(length=limit)

    # Categorize into log types
    log_categories = {
        "send": ["package_created", "package_sent", "run_created"],
        "delivery": ["recipient_notified", "email_sent", "email_delivery_failed"],
        "view": ["document_viewed", "public_link_accessed", "otp_verified"],
        "signing": ["document_signed", "field_completed", "signature_applied"],
        "completion": ["package_completed", "wave_completed", "all_signed"],
        "failure": ["package_voided", "package_declined", "document_rejected", "generation_failed"],
        "webhook": ["webhook_triggered", "webhook_sent", "webhook_failed"],
    }

    logs = []
    seen_ids = set()
    for evt in events:
        evt_id = evt.get("id", "")
        if evt_id in seen_ids:
            continue
        seen_ids.add(evt_id)
        event_type = evt.get("event_type", "")
        category = "other"
        for cat, types in log_categories.items():
            if event_type in types or any(t in event_type for t in types):
                category = cat
                break

        logs.append({
            "id": evt.get("id", ""),
            "timestamp": evt.get("timestamp", ""),
            "event_type": event_type,
            "category": category,
            "package_id": evt.get("package_id", ""),
            "document_id": evt.get("document_id"),
            "actor": evt.get("actor", "system"),
            "metadata": evt.get("metadata", {}),
        })

    return {"logs": logs, "total": len(logs)}


@router.get("/{package_id}/routing-status")
async def get_routing_status(
    package_id: str,
    current_user: User = Depends(get_current_user),
):
    """Get routing progress for a package."""
    package = await package_service.get_package(package_id, current_user.tenant_id)
    if not package:
        raise HTTPException(status_code=404, detail="Package not found")
    return await package_service.get_routing_status(package_id)


@router.post("/{package_id}/void")
async def void_package(
    package_id: str,
    req: VoidRequest,
    current_user: User = Depends(get_current_user),
):
    """Void a package. Only in_progress or draft packages can be voided."""
    try:
        await package_service.void_package(
            package_id=package_id,
            tenant_id=current_user.tenant_id,
            reason=req.reason,
            user_id=current_user.id,
        )
        return {"success": True, "message": "Package voided", "package_id": package_id}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{package_id}/audit")
async def get_package_audit(
    package_id: str,
    limit: int = Query(100, ge=1, le=500),
    skip: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
):
    """Get audit trail for a package."""
    package = await package_service.get_package(package_id, current_user.tenant_id)
    if not package:
        raise HTTPException(status_code=404, detail="Package not found")

    events = await audit_service.get_package_events(
        package_id=package_id,
        tenant_id=current_user.tenant_id,
        limit=limit,
        skip=skip,
    )
    return {"events": events, "total": len(events)}


@router.get("/{package_id}/combined-pdf")
async def download_combined_pdf(
    package_id: str,
    current_user: User = Depends(get_current_user),
):
    """Download all package documents merged into a single PDF."""
    package = await package_service.get_package(package_id, current_user.tenant_id)
    if not package:
        raise HTTPException(status_code=404, detail="Package not found")

    pdf_bytes = await output_service.generate_combined_pdf(package_id, current_user.tenant_id)
    if not pdf_bytes:
        raise HTTPException(status_code=404, detail="No documents available for this package")

    safe_name = package.get("name", "package").replace(" ", "_")[:40]
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{safe_name}_combined.pdf"'},
    )


# ── Submission Download APIs (Phase 81.77) ──
# Per-submission: list docs, download individual signed doc, download merged combined PDF.

async def _load_submission(package_id: str, run_id: str, submission_id: str, tenant_id: str):
    """Verify run belongs to package/tenant and load submission."""
    run = await db.docflow_package_runs.find_one(
        {"id": run_id, "package_id": package_id, "tenant_id": tenant_id},
        {"_id": 0, "id": 1}
    )
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    submission = await db.docflow_public_submissions.find_one(
        {"id": submission_id, "package_id": run_id},
        {"_id": 0}
    )
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")
    return submission


def _refresh_signed_doc_urls(signed_documents: list) -> list:
    """Regenerate presigned URLs from s3_key (if present) so links don't expire."""
    from ..services.s3_service import S3Service
    s3 = S3Service()
    out = []
    for sd in signed_documents or []:
        s3_key = sd.get("signed_s3_key")
        url = sd.get("signed_file_url", "")
        if s3_key:
            fresh = s3.get_document_url(s3_key, expiration=604800)
            if fresh:
                url = fresh
        out.append({
            "document_id": sd.get("document_id"),
            "document_name": sd.get("document_name", "Document"),
            "signed_file_url": url,
            "signed_s3_key": s3_key,
            "order": sd.get("order", 0),
        })
    # Preserve original order (as signed during submission)
    return out


@router.get("/{package_id}/runs/{run_id}/submissions/{submission_id}/documents")
async def list_submission_documents(
    package_id: str,
    run_id: str,
    submission_id: str,
    current_user: User = Depends(get_current_user),
):
    """List all signed documents for a specific submission with fresh presigned URLs."""
    submission = await _load_submission(package_id, run_id, submission_id, current_user.tenant_id)
    docs = _refresh_signed_doc_urls(submission.get("signed_documents", []))
    return {
        "submission_id": submission_id,
        "name": submission.get("name", ""),
        "email": submission.get("email", ""),
        "status": submission.get("status", ""),
        "submitted_at": submission.get("submitted_at"),
        "documents": docs,
        "total": len(docs),
    }


@router.get("/{package_id}/runs/{run_id}/submissions/{submission_id}/documents/{doc_id}/download")
async def download_submission_document(
    package_id: str,
    run_id: str,
    submission_id: str,
    doc_id: str,
    current_user: User = Depends(get_current_user),
):
    """Download a single signed document from a submission."""
    import requests as _rq
    submission = await _load_submission(package_id, run_id, submission_id, current_user.tenant_id)
    target = None
    for sd in submission.get("signed_documents", []):
        if sd.get("document_id") == doc_id:
            target = sd
            break
    if not target:
        raise HTTPException(status_code=404, detail="Document not found in submission")

    pdf_bytes = None
    s3_key = target.get("signed_s3_key")
    if s3_key:
        from ..services.s3_service import S3Service
        pdf_bytes = S3Service().download_file(s3_key)
    if not pdf_bytes and target.get("signed_file_url"):
        try:
            r = _rq.get(target["signed_file_url"], timeout=20)
            if r.status_code == 200 and len(r.content) > 100:
                pdf_bytes = r.content
        except Exception:
            pass
    if not pdf_bytes:
        raise HTTPException(status_code=404, detail="Signed document file unavailable")

    safe_name = (target.get("document_name") or "document").replace(" ", "_")[:60]
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{safe_name}_signed.pdf"'},
    )


@router.get("/{package_id}/runs/{run_id}/submissions/{submission_id}/download/combined")
async def download_submission_combined(
    package_id: str,
    run_id: str,
    submission_id: str,
    current_user: User = Depends(get_current_user),
):
    """Download all submission signed documents merged into a single combined PDF."""
    import requests as _rq
    from PyPDF2 import PdfMerger, PdfReader
    from ..services.s3_service import S3Service

    submission = await _load_submission(package_id, run_id, submission_id, current_user.tenant_id)
    signed_docs = submission.get("signed_documents", [])
    if not signed_docs:
        raise HTTPException(status_code=404, detail="No signed documents in submission")

    s3 = S3Service()
    merger = PdfMerger()
    added = 0
    # Preserve original signing order (signed_documents were appended in document order)
    for sd in signed_docs:
        pdf_bytes = None
        s3_key = sd.get("signed_s3_key")
        if s3_key:
            pdf_bytes = s3.download_file(s3_key)
        if not pdf_bytes and sd.get("signed_file_url"):
            try:
                r = _rq.get(sd["signed_file_url"], timeout=20)
                if r.status_code == 200 and len(r.content) > 100:
                    pdf_bytes = r.content
            except Exception:
                pass
        if pdf_bytes:
            try:
                merger.append(PdfReader(io.BytesIO(pdf_bytes)))
                added += 1
            except Exception:
                continue

    if added == 0:
        merger.close()
        raise HTTPException(status_code=404, detail="Unable to retrieve any signed documents")

    out = io.BytesIO()
    merger.write(out)
    merger.close()
    out.seek(0)

    safe_name = (submission.get("name") or "submission").replace(" ", "_")[:40] or "submission"
    return StreamingResponse(
        out,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{safe_name}_combined_signed.pdf"'},
    )


@router.get("/{package_id}/certificate")
async def download_certificate(
    package_id: str,
    current_user: User = Depends(get_current_user),
):
    """Download the completion/audit certificate for a package."""
    package = await package_service.get_package(package_id, current_user.tenant_id)
    if not package:
        raise HTTPException(status_code=404, detail="Package not found")

    pdf_bytes = await output_service.generate_completion_certificate(package_id, current_user.tenant_id)
    if not pdf_bytes:
        raise HTTPException(status_code=500, detail="Failed to generate certificate")

    safe_name = package.get("name", "package").replace(" ", "_")[:40]
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{safe_name}_certificate.pdf"'},
    )


class WebhookConfigUpdate(BaseModel):
    url: Optional[str] = None
    events: Optional[list] = None
    secret: Optional[str] = None


@router.put("/{package_id}/webhook")
async def update_package_webhook(
    package_id: str,
    config: WebhookConfigUpdate,
    current_user: User = Depends(get_current_user),
):
    """Update the webhook configuration for a package."""
    from datetime import datetime, timezone

    result = await db.docflow_packages.find_one(
        {"id": package_id, "tenant_id": current_user.tenant_id},
        {"_id": 0, "id": 1}
    )
    if not result:
        raise HTTPException(status_code=404, detail="Package not found")

    webhook_config = {}
    if config.url is not None:
        webhook_config["url"] = config.url
    if config.events is not None:
        webhook_config["events"] = config.events
    if config.secret is not None:
        webhook_config["secret"] = config.secret

    await db.docflow_packages.update_one(
        {"id": package_id},
        {"$set": {
            "webhook_config": webhook_config,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }}
    )

    return {"success": True, "message": "Webhook configuration updated"}


@router.get("/{package_id}/submissions")
async def get_package_submissions(
    package_id: str,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    current_user: User = Depends(get_current_user),
):
    """Get all public link submissions for a package."""
    package = await package_service.get_package(package_id, current_user.tenant_id)
    if not package:
        raise HTTPException(status_code=404, detail="Package not found")

    cursor = db.docflow_public_submissions.find(
        {"package_id": package_id},
        {"_id": 0}
    ).sort("submitted_at", -1).skip(skip).limit(limit)

    submissions = await cursor.to_list(length=limit)
    total = await db.docflow_public_submissions.count_documents({"package_id": package_id})

    return {"submissions": submissions, "total": total}


@router.delete("/{package_id}")
async def delete_package(
    package_id: str,
    current_user: User = Depends(get_current_user)
):
    """Delete a package and all related data (runs, documents, submissions)."""
    package = await db.docflow_packages.find_one({
        "id": package_id,
        "tenant_id": current_user.tenant_id,
        "_type": {"$ne": "run"}
    })
    if not package:
        raise HTTPException(status_code=404, detail="Package not found")

    # Delete related runs
    run_ids = []
    async for run in db.docflow_package_runs.find({"package_id": package_id}, {"_id": 0, "id": 1}):
        run_ids.append(run["id"])
    if run_ids:
        # Delete documents for each run
        await db.docflow_documents.delete_many({"package_id": {"$in": run_ids}})
        # Delete public submissions
        await db.docflow_public_submissions.delete_many({"package_id": {"$in": run_ids}})
        # Delete audit events
        await db.docflow_audit_events.delete_many({"package_id": {"$in": run_ids}})
        # Delete runs
        await db.docflow_package_runs.delete_many({"package_id": package_id})
        # Delete run entries from packages collection (type=run)
        await db.docflow_packages.delete_many({"package_id": package_id, "_type": "run"})

    # Delete the package itself
    await db.docflow_packages.delete_one({"id": package_id})

    return {"success": True, "message": f"Package and {len(run_ids)} run(s) deleted"}



# Phase 81.24 — Reminder logs endpoint (admin / sender visibility).
@router.get("/{package_id}/reminder-logs")
async def get_package_reminder_logs(
    package_id: str,
    limit: int = Query(default=200, ge=1, le=1000),
    current_user: User = Depends(get_current_user),
):
    """Return chronologically-ordered reminder send logs for a package.
    Includes both successful and failed delivery attempts."""
    package = await db.docflow_packages.find_one(
        {"id": package_id, "tenant_id": current_user.tenant_id},
        {"_id": 0, "id": 1, "package_name": 1},
    )
    if not package:
        raise HTTPException(status_code=404, detail="Package not found")
    cursor = db.docflow_reminder_logs.find(
        {"package_id": package_id, "tenant_id": current_user.tenant_id},
        {"_id": 0},
    ).sort("sent_at", -1).limit(limit)
    logs = await cursor.to_list(length=limit)
    return {"package_id": package_id, "package_name": package.get("package_name"), "count": len(logs), "logs": logs}



# Phase 81.42 — Package RUN recipient actions (Resend / Void / Unvoid).
# Mirrors the document-level equivalents at /documents/{id}/recipients/{rid}/...
# Scope: the "run" is identified by {run_id}, which equals the
# docflow_package_runs.id. Only affects email-based sends. Keeps terminal
# (signed/approved/reviewed/declined) recipients untouched.

async def _run_find_recipient(run_id: str, recipient_id: str, tenant_id: str):
    run = await db.docflow_package_runs.find_one(
        {"id": run_id, "tenant_id": tenant_id},
        {"_id": 0},
    )
    if not run:
        raise HTTPException(status_code=404, detail="Package run not found")
    recipient = next(
        (r for r in (run.get("recipients") or []) if r.get("id") == recipient_id),
        None,
    )
    if not recipient:
        raise HTTPException(status_code=404, detail="Recipient not found")
    return run, recipient


@router.post("/runs/{run_id}/recipients/{recipient_id}/resend")
async def resend_run_recipient_email(
    run_id: str,
    recipient_id: str,
    current_user: User = Depends(get_current_user),
):
    """Resend the signing invitation email for a single package-run recipient.

    Only valid for pending / notified / viewed / in_progress recipients.
    Already-signed or voided recipients return 409.
    """
    from datetime import datetime, timezone
    run, recipient = await _run_find_recipient(run_id, recipient_id, current_user.tenant_id)

    if not recipient.get("email"):
        raise HTTPException(status_code=400, detail="Recipient has no email to send to")
    if recipient.get("status") in ("signed", "completed", "approved", "rejected", "reviewed", "declined"):
        raise HTTPException(status_code=409, detail="Cannot resend to a recipient who has completed the flow")
    if recipient.get("voided") or recipient.get("status") == "voided":
        raise HTTPException(status_code=409, detail="Cannot resend to a voided recipient")

    public_token = recipient.get("public_token")
    if not public_token:
        raise HTTPException(status_code=400, detail="Recipient has no public_token")

    frontend_base = os.environ.get("FRONTEND_URL") or os.environ.get("PUBLIC_BASE_URL") or ""
    recipient_url = (
        f"{frontend_base.rstrip('/')}/docflow/package/{run_id}/view/{public_token}"
        if frontend_base
        else f"/docflow/package/{run_id}/view/{public_token}"
    )

    try:
        from ..services.system_email_service import SystemEmailService
        email_service = SystemEmailService()
        result = await email_service.send_document_email(
            recipient_email=recipient.get("email"),
            recipient_name=recipient.get("name") or recipient.get("email"),
            template_name=run.get("package_name") or run.get("name") or "Package",
            document_url=recipient_url,
            pdf_content=None,
            sender_name="DocFlow CRM",
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Unable to resend email: {e}")

    if not result.get("success"):
        raise HTTPException(status_code=502, detail=result.get("error") or "Unable to resend email.")

    now_iso = datetime.now(timezone.utc).isoformat()
    # Phase 81.43 — dual-write stamp so Package Detail + Run Detail agree.
    await db.docflow_package_runs.update_one(
        {"id": run_id, "recipients.id": recipient_id},
        {"$set": {"recipients.$.resent_at": now_iso, "updated_at": now_iso}},
    )
    await db.docflow_packages.update_one(
        {"recipients.id": recipient_id, "recipients.public_token": recipient.get("public_token")},
        {"$set": {"recipients.$.resent_at": now_iso, "updated_at": now_iso}},
    )
    try:
        await audit_service.log_event(
            tenant_id=current_user.tenant_id,
            package_id=run_id,
            event_type="run_recipient_resent",
            actor=current_user.email,
            metadata={
                "recipient_id": recipient_id,
                "recipient_email": recipient.get("email"),
            },
        )
    except Exception:
        pass
    return {"success": True, "resent_at": now_iso}


import os as _os
from datetime import datetime as _datetime, timezone as _timezone


@router.post("/runs/{run_id}/recipients/{recipient_id}/void")
async def void_run_recipient(
    run_id: str,
    recipient_id: str,
    current_user: User = Depends(get_current_user),
):
    """Void a single recipient in a package run.

    Blocks the recipient from opening their signing link, cancels future
    reminders, and pushes an audit entry. Already-signed/terminal
    recipients cannot be voided (returns 409).
    """
    run, recipient = await _run_find_recipient(run_id, recipient_id, current_user.tenant_id)

    if recipient.get("status") in ("signed", "completed", "approved", "rejected", "reviewed", "declined"):
        raise HTTPException(status_code=409, detail="Cannot void a recipient who has completed the flow")
    if recipient.get("voided") or recipient.get("status") == "voided":
        raise HTTPException(status_code=409, detail="Recipient is already voided")

    now_iso = _datetime.now(_timezone.utc).isoformat()
    # Phase 81.43 — write void state to BOTH docflow_package_runs (the
    # authoritative per-run record) AND docflow_packages (the collection
    # _find_package_by_recipient_token queries first). Without this dual
    # write, the public /packages/public/{token} endpoint would still see
    # the recipient as active and happily serve them the signing view.
    void_set = {
        "recipients.$.voided": True,
        "recipients.$.voided_at": now_iso,
        "recipients.$.voided_by": current_user.email,
        "recipients.$.status": "voided",
        "updated_at": now_iso,
    }
    await db.docflow_package_runs.update_one(
        {"id": run_id, "recipients.id": recipient_id},
        {"$set": void_set},
    )
    await db.docflow_packages.update_one(
        {"recipients.id": recipient_id, "recipients.public_token": recipient.get("public_token")},
        {"$set": void_set},
    )

    # Phase 81.42 — Stop pending-signature reminders for this recipient.
    try:
        from ..services.reminder_service import cancel_recipient_reminders
        await cancel_recipient_reminders(db, run_id, recipient_id, reason="stopped")
    except Exception:
        pass

    try:
        await audit_service.log_event(
            tenant_id=current_user.tenant_id,
            package_id=run_id,
            event_type="run_recipient_voided",
            actor=current_user.email,
            metadata={
                "recipient_id": recipient_id,
                "recipient_email": recipient.get("email"),
            },
        )
    except Exception:
        pass
    return {"success": True, "voided_at": now_iso}


@router.post("/runs/{run_id}/recipients/{recipient_id}/unvoid")
async def unvoid_run_recipient(
    run_id: str,
    recipient_id: str,
    current_user: User = Depends(get_current_user),
):
    """Unvoid (restore) a previously-voided package-run recipient.

    Restores status to `sent` if previously sent, else `pending`, and
    resends a fresh signing email so the recipient has a working link.
    Reminders will resume on the next scheduler tick for any recipient
    whose reminder_state.status was left at `stopped`.
    """
    run, recipient = await _run_find_recipient(run_id, recipient_id, current_user.tenant_id)
    if not recipient.get("voided") and recipient.get("status") != "voided":
        raise HTTPException(status_code=409, detail="Recipient is not voided")

    restored_status = "sent" if recipient.get("sent_at") else "pending"
    now_iso = _datetime.now(_timezone.utc).isoformat()
    # Phase 81.43 — dual-write to docflow_package_runs + docflow_packages so
    # the public view sees the restored recipient state.
    set_payload = {
        "recipients.$.voided": False,
        "recipients.$.voided_at": None,
        "recipients.$.voided_by": None,
        "recipients.$.unvoided_at": now_iso,
        "recipients.$.unvoided_by": current_user.email,
        "recipients.$.status": restored_status,
        "updated_at": now_iso,
    }
    if isinstance(recipient.get("reminder_state"), dict):
        set_payload["recipients.$.reminder_state.status"] = "active"
    await db.docflow_package_runs.update_one(
        {"id": run_id, "recipients.id": recipient_id},
        {"$set": set_payload},
    )
    await db.docflow_packages.update_one(
        {"recipients.id": recipient_id, "recipients.public_token": recipient.get("public_token")},
        {"$set": set_payload},
    )

    # Best-effort resend of the signing email so the recipient has a working link.
    public_token = recipient.get("public_token")
    if public_token and recipient.get("email"):
        frontend_base = _os.environ.get("FRONTEND_URL") or _os.environ.get("PUBLIC_BASE_URL") or ""
        recipient_url = (
            f"{frontend_base.rstrip('/')}/docflow/package/{run_id}/view/{public_token}"
            if frontend_base
            else f"/docflow/package/{run_id}/view/{public_token}"
        )
        try:
            from ..services.system_email_service import SystemEmailService
            email_service = SystemEmailService()
            await email_service.send_document_email(
                recipient_email=recipient.get("email"),
                recipient_name=recipient.get("name") or recipient.get("email"),
                template_name=run.get("package_name") or run.get("name") or "Package",
                document_url=recipient_url,
                pdf_content=None,
                sender_name="DocFlow CRM",
            )
        except Exception:
            pass

    try:
        await audit_service.log_event(
            tenant_id=current_user.tenant_id,
            package_id=run_id,
            event_type="run_recipient_unvoided",
            actor=current_user.email,
            metadata={
                "recipient_id": recipient_id,
                "recipient_email": recipient.get("email"),
            },
        )
    except Exception:
        pass
    return {"success": True, "unvoided_at": now_iso, "status": restored_status}
