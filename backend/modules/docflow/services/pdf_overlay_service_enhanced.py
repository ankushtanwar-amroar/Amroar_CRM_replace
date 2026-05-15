"""
Enhanced PDF Overlay Service - Properly overlays fields onto PDFs
Handles signatures, text, dates, checkboxes, and merge fields
"""
import io
import base64
from typing import Dict, Any, List, Optional
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
from reportlab.lib.utils import ImageReader
from reportlab.lib import colors
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from PIL import Image
from PyPDF2 import PdfReader, PdfWriter
import logging

logger = logging.getLogger(__name__)


class PDFOverlayService:
    """Service to overlay interactive fields onto existing PDFs"""
    
    def overlay_fields_on_pdf(self, pdf_bytes: bytes, field_placements: List[Dict[str, Any]],
                             field_values: Dict[str, Any] = None, signatures: List[Dict[str, Any]] = None,
                             verification_id: Optional[str] = None,
                             verification_label: str = "Verification ID") -> bytes:
        """
        Overlay all fields (text, date, checkbox, signature) onto PDF

        Args:
            pdf_bytes: Original PDF content
            field_placements: List of field positions and types
            field_values: Values for text/date/checkbox fields
            signatures: Signature data
            verification_id: Phase 76 — if supplied, stamped at the top of every
                page as `{verification_label}: {id}` for authenticity tracking.
            verification_label: Prefix for the verification stamp (e.g.,
                "DocFlow Verification ID" or "DocFlow Package Verification ID").

        Returns:
            PDF bytes with fields overlaid
        """
        try:
            logger.info(f"Overlaying {len(field_placements)} fields onto PDF")

            # Phase 81.71 — apply authored radio defaults so groups the signer
            # never interacted with still render their `defaultChecked: True`
            # option in the final PDF.
            from .field_defaults import apply_radio_defaults
            field_values = apply_radio_defaults(field_placements or [], field_values or {})

            # Read original PDF
            input_pdf = PdfReader(io.BytesIO(pdf_bytes))
            output = PdfWriter()

            # Group fields by page (convert 1-based page numbers to 0-based)
            fields_by_page = {}
            for field in field_placements:
                page = field.get('page', 1)
                page_idx = page - 1 if page > 0 else 0  # Convert to 0-based
                if page_idx not in fields_by_page:
                    fields_by_page[page_idx] = []
                fields_by_page[page_idx].append(field)

            total_pages = len(input_pdf.pages)
            last_page_idx = total_pages - 1

            # Process each page
            for page_num in range(total_pages):
                original_page = input_pdf.pages[page_num]

                page_fields = fields_by_page.get(page_num, [])
                # Phase 81: stamp verification ID on EVERY page (bottom-right
                # corner). Replaces the previous "last page only" logic to
                # ensure auditability throughout the entire document.
                stamp_on_this_page = bool(verification_id)
                should_overlay = bool(page_fields) or stamp_on_this_page
                if should_overlay:
                    overlay_bytes = self._create_overlay_for_page(
                        page_fields,
                        field_values,
                        signatures,
                        original_page,
                        verification_id=verification_id if stamp_on_this_page else None,
                        verification_label=verification_label,
                    )

                    if overlay_bytes:
                        # Merge overlay with original page
                        try:
                            overlay_pdf = PdfReader(io.BytesIO(overlay_bytes))
                            if len(overlay_pdf.pages) > 0:
                                overlay_page = overlay_pdf.pages[0]
                                original_page.merge_page(overlay_page)
                        except Exception as merge_err:
                            logger.warning(f"Failed to merge overlay for page {page_num}: {merge_err}")

                output.add_page(original_page)
            
            # Write output
            output_buffer = io.BytesIO()
            output.write(output_buffer)
            output_buffer.seek(0)
            result = output_buffer.read()
            
            logger.info(f"Generated PDF with overlays: {len(result)} bytes")
            return result
            
        except Exception as e:
            logger.error(f"Error overlaying fields on PDF: {e}", exc_info=True)
            return pdf_bytes  # Return original if overlay fails
    
    def _create_overlay_for_page(self, fields: List[Dict[str, Any]], field_values: Dict[str, Any],
                                 signatures: List[Dict[str, Any]], original_page,
                                 verification_id: Optional[str] = None,
                                 verification_label: str = "Verification ID") -> Optional[bytes]:
        """Create overlay canvas with all fields for a single page"""
        try:
            # Get page dimensions
            page_width = float(original_page.mediabox.width)
            page_height = float(original_page.mediabox.height)

            # Create canvas
            buffer = io.BytesIO()
            c = canvas.Canvas(buffer, pagesize=(page_width, page_height))

            # Make canvas transparent
            c.setFillAlpha(1.0)

            # Phase 81: stamp verification ID at BOTTOM-RIGHT. Small gray
            # helvetica, above content, never overlaps fields. Applied to all
            # pages to ensure auditability.
            if verification_id:
                try:
                    c.saveState()
                    c.setFont("Helvetica", 8)
                    c.setFillColorRGB(0.4, 0.4, 0.4)
                    stamp_text = f"{verification_label}: {verification_id}"
                    # 18pt right-margin / 12pt bottom-margin (PDF origin = bottom-left)
                    # `drawRightString` aligns the text's right edge to the x anchor.
                    c.drawRightString(page_width - 18, 12, stamp_text)
                    c.restoreState()
                except Exception as stamp_err:
                    logger.warning(f"Verification stamp failed: {stamp_err}")

            for field in fields:
                field_type = field.get('type', '').lower()
                field_id = field.get('id') or field.get('name', '')
                field_x = float(field.get('x', 0))
                field_y = float(field.get('y', 0))
                field_w = float(field.get('width', 100))
                field_h = float(field.get('height', 30))

                # Scale from builder's 800px coordinate system to actual PDF dimensions
                BUILDER_WIDTH = 800
                scale = page_width / BUILDER_WIDTH
                x = field_x * scale
                y_pixel = field_y * scale
                width = field_w * scale
                height = field_h * scale

                # Convert y coordinate (PDF coordinate system has origin at bottom-left)
                y_pdf = page_height - y_pixel - height

                # Phase 81.69 — pass `scale` through so every draw method applies
                # the SAME font-size, padding, checkbox/radio glyph scaling as
                # the frontend signing UI. Without this, backend text was ~30%
                # larger than the preview because font sizes were not scaled.
                if field_type == 'signature':
                    self._draw_signature_field(c, x, y_pdf, width, height, field_id, field_values, field, scale=scale)
                elif field_type == 'text':
                    self._draw_text_field(c, x, y_pdf, width, height, field_id, field_values, field, scale=scale)
                elif field_type == 'date':
                    self._draw_date_field(c, x, y_pdf, width, height, field_id, field_values, field, scale=scale)
                elif field_type == 'checkbox':
                    self._draw_checkbox_field(c, x, y_pdf, width, height, field_id, field_values, field, scale=scale)
                elif field_type == 'radio':
                    self._draw_radio_field(c, x, y_pdf, width, height, field, field_values, scale=scale)
                elif field_type == 'initials':
                    self._draw_initials_field(c, x, y_pdf, width, height, field_id, field_values, field, scale=scale)
                elif field_type == 'merge' or field_type == 'dropdown':
                    self._draw_merge_field(c, x, y_pdf, width, height, field, field_values, scale=scale)
                elif field_type == 'label':
                    self._draw_label_field(c, x, y_pdf, width, height, field, scale=scale)

            c.save()
            buffer.seek(0)
            return buffer.read()

        except Exception as e:
            logger.error(f"Error creating overlay: {e}", exc_info=True)
            return None
    
    def _draw_signature_field(self, c: canvas.Canvas, x: float, y: float, width: float,
                            height: float, field_id: str, field_values: Dict[str, Any],
                            field: Optional[Dict[str, Any]] = None,
                            scale: float = 1.0):
        """Draw signature image on PDF at EXACTLY the configured fontSize tall.

        Previously aspect-fit to full box, which made every signature look
        the same size regardless of the Visual Builder fontSize setting.
        Now a 24px signature renders twice as tall as a 12px one, matching
        the signer UI exactly.
        """
        signature_data = field_values.get(field_id)
        if not signature_data:
            return

        if isinstance(signature_data, str) and 'data:image' in signature_data:
            try:
                base64_data = signature_data.split(',')[1] if ',' in signature_data else signature_data
                img_data = base64.b64decode(base64_data)
                
                # Phase 3: Remove white background for transparency
                img_data = self._make_transparent(img_data)
                
                img_reader = ImageReader(io.BytesIO(img_data))

                # Determine aspect ratio from the actual image so we can fit
                # without distortion AND respect field.style.textAlign.
                try:
                    iw, ih = img_reader.getSize()
                except Exception:
                    iw, ih = 0, 0

                fld = field or {}
                style = fld.get('style') or {}
                align = style.get('textAlign') or 'center'

                # Resolve target height from configured fontSize.
                # "Npt" → use N as PDF points directly; legacy "N"/"Npx" → N * scale.
                try:
                    _raw_fs = style.get('fontSize')
                    _fs_str = str(_raw_fs).strip() if _raw_fs else ''
                    _is_pt = _fs_str.endswith('pt')
                    _fs_num = float(_fs_str.rstrip('pt').rstrip('px').strip()) if _fs_str else 18.0
                    _fs_pt = _fs_num if _is_pt else _fs_num * scale
                except Exception:
                    _fs_pt = 18.0 * scale
                target_h = min(max(6.0, _fs_pt), height)

                if iw > 0 and ih > 0:
                    aspect = iw / ih
                    fit_h = target_h
                    fit_w = fit_h * aspect
                    if fit_w > width:
                        fit_w = width
                        fit_h = fit_w / aspect
                else:
                    fit_w, fit_h = width, target_h

                if align == 'left':
                    sub_x = x
                elif align == 'right':
                    sub_x = x + (width - fit_w)
                else:
                    sub_x = x + (width - fit_w) / 2
                sub_y = y + (height - fit_h) / 2

                c.drawImage(img_reader, sub_x, sub_y, width=fit_w, height=fit_h, mask='auto')

                logger.info(f"Drew signature at ({sub_x}, {sub_y}) size={fit_w}x{fit_h} fs={_fs_css} align={align}")
            except Exception as e:
                logger.error(f"Error drawing signature: {e}")
    
    # Font family mapping from CSS to ReportLab
    FONT_MAP = {
        'Arial': 'Helvetica',
        'Helvetica': 'Helvetica',
        'Times New Roman': 'Times-Roman',
        'Georgia': 'Times-Roman',
        'Courier New': 'Courier',
        'Verdana': 'Helvetica',
        'Trebuchet MS': 'Helvetica',
    }

    def _apply_field_style(self, c: canvas.Canvas, field: Dict[str, Any], height: float, default_size: float = 10, scale: float = 1.0, width: float = 0):
        """Apply field styling (font, color, weight, italic) from the style dict.

        Phase 81.69 — matches the frontend signing-UI font math exactly so the
        final PDF has the same glyph size as the signing preview:

        * base_font_size = (css px) * scale
        * h_cap          = max(6, (height - 4) * 0.70)
        * w_cap          = max(6, width / 3)   (only when width is known)
        * final          = max(6, min(base, h_cap, w_cap, 24))
        """
        style = field.get('style') or {}
        font_family = style.get('fontFamily', 'Arial')
        font_size_raw = style.get('fontSize', str(int(default_size)))
        font_weight = style.get('fontWeight', 'normal')
        font_style_css = style.get('fontStyle', 'normal')
        text_color = style.get('color', '#000000')

        # Resolve font size — pt values skip the px→pt scale multiplication.
        # Stored as "12pt" → use directly as PDF points.
        # Stored as "12", "12px" (legacy) → multiply by scale (px → pt).
        _fs_str = str(font_size_raw).strip()
        _is_pt = _fs_str.endswith('pt')
        try:
            _fs_num = float(_fs_str.rstrip('pt').rstrip('px').strip())
        except (ValueError, TypeError):
            _fs_num = default_size
            _is_pt = False

        if _is_pt:
            base_fs = max(6.0, _fs_num)   # already in PDF points — no scale
        else:
            base_fs = max(6.0, _fs_num * scale)  # px / bare → convert to pt
        h_cap = max(6.0, (height - 4.0) * 0.85)
        if width and width > 0:
            w_cap = max(6.0, width / 2.5)
        else:
            w_cap = 1e9
        font_size = max(6.0, min(base_fs, h_cap, w_cap, 72.0))

        # Map CSS font to ReportLab font
        base_font = self.FONT_MAP.get(font_family, 'Helvetica')
        is_bold = font_weight == 'bold'
        is_italic = font_style_css == 'italic'

        if base_font == 'Helvetica':
            if is_bold and is_italic:
                rl_font = 'Helvetica-BoldOblique'
            elif is_bold:
                rl_font = 'Helvetica-Bold'
            elif is_italic:
                rl_font = 'Helvetica-Oblique'
            else:
                rl_font = 'Helvetica'
        elif base_font == 'Times-Roman':
            if is_bold and is_italic:
                rl_font = 'Times-BoldItalic'
            elif is_bold:
                rl_font = 'Times-Bold'
            elif is_italic:
                rl_font = 'Times-Italic'
            else:
                rl_font = 'Times-Roman'
        elif base_font == 'Courier':
            if is_bold and is_italic:
                rl_font = 'Courier-BoldOblique'
            elif is_bold:
                rl_font = 'Courier-Bold'
            elif is_italic:
                rl_font = 'Courier-Oblique'
            else:
                rl_font = 'Courier'
        else:
            rl_font = 'Helvetica-Bold' if is_bold else 'Helvetica'

        c.setFont(rl_font, font_size)

        # Apply color
        try:
            c.setFillColor(colors.HexColor(text_color))
        except Exception:
            c.setFillColorRGB(0, 0, 0)

        return font_size, style

    def _draw_text_with_style(self, c: canvas.Canvas, x: float, y: float, width: float,
                               height: float, text: str, field: Dict[str, Any], scale: float = 1.0):
        """Draw text with full styling applied (alignment, underline).

        Phase 81.9 — text WRAPS inside the field box (word-wrap then char-wrap
        if needed) and renders as multiple lines stacked from the top.  Text
        never overflows the field horizontally.

        Phase 81.41 — Single-line text fields (Visual Builder Field Type =
        Single-Line Text) STAY on one line: text is truncated with an
        ellipsis when too long. Multi-line fields keep the existing wrap
        behaviour.

        Phase 81.69 — Baseline + padding math now mirrors the frontend
        signing UI (`y + ptHeight/2 - fSize*0.35`, padding = `5*scale`) so
        the final PDF visually matches the preview pixel-for-pixel.
        """
        font_size, style = self._apply_field_style(c, field, height, scale=scale, width=width)
        text_align = style.get('textAlign', 'left')
        text_decoration = style.get('textDecoration', 'none')
        vert_align = style.get('verticalAlign') or 'bottom'
        pad_x = 5.0 * scale
        pad_y = 2.0 * scale
        line_height = max(font_size * 1.2, font_size + 2)
        max_text_width = max(width - 2 * pad_x, 1)

        # Phase 81.41 — explicit subtype wins; fall back to legacy `multiline`
        # for back-compat with templates created before the dropdown shipped.
        sub_type = (field or {}).get('fieldSubType') or (field or {}).get('field_sub_type')
        if sub_type == 'single-line':
            is_multiline = False
        elif sub_type == 'multi-line':
            is_multiline = True
        else:
            is_multiline = bool((field or {}).get('multiline'))

        # Single-line: truncate to fit width, no wrapping, ellipsis suffix.
        if not is_multiline:
            single = str(text or '').replace('\n', ' ').replace('\r', ' ')
            # Truncate with ellipsis if it overflows.
            if c.stringWidth(single, c._fontname, c._fontsize) > max_text_width:
                ellipsis = '…'
                lo, hi = 0, len(single)
                while lo < hi:
                    mid = (lo + hi) // 2
                    if c.stringWidth(single[:mid] + ellipsis, c._fontname, c._fontsize) <= max_text_width:
                        lo = mid + 1
                    else:
                        hi = mid
                single = single[: max(0, lo - 1)] + ellipsis
            text_width = c.stringWidth(single, c._fontname, c._fontsize)
            if text_align == 'center':
                text_x = x + (width - text_width) / 2
            elif text_align == 'right':
                text_x = x + width - text_width - pad_x
            else:
                text_x = x + pad_x
            # Vertical alignment (default: bottom — matches form-field convention).
            if vert_align == 'top':
                text_y = y + height - pad_y - font_size
            elif vert_align == 'center':
                text_y = y + (height / 2) - (font_size * 0.35)
            else:  # bottom
                text_y = y + pad_y + font_size * 0.15
            c.drawString(text_x, text_y, single)
            if text_decoration == 'underline':
                c.setLineWidth(0.5)
                c.line(text_x, text_y - 1.5, text_x + text_width, text_y - 1.5)
            return

        # Word-wrap (with char-wrap fallback for very long unbroken tokens).
        def _wrap(s: str) -> list:
            lines = []
            for paragraph in (s or '').split('\n'):
                words = paragraph.split(' ')
                cur = ''
                for w in words:
                    candidate = (cur + ' ' + w).strip() if cur else w
                    if c.stringWidth(candidate, c._fontname, c._fontsize) <= max_text_width:
                        cur = candidate
                        continue
                    if cur:
                        lines.append(cur)
                    # Word itself longer than field → char-wrap it.
                    if c.stringWidth(w, c._fontname, c._fontsize) > max_text_width:
                        chunk = ''
                        for ch in w:
                            if c.stringWidth(chunk + ch, c._fontname, c._fontsize) <= max_text_width:
                                chunk += ch
                            else:
                                if chunk:
                                    lines.append(chunk)
                                chunk = ch
                        cur = chunk
                    else:
                        cur = w
                if cur:
                    lines.append(cur)
                # Preserve explicit blank lines from \n
                if not paragraph and not (lines and lines[-1] == ''):
                    lines.append('')
            return lines or ['']

        wrapped = _wrap(str(text))
        # Cap to fit vertically — never spill below the field box.
        max_lines = max(1, int((height - 2 * pad_y) // line_height))
        if len(wrapped) > max_lines:
            wrapped = wrapped[:max_lines]

        # First baseline position depends on vertical alignment.
        _n_lines = len(wrapped)
        if vert_align == 'top':
            first_baseline = y + height - pad_y - font_size
        elif vert_align == 'center':
            first_baseline = y + (height / 2) + max(0, _n_lines - 1) * (line_height / 2)
        else:  # bottom
            first_baseline = y + pad_y + font_size * 0.15 + max(0, _n_lines - 1) * line_height
        for i, ln in enumerate(wrapped):
            text_width = c.stringWidth(ln, c._fontname, c._fontsize)
            if text_align == 'center':
                text_x = x + (width - text_width) / 2
            elif text_align == 'right':
                text_x = x + width - text_width - pad_x
            else:
                text_x = x + pad_x
            text_y = first_baseline - i * line_height
            c.drawString(text_x, text_y, ln)
            if text_decoration == 'underline':
                c.setLineWidth(0.5)
                c.line(text_x, text_y - 1.5, text_x + text_width, text_y - 1.5)

    def _draw_text_field(self, c: canvas.Canvas, x: float, y: float, width: float,
                        height: float, field_id: str, field_values: Dict[str, Any],
                        field: Dict[str, Any] = None, scale: float = 1.0):
        """Draw text field value on PDF — wraps inside field bounds."""
        value = (field_values or {}).get(field_id)
        if not value:
            # Fallback to defaultValue for Read-Only or static fields
            value = (field or {}).get('defaultValue') or (field or {}).get('default_value')
        
        if not value:
            return

        value = str(value)

        try:
            # Phase 81.9 — always go through the wrapping path so plain text
            # fields without an explicit `style` also wrap inside the box.
            self._draw_text_with_style(
                c, x, y, width, height, value,
                field if field else {"style": {"fontSize": "10px"}},
                scale=scale,
            )
            logger.info(f"Drew text field '{value[:40]}' at ({x}, {y})")
        except Exception as e:
            logger.error(f"Error drawing text field: {e}")
    
    def _draw_date_field(self, c: canvas.Canvas, x: float, y: float, width: float,
                        height: float, field_id: str, field_values: Dict[str, Any],
                        field: Optional[Dict[str, Any]] = None, scale: float = 1.0):
        """Draw date field value on PDF — honors field.dateFormat + field.style.textAlign (Phase 58)."""
        value = (field_values or {}).get(field_id)
        if not value:
            # Fallback to defaultValue for Read-Only or static fields
            value = (field or {}).get('defaultValue') or (field or {}).get('default_value')
        
        if not value:
            return

        value = str(value)

        try:
            # Issue 2 fix — delegate to the shared reformatter that honors
            # `field.dateFormat` (default MM/DD/YYYY). The previous local
            # implementation tried `%d/%m/%Y` BEFORE `%m/%d/%Y`, which
            # mis-parsed US-format inputs like "05/11/2026" as 5 Nov and
            # then re-rendered them in the configured format (silently
            # swapping day/month). The shared helper tries the target
            # format FIRST so already-correct values pass through unchanged.
            from .date_format_util import reformat_date_value
            fld = field or {}
            date_fmt = fld.get('dateFormat') or 'MM/DD/YYYY'
            value = reformat_date_value(value, date_fmt) or value

            # Use the shared styled-text renderer so alignment + font work.
            if fld.get('style'):
                self._draw_text_with_style(c, x, y, width, height, value, fld, scale=scale)
            else:
                # Phase 81.69 — mirror frontend baseline math.
                fs = max(6.0, min(10 * scale, (height - 4) * 0.85, width / 2.5, 72.0))
                c.setFont("Helvetica", fs)
                c.setFillColorRGB(0, 0, 0)
                c.drawString(x + 5 * scale, y + (height / 2) - (fs * 0.35), value)

            logger.info(f"Drew date field '{value}' at ({x}, {y}) fmt={date_fmt}")
        except Exception as e:
            logger.error(f"Error drawing date field: {e}")
    
    def _draw_checkbox_field(self, c: canvas.Canvas, x: float, y: float, width: float,
                            height: float, field_id: str, field_values: Dict[str, Any],
                            field: Optional[Dict[str, Any]] = None, scale: float = 1.0):
        """Draw checkbox — box always visible; check mark only when checked.

        Phase 62 (DocuSign-style): the label text (field.checkboxLabel) is
        NEVER drawn in the final PDF. It lives in the field definition for
        backend/reference purposes only.

        Phase 81.69 — glyph sizing now mirrors the frontend signing UI
        (`Math.min(14 * scale, ptHeight - 4 * scale)`) so the final PDF
        checkbox matches the preview exactly.
        """
        field = field or {}
        is_checked = (field_values or {}).get(field_id) in [True, 'true', '1', 'yes', 'checked']

        try:
            # Phase 81.69 — match frontend: min(14*scale, ptHeight - 4*scale).
            # Width is NOT a cap on the frontend, so we keep the geometry
            # consistent (the UI centers a 14*scale-pt glyph in the rect).
            box_size = max(6.0, min(14.0 * scale, height - 4.0 * scale))
            # Safety: if the author drew an extremely narrow box, still fit
            # inside the width.
            if width > 0:
                box_size = min(box_size, width - 2.0 * scale)
            box_size = max(6.0, box_size)
            box_x = x + (width - box_size) / 2
            box_y = y + (height - box_size) / 2

            # Phase 81.73 — tight CENTERED mask (not full rect) so adjacent
            # label text is preserved when authors drew the field wider than
            # the glyph. Sized to just cover any baked native ☒/☐ glyph.
            c.saveState()
            c.setFillColorRGB(1.0, 1.0, 1.0)
            c.setStrokeColorRGB(1.0, 1.0, 1.0)
            mask_size = max(box_size + 2.0 * scale, 14.0 * scale)
            mask_size = min(mask_size, width, height)
            mcx = x + width / 2
            mcy = y + height / 2
            c.rect(mcx - mask_size / 2, mcy - mask_size / 2, mask_size, mask_size, stroke=0, fill=1)
            c.restoreState()

            # Hairline outline (0.4pt) — barely visible, matches print weight.
            c.setStrokeColorRGB(0.13, 0.13, 0.16)
            c.setLineWidth(0.4)
            c.rect(box_x, box_y, box_size, box_size)

            if is_checked:
                # Crisp check stroke — kept slightly heavier than border so the
                # tick reads clearly at print resolution.
                c.setStrokeColorRGB(0.13, 0.13, 0.16)
                c.setLineWidth(0.7)
                # Proportional check geometry (0.22→0.44→0.78).
                c.line(box_x + box_size * 0.22, box_y + box_size * 0.50,
                       box_x + box_size * 0.44, box_y + box_size * 0.28)
                c.line(box_x + box_size * 0.44, box_y + box_size * 0.28,
                       box_x + box_size * 0.78, box_y + box_size * 0.72)

            logger.info(f"Drew checkbox (checked={is_checked}) at ({x}, {y})")
        except Exception as e:
            logger.error(f"Error drawing checkbox: {e}")

    def _draw_radio_field(self, c: canvas.Canvas, x: float, y: float, width: float,
                         height: float, field: Dict[str, Any],
                         field_values: Dict[str, Any], scale: float = 1.0):
        """
        Draw radio field. Supports TWO models:
          1) NEW single-option-per-field: { groupName, optionValue, optionLabel }
             — draws ONE circle; filled when field_values[groupName] == optionValue.
          2) LEGACY multi-option: { radioOptions: [...], selectedOption } — draws all options.
        """
        try:
            field_id = field.get('id') or field.get('name', '')
            options_legacy = field.get('radioOptions') or []
            option_value_new = field.get('optionValue') or field.get('option_value')
            is_legacy = bool(options_legacy) and not option_value_new

            c.setStrokeColorRGB(0.13, 0.13, 0.16)
            c.setFillColorRGB(0.13, 0.13, 0.16)
            c.setLineWidth(0.4)  # Phase 81.2 — hairline ring

            if is_legacy:
                selected = str((field_values or {}).get(field_id) or field.get('selectedOption') or '')
                # Phase 58: Only draw the SELECTED option — no labels, no unchecked circles.
                is_vertical = (field.get('radioLayout') or 'vertical') == 'vertical'
                size = 8
                opt_x = x + 2
                opt_y = y + height - 10
                for opt in options_legacy:
                    if str(opt) != selected:
                        if is_vertical:
                            opt_y -= 14
                        else:
                            opt_x += 70
                        continue
                    cx = opt_x + size / 2
                    cy = opt_y - size / 2
                    # Phase 81.40 — Mask underlying empty PDF radio with white
                    # using a circle EXACTLY the radio's outer-circle size
                    # (zero padding). Prevents nearby text from being erased
                    # when the author drew a wide field bounding box.
                    c.saveState()
                    c.setFillColorRGB(1.0, 1.0, 1.0)
                    c.setStrokeColorRGB(1.0, 1.0, 1.0)
                    c.circle(cx, cy, size / 2, stroke=0, fill=1)
                    c.restoreState()
                    c.setStrokeColorRGB(0.13, 0.13, 0.16)
                    c.setFillColorRGB(0.13, 0.13, 0.16)
                    c.circle(cx, cy, size / 2, stroke=1, fill=0)
                    c.circle(cx, cy, (size / 2) - 2, stroke=0, fill=1)
                    # Label intentionally NOT drawn.
                    break
            else:
                group = field.get('groupName') or field.get('group_name') or f'__single_{field_id}'
                option_value = option_value_new or field_id
                group_val = (field_values or {}).get(group)
                checked = str(group_val) == str(option_value)

                # Phase 81.72 — ALWAYS draw the outer ring (even when unselected)
                # so the PDF shows empty ○ for unchecked options and ● for
                # checked. Previously we returned early on unchecked, which
                # left the native PDF ☒/☐ glyph visible underneath.
                size = max(6.0, min(12.0 * scale, height - 4.0 * scale))
                if width > 0:
                    size = min(size, width - 2.0 * scale)
                size = max(6.0, size)
                cx = x + width / 2
                cy = y + height / 2

                # Phase 81.73 — tight CENTERED mask (not full rect) so
                # adjacent label text is preserved when authors drew the
                # field wider than the glyph. Sized to just cover any baked
                # native ○/● glyph in the source PDF.
                c.saveState()
                c.setFillColorRGB(1.0, 1.0, 1.0)
                c.setStrokeColorRGB(1.0, 1.0, 1.0)
                mask_size = max(size + 2.0 * scale, 14.0 * scale)
                mask_size = min(mask_size, width, height)
                c.rect(cx - mask_size / 2, cy - mask_size / 2, mask_size, mask_size, stroke=0, fill=1)
                c.restoreState()

                c.setStrokeColorRGB(0.13, 0.13, 0.16)
                c.setFillColorRGB(0.13, 0.13, 0.16)
                c.setLineWidth(0.4)
                c.circle(cx, cy, size / 2, stroke=1, fill=0)
                if checked:
                    inner_r = max(0.5, size / 2 - 2.5 * scale)
                    c.circle(cx, cy, inner_r, stroke=0, fill=1)
                # Label intentionally NOT drawn.

            logger.info(f"Drew radio field ({'legacy' if is_legacy else 'group'}) at ({x}, {y})")
        except Exception as e:
            logger.error(f"Error drawing radio field: {e}")
    
    def _draw_initials_field(self, c: canvas.Canvas, x: float, y: float, width: float,
                            height: float, field_id: str, field_values: Dict[str, Any],
                            field: Optional[Dict[str, Any]] = None,
                            scale: float = 1.0):
        """Draw initials on PDF at EXACTLY the configured fontSize tall."""
        initials_data = field_values.get(field_id)
        if not initials_data:
            return

        if isinstance(initials_data, str) and 'data:image' in initials_data:
            try:
                base64_data = initials_data.split(',')[1] if ',' in initials_data else initials_data
                img_data = base64.b64decode(base64_data)
                
                # Phase 3: Remove white background for transparency
                img_data = self._make_transparent(img_data)
                
                img_reader = ImageReader(io.BytesIO(img_data))

                try:
                    iw, ih = img_reader.getSize()
                except Exception:
                    iw, ih = 0, 0

                fld = field or {}
                style = fld.get('style') or {}
                align = style.get('textAlign') or 'center'

                try:
                    _raw_fs = style.get('fontSize')
                    _fs_str = str(_raw_fs).strip() if _raw_fs else ''
                    _is_pt = _fs_str.endswith('pt')
                    _fs_num = float(_fs_str.rstrip('pt').rstrip('px').strip()) if _fs_str else 16.0
                    _fs_pt = _fs_num if _is_pt else _fs_num * scale
                except Exception:
                    _fs_pt = 16.0 * scale
                target_h = min(max(6.0, _fs_pt), height)

                if iw > 0 and ih > 0:
                    aspect = iw / ih
                    fit_h = target_h
                    fit_w = fit_h * aspect
                    if fit_w > width:
                        fit_w = width
                        fit_h = fit_w / aspect
                else:
                    fit_w, fit_h = width, target_h

                if align == 'left':
                    sub_x = x
                elif align == 'right':
                    sub_x = x + (width - fit_w)
                else:
                    sub_x = x + (width - fit_w) / 2
                sub_y = y + (height - fit_h) / 2

                c.drawImage(img_reader, sub_x, sub_y, width=fit_w, height=fit_h, mask='auto')

                logger.info(f"Drew initials at ({sub_x}, {sub_y}) size={fit_w}x{fit_h} fs={_fs_css} align={align}")
            except Exception as e:
                logger.error(f"Error drawing initials: {e}")

    def _make_transparent(self, img_data: bytes) -> bytes:
        """Process image to remove white/near-white background and ensure alpha channel."""
        try:
            img = Image.open(io.BytesIO(img_data)).convert("RGBA")
            datas = img.getdata()
            new_data = []
            # Threshold for "white" - 240 is safe for most digital "white"
            for item in datas:
                if item[0] > 240 and item[1] > 240 and item[2] > 240:
                    # Replace with transparent white
                    new_data.append((255, 255, 255, 0))
                else:
                    new_data.append(item)
            img.putdata(new_data)
            output = io.BytesIO()
            img.save(output, format="PNG")
            return output.getvalue()
        except Exception as e:
            logger.error(f"Error making image transparent: {e}")
            return img_data
    

    def _draw_merge_field(self, c: canvas.Canvas, x: float, y: float, width: float,
                          height: float, field: Dict[str, Any], field_values: Dict[str, Any],
                          scale: float = 1.0):
        """Draw merge field value on PDF"""
        field_id = field.get('id') or field.get('name', '')
        merge_obj = field.get('merge_object') or field.get('mergeObject', '')
        merge_field = field.get('merge_field') or field.get('mergeField', '')
        full_key = f"{merge_obj}.{merge_field}" if merge_obj and merge_field else ''

        # Try multiple key formats to find the value
        value = (field_values.get(field_id)
                 or field_values.get(full_key)
                 or field_values.get(merge_field)
                 or field.get('defaultValue')
                 or field.get('default_value')
                 or '')

        if not value:
            return

        try:
            if field.get('style'):
                self._draw_text_with_style(c, x, y, width, height, str(value)[:100], field, scale=scale)
            else:
                # Phase 81.69 — mirror frontend: baseFs*scale, padding = 2*scale.
                fs = max(6.0, min(10 * scale, (height - 4) * 0.85, width / 2.5, 72.0))
                c.setFillColor(colors.HexColor('#1a1a2e'))
                c.setFont("Helvetica", fs)
                text_y = y + (height / 2) - (fs * 0.35)
                c.drawString(x + 2 * scale, text_y, str(value)[:100])

            logger.info(f"Drew merge field '{field_id}' = '{value}' at ({x}, {y})")
        except Exception as e:
            logger.error(f"Error drawing merge field: {e}")

    def _draw_label_field(self, c: canvas.Canvas, x: float, y: float, width: float,
                          height: float, field: Dict[str, Any], scale: float = 1.0):
        """Draw a static label on PDF with styling."""
        text = field.get('text') or field.get('label', '')
        if not text:
            return

        try:
            if field.get('style'):
                self._draw_text_with_style(c, x, y, width, height, text, field, scale=scale)
            else:
                fs = max(6.0, min(12 * scale, (height - 4) * 0.85, width / 2.5, 72.0))
                c.setFont("Helvetica", fs)
                c.setFillColorRGB(0, 0, 0)
                text_y = y + (height / 2) - (fs * 0.35)
                c.drawString(x + 2 * scale, text_y, text)

            logger.info(f"Drew label '{text}' at ({x}, {y})")
        except Exception as e:
            logger.error(f"Error drawing label field: {e}")

    def add_completion_certificate(self, pdf_bytes: bytes, document_data: Dict[str, Any], 
                                  signatures: List[Dict[str, Any]]) -> bytes:
        """
        Add completion certificate page to PDF
        
        Args:
            pdf_bytes: Original PDF content
            document_data: Document metadata
            signatures: List of signatures
        
        Returns:
            PDF bytes with completion certificate appended
        """
        try:
            logger.info("Adding completion certificate")
            
            # Read existing PDF
            input_pdf = PdfReader(io.BytesIO(pdf_bytes))
            output = PdfWriter()
            
            # Copy all pages
            for page in input_pdf.pages:
                output.add_page(page)
            
            # Create certificate page
            buffer = io.BytesIO()
            c = canvas.Canvas(buffer, pagesize=letter)
            width, height = letter
            
            # Title
            c.setFont("Helvetica-Bold", 18)
            c.setFillColorRGB(0, 0.3, 0.6)
            c.drawCentredString(width/2, height - 60, "Certificate of Completion")
            
            # Line
            c.setStrokeColorRGB(0, 0.3, 0.6)
            c.setLineWidth(2)
            c.line(50, height - 80, width - 50, height - 80)
            
            y_pos = height - 120
            
            # Document info
            c.setFont("Helvetica-Bold", 12)
            c.setFillColorRGB(0, 0, 0)
            c.drawString(50, y_pos, "Document Information")
            y_pos -= 25
            
            c.setFont("Helvetica", 10)
            c.drawString(70, y_pos, f"Document Name: {document_data.get('template_name', 'N/A')}")
            y_pos -= 20
            c.drawString(70, y_pos, f"Document ID: {document_data.get('id', 'N/A')}")
            y_pos -= 20
            c.drawString(70, y_pos, f"Generated: {document_data.get('generated_at', 'N/A')[:19]}")
            y_pos -= 20
            c.drawString(70, y_pos, f"Completed: {document_data.get('signed_at', 'N/A')[:19]}")
            y_pos -= 40
            
            # Signature information
            c.setFont("Helvetica-Bold", 12)
            c.drawString(50, y_pos, "Signatures")
            y_pos -= 25
            
            for idx, sig in enumerate(signatures):
                c.setFont("Helvetica", 10)
                c.drawString(70, y_pos, f"Signer {idx + 1}:")
                y_pos -= 18
                c.drawString(90, y_pos, f"Name: {sig.get('signer_name', 'N/A')}")
                y_pos -= 15
                c.drawString(90, y_pos, f"Email: {sig.get('signer_email', 'N/A')}")
                y_pos -= 15
                c.drawString(90, y_pos, f"Signed At: {sig.get('signed_at', 'N/A')[:19]}")
                y_pos -= 15
                c.drawString(90, y_pos, f"IP Address: {sig.get('ip_address', 'N/A')}")
                y_pos -= 30
            
            # Audit trail
            if document_data.get('audit_trail'):
                c.setFont("Helvetica-Bold", 12)
                c.drawString(50, y_pos, "Audit Trail")
                y_pos -= 25
                
                c.setFont("Helvetica", 9)
                for event in document_data['audit_trail'][-5:]:  # Last 5 events
                    event_text = f"{event.get('event', 'N/A')} - {event.get('timestamp', 'N/A')[:19]}"
                    c.drawString(70, y_pos, event_text)
                    y_pos -= 15
            
            c.save()
            buffer.seek(0)
            
            # Add certificate page
            cert_pdf = PdfReader(buffer)
            for page in cert_pdf.pages:
                output.add_page(page)
            
            # Write output
            output_buffer = io.BytesIO()
            output.write(output_buffer)
            output_buffer.seek(0)
            
            logger.info("Completion certificate added successfully")
            return output_buffer.read()
            
        except Exception as e:
            logger.error(f"Error adding completion certificate: {e}", exc_info=True)
            return pdf_bytes