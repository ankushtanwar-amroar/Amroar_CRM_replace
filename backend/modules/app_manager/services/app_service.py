"""
App Manager Service

Handles all app and page management operations:
- App CRUD with automatic Home page creation
- Page CRUD with layout management
- Navigation management
- Component placement and configuration
"""
import re
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any, Tuple
from motor.motor_asyncio import AsyncIOMotorDatabase
import logging

from ..models.app_models import (
    CrmApp, CrmAppCreate, CrmAppUpdate, CrmAppResponse,
    CrmAppNavigation, NavItem, NavItemType, NavigationUpdate,
    CrmPage, CrmPageCreate, CrmPageUpdate, CrmPageResponse,
    PageType, PageTemplate, PageLayout, PageComponentConfig, PageRegion,
    AppsListResponse, PagesListResponse
)
from ..models.component_registry import get_component_registry, PAGE_TEMPLATES

logger = logging.getLogger(__name__)


def to_api_name(name: str) -> str:
    """Convert display name to API name (snake_case)"""
    # Remove special characters, replace spaces with underscores, lowercase
    api_name = re.sub(r'[^a-zA-Z0-9\s]', '', name)
    api_name = re.sub(r'\s+', '_', api_name.strip())
    return api_name.lower()


class AppManagerService:
    """Service for managing Apps, Pages, and Navigation"""
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.apps_collection = db.crm_apps
        self.pages_collection = db.crm_pages
        self.navigation_collection = db.crm_app_navigation
    
    # =========================================================================
    # App Operations
    # =========================================================================
    
    async def create_app(
        self,
        data: CrmAppCreate,
        user_id: str,
        tenant_id: str
    ) -> CrmAppResponse:
        """
        Create a new app with automatic Home page creation.
        Each app gets exactly ONE home page that is editable but not deletable.
        """
        now = datetime.now(timezone.utc)
        
        # Create the app
        app = CrmApp(
            name=data.name,
            api_name=data.api_name or to_api_name(data.name),
            description=data.description,
            icon=data.icon,
            navigation_style=data.navigation_style,
            utility_bar=data.utility_bar,
            is_active=data.is_active,
            tenant_id=tenant_id,
            created_at=now,
            created_by=user_id,
            updated_at=now,
            updated_by=user_id
        )
        
        app_dict = app.dict()
        await self.apps_collection.insert_one(app_dict)
        
        # Create the app's Home page (mandatory, one per app)
        home_page = await self._create_home_page(app.id, app.name, user_id, tenant_id)
        
        # Update app with home page reference
        await self.apps_collection.update_one(
            {"id": app.id},
            {"$set": {"home_page_id": home_page.id}}
        )
        
        # Create default navigation
        await self._create_default_navigation(app.id, home_page.id, tenant_id)
        
        logger.info(f"Created app '{app.name}' with Home page for tenant {tenant_id}")
        
        return await self.get_app(app.id, tenant_id)
    
    async def _create_home_page(
        self,
        app_id: str,
        app_name: str,
        user_id: str,
        tenant_id: str
    ) -> CrmPage:
        """Create the mandatory Home page for an app"""
        now = datetime.now(timezone.utc)
        
        home_page = CrmPage(
            name=f"{app_name} Home",
            api_name=f"{to_api_name(app_name)}_home",
            description=f"Home page for {app_name}",
            type=PageType.HOME_PAGE,
            app_id=app_id,
            layout=PageLayout(
                template=PageTemplate.HEADER_TWO_COLUMN,
                regions={
                    "header": [],
                    "left_column": [],
                    "right_column": []
                }
            ),
            is_active=True,
            tenant_id=tenant_id,
            created_at=now,
            created_by=user_id,
            updated_at=now,
            updated_by=user_id
        )
        
        await self.pages_collection.insert_one(home_page.dict())
        logger.info(f"Created Home page for app {app_id}")
        
        return home_page
    
    async def _create_default_navigation(
        self,
        app_id: str,
        home_page_id: str,
        tenant_id: str
    ) -> CrmAppNavigation:
        """Create default navigation for an app"""
        nav = CrmAppNavigation(
            app_id=app_id,
            items=[
                NavItem(
                    type=NavItemType.HOME,
                    reference_id=home_page_id,
                    label="Home",
                    icon="home",
                    order=0
                )
            ],
            tenant_id=tenant_id
        )
        
        await self.navigation_collection.insert_one(nav.dict())
        return nav
    
    async def get_app(
        self,
        app_id: str,
        tenant_id: str
    ) -> Optional[CrmAppResponse]:
        """Get an app by ID"""
        app = await self.apps_collection.find_one({
            "id": app_id,
            "tenant_id": tenant_id
        }, {"_id": 0})
        
        if not app:
            return None
        
        # Count pages for this app
        page_count = await self.pages_collection.count_documents({
            "app_id": app_id,
            "tenant_id": tenant_id,
            "type": PageType.APP_PAGE.value
        })
        
        return CrmAppResponse(
            **app,
            page_count=page_count
        )
    
    async def list_apps(
        self,
        tenant_id: str,
        include_inactive: bool = False
    ) -> AppsListResponse:
        """List all apps for tenant"""
        query = {"tenant_id": tenant_id}
        if not include_inactive:
            query["is_active"] = True
        
        apps = await self.apps_collection.find(query, {"_id": 0}).sort("name", 1).to_list(100)
        
        # Enrich with page counts
        enriched = []
        for app in apps:
            page_count = await self.pages_collection.count_documents({
                "app_id": app["id"],
                "tenant_id": tenant_id,
                "type": PageType.APP_PAGE.value
            })
            enriched.append(CrmAppResponse(**app, page_count=page_count))
        
        return AppsListResponse(apps=enriched, total=len(enriched))
    
    async def update_app(
        self,
        app_id: str,
        data: CrmAppUpdate,
        user_id: str,
        tenant_id: str
    ) -> Optional[CrmAppResponse]:
        """Update an existing app"""
        update_data = {
            "updated_at": datetime.now(timezone.utc),
            "updated_by": user_id
        }
        
        for field, value in data.dict(exclude_unset=True).items():
            if value is not None:
                update_data[field] = value
        
        result = await self.apps_collection.update_one(
            {"id": app_id, "tenant_id": tenant_id},
            {"$set": update_data}
        )
        
        if result.modified_count == 0:
            return None
        
        return await self.get_app(app_id, tenant_id)
    
    async def delete_app(
        self,
        app_id: str,
        tenant_id: str
    ) -> bool:
        """Delete an app and all its pages"""
        # Delete all pages for this app
        await self.pages_collection.delete_many({
            "app_id": app_id,
            "tenant_id": tenant_id
        })
        
        # Delete navigation
        await self.navigation_collection.delete_many({
            "app_id": app_id,
            "tenant_id": tenant_id
        })
        
        # Delete the app
        result = await self.apps_collection.delete_one({
            "id": app_id,
            "tenant_id": tenant_id
        })
        
        return result.deleted_count > 0
    
    # =========================================================================
    # Navigation Operations
    # =========================================================================
    
    async def get_app_navigation(
        self,
        app_id: str,
        tenant_id: str
    ) -> Optional[CrmAppNavigation]:
        """Get navigation for an app"""
        nav = await self.navigation_collection.find_one({
            "app_id": app_id,
            "tenant_id": tenant_id
        }, {"_id": 0})
        
        if nav:
            return CrmAppNavigation(**nav)
        return None
    
    async def update_app_navigation(
        self,
        app_id: str,
        data: NavigationUpdate,
        tenant_id: str
    ) -> CrmAppNavigation:
        """Update navigation items for an app"""
        # Build new items list with order
        items = []
        for idx, item_data in enumerate(data.items):
            items.append(NavItem(
                type=item_data.type,
                reference_id=item_data.reference_id,
                label=item_data.label,
                icon=item_data.icon,
                order=idx
            ))
        
        now = datetime.now(timezone.utc)
        
        await self.navigation_collection.update_one(
            {"app_id": app_id, "tenant_id": tenant_id},
            {
                "$set": {
                    "items": [item.dict() for item in items],
                    "updated_at": now
                }
            },
            upsert=True
        )
        
        return await self.get_app_navigation(app_id, tenant_id)
    
    async def add_nav_item(
        self,
        app_id: str,
        item_type: NavItemType,
        reference_id: str,
        label: str,
        icon: Optional[str],
        tenant_id: str
    ) -> CrmAppNavigation:
        """Add a navigation item to an app"""
        nav = await self.get_app_navigation(app_id, tenant_id)
        if not nav:
            nav = await self._create_default_navigation(app_id, None, tenant_id)
        
        # Get max order
        max_order = max([item.order for item in nav.items], default=-1) + 1
        
        new_item = NavItem(
            type=item_type,
            reference_id=reference_id,
            label=label,
            icon=icon,
            order=max_order
        )
        
        await self.navigation_collection.update_one(
            {"app_id": app_id, "tenant_id": tenant_id},
            {"$push": {"items": new_item.dict()}}
        )
        
        return await self.get_app_navigation(app_id, tenant_id)
    
    async def remove_nav_item(
        self,
        app_id: str,
        item_id: str,
        tenant_id: str
    ) -> bool:
        """Remove a navigation item from an app"""
        result = await self.navigation_collection.update_one(
            {"app_id": app_id, "tenant_id": tenant_id},
            {"$pull": {"items": {"id": item_id}}}
        )
        return result.modified_count > 0
    
    # =========================================================================
    # Page Operations
    # =========================================================================
    
    async def create_page(
        self,
        data: CrmPageCreate,
        user_id: str,
        tenant_id: str
    ) -> CrmPageResponse:
        """
        Create a new App Page.
        Note: Home pages are created automatically with apps and cannot be manually created.
        """
        now = datetime.now(timezone.utc)
        
        # Initialize layout based on template
        template_config = PAGE_TEMPLATES.get(data.template.value, PAGE_TEMPLATES["header_two_column"])
        regions = {region: [] for region in template_config["regions"]}
        
        page = CrmPage(
            name=data.name,
            api_name=data.api_name or to_api_name(data.name),
            description=data.description,
            type=PageType.APP_PAGE,  # Only App Pages can be created manually
            app_id=data.app_id,
            layout=PageLayout(template=data.template, regions=regions),
            is_active=True,
            tenant_id=tenant_id,
            created_at=now,
            created_by=user_id,
            updated_at=now,
            updated_by=user_id
        )
        
        await self.pages_collection.insert_one(page.dict())
        logger.info(f"Created App Page '{page.name}' for app {data.app_id}")
        
        return await self.get_page(page.id, tenant_id)
    
    async def get_page(
        self,
        page_id: str,
        tenant_id: str
    ) -> Optional[CrmPageResponse]:
        """Get a page by ID"""
        page = await self.pages_collection.find_one({
            "id": page_id,
            "tenant_id": tenant_id
        }, {"_id": 0})
        
        if not page:
            return None
        
        # Count components
        component_count = sum(
            len(components) 
            for components in page.get("layout", {}).get("regions", {}).values()
        )
        
        return CrmPageResponse(**page, component_count=component_count)
    
    async def get_app_home_page(
        self,
        app_id: str,
        tenant_id: str
    ) -> Optional[CrmPageResponse]:
        """Get the Home page for an app"""
        page = await self.pages_collection.find_one({
            "app_id": app_id,
            "tenant_id": tenant_id,
            "type": PageType.HOME_PAGE.value
        }, {"_id": 0})
        
        if not page:
            return None
        
        component_count = sum(
            len(components) 
            for components in page.get("layout", {}).get("regions", {}).values()
        )
        
        return CrmPageResponse(**page, component_count=component_count)
    
    async def list_app_pages(
        self,
        app_id: str,
        tenant_id: str,
        include_home: bool = True
    ) -> PagesListResponse:
        """List all pages for an app"""
        query = {
            "app_id": app_id,
            "tenant_id": tenant_id
        }
        
        if not include_home:
            query["type"] = PageType.APP_PAGE.value
        
        pages = await self.pages_collection.find(query, {"_id": 0}).sort("name", 1).to_list(100)
        
        enriched = []
        for page in pages:
            component_count = sum(
                len(components) 
                for components in page.get("layout", {}).get("regions", {}).values()
            )
            enriched.append(CrmPageResponse(**page, component_count=component_count))
        
        return PagesListResponse(pages=enriched, total=len(enriched))
    
    async def update_page(
        self,
        page_id: str,
        data: CrmPageUpdate,
        user_id: str,
        tenant_id: str
    ) -> Optional[CrmPageResponse]:
        """Update a page (including layout changes)"""
        update_data = {
            "updated_at": datetime.now(timezone.utc),
            "updated_by": user_id
        }
        
        for field, value in data.dict(exclude_unset=True).items():
            if value is not None:
                if field == "layout":
                    # Handle layout - it could be a dict or a PageLayout object
                    if hasattr(value, 'dict'):
                        update_data["layout"] = value.dict()
                    else:
                        # Already a dict from JSON
                        update_data["layout"] = value
                else:
                    update_data[field] = value
        
        result = await self.pages_collection.update_one(
            {"id": page_id, "tenant_id": tenant_id},
            {"$set": update_data}
        )
        
        if result.modified_count == 0:
            # Check if the document exists but wasn't modified (same data)
            existing = await self.pages_collection.find_one({
                "id": page_id,
                "tenant_id": tenant_id
            })
            if existing:
                return await self.get_page(page_id, tenant_id)
            return None
        
        return await self.get_page(page_id, tenant_id)
    
    async def delete_page(
        self,
        page_id: str,
        tenant_id: str
    ) -> Tuple[bool, Optional[str]]:
        """
        Delete a page.
        Returns (success, error_message).
        Home pages cannot be deleted.
        """
        # Check if it's a home page
        page = await self.pages_collection.find_one({
            "id": page_id,
            "tenant_id": tenant_id
        })
        
        if not page:
            return False, "Page not found"
        
        if page.get("type") == PageType.HOME_PAGE.value:
            return False, "Home pages cannot be deleted. They are editable only."
        
        # Remove from navigation
        await self.navigation_collection.update_many(
            {"tenant_id": tenant_id},
            {"$pull": {"items": {"reference_id": page_id}}}
        )
        
        # Delete the page
        result = await self.pages_collection.delete_one({
            "id": page_id,
            "tenant_id": tenant_id
        })
        
        return result.deleted_count > 0, None
    
    async def set_page_as_default(
        self,
        page_id: str,
        tenant_id: str
    ) -> bool:
        """
        Set a page as the default page for its app.
        Removes default status from any other page in the same app.
        """
        # Get the page to find its app_id
        page = await self.pages_collection.find_one({
            "id": page_id,
            "tenant_id": tenant_id
        })
        
        if not page:
            return False
        
        app_id = page.get("app_id")
        
        # Remove default status from all other pages in this app
        await self.pages_collection.update_many(
            {"app_id": app_id, "tenant_id": tenant_id},
            {"$set": {"is_default": False}}
        )
        
        # Set this page as default
        await self.pages_collection.update_one(
            {"id": page_id, "tenant_id": tenant_id},
            {"$set": {"is_default": True, "updated_at": datetime.now(timezone.utc)}}
        )
        
        return True
    
    # =========================================================================
    # Component Operations
    # =========================================================================
    
    async def add_component_to_page(
        self,
        page_id: str,
        component_type: str,
        region: PageRegion,
        config: Dict[str, Any],
        user_id: str,
        tenant_id: str
    ) -> Optional[CrmPageResponse]:
        """Add a component to a page region"""
        # Validate component type
        registry = get_component_registry()
        if component_type not in registry:
            raise ValueError(f"Unknown component type: {component_type}")
        
        component = PageComponentConfig(
            component_type=component_type,
            region=region,
            order=0,  # Will be set based on existing components
            config=config
        )
        
        # Get current page
        page = await self.pages_collection.find_one({
            "id": page_id,
            "tenant_id": tenant_id
        })
        
        if not page:
            return None
        
        # Get current components in region
        region_key = region.value
        current_components = page.get("layout", {}).get("regions", {}).get(region_key, [])
        component.order = len(current_components)
        
        # Add component to region
        await self.pages_collection.update_one(
            {"id": page_id, "tenant_id": tenant_id},
            {
                "$push": {f"layout.regions.{region_key}": component.dict()},
                "$set": {
                    "updated_at": datetime.now(timezone.utc),
                    "updated_by": user_id
                }
            }
        )
        
        return await self.get_page(page_id, tenant_id)
    
    async def update_component_config(
        self,
        page_id: str,
        component_id: str,
        config: Dict[str, Any],
        user_id: str,
        tenant_id: str
    ) -> Optional[CrmPageResponse]:
        """Update a component's configuration"""
        page = await self.pages_collection.find_one({
            "id": page_id,
            "tenant_id": tenant_id
        })
        
        if not page:
            return None
        
        # Find and update the component
        updated = False
        regions = page.get("layout", {}).get("regions", {})
        
        for region_key, components in regions.items():
            for i, comp in enumerate(components):
                if comp.get("id") == component_id:
                    # Merge new config with existing
                    comp["config"] = {**comp.get("config", {}), **config}
                    updated = True
                    break
            if updated:
                break
        
        if not updated:
            return None
        
        await self.pages_collection.update_one(
            {"id": page_id, "tenant_id": tenant_id},
            {
                "$set": {
                    "layout.regions": regions,
                    "updated_at": datetime.now(timezone.utc),
                    "updated_by": user_id
                }
            }
        )
        
        return await self.get_page(page_id, tenant_id)
    
    async def remove_component_from_page(
        self,
        page_id: str,
        component_id: str,
        user_id: str,
        tenant_id: str
    ) -> Optional[CrmPageResponse]:
        """Remove a component from a page"""
        page = await self.pages_collection.find_one({
            "id": page_id,
            "tenant_id": tenant_id
        })
        
        if not page:
            return None
        
        # Find and remove the component
        regions = page.get("layout", {}).get("regions", {})
        
        for region_key, components in regions.items():
            regions[region_key] = [c for c in components if c.get("id") != component_id]
        
        # Reorder remaining components
        for region_key, components in regions.items():
            for i, comp in enumerate(components):
                comp["order"] = i
        
        await self.pages_collection.update_one(
            {"id": page_id, "tenant_id": tenant_id},
            {
                "$set": {
                    "layout.regions": regions,
                    "updated_at": datetime.now(timezone.utc),
                    "updated_by": user_id
                }
            }
        )
        
        return await self.get_page(page_id, tenant_id)
    
    async def reorder_components(
        self,
        page_id: str,
        region: PageRegion,
        component_ids: List[str],
        user_id: str,
        tenant_id: str
    ) -> Optional[CrmPageResponse]:
        """Reorder components within a region"""
        page = await self.pages_collection.find_one({
            "id": page_id,
            "tenant_id": tenant_id
        })
        
        if not page:
            return None
        
        region_key = region.value
        components = page.get("layout", {}).get("regions", {}).get(region_key, [])
        
        # Create ordered list based on provided IDs
        ordered = []
        comp_map = {c["id"]: c for c in components}
        
        for idx, comp_id in enumerate(component_ids):
            if comp_id in comp_map:
                comp = comp_map[comp_id]
                comp["order"] = idx
                ordered.append(comp)
        
        await self.pages_collection.update_one(
            {"id": page_id, "tenant_id": tenant_id},
            {
                "$set": {
                    f"layout.regions.{region_key}": ordered,
                    "updated_at": datetime.now(timezone.utc),
                    "updated_by": user_id
                }
            }
        )
        
        return await self.get_page(page_id, tenant_id)
    
    # =========================================================================
    # Setup Home
    # =========================================================================
    
    async def get_or_create_setup_home(
        self,
        user_id: str,
        tenant_id: str
    ) -> CrmPageResponse:
        """Get or create the Setup Home page (global admin dashboard)"""
        page = await self.pages_collection.find_one({
            "type": PageType.SETUP_HOME.value,
            "tenant_id": tenant_id
        }, {"_id": 0})
        
        if page:
            component_count = sum(
                len(components) 
                for components in page.get("layout", {}).get("regions", {}).values()
            )
            return CrmPageResponse(**page, component_count=component_count)
        
        # Create Setup Home
        now = datetime.now(timezone.utc)
        
        setup_home = CrmPage(
            name="Setup Home",
            api_name="setup_home",
            description="Administrator dashboard and setup workspace",
            type=PageType.SETUP_HOME,
            app_id=None,  # Global, not tied to an app
            layout=PageLayout(
                template=PageTemplate.HEADER_SIDEBAR,
                regions={
                    "header": [],
                    "main": [
                        PageComponentConfig(
                            component_type="recommendations",
                            region=PageRegion.MAIN,
                            order=0,
                            config={"title": "Recommendations"}
                        ).dict()
                    ],
                    "sidebar": [
                        PageComponentConfig(
                            component_type="setup_quick_find",
                            region=PageRegion.SIDEBAR,
                            order=0,
                            config={"placeholder": "Quick Find..."}
                        ).dict(),
                        PageComponentConfig(
                            component_type="setup_shortcuts",
                            region=PageRegion.SIDEBAR,
                            order=1,
                            config={"title": "Create"}
                        ).dict()
                    ]
                }
            ),
            is_active=True,
            tenant_id=tenant_id,
            created_at=now,
            created_by=user_id,
            updated_at=now,
            updated_by=user_id
        )
        
        await self.pages_collection.insert_one(setup_home.dict())
        logger.info(f"Created Setup Home for tenant {tenant_id}")
        
        return await self.get_page(setup_home.id, tenant_id)
