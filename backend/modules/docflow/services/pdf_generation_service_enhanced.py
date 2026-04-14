"""Enhanced PDF Generation with Template Overlay Support"""
import os
import io
from typing import Dict, Any, Optional, List
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
from reportlab.lib.utils import ImageReader
from PIL import Image
import base64
import logging
from PyPDF2 import PdfReader, PdfWriter

logger = logging.getLogger(__name__)


class EnhancedPDFGenerationService:
    def __init__(self):
        self.storage_path = os.path.join(os.path.dirname(__file__), '../../../storage/documents')
        os.makedirs(self.storage_path, exist_ok=True)
    
    def generate_from_template_pdf(self, template_pdf_path: str, field_placements: List[Dict[str, Any]], 
                                   field_values: Dict[str, Any] = None) -> bytes:
        """Generate PDF from template - returns exact copy of template PDF"""
        try:
            # Read and return the exact template PDF
            with open(template_pdf_path, 'rb') as f:
                template_content = f.read()
            
            logger.info(f"Copied template PDF: {len(template_content)} bytes")
            return template_content
        except Exception as e:
            logger.error(f"Error reading template PDF: {e}")
            raise
    
    def generate_simple_pdf(self, title: str, field_placements: List[Dict[str, Any]], 
                           field_values: Dict[str, Any] = None) -> bytes:
        """Generate simple PDF when template is not available"""
        buffer = io.BytesIO()
        p = canvas.Canvas(buffer, pagesize=letter)
        width, height = letter
        
        # Add title
        p.setFont("Helvetica-Bold", 16)
        p.drawString(50, height - 50, title)
        
        # Add field placeholders
        p.setFont("Helvetica", 12)
        y_position = height - 100
        
        for field in field_placements:
            if y_position < 100:
                p.showPage()
                p.setFont("Helvetica", 12)
                y_position = height - 50
            
            field_label = field.get('label', 'Field')
            field_id = field.get('id', '')
            field_value = ''
            
            if field_values and field_id in field_values:
                field_value = str(field_values[field_id])
            
            p.drawString(50, y_position, f"{field_label}: {field_value or '_______________'}")
            y_position -= 25
        
        p.save()
        buffer.seek(0)
        return buffer.read()
    
    def add_signature_to_pdf(self, pdf_bytes: bytes, signatures: List[Dict[str, Any]]) -> bytes:
        """Add signatures to existing PDF by appending a signature page"""
        try:
            logger.info(f"Adding signatures to PDF ({len(pdf_bytes)} bytes)")
            
            # Read existing PDF
            input_pdf = PdfReader(io.BytesIO(pdf_bytes))
            output = PdfWriter()
            
            # Copy all pages from original
            for page in input_pdf.pages:
                output.add_page(page)
            
            logger.info(f"Copied {len(input_pdf.pages)} pages from original PDF")
            
            # Create signature page
            buffer = io.BytesIO()
            p = canvas.Canvas(buffer, pagesize=letter)
            width, height = letter
            
            # Title
            p.setFont("Helvetica-Bold", 16)
            p.drawString(50, height - 50, "Digital Signatures")
            
            # Draw line
            p.setStrokeColorRGB(0.5, 0.5, 0.5)
            p.line(50, height - 70, width - 50, height - 70)
            
            y_pos = height - 100
            
            for idx, sig in enumerate(signatures):
                if y_pos < 150:  # Start new page if space runs out
                    p.showPage()
                    y_pos = height - 50
                
                # Signature info
                p.setFont("Helvetica-Bold", 12)
                p.setFillColorRGB(0, 0, 0)
                p.drawString(50, y_pos, f"Signature {idx + 1}")
                y_pos -= 20
                
                p.setFont("Helvetica", 10)
                p.drawString(70, y_pos, f"Name: {sig.get('signer_name', 'Unknown')}")
                y_pos -= 15
                p.drawString(70, y_pos, f"Email: {sig.get('signer_email', 'N/A')}")
                y_pos -= 15
                
                # Format date properly
                signed_at = sig.get('signed_at', '')
                if signed_at:
                    try:
                        from datetime import datetime
                        dt = datetime.fromisoformat(signed_at.replace('Z', '+00:00'))
                        signed_at = dt.strftime('%Y-%m-%d %H:%M:%S UTC')
                    except:
                        pass
                p.drawString(70, y_pos, f"Date: {signed_at}")
                y_pos -= 25
                
                # Draw signature image
                sig_data = sig.get('signature_data')
                if sig_data and 'data:image' in sig_data:
                    try:
                        # Extract base64 data
                        base64_data = sig_data.split(',')[1] if ',' in sig_data else sig_data
                        img_data = base64.b64decode(base64_data)
                        
                        # Create image
                        img = Image.open(io.BytesIO(img_data))
                        img_reader = ImageReader(io.BytesIO(img_data))
                        
                        # Draw with border
                        p.setStrokeColorRGB(0, 0, 0)
                        p.rect(70, y_pos - 70, 250, 65)
                        p.drawImage(img_reader, 75, y_pos - 65, width=240, height=55, preserveAspectRatio=True, mask='auto')
                        y_pos -= 80
                        
                        logger.info(f"Added signature image for {sig.get('signer_name')}")
                    except Exception as e:
                        logger.error(f"Error adding signature image: {e}")
                        p.drawString(70, y_pos, "[Signature image could not be rendered]")
                        y_pos -= 20
                
                y_pos -= 30  # Space between signatures
            
            p.save()
            buffer.seek(0)
            
            # Add signature page to output
            sig_pdf = PdfReader(buffer)
            for page in sig_pdf.pages:
                output.add_page(page)
            
            logger.info(f"Added signature page, total pages: {len(output.pages)}")
            
            # Write output
            output_buffer = io.BytesIO()
            output.write(output_buffer)
            output_buffer.seek(0)
            result = output_buffer.read()
            
            logger.info(f"Generated signed PDF: {len(result)} bytes")
            return result
            
        except Exception as e:
            logger.error(f"Error adding signature to PDF: {str(e)}", exc_info=True)
            # Return original PDF if signature addition fails
            logger.warning("Returning original PDF without signature overlay")
            return pdf_bytes
    
    def save_pdf(self, pdf_bytes: bytes, filename: str) -> str:
        """Save PDF to storage"""
        filepath = os.path.join(self.storage_path, filename)
        with open(filepath, 'wb') as f:
            f.write(pdf_bytes)
        return filepath
