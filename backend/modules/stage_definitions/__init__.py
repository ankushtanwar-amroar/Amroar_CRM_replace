"""
Stage Definitions Module
Metadata-driven stage/status configuration for Lead and Opportunity objects.
"""
from .models.stage_definition_model import (
    StageDefinition,
    StageDefinitionCreate,
    StageDefinitionUpdate,
    ForecastCategory
)
from .services.stage_definition_service import StageDefinitionService
