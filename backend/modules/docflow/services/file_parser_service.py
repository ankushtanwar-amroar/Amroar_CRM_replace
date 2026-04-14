"""
File Parser Service - Handles PDF file parsing
"""
import os
import base64
from typing import Dict, Any, Optional
import tempfile
import io


class FileParserService:
    def __init__(self):
        self.supported_formats = ['.pdf']

    async def parse_file(self, file_content: bytes, filename: str, content_type: str) -> Dict[str, Any]:
        """
        Parse uploaded PDF file
        Returns: {"success": bool, "html_content": str, "text_content": str, "pages": int}
        """
        file_ext = os.path.splitext(filename)[1].lower()

        if file_ext not in self.supported_formats:
            return {
                "success": False,
                "error": f"Unsupported file format. Only {', '.join(self.supported_formats)} allowed."
            }

        try:
            if file_ext == '.pdf':
                return await self._parse_pdf(file_content)
        except Exception as e:
            return {
                "success": False,
                "error": f"Failed to parse file: {str(e)}"
            }

    async def _parse_pdf(self, content: bytes) -> Dict[str, Any]:
        """
        Parse PDF file and extract basic metadata.
        The actual PDF is stored in S3 and loaded via pre-signed URL.
        """
        try:
            # Extract page count using PyPDF2 if available
            page_count = 1
            text_preview = ""
            try:
                from PyPDF2 import PdfReader
                reader = PdfReader(io.BytesIO(content))
                page_count = len(reader.pages)
                # Extract first page text for preview (limited to prevent BSON overflow)
                if reader.pages:
                    text_preview = (reader.pages[0].extract_text() or "")[:2000]
            except Exception:
                pass

            return {
                "success": True,
                "html_content": "",  # PDF is served via S3 URL, not embedded
                "text_content": text_preview or "PDF document uploaded",
                "pages": page_count,
            }
        except Exception as e:
            return {
                "success": False,
                "error": f"PDF parsing error: {str(e)}"
            }


