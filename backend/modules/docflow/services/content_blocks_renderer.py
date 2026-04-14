"""
Content Blocks to PDF Renderer
Renders edited content blocks back into a PDF document using reportlab.
This ensures generated documents reflect the latest template edits,
not the original uploaded PDF.
"""
import io
import os
import logging
import requests
from typing import List, Dict, Any

from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Image as RLImage,
    Table, TableStyle, PageBreak
)
from reportlab.lib.colors import grey

logger = logging.getLogger(__name__)

ALIGN_MAP = {"left": TA_LEFT, "center": TA_CENTER, "right": TA_RIGHT}

FONT_MAP = {
    "Arial": "Helvetica",
    "Helvetica": "Helvetica",
    "Times New Roman": "Times-Roman",
    "Georgia": "Times-Roman",
    "Courier New": "Courier",
    "Courier": "Courier",
    "Verdana": "Helvetica",
    "Trebuchet MS": "Helvetica",
}


def _parse_px(val, default=12):
    """Extract numeric value from '14px' or '14' strings."""
    if not val:
        return default
    s = str(val).replace("px", "").replace("pt", "").strip()
    try:
        return int(float(s))
    except (ValueError, TypeError):
        return default


def _resolve_font(family: str, weight: str = "normal") -> str:
    base = FONT_MAP.get(family, "Helvetica")
    is_bold = weight in ("bold", "700", "600")
    if base == "Helvetica":
        return "Helvetica-Bold" if is_bold else "Helvetica"
    if base == "Times-Roman":
        return "Times-Bold" if is_bold else "Times-Roman"
    if base == "Courier":
        return "Courier-Bold" if is_bold else "Courier"
    return base


def _download_image_bytes(url: str) -> bytes | None:
    """Download image from URL, return bytes or None on failure."""
    try:
        resp = requests.get(url, timeout=15)
        if resp.status_code == 200 and len(resp.content) > 100:
            return resp.content
    except Exception as e:
        logger.warning(f"Failed to download image {url}: {e}")
    return None


def render_content_blocks_to_pdf(blocks: List[Dict[str, Any]]) -> bytes:
    """
    Render a list of content blocks into a PDF.
    Returns PDF bytes.
    """
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        leftMargin=0.75 * inch,
        rightMargin=0.75 * inch,
        topMargin=0.75 * inch,
        bottomMargin=0.75 * inch,
    )

    story: list = []
    current_page = 1

    for block in blocks:
        block_type = block.get("type", "paragraph")
        content = block.get("content", "") or ""
        style_data = block.get("style", {}) or {}
        page = block.get("page", 1) or 1

        # Page break if block targets a different page
        if page > current_page:
            for _ in range(page - current_page):
                story.append(PageBreak())
            current_page = page

        font_family = style_data.get("fontFamily", "Helvetica")
        font_weight = style_data.get("fontWeight", "normal")
        font_size = _parse_px(style_data.get("fontSize"), 12)
        font_style = style_data.get("fontStyle", "normal")
        text_align = style_data.get("textAlign", "left")
        alignment = ALIGN_MAP.get(text_align, TA_LEFT)
        font_name = _resolve_font(font_family, font_weight)

        if block_type == "image":
            src = block.get("src", "")
            if not src:
                continue
            img_bytes = _download_image_bytes(src)
            if not img_bytes:
                continue
            try:
                img_buf = io.BytesIO(img_bytes)
                img = RLImage(img_buf)
                # Constrain to page width
                max_w = doc.width
                if img.drawWidth > max_w:
                    ratio = max_w / img.drawWidth
                    img.drawWidth = max_w
                    img.drawHeight *= ratio
                # Also constrain height
                max_h = 5 * inch
                if img.drawHeight > max_h:
                    ratio = max_h / img.drawHeight
                    img.drawHeight = max_h
                    img.drawWidth *= ratio
                img.hAlign = "CENTER" if text_align == "center" else ("RIGHT" if text_align == "right" else "LEFT")
                story.append(img)
                story.append(Spacer(1, 6))
            except Exception as e:
                logger.warning(f"Failed to embed image: {e}")
            continue

        if block_type == "table":
            rows = block.get("rows", [])
            if not rows:
                continue
            try:
                tbl = Table(rows)
                tbl.setStyle(TableStyle([
                    ("GRID", (0, 0), (-1, -1), 0.5, grey),
                    ("FONTNAME", (0, 0), (-1, -1), font_name),
                    ("FONTSIZE", (0, 0), (-1, -1), max(font_size - 2, 8)),
                    ("TOPPADDING", (0, 0), (-1, -1), 4),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ]))
                story.append(tbl)
                story.append(Spacer(1, 8))
            except Exception as e:
                logger.warning(f"Failed to render table: {e}")
            continue

        # Text blocks: heading, subheading, paragraph, list_item
        if not content.strip():
            story.append(Spacer(1, 4))
            continue

        if block_type == "heading":
            font_size = max(font_size, 18)
            font_name = _resolve_font(font_family, "bold")
        elif block_type == "subheading":
            font_size = max(font_size, 14)
            font_name = _resolve_font(font_family, "bold")

        prefix = ""
        if block_type == "list_item":
            prefix = "\u2022  "

        para_style = ParagraphStyle(
            name=f"blk_{id(block)}",
            fontName=font_name,
            fontSize=font_size,
            leading=font_size * 1.4,
            alignment=alignment,
            spaceAfter=4,
        )
        if font_style == "italic":
            content = f"<i>{content}</i>"
        text = f"{prefix}{content}"
        try:
            story.append(Paragraph(text, para_style))
        except Exception as e:
            logger.warning(f"Failed to render paragraph: {e}")

    if not story:
        # Empty template — produce a blank page
        story.append(Spacer(1, 1))

    doc.build(story)
    buffer.seek(0)
    return buffer.read()
