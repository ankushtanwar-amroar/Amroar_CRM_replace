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

    # ──────────────────────────────────────────────────────────────────────
    # Phase 81.3 — merge-field alias enrichment
    # Adds dynamic `<merge_object>.<merge_field>` keys (e.g., `account.name`)
    # alongside the existing `merge_<id>` keys inside webhook `field_data` so
    # downstream receivers can map values to CRM fields without decoding UUIDs.
    # ──────────────────────────────────────────────────────────────────────
    @staticmethod
    def _merge_alias_key(placement: dict) -> Optional[str]:
        """Resolve the friendly merge alias for a placement.

        Preference order (matches sender-side templates):
          1. `<merge_object>.<merge_field>` if both are set.
          2. `merge_field` alone (already dotted in many integrations).
          3. `merge_token` (legacy template format).
          4. `mergePattern` stripped of `{{` `}}` braces.
          5. `name` (final fallback).
        """
        if not placement:
            return None
        m_obj = placement.get("merge_object") or placement.get("mergeObject") or ""
        m_fld = placement.get("merge_field") or placement.get("mergeField") or ""
        if m_obj and m_fld:
            return f"{m_obj}.{m_fld}".strip()
        if m_fld and "." in str(m_fld):
            return str(m_fld).strip()
        if m_fld:
            return str(m_fld).strip()
        token = placement.get("merge_token") or placement.get("mergeToken")
        if token:
            return str(token).strip()
        pattern = placement.get("mergePattern") or placement.get("merge_pattern")
        if pattern:
            return str(pattern).strip("{}").strip()
        name = placement.get("name")
        if name:
            return str(name).strip()
        return None

    @classmethod
    def _enrich_field_data_with_merge_aliases(
        cls,
        base_field_data: Dict[str, Any],
        placements: List[Dict[str, Any]],
        resolved_merge_values: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Return a copy of `base_field_data` augmented with dotted CRM aliases
        like `account.name: "Jack"` for every merge field placement.

        Existing `merge_<id>` keys are preserved unchanged. We only ADD new
        keys; if an alias key already exists in `base_field_data` (rare —
        e.g., the signer happened to enter a literal field id matching a
        merge alias), we don't overwrite it.

        Value resolution per placement (first non-empty wins):
          1. Signer entry → `base_field_data[placement.id]`
          2. Placement default → `placement.value` or `placement.default_value`
          3. Pre-resolved merge map → `resolved_merge_values[<alias>]`
        """
        enriched = dict(base_field_data or {})
        resolved = resolved_merge_values or {}

        for p in placements or []:
            ftype = (p.get("type") or p.get("field_type") or "").lower()
            is_merge = (
                ftype == "merge"
                or bool(p.get("merge_field"))
                or bool(p.get("merge_token"))
                or bool(p.get("mergePattern"))
            )
            if not is_merge:
                continue
            alias = cls._merge_alias_key(p)
            if not alias:
                continue
            pid = p.get("id")
            val = enriched.get(pid) if pid else None
            if val in (None, ""):
                val = p.get("value") or p.get("default_value")
            if val in (None, ""):
                val = resolved.get(alias) or resolved.get(str(alias))
            if val in (None, ""):
                continue
            # Don't overwrite an explicit base entry under the same key.
            enriched.setdefault(str(alias), val)

        return enriched

    async def _enrich_document_field_data(
        self,
        document_id: str,
        tenant_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Async helper: load the document + (fall back to template) placements
        and return its enriched `field_data` ready for webhook payload."""
        try:
            doc_filter = {"id": document_id}
            if tenant_id:
                doc_filter["tenant_id"] = tenant_id
            document = await self.db.docflow_documents.find_one(doc_filter, {"_id": 0})
            if not document:
                return {}
            placements = document.get("field_placements") or []
            if not placements and document.get("template_id"):
                tpl = await self.db.docflow_templates.find_one(
                    {"id": document["template_id"]}, {"_id": 0, "field_placements": 1}
                )
                if tpl:
                    placements = tpl.get("field_placements") or []
            return self._enrich_field_data_with_merge_aliases(
                base_field_data=document.get("field_data") or {},
                placements=placements,
                resolved_merge_values=document.get("merge_fields") or {},
            )
        except Exception as e:
            logger.warning(f"_enrich_document_field_data failed for {document_id}: {e}")
            return {}

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

            # Phase 81: include field values + merge field values so downstream
            # systems (Salesforce, etc.) receive the data the signer entered.
            # `field_data` holds typed text/date/checkbox values keyed by field id.
            # `merge_fields` holds the resolved/overridden merge field values
            # (including values where an originally-empty merge field was
            # converted to a fillable text field and submitted by the signer).
            #
            # Phase 81.3 — also inject `<merge_object>.<merge_field>` aliases
            # (e.g., `account.name`) directly INSIDE `field_data` so receivers
            # can map values to CRM fields without decoding merge UUIDs.
            try:
                placements = document.get("field_placements") or []
                # Fall back to template definition when the document doesn't
                # carry placements (legacy / package-cloned docs).
                if not placements:
                    try:
                        tpl = await self.db.docflow_templates.find_one(
                            {"id": template_id, "tenant_id": tenant_id},
                            {"_id": 0, "field_placements": 1},
                        )
                        if tpl:
                            placements = tpl.get("field_placements") or []
                    except Exception:
                        placements = []

                enriched_field_data = self._enrich_field_data_with_merge_aliases(
                    base_field_data=document.get("field_data") or {},
                    placements=placements,
                    resolved_merge_values=document.get("merge_fields") or {},
                )

                merge_fields_resolved = document.get("merge_fields") or {}

                # If merge_fields_resolved is empty, derive it from field_data
                # by collecting fields whose definition flags them as merge fields.
                if not merge_fields_resolved:
                    field_data_raw = document.get("field_data") or {}
                    derived = {}
                    for p in placements:
                        field_type = (p.get("type") or p.get("field_type") or "").lower()
                        is_merge = (
                            field_type == "merge"
                            or bool(p.get("merge_field"))
                            or bool(p.get("merge_token"))
                        )
                        if not is_merge:
                            continue
                        key = self._merge_alias_key(p)
                        if not key:
                            continue
                        # Prefer signer-entered value (converted-text path),
                        # fall back to the field's pre-resolved default.
                        val = field_data_raw.get(p.get("id"))
                        if val in (None, ""):
                            val = p.get("value") or p.get("default_value") or ""
                        derived[str(key)] = val
                    if derived:
                        merge_fields_resolved = derived

                if enriched_field_data:
                    payload["field_data"] = enriched_field_data
                if merge_fields_resolved:
                    payload["merge_fields"] = merge_fields_resolved
            except Exception as enrich_err:
                logger.warning(f"Webhook payload enrichment failed: {enrich_err}")

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

                # Phase 81.3 — enrich `field_data` with merge-field aliases
                # (e.g., `account.name`) for every document in the package so
                # CRM receivers can map directly without decoding UUIDs.
                try:
                    payload["field_data"] = await self._build_package_field_data(
                        package, primary_document_id=doc_id, tenant_id=tenant_id,
                    )
                except Exception as fd_err:
                    logger.warning(f"Package signed field_data enrichment failed: {fd_err}")

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

                # Phase 81.3 — same merge-alias enrichment as `signed`.
                try:
                    payload["field_data"] = await self._build_package_field_data(
                        package,
                        primary_document_id=extra.get("document_id", first_doc_id),
                        tenant_id=tenant_id,
                    )
                except Exception as fd_err:
                    logger.warning(f"Package signed_copy field_data enrichment failed: {fd_err}")

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

    async def _build_package_field_data(
        self,
        package: dict,
        primary_document_id: Optional[str] = None,
        tenant_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Aggregate enriched `field_data` (merge aliases + raw signer entries)
        across every child document in the package.

        Result keys:
          - `<merge_object>.<merge_field>` aliases — e.g., `account.name`
          - Raw `merge_<id>`, `signature_<id>`, `text_<id>` etc. (kept unchanged)
          - `record_id`, `object_type` if available on the primary document for
            quick CRM correlation.

        When two child documents define the same alias, the FIRST one wins —
        consistent with `dict.setdefault` semantics used by the per-doc helper.
        """
        aggregated: Dict[str, Any] = {}

        # Resolve primary document for record_id / object_type prefix.
        primary_doc = None
        if primary_document_id:
            try:
                primary_doc = await self.db.docflow_documents.find_one(
                    {"id": primary_document_id}, {"_id": 0}
                )
            except Exception:
                primary_doc = None

        if primary_doc:
            rec_id = (
                primary_doc.get("crm_object_id")
                or primary_doc.get("record_id")
                or ""
            )
            obj_type = (
                primary_doc.get("crm_object_type")
                or primary_doc.get("object_type")
                or ""
            )
            if rec_id:
                aggregated["record_id"] = rec_id
            if obj_type:
                aggregated["object_type"] = obj_type
            sf_org = primary_doc.get("salesforce_org_id") or ""
            if sf_org:
                aggregated["salesforce_org_id"] = sf_org

        # Enrich + merge each child document's field_data into the aggregate.
        for entry in package.get("documents", []) or []:
            doc_id = entry.get("document_id")
            if not doc_id:
                continue
            enriched = await self._enrich_document_field_data(doc_id, tenant_id=tenant_id)
            for k, v in enriched.items():
                aggregated.setdefault(k, v)

        return aggregated

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
