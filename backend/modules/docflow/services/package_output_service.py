"""
DocFlow Package Output Service — Phase 3

Handles:
1. Combined PDF — merges all package documents into a single PDF
2. Completion Certificate — generates a PDF summary of the package lifecycle
"""
import io
import logging
from datetime import datetime, timezone
from typing import Optional

import requests
from PyPDF2 import PdfMerger, PdfReader
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.lib.colors import HexColor
from reportlab.pdfgen import canvas
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER

logger = logging.getLogger(__name__)

# ── Colors ──
INDIGO = HexColor("#4f46e5")
DARK = HexColor("#111827")
GRAY = HexColor("#6b7280")
LIGHT_GRAY = HexColor("#e5e7eb")
GREEN = HexColor("#059669")
RED = HexColor("#dc2626")
AMBER = HexColor("#d97706")
WHITE = HexColor("#ffffff")

ROLE_LABELS = {
    "SIGN": "Signer",
    "VIEW_ONLY": "Reviewer",
    "APPROVE_REJECT": "Approver",
    "RECEIVE_COPY": "Copy Recipient",
}

STATUS_LABELS = {
    "completed": "Completed",
    "voided": "Voided",
    "expired": "Expired",
    "in_progress": "In Progress",
    "draft": "Draft",
}

ACTION_LABELS = {
    "signed": "Signed",
    "reviewed": "Reviewed",
    "approved": "Approved",
    "rejected": "Rejected",
    "receive_copy": "Copy Recipient",
}


class PackageOutputService:
    def __init__(self, db):
        self.db = db

    # ── Combined PDF ──

    async def generate_combined_pdf(self, package_id: str, tenant_id: str) -> Optional[bytes]:
        """
        Merge all package documents into a single PDF.
        Fetches each document's unsigned PDF (from S3 URL or content_blocks) and merges in order.
        """
        package = await self.db.docflow_packages.find_one(
            {"id": package_id, "tenant_id": tenant_id}, {"_id": 0}
        )
        if not package:
            return None

        documents = package.get("documents", [])
        if not documents:
            return None

        merger = PdfMerger()
        docs_added = 0

        for doc_entry in sorted(documents, key=lambda d: d.get("order", 0)):
            doc_id = doc_entry.get("document_id")
            if not doc_id:
                continue

            pdf_bytes = await self._get_document_pdf(doc_id, tenant_id)
            if pdf_bytes:
                try:
                    reader = PdfReader(io.BytesIO(pdf_bytes))
                    merger.append(reader)
                    docs_added += 1
                    logger.info(f"[CombinedPDF] Added doc {doc_id[:8]} ({len(reader.pages)} pages)")
                except Exception as e:
                    logger.warning(f"[CombinedPDF] Failed to add doc {doc_id[:8]}: {e}")

        if docs_added == 0:
            return self._generate_placeholder_pdf(
                "Combined PDF Unavailable",
                f"No document PDFs could be retrieved for package '{package.get('name', '')}'."
            )

        output = io.BytesIO()
        merger.write(output)
        merger.close()
        output.seek(0)
        return output.read()

    async def _get_document_pdf(self, document_id: str, tenant_id: str) -> Optional[bytes]:
        """Fetch PDF bytes for a document — try S3 URL first, then render from content_blocks."""
        doc = await self.db.docflow_documents.find_one(
            {"id": document_id}, {"_id": 0}
        )
        if not doc:
            return None

        # Try fetching from S3 URL — prefer signed version over unsigned
        for url_key in ("signed_file_url", "unsigned_file_url"):
            url = doc.get(url_key)
            if url:
                try:
                    resp = requests.get(url, timeout=15)
                    if resp.status_code == 200 and len(resp.content) > 100:
                        return resp.content
                except Exception as e:
                    logger.warning(f"[CombinedPDF] Failed to fetch {url_key} for {document_id[:8]}: {e}")

        # Fallback: render from template content_blocks
        template_id = doc.get("template_id")
        if template_id:
            template = await self.db.docflow_templates.find_one(
                {"id": template_id}, {"_id": 0, "content_blocks": 1}
            )
            if template and template.get("content_blocks"):
                try:
                    from modules.docflow.services.content_blocks_renderer import render_content_blocks_to_pdf
                    return render_content_blocks_to_pdf(template["content_blocks"])
                except Exception as e:
                    logger.warning(f"[CombinedPDF] Failed to render content_blocks for {document_id[:8]}: {e}")

        return None

    # ── Completion Certificate ──

    async def generate_completion_certificate(self, package_id: str, tenant_id: str) -> Optional[bytes]:
        """
        Generate a completion certificate PDF for a package.
        Shows package details, recipient actions, and timestamps.
        """
        package = await self.db.docflow_packages.find_one(
            {"id": package_id, "tenant_id": tenant_id}, {"_id": 0}
        )
        if not package:
            return None

        # Fetch audit events
        cursor = self.db.docflow_audit_events.find(
            {"package_id": package_id, "tenant_id": tenant_id}, {"_id": 0}
        ).sort("timestamp", 1)
        events = await cursor.to_list(length=500)

        return self._build_certificate_pdf(package, events)

    def _build_certificate_pdf(self, package: dict, events: list) -> bytes:
        """Build the certificate PDF using reportlab."""
        buf = io.BytesIO()
        c = canvas.Canvas(buf, pagesize=letter)
        w, h = letter
        margin = 60
        y = h - margin

        # ── Header bar ──
        c.setFillColor(INDIGO)
        c.rect(0, h - 90, w, 90, fill=True, stroke=False)
        c.setFillColor(WHITE)
        c.setFont("Helvetica-Bold", 22)
        c.drawString(margin, h - 55, "Certificate of Completion")
        c.setFont("Helvetica", 11)
        c.drawString(margin, h - 75, "DocFlow Package Audit Certificate")
        y = h - 120

        # ── Package Info ──
        c.setFillColor(DARK)
        c.setFont("Helvetica-Bold", 14)
        c.drawString(margin, y, package.get("name", "Untitled Package"))
        y -= 22

        status = package.get("status", "unknown")
        status_label = STATUS_LABELS.get(status, status.title())

        info_items = [
            ("Package ID", package.get("id", "—")),
            ("Status", status_label),
            ("Documents", str(len(package.get("documents", [])))),
            ("Recipients", str(len([r for r in package.get("recipients", []) if r.get("role_type") != "RECEIVE_COPY"]))),
            ("Created", self._fmt_date(package.get("created_at"))),
        ]
        if package.get("completed_at"):
            info_items.append(("Completed", self._fmt_date(package["completed_at"])))
        if package.get("voided_at"):
            info_items.append(("Voided", self._fmt_date(package["voided_at"])))
        if package.get("void_reason"):
            info_items.append(("Void Reason", package["void_reason"][:80]))

        c.setFont("Helvetica", 9)
        c.setFillColor(GRAY)
        for label, value in info_items:
            c.drawString(margin, y, f"{label}:")
            c.setFillColor(DARK)
            c.setFont("Helvetica-Bold" if label == "Status" else "Helvetica", 9)
            c.drawString(margin + 85, y, value)
            c.setFont("Helvetica", 9)
            c.setFillColor(GRAY)
            y -= 15

        y -= 15

        # ── Divider ──
        c.setStrokeColor(LIGHT_GRAY)
        c.setLineWidth(0.5)
        c.line(margin, y, w - margin, y)
        y -= 20

        # ── Recipient Summary Table ──
        c.setFillColor(DARK)
        c.setFont("Helvetica-Bold", 12)
        c.drawString(margin, y, "Recipient Actions")
        y -= 20

        recipients = [r for r in package.get("recipients", []) if r.get("role_type") != "RECEIVE_COPY"]
        if recipients:
            # Table header
            col_widths = [150, 80, 80, 120, 80]
            headers = ["Recipient", "Role", "Action", "Timestamp", "Status"]
            c.setFont("Helvetica-Bold", 8)
            c.setFillColor(GRAY)
            x = margin
            for i, hdr in enumerate(headers):
                c.drawString(x, y, hdr)
                x += col_widths[i]
            y -= 5
            c.setStrokeColor(LIGHT_GRAY)
            c.line(margin, y, w - margin, y)
            y -= 13

            # Recipient rows
            for r in sorted(recipients, key=lambda x: x.get("routing_order", 0)):
                if y < 80:
                    c.showPage()
                    y = h - margin
                    c.setFont("Helvetica-Bold", 8)
                    c.setFillColor(GRAY)
                    x = margin
                    for i, hdr in enumerate(headers):
                        c.drawString(x, y, hdr)
                        x += col_widths[i]
                    y -= 5
                    c.line(margin, y, w - margin, y)
                    y -= 13

                name = r.get("name", "—")
                role = ROLE_LABELS.get(r.get("role_type", ""), r.get("role_type", "—"))
                action = ACTION_LABELS.get(r.get("action_taken", ""), r.get("action_taken") or "Pending")
                ts = self._fmt_date(r.get("action_at") or r.get("completed_at") or r.get("notified_at"))
                r_status = r.get("status", "pending").title()

                c.setFont("Helvetica", 8)
                c.setFillColor(DARK)
                x = margin
                c.drawString(x, y, name[:25])
                x += col_widths[0]
                c.drawString(x, y, role)
                x += col_widths[1]

                # Color-code action
                if r.get("action_taken") in ("signed", "approved", "reviewed"):
                    c.setFillColor(GREEN)
                elif r.get("action_taken") == "rejected":
                    c.setFillColor(RED)
                else:
                    c.setFillColor(GRAY)
                c.drawString(x, y, action)
                x += col_widths[2]

                c.setFillColor(DARK)
                c.drawString(x, y, ts or "—")
                x += col_widths[3]
                c.drawString(x, y, r_status)
                y -= 15

            # Rejection details
            rejected = [r for r in recipients if r.get("action_taken") == "rejected"]
            for r in rejected:
                reason = r.get("reject_reason", "")
                if reason and y > 80:
                    y -= 5
                    c.setFont("Helvetica-Oblique", 8)
                    c.setFillColor(RED)
                    c.drawString(margin + 10, y, f'Rejection reason: "{reason[:80]}"')
                    y -= 15
        else:
            c.setFont("Helvetica", 9)
            c.setFillColor(GRAY)
            c.drawString(margin, y, "No recipients configured.")
            y -= 20

        y -= 10
        c.setStrokeColor(LIGHT_GRAY)
        c.line(margin, y, w - margin, y)
        y -= 20

        # ── Audit Event Log ──
        if y < 120:
            c.showPage()
            y = h - margin

        c.setFillColor(DARK)
        c.setFont("Helvetica-Bold", 12)
        c.drawString(margin, y, "Audit Event Log")
        y -= 18

        if events:
            for event in events:
                if y < 60:
                    c.showPage()
                    y = h - margin
                    c.setFillColor(DARK)
                    c.setFont("Helvetica-Bold", 12)
                    c.drawString(margin, y, "Audit Event Log (continued)")
                    y -= 18

                etype = event.get("event_type", "unknown").replace("_", " ").title()
                actor = event.get("actor", "system")
                ts = self._fmt_date(event.get("timestamp"))
                meta = event.get("metadata", {})

                # Event type + timestamp line
                c.setFont("Helvetica-Bold", 8)
                is_important = any(k in event.get("event_type", "") for k in ["completed", "voided", "signed", "approved", "rejected", "reviewed"])  # noqa: F841
                if "void" in event.get("event_type", "") or "reject" in event.get("event_type", ""):
                    c.setFillColor(RED)
                elif "completed" in event.get("event_type", "") or "signed" in event.get("event_type", "") or "approved" in event.get("event_type", ""):
                    c.setFillColor(GREEN)
                else:
                    c.setFillColor(DARK)
                c.drawString(margin, y, etype)

                c.setFillColor(GRAY)
                c.setFont("Helvetica", 7)
                c.drawRightString(w - margin, y, ts or "")
                y -= 11

                # Actor + metadata
                detail_parts = []
                if actor and actor != "system":
                    detail_parts.append(f"by {actor}")
                if meta.get("reason"):
                    detail_parts.append(f'Reason: "{meta["reason"][:60]}"')
                if meta.get("reject_reason"):
                    detail_parts.append(f'Reason: "{meta["reject_reason"][:60]}"')
                if meta.get("recipient_count"):
                    detail_parts.append(f'{meta["recipient_count"]} recipients')
                if meta.get("wave_order"):
                    detail_parts.append(f'Wave {meta["wave_order"]}')

                if detail_parts:
                    c.setFont("Helvetica", 7)
                    c.setFillColor(GRAY)
                    c.drawString(margin + 10, y, " | ".join(detail_parts))
                    y -= 11
                y -= 4
        else:
            c.setFont("Helvetica", 9)
            c.setFillColor(GRAY)
            c.drawString(margin, y, "No audit events recorded.")
            y -= 20

        # ── Footer ──
        y -= 15
        if y < 80:
            c.showPage()
            y = h - margin

        c.setStrokeColor(LIGHT_GRAY)
        c.line(margin, y, w - margin, y)
        y -= 18
        c.setFont("Helvetica", 7)
        c.setFillColor(GRAY)
        now_str = datetime.now(timezone.utc).strftime("%B %d, %Y at %H:%M UTC")
        c.drawString(margin, y, f"Generated on {now_str} by DocFlow")
        c.drawRightString(w - margin, y, f"Package ID: {package.get('id', '—')}")

        c.save()
        buf.seek(0)
        return buf.read()

    def _generate_placeholder_pdf(self, title: str, message: str) -> bytes:
        """Generate a simple placeholder PDF."""
        buf = io.BytesIO()
        c = canvas.Canvas(buf, pagesize=letter)
        w, h = letter
        c.setFont("Helvetica-Bold", 16)
        c.drawString(60, h - 80, title)
        c.setFont("Helvetica", 11)
        c.drawString(60, h - 110, message)
        c.save()
        buf.seek(0)
        return buf.read()

    @staticmethod
    def _fmt_date(d) -> str:
        if not d:
            return ""
        if isinstance(d, str):
            try:
                dt = datetime.fromisoformat(d.replace("Z", "+00:00"))
                return dt.strftime("%b %d, %Y %I:%M %p")
            except Exception:
                return d[:19]
        if isinstance(d, datetime):
            return d.strftime("%b %d, %Y %I:%M %p")
        return str(d)
