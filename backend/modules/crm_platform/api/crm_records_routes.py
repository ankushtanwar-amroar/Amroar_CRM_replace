"""
Generic CRM Records Routes
Provides simplified /api/crm/{object} endpoints for CRUD operations
Used by Screen Flow Runner for record manipulation
"""
from fastapi import APIRouter, HTTPException, Query, Request
from motor.motor_asyncio import AsyncIOMotorClient
from typing import Dict, Any, List, Optional
from pydantic import BaseModel
import os
from datetime import datetime, timezone
from bson import ObjectId
import uuid

# Database setup
mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
mongo_client = AsyncIOMotorClient(mongo_url)
db_name = os.environ.get('DB_NAME', 'crm_db')
db = mongo_client[db_name]

router = APIRouter(prefix="/api/crm", tags=["CRM Records"])

# Object type to collection mapping
OBJECT_COLLECTION_MAP = {
    'lead': 'leads',
    'leads': 'leads',
    'contact': 'contacts',
    'contacts': 'contacts',
    'account': 'accounts',
    'accounts': 'accounts',
    'opportunity': 'opportunities',
    'opportunities': 'opportunities',
    'case': 'cases',
    'cases': 'cases',
    'task': 'tasks',
    'tasks': 'tasks',
    'event': 'events',
    'events': 'events',
}

def get_collection_name(object_type: str) -> str:
    """Get MongoDB collection name for object type"""
    normalized = object_type.lower().strip()
    return OBJECT_COLLECTION_MAP.get(normalized, f"{normalized}s")

def serialize_record(record: dict) -> dict:
    """Serialize MongoDB record for JSON response"""
    if not record:
        return None
    result = {k: v for k, v in record.items() if k != '_id'}
    if '_id' in record:
        result['id'] = str(record['_id'])
    return result


class BulkUpdateRequest(BaseModel):
    """Request model for bulk update"""
    record_ids: List[str]
    updates: Dict[str, Any]


class BulkUpdateRecordsRequest(BaseModel):
    """Request model for bulk update with per-record updates"""
    records: List[Dict[str, Any]]  # Each record should have 'id' and update fields


@router.get("/{object_type}")
async def list_records(
    object_type: str,
    limit: int = Query(50, le=500),
    skip: int = Query(0, ge=0),
    filter: Optional[str] = None
):
    """List records for an object type"""
    collection_name = get_collection_name(object_type)
    collection = db[collection_name]
    
    query = {}
    if filter:
        # Simple filter support - extend as needed
        pass
    
    cursor = collection.find(query).skip(skip).limit(limit)
    records = []
    async for record in cursor:
        records.append(serialize_record(record))
    
    total = await collection.count_documents(query)
    
    return {
        "records": records,
        "total": total,
        "limit": limit,
        "skip": skip,
        "object_type": object_type
    }


@router.get("/{object_type}/{record_id}")
async def get_record(object_type: str, record_id: str):
    """Get a specific record"""
    collection_name = get_collection_name(object_type)
    collection = db[collection_name]
    
    # Try to find by _id (ObjectId) or by id field
    record = None
    try:
        record = await collection.find_one({"_id": ObjectId(record_id)})
    except Exception:
        pass
    
    if not record:
        record = await collection.find_one({"id": record_id})
    
    if not record:
        raise HTTPException(status_code=404, detail=f"{object_type} record not found")
    
    return serialize_record(record)


@router.post("/{object_type}")
async def create_record(object_type: str, request: Request):
    """Create a new record"""
    collection_name = get_collection_name(object_type)
    collection = db[collection_name]
    
    data = await request.json()
    
    # Add metadata
    data['id'] = str(uuid.uuid4())
    data['created_at'] = datetime.now(timezone.utc).isoformat()
    data['updated_at'] = datetime.now(timezone.utc).isoformat()
    data['object_type'] = object_type
    
    result = await collection.insert_one(data)
    
    # Return created record without _id
    created = await collection.find_one({"_id": result.inserted_id})
    return serialize_record(created)


@router.patch("/{object_type}/{record_id}")
async def update_record(object_type: str, record_id: str, request: Request):
    """Update a specific record"""
    collection_name = get_collection_name(object_type)
    collection = db[collection_name]
    
    data = await request.json()
    
    # Remove id from updates if present
    data.pop('id', None)
    data.pop('_id', None)
    
    # Add updated timestamp
    data['updated_at'] = datetime.now(timezone.utc).isoformat()
    
    # Try to update by _id (ObjectId) or by id field
    result = None
    try:
        result = await collection.find_one_and_update(
            {"_id": ObjectId(record_id)},
            {"$set": data},
            return_document=True
        )
    except Exception:
        pass
    
    if not result:
        result = await collection.find_one_and_update(
            {"id": record_id},
            {"$set": data},
            return_document=True
        )
    
    if not result:
        raise HTTPException(status_code=404, detail=f"{object_type} record not found")
    
    return serialize_record(result)


@router.delete("/{object_type}/{record_id}")
async def delete_record(object_type: str, record_id: str):
    """Delete a specific record"""
    collection_name = get_collection_name(object_type)
    collection = db[collection_name]
    
    # Try to delete by _id (ObjectId) or by id field
    result = None
    try:
        result = await collection.delete_one({"_id": ObjectId(record_id)})
    except Exception:
        pass
    
    if not result or result.deleted_count == 0:
        result = await collection.delete_one({"id": record_id})
    
    if not result or result.deleted_count == 0:
        raise HTTPException(status_code=404, detail=f"{object_type} record not found")
    
    return {"success": True, "deleted_id": record_id}


@router.post("/{object_type}/bulk-update")
async def bulk_update_records(object_type: str, request: BulkUpdateRequest):
    """Bulk update multiple records with the same updates (C4/C5 support)"""
    collection_name = get_collection_name(object_type)
    collection = db[collection_name]
    
    updates = request.updates.copy()
    updates.pop('id', None)
    updates.pop('_id', None)
    updates['updated_at'] = datetime.now(timezone.utc).isoformat()
    
    updated_count = 0
    errors = []
    
    for record_id in request.record_ids:
        try:
            # Try ObjectId first
            result = None
            try:
                result = await collection.update_one(
                    {"_id": ObjectId(record_id)},
                    {"$set": updates}
                )
            except Exception:
                pass
            
            if not result or result.modified_count == 0:
                result = await collection.update_one(
                    {"id": record_id},
                    {"$set": updates}
                )
            
            if result and result.modified_count > 0:
                updated_count += 1
            else:
                errors.append({"id": record_id, "error": "Record not found"})
        except Exception as e:
            errors.append({"id": record_id, "error": str(e)})
    
    return {
        "success": True,
        "updated_count": updated_count,
        "total_requested": len(request.record_ids),
        "errors": errors if errors else None
    }


@router.post("/{object_type}/bulk-update-records")
async def bulk_update_individual_records(object_type: str, request: BulkUpdateRecordsRequest):
    """Bulk update multiple records with individual updates (for editable tables)"""
    collection_name = get_collection_name(object_type)
    collection = db[collection_name]
    
    updated_count = 0
    errors = []
    
    for record_data in request.records:
        record_id = record_data.get('id')
        if not record_id:
            errors.append({"record": record_data, "error": "Missing record id"})
            continue
        
        updates = {k: v for k, v in record_data.items() if k not in ['id', '_id']}
        updates['updated_at'] = datetime.now(timezone.utc).isoformat()
        
        try:
            result = None
            try:
                result = await collection.update_one(
                    {"_id": ObjectId(record_id)},
                    {"$set": updates}
                )
            except Exception:
                pass
            
            if not result or result.modified_count == 0:
                result = await collection.update_one(
                    {"id": record_id},
                    {"$set": updates}
                )
            
            if result and result.modified_count > 0:
                updated_count += 1
            else:
                errors.append({"id": record_id, "error": "Record not found or no changes"})
        except Exception as e:
            errors.append({"id": record_id, "error": str(e)})
    
    return {
        "success": True,
        "updated_count": updated_count,
        "total_requested": len(request.records),
        "errors": errors if errors else None
    }


@router.post("/{object_type}/get-by-ids")
async def get_records_by_ids(object_type: str, request: Request):
    """Get multiple records by their IDs (C5 support)"""
    collection_name = get_collection_name(object_type)
    collection = db[collection_name]
    
    data = await request.json()
    record_ids = data.get('ids', [])
    
    if not record_ids:
        return {"records": []}
    
    records = []
    for record_id in record_ids:
        record = None
        try:
            record = await collection.find_one({"_id": ObjectId(record_id)})
        except Exception:
            pass
        
        if not record:
            record = await collection.find_one({"id": record_id})
        
        if record:
            records.append(serialize_record(record))
    
    return {"records": records, "found": len(records), "requested": len(record_ids)}
