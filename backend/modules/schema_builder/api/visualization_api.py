"""
Schema Visualization API
========================
Provides a unified read-only view of ALL schema objects and relationships.
This is the single source of truth for Schema Builder visualization.

Combines:
- Standard CRM objects (from tenant_objects)
- Custom Schema Builder objects (from schema_objects)
- All relationships derived from lookup fields

This API is READ-ONLY - no mutations allowed.
"""

from fastapi import APIRouter, Depends, HTTPException
from typing import Dict, Any, List, Optional
from pydantic import BaseModel
import logging

from config.database import db
from modules.auth.api.auth_routes import get_current_user
from shared.models import User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/visualization", tags=["Schema Builder - Visualization"])


class SchemaField(BaseModel):
    """Field representation for visualization"""
    name: str
    label: str
    field_type: str
    is_required: bool = False
    is_system: bool = False
    lookup_object: Optional[str] = None
    picklist_values: Optional[List[str]] = None


class SchemaObjectVisualization(BaseModel):
    """Object representation for ER diagram"""
    id: str
    api_name: str
    label: str
    plural_label: Optional[str] = None
    description: Optional[str] = None
    icon: str = "database"
    is_custom: bool = False
    is_standard: bool = False
    source: str  # 'tenant_objects' or 'schema_objects'
    fields: List[SchemaField] = []
    field_count: int = 0
    lookup_count: int = 0


class SchemaRelationshipVisualization(BaseModel):
    """Relationship representation for ER diagram"""
    id: str
    source_object: str  # API name
    target_object: str  # API name
    source_field: str   # Field that holds the lookup
    relationship_type: str  # 'lookup' or 'master_detail'
    label: str
    is_required: bool = False


class SchemaVisualizationResponse(BaseModel):
    """Complete schema visualization data"""
    objects: List[SchemaObjectVisualization]
    relationships: List[SchemaRelationshipVisualization]
    object_count: int
    relationship_count: int
    standard_object_count: int
    custom_object_count: int


async def require_admin(current_user: User = Depends(get_current_user)) -> User:
    """Dependency to require admin role"""
    if current_user.role_id not in ['system_administrator', 'admin']:
        raise HTTPException(
            status_code=403,
            detail="Only administrators can access Schema Builder"
        )
    return current_user


# Object icon mapping based on type
OBJECT_ICONS = {
    'lead': 'user-plus',
    'contact': 'users',
    'account': 'building',
    'opportunity': 'dollar-sign',
    'task': 'check-square',
    'event': 'calendar',
    'emailmessage': 'mail',
}

# System fields that should be marked as such
SYSTEM_FIELDS = {
    'id', 'tenant_id', 'created_at', 'created_by', 'updated_at', 'updated_by',
    'owner_id', 'is_deleted', '_id', 'series_id'
}

# Standard field types mapping
FIELD_TYPE_MAP = {
    'string': 'text',
    'str': 'text',
    'integer': 'number',
    'int': 'number',
    'float': 'number',
    'decimal': 'currency',
    'boolean': 'checkbox',
    'bool': 'checkbox',
    'datetime': 'datetime',
    'date': 'date',
    'array': 'multipicklist',
    'object': 'lookup',
    'reference': 'lookup',
}


def normalize_field_type(field_type: str) -> str:
    """Normalize field type to standard types"""
    if not field_type:
        return 'text'
    ft = field_type.lower()
    return FIELD_TYPE_MAP.get(ft, ft)


def is_lookup_field(field_name: str, field_def: dict) -> bool:
    """Determine if a field is a lookup/relationship field"""
    # Check explicit type
    if isinstance(field_def, dict):
        ft = field_def.get('type', '').lower()
        if ft in ('lookup', 'reference', 'master_detail'):
            return True
        # Check if field name ends with _id and has lookup_object
        if field_def.get('lookup_object'):
            return True
    
    # Check naming convention
    if field_name.endswith('_id') and field_name not in SYSTEM_FIELDS:
        return True
    
    return False


def get_lookup_target(field_name: str, field_def: dict) -> Optional[str]:
    """Extract the target object for a lookup field"""
    if isinstance(field_def, dict):
        # Explicit lookup_object
        if field_def.get('lookup_object'):
            return field_def['lookup_object']
        # Reference target
        if field_def.get('reference_to'):
            return field_def['reference_to']
    
    # Infer from field name (e.g., account_id -> account)
    if field_name.endswith('_id'):
        return field_name[:-3]  # Remove _id suffix
    
    return None


@router.get("/schema", response_model=SchemaVisualizationResponse)
async def get_full_schema_visualization(
    current_user: User = Depends(require_admin)
):
    """
    Get complete schema visualization data.
    
    Returns ALL objects and their relationships in a format ready for
    ER diagram rendering. This is read-only and purely derived from
    backend metadata.
    
    Objects are sourced from:
    1. tenant_objects - Standard CRM objects
    2. schema_objects - Custom Schema Builder objects
    
    Relationships are derived from:
    1. Explicit relationships (schema_relationships)
    2. Lookup fields (fields with type 'lookup' or ending in '_id')
    """
    tenant_id = current_user.tenant_id
    
    all_objects = []
    all_relationships = []
    object_api_names = set()  # Track all object names for relationship validation
    
    # 1. Get Standard CRM Objects (from tenant_objects)
    tenant_objects = await db.tenant_objects.find(
        {"tenant_id": tenant_id},
        {"_id": 0}
    ).to_list(None)
    
    for obj in tenant_objects:
        api_name = obj.get('object_name', '').lower()
        object_api_names.add(api_name)
        
        # Extract fields
        fields_def = obj.get('fields', {})
        fields = []
        lookup_count = 0
        
        for field_name, field_def in fields_def.items():
            if isinstance(field_def, dict):
                field_type = normalize_field_type(field_def.get('type', 'text'))
                label = field_def.get('label', field_name.replace('_', ' ').title())
                is_required = field_def.get('required', False) or field_def.get('is_required', False)
                lookup_object = None
                
                # Check for lookup
                if is_lookup_field(field_name, field_def):
                    field_type = 'lookup'
                    lookup_object = get_lookup_target(field_name, field_def)
                    lookup_count += 1
                
                fields.append(SchemaField(
                    name=field_name,
                    label=label,
                    field_type=field_type,
                    is_required=is_required,
                    is_system=field_name.lower() in SYSTEM_FIELDS,
                    lookup_object=lookup_object,
                    picklist_values=field_def.get('picklist_values')
                ))
            else:
                # Simple field definition (just type string)
                field_type = normalize_field_type(str(field_def)) if field_def else 'text'
                fields.append(SchemaField(
                    name=field_name,
                    label=field_name.replace('_', ' ').title(),
                    field_type=field_type,
                    is_system=field_name.lower() in SYSTEM_FIELDS
                ))
        
        all_objects.append(SchemaObjectVisualization(
            id=f"tenant_{api_name}",
            api_name=api_name,
            label=obj.get('object_label', api_name.title()) or api_name.title(),
            plural_label=obj.get('object_plural'),
            description=obj.get('description'),
            icon=OBJECT_ICONS.get(api_name) or 'database',
            is_custom=obj.get('is_custom', False),
            is_standard=not obj.get('is_custom', False),
            source='tenant_objects',
            fields=fields,
            field_count=len(fields),
            lookup_count=lookup_count
        ))
    
    # 2. Get Schema Builder Objects (from schema_objects)
    schema_objects = await db.schema_objects.find(
        {"tenant_id": tenant_id, "is_active": True},
        {"_id": 0}
    ).to_list(None)
    
    for obj in schema_objects:
        api_name = obj.get('api_name', '').lower()
        
        # Skip if already added from tenant_objects
        if api_name in object_api_names:
            continue
        
        object_api_names.add(api_name)
        
        # Get fields from schema_fields collection
        schema_fields = await db.schema_fields.find(
            {"tenant_id": tenant_id, "object_id": obj.get('id')},
            {"_id": 0}
        ).to_list(None)
        
        fields = []
        lookup_count = 0
        
        for field in schema_fields:
            field_type = normalize_field_type(field.get('field_type', 'text'))
            lookup_object = field.get('lookup_object')
            
            if field_type == 'lookup' or lookup_object:
                lookup_count += 1
            
            fields.append(SchemaField(
                name=field.get('api_name', ''),
                label=field.get('label', ''),
                field_type=field_type,
                is_required=field.get('is_required', False),
                is_system=field.get('is_system', False),
                lookup_object=lookup_object,
                picklist_values=field.get('picklist_values')
            ))
        
        all_objects.append(SchemaObjectVisualization(
            id=obj.get('id') or f"schema_{api_name}",
            api_name=api_name,
            label=obj.get('label', api_name.title()) or api_name.title(),
            plural_label=obj.get('plural_label'),
            description=obj.get('description'),
            icon=obj.get('icon') or 'database',
            is_custom=True,
            is_standard=False,
            source='schema_objects',
            fields=fields,
            field_count=len(fields),
            lookup_count=lookup_count
        ))
    
    # 3. Build relationships from all lookup fields
    relationship_id = 0
    seen_relationships = set()  # Avoid duplicates
    
    for obj in all_objects:
        for field in obj.fields:
            if field.field_type == 'lookup' and field.lookup_object:
                target = field.lookup_object.lower()
                
                # Only add relationship if target object exists
                if target in object_api_names:
                    rel_key = f"{obj.api_name}:{field.name}:{target}"
                    if rel_key not in seen_relationships:
                        seen_relationships.add(rel_key)
                        relationship_id += 1
                        
                        all_relationships.append(SchemaRelationshipVisualization(
                            id=f"rel_{relationship_id}",
                            source_object=obj.api_name,
                            target_object=target,
                            source_field=field.name,
                            relationship_type='lookup',
                            label=field.label,
                            is_required=field.is_required
                        ))
    
    # 4. Get explicit relationships from schema_relationships
    schema_relationships = await db.schema_relationships.find(
        {"tenant_id": tenant_id, "is_active": {"$ne": False}},
        {"_id": 0}
    ).to_list(None)
    
    for rel in schema_relationships:
        source_obj = await db.schema_objects.find_one(
            {"id": rel.get('source_object_id')},
            {"_id": 0}
        )
        target_obj = await db.schema_objects.find_one(
            {"id": rel.get('target_object_id')},
            {"_id": 0}
        )
        
        if source_obj and target_obj:
            source_name = source_obj.get('api_name', '').lower()
            target_name = target_obj.get('api_name', '').lower()
            rel_key = f"{source_name}:{rel.get('api_name')}:{target_name}"
            
            if rel_key not in seen_relationships and source_name in object_api_names and target_name in object_api_names:
                seen_relationships.add(rel_key)
                relationship_id += 1
                
                all_relationships.append(SchemaRelationshipVisualization(
                    id=f"rel_{relationship_id}",
                    source_object=source_name,
                    target_object=target_name,
                    source_field=rel.get('api_name', ''),
                    relationship_type=rel.get('relationship_type', 'lookup'),
                    label=rel.get('label', ''),
                    is_required=rel.get('is_required', False)
                ))
    
    # Sort objects alphabetically
    all_objects.sort(key=lambda x: x.label.lower())
    
    standard_count = sum(1 for o in all_objects if o.is_standard)
    custom_count = sum(1 for o in all_objects if o.is_custom)
    
    return SchemaVisualizationResponse(
        objects=all_objects,
        relationships=all_relationships,
        object_count=len(all_objects),
        relationship_count=len(all_relationships),
        standard_object_count=standard_count,
        custom_object_count=custom_count
    )


@router.get("/schema/object/{api_name}")
async def get_object_details(
    api_name: str,
    current_user: User = Depends(require_admin)
):
    """
    Get detailed information for a specific object.
    
    Returns all fields, incoming and outgoing relationships.
    """
    tenant_id = current_user.tenant_id
    api_name = api_name.lower()
    
    # Try tenant_objects first
    obj = await db.tenant_objects.find_one(
        {"tenant_id": tenant_id, "object_name": api_name},
        {"_id": 0}
    )
    
    source = 'tenant_objects'
    
    if not obj:
        # Try schema_objects
        obj = await db.schema_objects.find_one(
            {"tenant_id": tenant_id, "api_name": api_name, "is_active": True},
            {"_id": 0}
        )
        source = 'schema_objects'
    
    if not obj:
        raise HTTPException(status_code=404, detail=f"Object '{api_name}' not found")
    
    # Build response
    fields = []
    outgoing_relationships = []
    
    if source == 'tenant_objects':
        fields_def = obj.get('fields', {})
        for field_name, field_def in fields_def.items():
            if isinstance(field_def, dict):
                field_type = normalize_field_type(field_def.get('type', 'text'))
                lookup_object = None
                
                if is_lookup_field(field_name, field_def):
                    field_type = 'lookup'
                    lookup_object = get_lookup_target(field_name, field_def)
                    if lookup_object:
                        outgoing_relationships.append({
                            "field": field_name,
                            "target": lookup_object,
                            "label": field_def.get('label', field_name)
                        })
                
                fields.append({
                    "name": field_name,
                    "label": field_def.get('label', field_name.replace('_', ' ').title()),
                    "type": field_type,
                    "is_required": field_def.get('required', False),
                    "is_system": field_name.lower() in SYSTEM_FIELDS,
                    "lookup_object": lookup_object
                })
    else:
        # Schema Builder object
        schema_fields = await db.schema_fields.find(
            {"tenant_id": tenant_id, "object_id": obj.get('id')},
            {"_id": 0}
        ).to_list(None)
        
        for field in schema_fields:
            lookup_object = field.get('lookup_object')
            if lookup_object:
                outgoing_relationships.append({
                    "field": field.get('api_name'),
                    "target": lookup_object,
                    "label": field.get('label', '')
                })
            
            fields.append({
                "name": field.get('api_name'),
                "label": field.get('label'),
                "type": normalize_field_type(field.get('field_type', 'text')),
                "is_required": field.get('is_required', False),
                "is_system": field.get('is_system', False),
                "lookup_object": lookup_object
            })
    
    # Find incoming relationships (other objects that point to this one)
    incoming_relationships = []
    
    # Check tenant_objects
    tenant_objects = await db.tenant_objects.find(
        {"tenant_id": tenant_id},
        {"_id": 0}
    ).to_list(None)
    
    for other_obj in tenant_objects:
        other_name = other_obj.get('object_name', '').lower()
        if other_name == api_name:
            continue
        
        for field_name, field_def in other_obj.get('fields', {}).items():
            if isinstance(field_def, dict) and is_lookup_field(field_name, field_def):
                target = get_lookup_target(field_name, field_def)
                if target and target.lower() == api_name:
                    incoming_relationships.append({
                        "source_object": other_name,
                        "field": field_name,
                        "label": field_def.get('label', field_name)
                    })
    
    return {
        "api_name": api_name,
        "label": obj.get('label') or obj.get('object_label') or api_name.title(),
        "plural_label": obj.get('plural_label') or obj.get('object_plural'),
        "description": obj.get('description'),
        "icon": OBJECT_ICONS.get(api_name, 'database'),
        "is_custom": obj.get('is_custom', source == 'schema_objects'),
        "source": source,
        "fields": fields,
        "field_count": len(fields),
        "outgoing_relationships": outgoing_relationships,
        "incoming_relationships": incoming_relationships
    }
