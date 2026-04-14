"""
PDF Generation Service
Generates PDFs from templates with filled data and signatures
"""
import os
import io
from typing import Dict, Any, Optional, List
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
import logging

logger = logging.getLogger(__name__)


class PDFGenerationService:
    def __init__(self):
        self.storage_path = os.path.join(os.path.dirname(__file__), '../../../storage/documents')
        os.makedirs(self.storage_path, exist_ok=True)
    
    def generate_unsigned_pdf(self, template_data: Dict[str, Any], field_values: Dict[str, Any] = None) -> bytes:
        """Generate unsigned PDF from template"""
        buffer = io.BytesIO()
        
        # Create PDF
        p = canvas.Canvas(buffer, pagesize=letter)
        width, height = letter
        
        # Add template content
        p.setFont("Helvetica", 12)
        y_position = height - 50
        
        # Add title
        template_name = template_data.get('name', 'Document')
        p.setFont("Helvetica-Bold", 16)
        p.drawString(50, y_position, template_name)
        y_position -= 40
        
        # Add signature placeholder
        p.setFont("Helvetica", 12)
        p.drawString(50, y_position - 40, "Signature: _________________________")
        p.drawString(50, y_position - 65, "Date: _________________________")
        
        p.save()
        
        buffer.seek(0)
        return buffer.read()
    
    def generate_signed_pdf(self, unsigned_pdf_path: str, signatures: List[Dict[str, Any]], 
                           field_data: Dict[str, Any] = None) -> bytes:
        """Generate signed PDF"""
        buffer = io.BytesIO()
        p = canvas.Canvas(buffer, pagesize=letter)
        width, height = letter
        
        # Add content
        p.setFont("Helvetica-Bold", 16)
        p.drawString(50, height - 50, "Signed Document")
        
        p.setFont("Helvetica", 12)
        y_position = height - 100
        
        # Add signature info
        for signature in signatures:
            signer_name = signature.get('signer_name', 'Unknown')
            signed_at = signature.get('signed_at', '')
            
            p.drawString(50, y_position, f"Signed by: {signer_name}")
            y_position -= 20
            p.drawString(50, y_position, f"Date: {signed_at}")
            y_position -= 50
        
        p.save()
        buffer.seek(0)
        return buffer.read()
    
    def save_pdf(self, pdf_bytes: bytes, filename: str) -> str:
        """Save PDF to local storage - Returns: file path"""
        filepath = os.path.join(self.storage_path, filename)
        
        with open(filepath, 'wb') as f:
            f.write(pdf_bytes)
        
        return filepath
    
    def get_pdf_path(self, filename: str) -> str:
        """Get full path to PDF file"""
        return os.path.join(self.storage_path, filename)
    
    def pdf_exists(self, filename: str) -> bool:
        """Check if PDF file exists"""
        return os.path.exists(self.get_pdf_path(filename))
