"""
Stage Definition Service
Business logic for stage/status metadata management.
"""
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
import logging
import re

from config.database import db
from ..models.stage_definition_model import (
    StageDefinition,
    StageDefinitionCreate,
    StageDefinitionUpdate,
    ForecastCategory
)

logger = logging.getLogger(__name__)


# Default Stage Definitions
# These are seeded for new tenants and serve as the baseline configuration

DEFAULT_LEAD_STAGES = [
    {
        "stage_name": "New",
        "stage_api_name": "new",
        "probability_percent": 10,
        "is_closed_won": False,
        "is_closed_lost": False,
        "forecast_category": ForecastCategory.PIPELINE,
        "sort_order": 1,
        "description": "New lead, not yet contacted",
        "color": "#3B82F6",  # Blue
        "is_system": True
    },
    {
        "stage_name": "Contacted",
        "stage_api_name": "contacted",
        "probability_percent": 20,
        "is_closed_won": False,
        "is_closed_lost": False,
        "forecast_category": ForecastCategory.PIPELINE,
        "sort_order": 2,
        "description": "Initial contact made",
        "color": "#8B5CF6",  # Purple
        "is_system": True
    },
    {
        "stage_name": "Working",
        "stage_api_name": "working",
        "probability_percent": 40,
        "is_closed_won": False,
        "is_closed_lost": False,
        "forecast_category": ForecastCategory.PIPELINE,
        "sort_order": 3,
        "description": "Actively working the lead",
        "color": "#F59E0B",  # Amber
        "is_system": True
    },
    {
        "stage_name": "Qualified",
        "stage_api_name": "qualified",
        "probability_percent": 60,
        "is_closed_won": False,
        "is_closed_lost": False,
        "forecast_category": ForecastCategory.BEST_CASE,
        "sort_order": 4,
        "description": "Lead is qualified and ready for conversion",
        "color": "#10B981",  # Green
        "is_system": True
    },
    {
        "stage_name": "Unqualified",
        "stage_api_name": "unqualified",
        "probability_percent": 0,
        "is_closed_won": False,
        "is_closed_lost": True,
        "forecast_category": ForecastCategory.OMITTED,
        "sort_order": 5,
        "description": "Lead does not meet qualification criteria",
        "color": "#EF4444",  # Red
        "is_system": True
    },
    {
        "stage_name": "Converted",
        "stage_api_name": "converted",
        "probability_percent": 100,
        "is_closed_won": True,
        "is_closed_lost": False,
        "forecast_category": ForecastCategory.CLOSED,
        "sort_order": 6,
        "description": "Lead converted to Account/Contact/Opportunity",
        "color": "#059669",  # Emerald
        "is_system": True
    }
]

DEFAULT_OPPORTUNITY_STAGES = [
    {
        "stage_name": "Prospecting",
        "stage_api_name": "prospecting",
        "probability_percent": 10,
        "is_closed_won": False,
        "is_closed_lost": False,
        "forecast_category": ForecastCategory.PIPELINE,
        "sort_order": 1,
        "description": "Initial prospecting phase",
        "color": "#3B82F6",  # Blue
        "is_system": True
    },
    {
        "stage_name": "Qualification",
        "stage_api_name": "qualification",
        "probability_percent": 20,
        "is_closed_won": False,
        "is_closed_lost": False,
        "forecast_category": ForecastCategory.PIPELINE,
        "sort_order": 2,
        "description": "Qualifying the opportunity",
        "color": "#6366F1",  # Indigo
        "is_system": True
    },
    {
        "stage_name": "Needs Analysis",
        "stage_api_name": "needs_analysis",
        "probability_percent": 30,
        "is_closed_won": False,
        "is_closed_lost": False,
        "forecast_category": ForecastCategory.PIPELINE,
        "sort_order": 3,
        "description": "Analyzing customer needs",
        "color": "#8B5CF6",  # Purple
        "is_system": True
    },
    {
        "stage_name": "Value Proposition",
        "stage_api_name": "value_proposition",
        "probability_percent": 40,
        "is_closed_won": False,
        "is_closed_lost": False,
        "forecast_category": ForecastCategory.PIPELINE,
        "sort_order": 4,
        "description": "Presenting value proposition",
        "color": "#A855F7",  # Violet
        "is_system": True
    },
    {
        "stage_name": "Proposal",
        "stage_api_name": "proposal",
        "probability_percent": 50,
        "is_closed_won": False,
        "is_closed_lost": False,
        "forecast_category": ForecastCategory.BEST_CASE,
        "sort_order": 5,
        "description": "Proposal submitted",
        "color": "#F59E0B",  # Amber
        "is_system": True
    },
    {
        "stage_name": "Negotiation",
        "stage_api_name": "negotiation",
        "probability_percent": 70,
        "is_closed_won": False,
        "is_closed_lost": False,
        "forecast_category": ForecastCategory.COMMIT,
        "sort_order": 6,
        "description": "In contract negotiation",
        "color": "#F97316",  # Orange
        "is_system": True
    },
    {
        "stage_name": "Closed Won",
        "stage_api_name": "closed_won",
        "probability_percent": 100,
        "is_closed_won": True,
        "is_closed_lost": False,
        "forecast_category": ForecastCategory.CLOSED,
        "sort_order": 7,
        "description": "Deal closed successfully",
        "color": "#10B981",  # Green
        "is_system": True
    },
    {
        "stage_name": "Closed Lost",
        "stage_api_name": "closed_lost",
        "probability_percent": 0,
        "is_closed_won": False,
        "is_closed_lost": True,
        "forecast_category": ForecastCategory.OMITTED,
        "sort_order": 8,
        "description": "Deal lost",
        "color": "#EF4444",  # Red
        "is_system": True
    }
]


class StageDefinitionService:
    """Service for managing stage definitions"""
    
    def __init__(self):
        self.collection = db.stage_definitions
    
    def _to_api_name(self, name: str) -> str:
        """Convert stage name to API-safe name"""
        # Convert to lowercase, replace spaces with underscores
        api_name = name.lower().strip()
        api_name = re.sub(r'[^a-z0-9]+', '_', api_name)
        api_name = api_name.strip('_')
        return api_name
    
    async def get_stages_for_object(
        self,
        tenant_id: str,
        object_name: str,
        field_name: Optional[str] = None,
        active_only: bool = True
    ) -> List[Dict[str, Any]]:
        """Get all stage definitions for an object"""
        query = {
            "tenant_id": tenant_id,
            "object_name": object_name.lower()
        }
        
        if field_name:
            query["field_name"] = field_name
        
        if active_only:
            query["is_active"] = True
        
        stages = await self.collection.find(
            query,
            {"_id": 0}
        ).sort("sort_order", 1).to_list(None)
        
        return stages
    
    async def get_stage_by_name(
        self,
        tenant_id: str,
        object_name: str,
        stage_name: str
    ) -> Optional[Dict[str, Any]]:
        """Get a specific stage by name"""
        stage = await self.collection.find_one({
            "tenant_id": tenant_id,
            "object_name": object_name.lower(),
            "$or": [
                {"stage_name": {"$regex": f"^{stage_name}$", "$options": "i"}},
                {"stage_api_name": stage_name.lower()}
            ]
        }, {"_id": 0})
        
        return stage
    
    async def get_stage_by_id(
        self,
        tenant_id: str,
        stage_id: str
    ) -> Optional[Dict[str, Any]]:
        """Get a stage by ID"""
        stage = await self.collection.find_one({
            "tenant_id": tenant_id,
            "id": stage_id
        }, {"_id": 0})
        
        return stage
    
    async def create_stage(
        self,
        tenant_id: str,
        stage_data: StageDefinitionCreate,
        user_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """Create a new stage definition"""
        # Generate API name if not provided
        api_name = stage_data.stage_api_name
        if not api_name:
            api_name = self._to_api_name(stage_data.stage_name)
        
        # Check for duplicate
        existing = await self.get_stage_by_name(
            tenant_id,
            stage_data.object_name,
            stage_data.stage_name
        )
        if existing:
            raise ValueError(f"Stage '{stage_data.stage_name}' already exists")
        
        # Determine field_name based on object
        field_name = stage_data.field_name
        if not field_name:
            if stage_data.object_name.lower() == "lead":
                field_name = "status"
            elif stage_data.object_name.lower() == "opportunity":
                field_name = "stage"
            else:
                field_name = "status"
        
        now = datetime.now(timezone.utc)
        stage = StageDefinition(
            tenant_id=tenant_id,
            object_name=stage_data.object_name.lower(),
            field_name=field_name,
            stage_name=stage_data.stage_name,
            stage_api_name=api_name,
            probability_percent=stage_data.probability_percent,
            is_closed_won=stage_data.is_closed_won,
            is_closed_lost=stage_data.is_closed_lost,
            forecast_category=stage_data.forecast_category,
            sort_order=stage_data.sort_order,
            description=stage_data.description,
            color=stage_data.color,
            is_active=stage_data.is_active,
            is_system=False,
            created_at=now,
            updated_at=now,
            created_by=user_id,
            updated_by=user_id
        )
        
        stage_doc = stage.model_dump()
        # Convert enum to string
        stage_doc["forecast_category"] = stage_doc["forecast_category"].value
        
        await self.collection.insert_one(stage_doc)
        
        # Update object field options
        await self._sync_field_options(tenant_id, stage_data.object_name.lower(), field_name)
        
        stage_doc.pop("_id", None)
        return stage_doc
    
    async def update_stage(
        self,
        tenant_id: str,
        stage_id: str,
        stage_data: StageDefinitionUpdate,
        user_id: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        """Update a stage definition"""
        existing = await self.get_stage_by_id(tenant_id, stage_id)
        if not existing:
            return None
        
        update_fields = {}
        if stage_data.stage_name is not None:
            update_fields["stage_name"] = stage_data.stage_name
        if stage_data.probability_percent is not None:
            update_fields["probability_percent"] = stage_data.probability_percent
        if stage_data.is_closed_won is not None:
            update_fields["is_closed_won"] = stage_data.is_closed_won
        if stage_data.is_closed_lost is not None:
            update_fields["is_closed_lost"] = stage_data.is_closed_lost
        if stage_data.forecast_category is not None:
            update_fields["forecast_category"] = stage_data.forecast_category.value
        if stage_data.sort_order is not None:
            update_fields["sort_order"] = stage_data.sort_order
        if stage_data.description is not None:
            update_fields["description"] = stage_data.description
        if stage_data.color is not None:
            update_fields["color"] = stage_data.color
        if stage_data.is_active is not None:
            update_fields["is_active"] = stage_data.is_active
        
        if not update_fields:
            return existing
        
        update_fields["updated_at"] = datetime.now(timezone.utc)
        update_fields["updated_by"] = user_id
        
        await self.collection.update_one(
            {"tenant_id": tenant_id, "id": stage_id},
            {"$set": update_fields}
        )
        
        # Sync field options if name changed
        if "stage_name" in update_fields:
            await self._sync_field_options(
                tenant_id,
                existing["object_name"],
                existing["field_name"]
            )
        
        updated = await self.get_stage_by_id(tenant_id, stage_id)
        return updated
    
    async def delete_stage(
        self,
        tenant_id: str,
        stage_id: str
    ) -> bool:
        """Delete a stage definition (soft delete for system stages)"""
        existing = await self.get_stage_by_id(tenant_id, stage_id)
        if not existing:
            return False
        
        if existing.get("is_system"):
            # Soft delete for system stages
            await self.collection.update_one(
                {"tenant_id": tenant_id, "id": stage_id},
                {"$set": {"is_active": False, "updated_at": datetime.now(timezone.utc)}}
            )
        else:
            # Hard delete for custom stages
            await self.collection.delete_one({
                "tenant_id": tenant_id,
                "id": stage_id
            })
        
        # Sync field options
        await self._sync_field_options(
            tenant_id,
            existing["object_name"],
            existing["field_name"]
        )
        
        return True
    
    async def _sync_field_options(
        self,
        tenant_id: str,
        object_name: str,
        field_name: str
    ):
        """
        Sync stage definitions to the object field's options.
        This updates the picklist options in tenant_objects.
        """
        stages = await self.get_stages_for_object(
            tenant_id,
            object_name,
            field_name,
            active_only=True
        )
        
        options = [s["stage_name"] for s in stages]
        
        # Update the field options in tenant_objects
        await db.tenant_objects.update_one(
            {
                "tenant_id": tenant_id,
                "object_name": object_name
            },
            {"$set": {f"fields.{field_name}.options": options}}
        )
        
        logger.info(f"Synced {len(options)} stage options for {object_name}.{field_name}")
    
    async def seed_default_stages(
        self,
        tenant_id: str,
        user_id: Optional[str] = None
    ) -> Dict[str, int]:
        """
        Seed default stage definitions for a tenant.
        Only creates stages that don't already exist.
        """
        results = {"lead": 0, "opportunity": 0}
        now = datetime.now(timezone.utc)
        
        # Seed Lead stages
        for stage_data in DEFAULT_LEAD_STAGES:
            existing = await self.get_stage_by_name(
                tenant_id, "lead", stage_data["stage_name"]
            )
            if not existing:
                stage = StageDefinition(
                    tenant_id=tenant_id,
                    object_name="lead",
                    field_name="status",
                    created_at=now,
                    updated_at=now,
                    created_by=user_id,
                    updated_by=user_id,
                    **stage_data
                )
                stage_doc = stage.model_dump()
                stage_doc["forecast_category"] = stage_doc["forecast_category"].value
                await self.collection.insert_one(stage_doc)
                results["lead"] += 1
        
        # Seed Opportunity stages
        for stage_data in DEFAULT_OPPORTUNITY_STAGES:
            existing = await self.get_stage_by_name(
                tenant_id, "opportunity", stage_data["stage_name"]
            )
            if not existing:
                stage = StageDefinition(
                    tenant_id=tenant_id,
                    object_name="opportunity",
                    field_name="stage",
                    created_at=now,
                    updated_at=now,
                    created_by=user_id,
                    updated_by=user_id,
                    **stage_data
                )
                stage_doc = stage.model_dump()
                stage_doc["forecast_category"] = stage_doc["forecast_category"].value
                await self.collection.insert_one(stage_doc)
                results["opportunity"] += 1
        
        # Sync field options
        if results["lead"] > 0:
            await self._sync_field_options(tenant_id, "lead", "status")
        if results["opportunity"] > 0:
            await self._sync_field_options(tenant_id, "opportunity", "stage")
        
        logger.info(f"Seeded stages for tenant {tenant_id}: {results}")
        return results
    
    async def get_computed_fields_for_stage(
        self,
        tenant_id: str,
        object_name: str,
        stage_value: str
    ) -> Dict[str, Any]:
        """
        Get computed field values based on stage.
        Used for Opportunity: probability_percent, forecast_category, expected_revenue
        """
        stage = await self.get_stage_by_name(tenant_id, object_name, stage_value)
        
        if not stage:
            # Return defaults if stage not found
            return {
                "probability_percent": 0,
                "forecast_category": ForecastCategory.PIPELINE.value,
                "is_closed": False
            }
        
        return {
            "probability_percent": stage.get("probability_percent", 0),
            "forecast_category": stage.get("forecast_category", ForecastCategory.PIPELINE.value),
            "is_closed": stage.get("is_closed_won", False) or stage.get("is_closed_lost", False),
            "is_closed_won": stage.get("is_closed_won", False),
            "is_closed_lost": stage.get("is_closed_lost", False)
        }


# Singleton instance
_service_instance = None

def get_stage_definition_service() -> StageDefinitionService:
    """Get singleton instance of StageDefinitionService"""
    global _service_instance
    if _service_instance is None:
        _service_instance = StageDefinitionService()
    return _service_instance
