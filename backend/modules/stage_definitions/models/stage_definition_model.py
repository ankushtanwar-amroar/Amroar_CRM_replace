"""
Stage Definition Models
Pydantic models for stage/status metadata configuration.
"""
from datetime import datetime, timezone
from typing import Optional, List
from enum import Enum
from pydantic import BaseModel, Field
import uuid


class ForecastCategory(str, Enum):
    """Forecast categories for opportunity stages"""
    PIPELINE = "Pipeline"
    BEST_CASE = "Best Case"
    COMMIT = "Commit"
    CLOSED = "Closed"
    OMITTED = "Omitted"


class StageDefinition(BaseModel):
    """
    Stage Definition metadata model.
    
    Used for:
    - Lead 'status' field stages
    - Opportunity 'stage' field stages
    
    Attributes define behavior for each stage value.
    """
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    object_name: str  # "lead" or "opportunity"
    field_name: str   # "status" for lead, "stage" for opportunity
    
    # Stage identity
    stage_name: str
    stage_api_name: str  # API-safe name (e.g., "closed_won")
    
    # Stage attributes
    probability_percent: int = Field(default=0, ge=0, le=100)
    is_closed_won: bool = False
    is_closed_lost: bool = False
    forecast_category: ForecastCategory = ForecastCategory.PIPELINE
    
    # Display
    sort_order: int = 0
    description: Optional[str] = None
    color: Optional[str] = None  # Hex color for UI
    
    # Status
    is_active: bool = True
    is_system: bool = False  # True for default stages, prevents deletion
    
    # Audit
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    created_by: Optional[str] = None
    updated_by: Optional[str] = None


class StageDefinitionCreate(BaseModel):
    """Request model for creating a stage definition"""
    object_name: str
    field_name: str
    stage_name: str
    stage_api_name: Optional[str] = None  # Auto-generated if not provided
    probability_percent: int = Field(default=0, ge=0, le=100)
    is_closed_won: bool = False
    is_closed_lost: bool = False
    forecast_category: ForecastCategory = ForecastCategory.PIPELINE
    sort_order: int = 0
    description: Optional[str] = None
    color: Optional[str] = None
    is_active: bool = True


class StageDefinitionUpdate(BaseModel):
    """Request model for updating a stage definition"""
    stage_name: Optional[str] = None
    probability_percent: Optional[int] = Field(default=None, ge=0, le=100)
    is_closed_won: Optional[bool] = None
    is_closed_lost: Optional[bool] = None
    forecast_category: Optional[ForecastCategory] = None
    sort_order: Optional[int] = None
    description: Optional[str] = None
    color: Optional[str] = None
    is_active: Optional[bool] = None


class StageDefinitionResponse(BaseModel):
    """Response model for stage definition"""
    id: str
    tenant_id: str
    object_name: str
    field_name: str
    stage_name: str
    stage_api_name: str
    probability_percent: int
    is_closed_won: bool
    is_closed_lost: bool
    forecast_category: str
    sort_order: int
    description: Optional[str]
    color: Optional[str]
    is_active: bool
    is_system: bool
    created_at: datetime
    updated_at: datetime
