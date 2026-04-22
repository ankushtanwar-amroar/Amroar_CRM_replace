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
    role_type: str = "SIGN"
    routing_order: int = 1
    assigned_components_map: Optional[Dict[str, List[str]]] = None
    email_template_id: Optional[str] = None

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
        pkg_recipients.append({
            "name": r.name,
            "email": r.email or "",
            "role_type": r.role_type,
            "routing_order": r.routing_order,
            "assigned_components": r.assigned_components_map or {},
            "email_template_id": r.email_template_id,
        })

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
