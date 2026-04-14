from typing import List, Dict, Any
import pandas as pd
from datetime import datetime
from uuid import uuid4
import os

class ImportService:
    """Handles actual data import operations"""
    
    def __init__(self, db):
        self.db = db
    
    async def process_import(self, job_id: str, df: pd.DataFrame, object_name: str, import_type: str, field_mappings: List[Dict], duplicate_handling: Dict = None):
        """Process import job"""
        
        success_rows = []
        error_rows = []
        rollback_data = []
        
        field_map = {m['csv_column']: m['field_name'] for m in field_mappings}
        collection = self.db[object_name.lower()]
        
        for idx, row in df.iterrows():
            try:
                # Map CSV columns to field names
                record = {}
                for csv_col, field_name in field_map.items():
                    value = row.get(csv_col)
                    if pd.notna(value):
                        record[field_name] = str(value).strip()
                
                # Process based on import type
                if import_type == 'insert':
                    result = await self.insert_record(collection, record, rollback_data)
                elif import_type == 'update':
                    result = await self.update_record(collection, record, duplicate_handling, rollback_data)
                elif import_type == 'upsert':
                    result = await self.upsert_record(collection, record, duplicate_handling, rollback_data)
                
                if result['success']:
                    success_rows.append({**row.to_dict(), 'recordId': result['record_id'], 'action': result['action']})
                else:
                    error_rows.append({**row.to_dict(), 'error': result['error']})
            
            except Exception as e:
                error_rows.append({**row.to_dict(), 'error': str(e)})
        
        return success_rows, error_rows, rollback_data
    
    async def insert_record(self, collection, record: Dict, rollback_data: List) -> Dict:
        """Insert new record"""
        try:
            record_id = str(uuid4())
            record['id'] = record_id
            record['created_at'] = datetime.utcnow()
            record['updated_at'] = datetime.utcnow()
            
            await collection.insert_one(record)
            
            # Store for rollback
            rollback_data.append({
                'action': 'insert',
                'record_id': record_id,
                'collection': collection.name
            })
            
            return {'success': True, 'record_id': record_id, 'action': 'inserted'}
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    async def update_record(self, collection, record: Dict, duplicate_handling: Dict, rollback_data: List) -> Dict:
        """Update existing record"""
        try:
            if not duplicate_handling or not duplicate_handling.get('match_fields'):
                return {'success': False, 'error': 'Match fields required for update'}
            
            # Build match query
            match_query = {}
            for field in duplicate_handling['match_fields']:
                if field in record:
                    match_query[field] = record[field]
            
            if not match_query:
                return {'success': False, 'error': 'No match fields found in record'}
            
            # Find existing record
            existing = await collection.find_one(match_query, {'_id': 0})
            if not existing:
                return {'success': False, 'error': 'No matching record found'}
            
            # Store before values for rollback
            rollback_data.append({
                'action': 'update',
                'record_id': existing['id'],
                'collection': collection.name,
                'before_values': {k: existing.get(k) for k in record.keys()}
            })
            
            # Update record
            record['updated_at'] = datetime.utcnow()
            await collection.update_one({'id': existing['id']}, {'$set': record})
            
            return {'success': True, 'record_id': existing['id'], 'action': 'updated'}
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    async def upsert_record(self, collection, record: Dict, duplicate_handling: Dict, rollback_data: List) -> Dict:
        """Insert or update based on match"""
        try:
            if not duplicate_handling or not duplicate_handling.get('match_fields'):
                # No match fields, default to insert
                return await self.insert_record(collection, record, rollback_data)
            
            # Build match query
            match_query = {}
            for field in duplicate_handling['match_fields']:
                if field in record:
                    match_query[field] = record[field]
            
            if not match_query:
                return await self.insert_record(collection, record, rollback_data)
            
            # Check if exists
            existing = await collection.find_one(match_query, {'_id': 0})
            
            if existing:
                # Update
                rollback_data.append({
                    'action': 'update',
                    'record_id': existing['id'],
                    'collection': collection.name,
                    'before_values': {k: existing.get(k) for k in record.keys()}
                })
                
                record['updated_at'] = datetime.utcnow()
                await collection.update_one({'id': existing['id']}, {'$set': record})
                return {'success': True, 'record_id': existing['id'], 'action': 'updated'}
            else:
                # Insert
                return await self.insert_record(collection, record, rollback_data)
        
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    async def rollback_import(self, rollback_data: List):
        """Rollback imported data"""
        for item in rollback_data:
            try:
                collection = self.db[item['collection']]
                
                if item['action'] == 'insert':
                    # Delete inserted record
                    await collection.delete_one({'id': item['record_id']})
                
                elif item['action'] == 'update':
                    # Restore previous values
                    await collection.update_one(
                        {'id': item['record_id']},
                        {'$set': item['before_values']}
                    )
            except Exception as e:
                print(f"Rollback error: {e}")
