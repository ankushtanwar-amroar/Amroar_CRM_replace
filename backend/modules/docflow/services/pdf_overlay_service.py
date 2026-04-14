"""
PDF Overlay Service
Overlays field data and signatures onto PDF templates
"""
import io
from typing import Dict, List, Any
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
from reportlab.lib.utils import ImageReader
from PIL import Image
import base64
from PyPDF2 import PdfReader, PdfWriter
import logging

logger = logging.getLogger(__name__)


class PDFOverlayService:
    """Service to overlay fields and signatures on PDF templates"""
    
    @staticmethod
    def overlay_fields_on_pdf(template_pdf_bytes: bytes, field_placements: List[Dict], 
                              field_data: Dict[str, Any] = None) -> bytes:
        """
        Overlay field data onto PDF template
        
        Args:
            template_pdf_bytes: Original PDF bytes
            field_placements: List of field placement configurations
            field_data: Dictionary of field values {field_id: value}
        
        Returns:
            PDF bytes with overlaid fields
        """
        try:
            # Read template PDF
            template_pdf = PdfReader(io.BytesIO(template_pdf_bytes))
            output = PdfWriter()
            
            # Get page dimensions
            first_page = template_pdf.pages[0]
            page_width = float(first_page.mediabox.width)
            page_height = float(first_page.mediabox.height)
            
            logger.info(f"PDF dimensions: {page_width}x{page_height}")
            logger.info(f"Overlaying {len(field_placements)} fields")
            
            # Group fields by page
            fields_by_page = {}
            for field in field_placements:
                page_num = field.get('page', 1)
                if page_num not in fields_by_page:
                    fields_by_page[page_num] = []
                fields_by_page[page_num].append(field)
            
            # Process each page
            for page_num in range(len(template_pdf.pages)):
                page = template_pdf.pages[page_num]
                
                # Create overlay for this page if it has fields
                if (page_num + 1) in fields_by_page:
                    page_fields = fields_by_page[page_num + 1]
                    overlay_bytes = PDFOverlayService._create_overlay(
                        page_fields, field_data, page_width, page_height
                    )
                    
                    if overlay_bytes:
                        # Merge overlay with page
                        overlay_pdf = PdfReader(io.BytesIO(overlay_bytes))
                        page.merge_page(overlay_pdf.pages[0])
                
                output.add_page(page)
            
            # Write output
            output_buffer = io.BytesIO()
            output.write(output_buffer)
            output_buffer.seek(0)
            
            result_bytes = output_buffer.read()
            logger.info(f"Generated PDF with overlays: {len(result_bytes)} bytes")
            return result_bytes
            
        except Exception as e:
            logger.error(f"Error overlaying fields: {e}", exc_info=True)
            # Return original PDF on error
            return template_pdf_bytes
    
    @staticmethod
    def _create_overlay(fields: List[Dict], field_data: Dict, page_width: float, page_height: float) -> bytes:
        """Create overlay PDF for one page"""
        try:
            buffer = io.BytesIO()
            c = canvas.Canvas(buffer, pagesize=(page_width, page_height))
            
            for field in fields:
                field_id = field.get('id')
                field_type = field.get('type')
                
                # Scale from builder's 800px coordinate system to actual PDF dimensions
                BUILDER_WIDTH = 800
                scale = page_width / BUILDER_WIDTH
                x = field.get('x', 0) * scale
                y = page_height - (field.get('y', 0) * scale)  # Flip Y axis
                
                width = field.get('width', 150) * scale
                height = field.get('height', 40) * scale
                
                # Get field value
                value = field_data.get(field_id, '') if field_data else ''
                
                if field_type == 'text':
                    # Draw text box
                    c.setStrokeColorRGB(0.5, 0.5, 0.5)
                    c.setLineWidth(1)
                    c.rect(x, y - height, width, height)
                    
                    # Draw text
                    if value:
                        c.setFont("Helvetica", 10)
                        c.setFillColorRGB(0, 0, 0)
                        c.drawString(x + 5, y - height + 15, str(value))
                
                elif field_type == 'checkbox':
                    # Draw checkbox
                    box_size = min(width, height, 20)
                    c.setStrokeColorRGB(0, 0, 0)
                    c.setLineWidth(1)
                    c.rect(x, y - box_size, box_size, box_size)
                    
                    # Draw checkmark if checked
                    if value and str(value).lower() in ['true', 'yes', '1', 'checked']:
                        c.line(x + 2, y - box_size/2, x + box_size/3, y - box_size + 2)
                        c.line(x + box_size/3, y - box_size + 2, x + box_size - 2, y - 2)
                
                elif field_type == 'date':
                    # Draw date field
                    c.setStrokeColorRGB(0.5, 0.5, 0.5)
                    c.setLineWidth(1)
                    c.rect(x, y - height, width, height)
                    
                    if value:
                        c.setFont("Helvetica", 10)
                        c.setFillColorRGB(0, 0, 0)
                        c.drawString(x + 5, y - height + 15, str(value))
                
                elif field_type == 'signature':
                    # Draw signature box
                    c.setStrokeColorRGB(0, 0, 0)
                    c.setLineWidth(1)
                    c.rect(x, y - height, width, height)
                    
                    # Draw signature image if provided
                    if value and isinstance(value, str) and 'data:image' in value:
                        try:
                            base64_data = value.split(',')[1] if ',' in value else value
                            img_data = base64.b64decode(base64_data)
                            img = Image.open(io.BytesIO(img_data))
                            img_reader = ImageReader(io.BytesIO(img_data))
                            c.drawImage(img_reader, x + 2, y - height + 2, 
                                       width=width - 4, height=height - 4, 
                                       preserveAspectRatio=True, mask='auto')
                        except Exception as e:
                            logger.error(f"Error drawing signature image: {e}")
            
            c.save()
            buffer.seek(0)
            return buffer.read()
            
        except Exception as e:
            logger.error(f"Error creating overlay: {e}")
            return None
