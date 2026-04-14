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
                "recipient_email": document.get("recipient_email"),
                "recipient_name": document.get("recipient_name"),
                "crm_object_type": document.get("crm_object_type"),
                "crm_object_id": document.get("crm_object_id"),
                **(extra_data or {})
            }

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
        Looks up the package's webhook config from the package itself.

        event_types: package_created, package_sent, recipient_notified,
                     document_generated, wave_started, document_signed,
                     package_completed
        """
        try:
            package = await self.db.docflow_packages.find_one(
                {"id": package_id, "tenant_id": tenant_id},
                {"_id": 0}
            )
            if not package:
                return

            webhook_config = package.get("webhook_config", {})
            webhook_url = webhook_config.get("url")

            payload = {
                "package_id": package_id,
                "package_name": package.get("package_name"),
                "package_status": package.get("status"),
                "event": event_type,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                **(extra_data or {})
            }

            # Log the event to audit/activity
            await self.db.docflow_activity_logs.insert_one({
                "package_id": package_id,
                "tenant_id": tenant_id,
                "event_type": f"package_{event_type}",
                "message": f"Package {event_type}: {package.get('package_name', package_id)}",
                "details": payload,
                "timestamp": datetime.now(timezone.utc).isoformat()
            })

            if not webhook_url:
                return  # No webhook configured — just log

            # Check if event is enabled
            enabled_events = webhook_config.get("events", [])
            if enabled_events and event_type not in enabled_events:
                return

            webhook_payload = {
                "event": event_type,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "package_id": package_id,
                "package_name": package.get("package_name"),
                "tenant_id": tenant_id,
                "data": payload
            }

            headers = {"Content-Type": "application/json"}
            custom_headers = webhook_config.get("headers", {})
            headers.update(custom_headers)

            secret = webhook_config.get("secret")
            if secret:
                payload_str = json.dumps(webhook_payload, sort_keys=True)
                signature = hmac.new(
                    secret.encode(), payload_str.encode(), hashlib.sha256
                ).hexdigest()
                headers["X-Webhook-Signature"] = f"sha256={signature}"

            retry_enabled = webhook_config.get("retry_enabled", True)
            max_retries = webhook_config.get("max_retries", 3)

            result = await self._send_webhook(
                url=webhook_url,
                payload=webhook_payload,
                headers=headers,
                max_retries=max_retries if retry_enabled else 1
            )

            # Log webhook delivery
            await self._log_webhook_package(
                package_id=package_id,
                event_type=event_type,
                webhook_url=webhook_url,
                payload=webhook_payload,
                result=result,
                tenant_id=tenant_id
            )

        except Exception as e:
            logger.error(f"Error firing package event: {e}")

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
