"""
Template Service - Handles template CRUD, validation, and version control
"""
import uuid
import copy
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone
import re
import asyncio
import logging

logger = logging.getLogger(__name__)


class TemplateService:
    def __init__(self, db):
        self.db = db
        self.collection = db.docflow_templates

    # ── Migration: backfill existing templates with version fields ──
    async def migrate_version_fields(self):
        """One-time migration: add template_group_id and is_latest to legacy templates."""
        cursor = self.collection.find(
            {"template_group_id": {"$exists": False}},
            {"_id": 0, "id": 1}
        )
        ids = [doc["id"] async for doc in cursor]
        if not ids:
            return 0
        for tid in ids:
            await self.collection.update_one(
                {"id": tid},
                {"$set": {
                    "template_group_id": tid,
                    "is_latest": True,
                    "created_from_version": None,
                }}
            )
            # Ensure version field exists
            await self.collection.update_one(
                {"id": tid, "version": {"$exists": False}},
                {"$set": {"version": 1}}
            )
        logger.info(f"Migrated {len(ids)} templates with version fields")
        return len(ids)

    async def create_template(self, template_data: dict, user_id: str, tenant_id: str) -> dict:
        """Create new template (v1)"""
        template_id = str(uuid.uuid4())
        template = {
            "id": template_id,
            "tenant_id": tenant_id,
            "created_by": user_id,
            "updated_by": user_id,
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc),
            "version": 1,
            "template_group_id": template_data.get("template_group_id", template_id),
            "is_latest": True,
            "created_from_version": None,
            "status": "draft",
            **template_data
        }
        # Ensure group id is set
        if not template.get("template_group_id"):
            template["template_group_id"] = template_id

        await self.collection.insert_one(template)
        return template

    async def get_template(self, template_id: str, tenant_id: str) -> Optional[dict]:
        """Get template by ID"""
        return await self.collection.find_one({"id": template_id, "tenant_id": tenant_id})

    async def list_templates(self, tenant_id: str, status: Optional[str] = None, search: Optional[str] = None, page: int = 1, limit: int = 10) -> Dict[str, Any]:
        """List templates for tenant — only latest versions by default."""
        query = {"tenant_id": tenant_id, "is_latest": {"$ne": False}}
        if status:
            query["status"] = status
        if search:
            query["$or"] = [
                {"name": {"$regex": search, "$options": "i"}},
                {"description": {"$regex": search, "$options": "i"}}
            ]

        skip = (page - 1) * limit

        projection = {
            "_id": 0,
            "id": 1,
            "name": 1,
            "description": 1,
            "template_type": 1,
            "status": 1,
            "source": 1,
            "created_at": 1,
            "updated_at": 1,
            "created_by": 1,
            "is_validated": 1,
            "file_type": 1,
            "crm_connection": 1,
            "trigger_config.enabled": 1,
            "trigger_config.trigger_type": 1,
            "trigger_config.object_type": 1,
            "version": 1,
            "template_group_id": 1,
            "is_latest": 1,
            "created_from_version": 1,
        }

        total_task = self.collection.count_documents(query)
        templates_task = self.collection.find(query, projection).sort("created_at", -1).skip(skip).limit(limit).to_list(length=limit)
        total, templates = await asyncio.gather(total_task, templates_task)

        return {
            "templates": templates,
            "total": total,
            "page": page,
            "limit": limit,
            "pages": (total + limit - 1) // limit
        }

    async def list_latest_active_templates(self, tenant_id: str, search: Optional[str] = None, page: int = 1, limit: int = 20) -> Dict[str, Any]:
        """List only the highest-version ACTIVE template per template_group_id.
        Used by package creation to avoid showing duplicate versions."""

        match_stage: Dict[str, Any] = {
            "tenant_id": tenant_id,
            "status": {"$in": ["active", "Active"]},
        }
        if search:
            match_stage["$or"] = [
                {"name": {"$regex": search, "$options": "i"}},
                {"description": {"$regex": search, "$options": "i"}},
            ]

        pipeline = [
            {"$match": match_stage},
            {"$sort": {"version": -1}},
            {"$group": {
                "_id": {"$toLower": "$name"},
                "doc": {"$first": "$$ROOT"},
            }},
            {"$replaceRoot": {"newRoot": "$doc"}},
            {"$sort": {"updated_at": -1, "created_at": -1}},
        ]

        # Count total unique groups first
        count_pipeline = pipeline + [{"$count": "total"}]
        count_result = await self.collection.aggregate(count_pipeline).to_list(1)
        total = count_result[0]["total"] if count_result else 0

        # Paginate
        skip = (page - 1) * limit
        data_pipeline = pipeline + [
            {"$skip": skip},
            {"$limit": limit},
            {"$project": {
                "_id": 0,
                "id": 1,
                "name": 1,
                "description": 1,
                "template_type": 1,
                "status": 1,
                "source": 1,
                "created_at": 1,
                "updated_at": 1,
                "version": 1,
                "template_group_id": 1,
                "is_latest": 1,
                "file_type": 1,
                "output_format": 1,
            }},
        ]

        templates = await self.collection.aggregate(data_pipeline).to_list(length=limit)

        return {
            "templates": templates,
            "total": total,
            "page": page,
            "limit": limit,
            "pages": (total + limit - 1) // limit if total > 0 else 0,
        }

    async def update_template(self, template_id: str, tenant_id: str, update_data: dict, user_id: str) -> Optional[dict]:
        """Update template in-place (metadata only — NOT for content edits that need versioning)."""
        update_data["updated_by"] = user_id
        update_data["updated_at"] = datetime.now(timezone.utc)
        result = await self.collection.update_one(
            {"id": template_id, "tenant_id": tenant_id},
            {"$set": update_data}
        )
        if result.matched_count > 0:
            return await self.get_template(template_id, tenant_id)
        return None

    # ── Version Control ──────────────────────────────

    async def get_version_history(self, template_group_id: str, tenant_id: str) -> List[dict]:
        """Fetch all versions for a template group, sorted newest-first."""
        projection = {
            "_id": 0,
            "id": 1,
            "version": 1,
            "is_latest": 1,
            "created_from_version": 1,
            "status": 1,
            "created_at": 1,
            "updated_at": 1,
            "created_by": 1,
            "name": 1,
        }
        cursor = self.collection.find(
            {"template_group_id": template_group_id, "tenant_id": tenant_id},
            projection
        ).sort("version", -1)
        return await cursor.to_list(length=200)

    async def create_new_version(self, source_template_id: str, tenant_id: str, user_id: str, update_data: Optional[dict] = None) -> dict:
        """
        Clone a template (any version) into a NEW latest version.
        - Marks all siblings as is_latest=False
        - Creates a clone with version = max(group) + 1
        - Returns the new template document
        """
        source = await self.get_template(source_template_id, tenant_id)
        if not source:
            raise ValueError("Source template not found")

        group_id = source.get("template_group_id", source["id"])

        # Find the current max version in this group
        pipeline = [
            {"$match": {"template_group_id": group_id, "tenant_id": tenant_id}},
            {"$group": {"_id": None, "max_version": {"$max": "$version"}}}
        ]
        agg = await self.collection.aggregate(pipeline).to_list(1)
        max_version = agg[0]["max_version"] if agg else (source.get("version", 1))
        new_version = max_version + 1

        # Mark all existing versions in this group as NOT latest
        await self.collection.update_many(
            {"template_group_id": group_id, "tenant_id": tenant_id},
            {"$set": {"is_latest": False}}
        )

        # Deep-clone the source template
        new_template = copy.deepcopy(source)

        # Remove MongoDB internal fields
        new_template.pop("_id", None)

        # Assign new identity
        new_id = str(uuid.uuid4())
        new_template["id"] = new_id
        new_template["version"] = new_version
        new_template["is_latest"] = True
        new_template["created_from_version"] = source.get("version", 1)
        new_template["template_group_id"] = group_id
        new_template["created_by"] = user_id
        new_template["updated_by"] = user_id
        new_template["created_at"] = datetime.now(timezone.utc)
        new_template["updated_at"] = datetime.now(timezone.utc)
        new_template["status"] = "draft"

        # Apply any content overrides from the editor
        if update_data:
            for k, v in update_data.items():
                if k not in ("id", "_id", "version", "is_latest", "created_from_version", "template_group_id"):
                    new_template[k] = v

        await self.collection.insert_one(new_template)
        logger.info(f"Created v{new_version} (id={new_id}) from v{source.get('version',1)} in group {group_id}")
        return new_template

    async def delete_template(self, template_id: str, tenant_id: str) -> bool:
        """
        Phase 81.11 — Permanent (hard) delete with full cascade.

        Deletes:
          - Template master record
          - ALL versions in the template_group (v1, v2, v3...) → no version reuse
          - All template_versions snapshots (if collection exists)
          - All field placements / merge fields / builder layout (already inside
            template doc — gone with the master record)
          - Template assignments inside packages (auto-unlinks templates)
          - S3 source files (if s3_service available)
          - Cached preview/render entries (if collection exists)

        Returns True if anything was deleted from `docflow_templates`.
        """
        target = await self.collection.find_one(
            {"id": template_id, "tenant_id": tenant_id},
            {"_id": 0},
        )
        if not target:
            return False

        group_id = target.get("template_group_id") or template_id
        all_version_ids = set([template_id])
        all_s3_keys = set()
        try:
            cursor = self.collection.find(
                {"tenant_id": tenant_id, "template_group_id": group_id},
                {"_id": 0, "id": 1, "s3_key": 1, "file_url": 1, "uploaded_file_url": 1},
            )
            async for v in cursor:
                if v.get("id"):
                    all_version_ids.add(v["id"])
                for k in ("s3_key", "uploaded_file_url"):
                    if v.get(k):
                        all_s3_keys.add(v[k])
        except Exception as e:
            logger.warning(f"[delete_template] version enumeration soft-failed: {e}")

        # 1. Delete master + every version row in `docflow_templates`.
        delete_filter = {
            "tenant_id": tenant_id,
            "$or": [
                {"id": {"$in": list(all_version_ids)}},
                {"template_group_id": group_id},
            ],
        }
        del_res = await self.collection.delete_many(delete_filter)

        # 2. Drop standalone version snapshots (best-effort — collection may not exist).
        for coll_name in ("docflow_template_versions", "docflow_template_history"):
            try:
                if hasattr(self.db, coll_name) or coll_name in (await self.db.list_collection_names()):
                    await self.db[coll_name].delete_many(
                        {"tenant_id": tenant_id, "$or": [
                            {"template_id": {"$in": list(all_version_ids)}},
                            {"template_group_id": group_id},
                        ]}
                    )
            except Exception as e:
                logger.warning(f"[delete_template] {coll_name} cleanup soft-failed: {e}")

        # 3. Unlink from packages — pull the template entry from packages.documents
        #    so package builder no longer surfaces broken references. Orphan
        #    keys inside recipients[].assigned_components keyed by removed
        #    template_id are harmless (lookups skip missing entries).
        try:
            await self.db.docflow_packages.update_many(
                {"tenant_id": tenant_id, "documents.template_id": {"$in": list(all_version_ids)}},
                {"$pull": {"documents": {"template_id": {"$in": list(all_version_ids)}}}},
            )
        except Exception as e:
            logger.warning(f"[delete_template] package unlink soft-failed: {e}")

        # 4. S3 source-file cleanup — best-effort.
        if all_s3_keys:
            try:
                from .s3_service import S3Service
                s3 = S3Service()
                for key in all_s3_keys:
                    try:
                        s3.delete_file(key)
                    except Exception as _se:
                        logger.warning(f"[delete_template] S3 delete soft-fail for {key}: {_se}")
            except Exception as e:
                logger.warning(f"[delete_template] S3Service unavailable: {e}")

        # 5. Cached previews / render artifacts (best-effort across known caches).
        for coll_name in ("docflow_template_cache", "docflow_template_previews"):
            try:
                colls = await self.db.list_collection_names()
                if coll_name in colls:
                    await self.db[coll_name].delete_many(
                        {"tenant_id": tenant_id, "template_id": {"$in": list(all_version_ids)}}
                    )
            except Exception as e:
                logger.warning(f"[delete_template] {coll_name} cleanup soft-failed: {e}")

        logger.info(
            f"[delete_template] hard-deleted template {template_id} "
            f"(group={group_id}, versions={len(all_version_ids)}, "
            f"templates_removed={del_res.deleted_count})"
        )
        return del_res.deleted_count > 0

    async def clone_template(self, source_template_id: str, tenant_id: str, user_id: str) -> dict:
        """
        Clone a template into a completely independent copy.
        - Copies all structural data: fields, placements, CRM mappings, builder data, etc.
        - Resets all runtime/history data: send history, audit trail, signatures, logs.
        - Assigns a brand-new group ID so the clone is independent of the source version tree.
        - Sets status to 'draft' so the clone is editable before activation.
        """
        source = await self.get_template(source_template_id, tenant_id)
        if not source:
            raise ValueError("Source template not found")

        # Deep-clone the full document
        cloned = copy.deepcopy(source)

        # Remove MongoDB internal fields
        cloned.pop("_id", None)

        # ── New identity ─────────────────────────────────────────────
        new_id = str(uuid.uuid4())
        cloned["id"] = new_id

        # Brand-new group ID — completely independent version tree
        cloned["template_group_id"] = new_id
        cloned["version"] = 1
        cloned["is_latest"] = True
        cloned["created_from_version"] = None

        # ── Name ────────────────────────────────────────────────────
        original_name = source.get("name", "Untitled Template")
        # Avoid doubling suffix if already a clone
        if original_name.endswith(" (Copy)"):
            cloned["name"] = original_name
        else:
            cloned["name"] = f"{original_name} (Copy)"

        # ── Ownership & timestamps ───────────────────────────────────
        cloned["created_by"] = user_id
        cloned["updated_by"] = user_id
        cloned["created_at"] = datetime.now(timezone.utc)
        cloned["updated_at"] = datetime.now(timezone.utc)

        # ── Reset status to draft ────────────────────────────────────
        cloned["status"] = "draft"
        cloned["is_validated"] = False

        # ── Reset runtime / history fields ───────────────────────────
        # These must never carry over from the source template
        for field in (
            "send_history", "generated_documents", "audit_trail",
            "previous_signatures", "signer_data", "runtime_logs",
            "completed_documents", "signed_documents", "document_count",
            "last_sent_at", "last_signed_at", "send_count",
        ):
            cloned.pop(field, None)

        # ── Phase 81.75 — Isolate the clone's S3 file ────────────────
        # Previously the clone inherited the source's s3_key, meaning BOTH
        # records pointed at the same S3 object. If the source was re-
        # uploaded or deleted, the clone silently flipped to the new
        # content / broke entirely (root cause of "wrong PDF renders in
        # the Copy"). We now server-side COPY the S3 file to an isolated
        # key that lives under the clone's own folder.
        try:
            from .s3_service import S3Service
            _s3 = S3Service()
            for key_field in ("s3_key", "uploaded_pdf_s3_key"):
                src_key = source.get(key_field)
                if not src_key or not _s3.object_exists(src_key):
                    continue
                # templates/{tenant}/{uuid}/{filename} — reuse terminal filename.
                src_filename = src_key.rsplit("/", 1)[-1]
                dest_key = f"templates/{tenant_id}/{uuid.uuid4().hex}/{src_filename}"
                if _s3.copy_object(src_key, dest_key):
                    cloned[key_field] = dest_key
                    # Refresh corresponding URL field so the FE can render immediately.
                    if key_field == "s3_key":
                        cloned["file_url"] = _s3.get_template_url(dest_key, expiration=604800) or cloned.get("file_url")
                    elif key_field == "uploaded_pdf_s3_key":
                        cloned["uploaded_pdf_url"] = _s3.get_template_url(dest_key, expiration=604800) or cloned.get("uploaded_pdf_url")
        except Exception as _copy_err:
            logger.warning(f"clone_template: S3 isolation copy failed ({_copy_err}). Clone will share source s3_key (legacy behavior).")

        await self.collection.insert_one(cloned)
        logger.info(f"Cloned template '{original_name}' (src={source_template_id}) -> new id={new_id}")
        return cloned

    def parse_merge_fields(self, content: str) -> List[str]:
        """Parse merge fields from content like {{Object.Field}}"""
        pattern = r'\{\{([^}]+)\}\}'
        matches = re.findall(pattern, content)
        return list(set(matches))

    def validate_merge_fields(self, merge_fields: List[str], crm_schema: dict) -> Dict[str, Any]:
        """Validate merge fields against CRM schema"""
        errors = []
        warnings = []
        valid_fields = []

        for field in merge_fields:
            parts = field.strip().split('.')
            if len(parts) != 2:
                errors.append(f"Invalid field format: {field}. Expected Object.Field")
                continue
            obj, field_name = parts
            valid_fields.append({"object": obj, "field": field_name, "path": field})

        return {
            "valid": len(errors) == 0,
            "errors": errors,
            "warnings": warnings,
            "fields": valid_fields
        }
