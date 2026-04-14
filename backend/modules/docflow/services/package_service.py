"""
DocFlow Package Service — Phase 1

Handles package lifecycle: create, list, get, void.
Orchestrates document generation across multiple templates.
"""
import logging
from typing import Optional, Dict, Any, List
from datetime import datetime, timezone
from uuid import uuid4

from .routing_engine import RoutingEngine
from .docflow_audit_service import DocFlowAuditService
from .document_service_enhanced import EnhancedDocumentService

logger = logging.getLogger(__name__)


class PackageService:
    def __init__(self, db):
        self.db = db
        self.audit_service = DocFlowAuditService(db)
        self.routing_engine = RoutingEngine(db, audit_service=self.audit_service)
        self.document_service = EnhancedDocumentService(db)

    # ── Package Creation & Sending ──

    async def create_and_send_package(
        self,
        name: str,
        documents: List[Dict[str, Any]],
        recipients: List[Dict[str, Any]],
        routing_config: Dict[str, Any],
        output_mode: str,
        security: Dict[str, Any],
        source_context: Optional[Dict[str, Any]],
        expires_at: Optional[datetime],
        send_email: bool,
        delivery_mode: str,
        user_id: str,
        tenant_id: str,
        webhook_config: Optional[Dict[str, Any]] = None,
    ) -> dict:
        """
        Create a package, generate all documents, initialize routing.
        This is the main entry point for package mode in generate-links.
        """
        now = datetime.now(timezone.utc)
        package_id = str(uuid4())

        # Build recipient objects with tokens
        package_recipients = []
        for r in recipients:
            package_recipients.append({
                "id": str(uuid4()),
                "name": r.get("name", ""),
                "email": r.get("email", ""),
                "role_type": r.get("role_type", "SIGN"),
                "routing_order": r.get("routing_order", 1),
                "status": "pending",
                "action_taken": None,
                "action_at": None,
                "reject_reason": None,
                "assigned_components": r.get("assigned_components", {}),
                "public_token": str(uuid4()),
                "notified_at": None,
            })

        # Build document references
        package_documents = []
        for doc in documents:
            package_documents.append({
                "template_id": doc.get("template_id"),
                "document_id": None,  # Will be populated after generation
                "document_name": doc.get("document_name", ""),
                "order": doc.get("order", 1),
                "merge_fields": doc.get("merge_fields", {}),
            })

        # Sort documents by order
        package_documents.sort(key=lambda d: d.get("order", 1))

        # Create package record
        public_link_token = str(uuid4())
        package = {
            "id": package_id,
            "tenant_id": tenant_id,
            "name": name,
            "status": "draft",
            "send_mode": "package",
            "delivery_mode": delivery_mode,
            "public_link_token": public_link_token,
            "documents": package_documents,
            "recipients": package_recipients,
            "routing_config": routing_config or {"mode": "sequential", "on_reject": "void"},
            "output_mode": output_mode or "separate",
            "security_settings": security or {"require_auth": True, "session_timeout_minutes": 15},
            "source_context": source_context,
            "void_reason": None,
            "voided_by": None,
            "voided_at": None,
            "certificate_url": None,
            "webhook_config": webhook_config or {},
            "created_by": user_id,
            "created_at": now.isoformat(),
            "updated_at": now.isoformat(),
            "completed_at": None,
            "expires_at": expires_at.isoformat() if expires_at else None,
        }

        await self.db.docflow_packages.insert_one(package)

        await self.audit_service.log_event(
            tenant_id=tenant_id,
            package_id=package_id,
            event_type="package_created",
            actor=user_id,
            metadata={"name": name, "document_count": len(documents), "recipient_count": len(recipients)},
        )

        # Generate each document
        generated_doc_ids = []
        delivery_channels = []
        if delivery_mode in ("email", "both"):
            delivery_channels.append("email")
        if delivery_mode in ("public_link", "both"):
            delivery_channels.append("public_link")

        for i, pkg_doc in enumerate(package_documents):
            try:
                # Build recipients for this specific document (flatten assigned_components)
                doc_recipients = []
                for pr in package_recipients:
                    assigned = pr.get("assigned_components", {})
                    doc_field_ids = assigned.get(pkg_doc["template_id"], [])
                    doc_recipients.append({
                        "name": pr["name"],
                        "email": pr["email"],
                        "role": pr.get("role_type", "SIGN").lower(),
                        "routing_order": pr["routing_order"],
                        "is_required": True,
                        "assigned_field_ids": doc_field_ids,
                    })

                sf_context = None
                if source_context:
                    sf_context = {
                        **source_context,
                        "fields": pkg_doc.get("merge_fields", {}),
                    }
                elif pkg_doc.get("merge_fields"):
                    sf_context = {"fields": pkg_doc["merge_fields"]}

                document = await self.document_service.generate_document(
                    template_id=pkg_doc["template_id"],
                    crm_object_id=(source_context or {}).get("record_id", "") or "package-gen",
                    crm_object_type=(source_context or {}).get("object_type", "") or "manual",
                    user_id=user_id,
                    tenant_id=tenant_id,
                    delivery_channels=delivery_channels,
                    recipients=doc_recipients,
                    routing_mode="sequential",
                    send_email=False,  # Don't send emails per-doc; routing engine handles it
                    salesforce_context=sf_context,
                    expires_at=expires_at,
                    require_auth=security.get("require_auth", True) if security else True,
                    delivery_mode=delivery_mode,
                )

                doc_id = document.get("id")
                generated_doc_ids.append(doc_id)

                # Link document to package
                await self.db.docflow_documents.update_one(
                    {"id": doc_id},
                    {"$set": {"package_id": package_id, "package_order": i + 1}}
                )

                # Update package with generated doc ID
                pkg_doc["document_id"] = doc_id

                await self.audit_service.log_event(
                    tenant_id=tenant_id,
                    package_id=package_id,
                    document_id=doc_id,
                    event_type="document_generated",
                    actor=user_id,
                    metadata={"template_id": pkg_doc["template_id"], "order": i + 1},
                )

            except Exception as e:
                logger.error(f"[PackageService] Failed to generate doc {i+1} "
                             f"(template={pkg_doc['template_id']}): {e}")
                # Rollback: void the package on partial failure
                await self._rollback_package(package_id, generated_doc_ids, str(e), user_id)
                raise ValueError(
                    f"Package generation failed on document {i+1} "
                    f"({pkg_doc.get('document_name', pkg_doc['template_id'])}): {str(e)}"
                )

        # Save updated document references
        await self.db.docflow_packages.update_one(
            {"id": package_id},
            {"$set": {"documents": package_documents, "updated_at": datetime.now(timezone.utc).isoformat()}}
        )

        # Initialize routing (notifies first wave)
        await self.routing_engine.initialize_routing(package_id)

        # Fetch final state
        final_package = await self.get_package(package_id, tenant_id)
        return final_package

    # ── CRUD ──

    async def get_package(self, package_id: str, tenant_id: str) -> Optional[dict]:
        """Get a single package by ID."""
        return await self.db.docflow_packages.find_one(
            {"id": package_id, "tenant_id": tenant_id},
            {"_id": 0},
        )

    async def list_packages(
        self,
        tenant_id: str,
        status: Optional[str] = None,
        skip: int = 0,
        limit: int = 50,
    ) -> dict:
        """List blueprint packages for a tenant (exclude runs)."""
        query = {"tenant_id": tenant_id, "_type": {"$ne": "run"}}
        if status:
            query["status"] = status

        total = await self.db.docflow_packages.count_documents(query)
        cursor = self.db.docflow_packages.find(
            query, {"_id": 0}
        ).sort("created_at", -1).skip(skip).limit(limit)
        packages = await cursor.to_list(length=limit)

        # Enrich with runs_count for each package
        for pkg in packages:
            pid = pkg.get("id")
            pkg["runs_count"] = await self.db.docflow_package_runs.count_documents({"package_id": pid})
            pkg["completed_runs"] = await self.db.docflow_package_runs.count_documents({"package_id": pid, "status": "completed"})

        return {"packages": packages, "total": total, "skip": skip, "limit": limit}

    async def void_package(
        self,
        package_id: str,
        tenant_id: str,
        reason: str,
        user_id: str,
    ) -> bool:
        """Void a package. Only in_progress packages can be voided."""
        package = await self.get_package(package_id, tenant_id)
        if not package:
            raise ValueError("Package not found")
        if package["status"] not in ("in_progress", "draft"):
            raise ValueError(f"Cannot void package in '{package['status']}' status")

        await self.routing_engine._void_package(package_id, reason, user_id)
        return True

    async def get_package_with_documents(self, package_id: str, tenant_id: str) -> Optional[dict]:
        """Get package with full document details."""
        package = await self.get_package(package_id, tenant_id)
        if not package:
            return None

        # Fetch all documents for this package
        doc_ids = [d.get("document_id") for d in package.get("documents", []) if d.get("document_id")]
        if doc_ids:
            cursor = self.db.docflow_documents.find(
                {"id": {"$in": doc_ids}, "tenant_id": tenant_id},
                {"_id": 0},
            )
            docs = await cursor.to_list(length=len(doc_ids))
            docs_by_id = {d["id"]: d for d in docs}
            package["document_details"] = [
                docs_by_id.get(d.get("document_id"), {})
                for d in package.get("documents", [])
            ]

        return package

    async def get_routing_status(self, package_id: str) -> dict:
        """Get routing progress summary."""
        return await self.routing_engine.get_package_status(package_id)

    # ── Package Templates ──

    async def send_package_run(
        self,
        package_id: str,
        package: dict,
        recipients: list,
        routing_config: dict,
        security: dict,
        delivery_mode: str,
        send_email: bool,
        user_id: str,
        tenant_id: str,
    ) -> dict:
        """Create a new run/execution for a reusable package blueprint."""
        now = datetime.now(timezone.utc)
        run_id = str(uuid4())

        # Build recipient objects with tokens
        run_recipients = []
        for r in recipients:
            run_recipients.append({
                "id": str(uuid4()),
                "name": r.get("name", ""),
                "email": r.get("email", ""),
                "role_type": r.get("role_type", "SIGN"),
                "routing_order": r.get("routing_order", 1),
                "status": "pending",
                "action_taken": None,
                "action_at": None,
                "reject_reason": None,
                "assigned_components": r.get("assigned_components", {}),
                "public_token": str(uuid4()),
                "notified_at": None,
            })

        # Build documents from the blueprint
        blueprint_docs = package.get("documents", [])
        run_documents = []
        for doc in blueprint_docs:
            run_documents.append({
                "template_id": doc.get("template_id"),
                "document_id": None,
                "document_name": doc.get("document_name", ""),
                "order": doc.get("order", 1),
                "merge_fields": doc.get("merge_fields", {}),
            })
        run_documents.sort(key=lambda d: d.get("order", 1))

        public_link_token = str(uuid4())
        run = {
            "id": run_id,
            "package_id": package_id,
            "tenant_id": tenant_id,
            "name": package.get("name", "Untitled"),
            "status": "draft",
            "send_mode": "package",
            "delivery_mode": delivery_mode,
            "public_link_token": public_link_token,
            "documents": run_documents,
            "recipients": run_recipients,
            "routing_config": routing_config,
            "output_mode": "separate",
            "security_settings": security,
            "source_context": None,
            "void_reason": None,
            "voided_by": None,
            "voided_at": None,
            "certificate_url": None,
            "webhook_config": package.get("webhook_config", {}),
            "created_by": user_id,
            "created_at": now.isoformat(),
            "updated_at": now.isoformat(),
            "completed_at": None,
            "expires_at": None,
        }

        # Insert the run into docflow_package_runs
        await self.db.docflow_package_runs.insert_one(run)

        # Also insert into docflow_packages so existing routing engine works
        # The run IS a package in the routing engine's eyes
        await self.db.docflow_packages.insert_one({**run, "_type": "run"})

        await self.audit_service.log_event(
            tenant_id=tenant_id,
            package_id=run_id,
            event_type="package_created",
            actor=user_id,
            metadata={"name": package.get("name"), "document_count": len(run_documents), "recipient_count": len(recipients)},
        )

        # Generate each document
        delivery_channels = []
        if delivery_mode in ("email", "both"):
            delivery_channels.append("email")
        if delivery_mode in ("public_link", "both"):
            delivery_channels.append("public_link")

        generated_doc_ids = []
        for i, pkg_doc in enumerate(run_documents):
            try:
                doc_recipients = []
                for pr in run_recipients:
                    assigned = pr.get("assigned_components", {})
                    doc_field_ids = assigned.get(pkg_doc["template_id"], [])
                    doc_recipients.append({
                        "name": pr["name"],
                        "email": pr["email"],
                        "role": pr.get("role_type", "SIGN").lower(),
                        "routing_order": pr["routing_order"],
                        "is_required": True,
                        "assigned_field_ids": doc_field_ids,
                    })

                document = await self.document_service.generate_document(
                    template_id=pkg_doc["template_id"],
                    crm_object_id="package-gen",
                    crm_object_type="manual",
                    user_id=user_id,
                    tenant_id=tenant_id,
                    delivery_channels=delivery_channels,
                    recipients=doc_recipients,
                    routing_mode="sequential",
                    send_email=False,
                    salesforce_context=None,
                    expires_at=None,
                    require_auth=security.get("require_auth", True),
                    delivery_mode=delivery_mode,
                )

                doc_id = document.get("id")
                generated_doc_ids.append(doc_id)

                await self.db.docflow_documents.update_one(
                    {"id": doc_id},
                    {"$set": {"package_id": run_id, "package_order": i + 1}}
                )
                pkg_doc["document_id"] = doc_id

                await self.audit_service.log_event(
                    tenant_id=tenant_id,
                    package_id=run_id,
                    document_id=doc_id,
                    event_type="document_generated",
                    actor=user_id,
                    metadata={"template_id": pkg_doc["template_id"], "order": i + 1},
                )

            except Exception as e:
                logger.error(f"[PackageService] Run gen failed doc {i+1}: {e}")
                await self._rollback_package(run_id, generated_doc_ids, str(e), user_id)
                raise ValueError(f"Run generation failed on document {i+1}: {str(e)}")

        # Save updated document references in both collections
        update_data = {"documents": run_documents, "updated_at": datetime.now(timezone.utc).isoformat()}
        await self.db.docflow_package_runs.update_one({"id": run_id}, {"$set": update_data})
        await self.db.docflow_packages.update_one({"id": run_id}, {"$set": update_data})

        # Initialize routing — for public_recipients, skip the full routing
        # engine (which sends emails). Instead, just set status and activate recipients.
        if delivery_mode == "public_recipients":
            now_iso = datetime.now(timezone.utc).isoformat()
            # Set all non-RECEIVE_COPY recipients to "notified" (ready to sign)
            final_recipients = run_recipients[:]
            for r in final_recipients:
                if r.get("role_type") == "RECEIVE_COPY":
                    r["status"] = "completed"
                    r["action_taken"] = "receive_copy"
                    r["action_at"] = now_iso
                else:
                    r["status"] = "notified"
                    r["notified_at"] = now_iso
            status_update = {
                "status": "in_progress",
                "recipients": final_recipients,
                "updated_at": now_iso,
            }
            await self.db.docflow_packages.update_one({"id": run_id}, {"$set": status_update})
            await self.db.docflow_package_runs.update_one({"id": run_id}, {"$set": status_update})
        else:
            await self.routing_engine.initialize_routing(run_id)

        # Update the parent package's updated_at
        await self.db.docflow_packages.update_one(
            {"id": package_id},
            {"$set": {"updated_at": datetime.now(timezone.utc).isoformat()}}
        )

        # Fetch final state
        final_run = await self.db.docflow_package_runs.find_one({"id": run_id}, {"_id": 0})
        return final_run

    # ── Original Package Templates ──

    async def create_package_template(self, data: dict, user_id: str, tenant_id: str) -> dict:
        """Create a new package template."""
        template_id = str(uuid4())
        now = datetime.now(timezone.utc)

        # Validate that all referenced templates exist
        template_ids = [t.get("template_id") for t in data.get("template_documents", [])]
        for tid in template_ids:
            exists = await self.db.docflow_templates.find_one(
                {"id": tid, "tenant_id": tenant_id}, {"_id": 0, "id": 1}
            )
            if not exists:
                raise ValueError(f"Template {tid} not found")

        template = {
            "id": template_id,
            "tenant_id": tenant_id,
            "name": data.get("name", ""),
            "description": data.get("description", ""),
            "template_documents": data.get("template_documents", []),
            "default_recipients": data.get("default_recipients", []),
            "default_routing_config": data.get("default_routing_config", {"mode": "sequential", "on_reject": "void"}),
            "default_output_mode": data.get("default_output_mode", "separate"),
            "default_security_settings": data.get("default_security_settings", {"require_auth": True, "session_timeout_minutes": 15}),
            "status": "draft",
            "created_by": user_id,
            "created_at": now.isoformat(),
            "updated_at": now.isoformat(),
        }

        await self.db.docflow_package_templates.insert_one(template)
        template.pop("_id", None)
        return template

    async def list_package_templates(self, tenant_id: str) -> list:
        """List all package templates for a tenant."""
        cursor = self.db.docflow_package_templates.find(
            {"tenant_id": tenant_id}, {"_id": 0}
        ).sort("created_at", -1)
        return await cursor.to_list(length=200)

    async def get_package_template(self, template_id: str, tenant_id: str) -> Optional[dict]:
        """Get a single package template."""
        return await self.db.docflow_package_templates.find_one(
            {"id": template_id, "tenant_id": tenant_id}, {"_id": 0}
        )

    async def update_package_template(self, template_id: str, tenant_id: str, data: dict) -> Optional[dict]:
        """Update a package template."""
        update_data = {k: v for k, v in data.items() if v is not None}
        update_data["updated_at"] = datetime.now(timezone.utc).isoformat()

        result = await self.db.docflow_package_templates.find_one_and_update(
            {"id": template_id, "tenant_id": tenant_id},
            {"$set": update_data},
            return_document=True,
            projection={"_id": 0},
        )
        return result

    async def delete_package_template(self, template_id: str, tenant_id: str) -> bool:
        """Delete a package template."""
        result = await self.db.docflow_package_templates.delete_one(
            {"id": template_id, "tenant_id": tenant_id}
        )
        return result.deleted_count > 0

    # ── Internal Helpers ──

    async def _rollback_package(self, package_id: str, doc_ids: list, error: str, user_id: str):
        """Rollback on partial generation failure — void the package."""
        now = datetime.now(timezone.utc).isoformat()
        await self.db.docflow_packages.update_one(
            {"id": package_id},
            {"$set": {
                "status": "voided",
                "void_reason": f"Generation failed: {error}",
                "voided_by": "system",
                "voided_at": now,
                "updated_at": now,
            }}
        )
        # Mark generated docs as failed
        for doc_id in doc_ids:
            await self.db.docflow_documents.update_one(
                {"id": doc_id},
                {"$set": {"status": "failed"}}
            )

        await self.audit_service.log_event(
            tenant_id="",
            package_id=package_id,
            event_type="package_voided",
            actor="system",
            metadata={"reason": f"Generation rollback: {error}"},
        )
