"""File Parser Service for Chatbot Knowledge Base"""
import os
import io
from typing import Optional
import logging

# PDF parsing
try:
    from PyPDF2 import PdfReader
    PYPDF2_AVAILABLE = True
except ImportError:
    PYPDF2_AVAILABLE = False

# DOCX parsing
try:
    import docx
    DOCX_AVAILABLE = True
except ImportError:
    DOCX_AVAILABLE = False

logger = logging.getLogger(__name__)


class FileParserService:
    """Parse uploaded files and extract text content"""
    
    @staticmethod
    def parse_pdf(file_path: str) -> Optional[str]:
        """Extract text from PDF file"""
        if not PYPDF2_AVAILABLE:
            logger.warning("PyPDF2 not available for PDF parsing")
            return None
        
        try:
            with open(file_path, 'rb') as file:
                pdf_reader = PdfReader(file)
                text_content = []
                
                for page_num, page in enumerate(pdf_reader.pages):
                    try:
                        text = page.extract_text()
                        if text:
                            text_content.append(text)
                    except Exception as e:
                        logger.error(f"Error extracting page {page_num}: {e}")
                        continue
                
                full_text = '\n'.join(text_content)
                logger.info(f"Extracted {len(full_text)} characters from PDF")
                return full_text
        
        except Exception as e:
            logger.error(f"Error parsing PDF: {e}")
            return None
    
    @staticmethod
    def parse_docx(file_path: str) -> Optional[str]:
        """Extract text from DOCX file"""
        if not DOCX_AVAILABLE:
            logger.warning("python-docx not available for DOCX parsing")
            return None
        
        try:
            doc = docx.Document(file_path)
            text_content = []
            
            for paragraph in doc.paragraphs:
                if paragraph.text.strip():
                    text_content.append(paragraph.text)
            
            full_text = '\n'.join(text_content)
            logger.info(f"Extracted {len(full_text)} characters from DOCX")
            return full_text
        
        except Exception as e:
            logger.error(f"Error parsing DOCX: {e}")
            return None
    
    @staticmethod
    def parse_txt(file_path: str) -> Optional[str]:
        """Extract text from TXT file"""
        try:
            with open(file_path, 'r', encoding='utf-8') as file:
                content = file.read()
                logger.info(f"Read {len(content)} characters from TXT")
                return content
        except UnicodeDecodeError:
            # Try with different encoding
            try:
                with open(file_path, 'r', encoding='latin-1') as file:
                    content = file.read()
                    logger.info(f"Read {len(content)} characters from TXT (latin-1)")
                    return content
            except Exception as e:
                logger.error(f"Error reading TXT file: {e}")
                return None
        except Exception as e:
            logger.error(f"Error parsing TXT: {e}")
            return None
    
    @classmethod
    def parse_file(cls, file_path: str, filename: str) -> Optional[str]:
        """Parse file based on extension"""
        if not os.path.exists(file_path):
            logger.error(f"File not found: {file_path}")
            return None
        
        ext = os.path.splitext(filename)[1].lower()
        
        if ext == '.pdf':
            return cls.parse_pdf(file_path)
        elif ext == '.docx':
            return cls.parse_docx(file_path)
        elif ext == '.txt':
            return cls.parse_txt(file_path)
        else:
            logger.warning(f"Unsupported file type: {ext}")
            return None
    
    @staticmethod
    def extract_relevant_sections(content: str, query: str, max_length: int = 1000) -> str:
        """Extract relevant sections from content based on query"""
        if not content or not query:
            return content[:max_length] if content else ""
        
        # Split into sentences
        import re
        sentences = re.split(r'[.!?]+', content)
        
        # Score sentences based on query keywords
        query_words = set(query.lower().split())
        scored_sentences = []
        
        for sentence in sentences:
            sentence = sentence.strip()
            if len(sentence) < 20:  # Skip very short sentences
                continue
            
            sentence_lower = sentence.lower()
            score = sum(1 for word in query_words if word in sentence_lower)
            
            if score > 0:
                scored_sentences.append((score, sentence))
        
        # Sort by score and take top sentences
        scored_sentences.sort(reverse=True, key=lambda x: x[0])
        
        # Combine top sentences
        result = ""
        for score, sentence in scored_sentences[:5]:  # Top 5 relevant sentences
            result += sentence + ". "
            if len(result) > max_length:
                break
        
        # If no relevant sentences found, return first part of content
        if not result:
            result = content[:max_length]
        
        return result[:max_length]
