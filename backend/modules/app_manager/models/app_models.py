"""
App Manager Models

Database models for the App Manager system:
- CrmApp: Application definitions (Sales, Service, Marketing, etc.)
- CrmAppNavigation: Navigation items per app
- CrmPage: Page definitions (Home, App Pages, Setup Home)
- CrmPageComponent: Components placed on pages
- ComponentRegistry: System-level component definitions

Architecture Rules:
- Each app has exactly ONE Home page (editable only, not creatable)
- Setup Home is global and admin-only
- App Pages are unlimited and can be added to any app
"""
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from enum import Enum
from pydantic import BaseModel, Field
import uuid


# =============================================================================
# Enums
# =============================================================================

class AppNavigationStyle(str, Enum):
    """Navigation display style for apps"""
    STANDARD = "standard"
    CONSOLE = "console"


class PageType(str, Enum):
    """Types of pages in the system"""
    HOME_PAGE = "home_page"      # One per app, editable only
    APP_PAGE = "app_page"        # Unlimited, custom pages
    SETUP_HOME = "setup_home"    # Global admin dashboard


class PageTemplate(str, Enum):
    """Layout templates for pages"""
    BLANK = "blank"
    HEADER_ONE_COLUMN = "header_one_column"
    HEADER_TWO_COLUMN = "header_two_column"
    HEADER_SIDEBAR = "header_sidebar"
    THREE_COLUMN = "three_column"


class PageRegion(str, Enum):
    """Regions within page templates"""
    HEADER = "header"
    MAIN = "main"
    LEFT_COLUMN = "left_column"
    RIGHT_COLUMN = "right_column"
    SIDEBAR = "sidebar"
    FULL_WIDTH = "full_width"


class ComponentCategory(str, Enum):
    """Component categories for organization"""
    STANDARD = "standard"
    DATA = "data"
    PRODUCTIVITY = "productivity"
    ANALYTICS = "analytics"
    CUSTOM = "custom"


class NavItemType(str, Enum):
    """Types of navigation items"""
    HOME = "home"           # Link to app's home page
    OBJECT = "object"       # CRM object (Account, Contact, etc.)
    PAGE = "page"           # App page
    EXTERNAL = "external"   # External URL


# =============================================================================
# App Models
# =============================================================================

class CrmAppBase(BaseModel):
    """Base fields for CRM App"""
    name: str = Field(..., min_length=1, max_length=100, description="Display name")
    api_name: Optional[str] = Field(None, min_length=1, max_length=50, description="API identifier (auto-generated if not provided)")
    description: Optional[str] = Field(None, max_length=500)
    icon: str = Field(default="layout-grid", description="Lucide icon name")
    navigation_style: AppNavigationStyle = Field(default=AppNavigationStyle.STANDARD)
    utility_bar: bool = Field(default=False, description="Show utility bar")
    is_active: bool = Field(default=True)


class CrmAppCreate(CrmAppBase):
    """Create a new app"""
    pass


class CrmAppUpdate(BaseModel):
    """Update an existing app"""
    name: Optional[str] = None
    description: Optional[str] = None
    icon: Optional[str] = None
    navigation_style: Optional[AppNavigationStyle] = None
    utility_bar: Optional[bool] = None
    is_active: Optional[bool] = None


class CrmApp(CrmAppBase):
    """Full App model with all fields"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    home_page_id: Optional[str] = Field(None, description="Reference to app's home page")
    tenant_id: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    created_by: str
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_by: str

    class Config:
        json_encoders = {datetime: lambda v: v.isoformat()}


class CrmAppResponse(CrmAppBase):
    """API response for App"""
    id: str
    home_page_id: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    page_count: int = 0  # Count of app pages

    class Config:
        json_encoders = {datetime: lambda v: v.isoformat()}


# =============================================================================
# Navigation Models
# =============================================================================

class NavItem(BaseModel):
    """Single navigation item within an app"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    type: NavItemType
    reference_id: Optional[str] = Field(None, description="Page ID or Object name")
    label: str
    icon: Optional[str] = None
    order: int = Field(default=0)


class CrmAppNavigation(BaseModel):
    """Navigation configuration for an app"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    app_id: str
    items: List[NavItem] = Field(default_factory=list)
    tenant_id: str
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Config:
        json_encoders = {datetime: lambda v: v.isoformat()}


class NavItemCreate(BaseModel):
    """Create a navigation item"""
    type: NavItemType
    reference_id: Optional[str] = None
    label: str
    icon: Optional[str] = None


class NavigationUpdate(BaseModel):
    """Update navigation for an app"""
    items: List[NavItemCreate]


# =============================================================================
# Page Models
# =============================================================================

class PageComponentConfig(BaseModel):
    """Configuration for a component instance on a page"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    component_type: str = Field(..., description="Component registry ID")
    region: PageRegion = Field(default=PageRegion.MAIN)
    order: int = Field(default=0)
    config: Dict[str, Any] = Field(default_factory=dict, description="Component-specific settings")


class PageLayout(BaseModel):
    """Layout structure with regions and components"""
    template: PageTemplate = Field(default=PageTemplate.HEADER_TWO_COLUMN)
    regions: Dict[str, List[PageComponentConfig]] = Field(default_factory=dict)


class CrmPageBase(BaseModel):
    """Base fields for CRM Page"""
    name: str = Field(..., min_length=1, max_length=100)
    api_name: str = Field(..., min_length=1, max_length=50)
    description: Optional[str] = Field(None, max_length=500)
    type: PageType
    app_id: Optional[str] = Field(None, description="Null for setup_home")
    is_active: bool = Field(default=True)


class CrmPageCreate(BaseModel):
    """Create a new page (App Pages only - Home pages are auto-created)"""
    name: str = Field(..., min_length=1, max_length=100)
    api_name: Optional[str] = None  # Auto-generated if not provided
    description: Optional[str] = None
    app_id: str = Field(..., description="App to add this page to")
    template: PageTemplate = Field(default=PageTemplate.HEADER_TWO_COLUMN)


class CrmPageUpdate(BaseModel):
    """Update an existing page"""
    name: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None
    layout: Optional[PageLayout] = None


class CrmPage(CrmPageBase):
    """Full Page model"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    layout: PageLayout = Field(default_factory=PageLayout)
    tenant_id: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    created_by: str
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_by: str

    class Config:
        json_encoders = {datetime: lambda v: v.isoformat()}


class CrmPageResponse(CrmPageBase):
    """API response for Page"""
    id: str
    layout: PageLayout
    created_at: datetime
    updated_at: datetime
    component_count: int = 0
    is_default: bool = False  # Whether this page is the default for its app

    class Config:
        json_encoders = {datetime: lambda v: v.isoformat()}


# =============================================================================
# Component Registry Models
# =============================================================================

class ComponentConfigField(BaseModel):
    """Schema for a component configuration field"""
    type: str = Field(..., description="string, number, boolean, enum, object")
    label: str
    description: Optional[str] = None
    default: Any = None
    required: bool = Field(default=False)
    options: Optional[List[Dict[str, str]]] = None  # For enum type


class ComponentRegistry(BaseModel):
    """System-level component definition"""
    id: str = Field(..., description="Unique component identifier")
    name: str = Field(..., description="Display name")
    description: str
    category: ComponentCategory = Field(default=ComponentCategory.STANDARD)
    icon: str = Field(default="box")
    config_schema: Dict[str, ComponentConfigField] = Field(default_factory=dict)
    frontend_component: str = Field(..., description="React component name")
    min_width: int = Field(default=1, description="Minimum column width")
    max_width: int = Field(default=12, description="Maximum column width")
    supports_regions: List[PageRegion] = Field(
        default_factory=lambda: [PageRegion.MAIN, PageRegion.LEFT_COLUMN, PageRegion.RIGHT_COLUMN]
    )


# =============================================================================
# Component Data Response Models
# =============================================================================

class TaskItem(BaseModel):
    """Task item for Tasks Due component"""
    id: str
    subject: str
    due_date: Optional[datetime] = None
    status: str
    priority: Optional[str] = None
    related_to_type: Optional[str] = None
    related_to_id: Optional[str] = None
    related_to_name: Optional[str] = None
    is_overdue: bool = False


class EventItem(BaseModel):
    """Event item for Events Due component"""
    id: str
    subject: str
    start_datetime: datetime
    end_datetime: Optional[datetime] = None
    location: Optional[str] = None
    related_to_type: Optional[str] = None
    related_to_id: Optional[str] = None
    related_to_name: Optional[str] = None


class PipelineStage(BaseModel):
    """Stage data for Pipeline Snapshot"""
    stage: str
    count: int
    amount: float = 0.0
    percentage: float = 0.0


class WorkQueueItem(BaseModel):
    """Item for Work Queue component"""
    id: str
    name: str
    object_type: str
    last_activity_date: Optional[datetime] = None
    days_inactive: int = 0
    owner_name: Optional[str] = None


class QuickAction(BaseModel):
    """Quick action button definition"""
    id: str
    label: str
    icon: str
    action_type: str  # "create_record", "navigate", "custom"
    action_config: Dict[str, Any] = Field(default_factory=dict)


# =============================================================================
# List Response Models
# =============================================================================

class AppsListResponse(BaseModel):
    """Response for apps list"""
    apps: List[CrmAppResponse]
    total: int


class PagesListResponse(BaseModel):
    """Response for pages list"""
    pages: List[CrmPageResponse]
    total: int
