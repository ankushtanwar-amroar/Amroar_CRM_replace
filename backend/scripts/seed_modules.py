"""
Module Registry Seed Data
Seeds all platform modules into the modules collection for Admin Portal management.
"""
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime, timezone
import os
import uuid


ALL_MODULES = [
    # Core modules (always active)
    {
        "code": "crm",
        "name": "CRM",
        "description": "Customer relationship management - contacts, accounts, leads",
        "category": "core",
        "is_core": True,
        "is_premium": False,
        "icon": "users",
        "default_enabled": True,
        "sort_order": 1
    },
    {
        "code": "sales_console",
        "name": "Sales Console",
        "description": "Sales pipeline, deals, and analytics dashboard",
        "category": "core",
        "is_core": True,
        "is_premium": False,
        "icon": "trending-up",
        "default_enabled": True,
        "sort_order": 2
    },
    
    # Productivity modules
    {
        "code": "task_manager",
        "name": "Task Manager",
        "description": "Task tracking, assignments, and workflow management",
        "category": "productivity",
        "is_core": False,
        "is_premium": False,
        "icon": "check-square",
        "default_enabled": True,
        "sort_order": 10
    },
    
    # Admin modules
    {
        "code": "schema_builder",
        "name": "Schema Builder",
        "description": "Create and manage custom objects, fields, and relationships",
        "category": "admin",
        "is_core": False,
        "is_premium": False,
        "icon": "database",
        "default_enabled": False,
        "sort_order": 20
    },
    {
        "code": "app_manager",
        "name": "App Manager",
        "description": "Customize home page layout and navigation",
        "category": "admin",
        "is_core": False,
        "is_premium": False,
        "icon": "layout-grid",
        "default_enabled": False,
        "sort_order": 21
    },
    
    # Automation modules
    {
        "code": "form_builder",
        "name": "Form Builder",
        "description": "Create web forms to capture leads and data",
        "category": "automation",
        "is_core": False,
        "is_premium": False,
        "icon": "file-text",
        "default_enabled": False,
        "sort_order": 30
    },
    {
        "code": "flow_builder",
        "name": "Flow Builder",
        "description": "Automate business processes with visual workflows",
        "category": "automation",
        "is_core": False,
        "is_premium": False,
        "icon": "git-branch",
        "default_enabled": False,
        "sort_order": 31
    },
    
    # Data modules
    {
        "code": "import_builder",
        "name": "Import Builder",
        "description": "Import data from CSV, Excel, and other sources",
        "category": "data",
        "is_core": False,
        "is_premium": False,
        "icon": "upload",
        "default_enabled": False,
        "sort_order": 40
    },
    {
        "code": "export_builder",
        "name": "Export Builder",
        "description": "Export data to CSV, Excel, and other formats",
        "category": "data",
        "is_core": False,
        "is_premium": False,
        "icon": "download",
        "default_enabled": False,
        "sort_order": 41
    },
    {
        "code": "file_manager",
        "name": "File Manager",
        "description": "Manage uploaded files and documents",
        "category": "data",
        "is_core": False,
        "is_premium": False,
        "icon": "folder",
        "default_enabled": False,
        "sort_order": 42
    },
    
    # Engagement modules
    {
        "code": "survey_builder",
        "name": "Survey Builder",
        "description": "Create surveys and collect feedback",
        "category": "engagement",
        "is_core": False,
        "is_premium": True,
        "icon": "clipboard-list",
        "default_enabled": False,
        "sort_order": 50
    },
    {
        "code": "email_templates",
        "name": "Email Templates",
        "description": "Design and manage email templates",
        "category": "engagement",
        "is_core": False,
        "is_premium": False,
        "icon": "mail",
        "default_enabled": False,
        "sort_order": 51
    },
    {
        "code": "booking",
        "name": "Booking",
        "description": "Schedule appointments and meetings",
        "category": "engagement",
        "is_core": False,
        "is_premium": True,
        "icon": "calendar",
        "default_enabled": False,
        "sort_order": 52
    },
    
    # AI modules
    {
        "code": "chatbot_manager",
        "name": "Chatbot Manager",
        "description": "Configure and manage AI chatbots",
        "category": "ai",
        "is_core": False,
        "is_premium": True,
        "icon": "message-circle",
        "default_enabled": False,
        "sort_order": 60
    },
    {
        "code": "ai_features",
        "name": "AI Features",
        "description": "AI-powered insights, predictions, and automation",
        "category": "ai",
        "is_core": False,
        "is_premium": True,
        "icon": "sparkles",
        "default_enabled": False,
        "sort_order": 61
    },
    
    # Advanced modules
    {
        "code": "docflow",
        "name": "DocFlow",
        "description": "Document generation, templates, and e-signatures",
        "category": "advanced",
        "is_core": False,
        "is_premium": True,
        "icon": "file-check",
        "default_enabled": False,
        "sort_order": 70
    },
    {
        "code": "field_service",
        "name": "Field Service",
        "description": "Field service management and scheduling",
        "category": "advanced",
        "is_core": False,
        "is_premium": True,
        "icon": "map-pin",
        "default_enabled": False,
        "sort_order": 71
    },
    {
        "code": "reporting",
        "name": "Advanced Reporting",
        "description": "Advanced analytics, dashboards, and custom reports",
        "category": "analytics",
        "is_core": False,
        "is_premium": True,
        "icon": "bar-chart",
        "default_enabled": False,
        "sort_order": 80
    },
    
    # Configuration modules (not plan-restricted)
    {
        "code": "features",
        "name": "Features",
        "description": "Configure platform features and settings",
        "category": "config",
        "is_core": True,
        "is_premium": False,
        "icon": "settings",
        "default_enabled": True,
        "sort_order": 90
    },
    {
        "code": "connections",
        "name": "Connections",
        "description": "Manage external service integrations and API keys",
        "category": "config",
        "is_core": True,
        "is_premium": False,
        "icon": "plug",
        "default_enabled": True,
        "sort_order": 91
    }
]


async def seed_modules():
    """Seed the modules collection with all platform modules."""
    mongo_url = os.environ.get('MONGO_URL')
    db_name = os.environ.get('DB_NAME')
    
    if not mongo_url or not db_name:
        print("ERROR: MONGO_URL or DB_NAME not set")
        return
    
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    
    now = datetime.now(timezone.utc)
    
    # Create or update each module
    created = 0
    updated = 0
    
    for module_data in ALL_MODULES:
        existing = await db.modules.find_one({"code": module_data["code"]})
        
        if existing:
            # Update existing module
            await db.modules.update_one(
                {"code": module_data["code"]},
                {"$set": {
                    **module_data,
                    "updated_at": now
                }}
            )
            updated += 1
        else:
            # Create new module
            await db.modules.insert_one({
                "id": str(uuid.uuid4()),
                **module_data,
                "is_active": True,
                "created_at": now,
                "updated_at": now
            })
            created += 1
    
    print(f"Module registry seeded: {created} created, {updated} updated")
    print(f"Total modules in registry: {await db.modules.count_documents({})}")
    
    # List all modules
    modules = await db.modules.find({}, {"_id": 0, "code": 1, "name": 1, "category": 1}).sort("sort_order", 1).to_list(100)
    print("\nModules in registry:")
    for m in modules:
        print(f"  - {m['code']}: {m['name']} ({m['category']})")


if __name__ == "__main__":
    asyncio.run(seed_modules())
