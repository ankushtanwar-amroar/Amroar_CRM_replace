"""
File Manager - AI Service
Mock AI service for auto-tagging and category suggestions.
"""

import random
from typing import Dict, List, Any, Optional
import logging

logger = logging.getLogger(__name__)


# Mock AI confidence thresholds
HIGH_CONFIDENCE = 0.85
MEDIUM_CONFIDENCE = 0.70
LOW_CONFIDENCE = 0.50

# Category mappings based on file patterns
CATEGORY_PATTERNS = {
    "contract": {
        "keywords": ["contract", "agreement", "terms", "nda", "msa", "sla", "sow"],
        "extensions": [".pdf", ".docx", ".doc"],
        "suggested_category": "Contracts",
        "suggested_tags": ["legal", "agreement", "signed"]
    },
    "invoice": {
        "keywords": ["invoice", "bill", "receipt", "payment", "po-"],
        "extensions": [".pdf", ".xlsx", ".xls"],
        "suggested_category": "Financial",
        "suggested_tags": ["invoice", "accounting", "payment"]
    },
    "proposal": {
        "keywords": ["proposal", "quote", "quotation", "estimate", "rfp", "bid"],
        "extensions": [".pdf", ".docx", ".pptx"],
        "suggested_category": "Sales",
        "suggested_tags": ["proposal", "sales", "opportunity"]
    },
    "presentation": {
        "keywords": ["presentation", "deck", "slides", "pitch"],
        "extensions": [".pptx", ".ppt", ".pdf", ".key"],
        "suggested_category": "Marketing",
        "suggested_tags": ["presentation", "marketing", "deck"]
    },
    "report": {
        "keywords": ["report", "analysis", "summary", "review", "audit"],
        "extensions": [".pdf", ".docx", ".xlsx"],
        "suggested_category": "Reports",
        "suggested_tags": ["report", "analysis", "documentation"]
    },
    "image": {
        "keywords": ["photo", "image", "screenshot", "logo", "banner"],
        "extensions": [".jpg", ".jpeg", ".png", ".gif", ".svg", ".webp"],
        "suggested_category": "Images",
        "suggested_tags": ["image", "media", "visual"]
    },
    "spreadsheet": {
        "keywords": ["data", "list", "tracker", "budget", "forecast"],
        "extensions": [".xlsx", ".xls", ".csv"],
        "suggested_category": "Data",
        "suggested_tags": ["spreadsheet", "data", "analysis"]
    },
    "document": {
        "keywords": ["doc", "document", "memo", "letter", "note"],
        "extensions": [".docx", ".doc", ".txt", ".rtf"],
        "suggested_category": "Documents",
        "suggested_tags": ["document", "general"]
    }
}


class AIService:
    """
    Mock AI service for file analysis and suggestions.
    In production, this would integrate with OpenAI, Azure AI, or similar.
    """
    
    def __init__(self):
        self.is_mock = True
    
    async def analyze_file(
        self,
        filename: str,
        mime_type: str,
        file_content: Optional[bytes] = None,
        existing_categories: List[Dict[str, Any]] = None,
        existing_tags: List[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Analyze a file and suggest category and tags.
        
        Args:
            filename: The file name
            mime_type: MIME type of the file
            file_content: Optional file content for deeper analysis
            existing_categories: Available categories in the system
            existing_tags: Available tags in the system
        
        Returns:
            Dictionary with suggestions and confidence scores
        """
        logger.info(f"[AI] Analyzing file: {filename}")
        
        filename_lower = filename.lower()
        extension = "." + filename.split(".")[-1].lower() if "." in filename else ""
        
        # Find best matching pattern
        best_match = None
        best_score = 0
        
        for pattern_name, pattern_data in CATEGORY_PATTERNS.items():
            score = 0
            
            # Check keywords in filename
            for keyword in pattern_data["keywords"]:
                if keyword in filename_lower:
                    score += 0.4
            
            # Check extension
            if extension in pattern_data["extensions"]:
                score += 0.3
            
            # Check MIME type
            if "pdf" in mime_type and extension == ".pdf":
                score += 0.1
            elif "image" in mime_type and pattern_name == "image":
                score += 0.2
            elif "spreadsheet" in mime_type or "excel" in mime_type:
                if pattern_name == "spreadsheet":
                    score += 0.2
            
            if score > best_score:
                best_score = score
                best_match = pattern_data
        
        # Default if no match
        if not best_match or best_score < 0.2:
            best_match = {
                "suggested_category": "Documents",
                "suggested_tags": ["general", "uncategorized"]
            }
            best_score = LOW_CONFIDENCE
        
        # Map to existing categories/tags if provided
        suggested_category_id = None
        suggested_category_name = best_match["suggested_category"]
        
        if existing_categories:
            for cat in existing_categories:
                if cat.get("name", "").lower() == suggested_category_name.lower():
                    suggested_category_id = cat.get("id")
                    break
        
        suggested_tag_ids = []
        suggested_tag_names = best_match["suggested_tags"]
        
        if existing_tags:
            for tag_name in suggested_tag_names:
                for tag in existing_tags:
                    if tag.get("name", "").lower() == tag_name.lower():
                        suggested_tag_ids.append(tag.get("id"))
                        break
        
        # Calculate confidence (add some randomness for realism)
        confidence = min(best_score + random.uniform(-0.1, 0.15), 0.98)
        confidence = max(confidence, 0.3)
        
        result = {
            "suggested_category_id": suggested_category_id,
            "suggested_category_name": suggested_category_name,
            "suggested_tag_ids": suggested_tag_ids,
            "suggested_tag_names": suggested_tag_names,
            "confidence_score": round(confidence, 2),
            "confidence_level": (
                "high" if confidence >= HIGH_CONFIDENCE else
                "medium" if confidence >= MEDIUM_CONFIDENCE else
                "low"
            ),
            "analysis_details": {
                "filename_analyzed": filename,
                "extension_detected": extension,
                "mime_type": mime_type,
                "pattern_matched": best_match.get("suggested_category"),
                "is_mock": True
            }
        }
        
        logger.info(f"[AI] Suggestions: category={suggested_category_name}, "
                   f"tags={suggested_tag_names}, confidence={confidence:.2f}")
        
        return result
    
    async def extract_text_preview(
        self,
        file_content: bytes,
        mime_type: str,
        max_chars: int = 500
    ) -> Optional[str]:
        """
        Extract text preview from file content.
        In production, this would use OCR or document parsing.
        """
        # Mock implementation - just return placeholder
        if "text" in mime_type or "pdf" in mime_type:
            return "[Mock AI] Text content would be extracted here for analysis..."
        return None
    
    def get_service_status(self) -> Dict[str, Any]:
        """Get AI service status"""
        return {
            "service": "File Manager AI",
            "status": "active",
            "is_mock": True,
            "capabilities": [
                "category_suggestion",
                "tag_suggestion",
                "confidence_scoring"
            ],
            "limitations": [
                "No actual content analysis (mock)",
                "Pattern-based matching only"
            ]
        }


# Singleton instance
_ai_service: Optional[AIService] = None


def get_ai_service() -> AIService:
    """Get AI service instance"""
    global _ai_service
    if _ai_service is None:
        _ai_service = AIService()
    return _ai_service
