"""
Webhook Service - Handles webhook execution for DocFlow document events
"""
import httpx
import hashlib
import hmac
import json
import asyncio
from typing import Dict, Any, Optional, List
from datetime import datetime, timezone
import logging

logger = logging.getLogger(__name__)


class WebhookService:
    """Service to fire webhooks on document events"""

    def __init__(self, db):
        self.db = db

    async def fire_webhook(
        self,
        template_id: str,
        event_type: str,
        payload: Dict[str, Any],
        tenant_id: str
    ) -> Dict[str, Any]:
        """
        Fire webhook for a document event.

        Args:
            template_id: Template ID
            event_type: Event type (signed, viewed, opened, sent, expired, declined)
            payload: Event payload data
            tenant_id: Tenant ID

        Returns:
            { success: bool, status_code: int, error: str }
        """
        # Get template webhook config
        template = await self.db.docflow_templates.find_one({
            "id": template_id,
            "tenant_id": tenant_id
        })

        if not template:
            return {"success": False, "error": "Template not found"}

        webhook_config = template.get("webhook_config", {})
        webhook_url = webhook_config.get("url")

        if not webhook_url:
            return {"success": False, "error": "No webhook URL configured"}

        # Check if event type is enabled
        enabled_events = webhook_config.get("events", [])
        if event_type not in enabled_events:
            return {"success": False, "error": f"Event '{event_type}' not enabled"}

        # Build webhook payload
        webhook_payload = {
            "event": event_type,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "template_id": template_id,
            "template_name": template.get("name"),
            "tenant_id": tenant_id,
            "data": payload
        }
        
        # Add metadata if present
        if isinstance(payload, dict) and "metadata" in payload:
            webhook_payload["metadata"] = payload["metadata"]
        
        # Add salesforce_context if present in payload (document)
        if isinstance(payload, dict) and "salesforce_context" in payload:
            webhook_payload["salesforce_context"] = payload["salesforce_context"]
        
        # Add recipients if present
        if isinstance(payload, dict) and "recipients" in payload:
            webhook_payload["recipients"] = payload["recipients"]

        # Build headers
        headers = {"Content-Type": "application/json"}
        custom_headers = webhook_config.get("headers", {})
        headers.update(custom_headers)

        # Add HMAC signature if secret configured
        secret = webhook_config.get("secret")
        if secret:
            payload_str = json.dumps(webhook_payload, sort_keys=True)
            signature = hmac.new(
                secret.encode(), payload_str.encode(), hashlib.sha256
            ).hexdigest()
            headers["X-Webhook-Signature"] = f"sha256={signature}"

        # Retry settings
        retry_enabled = webhook_config.get("retry_enabled", True)
        max_retries = webhook_config.get("max_retries", 3)

        result = await self._send_webhook(
            url=webhook_url,
            payload=webhook_payload,
            headers=headers,
            max_retries=max_retries if retry_enabled else 1
        )

        # Log webhook delivery
        await self._log_webhook(
            template_id=template_id,
            event_type=event_type,
            webhook_url=webhook_url,
            payload=webhook_payload,
            result=result,
            tenant_id=tenant_id
        )

        return result

    async def _send_webhook(
        self,
        url: str,
        payload: Dict[str, Any],
        headers: Dict[str, str],
        max_retries: int = 3
    ) -> Dict[str, Any]:
        """Send webhook with retry logic"""
        last_error = None

        for attempt in range(max_retries):
            try:
                async with httpx.AsyncClient(timeout=30.0) as client:
                    response = await client.post(
                        url,
                        json=payload,
                        headers=headers
                    )

                    if response.status_code < 300:
                        return {
                            "success": True,
                            "status_code": response.status_code,
                            "attempt": attempt + 1
                        }
                    else:
                        last_error = f"HTTP {response.status_code}: {response.text[:200]}"

            except Exception as e:
                last_error = str(e)

            # Exponential backoff
            if attempt < max_retries - 1:
                wait_time = 2 ** attempt
                await asyncio.sleep(wait_time)

        return {
            "success": False,
            "error": last_error,
            "attempts": max_retries
        }

    async def _log_webhook(
        self,
        template_id: str,
        event_type: str,
        webhook_url: str,
        payload: Dict[str, Any],
        result: Dict[str, Any],
        tenant_id: str
    ):
        """Log webhook delivery to activity logs"""
        try:
            log_entry = {
                "template_id": template_id,
                "tenant_id": tenant_id,
                "event_type": f"webhook_{'success' if result.get('success') else 'failed'}",
                "message": f"Webhook {event_type}: {'delivered' if result.get('success') else 'failed'} to {webhook_url[:50]}",
                "details": {
                    "webhook_url": webhook_url,
                    "event": event_type,
                    "status_code": result.get("status_code"),
                    "error": result.get("error"),
                    "attempt": result.get("attempt") or result.get("attempts")
                },
                "timestamp": datetime.now(timezone.utc).isoformat()
            }

            await self.db.docflow_activity_logs.insert_one(log_entry)
        except Exception as e:
            logger.error(f"Failed to log webhook: {e}")

    async def fire_document_event(
        self,
        document_id: str,
        event_type: str,
        tenant_id: str,
        extra_data: Optional[Dict[str, Any]] = None
    ):
        """
        Fire webhook for a document event. Looks up the template from the document.
        Enriches signed events with signed_documents details.
        """
        try:
            document = await self.db.docflow_documents.find_one({
                "id": document_id,
                "tenant_id": tenant_id
            })

            if not document:
                return

            template_id = document.get("template_id")
            if not template_id:
                return

            payload = {
                "document_id": document_id,
                "document_status": document.get("status"),
                "template_name": document.get("template_name"),
                "recipient_email": document.get("recipient_email"),
                "recipient_name": document.get("recipient_name"),
                "crm_object_type": document.get("crm_object_type"),
                "crm_object_id": document.get("crm_object_id"),
                **(extra_data or {})
            }

            # Enrich signed/completed events with signed document details
            if event_type in ("signed", "completed", "signed_copy"):
                signed_url = document.get("signed_file_url")
                if signed_url:
                    payload["signed_documents"] = [{
                        "document_id": document_id,
                        "template_name": document.get("template_name"),
                        "signed_document_url": signed_url,
                        "signed_at": document.get("signed_at"),
                    }]

            # Also log the event itself
            await self.db.docflow_activity_logs.insert_one({
                "template_id": template_id,
                "document_id": document_id,
                "tenant_id": tenant_id,
                "event_type": event_type,
                "message": f"Document {event_type}: {payload.get('recipient_email', 'unknown')}",
                "recipient": payload.get("recipient_email"),
                "timestamp": datetime.now(timezone.utc).isoformat()
            })

            await self.fire_webhook(template_id, event_type, payload, tenant_id)

        except Exception as e:
            logger.error(f"Error firing document event: {e}")

    async def fire_package_event(
        self,
        package_id: str,
        event_type: str,
        tenant_id: str,
        extra_data: Optional[Dict[str, Any]] = None
    ):
        """
        Fire webhook for a package-level event.
        Produces a flat payload matching the downloadable sample format.
        """
        try:
            package = await self.db.docflow_packages.find_one(
                {"id": package_id, "tenant_id": tenant_id},
                {"_id": 0}
            )
            if not package:
                # Try package_runs collection
                package = await self.db.docflow_package_runs.find_one(
                    {"id": package_id, "tenant_id": tenant_id},
                    {"_id": 0}
                )
            if not package:
                return

            webhook_config = package.get("webhook_config", {})
            webhook_url = webhook_config.get("url")
            now_iso = datetime.now(timezone.utc).isoformat()

            # ── Map internal event to UI event ──
            _EVENT_MAP = {
                "document_signed": "signed",
                "signed": "signed",
                "package_completed": "signed_copy",
                "completed": "signed_copy",
                "document_opened": "opened",
                "opened": "opened",
                "recipient_notified": "sent",
                "package_sent": "sent",
                "sent": "sent",
                "wave_started": "sent",
                "package_created": "sent",
                "document_generated": "sent",
                "approved": "approve_reject",
                "rejected": "approve_reject",
                "recipient_approved": "approve_reject",
                "recipient_rejected": "approve_reject",
                "signed_copy": "signed_copy",
            }
            mapped_event = _EVENT_MAP.get(event_type, event_type)
            extra = extra_data or {}

            pkg_name = package.get("package_name") or package.get("name") or ""

            # ── Build flat payload matching the download sample ──
            payload = {
                "event": mapped_event,
                "timestamp": now_iso,
                "package_id": package_id,
                "package_name": pkg_name,
                "tenant_id": tenant_id,
            }

            # Add metadata if present in extra_data
            if extra.get("metadata"):
                payload["metadata"] = extra["metadata"]

            # Get the first document for context (many events are doc-level)
            first_doc_entry = (package.get("documents") or [{}])[0] if package.get("documents") else {}
            first_doc_id = first_doc_entry.get("document_id", "")
            first_doc_name = first_doc_entry.get("document_name", pkg_name)

            # Resolve the triggering recipient from extra_data
            recipient_name = extra.get("signer_name") or extra.get("recipient_name", "")
            recipient_email = extra.get("signer_email") or extra.get("recipient_email", "")

            # If no recipient in extra_data, try to find from the package's active recipients
            if not recipient_email:
                for r in package.get("recipients", []):
                    if r.get("status") in ("sent", "signed", "approved", "reviewed", "viewed", "completed"):
                        recipient_name = recipient_name or r.get("name", "")
                        recipient_email = recipient_email or r.get("email", "")
                        break

            if mapped_event == "signed":
                # ── Signed event ──
                doc_id = extra.get("document_id", first_doc_id)
                template_name = extra.get("template_name", first_doc_name)

                payload["document_id"] = doc_id
                payload["document_status"] = "signed"
                payload["template_name"] = template_name
                payload["recipient_email"] = recipient_email
                payload["recipient_name"] = recipient_name
                payload["signed_at"] = extra.get("signed_at", now_iso)
                payload["status"] = extra.get("status", "completed")

                # Build signed_documents from extra or from DB
                signed_docs = extra.get("signed_documents")
                if not signed_docs:
                    signed_docs = await self._get_signed_documents(package)
                payload["signed_documents"] = signed_docs or []
                payload["recipient_details"] = {"name": recipient_name, "email": recipient_email}

            elif mapped_event == "opened":
                payload["document_id"] = extra.get("document_id", first_doc_id)
                payload["recipient_email"] = recipient_email
                payload["recipient_name"] = recipient_name
                payload["opened_at"] = extra.get("opened_at", now_iso)

            elif mapped_event == "sent":
                payload["document_id"] = extra.get("document_id", first_doc_id)
                payload["recipient_email"] = recipient_email
                payload["recipient_name"] = recipient_name
                payload["sent_at"] = now_iso
                payload["delivery_method"] = extra.get("delivery_method", "email")
                payload["recipient_count"] = extra.get("recipient_count", len(package.get("recipients", [])))

            elif mapped_event == "approve_reject":
                action = extra.get("action", "approved")
                payload["action"] = action
                payload["recipient_email"] = recipient_email
                payload["recipient_name"] = recipient_name
                if action == "rejected":
                    payload["reason"] = extra.get("reason") or extra.get("reject_reason", "")
                    payload["rejected_at"] = extra.get("rejected_at", now_iso)
                else:
                    payload["approved_at"] = extra.get("approved_at", now_iso)

            elif mapped_event == "signed_copy":
                payload["document_id"] = extra.get("document_id", first_doc_id)
                payload["template_name"] = extra.get("template_name", first_doc_name)
                signed_docs = extra.get("signed_documents")
                if not signed_docs:
                    signed_docs = await self._get_signed_documents(package)
                payload["signed_documents"] = signed_docs or []
                payload["generated_at"] = now_iso

            # ── Log to activity ──
            await self.db.docflow_activity_logs.insert_one({
                "package_id": package_id,
                "tenant_id": tenant_id,
                "event_type": f"package_{mapped_event}",
                "message": f"Package {mapped_event}: {pkg_name or package_id}",
                "details": payload,
                "timestamp": now_iso
            })

            if not webhook_url:
                return

            # ── Check if event is enabled ──
            enabled_events = webhook_config.get("events", [])
            if enabled_events and mapped_event not in enabled_events:
                return

            # ── Dispatch webhook ──
            headers = {"Content-Type": "application/json"}
            custom_headers = webhook_config.get("headers", {})
            headers.update(custom_headers)

            secret = webhook_config.get("secret")
            if secret:
                payload_str = json.dumps(payload, sort_keys=True)
                signature = hmac.new(
                    secret.encode(), payload_str.encode(), hashlib.sha256
                ).hexdigest()
                headers["X-Webhook-Signature"] = f"sha256={signature}"

            retry_enabled = webhook_config.get("retry_enabled", True)
            max_retries = webhook_config.get("max_retries", 3)

            result = await self._send_webhook(
                url=webhook_url,
                payload=payload,
                headers=headers,
                max_retries=max_retries if retry_enabled else 1
            )

            await self._log_webhook_package(
                package_id=package_id,
                event_type=mapped_event,
                webhook_url=webhook_url,
                payload=payload,
                result=result,
                tenant_id=tenant_id
            )

        except Exception as e:
            logger.error(f"Error firing package event: {e}")

    async def _get_signed_documents(self, package: dict) -> list:
        """Fetch signed document details for a package."""
        signed_docs = []
        for doc_entry in package.get("documents", []):
            doc_id = doc_entry.get("document_id")
            if doc_id:
                doc = await self.db.docflow_documents.find_one(
                    {"id": doc_id},
                    {"_id": 0, "signed_file_url": 1, "template_name": 1, "signed_at": 1, "status": 1}
                )
                if doc and doc.get("signed_file_url"):
                    signed_docs.append({
                        "document_id": doc_id,
                        "template_name": doc.get("template_name", doc_entry.get("document_name", "")),
                        "signed_document_url": doc["signed_file_url"],
                        "signed_at": doc.get("signed_at"),
                    })
        return signed_docs

    async def _log_webhook_package(
        self,
        package_id: str,
        event_type: str,
        webhook_url: str,
        payload: Dict[str, Any],
        result: Dict[str, Any],
        tenant_id: str
    ):
        """Log package webhook delivery"""
        try:
            log_entry = {
                "package_id": package_id,
                "tenant_id": tenant_id,
                "event_type": f"webhook_{'success' if result.get('success') else 'failed'}",
                "message": f"Package webhook {event_type}: {'delivered' if result.get('success') else 'failed'} to {webhook_url[:50]}",
                "details": {
                    "webhook_url": webhook_url,
                    "event": event_type,
                    "status_code": result.get("status_code"),
                    "error": result.get("error"),
                    "attempt": result.get("attempt") or result.get("attempts")
                },
                "timestamp": datetime.now(timezone.utc).isoformat()
            }
            await self.db.docflow_activity_logs.insert_one(log_entry)
        except Exception as e:
            logger.error(f"Failed to log package webhook: {e}")
