from motor.motor_asyncio import AsyncIOMotorDatabase
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
from uuid import uuid4
import logging

logger = logging.getLogger(__name__)


# Default layout configurations for Lead and Opportunity
# These follow the spec: header fields, center details (2-column), related lists
DEFAULT_DETAIL_LAYOUTS = {
    "lead": {
        "layout_name": "Lead Detail Layout",
        "api_name": "Lead_Detail_Layout",
        "description": "System default detail layout for Lead (Prospect)",
        "page_type": "detail",
        "is_system": True,
        "template_type": "three_column_header",
        "header_fields": ["name", "status", "rating", "owner_id"],
        "highlight_fields": ["email", "phone", "company"],
        "show_stage_path": True,  # Lead has status path
        "stage_path_field": "status",
        "regions": [
            {
                "id": "left",
                "name": "Related Lists",
                "width": "w-64",
                "order": 0,
                "components": [
                    {"type": "related_list", "config": {"lists": ["task", "event"]}}
                ]
            },
            {
                "id": "center",
                "name": "Details",
                "width": "flex-1",
                "order": 1,
                "components": [
                    {
                        "type": "tabs",
                        "config": {
                            "tabs": [
                                {
                                    "id": "details",
                                    "label": "Details",
                                    "sections": [
                                        {
                                            "name": "Lead Information",
                                            "columns": 2,
                                            "fields": ["first_name", "last_name", "email", "phone", "mobile", "company", "title"]
                                        },
                                        {
                                            "name": "Qualification",
                                            "columns": 2,
                                            "fields": ["status", "rating", "source", "industry"]
                                        },
                                        {
                                            "name": "Firmographics",
                                            "columns": 2,
                                            "fields": ["employees_count", "annual_revenue", "website"]
                                        },
                                        {
                                            "name": "Address",
                                            "columns": 2,
                                            "fields": ["street", "city", "state", "postal_code", "country"]
                                        },
                                        {
                                            "name": "System Information",
                                            "columns": 2,
                                            "fields": ["created_at", "created_by", "updated_at", "updated_by", "last_activity_at"]
                                        }
                                    ]
                                }
                            ]
                        }
                    }
                ]
            },
            {
                "id": "right",
                "name": "Activity",
                "width": "w-80",
                "order": 2,
                "components": [
                    {"type": "activity_timeline", "config": {"show_tasks": True, "show_events": True, "show_emails": True}},
                    {"type": "audit_trail", "config": {"show_header": True, "max_height": "400px"}}
                ]
            }
        ]
    },
    "opportunity": {
        "layout_name": "Opportunity Detail Layout",
        "api_name": "Opportunity_Detail_Layout",
        "description": "System default detail layout for Opportunity",
        "page_type": "detail",
        "is_system": True,
        "template_type": "three_column_header",
        "header_fields": ["name", "stage", "amount", "owner_id"],
        "highlight_fields": ["close_date", "probability_percent", "expected_revenue", "forecast_category"],
        "show_stage_path": True,
        "stage_path_field": "stage",
        "regions": [
            {
                "id": "left",
                "name": "Related Lists",
                "width": "w-64",
                "order": 0,
                "components": [
                    {"type": "related_list", "config": {"lists": ["task", "event"]}}
                ]
            },
            {
                "id": "center",
                "name": "Details",
                "width": "flex-1",
                "order": 1,
                "components": [
                    {
                        "type": "tabs",
                        "config": {
                            "tabs": [
                                {
                                    "id": "details",
                                    "label": "Details",
                                    "sections": [
                                        {
                                            "name": "Opportunity Information",
                                            "columns": 2,
                                            "fields": ["name", "account_id", "stage", "close_date"]
                                        },
                                        {
                                            "name": "Financial",
                                            "columns": 2,
                                            "fields": ["amount", "probability_percent", "expected_revenue", "forecast_category"]
                                        },
                                        {
                                            "name": "Details",
                                            "columns": 2,
                                            "fields": ["type", "source", "next_step", "is_closed"]
                                        },
                                        {
                                            "name": "Description",
                                            "columns": 1,
                                            "fields": ["description"]
                                        },
                                        {
                                            "name": "System Information",
                                            "columns": 2,
                                            "fields": ["created_at", "created_by", "updated_at", "updated_by", "last_activity_at"]
                                        }
                                    ]
                                }
                            ]
                        }
                    }
                ]
            },
            {
                "id": "right",
                "name": "Activity",
                "width": "w-80",
                "order": 2,
                "components": [
                    {"type": "activity_timeline", "config": {"show_tasks": True, "show_events": True, "show_emails": True}},
                    {"type": "audit_trail", "config": {"show_header": True, "max_height": "400px"}}
                ]
            }
        ]
    },
    "contact": {
        "layout_name": "Contact Detail Layout",
        "api_name": "Contact_Detail_Layout",
        "description": "System default detail layout for Contact",
        "page_type": "detail",
        "is_system": True,
        "template_type": "three_column_header",
        "header_fields": ["name", "account_id", "title", "owner_id"],
        "highlight_fields": ["email", "phone", "department"],
        "show_stage_path": False,
        "regions": [
            {
                "id": "left",
                "name": "Related Lists",
                "width": "w-64",
                "order": 0,
                "components": [
                    {"type": "related_list", "config": {"lists": ["task", "event", "opportunity"]}}
                ]
            },
            {
                "id": "center",
                "name": "Details",
                "width": "flex-1",
                "order": 1,
                "components": [
                    {
                        "type": "tabs",
                        "config": {
                            "tabs": [
                                {
                                    "id": "details",
                                    "label": "Details",
                                    "sections": [
                                        {
                                            "name": "Contact Information",
                                            "columns": 2,
                                            "fields": ["first_name", "last_name", "account_id", "email", "phone", "title", "department"]
                                        },
                                        {
                                            "name": "Contact Details",
                                            "columns": 2,
                                            "fields": ["contact_type", "source", "reports_to_id"]
                                        },
                                        {
                                            "name": "Mailing Address",
                                            "columns": 2,
                                            "fields": ["mailing_city", "mailing_state", "mailing_country", "mailing_postal_code"]
                                        },
                                        {
                                            "name": "Description",
                                            "columns": 1,
                                            "fields": ["description", "notes"]
                                        },
                                        {
                                            "name": "System Information",
                                            "columns": 2,
                                            "fields": ["created_at", "created_by", "updated_at", "updated_by"]
                                        }
                                    ]
                                }
                            ]
                        }
                    }
                ]
            },
            {
                "id": "right",
                "name": "Activity",
                "width": "w-80",
                "order": 2,
                "components": [
                    {"type": "activity_timeline", "config": {"show_tasks": True, "show_events": True, "show_emails": True}},
                    {"type": "audit_trail", "config": {"show_header": True, "max_height": "400px"}}
                ]
            }
        ]
    },
    "account": {
        "layout_name": "Account Detail Layout",
        "api_name": "Account_Detail_Layout",
        "description": "System default detail layout for Account",
        "page_type": "detail",
        "is_system": True,
        "template_type": "three_column_header",
        "header_fields": ["account_name", "account_type", "industry", "owner_id"],
        "highlight_fields": ["website", "phone", "annual_revenue"],
        "show_stage_path": False,
        "regions": [
            {
                "id": "left",
                "name": "Related Lists",
                "width": "w-64",
                "order": 0,
                "components": [
                    {"type": "related_list", "config": {"lists": ["contact", "opportunity", "task", "event"]}}
                ]
            },
            {
                "id": "center",
                "name": "Details",
                "width": "flex-1",
                "order": 1,
                "components": [
                    {
                        "type": "tabs",
                        "config": {
                            "tabs": [
                                {
                                    "id": "details",
                                    "label": "Details",
                                    "sections": [
                                        {
                                            "name": "Account Information",
                                            "columns": 2,
                                            "fields": ["account_name", "account_type", "industry", "website", "phone", "email"]
                                        },
                                        {
                                            "name": "Firmographics",
                                            "columns": 2,
                                            "fields": ["employees", "annual_revenue", "source"]
                                        },
                                        {
                                            "name": "Billing Address",
                                            "columns": 2,
                                            "fields": ["billing_city", "billing_state", "billing_country", "billing_postal_code"]
                                        },
                                        {
                                            "name": "Description",
                                            "columns": 1,
                                            "fields": ["description"]
                                        },
                                        {
                                            "name": "System Information",
                                            "columns": 2,
                                            "fields": ["created_at", "created_by", "updated_at", "updated_by"]
                                        }
                                    ]
                                }
                            ]
                        }
                    }
                ]
            },
            {
                "id": "right",
                "name": "Activity",
                "width": "w-80",
                "order": 2,
                "components": [
                    {"type": "activity_timeline", "config": {"show_tasks": True, "show_events": True, "show_emails": True}},
                    {"type": "audit_trail", "config": {"show_header": True, "max_height": "400px"}}
                ]
            }
        ]
    },
    "task": {
        "layout_name": "Task Detail Layout",
        "api_name": "Task_Detail_Layout",
        "description": "System default detail layout for Task",
        "page_type": "detail",
        "is_system": True,
        "template_type": "two_column",
        "header_fields": ["subject", "status", "priority", "owner_id"],
        "highlight_fields": ["due_date", "related_to"],
        "show_stage_path": False,
        "regions": [
            {
                "id": "center",
                "name": "Details",
                "width": "flex-1",
                "order": 0,
                "components": [
                    {
                        "type": "tabs",
                        "config": {
                            "tabs": [
                                {
                                    "id": "details",
                                    "label": "Details",
                                    "sections": [
                                        {
                                            "name": "Task Information",
                                            "columns": 2,
                                            "fields": ["subject", "status", "priority", "due_date"]
                                        },
                                        {
                                            "name": "Related To",
                                            "columns": 2,
                                            "fields": ["related_to", "person_link_id", "record_link_id"]
                                        },
                                        {
                                            "name": "Description",
                                            "columns": 1,
                                            "fields": ["description"]
                                        },
                                        {
                                            "name": "System Information",
                                            "columns": 2,
                                            "fields": ["created_at", "created_by", "updated_at", "updated_by"]
                                        }
                                    ]
                                }
                            ]
                        }
                    }
                ]
            },
            {
                "id": "right",
                "name": "Activity",
                "width": "w-80",
                "order": 1,
                "components": [
                    {"type": "activity_timeline", "config": {"show_tasks": False, "show_events": False, "show_emails": True}}
                ]
            }
        ]
    },
    "event": {
        "layout_name": "Event Detail Layout",
        "api_name": "Event_Detail_Layout",
        "description": "System default detail layout for Event",
        "page_type": "detail",
        "is_system": True,
        "template_type": "two_column",
        "header_fields": ["subject", "start_date", "end_date", "owner_id"],
        "highlight_fields": ["location", "related_to"],
        "show_stage_path": False,
        "regions": [
            {
                "id": "center",
                "name": "Details",
                "width": "flex-1",
                "order": 0,
                "components": [
                    {
                        "type": "tabs",
                        "config": {
                            "tabs": [
                                {
                                    "id": "details",
                                    "label": "Details",
                                    "sections": [
                                        {
                                            "name": "Event Information",
                                            "columns": 2,
                                            "fields": ["subject", "start_date", "end_date", "location"]
                                        },
                                        {
                                            "name": "Related To",
                                            "columns": 2,
                                            "fields": ["related_to", "person_link_id", "record_link_id"]
                                        },
                                        {
                                            "name": "Description",
                                            "columns": 1,
                                            "fields": ["description"]
                                        },
                                        {
                                            "name": "System Information",
                                            "columns": 2,
                                            "fields": ["created_at", "created_by", "updated_at", "updated_by"]
                                        }
                                    ]
                                }
                            ]
                        }
                    }
                ]
            },
            {
                "id": "right",
                "name": "Activity",
                "width": "w-80",
                "order": 1,
                "components": [
                    {"type": "activity_timeline", "config": {"show_tasks": False, "show_events": False, "show_emails": True}}
                ]
            }
        ]
    },
    "emailmessage": {
        "layout_name": "Email Message Detail Layout",
        "api_name": "EmailMessage_Detail_Layout",
        "description": "System default detail layout for Email Message",
        "page_type": "detail",
        "is_system": True,
        "template_type": "one_column",
        "header_fields": ["subject", "from_address", "to_address"],
        "highlight_fields": ["sent_date", "status"],
        "show_stage_path": False,
        "regions": [
            {
                "id": "center",
                "name": "Details",
                "width": "flex-1",
                "order": 0,
                "components": [
                    {
                        "type": "tabs",
                        "config": {
                            "tabs": [
                                {
                                    "id": "details",
                                    "label": "Details",
                                    "sections": [
                                        {
                                            "name": "Email Information",
                                            "columns": 2,
                                            "fields": ["subject", "from_address", "to_address", "cc_address", "bcc_address"]
                                        },
                                        {
                                            "name": "Related To",
                                            "columns": 2,
                                            "fields": ["related_to", "person_link_id", "record_link_id"]
                                        },
                                        {
                                            "name": "Email Body",
                                            "columns": 1,
                                            "fields": ["html_body", "text_body"]
                                        },
                                        {
                                            "name": "System Information",
                                            "columns": 2,
                                            "fields": ["sent_date", "status", "created_at", "created_by"]
                                        }
                                    ]
                                }
                            ]
                        }
                    }
                ]
            }
        ]
    }
}

DEFAULT_NEW_LAYOUTS = {
    "lead": {
        "layout_name": "Lead New Layout",
        "api_name": "Lead_New_Layout",
        "description": "System default new record layout for Lead (Prospect)",
        "page_type": "new",
        "is_system": True,
        "template_type": "form",
        "sections": [
            {
                "name": "Lead Information",
                "columns": 2,
                "fields": ["first_name", "last_name", "email", "company", "title", "website", "status", "source", "industry", "rating", "description", "street", "city", "state", "postal_code", "country"]
            }
        ],
        "required_fields": ["last_name", "company", "status"],
        "default_values": {
            "status": "New"
        }
    },
    "opportunity": {
        "layout_name": "Opportunity New Layout",
        "api_name": "Opportunity_New_Layout",
        "description": "System default new record layout for Opportunity",
        "page_type": "new",
        "is_system": True,
        "template_type": "form",
        "sections": [
            {
                "name": "Opportunity Information",
                "columns": 2,
                "fields": ["name", "account_id", "amount", "close_date", "stage", "probability_percent", "type", "source", "next_step", "campaign_id", "description"]
            }
        ],
        "required_fields": ["name", "account_id", "stage", "close_date"],
        "default_values": {
            "stage": "Prospecting"
        }
    },
    "contact": {
        "layout_name": "Contact New Layout",
        "api_name": "Contact_New_Layout",
        "description": "System default new record layout for Contact",
        "page_type": "new",
        "is_system": True,
        "template_type": "form",
        "sections": [
            {
                "name": "Contact Information",
                "columns": 2,
                "fields": ["first_name", "last_name", "email", "phone", "mobile", "title", "department", "account_id", "mailing_address", "mailing_city", "mailing_state", "mailing_country", "birthdate", "description"]
            }
        ],
        "required_fields": ["first_name", "last_name", "email"],
        "default_values": {},
        "field_config": {
            "account_id": {
                "always_visible": True,
                "hide_when_context": True
            }
        }
    },
    "account": {
        "layout_name": "Account New Layout",
        "api_name": "Account_New_Layout",
        "description": "System default new record layout for Account",
        "page_type": "new",
        "is_system": True,
        "template_type": "form",
        "sections": [
            {
                "name": "Account Information",
                "columns": 2,
                "fields": ["account_name", "phone", "fax", "website", "industry", "account_type", "annual_revenue", "employees", "billing_address", "billing_city", "billing_state", "billing_country", "shipping_address", "shipping_city"]
            }
        ],
        "required_fields": ["account_name"],
        "default_values": {
            "account_type": "Prospect"
        }
    },
    "task": {
        "layout_name": "Task New Layout",
        "api_name": "Task_New_Layout",
        "description": "System default new record layout for Task",
        "page_type": "new",
        "is_system": True,
        "template_type": "form",
        "sections": [
            {
                "name": "Task Information",
                "columns": 2,
                "fields": ["subject", "status", "priority", "due_date", "related_to", "person_link_id", "record_link_id", "description"]
            }
        ],
        "required_fields": ["subject", "status"],
        "default_values": {
            "status": "Not Started",
            "priority": "Normal"
        }
    },
    "event": {
        "layout_name": "Event New Layout",
        "api_name": "Event_New_Layout",
        "description": "System default new record layout for Event",
        "page_type": "new",
        "is_system": True,
        "template_type": "form",
        "sections": [
            {
                "name": "Event Information",
                "columns": 2,
                "fields": ["subject", "start_date", "end_date", "location", "related_to", "person_link_id", "record_link_id", "description"]
            }
        ],
        "required_fields": ["subject", "start_date"],
        "default_values": {}
    },
    "emailmessage": {
        "layout_name": "Email Message New Layout",
        "api_name": "EmailMessage_New_Layout",
        "description": "System default new record layout for Email Message",
        "page_type": "new",
        "is_system": True,
        "template_type": "form",
        "sections": [
            {
                "name": "Email Information",
                "columns": 2,
                "fields": ["subject", "direction", "from_email", "to_emails", "cc_emails", "bcc_emails", "message_at", "text_body", "html_body", "person_link_id", "record_link_id"]
            }
        ],
        "required_fields": ["subject"],
        "default_values": {
            "direction": "outbound"
        }
    }
}


class LightningLayoutService:
    """Service for managing Lightning page layouts"""
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.collection = db.lightning_page_layouts
    
    async def create_layout(
        self,
        tenant_id: str,
        object_name: str,
        layout_data: Dict[str, Any],
        user_id: str
    ) -> Dict[str, Any]:
        """Create a new Lightning page layout"""
        layout_id = str(uuid4())
        page_type = layout_data.get("page_type", "detail")
        placed_components = layout_data.get("placed_components", {})
        
        layout = {
            "id": layout_id,
            "tenant_id": tenant_id,
            "object_name": object_name,
            "layout_name": layout_data.get("layout_name", "Default Layout"),
            "api_name": layout_data.get("api_name", f"{object_name}_Record_Page"),
            "description": layout_data.get("description", ""),
            "template_type": layout_data.get("template_type", "three_column"),
            "page_type": page_type,
            "column_order": layout_data.get("column_order", {}),
            "detail_fields": layout_data.get("detail_fields", []),  # Field order and visibility
            "placed_components": placed_components,  # Drag-drop components
            "selected_layout": layout_data.get("selected_layout", "three_column_header"),  # Layout template
            "regions": layout_data.get("regions", []),
            "created_by": user_id,
            "updated_by": user_id,
            "created_at": datetime.utcnow().isoformat(),
            "updated_at": datetime.utcnow().isoformat(),
            "is_active": True,
            "is_system": False  # User-created layouts are not system layouts
        }
        
        # Handle sections for BOTH "new" AND "detail" page type layouts
        # This ensures consistent rendering: Layout editor = single source of truth
        if "sections" in layout_data:
            layout["sections"] = layout_data["sections"]
        elif placed_components and page_type in ("new", "detail"):
            # Extract sections from placed_components
            sections = self._extract_sections_from_placed_components(placed_components)
            if sections:
                layout["sections"] = sections
                logger.info(f"Extracted {len(sections)} sections for new {page_type} layout")
        
        # Handle required_fields and default_values for "new" layouts
        if "required_fields" in layout_data:
            layout["required_fields"] = layout_data["required_fields"]
        if "default_values" in layout_data:
            layout["default_values"] = layout_data["default_values"]
        
        # Insert into MongoDB
        await self.collection.insert_one(layout)
        
        # Return layout without MongoDB's _id
        return {k: v for k, v in layout.items() if k != '_id'}
    
    async def get_layout_by_object(
        self,
        tenant_id: str,
        object_name: str
    ) -> Optional[Dict[str, Any]]:
        """Get the active Lightning layout for an object"""
        layout = await self.collection.find_one(
            {
                "tenant_id": tenant_id,
                "object_name": object_name,
                "is_active": True
            },
            {"_id": 0}
        )
        return layout
    
    async def get_all_layouts_for_object(
        self,
        tenant_id: str,
        object_name: str
    ) -> List[Dict[str, Any]]:
        """Get ALL Lightning layouts for an object (multi-page support)"""
        cursor = self.collection.find(
            {
                "tenant_id": tenant_id,
                "object_name": object_name
            },
            {"_id": 0}
        )
        layouts = await cursor.to_list(length=100)
        return layouts
    
    async def get_layout_by_id(
        self,
        tenant_id: str,
        layout_id: str
    ) -> Optional[Dict[str, Any]]:
        """Get a specific Lightning layout by ID"""
        layout = await self.collection.find_one(
            {
                "tenant_id": tenant_id,
                "id": layout_id
            },
            {"_id": 0}
        )
        return layout
    
    async def update_layout(
        self,
        tenant_id: str,
        layout_id: str,
        update_data: Dict[str, Any],
        user_id: str
    ) -> Optional[Dict[str, Any]]:
        """Update an existing Lightning layout"""
        update_fields = {
            "updated_by": user_id,
            "updated_at": datetime.utcnow().isoformat()
        }
        
        # Add fields that are being updated
        if "layout_name" in update_data:
            update_fields["layout_name"] = update_data["layout_name"]
        if "api_name" in update_data:
            update_fields["api_name"] = update_data["api_name"]
        if "description" in update_data:
            update_fields["description"] = update_data["description"]
        if "template_type" in update_data:
            update_fields["template_type"] = update_data["template_type"]
        if "page_type" in update_data:
            update_fields["page_type"] = update_data["page_type"]
        if "column_order" in update_data:
            update_fields["column_order"] = update_data["column_order"]
        if "detail_fields" in update_data:
            update_fields["detail_fields"] = update_data["detail_fields"]
        if "placed_components" in update_data:
            update_fields["placed_components"] = update_data["placed_components"]
        if "selected_layout" in update_data:
            update_fields["selected_layout"] = update_data["selected_layout"]
        if "regions" in update_data:
            update_fields["regions"] = update_data["regions"]
        if "is_active" in update_data:
            update_fields["is_active"] = update_data["is_active"]
        
        # Handle direct sections update (for New layouts)
        if "sections" in update_data:
            update_fields["sections"] = update_data["sections"]
        
        # Handle required_fields update (for New layouts)
        if "required_fields" in update_data:
            update_fields["required_fields"] = update_data["required_fields"]
        
        # Handle default_values update (for New layouts)
        if "default_values" in update_data:
            update_fields["default_values"] = update_data["default_values"]
        
        # Extract sections from placed_components for BOTH "new" AND "detail" layouts
        # This ensures consistent rendering across CreateRecordDialog and RecordDetailPage
        # Mental model: Layout editor is the single source of truth for field visibility
        placed_components = update_data.get("placed_components", {})
        
        if placed_components and "sections" not in update_data:
            # Get page_type from update_data, or fetch from existing layout
            page_type = update_data.get("page_type")
            if not page_type:
                # Fetch the existing layout to get its page_type
                existing = await self.collection.find_one(
                    {"tenant_id": tenant_id, "id": layout_id},
                    {"page_type": 1}
                )
                page_type = existing.get("page_type") if existing else None
            
            if page_type in ("new", "detail"):
                # Convert placed_components to sections format
                sections = self._extract_sections_from_placed_components(placed_components)
                if sections:
                    update_fields["sections"] = sections
                    logger.info(f"Extracted {len(sections)} sections from placed_components for {page_type} layout: {[s.get('fields', []) for s in sections]}")
        
        result = await self.collection.find_one_and_update(
            {
                "tenant_id": tenant_id,
                "id": layout_id
            },
            {"$set": update_fields},
            return_document=True
        )
        
        if result:
            result.pop("_id", None)
        return result
    
    def _extract_sections_from_placed_components(
        self, 
        placed_components: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        """
        Extract sections with fields from placed_components structure.
        Used to convert Lightning Page Builder format to simple sections format
        that CreateRecordDialog can consume.
        
        The placed_components structure can look like:
        {
            "main": [
                {
                    "id": "record_detail",
                    "config": {
                        "items": [
                            {"type": "field", "field": "first_name"},
                            {"type": "field_section", "label": "Section", "fields": [
                                {"type": "field", "field": "email"}
                            ]}
                        ]
                    }
                }
            ]
        }
        
        Returns sections in format expected by CreateRecordDialog:
        [{"name": "Section Name", "columns": 2, "fields": ["field1", "field2"]}]
        """
        sections = []
        standalone_fields = []  # Fields not in a section
        
        def extract_field_name(item):
            """Extract field API name from item"""
            if item.get("type") == "field":
                # Field name can be stored in different attributes depending on editor version
                return item.get("key") or item.get("field") or item.get("name")
            return None
        
        def process_items(items, parent_label="Fields", parent_columns=2):
            """Process items array, extracting fields and sections"""
            nonlocal standalone_fields
            
            for item in items:
                item_type = item.get("type", "")
                
                # Individual field at top level
                if item_type == "field":
                    field_name = extract_field_name(item)
                    if field_name:
                        standalone_fields.append(field_name)
                
                # Field section with nested fields
                elif item_type == "field_section":
                    section_fields = []
                    section_label = item.get("label", "Fields")
                    # Use section-specific columns if set, otherwise use parent columns
                    section_columns = item.get("columns", parent_columns)
                    
                    # Process nested fields in section
                    for nested_item in item.get("fields", []):
                        if nested_item.get("type") == "field":
                            field_name = extract_field_name(nested_item)
                            if field_name:
                                section_fields.append(field_name)
                        elif isinstance(nested_item, str):
                            # Simple string field name
                            section_fields.append(nested_item)
                    
                    if section_fields:
                        sections.append({
                            "name": section_label,
                            "columns": section_columns,
                            "fields": section_fields
                        })
        
        # Look through all regions
        for region_id, components in placed_components.items():
            if not isinstance(components, list):
                continue
                
            for comp in components:
                if not isinstance(comp, dict):
                    continue
                    
                comp_id = comp.get("id", "")
                config = comp.get("config", {})
                
                # Get parent columns setting (from record_detail config)
                parent_columns = config.get("columns", 2)
                
                # Handle record_detail component
                if comp_id == "record_detail":
                    items = config.get("items", [])
                    if items:
                        process_items(items, parent_columns=parent_columns)
                    
                    # Also check for legacy "sections" format
                    legacy_sections = config.get("sections", [])
                    for section in legacy_sections:
                        section_fields = []
                        for item in section.get("items", []):
                            field_name = extract_field_name(item)
                            if field_name:
                                section_fields.append(field_name)
                        if section_fields:
                            sections.append({
                                "name": section.get("label", "Fields"),
                                "columns": section.get("columns", parent_columns),  # Use parent columns as default
                                "fields": section_fields
                            })
                
                # Handle standalone field_section component
                elif comp_id == "field_section":
                    section_fields = []
                    for field in config.get("fields", []):
                        if isinstance(field, str):
                            section_fields.append(field)
                        elif isinstance(field, dict):
                            field_name = extract_field_name(field)
                            if field_name:
                                section_fields.append(field_name)
                    if section_fields:
                        sections.append({
                            "name": config.get("label", "Fields"),
                            "columns": config.get("columns", 2),
                            "fields": section_fields
                        })
        
        # If we have standalone fields but no sections, create a default section
        if standalone_fields and not sections:
            sections.append({
                "name": "Basic Information",
                "columns": 2,
                "fields": standalone_fields
            })
        elif standalone_fields and sections:
            # Add standalone fields to the first section
            sections[0]["fields"] = standalone_fields + sections[0]["fields"]
        
        return sections
    
    def _normalize_layout_sections(self, layout: Dict[str, Any]) -> Dict[str, Any]:
        """
        Normalize layout to ensure it always has a valid `sections` array.
        
        This is critical for the Schema + Layout = Visibility model:
        - RecordDetailPage and CreateRecordDialog both expect `sections`
        - Layouts may store fields in `placed_components` or `regions`
        - This method ensures consistent `sections` output regardless of storage format
        
        CRITICAL: For custom layouts (with placed_components), we MUST ALWAYS
        re-extract from placed_components as the authoritative source.
        The `sections` field in the DB may be stale from a previous save.
        
        Extraction priority:
        1. Extract from `placed_components` (Lightning Page Builder format) - AUTHORITATIVE for custom layouts
        2. Use existing `sections` if present and non-empty (for system layouts without placed_components)
        3. Extract from `regions` (System Detail Layout format)
        4. Return empty sections (field visibility = none until admin configures)
        """
        sections = []
        
        # PRIORITY 1: Extract from placed_components (user-edited layouts)
        # This is the AUTHORITATIVE source for custom layouts - ALWAYS re-extract
        # to ensure we have fresh data, not stale cached sections
        placed_components = layout.get("placed_components", {})
        if placed_components:
            # Check if placed_components has actual content (not empty regions)
            has_content = any(
                isinstance(comps, list) and len(comps) > 0 
                for comps in placed_components.values()
            )
            if has_content:
                sections = self._extract_sections_from_placed_components(placed_components)
                if sections:
                    logger.debug(f"Extracted {len(sections)} sections from placed_components for '{layout.get('layout_name')}'")
        
        # PRIORITY 2: Use existing sections if present (for system layouts)
        if not sections and layout.get("sections") and len(layout["sections"]) > 0:
            # For system layouts without placed_components, use the stored sections
            sections = layout["sections"]
            logger.debug(f"Using existing {len(sections)} sections for '{layout.get('layout_name')}'")
        
        # PRIORITY 3: Extract from regions (system detail layouts with tabs)
        if not sections:
            regions = layout.get("regions", [])
            if regions:
                sections = self._extract_sections_from_regions(regions)
                if sections:
                    logger.debug(f"Extracted {len(sections)} sections from regions for '{layout.get('layout_name')}'")
        
        # Update layout with normalized sections
        layout["sections"] = sections
        
        if not sections:
            logger.warning(f"Layout '{layout.get('layout_name')}' has no fields configured - will render empty")
        
        return layout
    
    def _extract_sections_from_regions(self, regions: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Extract sections from regions-based layout format.
        
        System Detail layouts use this structure:
        {
            "regions": [
                {
                    "id": "main",
                    "components": [
                        {
                            "type": "tabs",
                            "config": {
                                "tabs": [
                                    {
                                        "id": "details",
                                        "sections": [
                                            {"name": "...", "fields": [...]}
                                        ]
                                    }
                                ]
                            }
                        }
                    ]
                }
            ]
        }
        """
        sections = []
        
        for region in regions:
            components = region.get("components", [])
            for component in components:
                comp_type = component.get("type", "")
                config = component.get("config", {})
                
                # Handle tabs component (most common for detail layouts)
                if comp_type == "tabs":
                    tabs = config.get("tabs", [])
                    for tab in tabs:
                        # Extract from "details" tab primarily
                        if tab.get("id") == "details" or not sections:
                            tab_sections = tab.get("sections", [])
                            for section in tab_sections:
                                if section.get("fields"):
                                    sections.append({
                                        "name": section.get("name", "Fields"),
                                        "columns": section.get("columns", 2),
                                        "fields": section.get("fields", [])
                                    })
                
                # Handle direct sections in component
                elif "sections" in config:
                    for section in config.get("sections", []):
                        if section.get("fields"):
                            sections.append({
                                "name": section.get("name", "Fields"),
                                "columns": section.get("columns", 2),
                                "fields": section.get("fields", [])
                            })
        
        return sections
    
    async def delete_layout(
        self,
        tenant_id: str,
        layout_id: str
    ) -> bool:
        """Delete a Lightning layout"""
        result = await self.collection.delete_one(
            {
                "tenant_id": tenant_id,
                "id": layout_id
            }
        )
        return result.deleted_count > 0
    
    async def list_layouts(
        self,
        tenant_id: str,
        object_name: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """List all Lightning layouts for a tenant (optionally filtered by object)"""
        query = {"tenant_id": tenant_id}
        if object_name:
            query["object_name"] = object_name
        
        cursor = self.collection.find(query, {"_id": 0})
        layouts = await cursor.to_list(length=100)
        return layouts
    
    # ============================================
    # Phase 2B: Layout Resolution with Fallback
    # ============================================
    
    async def resolve_layout(
        self,
        tenant_id: str,
        object_name: str,
        page_type: str = "detail"  # "detail" or "new"
    ) -> Dict[str, Any]:
        """
        Resolve the appropriate layout for an object.
        
        Resolution order:
        1. Custom tenant layout for this object + page_type
        2. System default layout for this object + page_type
        3. Fallback legacy layout (from PAGE_LAYOUTS constant)
        
        Returns layout with source indicator.
        """
        object_lower = object_name.lower()
        
        # Step 1: Try to find custom tenant layout
        custom_layout = await self.collection.find_one(
            {
                "tenant_id": tenant_id,
                "object_name": object_lower,
                "page_type": page_type,
                "is_active": True,
                "is_system": {"$ne": True}  # Exclude system layouts
            },
            {"_id": 0}
        )
        
        if custom_layout:
            logger.debug(f"Found custom {page_type} layout for {object_name}")
            # Ensure sections are populated for consistent rendering
            custom_layout = self._normalize_layout_sections(custom_layout)
            
            # Check if layout has content - either placed_components OR sections
            # placed_components is the PRIMARY source for Lightning Builder layouts
            placed_components = custom_layout.get("placed_components", {})
            has_placed_content = any(
                isinstance(comps, list) and len(comps) > 0 
                for comps in placed_components.values()
            ) if placed_components else False
            
            has_sections = bool(custom_layout.get("sections"))
            
            # If layout has EITHER placed_components OR sections, return it
            # This ensures Lightning Builder layouts work even without legacy sections
            if has_placed_content or has_sections:
                return {
                    "layout": custom_layout,
                    "source": "custom",
                    "has_custom_layout": True
                }
            else:
                logger.warning(
                    f"Custom layout '{custom_layout.get('layout_name')}' has no content, "
                    f"falling back to system layout for {object_name}/{page_type}"
                )
        
        # Step 2: Try to find system default layout
        system_layout = await self.collection.find_one(
            {
                "tenant_id": tenant_id,
                "object_name": object_lower,
                "page_type": page_type,
                "is_system": True
            },
            {"_id": 0}
        )
        
        if system_layout:
            logger.debug(f"Found system {page_type} layout for {object_name}")
            # Ensure sections are populated for consistent rendering
            system_layout = self._normalize_layout_sections(system_layout)
            return {
                "layout": system_layout,
                "source": "system",
                "has_custom_layout": bool(custom_layout)  # True if there was a custom layout (just empty)
            }
        
        # Step 3: Generate from default templates (for standard CRM objects)
        if page_type == "detail" and object_lower in DEFAULT_DETAIL_LAYOUTS:
            default_layout = self._generate_default_layout(
                tenant_id, object_lower, page_type
            )
            logger.debug(f"Using default {page_type} template for {object_name}")
            return {
                "layout": default_layout,
                "source": "default_template",
                "has_custom_layout": False
            }
        
        if page_type == "new" and object_lower in DEFAULT_NEW_LAYOUTS:
            default_layout = self._generate_default_layout(
                tenant_id, object_lower, page_type
            )
            logger.debug(f"Using default {page_type} template for {object_name}")
            return {
                "layout": default_layout,
                "source": "default_template",
                "has_custom_layout": False
            }
        
        # Step 4: Dynamic layout generation for custom objects
        # Generate layout based on object's schema fields
        dynamic_layout = await self._generate_dynamic_layout_from_schema(
            tenant_id, object_lower, page_type
        )
        if dynamic_layout:
            logger.debug(f"Generated dynamic {page_type} layout for custom object {object_name}")
            return {
                "layout": dynamic_layout,
                "source": "dynamic",
                "has_custom_layout": False
            }
        
        # Step 5: Ultimate fallback - legacy PAGE_LAYOUTS constant
        from shared.constants.page_layouts import PAGE_LAYOUTS
        
        if object_lower in PAGE_LAYOUTS:
            legacy_layout = PAGE_LAYOUTS[object_lower]
            logger.debug(f"Falling back to legacy layout for {object_name}")
            return {
                "layout": {
                    "id": f"legacy_{object_lower}_{page_type}",
                    "tenant_id": tenant_id,
                    "object_name": object_lower,
                    "layout_name": f"{object_name.title()} Layout (Legacy)",
                    "page_type": page_type,
                    "template_type": "legacy",
                    "sections": legacy_layout.get("sections", []),
                    "is_system": False,
                    "is_legacy": True
                },
                "source": "legacy",
                "has_custom_layout": False
            }
        
        # No layout found at all - return minimal structure
        logger.warning(f"No layout found for {object_name}/{page_type}, returning empty")
        return {
            "layout": {
                "id": f"empty_{object_lower}_{page_type}",
                "tenant_id": tenant_id,
                "object_name": object_lower,
                "layout_name": f"{object_name.title()} Layout",
                "page_type": page_type,
                "template_type": "empty",
                "sections": [],
                "regions": []
            },
            "source": "empty",
            "has_custom_layout": False
        }
    
    def _generate_default_layout(
        self,
        tenant_id: str,
        object_name: str,
        page_type: str
    ) -> Dict[str, Any]:
        """Generate a default layout from templates"""
        now = datetime.now(timezone.utc).isoformat()
        
        if page_type == "detail":
            template = DEFAULT_DETAIL_LAYOUTS.get(object_name, {})
        else:
            template = DEFAULT_NEW_LAYOUTS.get(object_name, {})
        
        layout = {
            "id": f"default_{object_name}_{page_type}",
            "tenant_id": tenant_id,
            "object_name": object_name,
            "created_at": now,
            "updated_at": now,
            "is_active": True,
            **template
        }
        
        return layout
    
    async def _generate_dynamic_layout_from_schema(
        self,
        tenant_id: str,
        object_name: str,
        page_type: str
    ) -> Optional[Dict[str, Any]]:
        """
        Dynamically generate a layout for custom objects based on their schema fields.
        This ensures any new custom object automatically gets a reasonable default layout
        with the ENHANCED Record Detail UI (inline edit icons, etc.).
        
        Args:
            tenant_id: Tenant ID
            object_name: Object API name
            page_type: "new" or "detail"
        
        Returns:
            Generated layout dict or None if object not found
        """
        # Fetch the object schema from tenant_objects collection
        obj_schema = await self.db.tenant_objects.find_one(
            {"tenant_id": tenant_id, "object_name": object_name},
            {"_id": 0}
        )
        
        if not obj_schema:
            return None
        
        now = datetime.now(timezone.utc).isoformat()
        object_label = obj_schema.get("object_label", object_name.title())
        fields_dict = obj_schema.get("fields", {})
        
        # Categorize fields for smart layout generation
        # System fields to exclude from user-visible layouts
        system_fields = {
            "created_at", "updated_at", "created_by", "updated_by", 
            "system_timestamp", "is_deleted", "last_activity_at"
        }
        
        # Separate user fields from system fields
        user_fields = []
        required_fields = []
        
        for field_name, field_config in fields_dict.items():
            if field_name.lower() in system_fields:
                continue
            
            # Check if field_config is a dict (has metadata) or just a string
            if isinstance(field_config, dict):
                if field_config.get("required"):
                    required_fields.append(field_name)
            
            user_fields.append(field_name)
        
        # Limit fields for "new" layout (most important fields first)
        if page_type == "new":
            # For new record forms, show up to 10 important fields
            display_fields = user_fields[:10]
            
            # Build flat field items for config.items (what RecordDetailComponent expects)
            field_items = [{"type": "field", "field": f, "key": f} for f in display_fields]
            
            layout = {
                "id": f"dynamic_{object_name}_new",
                "tenant_id": tenant_id,
                "object_name": object_name,
                "layout_name": f"{object_label} New Layout",
                "api_name": f"{object_name.title()}_New_Layout",
                "description": f"Auto-generated new record layout for {object_label}",
                "page_type": "new",
                "is_system": False,
                "is_dynamic": True,
                "template_type": "form",
                "sections": [
                    {
                        "name": f"{object_label} Information",
                        "columns": 2,
                        "fields": display_fields
                    }
                ],
                "placed_components": {
                    "main": [
                        {
                            "id": "record_detail",
                            "type": "record_detail",
                            "config": {
                                "columns": 2,
                                "items": field_items  # Flat field items, not nested sections
                            }
                        }
                    ]
                },
                "required_fields": required_fields,
                "default_values": {},
                "created_at": now,
                "updated_at": now,
                "is_active": True
            }
        else:
            # For detail layouts, show all user fields in sections
            # Group fields into sections of ~6 fields each
            section_size = 6
            sections = []
            all_field_items = []  # Flat list of field items for config.items
            
            # First section: Main information
            main_fields = user_fields[:section_size]
            if main_fields:
                sections.append({
                    "name": f"{object_label} Information",
                    "columns": 2,
                    "fields": main_fields
                })
                # Add flat field items (what RecordDetailComponent expects)
                for f in main_fields:
                    all_field_items.append({"type": "field", "field": f, "key": f})
            
            # Additional sections for remaining fields
            remaining_fields = user_fields[section_size:]
            section_num = 1
            while remaining_fields:
                chunk = remaining_fields[:section_size]
                remaining_fields = remaining_fields[section_size:]
                section_name = f"Additional Details {section_num}" if section_num > 1 else "Additional Details"
                sections.append({
                    "name": section_name,
                    "columns": 2,
                    "fields": chunk
                })
                # Add flat field items
                for f in chunk:
                    all_field_items.append({"type": "field", "field": f, "key": f})
                section_num += 1
            
            # Add system information section at the end
            system_section_fields = ["created_at", "created_by", "updated_at", "updated_by"]
            sections.append({
                "name": "System Information",
                "columns": 2,
                "fields": system_section_fields
            })
            # Add system field items
            for f in system_section_fields:
                all_field_items.append({"type": "field", "field": f, "key": f})
            
            # Build placed_components structure for enhanced Record Detail UI
            # IMPORTANT: Use "activities" not "activity_timeline" - this is the registered component type
            placed_components = {
                "main": [
                    {
                        "id": "record_detail",
                        "type": "record_detail",
                        "config": {
                            "columns": 2,
                            "items": all_field_items  # Flat field items, RecordDetailComponent handles display
                        }
                    }
                ],
                "right": [
                    {
                        "id": "activities",  # Correct component ID that's registered in ComponentRenderer
                        "type": "activities",
                        "config": {
                            "show_tasks": True,
                            "show_events": True,
                            "show_emails": True
                        }
                    }
                ]
            }
            
            layout = {
                "id": f"dynamic_{object_name}_detail",
                "tenant_id": tenant_id,
                "object_name": object_name,
                "layout_name": f"{object_label} Detail Layout",
                "api_name": f"{object_name.title()}_Detail_Layout",
                "description": f"Auto-generated detail layout for {object_label}",
                "page_type": "detail",
                "is_system": False,
                "is_dynamic": True,
                "template_type": "two_column",
                "header_fields": user_fields[:4] if len(user_fields) >= 4 else user_fields,
                "highlight_fields": [],
                "show_stage_path": False,
                "placed_components": placed_components,  # CRITICAL: Frontend needs this for enhanced UI
                "regions": [
                    {
                        "id": "center",
                        "name": "Details",
                        "width": "flex-1",
                        "order": 0,
                        "components": [
                            {
                                "type": "tabs",
                                "config": {
                                    "tabs": [
                                        {
                                            "id": "details",
                                            "label": "Details",
                                            "sections": sections
                                        }
                                    ]
                                }
                            }
                        ]
                    },
                    {
                        "id": "right",
                        "name": "Activity",
                        "width": "w-80",
                        "order": 1,
                        "components": [
                            {"type": "activities", "config": {"show_tasks": True, "show_events": True, "show_emails": True}}
                        ]
                    }
                ],
                "sections": sections,  # Also include flat sections for consistent rendering
                "created_at": now,
                "updated_at": now,
                "is_active": True
            }
        
        logger.info(f"Generated dynamic {page_type} layout for {object_name} with {len(user_fields)} fields (enhanced UI)")
        return layout
    
    async def seed_system_layouts(
        self,
        tenant_id: str,
        object_names: List[str] = None,
        user_id: str = None
    ) -> Dict[str, int]:
        """
        Seed system default layouts for objects.
        Only creates layouts that don't already exist.
        
        Args:
            tenant_id: Tenant to seed for
            object_names: List of objects to seed (default: lead, opportunity, contact, account)
            user_id: User creating the layouts
        
        Returns:
            Count of layouts created per object
        """
        if object_names is None:
            # Default: seed all core CRM objects for Sales industry
            object_names = ["lead", "opportunity", "contact", "account"]
        
        now = datetime.now(timezone.utc).isoformat()
        results = {}
        
        for obj_name in object_names:
            obj_lower = obj_name.lower()
            results[obj_lower] = {"detail": 0, "new": 0}
            
            # Seed Detail Layout
            if obj_lower in DEFAULT_DETAIL_LAYOUTS:
                existing = await self.collection.find_one({
                    "tenant_id": tenant_id,
                    "object_name": obj_lower,
                    "page_type": "detail",
                    "is_system": True
                })
                
                if not existing:
                    detail_layout = {
                        "id": str(uuid4()),
                        "tenant_id": tenant_id,
                        "object_name": obj_lower,
                        "created_by": user_id,
                        "updated_by": user_id,
                        "created_at": now,
                        "updated_at": now,
                        "is_active": True,
                        **DEFAULT_DETAIL_LAYOUTS[obj_lower]
                    }
                    await self.collection.insert_one(detail_layout)
                    results[obj_lower]["detail"] = 1
                    logger.info(f"Seeded {obj_lower} detail layout for tenant {tenant_id[:8]}...")
            
            # Seed New Layout
            if obj_lower in DEFAULT_NEW_LAYOUTS:
                existing = await self.collection.find_one({
                    "tenant_id": tenant_id,
                    "object_name": obj_lower,
                    "page_type": "new",
                    "is_system": True
                })
                
                if not existing:
                    new_layout = {
                        "id": str(uuid4()),
                        "tenant_id": tenant_id,
                        "object_name": obj_lower,
                        "created_by": user_id,
                        "updated_by": user_id,
                        "created_at": now,
                        "updated_at": now,
                        "is_active": True,
                        **DEFAULT_NEW_LAYOUTS[obj_lower]
                    }
                    await self.collection.insert_one(new_layout)
                    results[obj_lower]["new"] = 1
                    logger.info(f"Seeded {obj_lower} new layout for tenant {tenant_id[:8]}...")
        
        return results
    
    async def get_default_layout_template(
        self,
        object_name: str,
        template_type: str = "three_column"
    ) -> Dict[str, Any]:
        """Get a default layout template for an object"""
        # This creates a basic template structure
        if template_type == "three_column":
            return {
                "template_type": "three_column",
                "regions": [
                    {
                        "id": "left",
                        "name": "Left Sidebar",
                        "width": "w-64",
                        "components": [],
                        "order": 0
                    },
                    {
                        "id": "main",
                        "name": "Main Content",
                        "width": "flex-1",
                        "components": [],
                        "order": 1
                    },
                    {
                        "id": "right",
                        "name": "Right Sidebar",
                        "width": "w-80",
                        "components": [],
                        "order": 2
                    }
                ]
            }
        elif template_type == "two_column":
            return {
                "template_type": "two_column",
                "regions": [
                    {
                        "id": "left",
                        "name": "Left Column",
                        "width": "w-96",
                        "components": [],
                        "order": 0
                    },
                    {
                        "id": "main",
                        "name": "Main Content",
                        "width": "flex-1",
                        "components": [],
                        "order": 1
                    }
                ]
            }
        else:  # one_column
            return {
                "template_type": "one_column",
                "regions": [
                    {
                        "id": "main",
                        "name": "Main Content",
                        "width": "w-full",
                        "components": [],
                        "order": 0
                    }
                ]
            }
