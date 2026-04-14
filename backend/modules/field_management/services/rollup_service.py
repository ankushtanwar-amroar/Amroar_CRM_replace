"""Rollup Field Service - Handles rollup field operations and calculations"""
from motor.motor_asyncio import AsyncIOMotorDatabase
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
import re
import asyncio
import logging

from ..models.rollup_field import (
    RollupFieldConfig, RollupFieldCreate, RollupFieldUpdate,
    RollupType, RollupFilter, FilterOperator, PostCalculationFormula
)
from ..models.base import FieldType

logger = logging.getLogger(__name__)


class RollupFieldService:
    """Service for managing rollup fields and calculations"""
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.collection = db.advanced_fields
    
    def _generate_api_key(self, label: str) -> str:
        """Generate API key from label"""
        api_key = re.sub(r'[^a-zA-Z0-9\s]', '', label.lower())
        api_key = re.sub(r'\s+', '_', api_key)
        return api_key
    
    async def create_rollup_field(
        self,
        object_name: str,
        tenant_id: str,
        field_data: RollupFieldCreate,
        created_by: Optional[str] = None
    ) -> RollupFieldConfig:
        """Create a new rollup field"""
        
        # Generate API key if not provided
        api_key = field_data.api_key or self._generate_api_key(field_data.label)
        
        # Check if API key already exists
        existing = await self.collection.find_one({
            "object_name": object_name,
            "tenant_id": tenant_id,
            "api_key": api_key
        })
        if existing:
            raise ValueError(f"Field with API key '{api_key}' already exists")
        
        # Validate child object exists
        child_object = await self.db.tenant_objects.find_one({
            "object_name": field_data.child_object,
            "tenant_id": tenant_id
        })
        if not child_object:
            raise ValueError(f"Child object '{field_data.child_object}' not found")
        
        # Validate summarize_field for SUM, MIN, MAX
        if field_data.rollup_type in [RollupType.SUM, RollupType.MIN, RollupType.MAX]:
            if not field_data.summarize_field:
                raise ValueError(f"{field_data.rollup_type.value} requires a summarize_field")
        
        # Create rollup field config
        rollup_field = RollupFieldConfig(
            label=field_data.label,
            api_key=api_key,
            description=field_data.description,
            help_text=field_data.help_text,
            object_name=object_name,
            tenant_id=tenant_id,
            result_type=field_data.result_type,
            decimal_places=field_data.decimal_places,
            currency_symbol=field_data.currency_symbol,
            child_object=field_data.child_object,
            relationship_field=field_data.relationship_field,
            rollup_type=field_data.rollup_type,
            summarize_field=field_data.summarize_field,
            filter_config=field_data.filter_config or RollupFilter(),
            post_formula=field_data.post_formula or PostCalculationFormula(),
            recalculation_mode=field_data.recalculation_mode,
            layout_assignments=field_data.layout_assignments,
            add_to_all_layouts=field_data.add_to_all_layouts,
            created_by=created_by
        )
        
        # Save to database
        await self.collection.insert_one(rollup_field.model_dump())
        
        # Trigger initial calculation for all parent records
        asyncio.create_task(self._recalculate_all_parents(rollup_field))
        
        return rollup_field
    
    async def get_rollup_field(
        self,
        field_id: str,
        tenant_id: str
    ) -> Optional[RollupFieldConfig]:
        """Get rollup field by ID"""
        field = await self.collection.find_one({
            "id": field_id,
            "tenant_id": tenant_id,
            "field_type": FieldType.ROLLUP.value
        }, {"_id": 0})
        
        if field:
            return RollupFieldConfig(**field)
        return None
    
    async def list_rollup_fields(
        self,
        object_name: str,
        tenant_id: str
    ) -> List[RollupFieldConfig]:
        """List all rollup fields for an object"""
        cursor = self.collection.find({
            "object_name": object_name,
            "tenant_id": tenant_id,
            "field_type": FieldType.ROLLUP.value,
            "is_active": True
        }, {"_id": 0})
        
        fields = await cursor.to_list(length=100)
        return [RollupFieldConfig(**f) for f in fields]
    
    async def update_rollup_field(
        self,
        field_id: str,
        tenant_id: str,
        update_data: RollupFieldUpdate,
        updated_by: Optional[str] = None
    ) -> Optional[RollupFieldConfig]:
        """Update a rollup field"""
        update_dict = update_data.model_dump(exclude_unset=True)
        update_dict["updated_at"] = datetime.now(timezone.utc)
        if updated_by:
            update_dict["updated_by"] = updated_by
        
        result = await self.collection.update_one(
            {
                "id": field_id,
                "tenant_id": tenant_id,
                "field_type": FieldType.ROLLUP.value
            },
            {"$set": update_dict}
        )
        
        if result.modified_count > 0:
            rollup = await self.get_rollup_field(field_id, tenant_id)
            if rollup:
                # Trigger recalculation on update
                asyncio.create_task(self._recalculate_all_parents(rollup))
            return rollup
        return None
    
    async def delete_rollup_field(
        self,
        field_id: str,
        tenant_id: str
    ) -> bool:
        """Soft delete a rollup field"""
        result = await self.collection.update_one(
            {
                "id": field_id,
                "tenant_id": tenant_id,
                "field_type": FieldType.ROLLUP.value
            },
            {"$set": {"is_active": False, "updated_at": datetime.now(timezone.utc)}}
        )
        return result.modified_count > 0
    
    async def calculate_rollup(
        self,
        rollup_field: RollupFieldConfig,
        parent_id: str
    ) -> Any:
        """Calculate rollup value for a specific parent record"""
        
        # All records are stored in 'object_records' collection with object_name field
        # Build base match query - check both root level and data.field for relationship
        match_query = {
            "object_name": rollup_field.child_object,
            "$or": [
                {rollup_field.relationship_field: parent_id},
                {f"data.{rollup_field.relationship_field}": parent_id}
            ],
            "tenant_id": rollup_field.tenant_id
        }
        
        # Check if we need formula-based filtering
        use_formula_filter = (
            rollup_field.filter_config and 
            rollup_field.filter_config.is_enabled and
            rollup_field.filter_config.use_formula and
            rollup_field.filter_config.formula
        )
        
        # Get parent data if needed for parent field references in filter
        parent_data = None
        if use_formula_filter and rollup_field.filter_config.parent_field_refs:
            parent_data = await self._get_parent_data_for_filter(
                rollup_field.object_name,
                parent_id,
                rollup_field.tenant_id,
                rollup_field.filter_config.parent_field_refs
            )
        
        if use_formula_filter:
            # Formula-based filtering: fetch records and filter in Python
            rollup_value = await self._calculate_with_formula_filter(
                rollup_field, parent_id, parent_data
            )
        else:
            # Standard MongoDB-based filtering
            if rollup_field.filter_config and rollup_field.filter_config.is_enabled:
                filter_query = self._build_filter_query(rollup_field.filter_config)
                match_query.update(filter_query)
            
            # Build aggregation pipeline
            pipeline = [{"$match": match_query}]
            
            # For SUM/MIN/MAX/AVG, the field might be in data.field
            summarize_field_path = f"data.{rollup_field.summarize_field}"
            
            if rollup_field.rollup_type == RollupType.COUNT:
                pipeline.append({"$count": "result"})
            elif rollup_field.rollup_type == RollupType.SUM:
                # Try to convert string values to numbers for SUM
                pipeline.append({
                    "$addFields": {
                        "numeric_value": {
                            "$cond": {
                                "if": {"$isNumber": f"${summarize_field_path}"},
                                "then": f"${summarize_field_path}",
                                "else": {"$toDouble": {"$ifNull": [f"${summarize_field_path}", 0]}}
                            }
                        }
                    }
                })
                pipeline.append({
                    "$group": {
                        "_id": None,
                        "result": {"$sum": "$numeric_value"}
                    }
                })
            elif rollup_field.rollup_type == RollupType.MIN:
                pipeline.append({
                    "$addFields": {
                        "numeric_value": {
                            "$cond": {
                                "if": {"$isNumber": f"${summarize_field_path}"},
                                "then": f"${summarize_field_path}",
                                "else": {"$toDouble": {"$ifNull": [f"${summarize_field_path}", 0]}}
                            }
                        }
                    }
                })
                pipeline.append({
                    "$group": {
                        "_id": None,
                        "result": {"$min": "$numeric_value"}
                    }
                })
            elif rollup_field.rollup_type == RollupType.MAX:
                pipeline.append({
                    "$addFields": {
                        "numeric_value": {
                            "$cond": {
                                "if": {"$isNumber": f"${summarize_field_path}"},
                                "then": f"${summarize_field_path}",
                                "else": {"$toDouble": {"$ifNull": [f"${summarize_field_path}", 0]}}
                            }
                        }
                    }
                })
                pipeline.append({
                    "$group": {
                        "_id": None,
                        "result": {"$max": "$numeric_value"}
                    }
                })
            elif rollup_field.rollup_type == RollupType.AVERAGE:
                pipeline.append({
                    "$addFields": {
                        "numeric_value": {
                            "$cond": {
                                "if": {"$isNumber": f"${summarize_field_path}"},
                                "then": f"${summarize_field_path}",
                                "else": {"$toDouble": {"$ifNull": [f"${summarize_field_path}", 0]}}
                            }
                        }
                    }
                })
                pipeline.append({
                    "$group": {
                        "_id": None,
                        "result": {"$avg": "$numeric_value"}
                    }
                })
            
            # Execute aggregation on object_records collection
            cursor = self.db.object_records.aggregate(pipeline)
            results = await cursor.to_list(length=1)
            
            # Get result
            rollup_value = 0
            if results and "result" in results[0]:
                rollup_value = results[0]["result"] or 0
            
            # Round AVERAGE to appropriate precision
            if rollup_field.rollup_type == RollupType.AVERAGE and rollup_value:
                rollup_value = round(rollup_value, rollup_field.decimal_places)
        
        # Apply post-calculation formula
        if rollup_field.post_formula and rollup_field.post_formula.is_enabled:
            rollup_value = await self._apply_post_formula(
                rollup_value,
                rollup_field.post_formula.expression,
                rollup_field.object_name,
                parent_id,
                rollup_field.tenant_id
            )
        
        return rollup_value
    
    async def _calculate_with_formula_filter(
        self,
        rollup_field: RollupFieldConfig,
        parent_id: str,
        parent_data: Optional[Dict[str, Any]] = None
    ) -> Any:
        """Calculate rollup using formula-based filtering"""
        from .rollup_formula_evaluator import formula_evaluator
        
        child_collection = f"{rollup_field.child_object}s"
        
        # Get all child records for this parent
        cursor = self.db[child_collection].find({
            rollup_field.relationship_field: parent_id,
            "tenant_id": rollup_field.tenant_id
        }, {"_id": 0})
        
        records = await cursor.to_list(length=10000)  # Limit for safety
        
        # Filter records using formula
        formula = rollup_field.filter_config.formula
        filtered_records = []
        
        for record in records:
            record_data = record.get("data", record)  # Handle both flat and nested data
            if formula_evaluator.evaluate(formula, record_data, parent_data):
                filtered_records.append(record)
        
        # Calculate rollup on filtered records
        if rollup_field.rollup_type == RollupType.COUNT:
            return len(filtered_records)
        
        if not filtered_records:
            return 0
        
        # Extract values for aggregation
        summarize_field = rollup_field.summarize_field
        values = []
        for record in filtered_records:
            record_data = record.get("data", record)
            val = record_data.get(summarize_field)
            if val is not None:
                try:
                    values.append(float(val))
                except (ValueError, TypeError):
                    pass
        
        if not values:
            return 0
        
        if rollup_field.rollup_type == RollupType.SUM:
            return sum(values)
        elif rollup_field.rollup_type == RollupType.MIN:
            return min(values)
        elif rollup_field.rollup_type == RollupType.MAX:
            return max(values)
        elif rollup_field.rollup_type == RollupType.AVERAGE:
            avg = sum(values) / len(values)
            return round(avg, rollup_field.decimal_places)
        
        return 0
    
    async def _get_parent_data_for_filter(
        self,
        parent_object: str,
        parent_id: str,
        tenant_id: str,
        parent_field_refs: List[str]
    ) -> Dict[str, Any]:
        """
        Get parent record data for use in filter formulas.
        Resolves nested parent references like "Account.Industry".
        """
        parent_collection = f"{parent_object}s"
        
        # Get the immediate parent record
        parent_record = await self.db[parent_collection].find_one(
            {"id": parent_id, "tenant_id": tenant_id},
            {"_id": 0}
        )
        
        if not parent_record:
            return {}
        
        result = {}
        parent_record_data = parent_record.get("data", parent_record)
        
        # Add direct parent fields
        for ref in parent_field_refs:
            if '.' in ref:
                # Nested reference like "Account.Industry"
                parts = ref.split('.', 1)
                lookup_field = parts[0].lower()
                remaining_path = parts[1]
                
                # Get the lookup ID from parent record
                lookup_id = parent_record_data.get(f"{lookup_field}_id") or \
                           parent_record_data.get(lookup_field)
                
                if lookup_id:
                    # Fetch the related record
                    related_collection = f"{lookup_field}s"
                    related_record = await self.db[related_collection].find_one(
                        {"id": lookup_id, "tenant_id": tenant_id},
                        {"_id": 0}
                    )
                    if related_record:
                        related_data = related_record.get("data", related_record)
                        # Store with the full path as key
                        field_name = remaining_path.split('.')[0]
                        result[ref] = related_data.get(field_name)
                        # Also store under the parent prefix for nested access
                        if parts[0] not in result:
                            result[parts[0]] = {}
                        if isinstance(result[parts[0]], dict):
                            result[parts[0]][remaining_path] = related_data.get(field_name)
            else:
                # Direct parent field
                result[ref] = parent_record_data.get(ref)
        
        return result

    
    async def _apply_post_formula(
        self,
        rollup_value: Any,
        expression: str,
        parent_object: str,
        parent_id: str,
        tenant_id: str
    ) -> Any:
        """Apply post-calculation formula to rollup value"""
        if not expression:
            return rollup_value
        
        # Get parent record for PARENT.field references
        parent_collection = f"{parent_object}s"
        parent_record = await self.db[parent_collection].find_one(
            {"id": parent_id, "tenant_id": tenant_id},
            {"_id": 0}
        )
        
        # Replace variables in expression
        formula = expression.replace("ROLLUP_VALUE", str(rollup_value))
        
        # Replace PARENT.field references
        import re
        parent_refs = re.findall(r'PARENT\.([a-zA-Z_]+)', formula)
        for field in parent_refs:
            value = parent_record.get(field, 0) if parent_record else 0
            formula = formula.replace(f"PARENT.{field}", str(value))
        
        # Safely evaluate the expression
        try:
            # Only allow basic math operations
            allowed_chars = set('0123456789.+-*/() ')
            if all(c in allowed_chars for c in formula):
                result = eval(formula)
                return result
        except Exception:
            pass
        
        return rollup_value
    
    def _build_filter_query(self, filter_config: RollupFilter) -> Dict[str, Any]:
        """Build MongoDB query from rollup filter config"""
        if not filter_config.rules:
            return {}
        
        conditions = []
        for rule in filter_config.rules:
            field = rule.field
            value = rule.value
            operator = rule.operator
            
            if operator == FilterOperator.EQUALS:
                conditions.append({field: value})
            elif operator == FilterOperator.NOT_EQUALS:
                conditions.append({field: {"$ne": value}})
            elif operator == FilterOperator.CONTAINS:
                conditions.append({field: {"$regex": value, "$options": "i"}})
            elif operator == FilterOperator.GREATER_THAN:
                conditions.append({field: {"$gt": value}})
            elif operator == FilterOperator.LESS_THAN:
                conditions.append({field: {"$lt": value}})
            elif operator == FilterOperator.GREATER_OR_EQUAL:
                conditions.append({field: {"$gte": value}})
            elif operator == FilterOperator.LESS_OR_EQUAL:
                conditions.append({field: {"$lte": value}})
            elif operator == FilterOperator.IN:
                conditions.append({field: {"$in": value if isinstance(value, list) else [value]}})
            elif operator == FilterOperator.IS_NULL:
                conditions.append({field: None})
            elif operator == FilterOperator.IS_NOT_NULL:
                conditions.append({field: {"$ne": None}})
        
        if not conditions:
            return {}
        
        if filter_config.logic.upper() == "OR":
            return {"$or": conditions}
        return {"$and": conditions}
    
    async def _recalculate_all_parents(self, rollup_field: RollupFieldConfig):
        """Recalculate rollup for all parent records"""
        # All records are in object_records collection with object_name field
        logger.info(f"Recalculating all parents for {rollup_field.api_key} (object_name: {rollup_field.object_name})")
        logger.info(f"Tenant ID: {rollup_field.tenant_id}")
        
        # Get all parent records of the specified object type
        query = {
            "tenant_id": rollup_field.tenant_id,
            "object_name": rollup_field.object_name
        }
        logger.info(f"Query: {query}")
        
        cursor = self.db.object_records.find(
            query,
            {"id": 1, "_id": 0}
        )
        
        count = 0
        async for parent in cursor:
            count += 1
            logger.info(f"Recalculating rollup for parent {parent['id']}")
            await self.update_parent_rollup(rollup_field, parent["id"])
        
        logger.info(f"Recalculated rollup for {count} parent records")
    
    async def update_parent_rollup(
        self,
        rollup_field: RollupFieldConfig,
        parent_id: str
    ):
        """Update rollup value on parent record"""
        value = await self.calculate_rollup(rollup_field, parent_id)
        
        # All records are stored in a single 'object_records' collection with object_type field
        # NOT in separate collections like 'accounts', 'leads', etc.
        await self.db.object_records.update_one(
            {"id": parent_id, "tenant_id": rollup_field.tenant_id},
            {
                "$set": {
                    f"data.{rollup_field.api_key}": value,
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }
            }
        )
        logger.info(f"Updated rollup {rollup_field.api_key}={value} for parent {parent_id}")
    
    async def on_child_change(
        self,
        child_object: str,
        child_record: Dict[str, Any],
        tenant_id: str,
        old_record: Optional[Dict[str, Any]] = None
    ):
        """Handle child record create/update/delete - trigger rollup recalculation"""
        
        # Find all rollup fields that reference this child object
        cursor = self.collection.find({
            "tenant_id": tenant_id,
            "field_type": FieldType.ROLLUP.value,
            "child_object": child_object,
            "is_active": True
        }, {"_id": 0})
        
        async for field_doc in cursor:
            rollup_field = RollupFieldConfig(**field_doc)
            relationship_field = rollup_field.relationship_field
            
            # Get parent IDs that need recalculation
            parent_ids = set()
            
            # Current parent
            if child_record and child_record.get(relationship_field):
                parent_ids.add(child_record[relationship_field])
            
            # Old parent (if relationship changed)
            if old_record and old_record.get(relationship_field):
                parent_ids.add(old_record[relationship_field])
            
            # Recalculate for affected parents
            for parent_id in parent_ids:
                if rollup_field.recalculation_mode == "async":
                    asyncio.create_task(self.update_parent_rollup(rollup_field, parent_id))
                else:
                    await self.update_parent_rollup(rollup_field, parent_id)
