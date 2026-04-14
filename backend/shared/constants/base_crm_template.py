"""
Base CRM Template - Standard Objects, Fields, and Layouts
==========================================================

This module defines the standard CRM baseline that EVERY new tenant receives,
regardless of industry selection. Industry templates EXTEND this base,
they do not replace it.

Provisioning Flow:
1. New tenant registers
2. BASE_CRM_OBJECTS are provisioned (Lead, Account, Contact, Opportunity, Task, Event, EmailMessage)
3. Industry-specific objects are added (e.g., Property for Real Estate)
4. Standard layouts are seeded

This ensures consistency between old and new tenants.
"""

from typing import Dict, Any

# ============================================
# SYSTEM FIELDS (Applied to ALL objects)
# ============================================
SYSTEM_FIELDS = {
    "created_by": {
        "type": "lookup",
        "label": "Created By",
        "required": False,
        "read_only": True,
        "related_object": "user",
        "system_field": True
    },
    "updated_by": {
        "type": "lookup",
        "label": "Last Modified By",
        "required": False,
        "read_only": True,
        "related_object": "user",
        "system_field": True
    },
    "system_timestamp": {
        "type": "datetime",
        "label": "System Timestamp",
        "required": False,
        "read_only": True,
        "system_field": True
    },
    "is_deleted": {
        "type": "boolean",
        "label": "Is Deleted",
        "required": False,
        "read_only": True,
        "system_field": True,
        "default": False
    }
}

# Activity link fields for Task/Event/EmailMessage
ACTIVITY_LINK_FIELDS = {
    "person_link_id": {
        "type": "lookup",
        "label": "Person Link",
        "required": False,
        "read_only": False,
        "related_object": "lead,contact",
        "description": "Links to the person (Lead/Contact) this activity is with/for"
    },
    "record_link_id": {
        "type": "lookup",
        "label": "Record Link",
        "required": False,
        "read_only": False,
        "related_object": "any",
        "description": "Links to the record this activity is about/related to"
    }
}

# ============================================
# BASE CRM OBJECTS - Always provisioned
# ============================================
BASE_CRM_OBJECTS: Dict[str, Dict[str, Any]] = {
    # ----- LEAD (Prospect) -----
    "lead": {
        "object_name": "lead",
        "object_label": "Lead",
        "object_plural": "Leads",
        "name_field": "first_name",
        "icon": "User",
        "is_custom": False,
        "is_system": True,
        "enable_activities": True,
        "enable_search": True,
        "enable_reports": True,
        "fields": {
            "first_name": {"type": "text", "required": True, "label": "First Name"},
            "last_name": {"type": "text", "required": True, "label": "Last Name"},
            "email": {"type": "email", "required": True, "label": "Email"},
            "phone": {"type": "phone", "required": False, "label": "Phone"},
            "company": {"type": "text", "required": False, "label": "Company"},
            "job_title": {"type": "text", "required": False, "label": "Job Title"},
            "industry": {
                "type": "select", "required": False, "label": "Industry",
                "options": ["Technology", "Healthcare", "Finance", "Manufacturing", "Retail", "Other"]
            },
            "annual_revenue": {"type": "number", "required": False, "label": "Annual Revenue"},
            "website": {"type": "url", "required": False, "label": "Website"},
            "lead_source": {
                "type": "select", "required": False, "label": "Lead Source",
                "options": ["Website", "Referral", "Cold Call", "Social Media", "Advertisement", "Partner", "Trade Show", "Email Campaign", "Direct Mail", "Other"]
            },
            "status": {
                "type": "select", "required": True, "label": "Status",
                "options": ["New", "Contacted", "Working", "Qualified", "Unqualified", "Converted"]
            },
            "rating": {
                "type": "select", "required": False, "label": "Rating",
                "options": ["Hot", "Warm", "Cold"]
            },
            "city": {"type": "text", "required": False, "label": "City"},
            "state": {"type": "text", "required": False, "label": "State"},
            "country": {"type": "text", "required": False, "label": "Country"},
            "postal_code": {"type": "text", "required": False, "label": "Postal Code"},
            "description": {"type": "textarea", "required": False, "label": "Description"},
            "notes": {"type": "textarea", "required": False, "label": "Notes"},
            # Conversion tracking
            "is_converted": {"type": "boolean", "required": False, "label": "Is Converted", "default": False, "read_only": True},
            "converted_date": {"type": "datetime", "required": False, "label": "Converted Date", "read_only": True},
            "converted_account_id": {"type": "lookup", "required": False, "label": "Converted Account", "lookup_object": "account", "read_only": True},
            "converted_contact_id": {"type": "lookup", "required": False, "label": "Converted Contact", "lookup_object": "contact", "read_only": True},
            # Computed fields
            "last_activity_at": {"type": "datetime", "required": False, "label": "Last Activity", "read_only": True, "computed": True}
        }
    },
    
    # ----- ACCOUNT -----
    "account": {
        "object_name": "account",
        "object_label": "Account",
        "object_plural": "Accounts",
        "name_field": "account_name",
        "icon": "Building2",
        "is_custom": False,
        "is_system": True,
        "enable_activities": True,
        "enable_search": True,
        "enable_reports": True,
        "fields": {
            "account_name": {"type": "text", "required": True, "label": "Account Name"},
            "industry": {
                "type": "select", "required": False, "label": "Industry",
                "options": ["Technology", "Healthcare", "Finance", "Manufacturing", "Retail", "Other"]
            },
            "website": {"type": "url", "required": False, "label": "Website"},
            "phone": {"type": "phone", "required": False, "label": "Phone"},
            "email": {"type": "email", "required": False, "label": "Email"},
            "annual_revenue": {"type": "number", "required": False, "label": "Annual Revenue"},
            "employees": {"type": "number", "required": False, "label": "Number of Employees"},
            "account_type": {
                "type": "select", "required": False, "label": "Account Type",
                "options": ["Customer", "Prospect", "Partner", "Competitor"]
            },
            "description": {"type": "textarea", "required": False, "label": "Description"},
            "billing_city": {"type": "text", "required": False, "label": "Billing City"},
            "billing_state": {"type": "text", "required": False, "label": "Billing State"},
            "billing_country": {"type": "text", "required": False, "label": "Billing Country"},
            "billing_postal_code": {"type": "text", "required": False, "label": "Billing Postal Code"},
            "source": {
                "type": "select", "required": False, "label": "Source",
                "options": ["Website", "Referral", "Cold Call", "Social Media", "Advertisement"]
            },
            # Conversion tracking
            "created_from_prospect": {"type": "boolean", "required": False, "label": "Created From Prospect", "default": False, "read_only": True},
            "source_prospect_id": {"type": "lookup", "required": False, "label": "Source Prospect", "lookup_object": "lead", "read_only": True},
            # Rollup fields
            "open_opportunity_count": {"type": "number", "required": False, "label": "Open Opportunities", "read_only": True, "computed": True},
            "open_pipeline_amount": {"type": "currency", "required": False, "label": "Open Pipeline Amount", "read_only": True, "computed": True},
            # Computed fields
            "last_activity_at": {"type": "datetime", "required": False, "label": "Last Activity", "read_only": True, "computed": True}
        }
    },
    
    # ----- CONTACT -----
    "contact": {
        "object_name": "contact",
        "object_label": "Contact",
        "object_plural": "Contacts",
        "name_field": "first_name",
        "icon": "Users",
        "is_custom": False,
        "is_system": True,
        "enable_activities": True,
        "enable_search": True,
        "enable_reports": True,
        "fields": {
            "first_name": {"type": "text", "required": True, "label": "First Name"},
            "last_name": {"type": "text", "required": True, "label": "Last Name"},
            "email": {"type": "email", "required": True, "label": "Email"},
            "phone": {"type": "phone", "required": False, "label": "Phone"},
            "account_id": {
                "type": "lookup", "required": False, "label": "Account",
                "lookup_object": "account", "lookup_display_field": "account_name", "always_visible": True
            },
            "title": {"type": "text", "required": False, "label": "Title"},
            "department": {"type": "text", "required": False, "label": "Department"},
            "contact_type": {
                "type": "select", "required": False, "label": "Contact Type",
                "options": ["Customer", "Prospect", "Partner", "Vendor"]
            },
            "mailing_city": {"type": "text", "required": False, "label": "Mailing City"},
            "mailing_state": {"type": "text", "required": False, "label": "Mailing State"},
            "mailing_country": {"type": "text", "required": False, "label": "Mailing Country"},
            "mailing_postal_code": {"type": "text", "required": False, "label": "Mailing Postal Code"},
            "source": {
                "type": "select", "required": False, "label": "Source",
                "options": ["Website", "Referral", "Cold Call", "Social Media", "Advertisement"]
            },
            "description": {"type": "textarea", "required": False, "label": "Description"},
            "notes": {"type": "textarea", "required": False, "label": "Notes"},
            # Conversion tracking
            "created_from_prospect": {"type": "boolean", "required": False, "label": "Created From Prospect", "default": False, "read_only": True},
            "source_prospect_id": {"type": "lookup", "required": False, "label": "Source Prospect", "lookup_object": "lead", "read_only": True},
            # Computed fields
            "last_activity_at": {"type": "datetime", "required": False, "label": "Last Activity", "read_only": True, "computed": True}
        }
    },
    
    # ----- OPPORTUNITY -----
    "opportunity": {
        "object_name": "opportunity",
        "object_label": "Opportunity",
        "object_plural": "Opportunities",
        "name_field": "name",
        "icon": "DollarSign",
        "is_custom": False,
        "is_system": True,
        "enable_activities": True,
        "enable_search": True,
        "enable_reports": True,
        "fields": {
            "name": {"type": "text", "required": True, "label": "Opportunity Name"},
            "account_id": {
                "type": "lookup", "required": False, "label": "Account",
                "lookup_object": "account", "lookup_display_field": "account_name", "always_visible": True
            },
            "contact_id": {
                "type": "lookup", "required": False, "label": "Contact",
                "lookup_object": "contact", "lookup_display_field": "first_name"
            },
            "amount": {"type": "currency", "required": False, "label": "Amount"},
            "stage": {
                "type": "select", "required": True, "label": "Stage",
                "options": ["Prospecting", "Qualification", "Needs Analysis", "Value Proposition", "Decision Makers", "Proposal", "Negotiation", "Closed Won", "Closed Lost"]
            },
            "probability": {"type": "percent", "required": False, "label": "Probability (%)"},
            "close_date": {"type": "date", "required": False, "label": "Expected Close Date"},
            "lead_source": {
                "type": "select", "required": False, "label": "Lead Source",
                "options": ["Website", "Referral", "Cold Call", "Social Media", "Advertisement"]
            },
            "type": {
                "type": "select", "required": False, "label": "Type",
                "options": ["New Business", "Existing Business", "Renewal"]
            },
            "description": {"type": "textarea", "required": False, "label": "Description"},
            "next_step": {"type": "text", "required": False, "label": "Next Step"},
            # Computed fields from stage definitions
            "probability_percent": {"type": "percent", "required": False, "label": "Probability %", "read_only": True, "computed": True},
            "forecast_category": {
                "type": "select", "required": False, "label": "Forecast Category", "read_only": True, "computed": True,
                "options": ["Pipeline", "Best Case", "Commit", "Closed", "Omitted"]
            },
            "expected_revenue": {"type": "currency", "required": False, "label": "Expected Revenue", "read_only": True, "computed": True},
            "is_closed": {"type": "boolean", "required": False, "label": "Is Closed", "read_only": True, "computed": True},
            # Conversion tracking
            "created_from_prospect": {"type": "boolean", "required": False, "label": "Created From Prospect", "default": False, "read_only": True},
            "source_prospect_id": {"type": "lookup", "required": False, "label": "Source Prospect", "lookup_object": "lead", "read_only": True},
            # Computed fields
            "last_activity_at": {"type": "datetime", "required": False, "label": "Last Activity", "read_only": True, "computed": True}
        }
    },
    
    # ----- TASK -----
    "task": {
        "object_name": "task",
        "object_label": "Task",
        "object_plural": "Tasks",
        "name_field": "subject",
        "icon": "CheckSquare",
        "is_custom": False,
        "is_system": True,
        "enable_activities": False,
        "enable_search": True,
        "enable_reports": True,
        "fields": {
            "subject": {"type": "text", "required": True, "label": "Subject"},
            "description": {"type": "textarea", "required": False, "label": "Description"},
            "status": {
                "type": "select", "required": True, "label": "Status",
                "options": ["Not Started", "In Progress", "Completed", "Waiting", "Cancelled"]
            },
            "priority": {
                "type": "select", "required": True, "label": "Priority",
                "options": ["Low", "Normal", "High", "Urgent"]
            },
            "due_date": {"type": "date", "required": False, "label": "Due Date"},
            "assigned_to": {"type": "text", "required": False, "label": "Assigned To"},
            "related_to": {"type": "text", "required": False, "label": "Related To"},
            "related_type": {
                "type": "select", "required": False, "label": "Related Type",
                "options": ["Lead", "Contact", "Account", "Opportunity"]
            },
            # Activity link fields
            "person_link_id": {
                "type": "lookup", "required": False, "label": "Person Link",
                "related_object": "lead,contact", "description": "Links to the person this task is for"
            },
            "record_link_id": {
                "type": "lookup", "required": False, "label": "Record Link",
                "related_object": "any", "description": "Links to the record this task is about"
            },
            # Computed closure
            "is_closed": {"type": "boolean", "required": False, "label": "Is Closed", "read_only": True, "computed": True}
        }
    },
    
    # ----- EVENT -----
    "event": {
        "object_name": "event",
        "object_label": "Event",
        "object_plural": "Events",
        "name_field": "subject",
        "icon": "Calendar",
        "is_custom": False,
        "is_system": True,
        "enable_activities": False,
        "enable_search": True,
        "enable_reports": True,
        "fields": {
            "subject": {"type": "text", "required": True, "label": "Subject"},
            "description": {"type": "textarea", "required": False, "label": "Description"},
            "start_date": {"type": "datetime", "required": True, "label": "Start Date & Time"},
            "end_date": {"type": "datetime", "required": True, "label": "End Date & Time"},
            "location": {"type": "text", "required": False, "label": "Location"},
            "event_type": {
                "type": "select", "required": True, "label": "Event Type",
                "options": ["Meeting", "Call", "Demo", "Presentation", "Training"]
            },
            "attendees": {"type": "text", "required": False, "label": "Attendees"},
            "related_to": {"type": "text", "required": False, "label": "Related To"},
            "related_type": {
                "type": "select", "required": False, "label": "Related Type",
                "options": ["Lead", "Contact", "Account", "Opportunity"]
            },
            # Activity link fields
            "person_link_id": {
                "type": "lookup", "required": False, "label": "Person Link",
                "related_object": "lead,contact", "description": "Links to the person this event is with"
            },
            "record_link_id": {
                "type": "lookup", "required": False, "label": "Record Link",
                "related_object": "any", "description": "Links to the record this event is about"
            },
            # Availability
            "show_as": {
                "type": "select", "required": False, "label": "Show As",
                "options": ["Busy", "Free", "Tentative", "Out of Office"],
                "default": "Busy"
            }
        }
    },
    
    # ----- EMAIL MESSAGE -----
    "emailmessage": {
        "object_name": "emailmessage",
        "object_label": "Email Message",
        "object_plural": "Email Messages",
        "name_field": "subject",
        "icon": "Mail",
        "is_custom": False,
        "is_system": True,
        "enable_activities": False,
        "enable_search": True,
        "enable_reports": True,
        "fields": {
            "subject": {"type": "text", "label": "Subject", "required": False, "read_only": True},
            "direction": {
                "type": "select", "label": "Direction", "required": True, "read_only": True,
                "options": ["Incoming", "Outgoing"]
            },
            "from_name": {"type": "text", "label": "From Name", "required": False, "read_only": True},
            "from_email": {"type": "email", "label": "From Email", "required": False, "read_only": True},
            "to_emails": {"type": "text", "label": "To", "required": False, "read_only": True},
            "cc_emails": {"type": "text", "label": "CC", "required": False, "read_only": True},
            "bcc_emails": {"type": "text", "label": "BCC", "required": False, "read_only": True},
            "message_at": {"type": "datetime", "label": "Message Time", "required": True, "read_only": True},
            "text_body": {"type": "textarea", "label": "Text Body", "required": False, "read_only": True},
            "html_body": {"type": "textarea", "label": "HTML Body", "required": False, "read_only": True},
            "has_attachments": {"type": "boolean", "label": "Has Attachments", "required": False, "read_only": True, "default": False},
            "thread_id": {"type": "text", "label": "Thread ID", "required": False, "read_only": True},
            "message_id": {"type": "text", "label": "Message ID", "required": False, "read_only": True},
            "processing_status": {
                "type": "select", "label": "Processing Status", "required": False, "read_only": True,
                "options": ["Pending", "Processed", "Failed"], "default": "Processed"
            },
            # Activity link fields
            "person_link_id": {
                "type": "lookup", "label": "Person Link", "required": False, "read_only": False,
                "related_object": "lead,contact", "description": "Links to the person this email is with"
            },
            "record_link_id": {
                "type": "lookup", "label": "Record Link", "required": False, "read_only": False,
                "related_object": "any", "description": "Links to the record this email is about"
            }
        }
    }
}

# List of standard CRM object names for validation
STANDARD_CRM_OBJECTS = list(BASE_CRM_OBJECTS.keys())

# Objects that support activity timeline
ACTIVITY_ENABLED_OBJECTS = ["lead", "contact", "account", "opportunity"]

# Activity objects
ACTIVITY_OBJECTS = ["task", "event", "emailmessage"]


def get_base_crm_objects() -> Dict[str, Dict[str, Any]]:
    """
    Returns a deep copy of BASE_CRM_OBJECTS with system fields merged.
    Use this when provisioning to avoid mutating the template.
    """
    import copy
    objects = copy.deepcopy(BASE_CRM_OBJECTS)
    
    # Merge system fields into each object
    for obj_name, obj_config in objects.items():
        if "fields" in obj_config:
            # Add system fields (don't overwrite if already defined)
            for field_name, field_config in SYSTEM_FIELDS.items():
                if field_name not in obj_config["fields"]:
                    obj_config["fields"][field_name] = copy.deepcopy(field_config)
    
    return objects
