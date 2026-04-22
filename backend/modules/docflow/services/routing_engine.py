"""
DocFlow Routing Engine — Phase 1

Wave-based sequential routing for packages.
- Phase 1: Sequential only (each routing_order is a wave, processed in order)
- Phase 2: Mixed/parallel (same routing_order = parallel, different = sequential)

Core principle: The routing engine is stateless — it reads the package,
determines the next action, and applies atomic updates.
"""
import os
import logging
from typing import Optional, Dict, Any, List
from datetime import datetime, timezone
from uuid import uuid4

logger = logging.getLogger(__name__)


class RoutingEngine:
    def __init__(self, db, audit_service=None, email_service=None, webhook_service=None):
        self.db = db
        self.audit_service = audit_service
        self.email_service = email_service
        self.webhook_service = webhook_service

    # ── Public API ──

    async def initialize_routing(self, package_id: str):
        """
        Called after package creation + document generation.
        Marks RECEIVE_COPY recipients as completed, activates first wave.
        """
        package = await self._get_package(package_id)
        if not package:
            raise ValueError(f"Package {package_id} not found")

        recipients = package.get("recipients", [])
        updated = False

        # RECEIVE_COPY recipients are passive — skip them in routing
        for r in recipients:
            if r.get("role_type") == "RECEIVE_COPY":
                r["status"] = "completed"
                r["action_taken"] = "receive_copy"
                r["action_at"] = datetime.now(timezone.utc).isoformat()
                updated = True

        if updated:
            await self._save_recipients(package_id, recipients)

        # Activate first wave
        await self._activate_next_wave(package_id)

        # Update package status
        status_update = {
            "status": "in_progress",
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        await self.db.docflow_packages.update_one(
            {"id": package_id}, {"$set": status_update}
        )
        await self.db.docflow_package_runs.update_one(
            {"id": package_id}, {"$set": status_update}
        )

        if self.audit_service:
            await self.audit_service.log_event(
                tenant_id=package.get("tenant_id", ""),
                package_id=package_id,
                event_type="package_sent",
                actor=package.get("created_by", "system"),
                metadata={"recipient_count": len(recipients)},
            )

        # Fire webhook: package_sent
        if self.webhook_service:
            try:
                first_recipient = recipients[0] if recipients else {}
                await self.webhook_service.fire_package_event(
                    package_id=package_id,
                    event_type="package_sent",
                    tenant_id=package.get("tenant_id", ""),
                    extra_data={
                        "recipient_count": len(recipients),
                        "recipient_name": first_recipient.get("name", ""),
                        "recipient_email": first_recipient.get("email", ""),
                    },
                )
            except Exception as e:
                logger.warning(f"Webhook fire_package_event failed: {e}")

    async def on_recipient_action(
        self,
        package_id: str,
        recipient_id: str,
        action: str,
        actor: str = "system",
        metadata: Optional[Dict[str, Any]] = None,
    ):
        """
        Called when a recipient completes their action (signed, approved, reviewed).
        Uses atomic update to prevent race conditions.
        """
        now = datetime.now(timezone.utc).isoformat()

        # Atomic: only transition if recipient is in a valid state
        atomic_filter = {
            "id": package_id,
            "recipients.id": recipient_id,
            "recipients.status": {"$in": ["notified", "in_progress"]},
        }
        atomic_update = {
            "$set": {
                "recipients.$.status": "completed",
                "recipients.$.action_taken": action,
                "recipients.$.action_at": now,
                "updated_at": now,
            }
        }
        result = await self.db.docflow_packages.find_one_and_update(
            atomic_filter, atomic_update,
            return_document=True, projection={"_id": 0},
        )

        if not result:
            logger.warning(f"[RoutingEngine] Invalid state transition: pkg={package_id} rcpt={recipient_id}")
            return False

        # Dual-write: sync the same atomic update to docflow_package_runs
        await self.db.docflow_package_runs.update_one(atomic_filter, atomic_update)

        if self.audit_service:
            await self.audit_service.log_event(
                tenant_id=result.get("tenant_id", ""),
                package_id=package_id,
                event_type=f"recipient_{action}",
                recipient_id=recipient_id,
                actor=actor,
                metadata=metadata or {},
            )

        # Fire webhook: document_signed / recipient action
        if self.webhook_service:
            try:
                webhook_data = {
                    "recipient_id": recipient_id,
                    "action": action,
                    "actor": actor,
                    **(metadata or {}),
                }
                # For signed events, include signed_documents in webhook payload
                if action == "signed" and metadata and metadata.get("signed_documents"):
                    webhook_data["status"] = "signed"
                    webhook_data["signed_documents"] = metadata["signed_documents"]
                    webhook_data["recipient_details"] = {
                        "name": metadata.get("signer_name"),
                        "email": metadata.get("signer_email"),
                    }
                    webhook_data["timestamp"] = datetime.now(timezone.utc).isoformat()
                await self.webhook_service.fire_package_event(
                    package_id=package_id,
                    event_type=f"document_{action}" if action == "signed" else f"recipient_{action}",
                    tenant_id=result.get("tenant_id", ""),
                    extra_data=webhook_data,
                )
            except Exception as e:
                logger.warning(f"Webhook fire_package_event failed: {e}")

        # Check if current wave is complete
        await self._check_wave_completion(result)
        return True

    async def on_recipient_reject(
        self,
        package_id: str,
        recipient_id: str,
        reason: str,
        actor: str = "system",
    ):
        """Handle rejection. Phase 1: void policy only."""
        now = datetime.now(timezone.utc).isoformat()

        # Mark recipient as declined
        reject_filter = {
            "id": package_id,
            "recipients.id": recipient_id,
            "recipients.status": {"$in": ["notified", "in_progress"]},
        }
        reject_update = {
            "$set": {
                "recipients.$.status": "declined",
                "recipients.$.action_taken": "rejected",
                "recipients.$.reject_reason": reason,
                "recipients.$.action_at": now,
                "updated_at": now,
            }
        }
        result = await self.db.docflow_packages.find_one_and_update(
            reject_filter, reject_update,
            return_document=True, projection={"_id": 0},
        )

        if not result:
            return False

        # Dual-write to runs collection
        await self.db.docflow_package_runs.update_one(reject_filter, reject_update)

        policy = result.get("routing_config", {}).get("on_reject", "void")

        if self.audit_service:
            await self.audit_service.log_event(
                tenant_id=result.get("tenant_id", ""),
                package_id=package_id,
                event_type="rejected",
                recipient_id=recipient_id,
                actor=actor,
                metadata={"reason": reason, "policy": policy},
            )

        if policy == "void":
            await self._void_package(package_id, f"Rejected by {actor}: {reason}", actor)

        return True

    async def get_package_status(self, package_id: str) -> dict:
        """Get a summary of routing progress."""
        package = await self._get_package(package_id)
        if not package:
            return {}

        recipients = package.get("recipients", [])
        active = [r for r in recipients if r.get("role_type") != "RECEIVE_COPY"]
        completed = [r for r in active if r.get("status") == "completed"]
        current_wave = self._get_current_wave_recipients(recipients)
        total_waves = len(set(r.get("routing_order", 1) for r in active)) if active else 0

        return {
            "package_status": package.get("status"),
            "total_recipients": len(active),
            "completed_recipients": len(completed),
            "total_waves": total_waves,
            "current_wave_order": current_wave[0].get("routing_order") if current_wave else None,
            "current_wave_recipients": [
                {"id": r["id"], "name": r.get("name"), "status": r.get("status")}
                for r in current_wave
            ],
        }

    # ── Internal Methods ──

    async def _activate_next_wave(self, package_id: str):
        """Find the lowest routing_order among pending recipients and notify them."""
        package = await self._get_package(package_id)
        if not package:
            return

        recipients = package.get("recipients", [])
        active_recipients = [r for r in recipients if r.get("role_type") != "RECEIVE_COPY"]
        pending = [r for r in active_recipients if r.get("status") == "pending"]

        if not pending:
            # All routing-eligible recipients are done — complete package
            await self._complete_package(package_id)
            return

        # Find next wave (lowest routing_order among pending)
        min_order = min(r.get("routing_order", 1) for r in pending)
        wave = [r for r in pending if r.get("routing_order", 1) == min_order]

        now = datetime.now(timezone.utc).isoformat()
        for r in wave:
            r["status"] = "notified"
            r["notified_at"] = now

        await self._save_recipients(package_id, recipients)

        if self.audit_service:
            await self.audit_service.log_event(
                tenant_id=package.get("tenant_id", ""),
                package_id=package_id,
                event_type="routing_wave_started",
                metadata={
                    "wave_order": min_order,
                    "recipients": [r["id"] for r in wave],
                },
            )

        # Fire webhook: wave_started
        if self.webhook_service:
            try:
                first_wave_recipient = wave[0] if wave else {}
                await self.webhook_service.fire_package_event(
                    package_id=package_id,
                    event_type="wave_started",
                    tenant_id=package.get("tenant_id", ""),
                    extra_data={
                        "wave_order": min_order,
                        "recipient_count": len(wave),
                        "recipient_name": first_wave_recipient.get("name", ""),
                        "recipient_email": first_wave_recipient.get("email", ""),
                    },
                )
            except Exception as e:
                logger.warning(f"Webhook fire_package_event failed: {e}")

        # Send notifications to wave recipients
        for r in wave:
            await self._notify_recipient(package, r)

    async def _check_wave_completion(self, package: dict):
        """After a recipient completes, check if the entire current wave is done."""
        recipients = package.get("recipients", [])
        active = [r for r in recipients if r.get("role_type") != "RECEIVE_COPY"]

        # Anyone still in notified or in_progress = wave not done
        in_progress = [r for r in active if r.get("status") in ("notified", "in_progress")]

        if len(in_progress) == 0:
            # Current wave complete — advance to next
            if self.audit_service:
                await self.audit_service.log_event(
                    tenant_id=package.get("tenant_id", ""),
                    package_id=package["id"],
                    event_type="routing_wave_completed",
                )
            await self._activate_next_wave(package["id"])

    async def _complete_package(self, package_id: str):
        """Mark package as completed, notify RECEIVE_COPY recipients."""
        now = datetime.now(timezone.utc).isoformat()

        complete_update = {"$set": {
            "status": "completed",
            "completed_at": now,
            "updated_at": now,
        }}
        complete_filter = {"id": package_id, "status": "in_progress"}

        result = await self.db.docflow_packages.find_one_and_update(
            complete_filter, complete_update,
            return_document=True, projection={"_id": 0},
        )

        if not result:
            return

        # Dual-write to runs collection
        await self.db.docflow_package_runs.update_one(
            {"id": package_id}, complete_update
        )

        if self.audit_service:
            await self.audit_service.log_event(
                tenant_id=result.get("tenant_id", ""),
                package_id=package_id,
                event_type="package_completed",
                metadata={"completed_at": now},
            )

        # Fire webhook: package_completed
        if self.webhook_service:
            try:
                await self.webhook_service.fire_package_event(
                    package_id=package_id,
                    event_type="package_completed",
                    tenant_id=result.get("tenant_id", ""),
                    extra_data={"completed_at": now},
                )
            except Exception as e:
                logger.warning(f"Webhook fire_package_event failed: {e}")

        # Send completion email to ALL recipients
        try:
            from .system_email_service import SystemEmailService
            email_svc = SystemEmailService()
            pkg_name = result.get("package_name") or result.get("name", "Package")
            frontend_url = os.environ.get("FRONTEND_URL", "")
            if not frontend_url:
                try:
                    from services.email_service import FRONTEND_URL
                    frontend_url = FRONTEND_URL or ""
                except Exception:
                    pass
            for r in result.get("recipients", []):
                if r.get("email") and r.get("role_type") != "RECEIVE_COPY":
                    view_url = f"{frontend_url}/docflow/package/{result.get('id', '')}/view/{r.get('public_token', '')}" if r.get("public_token") else ""
                    await email_svc.send_workflow_notification_email(
                        to_email=r["email"], to_name=r.get("name", ""),
                        document_name=pkg_name, notification_type="completed",
                        extra={"view_url": view_url},
                    )
            logger.info(f"Sent completion emails to all package recipients for {package_id}")
        except Exception as ce:
            logger.warning(f"Failed to send package completion emails: {ce}")

        # Notify RECEIVE_COPY recipients about package completion
        receive_copy_recipients = [
            r for r in result.get("recipients", [])
            if r.get("role_type") == "RECEIVE_COPY" and r.get("email")
        ]
        for r in receive_copy_recipients:
            try:
                from ..services.email_notification_service import send_action_required_email
                send_action_required_email(
                    recipient_name=r.get("name", ""),
                    recipient_email=r["email"],
                    role_type="RECEIVE_COPY",
                    package_name=result.get("name", "Package"),
                    package_id=package_id,
                    public_token=r.get("public_token", ""),
                    document_count=len(result.get("documents", [])),
                    sender_name=result.get("created_by_name"),
                )
                logger.info(f"[RoutingEngine] RECEIVE_COPY notification sent to {r['email']}")
            except Exception as e:
                logger.error(f"[RoutingEngine] Failed to notify RECEIVE_COPY {r.get('email')}: {e}")

        logger.info(f"[RoutingEngine] Package {package_id} completed")

    async def _void_package(self, package_id: str, reason: str, actor: str = "system"):
        """Void the package — skip all pending recipients, update status."""
        now = datetime.now(timezone.utc).isoformat()

        package = await self._get_package(package_id)
        if not package or package.get("status") in ("completed", "voided", "expired"):
            return

        # Skip all non-completed recipients
        recipients = package.get("recipients", [])
        for r in recipients:
            if r.get("status") in ("pending", "notified", "in_progress"):
                r["status"] = "skipped"

        void_data = {
            "status": "voided",
            "void_reason": reason,
            "voided_by": actor,
            "voided_at": now,
            "recipients": recipients,
            "updated_at": now,
        }
        await self.db.docflow_packages.update_one(
            {"id": package_id}, {"$set": void_data}
        )
        await self.db.docflow_package_runs.update_one(
            {"id": package_id}, {"$set": void_data}
        )

        if self.audit_service:
            await self.audit_service.log_event(
                tenant_id=package.get("tenant_id", ""),
                package_id=package_id,
                event_type="package_voided",
                actor=actor,
                metadata={"reason": reason},
            )

    async def _notify_recipient(self, package: dict, recipient: dict):
        """Send email notification to a recipient. Non-blocking on failure."""
        try:
            email = recipient.get("email")
            if not email:
                logger.warning(f"[RoutingEngine] No email for recipient {recipient.get('id', '?')[:8]}, skipping notification")
            else:
                logger.info(f"[RoutingEngine] Sending notification to {email} for package '{package.get('name', '?')}' (role={recipient.get('role_type', '?')})")

                # Try to resolve a custom email template for this recipient
                custom_subject = None
                custom_html = None
                email_template_id = recipient.get("email_template_id")
                tenant_id = package.get("tenant_id", "")
                role_type = recipient.get("role_type", "SIGN")

                try:
                    from ..services.email_template_service import EmailTemplateService
                    ets = EmailTemplateService(self.db)
                    resolved = await ets.resolve_for_sending(tenant_id, role_type, email_template_id)
                    if resolved:
                        from services.email_service import FRONTEND_URL as EMAIL_FRONTEND_URL
                        base_url = EMAIL_FRONTEND_URL or os.environ.get("FRONTEND_URL", "")
                        access_url = f"{base_url}/docflow/package/{package.get('id', '')}/view/{recipient.get('public_token', '')}"
                        variables = {
                            "recipient_name": recipient.get("name", ""),
                            "recipient_email": email,
                            "document_name": package.get("name", "Package"),
                            "package_name": package.get("name", "Package"),
                            "signing_link": access_url,
                            "sender_name": package.get("created_by_name") or "DocFlow",
                            "company_name": "Cluvik",
                            "status": "Pending",
                        }
                        custom_subject = ets.render_template(resolved["subject"], variables)
                        custom_html = ets.render_template(resolved["body_html"], variables)
                except Exception as tmpl_err:
                    logger.warning(f"[RoutingEngine] Custom email template lookup failed: {tmpl_err}")

                if custom_subject and custom_html:
                    # Send using custom template
                    from services.email_service import send_email, FRONTEND_URL as EMAIL_FRONTEND_URL
                    success = send_email(
                        to_email=email,
                        subject=custom_subject,
                        html_content=custom_html,
                        from_name="DocFlow",
                    )
                else:
                    # Fallback to hardcoded action-required email
                    from ..services.email_notification_service import send_action_required_email
                    success = send_action_required_email(
                        recipient_name=recipient.get("name", ""),
                        recipient_email=email,
                        role_type=role_type,
                        package_name=package.get("name", "Package"),
                        package_id=package.get("id", ""),
                        public_token=recipient.get("public_token", ""),
                        document_count=len(package.get("documents", [])),
                        sender_name=package.get("created_by_name"),
                    )
                if success:
                    logger.info(f"[RoutingEngine] Email sent successfully to {email}")
                    # Log to email history
                    try:
                        from .email_history_service import EmailHistoryService
                        ehs = EmailHistoryService(self.db)
                        doc_name = package.get("name", "Package")
                        doc_id = package.get("documents", [{}])[0].get("document_id", "") if package.get("documents") else ""
                        await ehs.log_email(
                            template_id="",
                            template_name=doc_name,
                            document_id=doc_id,
                            recipient_email=email,
                            recipient_name=recipient.get("name", ""),
                            crm_object_type="package",
                            crm_object_id=package.get("id", ""),
                            tenant_id=package.get("tenant_id", ""),
                            status="sent",
                            source="package",
                            package_id=package.get("id"),
                            package_name=package.get("name"),
                        )
                    except Exception as log_err:
                        logger.warning(f"[RoutingEngine] Failed to log email history: {log_err}")
                else:
                    logger.error(f"[RoutingEngine] Email FAILED for {email} — check email_service logs")

            if self.audit_service:
                await self.audit_service.log_event(
                    tenant_id=package.get("tenant_id", ""),
                    package_id=package["id"],
                    event_type="recipient_notified",
                    recipient_id=recipient["id"],
                    actor="system",
                    metadata={"email": recipient.get("email", ""), "role_type": recipient.get("role_type")},
                )
        except Exception as e:
            logger.error(f"[RoutingEngine] Exception notifying {recipient.get('email')}: {e}")

    def _get_current_wave_recipients(self, recipients: list) -> list:
        """Get recipients in the current active wave (notified or in_progress)."""
        active = [r for r in recipients if r.get("role_type") != "RECEIVE_COPY"]
        in_wave = [r for r in active if r.get("status") in ("notified", "in_progress")]
        return in_wave

    async def _get_package(self, package_id: str) -> Optional[dict]:
        return await self.db.docflow_packages.find_one(
            {"id": package_id}, {"_id": 0}
        )

    async def _save_recipients(self, package_id: str, recipients: list):
        update = {"recipients": recipients, "updated_at": datetime.now(timezone.utc).isoformat()}
        await self.db.docflow_packages.update_one({"id": package_id}, {"$set": update})
        await self.db.docflow_package_runs.update_one({"id": package_id}, {"$set": update})
