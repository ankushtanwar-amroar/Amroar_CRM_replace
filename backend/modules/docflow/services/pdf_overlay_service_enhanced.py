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
                             field_values: Dict[str, Any] = None, signatures: List[Dict[str, Any]] = None) -> bytes:
        """
        Overlay all fields (text, date, checkbox, signature) onto PDF
        
        Args:
            pdf_bytes: Original PDF content
            field_placements: List of field positions and types
            field_values: Values for text/date/checkbox fields
            signatures: Signature data
        
        Returns:
            PDF bytes with fields overlaid
        """
        try:
            logger.info(f"Overlaying {len(field_placements)} fields onto PDF")
            
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
            
            # Process each page
            for page_num in range(len(input_pdf.pages)):
                original_page = input_pdf.pages[page_num]
                
                # Create overlay if this page has fields
                if page_num in fields_by_page:
                    overlay_bytes = self._create_overlay_for_page(
                        fields_by_page[page_num],
                        field_values,
                        signatures,
                        original_page
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
                                 signatures: List[Dict[str, Any]], original_page) -> Optional[bytes]:
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

                if field_type == 'signature':
                    self._draw_signature_field(c, x, y_pdf, width, height, field_id, field_values)
                elif field_type == 'text':
                    self._draw_text_field(c, x, y_pdf, width, height, field_id, field_values, field)
                elif field_type == 'date':
                    self._draw_date_field(c, x, y_pdf, width, height, field_id, field_values)
                elif field_type == 'checkbox':
                    self._draw_checkbox_field(c, x, y_pdf, width, height, field_id, field_values)
                elif field_type == 'initials':
                    self._draw_initials_field(c, x, y_pdf, width, height, field_id, field_values)
                elif field_type == 'merge':
                    self._draw_merge_field(c, x, y_pdf, width, height, field, field_values)
                elif field_type == 'label':
                    self._draw_label_field(c, x, y_pdf, width, height, field)

            c.save()
            buffer.seek(0)
            return buffer.read()

        except Exception as e:
            logger.error(f"Error creating overlay: {e}", exc_info=True)
            return None
    
    def _draw_signature_field(self, c: canvas.Canvas, x: float, y: float, width: float,
                            height: float, field_id: str, field_values: Dict[str, Any]):
        """Draw signature image on PDF"""
        signature_data = field_values.get(field_id)
        if not signature_data:
            return

        if isinstance(signature_data, str) and 'data:image' in signature_data:
            try:
                # Extract base64 data
                base64_data = signature_data.split(',')[1] if ',' in signature_data else signature_data
                img_data = base64.b64decode(base64_data)

                # Create image reader
                img_reader = ImageReader(io.BytesIO(img_data))

                # Draw signature
                c.drawImage(img_reader, x, y, width=width, height=height,
                          preserveAspectRatio=True, mask='auto')

                logger.info(f"Drew signature at ({x}, {y})")
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

    def _apply_field_style(self, c: canvas.Canvas, field: Dict[str, Any], height: float, default_size: float = 10):
        """Apply field styling (font, color, weight, italic) from the style dict."""
        style = field.get('style') or {}
        font_family = style.get('fontFamily', 'Arial')
        font_size_raw = style.get('fontSize', str(int(default_size)))
        font_weight = style.get('fontWeight', 'normal')
        font_style_css = style.get('fontStyle', 'normal')
        text_color = style.get('color', '#000000')

        # Resolve font size
        try:
            font_size = float(str(font_size_raw).replace('px', ''))
        except (ValueError, TypeError):
            font_size = default_size

        # Cap font size to fit height
        font_size = min(font_size, height * 0.8)

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
                               height: float, text: str, field: Dict[str, Any]):
        """Draw text with full styling applied (alignment, underline)."""
        font_size, style = self._apply_field_style(c, field, height)
        text_align = style.get('textAlign', 'left')
        text_decoration = style.get('textDecoration', 'none')
        pad = 3

        text_y = y + (height - font_size) / 2 + 1

        # Draw aligned text
        text_width = c.stringWidth(text, c._fontname, c._fontsize)
        if text_align == 'center':
            text_x = x + (width - text_width) / 2
        elif text_align == 'right':
            text_x = x + width - text_width - pad
        else:
            text_x = x + pad

        c.drawString(text_x, text_y, text)

        # Draw underline if needed
        if text_decoration == 'underline':
            c.setLineWidth(0.5)
            c.line(text_x, text_y - 1.5, text_x + text_width, text_y - 1.5)

    def _draw_text_field(self, c: canvas.Canvas, x: float, y: float, width: float,
                        height: float, field_id: str, field_values: Dict[str, Any],
                        field: Dict[str, Any] = None):
        """Draw text field value on PDF"""
        if not field_values or field_id not in field_values:
            return
        
        value = str(field_values[field_id])
        if not value:
            return
        
        try:
            if field and field.get('style'):
                self._draw_text_with_style(c, x, y, width, height, value, field)
            else:
                c.setFont("Helvetica", 10)
                c.setFillColorRGB(0, 0, 0)
                text_y = y + (height / 2) - 3
                c.drawString(x + 5, text_y, value)
            
            logger.info(f"Drew text field '{value}' at ({x}, {y})")
        except Exception as e:
            logger.error(f"Error drawing text field: {e}")
    
    def _draw_date_field(self, c: canvas.Canvas, x: float, y: float, width: float,
                        height: float, field_id: str, field_values: Dict[str, Any]):
        """Draw date field value on PDF"""
        if not field_values or field_id not in field_values:
            return
        
        value = str(field_values[field_id])
        if not value:
            return
        
        try:
            # Format date if needed
            from datetime import datetime
            try:
                dt = datetime.fromisoformat(value.replace('Z', '+00:00'))
                value = dt.strftime('%Y-%m-%d')
            except Exception:
                pass
            
            # Set font
            c.setFont("Helvetica", 10)
            c.setFillColorRGB(0, 0, 0)
            
            # Draw date
            text_y = y + (height / 2) - 3
            c.drawString(x + 5, text_y, value)
            
            logger.info(f"Drew date field '{value}' at ({x}, {y})")
        except Exception as e:
            logger.error(f"Error drawing date field: {e}")
    
    def _draw_checkbox_field(self, c: canvas.Canvas, x: float, y: float, width: float,
                            height: float, field_id: str, field_values: Dict[str, Any]):
        """Draw checkbox on PDF"""
        if not field_values or field_id not in field_values:
            return
        
        is_checked = field_values[field_id] in [True, 'true', '1', 'yes', 'checked']
        
        if is_checked:
            try:
                # Draw checkbox border
                c.setStrokeColorRGB(0, 0, 0)
                c.setLineWidth(1)
                box_size = min(width, height) - 4
                box_x = x + 2
                box_y = y + 2
                c.rect(box_x, box_y, box_size, box_size)
                
                # Draw checkmark
                c.setStrokeColorRGB(0, 0, 0)
                c.setLineWidth(2)
                c.line(box_x + 3, box_y + box_size/2, box_x + box_size/2, box_y + 3)
                c.line(box_x + box_size/2, box_y + 3, box_x + box_size - 3, box_y + box_size - 3)
                
                logger.info(f"Drew checkbox at ({x}, {y})")
            except Exception as e:
                logger.error(f"Error drawing checkbox: {e}")
    
    def _draw_initials_field(self, c: canvas.Canvas, x: float, y: float, width: float,
                            height: float, field_id: str, field_values: Dict[str, Any]):
        """Draw initials on PDF (similar to signature but smaller)"""
        initials_data = field_values.get(field_id)
        if not initials_data:
            return

        if isinstance(initials_data, str) and 'data:image' in initials_data:
            try:
                base64_data = initials_data.split(',')[1] if ',' in initials_data else initials_data
                img_data = base64.b64decode(base64_data)
                img_reader = ImageReader(io.BytesIO(img_data))

                c.drawImage(img_reader, x, y, width=width, height=height,
                          preserveAspectRatio=True, mask='auto')

                logger.info(f"Drew initials at ({x}, {y})")
            except Exception as e:
                logger.error(f"Error drawing initials: {e}")
    

    def _draw_merge_field(self, c: canvas.Canvas, x: float, y: float, width: float,
                          height: float, field: Dict[str, Any], field_values: Dict[str, Any]):
        """Draw merge field value on PDF"""
        field_id = field.get('id') or field.get('name', '')
        merge_obj = field.get('merge_object') or field.get('mergeObject', '')
        merge_field = field.get('merge_field') or field.get('mergeField', '')
        full_key = f"{merge_obj}.{merge_field}" if merge_obj and merge_field else ''

        # Try multiple key formats to find the value
        value = (field_values.get(field_id)
                 or field_values.get(full_key)
                 or field_values.get(merge_field)
                 or '')

        if not value:
            return

        try:
            # White background to cover placeholder text
            c.setFillColor(colors.white)
            c.rect(x, y, width, height, fill=True, stroke=False)

            if field.get('style'):
                self._draw_text_with_style(c, x, y, width, height, str(value)[:100], field)
            else:
                font_size = min(10, height * 0.7)
                c.setFillColor(colors.HexColor('#1a1a2e'))
                c.setFont("Helvetica", font_size)
                text_y = y + (height - font_size) / 2 + 1
                c.drawString(x + 3, text_y, str(value)[:100])

            logger.info(f"Drew merge field '{field_id}' = '{value}' at ({x}, {y})")
        except Exception as e:
            logger.error(f"Error drawing merge field: {e}")

    def _draw_label_field(self, c: canvas.Canvas, x: float, y: float, width: float,
                          height: float, field: Dict[str, Any]):
        """Draw a static label on PDF with styling."""
        text = field.get('text') or field.get('label', '')
        if not text:
            return

        try:
            if field.get('style'):
                self._draw_text_with_style(c, x, y, width, height, text, field)
            else:
                c.setFont("Helvetica", 10)
                c.setFillColorRGB(0, 0, 0)
                text_y = y + (height / 2) - 3
                c.drawString(x + 3, text_y, text)

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
