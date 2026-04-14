"""
Merge Field Service - Handles {{object.field}} replacements in DocFlow
Supports both {{}} and {} patterns for backward compatibility
"""
import re
from typing import Dict, Any, List, Optional
import logging
from PyPDF2 import PdfReader
import io

logger = logging.getLogger(__name__)


class MergeFieldService:
    """Service to parse and replace merge fields like {{lead.name}}, {{opportunity.amount}}"""
    
    # Support both {{}} and {} patterns
    MERGE_FIELD_PATTERN_DOUBLE = r'\{\{([a-zA-Z_]+)\.([a-zA-Z_]+)\}\}'  # {{object.field}}
    MERGE_FIELD_PATTERN_SINGLE = r'\{([a-zA-Z_]+)\.([a-zA-Z_]+)\}'      # {object.field}
    
    def __init__(self, db):
        self.db = db
    
    def extract_merge_fields(self, text: str) -> List[Dict[str, str]]:
        """
        Extract all merge fields from text
        Supports both {{object.field}} and {object.field} patterns
        Returns: [{"object": "lead", "field": "name", "pattern": "double"}, ...]
        """
        fields = []
        
        # Extract {{object.field}} patterns (priority)
        for match in re.finditer(self.MERGE_FIELD_PATTERN_DOUBLE, text):
            fields.append({
                "object": match.group(1),
                "field": match.group(2),
                "full_pattern": match.group(0),
                "pattern_type": "double"
            })
        
        # Extract {object.field} patterns (if not already matched)
        existing_patterns = set(f["full_pattern"] for f in fields)
        for match in re.finditer(self.MERGE_FIELD_PATTERN_SINGLE, text):
            pattern = match.group(0)
            # Skip if this is part of a double pattern
            if pattern not in existing_patterns and not text[match.start()-1:match.start()] == '{':
                fields.append({
                    "object": match.group(1),
                    "field": match.group(2),
                    "full_pattern": pattern,
                    "pattern_type": "single"
                })
        
        return fields
    
    def extract_merge_fields_from_pdf(self, pdf_bytes: bytes) -> List[Dict[str, str]]:
        """
        Extract merge fields from PDF text content
        Returns: [{"object": "lead", "field": "email", "full_pattern": "{{lead.email}}"}, ...]
        """
        try:
            pdf_reader = PdfReader(io.BytesIO(pdf_bytes))
            all_text = ""
            
            # Extract text from all pages
            for page in pdf_reader.pages:
                all_text += page.extract_text() + "\n"
            
            # Extract merge fields from combined text
            fields = self.extract_merge_fields(all_text)
            
            logger.info(f"Extracted {len(fields)} merge fields from PDF")
            for field in fields:
                logger.info(f"  - {field['full_pattern']} ({field['object']}.{field['field']})")
            
            return fields
            
        except Exception as e:
            logger.error(f"Error extracting merge fields from PDF: {e}", exc_info=True)
            return []
    
    def replace_merge_fields(self, text: str, object_data: Dict[str, Any], object_type: str = None) -> str:
        """
        Replace merge fields in text with actual data
        Supports both {{object.field}} and {object.field} patterns
        
        Args:
            text: Text containing merge fields like "Hello {{lead.name}}"
            object_data: CRM object data like {"name": "John", "email": "john@example.com"}
            object_type: Type of object ("lead", "contact", etc.)
        
        Returns:
            Text with merge fields replaced: "Hello John"
        """
        if not text or not object_data:
            return text
        
        def replacer(match):
            obj_name = match.group(1)
            field_name = match.group(2)
            
            # If object_type specified, check if it matches
            if object_type and obj_name.lower() != object_type.lower():
                return match.group(0)  # Keep original if object type doesn't match
            
            # Get value from object_data - try multiple paths
            value = None
            
            # 1. Try direct field access
            if field_name in object_data:
                value = object_data[field_name]
            
            # 2. Try fields dict (for records with fields structure)
            elif 'fields' in object_data and field_name in object_data['fields']:
                value = object_data['fields'][field_name]
            
            # 3. Try data dict (alternative structure)
            elif 'data' in object_data and field_name in object_data['data']:
                value = object_data['data'][field_name]
            
            # Return value or empty string if not found
            if value is not None:
                return str(value)
            else:
                logger.warning(f"Merge field {match.group(0)} not found in object data (object_type={object_type})")
                return ""  # Fallback to empty string instead of crashing
        
        # Replace both patterns
        text = re.sub(self.MERGE_FIELD_PATTERN_DOUBLE, replacer, text)
        text = re.sub(self.MERGE_FIELD_PATTERN_SINGLE, replacer, text)
        
        return text
    
    def replace_merge_fields_in_dict(self, data: Dict[str, Any], object_data: Dict[str, Any], 
                                     object_type: str = None) -> Dict[str, Any]:
        """
        Replace merge fields in all string values within a dictionary
        Useful for replacing merge fields in field configurations
        """
        result = {}
        for key, value in data.items():
            if isinstance(value, str):
                result[key] = self.replace_merge_fields(value, object_data, object_type)
            elif isinstance(value, dict):
                result[key] = self.replace_merge_fields_in_dict(value, object_data, object_type)
            elif isinstance(value, list):
                result[key] = [
                    self.replace_merge_fields(item, object_data, object_type) if isinstance(item, str)
                    else self.replace_merge_fields_in_dict(item, object_data, object_type) if isinstance(item, dict)
                    else item
                    for item in value
                ]
            else:
                result[key] = value
        return result
    
    async def get_crm_object_data(self, object_type: str, object_id: str, tenant_id: str) -> Optional[Dict[str, Any]]:
        """
        Fetch CRM object data from database
        
        Args:
            object_type: "lead", "contact", "opportunity", etc.
            object_id: UUID of the object
            tenant_id: Tenant ID
        
        Returns:
            Object data or None
        """
        try:
            record = await self.db.object_records.find_one({
                "id": object_id,
                "object_name": object_type.capitalize(),
                "tenant_id": tenant_id
            })
            
            if not record:
                logger.warning(f"CRM object not found: {object_type} {object_id}")
                return None
            
            # Return fields if available, otherwise return full record
            return record.get("fields", record)
        
        except Exception as e:
            logger.error(f"Error fetching CRM object: {e}")
            return None
    
    def preview_merge_fields(self, text: str, object_data: Dict[str, Any]) -> str:
        """
        Generate preview of text with merge fields highlighted
        Useful for UI to show what will be replaced
        """
        fields = self.extract_merge_fields(text)
        preview = text
        
        for field in fields:
            field_name = field["field"]
            value = object_data.get(field_name, "[Not Found]")
            preview = preview.replace(
                field["full_pattern"],
                f"[{field['full_pattern']} → {value}]"
            )
        
        return preview
    
    def validate_merge_fields(self, text: str, available_objects: List[str]) -> Dict[str, Any]:
        """
        Validate that merge fields reference valid objects
        
        Returns:
            {
                "valid": True/False,
                "errors": ["Unknown object: {invalid.field}"],
                "fields": [{"object": "lead", "field": "name"}]
            }
        """
        fields = self.extract_merge_fields(text)
        errors = []
        
        for field in fields:
            if field["object"].lower() not in [obj.lower() for obj in available_objects]:
                errors.append(f"Unknown object: {field['full_pattern']}")
        
        return {
            "valid": len(errors) == 0,
            "errors": errors,
            "fields": fields
        }
