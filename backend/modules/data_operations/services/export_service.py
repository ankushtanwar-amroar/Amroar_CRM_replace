from typing import List, Dict
import pandas as pd
from datetime import datetime

class ExportService:
    """Handles data export operations"""
    
    def __init__(self, db):
        self.db = db
    
    async def export_data(self, object_name: str, selected_fields: List[str], filters: List[Dict], output_format: str, output_path: str):
        """Export data to file"""
        
        collection = self.db[object_name.lower()]
        
        # Build query from filters
        query = {}
        for f in filters:
            field = f.get('field')
            operator = f.get('operator')
            value = f.get('value')
            
            if operator == 'equals':
                query[field] = value
            elif operator == 'contains':
                query[field] = {'$regex': value, '$options': 'i'}
            elif operator == 'greater_than':
                query[field] = {'$gt': value}
            elif operator == 'less_than':
                query[field] = {'$lt': value}
        
        # Fetch data
        projection = {field: 1 for field in selected_fields}
        projection['_id'] = 0
        
        records = await collection.find(query, projection).to_list(10000)
        
        # Convert to DataFrame
        df = pd.DataFrame(records)
        
        # Export based on format
        if output_format == 'csv':
            df.to_csv(output_path, index=False)
        elif output_format == 'excel':
            df.to_excel(output_path, index=False, engine='openpyxl')
        
        return len(records)
