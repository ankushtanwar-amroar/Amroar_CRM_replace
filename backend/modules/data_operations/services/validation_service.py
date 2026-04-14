from typing import List, Dict, Any, Tuple
import pandas as pd
from datetime import datetime
import re

class ValidationService:
    """Validates import data before processing"""
    
    def __init__(self, db):
        self.db = db
    
    async def validate_rows(self, df: pd.DataFrame, object_name: str, import_type: str, field_mappings: List[Dict]) -> Tuple[List[Dict], List[Dict]]:
        """Validate all rows and return errors"""
        errors = []
        warnings = []
        
        # Build field map
        field_map = {m['csv_column']: m['field_name'] for m in field_mappings}
        
        # Get object schema
        object_schema = await self.get_object_schema(object_name)
        
        for idx, row in df.iterrows():
            row_num = idx + 2  # CSV row number (1-indexed + header)
            row_errors = await self.validate_row(row, row_num, field_map, object_schema, import_type)
            errors.extend(row_errors)
        
        return errors, warnings
    
    async def validate_row(self, row: pd.Series, row_num: int, field_map: Dict, schema: Dict, import_type: str) -> List[Dict]:
        """Validate single row"""
        errors = []
        
        for csv_col, field_name in field_map.items():
            value = row.get(csv_col)
            field_def = schema.get(field_name, {})
            
            # Required field check
            if field_def.get('required') and (pd.isna(value) or str(value).strip() == ''):
                errors.append({
                    'row': row_num,
                    'field': field_name,
                    'csv_column': csv_col,
                    'value': value,
                    'error_code': 'REQUIRED_FIELD_MISSING',
                    'error_message': f'Required field {field_name} is missing'
                })
                continue
            
            if pd.isna(value):
                continue
            
            value_str = str(value).strip()
            field_type = field_def.get('type', 'text')
            
            # Type-specific validation
            if field_type == 'email':
                if not self.is_valid_email(value_str):
                    errors.append({
                        'row': row_num,
                        'field': field_name,
                        'value': value_str,
                        'error_code': 'INVALID_EMAIL',
                        'error_message': f'Invalid email format: {value_str}'
                    })
            
            elif field_type == 'phone':
                if not self.is_valid_phone(value_str):
                    errors.append({
                        'row': row_num,
                        'field': field_name,
                        'value': value_str,
                        'error_code': 'INVALID_PHONE',
                        'error_message': f'Invalid phone format: {value_str}'
                    })
            
            elif field_type == 'date':
                if not self.is_valid_date(value_str):
                    errors.append({
                        'row': row_num,
                        'field': field_name,
                        'value': value_str,
                        'error_code': 'INVALID_DATE',
                        'error_message': f'Invalid date format: {value_str}'
                    })
            
            elif field_type == 'number':
                if not self.is_valid_number(value_str):
                    errors.append({
                        'row': row_num,
                        'field': field_name,
                        'value': value_str,
                        'error_code': 'INVALID_NUMBER',
                        'error_message': f'Invalid number format: {value_str}'
                    })
            
            elif field_type == 'picklist':
                valid_values = field_def.get('picklist_values', [])
                if valid_values and value_str not in valid_values:
                    errors.append({
                        'row': row_num,
                        'field': field_name,
                        'value': value_str,
                        'error_code': 'INVALID_PICKLIST_VALUE',
                        'error_message': f'Invalid picklist value. Must be one of: {", ".join(valid_values)}'
                    })
            
            # Max length check
            max_length = field_def.get('max_length')
            if max_length and len(value_str) > max_length:
                errors.append({
                    'row': row_num,
                    'field': field_name,
                    'value': value_str,
                    'error_code': 'MAX_LENGTH_EXCEEDED',
                    'error_message': f'Value exceeds max length of {max_length} characters'
                })
        
        return errors
    
    async def get_object_schema(self, object_name: str) -> Dict:
        """Get object field definitions"""
        # Default schemas for common objects (all keys lowercase for case-insensitive matching)
        schemas = {
            'lead': {
                'first_name': {'type': 'text', 'required': True, 'max_length': 100},
                'last_name': {'type': 'text', 'required': True, 'max_length': 100},
                'email': {'type': 'email', 'required': True, 'max_length': 255},
                'phone': {'type': 'phone', 'required': False, 'max_length': 20},
                'company': {'type': 'text', 'required': True, 'max_length': 255},
                'status': {'type': 'picklist', 'required': False, 'picklist_values': ['New', 'Working', 'Contacted', 'Qualified', 'Unqualified']},
            },
            'contact': {
                'first_name': {'type': 'text', 'required': True, 'max_length': 100},
                'last_name': {'type': 'text', 'required': True, 'max_length': 100},
                'email': {'type': 'email', 'required': True, 'max_length': 255},
                'phone': {'type': 'phone', 'required': False, 'max_length': 20},
            },
            'account': {
                'name': {'type': 'text', 'required': True, 'max_length': 255},
                'industry': {'type': 'text', 'required': False, 'max_length': 100},
                'website': {'type': 'text', 'required': False, 'max_length': 255},
            }
        }
        
        return schemas.get(object_name.lower(), {})
    
    def is_valid_email(self, email: str) -> bool:
        pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
        return bool(re.match(pattern, email))
    
    def is_valid_phone(self, phone: str) -> bool:
        # Remove common separators and spaces
        cleaned = re.sub(r'[\s\-\(\)\.\+]', '', phone)
        # Allow alphanumeric for extensions
        return cleaned.replace('x', '').replace('X', '').isdigit() and 7 <= len(cleaned) <= 20
    
    def is_valid_date(self, date_str: str) -> bool:
        formats = ['%Y-%m-%d', '%m/%d/%Y', '%d-%m-%Y', '%Y/%m/%d']
        for fmt in formats:
            try:
                datetime.strptime(date_str, fmt)
                return True
            except:
                continue
        return False
    
    def is_valid_number(self, num_str: str) -> bool:
        try:
            float(num_str)
            return True
        except:
            return False
