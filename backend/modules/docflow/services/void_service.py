"""
Void Service — Phase 81.67

Shared logic for full-document and full-package voids.

Used by both internal (JWT) endpoints and public API (X-API-Key) endpoints
to guarantee consistent cascading state, audit logging, reminder cancellation,
and recipient notifications.

Per product spec (Feb 2026):
- Voiding is allowed at ANY status (including `completed` / `signed`).
- Public viewer API hits return 410 Gone for voided entities.
- A "Document Voided" notification email is sent to all active (non-terminal)
  recipients.
"""
import logging
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List

logger = logging.getLogger(__name__)

TERMINAL_RECIPIENT_STATUSES = {
    "signed",
    "completed",
    "approved",
    "rejected",
    "reviewed",
    "declined",
    "skipped",
    "expired",
    "voided",
}


class VoidService:
    """Cascading void logic for documents and packages."""

    def __init__(self, db, audit_service=None, system_email_service=None):
        self.db = db
        self.audit_service = audit_service
        self.system_email_service = system_email_service

    # ── Document Void ──

    async def void_document(
        self,
        document_id: str,
        tenant_id: str,
        reason: Optional[str],
        actor: str,
        actor_email: Optional[str] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Void a full document. Cascades to all non-terminal recipients.

        Idempotent: re-voiding a voided document returns the existing void
        info without raising. Sends notification emails to active recipients.
        """
        doc = await self.db.docflow_documents.find_one(
            {"id": document_id, "tenant_id": tenant_id},
            {"_id": 0},
        )
        if not doc:
            raise LookupError("Document not found")

        if doc.get("status") == "voided":
            return {
                "already_voided": True,
                "voided_at": doc.get("voided_at"),
                "voided_by": doc.get("voided_by"),
                "void_reason": doc.get("void_reason"),
            }

        now_iso = datetime.now(timezone.utc).isoformat()
        recipients = list(doc.get("recipients") or [])

        # Cascade: mark non-terminal recipients as voided
        cascaded = []
        for r in recipients:
            r_status = str(r.get("status") or "").lower()
            if r_status not in TERMINAL_RECIPIENT_STATUSES and not r.get("voided"):
                r["voided"] = True
                r["voided_at"] = now_iso
                r["voided_by"] = actor_email or actor
                r["status"] = "voided"
                cascaded.append(r)

        await self.db.docflow_documents.update_one(
            {"id": document_id, "tenant_id": tenant_id},
            {
                "$set": {
                    "status": "voided",
                    "void_reason": reason or "",
                    "voided_by": actor_email or actor,
                    "voided_at": now_iso,
                    "recipients": recipients,
                    "updated_at": now_iso,
                },
                "$push": {
                    "audit_trail": {
                        "event": "document_voided",
                        "actor": actor_email or actor,
                        "reason": reason or "",
                        "at": now_iso,
                    }
                },
            },
        )

        # Cancel any pending reminders
        try:
            from .reminder_service import cancel_document_reminders
            await cancel_document_reminders(self.db, document_id, reason="voided")
        except Exception as _err:
            try:
                # Fallback: iterate per recipient
                from .reminder_service import cancel_recipient_reminders
                for r in cascaded:
                    if r.get("id"):
                        await cancel_recipient_reminders(
                            self.db, document_id, r["id"], reason="voided"
                        )
            except Exception as e:
                logger.warning(f"Failed to cancel reminders for voided document {document_id}: {e}")

        # Audit log
        if self.audit_service:
            try:
                await self.audit_service.log_event(
                    tenant_id=tenant_id,
                    package_id=doc.get("package_id") or document_id,
                    document_id=document_id,
                    event_type="document_voided",
                    actor=actor_email or actor,
                    ip_address=ip_address,
                    user_agent=user_agent,
                    metadata={
                        "reason": reason or "",
                        "cascaded_recipients": len(cascaded),
                        "document_name": doc.get("template_name") or doc.get("name") or "",
                    },
                )
            except Exception as e:
                logger.warning(f"Audit log failed for document_voided: {e}")

        # Notify active recipients
        await self._notify_recipients_voided(
            recipients=cascaded,
            entity_name=doc.get("template_name") or doc.get("name") or "Document",
            reason=reason,
            actor_label=actor_email or actor,
            entity_kind="document",
        )

        return {
            "already_voided": False,
            "document_id": document_id,
            "voided_at": now_iso,
            "voided_by": actor_email or actor,
            "void_reason": reason or "",
            "cascaded_recipients": len(cascaded),
        }

    # ── Package Void (cascades to documents) ──

    async def void_package(
        self,
        package_id: str,
        tenant_id: str,
        reason: Optional[str],
        actor: str,
        actor_email: Optional[str] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Void a package blueprint AND cascade to all child runs/documents/recipients.

        Idempotent for already-voided packages.
        """
        pkg = await self.db.docflow_packages.find_one(
            {"id": package_id, "tenant_id": tenant_id, "_type": {"$ne": "run"}},
            {"_id": 0},
        )
        if not pkg:
            raise LookupError("Package not found")

        if pkg.get("status") == "voided":
            return {
                "already_voided": True,
                "voided_at": pkg.get("voided_at"),
                "voided_by": pkg.get("voided_by"),
                "void_reason": pkg.get("void_reason"),
            }

        now_iso = datetime.now(timezone.utc).isoformat()
        void_meta = {
            "status": "voided",
            "void_reason": reason or "",
            "voided_by": actor_email or actor,
            "voided_at": now_iso,
            "updated_at": now_iso,
        }

        # 1. Void the blueprint package itself
        await self.db.docflow_packages.update_one(
            {"id": package_id, "_type": {"$ne": "run"}},
            {"$set": void_meta},
        )

        # 2. Void all non-terminal runs of this package (in both possible locations)
        run_filter_terminal = {"$nin": ["completed", "voided"]}
        await self.db.docflow_packages.update_many(
            {"package_id": package_id, "_type": "run", "status": run_filter_terminal},
            {"$set": void_meta},
        )
        await self.db.docflow_package_runs.update_many(
            {"package_id": package_id, "status": run_filter_terminal},
            {"$set": void_meta},
        )

        # 3. Cascade voids on all child documents (any document tied to this
        #    package — blueprint OR run — whose status is not already terminal)
        all_run_ids = [package_id]
        async for r in self.db.docflow_package_runs.find(
            {"package_id": package_id}, {"_id": 0, "id": 1}
        ):
            if r.get("id"):
                all_run_ids.append(r["id"])

        cascaded_docs: List[str] = []
        active_recipients_by_doc: Dict[str, List[dict]] = {}
        cursor = self.db.docflow_documents.find(
            {
                "tenant_id": tenant_id,
                "$or": [
                    {"package_id": {"$in": all_run_ids}},
                    {"package_run_id": {"$in": all_run_ids}},
                ],
                "status": {"$nin": ["voided"]},
            },
            {"_id": 0, "id": 1, "recipients": 1, "template_name": 1, "name": 1, "status": 1},
        )
        async for d in cursor:
            doc_id = d.get("id")
            if not doc_id:
                continue
            recs = list(d.get("recipients") or [])
            doc_active = []
            for rr in recs:
                rs = str(rr.get("status") or "").lower()
                if rs not in TERMINAL_RECIPIENT_STATUSES and not rr.get("voided"):
                    rr["voided"] = True
                    rr["voided_at"] = now_iso
                    rr["voided_by"] = actor_email or actor
                    rr["status"] = "voided"
                    doc_active.append(rr)
            await self.db.docflow_documents.update_one(
                {"id": doc_id, "tenant_id": tenant_id},
                {
                    "$set": {
                        "status": "voided",
                        "void_reason": reason or "",
                        "voided_by": actor_email or actor,
                        "voided_at": now_iso,
                        "recipients": recs,
                        "updated_at": now_iso,
                    },
                    "$push": {
                        "audit_trail": {
                            "event": "document_voided",
                            "actor": actor_email or actor,
                            "reason": f"Cascaded from package void: {reason or ''}",
                            "at": now_iso,
                        }
                    },
                },
            )
            cascaded_docs.append(doc_id)
            active_recipients_by_doc[doc_id] = doc_active
            # store doc display name for emails
            d["__doc_name"] = d.get("template_name") or d.get("name") or "Document"
            active_recipients_by_doc[f"__name__{doc_id}"] = d["__doc_name"]

        # 4. Cancel reminders for the whole package run
        try:
            from .reminder_service import cancel_run_reminders
            for rid in all_run_ids:
                await cancel_run_reminders(self.db, rid, reason="voided")
        except Exception as e:
            logger.warning(f"Failed to cancel reminders on package void {package_id}: {e}")

        # 5. Audit log
        if self.audit_service:
            try:
                await self.audit_service.log_event(
                    tenant_id=tenant_id,
                    package_id=package_id,
                    event_type="package_voided",
                    actor=actor_email or actor,
                    ip_address=ip_address,
                    user_agent=user_agent,
                    metadata={
                        "reason": reason or "",
                        "cascaded_documents": len(cascaded_docs),
                        "package_name": pkg.get("name") or "",
                    },
                )
            except Exception as e:
                logger.warning(f"Audit log failed for package_voided: {e}")

        # 6. Notify active recipients across all cascaded docs
        package_name = pkg.get("name") or "Package"
        for doc_id in cascaded_docs:
            doc_name = active_recipients_by_doc.get(f"__name__{doc_id}", "Document")
            await self._notify_recipients_voided(
                recipients=active_recipients_by_doc.get(doc_id, []),
                entity_name=f"{package_name} — {doc_name}",
                reason=reason,
                actor_label=actor_email or actor,
                entity_kind="package",
            )

        return {
            "already_voided": False,
            "package_id": package_id,
            "voided_at": now_iso,
            "voided_by": actor_email or actor,
            "void_reason": reason or "",
            "cascaded_documents": len(cascaded_docs),
            "cascaded_run_ids": all_run_ids,
        }

    # ── Notification helper ──

    async def _notify_recipients_voided(
        self,
        recipients: List[dict],
        entity_name: str,
        reason: Optional[str],
        actor_label: str,
        entity_kind: str,
    ):
        """Best-effort notification email to recipients of a voided entity."""
        if not recipients or not self.system_email_service:
            return
        for r in recipients:
            email = (r or {}).get("email")
            if not email:
                continue
            try:
                await self.system_email_service.send_workflow_notification_email(
                    to_email=email,
                    to_name=r.get("name") or "",
                    document_name=entity_name,
                    notification_type="voided",
                    extra={
                        "reason": reason or "",
                        "actor_name": actor_label,
                        "entity_kind": entity_kind,
                    },
                )
            except Exception as e:
                logger.warning(f"Void notification email failed for {email}: {e}")
