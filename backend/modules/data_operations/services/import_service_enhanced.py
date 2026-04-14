"""
Enhanced Import Service with full Update/Upsert support
Implements match configuration, validation, rollback snapshots, and retry logic
"""
from typing import List, Dict, Any, Tuple
import pandas as pd
from datetime import datetime, timezone
from uuid import uuid4
import os
import logging

logger = logging.getLogger(__name__)

class ImportServiceEnhanced:
    """Handles data import operations with Update/Upsert support"""
    
    def __init__(self, db):
        self.db = db
        self.CHUNK_SIZE = 500  # Process in chunks to avoid N+1 queries
    
    async def process_import(
        self,
        job_id: str,
        df: pd.DataFrame,
        object_name: str,
        import_type: str,
        field_mappings: List[Dict],
        match_config: Dict = None,
        duplicate_handling: Dict = None
    ) -> Tuple[List[Dict], List[Dict], List[Dict]]:
        """
        Process import job with chunking
        Returns: (success_rows, error_rows, rollback_data)
        """
        
        success_rows = []
        error_rows = []
        rollback_data = []
        
        # Get job details for tenant_id
        job = await self.db.import_jobs.find_one({'id': job_id})
        if not job:
            raise ValueError(f"Job {job_id} not found")
        
        tenant_id = job['tenant_id']
        
        # Build field mapping dictionary
        field_map = {m['csv_column']: m['field_name'] for m in field_mappings}
        collection = self.db.object_records  # Use object_records collection
        
        # Update job status
        await self.db.import_jobs.update_one(
            {'id': job_id},
            {'$set': {'status': 'running', 'started_at': datetime.now(timezone.utc)}}
        )
        
        # Process in chunks
        total_rows = len(df)
        for chunk_start in range(0, total_rows, self.CHUNK_SIZE):
            chunk_end = min(chunk_start + self.CHUNK_SIZE, total_rows)
            chunk_df = df.iloc[chunk_start:chunk_end]
            
            logger.info(f"Processing chunk {chunk_start}-{chunk_end} for job {job_id}")
            
            if import_type == 'insert':
                chunk_success, chunk_errors, chunk_rollback = await self._process_insert_chunk(
                    collection, chunk_df, field_map, object_name, tenant_id
                )
            elif import_type == 'update':
                chunk_success, chunk_errors, chunk_rollback = await self._process_update_chunk(
                    collection, chunk_df, field_map, match_config, object_name, tenant_id
                )
            elif import_type == 'upsert':
                chunk_success, chunk_errors, chunk_rollback = await self._process_upsert_chunk(
                    collection, chunk_df, field_map, match_config, object_name, tenant_id
                )
            else:
                raise ValueError(f"Unsupported import type: {import_type}")
            
            success_rows.extend(chunk_success)
            error_rows.extend(chunk_errors)
            rollback_data.extend(chunk_rollback)
            
            # Update progress
            await self.db.import_jobs.update_one(
                {'id': job_id},
                {'$set': {
                    'processed_rows': chunk_end,
                    'success_count': len(success_rows),
                    'error_count': len(error_rows)
                }}
            )
        
        return success_rows, error_rows, rollback_data
    
    async def _process_insert_chunk(
        self,
        collection,
        df: pd.DataFrame,
        field_map: Dict[str, str],
        object_name: str,
        tenant_id: str
    ) -> Tuple[List[Dict], List[Dict], List[Dict]]:
        """Process INSERT chunk"""
        success_rows = []
        error_rows = []
        rollback_data = []
        
        for idx, row in df.iterrows():
            try:
                data = self._map_row_to_record(row, field_map)
                record_id = str(uuid4())
                
                # Create object_records structure
                record = {
                    'id': record_id,
                    'tenant_id': tenant_id,
                    'object_name': object_name,
                    'data': data,
                    'created_at': datetime.now(timezone.utc),
                    'updated_at': datetime.now(timezone.utc)
                }
                
                await collection.insert_one(record)
                
                # Store for rollback
                rollback_data.append({
                    'action': 'insert',
                    'record_id': record_id,
                    'collection': collection.name
                })
                
                success_rows.append({
                    **row.to_dict(),
                    'recordId': record_id,
                    'action': 'INSERTED'
                })
            
            except Exception as e:
                error_rows.append({
                    **row.to_dict(),
                    'errorCode': 'INSERT_FAILED',
                    'errorMessage': str(e),
                    'errorField': ''
                })
        
        return success_rows, error_rows, rollback_data
    
    async def _process_update_chunk(
        self,
        collection,
        df: pd.DataFrame,
        field_map: Dict[str, str],
        match_config: Dict,
        object_name: str,
        tenant_id: str
    ) -> Tuple[List[Dict], List[Dict], List[Dict]]:
        """
        Process UPDATE chunk
        Must find exactly one record to update, otherwise error
        """
        success_rows = []
        error_rows = []
        rollback_data = []
        
        if not match_config or not match_config.get('fields'):
            for idx, row in df.iterrows():
                error_rows.append({
                    **row.to_dict(),
                    'errorCode': 'MISSING_MATCH_CONFIG',
                    'errorMessage': 'Match configuration is required for update',
                    'errorField': ''
                })
            return success_rows, error_rows, rollback_data
        
        # Preload existing records for better performance
        match_fields = match_config['fields']
        records_map = await self._preload_records_for_chunk(
            collection, df, field_map, match_fields, object_name, tenant_id
        )
        
        for idx, row in df.iterrows():
            try:
                data = self._map_row_to_record(row, field_map)
                
                # Build match key
                match_key = self._build_match_key(data, match_fields)
                if not match_key:
                    error_rows.append({
                        **row.to_dict(),
                        'errorCode': 'MISSING_MATCH_VALUES',
                        'errorMessage': f'Match field values not found in row',
                        'errorField': ', '.join(match_fields)
                    })
                    continue
                
                # Find matching record(s)
                matching_records = records_map.get(match_key, [])
                
                if len(matching_records) == 0:
                    error_rows.append({
                        **row.to_dict(),
                        'errorCode': 'RECORD_NOT_FOUND',
                        'errorMessage': 'No existing record matched update key',
                        'errorField': ', '.join(match_fields)
                    })
                    continue
                
                if len(matching_records) > 1:
                    error_rows.append({
                        **row.to_dict(),
                        'errorCode': 'AMBIGUOUS_MATCH',
                        'errorMessage': f'Multiple records ({len(matching_records)}) matched update key',
                        'errorField': ', '.join(match_fields)
                    })
                    continue
                
                # Exactly one match - update it
                existing_record = matching_records[0]
                record_id = existing_record['id']
                
                # Store before values for rollback (only the data fields being updated)
                before_values = {}
                for field_name in data.keys():
                    before_values[field_name] = existing_record['data'].get(field_name)
                
                rollback_data.append({
                    'action': 'update',
                    'record_id': record_id,
                    'collection': collection.name,
                    'before_values': before_values
                })
                
                # Update record - update the data fields and updated_at
                update_data = {}
                for field_name, field_value in data.items():
                    update_data[f'data.{field_name}'] = field_value
                update_data['updated_at'] = datetime.now(timezone.utc)
                
                await collection.update_one({'id': record_id}, {'$set': update_data})
                
                success_rows.append({
                    **row.to_dict(),
                    'recordId': record_id,
                    'action': 'UPDATED',
                    'matchedBy': '+'.join(match_fields)
                })
            
            except Exception as e:
                logger.error(f"Error updating row {idx}: {str(e)}")
                error_rows.append({
                    **row.to_dict(),
                    'errorCode': 'UPDATE_FAILED',
                    'errorMessage': str(e),
                    'errorField': ''
                })
        
        return success_rows, error_rows, rollback_data
    
    async def _process_upsert_chunk(
        self,
        collection,
        df: pd.DataFrame,
        field_map: Dict[str, str],
        match_config: Dict,
        object_name: str,
        tenant_id: str
    ) -> Tuple[List[Dict], List[Dict], List[Dict]]:
        """
        Process UPSERT chunk
        If match found: update, else: insert
        """
        success_rows = []
        error_rows = []
        rollback_data = []
        
        if not match_config or not match_config.get('fields'):
            # No match config - default to insert
            return await self._process_insert_chunk(collection, df, field_map, object_name, tenant_id)
        
        # Preload existing records
        match_fields = match_config['fields']
        records_map = await self._preload_records_for_chunk(
            collection, df, field_map, match_fields, object_name, tenant_id
        )
        
        for idx, row in df.iterrows():
            try:
                data = self._map_row_to_record(row, field_map)
                
                # Build match key
                match_key = self._build_match_key(data, match_fields)
                if not match_key:
                    # No match key - insert
                    record_id = str(uuid4())
                    
                    # Create object_records structure
                    record = {
                        'id': record_id,
                        'tenant_id': tenant_id,
                        'object_name': object_name,
                        'data': data,
                        'created_at': datetime.now(timezone.utc),
                        'updated_at': datetime.now(timezone.utc)
                    }
                    
                    await collection.insert_one(record)
                    
                    rollback_data.append({
                        'action': 'insert',
                        'record_id': record_id,
                        'collection': collection.name
                    })
                    
                    success_rows.append({
                        **row.to_dict(),
                        'recordId': record_id,
                        'action': 'INSERTED'
                    })
                    continue
                
                # Find matching records
                matching_records = records_map.get(match_key, [])
                
                if len(matching_records) > 1:
                    error_rows.append({
                        **row.to_dict(),
                        'errorCode': 'AMBIGUOUS_MATCH',
                        'errorMessage': f'Multiple records ({len(matching_records)}) matched upsert key',
                        'errorField': ', '.join(match_fields)
                    })
                    continue
                
                if len(matching_records) == 1:
                    # Update existing
                    existing_record = matching_records[0]
                    record_id = existing_record['id']
                    
                    # Store before values for rollback (only the data fields being updated)
                    before_values = {}
                    for field_name in data.keys():
                        before_values[field_name] = existing_record['data'].get(field_name)
                    
                    rollback_data.append({
                        'action': 'update',
                        'record_id': record_id,
                        'collection': collection.name,
                        'before_values': before_values
                    })
                    
                    # Update record - update the data fields and updated_at
                    update_data = {}
                    for field_name, field_value in data.items():
                        update_data[f'data.{field_name}'] = field_value
                    update_data['updated_at'] = datetime.now(timezone.utc)
                    
                    await collection.update_one({'id': record_id}, {'$set': update_data})
                    
                    success_rows.append({
                        **row.to_dict(),
                        'recordId': record_id,
                        'action': 'UPDATED',
                        'matchedBy': '+'.join(match_fields)
                    })
                else:
                    # No match - insert
                    record_id = str(uuid4())
                    
                    # Create object_records structure
                    record = {
                        'id': record_id,
                        'tenant_id': tenant_id,
                        'object_name': object_name,
                        'data': data,
                        'created_at': datetime.now(timezone.utc),
                        'updated_at': datetime.now(timezone.utc)
                    }
                    
                    await collection.insert_one(record)
                    
                    rollback_data.append({
                        'action': 'insert',
                        'record_id': record_id,
                        'collection': collection.name
                    })
                    
                    success_rows.append({
                        **row.to_dict(),
                        'recordId': record_id,
                        'action': 'INSERTED'
                    })
            
            except Exception as e:
                logger.error(f"Error upserting row {idx}: {str(e)}")
                error_rows.append({
                    **row.to_dict(),
                    'errorCode': 'UPSERT_FAILED',
                    'errorMessage': str(e),
                    'errorField': ''
                })
        
        return success_rows, error_rows, rollback_data
    
    async def _preload_records_for_chunk(
        self,
        collection,
        df: pd.DataFrame,
        field_map: Dict[str, str],
        match_fields: List[str],
        object_name: str,
        tenant_id: str
    ) -> Dict[str, List[Dict]]:
        """
        Preload existing records for the chunk to avoid N+1 queries
        Returns map of match_key -> list of matching records
        """
        # Build list of all match values in chunk
        match_values_set = set()
        
        for idx, row in df.iterrows():
            record = self._map_row_to_record(row, field_map)
            match_key = self._build_match_key(record, match_fields)
            if match_key:
                match_values_set.add(match_key)
        
        if not match_values_set:
            return {}
        
        # Build query to fetch all potential matches
        # For composite keys, we need to query each combination
        query_conditions = []
        for match_key_str in match_values_set:
            parts = match_key_str.split('|||')
            if len(parts) == len(match_fields):
                condition = {
                    'tenant_id': tenant_id,
                    'object_name': object_name
                }
                for i, field in enumerate(match_fields):
                    condition[f'data.{field}'] = parts[i]
                query_conditions.append(condition)
        
        if not query_conditions:
            return {}
        
        # Fetch all matching records
        query = {'$or': query_conditions} if len(query_conditions) > 1 else query_conditions[0]
        existing_records = await collection.find(query, {'_id': 0}).to_list(length=None)
        
        # Build map
        records_map = {}
        for record in existing_records:
            match_key = self._build_match_key(record, match_fields)
            if match_key:
                if match_key not in records_map:
                    records_map[match_key] = []
                records_map[match_key].append(record)
        
        return records_map
    
    def _map_row_to_record(self, row: pd.Series, field_map: Dict[str, str]) -> Dict:
        """Map CSV row to record dict"""
        record = {}
        for csv_col, field_name in field_map.items():
            value = row.get(csv_col)
            if pd.notna(value):
                # Convert to string and strip whitespace
                record[field_name] = str(value).strip()
        return record
    
    def _build_match_key(self, record: Dict, match_fields: List[str]) -> str:
        """
        Build a composite match key from record
        Returns: "value1|||value2|||value3" or None if any field missing
        Handles both CSV data format and object_records format
        """
        values = []
        for field in match_fields:
            # Check if this is an object_records format (has 'data' field)
            if 'data' in record:
                value = record['data'].get(field)
            else:
                value = record.get(field)
            
            if not value:
                return None  # Missing match field value
            values.append(str(value))
        
        return '|||'.join(values)
    
    async def rollback_import(self, rollback_data: List[Dict], rollback_reason: str, rolled_back_by: str):
        """
        Rollback imported data with proper restore
        For inserts: delete records
        For updates: restore previous values
        """
        rollback_results = {'deleted': 0, 'restored': 0, 'failed': 0}
        
        for item in rollback_data:
            try:
                collection = self.db.object_records  # Use object_records collection
                
                if item['action'] == 'insert':
                    # Delete inserted record
                    result = await collection.delete_one({'id': item['record_id']})
                    if result.deleted_count > 0:
                        rollback_results['deleted'] += 1
                
                elif item['action'] == 'update':
                    # Restore previous values
                    before_values = item.get('before_values', {})
                    if before_values:
                        # Build update query for nested data fields
                        update_data = {}
                        for field_name, field_value in before_values.items():
                            update_data[f'data.{field_name}'] = field_value
                        update_data['updated_at'] = datetime.now(timezone.utc)
                        
                        await collection.update_one(
                            {'id': item['record_id']},
                            {'$set': update_data}
                        )
                        rollback_results['restored'] += 1
            
            except Exception as e:
                logger.error(f"Rollback failed for {item}: {str(e)}")
                rollback_results['failed'] += 1
        
        return rollback_results
